import { getSocket } from '../lib/socket';
import { useStore } from '../lib/store';
import type { VoiceParticipant } from '../lib/types';

/**
 * Mesh WebRTC call engine.
 *  - Signalling goes through the Socket.IO server (voice:* events); media flows peer-to-peer.
 *  - "Perfect negotiation" handles renegotiation (camera/screen on/off) without glare.
 *  - Mesh works well for small rooms (≈2–8 people). Larger rooms need an SFU; see docs/ARCHITECTURE.md.
 *  - Connectivity across strict NATs depends on a TURN server configured by the owner.
 */

export type ConnState = 'new' | 'connecting' | 'connected' | 'unstable' | 'failed';

export interface Peer {
  socketId: string;
  userId: string;
  info: VoiceParticipant;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  meta: { camera?: string; screen?: string };
  pendingStreams: MediaStream[];
  conn: ConnState;
  rtt: number | null;
  loss: number | null;
  volume: number;
  speaking: boolean;
  analyser?: { node: AnalyserNode; source: MediaStreamAudioSourceNode };
  disconnectedAt: number | null;
}

export interface CallState {
  channelId: string | null;
  status: 'idle' | 'joining' | 'connected' | 'reconnecting';
  selfSocketId: string | null;
  self: VoiceParticipant | null;
  peers: Peer[];
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  deafened: boolean;
  speaking: boolean;
  pttActive: boolean;
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  error: string | null;
  turnConfigured: boolean;
  facingMode: 'user' | 'environment';
}

const initial: CallState = {
  channelId: null,
  status: 'idle',
  selfSocketId: null,
  self: null,
  peers: [],
  micOn: true,
  camOn: false,
  screenOn: false,
  deafened: false,
  speaking: false,
  pttActive: false,
  localCamera: null,
  localScreen: null,
  error: null,
  turnConfigured: false,
  facingMode: 'user',
};

type VoicePrefs = {
  inputDeviceId?: string;
  outputDeviceId?: string;
  videoDeviceId?: string;
  mode?: 'vad' | 'ptt';
  pttKey?: string;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
  vadThreshold?: number;
};

const prefs = (): VoicePrefs => (useStore.getState().me?.preferences.voice ?? {}) as VoicePrefs;

export function audioConstraints(p: VoicePrefs = prefs()): MediaTrackConstraints {
  return {
    deviceId: p.inputDeviceId ? { ideal: p.inputDeviceId } : undefined,
    noiseSuppression: p.noiseSuppression ?? true,
    echoCancellation: p.echoCancellation ?? true,
    autoGainControl: p.autoGainControl ?? true,
  };
}

