export { formatBytes } from '@ouroboros/shared';

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function timeAgo(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const s = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 45) return 'agora';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export const time = (d: string | Date) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function dayLabel(d: string | Date) {
  const date = new Date(d);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === y.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export const dateTime = (d: string | Date) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}
