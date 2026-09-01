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
  ARRIVAL_REF_SPEED,
  ARRIVAL_SIDEWAYS,
  ARRIVAL_SPEED_RELIEF,
  arrivedTight,
  KNOCK_BAND,
  struckHard,
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
    expect(arrivedTight(FLOOR, FLOOR, 0, ARRIVAL_REF_SPEED)).toBe(false);
    expect(arrivedTight(FLOOR + 1, FLOOR, 0.23, ARRIVAL_REF_SPEED)).toBe(false);
  });

  it('refuses a sideways approach that never came down', () => {
    // The author's own exclusion: *"far away grabs at closest approach don't
    // count."* A graze is not an arrival however well it was aimed.
    expect(arrivedTight(FLOOR + 200, FLOOR, 0.98, ARRIVAL_REF_SPEED)).toBe(false);
  });

  it('pays a sideways approach that did come down', () => {
    expect(arrivedTight(FLOOR + 1, FLOOR, 0.75, ARRIVAL_REF_SPEED)).toBe(true);
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
    expect(arrivedTight(FLOOR + 0.9, FLOOR, sideways / grabRadius, ARRIVAL_REF_SPEED)).toBe(true);
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
    const REF = ARRIVAL_REF_SPEED;
    expect(arrivedTight(FLOOR + ARRIVAL_BAND, FLOOR, ARRIVAL_SIDEWAYS, REF)).toBe(true);
    expect(arrivedTight(FLOOR + ARRIVAL_BAND + 0.001, FLOOR, ARRIVAL_SIDEWAYS, REF)).toBe(false);
    expect(arrivedTight(FLOOR, FLOOR, ARRIVAL_SIDEWAYS - 0.001, REF)).toBe(false);
  });
});

describe('the knock · the price the floor charges', () => {
  /** Head-on enough to be eligible at all, at the speed the arrival is stated at. */
  const PLUNGE = 0.1;

  it('says nothing for the floor merely being touched', () => {
    // The floor is reached on most dives and costs almost nothing on nearly all
    // of them: over 78 real captures across 14 replayable dispatches the share it
    // takes is p50 0.0001 and p95 0.0010. A word said then would be constant.
    expect(struckHard(0, PLUNGE, ARRIVAL_REF_SPEED)).toBe(false);
    expect(struckHard(0.003, PLUNGE, ARRIVAL_REF_SPEED)).toBe(false);
  });

  /**
   * **The band is a gap rather than a value.** Among the head-on captures — the
   * only ones eligible at all — the corpus of 2026-09-01 runs 0.0572 and then
   * 0.0024, 0.0010, 0.0009 and down. This is asserted rather than the constant's
   * own number so that moving it on the bench past either end of that gap fails
   * here and says which end.
   */
  it('sits inside the gap the corpus leaves between a plunge and a touch', () => {
    expect(KNOCK_BAND).toBeGreaterThan(0.0024);
    expect(KNOCK_BAND).toBeLessThan(0.0572);
  });

  it('says something when a plunge loses real speed to the floor', () => {
    // The author's own example, 2026-09-01: a capture at aim 0.006 that lost
    // 5.7% of its speed to the floor and said nothing. See `KNOCK_BAND`.
    expect(struckHard(0.0572, 0.006, 291)).toBe(true);
  });

  /**
   * **The invariant, and since 2026-09-01 it is structural rather than
   * measured.** The two words read the same geometry from opposite ends — a
   * sideways dive earns an arrival, a dive pointed at the body slams into the
   * floor — so congratulating a capture and calling it a crash in the same breath
   * has to be impossible rather than merely unlikely.
   *
   * It used to be held by putting `KNOCK_BAND` above the hardest knock any tight
   * arrival was measured to take, and that is a fact about a corpus: it drifted
   * in and out of true twice in two days, and by 2026-09-01 the corpus contained
   * a capture at aim **0.994** taking **14.1%** — as sideways as the game gets,
   * earning the arrival, and above every band that fires at all.
   * [`struckHard`](../../src/sim/tier.ts) now asks about aim directly, so the
   * predicate granting one word denies the other and no cohort can disagree.
   *
   * Asserted over the plane rather than over an example, which is the whole
   * difference: every combination of aim and speed either cannot earn an arrival
   * or cannot earn a knock, whatever the floor took.
   */
  it('can never fire on a capture that earned an arrival, at any aim or speed', () => {
    const FLOOR = 159;
    for (let aim = 0; aim <= 1.0001; aim += 0.01) {
      for (const speed of [200, 291, 500, ARRIVAL_REF_SPEED, 1000, 1500]) {
        // The most generous arrival there is — right on the floor — so that
        // anything this leaves un-arrived is un-arrived on aim alone.
        const arrival = arrivedTight(FLOOR, FLOOR, aim, speed);
        // And the hardest knock there is, so a false here is about aim too.
        const knock = struckHard(1, aim, speed);
        expect(arrival && knock).toBe(false);
      }
    }
  });

  /**
   * And the pair is exhaustive as well as exclusive at the same speed: every aim
   * is on one side of the line or the other, so the two words divide the captures
   * rather than leaving a band that can earn neither for being neither.
   */
  it('leaves no aim that is neither sideways enough nor head-on enough', () => {
    const FLOOR = 159;
    for (let aim = 0; aim <= 1.0001; aim += 0.01) {
      const arrival = arrivedTight(FLOOR, FLOOR, aim, ARRIVAL_REF_SPEED);
      const knock = struckHard(1, aim, ARRIVAL_REF_SPEED);
      expect(arrival || knock).toBe(true);
    }
  });
});

