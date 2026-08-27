/**
 * The seeded stream. ADR-0004: *"a run is fully described by its configuration,
 * its seed and its input log"*, so a draw that did not come from the seed is a
 * run that cannot be replayed.
 */
import { describe, expect, it } from 'vitest';
import { cloneRng, nextBelow, nextFraction, seedRng } from '../../src/sim/rng.ts';

const drawMany = (seed: number, count: number): number[] => {
  const state = seedRng(seed);
  return Array.from({ length: count }, () => nextFraction(state));
};

describe('the seeded stream', () => {
  it('gives the same sequence for the same seed', () => {
    expect(drawMany(2026, 200)).toEqual(drawMany(2026, 200));
  });

  it('gives a different sequence for a neighbouring seed', () => {
    expect(drawMany(2026, 20)).not.toEqual(drawMany(2027, 20));
  });

  /**
   * Neighbouring seeds matter more than they look: spec
   * [17 · §2](../../docs/spec/17-daily-field.md) derives the daily seed from the
   * date, so consecutive days are consecutive seeds. A generator whose first
   * draws track the seed would make yesterday's field a near-copy of today's.
   */
  it('decorrelates neighbouring seeds from the very first draw', () => {
    const first = Array.from({ length: 64 }, (_, i) => drawMany(1000 + i, 1)[0]!);
    const sorted = [...first].sort((a, b) => a - b);
    // If the first draw tracked the seed, these would come out already sorted.
    expect(first).not.toEqual(sorted);
    // And they should still fill the interval rather than clustering.
    expect(Math.min(...first)).toBeLessThan(0.1);
    expect(Math.max(...first)).toBeGreaterThan(0.9);
  });

  it('stays inside [0, 1)', () => {
    const state = seedRng(5);
    for (let i = 0; i < 200_000; i++) {
      const v = nextFraction(state);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is flat enough to place a field with', () => {
    const state = seedRng(77);
    const buckets = new Array<number>(20).fill(0);
    const n = 400_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(nextFraction(state) * 20)]! += 1;
    for (const count of buckets) expect(Math.abs(count / (n / 20) - 1)).toBeLessThan(0.02);
  });

  /**
   * Modulo bias is not cosmetic here. Spec 17 §5 rejects and regenerates whole
   * days from the next value of the seed stream, so a biased draw would bias
   * which days exist at all — quietly, and forever.
   */
  it('draws bounded integers without modulo bias', () => {
    const state = seedRng(13);
    const bound = 7;
    const buckets = new Array<number>(bound).fill(0);
    const n = 700_000;
    for (let i = 0; i < n; i++) buckets[nextBelow(state, bound)]! += 1;
    for (const count of buckets) expect(Math.abs(count / (n / bound) - 1)).toBeLessThan(0.02);
  });

  it('can be copied and advanced without disturbing the original', () => {
    const state = seedRng(9);
    const copy = cloneRng(state);
    for (let i = 0; i < 50; i++) nextFraction(copy);
    expect(nextFraction(state)).toBe(nextFraction(seedRng(9)));
  });
});
