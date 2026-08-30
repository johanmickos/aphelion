/**
 * The reader an agent walks: which tick a grab happened on, what the geometry
 * was, and where on the envelope a release fell.
 *
 * What is under test is that the trail says the same thing the simulation did,
 * measured independently — the geometry recomputed here from positions, the
 * envelope's bands checked against spec [01 · §7](../docs/spec/01-swing.md)'s own
 * three times, and the camera checked against presentation state derived beside
 * the run rather than against itself. A reader that agreed with the simulation
 * because it asked the simulation would be no evidence at all
 * ([ADR-0013](../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
 */
import { describe, expect, it } from 'vitest';
import { floorRadius } from '../src/sim/body.ts';
import { speedOf } from '../src/sim/craft.ts';
import { distance } from '../src/sim/math.ts';
import { fixtureCraft, fixtureField } from '../src/sim/fixture-field.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import {
  FIXTURE_FIELD,
  RECIPE_VERSION,
  createRecorder,
  recipeOf,
  recordPress,
} from '../src/sim/recipe.ts';
import { SIM_VERSION } from '../src/sim/version.ts';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { BOOST_ARM_TICKS, BOOST_PLATEAU_TICKS, BOOST_ZERO_TICKS } from '../src/sim/units.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import { envelopeBand, walkRun } from '../tools/trail.ts';
import { flyRun } from './sim/run.ts';

/** One swing, by hand: the field opens with the first body already on offer. */
const RELEASE = 200;
const oneSwing: Recipe = {
  version: RECIPE_VERSION,
  field: FIXTURE_FIELD,
  sim: SIM_VERSION,
  seed: 1,
  ticks: 400,
  log: [0, RELEASE],
};

describe('a swing, read from outside', () => {
  const trail = walkRun(oneSwing);
  const swing = trail.swings[0]!;

  it('names the press, the body and the geometry the press saw', () => {
    const craft = fixtureCraft();
    const first = fixtureField().bodies[0]!;
    expect(trail.swings).toHaveLength(1);
    expect(swing.pressedAt).toBe(0);
    // `CONTEXT.md`'s address: the body's altitude number, bottom to top.
    expect(swing.address).toBe(1);
    expect(swing.grabRadius).toBeCloseTo(distance(craft.x, craft.y, first.x, first.y), 9);
    expect(swing.approachSpeed).toBeCloseTo(speedOf(craft), 9);
  });

  it('dates the freeze and the release from the ticks they happened on', () => {
    expect(swing.frozenAt).not.toBeNull();
    expect(swing.frozenAt!).toBeGreaterThan(0);
    expect(swing.releasedAt).toBe(RELEASE);
    expect(swing.sinceFreeze).toBe(RELEASE - swing.frozenAt!);
    expect(swing.envelope).toBe(envelopeBand(swing.sinceFreeze!));
    expect(swing.exitSpeed).toBeGreaterThan(0);
  });

  /**
   * The floor is *"a hard limit that is never crossed, and the one guarantee a
   * grab makes"* (`CONTEXT.md`), and the trail is where that becomes something
   * an agent can check against a run the author actually flew.
   */
  it('reports a periapsis at or above the body it swung around', () => {
    const first = fixtureField().bodies[0]!;
    expect(swing.floor).toBeCloseTo(floorRadius(first), 9);
    expect(swing.periapsis).toBeGreaterThanOrEqual(swing.floor - 1e-9);
    expect(swing.depth).toBeGreaterThan(0);
    expect(swing.depth).toBeLessThanOrEqual(1);
  });
});

describe('the envelope a release fell on', () => {
  /** Spec 01 §7's three times, in the words a trail says them in. */
  it('is named at the boundaries the spec puts them at', () => {
    expect(envelopeBand(0)).toBe('unarmed');
    expect(envelopeBand(BOOST_ARM_TICKS - 1)).toBe('unarmed');
    expect(envelopeBand(BOOST_ARM_TICKS)).toBe('plateau');
    expect(envelopeBand(BOOST_PLATEAU_TICKS)).toBe('plateau');
    expect(envelopeBand(BOOST_PLATEAU_TICKS + 1)).toBe('decaying');
    expect(envelopeBand(BOOST_ZERO_TICKS)).toBe('decaying');
    expect(envelopeBand(BOOST_ZERO_TICKS + 1)).toBe('expired');
  });
});