/**
 * **Speed buys aim** — the author's own idea, 2026-08-31, after a capture they
 * felt had earned a word and did not get one: *"maybe we can incorporate the
 * velocity into the evaluation logic, since coming in fast makes it harder to
 * capture the lowest approach?"*
 *
 * The measurement agrees. Over the 105 captures in their dispatches, the slower
 * half lands a median **1.3** units above the floor and the faster half **25.0**;
 * ranked, room against entry speed is **rho 0.31**, and against aim the same speed
 * is rho −0.07 — so it is a third axis rather than a second reading of the first.
 * (Pearson misses it at 0.07, because room runs p05 0, p50 3, p95 543 and a few
 * fly-pasts swamp the mean. That is why it is measured on ranks.)
 */
describe('the arrival · what a fast approach is forgiven', () => {
  const FLOOR = 159;
  const tightAt = (aim: number, speed: number): boolean =>
    arrivedTight(FLOOR + 0.9, FLOOR, aim, speed);

  /**
   * **The ruled threshold does not move**, which is the whole shape of this
   * change: the author set `ARRIVAL_SIDEWAYS` after refusing a looser gate, so
   * relief is added on top of it and nothing can ever lose the word to it.
   */
  it('asks the full sideways requirement of anything not going faster than typical', () => {
    expect(tightAt(ARRIVAL_SIDEWAYS, ARRIVAL_REF_SPEED)).toBe(true);
    expect(tightAt(ARRIVAL_SIDEWAYS - 0.001, ARRIVAL_REF_SPEED)).toBe(false);
    // And a slow approach is forgiven nothing at all — being slower than typical
    // is not a difficulty, it is time to get sideways in.
    expect(tightAt(ARRIVAL_SIDEWAYS - 0.001, ARRIVAL_REF_SPEED / 2)).toBe(false);
    expect(tightAt(ARRIVAL_SIDEWAYS - 0.001, 0)).toBe(false);
  });

  /** And it eases from there, in proportion to how far over the reference it came. */
  it('forgives a fast approach in proportion to its speed', () => {
    expect(tightAt(ARRIVAL_SIDEWAYS - 0.001, ARRIVAL_REF_SPEED * 1.5)).toBe(true);
    const doubled = ARRIVAL_SIDEWAYS - ARRIVAL_SPEED_RELIEF;
    expect(tightAt(doubled, ARRIVAL_REF_SPEED * 2)).toBe(true);
    expect(tightAt(doubled - 0.001, ARRIVAL_REF_SPEED * 2)).toBe(false);
  });

  /**
   * **The relief never reaches the room**, which is the half of the gate that is
   * about commitment rather than about difficulty. A fast approach that stops a
   * long way short of the floor did not arrive tight; it flew past.
   */
  it('forgives no amount of room, however fast the approach', () => {
    for (const speed of [ARRIVAL_REF_SPEED, ARRIVAL_REF_SPEED * 4, 1e5]) {
      expect(arrivedTight(FLOOR + ARRIVAL_BAND + 0.001, FLOOR, 1, speed)).toBe(false);
    }
  });

  /**
   * The capture the author flagged, and the one that was already earning it a
   * hair below the same aim. Both are close; what separates them is that one
   * arrived at nearly twice the speed.
   */
  it('awards the capture the author flagged, at the aim that was refusing it', () => {
    expect(tightAt(0.57, 1367)).toBe(true);
    expect(tightAt(0.57, ARRIVAL_REF_SPEED)).toBe(false);
  });
});
