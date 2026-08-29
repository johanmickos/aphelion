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
function strokesFor(radius: number): Stroke[] {
  const body = createBody(DESIGN_WIDTH / 2, 0, radius);
  const field = openField([body]);
  const gap = Math.min(grabRange(body) * 0.5, radius * 2 + 60);
  const craft = createCraft(DESIGN_WIDTH / 2, gap, 0, 0);
  const { context, strokes } = recorder();
  draw(createPresentation(createInitialState(field, craft, 1)), context);
  return strokes;
}

/** The rim is the full circle at exactly the body's radius; the tide is the arc on it. */
const rimOf = (strokes: Stroke[], radius: number): Stroke =>
  strokes.find((s) => s.sweep === null && Math.abs(s.radius - radius) < 1e-9)!;
const tideOf = (strokes: Stroke[], radius: number): Stroke =>
  strokes.find((s) => s.sweep !== null && Math.abs(s.radius - radius) < 1e-9)!;

describe('a body’s anatomy', () => {
  const small = 20;
  const large = 200;

  /**
   * §1's scale rule, and the reason it exists: *"small bodies read as bright
   * rings; giants as thin luminous horizons."* A stroke that scaled with the
   * radius would make every body look the same size in the one channel that is
   * supposed to distinguish them.
   */
  it('strokes the rim and the tide at the same width whatever the radius', () => {
    const [thin, fat] = [strokesFor(small), strokesFor(large)];
    expect(rimOf(thin, small).width).toBe(rimOf(fat, large).width);
    expect(tideOf(thin, small).width).toBe(tideOf(fat, large).width);
  });

  /** And they are the board's own numbers, read into design units. */
  it('uses spec 04 §1’s 2.25px rim and 4px tide for a body in reach', () => {
    const strokes = strokesFor(MEDIAN_RADIUS);
    expect(rimOf(strokes, MEDIAN_RADIUS).width).toBeCloseTo(2.25 * BOARD_PIXEL, 9);
    expect(tideOf(strokes, MEDIAN_RADIUS).width).toBeCloseTo(4 * BOARD_PIXEL, 9);
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
    const strokes = strokesFor(large);
    const rings = strokes.filter((s) => s.sweep === null).map((s) => s.radius / large);
    expect(rings.some((at) => Math.abs(at - 0.68) < 1e-9)).toBe(true);
    expect(rings.some((at) => Math.abs(at - 0.39) < 1e-9)).toBe(true);
  });
});
