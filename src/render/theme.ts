/**
 * The eight colours that mean something, and the two channels that grade them.
 *
 * DIRECTION 01, IMPLEMENTED. The palette before this was a set of names that had
 * accreted — four hazard reds whose own header admitted "it is not known whether
 * all four are deliberate", a crash yellow, a flame ramp, and a four-rung rarity
 * ladder — 87 distinct values outside the file that was supposed to hold them.
 * This is the canonical record instead: eight names, eight meanings.
 *
 * THE LAW THAT MAKES IT EXTEND. Hue is identity and never quality; luminance and
 * bloom are quality and never identity. They can coexist because they never share
 * an element: an arc keeps its hue forever and heats in place, and nothing on
 * screen changes hue to mean "better". That is what lets every future region add
 * body types without renegotiating the palette — a new body takes a new hue from
 * `identity`, and its grading rides the same emission ladder everything else does.
 *
 * A VALUE, NOT A MODULE OF EXPORTS. `palette.ts` used to hold `export const`s, so
 * there was no argument anywhere that could carry a different one and a region
 * with its own palette was unbuildable. A theme is passed like `RenderConfig` is.
 *
 * WHAT IS NOT HERE. This file DEFINES a colour; `accolade.ts` still PICKS one. The
 * mapping from an award's rarity to its style stays there, because that is what
 * stops the score band and the floating popup disagreeing about the same link —
 * the defect its header records. Moving the mapping in here would undo the fix.
 */

/** A base colour, unresolved, so an alpha can be chosen at the call site. */
export type RGB = readonly [number, number, number];

/**
 * How bright a thing is allowed to be, which is the only channel that means
 * "better".
 *
 * Four tiers, no exceptions. E3 is additive and only one may be alive at a time,
 * which is what stops two awards fighting over the same 400ms.
 */
export interface Emission {
  /** Bloom radius in design px. 0 draws no bloom at all. */
  blur: number;
  /** Bloom alpha. */
  alpha: number;
  /** A white core sits inside the bloom. */
  core: boolean;
}

export type EmissionTier = 'E0' | 'E1' | 'E2' | 'E3';

export interface Theme {
  /** For diagnostics and the region picker. Never drawn. */
  name: string;

  /** The sky. Violet-black, never pure — true #000 belongs to the anomaly's cloud gaps. */
  void: RGB;
  /** Structure at rest: rings, field lines, spent bodies, secondary data. Never glows. */
  dusk: RGB;
  /** Strange: anomaly sky, black holes, farewell rings. Never "good", never identity. */
  aurora: RGB;
  /** Risk: the boundary, the deadline, a low tank. If it is pink, it can cost you the bank. */
  ion: RGB;
  /** The player. Craft, trail, release hand. The brightest value in the game. */
  core: RGB;
  /** Quality, mid tier — type only, plus one world monopoly: the finish system. */
  lumen: RGB;
  /** Quality, top tier — type only. */
  solar: RGB;
  /** Utility text at full strength. Never blooms. */
  ink: RGB;

  /**
   * The identity hue for the nth body. Geometry only, never type.
   *
   * See `IDENTITY_HUES` for why these values and this order.
   */
  identity(n: number): RGB;

  emission: Readonly<Record<EmissionTier, Emission>>;
}

// ------------------------------------------------------------------ conversion

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

const clamp255 = (c: number): number => Math.max(0, Math.min(255, Math.round(c * 255)));

/** `#rrggbb` to an RGB triple. Authoring convenience; the design states hexes. */
export function fromHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * OKLCH to sRGB.
 *
 * OKLCH because the identity band is stated in it and has to be: the rule is
 * "fixed lightness and chroma keep every identity equally loud", which is only
 * true in a perceptual space. The same four planets picked by eye in sRGB would
 * have one that shouts and one that vanishes.
 *
 * Out-of-gamut hues clamp per channel rather than being rejected. At L 0.72 and
 * C 0.13 the whole band is inside sRGB, so the clamp never fires today; it is
 * there so a region that pushes chroma degrades to the nearest paintable colour
 * instead of producing a NaN nobody notices until it is on a phone.
 */
