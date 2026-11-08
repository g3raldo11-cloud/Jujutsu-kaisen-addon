import * as THREE from 'three';
import { tube, loft, ellipsoid, ring, helix, place, merge, V } from '../core/geometry.js';
import { materials } from './materials.js';
import { mesh, joint, windCloth, Timeline, ease, worldPos } from './common.js';
import { Tornado } from '../effects/wind.js';
import { Trail } from '../effects/trail.js';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';
import { shockRing, glowBall } from '../effects/burst.js';

// SACI — "O Redemoinho". Jovem atlético de uma perna só, gorro vermelho que brilha com energia,
// cachimbo com fumaça luminosa, roupa urbana e tribal com faixas de tecido esvoaçantes.
export function createSaci() {
  const M = materials();
  const U = { uTime: { value: 0 }, uWind: { value: 1 } };
  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, 0.86, 0);

  // ---------- perna única (quadril → joelho → tornozelo → pé)
  const hip = joint(hips, 0.02, -0.02, 0, 0.12, 0, 0);
  hip.add(mesh(tube([V(0, 0.04, 0), V(0, -0.18, 0.02), V(0, -0.4, 0.05)], [0.095, 0.1, 0.068], { sides: 20, noiseAmp: 0.03, noiseFreq: 9 }), M.skinDark));
  const knee = joint(hip, 0, -0.41, 0.05, -0.24, 0, 0);
  knee.add(mesh(ellipsoid(V(0.052, 0.05, 0.05), { sides: 16, rings: 10 }), M.skinDark));
  knee.add(mesh(tube([V(0, 0, 0), V(0, -0.12, -0.03), V(0, -0.36, -0.015)], [0.068, 0.077, 0.048], { sides: 20, noiseAmp: 0.03, noiseFreq: 9 }), M.skinDark));
  knee.add(mesh(helix(V(0, -0.14, -0.02), V(0, -0.32, -0.012), 0.062, 3.5, 0.009, { segs: 90 }), M.clothRed));
  knee.add(mesh(place(ring(0.05, 0.05, 0.008, { segs: 32 }), { p: V(0, -0.335, -0.012) }), M.gold));
  const ankle = joint(knee, 0, -0.37, -0.015, 0.12, 0, 0);
  ankle.add(mesh(tube([V(0, -0.025, -0.07), V(0, -0.045, 0.0), V(0, -0.055, 0.1), V(0, -0.06, 0.16)], [0.052, 0.064, 0.058, 0.034], { sides: 18, flatten: 0.5 }), M.skinDark));
  for (let k = 0; k < 5; k++) {
    const x = -0.032 + k * 0.016;
    ankle.add(mesh(tube([V(x, -0.064, 0.155), V(x, -0.068, 0.18 - Math.abs(k - 2) * 0.006), V(x, -0.072, 0.2 - Math.abs(k - 2) * 0.01)], [0.012, 0.011, 0.008], { sides: 8, subdiv: 2 }), M.skinDark));
  }

  // ---------- bermuda preta (perna única) + aba dobrada do lado sem perna, presa com alfinete dourado
  hips.add(mesh(loft([[-0.14, 0.16, 0.122], [-0.04, 0.176, 0.13], [0.06, 0.162, 0.122], [0.13, 0.148, 0.112]], { sides: 32, noiseAmp: 0.05, noiseFreq: 12 }), M.clothBlack));
  hip.add(mesh(tube([V(0, 0.02, 0), V(0, -0.12, 0.012), V(0, -0.22, 0.026)], [0.12, 0.118, 0.105], { sides: 24, noiseAmp: 0.07, noiseFreq: 14 }), M.clothBlack));
  hips.add(mesh(tube([V(-0.1, -0.06, 0), V(-0.11, -0.12, 0.01), V(-0.1, -0.16, 0.02)], [0.085, 0.07, 0.02], { sides: 20, noiseAmp: 0.08, noiseFreq: 14 }), M.clothBlack));
  hips.add(mesh(place(tube([V(-0.02, 0, 0), V(0.02, 0, 0)], [0.006, 0.006], { sides: 6, subdiv: 1 }), { p: V(-0.1, -0.12, 0.085) }), M.gold));
  // bolso cargo
  hip.add(mesh(place(loft([[-0.05, 0.035, 0.012], [0.05, 0.035, 0.012]], { sides: 10, subdiv: 1 }), { p: V(0.11, -0.13, 0.03), r: [0, 0, 0] }), M.clothBlack));

  // ---------- faixa vermelha na cintura com nó e três tiras esvoaçantes
  hips.add(mesh(place(ring(0.168, 0.128, 0.022, { segs: 48, noiseAmp: 0.1 }), { p: V(0, 0.115, 0) }), M.clothRed));
  hips.add(mesh(ellipsoid(V(0.04, 0.035, 0.03), { sides: 12, rings: 8, noiseAmp: 0.15 }), M.clothRed).translateX(0.15).translateY(0.1).translateZ(0.05));
  const sashMat = windCloth(M.clothRed, U, { amp: 0.09, freq: 5 });
  [[0.0, -0.62, 0.08], [0.06, -0.5, -0.05], [-0.05, -0.42, -0.14]].forEach(([dx, len, dz], i) => {
    const s = V(0.16, 0.09, 0.05);
    hips.add(mesh(tube([s, s.clone().add(V(0.04 + dx, len * 0.4, dz - 0.06)), s.clone().add(V(0.06 + dx, len * 0.75, dz - 0.12)), s.clone().add(V(0.05 + dx * 2, len, dz - 0.2))],
      [0.03, 0.028, 0.026, 0.02], { sides: 10, subdiv: 5, flatten: 0.18, up: V(1, 0, 0) }), sashMat));
  });

  // ---------- tronco atlético
  const spine = joint(hips, 0, 0.12, 0);
  spine.add(mesh(loft([[0.0, 0.148, 0.108, 0], [0.08, 0.134, 0.1, 0.012], [0.18, 0.15, 0.11, 0.016], [0.27, 0.176, 0.12, 0.012], [0.35, 0.192, 0.112, 0.0], [0.41, 0.16, 0.1, -0.01], [0.45, 0.075, 0.062, -0.01]],
    { sides: 36, noiseAmp: 0.025, noiseFreq: 8 }), M.skinDark));
  for (const s of [-1, 1]) {
    spine.add(mesh(place(ellipsoid(V(0.075, 0.05, 0.035), { sides: 18, rings: 12 }), { p: V(0.07 * s, 0.29, 0.088), r: [0, 0, -0.1 * s] }), M.skinDark));
    for (let r = 0; r < 3; r++) spine.add(mesh(place(ellipsoid(V(0.032, 0.025, 0.012), { sides: 12, rings: 8 }), { p: V(0.035 * s, 0.18 - r * 0.055, 0.103 - r * 0.004) }), M.skinDark));
  }
  // colete preto curto com capuz, aberto na frente, com debrum dourado
  const vestArc = [Math.PI / 2 + 0.55, Math.PI / 2 - 0.55 + Math.PI * 2];
  spine.add(mesh(loft([[0.2, 0.166, 0.128, 0.012], [0.28, 0.192, 0.136, 0.008], [0.35, 0.21, 0.13, 0.0], [0.42, 0.18, 0.115, -0.012], [0.46, 0.1, 0.085, -0.014]],
    { sides: 40, arc: vestArc, noiseAmp: 0.03, noiseFreq: 10 }), M.clothBlack));
  for (const a of [vestArc[0], vestArc[1]]) {
    const pts = [[0.2, 0.166, 0.128, 0.012], [0.28, 0.192, 0.136, 0.008], [0.35, 0.21, 0.13, 0.0], [0.42, 0.18, 0.115, -0.012]].map(([y, rx, rz, zo]) => V(Math.cos(a) * rx * 1.02, y, Math.sin(a) * rz * 1.02 + zo));
    spine.add(mesh(tube(pts, [0.009, 0.009, 0.009, 0.009], { sides: 8, subdiv: 4 }), M.gold));
  }
  spine.add(mesh(place(ellipsoid(V(0.17, 0.07, 0.09), { sides: 24, rings: 12, noiseAmp: 0.12, noiseFreq: 10 }), { p: V(0, 0.45, -0.075) }), M.clothBlack));
  spine.add(mesh(place(ring(0.13, 0.08, 0.016, { segs: 40 }), { p: V(0, 0.47, -0.06), r: [0.3, 0, 0] }), M.clothRed));
  // colar de contas douradas com pingente em espiral
  for (let k = 0; k < 15; k++) {
    const a = THREE.MathUtils.lerp(-1.25, 1.25, k / 14);
    spine.add(mesh(place(ellipsoid(V(0.011, 0.011, 0.011), { sides: 10, rings: 6 }), { p: V(Math.sin(a) * 0.1, 0.43 - (1 - Math.cos(a)) * 0.07, 0.035 + Math.cos(a) * 0.055) }), k % 3 ? M.gold : M.leatherBlack));
  }
  spine.add(mesh(place(helix(V(0, 0.33, 0.1), V(0, 0.335, 0.104), 0.022, 2.2, 0.0045, { segs: 50 }), {}), M.gold));
  spine.add(mesh(place(ellipsoid(V(0.026, 0.026, 0.006), { sides: 20, rings: 6 }), { p: V(0, 0.333, 0.098) }), M.gold));

  // ---------- braços
  const shoulderR = joint(spine, 0.2, 0.37, 0, -0.95, 0.15, 0.25);
  const shoulderL = joint(spine, -0.2, 0.37, 0, -0.35, 0, -0.95);
  const armR = buildArm(shoulderR, 1);
  const armL = buildArm(shoulderL, -1);
  armR.elbow.rotation.x = -1.75;
  armL.elbow.rotation.x = -0.35;
  armL.hand.rotation.set(0, 0, 0.4);

  function buildArm(sh, side) {
    sh.add(mesh(ellipsoid(V(0.07, 0.065, 0.065), { sides: 18, rings: 12 }), M.skinDark));
    sh.add(mesh(tube([V(0, 0, 0), V(0, -0.14, 0.01), V(0, -0.28, 0)], [0.06, 0.066, 0.047], { sides: 20, noiseAmp: 0.03, noiseFreq: 9 }), M.skinDark));
    sh.add(mesh(place(ring(0.063, 0.063, 0.01, { segs: 32 }), { p: V(0, -0.1, 0.005) }), M.gold));
    const elbow = joint(sh, 0, -0.285, 0);
    elbow.add(mesh(tube([V(0, 0, 0), V(0, -0.12, 0.01), V(0, -0.25, 0)], [0.049, 0.054, 0.036], { sides: 20, noiseAmp: 0.03, noiseFreq: 9 }), M.skinDark));
    elbow.add(mesh(helix(V(0, -0.08, 0.004), V(0, -0.23, 0.0), 0.047, 4, 0.008, { segs: 100 }), M.clothRed));
    const hand = joint(elbow, 0, -0.26, 0);
    hand.add(mesh(place(ellipsoid(V(0.042, 0.052, 0.021), { sides: 16, rings: 10 }), { p: V(0, -0.04, 0) }), M.leatherBlack));
    hand.add(mesh(place(ring(0.038, 0.024, 0.008, { segs: 28 }), { p: V(0, -0.005, 0) }), M.gold));
    for (let k = 0; k < 4; k++) {
      const x = -0.027 + k * 0.018;
      hand.add(mesh(tube([V(x, -0.085, 0.0), V(x, -0.115, 0.016), V(x, -0.135, 0.035)], [0.0105, 0.0098, 0.0082], { sides: 8, subdiv: 3 }), M.skinDark));
    }
    hand.add(mesh(tube([V(0.036 * side, -0.03, 0.012), V(0.052 * side, -0.06, 0.03), V(0.055 * side, -0.085, 0.042)], [0.012, 0.011, 0.009], { sides: 8, subdiv: 3 }), M.skinDark));
    return { elbow, hand };
  }

  // ---------- cabeça
  const neck = joint(spine, 0, 0.44, 0.0);
  neck.add(mesh(tube([V(0, 0, 0), V(0, 0.05, 0.008), V(0, 0.1, 0.014)], [0.055, 0.052, 0.054], { sides: 18 }), M.skinDark));
  const head = joint(neck, 0, 0.085, 0.016);
  head.add(mesh(loft([[0.0, 0.044, 0.05, 0.04], [0.035, 0.074, 0.084, 0.03], [0.08, 0.09, 0.1, 0.012], [0.13, 0.098, 0.106, 0.0], [0.18, 0.096, 0.104, -0.008], [0.215, 0.074, 0.084, -0.015], [0.236, 0.0, 0.0, -0.02]],
    { sides: 40, noiseAmp: 0.012, noiseFreq: 10 }), M.skinDark));
  head.add(mesh(place(ellipsoid(V(0.085, 0.016, 0.025), { sides: 18, rings: 8 }), { p: V(0, 0.152, 0.088) }), M.skinDark));
  head.add(mesh(tube([V(0, 0.126, 0.104), V(0, 0.1, 0.121), V(0, 0.088, 0.126)], [0.014, 0.019, 0.017], { sides: 14 }), M.skinDark));
  for (const s of [-1, 1]) {
    head.add(mesh(place(ellipsoid(V(0.013, 0.01, 0.011), { sides: 10, rings: 8 }), { p: V(0.017 * s, 0.088, 0.113) }), M.skinDark));
    head.add(mesh(place(ellipsoid(V(0.028, 0.018, 0.02), { sides: 12, rings: 8 }), { p: V(0.055 * s, 0.112, 0.082) }), M.skinDark));
    const eye = joint(head, 0.036 * s, 0.134, 0.091);
    eye.add(mesh(ellipsoid(V(0.017, 0.012, 0.012), { sides: 16, rings: 10 }), M.eyeWhite, { cast: false }));
    eye.add(mesh(place(ellipsoid(V(0.0085, 0.0085, 0.004), { sides: 14, rings: 8 }), { p: V(0.002 * s, 0, 0.0105) }), M.iris, { cast: false }));
    eye.add(mesh(place(ellipsoid(V(0.004, 0.004, 0.002), { sides: 10, rings: 6 }), { p: V(0.002 * s, 0, 0.0135) }), M.pupil, { cast: false }));
    eye.add(mesh(place(ellipsoid(V(0.02, 0.008, 0.014), { sides: 14, rings: 8 }), { p: V(0, 0.008, 0.001), r: [-0.2, 0, -0.12 * s] }), M.skinDark));
    head.add(mesh(tube([V(0.016 * s, 0.153, 0.104), V(0.038 * s, 0.158, 0.103), V(0.058 * s, 0.153, 0.094)], [0.0045, 0.0055, 0.0035], { sides: 6, flatten: 0.5 }), M.hairDark));
    const ear = mesh(place(ellipsoid(V(0.012, 0.03, 0.02), { sides: 12, rings: 10 }), { p: V(0.1 * s, 0.12, -0.004), r: [0, -0.3 * s, 0.1 * s] }), M.skinDark);
    head.add(ear);
  }
  head.add(mesh(place(ring(0.009, 0.009, 0.0022, { segs: 24 }), { p: V(-0.102, 0.088, 0.004), r: [Math.PI / 2, 0, 0] }), M.gold));
  head.add(mesh(tube([V(-0.03, 0.065, 0.107), V(0, 0.067, 0.115), V(0.031, 0.071, 0.106)], [0.006, 0.007, 0.005], { sides: 8 }), M.lips));
  head.add(mesh(tube([V(-0.025, 0.057, 0.106), V(0, 0.054, 0.112), V(0.027, 0.059, 0.105)], [0.007, 0.0085, 0.006], { sides: 8 }), M.lips));
  // cabelo curto aparecendo na nuca e nas costeletas
  head.add(mesh(place(ellipsoid(V(0.102, 0.075, 0.103), { sides: 28, rings: 12, noiseAmp: 0.04, noiseFreq: 40 }), { p: V(0, 0.15, -0.012) }), M.hairDark));

  // ---------- gorro vermelho com energia (runas de vento brilhando) e caída para trás
  const cap = joint(head, 0, 0.16, -0.006);
  cap.add(mesh(tube([V(0, -0.01, 0), V(0, 0.07, -0.015), V(0, 0.14, -0.06), V(0, 0.18, -0.14), V(0.02, 0.16, -0.24), V(0.05, 0.1, -0.32), V(0.06, 0.03, -0.36)],
    [0.112, 0.106, 0.088, 0.066, 0.046, 0.026, 0.0], { sides: 36, subdiv: 6, noiseAmp: 0.06, noiseFreq: 11 }), M.capCloth));
  cap.add(mesh(place(ring(0.113, 0.11, 0.013, { segs: 48 }), { p: V(0, 0.0, 0) }), M.gold));
  const capTip = joint(cap, 0.06, 0.03, -0.36);
  capTip.add(mesh(ellipsoid(V(0.016, 0.016, 0.016), { sides: 12, rings: 8 }), M.gold));

  // ---------- cachimbo estilizado na mão direita, com brasa e fumaça luminosa
  const pipe = joint(armR.hand, 0.0, -0.1, 0.03, 0.4, 0, 0);
  pipe.add(mesh(tube([V(0, 0, -0.06), V(0, 0.01, 0.06), V(0, 0.02, 0.16)], [0.009, 0.0095, 0.011], { sides: 10 }), M.wood));
  pipe.add(mesh(place(ring(0.012, 0.012, 0.004, { segs: 20 }), { p: V(0, 0.005, 0.02), r: [Math.PI / 2, 0, 0] }), M.gold));
  pipe.add(mesh(place(ring(0.012, 0.012, 0.004, { segs: 20 }), { p: V(0, 0.015, 0.11), r: [Math.PI / 2, 0, 0] }), M.gold));
  const bowl = joint(pipe, 0, 0.02, 0.18);
  bowl.add(mesh(loft([[-0.03, 0.02, 0.02], [0.0, 0.032, 0.032], [0.045, 0.036, 0.036], [0.06, 0.032, 0.032]], { sides: 20, caps: false }), M.wood));
  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.1).multiplyScalar(3) });
  bowl.add(mesh(place(ellipsoid(V(0.028, 0.006, 0.028), { sides: 16, rings: 6 }), { p: V(0, 0.052, 0) }), emberMat, { cast: false }));

  // ---------- efeitos de vento
  const tornado = new Tornado({ radius: 1.35, height: 2.5 });
  root.add(tornado.group);
  const pipeSmoke = createParticles({ count: 60, mode: MODES.PIPE, look: LOOKS.GLOW, size: 0.06, life: 2.2, height: 0.9, color: 0xff6a3a, color2: 0xffd27a, intensity: 0.8 });
  const palm = createParticles({ count: 90, mode: MODES.TORNADO, look: LOOKS.DUST, size: 0.05, life: 1.2, radius: 0.13, height: 0.4, spin: 6, color: 0xfff0d0, color2: 0xffd27a, intensity: 1.2 });
  const palmLeaves = createParticles({ count: 10, mode: MODES.TORNADO, look: LOOKS.LEAF, size: 0.05, life: 1.4, radius: 0.14, height: 0.42, spin: 6, color: 0x9a7a2a, color2: 0x6e8f2c, additive: false });
  const fxRoot = new THREE.Group();
  fxRoot.add(pipeSmoke.points, palm.points, palmLeaves.points);
  const trails = [new Trail({ width: 0.09, color: 0xffe1b0 }), new Trail({ width: 0.14, color: 0xff7050 })];
  const smoke = createParticles({ count: 220, mode: MODES.BURST, look: LOOKS.SMOKE, size: 1.2, life: 1.4, radius: 1.4, height: -0.2, color: 0x2a1414, color2: 0x5a1a12, additive: false });
  const smokeGlow = createParticles({ count: 120, mode: MODES.BURST, look: LOOKS.GLOW, size: 0.08, life: 1.0, radius: 1.8, height: 1.0, color: 0xff4a2a, color2: 0xffd27a });
  fxRoot.add(smoke.points, smokeGlow.points);
  const stun = new THREE.Group();
  const stunStars = [];
  root.add(stun);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; } });

  const tl = new Timeline();
  let tornadoBoost = 0;
  let spinBoost = 0;
  let vanish = 0;
  let teleport = V();
  const tmp = V();

  const character = {
    id: 'saci',
    root,
    fxRoot,
    trails,
    focus: V(0, 1.15, 0),
    cameraDistance: 4.2,
    info: {
      name: 'SACI', epithet: 'O Redemoinho', role: 'Duelista', color: '#e3262d', accent: '#f2b84b',
      lore: 'Nasce do gomo do bambu e mora no redemoinho que levanta a poeira das estradas. Uma perna só, gorro vermelho e um cachimbo que nunca apaga: onde ele passa, o vento muda de dono.',
      stats: { Dano: 6, Mobilidade: 10, Controle: 7, Resistência: 3, Dificuldade: 9 },
      abilities: [
        { name: 'Rodamoinho', icon: 'swirl', desc: 'O redemoinho cresce e acelera, arrastando poeira, folhas e quem estiver perto.' },
        { name: 'Sumiço', icon: 'smoke', desc: 'Some numa nuvem de fumaça vermelha e reaparece em outro ponto do vento.' },
        { name: 'Travessura', icon: 'knot', desc: 'Um laço de vento desamarra o alvo e o deixa tonto por um instante.' },
      ],
    },
    distortion() {
      return [{ pos: worldPos(hips, V(0, 0.2, 0)), radius: 0.22 + tornadoBoost * 0.12, strength: 0.0035 + tornadoBoost * 0.008 }];
    },
    play(i, ctx) {
      if (i === 0) {
        tl.play(3.2, (k) => { tornadoBoost = ease.pulse(k) * 1.6; spinBoost = ease.pulse(k); });
        ctx.shake(0.25);
        shockRing(ctx.fx, root.position, 2.4, 0xffe6b0, 0.8);
      } else if (i === 1) {
        const p0 = root.position.clone();
        smoke.uniforms.uOrigin.value.copy(p0).add(V(0, 0.9, 0)); smoke.burst(ctx.time);
        smokeGlow.uniforms.uOrigin.value.copy(p0).add(V(0, 0.9, 0)); smokeGlow.burst(ctx.time);
        glowBall(ctx.fx, p0.clone().add(V(0, 1, 0)), 2.5, 0xff5a3a, 0.4);
        trails.forEach((t) => (t.active = true));
        tl.play(2.4, (k) => {
          vanish = k < 0.12 ? k / 0.12 : k < 0.42 ? 1 : k < 0.55 ? 1 - (k - 0.42) / 0.13 : k < 0.8 ? 0 : 0;
          teleport.set(k > 0.3 && k < 0.85 ? 1.7 : 0, 0, k > 0.3 && k < 0.85 ? 0.3 : 0);
        }, () => { teleport.set(0, 0, 0); vanish = 0; });
        setTimeout(() => {
          const p1 = root.position.clone().add(V(1.7, 0.9, 0.3));
          smoke.uniforms.uOrigin.value.copy(p1); smoke.burst(ctx.timeNow());
          glowBall(ctx.fx, p1, 2.0, 0xff7a3a, 0.35);
        }, 900);
        ctx.shake(0.15);
      } else {
        // laço de vento que se desenrola e deixa o alvo tonto
        const target = root.position.clone().add(V(0, 1.2, 1.6));
        for (const s of stunStars) stun.remove(s);
        stunStars.length = 0;
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.3).multiplyScalar(3) }));
          stun.add(s); stunStars.push(s);
        }
        const lasso = new THREE.Mesh(helix(V(0, 1.1, 0.2), V(0, 1.2, 1.6), 0.25, 3, 0.015, { segs: 160 }), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.5).multiplyScalar(2.5), transparent: true }));
        ctx.fx.add(lasso, 1.2, (k, o) => { o.scale.set(1 + k * 0.6, 1, 0.2 + ease.out(Math.min(1, k * 2)) * 0.8); o.material.opacity = 1 - k; o.rotation.z = k * 4; });
        tl.play(2.2, (k) => {
          stun.visible = k > 0.25;
          stunStars.forEach((s, j) => {
            const a = ctx.time * 5 + (j / 4) * Math.PI * 2;
            s.position.set(target.x + Math.cos(a) * 0.3, target.y + 0.15 + Math.sin(ctx.time * 7 + j) * 0.04, target.z + Math.sin(a) * 0.3);
            s.rotation.y += 0.2;
          });
        }, () => { stun.visible = false; });
        glowBall(ctx.fx, target, 1.2, 0xffd27a, 0.5);
      }
    },
    update(t, dt, ctx) {
      U.uTime.value = t;
      tl.update(dt);
      // equilíbrio numa perna: pequenos saltos, balanço do tronco, olhar travesso
      const hop = Math.max(0, Math.sin(t * 2.4)) ** 6 * 0.07;
      body.position.y = hop;
      body.position.x = THREE.MathUtils.lerp(body.position.x, teleport.x, 0.25);
      body.position.z = THREE.MathUtils.lerp(body.position.z, teleport.z, 0.25);
      knee.rotation.x = -0.24 - hop * 2.5;
      ankle.rotation.x = 0.12 + hop * 1.5;
      spine.rotation.set(Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.8) * 0.12, Math.sin(t * 1.1) * 0.04);
      head.rotation.set(Math.sin(t * 0.9) * 0.05 - 0.05, Math.sin(t * 0.6 + 1) * 0.25, Math.sin(t * 0.7) * 0.06);
      cap.rotation.set(Math.sin(t * 2.0) * 0.08 - hop, Math.sin(t * 1.6) * 0.15, 0);
      shoulderL.rotation.z = -0.95 + Math.sin(t * 1.2) * 0.06;
      armL.hand.rotation.z = 0.4 + Math.sin(t * 2.0) * 0.1;
      body.rotation.y += spinBoost * dt * 14;
      if (!tl.busy) body.rotation.y = THREE.MathUtils.lerp(body.rotation.y % (Math.PI * 2), 0, 0.05);
      const s = 1 - vanish;
      body.scale.setScalar(Math.max(0.001, s));
      M.capCloth.emissiveIntensity = 1.6 + Math.sin(t * 3.0) * 0.5 + tornadoBoost * 1.5;
      tornado.setStrength(1 + tornadoBoost);
      tornado.group.position.copy(body.position);
      tornado.update(t, dt, ctx.pixelScale);
      // efeitos que seguem partes do corpo
      worldPos(bowl, V(0, 0.06, 0)).sub(root.position); pipeSmoke.uniforms.uOrigin.value.copy(worldPos(bowl, V(0, 0.06, 0)));
      palm.uniforms.uOrigin.value.copy(worldPos(armL.hand, V(0, -0.06, 0.12)));
      palmLeaves.uniforms.uOrigin.value.copy(palm.uniforms.uOrigin.value);
      for (const p of [pipeSmoke, palm, palmLeaves, smoke, smokeGlow]) p.update(t, ctx.pixelScale);
      trails[0].active = trails[1].active = tl.busy || hop > 0.02;
      trails[0].update(worldPos(capTip, tmp.set(0, 0, 0)), ctx.camera);
      trails[1].update(worldPos(ankle, tmp.set(0, -0.05, 0.05)), ctx.camera);
    },
    setQuality(r) { tornado.setQuality(r); },
  };
  return character;
}
