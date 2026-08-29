/**
 * The frame meter: whether the distribution it keeps is the distribution the
 * frames had, and whether the budget it recovers is the budget they were flown
 * under.
 *
 * **This is the only place either can be checked**, and that is the whole reason
 * [`meter.ts`](../tools/meter.ts) is handed its timestamps rather than reading a
 * clock. A meter that called `performance.now()` could only be tested against
 * whatever the machine running the test happened to do, which is not a test — it
 * is a second measurement with no known answer. Here the frames are fabricated,
 * so what the meter *should* say is arithmetic.
 *
 * The load-bearing case is the last one. The phone clamps `performance.now()` to
 * a whole millisecond, so no single frame's cost is known to better than 1ms —
 * and the budget this project needs is a tick that costs a fraction of one. The
 * claim in the meter's header is that grouping frames by how many ticks they ran
 * and fitting a line across the groups recovers that fraction anyway. It is
 * checked here against a phone that is fabricated down to its clamp.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_WORST_FRAMES,
  TIMELINE_SEGMENTS,
  TIMING_BUCKETS,
  bucketAt,
  bucketCount,
  createMeter,
  frameBegan,
  frameEnded,
  timingOf,
} from '../tools/meter.ts';
import type { Meter } from '../tools/meter.ts';
import { frameCost } from '../tools/trail.ts';
import { MAX_CATCH_UP_TICKS } from '../src/sim/units.ts';

/** One frame: it was presented, it cost something, and it ran some ticks. */
interface Fabricated {
  readonly presentedAt: number;
  readonly cost: number;
  readonly tick: number;
  readonly ticks: number;
}

/**
 * Fly the frames past a meter, optionally through a clock that only tells whole
 * milliseconds.
 *
 * The clamp is applied where the phone applies it — to the clock, on the way in
 * — rather than to the answer, so what the meter sees is what Safari on iOS
 * would have handed it.
 */
function meterOf(frames: readonly Fabricated[], clamp = (t: number): number => t): Meter {
  const meter = createMeter();
  for (const frame of frames) {
    const began = frame.presentedAt;
    frameBegan(meter, frame.presentedAt, clamp(began));
    frameEnded(meter, clamp(began + frame.cost), frame.tick, frame.ticks);
  }
  return meter;
}

/** A steady 60Hz run of `count` frames, each costing `cost` and running one tick. */
function steady(count: number, cost: number): Fabricated[] {
  return Array.from({ length: count }, (_, i) => ({
    presentedAt: i * (1000 / 60),
    cost,
    tick: i,
    ticks: 1,
  }));
}

