import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Redis } from 'ioredis';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type Config } from './config';
import { createDb, runMigrations } from './db/client';
import { seed } from './db/seed';
import { EventBus } from './lib/bus';
import { createMailer } from './lib/mailer';
import { PermissionService } from './lib/permissions';
import { Realtime } from './lib/realtime';
import { SettingsService } from './lib/settings';
import { createStorage } from './lib/storage';
import type { AppContext } from './lib/context';
import { createGuards, CSRF_COOKIE, resolveSession, SESSION_COOKIE } from './lib/auth';
import { randomToken, safeEqual } from './lib/crypto';
import { AppError } from './lib/errors';
import { setupRealtime } from './realtime/socket';
import { registerModules } from './modules';
import { startScheduler } from './lib/scheduler';
import { registerBots } from './bots';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function buildApp(overrides: Partial<Config> = {}): Promise<BuiltApp> {
  const config = { ...loadConfig(), ...overrides };
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });
  app.setReplySerializer((payload) => JSON.stringify(payload, replacer));

  const { db, pool } = createDb(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  const storage = createStorage(config);
  await storage.init();

  const ctx: AppContext = {
    config,
    db,
    pool,
    redis,
    storage,
    mailer: createMailer({ smtpUrl: config.SMTP_URL, from: config.MAIL_FROM, log: app.log, isProd: config.isProd }),
    bus: new EventBus(),
    settings: new SettingsService(db),
    perms: new PermissionService(db),
    realtime: new Realtime(),
    log: app.log,
  };
  ctx.bus.onError((err) => app.log.error({ err }, 'event handler failed'));

  await runMigrations(db);
  await seed(db);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://media.tenor.com'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: 60_000,
    redis,
    nameSpace: 'rl:',
    keyGenerator: (req) => req.authz?.id ?? req.ip,
    // Integration tests issue hundreds of requests from one address; per-account brute-force protection still applies.
    allowList: config.NODE_ENV === 'test' ? () => true : undefined,
    errorResponseBuilder: (_req, c) => ({ statusCode: 429, error: { code: 'RATE_LIMITED', message: `Muitas requisições. Tente novamente em ${Math.ceil(c.ttl / 1000)}s.` } }),
  });
  await app.register(multipart, { limits: { files: 1, fields: 10, fileSize: 2048 * 1024 * 1024 } });

  app.decorateRequest('authz', null);
  app.decorateRequest('sessionId', null);

  // Session resolution runs before rate limiting so limits are keyed per user.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (!req.cookies[CSRF_COOKIE]) {
      reply.setCookie(CSRF_COOKIE, randomToken(24), { path: '/', sameSite: 'lax', secure: config.cookieSecure, httpOnly: false });
    }
    const session = await resolveSession(ctx, req.cookies[SESSION_COOKIE]);
    if (session) {
      req.sessionId = session.id;
      req.authz = await ctx.perms.getUser(session.userId);
    }
    // CSRF: double-submit token + Origin check for state-changing requests.
    if (UNSAFE.has(req.method) && !req.url.startsWith('/api/hooks/')) {
      const header = req.headers['x-csrf-token'];
      const cookieVal = req.cookies[CSRF_COOKIE];
      if (typeof header !== 'string' || !cookieVal || !safeEqual(header, cookieVal)) {
        throw new AppError(403, 'CSRF', 'Token CSRF inválido. Recarregue a página.');
      }
      const origin = req.headers.origin;
      if (origin && config.isProd && origin !== new URL(config.APP_URL).origin) throw new AppError(403, 'CSRF', 'Origem não permitida');
    }
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde um pouco.' } });
    if (status === 413 || (err as FastifyError).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: { code: 'TOO_LARGE', message: 'Arquivo ou requisição grande demais' } });
    }
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: (err as FastifyError).code ?? 'BAD_REQUEST', message: err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Erro interno do servidor' } });
  });

  const guards = createGuards(ctx);
  await registerModules(app, ctx, guards);

  // Serve the built web client (production) with SPA fallback.
  const webDir = config.WEB_DIST_DIR ? path.resolve(config.WEB_DIST_DIR) : null;
  if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false, index: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } }));
  }

  await app.ready();
  const rt = await setupRealtime(app, ctx);
  await registerBots(ctx);
  const stopScheduler = config.DISABLE_SCHEDULER ? () => {} : startScheduler(ctx);

  return {
    app,
    ctx,
    async close() {
      stopScheduler();
      await rt.close();
      await app.close().catch(() => {});
      await pool.end();
      redis.disconnect();
    },
  };
}
