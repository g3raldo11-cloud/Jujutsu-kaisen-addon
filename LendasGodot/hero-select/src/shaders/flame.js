import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

// Chamas "volumétricas" em cartões: cada labareda é um quad que gira só em Y para encarar a
// câmera (billboard cilíndrico), com forma e movimento por fBm animado e rampa de temperatura
// branco → amarelo → laranja → vermelho → fumaça. Pontas frias azuladas opcionais (Boitatá).
// Um único desenho para centenas de labaredas; os centros podem ser atualizados por quadro.

export function createFlameCards(count, { blueTips = 0, intensity = 1.2, speed = 1.6, tip = 0x4aa8ff } = {}) {
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pos = new Float32Array(count * 4 * 3);
  const uv = new Float32Array(count * 4 * 2);
  const center = new Float32Array(count * 4 * 3);
  const size = new Float32Array(count * 4 * 2);
  const seed = new Float32Array(count * 4);
  const idx = [];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      uv[v * 2] = corners[k][0]; uv[v * 2 + 1] = corners[k][1];
      seed[v] = i * 7.31 % 100;
      size[v * 2] = 0.4; size[v * 2 + 1] = 0.8;
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uSpeed: { value: speed },
      uBlue: { value: blueTips },
      uTip: { value: new THREE.Color(tip) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter; attribute vec2 aSize; attribute float aSeed;
      uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main(){
        vUv = uv; vSeed = aSeed;
        vec4 wc = modelMatrix * vec4(aCenter, 1.0);
        vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
        float sway = sin(uTime * 3.0 + aSeed) * 0.08 * uv.y * uv.y;
        vec3 wp = wc.xyz + right * ((uv.x - 0.5) * aSize.x + sway * aSize.x) + vec3(0.0, uv.y * aSize.y, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime, uIntensity, uSpeed, uBlue; uniform vec3 uTip;
      varying vec2 vUv; varying float vSeed;
      vec3 ramp(float t){
        vec3 c = mix(vec3(0.0), vec3(0.55, 0.05, 0.01), smoothstep(0.0, 0.25, t));
        c = mix(c, vec3(1.0, 0.32, 0.03), smoothstep(0.2, 0.45, t));
        c = mix(c, vec3(1.0, 0.72, 0.18), smoothstep(0.45, 0.7, t));
        c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.0, t));
        return c;
      }
      void main(){
        vec2 uv = vUv;
        float t = uTime * uSpeed;
        float n = fbm(vec3(uv.x * 2.6 + vSeed, uv.y * 2.2 - t, vSeed * 0.37));
        float n2 = snoise(vec3(uv.x * 7.0 - vSeed, uv.y * 5.0 - t * 1.8, t * 0.4));
        float x = (uv.x - 0.5) * 2.0 + n * 0.45 * uv.y + n2 * 0.08;
        float w = (1.0 - pow(uv.y, 0.75)) * (0.85 + 0.35 * n);
        float shape = 1.0 - smoothstep(w * 0.35, w, abs(x));
        float base = smoothstep(0.0, 0.12, uv.y);
        float top = 1.0 - smoothstep(0.55, 1.0, uv.y + n * 0.25);
        float temp = clamp(shape * base * top * (1.15 - uv.y * 0.6) * (0.8 + 0.4 * n2), 0.0, 1.0) * uIntensity;
        vec3 col = ramp(clamp(temp, 0.0, 1.0));
        float tipMask = smoothstep(0.35, 0.9, uv.y) * uBlue;
        col = mix(col, uTip * (0.6 + temp), tipMask * smoothstep(0.05, 0.4, temp));
        gl_FragColor = vec4(col * temp * 1.15, temp * 0.8);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    material: mat,
    count,
    /** Define centro (local), largura e altura da labareda i. */
    set(i, c, w, h) {
      const ca = g.getAttribute('aCenter'), sa = g.getAttribute('aSize');
      for (let k = 0; k < 4; k++) {
        ca.setXYZ(i * 4 + k, c.x, c.y, c.z);
        sa.setXY(i * 4 + k, w, h);
      }
    },
    commit() {
      g.getAttribute('aCenter').needsUpdate = true;
      g.getAttribute('aSize').needsUpdate = true;
    },
    update(time) { mat.uniforms.uTime.value = time; },
  };
}
