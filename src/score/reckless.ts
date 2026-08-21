/**
 * The reckless shout — a separate channel from the words a link earns.
 *
 * The words in `praise.ts` name a GRAB or a RELEASE, arrive at the moment that
 * act resolves, and carry points. These do none of those things. They fire
 * mid-capture, at the instant the ship gets thrown around, they pay nothing, and
 * they only start once you have been flying like this for a while. Two channels
 * because they answer two different questions: "was that well done?" and "are you
 * doing this on purpose?".
 */
import { mulberry32 } from '../sim/rng.ts';

/**
 * A capture counts as reckless when its worst per-sample deflection reaches this.
 *
 * Deliberately NOT `KINK_THRESHOLD_DEG`. Fifteen degrees is "the ride snapped",
 * which the invariants use as a bug detector and which `flybyBrake` 320 -> 600
 * made ordinary — 42% of real captures cross it, and praising them took the share
 * of links earning some word from 54% to 90%. An accolade that fires nine times
 * in ten is wallpaper.
 *
 * Twenty-seven is the top quarter of the same measurements (p50 is 9 degrees, p75
 * is 27, p90 is 50), so a run of three is something you went looking for rather
 * than something that happens to you every sixth planet. Re-checked under the new
 * brake rather than trusting recordings made before it: p75 is 26 either way.
 */
export const RECKLESS_DEG = 27;

/** Consecutive reckless captures before the game starts saying anything. */
export const RECKLESS_STREAK = 3;

/**
 * A single capture thrown this hard shouts on its own, with no history behind it.
 *
 * The streak gate above answers "are you doing this on purpose?", which needs
 * three captures to be a fair question. It is the wrong gate for one genuinely
 * violent arrival, which is its own event and is over before a third capture
 * exists — measured, that gate fired on well under one capture in a hundred, and
 * the shout channel read as if it were not implemented.
 *
 * Sixty is not a percentile. Per-capture worst deflection is BIMODAL, and 60 is
 * the far side of the valley between the two modes — replaying every capture in
 * `diagnostics/` (307 that ran at least 20 ticks):
 *
 *     0-9  ############################################################ 226
 *   10-19  ###  11        50-59  #   3   <- the valley
 *   20-29  ####  14       60-69  ##  7
 *   30-39  ###  9         70-79  ####  13
 *   40-49  ##  6          80-89  ####  14        90+  4
 *
 * Three quarters of captures never pass 10 degrees, and the ones that pass 60
 * are a separate population — 38 of 307, about one capture in eight. A round
 * threshold anywhere in 30..55 would have cut through the sparse middle and made
 * the shout mean nothing in particular.
 *
 * RE-MEASURE THIS. The numbers above were taken before the field was rebuilt
 * (280 spacing, forked rows) and before `boostMax` came down to 60, and both
 * lower the speed a capture is entered at, which is what deflection is made of.
 */
export const RECKLESS_HARD_DEG = 60;

/**
 * Slam into a surface at or above this and the game says so.
 *
 * Also measured rather than chosen, and the gap here is even plainer than the
 * deflection one. Every fatal impact in `diagnostics/`, sorted, in px/s:
 *
 *   97 97 97 97 · 149 181 213 213 · 299 299 312 313 325 325 335 340 512
 *
 * The four at 97 are the spawn drift speed — a run that never pressed anything
 * and coasted into the first planet. Nothing at all lands between 213 and 299,
 * because a death is either a drift that ran out of ideas or a fling that found
 * a wall, and there is no third kind. 250 is the middle of that empty band.
 *
 * A survived graze would have been the more obvious home for this, and it is not
 * one: `crashGrazeDot` is shallow enough that no session on record has ever had
 * one. Every collision in the corpus is fatal.
 */
export const BONK_SPEED = 250;

/**
 * Two words are allowed here where the link words are strictly one.
 *
 * A link word is read in peripheral vision while deciding when to release the
 * next one. A shout lands mid-orbit with nothing to decide, and it is supposed to
 * be the game shouting rather than informing.
 */
export const SHOUTS: readonly string[] = [
  'RECKLESS!',
  'WILD CHILD!',
  'NO BRAKES!',
  'MANIAC!',
  'UNHINGED!',
  'SEND IT!',
];

/**
 * What the game says when the ship stops against a planet.
 *
 * Short, blunt, and about the noise rather than the outcome. The run has just
 * ended and the ending screen already says that; this is the impact itself.
 */
export const BONKS: readonly string[] = ['BONK!', 'OOF!', 'CLANG!', 'SPLAT!', 'THUNK!'];

/** One shout, at the tick the ship was thrown around. */
export interface Shout {
  tick: number;
  word: string;
  /**
   * Which channel it came from. Both draw in the same colour on purpose: the
   * shout colour marks the channel, and the word says what happened — a second
   * colour would be the category-by-colour mistake that `render/accolade.ts`
   * exists to prevent.
   */
  kind: 'reckless' | 'bonk';
  /** How many reckless captures deep the run is. 0 for a bonk. */
  streak: number;
}

/**
 * Same seeded pick as the link words: no wall clock, no `Math.random`, so a
 * replay reproduces the shouts the player actually saw. Avalanched before use for
 * the reason recorded in `praise.ts` — link ticks are neither random nor evenly
 * spaced, and a lightly-mixed seed clumps hard.
 */
function pickWord(words: readonly string[], tick: number): string {
  let h = Math.imul(tick, 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return words[Math.floor(mulberry32(h)() * words.length)] ?? words[0]!;
}

export function shoutWord(tick: number): string {
  return pickWord(SHOUTS, tick);
}

/** Same seeded pick, from the impact list. */
export function bonkWord(tick: number): string {
  return pickWord(BONKS, tick);
}
