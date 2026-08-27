/**
 * The simulation's clock.
 *
 * `stepSim` is the only thing in the game that advances time, and it advances it
 * by exactly one tick per call. It is a pure function of what it is handed, so a
 * run is reproducible from its recipe alone (ADR-0004).
 */
import type { Input, SimState } from './types.ts';

export function createInitialState(): SimState {
  return { tick: 0 };
}

/**
 * Advance the world by one tick.
 *
 * Mutates `state` rather than returning a new one: this runs thousands of times
 * per replay, and the prototype's experience is that per-tick allocation is what
 * a long replay actually costs. Determinism does not require immutability — it
 * requires that the same inputs produce the same states, which mutation in a
 * pure function does not threaten.
 */
export function stepSim(state: SimState, _input: Input): void {
  state.tick += 1;
}
