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
 * Which is why it is exactly the band's own red, `rgba(255,70,90)` from
 * `drawHazardZones`, and not a red chosen to sit well beside it. Same substance,
 * same colour.
 *
 * Measured as the ladder was: dE 60.6 to its nearest neighbour in this table
 * (`SHOUT`), against dE 41.0 for the closest pair already in it (`ROUTINE` vs
 * `good`). L* 58 sits between `ROUTINE` at 43 and `great` at 77, so the order
 * survives for a player who cannot separate the hues.
 *
 * IT IS EXACTLY `FUEL_RAMP[0]`, AND THAT IS NOT AN ACCIDENT TO FIX. The empty-tank
 * colour is already this same red, and so is the hazard band — the three were the
 * same value before this constant existed. Every candidate that reads as the
 * band's red is within dE 31 of the fuel colour (measured: #ff3b30 at 21, #ff2a18
 * at 31), because they ARE the same red; there is no third option that matches the
 * band and clears the tank.
 *
 * So the collision is named rather than dodged: #FF465A is this game's lethality
 * colour. Out of fuel, inside the dead zone, and on fire are three ways of being
 * about to die, and they are allowed to look alike. What separates them where they
 * co-occur is form and content, which is the right channel for it — the fuel badge
 * is a pill glyph and the word EMPTY on a plate 26 units BELOW the ship, and this
 * is a signed number to the SIDE of it. Nobody misreads `+430` as `EMPTY`.
 *
 * The dE discipline in this table exists so a RANK can be read off a hue. There is
 * no rank between "burning" and "out of fuel" for a player to get wrong.
 *
 * Bigger than a praise word, and the only thing here that is. A drag runs a second
 * or more with the ship pinned against a wall it is probably about to die on, and
 * the number is the whole of what the player is deciding on.
 */
export const BURN: AccoladeStyle = {
  color: '#ff465a',
  labelColor: 'rgba(255,120,135,.85)',
  size: 17,
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
