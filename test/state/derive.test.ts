/**
 * The middle layer (ADR-0006). Presentation state is derived from the
 * simulation, per tick, and is as pure as the simulation is — which is what
 * makes a frame a pure function of `(recipe, tick)` and lets an agent with no
 * canvas assert what the screen showed.
 *
 * `pnpm portable` proves the boundary exists by scanning imports.
 * [AGENTS.md](../../AGENTS.md) §6 asks for more than that: *"each spec's
 * acceptance includes at least one criterion that fails if a layer boundary is
 * crossed."* These are M1.2's.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft, speedOf } from '../../src/sim/craft.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';
import { derive } from '../../src/state/derive.ts';

function world(): ReturnType<typeof createInitialState> {
  const field = {
    bodies: [createBody(0, 0, MEDIAN_RADIUS), createBody(700, 900, MEDIAN_RADIUS * 0.8)],
  };
  return createInitialState(field, createCraft(-900, 600, 360, -120), 1);
}

describe('presentation state', () => {
  /**
   * The boundary criterion. If `derive` ever grows memory of its own — a
   * smoothed value, a cached camera, anything carried between ticks — deriving
   * the same simulation twice stops giving the same answer, and a frame stops
   * being a pure function of the recipe. That is the failure ADR-0006 warns
   * about, and it would not show up in an import scan.
   */
  it('is a pure function of the simulation, with no memory between calls', () => {
    const state = world();
    state.heldBody = 0;
    for (let i = 0; i < 120; i++) stepSim(state, NO_INPUT);

    const once = derive(state);
    const again = derive(state);
    expect(again).toEqual(once);

    // And two simulations that agree must present identically, whatever route
    // they took to get there.
    const other = world();
    other.heldBody = 0;
    for (let i = 0; i < 120; i++) stepSim(other, NO_INPUT);
    expect(derive(other)).toEqual(once);
  });

  it('reports the tick it was derived from', () => {
    const state = world();
    stepSim(state, NO_INPUT);
    expect(derive(state).tick).toBe(state.tick);
  });

  /**
   * Heading and speed rather than a velocity: the renderer draws a nose angle
   * and a bloom. Deriving them here keeps the two-numbers-that-must-agree
   * problem inside the simulation, where velocity is the single source.
   */
  it('gives the renderer answers rather than a velocity to work from', () => {
    const state = world();
    const view = derive(state);
    expect(view.craft.speed).toBe(speedOf(state.craft));
    expect(Object.keys(view.craft).sort()).toEqual(['heading', 'speed', 'x', 'y']);
  });

  it('says which body is held, so the renderer never has to work it out', () => {
    const state = world();
    expect(derive(state).bodies.map((b) => b.held)).toEqual([false, false]);
    state.heldBody = 1;
    expect(derive(state).bodies.map((b) => b.held)).toEqual([false, true]);
  });

  /**
   * Spec [04 · §3](../../docs/spec/04-bodies.md) draws a body from its radius,
   * so the radius has to reach the renderer. What must *not* reach it is the
   * mass: it is physics, the player reads it as size, and a renderer holding it
   * is a renderer that could disagree with the simulation about how strong a
   * body is.
   */
  it('hands the renderer geometry and not physics', () => {
    const view = derive(world());
    expect(Object.keys(view.bodies[0]!).sort()).toEqual(['held', 'radius', 'x', 'y']);
  });
});
