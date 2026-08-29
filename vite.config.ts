import { defineConfig } from 'vite';
import { qrPlugin } from './tools/vite-plugin-qr.ts';
import { diagPlugin } from './tools/vite-plugin-diag.ts';
import { benchPlugin } from './tools/vite-plugin-bench.ts';

export default defineConfig(({ command }) => ({
  // The game lives in app/; src/ holds the game's modules, imported from here.
  root: 'app',
  // `diagPlugin` is `apply: 'serve'` and exists only in dev: it receives
  // measurement reports from a phone and writes them to diagnostics/. It is not
  // a backend — it is the dev server, on the author's own machine (ADR-0003).
  // It outlived the M0.5 spike that needed it (ADR-0011), which is why it is
  // still here and `vite-plugin-spike.ts` is not.
  // `benchPlugin` serves `pnpm bench`'s page at /bench, dev only. The bench is
  // still a separate build from a patched copy of `src/` — the constants stay
  // `const` in the game — and this only puts it at the same address, so the QR
  // that puts the game on a phone puts the knobs on the same phone.
  plugins: [qrPlugin(), diagPlugin(), benchPlugin()],
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
