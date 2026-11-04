import { and, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import type { AppContext } from '../lib/context';
import { files } from '../db/schema';

/**
 * Shared listening state per voice channel. The server is the clock: every client
 * in the room plays the same private audio file seeked to (now - startedAt).
 */
export interface MusicState {
  channelId: string;
  current: { fileId: string; name: string; startedAt: number; requestedBy: string } | null;
  pausedAt: number | null;
  queue: { fileId: string; name: string; requestedBy: string }[];
}

const key = (channelId: string) => `music:${channelId}`;

export async function getMusic(ctx: AppContext, channelId: string): Promise<MusicState> {
  const raw = await ctx.redis.get(key(channelId));
  return raw ? (JSON.parse(raw) as MusicState) : { channelId, current: null, pausedAt: null, queue: [] };
}

export async function setMusic(ctx: AppContext, state: MusicState) {
  if (!state.current && !state.queue.length) await ctx.redis.del(key(state.channelId));
  else await ctx.redis.set(key(state.channelId), JSON.stringify(state), 'EX', 86400);
  ctx.realtime.toChannel(state.channelId, 'music:state', { ...state, serverTime: Date.now() });
  return state;
}

/** Audio the requester may use: uploaded music/library audio in channels they can see. */
export async function findTracks(ctx: AppContext, visibleChannelIds: string[], search?: string) {
  if (!visibleChannelIds.length) return [];
  return ctx.db
    .select({ id: files.id, name: files.originalName, channelId: files.channelId })
    .from(files)
    .where(
      and(
        eq(files.category, 'audio'),
        isNull(files.deletedAt),
        inArray(files.purpose, ['music', 'library']),
        inArray(files.channelId, visibleChannelIds),
        search ? or(ilike(files.originalName, `%${search.replace(/[%_]/g, '')}%`)) : undefined,
      ),
    )
    .limit(25);
}

export async function advance(ctx: AppContext, channelId: string) {
  const s = await getMusic(ctx, channelId);
  const next = s.queue.shift();
  s.current = next ? { ...next, startedAt: Date.now() + 1500 } : null;
  s.pausedAt = null;
  return setMusic(ctx, s);
}
