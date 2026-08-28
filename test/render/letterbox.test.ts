/**
 * The projection [M3.1](../../docs/plan/m3-the-field.md) will ask for
 * *"identical composition across aspect ratios"*, built early because M1.6 needs
 * a picture before M3 needs a good one — and written as arithmetic rather than
 * as a canvas operation precisely so that criterion can be a test rather than
 * three screenshots.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import { bleed, letterbox, visible } from '../../src/render/letterbox.ts';
import type { CorridorView } from '../../src/state/types.ts';

/** A phone with browser chrome, a phone without, a tablet, and a desktop window. */
const VIEWPORTS: ReadonlyArray<readonly [name: string, width: number, height: number]> = [
  ['iPhone, chrome showing', 1179, 1953],
  ['iPhone, full screen', 1170, 2532],
  ['iPad portrait', 1640, 2360],
  ['desktop window', 2560, 1440],
];

describe('the design space', () => {
  it.each(VIEWPORTS)('fits whole inside %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    expect(DESIGN_WIDTH * fit.scale).toBeLessThanOrEqual(width + 1e-9);
    expect(DESIGN_HEIGHT * fit.scale).toBeLessThanOrEqual(height + 1e-9);
  });

  it.each(VIEWPORTS)('is centred, so the bars are equal, in %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    expect(fit.offsetX * 2 + DESIGN_WIDTH * fit.scale).toBeCloseTo(width, 9);
    expect(fit.offsetY * 2 + DESIGN_HEIGHT * fit.scale).toBeCloseTo(height, 9);
  });

  /**
   * The composition is the same everywhere or it is not a composition, and the
   * fit is the largest one that still shows all of it: any larger and the design
   * space would be cropped, which is how a masthead or a thumb line ends up off
   * the screen it was composed against.
   */
  it.each(VIEWPORTS)('shows as much of the design space as %s can hold', (_n, width, height) => {
    const fit = letterbox(width, height);
    const larger = fit.scale * 1.001;
    const overflows = DESIGN_WIDTH * larger > width || DESIGN_HEIGHT * larger > height;
    expect(overflows).toBe(true);
  });

  /** Never stretched: one scale, both axes, always. */
  it.each(VIEWPORTS)('never distorts %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    const spare = Math.min(width - DESIGN_WIDTH * fit.scale, height - DESIGN_HEIGHT * fit.scale);
    expect(spare).toBeCloseTo(0, 6);
  });

  /**
   * A phone letterboxes too, and the author should know it before flying the
   * gate: the design space is authored at the size of the whole screen and the
   * browser's own chrome takes a bite out of the height, so what reaches the hand
   * is the same composition at about four fifths of the size.
   */
  it('is scaled down by browser chrome on a phone', () => {
    const fit = letterbox(1179, 1953);
    expect(fit.scale).toBeCloseTo(1953 / DESIGN_HEIGHT, 6);
    expect(fit.scale).toBeGreaterThan(0.75);
    expect(fit.scale).toBeLessThan(0.79);
  });
});

/**
 * The bleed: the bars, filled with world instead of black.
 *
 * The design space is still fitted whole and centred and every position in it is
 * unmoved — what changed is only that the leftover is painted rather than
 * blanked, which on the author's phone is **179 design units either side** that
 * the device could always draw and was throwing away. It matters because
 * [M1.4](../../docs/plan/m1-the-swing.md)'s corridor is 1.9× the design width
 * and the camera does not pan, so the craft leaves the picture a long way before
 * it reaches the line it dies at.
 */
describe('the bleed', () => {
  it.each(VIEWPORTS)('leaves the composition exactly where it was, in %s', (_n, w, h) => {
    const before = letterbox(w, h);
    const slack = bleed(w, h);
    expect(letterbox(w, h)).toEqual(before);
    expect(Math.min(slack.x, slack.y)).toBeCloseTo(0, 9);
  });

  it.each(VIEWPORTS)('fills the whole buffer and no more, in %s', (_n, w, h) => {
    const fit = letterbox(w, h);
    const slack = bleed(w, h);
    expect((DESIGN_WIDTH + 2 * slack.x) * fit.scale).toBeCloseTo(w, 6);
    expect((DESIGN_HEIGHT + 2 * slack.y) * fit.scale).toBeCloseTo(h, 6);
  });

  /**
   * On the phone the gate is flown on it is worth 179 design units either side.
   * Held as a number because it is the whole reason the change was made, and a
   * change whose benefit is not measured is a change nobody can argue with later.
   */
  it('recovers the bars on the phone the gate is flown on', () => {
    // ADR-0011's measured CSS viewport, at its measured device pixel ratio.
    const slack = bleed(393 * 3, 651 * 3);
    expect(slack.x).toBeCloseTo(179.3, 1);
    expect(slack.y).toBe(0);
  });
});

/**
 * And what a frame paints into: the design space, plus the bleed, **bounded by
 * the corridor's own line**.
 *
 * A window wider than the corridor has more slack than there is world, and
 * drawing past the line would paint a place a run is already over in. It also
 * bounds how much more a wide window may see than a phone, which is the cost
 * this accepts and does not hide.
 */
describe('what a frame paints into', () => {
  const CORRIDOR: CorridorView = { centreline: DESIGN_WIDTH / 2, halfWidth: 1111.5 };

  it('is the design space plus the bleed where the corridor is wider', () => {
    const seen = visible(393 * 3, 651 * 3, CORRIDOR, CORRIDOR.centreline);
    expect(seen.left).toBeCloseTo(-179.3, 1);
    expect(seen.right).toBeCloseTo(DESIGN_WIDTH + 179.3, 1);
  });

  it('stops at the line where the window is wider than the world', () => {
    const seen = visible(2560, 1440, CORRIDOR, CORRIDOR.centreline);
    expect(seen.right - seen.left).toBeCloseTo(2 * CORRIDOR.halfWidth, 6);
  });

  /**
   * Written against the camera rather than against the centreline, so it is
   * still the corridor's line and not a fixed rectangle once M3.1's camera pans.
   */
  it('follows the camera rather than the centreline', () => {
    const still = visible(2560, 1440, CORRIDOR, CORRIDOR.centreline);
    const panned = visible(2560, 1440, CORRIDOR, CORRIDOR.centreline + 200);
    expect(panned.left).toBeCloseTo(still.left - 200, 6);
    expect(panned.right).toBeCloseTo(still.right - 200, 6);
  });

  /** Never taller than the buffer, and never shorter: vertical bleed is symmetric. */
  it.each(VIEWPORTS)('paints the full height of %s', (_n, w, h) => {
    const seen = visible(w, h, CORRIDOR, CORRIDOR.centreline);
    expect(seen.bottom - seen.top).toBeCloseTo(h / letterbox(w, h).scale, 6);
  });
});
