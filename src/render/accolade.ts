/**
 * How an award looks — the one table the score band and the floating popup both
 * read from.
 *
 * They used to disagree: the band coloured by EVENT and the popup by CATEGORY, so
 * the same link was green in one place and violet in the other, a few hundred
 * pixels apart. One table, two consumers.
 *
 * WHAT COLOUR MEANS HERE
 *
 * It means how good it was, and nothing else. Six category hues plus two states
 * was past what anyone tells apart in peripheral vision over a moving starfield,
 * and every one had to be learned before it meant anything — while the question a
 * player actually asks, "how good was that?", had no channel beyond a size step
 * you cannot judge without the other size beside it.
 *
 * Colour is good at ordinal and a ladder teaches itself, so the ladder takes the
 * colour. WHICH quality it was is carried by the word, which needs no learning
 * because it says so — see `WORDS` in `src/score/praise.ts`.
 *
 * The ladder is the rarity convention — grey, blue, green, gold — because it
 * arrives already learned from a hundred other games. L* climbs 53 -> 66 -> 77 ->
 * 87, so the order survives for a player who cannot separate the hues, and the
 * rungs are 13, 11 and 10 apart — the widest gap is the one at the bottom, where
 * the commonest award has to be told from the next one up. Size climbs with it for
 * the same reason.
 *
 * The closest pair is `ROUTINE` vs `good` at dE 36. It was 41 until the grey was
 * lightened; the ladder gave up 5 dE of hue separation to buy 1.7 stops of
 * contrast on the thing the player reads most often, which is a good trade and not
 * one to repeat.
 */
import type { PraiseLevel } from '../score/index.ts';

export interface AccoladeStyle {
  /** Colour of the word and the number. */
  color: string;
  /** Colour of the quieter detail line that goes with it. */
  labelColor: string;
  /** Word size in design units. The number sits a step below. */
  size: number;
}

export const LEVEL: Record<PraiseLevel, AccoladeStyle> = {
  good: { color: '#3aa8e8', labelColor: 'rgba(120,165,200,.75)', size: 13 },
  great: { color: '#5cd67a', labelColor: 'rgba(130,190,145,.75)', size: 15 },
  exceptional: { color: '#ffd633', labelColor: 'rgba(210,180,110,.8)', size: 18 },
};

/**
 * Points with no word.
 *
 * Deliberately the dimmest thing that floats: a routine grab is worth noting and
 * not worth celebrating, and an older value sat 25 dE from the superlative, which
 * made the rarest award in the game look like the commonest event in it.
 *
 * Dimmest is not the same as dim. At `#5f6673` this was 3.6:1 against the
 * starfield — the least legible text in the game, and the one shown most often,
 * which is the wrong way round. `#838c9c` is 6.2:1, against `good` at 7.9:1.
 *
 * THIS IS AS LIGHT AS IT CAN GO ON ITS OWN, and the constraint is the ladder
 * rather than legibility. L* here is 58 and `good` is 66; the next step up
 * (`#8b95a5`) closes that to 5, and a bottom gap under about 8 stops the ladder
 * being ordinal for anyone who cannot separate the hues — the rungs above it are
 * 11 and 10 apart. Lighter than this means lifting `LEVEL` with it, which is a
 * change to every award in the game and not a tweak to the quiet one.
 */
export const ROUTINE: AccoladeStyle = {
  color: '#838c9c',
  labelColor: 'rgba(140,148,164,.85)',
  size: 13,
};

/**
 * The word a survived dead-zone drag earns — and ONLY the word.
 *
 * The one place a category is allowed to take a colour, and the exception is
 * narrow on purpose. The rule in this file still holds where it matters: the
 * NUMBER stays on the rarity ladder, so "how good was that" is still answered in
 * the channel that answers it for every other award. This colours the six words
 * in `WORDS.burn` and nothing else.
 *
 * What earns the exception is that the word is already about fire. SINGED,
 * SCORCHED, INFERNO — the vocabulary names a thing that has a colour, and drawing
 * it in ladder blue is the one case where the ladder actively fights the word it
 * is colouring. Nothing has to be learned: the player is reading the word FIRE
 * while the ship is on fire.
 *
 * A whole red channel for the burn was tried twice before this and reverted both
 * times — see PORT_NOTES 51. What went wrong there was colouring the number too,
 * which spent the "how good" channel on a fact the flame was already shouting.
 *
 * RED, AND LIT. Two wrong turns got here, and they were wrong in opposite
 * directions, which is what makes the final value worth explaining.
 *
 * `#c04018` read as ketchup: G/R 0.33, but L* only 46 — dark AND brown. The fix
 * for that was `#d9601f`, which lifted the lightness and the orange together
 * (G/R 0.44, L* 55) and overshot into satsuma.
 *
 * The two knobs are separable. Ketchup is a LIGHTNESS problem and orange is a
 * HUE one, so `#ee3f2c` takes the orange back out — G/R 0.26, redder than the
 * brick ever was — while keeping the lightness that stopped it being brick at all:
 * L* 54, contrast 5.4:1. A bright vermilion, which is what a flame's own red looks
 * like once it is not being drawn in mud.
 */
export const BURN_WORD: AccoladeStyle = {
  color: '#ee3f2c',
  labelColor: '#b8341f',
  size: 15,
};

/**
 * The shout: off the ladder too, and on its own channel — see
 * `src/score/reckless.ts`.
 *
 * It gets a style rather than a bare colour because it is drawn exactly like a
 * praise word — same weight, same rim, same rise, no tilt and no oversized pop.
 * It was none of those things at first: 19px, rotated, and punching to 1.4x on
 * arrival, which made the one channel that pays nothing the loudest thing on the
 * screen. The colour is already the whole of what makes it a separate channel.
 *
 * The size is `great`'s, which is where it sits in frequency too — measured, a
 * capture crosses the hard line about one time in eight.
 */
export const SHOUT: AccoladeStyle = {
  color: '#ff45c8',
  labelColor: 'rgba(220,130,190,.8)',
  size: 15,
};
