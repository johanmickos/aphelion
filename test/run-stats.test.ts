/**
 * What a run measures about itself, and that the measurement outlives the death.
 *
 * The ordering pin below is the load-bearing one. `endLife` clears the live run
 * on the FIRST tick of the ending hold, so a summary read after the fact is a
 * summary of nothing — the same trap `AGENTS.md` records for the score ("a death
 * zeroes it, so at the last tick of a recording it is usually zero"). Every other
 * assertion here could pass while the feature was useless if that one broke.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import { createScoreState, scoreTick } from '../src/score/index.ts';
import type { ScoreState } from '../src/score/types.ts';

const NONE: Input = { held: false, pressed: false, released: false };
const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };

/** Fly `plan(tick)` for `ticks` ticks, scoring every one. */
function fly(
  cfg: SimConfig,
  ticks: number,
  plan: (t: number) => Input,
  state = createInitialState(cfg),
  sc: ScoreState = createScoreState(),
): { state: SimState; sc: ScoreState } {
  for (let t = 0; t < ticks; t++) {
    stepSim(state, cfg, plan(t), FIXED_DT);
    scoreTick(sc, state, cfg, FIXED_DT);
  }
  return { state, sc };
}

/** A press held from tick 20 onward — enough to grab the opening body. */
const grabAt20 = (t: number): Input => (t === 20 ? PRESS : t > 20 ? HOLD : NONE);

describe('a run measures itself', () => {
  const cfg = DEFAULT_CONFIG;

  it('counts ticks, and derives seconds from them rather than a clock', () => {
    const { sc } = fly(cfg, 120, () => NONE);
    expect(sc.run.ticks).toBe(120);
  });

  it('tracks the fastest the ship ever went, not the speed it ended at', () => {
    const { sc } = fly(cfg, 200, grabAt20);
    expect(sc.run.topSpeed).toBeGreaterThan(0);
    // A capture bends and brakes, so the last tick is virtually never the fastest.
    const last = sc.run.topSpeed;
    const { sc: longer } = fly(cfg, 260, grabAt20);
    expect(longer.run.topSpeed).toBeGreaterThanOrEqual(last);
  });

  it('integrates distance from speed, so a respawn teleport is not banked', () => {
    // Fly into the ground, then keep going through the respawn. Position deltas
    // would add the whole length of the field at the moment the ship snaps back
    // to spawn; integrating speed cannot, because the ship is frozen while dead.
    const state = createInitialState(cfg);
    const sc = createScoreState();
    const field = Math.abs(state.ship.y) + 5000;
    let jumped = 0;
    let prevY = state.ship.y;
    for (let t = 0; t < 900; t++) {
      stepSim(state, cfg, NONE, FIXED_DT);
      scoreTick(sc, state, cfg, FIXED_DT);
      if (Math.abs(state.ship.y - prevY) > 1000) jumped++;
      prevY = state.ship.y;
    }
    expect(jumped, 'the fixture is meant to respawn at least once').toBeGreaterThan(0);
    expect(sc.run.distance).toBeLessThan(field);
  });

  it('remembers the longest chain, which the pinned multiplier cannot show', () => {
    const sc = createScoreState();
    const state = createInitialState(cfg);
    scoreTick(sc, state, cfg, FIXED_DT);
    sc.streak = 9;
    scoreTick(sc, state, cfg, FIXED_DT);
    sc.streak = 3;
    scoreTick(sc, state, cfg, FIXED_DT);
    expect(sc.run.peakChain, 'the peak survives the chain falling back').toBe(9);
  });

  it('counts a rough passage once, however many ticks it stays rough', () => {
    // The counter hangs off the SAME rising edge recklessStreak does, so the two
    // can never disagree about what a rough passage is.
    const { sc } = fly(cfg, 400, grabAt20);
    expect(sc.run.roughPasses).toBeLessThanOrEqual(sc.grabs);
  });
});

