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
 * same mechanism seen from two ends, and it lives here rather than in
 * [`run.ts`](./run.ts) with the endings, because what it protects is the promise
 * the press made. The rest of the field bounces here too, at `R + 6` and never
 * lethally, because spec 01 §10 extends that promise to everything for as long
 * as a body is held: **the same geometry is lethal coasting and safe held**, and
 * the coasting half is [`contact.ts`](./contact.ts)'s `strikeField`.
 *
 * The dive also carries the two numbers the freeze reads out of it — how far out
 * the press happened, and the **peak** energy it reached.
 */
import type { Body } from './body.ts';
import type { Craft } from './craft.ts';
import { speedOf } from './craft.ts';
import { easeClearance } from './clearance.ts';
import { bounce, bounceOffOthers, inContact } from './contact.ts';
import { integrate } from './integrate.ts';
import { angularMomentum, specificEnergy } from './kepler.ts';
import { distance } from './math.ts';
import type { Field } from './types.ts';
import { FLOOR_GAP, SECONDS_PER_TICK, SUBSTEPS } from './units.ts';

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
  /**
   * How fast the craft was flying when the press landed, before the clearance
   * touched it.
   *
   * **What an unfinished swing gives back** — see
   * [`DIVE_PAYBACK`](./units.ts). A dive accelerates the craft by falling, and
   * before 2026-08-30 a release taken during it kept all of that: gravity stops
   * acting at a release (spec 01 §2), so nothing ever took the fall back. This is
   * the number the payback returns to, and it is taken **at the press** rather
   * than after the clearance so that the clearance's own bought speed — a safety
   * impulse that raises the periapsis, not a reward — cannot be banked either.
   */
  readonly entrySpeed: number;
  /**
   * Where the press was pointed: the **sine of the approach angle**, from 0 for
   * a craft aimed dead at the body's centre to 1 for one going exactly sideways
   * past it (`CONTEXT.md`: **aim**).
   *
   * `|r x v| / (|r| |v|)`. The numerator over `|v|` alone is the impact
   * parameter — the perpendicular distance from the body's centre to the line
   * the craft was flying — and dividing by `|r|` as well turns that distance
   * into the angle it subtends, which is the reading that survives being close.
   *
   * **Exact rather than an estimate, and gravity is why.** A coasting craft
   * feels no force from anything ([`gravity.ts`](./gravity.ts)), so the path a
   * press interrupts is a *straight line*, and this is that line's own angle. It
   * is not a proxy for where the craft was headed. It is where the craft was
   * headed.
   *
   * **Bounded by construction**, which is the point of the second division: the
   * impact parameter can never exceed the radius it was measured at, so this
   * never exceeds 1 — and a press made a hair above the floor is graded on the
   * same 0-to-1 scale as one made half a screen out. The undivided distance is
   * not: it is capped by the grab radius, so a very close press could not have
   * reached a fixed distance threshold however perfectly it was aimed. That is
   * not a hypothetical. It is what the author flew on 2026-08-30 — see
   * [`arrivedTight`](./tier.ts).
   *
   * Kept from the press for the same reason `grabRadius` is: by the time the
   * freeze wants it the craft is at the bottom of the dive, where the velocity
   * is perpendicular to the radius, this is 1, and it says nothing.
   */
  readonly aim: number;
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
  /**
   * How much of its speed the floor took from the craft **this tick**, as a
   * share of what it had at the start of it (`CONTEXT.md`: **knock**).
   *
   * Zero on every tick the floor was not reached, which is most of them. A
   * per-tick reading and not an accumulation, because what it feeds is a word
   * said **at the moment of the collision** rather than a verdict on the dive —
   * written fresh each tick and read on the same one.
   *
   * What it measures is the price of the guarantee. [`holdAboveFloor`](#) keeps
   * the tangential half of the velocity and removes the radial half, so a craft
   * that came in sideways loses almost nothing and one pointed at the body loses
   * nearly all of it. That is the collision the author saw — *"abruptly changing
   * angle/course"* — and the reading is a **share** rather than a speed because
   * the same slam at half the speed should say the same thing.
   */
  knock: number;
}

export function beginDive(craft: Craft, body: Body, clearanceTicks: number): Dive {
  const radius = distance(craft.x, craft.y, body.x, body.y);
  const speed = speedOf(craft);
  const sideways = Math.abs(
    angularMomentum(craft.x - body.x, craft.y - body.y, craft.vx, craft.vy),
  );
  const spread = radius * speed;
  return {
    grabRadius: radius,
    entrySpeed: speed,
    // A craft standing still, or somehow pressed at the body's own centre, was
    // pointed nowhere — and nowhere is dead centre, because what this is asked is
    // whether the approach was *sideways*, and a line that does not exist is not.
    aim: spread > 0 ? sideways / spread : 0,
    smallestRadius: radius,
    peakEnergy: specificEnergy(body.mass, radius, speedOf(craft)),
    clearanceTicks,
    knock: 0,
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
 *
 * It is [`bounce`](./contact.ts) at zero restitution and not a second copy of
 * it. Spec 01 §10's three contacts are one operation at three sets of constants,
 * and the prototype's own experience is that written out three times they drift.
 */
function holdAboveFloor(craft: Craft, body: Body): void {
  if (inContact(craft, body, FLOOR_GAP)) bounce(craft, body, FLOOR_GAP, 0);
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
export function flyDive(craft: Craft, field: Field, body: Body, dive: Dive): boolean {
  if (dive.clearanceTicks > 0) {
    easeClearance(craft, body, dive.clearanceTicks);
    dive.clearanceTicks -= 1;
  }

  // What the floor takes over the whole tick, against what the craft brought into
  // it. Summed across the substeps rather than compared end to end, because
  // gravity is *adding* speed between them and a net reading would hide the cut.
  const brought = speedOf(craft);
  let taken = 0;

  const dt = SECONDS_PER_TICK / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    integrate(craft, body, dt, 1);
    const before = speedOf(craft);
    holdAboveFloor(craft, body);
    taken += before - speedOf(craft);
  }
  dive.knock = brought > 0 ? taken / brought : 0;

  // The rest of the field, at spec 01 §10's `R + 6` and never lethally. Once per
  // tick rather than per substep, which is where the prototype puts it too: a
  // tick moves the craft a handful of units against a body of a hundred, so
  // there is nothing to tunnel through.
  bounceOffOthers(craft, field, body);

  const radius = distance(craft.x, craft.y, body.x, body.y);
  const energy = specificEnergy(body.mass, radius, speedOf(craft));
  if (energy > dive.peakEnergy) dive.peakEnergy = energy;

  if (radius < dive.smallestRadius) {
    dive.smallestRadius = radius;
    return false;
  }
  return dive.smallestRadius < dive.grabRadius;
}
