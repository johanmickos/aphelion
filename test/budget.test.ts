/**
 * The frame-budget harness — [M3.6](../docs/plan/m3-the-field.md) and
 * `VISION.md`'s standing gap: *"the correctness gate says nothing about time."*
 *
 * Two halves are asserted here and they are different kinds of claim.
 *
 * **The arithmetic**, which lives in `tools/trail.ts` beside the fit every other
 * reader of a timing block already shares. What is new is the pooled fit and the
 * leverage, and both exist because two honest fits on one phone appeared to
 * disagree and nothing in the repo could say whether they did.
 *
 * **The command**, run for real, because *"a command that reports p99 and max for
 * a replayed recipe without a browser"* is the acceptance and a test that never
 * runs it is a test of something else. It is the same thing
 * `test/portability.test.ts` does to `pnpm portable`.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_CATCH_UP_TICKS } from '../src/sim/units.ts';
import { parseTimingOnly } from '../tools/dispatch.ts';
import { fitAcross, fitGroups, leverageOf } from '../tools/trail.ts';
import type { DispatchTiming, TickGroup } from '../tools/meter.ts';
import { TIMING_BUCKETS } from '../tools/meter.ts';

/** A timing block carrying only what a fit reads, so the claims stay legible. */
function timing(perFrame: number, perTick: number, frames: readonly number[]): DispatchTiming {
  const byTicks: TickGroup[] = [];
  let total = 0;
  for (let ticks = 0; ticks <= MAX_CATCH_UP_TICKS; ticks++) {
    const count = frames[ticks] ?? 0;
    const cpu = count * (perFrame + ticks * perTick);
    total += count;
    byTicks.push({ frames: count, cpu });
  }
  const empty = {
    buckets: new Array<number>(TIMING_BUCKETS).fill(0),
    total: 0,
    max: 0,
  };
  return { frames: total, cpu: empty, interval: empty, byTicks, worst: [], timeline: [] };
}

describe('what a run can say about the split', () => {
  /**
   * ⚠ **The measurement that settles the two fits on record.**
   *
   * `2026-09-01T06-00-36` fits 0.26 ms a tick and 0.81 a frame; `2026-09-02T06-02-56`
   * fits 0.14 and 1.01 on the same phone. The plan recorded that nobody had checked
   * whether that was a contradiction. It is not: a run where nearly every frame ran
   * exactly one tick pins the **sum** and leaves the split free, and `leverageOf` is
   * the count that says so without a model in it.
   */
  it('counts the frames the split actually rests on', () => {
    // The reference run's own shape: 380 frames ran none, 1024 ran one, 8 ran two.
    const reference = leverageOf(timing(1, 0.14, [380, 1024, 8]));
    expect(reference.off).toBe(388);
    expect(reference.share).toBeCloseTo(388 / 1412, 3);

    // And a run where nearly everything ran one tick has almost nothing to say.
    const thin = leverageOf(timing(1, 0.26, [42, 2398, 12]));
    expect(thin.off).toBe(54);
    expect(thin.share).toBeLessThan(0.03);
    expect(thin.sxx).toBeLessThan(reference.sxx / 4);
  });

  /** A run whose frames all ran the same number of ticks has no line at all. */
  it('has nothing to say when every frame ran one tick', () => {
    expect(leverageOf(timing(1, 0.2, [0, 900, 0])).off).toBe(0);
    expect(fitGroups(timing(1, 0.2, [0, 900, 0]).byTicks)).toBeNull();
  });
});

