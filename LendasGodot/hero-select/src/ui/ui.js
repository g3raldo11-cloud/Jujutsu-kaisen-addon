import { ICONS } from './icons.js';
import './ui.css';

// Interface da seleção de heróis: painel lateral (nome, função, lore, atributos e habilidades),
// barra de heróis, botões de captura/qualidade/giro, clarão de transição e tela de carga.
export function createUI({ onSelect, onAbility, onCapture, onQuality, onRotate }) {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const root = document.getElementById('ui');

  const brand = el('header', 'brand', '<span class="brand-mark">LENDAS</span><span class="brand-sub">DO BRASIL · HERO SELECT</span>');
  const panel = el('aside', 'panel');
  const roster = el('nav', 'roster');
  roster.setAttribute('aria-label', 'Heróis');
  const tools = el('div', 'tools');
  const flash = el('div', 'flash');
  const loading = el('div', 'loading', '<div class="loading-ring"></div><p>Despertando as lendas…</p>');
  const fps = el('div', 'fps', '');
  root.append(brand, panel, roster, tools, flash, loading, fps);

  const heroes = [
    { name: 'SACI', sub: 'O Redemoinho', color: '#e3262d' },
    { name: 'BOITATÁ', sub: 'A Serpente de Fogo', color: '#ff6a1a' },
    { name: 'CURUPIRA', sub: 'O Guardião da Mata', color: '#2f8a4a' },
  ];
  const cards = heroes.map((h, i) => {
    const b = el('button', 'hero-card', `<span class="hero-key">${i + 1}</span><span class="hero-name">${h.name}</span><span class="hero-sub">${h.sub}</span>`);
    b.style.setProperty('--c', h.color);
    b.addEventListener('click', () => onSelect(i));
    roster.append(b);
    return b;
  });

  const btn = (label, icon, fn, id) => {
    const b = el('button', 'tool', `${ICONS[icon]}<span>${label}</span>`);
    b.id = id;
    b.addEventListener('click', fn);
    tools.append(b);
    return b;
  };
  btn('Capturar', 'camera', onCapture, 'btn-capture');
  const qBtn = btn('Qualidade: alta', 'gauge', onQuality, 'btn-quality');
  let rotating = true;
  const rBtn = btn('Girar: sim', 'orbit', () => { rotating = !rotating; rBtn.querySelector('span').textContent = rotating ? 'Girar: sim' : 'Girar: não'; onRotate(rotating); }, 'btn-rotate');

  let abilityButtons = [];
  window.addEventListener('keydown', (e) => {
    if (['1', '2', '3'].includes(e.key)) onSelect(Number(e.key) - 1);
    if (e.key.toLowerCase() === 'q') onAbility(0);
    if (e.key.toLowerCase() === 'e') onAbility(1);
    if (e.key.toLowerCase() === 'r') onAbility(2);
    if (e.key.toLowerCase() === 'c') onCapture();
  });

  return {
    show(info, index) {
      cards.forEach((c, i) => c.setAttribute('aria-pressed', String(i === index)));
      const stats = Object.entries(info.stats).map(([k, v]) =>
        `<div class="stat"><span>${k}</span><div class="stat-bar"><i style="--v:${v * 10}%"></i></div><b>${v}</b></div>`).join('');
      const keys = ['Q', 'E', 'R'];
      panel.innerHTML = `
        <div class="role">${ICONS[info.role]}<span>${info.role}</span></div>
        <h1 class="name">${info.name}</h1>
        <p class="epithet">${info.epithet}</p>
        <p class="lore">${info.lore}</p>
        <div class="stats">${stats}</div>
        <h2 class="abil-title">Habilidades <small>clique para ver em ação</small></h2>
        <div class="abilities">${info.abilities.map((a, i) => `
          <button class="ability" data-i="${i}">
            <span class="ab-icon">${ICONS[a.icon]}</span>
            <span class="ab-text"><b>${a.name}</b><small>${a.desc}</small></span>
            <span class="ab-key">${keys[i]}</span>
          </button>`).join('')}</div>`;
      abilityButtons = [...panel.querySelectorAll('.ability')];
      abilityButtons.forEach((b) => b.addEventListener('click', () => onAbility(Number(b.dataset.i))));
      panel.classList.remove('enter');
      void panel.offsetWidth;
      panel.classList.add('enter');
    },
    abilityPlayed(i) {
      const b = abilityButtons[i];
      if (!b) return;
      b.classList.remove('fired');
      void b.offsetWidth;
      b.classList.add('fired');
    },
    flash(color, dur) {
      flash.style.transition = 'none';
      flash.style.background = color;
      flash.style.opacity = '0.9';
      void flash.offsetWidth;
      flash.style.transition = `opacity ${dur}s ease-out`;
      flash.style.opacity = '0';
    },
    setQuality(q) { qBtn.querySelector('span').textContent = q === 'high' ? 'Qualidade: alta' : 'Qualidade: baixa'; },
    fps(v) { fps.textContent = `${v} fps`; },
    ready() { loading.classList.add('done'); },
  };
}
