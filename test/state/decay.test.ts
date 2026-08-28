/**
 * The shape every decaying thing in the design shares
 * ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)).
 *
 * The reason it is worth its own test file rather than being checked through the
 * things that use it: the curves carry claims that are stated in prose in
 * [`decay.ts`](../../src/state/decay.ts) — *"a rebound of a tenth"*, *"58% of
 * the way home"* — and a sentence with no test under it is a sentence that
 * quietly stops being true when a constant moves. These are the sentences.
 */
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_TICK } from '../../src/sim/units.ts';
import type { Decay } from '../../src/state/decay.ts';
import {
  advance,
  easeStep,
  fade,
  home,
  OVERSHOOT_FROM,
  place,
  progress,
  ticksIn,
} from '../../src/state/decay.ts';

/** Every tick of a decay's life, in order. */
function lifetime(span: number): Decay[] {
  const out: Decay[] = [];
  let decay = place(span);
  for (;;) {
    out.push(decay);
    const next = advance(decay);
    if (next === null) return out;
    decay = next;
  }
}

describe('a duration in milliseconds', () => {
  it('becomes a whole number of ticks', () => {
    expect(ticksIn(400)).toBe(24);
    expect(ticksIn(180)).toBe(11);
    expect(ticksIn(120)).toBe(7);
    expect(ticksIn(420)).toBe(25);
  });

  /**
   * A duration that is not a whole number of ticks is one the game cannot land
   * on, so rounding here is the honest form and the residual is stated rather
   * than hidden: spec 02's 180ms is 10.8 ticks and becomes 11, which is 183ms.
   */
  it('rounds rather than truncating, and the residual is small', () => {
    expect(ticksIn(180) * SECONDS_PER_TICK * 1000).toBeCloseTo(183.3, 1);
    expect(ticksIn(1)).toBe(0);
  });
});

describe('a decay', () => {
  it('arrives at full size and lasts exactly its span', () => {
    const life = lifetime(24);
    expect(life.length).toBe(24);
    expect(life[0]).toEqual({ age: 0, span: 24 });
    expect(life.at(-1)).toEqual({ age: 23, span: 24 });
    expect(advance(life.at(-1)!)).toBeNull();
  });

  /**
   * The property the whole representation exists for: a thing that is over is
   * **absent**, not very small. Spec [00 · §5](../../docs/spec/00-tokens.md)'s
   * *"nothing persists past 600ms except the trail"* is a statement a `null` can
   * satisfy and a float cannot.
   */
  it('ends rather than becoming small', () => {
    expect(advance(null)).toBeNull();
    expect(advance({ age: 23, span: 24 })).toBeNull();
  });

  it('reports how far through it is, from nothing at the moment it arrives', () => {
    expect(progress(place(24))).toBe(0);
    expect(progress({ age: 12, span: 24 })).toBe(0.5);
  });
});

describe('the fall to nothing', () => {
  it('is whole when it arrives and gone when it ends', () => {
    expect(fade(place(24))).toBe(1);
    expect(fade({ age: 24, span: 24 })).toBe(0);
  });

  /** Fastest at the start and slowing to nothing — the half of "exponential" that survives. */
  it('falls fastest at the start', () => {
    const life = lifetime(24).map(fade);
    const steps = life.slice(1).map((value, i) => life[i]! - value);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThan(steps[i - 1]!);
    expect(fade({ age: 12, span: 24 })).toBe(0.25);
  });

  it('never comes back up, and never goes past nothing', () => {
    for (const decay of lifetime(24)) {
      expect(fade(decay)).toBeGreaterThan(0);
      expect(fade(decay)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the return home', () => {
  it('is whole when it arrives and gone when it ends', () => {
    expect(home(place(11))).toBe(1);
    expect(Math.abs(home({ age: 11, span: 11 }))).toBe(0);
  });

  /**
   * **Exactly one overshoot** — spec [02 · §5](../../docs/spec/02-release.md)
   * and [02 · §4](../../docs/spec/02-release.md) both ask for one, and one is a
   * statement about sign changes rather than about a curve's name.
   */
  it('passes rest exactly once', () => {
    const signs: number[] = [];
    for (let i = 0; i <= 1000; i++) {
      const value = home({ age: i, span: 1000 });
      if (value !== 0) signs.push(Math.sign(value));
    }
    expect(signs.filter((sign, i) => i > 0 && sign !== signs[i - 1]).length).toBe(1);
  });

  /**
   * And the two numbers [`decay.ts`](../../src/state/decay.ts) claims in prose,
   * both read off spec 02 §4's own keyframes: it crosses rest at `OVERSHOOT_FROM`,
   * rebounds a **tenth** of the displacement, and is deepest **58%** of the way
   * home.
   */
  it('rebounds a tenth of the way, 58% of the way home', () => {
    const span = 10_000;
    const values: number[] = [];
    for (let i = 0; i < span; i++) values.push(home({ age: i, span }));
    const deepest = Math.min(...values);
    const at = values.indexOf(deepest) / span;

    expect(deepest).toBeCloseTo(-0.1, 3);
    expect(at).toBeCloseTo(0.58, 2);
    expect(home({ age: Math.round(span * OVERSHOOT_FROM), span })).toBeCloseTo(0, 4);
  });

  /** It arrives at rest rather than stopping there: no step at the last tick. */
  it('settles rather than stopping', () => {
    const span = 10_000;
    const last = home({ age: span - 1, span });
    expect(Math.abs(last)).toBeLessThan(1e-6);
  });
});

describe('the ease', () => {
  it('closes the same fraction of whatever gap it is given', () => {
    expect(easeStep(3)).toBeCloseTo(0.05, 12);
    expect(easeStep(60)).toBe(1);
  });

  /**
   * ADR-0015's third rule, as arithmetic: a rate past one tick's worth would
   * overshoot into an oscillation that never sheds a disagreement, so it is
   * clamped and arrives instead.
   */
  it('arrives rather than oscillating, however fast it is asked to go', () => {
    for (const rate of [60, 120, 1000]) expect(easeStep(rate)).toBe(1);
  });
});
