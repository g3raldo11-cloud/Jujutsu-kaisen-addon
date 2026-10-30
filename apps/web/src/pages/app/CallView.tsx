import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Expand,
  Headphones,
  HeadphoneOff,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Music2,
  Pause,
  PenTool,
  PhoneOff,
  Play,
  SkipForward,
  SwitchCamera,
  Trash2,
  Video,
  VideoOff,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { fileUrl, get } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useStore } from '../../lib/store';
import { cx } from '../../lib/format';
import type { Channel, Message } from '../../lib/types';
import { Avatar, MenuItem, Popover, Tabs } from '../../components/ui';
import { toastError } from '../../components/toast';
import { call, type Peer } from '../../rtc/engine';
import { useCall } from './AppShell';
import { Timeline } from './Chat';
import { Whiteboard } from './Whiteboard';

export default function CallView({ channel, onThread }: { channel: Channel; onThread: (m: Message) => void }) {
  const c = useCall();
  const inThis = c.channelId === channel.id;
  const participants = useStore((s) => s.voice[channel.id] ?? []);
  const users = useStore((s) => s.users);
  const [tab, setTab] = useState<'call' | 'chat' | 'board'>('call');
  const room = useQuery({ queryKey: ['voice', channel.id], queryFn: () => get(`/channels/${channel.id}/voice`), enabled: !inThis });
  useEffect(() => {
    if (room.data) useStore.setState((s) => ({ voice: { ...s.voice, [channel.id]: room.data.participants } }));
  }, [room.data, channel.id]);
  const canConnect = channel.permissions.includes('connect_voice');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'call', label: channel.type === 'stage' ? 'Palco' : 'Chamada' },
            { value: 'chat', label: <span className="flex items-center gap-1.5"><MessageSquare className="size-4" /> Chat</span> },
            { value: 'board', label: <span className="flex items-center gap-1.5"><PenTool className="size-4" /> Quadro</span> },
          ]}
        />
      </div>
      {tab === 'chat' && <Timeline channel={channel} onThread={onThread} />}
      {tab === 'board' && <Whiteboard channel={channel} />}
      {tab === 'call' &&
        (inThis ? (
          <InCall channel={channel} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="flex -space-x-3">
              {participants.slice(0, 6).map((p) => (
                <Avatar key={p.socketId} user={users[p.userId]} size={56} presence={false} className="rounded-full ring-4 ring-surface-2" />
              ))}
            </div>
            <div>
              <h2 className="text-[24px] font-semibold">{channel.name}</h2>
              <p className="mt-1 text-[14.5px] text-muted">
                {participants.length ? `${participants.length} ${participants.length === 1 ? 'pessoa conectada' : 'pessoas conectadas'}` : 'Ninguém na sala ainda.'}
                {channel.userLimit > 0 && ` · limite de ${channel.userLimit}`}
              </p>
            </div>
            {canConnect ? (
              <div className="flex gap-3">
                <button className="btn-primary px-5 py-2.5" onClick={() => void call.join(channel.id).catch(toastError)}>
                  <Mic className="size-4" /> Entrar com áudio
                </button>
                {channel.type !== 'voice' && channel.permissions.includes('video') && (
                  <button className="btn-outline px-5 py-2.5" onClick={() => void call.join(channel.id, { video: true }).catch(toastError)}>
                    <Video className="size-4" /> Entrar com câmera
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[14px] text-muted">Você não tem permissão para entrar nesta sala.</p>
            )}
            {c.error && <p className="text-[13.5px] text-danger">{c.error}</p>}
            <p className="max-w-md text-[12.5px] text-faint">Chamadas são ponto a ponto e criptografadas (DTLS-SRTP). Em redes muito restritivas a conexão depende de um servidor TURN configurado pela administração.</p>
          </div>
        ))}
    </div>
  );
}

