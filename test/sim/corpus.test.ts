/**
 * The characteristics spec [01](../../docs/spec/01-swing.md) states as
 * **percentiles of real play**, against a stand-in corpus.
 *
 * `VISION.md`'s seventh pillar rules that a threshold is a percentile of real
 * play and never a plausible round number. Half of spec 01's tolerances are
 * therefore not statements about a geometry at all — *"clearance fires on 50 –
 * 60% of real grabs"*, *"median exit speed inside 280 – 350"* — and a sweep over
 * a box of geometries cannot answer them, because it weights the corners of the
 * envelope as heavily as the middle where the game is actually played.
 *
 * So [`corpus`](./swing.ts) draws presses from the two distributions spec 01
 * measured over 270 real grabs and 95 released swings, and this file reads the
 * percentiles off that. **What it is not is a corpus of this game's own play**:
 * the aim distribution is assumed rather than measured, and spec 01 §13.7 rules
 * that every threshold here should be replaced the first time there is a real
 * one — M1.5's recorded runs and M1.6's flying. Until then this is the closest
 * honest thing, and each assertion below says which of its inputs is evidence.
 */
import { describe, expect, it } from 'vitest';
import { attemptGrab } from '../../src/sim/grab.ts';
import { energyAt } from '../../src/sim/gravity.ts';
import { coast } from '../../src/sim/integrate.ts';
import { distance } from '../../src/sim/math.ts';
import { escapeSpeed } from '../../src/sim/kepler.ts';
import { SECONDS_PER_TICK } from '../../src/sim/units.ts';
import { BODY, FLOOR, corpus, diveSeconds, fly, percentile, placed, scaled } from './swing.ts';

const PRESSES = corpus(400);
const SWUNG = PRESSES.map((g) => fly(g, 300));
const FROZEN = SWUNG.filter((s) => s.diveTicks !== null);

/** How fast a release drawn from anywhere in the hold would have left. */
const EXITS = SWUNG.flatMap((s) => s.taken.filter((t) => t.since <= 160).map((t) => t.exit));

describe('the corpus itself', () => {
  it('is presses the game would actually see', () => {
    expect(PRESSES.length).toBe(400);
    expect(
      percentile(
        PRESSES.map((g) => g.grabDistance),
        50,
      ),
    ).toBeGreaterThan(120);
    expect(
      percentile(
        PRESSES.map((g) => g.grabDistance),
        50,
      ),
    ).toBeLessThan(190);
    expect(
      percentile(
        PRESSES.map((g) => g.approachSpeed),
        50,
      ),
    ).toBeGreaterThan(280);
    expect(
      percentile(
        PRESSES.map((g) => g.approachSpeed),
        50,
      ),
    ).toBeLessThan(350);
  });

  /**
   * A check on the corpus rather than on the simulation, and the reason to trust
   * the rest of this file at all: spec 01 §13.2 records that **52% of real
   * planet grabs already begin as flybys** — unbound at the press. A corpus
   * built from the right marginals should be in that country, and this one is
   * high by twenty points, because grab distance and approach speed are drawn
   * independently here and a real player's are not.
   */
  it('begins mostly as flybys, as real play does', () => {
    const unbound = PRESSES.filter(
      (g) => energyAt(BODY.mass, scaled(g.grabDistance), scaled(g.approachSpeed)) > 0,
    );
    expect(unbound.length / PRESSES.length).toBeGreaterThan(0.4);
    expect(unbound.length / PRESSES.length).toBeLessThan(0.85);
  });

  it('is answered by the grab almost every time', () => {
    const refused = SWUNG.filter((s) => !s.grabbed);
    expect(refused.length / SWUNG.length).toBeLessThan(0.05);
  });
});

