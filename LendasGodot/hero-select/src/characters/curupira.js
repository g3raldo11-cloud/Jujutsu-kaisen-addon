import * as THREE from 'three';
import { tube, loft, ellipsoid, ring, helix, place, V, mulberry } from '../core/geometry.js';
import { materials } from './materials.js';
import { mesh, joint, windCloth, Timeline, ease, worldPos } from './common.js';
import { createFlameCards } from '../shaders/flame.js';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';
import { footprint } from '../effects/footprints.js';
import { createRoots } from '../effects/roots.js';
import { Trail } from '../effects/trail.js';
import { shockRing, glowBall } from '../effects/burst.js';

// CURUPIRA — "O Guardião da Mata". Guardião ágil com cabelo de chamas vermelhas, pés virados
// para trás (bem visíveis), armadura de madeira entalhada, cipós e folhas, e lança orgânica.
export function createCurupira() {
  const M = materials();
  const U = { uTime: { value: 0 }, uWind: { value: 1 } };
  const rnd = mulberry(23);
  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, 0.98, 0);
  const sapMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.0, 0.45).multiplyScalar(2.2) });
  const leafMat = windCloth(M.leaf, U, { amp: 0.03, freq: 4 });

  // ---------- pernas com PÉS VIRADOS PARA TRÁS
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, 0.11 * s, -0.02, 0, s > 0 ? 0.05 : -0.18, 0, 0.04 * s);
    hip.add(mesh(tube([V(0, 0.04, 0), V(0, -0.15, 0.025), V(0, -0.3, 0.03), V(0, -0.46, 0.012)], [0.105, 0.112, 0.095, 0.07], { sides: 22, noiseAmp: 0.03, noiseFreq: 8 }), M.skinBronze));
    const knee = joint(hip, 0, -0.47, 0.012, s > 0 ? -0.1 : 0.3, 0, 0);
    knee.add(mesh(ellipsoid(V(0.056, 0.052, 0.052), { sides: 16, rings: 10 }), M.skinBronze));
    if (s > 0) knee.add(mesh(place(loft([[-0.06, 0.07, 0.03], [0.0, 0.085, 0.04], [0.07, 0.06, 0.03]], { sides: 18, arc: [0.2, Math.PI - 0.2] }), { p: V(0, 0, 0.035) }), M.wood));
    knee.add(mesh(tube([V(0, 0, 0), V(0, -0.11, -0.032), V(0, -0.26, -0.014), V(0, -0.42, 0)], [0.07, 0.083, 0.062, 0.046], { sides: 22, noiseAmp: 0.03, noiseFreq: 8 }), M.skinBronze));
    knee.add(mesh(helix(V(0, -0.05, -0.01), V(0, -0.36, 0.0), 0.073, 2.2, 0.011, { segs: 80, phase: s }), M.vine));
    knee.add(mesh(place(ring(0.053, 0.053, 0.012, { segs: 30 }), { p: V(0, -0.38, 0) }), M.vine));
    const ankle = joint(knee, 0, -0.43, 0, 0.05, 0, 0);
    // calcanhar na FRENTE, dedos para TRÁS
    ankle.add(mesh(tube([V(0, -0.02, 0.07), V(0, -0.04, 0.0), V(0, -0.05, -0.1), V(0, -0.052, -0.17)], [0.055, 0.064, 0.058, 0.036], { sides: 18, flatten: 0.5 }), M.skinBronze));
    ankle.add(mesh(place(ellipsoid(V(0.046, 0.04, 0.045), { sides: 14, rings: 10 }), { p: V(0, -0.035, 0.075) }), M.skinBronze));
    for (let k = 0; k < 5; k++) {
      const x = -0.034 + k * 0.017, reach = k === 2 ? 0.05 : k === 1 || k === 3 ? 0.045 : 0.036;
      ankle.add(mesh(tube([V(x, -0.058, -0.165), V(x, -0.062, -0.165 - reach * 0.6), V(x, -0.066, -0.165 - reach)], [0.0135, 0.012, 0.009], { sides: 8, subdiv: 2 }), M.skinBronze));
    }
    legs.push({ hip, knee, ankle });
  }

  // ---------- quadril, tanga de folhas e cinto de cipó trançado com bolsa de couro
  hips.add(mesh(loft([[-0.1, 0.165, 0.118], [0.0, 0.172, 0.122], [0.1, 0.15, 0.108]], { sides: 32, noiseAmp: 0.02 }), M.skinBronze));
  hips.add(mesh(place(ring(0.178, 0.128, 0.026, { segs: 56, noiseAmp: 0.15 }), { p: V(0, 0.05, 0) }), M.vine));
  hips.add(mesh(place(helix(V(-0.17, 0.05, 0), V(0.17, 0.05, 0), 0.02, 9, 0.006, { segs: 120 }), {}), M.vine));
  hips.add(mesh(place(loft([[-0.06, 0.05, 0.03], [0.0, 0.055, 0.035], [0.05, 0.045, 0.03]], { sides: 18 }), { p: V(-0.16, -0.02, 0.07) }), M.leatherBrown));
  for (let k = 0; k < 18; k++) {
    const front = k < 9, i = k % 9;
    const a = THREE.MathUtils.lerp(-1.0, 1.0, i / 8) + (front ? 0 : Math.PI);
    const r0 = V(Math.sin(a) * 0.175, 0.04, Math.cos(a) * 0.126);
    const out = V(Math.sin(a), 0, Math.cos(a));
    const len = 0.3 + rnd() * 0.12;
    hips.add(mesh(tube([r0, r0.clone().addScaledVector(out, 0.04).add(V(0, -len * 0.5, 0)), r0.clone().addScaledVector(out, 0.05).add(V(0, -len, 0))],
      [0.045, 0.05, 0.0], { sides: 10, subdiv: 4, flatten: 0.12, up: out }), leafMat));
  }

  // ---------- tronco atlético
  const spine = joint(hips, 0, 0.1, 0);
  spine.add(mesh(loft([[0.0, 0.16, 0.112, 0], [0.08, 0.142, 0.102, 0.012], [0.18, 0.16, 0.115, 0.018], [0.28, 0.196, 0.13, 0.018], [0.38, 0.218, 0.126, 0.0], [0.46, 0.2, 0.11, -0.01], [0.51, 0.09, 0.07, -0.01]],
    { sides: 40, noiseAmp: 0.03, noiseFreq: 7 }), M.skinBronze));
  for (const s of [-1, 1]) {
    spine.add(mesh(place(ellipsoid(V(0.095, 0.06, 0.042), { sides: 20, rings: 12 }), { p: V(0.078 * s, 0.335, 0.098), r: [0, 0, -0.12 * s] }), M.skinBronze));
    for (let r = 0; r < 3; r++) spine.add(mesh(place(ellipsoid(V(0.036, 0.029, 0.014), { sides: 12, rings: 8 }), { p: V(0.04 * s, 0.21 - r * 0.062, 0.112 - r * 0.004) }), M.skinBronze));
    // pintura de urucum em listras no peito
    spine.add(mesh(tube([V(0.02 * s, 0.4, 0.105), V(0.09 * s, 0.37, 0.115), V(0.16 * s, 0.39, 0.09)], [0.006, 0.007, 0.005], { sides: 6, flatten: 0.4 }), M.paint));
  }
  // peitoral de madeira entalhada preso por correia transversal
  spine.add(mesh(tube([V(-0.2, 0.46, 0.0), V(-0.08, 0.36, 0.13), V(0.08, 0.2, 0.13), V(0.17, 0.05, 0.06)], [0.022, 0.022, 0.022, 0.022], { sides: 10, flatten: 0.3, up: V(0, 0, 1) }), M.leatherBrown));
  [[-0.06, 0.33, 0.14, 0.045], [0.05, 0.22, 0.14, 0.04]].forEach(([x, y, z, r]) => {
    spine.add(mesh(place(ellipsoid(V(r, r * 1.2, 0.014), { sides: 20, rings: 8, noiseAmp: 0.08 }), { p: V(x, y, z), r: [0, 0, 0.6] }), M.wood));
  });
  spine.add(mesh(place(helix(V(0, 0.3, 0.155), V(0, 0.302, 0.16), 0.03, 2.4, 0.004, { segs: 60 }), {}), M.vine));
  // colar de sementes com dente
  for (let k = 0; k < 13; k++) {
    const a = THREE.MathUtils.lerp(-1.2, 1.2, k / 12);
    spine.add(mesh(place(ellipsoid(V(0.014, 0.017, 0.014), { sides: 10, rings: 8 }), { p: V(Math.sin(a) * 0.115, 0.49 - (1 - Math.cos(a)) * 0.08, 0.04 + Math.cos(a) * 0.06) }), k % 2 ? M.paint : M.leatherBrown));
  }
  spine.add(mesh(tube([V(0, 0.4, 0.105), V(0.004, 0.36, 0.112), V(0, 0.32, 0.108)], [0.014, 0.011, 0.0], { sides: 8 }), M.bone));

  // ---------- ombreira de casca em camadas (ombro esquerdo) amarrada com cipó, com folhas
  const pauldron = joint(spine, -0.22, 0.47, 0, 0, 0, 0.35);
  for (let k = 0; k < 3; k++) {
    pauldron.add(mesh(place(loft([[-0.02, 0.11 - k * 0.02, 0.1 - k * 0.015], [0.04, 0.12 - k * 0.02, 0.11 - k * 0.015], [0.08, 0.09 - k * 0.02, 0.085 - k * 0.015]],
      { sides: 24, arc: [0.15, Math.PI - 0.15], noiseAmp: 0.12, noiseFreq: 12 }), { p: V(0, -k * 0.055, 0), r: [-Math.PI / 2, 0, 0] }), M.bark));
  }
  pauldron.add(mesh(place(ring(0.1, 0.09, 0.012, { segs: 32, noiseAmp: 0.2 }), { p: V(0, -0.05, 0), r: [0, 0, Math.PI / 2] }), M.vine));
  for (let k = 0; k < 3; k++) {
    pauldron.add(mesh(place(tube([V(0, 0, 0), V(0, 0.08, 0.02), V(0, 0.16, 0.0)], [0.035, 0.045, 0.0], { sides: 10, flatten: 0.12, up: V(1, 0, 0) }), { p: V(0.02, 0.02, -0.06 + k * 0.05), r: [-0.6 + k * 0.3, 0, -0.8] }), leafMat));
  }

  // ---------- braços (braçadeiras de casca, cipós)
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(spine, 0.245 * s, 0.445, 0, s > 0 ? -0.55 : 0.12, 0, (s > 0 ? 0.12 : 0.3) * s);
    sh.add(mesh(ellipsoid(V(0.078, 0.082, 0.078), { sides: 18, rings: 12 }), M.skinBronze));
    sh.add(mesh(tube([V(0, 0, 0), V(0, -0.13, 0.014), V(0, -0.3, 0)], [0.068, 0.077, 0.054], { sides: 22, noiseAmp: 0.03, noiseFreq: 8 }), M.skinBronze));
    sh.add(mesh(place(ring(0.075, 0.075, 0.016, { segs: 32, noiseAmp: 0.2 }), { p: V(0, -0.08, 0.008) }), M.vine));
    const elbow = joint(sh, 0, -0.305, 0, s > 0 ? -1.15 : -0.25, 0, 0);
    elbow.add(mesh(tube([V(0, 0, 0), V(0, -0.1, 0.01), V(0, -0.25, 0)], [0.056, 0.062, 0.042], { sides: 22, noiseAmp: 0.03, noiseFreq: 8 }), M.skinBronze));
    elbow.add(mesh(place(loft([[-0.2, 0.052, 0.05], [-0.12, 0.064, 0.06], [-0.04, 0.06, 0.056]], { sides: 22, noiseAmp: 0.1, noiseFreq: 14 }), {}), M.bark));
    elbow.add(mesh(helix(V(0, -0.04, 0), V(0, -0.21, 0), 0.068, 2.5, 0.008, { segs: 70 }), M.vine));
    const hand = joint(elbow, 0, -0.265, 0);
    hand.add(mesh(place(ellipsoid(V(0.045, 0.055, 0.022), { sides: 16, rings: 10 }), { p: V(0, -0.035, 0) }), M.skinBronze));
    for (let k = 0; k < 4; k++) {
      const x = -0.03 + k * 0.02;
      hand.add(mesh(tube([V(x, -0.08, 0.0), V(x, -0.105, 0.025), V(x, -0.11, 0.05)], [0.011, 0.0105, 0.009], { sides: 8, subdiv: 3 }), M.skinBronze));
    }
    hand.add(mesh(tube([V(0.04 * s, -0.03, 0.012), V(0.055 * s, -0.055, 0.035), V(0.045 * s, -0.07, 0.055)], [0.013, 0.012, 0.01], { sides: 8, subdiv: 3 }), M.skinBronze));
    arms.push({ sh, elbow, hand });
  }

  // ---------- lança orgânica (madeira torcida, cipó, ponta de pedra com seiva verde luminosa)
  const spear = joint(arms[1].hand, 0, -0.08, 0.04, 1.15, 0, 0);
  spear.add(mesh(tube([V(0, -1.05, 0), V(0.01, -0.3, 0.0), V(-0.008, 0.4, 0.0), V(0, 1.0, 0)], [0.022, 0.024, 0.022, 0.018], { sides: 10, subdiv: 6, noiseAmp: 0.08, noiseFreq: 10 }), M.wood));
  spear.add(mesh(helix(V(0, -0.15, 0), V(0, 0.15, 0), 0.026, 5, 0.006, { segs: 100 }), M.vine));
  const tip = joint(spear, 0, 1.0, 0);
  tip.add(mesh(tube([V(0, 0, 0), V(0, 0.07, 0), V(0, 0.18, 0), V(0, 0.27, 0)], [0.028, 0.052, 0.034, 0.0], { sides: 14, subdiv: 5, flatten: 0.3, up: V(0, 0, 1) }), M.bone));
  tip.add(mesh(tube([V(0, 0.03, 0.006), V(0, 0.12, 0.009), V(0, 0.22, 0.004)], [0.006, 0.005, 0.0], { sides: 6 }), sapMat, { cast: false }));
  for (let k = 0; k < 3; k++) {
    tip.add(mesh(place(tube([V(0, 0, 0), V(0, -0.1, 0.02), V(0, -0.2, 0.0)], [0.03, 0.035, 0.0], { sides: 10, flatten: 0.12, up: V(1, 0, 0) }), { p: V(0, -0.03, 0), r: [0.4, k * 2.1, 0.3] }), leafMat));
  }

  // ---------- cabeça: mandíbula marcada, olhos âmbar, pintura de urucum, cabelo de chamas
  const neck = joint(spine, 0, 0.5, 0);
  neck.add(mesh(tube([V(0, 0, 0), V(0, 0.06, 0.01), V(0, 0.11, 0.016)], [0.064, 0.06, 0.06], { sides: 18 }), M.skinBronze));
  const head = joint(neck, 0, 0.1, 0.016);
  head.add(mesh(loft([[0.0, 0.05, 0.056, 0.042], [0.035, 0.084, 0.092, 0.03], [0.09, 0.098, 0.106, 0.008], [0.14, 0.104, 0.11, -0.004], [0.19, 0.1, 0.106, -0.012], [0.235, 0.074, 0.084, -0.02], [0.258, 0.0, 0.0, -0.024]],
    { sides: 40, noiseAmp: 0.012, noiseFreq: 9 }), M.skinBronze));
  head.add(mesh(place(ellipsoid(V(0.09, 0.018, 0.028), { sides: 18, rings: 8 }), { p: V(0, 0.164, 0.09) }), M.skinBronze));
  head.add(mesh(tube([V(0, 0.16, 0.1), V(0, 0.125, 0.123), V(0, 0.105, 0.127)], [0.016, 0.021, 0.018], { sides: 14 }), M.skinBronze));
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.2).multiplyScalar(2.6) });
  for (const s of [-1, 1]) {
    head.add(mesh(place(ellipsoid(V(0.03, 0.02, 0.022), { sides: 12, rings: 8 }), { p: V(0.058 * s, 0.125, 0.084) }), M.skinBronze));
    head.add(mesh(place(ellipsoid(V(0.018, 0.009, 0.008), { sides: 12, rings: 8 }), { p: V(0.039 * s, 0.146, 0.1) }), eyeMat, { cast: false }));
    head.add(mesh(place(ellipsoid(V(0.021, 0.008, 0.013), { sides: 12, rings: 8 }), { p: V(0.039 * s, 0.153, 0.098), r: [-0.2, 0, -0.15 * s] }), M.skinBronze));
    head.add(mesh(tube([V(0.1 * s, 0.14, 0.0), V(0.118 * s, 0.165, -0.01), V(0.128 * s, 0.2, -0.024)], [0.02, 0.014, 0.0], { sides: 10, flatten: 0.45, up: V(1, 0, 0) }), M.skinBronze));
    for (let b = 0; b < 2; b++) {
      head.add(mesh(tube([V(0.02 * s, 0.12 - b * 0.018, 0.106), V(0.055 * s, 0.116 - b * 0.018, 0.1), V(0.085 * s, 0.108 - b * 0.018, 0.072)], [0.005, 0.006, 0.004], { sides: 6, flatten: 0.4 }), M.paint));
    }
  }
  head.add(mesh(tube([V(-0.028, 0.08, 0.11), V(0, 0.077, 0.118), V(0.028, 0.08, 0.11)], [0.006, 0.007, 0.006], { sides: 8 }), M.lips));
  // couro cabeludo em brasa + cabelo de chamas (mesmo sistema de fogo do Boitatá)
  head.add(mesh(place(ellipsoid(V(0.108, 0.08, 0.112), { sides: 28, rings: 12, noiseAmp: 0.06, noiseFreq: 30 }), { p: V(0, 0.18, -0.016) }),
    new THREE.MeshStandardMaterial({ color: 0x3a0804, emissive: new THREE.Color(1.0, 0.16, 0.02), emissiveIntensity: 0.7, roughness: 0.6 })));
  const hair = createFlameCards(26, { blueTips: 0, intensity: 0.62, speed: 2.1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 * 2.1;
    const r = 0.04 + (i / 26) * 0.07;
    hair.set(i, V(Math.cos(a) * r, 0.19 + rnd() * 0.04, Math.sin(a) * r * 0.9 - 0.04), 0.1 + rnd() * 0.06, 0.26 + rnd() * 0.26);
  }
  hair.commit();
  head.add(hair.mesh);
  const hairEmbers = createParticles({ count: 90, mode: MODES.EMBERS, look: LOOKS.GLOW, size: 0.03, life: 1.4, radius: 0.12, height: 0.9, color: 0xffb04a, color2: 0xff3a10, turbulence: 0.7 });

  // ---------- floresta viva ao redor: folhas orbitando, esporos, pegadas brilhando
  const orbitLeaves = createParticles({ count: 70, mode: MODES.ORBIT, look: LOOKS.LEAF, size: 0.09, life: 3, radius: 1.25, height: 2.0, spin: 0.7, color: 0x3d7a2a, color2: 0x7a9a3a, additive: false, turbulence: 0.8 });
  const orbitWind = createParticles({ count: 220, mode: MODES.ORBIT, look: LOOKS.DUST, size: 0.06, life: 3, radius: 1.3, height: 2.0, spin: 0.8, color: 0xb8f0a0, color2: 0xffffff, intensity: 0.5 });
  const spores = createParticles({ count: 160, mode: MODES.SPORES, look: LOOKS.GLOW, size: 0.025, life: 6, radius: 2.5, height: 2.4, color: 0xcfff8a, color2: 0xffe08a, intensity: 0.8 });
  const fxRoot = new THREE.Group();
  fxRoot.add(hairEmbers.points);
  root.add(orbitLeaves.points, orbitWind.points, spores.points);
  const prints = new THREE.Group();
  root.add(prints);
  const idlePrints = [];
  [[-0.5, 0.75, 0.3], [0.45, 0.95, -0.4], [-0.15, 1.25, 0.1], [0.6, 0.35, 0.9]].forEach(([x, z, r]) => {
    const f = footprint(0xffb05a); f.position.set(x, 0.012, z); f.rotation.z = r; prints.add(f); idlePrints.push(f);
  });
  const roots = createRoots(M.bark, { count: 9, radius: 1.9 });
  root.add(roots.group);
  const burstLeaves = createParticles({ count: 140, mode: MODES.BURST, look: LOOKS.LEAF, size: 0.1, life: 1.8, radius: 3.0, height: 1.2, color: 0x3d7a2a, color2: 0x9aaa3a, additive: false });
  fxRoot.add(burstLeaves.points);
  const trail = new Trail({ width: 0.08, color: 0x9dffb0 });

  const tl = new Timeline();
  let whistle = 0;
  let rageK = -1;

  return {
    id: 'curupira',
    root,
    fxRoot,
    trails: [trail],
    focus: V(0, 1.25, 0),
    cameraDistance: 4.8,
    info: {
      name: 'CURUPIRA', epithet: 'O Guardião da Mata', role: 'Suporte', color: '#2f8a4a', accent: '#ff4a1a',
      lore: 'Guardião das matas desde os tempos contados por Anchieta. Os pés virados para trás deixam pegadas que levam para longe dele; os cabelos ardem como fogo. Protege os bichos e castiga quem destrói a floresta.',
      stats: { Dano: 5, Mobilidade: 8, Controle: 9, Resistência: 6, Dificuldade: 7 },
      abilities: [
        { name: 'Rastro Enganoso', icon: 'prints', desc: 'Deixa pegadas brilhantes viradas para trás que levam o inimigo para o lado errado.' },
        { name: 'Fúria da Mata', icon: 'roots', desc: 'Raízes rompem o chão em volta dele e prendem quem estiver perto.' },
        { name: 'Assobio', icon: 'whistle', desc: 'Um assobio que ecoa pela mata: ondas de som, folhas e vagalumes que revelam inimigos.' },
      ],
    },
    distortion() { return [{ pos: worldPos(head, V(0, 0.45, 0)), radius: 0.12, strength: 0.004 }]; },
    play(i, ctx) {
      if (i === 0) {
        // pegadas aparecendo uma a uma, levando para longe (dedos apontam de volta para ele)
        for (let k = 0; k < 12; k++) {
          setTimeout(() => {
            const f = footprint(0xffc070);
            const a = -0.3 + k * 0.22, r = 1.0 + k * 0.32;
            f.position.set(Math.sin(a) * r + (k % 2 ? 0.12 : -0.12), 0.015, Math.cos(a) * r);
            f.rotation.z = -a + Math.PI;
            ctx.fx.add(f, 2.6, (kk, o) => { o.material.opacity = kk < 0.1 ? kk * 10 : 1 - (kk - 0.1) / 0.9; o.scale.setScalar(1 + Math.sin(kk * 20) * 0.04); });
          }, k * 140);
        }
      } else if (i === 1) {
        rageK = 0;
        shockRing(ctx.fx, root.position, 3.2, 0x7aff7a, 0.8);
        burstLeaves.uniforms.uOrigin.value.copy(root.position).add(V(0, 0.2, 0)); burstLeaves.burst(ctx.time);
        ctx.shake(0.45);
        tl.play(3.0, (k) => { rageK = k; roots.animate(k); }, () => { rageK = -1; roots.animate(0); });
      } else {
        const p = worldPos(head, V(0, 0.08, 0.15));
        for (let k = 0; k < 3; k++) setTimeout(() => shockRing(ctx.fx, p.clone().setY(p.y - 0.05), 3.5, 0x9dffb0, 1.1, 0, 0.03), k * 220);
        glowBall(ctx.fx, p, 0.8, 0xbfffbf, 0.4);
        tl.play(2.5, (k) => { whistle = ease.pulse(k); });
        ctx.fireflies?.(2.5);
      }
    },
    update(t, dt, ctx) {
      U.uTime.value = t;
      tl.update(dt);
      const breathe = Math.sin(t * 1.6) * 0.01;
      spine.rotation.set(-0.04 + breathe, Math.sin(t * 0.5) * 0.08, Math.sin(t * 0.7) * 0.02);
      head.rotation.set(-0.05 + Math.sin(t * 0.8) * 0.04 - whistle * 0.15, Math.sin(t * 0.4) * 0.3, 0);
      arms[0].sh.rotation.z = -0.3 + Math.sin(t * 1.1) * 0.05 - whistle * 0.6;
      arms[0].elbow.rotation.x = -0.25 - whistle * 1.4;
      body.position.y = Math.sin(t * 1.6) * 0.008;
      hair.update(t);
      hair.material.uniforms.uIntensity.value = 0.62 + whistle * 0.35 + (rageK >= 0 ? ease.pulse(rageK) * 0.4 : 0);
      hairEmbers.uniforms.uOrigin.value.copy(worldPos(head, V(0, 0.28, 0)));
      orbitLeaves.uniforms.uSpin.value = 0.7 + whistle * 2.5;
      orbitWind.uniforms.uSpin.value = 0.8 + whistle * 3;
      orbitWind.uniforms.uIntensity.value = 0.5 + whistle;
      for (const p of [hairEmbers, orbitLeaves, orbitWind, spores, burstLeaves]) p.update(t, ctx.pixelScale);
      idlePrints.forEach((f, i) => { f.material.opacity = 0.35 + 0.35 * Math.sin(t * 1.5 + i * 1.7); });
      trail.active = true;
      trail.update(worldPos(tip, V(0, 0.27, 0)), ctx.camera);
    },
    setQuality(r) { orbitWind.setQuality(r); spores.setQuality(r); },
  };
}
