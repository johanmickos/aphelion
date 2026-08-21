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

/** One shout, at the tick the ship was thrown around. */
export interface Shout {
  tick: number;
  word: string;
  /** How many reckless captures deep the run is. */
  streak: number;
}

/**
 * Same seeded pick as the link words: no wall clock, no `Math.random`, so a
 * replay reproduces the shouts the player actually saw. Avalanched before use for
 * the reason recorded in `praise.ts` — link ticks are neither random nor evenly
 * spaced, and a lightly-mixed seed clumps hard.
 */
export function shoutWord(tick: number): string {
  let h = Math.imul(tick, 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return SHOUTS[Math.floor(mulberry32(h)() * SHOUTS.length)] ?? SHOUTS[0]!;
}