describe('§4 · how often a grab has to rescue the path it caught', () => {
  /**
   * *"Clearance fires on 50 – 60% of real grabs."* Measured 54%.
   *
   * The aim distribution is the assumed input here and the answer depends on it,
   * so this is the least load-bearing assertion in the file — but it is drawn
   * uniform rather than fitted, and it lands two points from the measurement,
   * which is worth something.
   */
  it('fires on half to three fifths of them', () => {
    const fired = SWUNG.filter((s) => s.lifted).length / SWUNG.length;
    expect(fired, `fired on ${(fired * 100).toFixed(0)}%`).toBeGreaterThan(0.5);
    expect(fired, `fired on ${(fired * 100).toFixed(0)}%`).toBeLessThan(0.6);
  });
});

describe('§5 · where a dive ends up', () => {
  it('ends most dives on or near the floor', () => {
    const radii = FROZEN.map((s) => s.closest / FLOOR);
    expect(percentile(radii, 50)).toBeLessThan(1.2);
    expect(percentile(radii, 25)).toBeLessThan(1.05);
  });

  /**
   * *"The dive normalises speed."* Real play measured the ratio of frozen speed
   * to approach speed at p50 **1.51**, p05 0.99, p95 4.18.
   *
   * The stand-in lands lower — and the reason is a defect in the corpus rather
   * than in the swing, worth stating because it is the clearest example of what
   * this file cannot yet do. A gain of 4.18 needs an approach around 100 units/s;
   * the corpus's speeds are drawn from §8's *exit* distribution, whose p05 is
   * 195, so it contains no approach slow enough to be accelerated four-fold.
   * Real play evidently did — which means a run's speeds are not simply the
   * previous release's, and braked grabs and the slow start of a run both feed
   * back in. What the mechanism itself does with a seven-fold spread of
   * approaches is asserted in [`freeze.test.ts`](./freeze.test.ts), where it does
   * not depend on a distribution at all.
   */
  it('accelerates a slow approach and barely touches a fast one', () => {
    const gain = FROZEN.map((s) => ({
      approach: s.approachSpeed,
      ratio: s.speedAtFreeze / scaled(s.approachSpeed),
    }));
    const slow = gain.filter((g) => g.approach < 260).map((g) => g.ratio);
    const fast = gain.filter((g) => g.approach > 350).map((g) => g.ratio);
    expect(percentile(slow, 50)).toBeGreaterThan(percentile(fast, 50) * 1.2);
    expect(
      percentile(
        gain.map((g) => g.ratio),
        50,
      ),
    ).toBeGreaterThan(1.1);
  });

  /**
   * And the arrival is a narrow band whatever came in. Real play: p05 217,
   * p50 406, p95 459 prototype units, against escape speed at the floor.
   */
  it('arrives in a narrow band of speeds', () => {
    const speeds = FROZEN.map((s) => s.speedAtFreeze / escapeSpeed(BODY.mass, s.closest));
    expect(percentile(speeds, 5)).toBeGreaterThan(0.6);
    expect(percentile(speeds, 95)).toBeLessThan(1.0);
  });

  /** *"Median dive 0.30 – 0.55s, p95 below 2.6s"* — real play measured 0.42s and 2.13s. */
  it('takes about four tenths of a second, and rarely more than two', () => {
    const seconds = FROZEN.map((s) => diveSeconds(s)!);
    const p50 = percentile(seconds, 50);
    expect(p50, `p50 is ${p50.toFixed(2)}s`).toBeGreaterThan(0.3);
    expect(p50, `p50 is ${p50.toFixed(2)}s`).toBeLessThan(0.55);
    expect(percentile(seconds, 95)).toBeLessThan(2.6);
  });
});

describe('§7 · what the boost is worth over a corpus', () => {
  /**
   * *"Real-play full boost: p05 0, p25 38, p50 59, p75 60, p95 60 — the cap binds
   * on most swings."* And the tolerance: *"the median maximum is ≥ 0.9 of the
   * largest seen, because the cap binding on most swings is the measured shape
   * and a rewrite where it rarely binds has made a different game."*
   */
  it('pays most swings at or near the top of the range', () => {
    const best = SWUNG.filter((s) => s.taken.length > 0).map((s) =>
      Math.max(0, ...s.taken.map((t) => t.excess)),
    );
    const largest = Math.max(...best);
    const median = percentile(best, 50);
    expect(
      median / largest,
      `median is ${(median / largest).toFixed(2)} of the largest`,
    ).toBeGreaterThan(0.9);
    // And some pay nothing at all, so it is a range and not a constant.
    expect(percentile(best, 5)).toBe(0);
  });
});

