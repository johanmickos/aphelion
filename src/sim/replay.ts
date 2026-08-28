/**
 * A recipe in, a run out. The seam a verifying service would run through.
 *
 * ADR-0003 keeps v1 offline and cuts the seams for a service later, and records
 * that *"server-side verification of a submitted run is replay plus recompute,
 * which the determinism requirement already gives us for free."* This is the
 * replay half of that sentence, and it is pure and headless like everything else
 * in this directory: it reaches no clock, no disk and no network. The CLI that
 * reads a file and prints a verdict is `tools/replay.ts`, on the other side of
 * that boundary.
 *
 * **It reproduces the simulation and not the picture**, deliberately, and the
 * distinction matters because ADR-0006's promise is that *a frame is a pure
 * function of `(recipe, tick)`* — which is the reason any of this exists.
 * Presentation state is a recurrence since [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md):
 * `derive(previous, sim)`, seeded by `createPresentation` and evaluated exactly
 * once per tick. So the picture replays too, but only if it is derived *beside*
 * the simulation from tick zero — deriving on demand at tick 412 gives a
 * different answer than arriving there. `onTick` below is where a caller does
 * that, and `tools/trail.ts` is one that does; this file cannot, because
 * `src/sim/` may not reach `src/state/` and the layer wall is the thing making
 * the promise worth having.
 */
import { pressAt } from './recipe.ts';
import type { Recipe } from './recipe.ts';
import { fieldFor } from './recipe.ts';
import { createInitialState, stepSim } from './step.ts';
import type { SimState, Tick } from './types.ts';

export interface ReplayOptions {
  /**
   * How many ticks to run, if not the recipe's own length.
   *
   * Longer is the interesting direction: it asks what the recipe does past the
   * end of what was recorded, with the button up.
   */
  readonly ticks?: Tick;
  /**
   * Called after every tick, with the state as it then is and the tick that was
   * just flown.
   *
   * The hook a caller derives presentation state through, once per tick and in
   * the same loop, which is ADR-0015's first rule.
   */
  readonly onTick?: (state: SimState, tick: Tick) => void;
}

/** The world at tick zero, as this recipe's field and seed describe it. */
export function openRun(recipe: Recipe): SimState {
  const { field, craft } = fieldFor(recipe.field);
  return createInitialState(field, craft, recipe.seed);
}

/**
 * Fly the recipe, and hand back the state it ends in.
 *
 * **It stops when the run ends, which is usually before the log does.** A run is
 * over exactly when it has an ending and [`stepSim`](./step.ts) does nothing
 * once one is set, so the remaining ticks are not skipped work — they are work
 * that has no effect, and stopping says so out loud instead of pretending to
 * keep flying. That is also what makes running to four times a recipe's length a
 * question worth asking rather than a longer wait: for a run that ended it is
 * the same state, and for one still flying at the end of its log it is three
 * more lengths of coasting that have to agree.
 */
export function replayRun(recipe: Recipe, options: ReplayOptions = {}): SimState {
  const state = openRun(recipe);
  const ticks = options.ticks ?? recipe.ticks;
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(state, { pressed: pressAt(recipe.log, tick) });
    options.onTick?.(state, tick);
    if (state.ending !== null) break;
  }
  return state;
}
