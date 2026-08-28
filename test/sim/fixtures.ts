/**
 * Fixtures for the simulation core's tests.
 *
 * Everything here builds a world and reads it back through the simulation's own
 * boundary — positions, speeds, radii, times. Nothing reaches inside a module to
 * check a variable, because ADR-0013 rules that a characteristic which can only
 * be checked that way is specified wrong, and a test welded to a name forbids
 * the refactor it should have survived.
 *
 * There is deliberately **no grab here.** The dive is set up by placing a craft,
 * marking a body held and starting a dive with no clearance owed — a fixture and
 * not a mechanism. What these fixtures exercise is the simulation core: gravity,
 * the integrator, coasting. The grab, the clearance, the freeze and the release
 * are [`swing.ts`](./swing.ts)'s, which drives them through the one verb the way
 * a player does.
 */
import { createBody } from '../../src/sim/body.ts';
import { createCraft, speedOf } from '../../src/sim/craft.ts';
import { beginDive } from '../../src/sim/dive.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS, SECONDS_PER_TICK } from '../../src/sim/units.ts';

/** The field's median body, at the origin, so radii read directly as distances. */
export const MEDIAN_BODY = createBody(0, 0, MEDIAN_RADIUS);

/**
 * A craft approaching `MEDIAN_BODY` from the left, already held.
 *
 * `offset` is the impact parameter — how far the undisturbed line would pass
 * from the body's centre. Spec [01 · §5a](../../docs/spec/01-swing.md) states
 * the envelope in exactly these three quantities, so the fixture takes them and
 * nothing else.
 */
export function approach(distanceOut: number, speed: number, offset: number): SimState {
  const state = createInitialState(
    { bodies: [MEDIAN_BODY] },
    createCraft(-distanceOut, offset, speed, 0),
    1,
  );
  holdWithoutGrabbing(state);
  return state;
}

/**
 * The button held down.
 *
 * A release is a *level* and not an edge — the button coming up always lets go
 * of whatever is held — so a test that puts a body in the craft's hands and then
 * steps with no input has released it before the first tick. Everything holding
 * a body steps with this.
 */
export const HELD = { pressed: true };

/**
 * Put a body in the craft's hands without pressing anything.
 *
 * The dive is started with **no clearance owed**, so what runs is gravity and
 * the integrator and nothing else — which is what the core's own tests are
 * about. A grab decides whether a path needs lifting; a fixture does not get to.
 *
 * The caller keeps [`HELD`](#) down from there, exactly as a player would.
 */
export function holdWithoutGrabbing(state: SimState, index = 0): void {
  state.heldBody = index;
  state.dive = beginDive(state.craft, state.field.bodies[index]!, 0);
}

export interface DiveTrace {
  /** The smallest distance from the body's centre the craft reached. */
  closestApproach: number;
  /** How fast it was going there. */
  speedThere: number;
  /** How long after the first tick it got there. */
  secondsToClosest: number;
  /** True if the craft turned inside the trace, so the minimum is a real one. */
  turned: boolean;
}

/**
 * Fly a held craft and report what its closest approach looked like.
 *
 * The four numbers returned are all things a test can measure from outside, and
 * they are the ones spec 01 §5a and §12 are written in.
 */
export function dive(state: SimState, ticks: number): DiveTrace {
  let closestApproach = Infinity;
  let speedThere = 0;
  let closestTick = 0;
  let turned = false;

  for (let tick = 1; tick <= ticks; tick++) {
    stepSim(state, HELD);
    const r = distance(0, 0, state.craft.x, state.craft.y);
    if (r < closestApproach) {
      closestApproach = r;
      speedThere = speedOf(state.craft);
      closestTick = tick;
    } else {
      turned = true;
    }
  }

  return {
    closestApproach,
    speedThere,
    secondsToClosest: closestTick * SECONDS_PER_TICK,
    turned,
  };
}
