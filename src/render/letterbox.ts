/**
 * The design space onto pixels: one transform, and the bars either side of it.
 *
 * ADR-0010 rules that *"everything is drawn in world space in design
 * coordinates, identical on every device"*, and spec
 * [00 · §7](../../docs/spec/00-tokens.md) that *"nothing lands on a letterbox
 * bar"*. Both of those are one decision: the design space is fitted whole, at a
 * uniform scale, and centred. **Not a CSS scale on DOM elements** — the
 * composition has to survive being a picture, not a layout.
 *
 * What is left over is the **bleed**, and it is world rather than black — see
 * [`bleed`](#bleed) below for what that does and does not change. The rule it
 * keeps is the one that matters: nothing the player has to read lives outside
 * the design space, so the composition is identical on every device even where
 * the amount of visible world is not.
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
import type { CorridorView } from '../state/types.ts';

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

/**
 * How far outside the design space, in design units, the buffer can still show —
 * **the bleed**.
 *
 * The fit above is bound by one axis and leaves a bar on the other, and this is
 * the size of that bar said in design units instead of pixels. Exactly one of
 * the two is ever non-zero, because a uniform scale cannot leave slack in both.
 *
 * ## Why the bars stopped being black
 *
 * They were, and it cost visibility for nothing. On the author's phone the fit
 * is bound by height — browser chrome takes a bite out of the viewport — so
 * there is a **46-point bar down each side**, which is **179 design units** of
 * world either side of the design space that the device could draw and was
 * being painted over. [M1.4](../../docs/plan/m1-the-swing.md) made that cost
 * real: the corridor is 1.9× the design width, the camera does not pan, and a
 * craft swung out on the wide part of an oval leaves the picture 538 units
 * before it reaches the line it dies at. Filling the bars recovers a third of
 * that.
 *
 * **The design space is still the whole of the contract.** Nothing composed
 * moves and nothing is resized: the scale, the offsets and therefore every
 * position in spec [00 · §7](../../docs/spec/00-tokens.md)'s composition are the
 * ones above, unchanged. What is in the bleed is world that a device may happen
 * to be able to show, and **nothing the player has to read may live there** —
 * that rule is the reason the design space exists and it is untouched.
 *
 * The cost is that two devices see different amounts of world, and it is
 * accepted rather than hidden: ADR-0010 makes the phone in portrait the target
 * and a desktop window a development surface, and `draw` bounds the bleed by the
 * corridor's own line so that no window, however wide, is shown more world than
 * there is.
 */
export function bleed(width: number, height: number): { readonly x: number; readonly y: number } {
  const { scale } = letterbox(width, height);
  return {
    x: (width / scale - DESIGN_WIDTH) / 2,
    y: (height / scale - DESIGN_HEIGHT) / 2,
  };
}

/** The rectangle a frame paints into, in design coordinates. */
export interface Seen {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * What this buffer can show, in design coordinates.
 *
 * The design space, plus whatever the fit left over
 * ([`bleed`](./letterbox.ts)) — **and never more world than there is.** A
 * desktop window bound by height has more slack than the corridor is wide, and
 * showing past the line would draw a place a run is already over in.
 *
 * The corridor arrives on presentation state rather than being read from the
 * simulation, which is the boundary this layer keeps: the renderer draws what it
 * is handed and asks nothing (`test/render/boundary.test.ts`). And it is here
 * rather than in `index.ts` for the reason the header gives — a projection that
 * only exists inside a canvas context is one no test can ask anything of.
 */
export function visible(
  width: number,
  height: number,
  corridor: CorridorView,
  cameraX: number,
): Seen {
  const slack = bleed(width, height);
  // The world's own edges, said in the coordinates this clip is applied in: the
  // design space is centred on the camera, so the corridor's line sits wherever
  // the camera happens to be looking. Written against `camera.x` rather than
  // against the centreline so that it survives a camera that pans (M3.1's).
  const toDesign = DESIGN_WIDTH / 2 - cameraX;
  const wall = corridor.halfWidth;
  return {
    left: Math.max(-slack.x, corridor.centreline - wall + toDesign),
    right: Math.min(DESIGN_WIDTH + slack.x, corridor.centreline + wall + toDesign),
    top: -slack.y,
    bottom: DESIGN_HEIGHT + slack.y,
  };
}
