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

/**
 * How long a run has to be to be worth replaying. A run of a handful of ticks
 * proves nothing about a divergence that needs room to appear.
 */
const LONG_ENOUGH = 1000;

/**
 * How far the sweep below is allowed to look before it gives up, and the band it
 * is expected to land well inside.
 *
 * **This is where the guard lives now, and it is the falsifiable half.** A
 * finder that swept for ever would always find something and could never fail;
 * a cap turns *the pilot's runs have got too short to test determinism on* into
 * a red test with a sentence, which is a real finding about the physics rather
 * than three seeds to re-pin.
 */
const SEED_CAP = 500;
const SEARCH_BAND = 100;

/**
 * Three whole runs, long enough that a divergence has room to appear — **found
 * rather than named**, which is `test/moments.ts`'s argument applied to a seed.
 *
 * The seeds move whenever the physics does, and that was never a wart so much as
 * a chore: the pilot flies from the geometry, so the same seed takes a different
 * route under a different swing and one of them ends sooner. They were
 * `[28, 71, 139]`, then `[75, 340, 73]` when two of the three fell under
 * [`LONG_ENOUGH`](#) at SIM_VERSION 8. **What was ever fixed is the guard**, and
 * the guard is all that is written down now.
 */
function longRuns(count: number): { seeds: number[]; searched: number } {
  const found: number[] = [];
  let searched = 0;
  for (let seed = 1; seed <= SEED_CAP && found.length < count; seed++) {
    searched = seed;
    if (flyRun(fixtureField(), fixtureCraft(), seed, 20_000).tick > LONG_ENOUGH) found.push(seed);
  }
  if (found.length < count) {
    throw new Error(
      `Only ${found.length} of the first ${SEED_CAP} pilot seeds fly past ${LONG_ENOUGH} ticks,\n` +
        `and this test needs ${count}. That is not a re-pin: the pilot's runs have got short\n` +
        `enough that a replay has no room to diverge in, which is a fact about the physics\n` +
        `or about \`test/sim/run.ts\`. Neither the seeds nor the cap is the thing to move.`,
    );
  }
  return { seeds: found, searched };
}

const { seeds: SEEDS, searched: SEARCHED } = longRuns(3);

describe('a recorded run', () => {
  /**
   * **How deep the sweep had to go is the measurement, and it is a band.**
   * Three long runs were found in the first **13** seeds on 2026-08-31. A number
   * climbing toward [`SEARCH_BAND`](#) says the pilot's runs are shortening —
   * which is worth knowing and is what `test/sim/run.test.ts` measures properly —
   * and a number at [`SEED_CAP`](#) is the finder failing outright. The band is a
   * tolerance rather than a value to reproduce ([AGENTS.md](../../AGENTS.md) §4),
   * so a tuning that moves it from 13 to 30 costs nothing and edits nothing.
   */
  it('is found in the first handful of pilot seeds', () => {
    expect(SEEDS).toHaveLength(3);
    expect(SEARCHED).toBeGreaterThan(0);
    expect(SEARCHED).toBeLessThan(SEARCH_BAND);
  });

  it('replays to a bit-identical final state, four times its own length', () => {
    for (const seed of SEEDS) {
      const { recipe } = pilotRecipe(seed);
      expect(recipe.ticks).toBeGreaterThan(LONG_ENOUGH);

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
    const { recipe } = pilotRecipe(SEEDS[0]!);
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
    const { recipe } = pilotRecipe(SEEDS[1]!);
    const first = present(recipe);
    expect(first.length).toBeGreaterThan(LONG_ENOUGH);
    expect(present(recipe)).toEqual(first);
  });

  /**
   * And it cannot be asked for out of the blue. Deriving on demand at the last
   * tick is not the same answer as arriving there, which is exactly what "a
   * recurrence" means — so a replay that reproduced the picture by asking the
   * final state what it looked like would be reporting a frame nobody saw.
   */
  it('is not the same as asking the final state what it looks like', () => {
    const { recipe } = pilotRecipe(SEEDS[2]!);
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
   * what it claims: the pilot's run at the seed the file names, and not a file
   * that quietly stopped matching the thing that made it.
   *
   * **The seed is read from the file rather than written here**, because it has
   * had to move once and will again. A physics change re-flies every pilot run,
   * and what this fixture is for is a *long* one — 463 gave 73 seconds under the
   * physics before SIM_VERSION 7 and 21 under it, so the seed moved to 2836,
   * which gives 58. Pinning it in two places is what made that a two-line change
   * instead of one.
   */
  it('is the pilot run it says it is', () => {
    const text = readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8');
    const shipped = parseDispatch(JSON.parse(text));
    expect(shipped.recipe).toEqual(pilotRecipe(shipped.recipe.seed).recipe);
    expect(shipped.device).toBeUndefined();
    expect(shipped.observed.note).toMatch(/pilot/);
    // And it really is a whole run rather than a fragment, which is what the
    // goldens need of it. Length is not the property it is chosen on — coverage
    // is, and `tools/fixture.ts` is that search as code rather than as prose in
    // the recipe's note.
    expect(shipped.recipe.ticks).toBeGreaterThan(2000);
  });
});
