import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Bookmark,
  CalendarDays,
  ChevronDown,
  FileText,
  Flame,
  FolderOpen,
  Hash,
  Headphones,
  HeadphoneOff,
  Image,
  Lock,
  LogOut,
  Megaphone,
  Mic,
  MicOff,
  MessagesSquare,
  NotebookPen,
  PhoneOff,
  Plus,
  Radio,
  Search,
  Settings,
  Shield,
  Sparkles,
  Ticket,
  Users,
  Video,
  Volume2,
  Wifi,
  LifeBuoy,
  ShieldHalf,
} from 'lucide-react';
import { CHANNEL_TYPE_LABELS, CHANNEL_TYPES, type ChannelType } from '@ouroboros/shared';
import { useCan, useStore } from '../../lib/store';
import { patch, post } from '../../lib/api';
import { cx } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { call } from '../../rtc/engine';
import { Avatar, Badge, Field, MenuItem, Modal, Popover, PRESENCE_LABEL, Toggle, UserName } from '../../components/ui';
import { CommunityLogo } from '../../components/Logo';
import { toast, toastError } from '../../components/toast';
import { openSearch, openSettings, useCall } from './AppShell';
import { NotificationsPopover } from './Notifications';
import type { Channel } from '../../lib/types';

export const CHANNEL_ICON: Record<string, typeof Hash> = {
  text: Hash,
  voice: Volume2,
  video: Video,
  forum: MessagesSquare,
  announcement: Megaphone,
  files: FolderOpen,
  gallery: Image,
  events: CalendarDays,
  support: LifeBuoy,
  admin: ShieldHalf,
  stage: Radio,
  ticket: Ticket,
  dm: Hash,
  group_dm: Users,
};

export function ChannelIcon({ channel, className }: { channel: Pick<Channel, 'type' | 'isPrivate' | 'passwordProtected'>; className?: string }) {
  const Icon = CHANNEL_ICON[channel.type] ?? Hash;
  return (
    <span className={cx('relative inline-flex', className)}>
      <Icon className="size-[18px]" />
      {(channel.isPrivate || channel.passwordProtected) && <Lock className="absolute -right-1 -bottom-0.5 size-2.5 rounded-sm bg-surface" />}
    </span>
  );
}

