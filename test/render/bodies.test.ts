/**
 * Spec [04 · §1](../../docs/spec/04-bodies.md)'s scale rule, which is the one
 * acceptance criterion in that file that belongs to the renderer:
 *
 * > *"Rendering a body at radius 20 and at radius 200 produces identical rim and
 * > tide stroke widths in design px."*
 *
 * It is checked against a context that records what it was asked to draw rather
 * than against a canvas, for the same reason the rest of this layer is: a
 * criterion that can only be checked by looking at pixels is a criterion nobody
 * checks. What the recorder proves is what the renderer *asked for*, in design
 * units, which is exactly what the rule is about.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { createInitialState } from '../../src/sim/step.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';
import { createPresentation } from '../../src/state/derive.ts';
import { BOARD_PIXEL, DESIGN_WIDTH } from '../../src/state/design.ts';
import { grabRange } from '../../src/sim/grab.ts';
import { draw } from '../../src/render/index.ts';
import { openField } from '../sim/fixtures.ts';

interface Stroke {
  readonly radius: number;
  readonly width: number;
  readonly style: string;
  /** Present only on an arc that is not a whole circle. */
  readonly sweep: number | null;
}

/**
 * A context that writes down what it was told to draw.
 *
 * Everything is a no-op except the state the calls carry, which is the whole
 * point: the renderer's contract is *what it asks for in design units*, and a
 * real canvas would answer a different question with more equipment.
 */
