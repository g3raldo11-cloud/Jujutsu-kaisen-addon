import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';
import {
  changePasswordSchema,
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  PERMISSIONS,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { accessState, createSession, CSRF_COOKIE, refreshSuspension, revokeUserSessions, SESSION_COOKIE } from '../lib/auth';
import { decryptSecret, encryptSecret, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound, tooMany, unauthorized } from '../lib/errors';
import { body, uuidParam } from '../lib/http';
import { mailTemplate } from '../lib/mailer';
import { notify } from '../lib/notify';
import { audit } from '../lib/audit';
import { getPublicUser } from '../lib/users';
import { accessRequests, authTokens, sessions, userProfiles, users } from '../db/schema';

const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_S = 15 * 60;

async function issueToken(ctx: AppContext, userId: string, type: 'verify_email' | 'reset_password', ttlMs: number) {
  const token = randomToken(32);
  // Only one live token per purpose.
  await ctx.db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  await ctx.db.insert(authTokens).values({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeToken(ctx: AppContext, token: string, type: 'verify_email' | 'reset_password') {
  const [row] = await ctx.db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.type, type), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

async function sendVerification(ctx: AppContext, user: { id: string; email: string | null; username: string }) {
  if (!user.email) return;
  const s = await ctx.settings.get();
  const token = await issueToken(ctx, user.id, 'verify_email', 24 * 3600_000);
  const url = `${ctx.config.APP_URL}/verify-email?token=${token}`;
  const m = mailTemplate(s.communityName, 'Confirme seu e-mail', [
    `Olá, ${user.username}!`,
    'Recebemos seu pedido de acesso. Confirme seu e-mail para que sua solicitação seja enviada à administração.',
    'O link expira em 24 horas. Se não foi você, ignore esta mensagem.',
  ], { label: 'Confirmar e-mail', url });
  await ctx.mailer.send({ to: user.email, subject: `[${s.communityName}] Confirme seu e-mail`, ...m });
}

/** Everything the client needs after authentication. Works for any session state (pending users included). */
export async function mePayload(ctx: AppContext, userId: string) {
  const a = await ctx.perms.getUser(userId);
  if (!a) throw unauthorized();
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  const [profile] = await ctx.db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const state = accessState(a);
  const pub = await getPublicUser(ctx, userId);
  const [request] = await ctx.db.select().from(accessRequests).where(eq(accessRequests.userId, userId));
  const perms = a.isOwner || a.perms.has(PERMISSIONS.ADMINISTRATOR) ? Object.values(PERMISSIONS) : [...a.perms];
  return {
    user: { ...pub, email: u.email, status: u.status, emailVerified: !!u.emailVerifiedAt, totpEnabled: u.totpEnabled, suspendedUntil: u.suspendedUntil, statusReason: state === 'ok' ? null : u.statusReason, createdAt: u.createdAt },
    state,
    request: request ? { status: request.status, createdAt: request.createdAt } : null,
    permissions: state === 'ok' ? perms : [],
    isStaff: state === 'ok' && ctx.perms.isStaff(a),
    preferences: state === 'ok' ? (profile?.preferences ?? {}) : {},
    presence: profile?.presence ?? 'online',
  };
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const strict = (max: number, minutes: number) => ({ config: { rateLimit: { max, timeWindow: minutes * 60_000 } } });

  app.get('/api/auth/csrf', async () => ({ ok: true }));

  app.post('/api/auth/register', strict(5, 60), async (req, reply) => {
    const s = await ctx.settings.get();
    if (!s.registrationOpen) throw forbidden('As inscrições estão fechadas no momento', 'REGISTRATION_CLOSED');
    const input = body(req, registerSchema);

    const [byName] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${input.username.toLowerCase()}`);
    if (byName) throw conflict('Este nome de usuário já está em uso', 'USERNAME_TAKEN');

    const [byEmail] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (byEmail) {
      // Same response as success to prevent e-mail enumeration; warn the real owner instead.
      const m = mailTemplate(s.communityName, 'Tentativa de cadastro', [
        'Alguém tentou criar uma conta com este e-mail. Se foi você, use "Esqueci minha senha" na tela de entrada.',
      ]);
      ctx.mailer.send({ to: byEmail.email!, subject: `[${s.communityName}] Tentativa de cadastro`, ...m }).catch(() => {});
      return reply.code(201).send({ ok: true });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await ctx.db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ username: input.username, email: input.email, passwordHash, status: 'pending' }).returning();
      await tx.insert(userProfiles).values({ userId: u.id, displayName: input.username });
      await tx.insert(accessRequests).values({ userId: u.id, introduction: input.introduction ?? '', ip: req.ip });
      return u;
    });
    await sendVerification(ctx, user);
    return reply.code(201).send({ ok: true });
  });

  app.post('/api/auth/verify-email', strict(20, 15), async (req) => {
    const { token } = body(req, tokenSchema);
    const t = await consumeToken(ctx, token, 'verify_email');
    if (!t) throw badRequest('Link inválido ou expirado', 'INVALID_TOKEN');
    const [u] = await ctx.db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, t.userId)).returning();
    ctx.perms.invalidateUser(u.id);

    if (u.status === 'pending') {
      const [r] = await ctx.db.select().from(accessRequests).where(eq(accessRequests.userId, u.id));
      const staff = await staffWith(ctx, PERMISSIONS.MANAGE_MEMBERS);
      const s = await ctx.settings.get();
      await notify(
        ctx,
        staff,
        { type: 'access_request', title: 'Nova solicitação de acesso', body: `${u.username} pediu para entrar na comunidade.`, link: '/admin/requests', data: { userId: u.id } },
        { email: s.notifications.emailOnAccessRequest },
      );
      ctx.realtime.toStaff('access-request:new', { userId: u.id, username: u.username, createdAt: r?.createdAt });
    }
    return { ok: true, status: u.status };
  });

  app.post('/api/auth/resend-verification', strict(3, 60), async (req) => {
    const { email } = body(req, z.object({ email: emailSchema }));
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (u && !u.emailVerifiedAt && !u.isBot) await sendVerification(ctx, u);
    return { ok: true };
  });

  app.post('/api/auth/login', strict(20, 5), async (req, reply) => {
    const input = body(req, loginSchema);
    const key = input.login.toLowerCase();
    const lockKey = `bf:lock:${key}`;
    const failKey = `bf:fail:${key}`;
    const ipKey = `bf:ip:${req.ip}`;

    if (await ctx.redis.exists(lockKey)) {
      const ttl = await ctx.redis.ttl(lockKey);
      throw tooMany(`Conta temporariamente bloqueada por excesso de tentativas. Tente em ${Math.ceil(ttl / 60)} min.`, 'ACCOUNT_LOCKED');
    }
    if (Number(await ctx.redis.get(ipKey)) >= 50) throw tooMany();

    const [u] = await ctx.db
      .select()
      .from(users)
      .where(or(sql`lower(${users.username}) = ${key}`, sql`lower(${users.email}) = ${key}`));

    const fail = async (code = 'INVALID_CREDENTIALS', message = 'Usuário ou senha incorretos') => {
      const n = await ctx.redis.incr(failKey);
      await ctx.redis.expire(failKey, LOCK_WINDOW_S);
      await ctx.redis.multi().incr(ipKey).expire(ipKey, LOCK_WINDOW_S).exec();
      if (n >= LOCK_THRESHOLD) {
        const lockSeconds = LOCK_WINDOW_S * 2 ** Math.min(n - LOCK_THRESHOLD, 4);
        await ctx.redis.set(lockKey, '1', 'EX', lockSeconds);
        if (u) await audit(ctx, { actorId: null, action: 'auth.locked', targetType: 'user', targetId: u.id, ip: req.ip, metadata: { failures: n } });
      }
      throw new AppError(401, code, message);
    };

    const ok = await verifyPassword(u?.passwordHash, input.password);
    if (u) await ctx.db.update(users).set({ lastAccessAttemptAt: new Date() }).where(eq(users.id, u.id));
    if (!u || !ok || u.isBot) return fail();

    if (u.status === 'banned') throw forbidden('Esta conta foi banida.', 'ACCOUNT_BANNED');
    if (u.status === 'rejected') throw forbidden('Sua solicitação de acesso foi recusada.', 'ACCOUNT_REJECTED');
    if (u.status === 'suspended' && (!u.suspendedUntil || u.suspendedUntil.getTime() > Date.now())) {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', u.suspendedUntil ? `Conta suspensa até ${u.suspendedUntil.toLocaleString('pt-BR')}.` : 'Conta suspensa.', { until: u.suspendedUntil, reason: u.statusReason });
    }

    if (u.totpEnabled && u.totpSecret) {
      if (!input.totp) throw new AppError(401, 'TOTP_REQUIRED', 'Informe o código do aplicativo autenticador');
      const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(decryptSecret(ctx.config.APP_SECRET, u.totpSecret)) });
      const replayKey = `totp:used:${u.id}:${input.totp}`;
      if (totp.validate({ token: input.totp, window: 1 }) === null || (await ctx.redis.exists(replayKey))) return fail('INVALID_TOTP', 'Código inválido');
      await ctx.redis.set(replayKey, '1', 'EX', 90);
    }

    await ctx.redis.del(failKey);
    await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await createSession(ctx, req, reply, u.id);
    let a = await ctx.perms.getUser(u.id);
    if (a) a = await refreshSuspension(ctx, a);
    return mePayload(ctx, u.id);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) {
      await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.sessionId));
      await ctx.realtime.disconnectSession(req.sessionId);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.setCookie(CSRF_COOKIE, randomToken(24), { path: '/', sameSite: 'lax', secure: ctx.config.cookieSecure });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: g.auth }, async (req) => {
    req.authz = await refreshSuspension(ctx, req.authz!);
    return mePayload(ctx, req.authz.id);
  });

  app.post('/api/auth/forgot-password', strict(5, 60), async (req) => {
    const { email } = body(req, forgotPasswordSchema);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (u && !u.isBot && u.status !== 'banned') {
      const s = await ctx.settings.get();
      const token = await issueToken(ctx, u.id, 'reset_password', 3600_000);
      const m = mailTemplate(s.communityName, 'Redefinir senha', [
        'Recebemos um pedido para redefinir sua senha. O link expira em 1 hora e só pode ser usado uma vez.',
        'Se não foi você, ignore este e-mail — sua senha atual continua válida.',
      ], { label: 'Redefinir senha', url: `${ctx.config.APP_URL}/reset-password?token=${token}` });
      await ctx.mailer.send({ to: u.email!, subject: `[${s.communityName}] Redefinir senha`, ...m });
    }
    return { ok: true };
  });

  app.post('/api/auth/reset-password', strict(10, 15), async (req) => {
    const input = body(req, resetPasswordSchema);
    const t = await consumeToken(ctx, input.token, 'reset_password');
    if (!t) throw badRequest('Link inválido ou expirado', 'INVALID_TOKEN');
    await ctx.db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() }).where(eq(users.id, t.userId));
    await revokeUserSessions(ctx, t.userId);
    await ctx.realtime.disconnectUser(t.userId);
    await audit(ctx, { actorId: t.userId, action: 'auth.password_reset', targetType: 'user', targetId: t.userId, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/auth/change-password', { preHandler: g.auth, ...strict(10, 15) }, async (req) => {
    const input = body(req, changePasswordSchema);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, req.authz!.id));
    if (!(await verifyPassword(u.passwordHash, input.currentPassword))) throw badRequest('Senha atual incorreta', 'INVALID_PASSWORD');
    await ctx.db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, u.id));
    await revokeUserSessions(ctx, u.id, req.sessionId ?? undefined);
    await audit(ctx, { actorId: u.id, action: 'auth.password_changed', targetType: 'user', targetId: u.id, ip: req.ip });
    return { ok: true };
  });

  // ── Sessions ──
  app.get('/api/auth/sessions', { preHandler: g.auth }, async (req) => {
    const rows = await ctx.db
      .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, req.authz!.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt));
    return rows.map((r) => ({ ...r, current: r.id === req.sessionId }));
  });

  app.delete('/api/auth/sessions/:id', { preHandler: g.auth }, async (req) => {
    const id = uuidParam(req, 'id');
    const [row] = await ctx.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, req.authz!.id)))
      .returning();
    if (!row) throw notFound('Sessão não encontrada');
    await ctx.realtime.disconnectSession(id);
    return { ok: true };
  });

  app.post('/api/auth/sessions/revoke-others', { preHandler: g.auth }, async (req) => {
    await revokeUserSessions(ctx, req.authz!.id, req.sessionId ?? undefined);
    return { ok: true };
  });

  // ── TOTP two-factor authentication ──
  app.post('/api/auth/totp/setup', { preHandler: g.auth }, async (req) => {
    const [u] = await ctx.db.select().from(users).where(eq(users.id, req.authz!.id));
    if (u.totpEnabled) throw conflict('A autenticação em dois fatores já está ativa');
    const s = await ctx.settings.get();
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({ issuer: s.communityName, label: u.username, secret });
    await ctx.db.update(users).set({ totpSecret: encryptSecret(ctx.config.APP_SECRET, secret.base32) }).where(eq(users.id, u.id));
    return { secret: secret.base32, uri: totp.toString() };
  });

  app.post('/api/auth/totp/enable', { preHandler: g.auth, ...strict(10, 15) }, async (req) => {
    const { code } = body(req, z.object({ code: z.string().regex(/^\d{6}$/) }));
    const [u] = await ctx.db.select().from(users).where(eq(users.id, req.authz!.id));
    if (!u.totpSecret) throw badRequest('Inicie a configuração primeiro');
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(decryptSecret(ctx.config.APP_SECRET, u.totpSecret)) });
    if (totp.validate({ token: code, window: 1 }) === null) throw badRequest('Código inválido', 'INVALID_TOTP');
    await ctx.db.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id));
    await audit(ctx, { actorId: u.id, action: 'auth.totp_enabled', targetType: 'user', targetId: u.id, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/auth/totp/disable', { preHandler: g.auth, ...strict(10, 15) }, async (req) => {
    const { password } = body(req, z.object({ password: z.string().min(1).max(128) }));
    const [u] = await ctx.db.select().from(users).where(eq(users.id, req.authz!.id));
    if (!(await verifyPassword(u.passwordHash, password))) throw badRequest('Senha incorreta', 'INVALID_PASSWORD');
    await ctx.db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, u.id));
    await audit(ctx, { actorId: u.id, action: 'auth.totp_disabled', targetType: 'user', targetId: u.id, ip: req.ip });
    return { ok: true };
  });
}

/** Ids of approved staff holding a permission (the owner always included). */
export async function staffWith(ctx: AppContext, perm: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const rows = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.status, 'approved'), eq(users.isBot, false)));
  const out: string[] = [];
  for (const r of rows) {
    const a = await ctx.perms.getUser(r.id);
    if (a && ctx.perms.has(a, perm)) out.push(r.id);
  }
  return out;
}

