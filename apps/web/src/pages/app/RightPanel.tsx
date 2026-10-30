import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, X } from 'lucide-react';
import { CHANNEL_TYPE_LABELS } from '@ouroboros/shared';
import { get } from '../../lib/api';
import { useStore } from '../../lib/store';
import { cx, dateTime, timeAgo } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { Avatar, UserName } from '../../components/ui';
import { ProfilePopover } from './Profile';
import type { PublicUser } from '../../lib/types';

export function RightPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const location = useLocation();
  const channelId = location.pathname.match(/\/app\/c\/([^/?#]+)/)?.[1];
  const channel = useStore((s) => (channelId ? s.channels[channelId] : null));
  const users = useStore((s) => s.users);
  const presence = useStore((s) => s.presence);
  const roles = useStore((s) => s.roles);
  const bots = useStore((s) => s.bots);
  const conversations = useStore((s) => s.conversations);
  const navigate = useNavigate();
  const events = useQuery({ queryKey: ['events', 'upcoming'], queryFn: () => get('/events'), staleTime: 60_000 });
  const activity = useQuery({ queryKey: ['me', 'activity'], queryFn: () => get<any[]>('/me/activity'), staleTime: 60_000 });

  const memberIds = useMemo(() => {
    if (channel && !channel.spaceId) return conversations.find((c) => c.id === channel.id)?.memberIds ?? null;
    return null;
  }, [channel, conversations]);

  const humans = Object.values(users).filter((u) => !u.isBot && (!memberIds || memberIds.includes(u.id)));
  const online = humans.filter((u) => (presence[u.id] ?? 'offline') !== 'offline');
  const offline = humans.filter((u) => (presence[u.id] ?? 'offline') === 'offline');
  const hoisted = roles.filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
  const groups: { name: string; list: PublicUser[] }[] = [];
  const placed = new Set<string>();
  for (const r of hoisted) {
    const list = online.filter((u) => u.roleIds.includes(r.id) && !placed.has(u.id));
    list.forEach((u) => placed.add(u.id));
    if (list.length) groups.push({ name: r.name, list });
  }
  const rest = online.filter((u) => !placed.has(u.id));
  if (rest.length) groups.push({ name: t('Membros online'), list: rest });
  const activeBots = bots.filter((b) => b.enabled && (!channel?.spaceId || b.channelMode === 'all' || b.channelIds.includes(channel?.id ?? '')));

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[272px] flex-col border-l border-line bg-surface shadow-panel xl:static xl:shadow-none">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-[14px] font-semibold">{channel ? (channel.spaceId ? `#${channel.name}` : 'Conversa') : t('Membros')}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar painel">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {channel?.spaceId && (
          <section className="mb-5 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-[12.5px] text-faint">{CHANNEL_TYPE_LABELS[channel.type]}</p>
            {channel.topic && <p className="mt-1 text-[13.5px] leading-snug">{channel.topic}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {channel.isPrivate && <span className="chip">Privado</span>}
              {channel.passwordProtected && <span className="chip">Com senha</span>}
              {channel.slowmodeSeconds > 0 && <span className="chip">Modo lento {channel.slowmodeSeconds}s</span>}
              {channel.isTemporary && <span className="chip">Temporária</span>}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <MemberGroup key={g.name} title={`${g.name} — ${g.list.length}`} users={g.list} />
        ))}
        {offline.length > 0 && <MemberGroup title={`${t('Offline')} — ${offline.length}`} users={offline} dim />}

        {activeBots.length > 0 && (
          <section className="mt-4">
            <h4 className="mb-1.5 px-2 text-[12.5px] font-semibold text-faint">{t('Bots ativos')}</h4>
            {activeBots.map((b) => (
              <MemberRow key={b.id} user={users[b.userId] ?? ({ id: b.userId, username: b.username, displayName: b.displayName, isBot: true, profileColor: b.profileColor, avatarFileId: b.avatarFileId, roleIds: [] } as any)} sub={b.commands.slice(0, 3).map((c) => `/${c.name}`).join(' ')} />
            ))}
          </section>
        )}

        <section className="mt-5">
          <h4 className="mb-1.5 flex items-center justify-between px-2 text-[12.5px] font-semibold text-faint">
            {t('Próximos eventos')}
            <button className="text-[12px] font-normal text-accent hover:underline" onClick={() => navigate('/app/events')}>
              ver agenda
            </button>
          </h4>
          {(events.data?.events ?? []).slice(0, 3).map((e: any) => (
            <button key={`${e.id}-${e.occurrenceStart}`} onClick={() => navigate('/app/events')} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-hover">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{e.title}</span>
                <span className="block text-[12px] text-faint">{dateTime(e.occurrenceStart)}</span>
              </span>
            </button>
          ))}
          {events.data && !events.data.events.length && <p className="px-2 text-[13px] text-faint">Nenhum evento agendado.</p>}
        </section>

        <section className="mt-5">
          <h4 className="mb-1.5 px-2 text-[12.5px] font-semibold text-faint">{t('Atividade recente')}</h4>
          {(activity.data ?? []).slice(0, 5).map((a: any, i: number) => (
            <button key={i} onClick={() => navigate(a.kind === 'post' ? `/app/c/${a.channelId}?post=${a.id}` : `/app/c/${a.channelId}`)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
              <span className="block truncate text-[13px]">{a.kind === 'call' ? '🎙️ ' : a.kind === 'post' ? '📝 ' : '💬 '}{a.title}</span>
              <span className="block truncate text-[12px] text-faint">{a.body || ' '} · {timeAgo(a.at)}</span>
            </button>
          ))}
          {activity.data && !activity.data.length && <p className="px-2 text-[13px] text-faint">Sua atividade aparece aqui.</p>}
        </section>
      </div>
    </aside>
  );
}

function MemberGroup({ title, users, dim }: { title: string; users: PublicUser[]; dim?: boolean }) {
  return (
    <section className={cx('mb-3', dim && 'opacity-60')}>
      <h4 className="mb-1 px-2 text-[12.5px] font-semibold text-faint">{title}</h4>
      {users.slice(0, 200).map((u) => (
        <MemberRow key={u.id} user={u} sub={u.customStatus} />
      ))}
    </section>
  );
}

function MemberRow({ user, sub }: { user: PublicUser; sub?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
        <Avatar user={user} size={32} />
        <span className="min-w-0 flex-1">
          <UserName user={user} className="block truncate text-[14px]" />
          {sub && <span className="block truncate text-[12px] text-faint">{sub}</span>}
        </span>
      </button>
      <ProfilePopover userId={user.id} anchor={ref.current} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
