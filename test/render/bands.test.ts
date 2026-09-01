/**
 * The boundary, as a canvas is actually asked to draw it.
 *
 * ## Why this file exists and what it is defending against
 *
 * `docs/plan/m3-the-field.md` records the failure this is written against: on
 * 2026-09-01 a claim in a comment — *"a slow field stipples into three-unit
 * dots"* — turned out to be a statement about what a canvas does, written
 * without ever asking one. The layer drew nothing on 34% of ticks and a test
 * asserted the **intent** rather than the **claim**.
 *
 * This step draws gradients, dashed lines, alpha ramps and text over the
 * brightest ground in the game, so every assertion below is about a call the
 * renderer really makes: which stops a gradient got, what alpha a dash was
 * stroked at, how many labels came out and what they said.
 *
 * **The law itself is `test/state/boundary.test.ts`** — where the bands are and
 * how hot they get needs no canvas, and is asserted without one.
 *
 * ⚠ Not to be confused with `test/render/boundary.test.ts`, which is about the
 * **layer** boundary — that the renderer imports nothing from `src/sim/`
 * (ADR-0006). That file is older than the game having a boundary of its own.
 */
import { describe, expect, it } from 'vitest';
import { METRE } from '../../src/sim/units.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import { FIRE_BAND, HEAT_CAP, OUTER_BAND, heatOf } from '../../src/state/boundary.ts';
import type { BoundarySideView, CameraView } from '../../src/state/types.ts';
import { AURORA, ION } from '../../src/render/palette.ts';
import { boundaryMotes, drawBoundary } from '../../src/render/boundary.ts';
import { boundaryOf } from '../../src/state/boundary.ts';
import { followCamera, openCamera } from '../../src/state/camera.ts';
import { visible } from '../../src/render/letterbox.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState } from '../../src/sim/step.ts';

const CENTRELINE = 585;
const HALF_WIDTH = 1111.5;
const AT: CameraView = { x: CENTRELINE, y: 0, lock: 0, offset: 0 };
/** What the design space itself shows — a phone, in other words (spec 00 §7). */
const PHONE = { left: 0, top: 0, right: DESIGN_WIDTH, bottom: DESIGN_HEIGHT };
/** A window wide enough to show the whole corridor, which is where the bands are. */
const WIDE = {
  left: CENTRELINE - HALF_WIDTH - 40,
  top: 0,
  right: CENTRELINE + HALF_WIDTH + 40,
  bottom: DESIGN_HEIGHT,
};

const MOTES = boundaryMotes(0xed6e);

/** One side, placed by hand so a test may put the craft anywhere it likes. */
function side(over: Partial<BoundarySideView> = {}): BoundarySideView {
  const away = over.away ?? OUTER_BAND;
  const closing = over.closing ?? 0;
  return {
    line: CENTRELINE + HALF_WIDTH,
    inward: -1,
    away,
    closing,
    heat: heatOf(closing, away),
    // Fully up unless a test says otherwise. Every assertion below except the
    // presence ones is about what the boundary draws **once it is drawn at all**,
    // which is the craft out at the wall — see `describe('presence')`.
    presence: 1,
    sheltered: false,
    ...over,
  };
}

/** The left line, for the assertions that need both. */
function leftSide(over: Partial<BoundarySideView> = {}): BoundarySideView {
  return side({ line: CENTRELINE - HALF_WIDTH, inward: 1, ...over });
}

interface Stop {
  readonly at: number;
  readonly colour: string;
}
interface Gradient {
  readonly x0: number;
  readonly x1: number;
  readonly stops: Stop[];
}
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
  readonly alpha: number;
  readonly fill: string;
}
interface Word {
  readonly says: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly alpha: number;
  readonly font: string;
  readonly rimmed: boolean;
}

/**
 * A context that writes down everything it is asked for.
 *
 * Deliberately not the census's counter: that one tallies, and what these
 * assertions need is the arguments themselves — which stop, at what alpha, and
 * whether a dash was set when the stroke went down.
 */