describe('the meter', () => {
  it('has nothing to say until a frame has been finished by the next one', () => {
    const meter = createMeter();
    expect(timingOf(meter)).toBeNull();
    frameBegan(meter, 0, 0);
    frameEnded(meter, 4, 0, 1);
    // Begun and costed, but its interval does not exist until there is a frame
    // after it — so it is not a frame yet.
    expect(timingOf(meter)).toBeNull();
    frameBegan(meter, 16.67, 16.67);
    expect(timingOf(meter)?.frames).toBe(1);
  });

  it('counts the frames it closed, which is one fewer than it opened', () => {
    const timing = timingOf(meterOf(steady(100, 4)))!;
    expect(timing.frames).toBe(99);
    expect(bucketCount(timing.cpu)).toBe(99);
    expect(bucketCount(timing.interval)).toBe(99);
  });

  it('keeps a sample in the bucket its whole millisecond names', () => {
    const timing = timingOf(meterOf(steady(4, 4.7)))!;
    expect(timing.cpu.buckets[4]).toBe(3);
    expect(timing.cpu.max).toBeCloseTo(4.7, 6);
    // The sum is untruncated, so a mean survives the bucketing.
    expect(timing.cpu.total).toBeCloseTo(14.1, 6);
  });

  it('puts everything past the last bucket in the last bucket', () => {
    const timing = timingOf(meterOf(steady(3, TIMING_BUCKETS + 500)))!;
    expect(timing.cpu.buckets[TIMING_BUCKETS - 1]).toBe(2);
    expect(timing.cpu.max).toBeGreaterThan(TIMING_BUCKETS);
  });

  it('separates what the frame cost from what the browser took to call it', () => {
    const meter = createMeter();
    // Presented at 0, but not called until 5ms later; the work itself took 2ms.
    frameBegan(meter, 0, 5);
    frameEnded(meter, 7, 0, 1);
    frameBegan(meter, 16.67, 17);
    const timing = timingOf(meter)!;
    // Ours is the 2ms. The 5ms the browser spent deciding to call us is in the
    // interval, where it belongs.
    expect(timing.cpu.total).toBeCloseTo(2, 6);
    expect(timing.interval.total).toBeCloseTo(16.67, 6);
  });

  it('groups frames by the ticks they ran, and adds up to the frames it counted', () => {
    const frames: Fabricated[] = [
      { presentedAt: 0, cost: 1, tick: 0, ticks: 0 },
      { presentedAt: 16, cost: 5, tick: 1, ticks: 1 },
      { presentedAt: 33, cost: 9, tick: 3, ticks: 2 },
      { presentedAt: 50, cost: 13, tick: 6, ticks: 3 },
      { presentedAt: 66, cost: 5, tick: 7, ticks: 1 },
    ];
    const timing = timingOf(meterOf(frames))!;
    expect(timing.byTicks).toHaveLength(MAX_CATCH_UP_TICKS + 1);
    // Four of the five, because the last frame is never closed.
    expect(timing.byTicks.map((group) => group.frames)).toEqual([1, 1, 1, 1]);
    expect(timing.byTicks.reduce((sum, group) => sum + group.frames, 0)).toBe(timing.frames);
  });

  it('names the worst frames by interval, worst first, and no more than the cap', () => {
    // A frame is late because the one before it overran, so the gap in front of
    // frame `i` is what frame `i` is charged with.
    let at = 0;
    const frames: Fabricated[] = [];
    for (let i = 0; i < 60; i++) {
      frames.push({ presentedAt: at, cost: 4, tick: i, ticks: 1 });
      at += i % 7 === 3 ? 40 + i : 16.67;
    }
    const timing = timingOf(meterOf(frames))!;
    expect(timing.worst.length).toBe(MAX_WORST_FRAMES);
    const intervals = timing.worst.map((frame) => frame.interval);
    expect([...intervals].sort((a, b) => b - a)).toEqual(intervals);
    expect(intervals[0]).toBeGreaterThan(40);
    // Every named frame carries the tick it happened on — the reason for naming
    // one at all is to be able to replay what the run was doing there.
    for (const frame of timing.worst) expect(Number.isInteger(frame.tick)).toBe(true);
  });

  it('reads a percentile off the buckets, at the edge the run really reached', () => {
    // Ninety frames at 4ms and ten at 20ms.
    const frames: Fabricated[] = [];
    for (let i = 0; i < 101; i++) {
      frames.push({ presentedAt: i * 16.67, cost: i % 10 === 0 ? 20.5 : 4.5, tick: i, ticks: 1 });
    }
    const timing = timingOf(meterOf(frames))!;
    expect(bucketAt(timing.cpu, 0.5)).toBe(4);
    expect(bucketAt(timing.cpu, 0.99)).toBe(20);
  });

  /**
   * The claim the whole instrument rests on: a tick costing a fraction of a
   * millisecond is recoverable from a clock that only tells whole ones.
   *
   * The mechanism is **dither**. `floor(start + cost) − floor(start)` is either
   * `⌊cost⌋` or `⌈cost⌉`, and which one it is depends on where in its
   * millisecond the frame happened to start. Over thousands of frames whose
   * starts land all over that millisecond, the proportion of round-ups *is* the
   * fraction — so the mean recovers what no single sample carries.
   *
   * That is why the fabricated phone below jitters, and the jitter is not
   * decoration. A display of *exactly* 1000/60 ms and a cost of exactly the same
   * fraction every frame puts every start on one of three phases and nowhere
   * else, and the dither degenerates: the same fit comes back 13% low. Real
   * hardware does not do that — a vsync is not exact, a callback is not entered
   * at the vsync, and no two frames draw the same number of bodies — but it is
   * worth knowing that the recovery is a property of the *noise* and not of the
   * arithmetic, and worth having a test that would fail if the noise went away.
   */
  it('recovers a sub-millisecond tick from a whole-millisecond clock', () => {
    const PER_FRAME = 1.4;
    const PER_TICK = 0.6;
    // A small deterministic wobble, so the test is stable and the phases are not.
    let noise = 12345;
    const wobble = (): number => {
      noise = (noise * 1103515245 + 12345) % 2147483648;
      return noise / 2147483648;
    };
    let at = 0;
    let tick = 0;
    const frames: Fabricated[] = [];
    for (let i = 0; i < 4000; i++) {
      // A 59.94Hz display against a 60Hz simulation: mostly one tick a frame,
      // occasionally none and occasionally two. This is `ticksDue` doing its job.
      const ticks = i % 11 === 0 ? 0 : i % 37 === 0 ? 2 : 1;
      tick += ticks;
      // The callback is entered a little after the vsync, and no two frames
      // draw quite the same thing.
      const cost = PER_FRAME + ticks * PER_TICK + (wobble() - 0.5) * 0.4;
      frames.push({ presentedAt: at + wobble() * 0.9, cost, tick, ticks });
      at += 1000 / 60;
    }
    const clamped = timingOf(meterOf(frames, Math.floor))!;
    const fit = frameCost(clamped)!;
    // Every single sample was a whole millisecond, and both halves of the budget
    // come back inside a tenth of one.
    expect(clamped.cpu.buckets.filter((n) => n > 0).length).toBeLessThanOrEqual(4);
    expect(fit.perTick).toBeCloseTo(PER_TICK, 1);
    expect(fit.perFrame).toBeCloseTo(PER_FRAME, 1);
  });

  it('has no line to fit when every frame ran the same number of ticks', () => {
    expect(frameCost(timingOf(meterOf(steady(50, 4)))!)).toBeNull();
  });
});

