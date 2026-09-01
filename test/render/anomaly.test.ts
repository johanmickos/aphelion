/**
 * The anomaly, painted — and the acceptance M3.3 is written on.
 *
 * *"The anomaly reads as the reference standard"* is the author's eyes and
 * nothing here can check it. What these can check is the other half, which is
 * exactly why spec [05](../../docs/spec/05-field.md) states it the way it does:
 * **nothing outside an anomaly repaints the sky**, *"entering and leaving an
 * anomaly changes the sky and nothing about any body's hue"*, and the gaps
 * between the clouds are **true black**.
 *
 * The buffer is not exercised here. A node process has no `document`, so
 * [`anomaly.ts`](../../src/render/anomaly.ts)'s fallback runs — which is the same
 * picture at full resolution and full cost, and is what `pnpm profile`'s census
 * measures. That is deliberate: the composite is the one part of this file a test
 * without a canvas could only pretend to check.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import { ANOMALY_SPAN, SKY_TINT } from '../../src/state/anomaly.ts';
import type { AnomalyView, CameraView } from '../../src/state/types.ts';
import { AURORA, CORE, ION, TRUE_BLACK, VOID } from '../../src/render/palette.ts';
import { drawAnomaly } from '../../src/render/anomaly.ts';

const AT = (y: number): CameraView => ({ x: DESIGN_WIDTH / 2, y, lock: 0, offset: 0 });
const SEEN = { left: 0, top: 0, right: DESIGN_WIDTH, bottom: DESIGN_HEIGHT };

/** An anomaly hanging around design `y` 0, so a camera `y` is an altitude. */
const anomaly = (warmth: number): AnomalyView => ({
  top: -ANOMALY_SPAN / 2,
  bottom: ANOMALY_SPAN / 2,
  warmth,
  inside: false,
});

interface Painted {
  /** Every `fillRect`, with what it was filled with. */
  rects: { x: number; y: number; w: number; h: number; fill: string }[];
  /** Every colour stop asked of every gradient, in order. */
  stops: string[];
  strokes: string[];
  gradients: number;
}

/** A context that writes down every colour it is asked to paint with. */
function recorder(): { context: CanvasRenderingContext2D; painted: Painted } {
  const painted: Painted = { rects: [], stops: [], strokes: [], gradients: 0 };
  const gradient = {
    addColorStop(_at: number, colour: string) {
      painted.stops.push(colour);
    },
  };
  let fillStyle: unknown = '';
  const context = {
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: '',
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    strokeStyle: '',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      painted.rects.push({
        x,
        y,
        w,
        h,
        fill: fillStyle === gradient ? 'gradient' : String(fillStyle),
      });
    },
    stroke() {
      painted.strokes.push(String(context.strokeStyle));
    },
    createRadialGradient: () => {
      painted.gradients += 1;
      return gradient;
    },
    createLinearGradient: () => {
      painted.gradients += 1;
      return gradient;
    },
    drawImage: () => {
      throw new Error('the buffer should not be reachable without a document');
    },
  } as unknown as CanvasRenderingContext2D & { strokeStyle: string };
  return { context, painted };
}

const drawn = (view: AnomalyView | null, cameraY: number, tick = 0): Painted => {
  const { context, painted } = recorder();
  drawAnomaly(context, view, AT(cameraY), tick, SEEN);
  return painted;
};

/** Everything a frame put on the canvas, as colour strings. */
const inks = (painted: Painted): string[] => [
  ...painted.rects.map((rect) => rect.fill),
  ...painted.stops,
  ...painted.strokes,
];

/** A `dim`med token, stripped back to the token it was made of. */
const tokenOf = (ink: string): string => ink.slice(0, 7);

/** How strong a `dim`med token is, 0 to 1. */
const strengthOf = (ink: string): number => (ink.length > 7 ? parseInt(ink.slice(7), 16) / 255 : 1);

