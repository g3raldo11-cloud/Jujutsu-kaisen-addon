import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { categorySchema, CHANNEL_PERMISSIONS, channelOverwriteSchema, channelSchema, channelUpdateSchema, PERMISSIONS, spaceSchema, type Permission } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound, tooMany } from '../lib/errors';
import { body, uuidParam } from '../lib/http';
import type { UserAuthz } from '../lib/permissions';
import { categories, channelMembers, channelOverwrites, channels, channelUserStates, spaces, voiceRooms } from '../db/schema';

export type ChannelRow = typeof channels.$inferSelect;

/** Loads a channel and enforces a channel permission (and password unlock) for the current user. */
export async function requireChannel(ctx: AppContext, a: UserAuthz, channelId: string, perm: Permission = PERMISSIONS.VIEW_CHANNEL) {
  const { ch, perms } = await ctx.perms.channelPermsById(a, channelId);
  if (!ch || !perms.has(PERMISSIONS.VIEW_CHANNEL)) throw notFound('Canal não encontrado');
  if (!perms.has(perm)) throw forbidden('Você não tem permissão para isso neste canal');
  const [row] = await ctx.db.select().from(channels).where(eq(channels.id, channelId));
  if (!row) throw notFound('Canal não encontrado');
  if (row.passwordHash && !perms.has(PERMISSIONS.MANAGE_MESSAGES) && !ctx.perms.has(a, PERMISSIONS.MANAGE_CHANNELS)) {
    const [st] = await ctx.db
      .select()
      .from(channelUserStates)
      .where(and(eq(channelUserStates.channelId, channelId), eq(channelUserStates.userId, a.id)));
    if (!st?.unlockedAt) throw new AppError(403, 'CHANNEL_LOCKED', 'Esta sala é protegida por senha');
  }
  return { channel: row, perms };
}

export function serializeChannel(c: ChannelRow, perms: Set<Permission>, extra: Record<string, unknown> = {}) {
  const { passwordHash, ...rest } = c;
  return { ...rest, passwordProtected: !!passwordHash, permissions: [...perms], ...extra };
}

export async function structureFor(ctx: AppContext, a: UserAuthz) {
  const allSpaces = await ctx.db.select().from(spaces).orderBy(asc(spaces.position), asc(spaces.createdAt));
  const allCats = await ctx.db.select().from(categories).orderBy(asc(categories.position));
  const visibleIds = await ctx.perms.visibleChannelIds(a);
  const rows = visibleIds.length
    ? await ctx.db.select().from(channels).where(inArray(channels.id, visibleIds)).orderBy(asc(channels.position), asc(channels.createdAt))
    : [];
  const map = await ctx.perms.channelMap();

  const counts = visibleIds.length
    ? await ctx.pool.query<{ id: string; unread: number; mentions: number; last_read: string | null; unlocked: boolean }>(
        `select c.id,
          (select count(*)::int from (select 1 from messages m where m.channel_id = c.id and m.thread_id is null and m.deleted_at is null
              and m.author_id is distinct from $1 and m.id > coalesce(s.last_read_message_id, 0)
              and m.created_at > coalesce(s.last_read_at, u.created_at) limit 100) x) as unread,
          (select count(*)::int from (select 1 from messages m where m.channel_id = c.id and m.deleted_at is null
              and m.author_id is distinct from $1 and m.id > coalesce(s.last_read_message_id, 0)
              and m.created_at > coalesce(s.last_read_at, u.created_at)
              and ($1 = any(m.mention_ids) or m.mentions_everyone) limit 100) y) as mentions,
          s.last_read_message_id::text as last_read,
          (s.unlocked_at is not null) as unlocked
         from channels c
         cross join users u
         left join channel_user_states s on s.channel_id = c.id and s.user_id = $1
         where u.id = $1 and c.id = any($2::uuid[])`,
        [a.id, visibleIds],
      )
    : { rows: [] };
  const byId = new Map(counts.rows.map((r) => [r.id, r]));

  const out = rows.map((c) => {
    const info = map.get(c.id);
    const perms = info ? ctx.perms.channelPerms(a, info) : ctx.perms.channelPerms(a, { ...c, passwordProtected: !!c.passwordHash, overwrites: [] });
    const cnt = byId.get(c.id);
    return serializeChannel(c, perms, {
      unread: cnt?.unread ?? 0,
      mentions: cnt?.mentions ?? 0,
      lastReadMessageId: cnt?.last_read ?? null,
      unlocked: !c.passwordHash || !!cnt?.unlocked || perms.has(PERMISSIONS.MANAGE_MESSAGES),
    });
  });
  const usedSpaces = new Set(out.map((c) => c.spaceId));
  const canManage = ctx.perms.has(a, PERMISSIONS.MANAGE_CHANNELS);
  return {
    spaces: allSpaces.filter((s) => canManage || usedSpaces.has(s.id)),
    categories: allCats.filter((c) => canManage || out.some((ch) => ch.categoryId === c.id)),
    channels: out,
  };
}

