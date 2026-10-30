import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { PERMISSIONS, type Permission } from '@enclave/shared';
import type { AppContext } from './context';
import { randomToken, sha256 } from './crypto';
import { forbidden, unauthorized, AppError } from './errors';
import type { UserAuthz } from './permissions';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'enclave_session';
export const CSRF_COOKIE = 'enclave_csrf';

declare module 'fastify' {
  interface FastifyRequest {
    authz: UserAuthz | null;
    sessionId: string | null;
  }
}

export function sessionCookieOptions(ctx: AppContext, maxAgeSeconds: number) {
  return {
    path: '/',
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'lax' as const,
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const s = await ctx.settings.get();
  const token = randomToken(32);
  const maxAge = s.security.sessionDays * 86400;
  const [row] = await ctx.db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      ip: req.ip,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 300),
      expiresAt: new Date(Date.now() + maxAge * 1000),
    })
    .returning();
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx, maxAge));
  // Rotate CSRF token on privilege change (login).
  reply.setCookie(CSRF_COOKIE, randomToken(24), { path: '/', sameSite: 'lax', secure: ctx.config.cookieSecure, httpOnly: false });
  return row;
}

export async function resolveSession(ctx: AppContext, token: string | undefined) {
  if (!token || token.length > 200) return null;
  const [row] = await ctx.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await ctx.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
  }
  return row;
}

export async function revokeUserSessions(ctx: AppContext, userId: string, exceptSessionId?: string) {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  const revoked = await ctx.db.update(sessions).set({ revokedAt: new Date() }).where(where).returning({ id: sessions.id });
  for (const r of revoked) await ctx.realtime.disconnectSession(r.id);
}

/** Lifts expired suspensions lazily so that a suspended account regains access when its term ends. */
export async function refreshSuspension(ctx: AppContext, a: UserAuthz): Promise<UserAuthz> {
  if (a.status === 'suspended' && a.suspendedUntil && a.suspendedUntil.getTime() <= Date.now()) {
    await ctx.db.update(users).set({ status: 'approved', suspendedUntil: null, statusReason: null }).where(eq(users.id, a.id));
    ctx.perms.invalidateUser(a.id);
    return (await ctx.perms.getUser(a.id)) ?? a;
  }
  return a;
}

export type AccessState = 'ok' | 'unverified' | 'pending' | 'rejected' | 'suspended' | 'banned';

export function accessState(a: UserAuthz): AccessState {
  if (a.status === 'banned') return 'banned';
  if (a.status === 'rejected') return 'rejected';
  if (a.status === 'suspended') return 'suspended';
  if (!a.emailVerified) return 'unverified';
  if (a.status === 'pending') return 'pending';
  return 'ok';
}

export function createGuards(ctx: AppContext) {
  const auth: preHandlerAsyncHookHandler = async (req) => {
    if (!req.authz) throw unauthorized();
  };

  /** Approved, verified, not suspended — required by every private API. */
  const approved: preHandlerAsyncHookHandler = async (req) => {
    if (!req.authz) throw unauthorized();
    req.authz = await refreshSuspension(ctx, req.authz);
    const state = accessState(req.authz);
    if (state !== 'ok') throw new AppError(403, `ACCOUNT_${state.toUpperCase()}`, 'Sua conta ainda não tem acesso à comunidade');
    const s = await ctx.settings.get();
    if (s.maintenance.enabled && !ctx.perms.has(req.authz, PERMISSIONS.MANAGE_SETTINGS)) {
      throw new AppError(503, 'MAINTENANCE', s.maintenance.message);
    }
  };

  const perm =
    (...required: Permission[]): preHandlerAsyncHookHandler =>
    async function (this: unknown, req, reply) {
      await approved.call(this as never, req, reply);
      if (!required.some((p) => ctx.perms.has(req.authz!, p))) throw forbidden();
      await enforceOwnerMfa(req);
    };

  const owner: preHandlerAsyncHookHandler = async function (this: unknown, req, reply) {
    await approved.call(this as never, req, reply);
    if (!req.authz!.isOwner) throw forbidden('Apenas o proprietário pode fazer isso');
    await enforceOwnerMfa(req);
  };

  async function enforceOwnerMfa(req: FastifyRequest) {
    const s = await ctx.settings.get();
    if (!s.security.requireOwnerMfa || !req.authz!.isOwner) return;
    const [u] = await ctx.db.select({ totpEnabled: users.totpEnabled }).from(users).where(eq(users.id, req.authz!.id));
    if (!u?.totpEnabled) throw new AppError(403, 'MFA_REQUIRED', 'Ative a autenticação em dois fatores para usar as funções administrativas');
  }

  return { auth, approved, perm, owner };
}

export type Guards = ReturnType<typeof createGuards>;
