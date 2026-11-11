import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DistortionShader } from './shaders/distortion.js';
import { createBackdrop, createPedestal } from './scenes/backdrops.js';
import { createSaci } from './characters/saci.js';
import { createBoitata } from './characters/boitata.js';
import { createCurupira } from './characters/curupira.js';
import { attachSculpted } from './characters/sculpted.js';
import { FxPool } from './effects/burst.js';
import { createParticles, MODES, LOOKS } from './shaders/particles.js';
import { createUI } from './ui/ui.js';

// ------------------------------------------------------------------ cena, câmera e pós-processamento
const params = new URLSearchParams(location.search);
let quality = params.get('q') === 'low' ? 'low' : 'high';
// modelos esculpidos no Blender (LendasGodot/assets/models); ?modelo=procedural volta aos antigos
const SCULPTED = params.get('modelo') !== 'procedural';
const HEROES = [
  { make: createSaci, backdrop: 'cerrado', glb: 'saci.glb' },
  { make: createBoitata, backdrop: 'campo', glb: 'boitata.glb' },
  { make: createCurupira, backdrop: 'mata', glb: 'curupira.glb' },
];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600);
camera.position.set(2.5, 2.2, 5.5);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, enablePan: false, minDistance: 2.4, maxDistance: 11, minPolarAngle: 0.55, maxPolarAngle: 1.58, autoRotate: true, autoRotateSpeed: 0.5, rotateSpeed: 0.6, zoomSpeed: 0.7 });

// iluminação de estúdio: luz principal (sombras suaves), duas luzes de recorte e preenchimento
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(3.5, 6.5, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 0.5, far: 20 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
const rimL = new THREE.DirectionalLight(0xff7a40, 3.2);
rimL.position.set(-4, 4, -4.5);
const rimR = new THREE.DirectionalLight(0xff7a40, 2.4);
rimR.position.set(4.5, 3, -4);
const fill = new THREE.HemisphereLight(0x8899cc, 0x221a14, 0.55);
const front = new THREE.DirectionalLight(0xffffff, 0.7);
front.position.set(0, 1.5, 6);
scene.add(key, key.target, rimL, rimR, fill, front);

const pedestal = createPedestal();
scene.add(pedestal.group);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const distortion = new ShaderPass(DistortionShader);
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.82);
const bokeh = new BokehPass(scene, camera, { focus: 5.5, aperture: 0.0009, maxblur: 0.006 });
const output = new OutputPass();
composer.addPass(renderPass);
composer.addPass(distortion);
composer.addPass(bokeh);
composer.addPass(bloom);
composer.addPass(output);
let bloomBase = 0.85;

// ------------------------------------------------------------------ estado
const fx = new FxPool(scene);
const cache = new Map();
let hero = null;
let backdrop = null;
let heroIndex = -1;
const clock = new THREE.Clock();
let time = 0;
let shake = 0;
let transition = null;
const transitionSparks = createParticles({ count: 400, mode: MODES.BURST, look: LOOKS.GLOW, size: 0.07, life: 1.3, radius: 4, height: 1.2, color: 0xffffff, color2: 0xffd27a });
scene.add(transitionSparks.points);

const ui = createUI({
  onSelect: (i) => select(i),
  onAbility: (i) => play(i),
  onCapture: () => capture(true),
  onQuality: () => setQuality(quality === 'high' ? 'low' : 'high'),
  onRotate: (on) => (controls.autoRotate = on),
});

const ctx = {
  camera,
  fx,
  pixelScale: 800,
  get time() { return time; },
  timeNow: () => time,
  shake: (a) => (shake = Math.min(1, shake + a)),
  flash: (color, dur) => ui.flash(color, dur),
  bloomKick: (k) => (bloom.strength = bloomBase * k),
  fireflies: (dur) => {
    const ff = backdrop?.group.userData.fireflies;
    if (!ff) return;
    ff.uniforms.uIntensity.value = 3;
    setTimeout(() => (ff.uniforms.uIntensity.value = 1.2), dur * 1000);
  },
};

