/**
 * The frames between the ticks.
 *
 * ADR-0006 gives the renderer *"pixels and the interpolation between ticks"*,
 * and this is the second half. The simulation is 60Hz and fixed; a 120Hz phone
 * asks for two frames per tick and a 59.94Hz display asks for one that lands
 * between them. Drawing the last tick twice reads as a stutter, and **the thing
 * the M1 gate is judging is feel** — a swing seen through a stuttering picture
 * is a swing judged wrongly.
 *
 * It is a function from two presentation states to a third, so the renderer
 * downstream of it has one view to draw and never has to know a frame is not a
 * tick. Nothing is smoothed and nothing is predicted: `alpha` runs 0 to 1 across
 * the gap between two ticks that have both already happened, so no frame ever
 * shows a position the simulation did not reach.
 */
import type { PresentationState } from '../state/types.ts';

const TWO_PI = Math.PI * 2;

function between(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/**
 * The same, for an angle.
 *
 * Along the short way round, always. A heading that crosses from just under π to
 * just over −π has turned a hair; interpolated as plain numbers it spins the
 * craft the whole way back through zero, which happens once a revolution on
 * every orbit in the game.
 */
function betweenAngles(from: number, to: number, alpha: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * alpha;
}

/**
 * A view `alpha` of the way from one tick to the next.
 *
 * Bodies are taken from the later tick whole rather than interpolated: they do
 * not move, and interpolating a thing that cannot move would be a promise this
 * function should not make before spec [04](../../docs/spec/04-bodies.md)'s
 * moving bodies exist to test it. The tick number is the later one too — a frame
 * belongs to the tick it is drawn from, and half a tick is not a tick.
 */
export function interpolate(
  previous: PresentationState,
  current: PresentationState,
  alpha: number,
): PresentationState {
  return {
    tick: current.tick,
    camera: {
      x: between(previous.camera.x, current.camera.x, alpha),
      y: between(previous.camera.y, current.camera.y, alpha),
    },
    craft: {
      x: between(previous.craft.x, current.craft.x, alpha),
      y: between(previous.craft.y, current.craft.y, alpha),
      heading: betweenAngles(previous.craft.heading, current.craft.heading, alpha),
      speed: between(previous.craft.speed, current.craft.speed, alpha),
    },
    bodies: current.bodies,
  };
}
