import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The web client is a static bundle. It has no runtime model call, no analytics
 * suite and no remote font, so the bundled episode is always playable offline.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@line-13/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@line-13/graph': fileURLToPath(
        new URL('../../packages/graph/src/index.ts', import.meta.url),
      ),
      '@line-13/haunting': fileURLToPath(
        new URL('../../packages/haunting/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
