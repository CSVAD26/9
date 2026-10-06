import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Sketches use classic scripts so they also work with VS Code Live Server.
export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  cacheDir: fileURLToPath(new URL('node_modules/.vite', import.meta.url)),
  // Classic p5 scripts need no prebundling. Avoid crawling archived HTML entries.
  optimizeDeps: { noDiscovery: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  plugins: [
    {
      name: 'reload-classic-sketches',
      handleHotUpdate({ file, server }) {
        if (file.endsWith('.js')) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  ],
});