function useActiveSpace() {
  const location = useLocation();
  const channels = useStore((s) => s.channels);
  const spaces = useStore((s) => s.spaces);
  const id = location.pathname.match(/\/app\/c\/([^/?#]+)/)?.[1];
  const ch = id ? channels[id] : null;
  if (ch?.spaceId) return ch.spaceId;
  if (ch) return '@me';
  if (location.pathname === '/app' || location.pathname.startsWith('/app/')) {
    const sp = new URLSearchParams(location.search).get('space');
    if (sp) return sp;
  }
  return location.pathname === '/app' ? (localStorage.getItem('ouroboros:space') ?? spaces[0]?.id ?? '@me') : '@me';
}

export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const active = useActiveSpace();
  return (
    <div className="flex h-dvh">
      <Rail active={active} />
      <div className="flex w-[260px] flex-col border-r border-line bg-surface">
        {active === '@me' ? <HomeNav /> : <SpaceNav spaceId={active} />}
        <VoicePanel />
        <UserPanel onLogout={onLogout} />
      </div>
    </div>
  );
}

function Rail({ active }: { active: string }) {
  const spaces = useStore((s) => s.spaces);
  const channels = useStore((s) => s.channels);
  const conversations = useStore((s) => s.conversations);
  const isStaff = useStore((s) => s.me?.isStaff);
  const canManage = useCan('manage_channels');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const dmUnread = Object.values(channels).filter((c) => !c.spaceId).reduce((n, c) => n + c.unread, 0);
  void conversations;

  const goSpace = (id: string) => {
    localStorage.setItem('ouroboros:space', id);
    const first = Object.values(channels)
      .filter((c) => c.spaceId === id && ['text', 'announcement'].includes(c.type))
      .sort((a, b) => a.position - b.position)[0];
    const last = localStorage.getItem(`ouroboros:last:${id}`);
    navigate(last && channels[last] ? `/app/c/${last}` : first ? `/app/c/${first.id}` : `/app?space=${id}`);
  };

  return (
    <nav className="flex w-[72px] flex-col items-center gap-2 overflow-y-auto bg-rail py-3" aria-label="Espaços">
      <Link to="/app" className="mb-1" title="Início" onClick={() => localStorage.setItem('ouroboros:space', '@me')}>
        <CommunityLogo size={44} />
      </Link>
      <RailButton active={active === '@me'} label="Mensagens diretas" onClick={() => navigate('/app/friends')} badge={dmUnread}>
        <MessagesSquare className="size-5" />
      </RailButton>
      <div className="my-1 h-px w-8 bg-line" />
      {spaces.map((s) => {
        const unread = Object.values(channels).some((c) => c.spaceId === s.id && c.unread > 0);
        const mentions = Object.values(channels).filter((c) => c.spaceId === s.id).reduce((n, c) => n + c.mentions, 0);
        return (
          <RailButton key={s.id} active={active === s.id} label={s.name} onClick={() => goSpace(s.id)} badge={mentions} dot={unread}>
            {s.iconFileId ? <img src={`/api/files/${s.iconFileId}`} alt="" className="size-full rounded-[inherit] object-cover" /> : <span className="font-display text-[15px] font-semibold">{s.name.slice(0, 2)}</span>}
          </RailButton>
        );
      })}
      {canManage && (
        <RailButton label="Criar espaço" onClick={() => setCreating(true)}>
          <Plus className="size-5 text-success" />
        </RailButton>
      )}
      <div className="flex-1" />
      <RailButton label="Pesquisar (Ctrl K)" onClick={openSearch}>
        <Search className="size-5" />
      </RailButton>
      {isStaff && (
        <RailButton label="Painel administrativo" onClick={() => navigate('/admin')}>
          <Shield className="size-5" />
        </RailButton>
      )}
      <CreateSpaceModal open={creating} onClose={() => setCreating(false)} />
    </nav>
  );
}

function RailButton({ active, label, onClick, children, badge, dot }: { active?: boolean; label: string; onClick: () => void; children: ReactNode; badge?: number; dot?: boolean }) {
  return (
    <div className="relative">
      {dot && !active && <span className="absolute top-1/2 -left-3 h-2 w-1 -translate-y-1/2 rounded-r bg-fg" />}
      <button
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'flex size-12 items-center justify-center overflow-hidden rounded-2xl transition-all',
          active ? 'bg-accent-soft text-accent ring-2 ring-accent ring-offset-2 ring-offset-rail' : 'bg-surface text-muted hover:rounded-xl hover:bg-hover hover:text-fg',
        )}
      >
        {children}
      </button>
      {!!badge && <Badge n={badge} className="absolute -right-1 -bottom-1 border-2 border-rail" />}
    </div>
  );
}

