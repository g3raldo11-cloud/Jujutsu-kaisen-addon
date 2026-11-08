// Ícones originais em SVG (traço simples), um por função e por habilidade.
const s = (d, extra = '') => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
export const ICONS = {
  Duelista: s('<path d="M10 38 L30 18 M30 18 l6-8 4 4-8 6 M14 30 l4 4"/><path d="M38 38 L18 18"/><path d="M18 18 l-6-8-4 4 8 6"/>'),
  Tanque: s('<path d="M24 6 L39 12 V24 C39 33 32 39 24 42 C16 39 9 33 9 24 V12 Z"/><path d="M24 14 V34"/>'),
  Suporte: s('<path d="M24 41 C12 33 9 24 13 15 C17 7 27 8 24 18 C21 8 33 7 36 15 C40 24 36 33 24 41 Z"/><path d="M24 18 V33"/>'),
  swirl: s('<path d="M24 24 m-3 0 a3 3 0 1 1 6 0 a8 8 0 1 1 -14 -4 a13 13 0 1 1 22 10"/>'),
  smoke: s('<path d="M12 32 c-6 0 -6 -9 0 -9 c0 -7 10 -9 13 -3 c4 -5 13 -2 11 5 c6 1 5 9 -1 9 Z"/><path d="M18 40 h12"/>'),
  knot: s('<path d="M10 30 C10 16 26 14 26 24 C26 34 40 32 38 18"/><path d="M14 36 C22 40 34 38 38 30"/>'),
  wisp: s('<path d="M24 40 C15 40 13 31 18 25 C20 30 23 30 23 26 C21 18 26 12 30 8 C30 16 37 20 35 30 C34 36 30 40 24 40 Z"/>'),
  coil: s('<circle cx="24" cy="26" r="13"/><circle cx="24" cy="26" r="7"/><path d="M37 26 C40 16 34 8 26 7"/>'),
  eye: s('<path d="M5 24 C12 13 36 13 43 24 C36 35 12 35 5 24 Z"/><path d="M24 17 C21 21 21 27 24 31 C27 27 27 21 24 17 Z"/>'),
  prints: s('<path d="M14 30 c-3 -6 2 -12 6 -8 c3 3 0 10 -6 8 Z"/><path d="M28 18 c-3 -6 2 -12 6 -8 c3 3 0 10 -6 8 Z"/><path d="M13 36 h1 M17 37 h1 M21 36 h1 M27 24 h1 M31 25 h1 M35 24 h1"/>'),
  roots: s('<path d="M24 42 V24 C24 16 18 12 12 8 M24 26 C26 18 32 14 38 10 M24 32 C18 30 12 32 8 36 M24 34 C30 33 36 36 40 40"/>'),
  whistle: s('<path d="M8 24 h8 M20 14 c6 6 6 14 0 20 M27 9 c9 9 9 21 0 30 M34 5 c12 12 12 26 0 38"/>'),
  camera: s('<rect x="7" y="14" width="34" height="24" rx="3"/><circle cx="24" cy="26" r="7"/><path d="M17 14 l3 -5 h8 l3 5"/>'),
  gauge: s('<path d="M8 32 a16 16 0 1 1 32 0"/><path d="M24 32 L32 20"/>'),
  orbit: s('<ellipse cx="24" cy="24" rx="17" ry="8"/><circle cx="24" cy="24" r="4"/>'),
};
