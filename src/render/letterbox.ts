/**
 * The design space onto pixels: one transform, and the bars either side of it.
 *
 * ADR-0010 rules that *"everything is drawn in world space in design
 * coordinates, identical on every device"*, and spec
 * [00 · §7](../../docs/spec/00-tokens.md) that *"nothing lands on a letterbox
 * bar"*. Both of those are one decision: the design space is fitted whole, at a
 * uniform scale, centred, and nothing is drawn outside it. **Not a CSS scale on
 * DOM elements** — the composition has to survive being a picture, not a layout.
 *
 * It is pure arithmetic on purpose. [M3.1](../../docs/plan/m3-the-field.md)'s
 * acceptance is *"identical composition across aspect ratios"*, and a projection
 * that only exists inside a canvas context is one no test can ask that of.
 *
 * A phone letterboxes too, and that is worth knowing before the gate: browser
 * chrome takes a bite out of the viewport's height, so the design space —
 * authored at the size of the whole screen — never quite fits it and the fit is
 * bound by height. What the author sees on the phone is therefore the design
 * space scaled down by whatever fraction the chrome took, with the bars at the
 * sides. It is the same composition; it is not the same size in the hand as a
 * build that sized itself to the viewport instead, and the M1 gate is flying
 * this one against a prototype that does the latter.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';

export interface Letterbox {
  /** Device pixels per design unit. Uniform: the aspect never changes. */
  readonly scale: number;
  /** Where the design space's top-left corner lands, in device pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Fit the design space into a buffer of `width` × `height` device pixels. */
export function letterbox(width: number, height: number): Letterbox {
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  return {
    scale,
    offsetX: (width - DESIGN_WIDTH * scale) / 2,
    offsetY: (height - DESIGN_HEIGHT * scale) / 2,
  };
}
