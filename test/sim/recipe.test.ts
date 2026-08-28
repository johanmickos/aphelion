/**
 * The recipe, which is the whole of what a run is (ADR-0004) — and the door it
 * comes in through.
 *
 * Two halves, and they are tested for different reasons. **The round trip** has
 * to be exact: what the recorder writes down has to reconstruct the identical
 * boolean sequence, because a press is an edge and a release is a level, and a
 * log that reproduced *nearly* the same sequence would reproduce a different
 * run without saying so. **The validator** has to be total: a recipe arrives
 * over the LAN from a phone, so it is attacker-shaped data, and every array it
 * accepts has to be one the replay loop can fly.
 */
import { describe, expect, it } from 'vitest';
import { clearPress, createPress, isPressed, pressDown } from '../../src/input/press.ts';
import { FIXTURE_FIELD_VERSION } from '../../src/sim/fixture-field.ts';
import {
  MAX_RECIPE_TICKS,
  RECIPE_VERSION,
  createRecorder,
  fieldFor,
  parseRecipe,
  pressAt,
  recipeOf,
  recordPress,
} from '../../src/sim/recipe.ts';
import { SIM_VERSION } from '../../src/sim/version.ts';

/** A recipe of the shape the validator should accept, to spoil one field at a time. */
const sound = {
  version: RECIPE_VERSION,
  field: { generator: 'fixture', version: FIXTURE_FIELD_VERSION },
  sim: SIM_VERSION,
  seed: 7,
  ticks: 100,
  log: [10, 40, 55],
};

/** Record a sequence of presses, then read it back tick by tick. */
function roundTrip(pressed: readonly boolean[]): boolean[] {
  const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 1);
  pressed.forEach((down, tick) => recordPress(recorder, tick, down));
  const recipe = recipeOf(recorder);
  return pressed.map((_, tick) => pressAt(recipe.log, tick));
}

describe('the input log', () => {
  it('reconstructs the identical sequence of presses', () => {
    const pressed = [false, true, true, true, false, false, true, false, true, true];
    expect(roundTrip(pressed)).toEqual(pressed);
  });

  /**
   * The case a hand-written log gets wrong. `stepSim` attempts a grab on the way
   * down only, so a button that is down for one tick and a button that is down
   * for forty are two different runs — and a run that opens with the button
   * already down has an edge on tick zero.
   */
  it('carries a press that is only one tick long, and one that opens the run', () => {
    expect(roundTrip([true, false, false, true, false])).toEqual([true, false, false, true, false]);
  });

  /**
   * Six hundred ticks of a stream nobody chose by hand, because the shapes that
   * break an edge log are the ones nobody thought to write down.
   */
  it('reconstructs a long run of arbitrary presses', () => {
    let s = 20260828;
    const pressed = Array.from({ length: 600 }, () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296 < 0.4;
    });
    expect(roundTrip(pressed)).toEqual(pressed);
  });

  /**
   * **Focus loss lets go of everything**, and it is a real up-edge a player did
   * not make ([`press.ts`](../../src/input/press.ts)): a tab switch, an incoming
   * call, the iOS app switcher. Driven through the rule itself rather than
   * through a literal, because that rule is the thing under test — a log written
   * from the boolean records the lifted grab exactly as it records a lifted
   * thumb, and a log written from the *events* would not have recorded it at all.
   */
  it('records the up-edge nobody made when the window loses focus', () => {
    const press = createPress();
    const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 1);
    const seen: boolean[] = [];
    for (let tick = 0; tick < 6; tick++) {
      if (tick === 1) {
        pressDown(press, 'pointer:1');
        pressDown(press, 'key');
      }
      if (tick === 4) clearPress(press);
      seen.push(isPressed(press));
      recordPress(recorder, tick, isPressed(press));
    }
    const recipe = recipeOf(recorder);
    expect(seen).toEqual([false, true, true, true, false, false]);
    expect(recipe.log).toEqual([1, 4]);
    expect(seen.map((_, tick) => pressAt(recipe.log, tick))).toEqual(seen);
  });

  /**
   * A press the simulation refused is still a press the player made. The log is
   * what the button did and nothing else, which is what lets a replay under a
   * changed constant *answer it differently* — and answering it differently is
   * the entire reason to prefer a recipe to a recording.
   */
  it('is what the button did, not what the simulation answered', () => {
    const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 1);
    for (let tick = 0; tick < 4; tick++) recordPress(recorder, tick, tick === 1);
    expect(recipeOf(recorder).log).toEqual([1, 2]);
  });

  it('answers the same however the ticks are asked for', () => {
    const log = [3, 9, 20];
    const forwards = [];
    for (let tick = 0; tick < 25; tick++) forwards.push(pressAt(log, tick));
    for (let tick = 24; tick >= 0; tick--) expect(pressAt(log, tick)).toBe(forwards[tick]);
  });
});

