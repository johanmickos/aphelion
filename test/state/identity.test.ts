/**
 * Spec [00 · §2](../../docs/spec/00-tokens.md)'s identity hues, and its
 * acceptance criterion: *"generating 40 identity hues for one day yields no hue
 * inside a reserved window, and no two adjacent addresses closer than 50°."*
 *
 * It is a test about presentation state rather than about a canvas, and that is
 * the point of generating the hue a layer down from the paint: *"two live
 * targets too close in hue to tell apart"* is spec
 * [04 · §5](../../docs/spec/04-bodies.md)'s one reason to print an address, and
 * a fact no test could reach if the hue were chosen inside a `fillStyle`.
 */
import { describe, expect, it } from 'vitest';
import { RESERVED_HUES } from '../../src/state/hues.ts';
import {
  ALLOWED,
  ALLOWED_SPAN,
  HUE_SEPARATION,
  HUE_STEP,
  hueApart,
  hueOf,
  IDENTITY_CHROMA,
  IDENTITY_LIGHTNESS,
  isReserved,
} from '../../src/state/identity.ts';

/** A whole day of bodies — spec 17's forty. */
const DAY = Array.from({ length: 40 }, (_, address) => hueOf(address));

describe('a day of identities', () => {
  it('puts no hue inside a reserved range', () => {
    for (const hue of DAY) expect(isReserved(hue)).toBe(false);
  });

  it('keeps adjacent addresses at least 50° apart', () => {
    for (let i = 1; i < DAY.length; i++) {
      expect(hueApart(DAY[i]!, DAY[i - 1]!)).toBeGreaterThanOrEqual(HUE_SEPARATION);
    }
  });

  /**
   * With headroom, and the headroom is the reason the step is the golden section
   * rather than a value tuned to this arc. Spec 00 §2a's colour-vision sweep is
   * flagged to move the reserved ranges; a tuned step lands near a small
   * rational fraction of what is left and collapses to a handful of repeating
   * hues the moment the arc changes length.
   */
  it('does so with room to spare, and gives every body its own hue', () => {
    const closest = Math.min(...DAY.slice(1).map((hue, i) => hueApart(hue, DAY[i]!)));
    expect(closest).toBeGreaterThan(60);
    expect(new Set(DAY.map((hue) => hue.toFixed(1))).size).toBe(DAY.length);
  });

  it('is the same hue for the same address, forever', () => {
    expect(hueOf(11)).toBe(hueOf(11));
    expect(DAY).toEqual(Array.from({ length: 40 }, (_, address) => hueOf(address)));
  });

  /** And it does not run out: a field longer than a day keeps the same promise. */
  it('holds for far more bodies than a day has', () => {
    let closest = 360;
    for (let address = 1; address < 500; address++) {
      closest = Math.min(closest, hueApart(hueOf(address), hueOf(address - 1)));
    }
    expect(closest).toBeGreaterThanOrEqual(HUE_SEPARATION);
  });
});

describe('the arc generation walks', () => {
  /**
   * Derived from the reserved ranges rather than written out, so the
   * colour-vision sweep moving one moves this. Three arcs survive: ember through
   * orange, a yellow-green sliver, and teal through blue as far as the hard stop
   * short of AURORA.
   */
  it('is what the reserved ranges leave', () => {
    expect(ALLOWED.map((arc) => [arc.from, Number((arc.from + arc.span).toFixed(1))])).toEqual([
      [17.7, 65],
      [105, 137.1],
      [177.1, 265],
    ]);
    expect(ALLOWED_SPAN).toBeCloseTo(167.3, 6);
  });

  it('steps by the golden section of it', () => {
    expect(HUE_STEP).toBeCloseTo(ALLOWED_SPAN * 0.618034, 4);
  });

  it('closes every range the palette needs for itself', () => {
    // The four tokens whose hues a body must never wear, sampled at their own
    // centres: a body in SOLAR would claim to be a grade, one in ION would claim
    // to be the boundary.
    for (const hue of [85, 157.1, 295.5, 357.7]) expect(isReserved(hue)).toBe(true);
    expect(RESERVED_HUES.every((range) => range.why.length > 0)).toBe(true);
  });
});

describe('the identity family', () => {
  /** Fixed, *"so every identity is equally loud"* — only the hue varies. */
  it('fixes lightness and chroma', () => {
    expect(IDENTITY_LIGHTNESS).toBe(0.72);
    expect(IDENTITY_CHROMA).toBe(0.13);
  });
});
