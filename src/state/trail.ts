/**
 * The **trail** — the craft's own line through the field, and the one place the
 * player can read what death would cost.
 *
 * Spec [02 · §6](../../docs/spec/02-release.md): *"the trail is a solid luminous
 * line. Its brightness is the carry (spec 08). There are no sampled
 * breadcrumbs."* Spec [08 · §2](../../docs/spec/08-economy.md) states what that
 * buys: *"the player can always see what death would cost, without reading a
 * number."*
 *
 * ## What is carried from the prototype, and what is not
 *
 * The prototype has the only trail this project has ever had, and
 * [ADR-0013](../../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)
 * says which half crosses. What crosses is **behaviour a test can observe**:
 *
 * - **It is sampled on the simulation tick and never in the draw.** That is the
 *   prototype's own recorded defect, in its own words: *"the prototype pushed
 *   from render(), so on a 120Hz display it collected twice as many points over
 *   the same world distance and the trail was half as long — the same ship at the
 *   same speed left a shorter wake on a better phone."* Here the rule is already
 *   the layer's: presentation state is derived **once per tick** (ADR-0015), so
 *   the failure cannot be reached from this side of the wall.
 * - **A minimum world spacing between samples**, so a craft hanging at an
 *   orbit's apex keeps a wake with a length instead of sixteen points in a
 *   puddle.
 * - **A bounded number of them**, so the trail is a wake and not a route. Spec
 *   [05 · §6](../../docs/spec/05-field.md) is explicit that motion is read from
 *   the world rather than from the path, and a line all the way back to the spawn
 *   would be the map spec 09 draws on a card, drawn in the world.
 *
 * What does **not** cross is the mechanism. The prototype draws a row of round
 * dots and colours them by **speed**; this draws one stroke and colours it by
 * **carry**. Both halves of that are rulings rather than taste: spec 02 §6
 * refuses breadcrumbs outright, and spec [00 · §3](../../docs/spec/00-tokens.md)
 * makes brightness the game's one ordinal channel — a trail that brightened with
 * speed would be a second meaning in the channel the carry is already spending,
 * and the velocity readout is the headline number that already says it.
 *
 * The prototype's head gap does not cross either, and its own comment is why: it
 * exists because *"the newest sample draws a dot up to 4.8px across that pokes
 * through the tail notch of a sprite only 6px deep."* A stroke has no dot to poke
 * through anything, and a wake that started a body-length behind the craft would
 * be a detached line. The head of this one **is** the craft.
 *
 * ## Where the brightness comes from, and why it is not here
 *
 * The carry is the **ledger**'s, and the ledger is composed beside the picture
 * rather than inside it ([`ledger.ts`](./ledger.ts)) — so what this file produces
 * is the geometry and nothing else. That split is what lets ZEN keep the trail
 * with the ledger deleted: a run with no currency draws the same line at its
 * floor.
 */
import { SCALE } from '../sim/units.ts';
import type { SimState } from '../sim/types.ts';

/**
 * The least a craft must travel before the trail takes another sample, in design
 * units — the prototype's **3** of its own, converted (ADR-0010's ×3).
 *
 * At the author's median coasting speed the craft covers 20 design units in a
 * tick, so at speed this samples every tick and the spacing never binds; at an
 * orbit's apex, where world speed is a tenth of the craft's, it is what stops the
 * wake collapsing into a dot.
 */
export const TRAIL_SPACING = 3 * SCALE;

/**
 * How many samples the wake holds — the prototype's **16**, carried unchanged
 * because it is a count rather than a length and counts do not need converting.
 *
 * What it buys is measured in the frame it is drawn in rather than in units: at
 * the author's median flight the wake spans **16 ticks — 267ms**, which is about
 * 320 design units, or 13% of the design space's height. The prototype's own
 * comes out at 17% of its shorter frame at its slower speeds, so the picture it
 * was tuned for survives the crossing.
 */
export const TRAIL_SAMPLES = 16;

/** One point of the line. Position and nothing else — see the header on speed. */
export interface TrailPoint {
  readonly x: number;
  readonly y: number;
}

/** A run opens with no wake behind it (ADR-0015's second rule). */
export const NO_TRAIL: readonly TrailPoint[] = [];

/**
 * The wake one tick on — oldest first, and **every sample is somewhere the craft
 * has been.**
 *
 * The **drawn** head is not a sample: the renderer strokes these points and then
 * continues to the craft's live position, which it interpolates between ticks.
 * That is what stops the last segment stuttering at 120Hz, and it is the same
 * shape [`deadline.ts`](./deadline.ts)'s `ahead` uses for the same reason. On a
 * tick that takes a sample the newest one and the craft coincide, and the segment
 * between them is a point — which is why this is the renderer's business and not
 * a rule here.
 *
 * ⚠ **It sheds a disagreement in sixteen samples and not in sixteen ticks**,
 * which is ADR-0015's third rule held with a stated weakness: a craft that is not
 * moving takes no new samples, so a wrong wake behind a stationary craft stays
 * wrong until it moves. That is accepted because a stationary craft's wake is
 * *supposed* to stand still — the alternative is a window that empties on a
 * clock, which would make a hovering craft's trail vanish and put a second
 * meaning back in the brightness channel.
 */
export function trailOf(previous: readonly TrailPoint[], sim: SimState): readonly TrailPoint[] {
  const last = previous[previous.length - 1];
  if (last !== undefined) {
    const dx = sim.craft.x - last.x;
    const dy = sim.craft.y - last.y;
    if (dx * dx + dy * dy < TRAIL_SPACING * TRAIL_SPACING) return previous;
  }
  const next = [...previous, { x: sim.craft.x, y: sim.craft.y }];
  return next.length > TRAIL_SAMPLES ? next.slice(next.length - TRAIL_SAMPLES) : next;
}
