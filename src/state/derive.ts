/**
 * Simulation in, presentation state out. Once per tick, no memory of its own.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 */
import type { SimState } from '../sim/types.ts';
import type { PresentationState } from './types.ts';

export function derive(sim: SimState): PresentationState {
  return { tick: sim.tick };
}
