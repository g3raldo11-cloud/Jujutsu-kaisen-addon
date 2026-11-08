import * as THREE from 'three';

// Efeitos rápidos de habilidade: anel de choque, clarão, cone de luz, e um gerenciador que
// anima e descarta efeitos temporários.
export class FxPool {
  constructor(scene) { this.scene = scene; this.items = []; }
  add(obj, duration, update) {
    this.scene.add(obj);
    this.items.push({ obj, t: 0, duration, update });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.duration);
      it.update?.(k, it.obj, dt);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { o.geometry?.dispose(); if (o.material && !o.material.userData.keep) o.material.dispose?.(); });
        this.items.splice(i, 1);
      }
    }
  }
  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items = []; }
}

const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export function shockRing(pool, pos, radius, color, duration = 0.7, y = 0.05, thickness = 0.08) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, thickness, 8, 96), additive(color, 0.95));
  m.rotation.x = Math.PI / 2;
  m.position.copy(pos).setY(pos.y + y);
  pool.add(m, duration, (k, o) => {
    const e = 1 - Math.pow(1 - k, 3);
    o.scale.setScalar(0.1 + e * radius);
    o.material.opacity = 0.95 * (1 - k);
  });
}

export function glowBall(pool, pos, size, color, duration = 0.35) {
  const tex = glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.copy(pos);
  pool.add(s, duration, (k, o) => {
    o.scale.setScalar(size * (0.3 + 1.2 * Math.sqrt(k)));
    o.material.opacity = 1 - k;
  });
}

export function lightCone(pool, pos, dir, length, angleDeg, color, duration = 0.6) {
  const r = Math.tan(THREE.MathUtils.degToRad(angleDeg / 2)) * length;
  const g = new THREE.ConeGeometry(r, length, 48, 1, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, additive(color, 0.7));
  m.position.copy(pos);
  m.lookAt(pos.clone().add(dir));
  pool.add(m, duration, (k, o) => {
    o.scale.set(0.3 + k, 0.3 + k, 1);
    o.material.opacity = 0.7 * (1 - k);
  });
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
