/**
 * Boost envelope.
 *
 * After banking at periapsis the boost ramps 0 -> peak over `boostArmTime`, then
 * decays to 0 over `boostDecayTime`. A reflexive tap-through earns almost nothing;
 * you must hold a moment to arm it, then release near the peak. That ramp is what
 * turned the boost from an always-loaded footgun into a skill window.
 */
import type { SimConfig } from './config.ts';

/** Live boost value `boostT` seconds after the orbit froze. */
export function boostEnvelope(cfg: SimConfig, boostFull: number, boostT: number): number {
  const arm = cfg.boostArmTime;
  const dec = cfg.boostDecayTime;
  let f: number;
  if (boostT < arm) {
    f = boostT / arm;
  } else {
    f = Math.max(0, 1 - (boostT - arm) / dec);
  }
  return boostFull * f;
}
