/**
 * The guard that makes [`SIM_VERSION`](../../src/sim/version.ts) mean something.
 *
 * A recipe carries the build of the swing it was flown under so that a run
 * recorded before a physics change is **refused rather than replayed into a run
 * nobody flew**. That is only true while the number moves whenever the swing
 * does, and remembering to move it is not a mechanism — the same argument
 * `test/sim/fixture-field.test.ts` makes about the field's own version, one layer
 * up.
 *
 * So this fingerprints a whole run: the pilot's, flown through the one verb from
 * spec 01's own measured distributions, over the field the gate flies. Anything
 * that changes what a tick does changes the fingerprint — a constant, an
 * integrator, an ordering — and this fails until the version moves with it.
 *
 * **It is not a golden test of the physics.** It says nothing about whether the
 * number is right, only that a change to it was noticed. When it fails, look at
 * what you changed: if a recipe would now fly a different run, bump
 * `SIM_VERSION` and the fingerprint together and know that every recipe recorded
 * before now stops replaying. If you meant to change nothing — a refactor that
 * should have been bit-identical — the fingerprint has just told you it was not.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { FIXTURE_FIELD, createRecorder, recipeOf, recordPress } from '../../src/sim/recipe.ts';
import { replayRun } from '../../src/sim/replay.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { SIM_VERSION } from '../../src/sim/version.ts';
import { flyRun } from './run.ts';

/** Three whole runs, so the fingerprint covers more of the swing than one can. */
const SEEDS = [2472, 514, 98];

describe('the simulation behaviour version', () => {
  it('moves whenever the swing a recipe replays to does', () => {
    const digest = createHash('sha256');
    for (const seed of SEEDS) {
      const recorder = createRecorder(FIXTURE_FIELD, seed);
      flyRun(fixtureField(), fixtureCraft(), seed, 20_000, (tick, pressed) =>
        recordPress(recorder, tick, pressed),
      );
      // Every tick, not only the last: a divergence that appears and heals is
      // still a different run, and the end state would not see it.
      replayRun(recipeOf(recorder), { onTick: (state) => digest.update(snapshot(state)) });
    }

    expect(SIM_VERSION).toBe(6);
    expect(
      digest.digest('hex').slice(0, 16),
      'the swing changed: bump SIM_VERSION and this fingerprint together, and every recipe ' +
        'recorded before now stops replaying',
    ).toBe('5d8fb46a1c605645');
  });
});
