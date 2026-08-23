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
 * The closest pair in the whole table is `ROUTINE` vs `good`, at dE 36.6. It was
 * 41 while `ROUTINE` was a dark grey; the ladder gave up that separation to buy
 * 2.2 stops of contrast on the text the player reads most often. It can afford to,
 * because those two never appear on the same popup: `ROUTINE` means no word was
 * earned, so the two are alternatives rather than neighbours.
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
 * QUIET BY BEING COLOURLESS, NOT BY BEING DARK. That is the whole idea here and
 * it took three goes to find. At `#5f6673` this was 3.6:1 against the starfield —
 * the least legible text in the game and the one shown most often, which is the
 * wrong way round — and lightening it toward the ladder ran into the ladder: at
 * L* 58 against `good` at 66 there was nowhere left to go without the bottom rung
 * ceasing to be ordinal.
 *
 * Lightness was the wrong axis. A near-white at 66% alpha reads as recessive
 * because it has NO HUE, which leaves lightness free: effective (153,158,168) on
 * black, L* 65, 7.8:1, and chroma 5.8 against 42 / 64 / 78 for the three rungs
 * above it. The ladder still climbs monotonically, in saturation rather than in
 * light, and it climbs much harder — 5.8 to 42 is a bigger step than any it had.
 *
 * It never has to be ranked against `good` in isolation anyway: a ROUTINE popup
 * carries a number and NO WORD, so the absence of the word is the signal, and the
 * colour only has to look unremarkable while staying readable.
 *
 * The transparency is doing real work and is not decoration. It is what keeps a
 * near-white from being the brightest thing on a dark screen, and it lets the
 * starfield show through the strokes, which is what makes it read as a readout
 * rather than as a label pasted on top.
 */
export const ROUTINE: AccoladeStyle = {
  color: 'rgba(232,240,255,.66)',
  labelColor: 'rgba(214,226,246,.5)',
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
 * clears this set's closest pair — `ROUTINE` vs `good` at dE 36.6.
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
