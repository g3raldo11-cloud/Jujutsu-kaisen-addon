import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { AppContext } from './context';
import { auditLogs, eventParticipants, events, messages, reminders, scheduledMessages, sessions } from '../db/schema';
import { notify } from './notify';
import { createMessage } from '../modules/messages';
import { purgeDeletedFiles } from '../modules/files';
import { nextOccurrence } from '../modules/events';

/**
 * Background jobs: scheduled messages, reminders, event reminders, retention policy.
 * A Redis lock ensures only one instance runs each tick.
 */
export function startScheduler(ctx: AppContext) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const lock = await ctx.redis.set('scheduler:lock', '1', 'EX', 25, 'NX');
      if (!lock) return;
      await runDueJobs(ctx);
    } catch (err) {
      ctx.log.error({ err }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };
  const t = setInterval(tick, 15_000);
  t.unref();
  const daily = setInterval(() => runRetention(ctx).catch((err) => ctx.log.error({ err }, 'retention failed')), 6 * 3600_000);
  daily.unref();
  setTimeout(tick, 2000).unref();
  return () => {
    clearInterval(t);
    clearInterval(daily);
  };
}

export async function runDueJobs(ctx: AppContext) {
  const now = new Date();

  const due = await ctx.db.select().from(scheduledMessages).where(and(isNull(scheduledMessages.sentAt), lte(scheduledMessages.sendAt, now))).limit(50);
  for (const m of due) {
    const [claimed] = await ctx.db.update(scheduledMessages).set({ sentAt: now }).where(and(eq(scheduledMessages.id, m.id), isNull(scheduledMessages.sentAt))).returning();
    if (!claimed) continue;
    const a = await ctx.perms.getUser(m.authorId);
    if (!a || a.status !== 'approved') continue;
    const { perms } = await ctx.perms.channelPermsById(a, m.channelId);
    if (!perms.has('send_messages')) {
      await notify(ctx, [m.authorId], { type: 'reminder', title: 'Mensagem agendada não enviada', body: 'Você não tem mais permissão para enviar mensagens nesse canal.' });
      continue;
    }
    await createMessage(ctx, { channelId: m.channelId, authorId: m.authorId, content: m.content });
  }

  const rem = await ctx.db.select().from(reminders).where(and(isNull(reminders.sentAt), lte(reminders.remindAt, now))).limit(100);
  for (const r of rem) {
    const [claimed] = await ctx.db.update(reminders).set({ sentAt: now }).where(and(eq(reminders.id, r.id), isNull(reminders.sentAt))).returning();
    if (!claimed) continue;
    await notify(ctx, [r.userId], { type: 'reminder', title: '⏰ Lembrete', body: r.content, link: r.channelId ? `/app/c/${r.channelId}` : undefined });
  }

  // Event reminders for participants, honouring each event's reminder offsets.
  const upcoming = await ctx.db
    .select()
    .from(events)
    .where(and(isNull(events.cancelledAt), gte(events.startsAt, new Date(now.getTime() - 60_000)), lte(events.startsAt, new Date(now.getTime() + 7 * 86400_000))));
  for (const ev of upcoming) {
    for (const minutes of ev.reminderMinutes) {
      const at = ev.startsAt.getTime() - minutes * 60_000;
      if (at > now.getTime()) continue;
      const tag = `${ev.startsAt.toISOString()}:${minutes}`;
      const parts = await ctx.db
        .select()
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, ev.id), sql`not (${tag} = any(${eventParticipants.remindedFor}))`));
      if (!parts.length) continue;
      await ctx.db
        .update(eventParticipants)
        .set({ remindedFor: sql`array_append(${eventParticipants.remindedFor}, ${tag})` })
        .where(and(eq(eventParticipants.eventId, ev.id), sql`not (${tag} = any(${eventParticipants.remindedFor}))`));
      await notify(ctx, parts.map((p) => p.userId), {
        type: 'event',
        title: minutes === 0 ? `Começando agora: ${ev.title}` : `Em ${minutes} min: ${ev.title}`,
        body: ev.location || ev.description.slice(0, 120),
        link: ev.channelId ? `/app/c/${ev.channelId}` : `/app/events`,
        data: { eventId: ev.id },
      });
      ctx.bus.emit('event.starting', { event: ev, minutes });
    }
  }

  // Roll recurring events forward once they finish.
  const finished = await ctx.db
    .select()
    .from(events)
    .where(and(isNull(events.cancelledAt), sql`${events.recurrence} <> 'none'`, lte(sql`coalesce(${events.endsAt}, ${events.startsAt} + interval '1 hour')`, now)));
  for (const ev of finished) {
    const next = nextOccurrence(ev.startsAt, ev.recurrence as 'daily' | 'weekly' | 'monthly', now);
    if (ev.recurrenceUntil && next > ev.recurrenceUntil) {
      await ctx.db.update(events).set({ recurrence: 'none' }).where(eq(events.id, ev.id));
      continue;
    }
    const duration = ev.endsAt ? ev.endsAt.getTime() - ev.startsAt.getTime() : null;
    await ctx.db
      .update(events)
      .set({ startsAt: next, endsAt: duration !== null ? new Date(next.getTime() + duration) : null })
      .where(eq(events.id, ev.id));
    ctx.realtime.toMembers('events:updated', {});
  }
}

/** Applies the data-retention policy configured by the owner. */
export async function runRetention(ctx: AppContext) {
  const s = await ctx.settings.get();
  if (s.retention.messageDays > 0) {
    const cutoff = new Date(Date.now() - s.retention.messageDays * 86400_000);
    await ctx.db.delete(messages).where(and(lte(messages.createdAt, cutoff), sql`${messages.pinnedAt} is null`));
  }
  await ctx.db.delete(auditLogs).where(lte(auditLogs.createdAt, new Date(Date.now() - s.retention.auditLogDays * 86400_000)));
  await ctx.db.delete(sessions).where(lte(sessions.expiresAt, new Date(Date.now() - 7 * 86400_000)));
  await purgeDeletedFiles(ctx, s.retention.deletedFileDays);
}
