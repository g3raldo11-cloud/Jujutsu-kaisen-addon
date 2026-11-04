import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { editMessageSchema, messageSchema, PERMISSIONS } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { AppError, badRequest, forbidden, notFound, tooMany } from '../lib/errors';
import { bigintParam, body, query, uuidParam } from '../lib/http';
import { notify } from '../lib/notify';
import type { UserAuthz } from '../lib/permissions';
import { getPublicUsers } from '../lib/users';
import { awardXp } from '../lib/gamification';
import { requireChannel } from './structure';
import { loadBots } from '../bots/runtime';
import { preModerate } from '../bots/builtin';
import {
  channelMembers,
  channels,
  channelUserStates,
  files,
  messageAttachments,
  messageEdits,
  messages,
  pollVotes,
  polls,
  reactions,
  scheduledMessages,
  threads,
  userBlocks,
  userProfiles,
  users,
} from '../db/schema';

type MessageRow = typeof messages.$inferSelect;

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣#*0-9]|\p{Emoji_Modifier}){1,16}$|^:[a-z0-9_]{2,32}:$/u;

/** Hydrates messages with attachments, reactions, reply previews, thread info and polls. */
export async function hydrateMessages(ctx: AppContext, rows: MessageRow[], viewerId: string) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const att = await ctx.db
    .select({ messageId: messageAttachments.messageId, file: files })
    .from(messageAttachments)
    .innerJoin(files, eq(files.id, messageAttachments.fileId))
    .where(and(inArray(messageAttachments.messageId, ids), isNull(files.deletedAt)))
    .orderBy(asc(messageAttachments.position));
  const rx = await ctx.db
    .select({
      messageId: reactions.messageId,
      emoji: reactions.emoji,
      count: sql<number>`count(*)::int`,
      me: sql<boolean>`bool_or(${reactions.userId} = ${viewerId})`,
      userIds: sql<string[]>`(array_agg(${reactions.userId} order by ${reactions.createdAt}))[1:10]`,
    })
    .from(reactions)
    .where(inArray(reactions.messageId, ids))
    .groupBy(reactions.messageId, reactions.emoji);
  const replyIds = rows.map((r) => r.replyToId).filter((x): x is bigint => x !== null);
  const replies = replyIds.length ? await ctx.db.select().from(messages).where(inArray(messages.id, replyIds)) : [];
  const thr = await ctx.db.select().from(threads).where(inArray(threads.rootMessageId, ids));
  const pollRows = await ctx.db.select().from(polls).where(inArray(polls.messageId, ids));
  const votes = pollRows.length
    ? await ctx.db.select().from(pollVotes).where(inArray(pollVotes.pollId, pollRows.map((p) => p.id)))
    : [];

  return rows.map((m) => {
    const deleted = !!m.deletedAt;
    const reply = m.replyToId ? replies.find((r) => r.id === m.replyToId) : null;
    const poll = pollRows.find((p) => p.messageId === m.id);
    return {
      id: m.id.toString(),
      channelId: m.channelId,
      threadId: m.threadId,
      authorId: m.authorId,
      type: m.type,
      content: deleted ? '' : m.content,
      deleted,
      replyTo: reply
        ? { id: reply.id.toString(), authorId: reply.authorId, content: reply.deletedAt ? '' : reply.content.slice(0, 200), deleted: !!reply.deletedAt }
        : m.replyToId
          ? { id: m.replyToId.toString(), authorId: null, content: '', deleted: true }
          : null,
      mentionIds: m.mentionIds,
      mentionsEveryone: m.mentionsEveryone,
      metadata: deleted ? {} : m.metadata,
      editedAt: m.editedAt,
      pinnedAt: m.pinnedAt,
      createdAt: m.createdAt,
      attachments: deleted
        ? []
        : att
            .filter((x) => x.messageId === m.id)
            .map(({ file: f }) => ({ id: f.id, name: f.originalName, mimeType: f.mimeType, category: f.category, size: f.size, width: f.width, height: f.height })),
      reactions: deleted ? [] : rx.filter((r) => r.messageId === m.id).map(({ messageId: _m, ...r }) => r),
      thread: (() => {
        const t = thr.find((x) => x.rootMessageId === m.id);
        return t ? { id: t.id, title: t.title, messageCount: t.messageCount, lastMessageAt: t.lastMessageAt } : null;
      })(),
      poll: poll
        ? {
            id: poll.id,
            question: poll.question,
            options: (poll.options as { id: string; label: string }[]).map((o) => ({
              ...o,
              votes: votes.filter((v) => v.pollId === poll.id && v.optionId === o.id).length,
              voters: poll.anonymous ? [] : votes.filter((v) => v.pollId === poll.id && v.optionId === o.id).map((v) => v.userId).slice(0, 20),
            })),
            myVotes: votes.filter((v) => v.pollId === poll.id && v.userId === viewerId).map((v) => v.optionId),
            totalVoters: new Set(votes.filter((v) => v.pollId === poll.id).map((v) => v.userId)).size,
            multiple: poll.multiple,
            anonymous: poll.anonymous,
            closesAt: poll.closesAt,
            closed: !!poll.closedAt || (!!poll.closesAt && poll.closesAt.getTime() < Date.now()),
          }
        : null,
    };
  });
}

