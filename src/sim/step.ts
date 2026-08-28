/**
 * The simulation's clock, and the one verb read against it.
 *
 * `stepSim` is the only thing in the game that advances time, and it advances it
 * by exactly one tick per call. It is a pure function of what it is handed, so a
 * run is reproducible from its recipe alone (ADR-0004).
 *
 * It is also the whole of the swing's shape, in one readable sequence: a press
 * takes a body, a held craft dives until it bottoms out and then rides the orbit
 * that freeze handed it, a lifted button lets go, and a craft holding nothing
 * travels in a straight line. Each of those is one call to a module that hides
 * the decision behind it, so this file can be read for the order of events and
 * nothing else.
 */
import type { Craft } from './craft.ts';
import { flyDive } from './dive.ts';
import { attemptGrab } from './grab.ts';
import { coast } from './integrate.ts';
import { freeze, rideOrbit } from './orbit.ts';
import { release } from './release.ts';
import { seedRng } from './rng.ts';
import type { Field, Input, SimState } from './types.ts';
import { SECONDS_PER_TICK } from './units.ts';

/**
 * A world at tick zero.
 *
 * The field is handed in rather than generated: spec
 * [17 · §3](../../docs/spec/17-daily-field.md) rules that a day is generated
 * once, as data, and that nothing in the game generates geometry at play time.
 * The generator is M3's; a test's fixture field satisfies the same contract.
 */
export function createInitialState(field: Field, craft: Craft, seed: number): SimState {
  return {
    tick: 0,
    field,
    craft,
    heldBody: null,
    dive: null,
    orbit: null,
    pressed: false,
    rng: seedRng(seed),
  };
}

/**
 * Advance the world by one tick.
 *
 * Gravity is not ambient, and which branch runs below is the whole of spec
 * [01 · §2](../../docs/spec/01-swing.md)'s first surprise: a held craft feels
 * exactly one body, and a coasting craft feels nothing — not a weak force, not a
 * distant sum, none. There is no branch here that adds up the field, and adding
 * one would break the compass (spec 01 §11) as well as the measurement.
 *
 * Mutates `state` rather than returning a new one: this runs thousands of times
 * per replay, and the prototype's experience is that per-tick allocation is what
 * a long replay actually costs. Determinism does not require immutability — it
 * requires that the same inputs produce the same states, which mutation in a
 * pure function does not threaten.
 */
export function stepSim(state: SimState, input: Input): void {
  // The press is an edge and the release is a level: a button that goes down
  // while nothing is on offer has spent its press, and a button that comes up
  // always lets go of whatever is held.
  if (input.pressed && !state.pressed && state.heldBody === null) attemptGrab(state);
  if (!input.pressed && state.heldBody !== null) release(state);
  state.pressed = input.pressed;

  // Held or not is the first question, because it is the one that decides
  // whether there is a force at all. A held craft is then in exactly one of the
  // swing's two halves: diving, or riding the orbit the freeze handed it.
  const held = state.heldBody === null ? null : state.field.bodies[state.heldBody]!;
  if (held === null) {
    coast(state.craft, SECONDS_PER_TICK);
  } else if (state.dive) {
    if (flyDive(state.craft, held, state.dive)) {
      state.orbit = freeze(state.craft, held, state.dive);
      state.dive = null;
    }
  } else if (state.orbit) {
    rideOrbit(state.craft, held, state.orbit);
  }

  state.tick += 1;
}