function recorder(): { context: CanvasRenderingContext2D; strokes: Stroke[] } {
  const strokes: Stroke[] = [];
  let pending: { radius: number; sweep: number | null } | null = null;
  const context = {
    canvas: { width: 1170, height: 2532 },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '' as string | CanvasGradient,
    globalCompositeOperation: 'source-over',
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clip: () => {},
    beginPath: () => {
      pending = null;
    },
    closePath: () => {},
    // The renderer writes a sighting's distance beneath it. Nothing here reads
    // text, but a recorder that throws when the renderer draws some is a
    // recorder that fails for a reason the test is not about.
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    setLineDash: () => {},
    moveTo: () => {},
    lineTo: () => {},
    rect: () => {},
    fillRect: () => {},
    fill: () => {},
    arc: (_x: number, _y: number, radius: number, from: number, to: number) => {
      const sweep = to - from;
      pending = { radius, sweep: Math.abs(sweep - Math.PI * 2) < 1e-9 ? null : sweep };
    },
    createRadialGradient: () => ({ addColorStop: () => {} }),
    stroke: () => {
      if (pending !== null) {
        strokes.push({
          radius: pending.radius,
          width: context.lineWidth,
          style: String(context.strokeStyle),
          sweep: pending.sweep,
        });
      }
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, strokes: strokes };
}

/**
 * One body of `radius`, with the craft inside its reach and the body on screen.
 *
 * Both matter and they pull against each other: reach scales with mass, so a
 * giant is on offer from far enough away to be off the picture entirely, and the
 * renderer would draw nothing at all.
 */
function strokesFor(radius: number, closing = FAR): Stroke[] {
  const body = createBody(DESIGN_WIDTH / 2, 0, radius);
  const field = openField([body]);
  // Placed by **how far into the body's reach it is** rather than by a distance,
  // because that is what the tide's thickness is now a function of and a fixed
  // gap means different things to a body of 20 and one of 200 — their reaches
  // are 38.6 and 3 856.7, which is the mass rule and not a rounding.
  const craft = createCraft(DESIGN_WIDTH / 2, grabRange(body) * (1 - closing), 0, 0);
  const { context, strokes } = recorder();
  draw(createPresentation(createInitialState(field, craft, 1)), context);
  return strokes;
}

/**
 * The two approaches these tests draw at, and **neither end is reachable**.
 *
 * A body has to be near enough to be on screen at all — the renderer culls by
 * the camera's band — and far enough that the craft is not inside it. For the
 * median body those two put the usable window at **0.17 to 0.92**, so the edge
 * of a reach cannot be drawn and neither can a surface. Everything about the
 * tide's thickness is therefore read as a **slope between two approaches** and
 * extrapolated, rather than asserted at an endpoint no frame can contain.
 */
const FAR = 0.25;
const NEAR = 0.65;

/**
 * The approaches the radius pair is compared at.
 *
 * Tighter, because they have to suit both: a body of 20 reaches only 38.6, so
 * closing past 0.48 puts the craft inside it.
 */
const PAIR_FAR = 0.2;
const PAIR_NEAR = 0.4;

/** The rim is the full circle at exactly the body's radius; the tide is the arc on it. */
const rimOf = (strokes: Stroke[], radius: number): Stroke =>
  strokes.find((s) => s.sweep === null && Math.abs(s.radius - radius) < 1e-9)!;
/**
 * The tide is drawn as a fan of segments so that it can taper, so *the* tide
 * stroke is the widest of them — the one on the bearing, where the arc peaks.
 * Everything these tests say about "the tide's width" is about that one.
 */
const tideOf = (strokes: Stroke[], radius: number): Stroke =>
  strokes
    .filter((s) => s.sweep !== null && Math.abs(s.radius - radius) < 1e-9)
    .reduce((widest, s) => (s.width > widest.width ? s : widest));

/** Every segment of it, in the order they were drawn. */
const tideFan = (strokes: Stroke[], radius: number): Stroke[] =>
  strokes.filter((s) => s.sweep !== null && Math.abs(s.radius - radius) < 1e-9);

describe('a body’s anatomy', () => {
  const small = 20;
  const large = 200;

  /**
   * The pair the **tide** is compared across, and it is not §1's 20-and-200.
   *
   * Reach grows with mass, so those two reach 39 and 3 857 — and the tide's
   * thickness is now a function of how far into a reach the craft is, so the
   * comparison has to hold that fixed. There is no closing that does: at any
   * fraction where the 200 is still on screen (it needs to be closer than half
   * the design height) the craft is **inside** the 20. Six times the radius is
   * the spread that fits, and it is still the same question.
   */
  const [tideSmall, tideLarge] = [20, 120];

  /**
   * §1's scale rule, and the reason it exists: *"small bodies read as bright
   * rings; giants as thin luminous horizons."* A stroke that scaled with the
   * radius would make every body look the same size in the one channel that is
   * supposed to distinguish them.
   *
   * **Held at equal approach, which is what the rule was always about.** The tide
   * now thickens as the craft closes (author, 2026-08-29), so *"whatever the
   * radius"* has to be asked with the other variable pinned — and it is the
   * sharper question: a body of 20 and one of 200, the same fraction into their
   * very different reaches, draw the identical band.
   */
  it('strokes the rim and the tide at the same width whatever the radius', () => {
    // The rim takes no reading from the craft at all, so §1's own pair stands —
    // and the two are placed at whatever closing keeps each of them on screen,
    // which is the sharpest way to say the rim does not care.
    expect(rimOf(strokesFor(small, 0.2), small).width).toBe(
      rimOf(strokesFor(large, 0.7), large).width,
    );

    for (const closing of [PAIR_FAR, PAIR_NEAR]) {
      const thin = strokesFor(tideSmall, closing);
      const fat = strokesFor(tideLarge, closing);
      expect(rimOf(thin, tideSmall).width).toBe(rimOf(fat, tideLarge).width);
      expect(tideOf(thin, tideSmall).width).toBeCloseTo(tideOf(fat, tideLarge).width, 9);
    }
  });

  /**
   * And they are the board's own numbers, read into design units.
   *
   * The tide's 4px is now what it is at the **edge of the body's reach**, which
   * is off screen and cannot be drawn — so it is recovered from two approaches
   * that can be, by measuring the line the drawn widths sit on and reading its
   * value where the reach begins. That measures the renderer's output rather
   * than restating its constants.
   */
  it('uses spec 04 §1’s 2.25px rim, and grows the tide out of it', () => {
    const strokes = strokesFor(MEDIAN_RADIUS);
    const rim = rimOf(strokes, MEDIAN_RADIUS).width;
    expect(rim).toBeCloseTo(2.25 * BOARD_PIXEL, 9);

    // *"Start at the same thickness as the planet surface ring, so that when I
    // first approach I see it as a light spot on the surface"* (author,
    // 2026-08-29). The edge of a reach is off screen and cannot be drawn, so the
    // claim is checked where it is checkable: the line two drawn widths sit on,
    // read back to where the reach begins, **is the rim**.
    // The ramp is squared, so the line is straight in `closing²` rather than in
    // `closing` — see `TIDE_SWELL`. Both ends of it are checked.
    const far = tideOf(strokesFor(MEDIAN_RADIUS, FAR), MEDIAN_RADIUS).width;
    const near = tideOf(strokesFor(MEDIAN_RADIUS, NEAR), MEDIAN_RADIUS).width;
    const per = (near - far) / (NEAR * NEAR - FAR * FAR);
    expect(far - per * FAR * FAR).toBeCloseTo(rim, 9);

    // And at the surface it is twice §1's figure — the other end of the same line.
    expect(far + per * (1 - FAR * FAR)).toBeCloseTo(8 * BOARD_PIXEL, 9);
  });

  /**
   * *"I'd love for the tide window to grow in thickness as I approach, too"*
   * (author, 2026-08-29). It already grew in length and in brightness; this is
   * the third reading of the same closing distance.
   *
   * Asserted as a **slope** rather than at an endpoint, because the endpoint is
   * unreachable: full closing is the body's own surface, and a craft there is a
   * contact rather than an approach. The slope is the whole of the behaviour
   * anyway — 40% of the way in is 40% thicker, which is the compass window's own
   * grammar and pins `TIDE_SWELL` at one.
   */
  /**
   * *"I want the tide to seem like it's roundly growing out of the planet's
   * surface towards us"* (author, 2026-08-29). Drawn as one arc it was a band of
   * constant width with two cut ends, and the cut against the much thinner rim
   * was the contrast being complained about.
   */
  it('tapers to the rim’s own width at its ends, and fades out with it', () => {
    const fan = tideFan(strokesFor(MEDIAN_RADIUS), MEDIAN_RADIUS);
    const rim = rimOf(strokesFor(MEDIAN_RADIUS), MEDIAN_RADIUS);
    expect(fan.length).toBeGreaterThan(1);

    // Widest in the middle and thinnest at both ends — a shape, not a ramp.
    const widths = fan.map((s) => s.width);
    const peak = widths.indexOf(Math.max(...widths));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(widths.length - 1);
    for (let i = 1; i <= peak; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    for (let i = peak + 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThan(widths[i - 1]!);
    }

    // **It never goes under the rim it grows out of**, which is the whole point:
    // there is no width to step across where the tide ends and the edge carries on.
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(rim.width);

    // And the ends are all but out, so nothing stops at a brightness the eye can
    // still find.
    const alpha = (style: string): number => Number(style.split('/')[1]!.replace(')', ''));
    expect(alpha(fan[0]!.style)).toBeLessThan(alpha(fan[peak]!.style) * 0.25);
    expect(alpha(fan.at(-1)!.style)).toBeLessThan(alpha(fan[peak]!.style) * 0.25);
  });

  /**
   * *"Let's make the initial colour more similar to the planet ring. I want it
   * to be just barely noticeable, and then it'll grow in brightness"* (author,
   * 2026-08-29).
   *
   * Read off the drawn colours rather than off the constants: what a rim and a
   * tide differ by is **lightness**, 0.72 against 0.92, and the claim is that at
   * the edge of a reach there is no difference left. The edge cannot be drawn —
   * the body is off screen there — so the two ends are measured and the line
   * between them read back, the same way the width is.
   */
  it('starts as the body’s own rim colour and brightens out of it', () => {
    const lightnessOf = (style: string): number => Number(style.split(' ')[0]!.slice(6));
    const alphaOf = (style: string): number => Number(style.split('/')[1]!.replace(')', ''));

    const rim = rimOf(strokesFor(MEDIAN_RADIUS), MEDIAN_RADIUS).style;
    const far = tideOf(strokesFor(MEDIAN_RADIUS, FAR), MEDIAN_RADIUS).style;
    const near = tideOf(strokesFor(MEDIAN_RADIUS, NEAR), MEDIAN_RADIUS).style;

    // It brightens as the craft closes, which is the ask.
    expect(lightnessOf(near)).toBeGreaterThan(lightnessOf(far));

    // And where a reach begins it is the rim — the same lightness and the same
    // alpha, so a body far off shows an edge and not a second element.
    const per = (lightnessOf(near) - lightnessOf(far)) / (NEAR * NEAR - FAR * FAR);
    expect(lightnessOf(far) - per * FAR * FAR).toBeCloseTo(lightnessOf(rim), 3);

    // Two places, not three: the tide's own strength carries a grip term, which
    // is not linear in closing, so the line through two samples of it lands a
    // thousandth off. That is the strength curve and not the ramp.
    const perAlpha = (alphaOf(near) - alphaOf(far)) / (NEAR * NEAR - FAR * FAR);
    expect(alphaOf(far) - perAlpha * FAR * FAR).toBeCloseTo(alphaOf(rim), 2);
  });

  /**
   * *"I want it to really grow closer than this, right now it's a bit too
   * aggressively bold at a distance"* (author, 2026-08-29). Run straight, the
   * band was 1.8× the rim the moment a body came on offer; squared it is 1.2×.
   */
  it('holds back at a distance and does its growing near the body', () => {
    const widths = [FAR, (FAR + NEAR) / 2, NEAR].map(
      (closing) => tideOf(strokesFor(MEDIAN_RADIUS, closing), MEDIAN_RADIUS).width,
    );
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
    expect(widths[2]!).toBeGreaterThan(widths[1]!);
    // **Accelerating**, which is the whole of the note: the second half of the
    // approach buys more width than the first half does.
    expect(widths[2]! - widths[1]!).toBeGreaterThan(widths[1]! - widths[0]!);
  });

  /**
   * The tide is an arc rather than a ring, is drawn **after** the rim so it
   * composites over it, and is lighter — which is the whole of how *"the bright
   * limb segment"* reads as bright without a second colour.
   */
  it('lays the tide over the rim, as a brighter arc', () => {
    const strokes = strokesFor(MEDIAN_RADIUS);
    const rim = rimOf(strokes, MEDIAN_RADIUS);
    const tide = tideOf(strokes, MEDIAN_RADIUS);

    expect(strokes.indexOf(tide)).toBeGreaterThan(strokes.indexOf(rim));
    expect(tide.sweep).toBeGreaterThan(0);
    expect(tide.sweep).toBeLessThan(Math.PI);
    expect(tide.width).toBeGreaterThan(rim.width);

    // Same hue, further up the lightness axis. Brightness is the only ordinal
    // channel (spec 00 §3), so the two differ in exactly one number.
    const lightness = (style: string): number => Number(style.slice(6).split(' ')[0]);
    expect(lightness(tide.style)).toBeGreaterThan(lightness(rim.style));
    expect(tide.style.split(' ')[2]).toBe(rim.style.split(' ')[2]);
  });

  /** The strata are fractions of the radius, which is what makes them structure. */
  it('places the strata at 0.68 and 0.39 of the radius', () => {
    // A body of 200 reaches 3 857, so it is only on screen well inside its own
    // reach — see the pair's note above.
    const strokes = strokesFor(large, 0.7);
    const rings = strokes.filter((s) => s.sweep === null).map((s) => s.radius / large);
    expect(rings.some((at) => Math.abs(at - 0.68) < 1e-9)).toBe(true);
    expect(rings.some((at) => Math.abs(at - 0.39) < 1e-9)).toBe(true);
  });
});
