/**
 * The fuel halo as the canvas is asked for it — spec
 * [13 · §5](../../docs/spec/13-fuel.md)'s three states and spec
 * [03 · §2](../../docs/spec/03-hud.md)'s *"not a corner gauge"*.
 *
 * Asserted through a context that writes down what it was asked for, which is
 * [AGENTS.md](../../AGENTS.md) §4's rule for the render layer: the observable is
 * the arc the canvas was handed, not the expression that produced it.
 */
import { describe, expect, it } from 'vitest';
import { HALO_RADIUS, HALO_WIDTH, drawHalo } from '../../src/render/halo.ts';
import { haloOf } from '../../src/state/fuel.ts';
import { CORE, DUSK, ION } from '../../src/render/palette.ts';
import { E1_BLOOM, E2_BLOOM } from '../../src/state/energy.ts';

interface Arc {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly from: number;
  readonly to: number;
  readonly stroke: string;
  readonly width: number;
}

/** A context that records the arcs it is stroked with. */
function recorder(): { arcs: Arc[]; context: CanvasRenderingContext2D } {
  const arcs: Arc[] = [];
  let pending: Omit<Arc, 'stroke' | 'width'> | null = null;
  const context = {
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    save: () => {},
    restore: () => {},
    beginPath: () => {
      pending = null;
    },
    arc: (x: number, y: number, radius: number, from: number, to: number) => {
      pending = { x, y, radius, from, to };
    },
    stroke() {
      if (pending !== null) {
        arcs.push({ ...pending, stroke: String(context.strokeStyle), width: context.lineWidth });
      }
    },
  };
  return { arcs, context: context as unknown as CanvasRenderingContext2D };
}

const drawn = (level: number, tick = 0): Arc[] => {
  const it = recorder();
  drawHalo(it.context, haloOf({ level }, tick), 500, 900);
  return it.arcs;
};

const tokenOf = (colour: string): string => colour.slice(0, 7).toUpperCase();
const alphaOf = (colour: string): number => parseInt(colour.slice(7, 9), 16) / 255;

describe('the halo', () => {
  /** *"A halo arc around the craft"* — on the craft, at one radius, at one width. */
  it('is drawn on the craft', () => {
    for (const arc of drawn(0.7)) {
      expect(arc.x).toBe(500);
      expect(arc.y).toBe(900);
      expect(arc.radius).toBe(HALO_RADIUS);
      expect(arc.width).toBe(HALO_WIDTH);
    }
  });

  /**
   * **Inside the craft's own light and outside its silhouette.** *"The cause and
   * the gauge finally sharing a pixel"* — so the gauge sits within the bloom it
   * is a gauge of, and clear of the 27-unit dart.
   */
  it('sits between the dart and the bloom', () => {
    expect(HALO_RADIUS).toBeGreaterThan(27);
    expect(HALO_RADIUS).toBeLessThan(E2_BLOOM);
    expect(HALO_RADIUS).toBeGreaterThan(E1_BLOOM);
  });

  /** The sweep is the tank, and nothing else about the drawing moves with it. */
  it('sweeps by exactly the tank', () => {
    for (const level of [0.25, 0.5, 1]) {
      const [arc] = drawn(level);
      expect(arc!.to - arc!.from).toBeCloseTo(level * Math.PI * 2, 10);
    }
  });

  /** *"An empty tank"* draws no gauge — but the ring is still there, hollowed. */
  it('draws nothing but structure at a quarter of nothing', () => {
    expect(drawn(0)).toHaveLength(2);
    expect(tokenOf(drawn(0)[0]!.stroke)).toBe(DUSK.toUpperCase());
    expect(tokenOf(drawn(0)[1]!.stroke)).toBe(ION.toUpperCase());
  });

  /**
   * Spec 03 §4: severity is one hue at three energies, and the hue is never
   * yellow and never a skull. CORE while there is nothing to warn about — the
   * craft's own token — and ION once the tank can cost the run.
   */
  it('turns ION only when it can cost the run', () => {
    expect(tokenOf(drawn(1)[0]!.stroke)).toBe(CORE.toUpperCase());
    expect(tokenOf(drawn(0.5)[0]!.stroke)).toBe(CORE.toUpperCase());
    expect(tokenOf(drawn(0.2)[0]!.stroke)).toBe(ION.toUpperCase());
  });

  /** And the warning breathes rather than blinking out — the SOS's own floor. */
  it('never goes out while it is warning', () => {
    const lows = Array.from({ length: 80 }, (_, tick) => alphaOf(drawn(0.2, tick)[0]!.stroke));
    expect(Math.min(...lows)).toBeGreaterThan(0.4);
    expect(Math.max(...lows)).toBeGreaterThan(Math.min(...lows));
  });

  /**
   * It does not turn with the craft: the arc's own datum is the top of the
   * picture, so the gauge is read from a still mark while the dart rotates onto
   * its velocity every tick.
   */
  it('starts at the top of the picture, always', () => {
    for (const level of [0.1, 0.5, 1]) {
      expect(drawn(level)[0]!.from).toBeCloseTo(-Math.PI / 2, 10);
    }
  });
});
