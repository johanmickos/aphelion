/**
 * Boost envelope.
 *
 * After banking at periapsis the boost ramps 0 -> peak, holds, then decays to 0
 * over `boostDecayTime`. A reflexive tap-through earns almost nothing; you must
 * hold a moment to arm it, then release near the peak. That ramp is what turned
 * the boost from an always-loaded footgun into a skill window.
 *
 * `boostHoldsThroughSettle` BRACKETS THE PLATEAU AND BOTH ENDS TRACK THE SETTLE.
 * The decay starts when the orbit goes round, so completing a circularization
 * cannot cost the window; the peak arrives at `boostPeakAt` of the way through
 * it, so the stretch before that grades instead of paying full marks. Both keys'
 * notes in `config.ts` carry the measurements, and the order matters: the hold
 * was added first, to fix a window that closed inside the manoeuvre it was
 * rewarding, and it over-corrected into a 0.75s plain where 19 of 29 saturating
 * releases had let go early.
 *
 * `boostArmTime` is the FLOOR on the ramp and not the ramp itself, so a settle
 * dragged shorter than it cannot put the peak after the decay.
 */
import type { SimConfig } from './config.ts';

/**
 * Live boost value `boostT` seconds after the orbit froze.
 *
 * `boostT` and `settleT` share an origin — `beginSettle` zeroes both — so
 * `settleDur` can be compared against `boostT` directly.
 */
export function boostEnvelope(cfg: SimConfig, boostFull: number, boostT: number): number {
  // Where the peak is reached. `boostArmTime` is a floor rather than the value:
  // it is the shortest press that can arm anything, and the plateau's start is
  // otherwise a fraction of the settle so that both ends of the flat top move
  // with the manoeuvre they bracket.
  const arm = cfg.boostHoldsThroughSettle
    ? Math.max(cfg.boostArmTime, cfg.boostPeakAt * cfg.settleDur)
    : cfg.boostArmTime;
  // Where the peak stops holding. Clamped at `arm` so a settle tuned shorter than
  // the ramp cannot make the peak arrive after the decay has started.
  const hold = cfg.boostHoldsThroughSettle ? Math.max(arm, cfg.settleDur) : arm;
  let f: number;
  if (boostT < arm) {
    f = boostT / arm;
  } else {
    f = Math.max(0, 1 - Math.max(0, boostT - hold) / cfg.boostDecayTime);
  }
  return boostFull * f;
}
