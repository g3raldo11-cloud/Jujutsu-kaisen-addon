import * as THREE from 'three';
import { noise4 } from './geometry.js';

// Texturas PBR procedurais (cor base, normal, rugosidade, emissão), todas sem emendas.
// Geradas uma vez na carga e reaproveitadas por todos os materiais.

const cache = new Map();

function dataTex(size, data, srgb, repeat = [1, 1]) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Ruído fBm sem emenda (mapeia u,v num toro 4D).
export function seamless(u, v, freq, octaves = 4, seed = 0) {
  let amp = 0.5, sum = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    sum += amp * noise4(Math.cos(a) * f / 6.283 + seed, Math.sin(a) * f / 6.283, Math.cos(b) * f / 6.283 + seed * 1.7, Math.sin(b) * f / 6.283);
    amp *= 0.5; f *= 2;
  }
  return sum; // aprox. -1..1
}

function heightToNormal(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const o = (y * size + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Conjunto PBR a partir de uma função de altura e de cor.
 * fn(u, v) → { h: altura 0..1, c: [r,g,b] 0..1, r: rugosidade 0..1, e?: [r,g,b] emissão }
 */
export function pbrSet(key, size, fn, { normalStrength = 4, repeat = [1, 1] } = {}) {
  if (cache.has(key)) return cache.get(key);
  const h = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  let emission = null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = fn(x / size, y / size);
      const i = y * size + x, o = i * 4;
      h[i] = s.h;
      albedo[o] = Math.min(255, s.c[0] * 255); albedo[o + 1] = Math.min(255, s.c[1] * 255); albedo[o + 2] = Math.min(255, s.c[2] * 255); albedo[o + 3] = 255;
      const r = Math.min(255, Math.max(0, s.r * 255));
      rough[o] = 255; rough[o + 1] = r; rough[o + 2] = 0; rough[o + 3] = 255; // canal G = rugosidade (padrão glTF/three)
      if (s.e) {
        if (!emission) emission = new Uint8Array(size * size * 4);
        emission[o] = Math.min(255, s.e[0] * 255); emission[o + 1] = Math.min(255, s.e[1] * 255); emission[o + 2] = Math.min(255, s.e[2] * 255); emission[o + 3] = 255;
      }
    }
  }
  const set = {
    map: dataTex(size, albedo, true, repeat),
    normalMap: dataTex(size, heightToNormal(h, size, normalStrength), false, repeat),
    roughnessMap: dataTex(size, rough, false, repeat),
    emissiveMap: emission ? dataTex(size, emission, true, repeat) : null,
  };
  cache.set(key, set);
  return set;
}

const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sat = (x) => Math.min(1, Math.max(0, x));

/** Pele: poros finos, manchas suaves de tom. */
export function skin(key, base) {
  return pbrSet('skin_' + key, 256, (u, v) => {
    const pores = seamless(u, v, 40, 2, 3);
    const tone = seamless(u, v, 4, 3, 9);
    const k = 1 + tone * 0.08;
    return { h: 0.5 + pores * 0.5, c: [base[0] * k, base[1] * k, base[2] * k], r: 0.48 + pores * 0.08 };
  }, { normalStrength: 1.5, repeat: [3, 3] });
}

/** Couro: grão irregular, desgaste mais claro e rugosidade variável. */
export function leather(key, base) {
  return pbrSet('leather_' + key, 256, (u, v) => {
    const grain = seamless(u, v, 26, 3, 1);
    const wear = sat(seamless(u, v, 3, 3, 5) * 1.5 + 0.2);
    return { h: 0.5 + grain * 0.5, c: mixc(base, base.map((x) => x * 1.6 + 0.05), wear * 0.35), r: 0.42 + wear * 0.3 + grain * 0.05 };
  }, { normalStrength: 3, repeat: [2, 2] });
}

/** Tecido trançado com fios e desbotado. */
export function cloth(key, base, weave = 48) {
  return pbrSet('cloth_' + key, 256, (u, v) => {
    const cx = u * weave, cy = v * weave;
    const over = (Math.floor(cx) + Math.floor(cy)) % 2 === 0;
    const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
    const thread = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
    const fade = seamless(u, v, 3, 3, 11) * 0.12;
    const k = 0.8 + thread * 0.25 + fade;
    return { h: thread, c: [base[0] * k, base[1] * k, base[2] * k], r: 0.85 - thread * 0.1 };
  }, { normalStrength: 2.5, repeat: [3, 3] });
}

