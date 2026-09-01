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
  const last = Math.max(0, saves.lastIndexOf(true));
  return {
    // Laid out inside the lead-in, so the samples are all in the loud stretch and
    // a test can see what it is asserting about. The profile itself is asserted
    // over a long track further down.
    path: saves.map((s, at) => ({ x: 100 + at * 20, y: 200, saves: s })),
    cross: { x: 100 + last * 20, y: 200 },
    lead: 0.5,
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

describe('the track', () => {
  /**
   * ⚠ **The weight goes where the decision is** (author, 2026-09-01): *"it's
   * really long, impacting my normal playing field... it should only appear
   * closer to the boundary."*
   *
   * The prototype's answer, and it is not a shorter line: the track still reaches
   * the craft, because *"a 150px clamp drew a segment sitting a quarter of a
   * screen ahead of the ship, touching nothing"* — but it is a **hairline** until
   * it is near the cross. Asserted as the profile, over a track long enough to
   * have both ends in it.
   */
  it('is a hairline far from the dot and thickens into it', () => {
    const far = track(new Array<boolean>(40).fill(true));
    // Spread the samples so the track is much longer than the arm.
    const long: DeadlineView = {
      ...far,
      path: far.path.map((p, at) => ({ ...p, x: 100 + at * 60 })),
      cross: { x: 100 + 39 * 60, y: 200 },
    };
    const it = drawn(long);
    const first = it.lines[0]!;
    const last = it.lines[it.lines.length - 1]!;
    expect(last.width).toBeGreaterThan(first.width * 1.5);
    expect(alphaOf(last.stroke)).toBeGreaterThan(alphaOf(first.stroke) * 1.5);
    // And the far end is still drawn — it is the connection to the craft.
    expect(first.width).toBeGreaterThan(0);
    expect(alphaOf(first.stroke)).toBeGreaterThan(0);
  });

  /**
   * The gaps are drawn, faintly. They are part of the shape — the saveable stretch
   * has holes in it — but they are not the offer.
   */
  it('draws the stretches that save brighter than the gaps between them', () => {
    const it = drawn(track([true, true, false, false, true, true]));
    const bright = it.lines.filter((l) => alphaOf(l.stroke) > 0.1);
    const faint = it.lines.filter((l) => alphaOf(l.stroke) <= 0.1);
    expect(bright.length).toBeGreaterThan(0);
    expect(faint.length).toBeGreaterThan(0);
    expect(Math.min(...bright.map((l) => alphaOf(l.stroke)))).toBeGreaterThan(
      Math.max(...faint.map((l) => alphaOf(l.stroke))),
    );
  });

  /** It stops at the dot: the stretch past the last saving press is not a decision. */
  it('draws nothing past the dot', () => {
    const it = drawn(track([true, true, false, false, false]));
    for (const line of it.lines) {
      expect(Math.max(line.from.x, line.to.x)).toBeLessThanOrEqual(it.dots[0]!.x + 1e-6);
    }
  });

  /**
   * ⚠ **Nothing is dashed** (author, 2026-09-01). Spec 03 §5 puts a dashed line
   * past the dot — refused with the dashes that were on the bands.
   */
  it('draws nothing dashed', () => {
    for (const line of drawn(track([true, true, false])).lines) {
      expect(line.dash).toHaveLength(0);
    }
  });

  /**
   * And **no rescue path**. The prototype draws the escape swing its mark offers;
   * the author refused the same shape one instrument along on the same day.
   */
  it('draws no predicted orbit of any kind', () => {
    expect(drawn(track([true, true, false])).gradients).toHaveLength(0);
  });
});

describe('the dot', () => {
  it('sits at the far end of the last saving stretch', () => {
    const it = drawn(track([true, false, true, true, false]));
    // A filled core inside a ring, so it reads as a place rather than a blob.
    expect(it.dots.length).toBeGreaterThan(0);
    for (const dot of it.dots) expect(dot.x).toBeCloseTo(100 + 3 * 20, 6);
    expect(tokenOf(it.dots[0]!.fill)).toBe(ION.toUpperCase());
  });
});

describe('the fade', () => {
  it('draws nothing at all before it has come up', () => {
    const it = drawn(track([true, true, false], { presence: 0 }));
    expect(it.lines).toHaveLength(0);
    expect(it.dots).toHaveLength(0);
  });

  it('brings the whole track up together', () => {
    const half = drawn(track([true, true, false], { presence: 0.5 }));
    const full = drawn(track([true, true, false], { presence: 1 }));
    expect(alphaOf(half.lines[0]!.stroke)).toBeLessThan(alphaOf(full.lines[0]!.stroke));
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
  it('dims what the tank cannot afford, and moves nothing', () => {
    const full = drawn(track([true, true, true, true]));
    const empty = drawn(track([true, true, true, true], { affordable: 0 }));
    expect(empty.lines).toHaveLength(full.lines.length);
    for (let at = 0; at < full.lines.length; at++) {
      // Same geometry, dimmer ink.
      expect(empty.lines[at]!.from.x).toBeCloseTo(full.lines[at]!.from.x, 6);
      expect(empty.lines[at]!.width).toBeCloseTo(full.lines[at]!.width, 6);
      expect(alphaOf(empty.lines[at]!.stroke)).toBeLessThanOrEqual(alphaOf(full.lines[at]!.stroke));
    }
    const dimmed = full.lines.filter(
      (l, at) => alphaOf(empty.lines[at]!.stroke) < alphaOf(l.stroke),
    );
    expect(dimmed.length).toBeGreaterThan(0);
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
