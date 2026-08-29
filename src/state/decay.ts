/**
 * The shape of everything in this layer that is placed and then goes away.
 *
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)
 * exists because the design is full of one idea wearing five costumes. Spec
 * [02 · §5](../../docs/spec/02-release.md) kicks the camera and homes it over
 * 180ms *with one overshoot*; spec [02 · §4](../../docs/spec/02-release.md)
 * stretches the craft and recovers it over 180ms with one overshoot; spec
 * [00 · §3](../../docs/spec/00-tokens.md) flashes an E3 and decays it over
 * 400ms; spec [05 · §3](../../docs/spec/05-field.md) parts the rungs and relaxes
 * them over ~400ms; spec [06 · §4](../../docs/spec/06-awards.md) pops a callout,
 * lingers, and decays it over 400ms. **They are the same two curves and one
 * counter**, and this file is them, written once.
 *
 * ## Why a counter and not a value
 *
 * A decaying value could be stored as itself and multiplied down each tick, and
 * that is the version that goes wrong: a multiplied value never reaches zero, so
 * something has to decide when it is close enough, and spec 00 §5's
 * *"nothing persists past 600ms"* becomes a threshold nobody can point at. A
 * counter ends. [`advance`](#) returns `null` on the tick the span runs out, so
 * a thing that is over is **absent** rather than very small, and the type says
 * so at every call site.
 *
 * It also makes the layer assertable in the words its acceptance is written in:
 * *"an agent with no canvas can say the flash at tick 260 is four ticks into its
 * twenty-four"* is a sentence about a [`Decay`](#), not about a float.
 *
 * ## Ticks, and the millisecond in the doorway
 *
 * The design states motion in milliseconds and ticks are the only clock in the
 * game (`CONTEXT.md`: tick). [`ticksIn`](#) is the one place the two meet, for
 * the same reason [`units.ts`](../sim/units.ts) is the one place a second is
 * named: naming a millisecond is not reading a clock, and `pnpm portable` proves
 * this directory cannot reach one.
 */
import { SECONDS_PER_TICK } from '../sim/units.ts';
import type { Tick } from '../sim/types.ts';

/**
 * How many ticks a duration the design states in **milliseconds** lasts.
 *
 * Not to be confused with the seconds conversion inside
 * [`units.ts`](../sim/units.ts): spec 01 measures the swing in seconds because
 * that is what its evidence was recorded in, and the design boards state motion
 * in milliseconds because that is what motion is authored in. Both round to a
 * whole number of ticks here, which is the point — a duration that is not a
 * whole number of ticks is a duration the game cannot land on.
 */
export function ticksIn(milliseconds: number): Tick {
  return Math.round(milliseconds / 1000 / SECONDS_PER_TICK);
}

/**
 * Something placed, and how far through going away it is.
 *
 * `age` counts from 0 on the tick it was placed; `span` is what it was placed
 * for. It carries its own span rather than looking one up, so a value already in
 * flight finishes at the length it started with — which is what makes a bench
 * slider on a span safe to move mid-run.
 */
export interface Decay {
  /** Ticks since it was placed. `0` on the tick it arrived. */
  readonly age: Tick;
  /** How many ticks it lasts. It is gone on the tick `age` would reach this. */
  readonly span: Tick;
}

/**
 * Something placed on this tick.
 *
 * *Placed*, and the word is ADR-0015's second rule: things in this game arrive
 * at full size and leave slowly. Spec 00 §5 states it as a law — **attack ≤ 2
 * frames, decay ≥ 10 × attack** — so nothing here has a way to fade in, and that
 * is deliberate rather than missing.
 */
export function place(span: Tick): Decay {
  return { age: 0, span };
}

/** The same thing one tick older, or `null` once it is over. */
export function advance(decay: Decay | null): Decay | null {
  if (decay === null) return null;
  const age = decay.age + 1;
  return age >= decay.span ? null : { age, span: decay.span };
}

/** How far through it is, from 0 on the tick it was placed toward 1. */
export function progress(decay: Decay): number {
  return decay.age / decay.span;
}

/**
 * What is left of a value that is on its way to nothing: **1 → 0**.
 *
 * Spec 00 §5 calls this shape *"420ms exponential"* and spec 00 §3 gives the E3
 * *"400ms decay"*, and the two words together cannot both be taken literally: an
 * exponential never reaches zero, and the persistence rule in the same table
 * requires an end. So what is kept is the half that is a behaviour — **the fall
 * is fastest at the start and slows to nothing at the end** — and the shape that
 * does it while ending is the square of what is left.
 *
 * The curve is the one thing here that is neither measured nor ruled: the
 * durations are the design's and the end is forced, but the fall between them is
 * an **opening position**, on the bench so it can stop being one.
 */
export function fade(decay: Decay): number {
  const left = 1 - progress(decay);
  return left * left;
}

/**
 * How far through the return the value passes rest and the overshoot starts.
 *
 * **Read off spec [02 · §4](../../docs/spec/02-release.md) rather than chosen.**
 * The one overshoot the design puts a number on is the craft's stretch, which
 * goes out to 1.5 along the velocity vector and comes back through 1.0 to
 * **0.95** before settling — a rebound of a tenth of the displacement. For the
 * curve below the rebound is `4(1 − c)³ / 27c` in closed form, and a tenth falls
 * at `c = 0.37` to three figures, with the extreme at `(2c + 1) / 3` — **58%**
 * of the way home. `test/state/decay.test.ts` asserts both, so the sentence
 * above fails rather than rots if this moves.
 *
 * Everything else that overshoots inherits it, because spec 00 §5's motion
 * tokens are one grammar and a second rebound shape would be a second grammar.
 */
export const OVERSHOOT_FROM = 0.37;

/**
 * Where along its return a displacement is: **1 → 0, passing rest once**.
 *
 * The overshoot is not decoration. A displacement that eases home has its whole
 * story in the first third and then creeps; one that passes rest and comes back
 * says *that is over* at a moment the eye can pick out, which is what spec 02 §5
 * asks the camera kick for and spec 02 §4 asks the craft's stretch for.
 *
 * The curve is `(1 − x)² · (1 − x / c)`, which is the simplest thing that does
 * all four jobs at once: it starts at 1, ends at 0, arrives at rest with no
 * remaining speed (the double root at `x = 1`), and crosses zero exactly once,
 * at `c`. It is arithmetic, so it costs no transcendental and
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md) has
 * nothing to say about it.
 */
export function home(decay: Decay): number {
  const x = progress(decay);
  const left = 1 - x;
  return left * left * (1 - x / OVERSHOOT_FROM);
}

/**
 * An exponential ease's per-tick coefficient, from a rate in 1/seconds.
 *
 * The third shape, and the one that has no end: a value chasing a target the
 * current tick decides. It is what makes ADR-0015's third rule true —
 * **convergent** — because two values that disagree close the gap by this
 * fraction every tick regardless of how they came to disagree, and clamping at 1
 * means a rate past 60 arrives rather than overshooting into an oscillation.
 *
 * [`camera.ts`](./camera.ts) was where it was written first and it is here now
 * for the reason the header gives: one shape, one place.
 */
export function easeStep(rate: number): number {
  return Math.min(1, rate * SECONDS_PER_TICK);
}