describe('a whole run, read from outside', () => {
  /** A run the pilot flew: six swings, four presses nothing answered. */
  function pilotRecipe(seed: number): Recipe {
    const recorder = createRecorder(FIXTURE_FIELD, seed);
    flyRun(fixtureField(), fixtureCraft(), seed, 20_000, (tick, pressed) =>
      recordPress(recorder, tick, pressed),
    );
    return recipeOf(recorder);
  }

  /**
   * Every press is one of two things and there is no third: it took a body, or
   * it was refused and stays refused. Spec 01 §3 counts them that way — 278
   * presses, 270 grabs, 8 refusals — so a trail that lost one would be a trail
   * that could not be compared against the measurement.
   */
  it('accounts for every press as a swing or a refusal', () => {
    const recipe = pilotRecipe(38);
    const trail = walkRun(recipe);
    const presses = Math.ceil(recipe.log.length / 2);
    expect(trail.refused).toBeGreaterThan(0);
    expect(trail.swings.length + trail.refused).toBe(presses);
    expect(trail.ending).not.toBeNull();
    expect(trail.climbed).toBeGreaterThan(0);
  });

  /**
   * A run that ends while a body is held never let go, and the swing it died on
   * is usually the one the author is talking about — so it is reported with an
   * open release rather than dropped.
   */
  it('keeps the swing a run died on', () => {
    // M1.4 measured that **87% of out-of-bounds endings happen with a body still
    // held** — *you are not flying out of the corridor, you are being swung out
    // of it* — so this is the common shape of a death rather than an edge case.
    const trail = walkRun(pilotRecipe(3));
    const last = trail.swings.at(-1)!;
    expect(trail.ending).toBe('OUT_OF_BOUNDS');
    expect(last.releasedAt).toBeNull();
    expect(last.exitSpeed).toBeNull();
    expect(last.envelope).toBeNull();
    expect(last.pressedAt).toBeLessThan(trail.ticks);
  });
});

describe('a moment the author flagged', () => {
  /**
   * The flag an author is likeliest to make is on the death, and it lands one
   * tick past the last one flown — the loop describes ticks 0 to `ticks - 1`,
   * and the control stamps `sim.tick`, which has already become `ticks`. Dropped
   * silently, it would lose exactly the observation the gate is for.
   */
  it('describes one made at the moment the run ended', () => {
    const trail = walkRun({ ...oneSwing, ticks: 4000, log: [0, 250] });
    expect(trail.ending).not.toBeNull();
    const moment = walkRun({ ...oneSwing, ticks: 4000, log: [0, 250] }, [trail.ticks]).moments[0]!;
    expect(moment.tick).toBe(trail.ticks);
    expect(moment.phase).toBe('coasting');
  });

  /**
   * The camera is checked against presentation state derived beside the run from
   * tick zero — ADR-0006's *"an agent with no canvas can assert that the camera
   * is offset 6px along the tangent at tick 412"*, which is the promise this
   * whole step exists to keep.
   */
  it('says what was happening, and where the picture was looking', () => {
    const at = 150;
    const moment = walkRun(oneSwing, [at]).moments[0]!;
    expect(moment.tick).toBe(at);
    expect(moment.phase).toBe('orbiting');
    expect(moment.address).toBe(1);
    expect(moment.sinceGrab).toBe(at);

    let view = createPresentation(openRun(oneSwing));
    let expected = view;
    replayRun(oneSwing, {
      ticks: at + 1,
      onTick: (state, tick) => {
        view = derive(view, state);
        if (tick === at) expected = view;
      },
    });
    expect(moment.camera).toEqual({ x: expected.camera.x, y: expected.camera.y });
  });
});