export function oklch(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    clamp255(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp255(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp255(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** Linear blend between two colours. `t` 0 gives `a`, 1 gives `b`. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** The OKLCH hue of an sRGB colour, in degrees. Used by the tests that police the band. */
export function hueOf(c: RGB): number {
  const r = srgbToLinear(c[0] / 255);
  const g = srgbToLinear(c[1] / 255);
  const b = srgbToLinear(c[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return H < 0 ? H + 360 : H;
}

/** Circular distance between two hues, 0..180. */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

// -------------------------------------------------------------- the identity band

/** Fixed lightness and chroma, so every identity is equally loud. Direction 01. */
export const IDENTITY_L = 0.72;
export const IDENTITY_C = 0.13;

/**
 * The identity hues, in the order the field walks them.
 *
 * THE ORDER IS THE POINT, and it is not the order they were listed in. The rule
 * is that neighbours differ by at least 50 degrees, and "neighbours" means bodies
 * the player meets one after another — so it is a constraint on consecutive
 * entries of THIS list, not on the set.
 *
 * Direction 01's exemplars were ember 55, teal 170, azure 215, blue 265. Walked in
 * that order, teal to azure is 45 degrees and azure to blue is 50 — one of them
 * fails outright. Reordered, the same idea holds with room to spare: the minimum
 * consecutive gap below is 80 degrees, and `test/palette.test.ts` pins it.
 *
 * TWO OF THE EXEMPLARS MOVED, AND THE MEASUREMENT IS WHY. Direction 01 says greens
 * "sit at teal, >=20 degrees clear of LUMEN". Measured, LUMEN is at hue 157.1 and
 * the stated teal of 170 is 12.9 degrees away — the claim is not true of the
 * colour it is about. Teal moves to 185, which clears LUMEN by 27.9. Ember stays
 * at 52, a little off the stated 55 to widen the gap to SOLAR at 85.
 *
 * THE EXCLUDED BANDS, from the measured hue of each reserved token:
 *
 *   violet-pink   285..360 and 0..40    AURORA 295.5, ION 357.7
 *   gold           65..105              SOLAR  85.0
 *   green         137..177              LUMEN  157.1
 *
 * which leaves 40..65, 105..137 and 177..285 to draw from.
 */
export const IDENTITY_HUES: readonly number[] = Object.freeze([52, 185, 265, 120, 215]);

// ------------------------------------------------------------------- the default

/**
 * The emission ladder. Bloom radius is the quality channel, everywhere.
 *
 * E3 decays over 400ms and only one may be alive at once — a structural rule, not
 * a stylistic one: it is what stops two awards arriving inside a second and
 * leaving neither legible.
 */
const EMISSION: Readonly<Record<EmissionTier, Emission>> = Object.freeze({
  /** Rings at rest, field lines, spent bodies. */
  E0: Object.freeze({ blur: 0, alpha: 0, core: false }),
  /** Active windows, planet limbs, labels. */
  E1: Object.freeze({ blur: 6, alpha: 0.35, core: false }),
  /** Craft baseline, a window under live aim, the perfect dot when matched. */
  E2: Object.freeze({ blur: 18, alpha: 0.6, core: true }),
  /** Release, capture, award. */
  E3: Object.freeze({ blur: 48, alpha: 1, core: true }),
});

const IDENTITY_CACHE: RGB[] = IDENTITY_HUES.map((h) => oklch(IDENTITY_L, IDENTITY_C, h));

/**
 * The canonical theme.
 *
 * Named rather than anonymous because a region will add a second, and a
 * diagnostics report that says which one was flown is worth having the day that
 * happens.
 */
export const DEFAULT_THEME: Theme = Object.freeze({
  name: 'aurora',
  void: fromHex('#0A0814'),
  dusk: fromHex('#6C64A6'),
  aurora: fromHex('#9D6BFF'),
  ion: fromHex('#FF5FA2'),
  core: fromHex('#FFF4E0'),
  lumen: fromHex('#7FE0A8'),
  solar: fromHex('#FFC94A'),
  ink: fromHex('#EDEAF7'),
  identity: (n: number): RGB =>
    IDENTITY_CACHE[((n % IDENTITY_CACHE.length) + IDENTITY_CACHE.length) % IDENTITY_CACHE.length]!,
  emission: EMISSION,
});
