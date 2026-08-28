/**
 * Spec [01 · §7](../../docs/spec/01-swing.md): the boost envelope.
 *
 * *"The boost is not a variable to be inspected; it is **how much faster a
 * release leaves than the orbit it left from**."* Every assertion here is read
 * off that curve — the same swing released at successive ticks, each release
 * measured against the orbital speed at its own release radius — because spec 01
 * §7 says so and because **a test that reads a boost variable is written wrong**
 * ([ADR-0013](../../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
 */
import { describe, expect, it } from 'vitest';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  SECONDS_PER_TICK,
} from '../../src/sim/units.ts';
import type { Swung } from './swing.ts';
import { ENVELOPE, FLOOR, fly, geometry, scaled } from './swing.ts';

/** A deep swing, so the envelope is worth something at every point on it. */
const DEEP = fly(geometry(200, 150, 20), 300);

/** How much faster a release at `since` leaves than the orbit it left from. */
function excessAt(s: Swung, since: number): number {
  return s.taken.find((t) => t.since === since)?.excess ?? Number.NaN;
}

describe('the shape of the envelope', () => {
  it('pays exactly nothing for a release at the freeze', () => {
    expect(excessAt(DEEP, 0)).toBe(0);
  });

  /**
   * *"The ramp is the footgun's safety catch. A reflexive tap-through earns
   * almost nothing; you must hold a moment to arm it ... and it is not
   * negotiable."*
   */
  it('reaches its maximum 0.45s after the freeze', () => {
    const peak = Math.max(...DEEP.taken.map((t) => t.excess));
    const first = DEEP.taken.find((t) => t.excess >= peak * (1 - 1e-12))!;
    expect(first.since * SECONDS_PER_TICK).toBeGreaterThan(0.4);
    expect(first.since * SECONDS_PER_TICK).toBeLessThan(0.5);
    expect(BOOST_ARM_TICKS * SECONDS_PER_TICK).toBeCloseTo(0.45, 10);
  });

  /**
   * *"The plateau exists because completing a circularisation used to guarantee
   * missing the window it was meant to reward."* It ends where the settle does.
   */
  it('holds within 1% of that maximum until 1.2s', () => {
    const peak = Math.max(...DEEP.taken.map((t) => t.excess));
    const held = DEEP.taken.filter((t) => t.excess >= peak * 0.99);
    const last = held[held.length - 1]!;
    expect(last.since * SECONDS_PER_TICK).toBeGreaterThan(1.1);
    expect(last.since * SECONDS_PER_TICK).toBeLessThan(1.3);
    for (let since = BOOST_ARM_TICKS; since <= BOOST_PLATEAU_TICKS; since++) {
      expect(excessAt(DEEP, since), `at tick ${since}`).toBeGreaterThanOrEqual(peak * 0.99);
    }
  });

  it('reaches nothing again 2.6s after the freeze', () => {
    const zero = DEEP.taken.find((t) => t.since > BOOST_PLATEAU_TICKS && t.excess <= 0)!;
    expect(zero.since * SECONDS_PER_TICK).toBeGreaterThan(2.45);
    expect(zero.since * SECONDS_PER_TICK).toBeLessThan(2.75);
    expect(excessAt(DEEP, BOOST_ZERO_TICKS)).toBe(0);
    expect(excessAt(DEEP, BOOST_ZERO_TICKS + 60)).toBe(0);
  });

  /** Exact, both halves: *"monotone non-decreasing before the plateau and non-increasing after it."* */
  it('only ever climbs before the plateau and only ever falls after it', () => {
    for (const g of [geometry(200, 150, 20), geometry(300, 250, 60), geometry(120, 90, 0)]) {
      const s = fly(g, 300);
      const where = `${g.grabDistance}/${g.approachSpeed}/${g.aim}`;
      for (let i = 1; i < s.taken.length; i++) {
        const previous = s.taken[i - 1]!;
        const now = s.taken[i]!;
        if (now.since <= BOOST_ARM_TICKS) {
          expect(now.excess, `${where}, up to tick ${now.since}`).toBeGreaterThanOrEqual(
            previous.excess - 1e-9,
          );
        }
        if (previous.since >= BOOST_PLATEAU_TICKS) {
          expect(now.excess, `${where}, past tick ${now.since}`).toBeLessThanOrEqual(
            previous.excess + 1e-9,
          );
        }
      }
    }
  });
});

