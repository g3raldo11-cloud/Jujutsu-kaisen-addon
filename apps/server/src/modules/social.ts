import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, uuidParam } from '../lib/http';
import { grantAchievement } from '../lib/gamification';
import { notify } from '../lib/notify';
import { getPublicUser, getPublicUsers } from '../lib/users';
import { onlineUserIds, presenceOf } from '../realtime/presence';
import { channelMembers, channels, friendships, userBlocks, userProfiles, users } from '../db/schema';
import { createMessage } from './messages';

const pairWhere = (a: string, b: string) =>
  sql`least(${friendships.requesterId}, ${friendships.addresseeId}) = least(${a}::uuid, ${b}::uuid) and greatest(${friendships.requesterId}, ${friendships.addresseeId}) = greatest(${a}::uuid, ${b}::uuid)`;

async function isBlockedEitherWay(ctx: AppContext, a: string, b: string) {
  const rows = await ctx.db
    .select()
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a))));
  return rows.length > 0;
}

async function prefsOf(ctx: AppContext, userId: string) {
  const [p] = await ctx.db.select({ prefs: userProfiles.preferences }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return (p?.prefs ?? {}) as { privacy?: { allowDms?: 'everyone' | 'friends' | 'none'; allowFriendRequests?: boolean } };
}

async function areFriends(ctx: AppContext, a: string, b: string) {
  const [f] = await ctx.db.select().from(friendships).where(and(pairWhere(a, b), eq(friendships.status, 'accepted')));
  return !!f;
}

/** Private conversations: DMs and groups. */
export async function listConversations(ctx: AppContext, userId: string) {
  const mine = await ctx.db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channels.id, channelMembers.channelId))
    .where(and(eq(channelMembers.userId, userId), inArray(channels.type, ['dm', 'group_dm'])))
    .orderBy(desc(sql`coalesce(${channels.lastMessageAt}, ${channels.createdAt})`));
  const ids = mine.map((m) => m.channel.id);
  const members = ids.length ? await ctx.db.select().from(channelMembers).where(inArray(channelMembers.channelId, ids)) : [];
  return {
    conversations: mine.map(({ channel }) => ({
      id: channel.id,
      type: channel.type,
      name: channel.name,
      lastMessageAt: channel.lastMessageAt,
      createdAt: channel.createdAt,
      ownerId: channel.createdById,
      memberIds: members.filter((m) => m.channelId === channel.id).map((m) => m.userId),
    })),
    users: await getPublicUsers(ctx, [...new Set(members.map((m) => m.userId))]),
  };
}

