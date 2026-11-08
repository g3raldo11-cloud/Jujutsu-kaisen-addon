import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

// Céu em degradê com brilho do sol/lua, estrelas e nuvens finas — um por cenário.
export function createSky({ top, horizon, bottom, glow, glowDir, stars = 0, clouds = 0.3 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) }, uBottom: { value: new THREE.Color(bottom) },
      uGlow: { value: new THREE.Color(glow) }, uGlowDir: { value: glowDir.clone().normalize() }, uStars: { value: stars },
      uClouds: { value: clouds }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform vec3 uTop, uHorizon, uBottom, uGlow, uGlowDir; uniform float uStars, uClouds, uTime;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.55)) : mix(uHorizon, uBottom, pow(-y, 0.4));
        float g = max(0.0, dot(d, uGlowDir));
        col += uGlow * (pow(g, 8.0) * 0.6 + pow(g, 220.0) * 2.5);
        if (uStars > 0.0 && y > 0.05) {
          vec3 q = floor(d * 380.0);
          float s = fract(sin(dot(q, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          col += vec3(step(0.9975, s)) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + s * 100.0)) * smoothstep(0.05, 0.3, y);
        }
        if (uClouds > 0.0 && y > 0.0) {
          float c = fbm(vec3(d.xz / (y + 0.2) * 1.4, uTime * 0.01));
          col = mix(col, col * 1.25 + uGlow * 0.1, smoothstep(0.15, 0.7, c) * uClouds * smoothstep(0.0, 0.25, y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.renderOrder = -10;
  return { mesh, update(t) { mat.uniforms.uTime.value = t; } };
}
