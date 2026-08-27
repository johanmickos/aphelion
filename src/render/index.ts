/**
 * The renderer: pixels, and the interpolation between ticks. Nothing else
 * (ADR-0006).
 *
 * This is the one layer permitted to touch the browser, which is why `pnpm
 * portable` scans `src/sim/` and `src/state/` and deliberately does not scan
 * here. Whether these pixels arrive via Canvas2D, a WebGL post pass, a
 * hand-rolled WebGL2 renderer or PixiJS is
 * [M0.5](../../docs/plan/m0-foundations.md#m05--the-renderer-spike)'s to decide
 * with a measurement, so what follows draws text into an element and will be
 * replaced wholesale.
 */
import type { PresentationState } from '../state/types.ts';

/** Replaced at build time by Vite's `define`; `dev` when the dev server serves it. */
declare const __BUILD_STAMP__: string;

export function draw(presentation: PresentationState, target: HTMLElement): void {
  target.textContent = `APHELION · SCAFFOLD · ${__BUILD_STAMP__} · tick ${presentation.tick}`;
}
