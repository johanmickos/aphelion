/**
 * The projection [M3.1](../../docs/plan/m3-the-field.md) will ask for
 * *"identical composition across aspect ratios"*, built early because M1.6 needs
 * a picture before M3 needs a good one — and written as arithmetic rather than
 * as a canvas operation precisely so that criterion can be a test rather than
 * three screenshots.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from '../../src/state/design.ts';
import { bleed, GUARANTEED_BAND, letterbox, visible } from '../../src/render/letterbox.ts';
import type { CorridorView } from '../../src/state/types.ts';

/** A phone with browser chrome, a phone without, a tablet, and a desktop window. */
const VIEWPORTS: ReadonlyArray<readonly [name: string, width: number, height: number]> = [
  ['iPhone, chrome showing', 1179, 1953],
  ['iPhone, full screen', 1170, 2532],
  ['iPad portrait', 1640, 2360],
  ['desktop window', 2560, 1440],
];

describe('the design space', () => {
  /**
   * **The width is the contract** — spec [00 · §7](../../docs/spec/00-tokens.md),
   * ruled by the author on 2026-08-28 and built on 2026-08-30: *"1170 design
   * units across, always, and how much height a device shows follows from its own
   * shape."*
   */
  it.each(VIEWPORTS)('shows its full width inside %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    expect(width / fit.scale).toBeGreaterThanOrEqual(DESIGN_WIDTH - 1e-9);
  });

  /**
   * And the first of §7's two guardrails: a height, measured from the shortest
   * viewport the game supports, that **every** device shows in full. Everything
   * the player reads is composed inside it, and the thumb line at 2/3 is the
   * lowest of those — so if the band ever stopped containing it, the rule that
   * nothing readable lives below the thumb line would have become unkeepable.
   */
  it.each(VIEWPORTS)('shows the guaranteed band, and the thumb line, in %s', (_n, w, h) => {
    const fit = letterbox(w, h);
    const seen = h / fit.scale;
    expect(seen).toBeGreaterThanOrEqual(GUARANTEED_BAND * DESIGN_HEIGHT - 1e-9);
    expect(seen).toBeGreaterThan(THUMB_LINE);
  });

  it.each(VIEWPORTS)('is centred, so the bars are equal, in %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    expect(fit.offsetX * 2 + DESIGN_WIDTH * fit.scale).toBeCloseTo(width, 9);
    expect(fit.offsetY * 2 + DESIGN_HEIGHT * fit.scale).toBeCloseTo(height, 9);
  });

  /**
   * It is the **largest** scale that keeps both promises, so no device is shown
   * less of the world than its own shape allows: one of the two bounds is always
   * touching.
   */
  it.each(VIEWPORTS)('is the largest fit that keeps both promises, in %s', (_n, w, h) => {
    const fit = letterbox(w, h);
    const larger = fit.scale * 1.001;
    const tooNarrow = w / larger < DESIGN_WIDTH;
    const tooShort = h / larger < GUARANTEED_BAND * DESIGN_HEIGHT;
    expect(tooNarrow || tooShort).toBe(true);
  });

  /** Never stretched: one scale, both axes, always. */
  it.each(VIEWPORTS)('never distorts %s', (_name, width, height) => {
    const fit = letterbox(width, height);
    expect(fit.scale).toBeGreaterThan(0);
    expect(Number.isFinite(fit.scale)).toBe(true);
  });

  /**
   * **What this replaced, and what it was costing.** The design space used to be
   * fitted *whole*, which on a phone is bound by the height because browser
   * chrome takes a bite the design space was authored without — so everything
   * landed at 77% of the size the prototype draws it at on the same phone, and a
   * settled orbit crossed the screen at 242 css px/s against the prototype's 315.
   * Held as a number because it is the whole reason the fit changed.
   */
  it('draws the world 1.3x larger than the fit it replaced', () => {
    const fit = letterbox(1179, 1953);
    const whole = Math.min(1179 / DESIGN_WIDTH, 1953 / DESIGN_HEIGHT);
    expect(fit.scale / whole).toBeGreaterThan(1.28);
    expect(fit.scale / whole).toBeLessThan(1.32);
    // In css pixels per design unit on the author's own phone, at dpr 3.
    expect(fit.scale / 3).toBeCloseTo(0.334, 3);
  });
});

/**
 * The bleed: what the buffer can show beyond the design space, per side.
 *
 * **Since the width-fit it can be negative, and usually is on one axis.** A
 * positive value is slack — world the device could always draw and used to be
 * painting over. A negative one is a **crop**: the design space is taller than
 * the buffer at this scale, and the part outside the guaranteed band is off the
 * picture. On the author's phone `x` is slack and `y` is a crop, which is what
 * *"the width is the contract and the height flexes"* means when the height
 * flexes shorter.
 */
describe('the bleed', () => {
  it.each(VIEWPORTS)('leaves the composition exactly where it was, in %s', (_n, w, h) => {
    const before = letterbox(w, h);
    bleed(w, h);
    expect(letterbox(w, h)).toEqual(before);
  });

  it.each(VIEWPORTS)('fills the whole buffer and no more, in %s', (_n, w, h) => {
    const fit = letterbox(w, h);
    const slack = bleed(w, h);
    expect((DESIGN_WIDTH + 2 * slack.x) * fit.scale).toBeCloseTo(w, 6);
    expect((DESIGN_HEIGHT + 2 * slack.y) * fit.scale).toBeCloseTo(h, 6);
  });

  /**
   * **The width never crops and the band never does either**, which is the pair
   * of promises `letterbox` makes said from the other side: `x` is slack or zero,
   * and `y` never eats into the band.
   */
  it.each(VIEWPORTS)('never crops the width, and never the band, in %s', (_n, w, h) => {
    const slack = bleed(w, h);
    expect(slack.x).toBeGreaterThanOrEqual(-1e-9);
    expect(DESIGN_HEIGHT + 2 * slack.y).toBeGreaterThanOrEqual(
      GUARANTEED_BAND * DESIGN_HEIGHT - 1e-9,
    );
  });

  /**
   * On the phone the gate is flown on, the height is the axis that flexes: the
   * picture shows **1 950** of the design space's 2 532 units, which is the
   * guaranteed band, and a hair more than the full width across.
   */
  it('shows the band and the full width on the phone the gate is flown on', () => {
    const fit = letterbox(393 * 3, 651 * 3);
    expect((651 * 3) / fit.scale).toBeCloseTo(1950, 0);
    expect((393 * 3) / fit.scale).toBeGreaterThanOrEqual(DESIGN_WIDTH);
    expect((393 * 3) / fit.scale).toBeLessThan(DESIGN_WIDTH + 20);
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

  /**
   * **The bleed either side is 3.5 design units now, against 179 before.** That
   * is the width-fit's own cost, and it is a cost worth having: the bars existed
   * because the design space was being fitted whole and left slack across, and
   * fitting to the width spends that slack on drawing the world **larger**
   * instead of wider. What used to be 179 units of extra field either side is now
   * 1.3× magnification everywhere.
   */
  it('has almost no bleed left, because the width is now the fit', () => {
    const seen = visible(393 * 3, 651 * 3, CORRIDOR, CORRIDOR.centreline);
    expect(seen.left).toBeCloseTo(-3.5, 1);
    expect(seen.right).toBeCloseTo(DESIGN_WIDTH + 3.5, 1);
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
