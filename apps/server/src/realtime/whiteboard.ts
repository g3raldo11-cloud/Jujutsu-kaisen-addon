import { eq } from 'drizzle-orm';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import { PERMISSIONS, type Permission } from '@ouroboros/shared';
import type { AppContext } from '../lib/context';
import { whiteboardStrokes } from '../db/schema';

const strokeSchema = z.object({
  id: z.string().max(40),
  tool: z.enum(['pen', 'eraser', 'line', 'rect', 'ellipse', 'text']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(1).max(60),
  points: z.array(z.tuple([z.number(), z.number()])).max(2000),
  text: z.string().max(500).optional(),
});

/** Collaborative whiteboard per channel: strokes are validated, persisted and broadcast. */
export function registerWhiteboardHandlers(ctx: AppContext, socket: Socket) {
  const userId = socket.data.userId as string;
  let budget = 0;
  const refill = setInterval(() => (budget = 0), 1000);
  socket.on('disconnect', () => clearInterval(refill));

  const allowed = async (channelId: string, perm: Permission = PERMISSIONS.SEND_MESSAGES) => {
    const a = await ctx.perms.getUser(userId);
    if (!a) return false;
    const { perms } = await ctx.perms.channelPermsById(a, channelId);
    return perms.has(perm);
  };

  socket.on('wb:stroke', async (payload: { channelId?: string; stroke?: unknown }) => {
    if (typeof payload?.channelId !== 'string' || ++budget > 30) return;
    const parsed = strokeSchema.safeParse(payload.stroke);
    if (!parsed.success || !(await allowed(payload.channelId))) return;
    await ctx.db.insert(whiteboardStrokes).values({ channelId: payload.channelId, userId, data: parsed.data });
    socket.to(`channel:${payload.channelId}`).emit('wb:stroke', { channelId: payload.channelId, stroke: parsed.data, userId });
  });

  socket.on('wb:cursor', (payload: { channelId?: string; x?: number; y?: number }) => {
    if (typeof payload?.channelId !== 'string' || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
    if (!socket.rooms.has(`channel:${payload.channelId}`)) return;
    socket.to(`channel:${payload.channelId}`).volatile.emit('wb:cursor', { channelId: payload.channelId, userId, x: payload.x, y: payload.y });
  });

  socket.on('wb:clear', async (payload: { channelId?: string }) => {
    if (typeof payload?.channelId !== 'string' || !(await allowed(payload.channelId, PERMISSIONS.MANAGE_MESSAGES))) return;
    await ctx.db.delete(whiteboardStrokes).where(eq(whiteboardStrokes.channelId, payload.channelId));
    socket.nsp.to(`channel:${payload.channelId}`).emit('wb:clear', { channelId: payload.channelId });
  });
}
