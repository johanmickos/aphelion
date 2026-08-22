/**
 * Charges: earned effects the ship carries until something spends them.
 *
 * Its own module because granting and spending are deliberately separate from
 * both. A source calls `grantCharge` and knows nothing about what the charge
 * does; the site that spends it knows nothing about where it came from. That is
 * what makes a second source — a pickup, a streak reward, a stage bonus — a
 * one-line change rather than a new mechanic.
 *
 * Not in `capture.ts` or `step.ts` because both need it and they already import
 * each other in one direction; a shared leaf keeps that from becoming a cycle.
 */
import type { ChargeKind, SimState } from './types.ts';

/** Give the ship a charge. The only way one is ever created. */
export function grantCharge(state: SimState, kind: ChargeKind, n = 1): void {
  state.charges[kind] += n;
}

/** Spend one if there is one. Returns whether there was. */
export function spendCharge(state: SimState, kind: ChargeKind): boolean {
  if (state.charges[kind] <= 0) return false;
  state.charges[kind]--;
  return true;
}
