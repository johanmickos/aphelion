/**
 * The colours that mean something, in one place.
 *
 * WHY THIS EXISTS. The codebase already had semantic colour names — they were
 * just written in prose instead of in code. `src/render/deadline.ts` explains its own
 * red by pointing at another file's: "`rgba(255,70,90)` is the hazard band's own
 * colour, and the deadline is a fact about that band", and then explains which red it
 * must NOT borrow, because "Note 51 spent three passes establishing that
 * `#ee3f2c` MEANS 'this is about burning'". Two colours with settled meanings,
 * referenced across four files, and no way to say so except in a comment that
 * cannot be checked. Hazard red alone was written out 17 times.
 *
 * WHAT BELONGS HERE, AND WHAT DOES NOT. A colour earns a name by carrying a
 * meaning and recurring. A gradient stop inside one bloom does neither: it is a
 * shade of something already named, tuned by eye against the stop beside it, and
 * a token for it would be a rename with churn and no benefit — you would still
 * tune that bloom by editing that bloom. So the ~55 one-off stops stay literal
 * where they are drawn. The test for graduating one is whether a second file
 * would ever need to agree with it.
 *
 * WHERE A COLOUR IS *PICKED* IS STILL SOMEWHERE ELSE. `accolade.ts` remains the
 * single table mapping an award's rarity to its style, which is what stops the
 * score band and the floating popup disagreeing about the same link — the defect
 * its header records. This file says what `LADDER_GREAT` is; that file says a
 * `great` award gets it. Defining and choosing are different jobs and moving the
 * second one here would undo the fix.
 *
 * COST AT RUNTIME IS ZERO for the fixed combinations, which are built once at
 * module load rather than per frame. Only genuinely varying alphas call
 * `withAlpha`, and every one of those was already building a string per frame
 * before this file existed.
 */

/** A base colour, unresolved, so an alpha can be chosen at the call site. */
export type RGB = readonly [number, number, number];

/**
 * `rgba()` for a base colour at a chosen alpha.
 *
 * Alpha may be a string so a caller that has already fixed its precision can pass
 * that through untouched. `ship.ts` builds the flame's alpha with `.toFixed(3)`
 * to stop a float like 0.7200000000000001 reaching the canvas as a 19-character
 * string every frame; taking a number here would round-trip that back to a float
 * and undo it.
 */
