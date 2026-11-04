import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, reportSchema } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { revokeUserSessions } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, query, uuidParam } from '../lib/http';
import { grantAchievement } from '../lib/gamification';
import { notify } from '../lib/notify';
import { getPublicUsers } from '../lib/users';
import { staffWith } from './auth';
import { deleteMessage } from './messages';
import { forumComments, forumPosts, messages, reports, users, warnings } from '../db/schema';

export async function moderationRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;

  /** Resolves a report target, checking the reporter can actually see it, and captures a snapshot. */
  async function resolveTarget(a: NonNullable<Awaited<ReturnType<typeof ctx.perms.getUser>>>, type: string, id: string) {
    if (type === 'message') {
      if (!/^\d+$/.test(id)) throw badRequest('Mensagem inválida');
      const [m] = await ctx.db.select().from(messages).where(eq(messages.id, BigInt(id)));
      if (!m || m.deletedAt) throw notFound('Mensagem não encontrada');
      const { perms } = await ctx.perms.channelPermsById(a, m.channelId);
      if (!perms.has(P.VIEW_CHANNEL)) throw notFound('Mensagem não encontrada');
      return { userId: m.authorId, snapshot: { content: m.content, channelId: m.channelId, createdAt: m.createdAt, metadata: m.metadata } };
    }
    if (type === 'forum_post') {
      const [p] = await ctx.db.select().from(forumPosts).where(eq(forumPosts.id, id));
      if (!p || p.deletedAt) throw notFound();
      const { perms } = await ctx.perms.channelPermsById(a, p.channelId);
      if (!perms.has(P.VIEW_CHANNEL)) throw notFound();
      return { userId: p.authorId, snapshot: { title: p.title, content: p.content, channelId: p.channelId } };
    }
    if (type === 'forum_comment') {
      const [c] = await ctx.db.select().from(forumComments).where(eq(forumComments.id, id));
      if (!c || c.deletedAt) throw notFound();
      const [p] = await ctx.db.select().from(forumPosts).where(eq(forumPosts.id, c.postId));
      const { perms } = await ctx.perms.channelPermsById(a, p.channelId);
      if (!perms.has(P.VIEW_CHANNEL)) throw notFound();
      return { userId: c.authorId, snapshot: { content: c.content, postId: c.postId, channelId: p.channelId } };
    }
    const [u] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!u || u.status !== 'approved') throw notFound();
    return { userId: u.id, snapshot: { username: u.username } };
  }

  app.post('/api/reports', { preHandler: g.approved, config: { rateLimit: { max: 10, timeWindow: 3600_000 } } }, async (req) => {
    const input = body(req, reportSchema);
    const { userId, snapshot } = await resolveTarget(req.authz!, input.targetType, input.targetId);
    if (userId === req.authz!.id) throw badRequest('Você não pode denunciar a si mesmo');
    const [dupe] = await ctx.db
      .select()
      .from(reports)
      .where(and(eq(reports.reporterId, req.authz!.id), eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, 'open')));
    if (dupe) throw conflict('Você já denunciou isto');
    const [r] = await ctx.db
      .insert(reports)
      .values({ reporterId: req.authz!.id, targetType: input.targetType, targetId: input.targetId, targetUserId: userId, reason: input.reason, details: input.details, snapshot })
      .returning();
    const staff = await staffWith(ctx, P.VIEW_REPORTS);
    await notify(ctx, staff, { type: 'report', title: 'Nova denúncia', body: `Motivo: ${input.reason}`, link: '/admin/reports', data: { reportId: r.id } });
    ctx.realtime.toStaff('report:new', r);
    return { ok: true };
  });

  app.get('/api/admin/reports', { preHandler: g.perm(P.VIEW_REPORTS) }, async (req) => {
    const q = query(req, z.object({ status: z.enum(['open', 'resolved', 'dismissed', 'all']).default('open') }));
    const rows = await ctx.db
      .select()
      .from(reports)
      .where(q.status === 'all' ? undefined : eq(reports.status, q.status))
      .orderBy(desc(reports.createdAt))
      .limit(300);
    const ids = rows.flatMap((r) => [r.reporterId!, r.targetUserId!, r.resolvedById!]).filter(Boolean);
    const counts = await ctx.db
      .select({ userId: reports.targetUserId, n: sql<number>`count(*)::int` })
      .from(reports)
      .groupBy(reports.targetUserId);
    return { reports: rows, users: await getPublicUsers(ctx, ids), reportCounts: counts };
  });

  app.post('/api/admin/reports/:id/resolve', { preHandler: g.perm(P.VIEW_REPORTS) }, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(
      req,
      z.object({
        status: z.enum(['resolved', 'dismissed']),
        note: z.string().trim().max(500).default(''),
        actions: z.array(z.enum(['delete_content', 'warn', 'timeout', 'suspend', 'ban'])).max(3).default([]),
        timeoutMinutes: z.number().int().min(1).max(40320).default(60),
        suspendHours: z.number().int().min(1).max(8760).default(24),
      }),
    );
    const [r] = await ctx.db.select().from(reports).where(eq(reports.id, id));
    if (!r) throw notFound();
    const actor = (await ctx.perms.getUser(req.authz!.id))!;
    const target = r.targetUserId ? await ctx.perms.getUser(r.targetUserId) : null;
    const needsAuthority = input.actions.some((x) => x !== 'delete_content');
    if (needsAuthority && (!target || !ctx.perms.canActOn(actor, target))) throw forbidden('Você não pode aplicar sanções a este membro');

    for (const action of input.actions) {
      if (action === 'delete_content') {
        if (!ctx.perms.has(actor, P.MANAGE_MESSAGES) && !ctx.perms.has(actor, P.MODERATE_MEMBERS)) throw forbidden();
        if (r.targetType === 'message') {
          const [m] = await ctx.db.select().from(messages).where(eq(messages.id, BigInt(r.targetId)));
          if (m && !m.deletedAt) await deleteMessage(ctx, m, actor.id, { audit: true, ip: req.ip });
        } else if (r.targetType === 'forum_post') {
          await ctx.db.update(forumPosts).set({ deletedAt: new Date() }).where(eq(forumPosts.id, r.targetId));
        } else if (r.targetType === 'forum_comment') {
          await ctx.db.update(forumComments).set({ deletedAt: new Date(), content: '' }).where(eq(forumComments.id, r.targetId));
        }
      }
      if (!target) continue;
      if (action === 'warn') {
        if (!ctx.perms.has(actor, P.MODERATE_MEMBERS)) throw forbidden();
        await ctx.db.insert(warnings).values({ userId: target.id, moderatorId: actor.id, reason: input.note || `Denúncia: ${r.reason}` });
        await notify(ctx, [target.id], { type: 'admin', title: 'Você recebeu uma advertência', body: input.note || r.reason });
      }
      if (action === 'timeout') {
        if (!ctx.perms.has(actor, P.MODERATE_MEMBERS)) throw forbidden();
        await ctx.db.update(users).set({ mutedUntil: new Date(Date.now() + input.timeoutMinutes * 60_000) }).where(eq(users.id, target.id));
        ctx.perms.invalidateUser(target.id);
      }
      if (action === 'suspend' || action === 'ban') {
        if (!ctx.perms.has(actor, P.BAN_MEMBERS)) throw forbidden();
        await ctx.db
          .update(users)
          .set(action === 'ban' ? { status: 'banned', statusReason: input.note } : { status: 'suspended', suspendedUntil: new Date(Date.now() + input.suspendHours * 3600_000), statusReason: input.note })
          .where(eq(users.id, target.id));
        ctx.perms.invalidateUser(target.id);
        await revokeUserSessions(ctx, target.id);
        await ctx.realtime.disconnectUser(target.id);
      }
    }

    await ctx.db.update(reports).set({ status: input.status, resolvedById: actor.id, resolvedAt: new Date(), resolutionNote: input.note }).where(eq(reports.id, id));
    await audit(ctx, { actorId: actor.id, action: `report.${input.status}`, targetType: 'report', targetId: id, ip: req.ip, metadata: { actions: input.actions, targetUserId: r.targetUserId, note: input.note } });
    if (input.status === 'resolved' && r.reporterId) {
      await notify(ctx, [r.reporterId], { type: 'admin', title: 'Sua denúncia foi analisada', body: 'Obrigado por ajudar a manter a comunidade segura.' });
      await grantAchievement(ctx, r.reporterId, 'reporter');
    }
    ctx.realtime.toStaff('report:updated', { id });
    return { ok: true };
  });
}
