import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// Modelagem procedural: tudo nasce da "varredura" — um tubo cuja seção elíptica varia ao longo
// de um caminho suave. Daí saem troncos, membros com músculos, dedos, presas, mechas, cipós,
// tiras de tecido, o corpo contínuo da serpente e cascas abertas (roupas) com `arc`.

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const simplex = new SimplexNoise({ random: mulberry(7) });

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return new THREE.Vector3(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

export function smoothPoints(ctrl, subdiv = 4) {
  if (ctrl.length < 2 || subdiv <= 1) return ctrl.map((p) => p.clone());
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
    for (let s = 0; s < subdiv; s++) out.push(catmull(p0, p1, p2, p3, s / subdiv));
  }
  out.push(ctrl[ctrl.length - 1].clone());
  return out;
}

export function smoothValues(vals, subdiv = 4) {
  if (vals.length < 2 || subdiv <= 1) return vals.slice();
  const out = [];
  for (let i = 0; i < vals.length - 1; i++) {
    const v0 = vals[Math.max(i - 1, 0)], v1 = vals[i], v2 = vals[i + 1], v3 = vals[Math.min(i + 2, vals.length - 1)];
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv, t2 = t * t, t3 = t2 * t;
      out.push(Math.max(0, 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3)));
    }
  }
  out.push(vals[vals.length - 1]);
  return out;
}

/**
 * Tubo ao longo de `pts` com seção elíptica (rx: lado, ry: altura orientada por `up`).
 * `arc` = [início, fim] em radianos cria superfícies abertas (cascas de roupa).
 */
export function sweep(pts, rx, ry, { sides = 16, up = V(0, 0, 1), colors = null, caps = true, noiseAmp = 0, noiseFreq = 6, arc = null, uvRepeat = 1 } = {}) {
  const n = pts.length;
  const ring = sides + 1;
  const pos = new Float32Array(n * ring * 3 + 6);
  const nor = new Float32Array(n * ring * 3 + 6);
  const uvs = new Float32Array(n * ring * 2 + 4);
  const col = colors ? new Float32Array(n * ring * 3 + 6) : null;
  const idx = [];
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < n; i++) { total += pts[i].distanceTo(pts[i - 1]); lengths.push(total); }
  if (total < 1e-6) total = 1;
  const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2;
  let normal = new THREE.Vector3();
  let tanPrev = V(0, 1, 0);
  const tangents = [];
  const tmp = new THREE.Vector3(), bin = new THREE.Vector3(), dir = new THREE.Vector3(), nn = new THREE.Vector3();
  let best = 0, bestR = -1;
  for (let i = 0; i < n; i++) {
    const t = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]);
    if (t.lengthSq() < 1e-12) t.copy(tanPrev);
    t.normalize();
    tangents.push(t);
    if (i === 0) {
      normal.copy(up).addScaledVector(t, -up.dot(t));
      if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0).addScaledVector(t, -t.x);
    } else {
      normal.addScaledVector(t, -normal.dot(t)); // transporte paralelo
      if (normal.lengthSq() < 1e-8) normal.copy(up).addScaledVector(t, -up.dot(t));
    }
    normal.normalize();
    bin.crossVectors(t, normal).normalize();
    tanPrev = t;
    if (rx[i] + ry[i] > bestR) { bestR = rx[i] + ry[i]; best = i; }
    for (let j = 0; j <= sides; j++) {
      const a = a0 + (a1 - a0) * (j / sides);
      const ca = Math.cos(a), sa = Math.sin(a);
      dir.copy(bin).multiplyScalar(ca * rx[i]).addScaledVector(normal, sa * ry[i]);
      let k = 1;
      if (noiseAmp > 0) {
        tmp.copy(pts[i]).add(dir).multiplyScalar(noiseFreq);
        k = 1 + noiseAmp * simplex.noise3d(tmp.x, tmp.y, tmp.z);
      }
      const o = (i * ring + j) * 3;
      pos[o] = pts[i].x + dir.x * k; pos[o + 1] = pts[i].y + dir.y * k; pos[o + 2] = pts[i].z + dir.z * k;
      nn.copy(bin).multiplyScalar(ca * Math.max(ry[i], 1e-4)).addScaledVector(normal, sa * Math.max(rx[i], 1e-4)).normalize();
      nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
      const u = (i * ring + j) * 2;
      uvs[u] = (j / sides) * uvRepeat; uvs[u + 1] = lengths[i] / total;
      if (col) { const c = colors[i]; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const p = i * ring + j, q = p + ring;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  orient(pos, nor, idx, 0, idx.length, Math.min(best, n - 2) * sides * 6);
  let vcount = n * ring;
  if (caps && !arc) {
    for (const end of [0, n - 1]) {
      if (rx[end] + ry[end] < 1e-4) continue;
      const c = vcount++;
      const tn = end === 0 ? tangents[0].clone().negate() : tangents[n - 1];
      pos[c * 3] = pts[end].x; pos[c * 3 + 1] = pts[end].y; pos[c * 3 + 2] = pts[end].z;
      nor[c * 3] = tn.x; nor[c * 3 + 1] = tn.y; nor[c * 3 + 2] = tn.z;
      uvs[c * 2] = 0.5; uvs[c * 2 + 1] = end === 0 ? 0 : 1;
      if (col) { const cc = colors[end]; col[c * 3] = cc.r; col[c * 3 + 1] = cc.g; col[c * 3 + 2] = cc.b; }
      const start = idx.length;
      for (let j = 0; j < sides; j++) idx.push(c, end * ring + j, end * ring + j + 1);
      orientRef(pos, idx, start, idx.length, tn);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, vcount * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, vcount * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs.subarray(0, vcount * 2), 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, vcount * 3), 3));
  g.setIndex(idx);
  return g;
}

