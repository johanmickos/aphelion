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
import { stretch } from '../../src/state/deformation.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { E3_TICKS } from '../../src/state/energy.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { openField } from '../sim/fixtures.ts';

function world(): ReturnType<typeof createInitialState> {
  const field = openField([
    createBody(0, 0, MEDIAN_RADIUS),
    createBody(700, 900, MEDIAN_RADIUS * 0.8),
  ]);
  return createInitialState(field, createCraft(-900, 600, 360, -120), 1);
}

describe('presentation state', () => {
  /**
   * The boundary criterion, restated for
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md).
   *
   * M1.2 wrote this as *"deriving the same simulation twice gives the same
   * answer"*, which was the strictest reading available and is stricter than
   * ADR-0006 asks for. What ADR-0006 promises is that a frame is a pure function
   * of `(recipe, tick)`, and a recurrence seeded at tick zero satisfies that —
   * so what has to hold now is that `derive` is a pure function of **its two
   * arguments**, with nothing of its own between calls. A cache, a wall clock or
   * a module-level accumulator would fail here exactly as before.
   *
   * The replay property that used to live in this test — that two runs which
   * agree present identically — is `test/state/camera.test.ts`'s, because it is
   * now a statement about a sequence rather than about a call.
   */
  it('is a pure function of its two arguments', () => {
    const state = world();
    state.heldBody = 0;
    let view = createPresentation(state);
    for (let i = 0; i < 120; i++) {
      stepSim(state, NO_INPUT);
      view = derive(view, state);
    }

    expect(derive(view, state)).toEqual(derive(view, state));

    // And the same pair reached by a different route presents identically: it is
    // the arguments that decide the answer, not the history behind them.
    const other = world();
    other.heldBody = 0;
    let otherView = createPresentation(other);
    for (let i = 0; i < 120; i++) {
      stepSim(other, NO_INPUT);
      otherView = derive(otherView, other);
    }
    expect(derive(otherView, other)).toEqual(derive(view, state));
  });

  /**
   * ADR-0015's **third** rule, for the memory M2.1 added. The camera's version
   * of this is in [`camera.test.ts`](./camera.test.ts); a flash and a stretch
   * shed a disagreement in a stronger way than an ease does — they *end* — so
   * the bound is a stated number of ticks rather than a tolerance.
   */
  it('sheds a flash and a stretch it should never have had', () => {
    const state = world();
    const honest = createPresentation(state);
    const haunted: PresentationState = {
      ...honest,
      craft: { ...honest.craft, deformation: stretch(1) },
      flash: { x: 9e4, y: -9e4, radius: 9e4, decay: { age: 0, span: E3_TICKS } },
    };

    let a = honest;
    let b = haunted;
    for (let i = 0; i < E3_TICKS; i++) {
      stepSim(state, NO_INPUT);
      a = derive(a, state);
      b = derive(b, state);
    }
    expect(b).toEqual(a);
    expect(b.flash).toBeNull();
    expect(b.craft.deformation.recovery).toBeNull();
  });

  /**
   * ADR-0015's **second** rule. A run opens placed, and nothing in it is
   * mid-decay: a picture that opened with a flash already fading would be
   * showing the player an event that never happened.
   */
  it('opens with nothing already decaying', () => {
    const opened = createPresentation(world());
    expect(opened.flash).toBeNull();
    expect(opened.craft.deformation).toEqual({ along: 1, across: 1, amount: 0, recovery: null });
  });

  it('reports the tick it was derived from', () => {
    const state = world();
    const opened = createPresentation(state);
    stepSim(state, NO_INPUT);
    expect(derive(opened, state).tick).toBe(state.tick);
  });

  /**
   * Heading and speed rather than a velocity: the renderer draws a nose angle
   * and a bloom. Deriving them here keeps the two-numbers-that-must-agree
   * problem inside the simulation, where velocity is the single source.
   */
  it('gives the renderer answers rather than a velocity to work from', () => {
    const state = world();
    const view = createPresentation(state);
    expect(view.craft.speed).toBe(speedOf(state.craft));
    expect(Object.keys(view.craft).sort()).toEqual([
      'bloom',
      'deformation',
      'energy',
      'heading',
      'speed',
      'x',
      'y',
    ]);
  });

  it('says which body is held, so the renderer never has to work it out', () => {
    const state = world();
    expect(createPresentation(state).bodies.map((b) => b.held)).toEqual([false, false]);
    state.heldBody = 1;
    expect(createPresentation(state).bodies.map((b) => b.held)).toEqual([false, true]);
  });

  /**
   * Spec [04 · §3](../../docs/spec/04-bodies.md) draws a body from its radius,
   * so the radius has to reach the renderer. What must *not* reach it is the
   * mass: it is physics, the player reads it as size, and a renderer holding it
   * is a renderer that could disagree with the simulation about how strong a
   * body is.
   *
   * ## `bow` is not that, and the distinction is the whole of this rule
   *
   * M3.2 added it, and it fired this test on the way in, which is what it is for.
   * Spec [05 · §3](../../docs/spec/05-field.md) says the bow's `G` *"scales with
   * the body's mass"*, so a field that carries how hard a body bends the rungs is
   * carrying something monotone in mass — and that looks like the thing barred
   * above.
   *
   * It is not, for the same reason `grip` is not, and `grip` is the harder case:
   * it is the body's live gravitational pull as a fraction of its own hardest,
   * which is more physics than a bow ratio and has been handed over since M2.
   * **What the rule bars is a renderer that could compute a second opinion**, and
   * neither can: both are derived from the simulation's own body in the one layer
   * whose job is that translation, so a disagreement has nowhere to come from.
   * `bow` is a **ratio to the median body** and the renderer is not told what the
   * median is, so `μ` cannot be recovered from it.
   *
   * A raw `mass` still fails here, which is the tooth this keeps.
   */
  it('hands the renderer geometry and not physics', () => {
    const view = createPresentation(world());
    expect(Object.keys(view.bodies[0]!).sort()).toEqual([
      'bloom',
      'bow',
      'closing',
      'energy',
      'grip',
      'held',
      'hue',
      'offered',
      'radius',
      'spending',
      'state',
      'tide',
      'x',
      'y',
    ]);
  });
});
