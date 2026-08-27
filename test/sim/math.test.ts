/**
 * The arithmetic the simulation owns that is not trigonometry
 * ([ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)).
 */
import { describe, expect, it } from 'vitest';
import { distance, magnitude, power } from '../../src/sim/math.ts';

describe('magnitude', () => {
  it('is exact on the cases that have exact answers', () => {
    expect(magnitude(3, 4)).toBe(5);
    expect(magnitude(0, 0)).toBe(0);
    expect(magnitude(-8, 15)).toBe(17);
  });

  /**
   * `Math.hypot` is used as a reference here and only here. It is banned in
   * `src/sim/` because it varies between engines, not because it is inaccurate —
   * agreeing with it to a part in 10¹⁵ is a bound on our own error.
   */
  it('agrees with the engine across the field', () => {
    let s = 31337;
    const draw = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s / 4294967296 - 0.5) * 2e4;
    };
    for (let i = 0; i < 20_000; i++) {
      const x = draw();
      const y = draw();
      const reference = Math.hypot(x, y);
      expect(Math.abs(magnitude(x, y) - reference) / reference).toBeLessThan(1e-15);
    }
  });

  it('measures distance between two points', () => {
    expect(distance(10, 10, 13, 14)).toBe(5);
  });
});

describe('power', () => {
  it('handles the exponents spec 01 §13.2 names', () => {
    // n = 0 is the prototype; 2 is constant surface gravity; 3 constant density.
    expect(power(1.5, 0)).toBe(1);
    expect(power(1.5, 2)).toBe(2.25);
    expect(power(2, 3)).toBe(8);
  });

  it('handles half exponents exactly, which is why they are supported', () => {
    expect(power(9, 0.5)).toBe(3);
    expect(power(4, 2.5)).toBe(32);
    expect(power(16, 1.5)).toBe(64);
  });

  it('handles negative exponents', () => {
    expect(power(2, -2)).toBe(0.25);
    expect(power(4, -0.5)).toBe(0.5);
  });

  it('agrees with Math.pow closely enough that the ban costs nothing', () => {
    for (const base of [0.5, 0.9, 1, 1.25, 2, 3.7]) {
      for (const exponent of [0, 0.5, 1, 1.5, 2, 2.5, 3, -1, -2]) {
        const ours = power(base, exponent);
        expect(Math.abs(ours - Math.pow(base, exponent)) / Math.max(ours, 1e-12)).toBeLessThan(
          1e-14,
        );
      }
    }
  });

  /**
   * The failure is loud on purpose. A silent fallback to an approximation here
   * would produce a simulation that replays on one engine and not another, which
   * is the exact failure ADR-0014 exists to prevent — and it would look
   * identical in the numbers to a simulation that is simply wrong.
   */
  it('refuses an exponent it cannot compute deterministically', () => {
    expect(() => power(2, 1.3)).toThrow(/whole or half/);
    expect(() => power(2, Math.PI)).toThrow(/ADR-0014/);
  });
});
