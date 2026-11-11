import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Modelos esculpidos no Blender (LendasGodot/blender) carregados por cima dos personagens procedurais:
// as malhas procedurais somem, os efeitos (fogo, vento, partículas) continuam. O Blender grava dados
// por vértice no mapa UV (u = brasa / ponta da mecha / borda da escama, v = pele queimada) e os
// materiais abaixo transformam isso em rachaduras incandescentes, fogo e escamas em brasa.

const loader = new GLTFLoader();
const uTime = { value: 0 };

function patch(material, body) {
  material.defines = { ...(material.defines || {}), USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + body);
  };
  material.needsUpdate = true;
}

const SKIN = `
  float bb = clamp(vUv.x, 0.0, 1.0);
  float cc = clamp(1.0 - vUv.y, 0.0, 1.0);   // o glTF inverte o eixo V
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.014, 0.013), cc);
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.035) * pow(bb, 1.3) * 6.0 * (0.85 + 0.15 * sin(uTime * 3.0 + bb * 10.0));`;
const FLAME = `
  float s = clamp(vUv.x, 0.0, 1.0);
  vec3 c0 = vec3(0.05, 0.004, 0.002), c1 = vec3(0.6, 0.04, 0.01), c2 = vec3(1.0, 0.32, 0.03), c3 = vec3(1.0, 0.85, 0.4);
  vec3 fc = s < 0.3 ? mix(c0, c1, s / 0.3) : (s < 0.62 ? mix(c1, c2, (s - 0.3) / 0.32) : mix(c2, c3, (s - 0.62) / 0.38));
  diffuseColor.rgb = fc * 0.3;
  totalEmissiveRadiance = fc * pow(s, 2.0) * 4.0 * (0.85 + 0.15 * sin(uTime * 9.0 + s * 14.0));`;
const SCALES = `
  float e = clamp(vUv.x, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vec3(0.02, 0.012, 0.006), pow(e, 1.6));
  totalEmissiveRadiance += vec3(1.0, 0.32, 0.04) * pow(e, 6.0) * 2.2 * (0.85 + 0.15 * sin(uTime * 4.0 + vUv.y * 40.0));`;

const PATCHES = { cur_pele: SKIN, saci_pele: null, cur_cabelo: FLAME, boi_escamas: SCALES };

// caminho da serpente no Hero Select (coordenadas do three.js: Y para cima, +Z para a câmera)
function coilPoint(s, t) {
  // s: 0 (pescoço) .. 1 (cauda)
  if (s < 0.18) {
    const k = s / 0.18;
    return new THREE.Vector3(0.05 * Math.sin(t * 0.9), 1.55 - 1.15 * k * k, 0.35 - 0.5 * k);
  }
  const k = (s - 0.18) / 0.82;
  const a = -Math.PI * 0.5 + k * Math.PI * 2.6;
  const r = 1.25 - 0.55 * k;
  const wave = 0.04 * Math.sin(t * 2.2 - k * 14.0);
  return new THREE.Vector3(Math.cos(a) * (r + wave), 0.3 - 0.18 * k, -0.15 + Math.sin(a) * (r + wave));
}

