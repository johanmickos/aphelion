/**
 * The colours the renderer asks for by role, resolved from the theme.
 *
 * WHAT CHANGED. This file used to hold the values themselves, and admitted in its
 * own header that it did not know whether all four of its hazard reds were
 * deliberate. It now holds only the MAPPING from a role the code already has
 * ("this will end the run", "this is about burning") onto one of Direction 01's
 * eight tokens — which is a question that can be argued about, unlike a triple.
 *
 * The eight are in `theme.ts`. Where a role resolves to a token and an alpha, the
 * combination is built once at module load, exactly as before.
 *
 * WHERE A COLOUR IS *PICKED* IS STILL SOMEWHERE ELSE. `accolade.ts` remains the
 * single table mapping an award's rarity to its style, which is what stops the
 * score band and the floating popup disagreeing about the same link. This file
 * says what `LADDER_GREAT` is; that file says a `great` award gets it.
 *
 * STILL RESOLVED AT MODULE LOAD, which is the half of F03 that is not finished:
 * a region cannot yet supply its own theme, because these are constants and not
 * arguments. Threading the theme through the draw calls deletes most of this file.
 */
import { DEFAULT_THEME, mix } from './theme.ts';
import type { RGB } from './theme.ts';

export type { RGB };

const T = DEFAULT_THEME;

