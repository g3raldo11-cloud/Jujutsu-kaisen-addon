import type { Server } from 'socket.io';
import { json } from './http';

/** Thin facade so HTTP modules can push events without depending on the socket layer. */
export class Realtime {
  io: Server | null = null;
  resyncHandler: ((userId: string) => Promise<void>) | null = null;

  toUser(userId: string, event: string, data: unknown) {
    this.io?.to(`user:${userId}`).emit(event, json(data));
  }
  toUsers(userIds: string[], event: string, data: unknown) {
    if (!userIds.length) return;
    this.io?.to(userIds.map((id) => `user:${id}`)).emit(event, json(data));
  }
  toChannel(channelId: string, event: string, data: unknown) {
    this.io?.to(`channel:${channelId}`).emit(event, json(data));
  }
  toMembers(event: string, data: unknown) {
    this.io?.to('members').emit(event, json(data));
  }
  toStaff(event: string, data: unknown) {
    this.io?.to('staff').emit(event, json(data));
  }
  /** Re-evaluates which channel rooms a user's sockets belong to (after permission or membership changes). */
  async resyncUser(userId: string) {
    await this.resyncHandler?.(userId);
  }
  async resyncAll() {
    if (!this.io || !this.resyncHandler) return;
    const sockets = await this.io.in('members').fetchSockets();
    const ids = new Set(sockets.map((s) => s.data.userId as string));
    for (const id of ids) await this.resyncHandler(id);
  }
  async disconnectSession(sessionId: string) {
    this.io?.in(`session:${sessionId}`).disconnectSockets(true);
  }
  async disconnectUser(userId: string) {
    this.io?.in(`user:${userId}`).disconnectSockets(true);
  }
}
