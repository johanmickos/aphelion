/**
 * Simulation in, presentation state out. Once per tick, no memory of its own.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 *
 * It is also where the simulation's numbers become the renderer's: heading and
 * speed instead of a velocity, a `held` flag instead of an index. The renderer
 * never asks the simulation a question — everything it draws is already an
 * answer, which is what makes a frame a pure function of `(recipe, tick)`.
 */
import { headingOf, speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import type { PresentationState } from './types.ts';

export function derive(sim: SimState): PresentationState {
  return {
    tick: sim.tick,
    craft: {
      x: sim.craft.x,
      y: sim.craft.y,
      heading: headingOf(sim.craft),
      speed: speedOf(sim.craft),
    },
    bodies: sim.field.bodies.map((body, index) => ({
      x: body.x,
      y: body.y,
      radius: body.radius,
      held: index === sim.heldBody,
    })),
  };
}
