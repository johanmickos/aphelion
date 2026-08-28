/**
 * The boost: what a swing is worth in speed, and the window it is worth it in.
 *
 * `CONTEXT.md` — the **boost** is the lasting part of what a release pays, as
 * against the **punch**, which is the transient. Spec
 * [01 · §7](../../docs/spec/01-swing.md) fixes its shape:
 *
 * ```
 *  1.0 |        ┌───────────────┐
 *      |       ╱                 ╲
 *  0.0 |______╱                   ╲______
 *      0    0.45s      1.2s      2.6s   after the freeze
 *           arm       settle     zero
 * ```
 *
 * **The ramp is the footgun's safety catch.** A reflexive tap-through earns
 * almost nothing; you must hold a moment to arm it. That is what turned the
 * boost from an always-loaded weapon into a skill window, *"and it is not
 * negotiable."* **The plateau exists because completing a circularisation used
 * to guarantee missing the window it was meant to reward** — it ends where the
 * settle does, and that is not a coincidence.
 *
 * **How much is a question about depth, not about aim.** *"What the boost pays
 * for is how far the dive committed, and nothing about where the craft was
 * pointing"* — the prototype's own design document claimed the opposite and that
 * mechanic was never implemented, so the document and the program disagreed and
 * the program is the evidence. Aim is paid for separately, by the compass (M2).
 *
 * Nothing in this file is observable by looking at it. Spec 01 §7 states the
 * whole envelope as **exit speeds and nothing else**: release the same swing at
 * successive ticks and measure how much faster each release leaves than the
 * orbit it left from. A test that reads a boost variable is written wrong
 * ([ADR-0013](../../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
 */
import type { Orbit } from './orbit.ts';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  PAYING_DEPTH,
  PEAK_BOOST,
} from './units.ts';

/**
 * Where on the envelope a release at `ticks` after the freeze falls, from 0 to 1.
 *
 * Exactly zero at the freeze, exactly one across the plateau, exactly zero again
 * from 2.6s on, and monotone in between — all four of which spec 01 §7 states as
 * exact rather than as bands.
 */
export function envelopeAt(ticks: number): number {
  if (ticks <= 0) return 0;
  if (ticks < BOOST_ARM_TICKS) return ticks / BOOST_ARM_TICKS;
  if (ticks <= BOOST_PLATEAU_TICKS) return 1;
  if (ticks >= BOOST_ZERO_TICKS) return 0;
  return (BOOST_ZERO_TICKS - ticks) / (BOOST_ZERO_TICKS - BOOST_PLATEAU_TICKS);
}

/**
 * What a dive of this depth is worth at the top of its envelope.
 *
 * **A dive pays only if it halves the gap.** A depth of ½ means exactly
 * `periapsis < (grab radius + floor) / 2`: committing halfway to the floor is
 * the price of admission, and below it the swing pays nothing at all rather than
 * a little.
 */
function fullBoost(depth: number): number {
  return PEAK_BOOST * Math.max(0, (depth - PAYING_DEPTH) / PAYING_DEPTH);
}

/** What this swing would pay, in design units per second, if it let go now. */
export function boostOf(orbit: Orbit): number {
  return fullBoost(orbit.depth) * envelopeAt(orbit.ticksSinceFreeze);
}