class CallEngine {
  state: CallState = { ...initial };
  private listeners = new Set<() => void>();
  private peers = new Map<string, Peer>();
  private iceServers: RTCIceServer[] = [];
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private loops: number[] = [];
  private volumes = new Map<string, number>();
  private socketHandlers: [string, (...a: any[]) => void][] = [];

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;
  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch, peers: patch.peers ?? [...this.peers.values()] };
    this.listeners.forEach((l) => l());
  }
  private touch() {
    this.set({});
  }

  // ───────── Join / leave ─────────

  async join(channelId: string, opts: { video?: boolean } = {}) {
    const socket = getSocket();
    if (!socket) throw new Error('Sem conexão com o servidor');
    if (this.state.channelId === channelId) return;
    if (this.state.channelId) await this.leave();
    this.set({ ...initial, channelId, status: 'joining', micOn: true, camOn: false, facingMode: 'user' });

    // Microphone (optional: the user may deny permission and still listen).
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
    } catch (err) {
      this.micStream = null;
      this.set({ micOn: false, error: micError(err) });
    }

    const res: any = await socket.emitWithAck('voice:join', { channelId });
    if (!res?.ok) {
      this.stopLocal();
      this.set({ ...initial, error: res?.error ?? 'Não foi possível entrar na chamada' });
      throw new Error(res?.error ?? 'Falha ao entrar');
    }
    this.iceServers = res.iceServers ?? [];
    this.set({ selfSocketId: res.self.socketId, self: res.self, status: 'connected', turnConfigured: this.iceServers.some((s: any) => String(s.urls).includes('turn')) });
    if (!res.self.allowed.speak) this.setMic(false, false);
    this.applyMicGate();
    this.startLocalVad();
    this.bindSocket();
    for (const p of res.participants as VoiceParticipant[]) this.createPeer(p);
    this.startStatsLoop();
    this.emitState();
    if (opts.video && res.self.allowed.video) await this.toggleCamera(true);
  }

  async leave() {
    const socket = getSocket();
    const ch = this.state.channelId;
    if (ch) await socket?.emitWithAck('voice:leave', { channelId: ch }).catch(() => {});
    for (const p of this.peers.values()) this.closePeer(p);
    this.peers.clear();
    this.unbindSocket();
    this.stopLocal();
    this.loops.forEach((id) => clearInterval(id));
    this.loops = [];
    this.set({ ...initial });
  }

  private stopLocal() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.state.localCamera?.getTracks().forEach((t) => t.stop());
    this.state.localScreen?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.localAnalyser = null;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }

  private bindSocket() {
    const socket = getSocket()!;
    const on = (ev: string, fn: (...a: any[]) => void) => {
      socket.on(ev, fn);
      this.socketHandlers.push([ev, fn]);
    };
    on('voice:peer-joined', (p: { channelId: string; participant: VoiceParticipant }) => {
      if (p.channelId === this.state.channelId && p.participant.socketId !== this.state.selfSocketId) this.createPeer(p.participant);
    });
    on('voice:peer-left', (p: { channelId: string; socketId: string }) => {
      const peer = this.peers.get(p.socketId);
      if (peer) {
        this.closePeer(peer);
        this.peers.delete(p.socketId);
        this.touch();
      }
    });
    on('voice:signal', (p: { channelId: string; from: string; data: any }) => void this.onSignal(p.from, p.data));
    on('voice:state', (p: { channelId: string; participant: VoiceParticipant }) => {
      if (p.participant.socketId === this.state.selfSocketId) {
        this.set({ self: p.participant });
        return;
      }
      const peer = this.peers.get(p.participant.socketId);
      if (peer) {
        peer.info = p.participant;
        if (!p.participant.screen) peer.screenStream = null;
        if (!p.participant.video) peer.cameraStream = null;
        this.touch();
      }
    });
    on('voice:force-mute', (p: { muted: boolean }) => {
      if (p.muted) this.setMic(false);
      this.set({ error: p.muted ? 'Um moderador silenciou seu microfone' : null });
    });
    on('voice:kicked', () => {
      void this.leave();
      this.set({ error: 'Você foi desconectado da chamada por um moderador' });
    });
    // Automatic reconnection: after the socket reconnects, re-join with a fresh session.
    on('connect', () => {
      const ch = this.state.channelId;
      if (!ch) return;
      for (const p of this.peers.values()) this.closePeer(p);
      this.peers.clear();
      this.set({ status: 'reconnecting' });
      socket.emitWithAck('voice:join', { channelId: ch }).then((res: any) => {
        if (!res?.ok) {
          void this.leave();
          return;
        }
        this.set({ selfSocketId: res.self.socketId, self: res.self, status: 'connected' });
        for (const p of res.participants as VoiceParticipant[]) this.createPeer(p);
        this.emitState();
      });
    });
    on('disconnect', () => this.state.channelId && this.set({ status: 'reconnecting' }));
  }

  private unbindSocket() {
    const socket = getSocket();
    for (const [ev, fn] of this.socketHandlers) socket?.off(ev, fn);
    this.socketHandlers = [];
  }

  private signal(to: string, data: unknown) {
    getSocket()?.emit('voice:signal', { channelId: this.state.channelId, to, data });
  }

  private emitState() {
    getSocket()?.emit('voice:state', {
      channelId: this.state.channelId,
      muted: !this.state.micOn,
      deafened: this.state.deafened,
      video: this.state.camOn,
      screen: this.state.screenOn,
    });
    this.broadcastMeta();
  }

  private broadcastMeta() {
    const meta = { camera: this.state.localCamera?.id, screen: this.state.localScreen?.id };
    for (const p of this.peers.values()) this.signal(p.socketId, { meta });
  }

  // ───────── Peer connections ─────────

  private createPeer(info: VoiceParticipant) {
    if (this.peers.has(info.socketId)) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const peer: Peer = {
      socketId: info.socketId,
      userId: info.userId,
      info,
      pc,
      polite: (this.state.selfSocketId ?? '') > info.socketId,
      makingOffer: false,
      ignoreOffer: false,
      audioStream: null,
      cameraStream: null,
      screenStream: null,
      meta: {},
      pendingStreams: [],
      conn: 'new',
      rtt: null,
      loss: null,
      volume: this.volumes.get(info.userId) ?? 1,
      speaking: false,
      disconnectedAt: null,
    };
    this.peers.set(info.socketId, peer);

    const mic = this.micStream?.getAudioTracks()[0];
    if (mic) pc.addTrack(mic, this.micStream!);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    const cam = this.state.localCamera;
    if (cam) cam.getTracks().forEach((t) => pc.addTrack(t, cam));
    const scr = this.state.localScreen;
    if (scr) scr.getTracks().forEach((t) => pc.addTrack(t, scr));

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(peer.socketId, { description: pc.localDescription });
      } catch (err) {
        console.warn('negotiation failed', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal(peer.socketId, { candidate });
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      if (track.kind === 'audio' && stream.getVideoTracks().length === 0 && stream.id !== peer.meta.screen) {
        peer.audioStream = stream;
        this.attachRemoteAnalyser(peer, stream);
      } else this.classify(peer, stream);
      track.onunmute = () => this.touch();
      stream.onremovetrack = () => {
        if (stream.getTracks().length === 0) {
          if (peer.cameraStream === stream) peer.cameraStream = null;
          if (peer.screenStream === stream) peer.screenStream = null;
        }
        this.touch();
      };
      this.touch();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      peer.conn = s === 'connected' ? 'connected' : s === 'failed' ? 'failed' : s === 'disconnected' ? 'unstable' : 'connecting';
      if (s === 'disconnected') peer.disconnectedAt = Date.now();
      if (s === 'connected') peer.disconnectedAt = null;
      // ICE restart on failure (network change, Wi-Fi ↔ mobile data).
      if (s === 'failed') pc.restartIce();
      this.touch();
    };
    // Tell the newcomer which of our streams is camera vs screen.
    this.signal(peer.socketId, { meta: { camera: this.state.localCamera?.id, screen: this.state.localScreen?.id } });
    this.touch();
  }

  private classify(peer: Peer, stream: MediaStream) {
    if (stream.id === peer.meta.screen) peer.screenStream = stream;
    else if (stream.id === peer.meta.camera) peer.cameraStream = stream;
    else if (!peer.pendingStreams.includes(stream)) peer.pendingStreams.push(stream);
    // A video stream with no metadata yet: guess from the participant state.
    if (stream.id !== peer.meta.screen && stream.id !== peer.meta.camera && stream.getVideoTracks().length) {
      if (peer.info.screen && !peer.info.video) peer.screenStream = stream;
      else peer.cameraStream ??= stream;
    }
  }

  private async onSignal(from: string, data: any) {
    const peer = this.peers.get(from);
    if (!peer) return;
    const pc = peer.pc;
    try {
      if (data.meta) {
        peer.meta = data.meta;
        const known = [peer.cameraStream, peer.screenStream, ...peer.pendingStreams].filter(Boolean) as MediaStream[];
        peer.cameraStream = null;
        peer.screenStream = null;
        for (const s of known) {
          if (s.id === data.meta.screen) peer.screenStream = s;
          else if (s.id === data.meta.camera) peer.cameraStream = s;
        }
        peer.pendingStreams = known.filter((s) => s !== peer.cameraStream && s !== peer.screenStream && s.getVideoTracks().length);
        this.touch();
      } else if (data.description) {
        const offerCollision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.signal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('signal handling failed', err);
    }
  }

  private closePeer(p: Peer) {
    p.pc.onnegotiationneeded = null;
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.close();
    p.analyser?.source.disconnect();
  }

  // ───────── Local media controls ─────────

  private setMic(on: boolean, notify = true) {
    const allowed = this.state.self?.allowed.speak !== false && !this.state.self?.serverMuted;
    this.set({ micOn: on && allowed && !!this.micStream });
    this.applyMicGate();
    if (notify) this.emitState();
  }

  /** Mic track is live only when unmuted, not deafened and (in push-to-talk mode) while the key is held. */
  private applyMicGate() {
    const track = this.micStream?.getAudioTracks()[0];
    if (!track) return;
    const ptt = prefs().mode === 'ptt';
    track.enabled = this.state.micOn && !this.state.deafened && (!ptt || this.state.pttActive);
  }

  async toggleMic() {
    if (!this.micStream) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
        const track = this.micStream.getAudioTracks()[0];
        for (const p of this.peers.values()) {
          const tr = p.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
          if (tr) {
            tr.direction = 'sendrecv';
            await tr.sender.replaceTrack(track);
            tr.sender.setStreams?.(this.micStream);
          } else p.pc.addTrack(track, this.micStream);
        }
        this.startLocalVad();
        this.set({ error: null });
      } catch (err) {
        this.set({ error: micError(err) });
        return;
      }
    }
    this.setMic(!this.state.micOn);
  }

  setPushToTalk(active: boolean) {
    if (this.state.pttActive === active) return;
    this.set({ pttActive: active });
    this.applyMicGate();
  }

  toggleDeafen() {
    const deafened = !this.state.deafened;
    this.set({ deafened });
    this.applyMicGate();
    this.emitState();
  }

  async toggleCamera(force?: boolean) {
    const on = force ?? !this.state.camOn;
    if (on) {
      if (this.state.self && !this.state.self.allowed.video) return this.set({ error: 'Você não tem permissão para usar a câmera nesta sala' });
      try {
        const p = prefs();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: p.videoDeviceId ? { ideal: p.videoDeviceId } : undefined, facingMode: p.videoDeviceId ? undefined : this.state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
        this.set({ localCamera: stream, camOn: true, error: null });
        for (const peer of this.peers.values()) stream.getTracks().forEach((t) => peer.pc.addTrack(t, stream));
      } catch (err) {
        return this.set({ error: camError(err) });
      }
    } else {
      const s = this.state.localCamera;
      this.removeStream(s);
      s?.getTracks().forEach((t) => t.stop());
      this.set({ localCamera: null, camOn: false });
    }
    this.emitState();
  }

  /** Front/back camera switch on phones (replaces the track without renegotiation). */
  async switchCamera() {
    if (!this.state.localCamera) return;
    const facingMode = this.state.facingMode === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facingMode } } });
      const track = fresh.getVideoTracks()[0];
      const old = this.state.localCamera.getVideoTracks()[0];
      for (const p of this.peers.values()) {
        const sender = p.pc.getSenders().find((s) => s.track === old);
        await sender?.replaceTrack(track);
      }
      old.stop();
      this.state.localCamera.removeTrack(old);
      this.state.localCamera.addTrack(track);
      this.set({ facingMode, localCamera: this.state.localCamera });
    } catch {
      this.set({ error: 'Este dispositivo não tem outra câmera disponível' });
    }
  }

  async toggleScreen() {
    if (this.state.screenOn) {
      const s = this.state.localScreen;
      this.removeStream(s);
      s?.getTracks().forEach((t) => t.stop());
      this.set({ localScreen: null, screenOn: false });
      this.emitState();
      return;
    }
    if (this.state.self && !this.state.self.allowed.screen) return this.set({ error: 'Você não tem permissão para compartilhar a tela nesta sala' });
    if (!navigator.mediaDevices?.getDisplayMedia) return this.set({ error: 'Este navegador não permite compartilhar a tela' });
    try {
      // Screen, window or tab — chosen in the browser's own picker. System/tab audio when supported.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints,
      });
      const v = stream.getVideoTracks()[0];
      if (v) v.contentHint = 'detail';
      v.onended = () => this.state.screenOn && void this.toggleScreen();
      this.set({ localScreen: stream, screenOn: true, error: null });
      for (const peer of this.peers.values()) stream.getTracks().forEach((t) => peer.pc.addTrack(t, stream));
      this.emitState();
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError') this.set({ error: 'Não foi possível compartilhar a tela' });
    }
  }

  private removeStream(stream: MediaStream | null) {
    if (!stream) return;
    const ids = new Set(stream.getTracks().map((t) => t.id));
    for (const p of this.peers.values()) for (const s of p.pc.getSenders()) if (s.track && ids.has(s.track.id)) p.pc.removeTrack(s);
  }

  setVolume(userId: string, volume: number) {
    this.volumes.set(userId, volume);
    for (const p of this.peers.values()) if (p.userId === userId) p.volume = volume;
    this.touch();
  }

  moderate(socketId: string, action: 'mute' | 'unmute' | 'disconnect') {
    return getSocket()?.emitWithAck('voice:moderate', { channelId: this.state.channelId, socketId, action });
  }

  clearError() {
    this.set({ error: null });
  }

  /** Re-acquire the microphone after the user changes devices or processing options. */
  async refreshMic() {
    if (!this.state.channelId || !this.micStream) return;
    const fresh = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    const track = fresh.getAudioTracks()[0];
    const old = this.micStream.getAudioTracks()[0];
    for (const p of this.peers.values()) {
      const sender = p.pc.getSenders().find((s) => s.track === old);
      await sender?.replaceTrack(track);
    }
    old?.stop();
    this.micStream = fresh;
    this.applyMicGate();
    this.startLocalVad();
  }

  // ───────── Voice activity & stats ─────────

  private ctx() {
    this.audioCtx ??= new AudioContext();
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
  }

  private startLocalVad() {
    if (!this.micStream) return;
    const ctx = this.ctx();
    const src = ctx.createMediaStreamSource(this.micStream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    this.localAnalyser = an;
    if (this.loops.length) return;
    const buf = new Float32Array(512);
    let last = false;
    this.loops.push(
      window.setInterval(() => {
        const threshold = prefs().vadThreshold ?? 0.04;
        if (this.localAnalyser) {
          this.localAnalyser.getFloatTimeDomainData(buf);
          const speaking = rms(buf) > threshold && !!this.micStream?.getAudioTracks()[0]?.enabled;
          if (speaking !== last) {
            last = speaking;
            this.set({ speaking });
            getSocket()?.emit('voice:speaking', { channelId: this.state.channelId, speaking });
          }
        }
        let changed = false;
        for (const p of this.peers.values()) {
          if (!p.analyser) continue;
          p.analyser.node.getFloatTimeDomainData(buf);
          const s = rms(buf) > 0.02;
          if (s !== p.speaking) {
            p.speaking = s;
            changed = true;
          }
        }
        if (changed) this.touch();
      }, 120),
    );
  }

  private attachRemoteAnalyser(peer: Peer, stream: MediaStream) {
    try {
      const ctx = this.ctx();
      peer.analyser?.source.disconnect();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      source.connect(node);
      peer.analyser = { node, source };
    } catch {
      /* analysis unavailable */
    }
  }

  private startStatsLoop() {
    this.loops.push(
      window.setInterval(async () => {
        for (const p of this.peers.values()) {
          try {
            const stats = await p.pc.getStats();
            let rtt: number | null = null;
            let lost = 0;
            let recv = 0;
            stats.forEach((r: any) => {
              if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) rtt = r.currentRoundTripTime ?? rtt;
              if (r.type === 'inbound-rtp') {
                lost += r.packetsLost ?? 0;
                recv += r.packetsReceived ?? 0;
              }
            });
            p.rtt = rtt !== null ? Math.round(rtt * 1000) : null;
            p.loss = recv + lost > 0 ? lost / (recv + lost) : null;
            if (p.conn === 'unstable' && p.disconnectedAt && Date.now() - p.disconnectedAt > 5000) {
              p.pc.restartIce();
              p.disconnectedAt = Date.now();
            }
          } catch {
            /* closed */
          }
        }
        this.touch();
      }, 2500),
    );
  }
}

function rms(buf: Float32Array) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function micError(err: unknown) {
  const n = (err as DOMException)?.name;
  if (n === 'NotAllowedError') return 'Permissão do microfone negada. Você pode ouvir, mas não falar.';
  if (n === 'NotFoundError') return 'Nenhum microfone encontrado.';
  return 'Não foi possível acessar o microfone.';
}
function camError(err: unknown) {
  const n = (err as DOMException)?.name;
  if (n === 'NotAllowedError') return 'Permissão da câmera negada.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nenhuma câmera encontrada.';
  return 'Não foi possível acessar a câmera.';
}

export const call = new CallEngine();
(window as any).__ouroborosCall = call;
