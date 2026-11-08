import * as THREE from 'three';

// Pegadas invertidas do Curupira: dedos apontando para trás, brilhando no chão e apagando.
let _tex;
function footprintTexture() {
  if (_tex) return _tex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 64, 128);
  const glow = (x, y, rx, ry) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  // calcanhar em cima (frente do movimento), dedos embaixo (para trás)
  glow(32, 30, 17, 22);
  glow(32, 72, 15, 26);
  [[16, 108], [26, 114], [36, 116], [46, 113], [54, 106]].forEach(([x, y], i) => glow(x, y, i === 2 ? 7 : 5.5, i === 2 ? 8 : 6.5));
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

export function footprint(color) {
  const m = new THREE.MeshBasicMaterial({ map: footprintTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.32), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}
