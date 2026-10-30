import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OWNER_ONLY_GRANTS, PERMISSIONS, platformSettingsSchema, roleSchema, USER_STATUSES } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { revokeUserSessions } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { body, defined, hasKeys, query, uuidParam } from '../lib/http';
import { mailTemplate } from '../lib/mailer';
import { notify } from '../lib/notify';
import { getPublicUsers } from '../lib/users';
import {
  accessRequests,
  auditLogs,
  bots,
  calls,
  files,
  messages,
  reports,
  rolePermissions,
  roles,
  userProfiles,
  userRoles,
  users,
  warnings,
} from '../db/schema';

const decisionSchema = z.object({ note: z.string().trim().max(500).optional() });
const suspendSchema = z.object({ reason: z.string().trim().max(500).default(''), hours: z.number().int().min(1).max(24 * 365) });
const reasonSchema = z.object({ reason: z.string().trim().max(500).default('') });
const timeoutSchema = z.object({ minutes: z.number().int().min(1).max(40320), reason: z.string().trim().max(500).default('') });

export async function adminRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;

  async function loadTarget(actorId: string, targetId: string) {
    const actor = (await ctx.perms.getUser(actorId))!;
    const target = await ctx.perms.getUser(targetId);
    if (!target || target.isBot) throw notFound('Membro não encontrado');
    if (!ctx.perms.canActOn(actor, target)) throw forbidden('Você não pode executar esta ação sobre este membro');
    return { actor, target };
  }

  async function setStatus(
    targetId: string,
    status: (typeof USER_STATUSES)[number],
    extra: Partial<typeof users.$inferInsert> = {},
  ) {
    const [u] = await ctx.db.update(users).set({ status, updatedAt: new Date(), ...extra }).where(eq(users.id, targetId)).returning();
    ctx.perms.invalidateUser(targetId);
    return u;
  }

  async function cutAccess(userId: string) {
    await revokeUserSessions(ctx, userId);
    await ctx.realtime.disconnectUser(userId);
  }

  // ───────────── Access requests ─────────────

  app.get('/api/admin/requests', { preHandler: g.perm(P.MANAGE_MEMBERS) }, async (req) => {
    const q = query(req, z.object({ status: z.enum(['pending', 'approved', 'rejected', 'blocked', 'all']).default('pending') }));
    const rows = await ctx.db
      .select({
        id: accessRequests.id,
        userId: users.id,
        username: users.username,
        email: users.email,
        emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
        introduction: accessRequests.introduction,
        status: accessRequests.status,
        userStatus: users.status,
        createdAt: accessRequests.createdAt,
        lastAccessAttemptAt: users.lastAccessAttemptAt,
        decidedAt: accessRequests.decidedAt,
        decisionNote: accessRequests.decisionNote,
        decidedById: accessRequests.decidedById,
      })
      .from(accessRequests)
      .innerJoin(users, eq(users.id, accessRequests.userId))
      .where(q.status === 'all' ? undefined : eq(accessRequests.status, q.status))
      .orderBy(desc(accessRequests.createdAt))
      .limit(500);
    return rows;
  });

  const decide = (decision: 'approved' | 'rejected' | 'blocked') => async (req: any) => {
    const userId = uuidParam(req, 'userId');
    const { note } = body(req, decisionSchema);
    const { target } = await loadTarget(req.authz.id, userId);
    const [r] = await ctx.db.select().from(accessRequests).where(eq(accessRequests.userId, userId));
    if (!r) throw notFound('Solicitação não encontrada');
    if (decision === 'approved' && target.status === 'approved') throw conflict('Este membro já foi aprovado');

    const userStatus = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'banned';
    const u = await setStatus(userId, userStatus, { statusReason: note ?? null });
    await ctx.db
      .update(accessRequests)
      .set({ status: decision, decidedById: req.authz.id, decidedAt: new Date(), decisionNote: note ?? null })
      .where(eq(accessRequests.id, r.id));
    await audit(ctx, { actorId: req.authz.id, action: `request.${decision}`, targetType: 'user', targetId: userId, ip: req.ip, metadata: { username: u.username, note } });

    const s = await ctx.settings.get();
    if (decision === 'approved') {
      await notify(ctx, [userId], { type: 'approval', title: 'Acesso aprovado', body: `Bem-vindo(a) à ${s.communityName}!`, link: '/app' });
      ctx.bus.emit('member.approved', { userId });
      ctx.realtime.toMembers('member:joined', (await getPublicUsers(ctx, [userId]))[0]);
    } else {
      await cutAccess(userId);
    }
    if (u.email && (decision !== 'approved' || s.notifications.emailOnApproval)) {
      const m =
        decision === 'approved'
          ? mailTemplate(s.communityName, 'Seu acesso foi aprovado', [`Olá, ${u.username}! Sua solicitação foi aceita.`, 'Você já pode entrar na comunidade.'], { label: 'Entrar', url: `${ctx.config.APP_URL}/login` })
          : mailTemplate(s.communityName, 'Atualização da sua solicitação', [`Olá, ${u.username}. Sua solicitação de acesso não foi aprovada.`]);
      ctx.mailer.send({ to: u.email, subject: `[${s.communityName}] ${decision === 'approved' ? 'Acesso aprovado' : 'Solicitação de acesso'}`, ...m }).catch(() => {});
    }
    ctx.realtime.toStaff('access-request:updated', { userId, status: decision });
    return { ok: true };
  };

  app.post('/api/admin/requests/:userId/approve', { preHandler: g.perm(P.MANAGE_MEMBERS) }, decide('approved'));
  app.post('/api/admin/requests/:userId/reject', { preHandler: g.perm(P.MANAGE_MEMBERS) }, decide('rejected'));
  app.post('/api/admin/requests/:userId/block', { preHandler: g.perm(P.BAN_MEMBERS) }, decide('blocked'));

  // ───────────── Members ─────────────

  app.get('/api/admin/members', { preHandler: g.perm(P.MANAGE_MEMBERS, P.BAN_MEMBERS, P.MODERATE_MEMBERS, P.MANAGE_ROLES) }, async (req) => {
    const q = query(req, z.object({ status: z.enum([...USER_STATUSES, 'all']).default('all'), q: z.string().max(60).optional() }));
    const where = and(
      eq(users.isBot, false),
      q.status === 'all' ? undefined : eq(users.status, q.status),
      q.q ? or(ilike(users.username, `%${q.q.replace(/[%_]/g, '')}%`), ilike(users.email, `%${q.q.replace(/[%_]/g, '')}%`)) : undefined,
    );
    const rows = await ctx.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        status: users.status,
        isOwner: users.isOwner,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        lastSeenAt: users.lastSeenAt,
        suspendedUntil: users.suspendedUntil,
        mutedUntil: users.mutedUntil,
        statusReason: users.statusReason,
        totpEnabled: users.totpEnabled,
        displayName: userProfiles.displayName,
        avatarFileId: userProfiles.avatarFileId,
        messageCount: userProfiles.messageCount,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(1000);
    const roleRows = rows.length ? await ctx.db.select().from(userRoles).where(inArray(userRoles.userId, rows.map((r) => r.id))) : [];
    const warnRows = rows.length
      ? await ctx.db.select({ userId: warnings.userId, n: count() }).from(warnings).where(inArray(warnings.userId, rows.map((r) => r.id))).groupBy(warnings.userId)
      : [];
    return rows.map((r) => ({
      ...r,
      roleIds: roleRows.filter((x) => x.userId === r.id).map((x) => x.roleId),
      warningCount: warnRows.find((w) => w.userId === r.id)?.n ?? 0,
    }));
  });

  app.post('/api/admin/members/:userId/suspend', { preHandler: g.perm(P.BAN_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const input = body(req, suspendSchema);
    await loadTarget(req.authz!.id, userId);
    const until = new Date(Date.now() + input.hours * 3600_000);
    await setStatus(userId, 'suspended', { suspendedUntil: until, statusReason: input.reason });
    await cutAccess(userId);
    await audit(ctx, { actorId: req.authz!.id, action: 'member.suspend', targetType: 'user', targetId: userId, ip: req.ip, metadata: { until, reason: input.reason } });
    return { ok: true, until };
  });

  app.post('/api/admin/members/:userId/ban', { preHandler: g.perm(P.BAN_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const { reason } = body(req, reasonSchema);
    await loadTarget(req.authz!.id, userId);
    await setStatus(userId, 'banned', { statusReason: reason, suspendedUntil: null });
    await ctx.db.update(accessRequests).set({ status: 'blocked' }).where(eq(accessRequests.userId, userId));
    await cutAccess(userId);
    await audit(ctx, { actorId: req.authz!.id, action: 'member.ban', targetType: 'user', targetId: userId, ip: req.ip, metadata: { reason } });
    ctx.realtime.toMembers('member:left', { userId });
    return { ok: true };
  });

  app.post('/api/admin/members/:userId/restore', { preHandler: g.perm(P.BAN_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    await loadTarget(req.authz!.id, userId);
    await setStatus(userId, 'approved', { suspendedUntil: null, statusReason: null, mutedUntil: null });
    await ctx.db.update(accessRequests).set({ status: 'approved', decidedById: req.authz!.id, decidedAt: new Date() }).where(eq(accessRequests.userId, userId));
    await audit(ctx, { actorId: req.authz!.id, action: 'member.restore', targetType: 'user', targetId: userId, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/admin/members/:userId/timeout', { preHandler: g.perm(P.MODERATE_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const input = body(req, timeoutSchema);
    await loadTarget(req.authz!.id, userId);
    const until = new Date(Date.now() + input.minutes * 60_000);
    await ctx.db.update(users).set({ mutedUntil: until }).where(eq(users.id, userId));
    ctx.perms.invalidateUser(userId);
    await notify(ctx, [userId], { type: 'admin', title: 'Você foi silenciado temporariamente', body: input.reason || `Até ${until.toLocaleString('pt-BR')}` });
    await audit(ctx, { actorId: req.authz!.id, action: 'member.timeout', targetType: 'user', targetId: userId, ip: req.ip, metadata: { until, reason: input.reason } });
    return { ok: true, until };
  });

  app.delete('/api/admin/members/:userId/timeout', { preHandler: g.perm(P.MODERATE_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    await loadTarget(req.authz!.id, userId);
    await ctx.db.update(users).set({ mutedUntil: null }).where(eq(users.id, userId));
    ctx.perms.invalidateUser(userId);
    await audit(ctx, { actorId: req.authz!.id, action: 'member.timeout_removed', targetType: 'user', targetId: userId, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/admin/members/:userId/warn', { preHandler: g.perm(P.MODERATE_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const { reason } = body(req, z.object({ reason: z.string().trim().min(1).max(500) }));
    await loadTarget(req.authz!.id, userId);
    await ctx.db.insert(warnings).values({ userId, moderatorId: req.authz!.id, reason });
    await notify(ctx, [userId], { type: 'admin', title: 'Você recebeu uma advertência', body: reason });
    await audit(ctx, { actorId: req.authz!.id, action: 'member.warn', targetType: 'user', targetId: userId, ip: req.ip, metadata: { reason } });
    return { ok: true };
  });

  app.get('/api/admin/members/:userId/warnings', { preHandler: g.perm(P.MODERATE_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    return ctx.db.select().from(warnings).where(eq(warnings.userId, userId)).orderBy(desc(warnings.createdAt));
  });

  /** Removes an account permanently. Messages remain but lose their author (shown as "membro removido"). */
  app.delete('/api/admin/members/:userId', { preHandler: g.perm(P.BAN_MEMBERS) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const { target } = await loadTarget(req.authz!.id, userId);
    await cutAccess(userId);
    await ctx.db.delete(users).where(eq(users.id, userId));
    ctx.perms.invalidateUser(userId);
    await audit(ctx, { actorId: req.authz!.id, action: 'member.remove', targetType: 'user', targetId: userId, ip: req.ip, metadata: { username: target.username } });
    ctx.realtime.toMembers('member:left', { userId });
    return { ok: true };
  });

  app.put('/api/admin/members/:userId/roles', { preHandler: g.perm(P.MANAGE_ROLES) }, async (req) => {
    const userId = uuidParam(req, 'userId');
    const { roleIds } = body(req, z.object({ roleIds: z.array(z.string().uuid()).max(20) }));
    const { actor } = await loadTarget(req.authz!.id, userId);
    const all = await ctx.db.select().from(roles);
    const current = (await ctx.db.select().from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.roleId);
    const changed = [...roleIds.filter((r) => !current.includes(r)), ...current.filter((r) => !roleIds.includes(r))];
    for (const rid of changed) {
      const role = all.find((r) => r.id === rid);
      if (!role) throw badRequest('Cargo inexistente');
      if (role.isDefault) throw badRequest('O cargo padrão é atribuído automaticamente');
      if (!actor.isOwner && role.position >= actor.topPosition) throw forbidden(`Você não pode atribuir o cargo "${role.name}"`);
    }
    await ctx.db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      const keep = roleIds.filter((r) => !all.find((x) => x.id === r)?.isDefault);
      if (keep.length) await tx.insert(userRoles).values(keep.map((roleId) => ({ userId, roleId })));
    });
    ctx.perms.invalidateUser(userId);
    await ctx.realtime.resyncUser(userId);
    ctx.realtime.toUser(userId, 'me:refresh', {});
    ctx.realtime.toMembers('member:updated', (await getPublicUsers(ctx, [userId]))[0]);
    await audit(ctx, { actorId: req.authz!.id, action: 'member.roles', targetType: 'user', targetId: userId, ip: req.ip, metadata: { roleIds } });
    return { ok: true };
  });

  // ───────────── Roles ─────────────

  app.get('/api/roles', { preHandler: g.approved }, async () => {
    const rows = await ctx.db.select().from(roles).orderBy(desc(roles.position));
    const perms = await ctx.db.select().from(rolePermissions);
    return rows.map((r) => ({ ...r, permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission) }));
  });

  function checkGrantable(actor: Awaited<ReturnType<typeof ctx.perms.getUser>>, perms: string[]) {
    if (actor!.isOwner) return;
    const bad = perms.find((p) => OWNER_ONLY_GRANTS.includes(p as never) || !ctx.perms.has(actor!, p as never));
    if (bad) throw forbidden(`Você não pode conceder a permissão "${bad}"`);
  }

  app.post('/api/roles', { preHandler: g.perm(P.MANAGE_ROLES) }, async (req) => {
    const input = body(req, roleSchema);
    const actor = await ctx.perms.getUser(req.authz!.id);
    checkGrantable(actor, input.permissions);
    const maxPos = actor!.isOwner ? 1000 : actor!.topPosition - 1;
    const [r] = await ctx.db.insert(roles).values({ name: input.name, color: input.color, hoist: input.hoist, position: Math.max(1, Math.min(maxPos, 10)) }).returning();
    if (input.permissions.length) await ctx.db.insert(rolePermissions).values(input.permissions.map((permission) => ({ roleId: r.id, permission })));
    await audit(ctx, { actorId: req.authz!.id, action: 'role.create', targetType: 'role', targetId: r.id, ip: req.ip, metadata: input });
    ctx.realtime.toMembers('roles:updated', {});
    return { ...r, permissions: input.permissions };
  });

  app.patch('/api/roles/:id', { preHandler: g.perm(P.MANAGE_ROLES) }, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, roleSchema.partial().extend({ position: z.number().int().min(0).max(1000).optional() }));
    const actor = (await ctx.perms.getUser(req.authz!.id))!;
    const [role] = await ctx.db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw notFound('Cargo não encontrado');
    if (!actor.isOwner && role.position >= actor.topPosition) throw forbidden('Você não pode editar este cargo');
    if (!actor.isOwner && input.position !== undefined && input.position >= actor.topPosition) throw forbidden('Posição acima da sua');
    if (input.permissions) checkGrantable(actor, input.permissions);
    const rp = defined({ name: input.name, color: input.color, hoist: input.hoist, position: role.isDefault ? undefined : input.position });
    if (hasKeys(rp)) await ctx.db.update(roles).set(rp).where(eq(roles.id, id));
    if (input.permissions) {
      await ctx.db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (input.permissions.length) await ctx.db.insert(rolePermissions).values(input.permissions.map((permission) => ({ roleId: id, permission })));
    }
    ctx.perms.invalidateAllUsers();
    await ctx.realtime.resyncAll();
    ctx.realtime.toMembers('roles:updated', {});
    ctx.realtime.toMembers('me:refresh', {});
    await audit(ctx, { actorId: req.authz!.id, action: 'role.update', targetType: 'role', targetId: id, ip: req.ip, metadata: input });
    return { ok: true };
  });

  app.delete('/api/roles/:id', { preHandler: g.perm(P.MANAGE_ROLES) }, async (req) => {
    const id = uuidParam(req, 'id');
    const actor = (await ctx.perms.getUser(req.authz!.id))!;
    const [role] = await ctx.db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw notFound('Cargo não encontrado');
    if (role.isDefault) throw badRequest('O cargo padrão não pode ser excluído');
    if (!actor.isOwner && role.position >= actor.topPosition) throw forbidden('Você não pode excluir este cargo');
    await ctx.db.delete(roles).where(eq(roles.id, id));
    ctx.perms.invalidateAllUsers();
    await ctx.realtime.resyncAll();
    ctx.realtime.toMembers('roles:updated', {});
    await audit(ctx, { actorId: req.authz!.id, action: 'role.delete', targetType: 'role', targetId: id, ip: req.ip, metadata: { name: role.name } });
    return { ok: true };
  });

  // ───────────── Statistics ─────────────

  app.get('/api/admin/stats', { preHandler: g.perm(P.MANAGE_MEMBERS, P.VIEW_AUDIT_LOG, P.MANAGE_SETTINGS) }, async () => {
    const [members] = await ctx.db.select({ n: count() }).from(users).where(and(eq(users.status, 'approved'), eq(users.isBot, false)));
    const [pending] = await ctx.db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, 'pending'));
    const [msgs] = await ctx.db.select({ n: count() }).from(messages).where(isNull(messages.deletedAt));
    const since = new Date(Date.now() - 86400_000);
    const [msgs24] = await ctx.db.select({ n: count() }).from(messages).where(gte(messages.createdAt, since));
    const [callCount] = await ctx.db.select({ n: count() }).from(calls);
    const [fileStats] = await ctx.db.select({ n: count(), bytes: sql<number>`coalesce(sum(${files.size}), 0)::bigint` }).from(files).where(isNull(files.deletedAt));
    const [activeBots] = await ctx.db.select({ n: count() }).from(bots).where(eq(bots.enabled, true));
    const [openReports] = await ctx.db.select({ n: count() }).from(reports).where(eq(reports.status, 'open'));
    const online = (await ctx.redis.scard('presence:online')) ?? 0;
    const activity = await ctx.db
      .select({ day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`, n: count() })
      .from(messages)
      .where(gte(messages.createdAt, new Date(Date.now() - 14 * 86400_000)))
      .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
      .orderBy(sql`date_trunc('day', ${messages.createdAt})`);
    const recent = await ctx.db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(10);
    const onlineMembers = Math.min(online, members.n);
    return {
      members: members.n,
      online: onlineMembers,
      offline: Math.max(0, members.n - onlineMembers),
      pendingRequests: pending.n,
      messages: msgs.n,
      messages24h: msgs24.n,
      calls: callCount.n,
      files: fileStats.n,
      storageBytes: Number(fileStats.bytes),
      activeBots: activeBots.n,
      openReports: openReports.n,
      activity,
      recent,
    };
  });

  // ───────────── Audit log ─────────────

  app.get('/api/admin/audit', { preHandler: g.perm(P.VIEW_AUDIT_LOG) }, async (req) => {
    const q = query(
      req,
      z.object({
        action: z.string().max(60).optional(),
        actorId: z.string().uuid().optional(),
        before: z.string().regex(/^\d+$/).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    );
    const rows = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          q.action ? ilike(auditLogs.action, `${q.action.replace(/[%_]/g, '')}%`) : undefined,
          q.actorId ? eq(auditLogs.actorId, q.actorId) : undefined,
          q.before ? lt(auditLogs.id, BigInt(q.before)) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.id))
      .limit(q.limit);
    const actors = await getPublicUsers(ctx, rows.map((r) => r.actorId!).filter(Boolean));
    return { entries: rows, actors };
  });

  // ───────────── Settings ─────────────

  app.get('/api/admin/settings', { preHandler: g.perm(P.MANAGE_SETTINGS) }, async () => {
    const s = await ctx.settings.get();
    const aiKey = await ctx.settings.getSecret('ai_api_key');
    return { settings: s, secrets: { aiApiKeyConfigured: !!aiKey || !!ctx.config.AI_API_KEY }, storage: await ctx.storage.usage() };
  });

  app.patch('/api/admin/settings', { preHandler: g.perm(P.MANAGE_SETTINGS) }, async (req) => {
    const patch = body(req, platformSettingsSchema.deepPartial());
    const actor = (await ctx.perms.getUser(req.authz!.id))!;
    // Owner-only sections.
    if (!actor.isOwner && (patch.maintenance || patch.security || patch.retention)) throw forbidden('Apenas o proprietário pode alterar manutenção, segurança e retenção');
    const next = await ctx.settings.update(patch as never);
    await audit(ctx, { actorId: req.authz!.id, action: 'settings.update', ip: req.ip, metadata: { sections: Object.keys(patch) } });
    ctx.realtime.toMembers('settings:updated', publicSettings(next));
    if (patch.maintenance?.enabled) {
      // Kick everyone without settings permission off the realtime layer.
      const sockets = (await ctx.realtime.io?.in('members').fetchSockets()) ?? [];
      for (const s of sockets) {
        const a = await ctx.perms.getUser(s.data.userId);
        if (a && !ctx.perms.has(a, P.MANAGE_SETTINGS)) s.disconnect(true);
      }
    }
    return next;
  });

  app.put('/api/admin/secrets/ai', { preHandler: g.owner }, async (req) => {
    const { apiKey } = body(req, z.object({ apiKey: z.string().max(400).nullable() }));
    const { encryptSecret } = await import('../lib/crypto');
    await ctx.settings.setSecret('ai_api_key', apiKey ? encryptSecret(ctx.config.APP_SECRET, apiKey) : null);
    await audit(ctx, { actorId: req.authz!.id, action: 'settings.ai_key', ip: req.ip, metadata: { configured: !!apiKey } });
    return { ok: true };
  });

  // Public (pre-login) community presentation.
  app.get('/api/public/community', async () => publicSettings(await ctx.settings.get()));
}

export function publicSettings(s: Awaited<ReturnType<AppContext['settings']['get']>>) {
  return {
    communityName: s.communityName,
    tagline: s.tagline,
    description: s.description,
    rules: s.rules,
    registrationOpen: s.registrationOpen,
    maintenance: s.maintenance,
    appearance: s.appearance,
    personalization: s.personalization,
    uploads: { maxFileSizeMb: s.uploads.maxFileSizeMb, maxAvatarSizeMb: s.uploads.maxAvatarSizeMb, allowedCategories: s.uploads.allowedCategories },
    gamification: s.gamification,
  };
}
