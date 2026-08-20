/**
 * Fuel economy.
 *
 * The whip and the slingshot are always free — you can grab, orbit and fling
 * between planets forever without spending. Fuel is spent only on circularizing
 * and on braking a flyby, and it regenerates slowly when not spending.
 *
 * Design rule, learned the hard way: never gate *entering* an orbit on fuel.
 */
import type { SimConfig } from './config.ts';

export function burn(fuel: number, ratePerSec: number, dt: number): number {
  return Math.max(0, fuel - ratePerSec * dt);
}

export function regen(cfg: SimConfig, fuel: number, dt: number): number {
  return Math.min(cfg.fuelMax, fuel + cfg.fuelRegen * dt);
}
