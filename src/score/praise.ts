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
 *   boost peak              0.85                0.94
 *   grab clearance         <=59px              <=48px
 *
 * Round numbers would have been worse than useless here. Gated at a plausible
 * 0.90, the boost-peak word would have fired zero times in 112 releases — under
 * the envelope of the day the best release on record peaked at 0.80 and the
 * median at 0.32 — so a third of this feature would have been invisible while
 * looking implemented. Praise has to mean "better than you usually manage", and
 * only measurement knows what that is.
 *
 * BOOST PEAK WAS RE-MEASURED, and the expiry date above is why. It read 0.44 /
 * 0.52 until `boostHoldsThroughSettle` (PORT_NOTES 27) moved the envelope's decay
 * out to the end of the settle, which lifted the median release from 0.21 to 0.71
 * without a player changing anything they did. At the old thresholds the word
 * would have fired on 85% and 79% of releases — the same defect as gating at a
 * round 0.90, inverted: a word that lands on almost every release names nothing.
 *
 * The new numbers come from the 52 links across the three sessions carrying award
 * records, which is a smaller sample than the original 112 and a better one: an
 * award is recorded on the phone, so it survives a replay divergence. Each
 * release's true `boostT` was recovered by inverting its RECORDED `timing`
 * through the old envelope and pushed back through the new one, so no part of it
 * depends on re-simulating a trajectory. 0.85 fires on 25%, 0.94 on 8%.
 *
 * Revisit these when the feel changes. They are a snapshot of one player on one
 * build, which is the most honest thing they could be and also their expiry date.
 *
 * WHY NOT IN `ScoreConfig`
 *
 * A word costs nothing and pays nothing — it names a release, it does not price
 * one. `test/score.test.ts` requires every key in `ScoreConfig` to change some
 * session's outcome, and it is right to, so a threshold that moves no points does
 * not belong there — the same reasoning that keeps `RECKLESS_DEG` out of it.
 */
import { mulberry32 } from '../sim/rng.ts';
import type { ScoreAward } from './types.ts';

/** Which quality earned the word. `super` is two or more at once. */
export type PraiseCategory = 'close' | 'aim' | 'peak' | 'nerve' | 'burn' | 'super';

/**
 * How good it was, on one ladder shared by every category.
 *
 * Separate from the category on purpose. Colour used to encode WHICH quality —
 * six hues plus two states, read in peripheral vision over a moving starfield,
 * which is past what anyone reliably tells apart and which has to be learned
 * before it means anything. Meanwhile the thing a player actually asks — "how
 * good was that?" — had no channel at all beyond a 12px/14px/17px size step you
 * cannot judge without the other size beside it.
 *
 * So the ladder takes the colour, because it is ordinal and a ladder teaches
 * itself, and the category is carried by the word.
 */
export type PraiseLevel = 'good' | 'great' | 'exceptional';

