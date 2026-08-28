/**
 * The ordinal channel: four steps of brightness, and nothing else in the game
 * that means *more*.
 *
 * Spec [00 · §3](../../docs/spec/00-tokens.md) is four rows and two rules.
 * **Brightness is the only ordinal channel — nothing ever changes hue to mean
 * "better"** — and **only one E3 may be alive at a time**. Everything in this
 * file serves one of those two sentences.
 *
 * | | | Bloom | Used by |
 * |---|---|---|---|
 * | E0 | STRUCTURE | none | rungs, rings at rest, dust, spent bodies |
 * | E1 | LIT | 6px @ 35% | active compass windows, body rims, labels |
 * | E2 | HOT | 18px @ 60% + white core | craft baseline, a window under live aim, a held body |
 * | E3 | FLASH | 48px, additive, 400ms | release, grab, award, the checkered line |
 *
 * The radii are here and the percentages are not, and that split is
 * [ADR-0006](../../docs/adr/0006-three-layers-sim-presentation-renderer.md)'s
 * own line rather than an accident: a radius is a length in design units and is
 * asserted without a canvas, and an alpha is paint. Spec 00 §1 makes the alpha
 * rule explicitly the renderer's — *"the only way this renderer is allowed to
 * make one colour out of another"* — so the percentages live beside `dim()` in
 * [`palette.ts`](../render/palette.ts) and this file states the geometry.
 *
 * ## The boards say px and this space is not px
 *
 * Spec 00 §3's radii are the board's, and the board frames the game at phone
 * size (Direction 01's own artboard is 430 × 760). The design space is **a phone
 * at three device pixels to the point** — 1170 × 2532 against 390 × 844
 * (ADR-0010) — which is the same ×3 the author confirmed for spec 01's lengths
 * on 2026-08-27, arriving from the other direction. So a bloom the board calls
 * 6px is **18 design units**, and [`SCALE`](../sim/units.ts) is the one place
 * that factor is written.
 *
 * The reading is worth stating because the alternative is not close: taken as
 * raw design units, E2's 18 would be a glow smaller than the craft it is
 * supposed to be the halo of — the dart alone is 45 design units long.
 */
import { SCALE } from '../sim/units.ts';
import type { Energy } from './types.ts';
import { ticksIn } from './decay.ts';

/** E1 · LIT — spec 00 §3's 6px, converted. Body rims, labels, a window at rest. */
export const E1_BLOOM = 6 * SCALE;

/** E2 · HOT — spec 00 §3's 18px, converted. The craft's baseline, and a held body. */
export const E2_BLOOM = 18 * SCALE;

/** E3 · FLASH — spec 00 §3's 48px, converted. A release, a grab, an award. */
export const E3_BLOOM = 48 * SCALE;

/**
 * What one link of the chain adds to the craft's bloom — spec 00 §3's +4px,
 * converted.
 *
 * *"A hot run is visibly hotter, in radius, never in hue."* The chain itself is
 * spec [08](../../docs/spec/08-economy.md)'s and arrives in M4 with the economy;
 * what is built here is the term it multiplies, so that when the chain exists it
 * is a number to pass rather than a rule to invent.
 */
export const CHAIN_BLOOM = 4 * SCALE;

/**
 * How long an E3 lasts — spec 00 §3's 400ms.
 *
 * Twenty-four ticks, and the reason the number is here rather than at the place
 * that strikes one: an E3 is a **single global slot** (below), so its length is
 * a property of the channel and not of whatever happened to light it.
 */
export const E3_TICKS = ticksIn(400);

/**
 * The bloom radius of one step, in design units.
 *
 * Spec 00 §3's acceptance, exactly: *"bloom radius is a pure function of energy
 * step and chain length; no code path sets bloom from a hue."* There is no hue
 * in this file's signature to set it from, which is the strongest form that
 * criterion can take.
 *
 * **The chain lights nothing that was not already lit.** It is passed only for
 * the craft, whose baseline is E2, and E0 is STRUCTURE — a chain cannot make
 * structure glow, so it adds nothing there however long it runs.
 */
export function bloomOf(energy: Energy, chain = 0): number {
  if (energy === 0) return 0;
  const base = energy === 1 ? E1_BLOOM : energy === 2 ? E2_BLOOM : E3_BLOOM;
  return base + chain * CHAIN_BLOOM;
}
