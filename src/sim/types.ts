/**
 * The simulation's vocabulary.
 *
 * Nothing here may name a pixel, a second, or a browser. The simulation is pure
 * and headless and owns the only clock in the game — ticks (ADR-0006).
 */

/**
 * The game's unit of time. Not a millisecond and never convertible to one: wall
 * clock and simulated time diverge whenever the simulation applies a time scale,
 * so nothing in the game measures itself in seconds.
 */
export type Tick = number;

/**
 * What the player can do. One verb — press — because the game is one decision
 * held and let go of (`CONTEXT.md`: grab, release).
 *
 * M0.3 is the skeleton, so nothing reads this yet; it is here because the shape
 * of `stepSim` is the thing being scaffolded, and a step function that takes no
 * input is a different shape.
 */
export interface Input {
  readonly pressed: boolean;
}

export const NO_INPUT: Input = { pressed: false };

/**
 * The whole of the simulated world. One field today.
 *
 * M0.3 holds nothing but the clock. Bodies, the craft, gravity, grab and
 * release are M1's ([m1-the-swing.md](../../docs/plan/m1-the-swing.md)); the
 * point of this file today is that there is a place for them that cannot reach
 * the renderer.
 */
export interface SimState {
  tick: Tick;
}
