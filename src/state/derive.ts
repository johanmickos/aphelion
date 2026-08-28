/**
 * Simulation in, presentation state out. Once per tick, and once only.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 *
 * It is also where the simulation's numbers become the renderer's: heading and
 * speed instead of a velocity, a `held` flag instead of an index. The renderer
 * never asks the simulation a question — everything it draws is already an
 * answer, which is what makes a frame a pure function of `(recipe, tick)`.
 *
 * ## It is a recurrence, and that is deliberate
 *
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md):
 * almost everything the design puts in this layer decays — the release kick
 * homes over 180ms, an E3 over 400ms, the rungs' wake over 400ms — and a decay
 * is by definition a function of the current tick **and what was already on
 * screen**. So `derive` takes the previous tick's presentation and produces the
 * next one.
 *
 * **Three rules keep that honest, and each is a test rather than a convention.**
 * It is called exactly once per tick and never per frame, because ticks are the
 * only clock in the game and a decay advanced per frame would run at the
 * display's rate. A run opens with [`createPresentation`](#), which places
 * everything rather than easing toward it from wherever the last run ended.
 * And everything carried eases toward something the current tick determines, so
 * two presentations that disagree agree again within a bounded time — memory
 * that cannot be shed turns one bad tick into a permanently wrong picture.
 */
import { headingOf, speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import { followCamera, openCamera } from './camera.ts';
import type { CameraView, PresentationState } from './types.ts';

function present(sim: SimState, camera: CameraView): PresentationState {
  return {
    tick: sim.tick,
    camera,
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
    corridor: {
      centreline: sim.field.corridor.centreline,
      halfWidth: sim.field.corridor.halfWidth,
    },
  };
}

/**
 * The presentation at the first tick of a run.
 *
 * Everything that eases is placed here rather than eased into place, so a run
 * never opens by gliding in from wherever the last one left off.
 */
export function createPresentation(sim: SimState): PresentationState {
  return present(sim, openCamera(sim));
}

/** The presentation one tick on. Call once per tick, in the same loop as `stepSim`. */
export function derive(previous: PresentationState, sim: SimState): PresentationState {
  return present(sim, followCamera(previous.camera, sim));
}
