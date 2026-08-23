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
 * arrives already learned from a hundred other games. Measured, the closest pair
 * anywhere in this set is dE 41, against 25 before; and L* climbs 43 -> 66 -> 77
 * -> 87, so the order survives for a player who cannot separate the hues. Size
 * climbs with it for the same reason.
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
 * not worth celebrating, and the old value sat 25 dE from the superlative, which
 * made the rarest award in the game look like the commonest event in it.
 */
export const ROUTINE: AccoladeStyle = {
  color: '#5f6673',
  labelColor: 'rgba(95,102,115,.85)',
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
 * DARK, and dark is affordable. Measured against the starfield this is 4.0:1,
 * which is BETTER than the `ROUTINE` grey it sits above at 3.6:1 — so the ember
 * reads as dim without being less legible than what the game already asks people
 * to read. Over the hazard band (`rgba(255,70,90,.22)` on black) it holds 3.2:1,
 * and the black rim on the popup carries it the rest of the way.
 */
export const BURN_WORD: AccoladeStyle = {
  color: '#c04018',
  labelColor: '#8f2d12',
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