describe('the recorder', () => {
  it('refuses to be driven twice for one tick', () => {
    const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 1);
    recordPress(recorder, 0, false);
    expect(() => recordPress(recorder, 0, true)).toThrow(/tick/);
  });

  it('refuses to be skipped', () => {
    const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 1);
    recordPress(recorder, 0, false);
    expect(() => recordPress(recorder, 2, true)).toThrow(/tick/);
  });

  it('hands back a recipe that shares nothing with it', () => {
    const recorder = createRecorder({ generator: 'fixture', version: FIXTURE_FIELD_VERSION }, 3);
    recordPress(recorder, 0, true);
    const recipe = recipeOf(recorder);
    recordPress(recorder, 1, false);
    expect(recipe.log).toEqual([0]);
    expect(recipeOf(recorder).log).toEqual([0, 1]);
  });
});

describe('parseRecipe', () => {
  it('accepts a sound one', () => {
    expect(parseRecipe(structuredClone(sound)).log).toEqual([10, 40, 55]);
  });

  it.each([
    ['not an object', 42],
    ['a version this build does not write', { ...sound, version: RECIPE_VERSION + 1 }],
    ['no field', { ...sound, field: undefined }],
    ['a field nothing here can build', { ...sound, field: { generator: 'daily', version: 1 } }],
    [
      'a fixture field this build has moved past',
      { ...sound, field: { generator: 'fixture', version: FIXTURE_FIELD_VERSION + 1 } },
    ],
    ['a run flown under a simulation this build no longer is', { ...sound, sim: SIM_VERSION + 1 }],
    ['no simulation version at all', { ...sound, sim: undefined }],
    ['a seed that is not a whole number', { ...sound, seed: 1.5 }],
    ['a seed outside 32 bits', { ...sound, seed: 2 ** 32 }],
    ['a negative seed', { ...sound, seed: -1 }],
    ['more ticks than an hour of play', { ...sound, ticks: MAX_RECIPE_TICKS + 1 }],
    ['ticks that are not a number', { ...sound, ticks: '100' }],
    ['a log that is not an array', { ...sound, log: { 0: 1 } }],
    ['a log entry that is not a whole number', { ...sound, log: [10, 40.5] }],
    ['a log that runs backwards', { ...sound, log: [10, 40, 30] }],
    ['a log that repeats a tick', { ...sound, log: [10, 10] }],
    ['a log entry the run never reached', { ...sound, log: [10, 100] }],
    ['a log on a run of no ticks', { ...sound, ticks: 0, log: [0] }],
  ])('refuses %s', (_what, raw) => {
    expect(() => parseRecipe(raw)).toThrow();
  });

  /**
   * A file is written on the strength of this returning
   * (`tools/vite-plugin-diag.ts`), so what comes back has to be built here out
   * of values that were checked — never the caller's object with a type
   * assertion over it.
   */
  it('builds a fresh recipe rather than blessing the one it was handed', () => {
    const raw = { ...structuredClone(sound), somethingElse: 'ignored' };
    const recipe = parseRecipe(raw);
    expect(Object.keys(recipe).sort()).toEqual(['field', 'log', 'seed', 'sim', 'ticks', 'version']);
    raw.log.push(90);
    expect(recipe.log).toEqual([10, 40, 55]);
  });
});

describe('the field a recipe names', () => {
  it('resolves to the field and the craft the run opened with', () => {
    const { field, craft } = fieldFor({ generator: 'fixture', version: FIXTURE_FIELD_VERSION });
    expect(field.bodies.length).toBeGreaterThan(0);
    expect(field.corridor.halfWidth).toBeGreaterThan(0);
    expect(craft.vy).toBeLessThan(0);
  });

  it('says which field it could not build', () => {
    expect(() => fieldFor({ generator: 'daily', version: 1 })).toThrow(/daily/);
    expect(() => fieldFor({ generator: 'fixture', version: 99 })).toThrow(/v99/);
  });
});
