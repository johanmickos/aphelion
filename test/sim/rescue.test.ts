/**
 * The deadline's prediction — where a press still saves a drift, and where it
 * stops.
 *
 * Everything here is asserted **without a canvas**, which is the point of the
 * prediction living beside the simulation: *"the last press that can save this
 * run is at world x 1 040"* is a sentence a test should be able to make, and
 * `test/render/track.test.ts` is where what is drawn from it is checked.
 *
 * ## The one thing this file cannot assert, said out loud
 *
 * The prediction is **not a fact**. Its condition is *no single press-and-hold
 * from here turns the craft away*, and it does not consider releasing and
 * grabbing a different body — a real escape the player has. The prototype
 * measured its own version at **95%** over a real corpus and named it `SOS`
 * rather than `DOOMED` for exactly that reason. So what is asserted below is that
 * the predicate is the one that was ruled, never that the craft dies.
 */
import { describe, expect, it } from 'vitest';
import { createCraft } from '../../src/sim/craft.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { scatterField } from '../../src/sim/scatter-field.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { SCALE } from '../../src/sim/units.ts';
import {
  MAX_SAMPLES,
  SAMPLE_STRIDE,
  advanceScan,
  openScan,
  rescueDeadline,
  turnedAway,
} from '../../src/sim/rescue.ts';
import type { SimState } from '../../src/sim/types.ts';

const field = scatterField();
const { centreline } = field.corridor;

/** A craft drifting outward from `off` the centreline at `across` design units a second. */
function drifting(off: number, across: number, up = 2000): SimState {
  return createInitialState(
    field,
    createCraft(centreline + off * SCALE, -up * SCALE, across * SCALE, -300 * SCALE),
    1,
  );
}

describe('the bar', () => {
  /**
   * **A rescue is having stopped closing on the wall** — the author's ruling of
   * 2026-09-01, and deliberately not *the swing is safe*. A bar that judged the
   * swing would refuse to mark a grab that saves a life and then swings wide,
   * which is a real and legitimate thing to do.
   */
  it('is turning away, and nothing more', () => {
    expect(turnedAway({ ...fixtureCraft(), vx: -1 }, 'right')).toBe(true);
    expect(turnedAway({ ...fixtureCraft(), vx: 1 }, 'right')).toBe(false);
    expect(turnedAway({ ...fixtureCraft(), vx: 1 }, 'left')).toBe(true);
    expect(turnedAway({ ...fixtureCraft(), vx: -1 }, 'left')).toBe(false);
    // Exactly parallel counts as turned: the craft has stopped closing, which is
    // the whole of what the word means.
    expect(turnedAway({ ...fixtureCraft(), vx: 0 }, 'right')).toBe(true);
    expect(turnedAway({ ...fixtureCraft(), vx: 0 }, 'left')).toBe(true);
  });
});

describe('when there is nothing to mark', () => {
  /**
   * **Null while a body is held** — the author's ruling and the prototype's own
   * split: the escape from a capture is a release, not a grab, so a *grab*
   * deadline has nothing to say about one. What covers that case is the SOS,
   * armed at the press.
   */
  it('says nothing while a body is held', () => {
    const state = drifting(150, 900);
    // Fly until something is grabbed, then check.
    for (let tick = 0; tick < 400; tick++) {
      stepSim(state, { pressed: true });
      if (state.heldBody !== null) break;
    }
    expect(state.heldBody).not.toBeNull();
    expect(rescueDeadline(state)).toBeNull();
  });

  it('says nothing once the run is over', () => {
    const state = drifting(150, 900);
    state.ending = 'OUT_OF_BOUNDS';
    expect(rescueDeadline(state)).toBeNull();
  });

  /**
   * **The cheap refusal**, which is what stops the common case paying for the
   * projection: a drift is a straight line plus a decaying burst, so the furthest
   * it can reach sideways inside the horizon has a closed form.
   */
  it('says nothing for a drift that cannot reach a line', () => {
    expect(rescueDeadline(drifting(0, 0))).toBeNull();
    expect(rescueDeadline(drifting(0, 40))).toBeNull();
  });

  /**
   * And nothing in a field with no sides — `tools/check-portability.ts` builds
   * exactly that one, which is the same field [`hasRungs`](../../src/state/rung.ts)
   * exists for.
   */
  it('says nothing in a field with no line', () => {
    const open = fixtureField();
    const state = createInitialState(
      { ...open, corridor: { ...open.corridor, halfWidth: Infinity, foot: Infinity } },
      fixtureCraft(),
      1,
    );
    expect(rescueDeadline(state)).toBeNull();
  });
});

