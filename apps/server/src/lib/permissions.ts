import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { CHANNEL_PERMISSIONS, PERMISSIONS, type Permission, type UserStatus } from '@enclave/shared';
import type { DB } from '../db/client';
import { channelMembers, channelOverwrites, channels, rolePermissions, roles, userRoles, users } from '../db/schema';

export interface UserAuthz {
  id: string;
  username: string;
  isOwner: boolean;
  isBot: boolean;
  status: UserStatus;
  emailVerified: boolean;
  suspendedUntil: Date | null;
  mutedUntil: Date | null;
  roleIds: string[];
  perms: Set<Permission>;
  topPosition: number;
  memberships: Set<string>;
  loadedAt: number;
}

export interface ChannelInfo {
  id: string;
  spaceId: string | null;
  categoryId: string | null;
  type: string;
  name: string;
  isPrivate: boolean;
  passwordProtected: boolean;
  overwrites: { targetType: string; targetId: string; allow: string[]; deny: string[] }[];
}

const DM_PERMS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.REPLY_MESSAGES,
  PERMISSIONS.ATTACH_FILES,
  PERMISSIONS.ADD_REACTIONS,
  PERMISSIONS.CONNECT_VOICE,
  PERMISSIONS.SPEAK,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SCREEN_SHARE,
];

const SPEAKING_PERMS: Permission[] = [
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.REPLY_MESSAGES,
  PERMISSIONS.ATTACH_FILES,
  PERMISSIONS.ADD_REACTIONS,
  PERMISSIONS.CREATE_POSTS,
  PERMISSIONS.SPEAK,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SCREEN_SHARE,
];

const STAFF_PERMS: Permission[] = [
  PERMISSIONS.MANAGE_MEMBERS,
  PERMISSIONS.BAN_MEMBERS,
  PERMISSIONS.MODERATE_MEMBERS,
  PERMISSIONS.VIEW_REPORTS,
  PERMISSIONS.MANAGE_CHANNELS,
  PERMISSIONS.MANAGE_SETTINGS,
  PERMISSIONS.ADMINISTRATOR,
];

const TTL_MS = 15_000;

/**
 * Computes effective permissions. Every authorization decision on the server goes
 * through this service; the client only receives the result to render UI.
 */
export class PermissionService {
  private users = new Map<string, UserAuthz>();
  private channelCache: Map<string, ChannelInfo> | null = null;

  constructor(private db: DB) {}

  invalidateUser(userId: string) {
    this.users.delete(userId);
  }
  invalidateAllUsers() {
    this.users.clear();
  }
  invalidateChannels() {
    this.channelCache = null;
  }

  async getUser(userId: string): Promise<UserAuthz | null> {
    const cached = this.users.get(userId);
    if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached;

    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) return null;

    const assigned = await this.db
      .select({ id: roles.id, position: roles.position })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    const defaults = await this.db.select({ id: roles.id, position: roles.position }).from(roles).where(eq(roles.isDefault, true));
    const roleList = [...defaults, ...assigned.filter((r) => !defaults.some((d) => d.id === r.id))];
    const roleIds = roleList.map((r) => r.id);
    const permRows = roleIds.length
      ? await this.db.select({ p: rolePermissions.permission }).from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
      : [];
    const memberRows = await this.db.select({ c: channelMembers.channelId }).from(channelMembers).where(eq(channelMembers.userId, userId));

