import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, Hash, Lock, Menu, MessageSquareText, Phone, Pin, PanelRight, Settings, Users, Video, X } from 'lucide-react';
import { del, get, post, put } from '../../lib/api';
import { useStore } from '../../lib/store';
import { cx } from '../../lib/format';
import type { Channel, Message, PublicUser } from '../../lib/types';
import { EmptyState, Field, MenuItem, Popover, Spinner } from '../../components/ui';
import { toastError } from '../../components/toast';
import { call } from '../../rtc/engine';
import { ChannelIcon } from './Sidebar';
import { Timeline } from './Chat';
import { MessageItem } from './Message';
import { toggleDrawer, toggleRightPanel } from './AppShell';

const CallView = lazy(() => import('./CallView'));
const ForumView = lazy(() => import('./ForumView'));
const FilesView = lazy(() => import('./FilesView'));
const EventsView = lazy(() => import('./EventsView'));
const ChannelSettings = lazy(() => import('./ChannelSettings'));

const Loading = () => (
  <div className="flex flex-1 items-center justify-center">
    <Spinner />
  </div>
);

export function ChannelView() {
  const { channelId } = useParams();
  const channel = useStore((s) => (channelId ? s.channels[channelId] : undefined));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState<'thread' | 'pins' | null>(params.get('thread') ? 'thread' : null);
  const [threadId, setThreadId] = useState<string | null>(params.get('thread'));
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    if (!channel && channelId) {
      // Maybe a conversation we have not loaded yet (e.g. opened from a notification).
      void useStore.getState().loadStructure();
    }
  }, [channel, channelId]);
  useEffect(() => {
    setPanel(params.get('thread') ? 'thread' : null);
    setThreadId(params.get('thread'));
  }, [channelId, params]);

  if (!channel)
    return (
      <EmptyState icon={<Hash />} title="Canal indisponível" action={<button className="btn-outline" onClick={() => navigate('/app')}>Voltar ao início</button>}>
        Ele pode ter sido removido ou você não tem acesso.
      </EmptyState>
    );

  if (!channel.unlocked) return <Unlock channel={channel} />;

  const openThread = async (m: Message) => {
    try {
      const t = m.thread ?? (await post(`/messages/${m.id}/thread`, {}));
      setThreadId(t.id);
      setPanel('thread');
      setParams({ thread: t.id });
    } catch (e) {
      toastError(e);
    }
  };

  const isCall = ['voice', 'video', 'stage'].includes(channel.type);
  const isChat = ['text', 'announcement', 'support', 'admin', 'ticket', 'dm', 'group_dm'].includes(channel.type);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header channel={channel} onPanel={(p) => setPanel((cur) => (cur === p ? null : p))} onSettings={() => setSettings(true)} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<Loading />}>
            {isChat && <Timeline key={channel.id} channel={channel} onThread={openThread} />}
            {isCall && <CallView key={channel.id} channel={channel} onThread={openThread} />}
            {channel.type === 'forum' && <ForumView key={channel.id} channel={channel} />}
            {(channel.type === 'files' || channel.type === 'gallery') && <FilesView key={channel.id} channel={channel} gallery={channel.type === 'gallery'} />}
            {channel.type === 'events' && <EventsView key={channel.id} channel={channel} />}
          </Suspense>
        </div>
        {panel === 'thread' && (
          <ThreadPanel
            channel={channel}
            threadId={threadId}
            onSelect={(id) => {
              setThreadId(id);
              setParams({ thread: id });
            }}
            onClose={() => {
              setPanel(null);
              setParams({});
            }}
          />
        )}
        {panel === 'pins' && <PinsPanel channel={channel} onClose={() => setPanel(null)} />}
      </div>
      {settings && (
        <Suspense fallback={null}>
          <ChannelSettings channel={channel} onClose={() => setSettings(false)} />
        </Suspense>
      )}
    </div>
  );
}