export type HydratedMessage = Awaited<ReturnType<typeof hydrateMessages>>[number];

/** Extracts @mentions; returns ids of mentioned approved members and whether @todos/@everyone was used. */
async function resolveMentions(ctx: AppContext, content: string) {
  const names = [...content.matchAll(/(?:^|[^\w@])@([a-zA-Z0-9_.]{3,32})/g)].map((m) => m[1].toLowerCase());
  const everyone = names.some((n) => n === 'todos' || n === 'everyone' || n === 'here' || n === 'aqui');
  const lookup = [...new Set(names.filter((n) => !['todos', 'everyone', 'here', 'aqui'].includes(n)))].slice(0, 50);
  const found = lookup.length
    ? await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(sql`lower(${users.username})`, lookup), eq(users.status, 'approved')))
    : [];
  return { ids: found.map((f) => f.id), everyone };
}

export interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  type?: string;
  replyToId?: bigint | null;
  threadId?: string | null;
  attachmentIds?: string[];
  metadata?: Record<string, unknown>;
  skipMentions?: boolean;
}

/** Inserts a message and fans it out (realtime, notifications, bots). Permission checks are the caller's job. */
export async function createMessage(ctx: AppContext, input: CreateMessageInput) {
  const mentions = input.skipMentions ? { ids: [], everyone: false } : await resolveMentions(ctx, input.content);
  const [ch] = await ctx.db.select().from(channels).where(eq(channels.id, input.channelId));
  const row = await ctx.db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({
        channelId: input.channelId,
        threadId: input.threadId ?? null,
        authorId: input.authorId,
        type: input.type ?? 'default',
        content: input.content,
        replyToId: input.replyToId ?? null,
        mentionIds: mentions.ids,
        mentionsEveryone: mentions.everyone,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (input.attachmentIds?.length) {
      await tx.insert(messageAttachments).values(input.attachmentIds.map((fileId, position) => ({ messageId: m.id, fileId, position })));
      await tx.update(files).set({ channelId: input.channelId }).where(inArray(files.id, input.attachmentIds));
    }
    await tx.update(channels).set({ lastMessageAt: m.createdAt }).where(eq(channels.id, input.channelId));
    if (input.threadId) {
      await tx
        .update(threads)
        .set({ messageCount: sql`${threads.messageCount} + 1`, lastMessageAt: m.createdAt })
        .where(eq(threads.id, input.threadId));
    }
    return m;
  });
  const [hydrated] = await hydrateMessages(ctx, [row], input.authorId);
  ctx.realtime.toChannel(input.channelId, 'message:new', hydrated);
  ctx.bus.emit('message.created', { message: hydrated, channel: ch });

  // Notifications: mentions, replies and private conversations.
  const author = (await getPublicUsers(ctx, [input.authorId]))[0];
  const notifyIds = new Set<string>(mentions.ids);
  if (row.replyToId) {
    const [orig] = await ctx.db.select({ authorId: messages.authorId }).from(messages).where(eq(messages.id, row.replyToId));
    if (orig?.authorId) notifyIds.add(orig.authorId);
  }
  if (ch && (ch.type === 'dm' || ch.type === 'group_dm' || ch.type === 'ticket')) {
    const members = await ctx.db.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, ch.id));
    for (const m of members) notifyIds.add(m.userId);
  }
  notifyIds.delete(input.authorId);
  if (notifyIds.size && author) {
    const states = await ctx.db
      .select()
      .from(channelUserStates)
      .where(and(eq(channelUserStates.channelId, input.channelId), inArray(channelUserStates.userId, [...notifyIds])));
    const blocks = await ctx.db
      .select()
      .from(userBlocks)
      .where(and(eq(userBlocks.blockedId, input.authorId), inArray(userBlocks.blockerId, [...notifyIds])));
    const recipients = [...notifyIds].filter((id) => {
      const st = states.find((s) => s.userId === id);
      if (blocks.some((b) => b.blockerId === id)) return false;
      if (st?.mutedUntil && st.mutedUntil.getTime() > Date.now()) return false;
      if (st?.notificationLevel === 'none') return false;
      return true;
    });
    const isDm = ch?.type === 'dm' || ch?.type === 'group_dm';
    const preview = input.content.slice(0, 140) || (input.attachmentIds?.length ? '📎 Anexo' : '');
    const where = isDm ? 'mensagem privada' : `#${ch?.name ?? ''}`;
    const link = `/app/c/${input.channelId}${input.threadId ? `?thread=${input.threadId}` : ''}#m${row.id}`;
    const mentioned = recipients.filter((r) => mentions.ids.includes(r));
    const others = recipients.filter((r) => !mentions.ids.includes(r));
    if (mentioned.length) await notify(ctx, mentioned, { type: 'mention', title: `${author.displayName} mencionou você em ${where}`, body: preview, link, data: { channelId: input.channelId, messageId: row.id.toString() } });
    if (others.length) await notify(ctx, others, { type: 'message', title: `${author.displayName} em ${where}`, body: preview, link, data: { channelId: input.channelId, messageId: row.id.toString() } });
  }
  return hydrated;
}

