import type { SoundEvent } from '@ouroboros/shared';
import { useStore } from './store';

/**
 * Sounds are synthesised with WebAudio, so no audio files ship with the app and each
 * event can be switched off or given a different voice in Settings → Sounds.
 */
export const SOUND_PRESETS = {
  sino: [880, 1320],
  gota: [660, 990],
  pulso: [440, 440],
  acorde: [523.25, 659.25, 783.99],
  grave: [196, 293.66],
} as const;
export type SoundPreset = keyof typeof SOUND_PRESETS;

const DEFAULT_PRESET: Record<SoundEvent, SoundPreset> = {
  message: 'gota',
  mention: 'sino',
  member_join: 'acorde',
  member_leave: 'grave',
  friend_request: 'acorde',
  call_invite: 'pulso',
  admin: 'sino',
};

let ctx: AudioContext | null = null;
function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function playTone(preset: SoundPreset, volume = 0.5) {
  try {
    const a = audio();
    const notes = SOUND_PRESETS[preset];
    const now = a.currentTime;
    notes.forEach((freq, i) => {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = preset === 'grave' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18 * volume, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(gain).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
  } catch {
    /* audio unavailable */
  }
}

export function playSound(event: SoundEvent) {
  const me = useStore.getState().me;
  const prefs = (me?.preferences.sounds ?? {}) as { enabled?: boolean; volume?: number; events?: Record<string, boolean>; presets?: Record<string, SoundPreset> };
  if (prefs.enabled === false) return;
  if (prefs.events?.[event] === false) return;
  if (me?.presence === 'dnd' && event !== 'call_invite') return;
  const preset = prefs.presets?.[event] ?? DEFAULT_PRESET[event];
  playTone(preset, prefs.volume ?? 0.6);
}

export { DEFAULT_PRESET };