function Header({ channel, onPanel, onSettings }: { channel: Channel; onPanel: (p: 'thread' | 'pins') => void; onSettings: () => void }) {
  const conv = useStore((s) => s.conversations.find((c) => c.id === channel.id));
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.me?.user.id);
  const canManage = useStore((s) => s.me?.permissions.includes('manage_channels'));
  const bellRef = useRef<HTMLButtonElement>(null);
  const [bell, setBell] = useState(false);
  const isPrivateConv = !channel.spaceId && channel.type !== 'ticket';
  const other: PublicUser | undefined = conv?.type === 'dm' ? users[conv.memberIds.find((m) => m !== meId) ?? ''] : undefined;
  const title = isPrivateConv ? (conv?.type === 'dm' ? other?.displayName : conv?.name) ?? 'Conversa' : channel.type === 'ticket' ? channel.topic || channel.name : channel.name;
  const setLevel = async (level: string, muteHours?: number) => {
    setBell(false);
    await put(`/channels/${channel.id}/notifications`, { level, muteHours }).catch(toastError);
  };
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
      <button className="icon-btn md:hidden" onClick={() => toggleDrawer(true)} aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      <ChannelIcon channel={channel} className="text-faint" />
      <h1 className="truncate font-sans text-[15.5px] font-semibold">{title}</h1>
      {channel.topic && channel.spaceId && <p className="hidden truncate border-l border-line pl-3 text-[13.5px] text-muted lg:block">{channel.topic}</p>}
      <div className="flex-1" />
      {isPrivateConv && (
        <>
          <button className="icon-btn" title="Chamada de voz" onClick={() => void call.join(channel.id).catch(toastError)}>
            <Phone className="size-[18px]" />
          </button>
          <button className="icon-btn" title="Chamada de vídeo" onClick={() => void call.join(channel.id, { video: true }).catch(toastError)}>
            <Video className="size-[18px]" />
          </button>
        </>
      )}
      {!['forum', 'files', 'gallery', 'events'].includes(channel.type) && (
        <>
          <button className="icon-btn" title="Threads" onClick={() => onPanel('thread')}>
            <MessageSquareText className="size-[18px]" />
          </button>
          <button className="icon-btn" title="Mensagens fixadas" onClick={() => onPanel('pins')}>
            <Pin className="size-[18px]" />
          </button>
        </>
      )}
      <button ref={bellRef} className="icon-btn" title="Notificações do canal" onClick={() => setBell(true)}>
        <Bell className="size-[18px]" />
      </button>
      <Popover anchor={bellRef.current} open={bell} onClose={() => setBell(false)} placement="bottom-end">
        <div className="w-60 p-1.5">
          <MenuItem icon={<Bell />} onClick={() => void setLevel('all')}>
            Todas as mensagens
          </MenuItem>
          <MenuItem icon={<Bell />} onClick={() => void setLevel('mentions')}>
            Apenas menções
          </MenuItem>
          <MenuItem icon={<BellOff />} onClick={() => void setLevel('none')}>
            Nada
          </MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<BellOff />} onClick={() => void setLevel('default', 1)}>
            Silenciar por 1 hora
          </MenuItem>
          <MenuItem icon={<BellOff />} onClick={() => void setLevel('default', 24)}>
            Silenciar por 24 horas
          </MenuItem>
          <MenuItem icon={<Bell />} onClick={() => void setLevel('default', 0)}>
            Padrão da comunidade
          </MenuItem>
        </div>
      </Popover>
      {canManage && channel.spaceId && (
        <button className="icon-btn" title="Configurações do canal" onClick={onSettings}>
          <Settings className="size-[18px]" />
        </button>
      )}
      <button className="icon-btn" title="Membros e informações" onClick={toggleRightPanel}>
        {channel.spaceId ? <Users className="size-[18px]" /> : <PanelRight className="size-[18px]" />}
      </button>
    </header>
  );
}

