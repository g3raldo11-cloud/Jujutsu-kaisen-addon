import { eq, inArray } from 'drizzle-orm';
import type { AppContext } from './context';
import { userProfiles, userRoles, users } from '../db/schema';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarFileId: string | null;
  profileColor: string;
  bio: string;
  pronouns: string;
  customStatus: string;
  isBot: boolean;
  isOwner: boolean;
  roleIds: string[];
  level: number;
  xp: number;
  createdAt: Date;
}

const columns = {
  id: users.id,
  username: users.username,
  isBot: users.isBot,
  isOwner: users.isOwner,
  createdAt: users.createdAt,
  displayName: userProfiles.displayName,
  avatarFileId: userProfiles.avatarFileId,
  profileColor: userProfiles.profileColor,
  bio: userProfiles.bio,
  pronouns: userProfiles.pronouns,
  customStatus: userProfiles.customStatus,
  level: userProfiles.level,
  xp: userProfiles.xp,
};

type Row = { [K in keyof typeof columns]: any };

function toPublic(r: Row, roleIds: string[]): PublicUser {
  return {
    id: r.id,
    username: r.username,
    displayName: r.displayName || r.username,
    avatarFileId: r.avatarFileId ?? null,
    profileColor: r.profileColor ?? '#7c6cf2',
    bio: r.bio ?? '',
    pronouns: r.pronouns ?? '',
    customStatus: r.customStatus ?? '',
    isBot: r.isBot,
    isOwner: r.isOwner,
    roleIds,
    level: r.level ?? 1,
    xp: r.xp ?? 0,
    createdAt: r.createdAt,
  };
}

export async function getPublicUsers(ctx: AppContext, ids: string[]): Promise<PublicUser[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const rows = await ctx.db.select(columns).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(inArray(users.id, unique));
  const roleRows = await ctx.db.select().from(userRoles).where(inArray(userRoles.userId, unique));
  return rows.map((r) => toPublic(r, roleRows.filter((x) => x.userId === r.id).map((x) => x.roleId)));
}

export async function getPublicUser(ctx: AppContext, id: string) {
  return (await getPublicUsers(ctx, [id]))[0] ?? null;
}

/** All approved members (and bots) for member lists. */
export async function listMembers(ctx: AppContext): Promise<PublicUser[]> {
  const rows = await ctx.db
    .select(columns)
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.status, 'approved'));
  const roleRows = await ctx.db.select().from(userRoles);
  return rows.map((r) => toPublic(r, roleRows.filter((x) => x.userId === r.id).map((x) => x.roleId)));
}