function NavLink({ to, icon, children, badge, active }: { to: string; icon: ReactNode; children: ReactNode; badge?: number; active?: boolean }) {
  const location = useLocation();
  const on = active ?? location.pathname === to;
  return (
    <Link to={to} className={cx('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[14.5px]', on ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
      <span className="[&>svg]:size-[18px]">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {!!badge && <Badge n={badge} />}
    </Link>
  );
}

function HomeNav() {
  const t = useT();
  const conversations = useStore((s) => s.conversations);
  const users = useStore((s) => s.users);
  const channels = useStore((s) => s.channels);
  const meId = useStore((s) => s.me?.user.id);
  const location = useLocation();
  const [group, setGroup] = useState(false);
  const tickets = Object.values(channels).filter((c) => c.type === 'ticket');
  return (
    <>
      <div className="flex h-12 items-center border-b border-line px-4 font-display text-[15px] font-semibold">{t('Início')}</div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <NavLink to="/app/friends" icon={<Users />}>
          {t('Amigos')}
        </NavLink>
        <NavLink to="/app/events" icon={<CalendarDays />}>
          {t('Eventos')}
        </NavLink>
        <NavLink to="/app/popular" icon={<Flame />}>
          {t('Discussões populares')}
        </NavLink>
        <NavLink to="/app/notes" icon={<NotebookPen />}>
          {t('Notas')}
        </NavLink>
        <NavLink to="/app/favorites" icon={<Bookmark />}>
          {t('Favoritos')}
        </NavLink>
        <NavLink to="/app/activity" icon={<Activity />}>
          {t('Histórico de atividades')}
        </NavLink>
        <NavLink to="/app/changelog" icon={<Sparkles />}>
          {t('Novidades')}
        </NavLink>
        <NavLink to="/app/status" icon={<Wifi />}>
          {t('Status do servidor')}
        </NavLink>

        {tickets.length > 0 && (
          <>
            <p className="px-2 pt-4 pb-1 text-[12.5px] font-semibold text-faint">Tickets de suporte</p>
            {tickets.map((c) => (
              <NavLink key={c.id} to={`/app/c/${c.id}`} icon={<Ticket />} badge={c.unread}>
                <span className={cx(c.settings?.closed && 'line-through opacity-60')}>{c.topic || c.name}</span>
              </NavLink>
            ))}
          </>
        )}

        <div className="flex items-center justify-between px-2 pt-4 pb-1">
          <p className="text-[12.5px] font-semibold text-faint">{t('Mensagens diretas')}</p>
          <button className="icon-btn size-6" title="Novo grupo privado" onClick={() => setGroup(true)}>
            <Plus className="size-4" />
          </button>
        </div>
        {conversations.length === 0 && <p className="px-2 py-2 text-[13px] text-faint">Abra uma conversa pelo perfil de um membro.</p>}
        {conversations.map((c) => {
          const others = c.memberIds.filter((m) => m !== meId).map((m) => users[m]).filter(Boolean);
          const ch = channels[c.id];
          const on = location.pathname === `/app/c/${c.id}`;
          return (
            <Link key={c.id} to={`/app/c/${c.id}`} className={cx('flex items-center gap-2.5 rounded-md px-2 py-1.5', on ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
              {c.type === 'dm' ? (
                <Avatar user={others[0]} size={30} />
              ) : (
                <span className="flex size-[30px] items-center justify-center rounded-full bg-elevated">
                  <Users className="size-4" />
                </span>
              )}
              <span className={cx('flex-1 truncate text-[14.5px]', ch?.unread && 'font-semibold text-fg')}>{c.type === 'dm' ? others[0]?.displayName ?? 'Conversa' : c.name}</span>
              <Badge n={ch?.unread ?? 0} />
            </Link>
          );
        })}
      </div>
      <NewGroupModal open={group} onClose={() => setGroup(false)} />
    </>
  );
}

function SpaceNav({ spaceId }: { spaceId: string }) {
  const space = useStore((s) => s.spaces.find((x) => x.id === spaceId));
  const categories = useStore((s) => s.categories);
  const channels = useStore((s) => s.channels);
  const voice = useStore((s) => s.voice);
  const users = useStore((s) => s.users);
  const location = useLocation();
  const canManage = useCan('manage_channels');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [createIn, setCreateIn] = useState<{ categoryId: string | null; temporary?: boolean } | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ouroboros:collapsed') ?? '{}');
    } catch {
      return {};
    }
  });
  const currentId = location.pathname.match(/\/app\/c\/([^/?#]+)/)?.[1];
  if (currentId) localStorage.setItem(`ouroboros:last:${spaceId}`, currentId);

  const cats = useMemo(() => categories.filter((c) => c.spaceId === spaceId).sort((a, b) => a.position - b.position), [categories, spaceId]);
  const list = useMemo(() => Object.values(channels).filter((c) => c.spaceId === spaceId).sort((a, b) => a.position - b.position), [channels, spaceId]);
  const toggle = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    localStorage.setItem('ouroboros:collapsed', JSON.stringify(next));
  };

  const groups: { id: string | null; name: string | null }[] = [{ id: null, name: null }, ...cats.map((c) => ({ id: c.id, name: c.name }))];
  return (
    <>
      <button ref={undefined} onClick={(e) => setMenuAnchor(e.currentTarget)} className="flex h-12 items-center justify-between border-b border-line px-4 text-left hover:bg-hover">
        <span className="truncate font-display text-[15px] font-semibold">{space?.name ?? 'Espaço'}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      <Popover anchor={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} placement="bottom-start">
        <div className="w-56 p-1.5">
          {space?.description && <p className="px-2.5 pt-1 pb-2 text-[13px] text-muted">{space.description}</p>}
          <MenuItem icon={<Volume2 />} onClick={() => (setMenuAnchor(null), setCreateIn({ categoryId: null, temporary: true }))}>
            Criar sala temporária
          </MenuItem>
          {canManage && (
            <>
              <MenuItem icon={<Plus />} onClick={() => (setMenuAnchor(null), setCreateIn({ categoryId: null }))}>
                Criar canal
              </MenuItem>
              <MenuItem icon={<FolderOpen />} onClick={() => (setMenuAnchor(null), setNewCategory(true))}>
                Criar categoria
              </MenuItem>
              <MenuItem icon={<Settings />} onClick={() => (setMenuAnchor(null), (window.location.href = '/admin/structure'))}>
                Gerenciar estrutura
              </MenuItem>
            </>
          )}
        </div>
      </Popover>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((g) => {
          const items = list.filter((c) => (c.categoryId ?? null) === g.id);
          if (!items.length && (!canManage || !g.id)) return null;
          const isCollapsed = g.id ? collapsed[g.id] : false;
          return (
            <div key={g.id ?? 'none'} className="mb-2">
              {g.name && (
                <div className="group flex items-center gap-1 px-1 pt-3 pb-1">
                  <button onClick={() => toggle(g.id!)} className="flex flex-1 items-center gap-1 text-left text-[12.5px] font-semibold text-faint hover:text-muted">
                    <ChevronDown className={cx('size-3 transition-transform', isCollapsed && '-rotate-90')} />
                    {g.name}
                  </button>
                  {canManage && (
                    <button className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" title="Adicionar canal" onClick={() => setCreateIn({ categoryId: g.id })}>
                      <Plus className="size-4 text-faint hover:text-fg" />
                    </button>
                  )}
                </div>
              )}
              {items
                .filter((c) => !isCollapsed || c.id === currentId || c.unread > 0)
                .map((c) => (
                  <div key={c.id}>
                    <Link
                      to={`/app/c/${c.id}`}
                      className={cx(
                        'group flex items-center gap-2 rounded-md px-2 py-[5px] text-[14.5px]',
                        c.id === currentId ? 'bg-hover text-fg' : c.unread ? 'font-semibold text-fg hover:bg-hover' : 'text-muted hover:bg-hover hover:text-fg',
                      )}
                    >
                      <ChannelIcon channel={c} className="shrink-0 text-faint" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.isTemporary && <span className="text-[11px] text-faint">temp.</span>}
                      <Badge n={c.mentions} />
                    </Link>
                    {(voice[c.id]?.length ?? 0) > 0 && (
                      <div className="mb-1 ml-7 space-y-0.5">
                        {voice[c.id].map((p) => (
                          <div key={p.socketId} className="flex items-center gap-2 py-0.5 text-[13px] text-muted">
                            <Avatar user={users[p.userId]} size={20} presence={false} />
                            <span className="flex-1 truncate">{users[p.userId]?.displayName}</span>
                            {p.screen && <span className="rounded bg-danger px-1 text-[9px] font-bold text-white">AO VIVO</span>}
                            {p.video && <Video className="size-3" />}
                            {p.muted && <MicOff className="size-3 text-danger" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {createIn && <CreateChannelModal spaceId={spaceId} categoryId={createIn.categoryId} temporary={createIn.temporary} onClose={() => setCreateIn(null)} />}
      <NewCategoryModal open={newCategory} spaceId={spaceId} onClose={() => setNewCategory(false)} />
    </>
  );
}

function VoicePanel() {
  const c = useCall();
  const channel = useStore((s) => (c.channelId ? s.channels[c.channelId] : null));
  const navigate = useNavigate();
  if (!c.channelId) return null;
  const quality = c.peers.length ? Math.max(...c.peers.map((p) => p.rtt ?? 0)) : 0;
  return (
    <div className="border-t border-line bg-rail/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/app/c/${c.channelId}`)}>
          <p className={cx('text-[13px] font-semibold', c.status === 'connected' ? 'text-success' : 'text-warning')}>
            {c.status === 'connected' ? 'Voz conectada' : c.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}
            {c.status === 'connected' && quality > 0 && <span className="ml-1.5 font-normal text-faint">{quality} ms</span>}
          </p>
          <p className="truncate text-[12.5px] text-muted">{channel?.name || 'Chamada privada'}</p>
        </button>
        <button className="icon-btn" title="Sair da chamada" onClick={() => void call.leave()}>
          <PhoneOff className="size-4 text-danger" />
        </button>
      </div>
    </div>
  );
}

function UserPanel({ onLogout }: { onLogout: () => void }) {
  const me = useStore((s) => s.me)!;
  const unread = useStore((s) => s.unreadNotifications);
  const c = useCall();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(false);
  const setPresence = async (presence: string) => {
    setMenu(false);
    try {
      await patch('/me/preferences', { presence });
      useStore.setState((s) => ({ me: s.me ? { ...s.me, presence } : s.me, presence: { ...s.presence, [me.user.id]: presence === 'invisible' ? 'offline' : presence } }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex items-center gap-1 border-t border-line bg-rail/40 px-2 py-2">
      <button ref={ref} onClick={() => setMenu(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-hover">
        <Avatar user={me.user} size={32} presence={me.presence === 'invisible' ? 'offline' : me.presence} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{me.user.displayName}</span>
          <span className="block truncate text-[12px] text-faint">{me.user.customStatus || PRESENCE_LABEL[me.presence] || 'Disponível'}</span>
        </span>
      </button>
      <Popover anchor={ref.current} open={menu} onClose={() => setMenu(false)} placement="top-start">
        <div className="w-60 p-1.5">
          {['online', 'idle', 'dnd', 'invisible'].map((p) => (
            <MenuItem key={p} onClick={() => void setPresence(p)} icon={<span className={cx('block size-2.5 rounded-full', p === 'online' ? 'bg-success' : p === 'idle' ? 'bg-warning' : p === 'dnd' ? 'bg-danger' : 'bg-faint')} />}>
              {t(PRESENCE_LABEL[p])}
            </MenuItem>
          ))}
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<FileText />} onClick={() => (setMenu(false), window.history.pushState({}, '', `/app/profile/${me.user.id}`), window.dispatchEvent(new PopStateEvent('popstate')))}>
            Meu perfil
          </MenuItem>
          <MenuItem icon={<Settings />} onClick={() => (setMenu(false), openSettings('profile'))}>
            {t('Configurações')}
          </MenuItem>
          <MenuItem icon={<LogOut />} danger onClick={onLogout}>
            {t('Sair')}
          </MenuItem>
        </div>
      </Popover>
      <button ref={bellRef} className="icon-btn relative" title={t('Notificações')} onClick={() => setNotes(true)}>
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-danger" />}
      </button>
      <NotificationsPopover anchor={bellRef.current} open={notes} onClose={() => setNotes(false)} />
      {c.channelId && (
        <>
          <button className={cx('icon-btn', !c.micOn && 'text-danger')} title={c.micOn ? 'Silenciar' : 'Ativar microfone'} onClick={() => void call.toggleMic()}>
            {c.micOn ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
          </button>
          <button className={cx('icon-btn', c.deafened && 'text-danger')} title="Ensurdecer" onClick={() => call.toggleDeafen()}>
            {c.deafened ? <HeadphoneOff className="size-[18px]" /> : <Headphones className="size-[18px]" />}
          </button>
        </>
      )}
      <button className="icon-btn" title={t('Configurações')} onClick={() => openSettings('profile')}>
        <Settings className="size-[18px]" />
      </button>
    </div>
  );
}

// ───────── Modals ─────────

function CreateSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar espaço"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const s = await post('/spaces', { name, description });
                await useStore.getState().loadStructure();
                onClose();
                setName('');
                navigate(`/app?space=${s.id}`);
              } catch (e) {
                toastError(e);
              }
            }}
          >
            Criar espaço
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-muted">Espaços agrupam categorias e canais — por exemplo, um para cada projeto ou turma.</p>
      <Field label="Nome">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
      </Field>
      <Field label="Descrição">
        <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
}

function NewCategoryModal({ open, spaceId, onClose }: { open: boolean; spaceId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar categoria"
      footer={
        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              await post('/categories', { spaceId, name });
              await useStore.getState().loadStructure();
              setName('');
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Criar categoria
        </button>
      }
    >
      <Field label="Nome da categoria">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

export function CreateChannelModal({ spaceId, categoryId, temporary, onClose }: { spaceId: string; categoryId: string | null; temporary?: boolean; onClose: () => void }) {
  const canManage = useCan('manage_channels');
  const members = useStore((s) => Object.values(s.users).filter((u) => !u.isBot));
  const meId = useStore((s) => s.me?.user.id);
  const cats = useStore((s) => s.categories.filter((c) => c.spaceId === spaceId));
  const navigate = useNavigate();
  const [form, setForm] = useState({
    type: (temporary ? 'voice' : 'text') as ChannelType,
    name: '',
    topic: '',
    categoryId,
    isPrivate: false,
    memberIds: [] as string[],
    isTemporary: !!temporary || !canManage,
    password: '',
    slowmodeSeconds: 0,
    userLimit: 0,
  });
  const types = canManage ? CHANNEL_TYPES : (['voice', 'video'] as const);
  const isCall = ['voice', 'video', 'stage'].includes(form.type);
  return (
    <Modal
      open
      onClose={onClose}
      title={form.isTemporary ? 'Criar sala temporária' : 'Criar canal'}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!form.name.trim()}
            onClick={async () => {
              try {
                const c = await post('/channels', {
                  spaceId,
                  ...form,
                  password: form.password || undefined,
                  memberIds: form.isPrivate ? form.memberIds : [],
                  overwrites: form.type === 'stage' ? undefined : undefined,
                });
                await useStore.getState().loadStructure();
                onClose();
                navigate(`/app/c/${c.id}`);
                if (form.isTemporary) toast('Sala criada. Ela será removida quando ficar vazia.', 'success');
              } catch (e) {
                toastError(e);
              }
            }}
          >
            Criar
          </button>
        </>
      }
    >
      <label className="label">Tipo</label>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setForm((f) => ({ ...f, type: t }))}
            className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[14px]', form.type === t ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:bg-hover')}
          >
            <ChannelIcon channel={{ type: t, isPrivate: false, passwordProtected: false }} />
            {CHANNEL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Nome">
          <input className="field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} autoFocus />
        </Field>
        {canManage && (
          <Field label="Categoria">
            <select className="field" value={form.categoryId ?? ''} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value || null }))}>
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Descrição">
        <input className="field" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} maxLength={500} />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Senha adicional (opcional)" hint="Quem entrar precisará digitá-la uma vez.">
          <input className="field" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
        </Field>
        {isCall ? (
          <Field label="Limite de pessoas" hint="0 = sem limite">
            <input className="field" type="number" min={0} max={99} value={form.userLimit} onChange={(e) => setForm((f) => ({ ...f, userLimit: Number(e.target.value) }))} />
          </Field>
        ) : (
          <Field label="Modo lento (segundos)" hint="0 = desativado">
            <input className="field" type="number" min={0} max={21600} value={form.slowmodeSeconds} onChange={(e) => setForm((f) => ({ ...f, slowmodeSeconds: Number(e.target.value) }))} />
          </Field>
        )}
      </div>
      {canManage && (
        <>
          <Toggle checked={form.isTemporary} onChange={(v) => setForm((f) => ({ ...f, isTemporary: v }))} label="Sala temporária" description="Removida automaticamente quando a chamada fica vazia." disabled={!isCall} />
          <Toggle checked={form.isPrivate} onChange={(v) => setForm((f) => ({ ...f, isPrivate: v }))} label="Canal privado" description="Visível apenas para os membros escolhidos e para a administração." />
          {form.isPrivate && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-line p-2">
              {members
                .filter((m) => m.id !== meId)
                .map((m) => (
                  <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-hover">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={form.memberIds.includes(m.id)}
                      onChange={(e) => setForm((f) => ({ ...f, memberIds: e.target.checked ? [...f.memberIds, m.id] : f.memberIds.filter((x) => x !== m.id) }))}
                    />
                    <Avatar user={m} size={22} presence={false} />
                    <UserName user={m} className="text-[14px] font-normal" />
                  </label>
                ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function NewGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const members = useStore((s) => Object.values(s.users).filter((u) => !u.isBot));
  const meId = useStore((s) => s.me?.user.id);
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo grupo privado"
      footer={
        <button
          className="btn-primary"
          disabled={!name.trim() || !ids.length}
          onClick={async () => {
            try {
              const g = await post('/conversations/group', { name, memberIds: ids });
              await useStore.getState().loadConversations();
              await useStore.getState().loadStructure();
              onClose();
              navigate(`/app/c/${g.id}`);
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Criar grupo
        </button>
      }
    >
      <Field label="Nome do grupo">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <input className="field mb-2" placeholder="Filtrar membros" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-60 overflow-y-auto">
        {members
          .filter((m) => m.id !== meId && (m.displayName + m.username).toLowerCase().includes(q.toLowerCase()))
          .map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
              <input type="checkbox" className="accent-[var(--accent)]" checked={ids.includes(m.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
              <Avatar user={m} size={24} />
              <span className="text-[14px]">{m.displayName}</span>
              <span className="text-[13px] text-faint">@{m.username}</span>
            </label>
          ))}
      </div>
    </Modal>
  );
}