function recorder() {
  const gradients: Gradient[] = [];
  const lines: Line[] = [];
  const rects: { x: number; y: number; w: number; h: number; fill: unknown }[] = [];
  const dots: Dot[] = [];
  const words: Word[] = [];
  let pending: { x: number; y: number }[] = [];
  let arcs: { x: number; y: number; radius: number }[] = [];
  let lastStroked: string | null = null;

  const context = {
    canvas: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
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
    save: () => {},
    restore: () => {},
    setLineDash(next: number[]) {
      context.dash = [...next];
    },
    dash: [] as number[],
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
        dots.push({ ...arc, alpha: context.globalAlpha, fill: String(context.fillStyle) });
      }
      arcs = [];
    },
    stroke: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: context.fillStyle });
    },
    createLinearGradient(x0: number, _y0: number, x1: number, _y1: number) {
      const stops: Stop[] = [];
      const gradient = {
        addColorStop: (at: number, colour: string) => stops.push({ at, colour }),
      };
      gradients.push({ x0, x1, stops });
      return gradient;
    },
    measureText: () => ({ width: 0 }),
    strokeText: (says: string) => {
      lastStroked = says;
    },
    fillText(says: string, x: number, y: number) {
      words.push({
        says,
        x,
        y,
        fill: String(context.fillStyle),
        alpha: context.globalAlpha,
        font: context.font,
        rimmed: lastStroked === says,
      });
      lastStroked = null;
    },
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    gradients,
    lines,
    rects,
    dots,
    words,
  };
}

function drawn(sides: readonly BoundarySideView[], seen = WIDE, camera = AT) {
  const it = recorder();
  drawBoundary(it.context, MOTES, sides, camera, seen);
  return it;
}

/** How opaque a `dim`med colour came out — the last byte of `#RRGGBBAA`. */
function alphaOf(colour: string): number {
  return parseInt(colour.slice(7, 9), 16) / 255;
}

/** The token a `dim`med colour is, ignoring its alpha. */
function tokenOf(colour: string): string {
  return colour.slice(0, 7).toUpperCase();
}

describe('the gradient', () => {
  /**
   * Spec 07 §2, and it is the one thing the section refuses in the same sentence
   * it states the geometry: *"positions are drawn in world space; the gradient
   * never sits on the screen edges, so it reads as geography rather than as a
   * vignette."*
   *
   * The strongest available form of that is **the gradient does not move when
   * the picture does**: it is pinned to the line, so panning the camera moves the
   * picture across it rather than dragging it along.
   */
  it('is pinned to the line and not to the picture', () => {
    const at = drawn([side()], WIDE, AT);
    const moved = drawn([side()], WIDE, { ...AT, x: CENTRELINE + 300 });
    expect(at.gradients).toHaveLength(1);
    expect(moved.gradients).toHaveLength(1);
    expect(moved.gradients[0]!.x0).toBeCloseTo(at.gradients[0]!.x0, 6);
    expect(moved.gradients[0]!.x1).toBeCloseTo(at.gradients[0]!.x1, 6);
    // And it starts at the outer band's inner edge and ends on the line.
    expect(at.gradients[0]!.x1).toBeCloseTo(CENTRELINE + HALF_WIDTH, 6);
    expect(at.gradients[0]!.x0).toBeCloseTo(CENTRELINE + HALF_WIDTH - OUTER_BAND, 6);
  });

  /** Spec 07 §3: the gradient's intensity **is** the heat. */
  it('brightens with heat and with nothing else', () => {
    const calm = drawn([side({ closing: 0 })]).gradients[0]!;
    const diving = drawn([side({ closing: 300 * METRE })]).gradients[0]!;
    for (let i = 1; i < calm.stops.length; i++) {
      expect(alphaOf(diving.stops[i]!.colour)).toBeGreaterThan(alphaOf(calm.stops[i]!.colour));
    }
    // The field-facing end is transparent at every heat, which is what stops the
    // band having an edge of its own.
    expect(alphaOf(calm.stops[0]!.colour)).toBe(0);
    expect(alphaOf(diving.stops[0]!.colour)).toBe(0);
    // And it is brightest at the line.
    const last = diving.stops[diving.stops.length - 1]!;
    expect(alphaOf(last.colour)).toBeGreaterThan(alphaOf(diving.stops[1]!.colour));
  });

  it('steps where the price steps', () => {
    const stops = drawn([side({ closing: 200 * METRE })]).gradients[0]!.stops;
    expect(stops).toHaveLength(3);
    expect(stops[1]!.at).toBeCloseTo((OUTER_BAND - FIRE_BAND) / OUTER_BAND, 6);
  });
});