export async function socialRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const approved = { preHandler: g.approved };

  async function approvedTarget(id: string) {
    const [u] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!u || u.status !== 'approved' || u.isBot) throw notFound('Usuário não encontrado');
    return u;
  }

  // ── Friends ──
  app.get('/api/friends', approved, async (req) => {
    const me = req.authz!.id;
    const rows = await ctx.db.select().from(friendships).where(or(eq(friendships.requesterId, me), eq(friendships.addresseeId, me)));
    const blocks = await ctx.db.select().from(userBlocks).where(eq(userBlocks.blockerId, me));
    const otherIds = [...rows.map((r) => (r.requesterId === me ? r.addresseeId : r.requesterId)), ...blocks.map((b) => b.blockedId)];
    const online = await onlineUserIds(ctx);
    const presence = await presenceOf(ctx, otherIds);
    return {
      friends: rows.filter((r) => r.status === 'accepted').map((r) => ({ id: r.id, userId: r.requesterId === me ? r.addresseeId : r.requesterId, since: r.acceptedAt })),
      incoming: rows.filter((r) => r.status === 'pending' && r.addresseeId === me).map((r) => ({ id: r.id, userId: r.requesterId, createdAt: r.createdAt })),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requesterId === me).map((r) => ({ id: r.id, userId: r.addresseeId, createdAt: r.createdAt })),
      blocked: blocks.map((b) => ({ userId: b.blockedId, createdAt: b.createdAt })),
      users: (await getPublicUsers(ctx, otherIds)).map((u) => ({ ...u, presence: online.has(u.id) ? presence[u.id] ?? 'online' : 'offline' })),
    };
  });

  app.post('/api/friends/requests', { preHandler: g.approved, config: { rateLimit: { max: 20, timeWindow: 3600_000 } } }, async (req) => {
    const me = req.authz!.id;
    const input = body(req, z.object({ userId: z.string().uuid().optional(), username: z.string().max(32).optional() }));
    let targetId = input.userId;
    if (!targetId && input.username) {
      const [u] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${input.username.toLowerCase()}`);
      targetId = u?.id;
    }
    if (!targetId) throw notFound('Usuário não encontrado');
    if (targetId === me) throw badRequest('Você não pode adicionar a si mesmo');
    await approvedTarget(targetId);
    if (await isBlockedEitherWay(ctx, me, targetId)) throw new AppError(403, 'BLOCKED', 'Não é possível enviar solicitação para este usuário');
    const prefs = await prefsOf(ctx, targetId);
    if (prefs.privacy?.allowFriendRequests === false) throw forbidden('Este usuário não aceita solicitações de amizade');
    const [existing] = await ctx.db.select().from(friendships).where(pairWhere(me, targetId));
    if (existing) {
      if (existing.status === 'accepted') throw conflict('Vocês já são amigos');
      if (existing.requesterId === me) throw conflict('Solicitação já enviada');
      // They already asked me: accept.
      await ctx.db.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(eq(friendships.id, existing.id));
      ctx.realtime.toUsers([me, targetId], 'friends:updated', {});
      return { ok: true, status: 'accepted' };
    }
    await ctx.db.insert(friendships).values({ requesterId: me, addresseeId: targetId });
    const meUser = await getPublicUser(ctx, me);
    await notify(ctx, [targetId], { type: 'friend_request', title: 'Nova solicitação de amizade', body: `${meUser?.displayName} quer ser seu amigo(a).`, link: '/app/friends', data: { userId: me } });
    ctx.realtime.toUsers([me, targetId], 'friends:updated', {});
    return { ok: true, status: 'pending' };
  });

  app.post('/api/friends/requests/:id/accept', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(friendships).where(eq(friendships.id, id));
    if (!f || f.addresseeId !== req.authz!.id || f.status !== 'pending') throw notFound();
    await ctx.db.update(friendships).set({ status: 'accepted', acceptedAt: new Date() }).where(eq(friendships.id, id));
    const meUser = await getPublicUser(ctx, req.authz!.id);
    await notify(ctx, [f.requesterId], { type: 'friend_request', title: 'Solicitação aceita', body: `${meUser?.displayName} aceitou sua amizade.`, link: '/app/friends' });
    await grantAchievement(ctx, f.requesterId, 'friendly');
    await grantAchievement(ctx, f.addresseeId, 'friendly');
    ctx.realtime.toUsers([f.requesterId, f.addresseeId], 'friends:updated', {});
    return { ok: true };
  });

  /** Rejects an incoming request, cancels an outgoing one or removes a friend. */
  app.delete('/api/friends/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [f] = await ctx.db.select().from(friendships).where(eq(friendships.id, id));
    if (!f || (f.requesterId !== req.authz!.id && f.addresseeId !== req.authz!.id)) throw notFound();
    await ctx.db.delete(friendships).where(eq(friendships.id, id));
    ctx.realtime.toUsers([f.requesterId, f.addresseeId], 'friends:updated', {});
    return { ok: true };
  });

  app.put('/api/blocks/:userId', approved, async (req) => {
    const target = uuidParam(req, 'userId');
    const me = req.authz!.id;
    if (target === me) throw badRequest('Você não pode bloquear a si mesmo');
    await ctx.db.insert(userBlocks).values({ blockerId: me, blockedId: target }).onConflictDoNothing();
    await ctx.db.delete(friendships).where(pairWhere(me, target));
    ctx.realtime.toUsers([me, target], 'friends:updated', {});
    return { ok: true };
  });

  app.delete('/api/blocks/:userId', approved, async (req) => {
    await ctx.db.delete(userBlocks).where(and(eq(userBlocks.blockerId, req.authz!.id), eq(userBlocks.blockedId, uuidParam(req, 'userId'))));
    ctx.realtime.toUser(req.authz!.id, 'friends:updated', {});
    return { ok: true };
  });

  // ── Direct messages & private groups ──
  app.get('/api/conversations', approved, async (req) => listConversations(ctx, req.authz!.id));

  app.post('/api/conversations/dm', approved, async (req) => {
    const me = req.authz!.id;
    const { userId } = body(req, z.object({ userId: z.string().uuid() }));
    if (userId === me) throw badRequest('Escolha outra pessoa');
    await approvedTarget(userId);
    if (await isBlockedEitherWay(ctx, me, userId)) throw new AppError(403, 'BLOCKED', 'Não é possível conversar com este usuário');

    const existing = await ctx.pool.query<{ id: string }>(
      `select c.id from channels c
        join channel_members a on a.channel_id = c.id and a.user_id = $1
        join channel_members b on b.channel_id = c.id and b.user_id = $2
       where c.type = 'dm' limit 1`,
      [me, userId],
    );
    if (existing.rows[0]) return { id: existing.rows[0].id };

    const prefs = await prefsOf(ctx, userId);
    const allow = prefs.privacy?.allowDms ?? 'everyone';
    if (allow === 'none' && !req.authz!.isOwner) throw forbidden('Este usuário não aceita mensagens privadas');
    if (allow === 'friends' && !req.authz!.isOwner && !(await areFriends(ctx, me, userId))) throw forbidden('Este usuário só aceita mensagens de amigos');

    const [c] = await ctx.db.insert(channels).values({ type: 'dm', name: '', createdById: me }).returning();
    await ctx.db.insert(channelMembers).values([{ channelId: c.id, userId: me }, { channelId: c.id, userId }]);
    ctx.perms.invalidateUser(me);
    ctx.perms.invalidateUser(userId);
    await ctx.realtime.resyncUser(me);
    await ctx.realtime.resyncUser(userId);
    ctx.realtime.toUsers([me, userId], 'conversations:updated', {});
    return { id: c.id };
  });

  app.post('/api/conversations/group', { preHandler: g.approved, config: { rateLimit: { max: 10, timeWindow: 3600_000 } } }, async (req) => {
    const me = req.authz!.id;
    const input = body(req, z.object({ name: z.string().trim().min(1).max(60), memberIds: z.array(z.string().uuid()).min(1).max(24) }));
    const memberIds = [...new Set(input.memberIds.filter((m) => m !== me))];
    for (const m of memberIds) {
      await approvedTarget(m);
      if (await isBlockedEitherWay(ctx, me, m)) throw new AppError(403, 'BLOCKED', 'Um dos membros escolhidos bloqueou você ou foi bloqueado');
      const prefs = await prefsOf(ctx, m);
      if (prefs.privacy?.allowDms === 'none' || (prefs.privacy?.allowDms === 'friends' && !(await areFriends(ctx, me, m)))) {
        throw forbidden('Um dos membros não aceita ser adicionado a grupos por você');
      }
    }
    const [c] = await ctx.db.insert(channels).values({ type: 'group_dm', name: input.name, createdById: me }).returning();
    await ctx.db.insert(channelMembers).values([me, ...memberIds].map((userId) => ({ channelId: c.id, userId, isManager: userId === me })));
    for (const u of [me, ...memberIds]) {
      ctx.perms.invalidateUser(u);
      await ctx.realtime.resyncUser(u);
    }
    ctx.realtime.toUsers([me, ...memberIds], 'conversations:updated', {});
    const meUser = await getPublicUser(ctx, me);
    await notify(ctx, memberIds, { type: 'invite', title: `${meUser?.displayName} adicionou você ao grupo "${input.name}"`, link: `/app/c/${c.id}` });
    return { id: c.id };
  });

  app.post('/api/conversations/:id/members', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const { userId } = body(req, z.object({ userId: z.string().uuid() }));
    const [c] = await ctx.db.select().from(channels).where(eq(channels.id, id));
    if (!c || c.type !== 'group_dm' || !req.authz!.memberships.has(id)) throw notFound();
    await approvedTarget(userId);
    if (await isBlockedEitherWay(ctx, req.authz!.id, userId)) throw new AppError(403, 'BLOCKED', 'Não é possível adicionar este usuário');
    const count = await ctx.db.select().from(channelMembers).where(eq(channelMembers.channelId, id));
    if (count.length >= 25) throw badRequest('Grupos têm no máximo 25 membros');
    await ctx.db.insert(channelMembers).values({ channelId: id, userId }).onConflictDoNothing();
    ctx.perms.invalidateUser(userId);
    await ctx.realtime.resyncUser(userId);
    const actor = await getPublicUser(ctx, req.authz!.id);
    const added = await getPublicUser(ctx, userId);
    await createMessage(ctx, { channelId: id, authorId: req.authz!.id, type: 'system', content: `${actor?.displayName} adicionou ${added?.displayName} ao grupo`, skipMentions: true });
    ctx.realtime.toUsers([...count.map((m) => m.userId), userId], 'conversations:updated', {});
    return { ok: true };
  });

  app.delete('/api/conversations/:id/members/:userId', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const userId = uuidParam(req, 'userId');
    const [c] = await ctx.db.select().from(channels).where(eq(channels.id, id));
    if (!c || c.type !== 'group_dm' || !req.authz!.memberships.has(id)) throw notFound();
    if (userId !== req.authz!.id && c.createdById !== req.authz!.id) throw forbidden('Apenas quem criou o grupo pode remover membros');
    const before = await ctx.db.select().from(channelMembers).where(eq(channelMembers.channelId, id));
    await ctx.db.delete(channelMembers).where(and(eq(channelMembers.channelId, id), eq(channelMembers.userId, userId)));
    ctx.perms.invalidateUser(userId);
    await ctx.realtime.resyncUser(userId);
    const actor = await getPublicUser(ctx, req.authz!.id);
    const removed = await getPublicUser(ctx, userId);
    if (before.length > 1) {
      await createMessage(ctx, {
        channelId: id,
        authorId: req.authz!.id,
        type: 'system',
        content: userId === req.authz!.id ? `${actor?.displayName} saiu do grupo` : `${actor?.displayName} removeu ${removed?.displayName}`,
        skipMentions: true,
      });
    }
    ctx.realtime.toUsers(before.map((m) => m.userId), 'conversations:updated', {});
    return { ok: true };
  });

  app.patch('/api/conversations/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const { name } = body(req, z.object({ name: z.string().trim().min(1).max(60) }));
    const [c] = await ctx.db.select().from(channels).where(eq(channels.id, id));
    if (!c || c.type !== 'group_dm' || !req.authz!.memberships.has(id)) throw notFound();
    await ctx.db.update(channels).set({ name }).where(eq(channels.id, id));
    const members = await ctx.db.select().from(channelMembers).where(eq(channelMembers.channelId, id));
    ctx.realtime.toUsers(members.map((m) => m.userId), 'conversations:updated', {});
    return { ok: true };
  });
}
