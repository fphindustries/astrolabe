import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * `shared` and `rules` publish through `./dist` (their `exports` field), so
 * a clean checkout with no build yet would leave Vite dev with nothing to
 * resolve. These aliases point dev straight at each package's source
 * instead, so editing a rule or a shared type hot-reloads without a
 * `tsc --build` in between. `vite build` and `tsc --build` (the workspace's
 * own typecheck) are unaffected — they still go through the real package
 * exports and project references.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@astrolabe/rules': fileURLToPath(new URL('../rules/src/index.ts', import.meta.url)),
      '@astrolabe/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
