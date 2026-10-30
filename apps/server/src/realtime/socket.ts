import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { eq } from 'drizzle-orm';
import { PERMISSIONS } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import { accessState, refreshSuspension, resolveSession, SESSION_COOKIE } from '../lib/auth';
import { markOffline, markOnline, presenceOf, resetPresence } from './presence';
import { registerVoiceHandlers, leaveAllVoice } from './voice';
import { registerWhiteboardHandlers } from './whiteboard';
import { userProfiles, users } from '../db/schema';

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export type AppSocket = Socket & { data: { userId: string; sessionId: string } };

/** Other modules (bots) can attach per-socket handlers; they run synchronously on connection. */
const extraHandlers: ((socket: Socket) => void)[] = [];
export const onSocket = (fn: (socket: Socket) => void) => extraHandlers.push(fn);

export async function setupRealtime(app: FastifyInstance, ctx: AppContext) {
  const io = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 512 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
  });
  const pub = ctx.redis.duplicate();
  const sub = ctx.redis.duplicate();
  io.adapter(createAdapter(pub, sub));

  if (process.env.OUROBOROS_CLUSTER !== '1') await resetPresence(ctx);

  io.use(async (socket, next) => {
    try {
      if (ctx.config.isProd) {
        const origin = socket.request.headers.origin;
        if (origin && origin !== new URL(ctx.config.APP_URL).origin) return next(new Error('FORBIDDEN_ORIGIN'));
      }
      const cookies = parseCookies(socket.request.headers.cookie);
      const session = await resolveSession(ctx, cookies[SESSION_COOKIE]);
      if (!session) return next(new Error('UNAUTHORIZED'));
      let a = await ctx.perms.getUser(session.userId);
      if (!a) return next(new Error('UNAUTHORIZED'));
      a = await refreshSuspension(ctx, a);
      if (accessState(a) !== 'ok') return next(new Error('FORBIDDEN'));
      const s = await ctx.settings.get();
      if (s.maintenance.enabled && !ctx.perms.has(a, PERMISSIONS.MANAGE_SETTINGS)) return next(new Error('MAINTENANCE'));
      socket.data.userId = a.id;
      socket.data.sessionId = session.id;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  async function syncRooms(socket: Socket) {
    const a = await ctx.perms.getUser(socket.data.userId);
    if (!a) return;
    const visible = new Set((await ctx.perms.visibleChannelIds(a)).map((id) => `channel:${id}`));
    for (const room of socket.rooms) if (room.startsWith('channel:') && !visible.has(room)) socket.leave(room);
    socket.join([...visible]);
    if (ctx.perms.isStaff(a)) socket.join('staff');
    else socket.leave('staff');
  }

  ctx.realtime.io = io;
  ctx.realtime.resyncHandler = async (userId) => {
    ctx.perms.invalidateUser(userId);
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (!sockets.length) return;
    const a = await ctx.perms.getUser(userId);
    if (!a) return;
    const visible = (await ctx.perms.visibleChannelIds(a)).map((id) => `channel:${id}`);
    for (const s of sockets) {
      for (const room of s.rooms) if (room.startsWith('channel:') && !visible.includes(room)) s.leave(room);
      s.join(visible);
      if (ctx.perms.isStaff(a)) s.join('staff');
      else s.leave('staff');
    }
  };

  io.on('connection', async (raw) => {
    const socket = raw as AppSocket;
    const userId = socket.data.userId;
    // Handlers are attached synchronously so events sent right after "connect" are never lost.
    const typingThrottle = new Map<string, number>();
    socket.on('typing', async (payload: { channelId?: string; threadId?: string | null }) => {
      if (typeof payload?.channelId !== 'string') return;
      const now = Date.now();
      if ((typingThrottle.get(payload.channelId) ?? 0) > now - 2500) return;
      typingThrottle.set(payload.channelId, now);
      const a = await ctx.perms.getUser(userId);
      if (!a) return;
      const { perms } = await ctx.perms.channelPermsById(a, payload.channelId);
      if (!perms.has(PERMISSIONS.SEND_MESSAGES)) return;
      socket.to(`channel:${payload.channelId}`).emit('typing', { channelId: payload.channelId, threadId: payload.threadId ?? null, userId });
    });

    socket.on('presence:idle', async (idle: boolean) => {
      const [row] = await ctx.db.select({ presence: userProfiles.presence }).from(userProfiles).where(eq(userProfiles.userId, userId));
      const base = row?.presence ?? 'online';
      if (base !== 'online') return; // DND / invisible are explicit choices
      const mode = idle ? 'idle' : 'online';
      await ctx.redis.hset('presence:mode', userId, mode);
      ctx.realtime.toMembers('presence:update', { userId, presence: mode });
    });

    registerVoiceHandlers(ctx, io, socket);
    registerWhiteboardHandlers(ctx, socket);
    for (const fn of extraHandlers) fn(socket);

    socket.on('disconnect', async () => {
      await leaveAllVoice(ctx, io, socket).catch(() => {});
      const last = await markOffline(ctx, userId).catch(() => false);
      if (last) {
        await ctx.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId)).catch(() => {});
        ctx.realtime.toMembers('presence:update', { userId, presence: 'offline' });
      }
    });

    socket.join([`user:${userId}`, `session:${socket.data.sessionId}`, 'members']);
    await syncRooms(socket);
    const first = await markOnline(ctx, userId);
    await ctx.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
    const [p] = await ctx.db.select({ presence: userProfiles.presence }).from(userProfiles).where(eq(userProfiles.userId, userId));
    await ctx.redis.hset('presence:mode', userId, p?.presence ?? 'online');
    if (first) {
      const mode = (await presenceOf(ctx, [userId]))[userId];
      if (mode !== 'offline') ctx.realtime.toMembers('presence:update', { userId, presence: mode });
    }
    socket.emit('ready', { userId });
  });

  // Periodically re-validate sessions so revoked sessions, bans and suspensions take effect on live sockets.
  const revalidate = setInterval(async () => {
    try {
      const sockets = await io.local.fetchSockets();
      for (const s of sockets) {
        const valid = await ctx.db.query.sessions.findFirst({ where: (t, { eq: e }) => e(t.id, s.data.sessionId) });
        const a = valid && !valid.revokedAt && valid.expiresAt > new Date() ? await ctx.perms.getUser(s.data.userId) : null;
        if (!a || accessState(a) !== 'ok') s.disconnect(true);
      }
    } catch (err) {
      ctx.log.warn({ err }, 'socket revalidation failed');
    }
  }, 60_000);
  revalidate.unref();

  const close = () =>
    new Promise<void>((resolve) => {
      clearInterval(revalidate);
      io.disconnectSockets(true);
      io.close(() => {
        pub.disconnect();
        sub.disconnect();
        resolve();
      });
    });

  return { io, close };
}
