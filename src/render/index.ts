/**
 * The renderer: pixels, and the interpolation between ticks. Nothing else
 * (ADR-0006).
 *
 * This is the one layer permitted to touch the browser, which is why `pnpm
 * portable` scans `src/sim/` and `src/state/` and deliberately does not scan
 * here. How the pixels arrive is settled:
 * [ADR-0011](../../docs/adr/0011-canvas2d-carries-the-design.md) measured the
 * ladder on a phone and Canvas2D held the first rung, with bloom hand-rolled as
 * an offscreen blur chain composited with `lighter`. What follows still draws
 * text into an element and will be replaced wholesale — the decision is made,
 * the renderer is [M3](../../docs/plan/m3-the-field.md)'s to build.
 */
import type { PresentationState } from '../state/types.ts';

/** Replaced at build time by Vite's `define`; `dev` when the dev server serves it. */
declare const __BUILD_STAMP__: string;

export function draw(presentation: PresentationState, target: HTMLElement): void {
  target.textContent = `APHELION · SCAFFOLD · ${__BUILD_STAMP__} · tick ${presentation.tick}`;
}
