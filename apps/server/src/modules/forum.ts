import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forumCommentSchema, forumPostSchema, PERMISSIONS } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, query, uuidParam } from '../lib/http';
import { awardXp, grantAchievement } from '../lib/gamification';
import { notify } from '../lib/notify';
import { getPublicUsers } from '../lib/users';
import { requireChannel } from './structure';
import { files, forumComments, forumEdits, forumLikes, forumPosts, channels } from '../db/schema';

type Post = typeof forumPosts.$inferSelect;

// "Hot" score: engagement decayed by age (hours), similar in spirit to classic ranking formulas.
const HOT = sql`((${forumPosts.likeCount} * 2 + ${forumPosts.commentCount} * 3 + ln(1 + ${forumPosts.viewCount})) / power(extract(epoch from (now() - ${forumPosts.createdAt})) / 3600 + 2, 1.5))`;

export async function forumRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const approved = { preHandler: g.approved };

  async function loadPost(a: NonNullable<Awaited<ReturnType<typeof ctx.perms.getUser>>>, id: string) {
    const [p] = await ctx.db.select().from(forumPosts).where(eq(forumPosts.id, id));
    if (!p || p.deletedAt) throw notFound('Tópico não encontrado');
    const access = await requireChannel(ctx, a, p.channelId);
    return { p, ...access };
  }

  async function serializePosts(posts: Post[], viewerId: string) {
    const ids = posts.map((p) => p.id);
    const likes = ids.length
      ? await ctx.db
          .select({ targetId: forumLikes.targetId, emoji: forumLikes.emoji, n: sql<number>`count(*)::int`, me: sql<boolean>`bool_or(${forumLikes.userId} = ${viewerId})` })
          .from(forumLikes)
          .where(and(eq(forumLikes.targetType, 'post'), inArray(forumLikes.targetId, ids)))
          .groupBy(forumLikes.targetId, forumLikes.emoji)
      : [];
    const attIds = posts.flatMap((p) => p.attachmentIds);
    const att = attIds.length ? await ctx.db.select().from(files).where(and(inArray(files.id, attIds), isNull(files.deletedAt))) : [];
    return posts.map(({ search: _s, ...p }) => ({
      ...p,
      reactions: likes.filter((l) => l.targetId === p.id).map((l) => ({ emoji: l.emoji, count: l.n, me: l.me })),
      liked: likes.some((l) => l.targetId === p.id && l.emoji === '❤' && l.me),
      attachments: p.attachmentIds
        .map((id) => att.find((f) => f.id === id))
        .filter(Boolean)
        .map((f) => ({ id: f!.id, name: f!.originalName, mimeType: f!.mimeType, category: f!.category, size: f!.size, width: f!.width, height: f!.height })),
    }));
  }

  app.get('/api/channels/:id/posts', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    const { channel } = await requireChannel(ctx, req.authz!, channelId);
    if (channel.type !== 'forum') throw badRequest('Este canal não é um fórum');
    const q = query(
      req,
      z.object({
        sort: z.enum(['activity', 'new', 'top', 'hot']).default('activity'),
        tag: z.string().max(24).optional(),
        q: z.string().max(100).optional(),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      }),
    );
    const order =
      q.sort === 'new' ? [desc(forumPosts.createdAt)] : q.sort === 'top' ? [desc(forumPosts.likeCount), desc(forumPosts.commentCount)] : q.sort === 'hot' ? [desc(HOT)] : [desc(forumPosts.lastActivityAt)];
    const rows = await ctx.db
      .select()
      .from(forumPosts)
      .where(
        and(
          eq(forumPosts.channelId, channelId),
          isNull(forumPosts.deletedAt),
          q.tag ? sql`${q.tag} = any(${forumPosts.tags})` : undefined,
          q.q ? sql`${forumPosts.search} @@ plainto_tsquery('simple', ${q.q})` : undefined,
        ),
      )
      .orderBy(sql`${forumPosts.pinnedAt} is null`, ...order)
      .limit(30)
      .offset(q.offset);
    const tags = await ctx.db
      .select({ tag: sql<string>`unnest(${forumPosts.tags})`, n: sql<number>`count(*)::int` })
      .from(forumPosts)
      .where(and(eq(forumPosts.channelId, channelId), isNull(forumPosts.deletedAt)))
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`))
      .limit(30);
    return { posts: await serializePosts(rows, req.authz!.id), tags, users: await getPublicUsers(ctx, rows.map((r) => r.authorId!).filter(Boolean)) };
  });

  /** Popular discussions across every forum the viewer can see. */
  app.get('/api/forum/popular', approved, async (req) => {
    const visible = await ctx.perms.visibleChannelIds(req.authz!);
    const forumIds = (await ctx.db.select({ id: channels.id }).from(channels).where(and(eq(channels.type, 'forum'), inArray(channels.id, visible.length ? visible : ['00000000-0000-0000-0000-000000000000'])))).map((c) => c.id);
    if (!forumIds.length) return { posts: [], users: [] };
    const rows = await ctx.db
      .select()
      .from(forumPosts)
      .where(and(inArray(forumPosts.channelId, forumIds), isNull(forumPosts.deletedAt)))
      .orderBy(desc(HOT))
      .limit(30);
    return { posts: await serializePosts(rows, req.authz!.id), users: await getPublicUsers(ctx, rows.map((r) => r.authorId!).filter(Boolean)) };
  });

  app.post('/api/channels/:id/posts', { preHandler: g.approved, config: { rateLimit: { max: 10, timeWindow: 600_000 } } }, async (req) => {
    const channelId = uuidParam(req, 'id');
    const { channel, perms } = await requireChannel(ctx, req.authz!, channelId, P.CREATE_POSTS);
    if (channel.type !== 'forum') throw badRequest('Este canal não é um fórum');
    const input = body(req, forumPostSchema);
    if (input.attachmentIds.length) {
      if (!perms.has(P.ATTACH_FILES)) throw forbidden('Você não pode anexar arquivos aqui');
      const owned = await ctx.db.select().from(files).where(and(inArray(files.id, input.attachmentIds), eq(files.ownerId, req.authz!.id), isNull(files.deletedAt)));
      if (owned.length !== input.attachmentIds.length) throw badRequest('Anexo inválido');
    }
    const [p] = await ctx.db
      .insert(forumPosts)
      .values({ channelId, authorId: req.authz!.id, title: input.title, content: input.content, tags: [...new Set(input.tags.map((t) => t.toLowerCase()))], attachmentIds: input.attachmentIds })
      .returning();
    await ctx.db.update(channels).set({ lastMessageAt: new Date() }).where(eq(channels.id, channelId));
    const [s] = await serializePosts([p], req.authz!.id);
    ctx.realtime.toChannel(channelId, 'forum:post', s);
    await grantAchievement(ctx, req.authz!.id, 'first_post');
    await awardXp(ctx, req.authz!.id, 'post');
    return s;
  });

  app.get('/api/posts/:id', approved, async (req) => {
    const { p } = await loadPost(req.authz!, uuidParam(req, 'id'));
    // Count each viewer at most once per hour.
    if (await ctx.redis.set(`view:${p.id}:${req.authz!.id}`, '1', 'EX', 3600, 'NX')) {
      await ctx.db.update(forumPosts).set({ viewCount: sql`${forumPosts.viewCount} + 1` }).where(eq(forumPosts.id, p.id));
    }
    const comments = await ctx.db.select().from(forumComments).where(eq(forumComments.postId, p.id)).orderBy(asc(forumComments.createdAt));
    const ids = comments.map((c) => c.id);
    const likes = ids.length
      ? await ctx.db
          .select({ targetId: forumLikes.targetId, n: sql<number>`count(*)::int`, me: sql<boolean>`bool_or(${forumLikes.userId} = ${req.authz!.id})` })
          .from(forumLikes)
          .where(and(eq(forumLikes.targetType, 'comment'), inArray(forumLikes.targetId, ids)))
          .groupBy(forumLikes.targetId)
      : [];
    const [post] = await serializePosts([p], req.authz!.id);
    return {
      post,
      comments: comments.map((c) => ({ ...c, content: c.deletedAt ? '' : c.content, likes: likes.find((l) => l.targetId === c.id)?.n ?? 0, liked: !!likes.find((l) => l.targetId === c.id)?.me })),
      users: await getPublicUsers(ctx, [p.authorId!, ...comments.map((c) => c.authorId!)].filter(Boolean)),
    };
  });

  app.patch('/api/posts/:id', approved, async (req) => {
    const { p, perms } = await loadPost(req.authz!, uuidParam(req, 'id'));
    const input = body(req, forumPostSchema.partial().extend({ pinned: z.boolean().optional(), locked: z.boolean().optional() }));
    const isAuthor = p.authorId === req.authz!.id;
    const isMod = perms.has(P.MANAGE_MESSAGES);
    if ((input.pinned !== undefined || input.locked !== undefined) && !isMod) throw forbidden();
    if ((input.title || input.content || input.tags) && !isAuthor && !isMod) throw forbidden();
    if (input.title || input.content) {
      await ctx.db.insert(forumEdits).values({ targetType: 'post', targetId: p.id, previousTitle: p.title, previousContent: p.content, editedById: req.authz!.id });
    }
    const [u] = await ctx.db
      .update(forumPosts)
      .set({
        title: input.title,
        content: input.content,
        tags: input.tags ? [...new Set(input.tags.map((t) => t.toLowerCase()))] : undefined,
        editedAt: input.title || input.content ? new Date() : undefined,
        pinnedAt: input.pinned === undefined ? undefined : input.pinned ? new Date() : null,
        lockedAt: input.locked === undefined ? undefined : input.locked ? new Date() : null,
      })
      .where(eq(forumPosts.id, p.id))
      .returning();
    if (!isAuthor) await audit(ctx, { actorId: req.authz!.id, action: 'forum.post_moderate', targetType: 'forum_post', targetId: p.id, ip: req.ip, metadata: input });
    const [s] = await serializePosts([u], req.authz!.id);
    ctx.realtime.toChannel(p.channelId, 'forum:post-updated', s);
    return s;
  });

  app.delete('/api/posts/:id', approved, async (req) => {
    const { p, perms } = await loadPost(req.authz!, uuidParam(req, 'id'));
    if (p.authorId !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    await ctx.db.update(forumPosts).set({ deletedAt: new Date() }).where(eq(forumPosts.id, p.id));
    if (p.authorId !== req.authz!.id) await audit(ctx, { actorId: req.authz!.id, action: 'forum.post_delete', targetType: 'forum_post', targetId: p.id, ip: req.ip, metadata: { title: p.title, authorId: p.authorId } });
    ctx.realtime.toChannel(p.channelId, 'forum:post-deleted', { id: p.id, channelId: p.channelId });
    return { ok: true };
  });

  app.get('/api/posts/:id/edits', approved, async (req) => {
    const { p } = await loadPost(req.authz!, uuidParam(req, 'id'));
    return ctx.db.select().from(forumEdits).where(and(eq(forumEdits.targetType, 'post'), eq(forumEdits.targetId, p.id))).orderBy(desc(forumEdits.editedAt));
  });

  app.put('/api/posts/:id/reactions/:emoji', approved, async (req) => {
    const { p, perms } = await loadPost(req.authz!, uuidParam(req, 'id'));
    if (!perms.has(P.ADD_REACTIONS)) throw forbidden();
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji).slice(0, 16);
    const inserted = await ctx.db.insert(forumLikes).values({ targetType: 'post', targetId: p.id, userId: req.authz!.id, emoji }).onConflictDoNothing().returning();
    if (inserted.length && emoji === '❤') await ctx.db.update(forumPosts).set({ likeCount: sql`${forumPosts.likeCount} + 1` }).where(eq(forumPosts.id, p.id));
    const [s] = await serializePosts([{ ...p, likeCount: p.likeCount + (inserted.length && emoji === '❤' ? 1 : 0) }], req.authz!.id);
    ctx.realtime.toChannel(p.channelId, 'forum:post-updated', { ...s, liked: undefined });
    return s;
  });

  app.delete('/api/posts/:id/reactions/:emoji', approved, async (req) => {
    const { p } = await loadPost(req.authz!, uuidParam(req, 'id'));
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji).slice(0, 16);
    const removed = await ctx.db
      .delete(forumLikes)
      .where(and(eq(forumLikes.targetType, 'post'), eq(forumLikes.targetId, p.id), eq(forumLikes.userId, req.authz!.id), eq(forumLikes.emoji, emoji)))
      .returning();
    if (removed.length && emoji === '❤') await ctx.db.update(forumPosts).set({ likeCount: sql`greatest(${forumPosts.likeCount} - 1, 0)` }).where(eq(forumPosts.id, p.id));
    const [s] = await serializePosts([{ ...p, likeCount: Math.max(0, p.likeCount - (removed.length && emoji === '❤' ? 1 : 0)) }], req.authz!.id);
    ctx.realtime.toChannel(p.channelId, 'forum:post-updated', { ...s, liked: undefined });
    return s;
  });

  app.post('/api/posts/:id/comments', { preHandler: g.approved, config: { rateLimit: { max: 20, timeWindow: 60_000 } } }, async (req) => {
    const { p, perms } = await loadPost(req.authz!, uuidParam(req, 'id'));
    if (!perms.has(P.REPLY_MESSAGES)) throw forbidden();
    if (p.lockedAt && !perms.has(P.MANAGE_MESSAGES)) throw badRequest('Este tópico está trancado');
    const input = body(req, forumCommentSchema);
    if (input.parentId) {
      const [parent] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, input.parentId));
      if (!parent || parent.postId !== p.id) throw badRequest('Comentário pai inválido');
    }
    const [c] = await ctx.db.insert(forumComments).values({ postId: p.id, authorId: req.authz!.id, content: input.content, parentId: input.parentId ?? null }).returning();
    await ctx.db.update(forumPosts).set({ commentCount: sql`${forumPosts.commentCount} + 1`, lastActivityAt: new Date() }).where(eq(forumPosts.id, p.id));
    ctx.realtime.toChannel(p.channelId, 'forum:comment', { ...c, likes: 0, liked: false });
    if (p.authorId && p.authorId !== req.authz!.id) {
      const [me] = await getPublicUsers(ctx, [req.authz!.id]);
      await notify(ctx, [p.authorId], { type: 'message', title: `${me.displayName} comentou em "${p.title}"`, body: input.content.slice(0, 140), link: `/app/c/${p.channelId}?post=${p.id}` });
    }
    await awardXp(ctx, req.authz!.id, 'message');
    return c;
  });

  app.patch('/api/comments/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, id));
    if (!c || c.deletedAt) throw notFound();
    const { p, perms } = await loadPost(req.authz!, c.postId);
    if (c.authorId !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    const { content } = body(req, z.object({ content: z.string().trim().min(1).max(8000) }));
    await ctx.db.insert(forumEdits).values({ targetType: 'comment', targetId: id, previousContent: c.content, editedById: req.authz!.id });
    const [u] = await ctx.db.update(forumComments).set({ content, editedAt: new Date() }).where(eq(forumComments.id, id)).returning();
    ctx.realtime.toChannel(p.channelId, 'forum:comment-updated', u);
    return u;
  });

  app.delete('/api/comments/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, id));
    if (!c || c.deletedAt) throw notFound();
    const { p, perms } = await loadPost(req.authz!, c.postId);
    if (c.authorId !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    const [u] = await ctx.db.update(forumComments).set({ deletedAt: new Date(), content: '' }).where(eq(forumComments.id, id)).returning();
    if (c.authorId !== req.authz!.id) await audit(ctx, { actorId: req.authz!.id, action: 'forum.comment_delete', targetType: 'forum_comment', targetId: id, ip: req.ip, metadata: { authorId: c.authorId, content: c.content.slice(0, 500) } });
    ctx.realtime.toChannel(p.channelId, 'forum:comment-updated', u);
    return { ok: true };
  });

  app.put('/api/comments/:id/like', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, id));
    if (!c || c.deletedAt) throw notFound();
    const { perms } = await loadPost(req.authz!, c.postId);
    if (!perms.has(P.ADD_REACTIONS)) throw forbidden();
    const ins = await ctx.db.insert(forumLikes).values({ targetType: 'comment', targetId: id, userId: req.authz!.id }).onConflictDoNothing().returning();
    if (ins.length) await ctx.db.update(forumComments).set({ likeCount: sql`${forumComments.likeCount} + 1` }).where(eq(forumComments.id, id));
    return { ok: true };
  });

  app.delete('/api/comments/:id/like', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [c] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, id));
    if (!c) throw notFound();
    await loadPost(req.authz!, c.postId);
    const del = await ctx.db.delete(forumLikes).where(and(eq(forumLikes.targetType, 'comment'), eq(forumLikes.targetId, id), eq(forumLikes.userId, req.authz!.id))).returning();
    if (del.length) await ctx.db.update(forumComments).set({ likeCount: sql`greatest(${forumComments.likeCount} - 1, 0)` }).where(eq(forumComments.id, id));
    return { ok: true };
  });
}