function InCall({ channel }: { channel: Channel }) {
  const c = useCall();
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me)!;
  const [focus, setFocus] = useState<string | null>(null);
  const isStage = channel.type === 'stage';

  const tiles = useMemo(() => {
    const list: { key: string; kind: 'camera' | 'screen' | 'avatar'; userId: string; stream: MediaStream | null; peer?: Peer; self?: boolean }[] = [];
    if (c.localScreen) list.push({ key: 'self-screen', kind: 'screen', userId: me.user.id, stream: c.localScreen, self: true });
    list.push({ key: 'self', kind: c.localCamera ? 'camera' : 'avatar', userId: me.user.id, stream: c.localCamera, self: true });
    for (const p of c.peers) {
      if (p.screenStream && p.info.screen && p.info.allowed.screen) list.push({ key: `${p.socketId}-screen`, kind: 'screen', userId: p.userId, stream: p.screenStream, peer: p });
      const cam = p.cameraStream && p.info.video && p.info.allowed.video ? p.cameraStream : null;
      if (isStage && !p.info.allowed.speak && !cam) continue; // audience members don't get tiles on a stage
      list.push({ key: p.socketId, kind: cam ? 'camera' : 'avatar', userId: p.userId, stream: cam, peer: p });
    }
    return list;
  }, [c, me.user.id, isStage]);

  const focused = tiles.find((t) => t.key === focus) ?? tiles.find((t) => t.kind === 'screen' && !t.self) ?? null;
  const others = focused ? tiles.filter((t) => t !== focused) : tiles;
  const audience = isStage ? c.peers.filter((p) => !p.info.allowed.speak) : [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-rail">
      {/* Remote audio (always rendered; hidden). */}
      {c.peers.map((p) => (
        <RemoteAudio key={p.socketId} peer={p} deafened={c.deafened} />
      ))}
      {c.status === 'reconnecting' && (
        <div className="flex items-center justify-center gap-2 bg-warning/15 py-1.5 text-[13px] text-warning">
          <WifiOff className="size-4" /> Reconectando à chamada…
        </div>
      )}
      {c.error && (
        <div className="flex items-center justify-between gap-2 bg-danger/10 px-4 py-1.5 text-[13px] text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> {c.error}
          </span>
          <button className="underline" onClick={() => call.clearError()}>
            ok
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {focused ? (
          <div className="flex h-full flex-col gap-3 lg:flex-row">
            <div className="min-h-[240px] flex-1">
              <Tile tile={focused} users={users} speaking={focused.self ? c.speaking : !!focused.peer?.speaking} onClick={() => setFocus(null)} big />
            </div>
            <div className="flex gap-3 overflow-auto lg:w-56 lg:flex-col">
              {others.map((t) => (
                <div key={t.key} className="aspect-video w-48 shrink-0 lg:w-full">
                  <Tile tile={t} users={users} speaking={t.self ? c.speaking : !!t.peer?.speaking} onClick={() => setFocus(t.key)} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={cx('grid h-full content-center gap-3', tiles.length <= 1 ? 'grid-cols-1' : tiles.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
            {tiles.map((t) => (
              <div key={t.key} className="aspect-video">
                <Tile tile={t} users={users} speaking={t.self ? c.speaking : !!t.peer?.speaking} onClick={() => setFocus(t.key)} />
              </div>
            ))}
          </div>
        )}
        {audience.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[12.5px] font-semibold text-faint">Plateia — {audience.length}</p>
            <div className="flex flex-wrap gap-2">
              {audience.map((p) => (
                <Avatar key={p.socketId} user={users[p.userId]} size={36} presence={false} />
              ))}
            </div>
          </div>
        )}
      </div>
      <MusicBar channel={channel} />
      <Controls channel={channel} />
    </div>
  );
}

function Tile({ tile, users, speaking, onClick, big }: { tile: { kind: string; userId: string; stream: MediaStream | null; peer?: Peer; self?: boolean }; users: Record<string, any>; speaking: boolean; onClick: () => void; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const user = users[tile.userId];
  const c = useCall();
  const info = tile.peer?.info;
  const muted = tile.self ? !c.micOn : info?.muted;
  const volRef = useRef<HTMLButtonElement>(null);
  const [vol, setVol] = useState(false);
  const canModerate = useStore((s) => s.me?.permissions.includes('mute_members'));
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== tile.stream) ref.current.srcObject = tile.stream;
  }, [tile.stream]);
  const quality = tile.peer ? (tile.peer.conn !== 'connected' ? 'bad' : (tile.peer.rtt ?? 0) > 300 || (tile.peer.loss ?? 0) > 0.05 ? 'fair' : 'good') : 'good';
  return (
    <div className={cx('group relative h-full overflow-hidden rounded-xl border bg-surface', speaking ? 'speaking border-success' : 'border-line')}>
      {tile.stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={tile.self || tile.kind === 'camera' || c.deafened}
          onClick={onClick}
          className={cx('size-full cursor-pointer bg-black', tile.kind === 'screen' ? 'object-contain' : 'object-cover', tile.self && tile.kind === 'camera' && c.facingMode === 'user' && '-scale-x-100')}
        />
      ) : (
        <button onClick={onClick} className="flex size-full items-center justify-center" style={{ background: `color-mix(in srgb, ${user?.profileColor ?? '#334'} 18%, var(--surface))` }}>
          <Avatar user={user} size={big ? 96 : 64} presence={false} />
        </button>
      )}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[12.5px] font-medium text-white">
          {muted ? <MicOff className="size-3.5 text-danger" /> : <Mic className="size-3.5" />}
          {tile.kind === 'screen' ? `Tela de ${user?.displayName ?? ''}` : `${user?.displayName ?? ''}${tile.self ? ' (você)' : ''}`}
          {info?.deafened && <HeadphoneOff className="size-3.5" />}
          {tile.kind === 'camera' && <Video className="size-3.5 opacity-70" />}
        </span>
        {tile.peer && (
          <span title={tile.peer.rtt !== null ? `${tile.peer.rtt} ms · perda ${Math.round((tile.peer.loss ?? 0) * 100)}%` : tile.peer.conn} className={cx('size-2 rounded-full', quality === 'good' ? 'bg-success' : quality === 'fair' ? 'bg-warning' : 'bg-danger')} />
        )}
      </div>
      <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex">
        {tile.kind === 'screen' && (
          <button className="rounded-md bg-black/60 p-1.5 text-white" title="Tela cheia" onClick={() => ref.current?.requestFullscreen?.()}>
            <Expand className="size-4" />
          </button>
        )}
        {tile.peer && tile.kind !== 'screen' && (
          <button ref={volRef} className="rounded-md bg-black/60 p-1.5 text-white" title="Volume e opções" onClick={() => setVol(true)}>
            <Volume2 className="size-4" />
          </button>
        )}
      </div>
      {tile.peer && (
        <Popover anchor={volRef.current} open={vol} onClose={() => setVol(false)} placement="bottom-end">
          <div className="w-56 p-3">
            <p className="mb-2 text-[13px] font-medium">Volume de {user?.displayName}</p>
            <input type="range" min={0} max={1} step={0.05} value={tile.peer.volume} onChange={(e) => call.setVolume(tile.userId, Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            <p className="text-right text-[12px] text-faint">{Math.round(tile.peer.volume * 100)}%</p>
            {canModerate && (
              <div className="mt-2 border-t border-line pt-2">
                <MenuItem icon={<MicOff />} onClick={() => void call.moderate(tile.peer!.socketId, tile.peer!.info.serverMuted ? 'unmute' : 'mute')}>
                  {tile.peer.info.serverMuted ? 'Permitir falar' : 'Silenciar para todos'}
                </MenuItem>
                <MenuItem icon={<PhoneOff />} danger onClick={() => void call.moderate(tile.peer!.socketId, 'disconnect')}>
                  Desconectar da chamada
                </MenuItem>
              </div>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

function RemoteAudio({ peer, deafened }: { peer: Peer; deafened: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const output = (useStore.getState().me?.preferences.voice as any)?.outputDeviceId;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== peer.audioStream) el.srcObject = peer.audioStream;
    el.volume = peer.volume;
    el.muted = deafened || !peer.info.allowed.speak;
    if (output && 'setSinkId' in el) void (el as any).setSinkId(output).catch(() => {});
    void el.play().catch(() => {});
  }, [peer.audioStream, peer.volume, deafened, output, peer.info.allowed.speak]);
  return <audio ref={ref} autoPlay hidden />;
}

function Controls({ channel }: { channel: Channel }) {
  const c = useCall();
  const allowed = c.self?.allowed ?? { speak: true, video: true, screen: true };
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const btn = (on: boolean, danger?: boolean) => cx('flex size-12 items-center justify-center rounded-full transition-colors disabled:opacity-40', danger ? 'bg-danger text-white hover:brightness-110' : on ? 'bg-elevated text-fg hover:bg-hover' : 'bg-fg text-bg');
  const ptt = (useStore.getState().me?.preferences.voice as any)?.mode === 'ptt';
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line bg-surface px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <button className={btn(c.micOn)} disabled={!allowed.speak} title={c.micOn ? 'Silenciar (Ctrl Shift M)' : 'Ativar microfone'} onClick={() => void call.toggleMic()} aria-pressed={!c.micOn}>
        {c.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </button>
      <button className={btn(!c.deafened)} title="Ensurdecer" onClick={() => call.toggleDeafen()} aria-pressed={c.deafened}>
        {c.deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </button>
      <button className={btn(!c.camOn)} disabled={!allowed.video} title={c.camOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={() => void call.toggleCamera()} aria-pressed={c.camOn}>
        {c.camOn ? <VideoOff className="size-5" /> : <Video className="size-5" />}
      </button>
      {c.camOn && isMobile && (
        <button className={btn(true)} title="Alternar câmera frontal/traseira" onClick={() => void call.switchCamera()}>
          <SwitchCamera className="size-5" />
        </button>
      )}
      {!!navigator.mediaDevices?.getDisplayMedia && (
        <button className={btn(!c.screenOn)} disabled={!allowed.screen} title={c.screenOn ? 'Parar compartilhamento' : 'Compartilhar tela'} onClick={() => void call.toggleScreen()} aria-pressed={c.screenOn}>
          {c.screenOn ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}
        </button>
      )}
      <button className={btn(false, true)} title="Sair da chamada" onClick={() => void call.leave()}>
        <PhoneOff className="size-5" />
      </button>
      {ptt && <span className={cx('rounded-full px-3 py-1 text-[12.5px]', c.pttActive ? 'bg-success text-white' : 'bg-elevated text-muted')}>{c.pttActive ? 'Transmitindo' : 'Pressione a tecla para falar'}</span>}
      {!c.turnConfigured && c.peers.some((p) => p.conn === 'failed') && <span className="w-full text-center text-[12.5px] text-warning">Alguém não conseguiu conectar. Sem servidor TURN, redes restritivas podem bloquear chamadas.</span>}
      <span className="sr-only">{channel.name}</span>
    </div>
  );
}

/** Shared listening for the music bot: the server is the clock, everyone seeks to the same position. */
function MusicBar({ channel }: { channel: Channel }) {
  const [state, setState] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    get(`/channels/${channel.id}/music`).then((s) => {
      setOffset(s.serverTime - Date.now());
      setState(s);
    });
    const s = getSocket();
    const fn = (m: any) => {
      if (m.channelId !== channel.id) return;
      setOffset(m.serverTime - Date.now());
      setState(m);
    };
    s?.on('music:state', fn);
    return () => void s?.off('music:state', fn);
  }, [channel.id]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !state?.current) return;
    const src = fileUrl(state.current.fileId);
    if (!el.src.endsWith(src)) el.src = src;
    const sync = () => {
      const pos = ((state.pausedAt ?? Date.now() + offset) - state.current.startedAt) / 1000;
      if (pos < 0) {
        el.pause();
        const tm = setTimeout(sync, -pos * 1000);
        return () => clearTimeout(tm);
      }
      if (Math.abs(el.currentTime - pos) > 1.5) el.currentTime = pos;
      if (state.pausedAt) el.pause();
      else void el.play().catch(() => {});
    };
    if (el.readyState >= 1) sync();
    else el.onloadedmetadata = () => sync();
  }, [state, offset]);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  if (!state?.current) return null;
  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-2">
      <audio
        ref={ref}
        onEnded={() => getSocket()?.emit('music:ended', { channelId: channel.id, fileId: state.current.fileId })}
        hidden
      />
      <Music2 className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        {state.current.name}
        {state.queue.length > 0 && <span className="text-faint"> · {state.queue.length} na fila</span>}
      </span>
      <span className="hidden text-[12px] text-faint sm:inline">/pausar /pular /fila</span>
      {state.pausedAt ? <Pause className="size-4 text-muted" /> : <Play className="size-4 text-success" />}
      <SkipForward className="hidden size-4 text-faint" />
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 accent-[var(--accent)]" aria-label="Volume da música" />
      <Trash2 className="hidden" />
    </div>
  );
}
