import type { AppContext } from './context';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Records an administrative action. Failures are logged but never block the action itself. */
export async function audit(ctx: AppContext, e: AuditEntry) {
  try {
    const [row] = await ctx.db
      .insert(auditLogs)
      .values({
        actorId: e.actorId,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata ?? {},
        ip: e.ip ?? null,
      })
      .returning();
    ctx.realtime.toStaff('audit:new', { ...row, id: String(row.id) });
  } catch (err) {
    ctx.log.error({ err, entry: e }, 'failed to write audit log');
  }
}