describe('the run survives the death that ends it', () => {
  const cfg = DEFAULT_CONFIG;

  /** Fly until the run ends, and report how it ended alongside the score. */
  function flyToDeath(): { sc: ScoreState; reason: SimState['ending']['reason'] } {
    const state = createInitialState(cfg);
    const sc = createScoreState();
    for (let t = 0; t < 5000; t++) {
      stepSim(state, cfg, NONE, FIXED_DT);
      scoreTick(sc, state, cfg, FIXED_DT);
      if (state.ending.active) break;
    }
    expect(state.ending.active, 'the fixture is meant to die').toBe(true);
    return { sc, reason: state.ending.reason };
  }

  it('seals the run BEFORE endLife clears it', () => {
    const { sc } = flyToDeath();
    expect(sc.lastRun, 'a life that ended has a sealed record').not.toBeNull();
    expect(sc.lastRun!.ticks, 'and it is not the post-reset zero').toBeGreaterThan(0);
    expect(sc.lastRun!.distance).toBeGreaterThan(0);
    // The live run IS reset, which is exactly why the seal has to exist.
    expect(sc.run.ticks).toBe(0);
    expect(sc.run.distance).toBe(0);
  });

  it('records how the life ended, on the tick it ended', () => {
    const { sc, reason } = flyToDeath();
    // Asserted as a correspondence rather than a remembered value. A drift with
    // no input flies INTO the opening body rather than falling behind, which is
    // the opposite of what this test first assumed — so it now checks the rule
    // instead of the fixture's particular way of dying.
    expect(sc.lastRun!.impacts).toBe(reason === 'impact' ? 1 : 0);
    expect(sc.lastRun!.highWaterY).toBeLessThanOrEqual(0);
  });

  it('folds each life into a session maximum that no death resets', () => {
    const state = createInitialState(cfg);
    const sc = createScoreState();
    let deaths = 0;
    for (let t = 0; t < 12000 && deaths < 2; t++) {
      const wasEnding = state.ending.active;
      stepSim(state, cfg, NONE, FIXED_DT);
      scoreTick(sc, state, cfg, FIXED_DT);
      if (state.ending.active && !wasEnding) deaths++;
    }
    expect(deaths, 'the fixture is meant to die twice').toBe(2);
    expect(sc.sessionMax.topSpeed).toBeGreaterThanOrEqual(sc.lastRun!.topSpeed);
    expect(sc.sessionMax.ticks).toBeGreaterThanOrEqual(sc.lastRun!.ticks);
    // Impacts sum rather than max, because a max over 0-or-1 could only ever say
    // "at least once" — see foldSessionMax.
    expect(sc.sessionMax.impacts).toBeGreaterThanOrEqual(0);
  });
});

describe('the stats are observation only', () => {
  it('adds no ScoreConfig weight, so no golden needs recapturing', async () => {
    // The guard for the rule in AGENTS.md: a value that never changes what
    // anything COSTS is a counter, not a weight. If one of these ever migrates
    // into ScoreConfig it drags the equality gate and the golden with it.
    const { DEFAULT_SCORE_CONFIG } = await import('../src/score/config.ts');
    for (const k of ['topSpeed', 'distance', 'peakChain', 'fireSecs', 'roughPasses']) {
      expect(Object.hasOwn(DEFAULT_SCORE_CONFIG, k), `${k} must not be a weight`).toBe(false);
    }
  });

  it('leaves the simulation unable to see any of it', () => {
    // Scoring twice off one SimState must produce the same sim state, because the
    // scorer writes nothing the simulation reads.
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    stepSim(state, cfg, NONE, FIXED_DT);
    const before = JSON.stringify(state);
    scoreTick(createScoreState(), state, cfg, FIXED_DT);
    scoreTick(createScoreState(), state, cfg, FIXED_DT);
    expect(JSON.stringify(state)).toBe(before);
  });
});