async function checkSlowmode(ctx: AppContext, a: UserAuthz, channelId: string, seconds: number, canBypass: boolean) {
  if (!seconds || canBypass) return;
  const key = `slow:${channelId}:${a.id}`;
  const ok = await ctx.redis.set(key, '1', 'EX', seconds, 'NX');
  if (!ok) throw tooMany(`Modo lento ativo: aguarde ${await ctx.redis.ttl(key)}s`, 'SLOWMODE');
}

export async function messageRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const approved = { preHandler: g.approved };

  async function loadMessage(a: UserAuthz, id: bigint) {
    const [m] = await ctx.db.select().from(messages).where(eq(messages.id, id));
    if (!m) throw notFound('Mensagem não encontrada');
    const access = await requireChannel(ctx, a, m.channelId);
    return { m, ...access };
  }

  app.get('/api/channels/:id/messages', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const q = query(
      req,
      z.object({
        before: z.string().regex(/^\d+$/).optional(),
        after: z.string().regex(/^\d+$/).optional(),
        around: z.string().regex(/^\d+$/).optional(),
        threadId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    );
    const scope = and(eq(messages.channelId, channelId), q.threadId ? eq(messages.threadId, q.threadId) : isNull(messages.threadId));
    let rows: MessageRow[];
    if (q.around) {
      const pivot = BigInt(q.around);
      const half = Math.floor(q.limit / 2);
      const older = await ctx.db.select().from(messages).where(and(scope, lt(messages.id, pivot))).orderBy(desc(messages.id)).limit(half);
      const newer = await ctx.db.select().from(messages).where(and(scope, sql`${messages.id} >= ${pivot}`)).orderBy(asc(messages.id)).limit(q.limit - half);
      rows = [...older.reverse(), ...newer];
    } else if (q.after) {
      rows = await ctx.db.select().from(messages).where(and(scope, gt(messages.id, BigInt(q.after)))).orderBy(asc(messages.id)).limit(q.limit);
    } else {
      rows = (
        await ctx.db
          .select()
          .from(messages)
          .where(and(scope, q.before ? lt(messages.id, BigInt(q.before)) : undefined))
          .orderBy(desc(messages.id))
          .limit(q.limit)
      ).reverse();
    }
    const hydrated = await hydrateMessages(ctx, rows, req.authz!.id);
    const authorIds = new Set<string>();
    for (const m of hydrated) {
      if (m.authorId) authorIds.add(m.authorId);
      if (m.replyTo?.authorId) authorIds.add(m.replyTo.authorId);
    }
    return { messages: hydrated, users: await getPublicUsers(ctx, [...authorIds]) };
  });

  app.post('/api/channels/:id/messages', { preHandler: g.approved, config: { rateLimit: { max: 30, timeWindow: 10_000 } } }, async (req, reply) => {
    const channelId = uuidParam(req, 'id');
    const a = req.authz!;
    const input = body(req, messageSchema);
    const { channel, perms } = await requireChannel(ctx, a, channelId, P.SEND_MESSAGES);
    const content = input.content.trim();
    if (!content && !input.attachmentIds.length && !input.stickerId && !input.gifUrl) throw badRequest('Mensagem vazia');
    if (input.attachmentIds.length && !perms.has(P.ATTACH_FILES)) throw forbidden('Você não pode anexar arquivos aqui');
    if ((input.replyToId || input.threadId) && !perms.has(P.REPLY_MESSAGES)) throw forbidden('Você não pode responder aqui');
    if (/(^|\s)@(todos|everyone|here|aqui)\b/i.test(content) && !perms.has(P.MENTION_EVERYONE)) {
      throw forbidden('Você não pode mencionar todos neste canal');
    }
    if (channel.type === 'dm') await assertDmAllowed(ctx, a.id, channelId);
    if (channel.type === 'ticket' && (channel.settings as { closed?: boolean })?.closed && !perms.has(P.MANAGE_MESSAGES)) {
      throw forbidden('Este ticket está fechado');
    }
    if (!perms.has(P.MANAGE_MESSAGES) && content) {
      const mod = (await loadBots(ctx)).find((b) => b.kind === 'moderation' && b.enabled);
      const reason = mod ? await preModerate(ctx, content) : null;
      if (reason) throw badRequest(reason, 'BLOCKED_CONTENT');
    }

    const s = await ctx.settings.get();
    const mentionCount = (content.match(/@[a-zA-Z0-9_.]{3,32}/g) ?? []).length;
    if (mentionCount > s.moderation.maxMentionsPerMessage && !perms.has(P.MANAGE_MESSAGES)) throw badRequest('Menções demais em uma mensagem', 'TOO_MANY_MENTIONS');
    await checkSlowmode(ctx, a, channelId, channel.slowmodeSeconds, perms.has(P.MANAGE_MESSAGES));

    if (input.attachmentIds.length) {
      const owned = await ctx.db
        .select({ id: files.id })
        .from(files)
        .where(and(inArray(files.id, input.attachmentIds), eq(files.ownerId, a.id), isNull(files.deletedAt)));
      if (owned.length !== new Set(input.attachmentIds).size) throw badRequest('Anexo inválido');
      const used = await ctx.db.select({ id: messageAttachments.fileId }).from(messageAttachments).where(inArray(messageAttachments.fileId, input.attachmentIds));
      if (used.length) throw badRequest('Anexo já utilizado');
    }
    if (input.replyToId) {
      const [r] = await ctx.db.select({ channelId: messages.channelId }).from(messages).where(eq(messages.id, BigInt(input.replyToId)));
      if (!r || r.channelId !== channelId) throw badRequest('Mensagem respondida não pertence a este canal');
    }
    if (input.threadId) {
      const [t] = await ctx.db.select().from(threads).where(eq(threads.id, input.threadId));
      if (!t || t.channelId !== channelId) throw badRequest('Thread inválida');
      if (t.archivedAt) throw badRequest('Esta thread está arquivada');
    }

    if (input.scheduledFor) {
      const when = new Date(input.scheduledFor);
      if (when.getTime() < Date.now() + 30_000) throw badRequest('Agende para pelo menos 1 minuto no futuro');
      if (when.getTime() > Date.now() + 365 * 86400_000) throw badRequest('Agendamento muito distante');
      if (input.attachmentIds.length) throw badRequest('Mensagens agendadas não aceitam anexos');
      const [sm] = await ctx.db.insert(scheduledMessages).values({ channelId, authorId: a.id, content, sendAt: when }).returning();
      return reply.code(202).send({ scheduled: sm });
    }

    const metadata: Record<string, unknown> = {};
    if (input.stickerId) metadata.stickerId = input.stickerId;
    if (input.gifUrl) {
      if (!/^https:\/\/media\.tenor\.com\//.test(input.gifUrl)) throw badRequest('GIF de origem não permitida');
      metadata.gifUrl = input.gifUrl;
    }
    if (input.nonce) metadata.nonce = input.nonce;

    const msg = await createMessage(ctx, {
      channelId,
      authorId: a.id,
      content,
      type: input.isVoiceMessage ? 'voice' : 'default',
      replyToId: input.replyToId ? BigInt(input.replyToId) : null,
      threadId: input.threadId ?? null,
      attachmentIds: input.attachmentIds,
      metadata,
    });
    await ctx.db
      .insert(channelUserStates)
      .values({ channelId, userId: a.id, lastReadMessageId: BigInt(msg.id), lastReadAt: new Date() })
      .onConflictDoUpdate({ target: [channelUserStates.channelId, channelUserStates.userId], set: { lastReadMessageId: BigInt(msg.id), lastReadAt: new Date() } });
    await awardXp(ctx, a.id, 'message');
    return reply.code(201).send(msg);
  });

  app.patch('/api/messages/:id', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { content } = body(req, editMessageSchema);
    const { m, perms } = await loadMessage(req.authz!, id);
    if (m.deletedAt) throw notFound('Mensagem não encontrada');
    const isAuthor = m.authorId === req.authz!.id;
    // Moderators may edit other people's messages per moderation policy; every such edit is audited.
    if (!isAuthor && !perms.has(P.MANAGE_MESSAGES)) throw forbidden('Você só pode editar suas próprias mensagens');
    if (m.type === 'system' || m.type === 'poll') throw badRequest('Esta mensagem não pode ser editada');
    const mentions = await resolveMentions(ctx, content);
    await ctx.db.insert(messageEdits).values({ messageId: id, previousContent: m.content, editedById: req.authz!.id });
    const [u] = await ctx.db
      .update(messages)
      .set({ content, editedAt: new Date(), mentionIds: mentions.ids, mentionsEveryone: mentions.everyone && perms.has(P.MENTION_EVERYONE) })
      .where(eq(messages.id, id))
      .returning();
    if (!isAuthor) await audit(ctx, { actorId: req.authz!.id, action: 'message.edit', targetType: 'message', targetId: id.toString(), ip: req.ip, metadata: { channelId: m.channelId, authorId: m.authorId, before: m.content.slice(0, 500) } });
    const [h] = await hydrateMessages(ctx, [u], req.authz!.id);
    ctx.realtime.toChannel(m.channelId, 'message:updated', h);
    return h;
  });

  app.get('/api/messages/:id/edits', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { m, perms } = await loadMessage(req.authz!, id);
    if (m.authorId !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    return ctx.db.select().from(messageEdits).where(eq(messageEdits.messageId, id)).orderBy(desc(messageEdits.editedAt));
  });

  app.delete('/api/messages/:id', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { m, perms } = await loadMessage(req.authz!, id);
    if (m.deletedAt) return { ok: true };
    const isAuthor = m.authorId === req.authz!.id;
    if (!isAuthor && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    await deleteMessage(ctx, m, req.authz!.id, { audit: !isAuthor, ip: req.ip });
    return { ok: true };
  });

  app.put('/api/messages/:id/reactions/:emoji', { preHandler: g.approved, config: { rateLimit: { max: 60, timeWindow: 10_000 } } }, async (req) => {
    const id = bigintParam(req, 'id');
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji);
    if (!EMOJI_RE.test(emoji)) throw badRequest('Emoji inválido');
    const { m, perms } = await loadMessage(req.authz!, id);
    if (!perms.has(P.ADD_REACTIONS)) throw forbidden();
    if (m.deletedAt) throw notFound();
    const distinct = await ctx.db.select({ e: reactions.emoji }).from(reactions).where(eq(reactions.messageId, id)).groupBy(reactions.emoji);
    if (distinct.length >= 20 && !distinct.some((d) => d.e === emoji)) throw badRequest('Limite de reações diferentes atingido');
    await ctx.db.insert(reactions).values({ messageId: id, userId: req.authz!.id, emoji }).onConflictDoNothing();
    ctx.realtime.toChannel(m.channelId, 'reaction:add', { messageId: id.toString(), channelId: m.channelId, emoji, userId: req.authz!.id });
    return { ok: true };
  });

  app.delete('/api/messages/:id/reactions/:emoji', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const emoji = decodeURIComponent((req.params as { emoji: string }).emoji);
    const { m } = await loadMessage(req.authz!, id);
    await ctx.db.delete(reactions).where(and(eq(reactions.messageId, id), eq(reactions.userId, req.authz!.id), eq(reactions.emoji, emoji)));
    ctx.realtime.toChannel(m.channelId, 'reaction:remove', { messageId: id.toString(), channelId: m.channelId, emoji, userId: req.authz!.id });
    return { ok: true };
  });

  app.put('/api/messages/:id/pin', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { m, perms, channel } = await loadMessage(req.authz!, id);
    const isDm = channel.type === 'dm' || channel.type === 'group_dm';
    if (!perms.has(P.MANAGE_MESSAGES) && !isDm) throw forbidden();
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.channelId, m.channelId), isNotNull(messages.pinnedAt)));
    if (n >= 50) throw badRequest('Limite de 50 mensagens fixadas por canal');
    const [u] = await ctx.db.update(messages).set({ pinnedAt: new Date(), pinnedById: req.authz!.id }).where(eq(messages.id, id)).returning();
    const [h] = await hydrateMessages(ctx, [u], req.authz!.id);
    ctx.realtime.toChannel(m.channelId, 'message:updated', h);
    if (!isDm) await audit(ctx, { actorId: req.authz!.id, action: 'message.pin', targetType: 'message', targetId: id.toString(), ip: req.ip, metadata: { channelId: m.channelId } });
    return h;
  });

  app.delete('/api/messages/:id/pin', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { m, perms, channel } = await loadMessage(req.authz!, id);
    if (!perms.has(P.MANAGE_MESSAGES) && channel.type !== 'dm' && channel.type !== 'group_dm') throw forbidden();
    const [u] = await ctx.db.update(messages).set({ pinnedAt: null, pinnedById: null }).where(eq(messages.id, id)).returning();
    const [h] = await hydrateMessages(ctx, [u], req.authz!.id);
    ctx.realtime.toChannel(m.channelId, 'message:updated', h);
    return h;
  });

  app.get('/api/channels/:id/pins', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const rows = await ctx.db
      .select()
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt), isNull(messages.deletedAt)))
      .orderBy(desc(messages.pinnedAt));
    const hydrated = await hydrateMessages(ctx, rows, req.authz!.id);
    return { messages: hydrated, users: await getPublicUsers(ctx, hydrated.map((m) => m.authorId!).filter(Boolean)) };
  });

  // ── Read state & receipts ──
  app.post('/api/channels/:id/read', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    const { messageId } = body(req, z.object({ messageId: z.string().regex(/^\d+$/) }));
    await requireChannel(ctx, req.authz!, channelId);
    const mid = BigInt(messageId);
    await ctx.db
      .insert(channelUserStates)
      .values({ channelId, userId: req.authz!.id, lastReadMessageId: mid, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [channelUserStates.channelId, channelUserStates.userId],
        set: { lastReadMessageId: sql`greatest(coalesce(${channelUserStates.lastReadMessageId}, 0), ${mid})`, lastReadAt: new Date() },
      });
    // Opt-in read receipts: only shared when the reader enabled them.
    const [p] = await ctx.db.select({ prefs: userProfiles.preferences }).from(userProfiles).where(eq(userProfiles.userId, req.authz!.id));
    if ((p?.prefs as { privacy?: { readReceipts?: boolean } })?.privacy?.readReceipts) {
      ctx.realtime.toChannel(channelId, 'read:receipt', { channelId, userId: req.authz!.id, messageId });
    }
    return { ok: true };
  });

  app.get('/api/channels/:id/receipts', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    const rows = await ctx.db
      .select({ userId: channelUserStates.userId, messageId: channelUserStates.lastReadMessageId, prefs: userProfiles.preferences })
      .from(channelUserStates)
      .innerJoin(userProfiles, eq(userProfiles.userId, channelUserStates.userId))
      .where(and(eq(channelUserStates.channelId, channelId), isNotNull(channelUserStates.lastReadMessageId)));
    return rows
      .filter((r) => (r.prefs as { privacy?: { readReceipts?: boolean } })?.privacy?.readReceipts)
      .map((r) => ({ userId: r.userId, messageId: r.messageId?.toString() }));
  });

  // ── Threads ──
  app.post('/api/messages/:id/thread', approved, async (req) => {
    const id = bigintParam(req, 'id');
    const { title } = body(req, z.object({ title: z.string().trim().min(1).max(100).optional() }));
    const { m, perms } = await loadMessage(req.authz!, id);
    if (!perms.has(P.REPLY_MESSAGES)) throw forbidden();
    if (m.threadId) throw badRequest('Não é possível criar thread dentro de outra thread');
    const [existing] = await ctx.db.select().from(threads).where(eq(threads.rootMessageId, id));
    if (existing) return existing;
    const [t] = await ctx.db
      .insert(threads)
      .values({ channelId: m.channelId, rootMessageId: id, title: title ?? (m.content.slice(0, 60) || 'Thread'), createdById: req.authz!.id })
      .returning();
    const [h] = await hydrateMessages(ctx, [m], req.authz!.id);
    ctx.realtime.toChannel(m.channelId, 'message:updated', h);
    return t;
  });

  app.get('/api/threads/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [t] = await ctx.db.select().from(threads).where(eq(threads.id, id));
    if (!t) throw notFound();
    await requireChannel(ctx, req.authz!, t.channelId);
    const [root] = await ctx.db.select().from(messages).where(eq(messages.id, t.rootMessageId));
    const hydrated = root ? await hydrateMessages(ctx, [root], req.authz!.id) : [];
    return { thread: t, root: hydrated[0] ?? null, users: await getPublicUsers(ctx, root?.authorId ? [root.authorId] : []) };
  });

  app.get('/api/channels/:id/threads', approved, async (req) => {
    const channelId = uuidParam(req, 'id');
    await requireChannel(ctx, req.authz!, channelId);
    return ctx.db.select().from(threads).where(eq(threads.channelId, channelId)).orderBy(desc(threads.lastMessageAt)).limit(100);
  });

  // ── Polls ──
  app.post('/api/channels/:id/polls', approved, async (req, reply) => {
    const channelId = uuidParam(req, 'id');
    const input = body(
      req,
      z.object({
        question: z.string().trim().min(1).max(300),
        options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
        multiple: z.boolean().default(false),
        anonymous: z.boolean().default(false),
        durationHours: z.number().min(0).max(24 * 30).default(0),
      }),
    );
    await requireChannel(ctx, req.authz!, channelId, P.SEND_MESSAGES);
    const msg = await createPoll(ctx, channelId, req.authz!.id, input);
    return reply.code(201).send(msg);
  });

  app.post('/api/polls/:id/vote', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const { optionIds } = body(req, z.object({ optionIds: z.array(z.string().max(20)).max(10) }));
    const [p] = await ctx.db.select().from(polls).where(eq(polls.id, id));
    if (!p) throw notFound();
    await requireChannel(ctx, req.authz!, p.channelId);
    if (p.closedAt || (p.closesAt && p.closesAt.getTime() < Date.now())) throw badRequest('Votação encerrada');
    const valid = (p.options as { id: string }[]).map((o) => o.id);
    if (optionIds.some((o) => !valid.includes(o))) throw badRequest('Opção inválida');
    if (!p.multiple && optionIds.length > 1) throw badRequest('Escolha apenas uma opção');
    await ctx.db.transaction(async (tx) => {
      await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, id), eq(pollVotes.userId, req.authz!.id)));
      if (optionIds.length) await tx.insert(pollVotes).values(optionIds.map((optionId) => ({ pollId: id, userId: req.authz!.id, optionId })));
    });
    await broadcastMessage(ctx, p.messageId!);
    return { ok: true };
  });

  app.post('/api/polls/:id/close', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [p] = await ctx.db.select().from(polls).where(eq(polls.id, id));
    if (!p) throw notFound();
    const { perms } = await requireChannel(ctx, req.authz!, p.channelId);
    if (p.createdById !== req.authz!.id && !perms.has(P.MANAGE_MESSAGES)) throw forbidden();
    await ctx.db.update(polls).set({ closedAt: new Date() }).where(eq(polls.id, id));
    await broadcastMessage(ctx, p.messageId!);
    return { ok: true };
  });

  // ── Scheduled messages ──
  app.get('/api/scheduled-messages', approved, async (req) =>
    ctx.db
      .select()
      .from(scheduledMessages)
      .where(and(eq(scheduledMessages.authorId, req.authz!.id), isNull(scheduledMessages.sentAt)))
      .orderBy(asc(scheduledMessages.sendAt)),
  );

  app.delete('/api/scheduled-messages/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    await ctx.db.delete(scheduledMessages).where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.authorId, req.authz!.id), isNull(scheduledMessages.sentAt)));
    return { ok: true };
  });
}

