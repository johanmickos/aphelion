/**
 * Boost envelope.
 *
 * After banking at periapsis the boost ramps 0 -> peak over `boostArmTime`, then
 * decays to 0 over `boostDecayTime`. A reflexive tap-through earns almost nothing;
 * you must hold a moment to arm it, then release near the peak. That ramp is what
 * turned the boost from an always-loaded footgun into a skill window.
 *
 * `boostHoldsThroughSettle` moves where the decay STARTS, not how the ramp works.
 * See the key's note in `config.ts` for why the window used to close inside the
 * manoeuvre it was rewarding.
 */
import type { SimConfig } from './config.ts';

/**
 * Live boost value `boostT` seconds after the orbit froze.
 *
 * `boostT` and `settleT` share an origin — `beginSettle` zeroes both — so
 * `settleDur` can be compared against `boostT` directly.
 */
export function boostEnvelope(cfg: SimConfig, boostFull: number, boostT: number): number {
  const arm = cfg.boostArmTime;
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