describe('the scan', () => {
  /** A drift that still has a rescue in front of it — see `the SOS case` for one that does not. */
  const SAVEABLE = { off: 60, across: 300, up: 1500 } as const;
  const found = rescueDeadline(drifting(SAVEABLE.off, SAVEABLE.across, SAVEABLE.up))!;

  it('finds the wall the drift is actually heading for', () => {
    expect(found).not.toBeNull();
    expect(found.wall).toBe('right');
    expect(rescueDeadline(drifting(-150, -900))!.wall).toBe('left');
  });

  /**
   * **Bounded whatever the drift costs**, which is not belt-and-braces: measured
   * over the author's dispatches a drift reaches **541 ticks**, and at a fixed
   * stride of three that would be 180 evaluations on the tick a coast begins —
   * which is a press-up edge, the one the phone does *not* currently drop a frame
   * on.
   */
  it('never spends more than its budget of samples', () => {
    for (const off of [80, 120, 150, 180]) {
      for (const across of [200, 500, 900, 1400]) {
        const scan = rescueDeadline(drifting(off, across));
        if (scan === null) continue;
        expect(scan.path.length).toBeLessThanOrEqual(MAX_SAMPLES + 1);
        expect(scan.path.length).toBeGreaterThan(1);
      }
    }
  });

  it('samples no finer than the stride it was ruled to', () => {
    // Consecutive samples are at least a stride apart along the drift, which is
    // what bounds the work; the refinement pass is the only thing finer, and it
    // produces a point rather than a sample.
    const gaps: number[] = [];
    for (let at = 1; at < found.path.length; at++) {
      const one = found.path[at - 1]!;
      const two = found.path[at]!;
      gaps.push(Math.hypot(two.x - one.x, two.y - one.y));
    }
    expect(Math.min(...gaps)).toBeGreaterThan(0);
    expect(SAMPLE_STRIDE).toBe(3);
  });

  /**
   * **The dot is refined past the stride**, which is the prototype's own note and
   * the reason a coarse scan is safe: without it *"the cross hops by a stride as
   * the ship advances into it"*. Asserted as the thing that would prove it: the
   * dot is a world point that does not move as the craft flies toward it.
   */
  it('holds the dot still as the craft advances into it', () => {
    const state = drifting(SAVEABLE.off, SAVEABLE.across, SAVEABLE.up);
    const first = rescueDeadline(state)!;
    expect(first.cross).not.toBeNull();
    for (let tick = 0; tick < 12; tick++) {
      stepSim(state, { pressed: false });
      const again = rescueDeadline(state);
      if (again === null || again.cross === null) break;
      expect(again.cross.x).toBeCloseTo(first.cross!.x, 3);
      expect(again.cross.y).toBeCloseTo(first.cross!.y, 3);
    }
  });

  /**
   * **The dot really is the last one.** Every sample past it fails, and the dot
   * itself is at or after the last sample that succeeds — which is the whole
   * claim the instrument makes.
   */
  it('puts the dot after every saving sample and before every failing one', () => {
    const along = (p: { x: number; y: number }): number =>
      Math.hypot(p.x - found.path[0]!.x, p.y - found.path[0]!.y);
    const saving = found.path.filter((p) => p.saves);
    expect(saving.length).toBeGreaterThan(0);
    expect(along(found.cross!)).toBeGreaterThanOrEqual(along(saving[saving.length - 1]!) - 1e-6);
    const failingAfter = found.path.filter((p) => !p.saves && along(p) > along(found.cross!));
    expect(failingAfter.every((p) => !p.saves)).toBe(true);
  });
});