/** Soft-deletes a message. `opts.audit` records moderator deletions (the author deleting their own message is not audited). */
export async function deleteMessage(ctx: AppContext, m: MessageRow, actorId: string | null, opts: { audit: boolean; ip?: string | null }) {
  await ctx.db.update(messages).set({ deletedAt: new Date(), content: '', metadata: {} }).where(eq(messages.id, m.id));
  await ctx.db.delete(reactions).where(eq(reactions.messageId, m.id));
  if (opts.audit) {
    await audit(ctx, {
      actorId,
      action: 'message.delete',
      targetType: 'message',
      targetId: m.id.toString(),
      ip: opts.ip ?? null,
      metadata: { channelId: m.channelId, authorId: m.authorId, content: m.content.slice(0, 500) },
    });
  }
  ctx.realtime.toChannel(m.channelId, 'message:deleted', { id: m.id.toString(), channelId: m.channelId, threadId: m.threadId });
  ctx.bus.emit('message.deleted', { messageId: m.id.toString(), channelId: m.channelId });
}

export async function broadcastMessage(ctx: AppContext, id: bigint) {
  const [row] = await ctx.db.select().from(messages).where(eq(messages.id, id));
  if (!row) return;
  const [h] = await hydrateMessages(ctx, [row], '00000000-0000-0000-0000-000000000000');
  ctx.realtime.toChannel(row.channelId, 'message:updated', { ...h, poll: h.poll ? { ...h.poll, myVotes: undefined } : null });
}

