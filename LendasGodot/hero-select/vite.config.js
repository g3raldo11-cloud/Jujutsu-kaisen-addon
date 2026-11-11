import { defineConfig } from 'vite';

// base relativo: o build (dist/) abre de qualquer pasta ou servidor estático.
export default defineConfig({
  base: './',
  // os .glb exportados do Blender ficam no projeto Godot; o Vite serve e copia de lá
  publicDir: '../assets/models',
  server: { open: true },
  build: { chunkSizeWarningLimit: 1500 },
});
