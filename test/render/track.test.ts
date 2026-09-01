/**
 * The deadline track and the SOS, as a canvas is actually asked to draw them.
 *
 * The same discipline `test/render/bands.test.ts` is written under, and against
 * the same recorded failure: a claim about what a canvas does, written without
 * ever asking one. Every assertion below is about a call the renderer really
 * makes.
 *
 * What the numbers *mean* — where a press saves, what the dot is — is
 * `test/sim/rescue.test.ts` and `test/state/deadline.test.ts`, without a canvas.
 */
import { describe, expect, it } from 'vitest';
import { BOARD_PIXEL } from '../../src/state/design.ts';
import type { CraftView, DeadlineView, SosView } from '../../src/state/types.ts';
import { UNDEFORMED } from '../../src/state/deformation.ts';
import { ION } from '../../src/render/palette.ts';
import { drawDeadline, drawSos } from '../../src/render/deadline.ts';

interface Line {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly stroke: string;
  readonly width: number;
  readonly dash: readonly number[];
}
interface Dot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fill: string;
  readonly alpha: number;
}
interface Word {
  readonly says: string;
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly rimmed: boolean;
}

/** A context that writes down everything it is asked for. */
function recorder() {
  const lines: Line[] = [];
  const dots: Dot[] = [];
  const words: Word[] = [];
  const gradients: unknown[] = [];
  let pending: { x: number; y: number }[] = [];
  let arcs: { x: number; y: number; radius: number }[] = [];
  let rimmed: string | null = null;
  const context = {
    canvas: { width: 1170, height: 2532 },
    globalAlpha: 1,
    strokeStyle: '' as unknown,
    fillStyle: '' as unknown,
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    dash: [] as number[],
    save: () => {},
    restore: () => {},
    setLineDash(next: number[]) {
      context.dash = [...next];
    },
    beginPath: () => {
      pending = [];
      arcs = [];
    },
    moveTo: (x: number, y: number) => pending.push({ x, y }),
    lineTo(x: number, y: number) {
      const from = pending.pop();
      if (from === undefined) throw new Error('a lineTo with no moveTo before it');
      lines.push({
        from,
        to: { x, y },
        stroke: String(context.strokeStyle),
        width: context.lineWidth,
        dash: [...context.dash],
      });
    },
    arc: (x: number, y: number, radius: number) => arcs.push({ x, y, radius }),
    fill() {
      for (const arc of arcs) {
        dots.push({ ...arc, fill: String(context.fillStyle), alpha: context.globalAlpha });
      }
      arcs = [];
    },
    stroke: () => {},
    fillRect: () => {},
    createLinearGradient: () => {
      gradients.push(1);
      return { addColorStop: () => {} };
    },
    createRadialGradient: () => {
      gradients.push(1);
      return { addColorStop: () => {} };
    },
    measureText: () => ({ width: 0 }),
    strokeText: (says: string) => {
      rimmed = says;
    },
    fillText(says: string, x: number, y: number) {
      words.push({ says, x, y, alpha: context.globalAlpha, rimmed: rimmed === says });
      rimmed = null;
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, lines, dots, words, gradients };
}

/** A track with `saves` laid out along a straight line, for readability. */
function track(saves: readonly boolean[], over: Partial<DeadlineView> = {}): DeadlineView {
  return {
    path: saves.map((s, at) => ({ x: 100 + at * 50, y: 200, saves: s })),
    cross: saves.lastIndexOf(true) < 0 ? null : { x: 100 + saves.lastIndexOf(true) * 50, y: 200 },
    presence: 1,
    affordable: 1,
    ...over,
  };
}

const CRAFT: CraftView = {
  x: 500,
  y: 900,
  heading: 0,
  speed: 100,
  energy: 2,
  bloom: 0,
  deformation: UNDEFORMED,
};

function drawn(view: DeadlineView) {
  const it = recorder();
  drawDeadline(it.context, view);
  return it;
}

/** How opaque a `dim`med colour came out — the last byte of `#RRGGBBAA`. */
const alphaOf = (colour: string): number => parseInt(colour.slice(7, 9), 16) / 255;
const tokenOf = (colour: string): string => colour.slice(0, 7).toUpperCase();

describe('the windows', () => {
  /**
   * **Every window, which is the author's ruling of 2026-09-01.** The saveable
   * stretch has gaps in it — measured, 8% of doomed drifts hold more than one as a
   * second body comes into range — and drawing only the last would tell a player
   * who *can* save that the chance is still ahead of them.
   */
  it('draws one thick stretch per saveable run, not one for the lot', () => {
    const thick = (saves: boolean[]) =>
      drawn(track(saves)).lines.filter((l) => l.width > 2 * BOARD_PIXEL);
    expect(thick([true, true, false, false])).toHaveLength(1);
    expect(thick([true, true, false, true, true])).toHaveLength(2);
    expect(thick([true, false, true, false, true])).toHaveLength(3);
    expect(thick([false, false, false])).toHaveLength(0);
  });

  it('draws each window across the stretch that actually saves', () => {
    const it = drawn(track([false, true, true, false]));
    const thick = it.lines.filter((l) => l.width > 2 * BOARD_PIXEL);
    expect(thick).toHaveLength(1);
    // The samples at index 1 and 2, which is x 150 to 200.
    expect(thick[0]!.from.x).toBeCloseTo(150, 6);
    expect(thick[0]!.to.x).toBeCloseTo(200, 6);
  });

  /**
   * ⚠ **Nothing is dashed** (author, 2026-09-01). Spec 03 §5 puts a dashed line
   * past the dot — *"the future thins out"* — and it is refused with the dashes
   * that were on the bands. Past the dot the track goes out and the SOS takes
   * over.
   */
  it('draws nothing dashed, and nothing past the dot', () => {
    const it = drawn(track([true, true, false, false, false]));
    for (const line of it.lines) expect(line.dash).toHaveLength(0);
    const dot = it.dots[0]!;
    for (const line of it.lines) {
      expect(Math.max(line.from.x, line.to.x)).toBeLessThanOrEqual(dot.x + 1e-6);
    }
  });

  /**
   * And **no rescue path**. The prototype draws the escape swing its mark is
   * offering; the author refused the same shape one instrument along on the same
   * day — *"we should not show the oval orbit like this when it's not the true
   * ship trajectory."* A rescue path is a predicted orbit for a press nobody has
   * made.
   */
  it('draws no predicted orbit of any kind', () => {
    const it = drawn(track([true, true, false]));
    // One dot and nothing else curved; no gradients, which is what a bloom or a
    // halo would need.
    expect(it.dots).toHaveLength(1);
    expect(it.gradients).toHaveLength(0);
  });
});

describe('the dot', () => {
  it('sits at the far end of the last window', () => {
    const it = drawn(track([true, false, true, true, false]));
    expect(it.dots).toHaveLength(1);
    expect(it.dots[0]!.x).toBeCloseTo(100 + 3 * 50, 6);
    expect(tokenOf(it.dots[0]!.fill)).toBe(ION.toUpperCase());
  });

  it('is absent when nothing saves', () => {
    expect(drawn(track([false, false, false])).dots).toHaveLength(0);
  });
});

describe('the fade', () => {
  /** Spec 03 §5's 300ms, and nothing at all at zero. */
  it('draws nothing at all before it has faded in', () => {
    const it = drawn(track([true, true, false], { presence: 0 }));
    expect(it.lines).toHaveLength(0);
    expect(it.dots).toHaveLength(0);
  });

  it('brings the whole track up together', () => {
    const half = drawn(track([true, true, false], { presence: 0.5 }));
    const full = drawn(track([true, true, false], { presence: 1 }));
    const thick = (it: typeof half) => it.lines.filter((l) => l.width > 2 * BOARD_PIXEL)[0]!;
    expect(alphaOf(thick(half).stroke)).toBeLessThan(alphaOf(thick(full).stroke));
    expect(half.dots[0]!.alpha).toBeLessThan(full.dots[0]!.alpha);
  });
});

describe('the fuel coupling', () => {
  /**
   * Spec 03 §5: *"by luminance, never geometry — only the fraction of the window
   * the tank can afford stays lit."* Nothing takes this path today
   * ([`affordable`](../../src/state/types.ts) is 1), so it is asserted against a
   * hand-set value: what M4.4 changes must be a number, not this file.
   */
  it('dims the part of a window the tank cannot afford, and moves nothing', () => {
    const full = drawn(track([true, true, false]));
    const empty = drawn(track([true, true, false], { affordable: 0 }));
    const thick = (it: typeof full) => it.lines.filter((l) => l.width > 2 * BOARD_PIXEL);
    expect(thick(full)).toHaveLength(1);
    expect(thick(empty)).toHaveLength(1);
    // Same geometry, dimmer ink.
    expect(thick(empty)[0]!.from.x).toBeCloseTo(thick(full)[0]!.from.x, 6);
    expect(thick(empty)[0]!.to.x).toBeCloseTo(thick(full)[0]!.to.x, 6);
    expect(alphaOf(thick(empty)[0]!.stroke)).toBeLessThan(alphaOf(thick(full)[0]!.stroke));
  });
});

describe('the SOS', () => {
  const sos = (over: Partial<SosView> = {}): SosView => ({
    toward: 1,
    strength: 1,
    held: false,
    ...over,
  });
  function strobed(view: SosView) {
    const it = recorder();
    drawSos(it.context, view, CRAFT);
    return it;
  }

  it('says SOS at the craft, rimmed rather than bloomed', () => {
    const it = strobed(sos());
    expect(it.words).toHaveLength(1);
    expect(it.words[0]!.says).toBe('SOS');
    expect(it.words[0]!.y).toBeCloseTo(CRAFT.y, 6);
    // Rimmed, because it is read over the boundary's own brightest ground and the
    // author refused a glow behind moving text on 2026-08-29.
    expect(it.words[0]!.rimmed).toBe(true);
    expect(it.gradients).toHaveLength(0);
  });

  /**
   * **Offset toward the wall it is about**, which avoids the prototype's own
   * recorded defect by construction: it put its mark on the away-from-the-boundary
   * axis and found *"that is the same direction as the wake for every wall — so it
   * was drawn over the ship's trail every single time."*
   */
  it('sits between the craft and the wall it is about', () => {
    expect(strobed(sos({ toward: 1 })).words[0]!.x).toBeGreaterThan(CRAFT.x);
    expect(strobed(sos({ toward: -1 })).words[0]!.x).toBeLessThan(CRAFT.x);
  });

  it('strobes by brightness and never moves', () => {
    const dim = strobed(sos({ strength: 0.45 }));
    const bright = strobed(sos({ strength: 1 }));
    expect(dim.words[0]!.alpha).toBeLessThan(bright.words[0]!.alpha);
    expect(dim.words[0]!.x).toBeCloseTo(bright.words[0]!.x, 6);
  });

  /** The same word either way — the two states are one meaning, not two signals. */
  it('says the same thing whether a drift or a grab armed it', () => {
    expect(strobed(sos({ held: true })).words[0]!.says).toBe(
      strobed(sos({ held: false })).words[0]!.says,
    );
  });
});