export interface Praise {
  category: PraiseCategory;
  level: PraiseLevel;
  /**
   * The whole message. There is no separate label naming the axis, because a word
   * that has to be told what it means is the wrong word — see `WORDS`.
   */
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
export const PEAK = Object.freeze({ tier1: 0.85, tier2: 0.94 });

/**
 * Peak heat of a flare. Percentiles of the 760 flares in `diagnostics/`.
 *
 * Measured against the frequency of the thing being named, not against the 0..1
 * scale, because the scale is not the question — how often the word should appear
 * is. tier1 is the p70 flare and tier2 the p90, which puts a burn word on about
 * one capture in six and the better word on about one in eighteen.
 *
 * Read those as shares of ALL captures, not of flares: 55% of captures flare at
 * all, and most of those are a faint scrape that earns its points and no name.
 * Naming them too would make the commonest event in the game a celebrated one,
 * which is the mistake the 15-degree kink line made.
 */
export const BURN = Object.freeze({ tier1: 0.53, tier2: 0.75 });

/**
 * The nerve grab: already boring in, and you waited.
 *
 * Two conditions, and the pair is the point. `close` on its own cannot tell a
 * ship 50px off a planet on its way past from one 50px off and headed straight
 * in; only the second is nerve. So:
 *
 *   skim <= 0     the drift line, extended, passes INSIDE the minimum orbit —
 *                 you were going to hug the planet whether you grabbed or not
 *   clearance     you were already inside the late-press threshold when you
 *     <= tier1    committed, rather than reaching for it from a safe distance
 *
 * The skim bound is deliberately NOT a percentile like the others. Zero is a real
 * boundary in the simulation — it is the radius the floor clamp defends — so it
 * needs no calibration and cannot drift as the feel changes. The lateness bound
 * reuses `CLOSE_PX.tier1` rather than inventing a second definition of "late".
 */
export const NERVE_SKIM_PX = 0;

/**
 * One list per category and tier.
 *
 * Single words, because they are read in peripheral vision next to a moving ship
 * while the player is deciding when to let go of the next one. Two words is a
 * sentence and a sentence is something you stop to read.
 */
/**
 * One list per category and rung.
 *
 * EVERY WORD NAMES ITS OWN AXIS. That is the whole constraint, and it replaced a
 * dim `CLOSE ·` / `BOOST ·` prefix that said the axis out loud. The prefix worked
 * and was the wrong fix: a vocabulary that needs a caption is a vocabulary that
 * has not been chosen carefully enough, and the caption costs a line of text
 * beside a moving ship every single time.
 *
 * So the families are drawn from four different registers, and the register is
 * the signal:
 *
 *   close    proximity    — you shaved it. GRAZED, HAIRLINE, WHISKER.
 *   nerve    composure    — you were going to hit it and you waited. BRINK, CLUTCH.
 *   aim      marksmanship — you pointed it. BULLSEYE, THREADED, DEADEYE.
 *   peak     launch       — you let go at the right instant. SLINGSHOT, REDLINE.
 *   burn     fire         — you came in low and fast enough to cook. SEARED, INFERNO.
 *
 * `burn` and `close` are the pair to watch here, because both are about being
 * near a planet and a shared register would collapse them. Proximity and fire are
 * far enough apart in English that they do not — and the events themselves barely
 * overlap anyway, since a grab from point blank has no dive left to heat up with.
 *
 * The two that must never blur are `aim` and `peak`, because they are the two
 * that can fire on the same event. Marksmanship and launch are about as far apart
 * as English gets, so they do not.
 *
 * Single words, still: they are read in peripheral vision while deciding when to
 * let go of the next planet. The reckless shout in `reckless.ts` is the one
 * deliberate exception.
 */
export const WORDS: Readonly<
  Record<PraiseCategory, readonly [readonly string[], readonly string[]]>
> = Object.freeze({
  close: [
    ['SNUG', 'HUGGED', 'GRAZED', 'SKIMMED'],
    ['SHAVED', 'HAIRLINE', 'WHISKER'],
  ],
  nerve: [
    ['NERVE', 'CLUTCH', 'BRINK', 'STEEL'],
    ['NERVE', 'CLUTCH', 'BRINK', 'STEEL'],
  ],
  aim: [
    ['TRUE', 'LINED', 'SIGHTED', 'TRACKING'],
    ['BULLSEYE', 'PINPOINT', 'THREADED', 'DEADEYE'],
  ],
  peak: [
    ['TIMED', 'SNAPPED', 'WHIPPED'],
    ['SLINGSHOT', 'REDLINE', 'CATAPULT'],
  ],
  // REDLINE is a `peak` word and stays one: it is engine-rev, not fire. Nothing
  // here is about heat in a figurative sense for the same reason — the ship is
  // literally burning, and the words should mean it.
  burn: [
    ['SINGED', 'SEARED', 'SCORCHED'],
    ['BLAZING', 'INFERNO', 'METEOR'],
  ],
  // The two slots here are the two EVENTS, not two rungs — the only entry where
  // that is true. A superlative arrival and a superlative departure are different
  // achievements and used to share one gold word, which made the rarest thing in
  // the game the only one that could not say what it was for. Nothing labels them
  // now either; the lists are disjoint and the moment they fire is the other half
  // of the answer.
  super: [
    ['SURGICAL', 'FLAWLESS', 'IMMACULATE'],
    ['TEXTBOOK', 'SUBLIME', 'MASTERFUL'],
  ],
});

const ORDINAL: Record<PraiseCategory, number> = {
  close: 1,
  aim: 2,
  peak: 3,
  nerve: 4,
  super: 5,
  // Appended rather than slotted in beside `close`, where it belongs
  // thematically. The ordinal is a hash input: renumbering an existing category
  // changes which synonym every past session's replay prints, for no gain.
  burn: 6,
};

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
 * Was this a late press on a line already headed inside the minimum orbit?
 *
 * Exported because the scorer pays for it as well as naming it: a word promising
 * a boost the points do not reflect is worse than no word.
 */
export function isNerveGrab(award: ScoreAward): boolean {
  return award.kind === 'grab' && award.skim <= NERVE_SKIM_PX && award.clearance <= CLOSE_PX.tier1;
}

/**
 * The word a link earned, or null for a routine one.
 *
 * Deductions earn nothing: the words are a reward channel, and the readout
 * already says what went wrong.
 */
export function praiseFor(award: ScoreAward): Praise | null {
  if (award.kind === 'grab') return praiseGrab(award);
  if (award.kind === 'link') return praiseRelease(award);
  if (award.kind === 'burn') return praiseBurn(award);
  return null;
}

/**
 * How hot the pass got.
 *
 * No `super` rung, unlike the grab and the release. Those two each judge a pair
 * of independent qualities and reserve gold for landing both at once; a burn has
 * one quality, so a gold word here would mean nothing more than "even hotter" —
 * which is what the ladder's colour already says.
 */
function praiseBurn(award: ScoreAward): Praise | null {
  const heat = tierOf(award.heat, BURN.tier1, BURN.tier2);
  if (heat === 0) return null;
  return {
    category: 'burn',
    level: heat === 2 ? 'great' : 'good',
    word: pick(WORDS.burn[heat - 1]!, award.tick, 'burn'),
  };
}

/**
 * How the ship arrived: how close it let the body get, and whether it was
 * already boring in when it committed.
 */
function praiseGrab(award: ScoreAward): Praise | null {
  const close = tierOf(award.clearance, CLOSE_PX.tier1, CLOSE_PX.tier2);
  const nerve = isNerveGrab(award);

  // The rare one on this side: a late press on a collision line that was ALSO in
  // the tightest tenth. Nerve alone only needs `CLOSE_PX.tier1`.
  if (nerve && close === 2) {
    return {
      category: 'super',
      level: 'exceptional',
      word: pick(WORDS.super[0], award.tick, 'super'),
    };
  }
  if (nerve) {
    return { category: 'nerve', level: 'great', word: pick(WORDS.nerve[0], award.tick, 'nerve') };
  }
  if (close === 1 || close === 2) {
    return {
      category: 'close',
      level: close === 2 ? 'great' : 'good',
      word: pick(WORDS.close[close - 1]!, award.tick, 'close'),
    };
  }
  return null;
}

/** How the ship left: where in the boost window, and how near the marker. */
function praiseRelease(award: ScoreAward): Praise | null {
  const aim = tierOf(award.aim, AIM.tier1, AIM.tier2);
  const peak = tierOf(award.timing, PEAK.tier1, PEAK.tier2);

  // Both at their top tier is the pair that fights — the boost peaks at a fixed
  // time and the marker sits at a fixed angle, so landing on both means the dive
  // was shaped to bring them together.
  if (aim === 2 && peak === 2) {
    return {
      category: 'super',
      level: 'exceptional',
      word: pick(WORDS.super[1], award.tick, 'super'),
    };
  }
  // The boost window is the one almost nobody hits, so it is named first when
  // both fire.
  for (const [category, tier] of [
    ['peak', peak],
    ['aim', aim],
  ] as const) {
    if (tier === 0) continue;
    const t: 1 | 2 = tier;
    return {
      category,
      level: t === 2 ? 'great' : 'good',
      word: pick(WORDS[category][t - 1]!, award.tick, category),
    };
  }
  return null;
}
