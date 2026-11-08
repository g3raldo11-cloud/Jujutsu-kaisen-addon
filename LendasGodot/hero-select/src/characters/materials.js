import * as THREE from 'three';
import * as T from '../core/textures.js';

// Biblioteca de materiais PBR dos personagens (pele, couro, tecido, metal, madeira, escamas...).
// Cada material combina mapas procedurais de cor, normal e rugosidade.
let lib = null;

function phys(opts, set) {
  return new THREE.MeshPhysicalMaterial({ ...set, ...opts });
}

export function materials() {
  if (lib) return lib;
  const skinDark = T.skin('dark', [0.27, 0.15, 0.09]);
  const skinBronze = T.skin('bronze', [0.4, 0.23, 0.13]);
  lib = {
    skinDark: phys({ color: 0xffffff, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0x8a4a30), sheenRoughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.6, normalScale: new THREE.Vector2(0.35, 0.35) }, skinDark),
    skinBronze: phys({ color: 0xffffff, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0x9a5a35), sheenRoughness: 0.6, clearcoat: 0.06, normalScale: new THREE.Vector2(0.35, 0.35) }, skinBronze),
    leatherBlack: phys({ color: 0xffffff, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.45 }, T.leather('black', [0.06, 0.055, 0.05])),
    leatherBrown: phys({ color: 0xffffff, roughness: 0.65, clearcoat: 0.15 }, T.leather('brown', [0.26, 0.15, 0.08])),
    clothBlack: phys({ color: 0xffffff, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0x3a3a40), sheenRoughness: 0.5, side: THREE.DoubleSide }, T.cloth('black', [0.07, 0.07, 0.075])),
    clothRed: phys({ color: 0xffffff, roughness: 0.85, sheen: 0.7, sheenColor: new THREE.Color(0xff5040), sheenRoughness: 0.45, side: THREE.DoubleSide }, T.cloth('red', [0.62, 0.05, 0.04])),
    clothGreen: phys({ color: 0xffffff, roughness: 0.9, sheen: 0.5, sheenColor: new THREE.Color(0x4a8a50), side: THREE.DoubleSide }, T.cloth('green', [0.08, 0.2, 0.1], 36)),
    gold: phys({ color: 0xffffff, metalness: 1, roughness: 0.28, clearcoat: 0.3 }, T.metal('gold', [0.95, 0.68, 0.28])),
    bronze: phys({ color: 0xffffff, metalness: 1, roughness: 0.35 }, T.metal('bronze', [0.6, 0.38, 0.2])),
    wood: phys({ color: 0xffffff, roughness: 0.7, clearcoat: 0.1 }, T.wood('carved', [0.42, 0.26, 0.13])),
    bark: phys({ color: 0xffffff, roughness: 0.95 }, T.wood('bark', [0.3, 0.2, 0.12], true)),
    vine: phys({ color: 0x3f6a2a, roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color(0x7aa050) }, T.wood('vine', [0.6, 0.75, 0.45])),
    leaf: phys({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0x9adf70) }, T.leafSet('green', [0.12, 0.32, 0.1])),
    bone: phys({ color: 0xe8dcc0, roughness: 0.5, clearcoat: 0.2 }, T.metal('bone', [0.9, 0.85, 0.75])),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    iris: new THREE.MeshPhysicalMaterial({ color: 0x3a1c0c, roughness: 0.2, clearcoat: 1 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 }),
    lips: new THREE.MeshPhysicalMaterial({ color: 0x4a2418, roughness: 0.4, clearcoat: 0.3 }),
    teeth: new THREE.MeshPhysicalMaterial({ color: 0xf0ead8, roughness: 0.3, clearcoat: 0.5 }),
    hairDark: new THREE.MeshPhysicalMaterial({ color: 0x0c0907, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0x3a2a20) }),
    paint: new THREE.MeshPhysicalMaterial({ color: 0xa31d0e, roughness: 0.6 }),
  };
  const cap = T.capRunes();
  lib.capCloth = phys({ color: 0xffffff, roughness: 0.75, sheen: 0.8, sheenColor: new THREE.Color(0xff4a3a), emissive: 0xffffff, emissiveIntensity: 2.0, side: THREE.DoubleSide }, cap);
  return lib;
}

/** Material de escamas de brasa com pulsação de lava viajando pelo corpo (emissive animado). */
export function emberScalesMaterial(uniforms) {
  const set = T.emberScales();
  const m = new THREE.MeshPhysicalMaterial({ ...set, color: 0xffffff, roughness: 0.6, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.4,
    emissive: 0xffffff, emissiveIntensity: 2.6, normalScale: new THREE.Vector2(1.4, 1.4) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPulse = uniforms.uPulse;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // ondulação serpentina percorrendo o corpo
      transformed += objectNormal * sin(uv.y * 40.0 - uTime * 3.0) * 0.025;`);
    shader.fragmentShader = 'uniform float uTime; uniform float uPulse;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float wave = 0.55 + 0.45 * sin(uTime * 2.6 - vEmissiveMapUv.y * 1.2 + sin(vEmissiveMapUv.x * 3.0) * 0.6);
      totalEmissiveRadiance *= wave * uPulse;`);
  };
  return m;
}
