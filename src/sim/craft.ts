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
   * contradict itself. It is carried separately, spends itself linearly, and is
   * gone; what it moves is the craft's position, never its heading.
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
 * Linear from what the release paid down to nothing, and **exactly zero** once
 * the span runs out — the same reason a [`Decay`](../state/decay.ts) is a counter
 * rather than a value that gets small: a coast that never quite returns to
 * constant speed is a coast the compass is no longer solved on.
 */
export function burstOf(craft: Craft): number {
  if (craft.burstLeft <= 0 || craft.burstSpan <= 0) return 0;
  return craft.burst * (craft.burstLeft / craft.burstSpan);
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
