import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eventSchema, PERMISSIONS } from '@enclave/shared';
import type { AppContext } from '../lib/context';
import type { Guards } from '../lib/auth';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { body, query, uuidParam } from '../lib/http';
import { grantAchievement } from '../lib/gamification';
import { notify } from '../lib/notify';
import { getPublicUsers } from '../lib/users';
import { eventParticipants, events, users } from '../db/schema';

export function nextOccurrence(start: Date, recurrence: 'daily' | 'weekly' | 'monthly', after: Date) {
  const d = new Date(start);
  let guard = 0;
  while (d <= after && guard++ < 1000) {
    if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

/** Expands recurring events into concrete occurrences inside [from, to]. */
function expand(ev: typeof events.$inferSelect, from: Date, to: Date) {
  const out: { startsAt: Date; endsAt: Date | null }[] = [];
  const duration = ev.endsAt ? ev.endsAt.getTime() - ev.startsAt.getTime() : null;
  let cur = new Date(ev.startsAt);
  for (let i = 0; i < 400 && cur <= to; i++) {
    if (ev.recurrenceUntil && cur > ev.recurrenceUntil) break;
    if (cur >= from) out.push({ startsAt: new Date(cur), endsAt: duration !== null ? new Date(cur.getTime() + duration) : null });
    if (ev.recurrence === 'none') break;
    cur = nextOccurrence(cur, ev.recurrence as 'daily' | 'weekly' | 'monthly', cur);
  }
  return out;
}

/** ICS export (RFC 5545) for calendar integration. */
function toIcs(list: (typeof events.$inferSelect)[], appUrl: string, community: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(community)}//Enclave//PT`, 'CALSCALE:GREGORIAN'];
  for (const e of list) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@enclave`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(e.startsAt)}`);
    if (e.endsAt) lines.push(`DTEND:${fmt(e.endsAt)}`);
    lines.push(`SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description)}`, `URL:${appUrl}/app/events`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.recurrence !== 'none') {
      const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[e.recurrence];
      lines.push(`RRULE:FREQ=${freq}${e.recurrenceUntil ? `;UNTIL=${fmt(e.recurrenceUntil)}` : ''}`);
    }
    for (const m of e.reminderMinutes) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function eventRoutes(app: FastifyInstance, ctx: AppContext, g: Guards) {
  const P = PERMISSIONS;
  const approved = { preHandler: g.approved };

  async function canSeeEvent(a: NonNullable<Awaited<ReturnType<typeof ctx.perms.getUser>>>, e: typeof events.$inferSelect) {
    if (!e.channelId) return true;
    const { perms } = await ctx.perms.channelPermsById(a, e.channelId);
    return perms.has(P.VIEW_CHANNEL);
  }

  async function serialize(list: (typeof events.$inferSelect)[], viewerId: string) {
    const ids = list.map((e) => e.id);
    const parts = ids.length ? await ctx.db.select().from(eventParticipants).where(inArray(eventParticipants.eventId, ids)) : [];
    return list.map((e) => ({
      ...e,
      participants: parts.filter((p) => p.eventId === e.id).map((p) => ({ userId: p.userId, status: p.status })),
      myStatus: parts.find((p) => p.eventId === e.id && p.userId === viewerId)?.status ?? null,
    }));
  }

  app.get('/api/events', approved, async (req) => {
    const q = query(req, z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }));
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 86400_000);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 60 * 86400_000);
    if (to.getTime() - from.getTime() > 400 * 86400_000) throw badRequest('Intervalo grande demais');
    const rows = await ctx.db
      .select()
      .from(events)
      .where(and(isNull(events.cancelledAt), lte(events.startsAt, to), sql`(${events.recurrence} <> 'none' or coalesce(${events.endsAt}, ${events.startsAt}) >= ${from})`))
      .orderBy(asc(events.startsAt));
    const visible = [];
    for (const e of rows) if (await canSeeEvent(req.authz!, e)) visible.push(e);
    const ser = await serialize(visible, req.authz!.id);
    const occurrences = ser.flatMap((e) => expand(e, from, to).map((o) => ({ ...e, occurrenceStart: o.startsAt, occurrenceEnd: o.endsAt })));
    occurrences.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
    return { events: occurrences, users: await getPublicUsers(ctx, [...new Set(ser.flatMap((e) => [e.createdById!, ...e.participants.map((p) => p.userId)]))].filter(Boolean)) };
  });

  app.get('/api/events/calendar.ics', approved, async (req, reply) => {
    const rows = await ctx.db.select().from(events).where(and(isNull(events.cancelledAt), gte(events.startsAt, new Date(Date.now() - 30 * 86400_000))));
    const visible = [];
    for (const e of rows) if (await canSeeEvent(req.authz!, e)) visible.push(e);
    const s = await ctx.settings.get();
    reply.header('Content-Type', 'text/calendar; charset=utf-8').header('Content-Disposition', 'attachment; filename="eventos.ics"');
    return toIcs(visible, ctx.config.APP_URL, s.communityName);
  });

  app.post('/api/events', { preHandler: g.perm(P.MANAGE_EVENTS) }, async (req) => {
    const input = body(req, eventSchema);
    if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) throw badRequest('O término deve ser depois do início');
    if (input.channelId) {
      const { perms } = await ctx.perms.channelPermsById(req.authz!, input.channelId);
      if (!perms.has(P.VIEW_CHANNEL)) throw badRequest('Canal inválido');
    }
    const [e] = await ctx.db
      .insert(events)
      .values({
        ...input,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        recurrenceUntil: input.recurrenceUntil ? new Date(input.recurrenceUntil) : null,
        channelId: input.channelId ?? null,
        createdById: req.authz!.id,
      })
      .returning();
    await ctx.db.insert(eventParticipants).values({ eventId: e.id, userId: req.authz!.id });
    await audit(ctx, { actorId: req.authz!.id, action: 'event.create', targetType: 'event', targetId: e.id, ip: req.ip, metadata: { title: e.title } });
    ctx.realtime.toMembers('events:updated', {});
    ctx.bus.emit('event.created', { event: e });
    return e;
  });

  app.patch('/api/events/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const input = body(req, eventSchema.partial());
    const [e] = await ctx.db.select().from(events).where(eq(events.id, id));
    if (!e) throw notFound();
    if (e.createdById !== req.authz!.id && !ctx.perms.has(req.authz!, P.MANAGE_EVENTS)) throw forbidden();
    const [u] = await ctx.db
      .update(events)
      .set({
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null,
        recurrenceUntil: input.recurrenceUntil === undefined ? undefined : input.recurrenceUntil ? new Date(input.recurrenceUntil) : null,
      })
      .where(eq(events.id, id))
      .returning();
    const parts = await ctx.db.select().from(eventParticipants).where(eq(eventParticipants.eventId, id));
    await notify(ctx, parts.map((p) => p.userId).filter((x) => x !== req.authz!.id), { type: 'event', title: `Evento atualizado: ${u.title}`, link: '/app/events', data: { eventId: id } });
    ctx.realtime.toMembers('events:updated', {});
    return u;
  });

  app.delete('/api/events/:id', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const [e] = await ctx.db.select().from(events).where(eq(events.id, id));
    if (!e) throw notFound();
    if (e.createdById !== req.authz!.id && !ctx.perms.has(req.authz!, P.MANAGE_EVENTS)) throw forbidden();
    await ctx.db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, id));
    const parts = await ctx.db.select().from(eventParticipants).where(eq(eventParticipants.eventId, id));
    await notify(ctx, parts.map((p) => p.userId).filter((x) => x !== req.authz!.id), { type: 'event', title: `Evento cancelado: ${e.title}`, link: '/app/events' });
    await audit(ctx, { actorId: req.authz!.id, action: 'event.cancel', targetType: 'event', targetId: id, ip: req.ip, metadata: { title: e.title } });
    ctx.realtime.toMembers('events:updated', {});
    return { ok: true };
  });

  app.put('/api/events/:id/rsvp', approved, async (req) => {
    const id = uuidParam(req, 'id');
    const { status } = body(req, z.object({ status: z.enum(['going', 'interested', 'none']) }));
    const [e] = await ctx.db.select().from(events).where(eq(events.id, id));
    if (!e || e.cancelledAt || !(await canSeeEvent(req.authz!, e))) throw notFound();
    if (status === 'none') {
      await ctx.db.delete(eventParticipants).where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.userId, req.authz!.id)));
    } else {
      if (status === 'going' && e.capacity > 0) {
        const [{ n }] = await ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(eventParticipants)
          .where(and(eq(eventParticipants.eventId, id), eq(eventParticipants.status, 'going'), sql`${eventParticipants.userId} <> ${req.authz!.id}`));
        if (n >= e.capacity) throw badRequest('As vagas deste evento estão esgotadas');
      }
      await ctx.db
        .insert(eventParticipants)
        .values({ eventId: id, userId: req.authz!.id, status })
        .onConflictDoUpdate({ target: [eventParticipants.eventId, eventParticipants.userId], set: { status } });
      await grantAchievement(ctx, req.authz!.id, 'event_goer');
    }
    ctx.realtime.toMembers('events:updated', {});
    return { ok: true };
  });

  void users;
}
