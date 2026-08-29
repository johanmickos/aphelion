/**
 * The boundary between observed time and ticks — the only place a duration from
 * outside reaches the simulation (ADR-0006).
 */
import { describe, expect, it } from 'vitest';
import { createClock, ticksDue } from '../../src/sim/clock.ts';
import { MAX_CATCH_UP_TICKS, SECONDS_PER_TICK } from '../../src/sim/units.ts';

describe('the fixed timestep', () => {
  it('spends a whole tick of time on exactly one tick', () => {
    const clock = createClock();
    expect(ticksDue(clock, SECONDS_PER_TICK)).toBe(1);
  });

  it('buys nothing with less than a tick, and keeps the change', () => {
    const clock = createClock();
    expect(ticksDue(clock, SECONDS_PER_TICK / 2)).toBe(0);
    expect(ticksDue(clock, SECONDS_PER_TICK / 2)).toBe(1);
  });

  /**
   * A 59.94 Hz display against a 60 Hz simulation. Over ten seconds of frames
   * the ticks delivered must track the time observed — a clock that dropped the
   * remainder each frame would run the game slow, visibly and unattributably.
   */
  it('does not drift against a display that is not exactly 60 Hz', () => {
    const clock = createClock();
    const frame = 1 / 59.94;
    let ticks = 0;
    for (let i = 0; i < 600; i++) ticks += ticksDue(clock, frame);
    const expected = (600 * frame) / SECONDS_PER_TICK;
    expect(Math.abs(ticks - expected)).toBeLessThan(1);
  });
});

/**
 * A display read through a clock that can only tell whole milliseconds — which
 * is what WebKit gives the author's phone, and where the stutter came from.
 *
 * Every one of these drives the real `ticksDue` with fabricated timestamps
 * clamped exactly as the phone clamps them, so what is being tested is the
 * arithmetic and not a machine.
 */
function throughAGrainyClock(
  hz: number,
  frames: number,
  grainSeconds: number,
): { idle: number; jumps: number; ticks: number; observedSeconds: number } {
  const clock = createClock();
  const period = 1000 / hz;
  let at = 0;
  let last = 0;
  let idle = 0;
  let jumps = 0;
  let ticks = 0;
  for (let i = 0; i < frames; i++) {
    at += period;
    // The clamp, applied where the browser applies it: to the reading.
    const now = Math.floor(at);
    const due = ticksDue(clock, (now - last) / 1000, grainSeconds);
    last = now;
    if (due === 0) idle += 1;
    if (due >= 2) jumps += 1;
    ticks += due;
  }
  return { idle, jumps, ticks, observedSeconds: at / 1000 };
}

const MILLISECOND = 0.001;

describe('a clock that can only tell whole milliseconds', () => {
  /**
   * The bug, as a test, so it cannot come back unnoticed. A 60 Hz display and a
   * 60 Hz simulation should need exactly one tick a frame and nothing else.
   */
  it('makes the craft jump when the reading is taken at face value', () => {
    const { idle, jumps } = throughAGrainyClock(60, 3600, 0);
    expect(jumps).toBeGreaterThan(100);
    expect(idle).toBeGreaterThan(100);
  });

  it('runs exactly one tick a frame once the grain is declared', () => {
    for (const hz of [60, 60.1, 59.94]) {
      const { idle, jumps, ticks } = throughAGrainyClock(hz, 3600, MILLISECOND);
      expect(jumps).toBeLessThan(10);
      expect(idle).toBeLessThan(10);
      expect(ticks).toBeGreaterThan(3580);
    }
  });

  it('leaves a display nowhere near the tick rate alone', () => {
    // 120 Hz needs a tick every other frame and 30 Hz needs two a frame; neither
    // reading is within a grain of a whole tick, so neither is rounded.
    expect(throughAGrainyClock(120, 1200, MILLISECOND).idle).toBeGreaterThan(500);
    expect(throughAGrainyClock(30, 1200, MILLISECOND).jumps).toBeGreaterThan(500);
  });

  /**
   * The guard. Rounding every frame toward a whole tick would let a display that
   * genuinely runs at 63 Hz drag the simulation along with it — 2.2 seconds of
   * drift per minute, measured, before this bound existed.
   */
  it('will not let rounding drag the simulation off wall-clock time', () => {
    for (const hz of [61, 63, 65]) {
      const { ticks, observedSeconds } = throughAGrainyClock(hz, 6000, MILLISECOND);
      const drift = Math.abs(ticks * SECONDS_PER_TICK - observedSeconds);
      // Bounded by a tick, whatever the display does — not by a promise.
      expect(drift).toBeLessThan(SECONDS_PER_TICK * 2);
    }
  });

  it('still catches up a frame that genuinely took two ticks', () => {
    const clock = createClock();
    for (let i = 0; i < 10; i++) ticksDue(clock, SECONDS_PER_TICK, MILLISECOND);
    expect(ticksDue(clock, SECONDS_PER_TICK * 2, MILLISECOND)).toBe(2);
  });

  it('reads a duration far from a whole tick exactly as it was handed it', () => {
    const clock = createClock();
    // Half a tick is nobody's rounding error; it buys nothing and is kept whole.
    expect(ticksDue(clock, SECONDS_PER_TICK / 2, MILLISECOND)).toBe(0);
    expect(clock.unspentSeconds).toBeCloseTo(SECONDS_PER_TICK / 2, 12);
  });

  it('is the arithmetic it always had when the caller declares no grain', () => {
    const declared = createClock();
    const silent = createClock();
    const frame = 1 / 59.94;
    for (let i = 0; i < 600; i++) {
      expect(ticksDue(silent, frame)).toBe(ticksDue(declared, frame, 0));
    }
  });
});

describe('the catch-up ceiling', () => {
  it('never runs more than three ticks for one observation', () => {
    const clock = createClock();
    expect(ticksDue(clock, 30)).toBe(MAX_CATCH_UP_TICKS);
  });

  /**
   * Discarded rather than banked. A phone that slept for a minute comes back
   * holding a minute of time, and banking it only defers the fast-forward — the
   * run would sprint through whatever the player was in the middle of, several
   * ticks per frame, until the debt cleared.
   */
  it('discards the excess instead of banking it', () => {
    const clock = createClock();
    ticksDue(clock, 30);
    expect(ticksDue(clock, 0)).toBe(0);
    expect(ticksDue(clock, SECONDS_PER_TICK)).toBe(1);
  });
});
