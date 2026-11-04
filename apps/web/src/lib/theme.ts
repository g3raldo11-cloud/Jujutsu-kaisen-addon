import type { Preferences } from '@ouroboros/shared';

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c + amt * 255))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const CUSTOM_VARS = ['--bg', '--rail', '--surface', '--surface-2', '--elevated', '--hover', '--line', '--line-strong', '--fg', '--muted', '--faint', '--accent', '--accent-strong', '--accent-fg', '--accent-soft', '--mention'];

/** Applies the viewer's theme: dark, light, system, or a custom palette derived from four colours. */
export function applyTheme(prefs: Preferences | undefined, defaults: { defaultTheme: 'dark' | 'light'; accentColor: string } | undefined) {
  const root = document.documentElement;
  const mode = prefs?.theme ?? (prefs ? 'system' : defaults?.defaultTheme ?? 'dark');
  for (const v of CUSTOM_VARS) root.style.removeProperty(v);
  const osLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  let base: 'dark' | 'light' = mode === 'light' ? 'light' : mode === 'system' ? (osLight ? 'light' : 'dark') : 'dark';

  if (mode === 'custom' && prefs?.customTheme) {
    const c = prefs.customTheme;
    const bg = c.background ?? '#0d1513';
    const dark = luminance(bg) < 0.25;
    base = dark ? 'dark' : 'light';
    const step = dark ? 0.035 : -0.03;
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--rail', shade(bg, -Math.abs(step)));
    const surface = c.surface ?? shade(bg, step);
    root.style.setProperty('--surface', surface);
    root.style.setProperty('--surface-2', shade(surface, step));
    root.style.setProperty('--elevated', shade(surface, step * 2.2));
    root.style.setProperty('--hover', shade(surface, step * 2.8));
    root.style.setProperty('--line', shade(surface, step * 3.4));
    root.style.setProperty('--line-strong', shade(surface, step * 5.5));
    if (c.text) {
      root.style.setProperty('--fg', c.text);
      root.style.setProperty('--muted', `color-mix(in srgb, ${c.text} 68%, ${bg})`);
      root.style.setProperty('--faint', `color-mix(in srgb, ${c.text} 48%, ${bg})`);
    }
    if (c.accent) prefs = { ...prefs, accentColor: c.accent };
  }
  root.dataset.theme = base;

  const accent = prefs?.accentColor ?? (defaults?.accentColor && defaults.accentColor !== '#7c6cf2' ? defaults.accentColor : null);
  if (accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', shade(accent, base === 'dark' ? 0.08 : -0.08));
    root.style.setProperty('--accent-fg', luminance(accent) > 0.35 ? '#141008' : '#ffffff');
    const [r, g, b] = hexToRgb(accent);
    root.style.setProperty('--accent-soft', `rgb(${r} ${g} ${b} / 0.15)`);
    root.style.setProperty('--mention', `rgb(${r} ${g} ${b} / 0.09)`);
  }
  root.dataset.reducedMotion = String(!!prefs?.reducedMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--rail').trim() || '#0f1a17');
}
