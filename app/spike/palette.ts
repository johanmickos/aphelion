/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * The eight palette tokens and the identity-hue generator, from spec 00. The
 * spike measures a scene, and a scene drawn in the wrong colours measures the
 * wrong thing: bloom cost depends on how much of the frame is above the bloom
 * threshold, and that is a property of the palette. So these are the real
 * values, and identity hues come out of the real `oklch(0.72 0.13 H)` rule
 * rather than being eyeballed.
 */

/** Spec 00 §1. */
export const VOID = '#0A0814';
export const DUSK = '#6C64A6';
export const ION = '#FF5FA2';
export const CORE = '#FFF4E0';
export const BODY_FILL = '#100C20';

/** Spec 00 §2: fixed lightness and chroma, so every identity is equally loud. */
const IDENTITY_L = 0.72;
const IDENTITY_C = 0.13;

const srgb = (x: number): number => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/** OKLab → linear sRGB → sRGB. Out-of-gamut components are clipped, not mapped. */
export function oklch(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;
  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  const hex = (n: number): string => srgb(n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

/** A body's identity hue at the spec's fixed lightness and chroma. */
export const identity = (hDeg: number): string => oklch(IDENTITY_L, IDENTITY_C, hDeg);

/** The same hue at high lightness — spec 04 §1, the tide. */
export const identityBright = (hDeg: number): string => oklch(0.92, IDENTITY_C * 0.7, hDeg);

/** `#rrggbb` + alpha → `rgba(...)`. Nothing in the game mixes colour any other way. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** `#rrggbb` → three floats in 0..1, for the shader uniforms in candidate B. */
export function rgbFloats(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
