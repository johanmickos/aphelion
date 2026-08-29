/**
 * How good a release was — `CONTEXT.md`'s **tier**, and spec
 * [06 · §2](../../docs/spec/06-awards.md)'s four zones.
 *
 * **Points for the make. Words for the mastery.** The baseline tier speaks in
 * points alone, because *"a word for 'merely made it' devalues every word above
 * it"*, and the vocabulary above it is exactly three.
 *
 * ## It is a pure function of two numbers, and that is the acceptance
 *
 * `d` is how far the release fell from the **dot** and `W` is the **window**'s
 * width, both in radians and both facts about the geometry
 * ([`compass.ts`](./compass.ts)). Spec 06's acceptance asks that grading *"is a
 * pure function of `(d, W)` and imports nothing from the economy"* — so this
 * file has no multiplier in it. Spec 06 §2 lists them, spec
 * [08](../../docs/spec/08-economy.md) owns the arithmetic, and M4 spends them;
 * deleting the economy (ZEN) has to leave the tier, the word and the colour
 * exactly as they are.
 *
 * ## The zones scale with the window, and the floor is why
 *
 * A PERFECT on a needle-thin arc is a different feat than on a barn door, and
 * *"the arc's width already said so"* — so every zone is a fraction of `W` and
 * difficulty prices its own words with nothing to look up. The one absolute is
 * the **1.5° floor** under PERFECT, which stops the top word becoming unhittable
 * on the narrowest windows: at `W = 15°` it binds and the zone is 1.5°; at
 * `W = 40°` it does not and the zone is 3.2°. Both are spec 06's own worked
 * examples and both are tests.
 */

/**
 * The grade of one release. `null` is a **miss** and is deliberately not a tier:
 * spec 06 §5 gives it silence, and spec 06 §3 rules that it changes no streak,
 * because it was never a graded release at all.
 */
export type Tier = 'MAKE' | 'TRUE' | 'SHARP' | 'PERFECT';

/** Spec 06 §2's zones, as fractions of the window's full width `W`. */
export const TRUE_ZONE = 0.3;
export const SHARP_ZONE = 0.15;
export const PERFECT_ZONE = 0.08;

/**
 * The floor under the PERFECT zone — spec 06 §2's 1.5°, in radians.
 *
 * The only number in this file that is not a ratio, and the only one that has to
 * be: a fraction of a narrow enough window is a target smaller than one tick of
 * angular travel, and a word nobody can earn is a word that stops meaning
 * anything.
 */
export const PERFECT_FLOOR = (1.5 * Math.PI) / 180;

/**
 * The tier of a release that fell `offset` from the dot of a window `width`
 * wide, or `null` if it fell outside it.
 *
 * `offset` is taken as given rather than made absolute here, so that a caller
 * passing a signed angle gets an answer about the wrong thing loudly rather than
 * quietly — the sign of an aim error is a fact the compass draws and the grade
 * does not use.
 */
export function tierFor(offset: number, width: number): Tier | null {
  const d = Math.abs(offset);
  if (width <= 0 || d > width / 2) return null;
  if (d <= Math.max(PERFECT_ZONE * width, PERFECT_FLOOR)) return 'PERFECT';
  if (d <= SHARP_ZONE * width) return 'SHARP';
  if (d <= TRUE_ZONE * width) return 'TRUE';
  return 'MAKE';
}

/**
 * How far inside its window a release landed, from 0 at the edge to 1 at the dot.
 *
 * Not a tier and not a substitute for one: it is what the compass **heats** on,
 * because spec [00 · §6](../../docs/spec/00-tokens.md) has a window go E1 → E2
 * *"as the hand closes on the dot"* — continuously, while the tier is four
 * steps. Two readings of one geometry, and neither is derived from the other.
 */
export function aimFor(offset: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(0, 1 - Math.abs(offset) / (width / 2));
}