// Three.js usa faces frontais anti-horárias: o produto vetorial deve apontar para fora.
function orient(pos, nor, idx, from, to, probe) {
  for (let p = probe; p + 2 < to; p += 3) {
    const a = idx[p] * 3, b = idx[p + 1] * 3, c = idx[p + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-16) continue;
    if (cx * nor[a] + cy * nor[a + 1] + cz * nor[a + 2] < 0) flip(idx, from, to);
    return;
  }
}
function orientRef(pos, idx, from, to, ref) {
  for (let p = from; p + 2 < to; p += 3) {
    const a = idx[p] * 3, b = idx[p + 1] * 3, c = idx[p + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-16) continue;
    if (cx * ref.x + cy * ref.y + cz * ref.z < 0) flip(idx, from, to);
    return;
  }
}
function flip(idx, from, to) { for (let t = from; t < to; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; } }

function gradient(n, a, b) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return Array.from({ length: n }, (_, i) => ca.clone().lerp(cb, i / Math.max(1, n - 1)));
}

/** Tubo suave por pontos de controle e raios (membros, dedos, presas, mechas, cipós...). */
export function tube(ctrl, radii, { sides = 16, subdiv = 4, flatten = 1, up = V(0, 0, 1), colorA = null, colorB = null, ...rest } = {}) {
  const pts = smoothPoints(ctrl, subdiv);
  const rx = smoothValues(radii, subdiv);
  const ry = rx.map((r) => r * flatten);
  const colors = colorA ? gradient(pts.length, colorA, colorB ?? colorA) : null;
  return sweep(pts, rx, ry, { sides, up, colors, ...rest });
}

/** Sólido vertical por anéis [y, largura, profundidade, deslocamentoZ] (troncos, cabeças, roupas). */
export function loft(rings, { sides = 28, subdiv = 3, ...rest } = {}) {
  const pts = smoothPoints(rings.map((r) => V(0, r[0], r[3] ?? 0)), subdiv);
  const rx = smoothValues(rings.map((r) => r[1]), subdiv);
  const ry = smoothValues(rings.map((r) => r[2]), subdiv);
  return sweep(pts, rx, ry, { sides, up: V(0, 0, 1), ...rest });
}

export function ellipsoid(r, { sides = 24, rings = 16, noiseAmp = 0, noiseFreq = 6 } = {}) {
  const pts = [], rx = [], ry = [];
  for (let i = 0; i <= rings; i++) {
    const phi = Math.PI * (i / rings) - Math.PI / 2;
    pts.push(V(0, Math.sin(phi) * r.y, 0));
    rx.push(Math.cos(phi) * r.x); ry.push(Math.cos(phi) * r.z);
  }
  return sweep(pts, rx, ry, { sides, up: V(0, 0, 1), caps: false, noiseAmp, noiseFreq });
}

/** Anel horizontal (cintos, braçadeiras, colares, amarrações). */
export function ring(rx, rz, thickness, { sides = 8, segs = 40, noiseAmp = 0 } = {}) {
  const pts = [], r = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(V(Math.cos(a) * rx, 0, Math.sin(a) * rz)); r.push(thickness);
  }
  return sweep(pts, r, r, { sides, up: V(0, 1, 0), caps: false, noiseAmp, noiseFreq: 30 });
}

/** Hélice em volta de um eixo (fitas enroladas, cipós em espiral). */
export function helix(from, to, radius, turns, thickness, { sides = 6, segs = 64, phase = 0 } = {}) {
  const axis = to.clone().sub(from);
  const len = axis.length();
  axis.normalize();
  const side = Math.abs(axis.y) < 0.9 ? V(0, 1, 0).cross(axis).normalize() : V(1, 0, 0);
  const side2 = axis.clone().cross(side).normalize();
  const pts = [], r = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = phase + t * turns * Math.PI * 2;
    pts.push(from.clone().addScaledVector(axis, t * len).addScaledVector(side, Math.cos(a) * radius).addScaledVector(side2, Math.sin(a) * radius));
    r.push(thickness);
  }
  return sweep(pts, r, r, { sides, up: axis, caps: true });
}

export function place(geo, { p = V(), r = null, s = null } = {}) {
  const m = new THREE.Matrix4();
  const q = r ? new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])) : new THREE.Quaternion();
  const sc = s ? (typeof s === 'number' ? V(s, s, s) : s) : V(1, 1, 1);
  m.compose(p, q, sc);
  return geo.applyMatrix4(m);
}

export function merge(geos) {
  // Normaliza atributos (cor opcional) para poder unir num só desenho.
  const hasColor = geos.some((g) => g.getAttribute('color'));
  for (const g of geos) {
    if (hasColor && !g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
  }
  return mergeGeometries(geos, false);
}

export function noise3(x, y, z) { return simplex.noise3d(x, y, z); }
export function noise4(x, y, z, w) { return simplex.noise4d(x, y, z, w); }
