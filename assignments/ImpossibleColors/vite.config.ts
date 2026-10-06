import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false, license: { fileName: 'notices/bundled-dependencies.md' } },
  worker: { format: 'es' },
});
