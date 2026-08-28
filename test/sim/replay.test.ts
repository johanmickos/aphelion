/**
 * [M1.5](../../docs/plan/m1-the-swing.md)'s acceptance: **a recorded run replays
 * to a bit-identical final state, four times its own length.**
 *
 * The sentence has two readings and both are checked here, because neither
 * costs anything and one of them is nearly vacuous on its own — four
 * independent replays, compared at *every* tick rather than only at the end, and
 * each carried to four times the run's recorded length. A divergence that
 * appears at tick 400 and is gone by 4000 is still a divergence, and the final
 * state would not see it (M1.2 made the same argument).
 *
 * The runs are the headless pilot's, which is the cheapest source of realistic
 * input logs there is: it flies whole runs through the one verb from spec 01's
 * own measured distributions, and it says in its own header that it is a
 * stand-in for real play until the author's arrive. What is under test is not
 * the pilot — it is that a recorder, a recipe and a replay compose into the same
 * run three different ways.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import type { Recipe } from '../../src/sim/recipe.ts';
import { FIXTURE_FIELD, createRecorder, recipeOf, recordPress } from '../../src/sim/recipe.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { firstDifference, snapshot } from '../../src/sim/snapshot.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';
import { walkRun } from '../../tools/trail.ts';
import { flyRun } from './run.ts';

const REPLAYS = 4;
const LENGTHS = 4;

/** A whole run flown by the pilot, written down as it goes. */
function pilotRecipe(seed: number): { recipe: Recipe; ending: string | null; tick: number } {
  const recorder = createRecorder(FIXTURE_FIELD, seed);
  const flown = flyRun(fixtureField(), fixtureCraft(), seed, 20_000, (tick, pressed) =>
    recordPress(recorder, tick, pressed),
  );
  return { recipe: recipeOf(recorder), ending: flown.ending, tick: flown.tick };
}

/** Every tick's state as bytes, which is what "bit-identical" is measured in. */
function everyTick(recipe: Recipe, ticks: number): Uint8Array[] {
  const states: Uint8Array[] = [];
  replayRun(recipe, { ticks, onTick: (state) => states.push(snapshot(state)) });
  return states;
}

/** The seeds three whole runs happen to be, kept small so the suite stays quick. */
const SEEDS = [2472, 514, 98];

describe('a recorded run', () => {
  it('replays to a bit-identical final state, four times its own length', () => {
    for (const seed of SEEDS) {
      const { recipe } = pilotRecipe(seed);
      expect(recipe.ticks).toBeGreaterThan(2000);

      for (const ticks of [recipe.ticks, recipe.ticks * LENGTHS]) {
        const first = everyTick(recipe, ticks);
        for (let again = 1; again < REPLAYS; again++) {
          let at = 0;
          replayRun(recipe, {
            ticks,
            onTick: (state) => {
              const differs = firstDifference(first[at]!, snapshot(state));
              expect(differs, `seed ${seed}, replay ${again + 1}, tick ${at}`).toBe(-1);
              at += 1;
            },
          });
          expect(at).toBe(first.length);
        }
      }
    }
  });

  /**
   * The round trip that makes the recipe worth having: the pilot flew a run, the
   * recorder wrote down only what the button did, and flying *that* arrives at
   * the same ending on the same tick. Read at the boundary rather than by
   * comparing internals — the ending is what spec 01 §10 asks the simulation to
   * say out loud, and the swing count is a second reader agreeing with a first.
   */
  it('arrives where the run that was recorded arrived', () => {
    for (const seed of SEEDS) {
      const { recipe, ending, tick } = pilotRecipe(seed);
      const replayed = replayRun(recipe);
      expect(replayed.ending, `seed ${seed}`).toBe(ending);
      expect(replayed.tick).toBe(tick);
      expect(walkRun(recipe).swings.length).toBeGreaterThan(0);
    }
  });

  /**
   * **A run ends before its log does, and that is the normal case.** `stepSim`
   * does nothing once a run has an ending (ADR-0007: one run, no retry), so a
   * log with edges past the death is a log with nothing to say — and a replay
   * that kept flying would be inventing the part nobody flew.
   */
  it('stops at its ending, whatever is left in the log', () => {
    const { recipe } = pilotRecipe(2472);
    const ended = replayRun(recipe);
    expect(ended.ending).not.toBeNull();

    const overrun: Recipe = {
      ...recipe,
      ticks: recipe.ticks * 3,
      log: [...recipe.log, recipe.ticks + 10, recipe.ticks + 400],
    };
    const same = replayRun(overrun);
    expect(same.tick).toBe(ended.tick);
    expect(firstDifference(snapshot(ended), snapshot(same))).toBe(-1);
  });
});

describe('the picture beside the run', () => {
  /**
   * ADR-0006 promises that **a frame is a pure function of `(recipe, tick)`**,
   * and [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)
   * makes presentation state a recurrence — so the promise survives only if the
   * picture is derived beside the simulation, once per tick, from tick zero.
   * This is that promise as a test, and `tools/trail.ts` is what spends it.
   */
  function present(recipe: Recipe): PresentationState[] {
    const views: PresentationState[] = [];
    let view = createPresentation(openRun(recipe));
    replayRun(recipe, {
      onTick: (state) => {
        view = derive(view, state);
        views.push(view);
      },
    });
    return views;
  }

  it('replays identically too', () => {
    const { recipe } = pilotRecipe(514);
    const first = present(recipe);
    expect(first.length).toBeGreaterThan(1000);
    expect(present(recipe)).toEqual(first);
  });

  /**
   * And it cannot be asked for out of the blue. Deriving on demand at the last
   * tick is not the same answer as arriving there, which is exactly what "a
   * recurrence" means — so a replay that reproduced the picture by asking the
   * final state what it looked like would be reporting a frame nobody saw.
   */
  it('is not the same as asking the final state what it looks like', () => {
    const { recipe } = pilotRecipe(514);
    const arrived = present(recipe).at(-1)!;
    const onDemand = createPresentation(replayRun(recipe));
    expect(onDemand.tick).toBe(arrived.tick);
    expect(onDemand.camera).not.toEqual(arrived.camera);
  });
});

describe('the recipe pnpm replay ships with', () => {
  /**
   * It is committed so the command has a real run in the real format to prove
   * itself on before the author has flown one. This holds it to being exactly
   * what it claims: the pilot's run at seed 2472, and not a file that quietly
   * stopped matching the thing that made it.
   */
  it('is the pilot run it says it is', () => {
    const text = readFileSync(new URL('../recipes/pilot-76s.json', import.meta.url), 'utf8');
    const shipped = parseDispatch(JSON.parse(text));
    expect(shipped.recipe).toEqual(pilotRecipe(2472).recipe);
    expect(shipped.device).toBeUndefined();
    expect(shipped.observed.note).toMatch(/pilot/);
  });
});