export function attachSculpted(character, url, { onLoad } = {}) {
  const root = character.root;
  const state = { gltf: null, bones: {}, rest: {}, chain: [], restWorld: [] };
  loader.load(url, (gltf) => {
    const scene = gltf.scene;
    // esconde as malhas procedurais do corpo (os efeitos usam outros materiais e continuam)
    root.traverse((o) => {
      if (o.isMesh && o.material && (o.material.isMeshStandardMaterial || o.material.isMeshPhysicalMaterial)) o.visible = false;
    });
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const m = o.material;
        if (m && PATCHES[m.name]) patch(m, PATCHES[m.name]);
        if (m && 'envMapIntensity' in m) m.envMapIntensity = m.name === 'boi_escamas' ? 0.25 : 0.45;
      }
      if (o.isBone) {
        state.bones[o.name] = o;
        state.rest[o.name] = o.quaternion.clone();
      }
    });
    root.add(scene);
    root.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert();
    for (let i = 0; i < 64; i++) {
      const b = state.bones[`coluna_${String(i).padStart(2, '0')}`];
      if (!b) break;
      state.chain.push(b);
      state.restWorld.push(rootInv.clone().multiply(b.matrixWorld));   // repouso no espaço do personagem
    }
    state.gltf = gltf;
    character.sculpted = true;
    onLoad?.(character);
  });

  const qa = new THREE.Quaternion();
  const e = new THREE.Euler();
  function wiggle(name, x, y, z) {
    const b = state.bones[name];
    if (!b) return;
    e.set(x, y, z);
    qa.setFromEuler(e);
    b.quaternion.copy(state.rest[name]).multiply(qa);
  }
  const m4 = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const look = new THREE.Matrix4();
  const lookRest = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const restPos = new THREE.Vector3();
  const restNext = new THREE.Vector3();

  function poseChain(t) {
    const n = state.chain.length;
    root.updateMatrixWorld(true);
    const zero = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const b = state.chain[i];
      const a = coilPoint(i / n, t);
      const c = coilPoint((i + 1) / n, t);
      const dir = c.sub(a).normalize();
      restPos.setFromMatrixPosition(state.restWorld[i]);
      if (i + 1 < n) restNext.setFromMatrixPosition(state.restWorld[i + 1]);
      else restNext.copy(restPos).multiplyScalar(2).sub(new THREE.Vector3().setFromMatrixPosition(state.restWorld[i - 1]));
      const rdir = restNext.sub(restPos).normalize();
      look.lookAt(zero, dir, up);
      lookRest.lookAt(zero, rdir, up);
      const R = look.clone().multiply(lookRest.clone().invert());
      state.restWorld[i].decompose(pos, q, sc);
      const desired = new THREE.Matrix4().multiplyMatrices(R, new THREE.Matrix4().makeRotationFromQuaternion(q)).setPosition(a);
      desired.premultiply(root.matrixWorld);
      b.parent.updateMatrixWorld(true);
      inv.copy(b.parent.matrixWorld).invert();
      m4.multiplyMatrices(inv, desired);
      m4.decompose(b.position, b.quaternion, b.scale);
      b.updateMatrixWorld(true);
    }
  }

  const baseUpdate = character.update.bind(character);
  character.update = (t, dt, ctx) => {
    baseUpdate(t, dt, ctx);
    uTime.value = t;
    if (!state.gltf) return;
    const br = Math.sin(t * 1.6);
    // respiração, olhar e balanço leves sobre a pose de repouso
    wiggle('peito', 0.025 * br, 0, 0);
    wiggle('coluna', 0.01 * br, 0.04 * Math.sin(t * 0.5), 0);
    wiggle('cabeca', 0.04 * Math.sin(t * 0.7), 0.18 * Math.sin(t * 0.45), 0.02 * Math.sin(t * 0.9));
    wiggle('cabelo', 0.06 * Math.sin(t * 7.0), 0.04 * Math.sin(t * 5.3), 0.05 * Math.sin(t * 6.1));
    wiggle('gorro', 0.1 * Math.sin(t * 2.4), 0.15 * Math.sin(t * 1.7), 0.08 * Math.sin(t * 3.1));
    for (const s of ['r', 'l']) {
      const k = s === 'r' ? 1 : -1;
      wiggle('braco_' + s, 0.04 * Math.sin(t * 1.1 + k), 0, 0.03 * br * k);
      wiggle('antebraco_' + s, 0.05 * Math.sin(t * 1.3 + k), 0, 0);
    }
    if (state.chain.length) {
      poseChain(t);
      wiggle('cabeca', 0.08 * Math.sin(t * 0.8), 0.25 * Math.sin(t * 0.5), 0);
      wiggle('mandibula', 0.12 + 0.12 * Math.max(0, Math.sin(t * 0.9)), 0, 0);
    }
  };
  return character;
}