describe('what a tick costs, pooled over runs', () => {
  /**
   * ⚠ **The model, and the reason it is not a pooled ordinary fit.**
   *
   * A tick is the same work on the same device; the **draw** is not — the corpus's
   * mean frame cpu climbs 0.75 → 1.06 ms over the four days M3 added the sky, the
   * rungs and the boundary. So each run keeps its own frame cost and only the slope
   * is shared. Fabricated here as three runs that genuinely share a tick and
   * genuinely differ in their draw, with the cheap-drawing run also being the one
   * with the most spread — which is exactly the arrangement that makes a
   * common-intercept pool report a tick that is far too dear.
   */
  it('recovers one tick cost from runs whose frames cost different amounts', () => {
    const runs = [
      timing(0.4, 0.25, [900, 900, 20]),
      timing(1.2, 0.25, [40, 1800, 10]),
      timing(1.4, 0.25, [30, 1500, 8]),
    ];
    const pooled = fitAcross(runs)!;
    expect(pooled.perTick).toBeCloseTo(0.25, 6);
    expect(pooled.runs).toBe(3);

    // The naive alternative, spelled out so the difference is not taken on trust:
    // one line through every frame of every run at once reads the cheap-drawing
    // run's many zero-tick frames as evidence that a tick is dear.
    const naive = fitGroups(
      runs
        .map((run) => run.byTicks)
        .reduce((sum, groups) =>
          sum.map((group, at) => ({
            frames: group.frames + groups[at]!.frames,
            cpu: group.cpu + groups[at]!.cpu,
          })),
        ),
    )!;
    expect(naive.perTick).toBeGreaterThan(0.5);
  });

  /** One run is a point of view, not a corpus. */
  it('refuses to pool fewer than two runs that carry any spread', () => {
    expect(fitAcross([timing(1, 0.2, [10, 900, 3])])).toBeNull();
    expect(fitAcross([timing(1, 0.2, [0, 900, 0]), timing(1, 0.2, [0, 800, 0])])).toBeNull();
  });

  /**
   * **The interval is clustered by run**, because the frames inside one run are
   * not independent of each other — and treating them as if they were is what
   * makes one run's error bars look tight enough to contradict the run beside it.
   * Three runs that disagree must produce a wider interval than three that agree,
   * at the same number of frames.
   */
  it('widens when the runs disagree rather than when the frames are few', () => {
    const shape: readonly number[] = [400, 1000, 10];
    const agreeing = fitAcross([
      timing(1, 0.2, shape),
      timing(1.1, 0.2, shape),
      timing(0.9, 0.2, shape),
    ])!;
    const arguing = fitAcross([
      timing(1, 0.05, shape),
      timing(1.1, 0.2, shape),
      timing(0.9, 0.35, shape),
    ])!;
    expect(agreeing.frames).toBe(arguing.frames);
    expect(agreeing.error).toBeLessThan(0.01);
    expect(arguing.error).toBeGreaterThan(agreeing.error * 10);
  });
});

describe('the timing of a dispatch this build refuses to replay', () => {
  const buckets = (at: Record<number, number>): number[] => {
    const out = new Array<number>(TIMING_BUCKETS).fill(0);
    for (const [ms, n] of Object.entries(at)) out[Number(ms)] = n;
    return out;
  };
  const wire = {
    kind: 'run-dispatch',
    at: '2026-09-02T06:02:56.717Z',
    // A recipe from an older simulation: `parseDispatch` refuses it, and that
    // refusal is the corpus rule working.
    recipe: { sim: 1, seed: 7, ticks: 3, log: [], field: { generator: 'fixture', version: 1 } },
    observed: { ticks: [], note: '' },
    timing: {
      frames: 4,
      cpu: { buckets: buckets({ 1: 4 }), total: 4, max: 1 },
      interval: { buckets: buckets({ 16: 4 }), total: 66, max: 17 },
      byTicks: [
        { frames: 1, cpu: 1 },
        { frames: 3, cpu: 3 },
        { frames: 0, cpu: 0 },
        { frames: 0, cpu: 0 },
      ],
      worst: [],
      timeline: [{ tick: 3, frames: 4, cpu: 4, interval: 66, jumps: 0, worst: 17 }],
    },
  };

  /**
   * ⚠ **Three quarters of what this project knows about the phone is in dispatches
   * whose recipes are refused** — 26 replay at `SIM_VERSION` 9 and 56 do not — and
   * the meter has not changed, so their frame timings are still evidence about the
   * device. Reading them is a door with a validator on it, not a hole in the wall.
   */
  it('is still readable, because the meter did not change when the swing did', () => {
    const carried = parseTimingOnly(wire)!;
    expect(carried.timing.frames).toBe(4);
    expect(carried.timing.byTicks[1]!.frames).toBe(3);
  });

  /** And the block itself goes through the identical validator. Nothing is loosened. */
  it('is refused when the block does not add up', () => {
    const broken = { ...wire, timing: { ...wire.timing, frames: 5 } };
    expect(() => parseTimingOnly(broken)).toThrow();
    expect(() => parseTimingOnly({ ...wire, kind: 'something-else' })).toThrow();
    expect(parseTimingOnly({ ...wire, timing: undefined })).toBeNull();
  });
});

describe('pnpm budget', () => {
  /**
   * **Run for real, with no browser in sight**, which is the acceptance in its own
   * words. What is asserted is the shape of the answer rather than any number in
   * it: the numbers are this machine's and would make the test a benchmark.
   */
  it('reports p99 and max for a replayed recipe, and says it is not a phone', () => {
    const budget = fileURLToPath(new URL('../tools/budget.ts', import.meta.url));
    const out = execFileSync('node', [budget], { encoding: 'utf8', stdio: 'pipe' });
    // `VISION.md`: *the units that matter are p99 and max, not mean.*
    expect(out).toContain('p99');
    expect(out).toContain('max');
    // The house rule `pnpm profile` is written under, kept saying.
    expect(out).toContain('not a phone');
    // The phone baseline the milestone owes, beside the laptop's own numbers.
    expect(out).toContain('the phone baseline');
    expect(out).toContain('the conversion, and the budget');
    // And the frames it built really did fly the whole recipe.
    expect(out).toMatch(/These frames flew (\d+) of the recipe's \1 ticks\./);
  }, 60_000);
});
