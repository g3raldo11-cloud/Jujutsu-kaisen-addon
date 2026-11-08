import * as THREE from 'three';
import { tube, ellipsoid, merge, place, V, mulberry } from '../core/geometry.js';
import { createSky } from '../shaders/sky.js';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';
import { Tornado } from '../effects/wind.js';
import { pbrSet, seamless } from '../core/textures.js';
import { glowTexture } from '../effects/burst.js';

// Cenários temáticos atrás do pedestal: redemoinho no cerrado (Saci), campo com fogo-fátuo
// (Boitatá) e mata atlântica à noite (Curupira). Silhuetas instanciadas + céu + neblina.

function ground(key, c1, c2, rough = 0.95) {
  const set = pbrSet('ground_' + key, 256, (u, v) => {
    const n = seamless(u, v, 6, 4, 2), d = seamless(u, v, 40, 2, 5);
    const k = 0.5 + n * 0.5;
    return { h: 0.5 + d * 0.3 + n * 0.2, c: [c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k], r: rough };
  }, { normalStrength: 3, repeat: [40, 40] });
  const m = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ ...set, emissiveMap: null }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function instanced(geo, mat, transforms) {
  const im = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  transforms.forEach((t, i) => { m.compose(t.p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.r, 0)), V(t.s, t.s * (t.sy ?? 1), t.s)); im.setMatrixAt(i, m); });
  im.castShadow = false;
  return im;
}

function ringTransforms(count, rMin, rMax, rnd, sMin = 0.8, sMax = 1.4) {
  return Array.from({ length: count }, () => {
    const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
    return { p: V(Math.cos(a) * r, 0, Math.sin(a) * r), r: rnd() * 6.28, s: sMin + rnd() * (sMax - sMin) };
  });
}

/** Árvore retorcida do cerrado: tronco torto com galhos e copa achatada. */
function cerradoTree(rnd) {
  const parts = [];
  const trunk = [V(0, 0, 0), V(0.25, 1.0, 0.1), V(-0.15, 1.9, -0.1), V(0.3, 2.6, 0.2)];
  parts.push(tube(trunk, [0.22, 0.17, 0.13, 0.08], { sides: 8, subdiv: 4, noiseAmp: 0.15, noiseFreq: 3 }));
  parts.push(tube([V(-0.1, 1.8, 0), V(-0.8, 2.3, 0.2), V(-1.3, 2.5, 0.4)], [0.08, 0.05, 0.02], { sides: 6, subdiv: 3 }));
  parts.push(tube([V(0.2, 2.3, 0.1), V(0.9, 2.7, -0.3), V(1.4, 2.8, -0.2)], [0.07, 0.04, 0.02], { sides: 6, subdiv: 3 }));
  const trunkGeo = merge(parts);
  const crowns = merge([
    place(ellipsoid(V(1.3, 0.35, 1.1), { sides: 10, rings: 6, noiseAmp: 0.25, noiseFreq: 1.5 }), { p: V(0.2, 2.9, 0) }),
    place(ellipsoid(V(0.8, 0.3, 0.7), { sides: 10, rings: 6, noiseAmp: 0.25, noiseFreq: 1.5 }), { p: V(-1.2, 2.6, 0.4) }),
    place(ellipsoid(V(0.7, 0.25, 0.6), { sides: 10, rings: 6, noiseAmp: 0.25, noiseFreq: 1.5 }), { p: V(1.3, 2.9, -0.2) }),
  ]);
  return { trunkGeo, crowns };
}

function forestTree() {
  const trunkGeo = tube([V(0, 0, 0), V(0.1, 4, 0), V(-0.1, 8, 0.1), V(0, 12, 0)], [0.55, 0.4, 0.32, 0.22], { sides: 9, subdiv: 3, noiseAmp: 0.1, noiseFreq: 2 });
  const crowns = merge([
    place(ellipsoid(V(3.2, 1.6, 3.0), { sides: 12, rings: 8, noiseAmp: 0.22, noiseFreq: 0.9 }), { p: V(0, 12.5, 0) }),
    place(ellipsoid(V(2.2, 1.2, 2.0), { sides: 10, rings: 6, noiseAmp: 0.22, noiseFreq: 0.9 }), { p: V(-2.0, 10.8, 1.0) }),
    place(ellipsoid(V(2.0, 1.1, 2.2), { sides: 10, rings: 6, noiseAmp: 0.22, noiseFreq: 0.9 }), { p: V(2.1, 11.2, -0.8) }),
  ]);
  return { trunkGeo, crowns };
}

function palm() {
  const parts = [tube([V(0, 0, 0), V(0.2, 4, 0), V(0.3, 8, 0.1)], [0.14, 0.12, 0.1], { sides: 7, subdiv: 3 })];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const d = V(Math.cos(a), 0, Math.sin(a));
    parts.push(tube([V(0.3, 8, 0.1), V(0.3, 8.6, 0.1).addScaledVector(d, 1.2), V(0.3, 8.0, 0.1).addScaledVector(d, 2.4), V(0.3, 7.0, 0.1).addScaledVector(d, 3.0)], [0.08, 0.35, 0.25, 0.0], { sides: 6, subdiv: 3, flatten: 0.1, up: V(0, 1, 0) }));
  }
  return merge(parts);
}

