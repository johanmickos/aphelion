/**
 * The craft: the thing the player flies, and the only moving object in the
 * simulation.
 *
 * It has a position and a velocity and nothing else. There is no throttle, no
 * mass, no orientation stored — the nose points along the exit tangent for the
 * whole orbit (spec [01](../../docs/spec/01-swing.md), *what is already fixed*,
 * item 4), so heading is read from velocity rather than kept beside it. Two
 * numbers that must agree are two numbers that will eventually disagree.
 *
 * Mutable, and flat rather than a pair of vectors: the integrator writes these
 * six times per tick, and a fresh object per substep is the allocation a long
 * replay pays for.
 */
import { magnitude } from './math.ts';
import { angleOf } from './trig.ts';

export interface Craft {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * What is left of the release's **burst**, as a fraction of the craft's own
   * speed — spec [01 · §8](../../docs/spec/01-swing.md)'s transient.
   *
   * **Beside the velocity and not inside it**, which is the whole reason this is
   * safe. §8 measures *exit speed* as the orbital speed plus the boost's
   * permanent share, and its tolerance holds the rewrite to within 5% of that —
   * so the transient cannot be folded into `vx`/`vy` without making the file
   * contradict itself. It is carried separately, spends itself on the square of
   * what is left of its span, and is gone; what it moves is the craft's position,
   * never its heading.
   */
  burst: number;
  /** How much of the burst's span is left, in seconds. */
  burstLeft: number;
  /** How long it was placed for, so it can fall linearly to nothing. */
  burstSpan: number;
}

export function createCraft(x: number, y: number, vx: number, vy: number): Craft {
  return { x, y, vx, vy, burst: 0, burstLeft: 0, burstSpan: 0 };
}

/**
 * How much faster than its own velocity the craft is actually travelling, from 0.
 *
 * **Exactly zero** once the span runs out — the same reason a
 * [`Decay`](../state/decay.ts) is a counter rather than a value that gets small:
 * a coast that never quite returns to constant speed is a coast the compass is no
 * longer solved on.
 *
 * ## Squared, not linear, since 2026-08-31 — the kick is a kick again
 *
 * The author, having flown the deeper stretch and found it was the wrong half:
 * *"I felt the kick upon release still isn't noticeable enough. When I release
 * well I feel like the kick lasts too long, so I go REALLY fast. Let's scale that
 * part back just a hair. More generally, though, I'd like for there to be more of
 * an initial **kick** to the boost, that then fades away into the current feel."*
 *
 * That is three requirements and they point at one curve: a **higher peak**, a
 * **shorter tail**, and **less total**. A line cannot do it — raising a line's
 * start raises everything under it — so the shape is the square, which is
 * `decay.ts`'s own grammar for exactly this (*"the fall is fastest at the start
 * and slows to nothing at the end"*) and was the one thing in the release the
 * grammar had not reached.
 *
 * Measured against the line it replaces, at full quality:
 *
 * | | Peak | Span | Distance it adds |
 * |---|---|---|---|
 * | The line | 0.450 | 1.95s | 0.439 |
 * | This | **0.800** | **1.63s** | **0.434**, −1.2% |
 *
 * So the hit is **78% harder** and the total is *lower* — the author asked for
 * both in the same breath and they are only compatible on a curve that falls
 * faster than it starts. The two cross at **0.65s**: above the old line for the
 * first two thirds of a second and below it after, which is *"an initial kick
 * that then fades away into the current feel"* as literally as a curve can put
 * it.
 *
 * The table is the **full-quality** release, which is the one the complaint was
 * about. A poorer one gains a few percent of distance rather than losing it — see
 * [`TRANSIENT_SHARE`](./units.ts) for all three rows — because its peak rises by
 * the same 78% from a much lower start.
 */
export function burstOf(craft: Craft): number {
  if (craft.burstLeft <= 0 || craft.burstSpan <= 0) return 0;
  const left = craft.burstLeft / craft.burstSpan;
  return craft.burst * left * left;
}

/** How fast the craft is going, in design units per second. */
export function speedOf(craft: Craft): number {
  return magnitude(craft.vx, craft.vy);
}

/**
 * Where the craft is pointing, in radians.
 *
 * Read from the velocity, never stored. `angleOf` is the simulation's own, for
 * the reason in [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md).
 */
export function headingOf(craft: Craft): number {
  return angleOf(craft.vx, craft.vy);
}