export async function createPoll(
  ctx: AppContext,
  channelId: string,
  authorId: string,
  input: { question: string; options: string[]; multiple: boolean; anonymous: boolean; durationHours: number },
) {
  const options = input.options.map((label, i) => ({ id: String(i + 1), label }));
  const [p] = await ctx.db
    .insert(polls)
    .values({
      channelId,
      question: input.question,
      options,
      multiple: input.multiple,
      anonymous: input.anonymous,
      closesAt: input.durationHours ? new Date(Date.now() + input.durationHours * 3600_000) : null,
      createdById: authorId,
    })
    .returning();
  const msg = await createMessage(ctx, { channelId, authorId, content: `📊 ${input.question}`, type: 'poll', metadata: { pollId: p.id }, skipMentions: true });
  await ctx.db.update(polls).set({ messageId: BigInt(msg.id) }).where(eq(polls.id, p.id));
  await broadcastMessage(ctx, BigInt(msg.id));
  return msg;
}

/** DMs respect blocks and the recipient's privacy preference. */
export async function assertDmAllowed(ctx: AppContext, senderId: string, channelId: string) {
  const members = await ctx.db.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channelId));
  const other = members.find((m) => m.userId !== senderId)?.userId;
  if (!other) return;
  const blocks = await ctx.db
    .select()
    .from(userBlocks)
    .where(
      sql`(${userBlocks.blockerId} = ${other} and ${userBlocks.blockedId} = ${senderId}) or (${userBlocks.blockerId} = ${senderId} and ${userBlocks.blockedId} = ${other})`,
    );
  if (blocks.length) throw new AppError(403, 'BLOCKED', 'Não é possível enviar mensagens para este usuário');
}
