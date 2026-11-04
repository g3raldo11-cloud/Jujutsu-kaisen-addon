import type { AppContext } from '../lib/context';

/**
 * Presence lives in Redis so it is shared across instances:
 *   presence:online      SET of user ids with ≥1 connected socket
 *   presence:conn:{id}   connection counter
 *   presence:mode        HASH user id → online | idle | dnd | invisible
 */
export async function markOnline(ctx: AppContext, userId: string) {
  const n = await ctx.redis.incr(`presence:conn:${userId}`);
  await ctx.redis.expire(`presence:conn:${userId}`, 86400);
  await ctx.redis.sadd('presence:online', userId);
  return n === 1;
}

export async function markOffline(ctx: AppContext, userId: string) {
  const n = await ctx.redis.decr(`presence:conn:${userId}`);
  if (n <= 0) {
    await ctx.redis.del(`presence:conn:${userId}`);
    await ctx.redis.srem('presence:online', userId);
    return true;
  }
  return false;
}

export async function onlineUserIds(ctx: AppContext) {
  return new Set(await ctx.redis.smembers('presence:online'));
}

export async function presenceOf(ctx: AppContext, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const vals = await ctx.redis.hmget('presence:mode', ...ids);
  const out: Record<string, string> = {};
  ids.forEach((id, i) => {
    const v = vals[i] ?? 'online';
    out[id] = v === 'invisible' ? 'offline' : v;
  });
  return out;
}

/** Clears presence state on boot (single-node deployments; multi-node uses heartbeats to self-heal). */
export async function resetPresence(ctx: AppContext) {
  const keys = await ctx.redis.keys('presence:conn:*');
  if (keys.length) await ctx.redis.del(...keys);
  await ctx.redis.del('presence:online');
  const vkeys = await ctx.redis.keys('voice:room:*');
  if (vkeys.length) await ctx.redis.del(...vkeys);
}