function fern(rnd) {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rnd();
    const d = V(Math.cos(a), 0, Math.sin(a));
    parts.push(tube([V(0, 0, 0), V(0, 0.5, 0).addScaledVector(d, 0.4), V(0, 0.7, 0).addScaledVector(d, 0.9), V(0, 0.4, 0).addScaledVector(d, 1.3)], [0.03, 0.16, 0.12, 0.0], { sides: 6, subdiv: 3, flatten: 0.1, up: V(0, 1, 0) }));
  }
  return merge(parts);
}

export function createBackdrop(kind) {
  const group = new THREE.Group();
  const rnd = mulberry(kind.length * 31);
  const updaters = [];
  let sky, fog, light;
  if (kind === 'cerrado') {
    sky = createSky({ top: 0x2a2148, horizon: 0xe08a4c, bottom: 0x3a2618, glow: 0xffb070, glowDir: V(-0.6, 0.12, -1), clouds: 0.5 });
    fog = new THREE.FogExp2(0x8a5a40, 0.022);
    light = { key: 0xffc690, keyI: 2.6, rim: 0xff7a40, fill: 0x6a5a9a, hemiSky: 0xffb07a, hemiGround: 0x3a2618 };
    group.add(ground('cerrado', [0.46, 0.28, 0.16], [0.6, 0.42, 0.24]));
    const tree = cerradoTree(rnd);
    const tf = ringTransforms(26, 9, 32, rnd, 0.9, 1.8);
    group.add(instanced(tree.trunkGeo, new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 1 }), tf));
    group.add(instanced(tree.crowns, new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 1 }), tf));
    const grass = merge(Array.from({ length: 14 }, (_, k) => tube([V(0, 0, 0), V(Math.cos(k) * 0.15, 0.35, Math.sin(k) * 0.15), V(Math.cos(k) * 0.3, 0.55, Math.sin(k) * 0.3)], [0.03, 0.02, 0.0], { sides: 4, subdiv: 2, flatten: 0.2 })));
    group.add(instanced(grass, new THREE.MeshStandardMaterial({ color: 0xa08a4a, roughness: 1 }), ringTransforms(160, 3, 22, rnd, 0.6, 1.4)));
    for (const [x, z] of [[-14, -18], [16, -22], [-24, -6]]) {
      const t = new Tornado({ radius: 0.9, height: 5, dust: 220, leaves: 10, bands: 3, color: 0xc8955a });
      t.group.position.set(x, 0, z);
      t.setStrength(0.7);
      group.add(t.group);
      updaters.push((time, dt, ps) => t.update(time, dt, ps));
    }
    const motes = createParticles({ count: 200, mode: MODES.SPORES, look: LOOKS.GLOW, size: 0.025, life: 9, radius: 9, height: 4, color: 0xffd6a0, color2: 0xffffff, intensity: 0.5 });
    group.add(motes.points);
    updaters.push((time, dt, ps) => motes.update(time, ps));
  } else if (kind === 'campo') {
    sky = createSky({ top: 0x04050e, horizon: 0x1c1636, bottom: 0x05040a, glow: 0x5a6aa8, glowDir: V(0.5, 0.35, -1), stars: 1, clouds: 0.25 });
    fog = new THREE.FogExp2(0x161226, 0.03);
    light = { key: 0x9fb4ff, keyI: 1.3, rim: 0x4a9aff, fill: 0x3a2a5a, hemiSky: 0x3a4a8a, hemiGround: 0x120a08 };
    group.add(ground('campo', [0.06, 0.07, 0.05], [0.12, 0.13, 0.08]));
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff4a10, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.01;
    group.add(scorch);
    const hills = merge(Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2 + 0.3;
      return place(ellipsoid(V(14 + k, 3 + (k % 3), 9), { sides: 16, rings: 8 }), { p: V(Math.cos(a) * 55, -1, Math.sin(a) * 55) });
    }));
    group.add(new THREE.Mesh(hills, new THREE.MeshStandardMaterial({ color: 0x0c0d14, roughness: 1 })));
    const grass = merge(Array.from({ length: 10 }, (_, k) => tube([V(0, 0, 0), V(Math.cos(k * 2) * 0.1, 0.4, Math.sin(k * 2) * 0.1)], [0.025, 0.0], { sides: 4, subdiv: 2, flatten: 0.3 })));
    group.add(instanced(grass, new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 1 }), ringTransforms(320, 4.5, 30, rnd, 0.7, 1.6)));
    const wisps = createParticles({ count: 70, mode: MODES.WISPS, look: LOOKS.GLOW, size: 0.5, life: 10, radius: 18, height: 2.5, color: 0x5ab4ff, color2: 0x8affd8, intensity: 0.9 });
    group.add(wisps.points);
    updaters.push((time, dt, ps) => wisps.update(time, ps));
    const embers = createParticles({ count: 200, mode: MODES.SPORES, look: LOOKS.GLOW, size: 0.04, life: 7, radius: 10, height: 6, color: 0xff7a2a, color2: 0xffc06a, intensity: 0.7 });
    group.add(embers.points);
    updaters.push((time, dt, ps) => embers.update(time, ps));
  } else {
    sky = createSky({ top: 0x030807, horizon: 0x14302a, bottom: 0x020403, glow: 0x8ab8b0, glowDir: V(0.3, 0.45, -1), stars: 0.6, clouds: 0.2 });
    fog = new THREE.FogExp2(0x0e221e, 0.045);
    light = { key: 0xbfe0ff, keyI: 1.6, rim: 0x6aff9a, fill: 0x1a3a30, hemiSky: 0x2a5a4a, hemiGround: 0x0a0806 };
    group.add(ground('mata', [0.07, 0.06, 0.04], [0.16, 0.12, 0.07]));
    const tree = forestTree();
    const tf = ringTransforms(34, 10, 36, rnd, 0.8, 1.4);
    group.add(instanced(tree.trunkGeo, new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 1 }), tf));
    group.add(instanced(tree.crowns, new THREE.MeshStandardMaterial({ color: 0x10241a, roughness: 1 }), tf));
    group.add(instanced(palm(), new THREE.MeshStandardMaterial({ color: 0x152a1c, roughness: 1, side: THREE.DoubleSide }), ringTransforms(18, 7, 20, rnd, 0.7, 1.1)));
    group.add(instanced(fern(rnd), new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.9, side: THREE.DoubleSide }), ringTransforms(70, 4.2, 14, rnd, 0.45, 0.85)));
    const fireflies = createParticles({ count: 160, mode: MODES.FIREFLIES, look: LOOKS.GLOW, size: 0.08, life: 5, radius: 9, height: 4, color: 0xd8ff7a, color2: 0xfff2a0, intensity: 1.2 });
    group.add(fireflies.points);
    updaters.push((time, dt, ps) => fireflies.update(time, ps));
    group.userData.fireflies = fireflies;
  }
  group.add(sky.mesh);
  updaters.push((time) => sky.update(time));
  return { group, fog, light, update(time, dt, ps) { for (const u of updaters) u(time, dt, ps); } };
}

