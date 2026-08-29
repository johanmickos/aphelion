/**
 * The grab: one press, one body, and two ways to be told no.
 *
 * `CONTEXT.md` — *being caught by a body. Begins when the player presses; the
 * swing is not paid for until it is released.* Spec
 * [01 · §3](../../docs/spec/01-swing.md) measures it as *"a fact rather than a
 * threshold"*: 270 of 278 real presses grabbed, 7 were refused for range and 1
 * for being too late, and no press was refused for any other reason.
 *
 * **The lead is not a cone.** The body taken is the one nearest to where the
 * craft will be two tenths of a second from now, so the question asked is
 * *"which body am I arriving at"* rather than *"which body am I beside"*. It is
 * continuous in both position and velocity and costs nothing at rest. A heading
 * test, a closing-speed rule or a cone would each need a threshold, and a
 * threshold is a cliff the player falls off as a body drifts across an arbitrary
 * line. **Keep the displacement; do not reintroduce the line.**
 *
 * **And the climb gets the tie**, on the same principle. A press prefers a body
 * above the craft to one below it, weighted by how far and saturating so there is
 * no line at the craft's own altitude to fall off (author, 2026-08-29;
 * [`CLIMB_BIAS`](./units.ts)). It breaks a tie and never refuses: a craft plainly
 * flying at a body below still takes it, because the lead is already down there.
 *
 * **A grab conserves the craft exactly** — position and velocity both — and the
 * only thing that touches either is [`clearance.ts`](./clearance.ts), which
 * arrives over the five ticks *after* the press rather than at it.
 */
import type { Body } from './body.ts';
import { clearanceTicksFor } from './clearance.ts';
import type { Craft } from './craft.ts';
import { beginDive } from './dive.ts';
import { distance, magnitude } from './math.ts';
import type { Field, SimState } from './types.ts';
import { CLIMB_BIAS, LEAD_SECONDS, MEDIAN_GRAB_RANGE, MEDIAN_MASS, TOO_LATE_GAP } from './units.ts';

/**
 * How far this body is on offer from.
 *
 * Spec [01 · §13.2](../../docs/spec/01-swing.md) rules that **grab range scales
 * with mass**: *"a weak body reaching less far is legible on its own terms, and
 * it is what keeps a small body grabbable at a distance where the grab is still
 * a bound grab rather than a braked one."* The ruling fixes that it scales; it
 * does not fix how, and the choice made here is **linear in mass**, for the
 * reason the ruling gives.
 *
 * A grab is bound when the craft's energy is negative, `v²/2 < μ/r`, so the
 * distance inside which a given approach speed is still bound is itself linear
 * in μ. Scaling the reach the same way makes *the fraction of a body's range
 * within which a grab is bound* identical for every body in the field — which is
 * exactly what the ruling asks the scaling to pay for. Any shallower law leaves
 * small bodies reachable mostly at distances where they can only brake.
 *
 * At `MASS_EXPONENT = 0` every body has the median mass and this is flat 560
 * prototype units for all of them, which is the prototype exactly. The exponent
 * is the author's at the M1 gate and this moves with it.
 */
export function grabRange(body: Body): number {
  return (MEDIAN_GRAB_RANGE * body.mass) / MEDIAN_MASS;
}

/**
 * Which body a press would take, or `null` if none is on offer.
 *
 * Range is measured from where the craft *is* — that is what "on offer" means —
 * and the choice among those on offer is made at the lead-displaced point. The
 * two are deliberately different questions: the first is reach, the second is
 * intent.
 */
export function bodyOnOffer(field: Field, craft: Craft): number | null {
  const leadX = craft.x + craft.vx * LEAD_SECONDS;
  const leadY = craft.y + craft.vy * LEAD_SECONDS;

  let chosen: number | null = null;
  let nearest = Infinity;
  for (let i = 0; i < field.bodies.length; i++) {
    const body = field.bodies[i]!;
    const reach = grabRange(body);
    if (distance(craft.x, craft.y, body.x, body.y) > reach) continue;

    // **The climb gets the tie.** How far above the craft a body sits, in its own
    // reach, saturated so there is no line to fall off — see
    // [`CLIMB_BIAS`](./units.ts). The lead already puts the answer where the
    // player is going; this only decides between two bodies the lead cannot.
    const rise = (craft.y - body.y) / reach;
    const favour = rise / (1 + Math.abs(rise));
    const lead = distance(leadX, leadY, body.x, body.y) * (1 - CLIMB_BIAS * favour);

    if (lead < nearest) {
      nearest = lead;
      chosen = i;
    }
  }
  return chosen;
}

/**
 * Whether the craft is already too far into `body` to be caught by it.
 *
 * Both halves have to hold: the craft is pointed *into* the disc, and it is
 * inside a gap of about 32.5 prototype units from the surface. Inside that there
 * is no longer room for the clearance to lift the path, so the grab declines
 * rather than promising a floor it cannot hold. Measured on 0.4% of real presses
 * — this is a refusal the game almost never uses, and it should stay that way.
 */
function tooLate(craft: Craft, body: Body): boolean {
  const gap = distance(craft.x, craft.y, body.x, body.y) - body.radius;
  if (gap >= TOO_LATE_GAP) return false;

  const speed = magnitude(craft.vx, craft.vy);
  if (speed === 0) return false;

  const dx = body.x - craft.x;
  const dy = body.y - craft.y;
  const along = (dx * craft.vx + dy * craft.vy) / speed;
  if (along <= 0) return false;

  // How near the centre the heading ray passes.
  const across = (dx * craft.vy - dy * craft.vx) / speed;
  return Math.abs(across) <= body.radius;
}

/**
 * Take a body, if one is on offer and it is not too late.
 *
 * Returns whether the press was answered. The craft is not moved and not
 * redirected: what a grab changes is which body the world is running around,
 * and spec 01 §3 measures position and velocity conserved across it exactly.
 */
export function attemptGrab(state: SimState): boolean {
  const chosen = bodyOnOffer(state.field, state.craft);
  if (chosen === null) return false;

  const body = state.field.bodies[chosen]!;
  if (tooLate(state.craft, body)) return false;

  state.heldBody = chosen;
  // How long the clearance takes is the turn's business, not a constant's: see
  // [`clearanceTicksFor`](./clearance.ts).
  state.dive = beginDive(state.craft, body, clearanceTicksFor(state.craft, body));
  return true;
}