describe('the band edges', () => {
  /** Spec 07 §2 states all four numbers: 1px, dash 4/6, α 0.25 and α 0.40. */
  it('are dashed, at the two stated distances and alphas', () => {
    const line = CENTRELINE + HALF_WIDTH;
    const dashed = drawn([side()]).lines.filter((l) => l.dash.length > 0);
    expect(dashed).toHaveLength(2);
    const outer = dashed.find((l) => Math.abs(l.from.x - (line - OUTER_BAND)) < 1e-6);
    const fire = dashed.find((l) => Math.abs(l.from.x - (line - FIRE_BAND)) < 1e-6);
    expect(outer).toBeDefined();
    expect(fire).toBeDefined();
    expect(alphaOf(outer!.stroke)).toBeCloseTo(0.25, 2);
    expect(alphaOf(fire!.stroke)).toBeCloseTo(0.4, 2);
    expect(outer!.dash).toEqual([4 * 3, 6 * 3]);
  });

  /** Spec 07 §2 says so outright: *"they do not scale with `heat`."* */
  it('do not move or brighten with heat', () => {
    const calm = drawn([side({ closing: 0 })]).lines.filter((l) => l.dash.length > 0);
    const hot = drawn([side({ closing: 400 * METRE })]).lines.filter((l) => l.dash.length > 0);
    expect(hot).toHaveLength(calm.length);
    for (let i = 0; i < calm.length; i++) {
      expect(hot[i]!.stroke).toBe(calm[i]!.stroke);
      expect(hot[i]!.from.x).toBeCloseTo(calm[i]!.from.x, 6);
    }
  });
});

describe('the line', () => {
  /** Spec 07 §3: *"a 2.5px ION stroke whose α and bloom also rise with `heat`."* */
  it('is 2.5px and brightens with heat', () => {
    const line = CENTRELINE + HALF_WIDTH;
    const solid = (closing: number) =>
      drawn([side({ closing })]).lines.filter(
        (l) => l.dash.length === 0 && Math.abs(l.from.x - line) < 1e-6,
      );
    const calm = solid(0);
    const hot = solid(400 * METRE);
    expect(calm).toHaveLength(1);
    expect(calm[0]!.width).toBeCloseTo(2.5 * 3, 6);
    expect(alphaOf(hot[0]!.stroke)).toBeGreaterThan(alphaOf(calm[0]!.stroke));
    // It never goes out, because the line is the one absolute (spec 07 §1).
    expect(alphaOf(calm[0]!.stroke)).toBeGreaterThan(0.5);
  });
});

describe('the motes', () => {
  /** Spec 07 §2's GONE row: *"absent — even the reward stops promising."* */
  it('never exist past the line', () => {
    const line = CENTRELINE + HALF_WIDTH;
    for (const closing of [0, 200 * METRE, 500 * METRE]) {
      for (const dot of drawn([side({ closing, away: -20 })]).dots) {
        expect(dot.x).toBeLessThanOrEqual(line);
      }
    }
  });

  /**
   * Spec 07's acceptance: *"mote density is a pure function of band."* The fire
   * band is 270 design units wide against the outer band's 390 and holds more
   * motes, so it is denser in the only sense a count over an area can be.
   */
  it('are denser in the fire band than in the outer one', () => {
    const line = CENTRELINE + HALF_WIDTH;
    const dots = drawn([side()]).dots;
    const inFire = dots.filter((d) => line - d.x <= FIRE_BAND).length;
    const inOuter = dots.filter((d) => line - d.x > FIRE_BAND && line - d.x <= OUTER_BAND).length;
    expect(inFire).toBeGreaterThan(0);
    expect(inOuter).toBeGreaterThan(0);
    expect(inFire / FIRE_BAND).toBeGreaterThan((inOuter / (OUTER_BAND - FIRE_BAND)) * 1.5);
  });

  /** *"Denser and brighter deeper in"* — spec 07 §1's second law, in both channels. */
  it('are brighter and bigger deeper in', () => {
    const line = CENTRELINE + HALF_WIDTH;
    const dots = drawn([side()]).dots;
    // The bloom pass draws the same motes wider and dimmer, so it is excluded by
    // taking, at each depth, the brightest dot drawn there.
    const deep = dots.filter((d) => line - d.x < FIRE_BAND / 3);
    const shallow = dots.filter((d) => line - d.x > OUTER_BAND - (OUTER_BAND - FIRE_BAND) / 3);
    expect(deep.length).toBeGreaterThan(0);
    expect(shallow.length).toBeGreaterThan(0);
    expect(Math.max(...deep.map((d) => d.alpha))).toBeGreaterThan(
      Math.max(...shallow.map((d) => d.alpha)),
    );
    expect(Math.min(...deep.map((d) => d.radius))).toBeGreaterThan(
      Math.min(...shallow.map((d) => d.radius)),
    );
  });

  /** They rise with heat, and — [`MOTE_AT_REST`](../../src/render/boundary.ts) — never go out. */
  it('brighten with heat without ever going dark', () => {
    const calm = drawn([side({ closing: 0 })]).dots;
    const hot = drawn([side({ closing: 400 * METRE })]).dots;
    expect(Math.max(...hot.map((d) => d.alpha))).toBeGreaterThan(
      Math.max(...calm.map((d) => d.alpha)),
    );
    expect(Math.min(...calm.map((d) => d.alpha))).toBeGreaterThan(0);
  });

  /** A mote does not move when the picture does: it is world-anchored, like the dust. */
  it('hang in the world rather than on the screen', () => {
    const at = drawn([side()], WIDE, AT).dots.map((d) => d.x);
    const moved = drawn([side()], WIDE, { ...AT, x: CENTRELINE + 300 }).dots.map((d) => d.x);
    expect(moved).toEqual(at);
  });
});

