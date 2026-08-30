/**
 * The arithmetic the simulation owns that is not trigonometry
 * ([ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)).
 */
import { describe, expect, it } from 'vitest';
import { distance, exp, magnitude, power } from '../../src/sim/math.ts';

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

/**
 * The exponential [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)
 * banned before anything needed it, and spec 05 §3 needed twice over.
 *
 * The determinism it exists for cannot be tested from one engine — that
 * measurement is in `math.ts`'s own header, taken against JavaScriptCore, and it
 * is what the ADR's table records. What a single-engine suite **can** hold is
 * everything that would have to be true for that measurement to keep meaning
 * something: that the value is right, that the reduction is exact at the joins,
 * and that the domain is refused rather than approximated.
 */
describe('an exponential the simulation owns', () => {
  it('is right where the answer is known exactly', () => {
    expect(exp(0)).toBe(1);
    expect(exp(1)).toBeCloseTo(Math.E, 14);
    expect(exp(-1)).toBeCloseTo(1 / Math.E, 15);
  });

  /**
   * Within an ulp of the engine's own across the whole domain, which is what
   * makes the ban free rather than a compromise — the same claim
   * [`trig.ts`](../../src/sim/trig.ts) makes and for the same reason.
   */
  it('agrees with Math.exp to within an ulp across its domain', () => {
    for (let x = -300; x <= 300; x += 0.37) {
      const ours = exp(x);
      const theirs = Math.exp(x);
      expect(Math.abs(ours - theirs) / theirs).toBeLessThan(3e-16);
    }
  });

  /**
   * The reduction splits on multiples of ln 2, so the arguments that land on a
   * join are where a bad split shows first — and they are exactly the arguments
   * a smooth sweep steps over.
   */
  it('is continuous across the joins its own reduction makes', () => {
    for (let k = -20; k <= 20; k++) {
      const at = k * Math.LN2;
      // Either side of the join and on it. A bad split shows up as one of the
      // three landing on the wrong power of two, which is a relative error of a
      // whole factor rather than of an ulp.
      for (const x of [at - 1e-9, at, at + 1e-9]) {
        expect(Math.abs(exp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(3e-16);
      }
    }
  });

  /** Monotone, which every falloff built on it silently assumes. */
  it('never rises as its argument falls', () => {
    let previous = Infinity;
    for (let x = 3; x >= -3; x -= 0.01) {
      const here = exp(x);
      expect(here).toBeLessThan(previous);
      previous = here;
    }
  });

  /**
   * Loud rather than saturating, which is `power`'s own stance above and for the
   * identical reason: a silent fallback here replays on one engine and not
   * another. `NaN` is refused by the same guard, and that is not incidental — it
   * is what caught an unbounded rung index on the first run of `pnpm portable`.
   */
  it('refuses an argument it cannot compute deterministically', () => {
    expect(() => exp(700)).toThrow(/ADR-0014/);
    expect(() => exp(-700)).toThrow(/supported domain/);
    expect(() => exp(NaN)).toThrow(/supported domain/);
  });
});
