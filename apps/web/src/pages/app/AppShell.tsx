import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff } from 'lucide-react';
import { useStore } from '../../lib/store';
import { get } from '../../lib/api';
import { call } from '../../rtc/engine';
import { cx } from '../../lib/format';
import { Avatar, Modal, Spinner } from '../../components/ui';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { ChannelView } from './ChannelView';
import { Home } from './Home';
import { SearchModal } from './SearchModal';
import { SettingsModal } from './Settings';

const Extras = lazy(() => import('./Extras'));

export const shellEvents = new EventTarget();
export const openSettings = (tab?: string) => shellEvents.dispatchEvent(new CustomEvent('settings', { detail: tab }));
export const openSearch = () => shellEvents.dispatchEvent(new Event('search'));
export const toggleRightPanel = () => shellEvents.dispatchEvent(new Event('right'));
export const toggleDrawer = (open?: boolean) => shellEvents.dispatchEvent(new CustomEvent('drawer', { detail: open }));

export const useCall = () => useSyncExternalStore(call.subscribe, call.getSnapshot);

export default function AppShell({ onLogout }: { onLogout: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(false);
  const [settings, setSettings] = useState<string | null>(null);
  const [right, setRight] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const [drawer, setDrawer] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [incoming, setIncoming] = useState<{ channelId: string; from: any } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const s = useStore.getState();
    Promise.all([s.loadStructure(), s.loadMembers(), s.loadRoles(), s.loadBots(), s.loadConversations(), s.loadEmojis()]).finally(() => setLoaded(true));
    get('/notifications?unread=1').then((r) => useStore.setState({ unreadNotifications: r.unread })).catch(() => {});
    if ('Notification' in window && Notification.permission === 'default' && s.me?.preferences.notifications?.desktop !== false) {
      setTimeout(() => void Notification.requestPermission().catch(() => {}), 4000);
    }
  }, []);

  useEffect(() => {
    const on = (name: string, fn: (e: Event) => void) => shellEvents.addEventListener(name, fn);
    on('settings', (e) => setSettings((e as CustomEvent).detail ?? 'profile'));
    on('search', () => setSearch(true));
    on('right', () => setRight((r) => !r));
    on('drawer', (e) => setDrawer((d) => ((e as CustomEvent).detail ?? !d)));
    const inc = (e: Event) => setIncoming((e as CustomEvent).detail);
    window.addEventListener('ouroboros:incoming-call', inc);
    return () => window.removeEventListener('ouroboros:incoming-call', inc);
  }, []);

  useEffect(() => setDrawer(false), [location.pathname]);

  // Keyboard shortcuts.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      } else if (mod && e.key === '/') {
        e.preventDefault();
        setShortcuts(true);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        void call.toggleMic();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        call.toggleDeafen();
      } else if (mod && e.key === ',') {
        e.preventDefault();
        setSettings('profile');
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const st = useStore.getState();
        const current = location.pathname.match(/\/app\/c\/([^/?#]+)/)?.[1];
        const cur = current ? st.channels[current] : null;
        const list = Object.values(st.channels)
          .filter((c) => c.spaceId && c.spaceId === cur?.spaceId)
          .sort((a, b) => {
            const ca = st.categories.find((x) => x.id === a.categoryId)?.position ?? -1;
            const cb = st.categories.find((x) => x.id === b.categoryId)?.position ?? -1;
            return ca - cb || a.position - b.position;
          });
        const i = list.findIndex((c) => c.id === current);
        const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
        if (next) navigate(`/app/c/${next.id}`);
      } else if (!typing(e.target) && call.state.channelId) {
        const key = (useStore.getState().me?.preferences.voice as any)?.pttKey ?? 'Backquote';
        if ((useStore.getState().me?.preferences.voice as any)?.mode === 'ptt' && e.code === key) call.setPushToTalk(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = (useStore.getState().me?.preferences.voice as any)?.pttKey ?? 'Backquote';
      if (e.code === key) call.setPushToTalk(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [location.pathname, navigate]);

  if (!loaded)
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Mobile drawer backdrop */}
      <div className={cx('fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden', drawer ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setDrawer(false)} />
      <div className={cx('fixed inset-y-0 left-0 z-40 flex transition-transform md:static md:translate-x-0', drawer ? 'translate-x-0' : '-translate-x-full')}>
        <Sidebar onLogout={onLogout} />
      </div>
      <main className="flex min-w-0 flex-1 flex-col bg-surface-2">
        <Routes>
          <Route index element={<Home />} />
          <Route path="c/:channelId" element={<ChannelView />} />
          <Route
            path="*"
            element={
              <Suspense fallback={<div className="p-10"><Spinner /></div>}>
                <Extras />
              </Suspense>
            }
          />
        </Routes>
      </main>
      {right && <RightPanel onClose={() => setRight(false)} />}

      <SearchModal open={search} onClose={() => setSearch(false)} />
      <SettingsModal tab={settings} onClose={() => setSettings(null)} onLogout={onLogout} />
      <Modal open={shortcuts} onClose={() => setShortcuts(false)} title="Atalhos de teclado">
        <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-[14px]">
          {[
            ['Pesquisa global', 'Ctrl K'],
            ['Canal anterior / próximo', 'Alt ↑ / ↓'],
            ['Ativar/desativar microfone', 'Ctrl Shift M'],
            ['Ensurdecer', 'Ctrl Shift D'],
            ['Configurações', 'Ctrl ,'],
            ['Pressionar para falar (modo PTT)', 'tecla configurada'],
            ['Editar última mensagem', '↑ no campo vazio'],
            ['Fechar painéis', 'Esc'],
            ['Esta lista', 'Ctrl /'],
          ].map(([a, b]) => (
            <div key={a} className="contents">
              <dt className="text-muted">{a}</dt>
              <dd>
                <span className="kbd">{b}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
      {incoming && <IncomingCall data={incoming} onClose={() => setIncoming(null)} />}
    </div>
  );
}

function IncomingCall({ data, onClose }: { data: { channelId: string; from: any }; onClose: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(onClose, 30_000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="sheet-in fixed right-4 bottom-4 z-50 flex w-[300px] items-center gap-3 rounded-2xl border border-accent/40 bg-elevated p-4 shadow-panel">
      <Avatar user={data.from} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{data.from?.displayName}</p>
        <p className="text-[13px] text-muted">está chamando você</p>
      </div>
      <button
        className="flex size-10 items-center justify-center rounded-full bg-success text-white"
        aria-label="Atender"
        onClick={() => {
          navigate(`/app/c/${data.channelId}`);
          void call.join(data.channelId);
          onClose();
        }}
      >
        <Phone className="size-4" />
      </button>
      <button className="flex size-10 items-center justify-center rounded-full bg-danger text-white" aria-label="Recusar" onClick={onClose}>
        <PhoneOff className="size-4" />
      </button>
    </div>
  );
}