function getHero(i) {
  if (!cache.has(i)) {
    const h = HEROES[i].make();
    if (SCULPTED) attachSculpted(h, HEROES[i].glb);
    h.root.traverse((o) => {
      if (o.isMesh && o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 0.35;
    });
    h.setQuality?.(quality === 'high' ? 1 : 0.5);
    cache.set(i, h);
  }
  return cache.get(i);
}

function select(i, instant = false) {
  if (i === heroIndex) return;
  if (hero) {
    scene.remove(hero.root, hero.fxRoot);
    hero.trails.forEach((t) => scene.remove(t.mesh));
  }
  if (backdrop) { scene.remove(backdrop.group); }
  fx.clear();
  heroIndex = i;
  hero = getHero(i);
  hero.root.position.set(0, pedestal.topY, 0);
  scene.add(hero.root, hero.fxRoot);
  hero.trails.forEach((t) => scene.add(t.mesh));
  backdrop = createBackdrop(HEROES[i].backdrop);
  scene.add(backdrop.group);
  scene.fog = backdrop.fog;
  key.color.set(backdrop.light.key); key.intensity = backdrop.light.keyI;
  rimL.color.set(hero.info.color); rimR.color.set(backdrop.light.rim);
  fill.color.set(backdrop.light.hemiSky); fill.groundColor.set(backdrop.light.hemiGround);
  pedestal.setColor(hero.info.color);
  ui.show(hero.info, i);
  document.documentElement.style.setProperty('--hero', hero.info.color);
  document.documentElement.style.setProperty('--accent', hero.info.accent);
  // transição cinematográfica: clarão, faíscas e corte de câmera com aproximação
  const focus = hero.focus.clone().add(hero.root.position);
  controls.target.copy(focus);
  const dist = hero.cameraDistance;
  const from = { az: 0.95, el: 0.12, d: dist * 0.55 };
  const to = { az: 0.38, el: 0.2, d: dist };
  if (!instant) {
    ui.flash('#ffffff', 0.45);
    transitionSparks.uniforms.uColor.value.set(hero.info.color);
    transitionSparks.uniforms.uOrigin.value.copy(hero.root.position).add(new THREE.Vector3(0, 1, 0));
    transitionSparks.burst(time);
    shake = 0.3;
  }
  transition = { t: instant ? 1 : 0, from, to, focus };
  placeCamera(instant ? to : from, focus);
}

function placeCamera({ az, el, d }, focus) {
  camera.position.set(focus.x + Math.sin(az) * Math.cos(el) * d, focus.y + Math.sin(el) * d, focus.z + Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(focus);
}

function play(i) {
  if (!hero) return;
  hero.play(i, ctx);
  ui.abilityPlayed(i);
}

function capture(download) {
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `lendas-${hero.id}.png`;
    a.click();
  }
  return url;
}

function setQuality(q) {
  quality = q;
  const high = q === 'high';
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
  renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  key.shadow.map?.dispose(); key.shadow.map = null;
  bokeh.enabled = high;
  distortion.enabled = high;
  for (const h of cache.values()) h.setQuality?.(high ? 1 : 0.5);
  resize();
  ui.setQuality(q);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  bloom.setSize((w * pr) / (quality === 'high' ? 1 : 2), (h * pr) / (quality === 'high' ? 1 : 2));
  camera.aspect = w / h;
  // em telas estreitas, recua a câmera para caber o herói
  camera.fov = w < 700 ? 44 : 34;
  camera.updateProjectionMatrix();
  ctx.pixelScale = (h * pr * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  distortion.uniforms.uAspect.value = w / h;
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ laço
const tmpV = new THREE.Vector3();
let frames = 0, fpsTime = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  if (transition && transition.t < 1) {
    transition.t = Math.min(1, transition.t + dt / 1.4);
    const k = 1 - Math.pow(1 - transition.t, 3);
    const a = transition.from, b = transition.to;
    placeCamera({ az: a.az + (b.az - a.az) * k, el: a.el + (b.el - a.el) * k, d: a.d + (b.d - a.d) * k }, transition.focus);
    controls.enabled = false;
  } else {
    controls.enabled = true;
    controls.update();
  }
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.08;
    camera.position.y += (Math.random() - 0.5) * shake * 0.08;
    shake *= Math.pow(0.02, dt);
  }
  bloom.strength += (bloomBase - bloom.strength) * Math.min(1, dt * 3);
  if (hero) {
    hero.update(time, dt, ctx);
    const srcs = hero.distortion?.() ?? [];
    const dist = camera.position.distanceTo(controls.target);
    for (let i = 0; i < 4; i++) {
      const s = srcs[i];
      const u = distortion.uniforms.uSources.value[i];
      if (!s) { u.set(0, 0, 0, 0); continue; }
      tmpV.copy(s.pos).project(camera);
      u.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5, s.radius * (4.5 / dist), s.strength);
    }
    bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
  }
  distortion.uniforms.uTime.value = time;
  backdrop?.update(time, dt, ctx.pixelScale);
  pedestal.update(time);
  transitionSparks.update(time, ctx.pixelScale);
  fx.update(dt);
  composer.render();
  frames++; fpsTime += dt;
  if (fpsTime > 0.5) { ui.fps(Math.round(frames / fpsTime)); frames = 0; fpsTime = 0; }
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ início
resize();
setQuality(quality);
requestAnimationFrame(() => {
  select(0, true);
  ui.ready();
  clock.getDelta();
  tick();
  // pré-constrói os outros heróis sem travar a primeira tela
  setTimeout(() => { getHero(1); getHero(2); }, 400);
});

window.__lendas = { select: (i) => select(i, true), play, capture: () => capture(false), setQuality, get hero() { return hero?.id; }, get sculpted() { return !!hero?.sculpted; }, renderer, controls, camera };
