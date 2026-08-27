/**
 * The trigonometry the simulation owns
 * ([ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)).
 *
 * The half of that decision this file can hold is **accuracy**: that computing
 * our own cost nothing worth having. The other half — that two engines agree to
 * the bit — needs two engines, and is a manual measurement recorded in the ADR.
 * The two are separable on purpose: if the accuracy here ever regresses, the
 * cross-engine property is worthless, so this is the test that has to run every
 * time.
 *
 * `Math.sin` is used as the reference **in this file only**, and legitimately:
 * V8's is accurate to under one ulp, so agreement with it to 1e-15 relative is a
 * bound on our own error rather than a claim that we match it.
 */
import { describe, expect, it } from 'vitest';
import { angleOf, cos, sin } from '../../src/sim/trig.ts';

/** An orbit clock's accumulated phase, either sign, over a long swing. */
function angles(count: number): number[] {
  const out: number[] = [];
  let s = 12345;
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out.push((s / 4294967296 - 0.5) * 400);
  }
  return out;
}

describe('sin and cos', () => {
  it('agree with the engine to within 1e-15 over the range an orbit clock reaches', () => {
    let worstSin = 0;
    let worstCos = 0;
    for (const x of angles(20_000)) {
      worstSin = Math.max(worstSin, Math.abs(sin(x) - Math.sin(x)));
      worstCos = Math.max(worstCos, Math.abs(cos(x) - Math.cos(x)));
    }
    expect(worstSin).toBeLessThan(1e-15);
    expect(worstCos).toBeLessThan(1e-15);
  });

  /**
   * Identities rather than a reference, because these hold for the true
   * functions and therefore for any implementation that deserves the names.
   * They are what would catch a range reduction that has quietly broken in a
   * quadrant the sampling above happens to miss.
   */
  it('satisfies sin² + cos² = 1 everywhere', () => {
    for (const x of angles(20_000)) {
      expect(Math.abs(sin(x) * sin(x) + cos(x) * cos(x) - 1)).toBeLessThan(1e-15);
    }
  });

  it('satisfies the shift and reflection identities', () => {
    for (const x of angles(2_000)) {
      expect(Math.abs(cos(x) - sin(x + Math.PI / 2))).toBeLessThan(1e-14);
      expect(Math.abs(sin(-x) + sin(x))).toBeLessThan(1e-15);
      expect(Math.abs(cos(-x) - cos(x))).toBeLessThan(1e-15);
    }
  });

  it('is exact at zero', () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
  });
});

describe('angleOf', () => {
  it('agrees with the engine to within 1e-15 across the field', () => {
    let worst = 0;
    let s = 999;
    const draw = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s / 4294967296 - 0.5) * 2e4;
    };
    for (let i = 0; i < 20_000; i++) {
      const x = draw();
      const y = draw();
      worst = Math.max(worst, Math.abs(angleOf(x, y) - Math.atan2(y, x)));
    }
    expect(worst).toBeLessThan(1e-15);
  });

  it('takes its arguments x first, unlike Math.atan2', () => {
    // The bug this ordering exists to prevent, stated as a test: if the
    // arguments were ever swapped back, these two would trade places.
    expect(angleOf(1, 0)).toBe(0);
    expect(angleOf(0, 1)).toBeCloseTo(Math.PI / 2, 15);
  });

  it('covers all four quadrants and the axes', () => {
    const eighth = Math.PI / 4;
    expect(angleOf(1, 1)).toBeCloseTo(eighth, 15);
    expect(angleOf(-1, 1)).toBeCloseTo(3 * eighth, 15);
    expect(angleOf(-1, -1)).toBeCloseTo(-3 * eighth, 15);
    expect(angleOf(1, -1)).toBeCloseTo(-eighth, 15);
    expect(angleOf(-1, 0)).toBe(Math.PI);
    expect(angleOf(0, 1)).toBeCloseTo(2 * eighth, 15);
    expect(angleOf(0, -1)).toBeCloseTo(-2 * eighth, 15);
  });

  /**
   * The sign of a zero is not a curiosity here: a snapshot writes a float64
   * whole, so `-0` and `0` are different bytes and a run that produced one where
   * the other was expected has genuinely diverged.
   */
  it('keeps the sign of a zero, on both sides of the origin', () => {
    expect(Object.is(angleOf(1, 0), 0)).toBe(true);
    expect(Object.is(angleOf(1, -0), -0)).toBe(true);
    expect(angleOf(-1, 0)).toBe(Math.PI);
    expect(angleOf(-1, -0)).toBe(-Math.PI);
  });

  it('is round-trippable through sin and cos', () => {
    let s = 4242;
    const draw = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s / 4294967296 - 0.5) * 2e4;
    };
    for (let i = 0; i < 5_000; i++) {
      const x = draw();
      const y = draw();
      const r = Math.sqrt(x * x + y * y);
      const a = angleOf(x, y);
      expect(Math.abs(r * cos(a) - x)).toBeLessThan(1e-9);
      expect(Math.abs(r * sin(a) - y)).toBeLessThan(1e-9);
    }
  });
});

describe('the whole point of owning it', () => {
  /**
   * Determinism is not a property a single-engine test can observe, so what is
   * asserted here is the property that *implies* it: the implementation reaches
   * for nothing an engine is free to approximate. `pnpm portable` enforces the
   * same rule on every file in `src/sim/`; this states it about the one file
   * that would be most tempting to write with `Math` instead.
   */
  it('is written without a single implementation-approximated call', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../../src/sim/trig.ts', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const banned of ['Math.sin', 'Math.cos', 'Math.atan', 'Math.pow', 'Math.hypot', '**']) {
      expect(code, `${banned} must not appear in trig.ts`).not.toContain(banned);
    }
    // What it is allowed, and does use. `Math.round` is specified exactly by
    // ECMA-262 — it is the one call in the file, and it is the one that decides
    // which quadrant an angle was reduced from.
    expect(code).toContain('Math.round');
  });
});
