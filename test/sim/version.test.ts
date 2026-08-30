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
 *
 * ## And there is a third case, which is why this comment grew
 *
 * The fingerprint is taken over [`snapshot`](../../src/sim/snapshot.ts), so it
 * moves when the **picture** grows as well as when the **flight** changes — and
 * those want opposite answers. A run that flies the same route and merely
 * records one more number about itself must **not** refuse the recipes recorded
 * before it, because nothing about them was flown differently.
 *
 * So when this fails, the question to answer is *did a tick move?* rather than
 * *did the bytes move?*, and there is a way to answer it that is not a judgement
 * call: **add the field to the record but not to the snapshot, and run this.**
 * If it still passes, the flight is provably untouched and what is owed is this
 * fingerprint and `SNAPSHOT_VERSION` — not `SIM_VERSION`. That is exactly how
 * `Dive.aim` and `Orbit.aim` were landed on 2026-08-30 with the author's whole
 * dispatch corpus still replaying. Note that `SNAPSHOT_VERSION` is the first
 * `u32` in the bytes, so bumping it moves this on its own — which is the same
 * *picture, not flight* case a second time and wants the same answer.
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

    // **7 as of 2026-08-30: the dive payback.** This is the other case the header
    // describes — a tick genuinely moved. `release.ts` now returns an unfinished
    // swing toward the speed the press found it at, so a recipe replayed under
    // this build flies a different run than it was recorded as, and every recipe
    // before now is refused rather than quietly re-flown. `DIVE_PAYBACK` carries
    // the measurement that made it a ruling.
    //
    // The bump before it was 6, where the snapshot gained the dive's **aim** and
    // this number did *not* move — the picture-not-flight case, checked the way
    // the comment above prescribes and recorded here so the two are told apart.
    expect(SIM_VERSION).toBe(7);
    expect(
      digest.digest('hex').slice(0, 16),
      'the swing changed: bump SIM_VERSION and this fingerprint together, and every recipe ' +
        'recorded before now stops replaying',
    ).toBe('432e7fe36db0a2d7');
  });
});
