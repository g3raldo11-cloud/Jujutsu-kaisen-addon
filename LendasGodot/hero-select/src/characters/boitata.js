import * as THREE from 'three';
import { tube, sweep, smoothPoints, smoothValues, ellipsoid, place, V, mulberry } from '../core/geometry.js';
import { materials, emberScalesMaterial } from './materials.js';
import { mesh, joint, Timeline, ease, worldPos } from './common.js';
import { createFlameCards } from '../shaders/flame.js';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';
import { FireCluster, flamePointsDisc } from '../effects/fire.js';
import { shockRing, glowBall, lightCone, glowTexture } from '../effects/burst.js';

// BOITATÁ — "A Serpente de Fogo". Serpente colossal de fogo vivo, enrolada no pedestal, com
// escamas de brasa e rachaduras de lava que pulsam, olhos enormes e incandescentes, chamas
// percorrendo a espinha com pontas frias azuladas, brasas, fumaça e luz que tremula no chão.
export function createBoitata() {
  const M = materials();
  const U = { uTime: { value: 0 }, uPulse: { value: 1 } };
  const scaleMat = emberScalesMaterial(U);
  const root = new THREE.Group();
  const body = joint(root);
  const rnd = mulberry(11);

  // ---------- corpo: da cabeça (t=0) à ponta da cauda (t=1), enrolado no pedestal
  const ctrl = [V(0, 2.62, 0.3), V(0.04, 2.35, 0.05), V(0.18, 1.85, -0.2), V(0.32, 1.25, -0.32), V(0.5, 0.75, -0.42), V(0.85, 0.48, -0.9)];
  for (let k = 0; k <= 14; k++) {
    const a = -1.05 + (k / 14) * Math.PI * 2 * 1.55;
    const r = THREE.MathUtils.lerp(1.45, 1.05, k / 14);
    ctrl.push(V(Math.cos(a) * r, THREE.MathUtils.lerp(0.42, 0.3, k / 14), Math.sin(a) * r));
  }
  const pts = smoothPoints(ctrl, 5);
  const n = pts.length;
  const rx = [], ry = [];
  const radius = (t) => (t < 0.18 ? THREE.MathUtils.lerp(0.34, 0.5, t / 0.18) : THREE.MathUtils.lerp(0.5, 0.02, Math.pow((t - 0.18) / 0.82, 1.25)));
  for (let i = 0; i < n; i++) { const t = i / (n - 1); rx.push(radius(t)); ry.push(radius(t) * 0.86); }
  const bodyMesh = mesh(sweep(pts, rx, ry, { sides: 44, up: V(0, 1, 0), caps: true, uvRepeat: 1 }), scaleMat);
  body.add(bodyMesh);

  // ---------- cabeça esculpida
  const head = joint(body, 0, 2.66, 0.36, 0.18, 0, 0);
  head.add(mesh(tube([V(0, 0.03, -0.46), V(0, 0.11, -0.15), V(0, 0.1, 0.2), V(0, 0.05, 0.52), V(0, 0.0, 0.76)], [0.4, 0.44, 0.38, 0.24, 0.1], { sides: 44, flatten: 0.6, up: V(0, 1, 0) }), scaleMat));
  const jaw = joint(head, 0, -0.07, -0.16);
  jaw.add(mesh(tube([V(0, 0, 0), V(0, -0.07, 0.28), V(0, -0.07, 0.52), V(0, -0.05, 0.7)], [0.27, 0.24, 0.14, 0.06], { sides: 36, flatten: 0.38, up: V(0, 1, 0) }), scaleMat));
  const mouthGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.35, 0.05).multiplyScalar(2.5) });
  jaw.add(mesh(tube([V(0, 0.03, 0.08), V(0, 0.0, 0.36), V(0, 0.02, 0.6)], [0.15, 0.1, 0.03], { sides: 18, flatten: 0.3, up: V(0, 1, 0) }), mouthGlow, { cast: false }));
  for (const s of [-1, 1]) {
    // arcadas angulosas e chifres que varrem para trás
    head.add(mesh(tube([V(0.1 * s, 0.24, 0.36), V(0.22 * s, 0.31, 0.18), V(0.31 * s, 0.27, -0.04), V(0.34 * s, 0.22, -0.18)], [0.045, 0.08, 0.06, 0.03], { sides: 14, flatten: 0.6 }), scaleMat));
    head.add(mesh(tube([V(0.22 * s, 0.3, -0.12), V(0.32 * s, 0.48, -0.38), V(0.36 * s, 0.58, -0.7), V(0.3 * s, 0.6, -0.95)], [0.075, 0.055, 0.03, 0.0], { sides: 16, subdiv: 6 }), M.bone));
    head.add(mesh(tube([V(0.34 * s, 0.05, -0.2), V(0.46 * s, 0.0, -0.32), V(0.55 * s, -0.04, -0.42)], [0.05, 0.03, 0.0], { sides: 12 }), M.bone));
    // presas
    head.add(mesh(tube([V(0.13 * s, -0.04, 0.5), V(0.14 * s, -0.17, 0.53), V(0.12 * s, -0.28, 0.5)], [0.035, 0.022, 0.0], { sides: 12, subdiv: 5 }), M.bone));
    for (let k = 0; k < 5; k++) {
      const z = 0.12 + k * 0.08;
      jaw.add(mesh(tube([V((0.18 - k * 0.02) * s, 0.0, z), V((0.18 - k * 0.02) * s, 0.07, z + 0.012)], [0.018, 0.0], { sides: 8, subdiv: 2 }), M.bone));
    }
    // olhos enormes e incandescentes, com pupila em fenda
    const eye = joint(head, 0.24 * s, 0.17, 0.2, 0, 0.35 * s, 0);
    eye.add(mesh(ellipsoid(V(0.13, 0.105, 0.12), { sides: 28, rings: 18 }), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.2).multiplyScalar(2.2) }), { cast: false }));
    eye.add(mesh(place(ellipsoid(V(0.016, 0.09, 0.03), { sides: 12, rings: 10 }), { p: V(0, 0, 0.1) }), M.pupil, { cast: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.6);
    glow.position.set(0, 0, 0.08);
    eye.add(glow);
    eye.userData.glow = glow;
  }
  const eyes = head.children.filter((c) => c.userData.glow);

  // ---------- chamas: espinha (pontas frias azuladas), crista, enrolamento no chão
  const spineCount = 56;
  const spine = createFlameCards(spineCount, { blueTips: 0.85, intensity: 1.0, speed: 1.8, tip: 0x5ab4ff });
  const spineIdx = [];
  for (let i = 0; i < spineCount; i++) {
    const t = Math.pow(i / spineCount, 1.1) * 0.93;
    const k = Math.floor(t * (n - 1));
    spineIdx.push(k);
    const r = radius(t);
    const p = pts[k].clone().add(V((rnd() - 0.5) * r * 0.5, r * 0.75, (rnd() - 0.5) * r * 0.5));
    spine.set(i, p, r * (0.7 + rnd() * 0.35), r * (1.1 + rnd() * 0.9));
  }
  spine.commit();
  body.add(spine.mesh);
  const crest = createFlameCards(10, { blueTips: 0.7, intensity: 1.0, speed: 2.0, tip: 0x5ab4ff });
  for (let i = 0; i < 10; i++) crest.set(i, V((rnd() - 0.5) * 0.3, 0.28 + rnd() * 0.05, -0.3 + rnd() * 0.45), 0.22 + rnd() * 0.12, 0.45 + rnd() * 0.3);
  crest.commit();
  head.add(crest.mesh);

  // fogo e luz: um foco na cabeça, outro no meio do corpo; brasas e fumaça subindo
  const fireHead = new FireCluster({ ...flamePointsDisc(5, 0.2, 0, 0.25, 0.4, 0.4, 0.7, rnd), blueTips: 0.6, embers: 120, smoke: 20, area: 0.4, height: 1.0, lightIntensity: 3.5, lightRange: 7, tip: 0x5ab4ff });
  fireHead.group.position.set(0, 2.6, 0.2);
  const fireBody = new FireCluster({ ...flamePointsDisc(7, 0.5, 0.3, 0.3, 0.5, 0.4, 0.8, rnd), blueTips: 0.7, embers: 220, smoke: 34, area: 1.3, height: 1.2, lightIntensity: 6, lightRange: 9, tip: 0x5ab4ff });
  fireBody.group.position.set(0, 0.2, 0);
  body.add(fireHead.group, fireBody.group);
  const coolLight = new THREE.PointLight(0x4a9aff, 3, 6, 2);
  coolLight.position.set(0, 1.8, 0.6);
  body.add(coolLight);

  // fogo-fátuo (habilidade): chamas frias que orbitam
  const wispGroup = new THREE.Group();
  const wisps = [];
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(0.6);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.95, 1.0).multiplyScalar(3) }));
    sp.add(core);
    wispGroup.add(sp); wisps.push(sp);
  }
  wispGroup.visible = false;
  root.add(wispGroup);
  const ringFire = createFlameCards(64, { blueTips: 0.5, intensity: 1.4, speed: 2.2, tip: 0x5ab4ff });
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; ringFire.set(i, V(Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1), 0.7, 1.6); }
  ringFire.commit();
  ringFire.mesh.visible = false;
  root.add(ringFire.mesh);
  const sparks = createParticles({ count: 260, mode: MODES.BURST, look: LOOKS.GLOW, size: 0.06, life: 1.4, radius: 3.2, height: 1.5, color: 0xffb04a, color2: 0xff3a10 });
  const fxRoot = new THREE.Group();
  fxRoot.add(sparks.points);

  const tl = new Timeline();
  let eyeFlare = 0;
  let squeeze = 0;
  let wispT = -1;

  return {
    id: 'boitata',
    root,
    fxRoot,
    trails: [],
    focus: V(0, 1.55, 0),
    cameraDistance: 6.8,
    info: {
      name: 'BOITATÁ', epithet: 'A Serpente de Fogo', role: 'Tanque', color: '#ff6a1a', accent: '#5ab4ff',
      lore: 'Mbaê-tatá, a coisa de fogo. Atravessou a noite do grande dilúvio comendo a luz dos olhos dos bichos e ficou feita de brasa. Protege os campos de quem os incendeia — e quem encara seus olhos não esquece.',
      stats: { Dano: 8, Mobilidade: 4, Controle: 8, Resistência: 10, Dificuldade: 5 },
      abilities: [
        { name: 'Fogo-Fátuo', icon: 'wisp', desc: 'Solta chamas frias e azuladas que orbitam o corpo e confundem quem as segue.' },
        { name: 'Abraço Ardente', icon: 'coil', desc: 'Aperta o enrolamento e explode um anel de fogo em volta de si.' },
        { name: 'Olhos que Cegam', icon: 'eye', desc: 'Os olhos ardem como dois sóis e cegam tudo o que estiver à frente.' },
      ],
    },
    distortion() {
      return [
        { pos: worldPos(head, V(0, 0.6, 0)), radius: 0.18, strength: 0.006 },
        { pos: worldPos(body, V(0, 1.2, 0)), radius: 0.3, strength: 0.004 + squeeze * 0.01 },
      ];
    },
    play(i, ctx) {
      if (i === 0) {
        wispT = 0;
        wispGroup.visible = true;
        glowBall(ctx.fx, worldPos(head, V(0, 0, 0.7)), 1.8, 0x8fd8ff, 0.4);
        tl.play(4.5, (k) => { wispT = k; }, () => { wispGroup.visible = false; wispT = -1; });
      } else if (i === 1) {
        ringFire.mesh.visible = true;
        sparks.uniforms.uOrigin.value.copy(root.position).add(V(0, 0.4, 0)); sparks.burst(ctx.time);
        shockRing(ctx.fx, root.position, 4.2, 0xff8a2a, 0.9);
        ctx.shake(0.5);
        tl.play(2.4, (k) => {
          squeeze = ease.pulse(k);
          const r = THREE.MathUtils.lerp(1.4, 3.6, ease.out(k));
          for (let j = 0; j < 64; j++) { const a = (j / 64) * Math.PI * 2; ringFire.set(j, V(Math.cos(a) * r, 0, Math.sin(a) * r), 0.8, 1.9 * (1 - k * 0.8)); }
          ringFire.commit();
        }, () => { ringFire.mesh.visible = false; squeeze = 0; });
      } else {
        const p = worldPos(head, V(0, 0.15, 0.4));
        const fwd = worldPos(head, V(0, -0.2, 2)).sub(worldPos(head, V(0, 0, 0))).normalize();
        lightCone(ctx.fx, p, fwd, 9, 46, 0xffd27a, 0.9);
        glowBall(ctx.fx, p, 4, 0xfff0c0, 0.5);
        ctx.flash('#fff1c8', 0.55);
        ctx.bloomKick(1.6);
        tl.play(1.4, (k) => { eyeFlare = ease.pulse(k); });
      }
    },
    update(t, dt, ctx) {
      U.uTime.value = t;
      tl.update(dt);
      U.uPulse.value = 1 + squeeze * 1.6 + eyeFlare * 0.5;
      head.rotation.set(0.18 + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.45) * 0.18, Math.sin(t * 0.6) * 0.05);
      head.position.y = 2.66 + Math.sin(t * 0.9) * 0.04;
      jaw.rotation.x = 0.08 + Math.max(0, Math.sin(t * 0.8)) * 0.1 + eyeFlare * 0.3;
      body.scale.set(1 - squeeze * 0.06, 1, 1 - squeeze * 0.06);
      for (const e of eyes) e.userData.glow.scale.setScalar(0.6 + Math.sin(t * 5) * 0.05 + eyeFlare * 3.5);
      spine.update(t); crest.update(t); ringFire.update(t);
      fireHead.update(t, ctx.pixelScale); fireBody.update(t, ctx.pixelScale);
      fireBody.setStrength(1 + squeeze);
      coolLight.intensity = 3 + Math.sin(t * 9) * 0.6;
      sparks.update(t, ctx.pixelScale);
      if (wispT >= 0) {
        wisps.forEach((w, j) => {
          const a = t * 1.4 + (j / wisps.length) * Math.PI * 2;
          const r = 1.2 + ease.out(Math.min(1, wispT * 3)) * 1.3;
          w.position.set(Math.cos(a) * r, 1.2 + Math.sin(t * 2 + j) * 0.5 + j * 0.15, Math.sin(a) * r);
          w.material.opacity = Math.min(1, (1 - wispT) * 3);
        });
      }
    },
    setQuality(r) { fireHead.setQuality(r); fireBody.setQuality(r); },
  };
}