describe('what the bands say', () => {
  /**
   * ⚠ **The `×2` and `×3` labels are gone** (author, 2026-09-01): *"I don't want
   * the 2x 3x text in the hot zone. Let the user discover that themselves."*
   *
   * Spec 07's header carries a ruling of 2026-08-27 that put those labels *in*,
   * overturning the board's own second law — *"reward is shown, never spoken"*.
   * This overturns it back, so the board's law stands.
   *
   * **Asserted as no text at all**, which is stronger than what it replaces. The
   * old test checked that every drawn word matched `×2` or `×3`, which is spec
   * 07 §7's *fact, not instruction* line held at one remove; this holds it at
   * zero. There is nothing to drift.
   */
  it('draws no text anywhere, at any heat or depth', () => {
    for (const closing of [0, 100, 200, 400, 800].map((m) => m * METRE)) {
      for (const away of [OUTER_BAND, FIRE_BAND, 20 * METRE, -10]) {
        const it = drawn([side({ closing, away }), leftSide({ closing, away })]);
        expect(it.words).toHaveLength(0);
        // And it did draw the band, so this is a refusal rather than an empty
        // frame passing for one.
        expect(it.dots.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * What is left saying what a band pays is spec 07 §1's own second law —
   * *"denser and brighter deeper in"* — which the player reads by going there.
   * That is asserted above under `the motes`; this is the promise that nothing
   * else crept in to say it instead.
   */
  it('says it in motes and in nothing else', () => {
    const it = drawn([side({ closing: 300 * METRE })]);
    expect(it.words).toHaveLength(0);
    // Lines are the two band edges and the line itself, and nothing more.
    expect(it.lines.filter((l) => l.dash.length > 0)).toHaveLength(2);
    expect(it.lines.filter((l) => l.dash.length === 0)).toHaveLength(1);
  });
});

describe('the shelter', () => {
  /**
   * Spec 05 §5, ruled 2026-09-01: inside a shelter the bands *"keep their
   * geometry and their closing-speed law and are drawn in **AURORA instead of
   * ION**."*
   *
   * **One channel changes.** So this is asserted twice over: every drawn colour
   * moves, and every drawn *position* stays exactly where it was.
   */
  it('repaints the whole boundary AURORA and moves nothing', () => {
    const ion = drawn([side({ closing: 300 * METRE })]);
    const aurora = drawn([side({ closing: 300 * METRE, sheltered: true })]);

    const tokens = (it: ReturnType<typeof drawn>) =>
      new Set([
        ...it.gradients.flatMap((g) => g.stops.map((s) => tokenOf(s.colour))),
        ...it.lines.map((l) => tokenOf(l.stroke)),
        ...it.dots.map((d) => tokenOf(d.fill)),
        ...it.words.map((w) => tokenOf(w.fill)),
      ]);
    expect(tokens(ion)).toEqual(new Set([ION.toUpperCase()]));
    expect(tokens(aurora)).toEqual(new Set([AURORA.toUpperCase()]));

    // The geometry is untouched, which is the *and only the line* half of the
    // ruling: a sheltered boundary is the same picture in a different colour.
    expect(aurora.lines.map((l) => [l.from.x, l.to.x, l.width, l.dash.join()])).toEqual(
      ion.lines.map((l) => [l.from.x, l.to.x, l.width, l.dash.join()]),
    );
    expect(aurora.dots.map((d) => [d.x, d.y, d.radius, d.alpha])).toEqual(
      ion.dots.map((d) => [d.x, d.y, d.radius, d.alpha]),
    );
    expect(
      aurora.gradients.map((g) => [g.x0, g.x1, g.stops.map((s) => alphaOf(s.colour))]),
    ).toEqual(ion.gradients.map((g) => [g.x0, g.x1, g.stops.map((s) => alphaOf(s.colour))]));
  });
});

describe('what a phone actually sees', () => {
  /**
   * ⚠ **The measurement that this whole step ran into**, kept as a test so that
   * it cannot quietly stop being true — and so that whatever the author rules
   * about it fails here first.
   *
   * Spec 00 §7 makes the width the contract, so a phone gets the design space's
   * exact width and no horizontal bleed. Against this corridor that leaves the
   * line 527 design units — 176 m — outside the picture, and none of the fire
   * band on it.
   */
  it('shows a third of the outer band, none of the fire band, and no line', () => {
    const edge = DESIGN_WIDTH / 2;
    const outer = HALF_WIDTH - OUTER_BAND;
    const fire = HALF_WIDTH - FIRE_BAND;
    expect(outer).toBeLessThan(edge);
    expect(fire).toBeGreaterThan(edge);
    expect((edge - outer) / (OUTER_BAND - FIRE_BAND)).toBeCloseTo(0.342, 2);
    expect((HALF_WIDTH - edge) / METRE).toBeCloseTo(175.5, 0);

    // And the picture agrees with the arithmetic: on a phone the line is never
    // stroked and no mote of the fire band is ever drawn.
    const it = drawn([side({ closing: 300 * METRE }), leftSide({ closing: 300 * METRE })], PHONE);
    for (const dot of it.dots) {
      expect(Math.abs(dot.x - CENTRELINE)).toBeLessThanOrEqual(edge);
    }
    expect(it.dots.length).toBeGreaterThan(0);
  });

  /** Both sides are drawn, always — the first law needs the far one to be calm. */
  it('draws both sides', () => {
    const it = drawn([side(), leftSide()], PHONE);
    expect(it.gradients).toHaveLength(2);
    expect(it.gradients[0]!.x1).not.toBeCloseTo(it.gradients[1]!.x1, 0);
  });
});

describe('presence — what normal play actually shows', () => {
  /**
   * **The author's ruling, 2026-09-01**: *"I don't want to signal danger during
   * normal gameplay, only when the ship is along the edge."*
   *
   * The strongest form of that is the one asserted: at zero presence the renderer
   * is not asked for **anything at all** — not a dimmed gradient, not a faint
   * dash. `CONTEXT.md`'s decay rule, and the reason the cost of the layer goes
   * with the layer.
   */
  it('draws nothing whatever while the craft is in the field', () => {
    for (const closing of [0, 200 * METRE, 600 * METRE]) {
      const it = drawn([side({ closing, presence: 0 }), leftSide({ closing, presence: 0 })]);
      expect(it.gradients).toHaveLength(0);
      expect(it.lines).toHaveLength(0);
      expect(it.rects).toHaveLength(0);
      expect(it.dots).toHaveLength(0);
      expect(it.words).toHaveLength(0);
    }
  });

  /**
   * ⚠ **The dashed band edge is what was actually signalling**, and it is the
   * reason this gate had to reach the whole layer rather than the glow alone.
   *
   * Spec 07 §2 fixes the dashes at α 0.25 and 0.40 and says they *"do not scale
   * with heat"* — so before the ruling they drew a pink dashed line down both
   * sides of the screen for the whole of every run, at full strength, while the
   * gradient beside them was down at α 0.0095 and invisible. Presence is a
   * different channel from heat and it reaches them.
   */
  it('brings the dashes up with presence, though heat never touches them', () => {
    const at = (presence: number) =>
      drawn([side({ presence })]).lines.filter((l) => l.dash.length > 0);
    expect(at(0)).toHaveLength(0);
    const half = at(0.5);
    const full = at(1);
    expect(half).toHaveLength(2);
    expect(full).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(alphaOf(half[i]!.stroke)).toBeGreaterThan(0);
      expect(alphaOf(half[i]!.stroke)).toBeLessThan(alphaOf(full[i]!.stroke));
      // And they still do not move.
      expect(half[i]!.from.x).toBeCloseTo(full[i]!.from.x, 6);
    }
  });

  /** Everything else comes up with it too: the wash, the line, the motes, the label. */
  it('brings the whole layer up together', () => {
    const half = drawn([side({ closing: 300 * METRE, presence: 0.5 })]);
    const full = drawn([side({ closing: 300 * METRE, presence: 1 })]);
    const solid = (it: typeof half) => it.lines.filter((l) => l.dash.length === 0)[0]!;
    expect(alphaOf(solid(half).stroke)).toBeLessThan(alphaOf(solid(full).stroke));
    expect(Math.max(...half.dots.map((d) => d.alpha))).toBeLessThan(
      Math.max(...full.dots.map((d) => d.alpha)),
    );
    const lit = (it: typeof half) => alphaOf(it.gradients[0]!.stops[2]!.colour);
    expect(lit(half)).toBeLessThan(lit(full));
  });

  /**
   * And it is driven by where the **craft** is, over a real run — the picture and
   * the ruling agreeing rather than the renderer being told a number by hand.
   */
  it('is absent for the majority of a real run', () => {
    const field = fixtureField();
    const craft = fixtureCraft();
    const { centreline, halfWidth } = field.corridor;
    let absent = 0;
    let total = 0;
    // Walk the craft across the whole corridor and count.
    for (let x = centreline - halfWidth; x <= centreline + halfWidth; x += 10) {
      craft.x = x;
      for (const s of boundaryOf(field, craft)) {
        total++;
        if (s.presence === 0) absent++;
      }
    }
    expect(absent / total).toBeGreaterThan(0.7);
  });
});

describe('the sideways camera brings it into view', () => {
  /**
   * **The whole point of the axis**, and the author's reason for calling it due:
   * *"I think we need to add the sideways camera movements at this point to
   * properly test the off-screen boundaries."*
   *
   * So this is the loop closed end to end — a craft flown out to a wall, the
   * camera following it, `visible` deciding what the device can show, and the
   * line actually landing inside that. Without the pan it cannot: the picture is
   * pinned to the centreline and the line sits 527 design units outside it.
   */
  it('puts the line on screen once the craft is out at the wall', () => {
    const field = fixtureField();
    const craft = fixtureCraft();
    const { centreline, halfWidth } = field.corridor;
    const line = centreline + halfWidth;

    // A phone's buffer, so this is the device the question was asked about.
    const buffer = { width: 1170, height: 2532 };

    // Parked on the centreline, as the camera was until 2026-09-01.
    craft.x = centreline;
    const pinned = visible(buffer.width, buffer.height, field.corridor, centreline);
    expect(pinned.right + centreline - DESIGN_WIDTH / 2).toBeLessThan(line);

    // And flown out to the fire band, with the camera where the follow puts it.
    craft.x = line - FIRE_BAND / 2;
    const sim = createInitialState(field, craft, 1);
    let view = openCamera(sim);
    for (let tick = 0; tick < 240; tick++) view = followCamera(view, sim);
    const panned = visible(buffer.width, buffer.height, field.corridor, view.x);
    expect(panned.right + view.x - DESIGN_WIDTH / 2).toBeGreaterThanOrEqual(line);

    // And the boundary is fully present there, so it is drawn rather than absent.
    const sides = boundaryOf(field, craft);
    expect(sides[1]!.presence).toBe(1);
  });
});

describe('a field with no line', () => {
  it('draws nothing at all', () => {
    const it = drawn([]);
    expect(it.gradients).toHaveLength(0);
    expect(it.lines).toHaveLength(0);
    expect(it.dots).toHaveLength(0);
    expect(it.words).toHaveLength(0);
  });
});

describe('the heat it is all drawn at', () => {
  /** Nothing drawn here may exceed the cap the law promises. */
  it('never draws past the cap', () => {
    const hottest = drawn([side({ closing: 10000 * METRE, away: 1 })]);
    for (const stop of hottest.gradients[0]!.stops) {
      expect(alphaOf(stop.colour)).toBeLessThanOrEqual(HEAT_CAP * 0.6 + 0.01);
    }
  });
});
