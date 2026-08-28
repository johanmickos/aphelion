/**
 * The dive: everything between the press and the craft's closest approach.
 *
 * `CONTEXT.md` — *"real gravity and nothing else: the dive is simulated, and no
 * part of it is authored."* Spec [01 · §5](../../docs/spec/01-swing.md) is
 * emphatic about why. Authoring the shape of a dive took the prototype sixteen
 * failed attempts and all sixteen failed the same way — rigid or snapped orbit
 * insertion. **Keep the dive simulated.**
 *
 * Two things are laid on top of the integration and neither of them shapes it.
 * The clearance impulse eases in over the first five ticks
 * ([`clearance.ts`](./clearance.ts)), and the **floor** is held.
 *
 * **The floor is the one guarantee a grab makes** (`CONTEXT.md`). Spec 01 §10
 * rules that contact while a body is held never kills — it bounces off the held
 * body at the floor with zero restitution — and §4 rules that where the
 * clearance's turn falls short *"the floor catches the remainder"*. Those are the
 * same mechanism seen from two ends, and it lives here rather than with the
 * deaths of M1.4, because what it protects is the promise the press made. Contact
 * with any body the craft is *not* holding is M1.4's: it is one predicate with
 * two outcomes, and the other outcome is a death.
 *
 * The dive also carries the two numbers the freeze reads out of it — how far out
 * the press happened, and the **peak** energy it reached.
 */
import type { Body } from './body.ts';
import { floorRadius } from './body.ts';
import type { Craft } from './craft.ts';
import { speedOf } from './craft.ts';
import { easeClearance } from './clearance.ts';
import { integrate } from './integrate.ts';
import { specificEnergy } from './kepler.ts';
import { distance, magnitude } from './math.ts';
import { SECONDS_PER_TICK, SUBSTEPS } from './units.ts';

export interface Dive {
  /**
   * How far from the body's centre the press happened.
   *
   * The denominator of **depth** (`CONTEXT.md`), which is what the boost is paid
   * on: *"how far a dive committed, as a fraction of the distance from the grab
   * to the floor."* Kept from the grab because by the time the freeze needs it
   * the craft is a long way from where it was pressed.
   */
  readonly grabRadius: number;
  /** The closest the craft has come so far — how the closest approach is found. */
  smallestRadius: number;
  /**
   * The greatest specific orbital energy the dive has reached.
   *
   * **The peak, not the value at the bottom, and that is load-bearing** (spec
   * 01 §6). A head-on dive that clips the floor loses radial speed to the
   * clamp, and a freeze reading what was left would flatten its oval into a
   * circle — turning the most committed approach in the game into the least
   * interesting orbit. Reading the peak means the freeze grades the energy the
   * dive *brought*, not what survived the floor taking its cut.
   */
  peakEnergy: number;
  /**
   * Ticks of the clearance ease still to come, counting down from five.
   *
   * The whole of what the grab hands the dive about lifting the path clear: what
   * is owed is asked again each tick ([`clearance.ts`](./clearance.ts)), so the
   * only thing that has to be remembered is how long there is left to pay it.
   */
  clearanceTicks: number;
}

export function beginDive(craft: Craft, body: Body, clearanceTicks: number): Dive {
  const radius = distance(craft.x, craft.y, body.x, body.y);
  return {
    grabRadius: radius,
    smallestRadius: radius,
    peakEnergy: specificEnergy(body.mass, radius, speedOf(craft)),
    clearanceTicks,
  };
}

/**
 * Hold the craft at or above the body's floor, with zero restitution.
 *
 * The radial half of the velocity is removed and the tangential half is kept, so
 * a craft that runs into the floor slides along it rather than rebounding off
 * it. *"A hard limit that is never crossed"*: this is the sentence, and
 * everything downstream — the frozen periapsis, the settled circle, the depth
 * the boost is paid on — is measured against a radius this function guarantees.
 */
function holdAboveFloor(craft: Craft, body: Body, floor: number): void {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const r = magnitude(dx, dy);
  if (r >= floor || r === 0) return;

  const outX = dx / r;
  const outY = dy / r;
  craft.x = body.x + outX * floor;
  craft.y = body.y + outY * floor;

  const inward = craft.vx * outX + craft.vy * outY;
  if (inward < 0) {
    craft.vx -= inward * outX;
    craft.vy -= inward * outY;
  }
}

/**
 * Fly one tick of the dive, and say whether it has reached the bottom.
 *
 * The integration is [`integrate.ts`](./integrate.ts)'s, one substep at a time
 * so the floor can be held between them — `integrate(craft, body, dt, 1)` with
 * `dt` the substep's own length is exactly the arithmetic
 * `integrate(craft, body, tick, n)` performs, so this costs nothing and changes
 * nothing where the floor is not reached.
 *
 * The bottom is *"the first radius minimum while the button is held"* (spec 01
 * §5). A craft grabbed while already moving outward has no minimum ahead of it,
 * so a minimum only counts once the craft has come inside where it was pressed:
 * a bound one comes back and freezes on the way through, and an unbound one
 * never freezes at all, which is the release ADR-0012 grades on how hard the
 * body is bending it instead.
 */
export function flyDive(craft: Craft, body: Body, dive: Dive): boolean {
  if (dive.clearanceTicks > 0) {
    easeClearance(craft, body, dive.clearanceTicks);
    dive.clearanceTicks -= 1;
  }

  const floor = floorRadius(body);
  const dt = SECONDS_PER_TICK / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    integrate(craft, body, dt, 1);
    holdAboveFloor(craft, body, floor);
  }

  const radius = distance(craft.x, craft.y, body.x, body.y);
  const energy = specificEnergy(body.mass, radius, speedOf(craft));
  if (energy > dive.peakEnergy) dive.peakEnergy = energy;

  if (radius < dive.smallestRadius) {
    dive.smallestRadius = radius;
    return false;
  }
  return dive.smallestRadius < dive.grabRadius;
}
