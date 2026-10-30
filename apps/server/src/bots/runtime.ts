import { and, eq, inArray, sql } from 'drizzle-orm';
import { CHANNEL_TYPES, PERMISSIONS } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import { botCommands, botPermissions, bots, channelMembers, channels, reactions, userProfiles, users } from '../db/schema';
import { createMessage, createPoll, type HydratedMessage } from '../modules/messages';

export type BotRow = typeof bots.$inferSelect & { username: string; displayName: string };

export interface BotConfig {
  channelMode?: 'all' | 'selected';
  permissions?: string[];
  autoMessages?: { channelId: string; content: string; everyMinutes: number }[];
  listenMessages?: boolean;
  [key: string]: unknown;
}

export const cfg = (b: BotRow) => (b.config ?? {}) as BotConfig;

/** Loads all bots with their user info (small table, cached briefly). */
let cache: { at: number; rows: BotRow[] } | null = null;
export async function loadBots(ctx: AppContext, fresh = false): Promise<BotRow[]> {
  if (!fresh && cache && Date.now() - cache.at < 5000) return cache.rows;
  const rows = await ctx.db
    .select({ bot: bots, username: users.username, displayName: userProfiles.displayName })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id));
  cache = { at: Date.now(), rows: rows.map((r) => ({ ...r.bot, username: r.username, displayName: r.displayName ?? r.username })) };
  return cache.rows;
}
export const invalidateBots = () => (cache = null);

/** Channel authorization: either every community channel, or the explicit list in bot_permissions. */
export async function botCanUse(ctx: AppContext, bot: BotRow, channelId: string, perm: string = PERMISSIONS.SEND_MESSAGES) {
  if (!bot.enabled) return false;
  const [ch] = await ctx.db.select().from(channels).where(eq(channels.id, channelId));
  if (!ch) return false;
  const c = cfg(bot);
  if (perm !== PERMISSIONS.SEND_MESSAGES && perm !== PERMISSIONS.ADD_REACTIONS && !(c.permissions ?? []).includes(perm)) return false;
  // Private conversations: only the ones the bot itself takes part in.
  if (ch.type === 'dm' || ch.type === 'group_dm' || ch.type === 'ticket') {
    const [m] = await ctx.db.select().from(channelMembers).where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, bot.userId)));
    return !!m;
  }
  if (!CHANNEL_TYPES.includes(ch.type as never)) return false;
  if (ch.type === 'admin' && !(c.permissions ?? []).includes('admin_channels')) {
    const [row] = await ctx.db.select().from(botPermissions).where(and(eq(botPermissions.botId, bot.id), eq(botPermissions.channelId, channelId)));
    return !!row;
  }
  if ((c.channelMode ?? 'all') === 'all') return true;
  const [row] = await ctx.db.select().from(botPermissions).where(and(eq(botPermissions.botId, bot.id), eq(botPermissions.channelId, channelId)));
  return !!row && (row.permissions.length === 0 || row.permissions.includes(perm));
}

export async function botAuthorizedChannels(ctx: AppContext, botId: string) {
  return (await ctx.db.select().from(botPermissions).where(eq(botPermissions.botId, botId))).map((r) => r.channelId);
}

/** Posts as a bot after checking channel authorization. Returns null when not allowed. */
export async function botSay(ctx: AppContext, bot: BotRow, channelId: string, content: string, opts: { threadId?: string | null; replyToId?: bigint | null; metadata?: Record<string, unknown> } = {}) {
  if (!(await botCanUse(ctx, bot, channelId))) return null;
  const text = content.slice(0, 4000);
  if (!text.trim()) return null;
  await ctx.db.update(bots).set({ lastRunAt: new Date() }).where(eq(bots.id, bot.id));
  return createMessage(ctx, {
    channelId,
    authorId: bot.userId,
    content: text,
    type: 'bot',
    threadId: opts.threadId ?? null,
    replyToId: opts.replyToId ?? null,
    metadata: { botId: bot.id, ...(opts.metadata ?? {}) },
    // Bots may only mention everyone when explicitly granted.
    skipMentions: !(cfg(bot).permissions ?? []).includes(PERMISSIONS.MENTION_EVERYONE) && /@(todos|everyone|here|aqui)\b/i.test(text),
  });
}

export async function botReact(ctx: AppContext, bot: BotRow, message: HydratedMessage, emoji: string) {
  if (!(await botCanUse(ctx, bot, message.channelId, PERMISSIONS.ADD_REACTIONS))) return;
  await ctx.db.insert(reactions).values({ messageId: BigInt(message.id), userId: bot.userId, emoji }).onConflictDoNothing();
  ctx.realtime.toChannel(message.channelId, 'reaction:add', { messageId: message.id, channelId: message.channelId, emoji, userId: bot.userId });
}

export async function botPoll(ctx: AppContext, bot: BotRow, channelId: string, question: string, options: string[], durationHours = 0) {
  if (!(await botCanUse(ctx, bot, channelId))) return null;
  return createPoll(ctx, channelId, bot.userId, { question, options, multiple: false, anonymous: false, durationHours });
}

/** Opens (or reuses) a direct conversation between a bot and a member. */
export async function botDm(ctx: AppContext, bot: BotRow, userId: string) {
  const existing = await ctx.pool.query<{ id: string }>(
    `select c.id from channels c
      join channel_members a on a.channel_id = c.id and a.user_id = $1
      join channel_members b on b.channel_id = c.id and b.user_id = $2
     where c.type = 'dm' limit 1`,
    [bot.userId, userId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const [c] = await ctx.db.insert(channels).values({ type: 'dm', name: '', createdById: bot.userId }).returning();
  await ctx.db.insert(channelMembers).values([{ channelId: c.id, userId: bot.userId }, { channelId: c.id, userId }]);
  ctx.perms.invalidateUser(userId);
  await ctx.realtime.resyncUser(userId);
  ctx.realtime.toUser(userId, 'conversations:updated', {});
  return c.id;
}

/** Splits "a \"b c\" d" into ['a', 'b c', 'd']. */
export function parseArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|“([^”]*)”|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return out;
}

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl
    .replace(/\{random:([^}]+)\}/g, (_m, opts: string) => {
      const list = opts.split('|');
      return list[Math.floor(Math.random() * list.length)] ?? '';
    })
    .replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export async function commandsOf(ctx: AppContext, botIds: string[]) {
  if (!botIds.length) return [];
  return ctx.db.select().from(botCommands).where(inArray(botCommands.botId, botIds));
}

export async function setBotError(ctx: AppContext, botId: string, error: string | null) {
  await ctx.db.update(bots).set({ lastError: error ? error.slice(0, 500) : null, lastRunAt: new Date() }).where(eq(bots.id, botId));
}

export async function saveBotStorage(ctx: AppContext, botId: string, storage: Record<string, unknown>) {
  await ctx.db.update(bots).set({ storage }).where(eq(bots.id, botId));
  invalidateBots();
}

export const sqlNow = sql`now()`;
