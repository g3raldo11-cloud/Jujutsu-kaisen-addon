import * as THREE from 'three';

// Distorção de calor/ar em espaço de tela: cada fonte (centro na tela, raio, força) desloca os
// pixels com ruído animado, como o ar quente sobre o fogo ou o núcleo de um redemoinho.
export const DistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uSources: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uAspect; uniform vec4 uSources[4];
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 uv = vUv; vec2 off = vec2(0.0);
      for (int i = 0; i < 4; i++) {
        vec4 s = uSources[i];
        if (s.w <= 0.0) continue;
        vec2 d = (vUv - s.xy) * vec2(uAspect, 1.0);
        float f = smoothstep(s.z, 0.0, length(d));
        vec2 q = vUv * vec2(uAspect, 1.0) * 28.0 + vec2(0.0, -uTime * 3.5);
        off += (vec2(n2(q), n2(q + 17.3)) - 0.5) * s.w * f;
        // remoinho: gira levemente os pixels em volta do centro
        off += vec2(-d.y, d.x) * s.w * f * 0.6 * sin(uTime * 2.0);
      }
      gl_FragColor = texture2D(tDiffuse, uv + off);
    }`,
};
