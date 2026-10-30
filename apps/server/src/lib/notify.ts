import { eq, inArray } from 'drizzle-orm';
import type { NotificationType } from '@ouroboros/shared';
import type { AppContext } from './context';
import { notifications, userProfiles, users } from '../db/schema';
import { mailTemplate } from './mailer';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}

/** Persists an in-app notification, pushes it in real time and optionally e-mails it. */
export async function notify(ctx: AppContext, userIds: string[], n: NotifyInput, opts: { email?: boolean } = {}) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const rows = await ctx.db
    .insert(notifications)
    .values(ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? '', link: n.link, data: n.data ?? {} })))
    .returning();
  for (const row of rows) ctx.realtime.toUser(row.userId, 'notification:new', row);

  if (!opts.email) return;
  const recipients = await ctx.db
    .select({ email: users.email, prefs: userProfiles.preferences })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(inArray(users.id, ids));
  const s = await ctx.settings.get();
  for (const r of recipients) {
    const prefs = (r.prefs ?? {}) as { notifications?: { email?: boolean } };
    if (!r.email || prefs.notifications?.email === false) continue;
    const mail = mailTemplate(s.communityName, n.title, [n.body ?? ''], n.link ? { label: 'Abrir', url: new URL(n.link, ctx.config.APP_URL).toString() } : undefined);
    ctx.mailer.send({ to: r.email, subject: `[${s.communityName}] ${n.title}`, ...mail }).catch((err) => ctx.log.error({ err }, 'mail failed'));
  }
}
