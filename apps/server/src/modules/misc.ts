import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import os from 'node:os';
import { z } from 'zod';
import { PERMISSIONS } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { body, query, uuidParam } from '../lib/http';
import { notify } from '../lib/notify';
import { getPublicUsers } from '../lib/users';
import { iceServers } from '../realtime/voice';
import { requireChannel } from './structure';
import { hydrateMessages } from './messages';
import {
  bots,
  callParticipants,
  calls,
  changelogEntries,
  channels,
  customEmojis,
  events,
  favorites,
  files,
  forumPosts,
  messages,
  notes,
  userProfiles,
  users,
  voiceRooms,
  whiteboardStrokes,
} from '../db/schema';

const startedAt = Date.now();

/** Builds a prefix tsquery from free text (each word must match as a prefix). */
function prefixQuery(q: string) {
  const words = q
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

export async function miscRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const approved = { preHandler: g.approved };

  // ── WebRTC configuration ──
  app.get('/api/rtc/ice-servers', approved, async (req) => ({ iceServers: iceServers(ctx, req.authz!.id), turnConfigured: !!(ctx.config.TURN_URLS && ctx.config.TURN_SECRET) }));

  app.get('/api/channels/:id/voice', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const { getParticipants } = await import('../realtime/voice');
    return { participants: await getParticipants(ctx, channelId) };
  });

  app.get('/api/voice/active', approved, async (req) => {
    const visible = new Set(await ctx.perms.visibleChannelIds(req.authz!));
    const keys = await ctx.redis.keys('voice:room:*');
    const { getParticipants } = await import('../realtime/voice');
    const out: Record<string, unknown[]> = {};
    for (const k of keys) {
      const id = k.slice('voice:room:'.length);
      if (visible.has(id)) out[id] = await getParticipants(ctx, id);
    }
    return out;
  });

  // ── Whiteboard ──
  app.get('/api/channels/:id/whiteboard', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const rows = await ctx.db.select().from(whiteboardStrokes).where(eq(whiteboardStrokes.channelId, channelId)).orderBy(asc(whiteboardStrokes.createdAt)).limit(5000);
    return rows.map((r) => ({ ...(r.data as object), userId: r.userId }));
  });

  // ── Global search (permission-aware) ──
  app.get('/api/search', { preHandler: g.approved, config: { rateLimit: { max: 60, timeWindow: 60_000 } } }, async (req) => {
    const q = query(
      req,
      z.object({
        q: z.string().trim().min(1).max(100),
        type: z.enum(['all', 'users', 'channels', 'messages', 'posts', 'files', 'events', 'bots']).default('all'),
        channelId: z.string().uuid().optional(),
        authorId: z.string().uuid().optional(),
      }),
    );
    const a = req.authz!;
    const like = `%${q.q.replace(/[%_\\]/g, '')}%`;
    const tsq = prefixQuery(q.q);
    const visible = await ctx.perms.visibleChannelIds(a);
    const want = (t: string) => q.type === 'all' || q.type === t;
    const limit = q.type === 'all' ? 8 : 40;
    const out: Record<string, unknown> = {};

    if (want('users')) {
      out.users = await ctx.db
        .select({ id: users.id, username: users.username, displayName: userProfiles.displayName, avatarFileId: userProfiles.avatarFileId, isBot: users.isBot })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(and(eq(users.status, 'approved'), or(ilike(users.username, like), ilike(userProfiles.displayName, like))))
        .limit(limit);
    }
    if (want('channels')) {
      out.channels = visible.length
        ? await ctx.db
            .select({ id: channels.id, name: channels.name, type: channels.type, topic: channels.topic, spaceId: channels.spaceId })
            .from(channels)
            .where(and(inArray(channels.id, visible), sql`${channels.spaceId} is not null`, or(ilike(channels.name, like), ilike(channels.topic, like))))
            .limit(limit)
        : [];
    }
    if (want('messages') && tsq && visible.length) {
      const scope = q.channelId ? (visible.includes(q.channelId) ? [q.channelId] : []) : visible;
      const rows = scope.length
        ? await ctx.db
            .select()
            .from(messages)
            .where(
              and(
                inArray(messages.channelId, scope),
                isNull(messages.deletedAt),
                q.authorId ? eq(messages.authorId, q.authorId) : undefined,
                sql`${messages.search} @@ to_tsquery('simple', ${tsq})`,
              ),
            )
            .orderBy(desc(messages.id))
            .limit(q.type === 'all' ? 8 : 50)
        : [];
      const hydrated = await hydrateMessages(ctx, rows, a.id);
      out.messages = hydrated;
      out.messageUsers = await getPublicUsers(ctx, hydrated.map((m) => m.authorId!).filter(Boolean));
    }
    if (want('posts') && tsq && visible.length) {
      out.posts = await ctx.db
        .select({ id: forumPosts.id, title: forumPosts.title, channelId: forumPosts.channelId, authorId: forumPosts.authorId, createdAt: forumPosts.createdAt, commentCount: forumPosts.commentCount, likeCount: forumPosts.likeCount })
        .from(forumPosts)
        .where(and(inArray(forumPosts.channelId, visible), isNull(forumPosts.deletedAt), sql`${forumPosts.search} @@ to_tsquery('simple', ${tsq})`))
        .orderBy(desc(sql`ts_rank(${forumPosts.search}, to_tsquery('simple', ${tsq}))`))
        .limit(limit);
    }
    if (want('files')) {
      out.files = await ctx.db
        .select({ id: files.id, name: files.originalName, mimeType: files.mimeType, category: files.category, size: files.size, channelId: files.channelId, createdAt: files.createdAt })
        .from(files)
        .where(
          and(
            isNull(files.deletedAt),
            ilike(files.originalName, like),
            inArray(files.purpose, ['attachment', 'library', 'music']),
            visible.length ? or(eq(files.ownerId, a.id), inArray(files.channelId, visible)) : eq(files.ownerId, a.id),
          ),
        )
        .orderBy(desc(files.createdAt))
        .limit(limit);
    }
    if (want('events')) {
      const rows = await ctx.db
        .select()
        .from(events)
        .where(and(isNull(events.cancelledAt), or(ilike(events.title, like), ilike(events.description, like))))
        .orderBy(desc(events.startsAt))
        .limit(limit);
      out.events = rows.filter((e) => !e.channelId || visible.includes(e.channelId));
    }
    if (want('bots')) {
      out.bots = await ctx.db
        .select({ id: bots.id, userId: bots.userId, name: users.username, description: bots.description, enabled: bots.enabled })
        .from(bots)
        .innerJoin(users, eq(users.id, bots.userId))
        .where(or(ilike(users.username, like), ilike(bots.description, like)))
        .limit(limit);
    }
    return out;
  });

  // ── Personal notes ──
  app.get('/api/notes', approved, async (req) => ctx.db.select().from(notes).where(eq(notes.userId, req.authz!.id)).orderBy(desc(notes.updatedAt)));

  app.post('/api/notes', approved, async (req) => {
    const input = body(req, z.object({ title: z.string().max(200).default(''), content: z.string().max(50000).default('') }));
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(notes).where(eq(notes.userId, req.authz!.id));
    if (n >= 500) throw badRequest('Limite de 500 notas atingido');
    const [row] = await ctx.db.insert(notes).values({ userId: req.authz!.id, ...input }).returning();
    return row;
  });

  app.patch('/api/notes/:id', approved, async (req) => {
    const input = body(req, z.object({ title: z.string().max(200).optional(), content: z.string().max(50000).optional() }));
    const [row] = await ctx.db
      .update(notes)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(notes.id, uuidParam(req, 'id')), eq(notes.userId, req.authz!.id)))
      .returning();
    if (!row) throw notFound();
    return row;
  });

  app.delete('/api/notes/:id', approved, async (req) => {
    await ctx.db.delete(notes).where(and(eq(notes.id, uuidParam(req, 'id')), eq(notes.userId, req.authz!.id)));
    return { ok: true };
  });

  // ── Favorites ──
  app.get('/api/favorites', approved, async (req) => {
    const rows = await ctx.db.select().from(favorites).where(eq(favorites.userId, req.authz!.id)).orderBy(desc(favorites.createdAt));
    const msgIds = rows.filter((r) => r.targetType === 'message' && /^\d+$/.test(r.targetId)).map((r) => BigInt(r.targetId));
    const msgRows = msgIds.length ? await ctx.db.select().from(messages).where(inArray(messages.id, msgIds)) : [];
    const allowed = [];
    for (const m of msgRows) {
      const { perms } = await ctx.perms.channelPermsById(req.authz!, m.channelId);
      if (perms.has(P.VIEW_CHANNEL)) allowed.push(m);
    }
    const hydrated = await hydrateMessages(ctx, allowed, req.authz!.id);
    const postIds = rows.filter((r) => r.targetType === 'forum_post').map((r) => r.targetId);
    const posts = postIds.length ? await ctx.db.select({ id: forumPosts.id, title: forumPosts.title, channelId: forumPosts.channelId }).from(forumPosts).where(inArray(forumPosts.id, postIds)) : [];
    const visible = new Set(await ctx.perms.visibleChannelIds(req.authz!));
    return {
      favorites: rows,
      messages: hydrated,
      posts: posts.filter((p) => visible.has(p.channelId)),
      users: await getPublicUsers(ctx, hydrated.map((m) => m.authorId!).filter(Boolean)),
    };
  });

  app.put('/api/favorites', approved, async (req) => {
    const input = body(req, z.object({ targetType: z.enum(['message', 'channel', 'forum_post', 'file']), targetId: z.string().max(64) }));
    await ctx.db.insert(favorites).values({ userId: req.authz!.id, ...input }).onConflictDoNothing();
    return { ok: true };
  });

  app.delete('/api/favorites', approved, async (req) => {
    const input = body(req, z.object({ targetType: z.enum(['message', 'channel', 'forum_post', 'file']), targetId: z.string().max(64) }));
    await ctx.db.delete(favorites).where(and(eq(favorites.userId, req.authz!.id), eq(favorites.targetType, input.targetType), eq(favorites.targetId, input.targetId)));
    return { ok: true };
  });

  // ── Activity history (own) ──
  app.get('/api/me/activity', approved, async (req) => {
    const me = req.authz!.id;
    const msgs = await ctx.db
      .select({ id: messages.id, channelId: messages.channelId, content: messages.content, createdAt: messages.createdAt, channelName: channels.name, channelType: channels.type })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(and(eq(messages.authorId, me), isNull(messages.deletedAt)))
      .orderBy(desc(messages.id))
      .limit(20);
    const posts = await ctx.db.select({ id: forumPosts.id, title: forumPosts.title, channelId: forumPosts.channelId, createdAt: forumPosts.createdAt }).from(forumPosts).where(eq(forumPosts.authorId, me)).orderBy(desc(forumPosts.createdAt)).limit(10);
    const callRows = await ctx.db
      .select({ joinedAt: callParticipants.joinedAt, leftAt: callParticipants.leftAt, channelId: voiceRooms.channelId, channelName: channels.name })
      .from(callParticipants)
      .innerJoin(calls, eq(calls.id, callParticipants.callId))
      .innerJoin(voiceRooms, eq(voiceRooms.id, calls.roomId))
      .innerJoin(channels, eq(channels.id, voiceRooms.channelId))
      .where(eq(callParticipants.userId, me))
      .orderBy(desc(callParticipants.joinedAt))
      .limit(10);
    const items = [
      ...msgs.map((m) => ({ kind: 'message', at: m.createdAt, channelId: m.channelId, title: m.channelType === 'dm' || m.channelType === 'group_dm' ? 'Conversa privada' : `#${m.channelName}`, body: m.content.slice(0, 140), id: m.id.toString() })),
      ...posts.map((p) => ({ kind: 'post', at: p.createdAt, channelId: p.channelId, title: p.title, body: '', id: p.id })),
      ...callRows.map((c) => ({ kind: 'call', at: c.joinedAt, channelId: c.channelId, title: c.channelName || 'Chamada privada', body: c.leftAt ? `${Math.max(1, Math.round((c.leftAt.getTime() - c.joinedAt.getTime()) / 60000))} min` : 'em andamento', id: c.channelId })),
    ].sort((x, y) => y.at.getTime() - x.at.getTime());
    return items.slice(0, 40);
  });

  // ── Changelog ("Novidades") ──
  app.get('/api/changelog', approved, async () => ctx.db.select().from(changelogEntries).orderBy(desc(changelogEntries.publishedAt)).limit(50));

  app.post('/api/changelog', { preHandler: g.perm(P.MANAGE_SETTINGS) }, async (req) => {
    const input = body(req, z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(10000), notify: z.boolean().default(true) }));
    const [row] = await ctx.db.insert(changelogEntries).values({ title: input.title, body: input.body, authorId: req.authz!.id }).returning();
    await audit(ctx, { actorId: req.authz!.id, action: 'changelog.publish', targetType: 'changelog', targetId: row.id, ip: req.ip, metadata: { title: input.title } });
    if (input.notify) {
      const all = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.status, 'approved'), eq(users.isBot, false)));
      await notify(ctx, all.map((u) => u.id).filter((id) => id !== req.authz!.id), { type: 'update', title: `Novidade: ${input.title}`, body: input.body.slice(0, 140), link: '/app/changelog' });
    }
    ctx.realtime.toMembers('changelog:new', row);
    return row;
  });

  app.delete('/api/changelog/:id', { preHandler: g.perm(P.MANAGE_SETTINGS) }, async (req) => {
    await ctx.db.delete(changelogEntries).where(eq(changelogEntries.id, uuidParam(req, 'id')));
    return { ok: true };
  });

  // ── Announcements (global banner + notification) ──
  app.post('/api/admin/announcements', { preHandler: g.perm(P.MANAGE_SETTINGS, P.MANAGE_CHANNELS) }, async (req) => {
    const input = body(req, z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(4000).default(''), channelId: z.string().uuid().optional(), email: z.boolean().default(false) }));
    if (input.channelId) {
      const { channel } = await requireChannel(ctx, req.authz!, input.channelId, P.SEND_MESSAGES);
      const { createMessage } = await import('./messages');
      await createMessage(ctx, { channelId: channel.id, authorId: req.authz!.id, content: `**${input.title}**\n${input.body}`, type: 'default', metadata: { announcement: true }, skipMentions: true });
    }
    const all = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.status, 'approved'), eq(users.isBot, false)));
    await notify(ctx, all.map((u) => u.id), { type: 'admin', title: `📢 ${input.title}`, body: input.body.slice(0, 300), link: input.channelId ? `/app/c/${input.channelId}` : undefined }, { email: input.email });
    ctx.realtime.toMembers('announcement', { title: input.title, body: input.body });
    ctx.bus.emit('announcement.created', { title: input.title, body: input.body });
    await audit(ctx, { actorId: req.authz!.id, action: 'announcement.create', ip: req.ip, metadata: { title: input.title, channelId: input.channelId } });
    return { ok: true, recipients: all.length };
  });

  // ── Custom emojis & stickers ──
  app.get('/api/emojis', approved, async () => ctx.db.select().from(customEmojis).orderBy(asc(customEmojis.name)));

  app.post('/api/emojis', { preHandler: g.perm(P.MANAGE_EMOJIS) }, async (req) => {
    const input = body(req, z.object({ name: z.string().regex(/^[a-z0-9_]{2,32}$/, 'Use letras minúsculas, números e _'), fileId: z.string().uuid(), kind: z.enum(['emoji', 'sticker']).default('emoji') }));
    const [f] = await ctx.db.select().from(files).where(eq(files.id, input.fileId));
    if (!f || f.category !== 'image' || f.deletedAt || !['emoji', 'sticker'].includes(f.purpose)) throw badRequest('Imagem inválida');
    const [row] = await ctx.db.insert(customEmojis).values({ ...input, createdById: req.authz!.id }).onConflictDoNothing().returning();
    if (!row) throw badRequest('Já existe um item com esse nome');
    await audit(ctx, { actorId: req.authz!.id, action: `${input.kind}.create`, targetType: input.kind, targetId: row.id, ip: req.ip, metadata: { name: input.name } });
    ctx.realtime.toMembers('emojis:updated', {});
    return row;
  });

  app.delete('/api/emojis/:id', { preHandler: g.perm(P.MANAGE_EMOJIS) }, async (req) => {
    const [row] = await ctx.db.delete(customEmojis).where(eq(customEmojis.id, uuidParam(req, 'id'))).returning();
    if (row) await audit(ctx, { actorId: req.authz!.id, action: `${row.kind}.delete`, targetType: row.kind, targetId: row.id, ip: req.ip, metadata: { name: row.name } });
    ctx.realtime.toMembers('emojis:updated', {});
    return { ok: true };
  });

  // ── GIF search (proxied so the API key never reaches the browser) ──
  app.get('/api/gifs/search', { preHandler: g.approved, config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (req) => {
    const { q } = query(req, z.object({ q: z.string().trim().min(1).max(60) }));
    const key = ctx.config.GIF_PROVIDER_KEY;
    if (!key) return { enabled: false, results: [] };
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}&limit=24&media_filter=tinygif,gif&contentfilter=medium&locale=pt_BR`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { enabled: true, results: [] };
    const data = (await res.json()) as { results?: { id: string; content_description: string; media_formats: Record<string, { url: string; dims: number[] }> }[] };
    return {
      enabled: true,
      results: (data.results ?? []).map((r) => ({ id: r.id, description: r.content_description, preview: r.media_formats.tinygif?.url, url: r.media_formats.gif?.url ?? r.media_formats.tinygif?.url, dims: r.media_formats.tinygif?.dims })),
    };
  });

  app.get('/api/gifs/enabled', approved, async () => ({ enabled: !!ctx.config.GIF_PROVIDER_KEY }));

  // ── Server status ──
  app.get('/api/health', async () => {
    const db = await ctx.pool.query('select 1').then(() => true, () => false);
    const redis = await ctx.redis.ping().then((r) => r === 'PONG', () => false);
    return { ok: db && redis, db, redis };
  });

  app.get('/api/status', approved, async () => {
    const t0 = Date.now();
    const db = await ctx.pool.query('select 1').then(() => Date.now() - t0, () => -1);
    const t1 = Date.now();
    const redis = await ctx.redis.ping().then(() => Date.now() - t1, () => -1);
    const sockets = ctx.realtime.io ? (await ctx.realtime.io.fetchSockets()).length : 0;
    const voiceRoomsActive = (await ctx.redis.keys('voice:room:*')).length;
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? '0.1.0',
      services: { database: { ok: db >= 0, latencyMs: db }, redis: { ok: redis >= 0, latencyMs: redis }, storage: { ok: true, driver: ctx.config.STORAGE_DRIVER }, turn: { configured: !!(ctx.config.TURN_URLS && ctx.config.TURN_SECRET) } },
      realtime: { connections: sockets, activeVoiceRooms: voiceRoomsActive },
      system: { loadAverage: os.loadavg(), memoryRssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), node: process.version },
    };
  });
}
