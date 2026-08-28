/**
 * The design space: the rectangle everything the player reads is drawn inside.
 *
 * **1170 × 2532 — a phone held in portrait** (ADR-0010, spec
 * [00 · §7](../../docs/spec/00-tokens.md)). It is exactly three times the
 * prototype's 390 × 844 framing in each direction, which is the conversion
 * [`units.ts`](../sim/units.ts) carries and the reason the swing's numbers
 * transfer.
 *
 * It lives with presentation state rather than with the renderer because the
 * camera is expressed in these coordinates and is asserted in these coordinates
 * — ADR-0006's promise is that an agent with no canvas can say where the camera
 * was on tick 412, and that sentence needs a rectangle to be true against. What
 * the renderer owns is the mapping from here to pixels, which is
 * [`letterbox.ts`](../render/letterbox.ts) and is a different question.
 */

/** The design space's width, in design units. */
export const DESIGN_WIDTH = 1170;

/** The design space's height, in design units. */
export const DESIGN_HEIGHT = 2532;

/**
 * Where the player's thumb starts — **2/3 of the way down**, and nothing
 * readable may live below it, ever (spec 00 §7).
 *
 * A constraint on composition rather than a thing that is drawn, and it is here
 * because it is the binding constraint on the camera: the craft is the most
 * readable thing on the screen, so where the camera puts it is a decision this
 * line has authority over. See [`derive.ts`](./derive.ts).
 */
export const THUMB_LINE = (DESIGN_HEIGHT * 2) / 3;