/** `rgba()` for a base colour at a chosen alpha. */
export function withAlpha(c: RGB, a: number | string): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Opaque `rgb()` for a base colour. */
export function solid(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** `#rrggbb`, for the handful of places that want a hex string. */
function hex(c: RGB): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------- the sky

/** The ground everything is drawn on. Violet-black, never pure. */
export const VOID = T.void;
export const VOID_SOLID = solid(T.void);

/** Structure at rest. The unlit state of everything, and it never glows. */
export const DUSK = T.dusk;

/** Strange: the anomaly's sky, its bubble, farewell rings. Never "good". */
export const AURORA = T.aurora;

/** The player. Nothing else may reach it. */
export const CORE = T.core;

/** Utility text at full strength. */
export const INK = T.ink;
export const INK_SOLID = solid(T.ink);

// --------------------------------------------------------------------- hazard

/**
 * Everything that can end the run: the side walls, the trailing floor, the
 * ceiling, the deadline, a tank low enough to matter.
 *
 * ONE COLOUR NOW, WHERE THERE WERE FOUR. The old family ran (255,70,90),
 * (255,85,102), (255,154,168) and (255,90,110), and the file could only say of the
 * fourth that it "sits 20 units from the first with no note anywhere explaining
 * the gap, which is what drift looks like". Direction 01 answers the question the
 * old header could only pose: severity is ORDINAL, so it rides the energy channel,
 * and the three that were reasoned — a wash, small text, text on a red fill — are
 * the same ION at three strengths.
 */
export const HAZARD = T.ion;
export const HAZARD_WARN = hex(T.ion);
/** Text sitting ON an ION fill has to lift off it, so it goes toward CORE. */
export const HAZARD_NOTICE = hex(mix(T.ion, T.core, 0.55));
export const HAZARD_FUEL = T.ion;

export const HAZARD_EDGE = withAlpha(T.ion, 0.5);
export const HAZARD_BAND_FROM = withAlpha(T.ion, 0);
export const HAZARD_BAND_TO = withAlpha(T.ion, 0.22);
export const HAZARD_NOTICE_FILL = withAlpha(T.ion, 0.14);
export const HAZARD_NOTICE_BORDER = withAlpha(T.ion, 0.9);

// ----------------------------------------------------------------------- burn

/**
 * "This is about burning."
 *
 * Note 51 spent three passes arriving at a vermilion `#ee3f2c`, and Direction 07
 * repeals the result rather than the reasoning: the burn is the clearest case of
 * something that can cost you the bank, so it wears ION like every other such
 * thing. "The one time the player's white light wears pink, because the edge is
 * writing on them."
 */
export const BURN = hex(T.ion);

/**
 * The flame ramp, hot to deep.
 *
 * The craft's own white dissolving into ION embers, which is what Direction 07
 * describes and what the old orange could not: an orange fire is a thing that
 * happens TO the ship, and a white core thinning into pink is the ship itself
 * coming apart. Built from the two tokens rather than sampled by eye, so "make the
 * fire less hot" is one number.
 */
export const FLAME_HOT: RGB = mix(T.core, T.ion, 0.4);
export const FLAME_MID: RGB = mix(T.core, T.ion, 0.7);
export const FLAME_DEEP: RGB = T.ion;
export const FLAME_FADE: RGB = mix(T.ion, T.void, 0.35);

// --------------------------------------------------------------------- impact

/**
 * A crash.
 *
 * THE YELLOW IS GONE, and deliberately. It was the fourth meaning on the hue
 * channel, and Direction 03 rules on exactly this: "Yellow would add a fourth
 * meaning to hue; severity is ordinal, so it rides the energy channel like
 * everything else." A crash is the same category as a wall — it ends the run — so
 * it is the same colour at a different energy.
 *
 * It also frees the gold, which now means only one thing: the top of the ladder.
 */
export const IMPACT = T.ion;
export const IMPACT_TEXT = hex(mix(T.ion, T.core, 0.55));
export const IMPACT_NOTICE_FILL = withAlpha(T.ion, 0.12);
export const IMPACT_NOTICE_BORDER = withAlpha(T.ion, 0.9);

/**
 * The boost is armed.
 *
 * CORE, not an amber of its own. The boost is the player's stored energy, and
 * Direction 01's first sentence is that everything luminous is either that or a
 * fact about the future. Stored energy is CORE and grades by brightness — an
 * amber would have been a fifth hue meaning "good", which is the one thing hue is
 * not allowed to mean.
 */
export const BOOST_AMBER: RGB = T.core;

// -------------------------------------------------------------- rarity ladder

/**
 * White, green, gold — the ladder, and it is now three rungs rather than four.
 *
 * Direction 06 collapses the vocabulary to TRUE / SHARP / PERFECT, and the colours
 * follow: CORE white, LUMEN green, SOLAR gold. The blue rung goes with the word
 * that used to wear it.
 *
 * The rungs still climb in lightness — 0.97, 0.83, 0.86 in OKLCH L — so the ladder
 * survives for a player who cannot separate the hues, which was the property the
 * old grey-blue-green-gold ramp was chosen for. What carries the order now is
 * chroma: 0.03, 0.12, 0.15. A rarer award is more saturated, not lighter.
 *
 * QUALITY COLOURS LIVE ONLY IN TYPE. LUMEN and SOLAR may not appear on a planet, a
 * ring or a gauge — the single exception is LUMEN's world monopoly on the finish
 * system, granted by Direction 12 — and no callout may ever wear an identity hue.
 * That is what keeps hue-as-identity intact while type carries a rarity ladder.
 */
export const LADDER_GOOD = hex(T.core);
export const LADDER_GREAT = hex(T.lumen);
export const LADDER_EXCEPTIONAL = hex(T.solar);

export const LADDER_GOOD_RGB: RGB = T.core;
export const LADDER_GREAT_RGB: RGB = T.lumen;

/**
 * The finish system: the carpet, the chevrons, the chequered line, the arrow.
 *
 * THE SAME GREEN AS THE LADDER'S MIDDLE RUNG, which repeals a separation this file
 * used to insist on — "sharing the value would make a later retune of the ladder
 * silently move a navigation cue". Direction 12 answers it: "the two greens agree
 * — green means good news, in type and in terrain. Confusion needs contradiction;
 * there is none." One token, and a retune moves both on purpose.
 */
export const FINISH = T.lumen;

/**
 * The debrief: the colour of a run that ended, whatever it managed first.
 *
 * DUSK. Direction 09 renders the number the field kept "in DUSK — spent, like a
 * taken planet", which is the same word the palette already uses for a body that
 * has been used up. The muted indigo it replaces was reaching for exactly this and
 * had to invent a colour to get there.
 */
export const DEBRIEF = T.dusk;

/**
 * The summit, for the ceremony that fires when the field is cleared.
 *
 * Still the ladder's top rung and still for the same reason: clearing the field is
 * the best thing a player can do, and the ladder already has a colour that means
 * "the best thing".
 */
export const SUMMIT = LADDER_EXCEPTIONAL;
export const SUMMIT_RGB: RGB = T.solar;
