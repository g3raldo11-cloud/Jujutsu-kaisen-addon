import { defineConfig } from 'vite';

// base relativo: o build (dist/) abre de qualquer pasta ou servidor estático.
export default defineConfig({
  base: './',
  server: { open: true },
  build: { chunkSizeWarningLimit: 1500 },
});
