import type { SimState } from '../sim/step.ts';
import { draw } from '../render/index.ts';
export function derive(sim: SimState): { tick: number } {
  draw();
  return { tick: sim.tick };
}
