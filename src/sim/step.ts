/**
 * The simulation's clock.
 *
 * `stepSim` is the only thing in the game that advances time, and it advances it
 * by exactly one tick per call. It is a pure function of what it is handed, so a
 * run is reproducible from its recipe alone (ADR-0004).
 */
import type { Craft } from './craft.ts';
import { coast, integrate } from './integrate.ts';
import { seedRng } from './rng.ts';
import type { Field, Input, SimState } from './types.ts';
import { SECONDS_PER_TICK, SUBSTEPS } from './units.ts';

/**
 * A world at tick zero.
 *
 * The field is handed in rather than generated: spec
 * [17 · §3](../../docs/spec/17-daily-field.md) rules that a day is generated
 * once, as data, and that nothing in the game generates geometry at play time.
 * The generator is M3's; a test's fixture field satisfies the same contract.
 */
export function createInitialState(field: Field, craft: Craft, seed: number): SimState {
  return { tick: 0, field, craft, heldBody: null, rng: seedRng(seed) };
}

/**
 * Advance the world by one tick.
 *
 * Two paths, and which one runs is the whole of spec
 * [01 · §2](../../docs/spec/01-swing.md)'s first surprise: **gravity is not
 * ambient.** A held craft is integrated under exactly one body. A coasting craft
 * is moved in a straight line under no force at all — not a weak force, not a
 * distant sum, none. There is no branch here that adds up the field, and adding
 * one would break the compass (spec 01 §11) as well as the measurement.
 *
 * The substep count is chosen once, here, from [`units.ts`](./units.ts).
 * [`integrate`](./integrate.ts) takes it as a parameter so that the convergence
 * test spec 01 §12 asks for can vary it; nothing else ever should.
 *
 * Mutates `state` rather than returning a new one: this runs thousands of times
 * per replay, and the prototype's experience is that per-tick allocation is what
 * a long replay actually costs. Determinism does not require immutability — it
 * requires that the same inputs produce the same states, which mutation in a
 * pure function does not threaten.
 */
export function stepSim(state: SimState, _input: Input): void {
  const held = state.heldBody === null ? null : state.field.bodies[state.heldBody];
  if (held) {
    integrate(state.craft, held, SECONDS_PER_TICK, SUBSTEPS);
  } else {
    coast(state.craft, SECONDS_PER_TICK);
  }
  state.tick += 1;
}
