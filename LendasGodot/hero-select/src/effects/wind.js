import * as THREE from 'three';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';
import { NOISE_GLSL } from '../shaders/noise.js';

// Redemoinho: poeira e folhas em espiral (curl noise) + faixas de ar helicoidais translúcidas
// com listras que sobem. A intensidade cresce no "Rodamoinho".
export class Tornado {
  constructor({ radius = 1.4, height = 2.6, dust = 700, leaves = 90, bands = 7, color = 0xd9b98a } = {}) {
    this.group = new THREE.Group();
    this.dust = createParticles({ count: dust, mode: MODES.TORNADO, look: LOOKS.DUST, size: 0.14, life: 2.6, radius, height, spin: 2.6, color, color2: 0xb89a70, turbulence: 1.0, intensity: 0.55, additive: false });
    this.leaves = createParticles({ count: leaves, mode: MODES.TORNADO, look: LOOKS.LEAF, size: 0.12, life: 3.0, radius: radius * 1.05, height, spin: 2.2, color: 0x8a6a2a, color2: 0x6e7f2c, additive: false, turbulence: 1.2 });
    this.sparks = createParticles({ count: 120, mode: MODES.TORNADO, look: LOOKS.GLOW, size: 0.035, life: 2.0, radius: radius * 0.8, height, spin: 3.0, color: 0xffd36a, color2: 0xff4a2a, turbulence: 0.8, intensity: 0.7 });
    this.group.add(this.dust.points, this.leaves.points, this.sparks.points);
    this.bandMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.35 }, uColor: { value: new THREE.Color(0xfff2dc) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${NOISE_GLSL}
        uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float streak = smoothstep(0.35, 1.0, snoise(vec3(vUv.x * 3.0 - uTime * 2.2, vUv.y * 6.0, uTime * 0.3)));
          float edge = sin(vUv.y * 3.14159);
          float fade = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
          float a = streak * edge * fade * uAlpha;
          gl_FragColor = vec4(uColor * 1.4, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.bands = new THREE.Group();
    for (let b = 0; b < bands; b++) {
      const turns = 1.2 + Math.random() * 0.6, phase = (b / bands) * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80, a = phase + t * turns * Math.PI * 2;
        const r = THREE.MathUtils.lerp(radius * 0.3, radius * 1.05, Math.pow(t, 0.8));
        pts.push(new THREE.Vector3(Math.cos(a) * r, t * height * 0.95 + 0.1, Math.sin(a) * r));
      }
      this.bands.add(new THREE.Mesh(ribbon(pts, 0.12 + Math.random() * 0.1), this.bandMat));
    }
    this.group.add(this.bands);
    this.strength = 1;
  }
  setStrength(k) {
    this.strength = k;
    this.dust.uniforms.uIntensity.value = 0.55 * Math.min(1.6, k);
    this.sparks.uniforms.uIntensity.value = 0.7 * k;
    this.leaves.uniforms.uIntensity.value = Math.min(1, k);
    for (const p of [this.dust, this.leaves, this.sparks]) p.uniforms.uSpin.value = 2.4 * (0.7 + 0.5 * k);
    this.bandMat.uniforms.uAlpha.value = 0.3 * k;
    this.group.scale.setScalar(0.85 + 0.25 * k);
  }
  update(t, dt, pixelScale) {
    for (const p of [this.dust, this.leaves, this.sparks]) p.update(t, pixelScale);
    this.bandMat.uniforms.uTime.value = t;
    this.bands.rotation.y -= dt * (1.6 + this.strength * 1.6);
  }
  setQuality(r) { this.dust.setQuality(r); this.leaves.setQuality(r); this.sparks.setQuality(r); }
}

/** Fita ao longo de uma curva (largura no plano vertical). */
export function ribbon(points, width) {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    pos.set([p.x, p.y - width / 2, p.z, p.x, p.y + width / 2, p.z], i * 6);
    uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
    if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
