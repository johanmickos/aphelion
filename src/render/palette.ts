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
 * A body's own colour, from the hue presentation state carries.
 *
 * The **ninth** thing this file names, and the only one that is a family rather
 * than a colour. Spec [00 · §2](../../docs/spec/00-tokens.md) generates identity
 * at `oklch(0.72 0.13 H)` with the lightness and the chroma fixed, *"so every
 * identity is equally loud"* — which means the only free coordinate is the hue,
 * and the hue is [`identity.ts`](../state/identity.ts)'s to decide and this
 * file's to paint. Choosing it here would have made a body's name a property of
 * the canvas.
 *
 * `strength` is the alpha rule of §1 again, exactly as [`dim`](#) spends it: the
 * colour is unchanged and only its strength moves, so greyscale still ranks the
 * frame and hue still means only identity.
 */
export function identity(hue: number, strength: number): string {
  const alpha = Math.max(0, Math.min(1, strength));
  return `oklch(${IDENTITY_LIGHTNESS} ${IDENTITY_CHROMA} ${hue} / ${alpha})`;
}

/**
 * The tide, which is the one place a body is allowed to be brighter than itself.
 *
 * Spec [04 · §1](../../docs/spec/04-bodies.md) draws it *"in identity hue at high
 * lightness"* — the same hue, further up the lightness axis, which is the
 * ordinal channel doing its job inside a single identity rather than a second
 * colour.
 */
export function identityLit(hue: number, strength: number): string {
  return identityRising(hue, 1, strength);
}

/**
 * An identity part of the way up to the tide's lightness — `0` is the body's own
 * colour and `1` is [`identityLit`](#).
 *
 * **The lift is the whole distance between a rim and a tide.** Spec 00 §2 fixes
 * identity at `oklch(0.72 …)` and §1 puts the tide *"at high lightness"*, which
 * is 0.92 here; the alphas the two are actually drawn at sit within a few
 * hundredths of each other. So a tide that has not lifted at all **is** the rim,
 * and one that has lifted fully is the tide as it was tuned — which is what lets
 * a body far off show nothing but its own edge, quietly, and grow into a tide as
 * the craft closes.
 *
 * **The hue never moves**, so spec 00 §1's rule survives untouched: the frame
 * still resolves to its eight names and greyscale still ranks it. Chroma does
 * move now, and only along this lift — see [`TIDE_CHROMA`](#).
 */
export function identityRising(hue: number, lift: number, strength: number): string {
  const at = Math.max(0, Math.min(1, lift));
  // Rounded, and not for looks: interpolating between two decimal constants
  // lands on `0.9200000000000001` at the top, which is a longer string for the
  // canvas to parse on every segment of every tide of every frame and is not the
  // colour anybody wrote down. Four places is finer than the display can show.
  const lightness =
    Math.round((IDENTITY_LIGHTNESS + (TIDE_LIGHTNESS - IDENTITY_LIGHTNESS) * at) * 1e4) / 1e4;
  const chroma = Math.round((IDENTITY_CHROMA + (TIDE_CHROMA - IDENTITY_CHROMA) * at) * 1e4) / 1e4;
  const alpha = Math.max(0, Math.min(1, strength));
  return `oklch(${lightness} ${chroma} ${hue} / ${alpha})`;
}

/**
 * How light an identity is — spec 00 §2's 0.72, fixed for every body so that no
 * body is louder than another for being itself.
 */
const IDENTITY_LIGHTNESS = 0.72;

/** And its chroma, fixed for the same reason. */
const IDENTITY_CHROMA = 0.13;

/**
 * The tide's lightness at its closest. Spec 04 §1 says *"high lightness"* and
 * states no number.
 *
 * **0.94 on 2026-08-30**, up from 0.92, with `TIDE_CHROMA` moving under it —
 * *"could we up the brightness on the tide at its closest? I want it just a hair
 * whiter"* (author).
 */
const TIDE_LIGHTNESS = 0.94;

/**
 * And the tide's chroma at its closest, which is the half of *"whiter"* that
 * lightness alone cannot buy.
 *
 * ## Measured, because the old comment was optimistic
 *
 * This constant's predecessor said 0.92 was *"as far up as oklch goes at this
 * chroma without the hue starting to wash out."* Checked against all forty
 * identity hues, `oklch(0.92 0.13 H)` is **already outside sRGB on 31 of them**,
 * overshooting by up to 0.633 — so the browser was already clipping it, and the
 * clipping is what was washing the hue out. Whiteness bought by pushing lightness
 * alone is bought by clipping harder, and clipping moves each channel by a
 * different amount, which is the one thing that can actually shift a hue.
 *
 * So both move. **0.94 / 0.115 is whiter *and* better behaved than 0.92 / 0.13**:
 * mean saturation across the forty hues falls 0.704 → 0.630, while the worst
 * out-of-gamut overshoot falls 0.633 → **0.601** and the count stays at 31. It is
 * rare to get both, which is the reason for this pair rather than a rounder one.
 *
 * Spec 00 §2's `oklch(0.72 0.13 H)` is untouched: that fixes what an **identity**
 * is, so that no body is louder than another for being itself, and this is the
 * far end of a lift that starts exactly there. A tide that has not lifted is
 * still precisely the rim.
 */
const TIDE_CHROMA = 0.115;

/**
 * A palette token at less than full strength.
 *
 * The alpha rule of §1, and the only way this renderer is allowed to make one
 * colour out of another: the token is unchanged and only its strength moves, so
 * the frame still resolves to eight names and greyscale still ranks it.
 */
/**
 * One token part of the way to another, as a hex token.
 *
 * For the **starfield**, which needs one colour at three brightnesses rather than
 * three colours ([`starfield.ts`](./starfield.ts)) — and returns a token rather
 * than a paint string so the result can still be passed to [`dim`](#).
 *
 * Straight sRGB channel interpolation, which is not how the identity ramps mix
 * and does not want to be: those interpolate in oklch because a *hue* travelling
 * between two lightnesses has to stay the same colour. This travels between two
 * greys along one line, which sRGB gets right and which the eye reads as
 * distance rather than as hue.
 */
export function mix(from: string, to: string, at: number): string {
  const t = Math.max(0, Math.min(1, at));
  let out = '#';
  for (let channel = 1; channel < 7; channel += 2) {
    const a = parseInt(from.slice(channel, channel + 2), 16);
    const b = parseInt(to.slice(channel, channel + 2), 16);
    out += Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

export function dim(token: string, strength: number): string {
  const clamped = Math.max(0, Math.min(1, strength));
  const alpha = Math.round(clamped * 255).toString(16);
  return token + alpha.padStart(2, '0');
}

/**
 * A token's three channels, 0 – 255.
 *
 * For the **grade** ([`grade.ts`](./grade.ts)), which is the one thing in the
 * game that paints by writing bytes into an `ImageData` rather than by handing
 * the canvas a colour string. A tile of ordered dither and grain has a different
 * value in every texel and there is no string for that.
 *
 * It is here and not there for the reason the header gives: **one file writes
 * colour down.** What crosses the boundary is the eight tokens' own numbers,
 * which is the same fact `dim` already spends, read as arithmetic instead of as
 * text — so the grade still cannot invent a colour, only spend one at a strength.
 */
export function channels(token: string): [number, number, number] {
  return [
    parseInt(token.slice(1, 3), 16),
    parseInt(token.slice(3, 5), 16),
    parseInt(token.slice(5, 7), 16),
  ];
}