    const authz: UserAuthz = {
      id: u.id,
      username: u.username,
      isOwner: u.isOwner,
      isBot: u.isBot,
      status: u.status,
      emailVerified: !!u.emailVerifiedAt,
      suspendedUntil: u.suspendedUntil,
      mutedUntil: u.mutedUntil,
      roleIds,
      perms: new Set(permRows.map((r) => r.p as Permission)),
      topPosition: u.isOwner ? Number.MAX_SAFE_INTEGER : Math.max(0, ...assigned.map((r) => r.position)),
      memberships: new Set(memberRows.map((r) => r.c)),
      loadedAt: Date.now(),
    };
    this.users.set(userId, authz);
    return authz;
  }

  /** Global permission check. ADMINISTRATOR implies every permission; the owner holds all of them. */
  has(a: UserAuthz, perm: Permission) {
    return a.isOwner || a.perms.has(perm) || a.perms.has(PERMISSIONS.ADMINISTRATOR);
  }

  isStaff(a: UserAuthz) {
    return a.isOwner || STAFF_PERMS.some((p) => a.perms.has(p));
  }

  /** Whether `actor` may moderate `target` (role hierarchy; nobody may act on themselves or the owner). */
  canActOn(actor: UserAuthz, target: UserAuthz) {
    if (actor.id === target.id || target.isOwner) return false;
    if (actor.isOwner) return true;
    return actor.topPosition > target.topPosition;
  }

  isMuted(a: UserAuthz) {
    return !!a.mutedUntil && a.mutedUntil.getTime() > Date.now();
  }

  async channelMap(): Promise<Map<string, ChannelInfo>> {
    if (this.channelCache) return this.channelCache;
    const rows = await this.db.select().from(channels).where(isNotNull(channels.spaceId));
    const ow = await this.db.select().from(channelOverwrites);
    const map = new Map<string, ChannelInfo>();
    for (const c of rows) {
      map.set(c.id, {
        id: c.id,
        spaceId: c.spaceId,
        categoryId: c.categoryId,
        type: c.type,
        name: c.name,
        isPrivate: c.isPrivate,
        passwordProtected: !!c.passwordHash,
        overwrites: [],
      });
    }
    for (const o of ow) map.get(o.channelId)?.overwrites.push(o);
    this.channelCache = map;
    return map;
  }

  async getChannel(channelId: string): Promise<ChannelInfo | null> {
    const cached = (await this.channelMap()).get(channelId);
    if (cached) return cached;
    const [c] = await this.db.select().from(channels).where(eq(channels.id, channelId));
    if (!c) return null;
    return {
      id: c.id,
      spaceId: c.spaceId,
      categoryId: c.categoryId,
      type: c.type,
      name: c.name,
      isPrivate: c.isPrivate,
      passwordProtected: !!c.passwordHash,
      overwrites: [],
    };
  }

  /** Effective permissions of a user inside a channel. Returns an empty set when the channel is not visible. */
  channelPerms(a: UserAuthz, ch: ChannelInfo): Set<Permission> {
    const isMember = a.memberships.has(ch.id);

    if (ch.type === 'dm' || ch.type === 'group_dm') {
      // Private conversations are visible to participants only — not even to the owner.
      return new Set(isMember ? this.applyMute(a, DM_PERMS) : []);
    }

    const all = a.isOwner || a.perms.has(PERMISSIONS.ADMINISTRATOR);
    if (ch.type === 'ticket') {
      const staff = all || this.has(a, PERMISSIONS.MANAGE_MEMBERS) || this.has(a, PERMISSIONS.VIEW_REPORTS);
      if (!isMember && !staff) return new Set();
      const p = new Set<Permission>(DM_PERMS);
      if (staff) p.add(PERMISSIONS.MANAGE_MESSAGES);
      return new Set(this.applyMute(a, [...p]));
    }

    if (all) return new Set(CHANNEL_PERMISSIONS);

    let p = new Set<Permission>(CHANNEL_PERMISSIONS.filter((x) => a.perms.has(x)));
    let explicitView = false;
    let explicitSend = false;
    const roleOw = ch.overwrites.filter((o) => o.targetType === 'role' && a.roleIds.includes(o.targetId));
    const allow = new Set(roleOw.flatMap((o) => o.allow));
    const deny = new Set(roleOw.flatMap((o) => o.deny));
    for (const d of deny) p.delete(d as Permission);
    for (const al of allow) p.add(al as Permission);
    if (allow.has(PERMISSIONS.VIEW_CHANNEL)) explicitView = true;
    if (allow.has(PERMISSIONS.SEND_MESSAGES)) explicitSend = true;
    const userOw = ch.overwrites.find((o) => o.targetType === 'user' && o.targetId === a.id);
    if (userOw) {
      for (const d of userOw.deny) p.delete(d as Permission);
      for (const al of userOw.allow) p.add(al as Permission);
      if (userOw.allow.includes(PERMISSIONS.VIEW_CHANNEL)) explicitView = true;
      if (userOw.allow.includes(PERMISSIONS.SEND_MESSAGES)) explicitSend = true;
    }

    const manager = this.has(a, PERMISSIONS.MANAGE_CHANNELS);
    if (ch.isPrivate && !isMember && !explicitView && !manager) p.delete(PERMISSIONS.VIEW_CHANNEL);
    if (ch.type === 'admin' && !this.isStaff(a) && !isMember && !explicitView) p.delete(PERMISSIONS.VIEW_CHANNEL);
    if (ch.type === 'announcement' && !p.has(PERMISSIONS.MANAGE_MESSAGES) && !explicitSend) {
      p.delete(PERMISSIONS.SEND_MESSAGES);
      p.delete(PERMISSIONS.CREATE_POSTS);
    }
    if (!p.has(PERMISSIONS.VIEW_CHANNEL)) return new Set();
    if (this.isMuted(a)) p = new Set(this.applyMute(a, [...p]));
    return p;
  }

  private applyMute(a: UserAuthz, list: Permission[]) {
    return this.isMuted(a) ? list.filter((x) => !SPEAKING_PERMS.includes(x)) : list;
  }

  async channelPermsById(a: UserAuthz, channelId: string) {
    const ch = await this.getChannel(channelId);
    if (!ch) return { ch: null, perms: new Set<Permission>() };
    return { ch, perms: this.channelPerms(a, ch) };
  }

  /** All channel ids the user can see: community channels plus their private conversations. */
  async visibleChannelIds(a: UserAuthz): Promise<string[]> {
    const ids: string[] = [];
    for (const ch of (await this.channelMap()).values()) if (this.channelPerms(a, ch).has(PERMISSIONS.VIEW_CHANNEL)) ids.push(ch.id);
    if (a.memberships.size) {
      const priv = await this.db
        .select({ id: channels.id })
        .from(channels)
        .where(and(inArray(channels.id, [...a.memberships]), inArray(channels.type, ['dm', 'group_dm', 'ticket'])));
      ids.push(...priv.map((r) => r.id));
    }
    if (this.isStaff(a) || this.has(a, PERMISSIONS.VIEW_REPORTS)) {
      const tickets = await this.db.select({ id: channels.id }).from(channels).where(eq(channels.type, 'ticket'));
      for (const t of tickets) if (!ids.includes(t.id)) ids.push(t.id);
    }
    return ids;
  }
}
