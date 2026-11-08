import * as THREE from 'three';

// Rastro em fita: guarda as últimas posições de um ponto e desenha uma faixa que encara a
// câmera e some na cauda (vento do Saci, ponta da lança do Curupira).
export class Trail {
  constructor({ length = 36, width = 0.12, color = 0xfff0d0, opacity = 0.8 } = {}) {
    this.n = length;
    this.width = width;
    this.points = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(length * 2 * 3);
    const uv = new Float32Array(length * 2 * 2), idx = [];
    for (let i = 0; i < length; i++) {
      uv.set([i / (length - 1), 0, i / (length - 1), 1], i * 4);
      if (i < length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.x) * sin(vUv.y * 3.14159) * uOpacity; gl_FragColor = vec4(uColor * 1.6, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geometry = g;
    this.active = true;
  }
  /** Chamar por quadro com a posição no mundo do ponto seguido. */
  update(worldPos, camera) {
    this.points.unshift(worldPos.clone());
    if (this.points.length > this.n) this.points.length = this.n;
    const camPos = camera.position;
    for (let i = 0; i < this.n; i++) {
      const p = this.points[Math.min(i, this.points.length - 1)];
      const q = this.points[Math.min(i + 1, this.points.length - 1)];
      const dir = p.clone().sub(q);
      if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
      const toCam = camPos.clone().sub(p);
      const side = dir.cross(toCam).normalize().multiplyScalar(this.width * (1 - i / this.n) * 0.5);
      this.pos.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.mat.uniforms.uOpacity.value = this.active ? 0.8 : Math.max(0, this.mat.uniforms.uOpacity.value - 0.05);
  }
}
