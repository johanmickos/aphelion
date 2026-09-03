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
import { ION, VOID } from '../../src/render/palette.ts';
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
  const plates: { left: number; right: number; fill: string; alpha: number }[] = [];
  let traced: { x: number; y: number }[] = [];
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
      traced = [];
    },
    moveTo: (x: number, y: number) => {
      pending.push({ x, y });
      traced.push({ x, y });
    },
    // ⚠ **A polyline records as its segments.** This used to `pop` the pending
    // point, so `moveTo, lineTo, lineTo` recorded one line and dropped the rest —
    // invisible while the deadline stroked one segment at a time, and wrong the
    // moment it stopped, which it did on 2026-09-03 to stop the round caps
    // beading at every joint. The last point is carried instead.
    lineTo(x: number, y: number) {
      traced.push({ x, y });
      const from = pending.pop();
      if (from === undefined) return;
      lines.push({
        from,
        to: { x, y },
        stroke: String(context.strokeStyle),
        width: context.lineWidth,
        dash: [...context.dash],
      });
      pending.push({ x, y });
    },
    arc: (x: number, y: number, radius: number) => {
      arcs.push({ x, y, radius });
      traced.push({ x, y });
    },
    fill() {
      // A plate is a traced path — corners and edges — rather than a lone circle,
      // which is how it is told from the dot.
      if (traced.length > 2) {
        plates.push({
          left: Math.min(...traced.map((p) => p.x)),
          right: Math.max(...traced.map((p) => p.x)),
          fill: String(context.fillStyle),
          alpha: context.globalAlpha,
        });
      } else {
        for (const arc of arcs) {
          dots.push({ ...arc, fill: String(context.fillStyle), alpha: context.globalAlpha });
        }
      }
      arcs = [];
      traced = [];
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
    measureText: (says: string) => ({ width: says.length * 20 }),
    strokeText: (says: string) => {
      rimmed = says;
    },
    closePath: () => {},
    fillText(says: string, x: number, y: number) {
      words.push({ says, x, y, alpha: context.globalAlpha, rimmed: rimmed === says });
      rimmed = null;
    },
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    lines,
    dots,
    words,
    gradients,
    plates,
  };
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

/**
 * ⚠ **The track is two strokes a segment now**, so every assertion about *the
 * cue* has to say which of them it is about.
 *
 * A VOID plate goes down under the ink, because the wash the track is drawn over
 * is the same token the track is — at the line the ground reaches `rgb(157, 60,
 * 105)` and the lead-in composited to `rgb(159, 61, 107)`. Splitting by token
 * rather than by index keeps these tests about the ink whatever the plate does.
 */
const ink = (lines: readonly Line[]): Line[] =>
  lines.filter((line) => tokenOf(line.stroke) === ION.toUpperCase());
const plate = (lines: readonly Line[]): Line[] =>
  lines.filter((line) => tokenOf(line.stroke) === VOID.toUpperCase());

