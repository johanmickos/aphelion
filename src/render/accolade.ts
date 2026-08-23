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
 * The burn: off the ladder, on its own channel — see `src/score/burn.ts`.
 *
 * WHY THIS ONE IS ALLOWED TO BE A COLOUR
 *
 * Colour here means how good it was, and a CATEGORY colour was tried and removed
 * for reasons that still hold. This is not a category. It is a STATE: the ship is
 * inside the dead zone and on fire, and the number is counting what it will bank
 * if it gets out. Nobody has to learn this hue — the player is looking at a red
 * band, a burning ship and a red number at the same time, and the colour is what
 * says those three things are one event.
 *
 * WHY THESE SHADES
 *
 * Fire, not the band. The first version took the hazard band's own red exactly,
 * on the grounds that band, flame and number should be one substance — and the
 * band's red is pink-leaning (`rgba(255,70,90)`, B=90), which beside an actual
 * flame reads as a different material. The text sits next to the FIRE, not next
 * to the wall, so it takes the fire's colours: `drawBurn` builds its core out of
 * (255, 150+, 38+) and these are the same family, deepened for text weight.
 *
 * Three shades and nothing else — deep orange, red, black — because a singe has
 * no other colours in it. The number is the reddest, the word above it a deeper
 * orange, and the rim is black. They are dE 30 apart, which is close enough to
 * read as one family and far enough not to look like a mistake.
 *
 * THE COLLISION WITH FUEL, WHICH IS NOT A BUG
 *
 * Every one of these lands within dE 14-26 of some step of `FUEL_RAMP`, and no
 * candidate anywhere in the fire family does better — because `FUEL_RAMP` IS a
 * fire gradient, red at empty through amber to green. There is no orange-red that
 * says "burning" and does not also look like a tank in trouble.
 *
 * So it is named rather than dodged: this game's danger palette is fire-coloured,
 * and out of fuel, inside the dead zone and on fire are three ways of being about
 * to die. They separate by form and position, which is the right channel for it —
 * the fuel badge is a pill glyph and the word EMPTY on a plate 26 units BELOW the
 * ship, the tally is a signed number to the SIDE of it, and nobody misreads `+430`
 * as `EMPTY`. The dE discipline in this table exists so a RANK can be read off a
 * hue, and there is no rank between "burning" and "out of fuel".
 *
 * Bigger than a praise word, and the only thing here that is. A drag runs a second
 * or more with the ship pinned against a wall it is probably about to die on, and
 * the number is the whole of what the player is deciding on.
 */
export const BURN: AccoladeStyle = {
  color: '#ff3b2e',
  labelColor: '#c2521f',
  size: 17,
};

/**
 * The word a survived drag earns, a step deeper into the orange than its number.
 *
 * A separate style rather than a second field on `AccoladeStyle`, because only
 * this channel has two text colours and widening the shared shape for one case is
 * how a table stops being readable.
 */
export const BURN_WORD: AccoladeStyle = {
  color: '#ff7a1e',
  labelColor: '#c2521f',
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
