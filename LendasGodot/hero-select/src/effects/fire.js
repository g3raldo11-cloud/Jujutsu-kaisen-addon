import * as THREE from 'three';
import { createFlameCards } from '../shaders/flame.js';
import { createParticles, MODES, LOOKS } from '../shaders/particles.js';

// Fogo completo: labaredas fBm + brasas subindo + fumaça escura + luz que tremula no chão.
export class FireCluster {
  constructor({ points, sizes, blueTips = 0, embers = 120, smoke = 30, light = 0xff7a2a, lightIntensity = 6, lightRange = 7, area = 0.6, height = 1.4, tip } = {}) {
    this.group = new THREE.Group();
    this.cards = createFlameCards(points.length, { blueTips, tip });
    points.forEach((p, i) => this.cards.set(i, p, sizes[i][0], sizes[i][1]));
    this.cards.commit();
    this.group.add(this.cards.mesh);
    this.embers = createParticles({ count: embers, mode: MODES.EMBERS, look: LOOKS.GLOW, size: 0.045, life: 1.8, radius: area, height: height * 1.6, color: 0xffc35a, color2: 0xff5a10, turbulence: 0.9 });
    this.smoke = createParticles({ count: smoke, mode: MODES.SMOKE, look: LOOKS.SMOKE, size: 0.9, life: 3.2, radius: area * 0.7, height: height * 2.4, color: 0x15100e, color2: 0x2a2220, additive: false, turbulence: 0.6 });
    this.smoke.points.position.y = height * 0.5;
    this.group.add(this.embers.points, this.smoke.points);
    this.light = new THREE.PointLight(light, lightIntensity, lightRange, 1.6);
    this.light.position.set(0, height * 0.5, 0);
    this.baseLight = lightIntensity;
    this.group.add(this.light);
    this.strength = 1;
  }
  setStrength(k) {
    this.strength = k;
    this.cards.material.uniforms.uIntensity.value = 1.0 * k;
    this.embers.uniforms.uIntensity.value = k;
  }
  update(t, pixelScale) {
    this.cards.update(t);
    this.embers.update(t, pixelScale);
    this.smoke.update(t, pixelScale);
    // tremulação da luz: soma de senos de frequências diferentes
    const f = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 7.3);
    this.light.intensity = this.baseLight * f * this.strength;
  }
  setQuality(r) { this.embers.setQuality(r); this.smoke.setQuality(r); }
}

/** Gera pontos e tamanhos de labaredas num disco ou ao longo de uma curva. */
export function flamePointsDisc(n, radius, y = 0, wMin = 0.35, wMax = 0.7, hMin = 0.6, hMax = 1.3, rnd = Math.random) {
  const pts = [], sizes = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y + rnd() * 0.1, Math.sin(a) * r));
    sizes.push([wMin + rnd() * (wMax - wMin), hMin + rnd() * (hMax - hMin)]);
  }
  return { points: pts, sizes };
}
