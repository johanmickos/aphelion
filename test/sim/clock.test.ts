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
