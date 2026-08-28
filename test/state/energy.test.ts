/**
 * Spec [00 · §3](../../docs/spec/00-tokens.md)'s ordinal channel, and its two
 * acceptance criteria that can be held without a canvas:
 *
 * - *"Bloom radius is a pure function of energy step and chain length; no code
 *   path sets bloom from a hue."*
 * - *"Every ordinal distinction in the game survives converting the frame to
 *   greyscale."* — which for this file means the four steps are strictly
 *   ordered by radius, because radius is the whole of what greyscale keeps.
 *
 * The third, *"at most one E3 is alive on any tick"*, is a statement about a
 * whole run and lives in [`presentation.test.ts`](./presentation.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { SCALE } from '../../src/sim/units.ts';
import {
  bloomOf,
  CHAIN_BLOOM,
  E1_BLOOM,
  E2_BLOOM,
  E3_BLOOM,
  E3_TICKS,
} from '../../src/state/energy.ts';
import type { Energy } from '../../src/state/types.ts';

const STEPS: readonly Energy[] = [0, 1, 2, 3];

describe('the four steps', () => {
  /**
   * The board's numbers, in the space the game is drawn in. The conversion is
   * the ×3 the author confirmed on 2026-08-27 arriving from the other side: the
   * boards frame the game at phone size and the design space is a phone at three
   * device pixels to the point (ADR-0010).
   */
  it('are spec 00 §3 read into design units', () => {
    expect(E1_BLOOM).toBe(6 * SCALE);
    expect(E2_BLOOM).toBe(18 * SCALE);
    expect(E3_BLOOM).toBe(48 * SCALE);
    expect(CHAIN_BLOOM).toBe(4 * SCALE);
    expect(E3_TICKS).toBe(24);
  });

  it('has no bloom at E0 and grows with every step after it', () => {
    const radii = STEPS.map((step) => bloomOf(step));
    expect(radii[0]).toBe(0);
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
  });

  /**
   * The reading that decides whether these numbers are usable at all: taken as
   * raw design units, E2's 18 would be a glow narrower than the craft it is the
   * halo of. The dart is 45 design units nose to tail.
   */
  it('gives the craft a glow larger than the craft', () => {
    expect(bloomOf(2)).toBeGreaterThan(45);
  });
});

describe('the chain', () => {
  it('adds one step of radius per link, and nothing else', () => {
    expect(bloomOf(2, 0)).toBe(E2_BLOOM);
    expect(bloomOf(2, 1)).toBe(E2_BLOOM + CHAIN_BLOOM);
    expect(bloomOf(2, 7)).toBe(E2_BLOOM + 7 * CHAIN_BLOOM);
  });

  /** A chain cannot light structure: E0 is *no bloom*, however long the run has been. */
  it('leaves E0 dark however long it runs', () => {
    for (const chain of [0, 1, 12, 100]) expect(bloomOf(0, chain)).toBe(0);
  });

  /**
   * And the acceptance criterion stated as a signature: `(step, chain)` is the
   * whole of the input, so there is no hue in it to set a radius from — which is
   * the strongest form the rule can take.
   */
  it('is a pure function of its arguments', () => {
    expect(bloomOf(2, 3)).toBe(bloomOf(2, 3));
    expect(bloomOf(3)).toBe(bloomOf(3, 0));
  });
});