/** Pedestal hexagonal de pedra com anel e runas que brilham na cor do herói. */
export function createPedestal() {
  const g = new THREE.Group();
  const stone = pbrSet('pedestal', 256, (u, v) => {
    const n = seamless(u, v, 8, 4, 3), c = Math.abs(seamless(u, v, 20, 2, 7));
    const k = 0.32 + n * 0.08 - (c < 0.04 ? 0.1 : 0);
    return { h: 0.5 + n * 0.4 - (c < 0.04 ? 0.3 : 0), c: [k, k * 0.98, k * 0.95], r: 0.8 };
  }, { normalStrength: 5, repeat: [3, 1] });
  const mat = new THREE.MeshStandardMaterial({ ...stone, emissiveMap: null, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.55, 0.32, 6, 1), mat);
  base.position.y = 0.16;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.2, 6, 1), mat);
  top.position.y = 0.42;
  for (const m of [base, top]) { m.receiveShadow = true; m.castShadow = true; }
  g.add(base, top);
  // runas: anel com traços gerados em canvas
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  for (let i = 0; i < 48; i++) {
    const x = i * (1024 / 48) + 6;
    ctx.beginPath();
    const k = (i * 7) % 5;
    if (k === 0) { ctx.moveTo(x, 12); ctx.lineTo(x + 8, 32); ctx.lineTo(x, 52); }
    else if (k === 1) { ctx.arc(x + 6, 32, 10, 0, Math.PI * 1.5); }
    else if (k === 2) { ctx.moveTo(x, 50); ctx.lineTo(x + 6, 14); ctx.lineTo(x + 12, 50); }
    else if (k === 3) { ctx.moveTo(x, 32); ctx.lineTo(x + 12, 32); ctx.moveTo(x + 6, 14); ctx.lineTo(x + 6, 50); }
    else { ctx.moveTo(x, 14); ctx.bezierCurveTo(x + 14, 20, x - 4, 44, x + 10, 50); }
    ctx.stroke();
  }
  const runeTex = new THREE.CanvasTexture(c);
  runeTex.colorSpace = THREE.SRGBColorSpace;
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, color: 0xff6a2a, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const runes = new THREE.Mesh(new THREE.CylinderGeometry(2.205, 2.205, 0.12, 6, 1, true), runeMat);
  runes.position.y = 0.42;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.025, 8, 96), ringMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.525;
  g.add(runes, glowRing);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff6a2a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02;
  g.add(halo);
  return {
    group: g,
    topY: 0.52,
    setColor(hex) {
      const col = new THREE.Color(hex);
      runeMat.color.copy(col).multiplyScalar(2.2);
      ringMat.color.copy(col).multiplyScalar(3.0);
      halo.material.color.copy(col);
    },
    update(t) { runeMat.opacity = 0.75 + Math.sin(t * 2) * 0.25; },
  };
}
