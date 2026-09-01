/**
 * The dust, and the ruling the sky is exempt from.
 *
 * This is [`starfield.test.ts`](./starfield.test.ts) with its first assertion
 * turned back the right way up, and the pair is meant to be read together. That
 * file checks that spec [05 · §2](../../docs/spec/05-field.md)'s *"everything
 * moves at world speed"* is **broken**, deliberately, because the author
 * overturned the ruling for the sky on 2026-08-30. This file checks that it is
 * **kept**, because the exemption goes no further: *"everything in the list above
 * is unaffected and still moves at world speed"* (`docs/plan/m3-the-field.md`).
 *
 * M3.3's acceptance names two of these outright — *dust velocity is uniform*, and
 * spec 05's own *"a test that computes the variance of dust velocity returns
 * zero"* and *"doubling chain level increases dust count and changes no dust
 * velocity."*
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import { RUNG_SPACING } from '../../src/state/rung.ts';
import type { CameraView, CorridorView } from '../../src/state/types.ts';
import { DUSK } from '../../src/render/palette.ts';
import {
  DUST_CEILING,
  DUST_STRENGTH,
  DUST_FIELD,
  DUST_PER_SCREEN,
  DUST_TILES,
  drawDust,
  dust,
  moteCount,
} from '../../src/render/dust.ts';

const CENTRELINE = 585;
const AT = (y: number): CameraView => ({ x: CENTRELINE, y, lock: 0, offset: 0 });
const CORRIDOR: CorridorView = { centreline: CENTRELINE, halfWidth: 1111, foot: 4795 };
const SEEN = { left: 0, top: 0, right: DESIGN_WIDTH, bottom: DESIGN_HEIGHT };

/** One drawn streak: where it starts, where it ends, and what it was drawn in. */
interface Mark {
  x: number;
  from: number;
  to: number;
  alpha: number;
  stroke: string;
  width: number;
  cap: string;
}

/** A context that writes down every line segment it is asked to stroke. */
function recorder(): { context: CanvasRenderingContext2D; marks: Mark[]; strokes: number } {
  const marks: Mark[] = [];
  const pending: { x: number; from: number }[] = [];
  const state = { strokes: 0 };
  const context = {
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    save: () => {},
    restore: () => {},
    beginPath: () => {
      pending.length = 0;
    },
    moveTo(x: number, y: number) {
      pending.push({ x, from: y });
    },
    lineTo(x: number, y: number) {
      const start = pending.pop();
      if (start === undefined) throw new Error('a lineTo with no moveTo before it');
      marks.push({
        x,
        from: start.from,
        to: y,
        alpha: context.globalAlpha,
        stroke: String(context.strokeStyle),
        width: context.lineWidth,
        cap: String(context.lineCap),
      });
    },
    stroke: () => {
      state.strokes += 1;
    },
  } as unknown as CanvasRenderingContext2D & {
    globalAlpha: number;
    strokeStyle: string;
    lineWidth: number;
    lineCap: string;
  };
  return {
    context,
    marks,
    get strokes() {
      return state.strokes;
    },
  };
}

const drawn = (
  field: ReturnType<typeof dust>,
  y: number,
  worldSpeed = 0,
  chain = 0,
): { marks: Mark[]; strokes: number } => {
  const recording = recorder();
  drawDust(recording.context, field, AT(y), CORRIDOR, worldSpeed, chain, SEEN);
  return { marks: recording.marks, strokes: recording.strokes };
};

/**
 * Marks keyed by the mote that drew them.
 *
 * By `x` and not by index: the draw culls what is off the bottom of the picture,
 * so two frames are not the same list in the same order — and comparing them by
 * position in the array is how a test of *this* claim quietly stops testing it.
 * A mote's `x` comes from the seed and is unique in practice.
 */
const byMote = (marks: Mark[]): Map<number, Mark> => new Map(marks.map((mark) => [mark.x, mark]));

/**
 * Where a mark lands **on the screen**, given where the camera was.
 *
 * The draw is inside the world transform, so a mark's own `y` is a world
 * coordinate and does not change between frames — that is the point being made,
 * and it is asserted on its own below. What the player sees move is this.
 */
const onScreen = (mark: Mark, cameraY: number): number => mark.to - cameraY + DESIGN_HEIGHT / 2;

