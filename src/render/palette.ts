/**
 * The only colours the game has.
 *
 * Spec [00 · §1](../../docs/spec/00-tokens.md): **eight names, eight meanings**,
 * and *"every colour in the game is one of these eight. Nothing is mixed, tinted
 * or invented at draw time except through the alpha and bloom rules."* Its
 * acceptance is that a lint over the render layer finds no other literal, and
 * `test/render/palette.test.ts` is that lint — which is why this is the one file
 * in `src/render/` allowed to write a colour down.
 *
 * The crude renderer of [M1.6](../../docs/plan/m1-the-swing.md) draws three of
 * them. The rest are here because the file is the palette rather than a list of
 * what is currently used, and a renderer that reaches for a fourth should find
 * it named rather than invent it.
 *
 * **Brightness is the only ordinal channel** (§3). Where this renderer needs to
 * say that one thing matters more than another — a held body against a body at
 * rest — it says it with [`dim`](#) and never with a different token.
 */

/** The sky, and nothing else. */
export const VOID = '#0A0814';
/** Structure, unlit: rungs, rings at rest, spent bodies, secondary data. */
export const DUSK = '#6C64A6';
/** Strange: anomaly sky, black holes, farewell rings. */
export const AURORA = '#9D6BFF';
/** Risk, and nothing else in the world glows pink. */
export const ION = '#FF5FA2';
/** The player: craft, trail, hand. */
export const CORE = '#FFF4E0';
/** Quality (mid), and the finish system's monopoly on green. */
export const LUMEN = '#7FE0A8';
/** Quality (top). Type only. */
export const SOLAR = '#FFC94A';
/** Utility text at full strength. Never blooms. */
export const INK = '#EDEAF7';

/**
 * Every body's disc. A derived surface rather than a palette entry, and *"never
 * brighter than the craft"* (§1).
 */
export const BODY_FILL = '#100C20';

/**
 * Permitted in exactly two places: the gaps between anomaly clouds, and the disc
 * of a black hole (§1). Neither exists yet; it is named so that the day one does,
 * the rule is where the colour is rather than in a spec nobody rereads.
 */
export const TRUE_BLACK = '#000000';

/**
 * A palette token at less than full strength.
 *
 * The alpha rule of §1, and the only way this renderer is allowed to make one
 * colour out of another: the token is unchanged and only its strength moves, so
 * the frame still resolves to eight names and greyscale still ranks it.
 */
export function dim(token: string, strength: number): string {
  const clamped = Math.max(0, Math.min(1, strength));
  const alpha = Math.round(clamped * 255).toString(16);
  return token + alpha.padStart(2, '0');
}