/**
 * The timeline exists because the first report the meter answered was about a
 * *stretch* of a run — *"towards the end … I definitely felt some lag"* — and a
 * histogram is the whole run at once. What it must never do is grow with the
 * run: an hour of play and a minute of it cost the same bytes, which is what
 * makes the block's size a property of its shape.
 */
describe('the timeline', () => {
  it('never grows past its cap, however long the run is', () => {
    for (const frames of [40, 400, 4000, 40000]) {
      const timing = timingOf(meterOf(steady(frames, 4)))!;
      expect(timing.timeline.length).toBeLessThanOrEqual(TIMELINE_SEGMENTS);
      // And every frame is still in there somewhere: folding adds neighbours
      // together, it does not sample one of them.
      expect(timing.timeline.reduce((sum, s) => sum + s.frames, 0)).toBe(timing.frames);
      expect(timing.timeline.reduce((sum, s) => sum + s.cpu, 0)).toBeCloseTo(timing.cpu.total, 6);
    }
  });

  it('runs in order, and each segment names the tick the run had reached', () => {
    const frames: Fabricated[] = [];
    for (let i = 0; i < 900; i++) {
      frames.push({ presentedAt: i * 16.67, cost: 4, tick: i, ticks: 1 });
    }
    const ticks = timingOf(meterOf(frames))!.timeline.map((s) => s.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  /** The column this was built for: a jump is a frame that ran two or more ticks. */
  it('counts the jumps where they happened, not where the run ended', () => {
    let at = 0;
    const frames: Fabricated[] = [];
    for (let i = 0; i < 600; i++) {
      // Every jump is in the last quarter, which is the claim being tested.
      const ticks = i >= 450 && i % 9 === 0 ? 2 : 1;
      frames.push({ presentedAt: at, cost: 4, tick: i, ticks });
      at += ticks === 2 ? 33.3 : 16.67;
    }
    const timeline = timingOf(meterOf(frames))!.timeline;
    const early = timeline.slice(0, Math.floor(timeline.length / 2));
    const late = timeline.slice(Math.floor(timeline.length / 2));
    expect(early.reduce((sum, s) => sum + s.jumps, 0)).toBe(0);
    expect(late.reduce((sum, s) => sum + s.jumps, 0)).toBeGreaterThan(10);
    // And a segment can never hold more jumps than it holds frames.
    for (const s of timeline) expect(s.jumps).toBeLessThanOrEqual(s.frames);
  });

  it('keeps the worst gap in a segment rather than losing it to a fold', () => {
    const frames: Fabricated[] = [];
    let at = 0;
    for (let i = 0; i < 2000; i++) {
      frames.push({ presentedAt: at, cost: 4, tick: i, ticks: 1 });
      at += i === 1500 ? 99 : 16.67;
    }
    const timeline = timingOf(meterOf(frames))!.timeline;
    expect(Math.max(...timeline.map((s) => s.worst))).toBeCloseTo(99, 6);
  });
});