function ThreadPanel({ channel, threadId, onSelect, onClose }: { channel: Channel; threadId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const q = useQuery({ queryKey: ['thread', threadId], queryFn: () => get(`/threads/${threadId}`), enabled: !!threadId });
  useEffect(() => {
    if (q.data?.users) useStore.getState().upsertUsers(q.data.users);
  }, [q.data]);
  const list = useQuery({ queryKey: ['threads', channel.id], queryFn: () => get<any[]>(`/channels/${channel.id}/threads`), enabled: !threadId });
  if (!threadId)
    return (
      <aside className="fixed inset-0 z-30 flex flex-col border-l border-line bg-surface-2 md:static md:w-[380px]">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <span className="flex items-center gap-2 text-[14.5px] font-semibold">
            <MessageSquareText className="size-4 text-accent" /> Threads
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {list.isLoading && <Loading />}
          {list.data?.length === 0 && <EmptyState icon={<MessageSquareText />} title="Nenhuma thread">Passe o mouse sobre uma mensagem e escolha “Criar thread”.</EmptyState>}
          {list.data?.map((t) => (
            <button key={t.id} onClick={() => onSelect(t.id)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-hover">
              <span className="block truncate text-[14.5px] font-medium">{t.title}</span>
              <span className="text-[12.5px] text-faint">{t.messageCount} respostas</span>
            </button>
          ))}
        </div>
      </aside>
    );
  return (
    <aside className="fixed inset-0 z-30 flex flex-col border-l border-line bg-surface-2 md:static md:w-[420px]">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2 text-[14.5px] font-semibold">
          <MessageSquareText className="size-4 text-accent" />
          {q.data?.thread.title ?? 'Thread'}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar thread">
          <X className="size-4" />
        </button>
      </div>
      {q.data ? (
        <Timeline
          key={threadId}
          channel={channel}
          threadId={threadId}
          onThread={() => {}}
          header={
            q.data.root && (
              <div className="border-b border-line pb-3">
                <MessageItem m={q.data.root} compact={false} canManage={false} canReact={false} canReply={false} onReply={() => {}} onThread={() => {}} editing={false} setEditing={() => {}} inThread />
              </div>
            )
          }
        />
      ) : (
        <Loading />
      )}
    </aside>
  );
}

function PinsPanel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const q = useQuery({ queryKey: ['pins', channel.id], queryFn: () => get<{ messages: Message[]; users: PublicUser[] }>(`/channels/${channel.id}/pins`) });
  useEffect(() => {
    if (q.data) useStore.getState().upsertUsers(q.data.users);
  }, [q.data]);
  const navigate = useNavigate();
  return (
    <aside className="fixed inset-0 z-30 flex flex-col border-l border-line bg-surface-2 md:static md:w-[380px]">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2 text-[14.5px] font-semibold">
          <Pin className="size-4 text-accent" /> Mensagens fixadas
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {q.isLoading && <Loading />}
        {q.data?.messages.length === 0 && <EmptyState icon={<Pin />} title="Nada fixado">A moderação pode fixar mensagens importantes.</EmptyState>}
        {q.data?.messages.map((m) => (
          <button key={m.id} className="block w-full text-left" onClick={() => navigate(`/app/c/${channel.id}#m${m.id}`)}>
            <MessageItem m={m} compact={false} canManage={false} canReact={false} canReply={false} onReply={() => {}} onThread={() => {}} editing={false} setEditing={() => {}} inThread />
          </button>
        ))}
      </div>
    </aside>
  );
}

function Unlock({ channel }: { channel: Channel }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post(`/channels/${channel.id}/unlock`, { password: pw });
            await useStore.getState().loadStructure();
          } catch (er) {
            setErr((er as Error).message);
          }
        }}
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Lock className="size-5" />
        </div>
        <h2 className="text-[20px] font-semibold">{channel.name}</h2>
        <p className="mb-4 text-[14px] text-muted">Esta sala tem uma senha adicional. Você só precisa digitá-la uma vez.</p>
        <Field label="Senha da sala" error={err}>
          <input type="password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <button className="btn-primary w-full">Entrar na sala</button>
      </form>
    </div>
  );
}

export { cx, del };