describe('§8 · what a release is worth over a corpus', () => {
  /**
   * *"Over real play, median exit speed inside 280 – 350"* prototype units.
   * Real play measured p50 314. This is the single strongest check in the file:
   * it closes the loop, because the approach speeds the corpus was built from
   * **are** the exit speeds, so a simulation whose releases came out at the
   * wrong speed would not reproduce the distribution it was handed.
   */
  it('leaves at about the speed it arrived at', () => {
    const p50 = percentile(EXITS, 50) / 3;
    expect(p50, `p50 is ${p50.toFixed(0)}`).toBeGreaterThan(280);
    expect(p50, `p50 is ${p50.toFixed(0)}`).toBeLessThan(350);
  });

  /**
   * The escalation is bounded, and this is the mechanism spec 01 §8 credits for
   * it: *"a release that put all of its boost into permanent velocity would
   * compound up the field forever."* Flown as a chain — release, coast, press
   * again at the same geometry — the speed must not run away.
   */
  it('does not compound over a chain of swings', () => {
    let speed = 300;
    const chain: number[] = [];
    for (let swing = 0; swing < 25; swing++) {
      const s = fly({ grabDistance: 200, approachSpeed: speed, aim: 40 }, 200);
      const at = s.taken.find((t) => t.since === 72);
      if (!at) break;
      speed = at.exit / 3;
      chain.push(speed);
    }
    expect(chain.length).toBeGreaterThan(20);
    expect(Math.max(...chain)).toBeLessThan(600);
    // It converges rather than climbing: the last few are on top of each other.
    const tail = chain.slice(-5);
    expect(Math.max(...tail) / Math.min(...tail) - 1).toBeLessThan(0.02);
  });
});

describe('§3 · how often a press is refused', () => {
  /**
   * *"Refusal rate over a comparable corpus of real presses below 5%, with the
   * too-late refusal below 1%."* Real play: 2.5% for range and 0.4% for being
   * too late, over 278 presses. *"A rewrite whose refusal rate is materially
   * higher has made the grab a skill it is not."*
   *
   * Pressed far harder than a player would: every corpus approach is walked in
   * from where it starts, and a press is attempted at **every tick** of the way,
   * rather than once when the player means it.
   */
  it('answers a press from anywhere along the way in', () => {
    let presses = 0;
    let refused = 0;

    for (const g of corpus(300, 555)) {
      const walking = placed(g);
      for (let tick = 0; tick < 60; tick++) {
        if (distance(0, 0, walking.craft.x, walking.craft.y) <= BODY.radius) break;
        const attempt = placed(g);
        Object.assign(attempt.craft, walking.craft);
        presses += 1;
        if (!attemptGrab(attempt)) refused += 1;
        coast(walking.craft, SECONDS_PER_TICK);
      }
    }

    expect(presses).toBeGreaterThan(3000);
    expect(refused / presses, `refused ${((refused / presses) * 100).toFixed(1)}%`).toBeLessThan(
      0.05,
    );
  });

  /**
   * *"With the too-late refusal below 1%."* Measured on 1 press in 278.
   *
   * Read over presses at the distances real play actually pressed at, because
   * that is what the tolerance says — the refusal lives in a shell 32.5 units
   * thick against a p05 grab distance of 92, so a corpus that walks a craft into
   * a body's surface and presses all the way in reports 4.4% and says nothing
   * about the game.
   */
  it('almost never tells a player they were too late', () => {
    let tooLate = 0;
    const presses = corpus(400, 777);
    for (const g of presses) {
      if (!attemptGrab(placed(g))) tooLate += 1;
    }
    expect(
      tooLate / presses.length,
      `${((tooLate / presses.length) * 100).toFixed(2)}%`,
    ).toBeLessThan(0.01);
  });
});
