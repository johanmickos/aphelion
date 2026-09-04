/**
 * The **trail** — one solid luminous line, and the only place the carry has a
 * pixel.
 *
 * Spec [02 · §6](../../docs/spec/02-release.md): *"the trail is a solid luminous
 * line. Its brightness is the carry (spec 08). There are no sampled
 * breadcrumbs."* Spec [08 · §8](../../docs/spec/08-economy.md) puts the carry
 * here and nowhere else — *"the trail. Brightness. Never a number."*
 *
 * The geometry is presentation state's ([`trail.ts`](../state/trail.ts)); what
 * is here is paint and the one curve that turns points into a brightness.
 *
 * ## Why the two halves meet in the renderer
 *
 * The line is the **picture**'s and the carry is the **ledger**'s, and the ledger
 * is composed beside the picture rather than inside it so that ZEN can be a
 * configuration ([`economy.ts`](../state/economy.ts)). So this is the one place
 * they are both in scope, and a run with no ledger draws the same line at its
 * floor — which is what makes *"delete the ledger and the game is still the
 * game"* true of the world and not only of the words.
 */
import { CORE, dim } from './palette.ts';
import { BOARD_PIXEL } from '../state/design.ts';
import type { TrailPoint } from '../state/types.ts';

/**
 * How wide the line is — **the hand's own weight**, 1.5 board px.
 *
 * Spec [14 · §3.1](../../docs/spec/14-retro-grade.md) has two floors: 1 design px
 * for structure and 1.5 for *"anything the player is expected to read as a
 * line"*. The trail is read as a line and it is the **player's**, so it takes the
 * weight `drawRing`'s hand already has — spec 00 §1 puts the craft, the trail and
 * the hand in one token for the same reason, and a fourth weight would be a
 * fourth thing to keep in step.
 */
export const TRAIL_WIDTH = 1.5 * BOARD_PIXEL;

/**
 * How lit the line is with nothing carried, 0 to 1.
 *
 * **Not zero**, and the reason is ZEN rather than taste: spec 08 §7 deletes the
 * ledger and keeps the game, so a trail whose floor was darkness would be a craft
 * with no wake in a mode that is *"motion and light"*. It is also what a run's
 * first swing looks like before a metre has been climbed, and a craft that grew a
 * line out of nothing would be announcing the economy rather than itself.
 *
 * At E1's own strength, which is the step spec 00 §3 gives everything that is lit
 * and not hot — the trail at rest is lit, and the carry is what heats it.
 */
export const TRAIL_FLOOR = 0.18;

/**
 * The carry at which the line is half way up, in points — **measured**, and it is
 * the median of live play rather than a round number.
 *
 * Over the 26 dispatches this build replays (19 `fixture v1`, 7 `scatter v2`;
 * 30 909 ticks), the carry on a tick that is carrying anything at all runs p25
 * **134**, p50 **214**, p75 382, p95 734, max 1 225.
 *
 * ## The curve is `carry / (carry + K)` and that is the requirement, not a taste
 *
 * ADR-0008 makes the carry unbounded by one swing — *"the carry display must stay
 * legible at values a single swing could never reach"* — and **36.8% of cashes in
 * the corpus carry more than one swing**, up to ten, so that is the common case
 * rather than the corner. A curve that saturated would show a fifth swing's debt
 * as no brighter than a first swing's wage, which is precisely the thing spec
 * 08 §5 says must not happen.
 *
 * This one never arrives: half way at the median, 0.77 at p95, **0.85 at the
 * biggest carry in the corpus**, and still climbing above it. It is the same
 * `m / (m + median)` the **tide** already reads three of its numbers from
 * ([`body.ts`](../state/body.ts)) — strictly monotone, bounded, and exactly a half
 * at the median — so the game has one shape for *"more, and never all the way"*
 * rather than two.
 */
export const CARRY_HALF = 214;

/** How lit the trail is for a given carry, 0 to 1. */
export function trailLit(carry: number): number {
  if (carry <= 0) return TRAIL_FLOOR;
  return TRAIL_FLOOR + (1 - TRAIL_FLOOR) * (carry / (carry + CARRY_HALF));
}

/**
 * Draw the wake, in world space, ending at the craft.
 *
 * The caller is expected to have translated into the world already — the same
 * state [`draw`](./index.ts) is in when it draws the compass and the deadline.
 *
 * **The head is the craft**, not the newest sample: the craft's position is
 * interpolated between ticks and the samples are not, so a line that stopped at
 * the last sample would leave a stuttering gap at exactly the place the eye is.
 */
export function drawTrail(
  context: CanvasRenderingContext2D,
  trail: readonly TrailPoint[],
  craftX: number,
  craftY: number,
  carry: number,
): void {
  if (trail.length === 0) return;
  context.save();
  context.lineWidth = TRAIL_WIDTH;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = dim(CORE, trailLit(carry));
  context.beginPath();
  context.moveTo(trail[0]!.x, trail[0]!.y);
  for (let at = 1; at < trail.length; at++) context.lineTo(trail[at]!.x, trail[at]!.y);
  context.lineTo(craftX, craftY);
  context.stroke();
  context.restore();
}
