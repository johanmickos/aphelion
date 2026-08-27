import { defineConfig } from 'vite';
import { qrPlugin } from './tools/vite-plugin-qr.ts';
import { diagPlugin } from './tools/vite-plugin-diag.ts';
import { spikePlugin } from './tools/vite-plugin-spike.ts';

export default defineConfig(({ command }) => ({
  // The game lives in app/; src/ holds the game's modules, imported from here.
  root: 'app',
  // Both of the added plugins are `apply: 'serve'` and exist only in dev.
  // `diagPlugin` receives measurement reports from the phone and writes them
  // to diagnostics/; `spikePlugin` prints a QR for the M0.5 harness and is
  // deleted along with app/spike/ when the renderer ADR lands. Neither is a
  // backend: they are the dev server, on the author's own machine (ADR-0003).
  plugins: [qrPlugin(), diagPlugin(), spikePlugin()],
  // Relative, not '/': GitHub Pages serves a project site from a subpath
  // (/aphelion-2/), so absolute asset URLs 404 there. './' is correct at any
  // mount point, and Vite resolves it back to '/' for the dev server
  // (ADR-0010).
  base: './',
  // Stamped into the bundle so a page can say which build it is. Without it a
  // stale deploy and a fresh one look identical, and the only evidence a push
  // actually published is a green workflow — which is evidence about the
  // workflow, not about the site.
  define: {
    __BUILD_STAMP__: JSON.stringify(command === 'serve' ? 'dev' : new Date().toISOString()),
  },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  // Bind all interfaces so a phone on the same network can reach the dev
  // server. M0.4 puts a QR code in front of this.
  server: { host: true },
}));