describe('a late rescue is still a rescue', () => {
  /**
   * ⚠ **The regression this exists for.** The first build applied the *drawing*
   * birth gate to the scan itself, nulling the `cross` when its lead was under a
   * quarter of a second. That made a real-but-late rescue indistinguishable from
   * **no rescue at all** — and the SOS reads exactly that distinction, so it
   * strobed at a craft that could still save itself, and did.
   *
   * The author flew it: *"the SOS light went on during my last capture. When I
   * kept holding I survived and ended up orbiting. That shouldn't happen."*
   * Traced, the scan at that grab had found **one saving sample out of seven** and
   * reported no cross.
   *
   * So the invariant is stated as the thing that was broken: **if any sample
   * saves, there is a cross.** Whether the mark is worth *drawing* is a separate
   * question and lives with the picture.
   */
  it('reports a cross whenever any sample saves, however little lead it has', () => {
    for (let off = -190; off <= 190; off += 10) {
      for (const across of [200, 400, 700, 1000, 1300]) {
        for (const up of [1200, 2000, 2800, 3600]) {
          const scan = rescueDeadline(drifting(off, off >= 0 ? across : -across, up));
          if (scan === null) continue;
          const saves = scan.path.some((sample) => sample.saves);
          expect(saves === (scan.cross !== null)).toBe(true);
        }
      }
    }
  });
});

describe('the SOS case', () => {
  /**
   * **A drift with no window at all is the 34%**, and it is what the SOS is for:
   * there is no mark to draw, and an absent mark meaning *you were never savable*
   * would be reading safety off an absence — which spec 05 §5 refuses by name.
   */
  it('reports a wall with no dot when nothing saves', () => {
    let doomed = 0;
    let marked = 0;
    for (let off = -190; off <= 190; off += 20) {
      for (const across of [400, 700, 1000, 1300]) {
        const scan = rescueDeadline(drifting(off, off >= 0 ? across : -across));
        if (scan === null) continue;
        if (scan.cross === null) doomed++;
        else marked++;
      }
    }
    // Both happen, and neither is the only thing that happens — a predicate that
    // answered one way everywhere would pass every other test in this file.
    expect(doomed).toBeGreaterThan(0);
    expect(marked).toBeGreaterThan(0);
  });
});

describe('a spread scan and a whole one are the same scan', () => {
  /**
   * ⚠ **The claim the spreading rests on, and the reason there is one scan rather
   * than two.**
   *
   * `src/state/deadline.ts` spends the scan a few presses a tick — the author's
   * ruling of 2026-09-01, *"every 3rd tick, spread over the fade-in"*, earned by
   * the phone on 2026-09-02. A second implementation of the scan for the spread
   * case would be two things that drift apart, which is a defect the prototype
   * records happening to this exact predicate. So `rescueDeadline` **is**
   * `openScan` plus `advanceScan` run to the end, and this asserts that a scan
   * paid for one press at a time reaches the identical answer — every sample, the
   * dot, and the lead.
   */
  it('reaches the identical answer one press at a time', () => {
    let compared = 0;
    for (let off = -190; off <= 190; off += 20) {
      for (const across of [400, 700, 1000, 1300]) {
        const whole = rescueDeadline(drifting(off, off >= 0 ? across : -across));
        let scan = openScan(drifting(off, off >= 0 ? across : -across));
        if (scan === null) {
          expect(whole).toBeNull();
          continue;
        }
        // One press a call, which is the slowest the picture could ever spend it.
        let spins = 0;
        while (!scan.done) {
          scan = advanceScan(scan, 1);
          spins += 1;
          expect(spins).toBeLessThanOrEqual(MAX_SAMPLES * 4);
        }
        expect(scan.found).toEqual(whole);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  /**
   * **And advancing it is a value, not a job.** The scan is carried on presentation
   * state and `derive` is a pure function of *(previous, sim)* — so a scan asked
   * twice must answer twice the same, which is what the bench, `walkRun` and every
   * test that re-derives a memo all depend on.
   */
  it('does not move when it is advanced', () => {
    const opened = openScan(drifting(120, 900));
    expect(opened).not.toBeNull();
    const once = advanceScan(opened!, 2);
    const again = advanceScan(opened!, 2);
    expect(again.path).toEqual(once.path);
    expect(opened!.path.length).toBe(0);
    // And the two carry on to the same place.
    expect(advanceScan(once, Number.POSITIVE_INFINITY).found).toEqual(
      advanceScan(again, Number.POSITIVE_INFINITY).found,
    );
  });
});