describe('what a dive has to commit to be paid at all', () => {
  /**
   * *"A dive pays only if it halves the gap. A depth of ½ means, exactly:
   * `periapsis < (grab radius + floor) / 2`. Committing halfway to the floor is
   * the price of admission."*
   */
  it('starts paying exactly where the dive has halved the gap to the floor', () => {
    const grabDistance = 200;
    const grabRadius = scaled(grabDistance);
    const predicted = (grabRadius + FLOOR) / 2;

    let widest: Swung | null = null;
    for (let aim = 0; aim <= grabDistance; aim += 0.25) {
      const s = fly(geometry(grabDistance, 150, aim), 200);
      if (Math.max(0, ...s.taken.map((t) => t.excess)) > 0) widest = s;
      else if (widest) break;
    }
    expect(widest).not.toBeNull();
    expect(Math.abs(widest!.closest / predicted - 1)).toBeLessThan(0.03);
  });

  it('pays a deeper dive more than a shallower one', () => {
    const paid = [140, 155, 165, 175].map((aim) => {
      const s = fly(geometry(200, 150, aim), 200);
      return { aim, depth: s.depth, peak: Math.max(0, ...s.taken.map((t) => t.excess)) };
    });
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]!.depth, `aim ${paid[i]!.aim}`).toBeLessThan(paid[i - 1]!.depth);
      expect(paid[i]!.peak, `aim ${paid[i]!.aim}`).toBeLessThan(paid[i - 1]!.peak);
    }
    expect(paid[paid.length - 1]!.peak).toBeGreaterThan(0);
  });

  /**
   * And every dive that reaches the floor is paid the same, whatever it was
   * aimed at: full depth is full depth. This is what makes the payment a
   * function of commitment rather than of accuracy.
   */
  it('pays every dive that reaches the floor alike', () => {
    const paid = [0, 60, 100, 130].map((aim) => {
      const s = fly(geometry(200, 150, aim), 200);
      expect(s.closest / FLOOR, `aim ${aim}`).toBeLessThan(1.01);
      return Math.max(0, ...s.taken.map((t) => t.excess));
    });
    expect(Math.max(...paid) / Math.min(...paid) - 1).toBeLessThan(0.01);
  });

  /**
   * *"Depth is depth, not aim."* Two dives that commit equally far are paid
   * equally, whichever side they came round and whatever they were pointing at
   * when they pressed. The prototype's own design document claimed the opposite
   * and that mechanic was never implemented — *"so this is a place where the
   * document and the program disagreed, and the program is the evidence."*
   */
  it('pays the same for the same depth from either side', () => {
    const left = fly(geometry(200, 150, 60), 200);
    const mirrored = fly(geometry(200, 150, -60), 200);
    expect(Math.abs(left.depth / mirrored.depth - 1)).toBeLessThan(1e-9);
    const peak = (s: Swung): number => Math.max(0, ...s.taken.map((t) => t.excess));
    expect(Math.abs(peak(left) / peak(mirrored) - 1)).toBeLessThan(1e-9);
  });

  /** And a dive that never halves the gap is paid nothing at all, not a little. */
  it('pays a shallow dive nothing rather than a little', () => {
    const shallow = fly(geometry(350, 400, 300), 240);
    expect(shallow.depth).toBeLessThan(0.5);
    expect(Math.max(0, ...shallow.taken.map((t) => t.excess))).toBe(0);
  });
});

describe('over the whole envelope', () => {
  it('never pays more than the peak, and never pays a negative', () => {
    for (const g of ENVELOPE) {
      const s = fly(g, 240);
      const where = `${g.grabDistance}/${g.approachSpeed}/${g.aim}`;
      for (const t of s.taken) {
        expect(t.excess, `${where} at tick ${t.since}`).toBeGreaterThanOrEqual(0);
      }
      // The cap on depth is the floor, so nothing can be paid past full depth.
      expect(s.depth, where).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
