/**
 * Spec [06 · §2](../../docs/spec/06-awards.md)'s tiers, and its acceptance:
 *
 * > *"Grading is a pure function of `(d, W)` and imports nothing from the
 * > economy. The four zone boundaries are exact at `d = W/2`, `0.30W`, `0.15W`,
 * > `max(0.08W, 1.5°)`. With `W = 15°`, the PERFECT zone is 1.5° (the floor
 * > binds). With `W = 40°`, it is 3.2°."*
 *
 * Every one of those is below, and the two worked examples are asserted as the
 * spec writes them rather than as fractions — a worked example that is
 * recomputed from the formula it is checking has stopped being a check.
 */
import { describe, expect, it } from 'vitest';
import {
  alignmentOf,
  ARRIVAL_BAND,
  ARRIVAL_SIDEWAYS,
  arrivedTight,
  PERFECT_FLOOR,
  SHARP_ZONE,
  tierFor,
  TRUE_ZONE,
} from '../../src/sim/tier.ts';

const deg = (x: number): number => (x * Math.PI) / 180;
/** A hair, so a boundary can be probed from both sides without touching it. */
const HAIR = 1e-9;

describe('the four zones', () => {
  const W = deg(40);

  it('is a miss outside the window and a make on its edge', () => {
    expect(tierFor(W / 2 + HAIR, W)).toBeNull();
    expect(tierFor(W / 2, W)).toBe('MAKE');
    expect(tierFor(-W / 2, W)).toBe('MAKE');
  });

  it('is exact at every boundary, from both sides', () => {
    expect(tierFor(TRUE_ZONE * W, W)).toBe('TRUE');
    expect(tierFor(TRUE_ZONE * W + HAIR, W)).toBe('MAKE');
    expect(tierFor(SHARP_ZONE * W, W)).toBe('SHARP');
    expect(tierFor(SHARP_ZONE * W + HAIR, W)).toBe('TRUE');
  });

  it('grades the same either side of the dot', () => {
    for (const d of [0, 0.05, 0.1, 0.14, 0.2, 0.3, 0.49]) {
      expect(tierFor(d * W, W)).toBe(tierFor(-d * W, W));
    }
  });

  it('is a pure function of two numbers', () => {
    expect(tierFor(deg(3), deg(40))).toBe(tierFor(deg(3), deg(40)));
    expect(tierFor(0, 0)).toBeNull();
  });
});

describe('the PERFECT floor', () => {
  /** Spec 06's own worked examples, written as the spec writes them. */
  it('binds at a 15° window and does not at 40°', () => {
    expect(tierFor(deg(1.5), deg(15))).toBe('PERFECT');
    expect(tierFor(deg(1.5) + HAIR, deg(15))).toBe('SHARP');

    expect(tierFor(deg(3.2), deg(40))).toBe('PERFECT');
    expect(tierFor(deg(3.2) + HAIR, deg(40))).toBe('SHARP');
  });

  it('is 1.5° and nothing else', () => {
    expect((PERFECT_FLOOR * 180) / Math.PI).toBeCloseTo(1.5, 12);
  });

  /**
   * **And the consequence, which is worth seeing rather than discovering.** The
   * floor is absolute and every other zone is a fraction, so the narrower the
   * window the *larger a share of it* pays the top word — and below **3°** the
   * PERFECT zone covers the whole window and every make is a PERFECT.
   *
   * That is not a defect: spec 00 §6 rules that a narrow window is a harder
   * release and *"automatically a better-paid one"*, and this is the mechanism.
   * It is written down because the geometry earns its own widths here rather
   * than being authored, and flown on the fixture field it offers windows at a
   * p10 of 7.2° — where the PERFECT zone is **42%** of the window against
   * **16%** at 40°.
   */
  it('takes a larger share of a narrower window, and all of one under 3°', () => {
    const share = (w: number): number => Math.max(0.08 * w, 1.5) / (w / 2);
    expect(share(40)).toBeCloseTo(0.16, 2);
    expect(share(7.2)).toBeCloseTo(0.42, 2);

    // Under three degrees there is no room for a lesser word at all.
    expect(tierFor(deg(1.4), deg(3))).toBe('PERFECT');
    expect(tierFor(deg(1.6), deg(3))).toBeNull();
    // At seven there is.
    expect(tierFor(deg(3.4), deg(7))).toBe('MAKE');
  });
});

