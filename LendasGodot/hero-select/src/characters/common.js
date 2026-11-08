import * as THREE from 'three';

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function joint(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  parent.add(g);
  return g;
}

/** Clona um material e faz o tecido tremular ao vento (deslocamento cresce com uv.y). */
export function windCloth(base, uniforms, { amp = 0.06, freq = 6 } = {}) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = 'uniform float uTime; uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float k = uv.y * uv.y * uWind;
      transformed.x += sin(uTime * ${freq.toFixed(1)} + uv.y * 7.0 + position.y * 3.0) * ${amp.toFixed(3)} * k;
      transformed.z += cos(uTime * ${(freq * 0.8).toFixed(1)} + uv.y * 5.0) * ${(amp * 0.8).toFixed(3)} * k;
      transformed.y += sin(uTime * ${(freq * 1.3).toFixed(1)} + uv.y * 9.0) * ${(amp * 0.4).toFixed(3)} * k;`);
  };
  return m;
}

export const ease = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  pulse: (k) => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI),
};

/** Linha do tempo simples para animações de habilidades. */
export class Timeline {
  constructor() { this.tracks = []; }
  play(duration, fn, done) { this.tracks.push({ t: 0, duration, fn, done }); }
  update(dt) {
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.duration);
      tr.fn(k, dt);
      if (k >= 1) { this.tracks.splice(i, 1); tr.done?.(); }
    }
  }
  get busy() { return this.tracks.length > 0; }
}

export function worldPos(obj, local = new THREE.Vector3()) {
  return obj.localToWorld(local.clone());
}
