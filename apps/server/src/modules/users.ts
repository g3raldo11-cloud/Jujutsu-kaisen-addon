import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { preferencesSchema, profileUpdateSchema } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, query, uuidParam } from '../lib/http';
import { ACHIEVEMENTS, xpForLevel } from '../lib/gamification';
import { getPublicUser, getPublicUsers, listMembers } from '../lib/users';
import { onlineUserIds, presenceOf } from '../realtime/presence';
import { achievements, files, friendships, notifications, userProfiles, users } from '../db/schema';

function deepMerge(base: any, patch: any): any {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] ?? {}, v) : v;
  return out;
}

export async function userRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const approved = { preHandler: g.approved };

  app.get('/api/members', approved, async () => {
    const members = await listMembers(ctx);
    const online = await onlineUserIds(ctx);
    const presence = await presenceOf(ctx, members.map((m) => m.id));
    return members.map((m) => ({ ...m, presence: online.has(m.id) ? presence[m.id] ?? 'online' : 'offline' }));
  });

  app.get('/api/users/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const u = await getPublicUser(ctx, id);
    if (!u) throw notFound('Usuário não encontrado');
    const [row] = await ctx.db.select({ status: users.status }).from(users).where(eq(users.id, id));
    if (row.status !== 'approved') throw notFound('Usuário não encontrado');
    const ach = await ctx.db.select().from(achievements).where(eq(achievements.userId, id)).orderBy(desc(achievements.awardedAt));
    const [fr] = await ctx.db
      .select()
      .from(friendships)
      .where(sql`least(${friendships.requesterId}, ${friendships.addresseeId}) = least(${id}::uuid, ${req.authz!.id}::uuid) and greatest(${friendships.requesterId}, ${friendships.addresseeId}) = greatest(${id}::uuid, ${req.authz!.id}::uuid)`);
    const online = await onlineUserIds(ctx);
    const pres = await presenceOf(ctx, [id]);
    return {
      ...u,
      presence: online.has(id) ? pres[id] ?? 'online' : 'offline',
      achievements: ach.map((x) => ({ key: x.key, awardedAt: x.awardedAt, ...(ACHIEVEMENTS[x.key] ?? { title: x.key, description: '', icon: '🏅' }) })),
      nextLevelXp: xpForLevel(u.level + 1),
      friendship: fr ? { status: fr.status, outgoing: fr.requesterId === req.authz!.id, id: fr.id } : null,
    };
  });

  app.get('/api/achievements', approved, async () => ACHIEVEMENTS);

  app.patch('/api/me/profile', approved, async (req) => {
    const input = body(req, profileUpdateSchema);
    const s = await ctx.settings.get();
    const p = s.personalization;
    if (input.displayName !== undefined && !p.allowDisplayNames) throw forbidden('Nomes de exibição estão desativados');
    if (input.profileColor !== undefined && !p.allowProfileColors) throw forbidden('Cores de perfil estão desativadas');
    if (input.customStatus !== undefined && !p.allowCustomStatus) throw forbidden('Status personalizado está desativado');
    if (input.avatarFileId) {
      if (!p.allowAvatars) throw forbidden('Avatares estão desativados');
      const [f] = await ctx.db.select().from(files).where(eq(files.id, input.avatarFileId));
      if (!f || f.ownerId !== req.authz!.id || f.purpose !== 'avatar' || f.deletedAt) throw badRequest('Avatar inválido');
    }
    await ctx.db.update(userProfiles).set({ ...input, updatedAt: new Date() }).where(eq(userProfiles.userId, req.authz!.id));
    const u = await getPublicUser(ctx, req.authz!.id);
    ctx.realtime.toMembers('member:updated', u);
    return u;
  });

  app.patch('/api/me/preferences', approved, async (req) => {
    const input = body(req, preferencesSchema);
    const s = await ctx.settings.get();
    if (input.theme === 'custom' && !s.personalization.allowCustomThemes) throw forbidden('Temas personalizados estão desativados');
    const [p] = await ctx.db.select().from(userProfiles).where(eq(userProfiles.userId, req.authz!.id));
    const { presence, ...prefs } = input;
    const merged = deepMerge(p?.preferences ?? {}, prefs);
    await ctx.db
      .update(userProfiles)
      .set({ preferences: merged, ...(presence ? { presence } : {}), updatedAt: new Date() })
      .where(eq(userProfiles.userId, req.authz!.id));
    if (presence) {
      await ctx.redis.hset('presence:mode', req.authz!.id, presence);
      const online = await onlineUserIds(ctx);
      ctx.realtime.toMembers('presence:update', { userId: req.authz!.id, presence: online.has(req.authz!.id) && presence !== 'invisible' ? presence : 'offline' });
    }
    return { preferences: merged, presence: presence ?? p?.presence };
  });

  // ── Notifications ──
  app.get('/api/notifications', approved, async (req) => {
    const q = query(req, z.object({ before: z.string().datetime().optional(), unread: z.enum(['0', '1']).default('0') }));
    const rows = await ctx.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, req.authz!.id),
          q.before ? lt(notifications.createdAt, new Date(q.before)) : undefined,
          q.unread === '1' ? isNull(notifications.readAt) : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const [{ n }] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, req.authz!.id), isNull(notifications.readAt)));
    return { notifications: rows, unread: n };
  });

  app.post('/api/notifications/read', approved, async (req) => {
    const { ids } = body(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional() }));
    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.authz!.id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
    return { ok: true };
  });

  app.delete('/api/notifications/:id', approved, async (req) => {
    await ctx.db.delete(notifications).where(and(eq(notifications.id, uuidParam(req, 'id')), eq(notifications.userId, req.authz!.id)));
    return { ok: true };
  });

  app.delete('/api/notifications', approved, async (req) => {
    await ctx.db.delete(notifications).where(eq(notifications.userId, req.authz!.id));
    return { ok: true };
  });

  void getPublicUsers;
}