export function withAlpha(c: RGB, a: number | string): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Opaque `rgb()` for a base colour. */
export function solid(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// --------------------------------------------------------------------- hazard

/**
 * The boundary red: side walls, the trailing floor, the ceiling, the deadline, and
 * the skull over a ship that pressed too late.
 *
 * The most-repeated colour in the renderer and the one most likely to be retuned,
 * because it is the only colour that means "this will end the run".
 */
export const HAZARD: RGB = [255, 70, 90];

/**
 * THE HAZARD FAMILY IS FOUR SHADES, AND IT IS NOT KNOWN WHETHER ALL FOUR ARE
 * DELIBERATE. Collecting them was the first thing this file made visible:
 *
 *   (255, 70, 90)   the band, the deadline, the skull        17 uses
 *   (255, 85,102)   HUD warning lines                     6 uses
 *   (255,154,168)   ending-notice text, on a red fill     2 uses
 *   (255, 90,110)   empty tank, and a refused grab        2 uses
 *
 * Two of those read as reasoned — small text wants more brightness than a wash,
 * and text ON a red fill has to lift off it. The fourth sits 20 units from the
 * first with no note anywhere explaining the gap, which is what drift looks like.
 * They are named separately rather than collapsed, because collapsing them would
 * be a feel change smuggled into a refactor. Now that they are addressable, the
 * question can be asked properly.
 */
export const HAZARD_WARN = '#ff5566';
export const HAZARD_NOTICE = '#ff9aa8';
export const HAZARD_FUEL: RGB = [255, 90, 110];

/** Fixed hazard combinations, resolved once. */
export const HAZARD_EDGE = withAlpha(HAZARD, 0.5);
export const HAZARD_BAND_FROM = withAlpha(HAZARD, 0);
export const HAZARD_BAND_TO = withAlpha(HAZARD, 0.22);
export const HAZARD_NOTICE_FILL = withAlpha(HAZARD, 0.14);
export const HAZARD_NOTICE_BORDER = withAlpha(HAZARD, 0.9);

// ----------------------------------------------------------------------- burn

/**
 * "This is about burning." Note 51 spent three passes arriving at this exact
 * value, and `deadline.ts` declines to borrow it precisely because it is settled —
 * using it there "would promise a fire that has not started."
 */
export const BURN = '#ee3f2c';

/**
 * The flame ramp, hot to deep.
 *
 * Named as a ramp rather than left as four stops because the fire is one idea
 * drawn by two functions — the wake and the shock — which have to agree, and
 * because "make the fire less orange" should not be a hunt through `ship.ts`.
 */
export const FLAME_HOT: RGB = [255, 116, 26];
export const FLAME_MID: RGB = [255, 104, 24];
export const FLAME_DEEP: RGB = [228, 34, 14];
export const FLAME_FADE: RGB = [210, 26, 10];

// --------------------------------------------------------------------- impact

/** A crash: yellow, so the cause is legible before the words are read. */
export const IMPACT: RGB = [255, 205, 50];
export const IMPACT_TEXT = '#ffe27a';
export const IMPACT_NOTICE_FILL = withAlpha(IMPACT, 0.12);
export const IMPACT_NOTICE_BORDER = withAlpha(IMPACT, 0.9);

/** Amber: the boost is armed. Not the crash yellow, and not the flame. */
export const BOOST_AMBER: RGB = [255, 176, 32];

// -------------------------------------------------------------- rarity ladder

/**
 * Grey, blue, green, gold — the rarity convention, "because it arrives already
 * learned from a hundred other games".
 *
 * The reasoning that fixed these values, and the L* spacing that keeps the ladder
 * ordinal for a player who cannot separate the hues, lives at `LEVEL` in
 * `accolade.ts` and stays there. Do not retune one of these without reading it.
 */
export const LADDER_GOOD = '#3aa8e8';
export const LADDER_GREAT = '#5cd67a';
export const LADDER_EXCEPTIONAL = '#ffd633';

/**
 * The same two rungs, decomposed, for anything that has to interpolate between
 * them. Pinned against the hex above so the pair cannot drift.
 */
export const LADDER_GOOD_RGB: RGB = [58, 168, 232];
export const LADDER_GREAT_RGB: RGB = [92, 214, 122];

/**
 * The finish line's marker, in the edge-arrow cue system.
 *
 * NOT ON THE RARITY LADDER, and it is worth being explicit because it is green
 * and the ladder's third rung is also green. Those arrows are category-coded —
 * blue for a planet, purple for an anomaly — and category is exactly what colour
 * is NOT allowed to mean on an award. Two systems, two jobs: this one answers
 * "what is that", the ladder answers "how good was that", and they never appear
 * on the same glyph.
 *
 * Distinct from `LADDER_GREAT` on purpose rather than by accident. Sharing the
 * value would make a later retune of the ladder silently move a navigation cue.
 */
export const FINISH: RGB = [92, 226, 140];

/**
 * The debrief: the colour of a run that ended, whatever it managed first.
 *
 * ONE COLOUR FOR EVERY DEATH. It has been three things and each was wrong in a
 * way worth keeping written down. `FINISH` green congratulated the player for
 * arriving at a finish they did not reach. Hazard red is the one colour here that
 * means "right now, and you can still act", which a post-mortem cannot. And a
 * gradient that warmed with how far the run got read as the game grading your
 * failure, when what it should do is simply report it.
 *
 * SO: BETWEEN THE TWO IT SITS BETWEEN. The plain slate it replaced was accurate
 * and morose — the colourless family the HUD uses for readouts nobody is meant to
 * look at — and the summit gold is the one thing above it that must stay rare. A
 * muted indigo has enough chroma to be worth reading and no claim to being an
 * award.
 *
 * OFF THE RARITY LADDER, deliberately, and not merely near it. Borrowing
 * `LADDER_GOOD` would have been the easy way to get some life into it, and would
 * have meant every death sheet announcing itself as a rung — colour is a RANK in
 * this codebase, and a run ending is not a grade.
 */
export const DEBRIEF: RGB = [124, 146, 212];

/**
 * The summit gold, for the ceremony that fires when the field is cleared.
 *
 * DELIBERATELY THE LADDER'S TOP RUNG AND NOT A NEW COLOUR. Clearing the field is
 * the best thing a player can do, and the ladder already has a colour that means
 * "the best thing" — one the player has spent the whole run learning. Green was
 * asked for first and is wrong for the same reason it would be wrong on a popup:
 * it is rung three of four, so it would paint the game's rarest outcome in the
 * colour of an ordinary good link.
 */
export const SUMMIT = LADDER_EXCEPTIONAL;
export const SUMMIT_RGB: RGB = [255, 214, 51];

// ------------------------------------------------------------------ signature

/**
 * The carpet signature: the line the player drew through the run-in, shown once
 * the field is cleared. See `src/render/signature.ts`.
 *
 * OFF THE RARITY LADDER, with the finish green and the burn's red, and it is the
 * clearest case of the three. Colour means how good an AWARD was; a signature is
 * not graded at all — there is no better or worse line through the carpet, only a
 * different one. It is a unique artifact, so what it wants is a treatment nothing
 * else in the game has rather than a rung nothing else has reached.
 *
 * A COOL WHITE, NOT A HUE. Every colour in this file that means something is
 * saturated, so the one thing that means nothing on that axis is the one thing
 * that has no chroma to speak of: the eye reads it as light rather than as a
 * category, and it cannot be confused with the gold sky it is drawn against.
 */
export const PEARL: RGB = [220, 234, 255];

/**
 * The three tints the sheen travels through, mother-of-pearl fashion.
 *
 * Named as a set rather than left as literals in the drawing, for the reason the
 * flame ramp is: it is one idea — "what iridescence looks like here" — and a
 * retune should be one edit. All three are near-white on purpose; the effect is a
 * shift in temperature as the highlight moves, not a rainbow.
 */
export const PEARL_SHEEN: readonly RGB[] = [
  [255, 244, 214],
  [214, 250, 255],
  [238, 220, 255],
];