describe('the track', () => {
  /**
   * ## ⚠ Rebuilt as a window, 2026-09-03
   *
   * > *"I want the deadline to look like the compass windows, because that's a
   * > familiar pattern."* — author
   *
   * Spec 03 §5 asked for this from the start — *"the deadline is the compass
   * inverted… same window-and-dot grammar"* — and what M3.4 built was one stroke
   * tapering from a hairline to a lead-in, which has no window in it. So the
   * assertion is the compass's two marks: **a thin line the whole way, and a fat
   * band over the stretches where a press still saves.**
   */
  it('draws a thin line the whole way and a fat window on the part that saves', () => {
    const it = drawn(track([true, true, false, false, true, true]));
    const lines = ink(it.lines);
    const widths = [...new Set(lines.map((l) => l.width))].sort((a, b) => a - b);
    // Exactly two weights, and they are the compass's — `RING_WIDTH` and
    // `WINDOW_WIDTH`, one board pixel and three.
    expect(widths).toHaveLength(2);
    expect(widths[1]! / widths[0]!).toBe(3);

    const line = lines.filter((l) => l.width === widths[0]!);
    const window = lines.filter((l) => l.width === widths[1]!);
    // The line is drawn over every segment; the window only over segments whose
    // **both** ends save — here the first pair and the last, with the two-sample
    // gap between them taking three segments out.
    expect(line).toHaveLength(5);
    expect(window).toHaveLength(2);
    // And the window is the brighter of the two, as a compass window is against
    // its ring.
    expect(alphaOf(window[0]!.stroke)).toBeGreaterThan(alphaOf(line[0]!.stroke));
  });

  /**
   * **A gap is absence, not a dimmer copy.** Spec 03 §5's own notice rules the
   * window plural — 8% of doomed drifts hold more than one — so what a gap has to
   * do is separate two windows, and nothing separates better than nothing.
   */
  it('draws no window where a press does not save, and keeps the line there', () => {
    const it = drawn(track([true, true, false, false, true, true]));
    const lines = ink(it.lines);
    const widths = [...new Set(lines.map((l) => l.width))].sort((a, b) => a - b);
    const window = lines.filter((l) => l.width === widths[1]!);
    const line = lines.filter((l) => l.width === widths[0]!);
    // Segment 2 is the gap — sample 2 does not save — so no window covers it and
    // the line still does.
    const gapAt = 100 + 2 * 20;
    expect(window.some((l) => l.from.x === gapAt)).toBe(false);
    expect(line.some((l) => l.from.x === gapAt)).toBe(true);
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

/**
 * ⚠ **The ground the track is drawn on is the same token the track is.**
 *
 * > *"The deadline is hard to see against the ion background along the edge."*
 * > — author, 2026-09-02
 *
 * The boundary's wash is ION over VOID rising to α 0.6 at the line, and at full
 * heat the ground is `rgb(157, 60, 105)` where the track's lead-in composites to
 * `rgb(159, 61, 107)` — the same three numbers. As a ratio the lead-in falls from
 * 2.48:1 in the open field to 1.53:1 at the line, so the instrument is faintest
 * exactly where the decision it marks is. Spec 00 §6's answer, and the SOS's:
 * darken the ground, do not change the ink.
 */
/**
 * ## ⚠ There is no plate, 2026-09-03
 *
 * > *"I also don't love our dark background for the deadline, it's even harder to
 * > see what it is."* — author
 *
 * A VOID plate went under the track on 2026-09-02 against a real measurement —
 * the cue loses 40% of its contrast at the line, where the decision is. It
 * answered the contrast and cost the shape: a dark edging either side of a
 * 2.4-unit ink makes the *casing* the widest part of the mark, so *hard to see*
 * became *hard to see what it is*.
 *
 * What replaces it is width — the window is 9 design units where the track was
 * 2.4. These assertions are the ruling's inverse, so a plate cannot come back
 * without this file being edited on purpose.
 */
describe('the plate the track no longer has', () => {
  it('lays no VOID under the ink anywhere', () => {
    const it = drawn(track([true, true, false, true]));
    expect(plate(it.lines)).toHaveLength(0);
  });

  it('lays none under the dot either', () => {
    const it = drawn(track([true, true, false]));
    expect(it.dots.filter((d) => tokenOf(d.fill) === VOID.toUpperCase())).toHaveLength(0);
    expect(it.dots.filter((d) => tokenOf(d.fill) === ION.toUpperCase()).length).toBeGreaterThan(0);
  });
});

describe('the dot', () => {
  it('sits at the far end of the last saving stretch', () => {
    const it = drawn(track([true, false, true, true, false]));
    // A filled core inside a ring, so it reads as a place rather than a blob.
    expect(it.dots.length).toBeGreaterThan(0);
    for (const dot of it.dots) expect(dot.x).toBeCloseTo(100 + 3 * 20, 6);
    // ION throughout: the plate that used to sit under it is gone.
    for (const dot of it.dots) expect(tokenOf(dot.fill)).toBe(ION.toUpperCase());
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
    expect(alphaOf(ink(half.lines)[0]!.stroke)).toBeLessThan(alphaOf(ink(full.lines)[0]!.stroke));
    const lit = (dots: readonly Dot[]): Dot =>
      dots.filter((d) => tokenOf(d.fill) === ION.toUpperCase())[0]!;
    expect(lit(half.dots).alpha).toBeLessThan(lit(full.dots).alpha);
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
    const full = ink(drawn(track([true, true, true, true])).lines);
    const empty = ink(drawn(track([true, true, true, true], { affordable: 0 })).lines);
    expect(empty).toHaveLength(full.length);
    for (let at = 0; at < full.length; at++) {
      // Same geometry, dimmer ink.
      expect(empty[at]!.from.x).toBeCloseTo(full[at]!.from.x, 6);
      expect(empty[at]!.width).toBeCloseTo(full[at]!.width, 6);
      expect(alphaOf(empty[at]!.stroke)).toBeLessThanOrEqual(alphaOf(full[at]!.stroke));
    }
    const dimmed = full.filter((l, at) => alphaOf(empty[at]!.stroke) < alphaOf(l.stroke));
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

  it('says SOS at the craft', () => {
    const it = strobed(sos());
    expect(it.words).toHaveLength(1);
    expect(it.words[0]!.says).toBe('SOS');
    expect(it.words[0]!.y).toBeCloseTo(CRAFT.y, 6);
    // No bloom: the author refused a glow behind moving text on 2026-08-29,
    // *"it's blurring the legibility"*.
    expect(it.gradients).toHaveLength(0);
  });

  /**
   * ⚠ **On a dark plate, not a rim** (author, 2026-09-02): *"sometimes the SOS
   * gets blended with the ion background."*
   *
   * It was ION over a VOID rim — the callout's treatment, which is right for a
   * word over the field. The SOS fires **at the wall**, where the ground is ION
   * too: at full heat the wash is (135, 52, 92) against the word's (255, 95, 162),
   * the same hue, separated only by lightness. Spec 00 §6's own formula for a
   * readable that must hold is a plate — *"INK on VOID at 88%"* — and spec 05 §5
   * uses it against the anomaly's curtains.
   */
  it('sits on a dark plate wide enough to hold it', () => {
    const it = strobed(sos());
    // The plate is a filled path, drawn before the word and centred on it.
    expect(it.plates).toHaveLength(1);
    const plate = it.plates[0]!;
    expect(plate.fill.slice(0, 7).toUpperCase()).toBe(VOID.toUpperCase());
    // Dark, and translucent rather than opaque.
    const alpha = parseInt(plate.fill.slice(7, 9), 16) / 255;
    expect(alpha).toBeGreaterThan(0.5);
    expect(alpha).toBeLessThan(1);
    // And it covers the word with room either side.
    expect(plate.left).toBeLessThan(it.words[0]!.x);
    expect(plate.right).toBeGreaterThan(it.words[0]!.x);
    expect(plate.right - plate.left).toBeGreaterThan(60);
  });

  /** The plate strobes with the word rather than sitting at a constant. */
  it('strobes the plate with the word', () => {
    const dim = strobed(sos({ strength: 0.45 }));
    const bright = strobed(sos({ strength: 1 }));
    expect(dim.plates[0]!.alpha).toBeLessThan(bright.plates[0]!.alpha);
  });

  /**
   * ⚠ **On the inside — the opposite side from the wall** (author, 2026-09-02):
   * *"can we render the SOS signal on the inside of the ship, opposite side from
   * the wall? I noticed it gets clipped."*
   *
   * It was offset toward the wall, to dodge the prototype's recorded collision
   * with its ship's trail. But the SOS fires **at** the wall, so that offset
   * pushed it past the line and into the clip — measured over the corpus's 346 SOS
   * ticks against the author's phone, clipped on **30%** of them toward the wall
   * and **0%** away.
   */
  it('sits on the far side of the craft from the wall', () => {
    expect(strobed(sos({ toward: 1 })).words[0]!.x).toBeLessThan(CRAFT.x);
    expect(strobed(sos({ toward: -1 })).words[0]!.x).toBeGreaterThan(CRAFT.x);
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
