import type { SimState } from '../sim/step.ts';
export function derive(sim: SimState): { tick: number } {
  return { tick: sim.tick };
}
