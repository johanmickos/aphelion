/**
 * Gravity, and the three things about it that a physics engine gets wrong by
 * default.
 *
 * All three are measured, and all three are in spec
 * [01 · §2](../../docs/spec/01-swing.md).
 *
 * **1 · Gravity is not ambient.** A coasting craft feels no force from anything,
 * anywhere. Measured on the prototype: 300 ticks of coasting leave the speed
 * bit-identical — not nearly constant, identical. The field is not an n-body
 * problem and never was. There is no accumulator in this file and there must
 * never be one: `stepSim` asks for a pull only while a body is held.
 *
 * **2 · A held craft feels only its own body.** Other bodies contribute a bounce
 * if touched (M1.4), never a pull. A swing is genuinely one grab, one body, one
 * orbit — the unit `CONTEXT.md` names.
 *
 * **3 · The straight lines between the swings are load-bearing.** Because
 * coasting is exactly straight, *"which orbit angle's tangent points at that
 * body"* has a closed-form answer, which is what makes the compass a solved
 * reading rather than a simulation (spec 01 §11). Making gravity ambient — the
 * obvious "improvement" — would delete the instrument the game is named for.
 */
import { angleOf } from './trig.ts';
import { SOFTENING } from './units.ts';

/**
 * The magnitude of the acceleration `body` applies at distance `r` from it.
 *
 * `a(r) = μ / (r² + ε²)`, measured. The softening term is not a numerical guard:
 * it is the measured departure from inverse-square — 9.4% weaker at the floor,
 * 3.1% at a third of grab range, 0.8% at two thirds — and removing it would be
 * a change to the feel of every dive, not a tidy-up.
 */
export function gravityAt(mass: number, r: number): number {
  return mass / (r * r + SOFTENING * SOFTENING);
}

/**
 * The factor that turns the vector *from the craft to the body* into the
 * acceleration the craft feels: `a = pullScale × (bodyPosition − craftPosition)`.
 *
 * The direction is already in that vector, so this is the whole force law with
 * no second copy of it — one law, one place. It is shaped this way rather than
 * as a vector-returning function because it runs six times per tick and a
 * returned pair is a per-tick allocation; the prototype's experience is that
 * per-tick allocation is what a long replay actually costs.
 */
export function pullScale(mass: number, dx: number, dy: number): number {
  const r = Math.sqrt(dx * dx + dy * dy);
  return gravityAt(mass, r) / r;
}

/**
 * The potential energy of the softened law, per unit mass: negative, and zero
 * at infinity.
 *
 * `∫ μ/(s² + ε²) ds` from `r` outward is `(μ/ε)·atan(ε/r)`, so this is the exact
 * potential of the force above rather than an approximation to it. `angleOf`
 * carries the arctangent, from [`trig.ts`](./trig.ts) and not from `Math`
 * ([ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)).
 *
 * The three functions below exist so that **anything predicting what the dive
 * will do predicts it in the law the dive actually obeys.** The unsoftened
 * relations in [`kepler.ts`](./kepler.ts) are 9.4% out at the floor, which is
 * enough to leave a clearance aiming a tenth of the floor gap high — measured,
 * a periapsis of 61.9 against a floor of 56 where the spec requires the floor
 * within 8%. What the *orbit* is authored in stays Kepler, because a Kepler
 * ellipse is what it is; the two laws meet at the freeze and the step between
 * them is under 3% of speed.
 */
export function potentialAt(mass: number, r: number): number {
  return (-mass / SOFTENING) * angleOf(r, SOFTENING);
}

/** The specific orbital energy of a craft here, under the law it is flying in. */
export function energyAt(mass: number, r: number, speed: number): number {
  return (speed * speed) / 2 + potentialAt(mass, r);
}

/** The speed at which a craft here is no longer bound, under the same law. */
export function escapeSpeedAt(mass: number, r: number): number {
  return Math.sqrt(-2 * potentialAt(mass, r));
}

/**
 * The angular momentum a craft of this energy needs for its closest approach to
 * land exactly on `radius`.
 *
 * At its own closest approach a craft has no radial speed, so everything it has
 * there is `√(2(E − Φ(r)))` and its momentum is that times the radius.
 * Inverting the relation this way is what lets a clearance find its target in
 * closed form rather than searching for it, and it is why *"the periapsis is
 * inside the floor"* and *"there is less momentum here than the floor needs"*
 * are the same sentence.
 *
 * `null` when the craft has too little energy to reach `radius` at all, in which
 * case its closest approach is already outside it.
 */
export function momentumToReach(mass: number, energy: number, radius: number): number | null {
  const squared = 2 * (energy - potentialAt(mass, radius));
  if (squared <= 0) return null;
  return radius * Math.sqrt(squared);
}
