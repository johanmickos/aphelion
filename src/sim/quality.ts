/**
 * Quality: how good the release the player is about to make would be.
 *
 * **There is deliberately only one definition of it**
 * ([ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)),
 * and this file is the whole of it. *"A second definition of 'how good was that'
 * is precisely the kind of pair that agrees until it quietly does not."*
 *
 * It is what the **punch** is scaled by — the kick a release lands, gone within a
 * second or so, bought with speed rather than with stopped time. The hitstop it
 * replaced was flown and rejected: *"even a 30ms stop made it feel like the game
 * was buffering."* The punch's size and its decay are spec
 * [02](../../docs/spec/02-release.md)'s and are rebased in M2; what M1.3 owes
 * that work is this number.
 *
 * ## One number, two clothes
 *
 * **A swing that reached a frozen orbit is graded on when it let go** — its
 * position on the boost envelope, which spec
 * [01 · §7](../../docs/spec/01-swing.md) fixes. Nothing about depth enters:
 * ADR-0012 rules that *"a player tapping beside bodies gets the punch and keeps
 * none of it, while a player flying well gets the punch **and** the boost
 * underneath it"*, so the punch is available to a shallow swing and the boost is
 * not. Feel and economy are separate channels and this is the seam.
 *
 * **A release that never froze an orbit has no envelope, but the body is still
 * bending its heading**, so it is graded on how hard it is turning at the
 * instant the button comes up. *"Releasing at the top of the turn and releasing
 * at the top of the envelope are the same skill wearing different clothes."*
 *
 * The bend is read against the tightest bend the body could hold the craft in at
 * that distance — the turn rate of a circular orbit there — so it is a ratio and
 * not a rate, and it means the same thing at every radius and around every body.
 * **A tap pays nothing structurally rather than by a guard**: a press and
 * release with no arc between them is a path the body is not bending, the
 * angular momentum in the numerator is what a straight line at the body has none
 * of, and nothing has to check.
 *
 * The two halves do not meet continuously at the freeze, and that is not a seam
 * to be smoothed: the freeze is itself an authored discontinuity (spec 01 §5),
 * and the envelope starting at exactly zero is the ramp that spec 01 §7 calls
 * *"the footgun's safety catch"*.
 */
import { envelopeAt } from './boost.ts';
import { gravityAt } from './gravity.ts';
import { angularMomentum } from './kepler.ts';
import { magnitude } from './math.ts';
import type { SimState } from './types.ts';

/**
 * How good a release right now would be, from 0 to 1.
 *
 * Zero for a coasting craft: there is no swing to grade and nothing to pay for.
 */
export function qualityOf(state: SimState): number {
  if (state.heldBody === null) return 0;
  if (state.orbit) return envelopeAt(state.orbit.ticksSinceFreeze);

  const body = state.field.bodies[state.heldBody]!;
  const craft = state.craft;
  const speed = magnitude(craft.vx, craft.vy);
  if (speed === 0) return 0;

  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const radius = magnitude(dx, dy);
  if (radius === 0) return 0;

  // How fast the heading is turning, over how fast it would be turning on a
  // circle here. Written as one expression because the radius cancels: the
  // sideways part of the pull is `g·|L| / (r·v)`, the circular rate is `v/r`,
  // and the ratio of the two is what is left.
  const bend =
    (gravityAt(body.mass, radius) * Math.abs(angularMomentum(dx, dy, craft.vx, craft.vy))) /
    (speed * speed * speed);
  return Math.min(bend, 1);
}
