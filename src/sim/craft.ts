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
}

export function createCraft(x: number, y: number, vx: number, vy: number): Craft {
  return { x, y, vx, vy };
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