describe('the dust', () => {
  const field = dust(0xd057);

  /**
   * **The whole of the ruling, and the sentence the sky is exempt from.** Every
   * mote moves by exactly what the camera moved by — not nearly, not on average,
   * *exactly*, because a mote's position has no camera term in it and what moves
   * is the picture. Spec 05's acceptance asks for *"a test that computes the
   * variance of dust velocity"* to return zero; this asserts the stronger thing,
   * which is that the one value it can take is the world's.
   */
  it('moves at world speed, exactly, with no variance at all', () => {
    const CLIMB = 100;
    const before = byMote(drawn(field, 1000).marks);
    const after = byMote(drawn(field, 1000 - CLIMB).marks);
    const shifts = new Set<number>();
    let compared = 0;
    for (const [x, was] of before) {
      const now = after.get(x);
      if (now === undefined) continue;
      const shift = onScreen(now, 1000 - CLIMB) - onScreen(was, 1000);
      // A mote that wrapped this frame says nothing about the rate.
      if (Math.abs(shift) > DUST_FIELD / 2) continue;
      shifts.add(shift);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10);
    // One value, and it is the camera's own step. Variance zero, by construction.
    expect([...shifts]).toEqual([CLIMB]);
  });

  /** And the same at any speed, in either direction, and after a long climb. */
  it('has one velocity whatever the world is doing', () => {
    const journeys: ReadonlyArray<readonly [from: number, to: number]> = [
      [0, -7],
      [0, 24],
      [-90_000, -90_000 - 3],
      [1234, 1233],
    ];
    for (const [from, to] of journeys) {
      const before = byMote(drawn(field, from).marks);
      const after = byMote(drawn(field, to).marks);
      const shifts = new Set<number>();
      let compared = 0;
      for (const [x, was] of before) {
        const now = after.get(x);
        if (now === undefined) continue;
        const shift = onScreen(now, to) - onScreen(was, from);
        if (Math.abs(shift) > DUST_FIELD / 2) continue;
        shifts.add(Math.round(shift * 1e6) / 1e6);
        compared += 1;
      }
      expect(compared).toBeGreaterThan(5);
      // One entry, always: the set's size *is* the variance the acceptance asks
      // about, and it is one however hard or slowly the world is moving.
      expect([...shifts]).toEqual([from - to]);
    }
  });

  /**
   * Spec 05's acceptance, in its own words: *"doubling chain level increases dust
   * count and changes no dust velocity."*
   */
  it('gets denser with chain and no faster', () => {
    const quiet = moteCount(field, 2);
    const hot = moteCount(field, 4);
    expect(hot).toBeGreaterThan(quiet);
    expect(drawn(field, 0, 8, 4).marks.length).toBeGreaterThan(drawn(field, 0, 8, 2).marks.length);

    const before = byMote(drawn(field, 1000, 8, 4).marks);
    const after = byMote(drawn(field, 900, 8, 4).marks);
    const shifts = new Set<number>();
    for (const [x, was] of before) {
      const now = after.get(x);
      if (now === undefined) continue;
      const shift = onScreen(now, 900) - onScreen(was, 1000);
      if (Math.abs(shift) > DUST_FIELD / 2) continue;
      shifts.add(shift);
    }
    expect([...shifts]).toEqual([100]);
  });

  /**
   * **And the reason there is nothing to vary**: a mote does not move. Its world
   * position is the same number at two cameras a thousand units apart, so what
   * the player sees pass is the picture and not the layer, and there is no rate
   * in this file for a seed to get wrong.
   */
  it('does not move at all, which is why it cannot move at its own speed', () => {
    const before = byMote(drawn(field, 1000).marks);
    const after = byMote(drawn(field, 900).marks);
    let compared = 0;
    for (const [x, was] of before) {
      const now = after.get(x);
      if (now === undefined) continue;
      expect(now.to).toBe(was.to);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10);
  });

  /**
   * **And the motes already in the picture do not move when the chain does.** The
   * field grows by drawing a longer prefix of one list, so a swing that connects
   * adds dust rather than re-scattering it — which is the one thing a player
   * would notice.
   */
  /**
   * Spec [08 · §4](../../docs/spec/08-economy.md) leaves open whether the chain
   * has a ceiling; this layer has one either way, because *sparse* is the first
   * word spec 05 §2 uses about dust.
   */
  it('stops at twice the resting field, however long the chain runs', () => {
    // As many links as there are motes in a picture, whatever that has been
    // ruled to — the ceiling is stated as a multiple of the base, not beside it.
    expect(moteCount(field, DUST_PER_SCREEN)).toBe(DUST_CEILING * DUST_TILES);
    expect(moteCount(field, 1000)).toBe(DUST_CEILING * DUST_TILES);
    expect(DUST_CEILING).toBe(DUST_PER_SCREEN * 2);
  });

  it('adds motes without moving the ones already there', () => {
    const quiet = drawn(field, 0, 8, 0).marks;
    const hot = drawn(field, 0, 8, 6).marks;
    expect(hot.length).toBeGreaterThan(quiet.length);
    for (const mark of quiet) {
      expect(hot.some((other) => other.x === mark.x && other.to === mark.to)).toBe(true);
    }
  });

  /**
   * A streak is a **long exposure**: the distance a mote travels while the
   * shutter is open. So its length is proportional to world speed and it trails
   * the way the world came from — which is what makes it a reading of the same
   * motion the mote is drawn moving at, rather than a second opinion about it.
   */
  it('streaks by exactly the distance the world moves in the exposure', () => {
    const still = drawn(field, 0, 0).marks;
    for (const mark of still) expect(mark.from).toBe(mark.to);

    const slow = drawn(field, 0, 4).marks[0]!;
    const fast = drawn(field, 0, 8).marks[0]!;
    const slowLength = slow.to - slow.from;
    expect(slowLength).toBeGreaterThan(0);
    expect(fast.to - fast.from).toBeCloseTo(slowLength * 2, 10);
    // Trailing above while climbing, below while falling. Nothing radiates.
    expect(drawn(field, 0, -8).marks[0]!.to - drawn(field, 0, -8).marks[0]!.from).toBeCloseTo(
      -(fast.to - fast.from),
      10,
    );
  });

  /** Strictly parallel — spec 05 §2 — which for a field with no sideways motion is vertical. */
  it('falls in strict parallel, every mote', () => {
    for (const mark of drawn(field, 0, 14).marks) {
      // A streak is drawn as one segment at one `x`: there is no second
      // coordinate for it to lean in.
      expect(Number.isFinite(mark.x)).toBe(true);
      expect(mark.to).toBeGreaterThan(mark.from);
    }
  });

  /**
   * **The brick rule, flown 2026-09-01 and now a test.** The author saw the first
   * build and reported it: *"I don't like the star streaks you've added at speed.
   * With the rungs they look like bricks."*
   *
   * It is a geometry rather than a taste. The field is parallel lines every
   * `RUNG_SPACING`, and a long perpendicular mark spanning the gap between two of
   * them is a mortar joint. So the streak is bounded against the rungs — at the
   * fastest world speed anyone has flown it draws under a fifth of a gap, and it
   * can never draw more whatever the world does.
   */
  it('never draws a streak that could be a mortar joint between two rungs', () => {
    // The fastest tick in the author's whole replayable corpus. Since the
    // exposure was ruled to 1.25 the cap **binds** here rather than merely
    // existing — which is the guard doing its job on exactly the dives the
    // brickwork was reported on, so it is asserted inclusively.
    const FASTEST = 28.4;
    const flown = drawn(field, 0, FASTEST).marks[0]!;
    expect(flown.to - flown.from).toBeLessThanOrEqual(RUNG_SPACING / 5);

    // And at any speed at all, including ones the game does not yet reach.
    for (const speed of [FASTEST, 60, 200, 10_000]) {
      for (const mark of drawn(field, 0, speed).marks) {
        expect(Math.abs(mark.to - mark.from)).toBeLessThanOrEqual(RUNG_SPACING / 5);
      }
    }
  });

  /** And it dims as it stretches, so a fast field is not also a brighter one. */
  it('fades as it stretches, so speed is never read as brightness', () => {
    const still = drawn(field, 0, 0).marks[0]!;
    const fast = drawn(field, 0, 25).marks[0]!;
    expect(fast.alpha).toBeLessThan(still.alpha);
  });

  /**
   * Spec 05 §2's stack table gives dust **α 0.1 – 0.3** in five steps, and E0 ·
   * STRUCTURE is DUSK.
   *
   * ⚠ **The range is the spec's, scaled by a strength the author ruled**, and
   * since 2026-09-01 that strength is 2 — so what is actually drawn runs 0.2 to
   * 0.6 and overruns the spec's row. Asserted as *the spec's five steps times the
   * strength* rather than as five numbers, so the departure stays visible: a
   * reader can see both what the design said and what was flown.
   */
  it('is drawn in DUSK, on the spec\u2019s five steps times the ruled strength', () => {
    const marks = drawn(field, 0, 0).marks;
    const alphas = [...new Set(marks.map((mark) => mark.alpha))].sort((a, b) => a - b);
    const spec = [0.1, 0.15, 0.2, 0.25, 0.3];
    expect(alphas.map((a) => Math.round((a / DUST_STRENGTH) * 100) / 100)).toEqual(spec);
    for (const mark of marks) {
      expect(mark.stroke).toBe(DUSK);
      expect(mark.cap).toBe('round');
      expect(mark.width).toBeGreaterThan(0);
    }
  });

  /**
   * Five brightnesses, five strokes — the same batching argument the sky makes
   * for quantising its own into three: `globalAlpha` is context state, so a
   * per-mote value would be a state change per mote.
   */
  it('draws the whole layer in five batches', () => {
    expect(drawn(field, 0, 10).strokes).toBe(5);
  });

  /**
   * Direction 05's own density, corrected for the frame it was drawn in, was the
   * **opening position**; ⚠ the author ruled 40 on the bench on 2026-09-01,
   * having measured against the running game rather than a still frame.
   */
  it('draws about as many motes as a picture is ruled to hold', () => {
    expect(DUST_PER_SCREEN).toBe(40);
    // Laid out to the ceiling, drawn to the chain — see `DUST_CEILING`.
    expect(field.length).toBe(DUST_CEILING * DUST_TILES);
    expect(moteCount(field, 0)).toBe(DUST_PER_SCREEN * DUST_TILES);
    const marks = drawn(field, 0, 0).marks;
    expect(marks.length).toBeGreaterThan(DUST_PER_SCREEN * 0.6);
    expect(marks.length).toBeLessThan(DUST_PER_SCREEN * 1.6);
  });

  /**
   * The tile is eight pictures tall, so a mote a player has seen does not come
   * back inside a run — the fixture field is 6 828 m foot to top body and the
   * tile is 6 752.
   */
  it('does not repeat inside a field this tall', () => {
    expect(DUST_FIELD).toBe(DESIGN_HEIGHT * 8);
    expect(DUST_FIELD / 3).toBeGreaterThan(6700);
  });

  it('is laid out in design space, so nothing depends on the canvas', () => {
    for (const mote of field) {
      expect(mote.x).toBeGreaterThanOrEqual(0);
      expect(mote.x).toBeLessThan(DESIGN_WIDTH);
      expect(mote.y).toBeGreaterThanOrEqual(0);
      expect(mote.y).toBeLessThan(DUST_FIELD);
    }
  });

  it('wraps rather than running out, however far the world has climbed', () => {
    for (const y of [0, -50_000, 123_456, -1_000_000]) {
      const marks = drawn(field, y, 6).marks;
      expect(marks.length).toBeGreaterThan(DUST_PER_SCREEN * 0.5);
      expect(marks.length).toBeLessThan(DUST_PER_SCREEN * 1.7);
      for (const mark of marks) {
        // In world coordinates, which is what the caller has translated into.
        const screen = mark.to - y + DESIGN_HEIGHT / 2;
        expect(screen).toBeGreaterThanOrEqual(SEEN.top - 1);
        expect(screen).toBeLessThanOrEqual(SEEN.bottom + 1);
      }
    }
  });

  it('is the same field every time it is asked for, from the same seed', () => {
    expect(dust(7)).toEqual(dust(7));
    expect(dust(1)).not.toEqual(dust(2));
  });

  /**
   * It hangs on the **corridor's centreline**, not on the camera — which is what
   * keeps a camera term out of a mote's position. The two are the same place
   * today because the camera never pans; this is the assertion that notices if
   * one of them ever moves without the other.
   */
  it('hangs on the corridor rather than on the camera', () => {
    const here = drawn(field, 0, 0).marks.map((mark) => mark.x);
    const recording = recorder();
    drawDust(
      recording.context,
      field,
      { x: CENTRELINE + 400, y: 0, lock: 0, offset: 0 },
      CORRIDOR,
      0,
      0,
      SEEN,
    );
    expect(recording.marks.map((mark) => mark.x)).toEqual(here);
  });
});
