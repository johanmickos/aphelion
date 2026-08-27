/**
 * The app shell.
 *
 * There is no game here yet: M0.2 is the scaffold, and the three layers this
 * file will eventually drive — `src/sim/`, `src/state/`, `src/render/` — are
 * M0.3's to create (ADR-0006).
 *
 * What it does do is prove the pipeline end to end: a TypeScript module that is
 * bundled, served under a relative base path, and stamped with its own build
 * time so that a deploy which did not actually take is visible on the page
 * rather than inferred from a green workflow.
 */

/** Replaced at build time by Vite's `define`; `dev` when the dev server serves it. */
declare const __BUILD_STAMP__: string;

const app = document.getElementById('app');
if (app) {
  app.textContent = `APHELION · SCAFFOLD · ${__BUILD_STAMP__}`;
}
