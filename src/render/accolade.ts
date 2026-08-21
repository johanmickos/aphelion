/**
 * How an award looks — the one table the score band and the floating popup both
 * read from.
 *
 * They used to disagree: the band coloured by EVENT (grab yellow, link green,
 * miss red) and the popup by CATEGORY, so the same link was green in one place
 * and violet in the other, a few hundred pixels apart. One table, two consumers.
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

/** Off the ladder: not a grade, a different thing that happened. */
export const DEDUCTION: AccoladeStyle = {
  color: '#ff5566',
  labelColor: 'rgba(255,140,155,.85)',
  size: 13,
};

/** Off the ladder too, and on its own channel — see `src/score/reckless.ts`. */
export const SHOUT_COLOR = '#ff45c8';
