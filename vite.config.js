import { defineConfig } from 'vite';

// Sketches use classic scripts so they also work with VS Code Live Server.
export default defineConfig({
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
