import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { CALL_CHANNEL_TYPES, PERMISSIONS } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import { hmac } from '../lib/crypto';
import { notify } from '../lib/notify';
import { getPublicUser } from '../lib/users';
import { awardXp, grantAchievement } from '../lib/gamification';
import { callParticipants, calls, channelMembers, channels, channelUserStates, voiceRooms } from '../db/schema';

export interface VoiceParticipant {
  socketId: string;
  userId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  serverMuted: boolean;
  allowed: { speak: boolean; video: boolean; screen: boolean };
  joinedAt: number;
}

const roomKey = (channelId: string) => `voice:room:${channelId}`;

/** STUN plus short-lived TURN credentials (coturn "use-auth-secret" / TURN REST API). */
export function iceServers(ctx: AppContext, userId: string) {
  const servers: { urls: string[]; username?: string; credential?: string }[] = [];
  const stun = ctx.config.STUN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  if (stun.length) servers.push({ urls: stun });
  if (ctx.config.TURN_URLS && ctx.config.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + ctx.config.TURN_TTL_SECONDS}:${userId}`;
    servers.push({
      urls: ctx.config.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean),
      username,
      credential: hmac(ctx.config.TURN_SECRET, username),
    });
  }
  return servers;
}

export async function getParticipants(ctx: AppContext, channelId: string): Promise<VoiceParticipant[]> {
  const all = await ctx.redis.hgetall(roomKey(channelId));
  return Object.values(all)
    .map((v) => JSON.parse(v) as VoiceParticipant)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

async function broadcastRoom(ctx: AppContext, io: Server, channelId: string) {
  const participants = await getParticipants(ctx, channelId);
  const payload = { channelId, participants };
  io.to(`voice:${channelId}`).emit('voice:participants', payload);
  io.to(`channel:${channelId}`).emit('voice:participants', payload);
}

async function leaveRoom(ctx: AppContext, io: Server, socket: Socket, channelId: string) {
  const removed = await ctx.redis.hdel(roomKey(channelId), socket.id);
  socket.leave(`voice:${channelId}`);
  if (!removed) return;
  const userId = socket.data.userId as string;
  io.to(`voice:${channelId}`).emit('voice:peer-left', { channelId, socketId: socket.id, userId });
  ctx.bus.emit('voice.left', { channelId, userId });

  const [room] = await ctx.db.select().from(voiceRooms).where(eq(voiceRooms.channelId, channelId));
  if (room) {
    const [call] = await ctx.db.select().from(calls).where(and(eq(calls.roomId, room.id), isNull(calls.endedAt)));
    if (call) {
      await ctx.db
        .update(callParticipants)
        .set({ leftAt: new Date() })
        .where(and(eq(callParticipants.callId, call.id), eq(callParticipants.userId, userId), isNull(callParticipants.leftAt)));
    }
  }
  const remaining = await ctx.redis.hlen(roomKey(channelId));
  if (remaining === 0 && room) {
    await ctx.db.update(calls).set({ endedAt: new Date() }).where(and(eq(calls.roomId, room.id), isNull(calls.endedAt)));
    io.to(`channel:${channelId}`).emit('call:ended', { channelId });
    // Temporary rooms disappear once empty (after a short grace period for reconnects).
    const [ch] = await ctx.db.select().from(channels).where(eq(channels.id, channelId));
    if (ch?.isTemporary) {
      setTimeout(async () => {
        if ((await ctx.redis.hlen(roomKey(channelId))) > 0) return;
        await ctx.db.delete(channels).where(and(eq(channels.id, channelId), eq(channels.isTemporary, true)));
        ctx.perms.invalidateChannels();
        ctx.realtime.toMembers('structure:updated', {});
      }, 30_000).unref();
    }
  }
  await broadcastRoom(ctx, io, channelId);
}

export async function leaveAllVoice(ctx: AppContext, io: Server, socket: Socket) {
  for (const room of [...socket.rooms]) if (room.startsWith('voice:')) await leaveRoom(ctx, io, socket, room.slice(6));
}

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

export function registerVoiceHandlers(ctx: AppContext, io: Server, socket: Socket) {
  const userId = socket.data.userId as string;
  const safeAck = (ack: unknown): Ack => (typeof ack === 'function' ? (ack as Ack) : () => {});

  socket.on('voice:join', async (payload: { channelId?: string }, ackRaw: unknown) => {
    const ack = safeAck(ackRaw);
    try {
      const channelId = payload?.channelId;
      if (typeof channelId !== 'string') return ack({ ok: false, error: 'Canal inválido' });
      const a = await ctx.perms.getUser(userId);
      if (!a) return ack({ ok: false, error: 'Sessão inválida' });
      const { ch, perms } = await ctx.perms.channelPermsById(a, channelId);
      if (!ch || !CALL_CHANNEL_TYPES.includes(ch.type as never)) return ack({ ok: false, error: 'Este canal não aceita chamadas' });
      if (!perms.has(PERMISSIONS.CONNECT_VOICE)) return ack({ ok: false, error: 'Sem permissão para entrar nesta sala' });
      const [row] = await ctx.db.select().from(channels).where(eq(channels.id, channelId));
      if (row.passwordHash && !perms.has(PERMISSIONS.MANAGE_MESSAGES)) {
        const [st] = await ctx.db.select().from(channelUserStates).where(and(eq(channelUserStates.channelId, channelId), eq(channelUserStates.userId, userId)));
        if (!st?.unlockedAt) return ack({ ok: false, error: 'Sala protegida por senha', code: 'CHANNEL_LOCKED' });
      }
      const current = await getParticipants(ctx, channelId);
      if (row.userLimit > 0 && current.filter((p) => p.socketId !== socket.id).length >= row.userLimit && !perms.has(PERMISSIONS.MANAGE_MESSAGES)) {
        return ack({ ok: false, error: 'A sala está cheia' });
      }
      // One voice room per socket.
      for (const r of [...socket.rooms]) if (r.startsWith('voice:') && r !== `voice:${channelId}`) await leaveRoom(ctx, io, socket, r.slice(6));

      const me: VoiceParticipant = {
        socketId: socket.id,
        userId,
        muted: !perms.has(PERMISSIONS.SPEAK),
        deafened: false,
        video: false,
        screen: false,
        serverMuted: false,
        allowed: { speak: perms.has(PERMISSIONS.SPEAK), video: perms.has(PERMISSIONS.VIDEO), screen: perms.has(PERMISSIONS.SCREEN_SHARE) },
        joinedAt: Date.now(),
      };
      await ctx.redis.hset(roomKey(channelId), socket.id, JSON.stringify(me));
      socket.join(`voice:${channelId}`);

      let [room] = await ctx.db.select().from(voiceRooms).where(eq(voiceRooms.channelId, channelId));
      if (!room) [room] = await ctx.db.insert(voiceRooms).values({ channelId, kind: row.type === 'dm' || row.type === 'group_dm' ? 'dm' : 'channel' }).returning();
      let [call] = await ctx.db.select().from(calls).where(and(eq(calls.roomId, room.id), isNull(calls.endedAt)));
      const startedNow = !call;
      if (!call) [call] = await ctx.db.insert(calls).values({ roomId: room.id, startedById: userId }).returning();
      const others = current.filter((p) => p.socketId !== socket.id);
      if (!others.some((p) => p.userId === userId)) await ctx.db.insert(callParticipants).values({ callId: call.id, userId });
      const peak = new Set([...others.map((p) => p.userId), userId]).size;
      await ctx.db.update(calls).set({ peakParticipants: sql`greatest(${calls.peakParticipants}, ${peak})` }).where(eq(calls.id, call.id));

      socket.to(`voice:${channelId}`).emit('voice:peer-joined', { channelId, participant: me });
      await broadcastRoom(ctx, io, channelId);
      ctx.bus.emit('voice.joined', { channelId, userId });
      await grantAchievement(ctx, userId, 'first_call');
      await awardXp(ctx, userId, 'call');

      // Ring the other participants of a private conversation when a call starts.
      if (startedNow && (row.type === 'dm' || row.type === 'group_dm')) {
        const members = await ctx.db.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channelId));
        const caller = await getPublicUser(ctx, userId);
        const targets = members.map((m) => m.userId).filter((id) => id !== userId);
        ctx.realtime.toUsers(targets, 'call:incoming', { channelId, from: caller });
        await notify(ctx, targets, { type: 'call', title: `${caller?.displayName ?? 'Alguém'} está chamando você`, link: `/app/c/${channelId}`, data: { channelId } });
      }

      ack({ ok: true, self: me, participants: others, iceServers: iceServers(ctx, userId), callId: call.id });
    } catch (err) {
      ctx.log.error({ err }, 'voice join failed');
      ack({ ok: false, error: 'Falha ao entrar na chamada' });
    }
  });

  socket.on('voice:leave', async (payload: { channelId?: string }, ackRaw: unknown) => {
    const ack = safeAck(ackRaw);
    if (typeof payload?.channelId === 'string') await leaveRoom(ctx, io, socket, payload.channelId);
    ack({ ok: true });
  });

  /** Relays SDP offers/answers and ICE candidates between two members of the same room. */
  socket.on('voice:signal', async (payload: { channelId?: string; to?: string; data?: unknown }) => {
    if (typeof payload?.channelId !== 'string' || typeof payload.to !== 'string' || !payload.data) return;
    if (!socket.rooms.has(`voice:${payload.channelId}`)) return;
    const target = await ctx.redis.hexists(roomKey(payload.channelId), payload.to);
    if (!target) return;
    const size = JSON.stringify(payload.data).length;
    if (size > 64 * 1024) return;
    io.to(payload.to).emit('voice:signal', { channelId: payload.channelId, from: socket.id, userId, data: payload.data });
  });

  socket.on('voice:state', async (payload: Partial<Pick<VoiceParticipant, 'muted' | 'deafened' | 'video' | 'screen'>> & { channelId?: string }) => {
    if (typeof payload?.channelId !== 'string' || !socket.rooms.has(`voice:${payload.channelId}`)) return;
    const raw = await ctx.redis.hget(roomKey(payload.channelId), socket.id);
    if (!raw) return;
    const me = JSON.parse(raw) as VoiceParticipant;
    if (typeof payload.muted === 'boolean') me.muted = payload.muted || !me.allowed.speak || me.serverMuted;
    if (typeof payload.deafened === 'boolean') me.deafened = payload.deafened;
    if (typeof payload.video === 'boolean') me.video = payload.video && me.allowed.video;
    if (typeof payload.screen === 'boolean') me.screen = payload.screen && me.allowed.screen;
    await ctx.redis.hset(roomKey(payload.channelId), socket.id, JSON.stringify(me));
    io.to(`voice:${payload.channelId}`).emit('voice:state', { channelId: payload.channelId, participant: me });
    io.to(`channel:${payload.channelId}`).emit('voice:participants', { channelId: payload.channelId, participants: await getParticipants(ctx, payload.channelId) });
  });

  socket.on('voice:speaking', (payload: { channelId?: string; speaking?: boolean }) => {
    if (typeof payload?.channelId !== 'string' || !socket.rooms.has(`voice:${payload.channelId}`)) return;
    socket.to(`voice:${payload.channelId}`).emit('voice:speaking', { socketId: socket.id, userId, speaking: !!payload.speaking });
  });

  /** Moderation inside calls: server mute or disconnect another participant. */
  socket.on('voice:moderate', async (payload: { channelId?: string; socketId?: string; action?: 'mute' | 'unmute' | 'disconnect' }, ackRaw: unknown) => {
    const ack = safeAck(ackRaw);
    const { channelId, socketId, action } = payload ?? {};
    if (typeof channelId !== 'string' || typeof socketId !== 'string' || !action) return ack({ ok: false });
    const a = await ctx.perms.getUser(userId);
    if (!a) return ack({ ok: false });
    const { perms } = await ctx.perms.channelPermsById(a, channelId);
    if (!perms.has(PERMISSIONS.MUTE_MEMBERS)) return ack({ ok: false, error: 'Sem permissão' });
    const raw = await ctx.redis.hget(roomKey(channelId), socketId);
    if (!raw) return ack({ ok: false });
    const target = JSON.parse(raw) as VoiceParticipant;
    const targetAuthz = await ctx.perms.getUser(target.userId);
    if (!targetAuthz || !ctx.perms.canActOn(a, targetAuthz)) return ack({ ok: false, error: 'Você não pode moderar este participante' });
    if (action === 'disconnect') {
      io.to(socketId).emit('voice:kicked', { channelId });
      const sockets = await io.in(socketId).fetchSockets();
      for (const s of sockets) {
        await ctx.redis.hdel(roomKey(channelId), s.id);
        s.leave(`voice:${channelId}`);
      }
      io.to(`voice:${channelId}`).emit('voice:peer-left', { channelId, socketId, userId: target.userId });
    } else {
      target.serverMuted = action === 'mute';
      if (target.serverMuted) target.muted = true;
      await ctx.redis.hset(roomKey(channelId), socketId, JSON.stringify(target));
      io.to(socketId).emit('voice:force-mute', { channelId, muted: target.serverMuted });
      io.to(`voice:${channelId}`).emit('voice:state', { channelId, participant: target });
    }
    await broadcastRoom(ctx, io, channelId);
    ack({ ok: true });
  });
}
