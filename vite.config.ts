import { defineConfig } from 'vite';
import { qrPlugin } from './tools/vite-plugin-qr.ts';
import { diagPlugin } from './tools/vite-plugin-diag.ts';

// The prototype at ./index.html is immutable reference material and must never be
// part of the build. The playable app lives in ./app/.
export default defineConfig({
  root: 'app',
  plugins: [qrPlugin(), diagPlugin()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  // Bind all interfaces so a phone on the same network can reach the dev server.
  server: { host: true },
});