/** Metal batido (ouro, bronze): marcas de martelo e polimento nas bordas. */
export function metal(key, base) {
  return pbrSet('metal_' + key, 256, (u, v) => {
    const dents = seamless(u, v, 14, 2, 2);
    const scratches = Math.abs(seamless(u * 0.2, v, 60, 1, 7));
    return { h: 0.5 + dents * 0.5, c: base.map((x) => x * (0.9 + dents * 0.1)), r: 0.22 + dents * 0.08 + (scratches < 0.03 ? 0.25 : 0) };
  }, { normalStrength: 2, repeat: [2, 2] });
}

/** Madeira entalhada / casca: veios alongados, nós e sulcos. */
export function wood(key, base, bark = false) {
  return pbrSet('wood_' + key, 256, (u, v) => {
    const warp = seamless(u, v, 3, 2, 4) * 0.15;
    const grain = Math.sin((u + warp) * Math.PI * 2 * (bark ? 10 : 22) + seamless(u, v, 8, 2, 6) * 2.5);
    const ridges = bark ? Math.abs(seamless(u * 1.0, v * 0.25, 12, 3, 8)) : 0;
    const hgt = bark ? 1 - ridges * 1.6 : 0.5 + grain * 0.25;
    const k = 0.75 + grain * 0.12 + (bark ? -ridges * 0.5 : 0);
    return { h: sat(hgt), c: base.map((x) => x * k), r: bark ? 0.9 : 0.6 + grain * 0.05 };
  }, { normalStrength: bark ? 6 : 2.5, repeat: [1, 3] });
}

/** Escamas de brasa: domos sobrepostos, frestas de lava (emissão) e carvão por cima. */
export function emberScales() {
  return pbrSet('ember_scales', 512, (u, v) => {
    const count = 12, R = 0.72;
    const U = u * count, Vv = v * count;
    let bestRow = -999, bestH = 0, tint = 0.5;
    const row = Math.floor(Vv);
    for (let r = row - 1; r <= row + 1; r++) {
      const off = ((r % 2) + 2) % 2 ? 0.5 : 0;
      const col = Math.floor(U - off);
      for (let c = col - 1; c <= col + 1; c++) {
        let dx = U - (c + off + 0.5); dx -= Math.round(dx / count) * count;
        let dy = (Vv - (r + 0.25)) * 1.2; dy -= Math.round(dy / (count * 1.2)) * count * 1.2;
        const d = Math.hypot(dx, dy);
        if (d < R && r >= bestRow) {
          const hh = 1 - Math.pow(d / R, 2.2);
          if (r > bestRow || hh > bestH) { bestRow = r; bestH = hh; tint = (Math.sin(((c % count) + count) * 12.9898 + (((r % count) + count) % count) * 78.233) * 43758.5453) % 1; }
        }
      }
    }
    tint = Math.abs(tint);
    const crack = Math.pow(sat(1 - bestH / 0.3), 2.2);
    const char = seamless(u, v, 18, 2, 13) * 0.08;
    const c = mixc([0.035, 0.02, 0.018], [0.16, 0.07, 0.05], bestH * (0.6 + tint * 0.5) + char);
    return { h: bestH, c, r: 0.55 - bestH * 0.3, e: [1.0 * crack, 0.38 * crack, 0.06 * crack] };
  }, { normalStrength: 7, repeat: [6, 30] });
}

/** Folha: nervuras e borda mais escura (para folhas presas à armadura). */
export function leafSet(key, base) {
  return pbrSet('leafset_' + key, 128, (u, v) => {
    const vein = Math.abs(Math.sin(u * Math.PI * 14 + v * 4)) < 0.08 ? 1 : 0;
    const k = 0.85 + seamless(u, v, 6, 2, 3) * 0.15 - vein * 0.15;
    return { h: 0.5 - vein * 0.3, c: base.map((x) => x * k), r: 0.55 };
  }, { normalStrength: 3 });
}

/** Padrão de energia do gorro do Saci: espirais de vento (emissão dourado-avermelhada). */
export function capRunes() {
  return pbrSet('cap_runes', 256, (u, v) => {
    const sw = Math.sin((u * 6 + v * 3) * Math.PI * 2 + Math.sin(v * Math.PI * 8) * 1.2);
    const line = Math.abs(sw) < 0.12 ? 1 - Math.abs(sw) / 0.12 : 0;
    const weave = Math.sin(u * 300) * Math.sin(v * 300) * 0.08;
    return { h: 0.5 + weave - line * 0.1, c: [0.55 + weave, 0.03, 0.03], r: 0.7, e: [1.0 * line, 0.55 * line, 0.12 * line] };
  }, { normalStrength: 2 });
}
