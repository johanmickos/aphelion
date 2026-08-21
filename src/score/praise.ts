/**
 * The word a release earns.
 *
 * WHY THE THRESHOLDS ARE THESE NUMBERS
 *
 * They are percentiles of real play, not round numbers. Every scored release in
 * `diagnostics/` was replayed and measured — 112 of them — and each tier is set
 * where a chosen fraction of those releases would have cleared it:
 *
 *                     tier 1 (top ~25%)   tier 2 (top ~10%)
 *   aim                     0.94                0.98
 *   boost peak              0.44                0.52
 *   grab clearance         <=59px              <=48px
 *
 * Round numbers would have been worse than useless here. Gated at a plausible
 * 0.90, the boost-peak word would have fired zero times in 112 releases — the
 * best release on record peaked at 0.80 and the median at 0.32 — so a third of
 * this feature would have been invisible while looking implemented. Praise has to
 * mean "better than you usually manage", and only measurement knows what that is.
 *
 * Revisit these when the feel changes. They are a snapshot of one player on one
 * build, which is the most honest thing they could be and also their expiry date.
 *
 * WHY NOT IN `ScoreConfig`
 *
 * A word costs nothing and pays nothing — it names a release, it does not price
 * one. `test/score.test.ts` requires every key in `ScoreConfig` to change some
 * session's outcome, and it is right to, so a threshold that moves no points does
 * not belong there. Same reasoning as `PASSED_CLEARANCE`.
 */
import { mulberry32 } from '../sim/rng.ts';
import type { ScoreAward } from './types.ts';

/** Which quality earned the word. `super` is two or more at once. */
export type PraiseCategory = 'close' | 'aim' | 'peak' | 'super';

export interface Praise {
  category: PraiseCategory;
  /** 1 for good, 2 for excellent. `super` is always 2. */
  tier: 1 | 2;
  word: string;
}

/**
 * Grab clearance is measured in pixels and smaller is better, so it is compared
 * the other way round from the two 0..1 qualities. Kept as pixels rather than
 * normalised because the thresholds came from measured pixels and should stay
 * legible as such.
 */
export const CLOSE_PX = Object.freeze({ tier1: 59, tier2: 48 });
export const AIM = Object.freeze({ tier1: 0.94, tier2: 0.98 });
export const PEAK = Object.freeze({ tier1: 0.44, tier2: 0.52 });

/**
 * One list per category and tier.
 *
 * Single words, because they are read in peripheral vision next to a moving ship
 * while the player is deciding when to let go of the next one. Two words is a
 * sentence and a sentence is something you stop to read.
 */
export const WORDS: Readonly<
  Record<PraiseCategory, readonly [readonly string[], readonly string[]]>
> = Object.freeze({
  close: [
    ['TIGHT', 'SNUG', 'HUGGED', 'GRAZED'],
    ['THREADED', 'HAIRLINE', 'SHAVED'],
  ],
  aim: [
    ['SHARP', 'KEYED', 'LINED', 'TRUE'],
    ['BULLSEYE', 'PINPOINT', 'NAILED'],
  ],
  peak: [
    ['PUNCHY', 'CRISP', 'SNAPPED'],
    ['PEAKED', 'REDLINE', 'SLINGSHOT'],
  ],
  super: [
    ['SUBLIME', 'MASTERFUL', 'IMMACULATE', 'TEXTBOOK'],
    ['SUBLIME', 'MASTERFUL', 'IMMACULATE', 'TEXTBOOK'],
  ],
});

const ORDINAL: Record<PraiseCategory, number> = { close: 1, aim: 2, peak: 3, super: 4 };

/**
 * Pick a word without a wall clock and without `Math.random`.
 *
 * Seeded from the tick and the category, so the same session always shows the
 * same words — a replay reproduces what the player saw, right down to which
 * synonym came up, and two runs of a test cannot disagree. `Math.random` is
 * banned under `src/score/` for exactly this reason.
 *
 * The seed is avalanched before use. Feeding `mulberry32` a lightly-mixed tick
 * directly is not good enough at this sample size: ticks where links happen are
 * neither random nor evenly spaced, and the first draw after such a seed clumped
 * hard — one word took 14 of 19 slots across the recorded sessions, where an even
 * pick would give about 6. Two rounds of xor-shift-multiply fix it.
 */
function pick(list: readonly string[], tick: number, category: PraiseCategory): string {
  let h = (Math.imul(tick, 0x9e3779b1) ^ Math.imul(ORDINAL[category], 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  const rnd = mulberry32(h);
  return list[Math.floor(rnd() * list.length)] ?? list[0]!;
}

/** Tier a single quality falls in: 0 none, 1 good, 2 excellent. */
function tierOf(value: number, tier1: number, tier2: number): 0 | 1 | 2 {
  if (tier2 >= tier1) {
    // higher is better
    return value >= tier2 ? 2 : value >= tier1 ? 1 : 0;
  }
  // lower is better (clearance)
  return value <= tier2 ? 2 : value <= tier1 ? 1 : 0;
}

/**
 * The word a link earned, or null for a routine one.
 *
 * Deductions earn nothing: the words are a reward channel, and the readout
 * already says what went wrong.
 */
export function praiseFor(award: ScoreAward): Praise | null {
  if (award.kind !== 'link') return null;

  const tiers = {
    close: tierOf(award.clearance, CLOSE_PX.tier1, CLOSE_PX.tier2),
    aim: tierOf(award.aim, AIM.tier1, AIM.tier2),
    peak: tierOf(award.timing, PEAK.tier1, PEAK.tier2),
  } as const;

  // Two or more qualities at their top tier is the rare one. It has to be rare to
  // be worth anything, which is why it takes tier 2 twice rather than any two
  // tier 1s — those turn up together often enough to be ordinary.
  const excellent = (['close', 'aim', 'peak'] as const).filter((k) => tiers[k] === 2);
  if (excellent.length >= 2) {
    return { category: 'super', tier: 2, word: pick(WORDS.super[0], award.tick, 'super') };
  }

  // Hardest quality first. The boost window is the one almost nobody hits, aim is
  // the one with the widest spread, and a close grab is the most forgiving of the
  // three — so when several fire at once the rarest achievement is the one named.
  for (const category of ['peak', 'aim', 'close'] as const) {
    const tier = tiers[category];
    if (tier === 0) continue;
    return { category, tier, word: pick(WORDS[category][tier - 1]!, award.tick, category) };
  }
  return null;
}
