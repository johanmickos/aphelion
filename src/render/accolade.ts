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
 * A hop inside a charged window — see `SimConfig.chargedSecs`.
 *
 * Off the ladder, like `SHOUT`, and for the same structural reason: it is not an
 * answer to "how good was that?". Every hop pays the same flat `hopBonus`, so
 * there is no quality for a rarity colour to report, and putting one on it would
 * be inventing a distinction the award does not have.
 *
 * What the colour says instead is WHICH MODE the game is in, which is legitimate
 * where a category colour was not: a category has to be learned before it means
 * anything, whereas the player is already looking at an electrified ship and a
 * draining purple bar. The hue is the anomaly's own — `rgba(168,92,255)`, the
 * centre of the bubble it projects — so the popup is visibly the same substance
 * that infected the ship.
 *
 * Measured, as the ladder was: dE 45.8 to its nearest neighbour (`SHOUT`), which
 * clears this set's existing closest pair at dE 41.0 (`ROUTINE` vs `good`).
 */
export const HOP: AccoladeStyle = {
  color: '#a85cff',
  labelColor: 'rgba(168,124,220,.85)',
  // Small on purpose, and smaller than anything else that floats. Three or four
  // of these arrive inside seven seconds, on top of whatever else is in the air:
  // at a praise word's size they were the loudest thing on screen during the
  // busiest moment in the game, for the least interesting reason — every one is
  // the same number. They are receipts. `HOP_TALLY` is the headline.
  size: 11,
};

/**
 * The closing tally of a charged window — see `Tally` in `src/score/score.ts`.
 *
 * The same purple, deliberately: it is the same channel, summing the same events,
 * and a second hue would imply a second kind of thing happened. What separates it
 * is size, which is the one dimension the small per-hop numbers left free.
 */
export const HOP_TALLY: AccoladeStyle = {
  color: '#c89aff',
  labelColor: 'rgba(200,154,255,.9)',
  size: 26,
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
