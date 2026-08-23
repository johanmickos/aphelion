/**
 * Reentry heat: how hard the ship is skimming, right now.
 *
 * ONE DEFINITION, TWO CONSUMERS. The scorer integrates it into points and the
 * renderer draws a flame at its intensity. They must agree exactly or the fire
 * and the payout describe different events — the same failure the accolade table
 * was built to end, where the band coloured by one rule and the popup by another.
 *
 * WHY IT IS A PRODUCT AND NOT A DEPTH
 *
 * "Really close to the edge" sounds like it should be altitude, and altitude
 * alone is worthless here. The simulation steers every dive down onto `minR` —
 * the clearance correction does it deliberately — so the floor is not somewhere
 * you earn your way to, it is where the game puts you. Measured over 1386
 * captures out of `diagnostics/`:
 *
 *   dive (`clear`)   17% bottom out at under 0.5px of clearance
 *   `settle`         54%
 *   `orbit`          68%
 *
 * So two thirds of parked orbits are already touching the floor, and a reward for
 * depth would mostly be a reward for sitting still.
 *
 * Speed is what separates them, and it separates them cleanly. A parked minimum
 * orbit is a slow circle — over the whole corpus its speed never exceeds 342 px/s
 * — while a dive whipping through periapsis reaches 430 to 570. Gate above the
 * parked ceiling and the two stop overlapping: of the captures that flare, ZERO
 * flare while parked.
 *
 * Which is also the physics the flame is drawing. Heating goes as density times
 * speed cubed; this is that idea with the exponents traded for a shape that can
 * be tuned, low AND fast rather than low OR fast.
 */
import type { ScoreConfig } from './config.ts';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Heat, 0..1, from clearance above the minimum orbit and planet-relative speed.
 *
 * Both spans are floored away from zero so a weight swept to 0 — which
 * `test/score.test.ts` does to every key — degrades to "nothing burns" instead of
 * producing a NaN that would propagate silently into the score.
 */
export function burnHeat(clearance: number, speed: number, scfg: ScoreConfig): number {
  const depth = clamp01(1 - clearance / Math.max(1e-6, scfg.burnSpan));
  const fast = clamp01(
    (speed - scfg.burnSpeed0) / Math.max(1e-6, scfg.burnSpeed1 - scfg.burnSpeed0),
  );
  return depth * fast;
}
