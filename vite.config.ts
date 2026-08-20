import { defineConfig } from 'vite';

// The prototype at ./index.html is immutable reference material and must never be
// part of the build. The playable app lives in ./app/.
export default defineConfig({
  root: 'app',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  server: { host: true },
});