describe('the sky over an anomaly', () => {
  /**
   * **The acceptance criterion.** Far from an anomaly the sky is asked for
   * nothing at all — not a faint fill, not a zero-alpha one. `CONTEXT.md`'s
   * **decay** rule in a different costume: a thing that is over is absent.
   */
  it('is not repainted at all outside an anomaly', () => {
    expect(inks(drawn(anomaly(0), 100_000))).toEqual([]);
    expect(inks(drawn(null, 0))).toEqual([]);
  });

  /**
   * And on the approach it is repainted by at most spec 05 §2's **6%**, in
   * AURORA, over the whole of what can be seen — one flat fill and nothing else,
   * because the anomaly itself is nowhere near the picture.
   */
  it('spends at most six per cent of the way to AURORA on the approach', () => {
    for (const warmth of [0.01, 0.25, 0.5, 0.99, 1]) {
      const painted = drawn(anomaly(warmth), 100_000);
      expect(painted.rects.length).toBe(1);
      const [wash] = painted.rects;
      expect(tokenOf(wash!.fill)).toBe(AURORA);
      expect(strengthOf(wash!.fill)).toBeLessThanOrEqual(SKY_TINT);
      expect(strengthOf(wash!.fill)).toBeCloseTo(SKY_TINT * warmth, 2);
      expect(wash!.w).toBe(DESIGN_WIDTH);
      expect(wash!.h).toBe(DESIGN_HEIGHT);
    }
  });

  /** Entering changes the sky — which is the other half of the same criterion. */
  it('changes the sky on the way in, and changes it back on the way out', () => {
    const away = inks(drawn(anomaly(0), 100_000));
    const inside = inks(drawn({ ...anomaly(1), inside: true }, 0));
    expect(away).toEqual([]);
    expect(inside.length).toBeGreaterThan(5);
    expect(inks(drawn(anomaly(0), -100_000))).toEqual([]);
  });

  /**
   * Spec 05 §5: *"the gaps between clouds stay **true black** — one of only two
   * places true black is permitted."* The bed is what makes a gap, and it is the
   * only thing in the frame drawn in it.
   */
  it('lays a true-black bed under the clouds', () => {
    const painted = drawn({ ...anomaly(1), inside: true }, 0);
    const black = painted.stops.filter((stop) => tokenOf(stop) === TRUE_BLACK);
    expect(black.length).toBeGreaterThan(0);
    // Solid in the middle and transparent at both ends, so neither edge is a line.
    expect(black.some((stop) => strengthOf(stop) === 1)).toBe(true);
    expect(black.filter((stop) => strengthOf(stop) === 0).length).toBe(2);
  });

  /**
   * Spec 05 §5's bed: *"some leaning ION-pink, some deep AURORA violet."* Both
   * are drawn, and nothing else is — a frame that reached for a ninth colour
   * would fail `test/render/palette.test.ts` first, and this says which two the
   * design actually asked for.
   */
  it('paints in AURORA and ION and in nothing else', () => {
    const tokens = new Set<string>();
    // Several ticks, because a curtain's colour comes from its own hash and a
    // single frame need not hold both.
    for (let tick = 0; tick < 400; tick += 20) {
      for (const y of [-1000, -400, 0, 400, 1000]) {
        for (const ink of inks(drawn({ ...anomaly(1), inside: true }, y, tick))) {
          if (ink !== 'gradient') tokens.add(tokenOf(ink));
        }
      }
    }
    expect(tokens).toEqual(new Set([AURORA, ION, TRUE_BLACK]));
    expect(tokens.has(CORE)).toBe(false);
    expect(tokens.has(VOID)).toBe(false);
  });

  /**
   * **It is anchored in the world, not on the craft**, which is the prototype's
   * own hardest-won finding about this effect: *"a screen-space wash is a filter
   * laid over the picture and reads as the game changing its mind about the
   * palette."* So the same anomaly seen from two altitudes is not the same
   * picture.
   */
  it('shows a different part of itself from a different altitude', () => {
    const low = drawn({ ...anomaly(1), inside: true }, 600);
    const high = drawn({ ...anomaly(1), inside: true }, -600);
    expect(low.rects).not.toEqual(high.rects);
  });

  /** And it moves on the game's own clock, so a replay shows the weather it had. */
  it('drifts on the tick and on nothing else', () => {
    const now = drawn({ ...anomaly(1), inside: true }, 0, 100);
    expect(drawn({ ...anomaly(1), inside: true }, 0, 100)).toEqual(now);
    expect(drawn({ ...anomaly(1), inside: true }, 0, 400)).not.toEqual(now);
  });

  /**
   * The bed and the weather both fade out at the stretch's own edges, so the
   * anomaly has no line across it anywhere — the corridor's own **line** is the
   * only absolute in this game and nothing else may look like one.
   */
  it('has no hard edge anywhere, at either end', () => {
    // Far enough below that the stretch itself is off the top of the picture.
    const outsideBelow = drawn(anomaly(1), ANOMALY_SPAN / 2 + DESIGN_HEIGHT / 2 + 100);
    // Warm, because the ramp is at its ceiling — and nothing else: the stretch
    // itself is off the top of the picture.
    expect(outsideBelow.rects.length).toBe(1);
    expect(outsideBelow.strokes.length).toBe(0);

    // And walking in, the weather arrives rather than switching on.
    let previous = 0;
    for (let y = ANOMALY_SPAN / 2 + DESIGN_HEIGHT; y > -ANOMALY_SPAN / 2; y -= 200) {
      const painted = drawn({ ...anomaly(1), inside: true }, y);
      const strength = painted.strokes.reduce((sum, ink) => sum + strengthOf(ink), 0);
      expect(Math.abs(strength - previous)).toBeLessThan(1.5);
      previous = strength;
    }
  });

  it('draws nothing when the picture has no area to draw into', () => {
    const { context, painted } = recorder();
    drawAnomaly(context, anomaly(1), AT(0), 0, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(inks(painted)).toEqual([]);
  });
});
