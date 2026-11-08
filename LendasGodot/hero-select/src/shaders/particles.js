import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

// Partículas na GPU sem estado: a posição de cada partícula é uma função do tempo e da sua
// semente, calculada no vertex shader (com curl noise para turbulência). Milhares de
// partículas custam um único desenho.

export const MODES = { TORNADO: 0, EMBERS: 1, FIREFLIES: 2, SPORES: 3, SMOKE: 4, ORBIT: 5, WISPS: 6, BURST: 7, PIPE: 8 };
export const LOOKS = { GLOW: 0, LEAF: 1, SMOKE: 2, DUST: 3 };

export function createParticles({
  count = 500, mode = MODES.EMBERS, look = LOOKS.GLOW, size = 0.1, life = 2.0,
  radius = 1, height = 2, spin = 1, color = 0xffaa33, color2 = 0xff3300, additive = true,
  intensity = 1, origin = new THREE.Vector3(), turbulence = 0.5,
} = {}) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 }, uStart: { value: -100 }, uMode: { value: mode }, uLook: { value: look },
    uSize: { value: size }, uLife: { value: life }, uRadius: { value: radius }, uHeight: { value: height },
    uSpin: { value: spin }, uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2) },
    uIntensity: { value: intensity }, uOrigin: { value: origin.clone() }, uTurb: { value: turbulence },
    uScale: { value: 800 }, uDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${NOISE_GLSL}
      attribute vec4 aSeed;
      uniform float uTime, uStart, uSize, uLife, uRadius, uHeight, uSpin, uIntensity, uTurb, uScale;
      uniform int uMode; uniform vec3 uOrigin, uDir;
      varying float vAlpha; varying float vRot; varying vec4 vSeed; varying float vAge;
      const float TAU = 6.28318;
      void main(){
        vSeed = aSeed;
        float life = uLife * (0.7 + 0.6 * aSeed.w);
        float age = fract(uTime / life + aSeed.z);
        vec3 p = vec3(0.0); float sz = 1.0; float alpha = 1.0; vRot = aSeed.x * TAU + uTime * (aSeed.y - 0.5) * 6.0;
        if (uMode == 0) { // TORNADO: sobe em espiral alargando, com curl noise
          float h = age * uHeight;
          float r = mix(uRadius * 0.25, uRadius, pow(age, 0.7)) * (0.75 + 0.5 * aSeed.x);
          float a = aSeed.y * TAU + uTime * uSpin * (2.2 - age) / (0.35 + r);
          p = vec3(cos(a) * r, h, sin(a) * r);
          p += curl(p * 0.7 + vec3(0.0, uTime * 0.4, 0.0)) * uTurb * 0.25;
          alpha = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.75, 1.0, age));
        } else if (uMode == 1) { // EMBERS: sobem com turbulência
          float a = aSeed.x * TAU; float r = sqrt(aSeed.y) * uRadius;
          vec3 s = vec3(cos(a) * r, aSeed.w * 0.3 * uHeight, sin(a) * r);
          p = s + vec3(0.0, age * uHeight * (0.6 + 0.6 * aSeed.z), 0.0);
          p += curl(s * 1.3 + vec3(0.0, age * 2.0, uTime * 0.15)) * age * uTurb;
          sz = 1.0 - age * 0.6;
          alpha = smoothstep(0.0, 0.05, age) * (1.0 - age) * (0.6 + 0.4 * sin(uTime * 20.0 + aSeed.x * 50.0));
        } else if (uMode == 2) { // FIREFLIES: vagueiam e piscam
          vec3 b = (aSeed.xyz - 0.5) * vec3(uRadius * 2.0, uHeight, uRadius * 2.0) + vec3(0.0, uHeight * 0.5, 0.0);
          p = b + vec3(snoise(b + uTime * 0.12), snoise(b.yzx + uTime * 0.1 + 3.0), snoise(b.zxy + uTime * 0.11 + 7.0)) * 0.9;
          alpha = pow(max(0.0, sin(uTime * (1.2 + aSeed.w) + aSeed.x * 40.0)), 3.0);
        } else if (uMode == 3) { // SPORES: deriva lenta para cima
          vec3 b = (aSeed.xyz - 0.5) * vec3(uRadius * 2.0, 0.0, uRadius * 2.0);
          p = b + vec3(0.0, age * uHeight, 0.0) + curl(b + vec3(0.0, uTime * 0.1, 0.0)) * 0.4 * uTurb;
          alpha = sin(age * 3.14159);
        } else if (uMode == 4) { // SMOKE: sobe e se expande
          float a = aSeed.x * TAU; float r = sqrt(aSeed.y) * uRadius;
          p = vec3(cos(a) * r, 0.0, sin(a) * r) + vec3(0.0, age * uHeight, 0.0);
          p += curl(p * 0.5 + uTime * 0.1) * age * uTurb;
          sz = 0.6 + age * 2.2; alpha = smoothstep(0.0, 0.15, age) * (1.0 - age);
        } else if (uMode == 5) { // ORBIT: anéis em volta do personagem, ondulando
          float a = aSeed.x * TAU + uTime * uSpin * (0.6 + aSeed.y * 0.6);
          float r = uRadius * (0.75 + 0.5 * aSeed.z);
          p = vec3(cos(a) * r, (aSeed.w) * uHeight + sin(uTime * 1.3 + aSeed.x * 9.0) * 0.25, sin(a) * r);
          p += curl(p * 0.6 + uTime * 0.2) * 0.2 * uTurb;
          alpha = 0.85;
        } else if (uMode == 6) { // WISPS: fogos-fátuos flutuando
          vec3 b = (aSeed.xyz - 0.5) * vec3(uRadius * 2.0, 0.0, uRadius * 2.0);
          p = b + vec3(sin(uTime * 0.5 + aSeed.w * 9.0) * 0.6, 0.6 + aSeed.w * uHeight + sin(uTime * 0.8 + aSeed.x * 7.0) * 0.4, cos(uTime * 0.4 + aSeed.y * 9.0) * 0.6);
          alpha = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed.z * 20.0);
        } else if (uMode == 7) { // BURST: explosão única a partir de uStart
          float t = clamp((uTime - uStart) / life, 0.0, 1.0);
          vec3 d = normalize(vec3(aSeed.x - 0.5, aSeed.y * 0.9 + 0.1, aSeed.z - 0.5) + uDir * 0.5);
          p = d * uRadius * (1.0 - pow(1.0 - t, 3.0)) * (0.4 + aSeed.w) + vec3(0.0, -t * t * uHeight, 0.0);
          alpha = (uTime < uStart) ? 0.0 : (1.0 - t); sz = 1.0 - t * 0.5;
        } else { // PIPE: fumaça luminosa do cachimbo, subindo em curva
          p = vec3(sin(age * 6.0 + aSeed.x * 6.0) * 0.06 * age, age * uHeight, cos(age * 5.0 + aSeed.y * 6.0) * 0.06 * age);
          p += curl(p * 3.0 + uTime * 0.3) * 0.05 * age;
          sz = 0.5 + age * 2.0; alpha = (1.0 - age) * smoothstep(0.0, 0.1, age);
        }
        p += uOrigin;
        vAlpha = alpha * uIntensity; vAge = age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * sz * (0.6 + 0.8 * aSeed.w) * uScale / max(0.1, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform int uLook; uniform vec3 uColor, uColor2;
      varying float vAlpha; varying float vRot; varying vec4 vSeed; varying float vAge;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = 0.0; vec3 col = mix(uColor, uColor2, vSeed.y);
        if (uLook == 0) { // brilho com núcleo quente
          float d = length(c) * 2.0;
          a = pow(max(0.0, 1.0 - d), 2.2);
          col = mix(col, vec3(1.0), pow(max(0.0, 1.0 - d * 2.0), 3.0) * 0.7);
        } else if (uLook == 1) { // folha girando
          float cr = cos(vRot), sr = sin(vRot);
          vec2 q = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) * 2.0;
          float w = 0.42 * sqrt(max(0.0, 1.0 - q.y * q.y));
          a = step(abs(q.x), w) * step(abs(q.y), 0.98);
          float rib = 1.0 - 0.35 * step(abs(q.x), 0.03);
          col *= rib * (0.75 + 0.35 * vSeed.z);
        } else if (uLook == 2) { // fumaça
          float d = length(c) * 2.0;
          a = smoothstep(1.0, 0.2, d) * (0.6 + 0.4 * sin(vSeed.x * 40.0 + c.x * 8.0) * sin(c.y * 7.0 + vSeed.y * 30.0));
          a *= 0.5;
        } else { // poeira suave
          float d = length(c) * 2.0;
          a = smoothstep(1.0, 0.0, d) * 0.45;
        }
        a *= vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 6 : 4;
  return {
    points,
    uniforms,
    update(time, pixelScale) { uniforms.uTime.value = time; if (pixelScale) uniforms.uScale.value = pixelScale; },
    burst(time) { uniforms.uStart.value = time; },
    setQuality(ratio) { g.setDrawRange(0, Math.max(1, Math.floor(count * ratio))); },
  };
}
