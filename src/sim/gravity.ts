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
