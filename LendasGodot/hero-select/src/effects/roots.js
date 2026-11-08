import * as THREE from 'three';
import { tube, V } from '../core/geometry.js';

// Raízes que irrompem do chão (Fúria da Mata): troncos retorcidos com espinhos, crescendo em
// sequência com leve sobrecarga elástica.
export function createRoots(material, { count = 8, radius = 1.9 } = {}) {
  const group = new THREE.Group();
  const roots = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const base = V(Math.cos(a) * radius, -0.1, Math.sin(a) * radius);
    const outward = V(Math.cos(a), 0, Math.sin(a));
    const h = 1.2 + Math.random() * 0.9;
    const ctrl = [
      base,
      base.clone().addScaledVector(outward, 0.15).add(V(0, h * 0.35, 0)),
      base.clone().addScaledVector(outward, -0.1).add(V(Math.random() * 0.2 - 0.1, h * 0.7, 0)),
      base.clone().addScaledVector(outward, -0.35).add(V(0, h, 0)),
    ];
    const g = tube(ctrl, [0.16, 0.12, 0.07, 0.0], { sides: 12, subdiv: 6, noiseAmp: 0.12, noiseFreq: 9 });
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    const holder = new THREE.Group();
    holder.position.copy(base);
    mesh.position.copy(base).negate();
    holder.add(mesh);
    holder.scale.set(1, 0.001, 1);
    group.add(holder);
    roots.push({ holder, delay: i * 0.05 });
  }
  return {
    group,
    animate(k) {
      // k: 0..1 ao longo da duração total (cresce, segura, recolhe)
      for (const r of roots) {
        const t = THREE.MathUtils.clamp((k - r.delay) / 0.25, 0, 1);
        const grow = t < 1 ? 1 - Math.pow(1 - t, 3) * Math.cos(t * 9) : 1;
        const out = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
        r.holder.scale.set(1, Math.max(0.001, grow * out), 1);
      }
    },
  };
}
