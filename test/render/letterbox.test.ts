/**
 * The projection [M3.1](../../docs/plan/m3-the-field.md) will ask for
 * *"identical composition across aspect ratios"*, built early because M1.6 needs
 * a picture before M3 needs a good one — and written as arithmetic rather than
 * as a canvas operation precisely so that criterion can be a test rather than
 * three screenshots.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import { letterbox } from '../../src/render/letterbox.ts';

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
