/**
 * Spec [06 · §3](../../docs/spec/06-awards.md)'s streak, rule by rule, and its
 * own acceptance sentence:
 *
 * > *"The sequence SHARP, SHARP, PERFECT, SHARP yields streak states `SHARP ×1`,
 * > `SHARP ×2`, `PERFECT ×1`, `SHARP ×1`."*
 *
 * The list of things that must **not** move it is longer than the list that
 * must, so most of this file is about those: a miss, a coast, a grab and time
 * itself all leave it exactly where it was.
 */
import { describe, expect, it } from 'vitest';
import {
  NO_STREAK,
  STREAK_CAP,
  STREAK_SHOWN_AT,
  multiplierOf,
  streakOf,
  struckStreak,
} from '../../src/state/streak.ts';
import type { StreakView } from '../../src/state/streak.ts';
import type { Tier } from '../../src/sim/tier.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

const after = (tiers: readonly (Tier | null)[]): StreakView =>
  tiers.reduce<StreakView>((streak, tier) => streakOf(streak, tier, false), NO_STREAK);

describe('spec 06 §3', () => {
  it('yields SHARP ×1, SHARP ×2, PERFECT ×1, SHARP ×1', () => {
    const seen: string[] = [];
    let streak = NO_STREAK;
    for (const tier of ['SHARP', 'SHARP', 'PERFECT', 'SHARP'] as const) {
      streak = streakOf(streak, tier, false);
      seen.push(`${streak.tier} ×${streak.count}`);
    }
    expect(seen).toEqual(['SHARP ×1', 'SHARP ×2', 'PERFECT ×1', 'SHARP ×1']);
  });

  /** *"Per-word: a separate count per tier. `PERFECT ×N` counts consecutive PERFECTs."* */
  it('counts each word on its own', () => {
    expect(after(['PERFECT', 'PERFECT', 'PERFECT'])).toMatchObject({
      tier: 'PERFECT',
      count: 3,
    });
  });

  /** *"A make is a lesser result, and resets any streak above it."* */
  it('is reset by a make', () => {
    expect(after(['PERFECT', 'PERFECT', 'MAKE'])).toMatchObject({ tier: 'MAKE', count: 1 });
  });

  /**
   * *"A PERFECT does not break a SHARP streak — it upgrades it, ending the SHARP
   * count and opening `PERFECT ×1`."* Which is the same arithmetic as the rule
   * above, seen from the other side.
   */
  it('is upgraded rather than broken by a better word', () => {
    expect(after(['SHARP', 'SHARP', 'PERFECT'])).toMatchObject({ tier: 'PERFECT', count: 1 });
  });

  /**
   * *"A miss is not a graded release. It does not change the streak"*
   * (ADR-0008). A `null` tier is what a miss arrives as.
   */
  it('is untouched by a miss', () => {
    const before = after(['SHARP', 'SHARP']);
    expect(streakOf(before, null, false)).toBe(before);
    expect(after(['SHARP', null, null, 'SHARP'])).toMatchObject({ tier: 'SHARP', count: 2 });
  });

  /**
   * *"No timer: coasting between grabs cannot expire a streak."* There is no
   * clock in `streakOf` at all, which is the strongest form of that rule — this
   * asserts that ten thousand un-graded ticks change nothing.
   */
  it('cannot expire on a clock', () => {
    let streak = after(['PERFECT', 'PERFECT']);
    for (let tick = 0; tick < 10_000; tick++) streak = streakOf(streak, null, false);
    expect(streak).toMatchObject({ tier: 'PERFECT', count: 2 });
  });

  /** *"Death ends every streak."* */
  it('is ended by death', () => {
    expect(streakOf(after(['PERFECT', 'PERFECT']), null, true)).toEqual(NO_STREAK);
  });

  /** *"First display: `×N` appears at the second occurrence."* */
  it('is not shown until the second occurrence', () => {
    expect(after(['SHARP']).shown).toBe(false);
    expect(after(['SHARP', 'SHARP']).shown).toBe(true);
    expect(STREAK_SHOWN_AT).toBe(2);
  });

  /**
   * *"Multiplier: +10% per step, where step = `N − 1`, capped at 5 steps. So
   * `×1` → ×1.0, `×3` → ×1.2, `×6` and above → ×1.5."* All three of the spec's
   * own worked values, and the cap held above it.
   */
  it('prices at +10% a step, capped at five', () => {
    expect(multiplierOf(1)).toBeCloseTo(1.0, 10);
    expect(multiplierOf(3)).toBeCloseTo(1.2, 10);
    expect(multiplierOf(6)).toBeCloseTo(1.5, 10);
    expect(multiplierOf(60)).toBeCloseTo(1.5, 10);
    expect(multiplierOf(STREAK_CAP + 1)).toBeCloseTo(1.5, 10);
  });

  /**
   * The count goes on rising after the price stops — spec
   * [10](../../docs/spec/10-results.md) posts the longest PERFECT streak as a
   * stat, so a cap on the multiplier must not be a cap on the counter.
   */
  it('goes on counting above the cap', () => {
    let streak = NO_STREAK;
    for (let n = 0; n < 12; n++) streak = struckStreak(streak, 'PERFECT');
    expect(streak.count).toBe(12);
    expect(streak.multiplier).toBeCloseTo(1.5, 10);
  });
});

describe('the shipped run', () => {
  const RUN = pricedRun(shippedRecipe());

  /**
   * The picture and the price agree about the streak, because there is one
   * counter: the multiplier the ledger charges is `view.streak.multiplier` and
   * nothing recomputes it.
   */
  it('never shows a multiplier the ladder cannot produce', () => {
    for (const view of RUN.views) {
      expect(view.streak.multiplier).toBe(multiplierOf(view.streak.count));
      expect(view.streak.shown).toBe(view.streak.count >= STREAK_SHOWN_AT);
      if (view.streak.tier === null) expect(view.streak.count).toBe(0);
    }
  });

  /** And it actually strikes one, or every claim above is about a run that never graded. */
  it('reaches a second occurrence', () => {
    expect(RUN.views.some((view) => view.streak.shown)).toBe(true);
  });
});