export async function structureRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const manage = { preHandler: g.perm(P.MANAGE_CHANNELS) };
  const changed = async () => {
    ctx.perms.invalidateChannels();
    await ctx.realtime.resyncAll();
    ctx.realtime.toMembers('structure:updated', {});
  };

  app.get('/api/structure', { preHandler: g.approved }, async (req) => structureFor(ctx, req.authz!));

  // ── Spaces ──
  app.post('/api/spaces', manage, async (req) => {
    const input = body(req, spaceSchema);
    const [{ max }] = await ctx.db.select({ max: sql<number>`coalesce(max(${spaces.position}), -1)` }).from(spaces);
    const [s] = await ctx.db.insert(spaces).values({ name: input.name, description: input.description, iconFileId: input.iconFileId ?? null, position: max + 1 }).returning();
    await audit(ctx, { actorId: req.authz!.id, action: 'space.create', targetType: 'space', targetId: s.id, ip: req.ip, metadata: { name: s.name } });
    await changed();
    return s;
  });

  app.patch('/api/spaces/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, spaceSchema.partial().extend({ position: z.number().int().min(0).max(1000).optional() }));
    const [s] = await ctx.db.update(spaces).set(input).where(eq(spaces.id, id)).returning();
    if (!s) throw notFound();
    await audit(ctx, { actorId: req.authz!.id, action: 'space.update', targetType: 'space', targetId: id, ip: req.ip, metadata: input });
    await changed();
    return s;
  });

  app.delete('/api/spaces/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(spaces);
    if (n <= 1) throw badRequest('A plataforma precisa de pelo menos um espaço');
    const [s] = await ctx.db.delete(spaces).where(eq(spaces.id, id)).returning();
    if (!s) throw notFound();
    await audit(ctx, { actorId: req.authz!.id, action: 'space.delete', targetType: 'space', targetId: id, ip: req.ip, metadata: { name: s.name } });
    await changed();
    return { ok: true };
  });

  // ── Categories ──
  app.post('/api/categories', manage, async (req) => {
    const input = body(req, categorySchema);
    const [{ max }] = await ctx.db
      .select({ max: sql<number>`coalesce(max(${categories.position}), -1)` })
      .from(categories)
      .where(eq(categories.spaceId, input.spaceId));
    const [c] = await ctx.db.insert(categories).values({ ...input, position: max + 1 }).returning();
    await audit(ctx, { actorId: req.authz!.id, action: 'category.create', targetType: 'category', targetId: c.id, ip: req.ip, metadata: { name: c.name } });
    await changed();
    return c;
  });

  app.patch('/api/categories/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, z.object({ name: z.string().trim().min(1).max(60).optional(), position: z.number().int().min(0).max(1000).optional() }));
    const [c] = await ctx.db.update(categories).set(input).where(eq(categories.id, id)).returning();
    if (!c) throw notFound();
    await changed();
    return c;
  });

  app.delete('/api/categories/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.delete(categories).where(eq(categories.id, id)).returning();
    if (!c) throw notFound();
    await audit(ctx, { actorId: req.authz!.id, action: 'category.delete', targetType: 'category', targetId: id, ip: req.ip, metadata: { name: c.name } });
    await changed();
    return { ok: true };
  });

  app.put('/api/spaces/:id/order', manage, async (req) => {
    const spaceId = uuidParam(req, 'id');
    const input = body(req, z.object({ categories: z.array(z.string().uuid()).max(200), channels: z.array(z.object({ id: z.string().uuid(), categoryId: z.string().uuid().nullable() })).max(1000) }));
    await ctx.db.transaction(async (tx) => {
      for (const [i, id] of input.categories.entries()) await tx.update(categories).set({ position: i }).where(and(eq(categories.id, id), eq(categories.spaceId, spaceId)));
      for (const [i, c] of input.channels.entries()) await tx.update(channels).set({ position: i, categoryId: c.categoryId }).where(and(eq(channels.id, c.id), eq(channels.spaceId, spaceId)));
    });
    await changed();
    return { ok: true };
  });

  // ── Channels ──

  /** Members may create temporary voice rooms; everything else requires channel management. */
  app.post('/api/channels', { preHandler: g.approved }, async (req) => {
    const input = body(req, channelSchema);
    const a = req.authz!;
    const isManager = ctx.perms.has(a, P.MANAGE_CHANNELS);
    if (!isManager) {
      if (!(input.isTemporary && ['voice', 'video'].includes(input.type))) throw forbidden();
      const key = `rl:temproom:${a.id}`;
      const n = await ctx.redis.incr(key);
      await ctx.redis.expire(key, 3600);
      if (n > 5) throw tooMany('Limite de salas temporárias atingido. Tente mais tarde.');
    }
    if (input.categoryId) {
      const [cat] = await ctx.db.select().from(categories).where(eq(categories.id, input.categoryId));
      if (!cat || cat.spaceId !== input.spaceId) throw badRequest('Categoria inválida');
    }
    const [{ max }] = await ctx.db
      .select({ max: sql<number>`coalesce(max(${channels.position}), -1)` })
      .from(channels)
      .where(eq(channels.spaceId, input.spaceId));
    const ch = await ctx.db.transaction(async (tx) => {
      const [c] = await tx
        .insert(channels)
        .values({
          spaceId: input.spaceId,
          categoryId: input.categoryId ?? null,
          type: input.type,
          name: input.type === 'text' || input.type === 'announcement' ? input.name.toLowerCase().replace(/\s+/g, '-') : input.name,
          topic: input.topic,
          isPrivate: input.isPrivate,
          isTemporary: input.isTemporary,
          passwordHash: input.password ? await hashPassword(input.password) : null,
          slowmodeSeconds: input.slowmodeSeconds,
          userLimit: input.userLimit,
          position: max + 1,
          createdById: a.id,
        })
        .returning();
      const members = new Set(input.memberIds);
      if (input.isPrivate) members.add(a.id);
      if (members.size) await tx.insert(channelMembers).values([...members].map((userId) => ({ channelId: c.id, userId, isManager: userId === a.id })));
      if (input.overwrites?.length && isManager) {
        await tx.insert(channelOverwrites).values(input.overwrites.map((o) => ({ channelId: c.id, ...o })));
      }
      if (['voice', 'video', 'stage'].includes(c.type)) await tx.insert(voiceRooms).values({ channelId: c.id, kind: c.isTemporary ? 'temporary' : 'channel' });
      return c;
    });
    for (const m of input.memberIds) ctx.perms.invalidateUser(m);
    ctx.perms.invalidateUser(a.id);
    await audit(ctx, { actorId: a.id, action: 'channel.create', targetType: 'channel', targetId: ch.id, ip: req.ip, metadata: { name: ch.name, type: ch.type, isPrivate: ch.isPrivate } });
    await changed();
    return serializeChannel(ch, new Set(CHANNEL_PERMISSIONS));
  });

  app.patch('/api/channels/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, channelUpdateSchema);
    const { password, memberIds, overwrites, ...rest } = input;
    const patch: Partial<ChannelRow> = { ...rest };
    if (password !== undefined) patch.passwordHash = password ? await hashPassword(password) : null;
    const [c] = await ctx.db.update(channels).set(patch).where(eq(channels.id, id)).returning();
    if (!c) throw notFound();
    if (memberIds) {
      const before = await ctx.db.select().from(channelMembers).where(eq(channelMembers.channelId, id));
      await ctx.db.delete(channelMembers).where(eq(channelMembers.channelId, id));
      if (memberIds.length) await ctx.db.insert(channelMembers).values(memberIds.map((userId) => ({ channelId: id, userId })));
      for (const u of new Set([...before.map((b) => b.userId), ...memberIds])) ctx.perms.invalidateUser(u);
    }
    if (overwrites) {
      await ctx.db.delete(channelOverwrites).where(eq(channelOverwrites.channelId, id));
      if (overwrites.length) await ctx.db.insert(channelOverwrites).values(overwrites.map((o) => ({ channelId: id, ...o })));
    }
    await audit(ctx, { actorId: req.authz!.id, action: 'channel.update', targetType: 'channel', targetId: id, ip: req.ip, metadata: { ...rest, password: password === undefined ? undefined : !!password, members: memberIds?.length, overwrites: overwrites?.length } });
    await changed();
    return serializeChannel(c, new Set(CHANNEL_PERMISSIONS));
  });

  app.delete('/api/channels/:id', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.select().from(channels).where(eq(channels.id, id));
    if (!c || !c.spaceId) throw notFound();
    await ctx.db.delete(channels).where(eq(channels.id, id));
    await audit(ctx, { actorId: req.authz!.id, action: 'channel.delete', targetType: 'channel', targetId: id, ip: req.ip, metadata: { name: c.name, type: c.type } });
    ctx.realtime.toChannel(id, 'channel:deleted', { channelId: id });
    await changed();
    return { ok: true };
  });

  app.get('/api/channels/:id', { preHandler: g.approved }, async (req) => {
    const { channel, perms } = await requireChannel(ctx, req.authz!, uuidParam(req, 'id'));
    const members = await ctx.db.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channel.id));
    const ow = ctx.perms.has(req.authz!, P.MANAGE_CHANNELS) ? await ctx.db.select().from(channelOverwrites).where(eq(channelOverwrites.channelId, channel.id)) : [];
    return serializeChannel(channel, perms, { memberIds: members.map((m) => m.userId), overwrites: ow });
  });

  app.put('/api/channels/:id/overwrites', manage, async (req) => {
    const id = uuidParam(req, 'id');
    const { overwrites } = body(req, z.object({ overwrites: z.array(channelOverwriteSchema).max(50) }));
    await ctx.db.delete(channelOverwrites).where(eq(channelOverwrites.channelId, id));
    if (overwrites.length) await ctx.db.insert(channelOverwrites).values(overwrites.map((o) => ({ channelId: id, ...o })));
    await audit(ctx, { actorId: req.authz!.id, action: 'channel.permissions', targetType: 'channel', targetId: id, ip: req.ip, metadata: { overwrites } });
    await changed();
    return { ok: true };
  });

  app.post('/api/channels/:id/unlock', { preHandler: g.approved, config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req) => {
    const id = uuidParam(req, 'id');
    const { password } = body(req, z.object({ password: z.string().min(1).max(64) }));
    const { ch, perms } = await ctx.perms.channelPermsById(req.authz!, id);
    if (!ch || !perms.has(P.VIEW_CHANNEL)) throw notFound();
    const [c] = await ctx.db.select().from(channels).where(eq(channels.id, id));
    if (!c?.passwordHash) return { ok: true };
    if (!(await verifyPassword(c.passwordHash, password))) throw badRequest('Senha incorreta', 'INVALID_PASSWORD');
    await ctx.db
      .insert(channelUserStates)
      .values({ channelId: id, userId: req.authz!.id, unlockedAt: new Date() })
      .onConflictDoUpdate({ target: [channelUserStates.channelId, channelUserStates.userId], set: { unlockedAt: new Date() } });
    return { ok: true };
  });

  app.put('/api/channels/:id/notifications', { preHandler: g.approved }, async (req) => {
    const id = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, id);
    const input = body(req, z.object({ level: z.enum(['default', 'all', 'mentions', 'none']), muteHours: z.number().min(0).max(8760).optional() }));
    const mutedUntil = input.muteHours ? new Date(Date.now() + input.muteHours * 3600_000) : null;
    await ctx.db
      .insert(channelUserStates)
      .values({ channelId: id, userId: req.authz!.id, notificationLevel: input.level, mutedUntil })
      .onConflictDoUpdate({ target: [channelUserStates.channelId, channelUserStates.userId], set: { notificationLevel: input.level, mutedUntil } });
    return { ok: true };
  });
}

export type { FastifyRequest };