describe('the alignment ramp', () => {
  /**
   * **It runs over a quarter turn, not over the window** — which is what lets a
   * window brighten before the hand reaches it. Measured against the window a
   * window is dark until you are inside it, and by then the release has passed;
   * this is the prototype's `alignment`, and the one definition of *lined up*.
   */
  it('is whole at the dot and nothing a quarter turn off', () => {
    expect(alignmentOf(0)).toBe(1);
    expect(alignmentOf(Math.PI / 2)).toBe(0);
    expect(alignmentOf(Math.PI)).toBe(0);
    expect(alignmentOf(-Math.PI / 4)).toBeCloseTo(0.5, 12);
  });

  /** And it is already lifting well outside any window the compass draws. */
  it('is well up before the hand is anywhere near the arc', () => {
    const wide = deg(40) / 2;
    expect(alignmentOf(wide * 3)).toBeGreaterThan(0.3);
    expect(alignmentOf(wide)).toBeGreaterThan(0.7);
  });

  it('does not care which side of the dot the hand is on', () => {
    for (const d of [0.1, 0.4, 1.2]) expect(alignmentOf(d)).toBe(alignmentOf(-d));
  });
});

describe('the arrival · both halves have to be true', () => {
  const FLOOR = 159;

  it('refuses a dive that got to the floor pointed straight at the body', () => {
    // The bug the author flew on 2026-08-30: *"some of the captures were too
    // easily giving away the word."* The floor is a guarantee, so a dive aimed
    // at the body reaches it for free and must not be paid for arriving.
    expect(arrivedTight(FLOOR, FLOOR, 0)).toBe(false);
    expect(arrivedTight(FLOOR + 1, FLOOR, 0.23)).toBe(false);
  });

  it('refuses a sideways approach that never came down', () => {
    // The author's own exclusion: *"far away grabs at closest approach don't
    // count."* A graze is not an arrival however well it was aimed.
    expect(arrivedTight(FLOOR + 200, FLOOR, 0.98)).toBe(false);
  });

  it('pays a sideways approach that did come down', () => {
    expect(arrivedTight(FLOOR + 1, FLOOR, 0.75)).toBe(true);
  });

  it('grades the angle and not a distance, so a press with no room can still earn it', () => {
    // The denominator bug, kept as a test because the reading is what broke and
    // not the threshold. A press 16 units above a floor of 159 has an impact
    // parameter of at most 175 — 1.10 floors — so a rule comparing that distance
    // to the floor was unreachable for the most committed presses in the game.
    // The author flew exactly this one and reported it: *"my last capture felt
    // really tight and should've been awarded a word."*
    const grabRadius = 175;
    const sideways = 124;
    expect(sideways / FLOOR).toBeLessThan(1); // what the broken rule asked for
    expect(arrivedTight(FLOOR + 0.9, FLOOR, sideways / grabRadius)).toBe(true);
  });

  it('leaves the author their margin: 45 degrees was the derived line and is not the line', () => {
    // 0.708 is the author's *"really tight"* capture. Exactly 45 degrees would
    // have admitted it by one part in a thousand, which is a coin toss.
    const SIN_45 = Math.sqrt(0.5);
    expect(0.708).toBeGreaterThan(SIN_45);
    expect(0.708 - SIN_45).toBeLessThan(0.002);
    expect(ARRIVAL_SIDEWAYS).toBeLessThan(SIN_45);
    expect(0.708 - ARRIVAL_SIDEWAYS).toBeGreaterThan(0.1);
  });

  it('is exactly the band and the angle at their edges, inclusive', () => {
    expect(arrivedTight(FLOOR + ARRIVAL_BAND, FLOOR, ARRIVAL_SIDEWAYS)).toBe(true);
    expect(arrivedTight(FLOOR + ARRIVAL_BAND + 0.001, FLOOR, ARRIVAL_SIDEWAYS)).toBe(false);
    expect(arrivedTight(FLOOR, FLOOR, ARRIVAL_SIDEWAYS - 0.001)).toBe(false);
  });
});
