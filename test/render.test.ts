/**
 * Guards for the render fixes made in Stage 1. Each of these encodes a specific
 * defect found in the prototype; if one regresses, the test names it.
 */
import { describe, expect, it } from 'vitest';
import { recordingContext } from './canvas-stub.ts';
import type { RecordingContext } from './canvas-stub.ts';
import type { OffscreenTarget } from '../src/render/nebula.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import {
  centerCamera,
  createCamera,
  fitCamera,
  toScreenX,
  toScreenY,
} from '../src/render/camera.ts';
import { Starfield } from '../src/render/starfield.ts';
import {
  BodyRenderer,
  drawFinishLine,
  drawHazardZones,
  drawSpeedCarpet,
} from '../src/render/world.ts';
import { drawEdgeMarkers } from '../src/render/edge-markers.ts';
import { SCORE_BAND_BOTTOM } from '../src/render/hud.ts';
import { boostEnvelope } from '../src/sim/boost.ts';
import { rescueScar } from '../src/sim/rescue.ts';
import { DEFAULT_SCORE_CONFIG, previewBurn } from '../src/score/index.ts';
import { Scar } from '../src/render/scar.ts';
import { boostColor, drawBoostHalo, drawOrbitCurve } from '../src/render/capture.ts';
import {
  FUEL_LOW_FRAC,
  GAUGE,
  drawFuelGauge,
  drawScore,
  formatScore,
  readoutLines,
} from '../src/render/hud.ts';
import { FUEL_WARNING, FuelWarning, pulseAlpha } from '../src/render/fuel-warning.ts';
import { drawCompass } from '../src/render/compass.ts';
import { Popups } from '../src/render/popups.ts';
import { BURN_WORD, LEVEL, ROUTINE, SHOUT } from '../src/render/accolade.ts';
import { FUEL_RAMP } from '../src/render/hud.ts';
import { AIM, CLOSE_PX, PEAK, WORDS } from '../src/score/index.ts';
import {
  AIM_MAX_TARGETS,
  AIM_RANGE,
  aimTargets,
  pathBlocked,
  releaseAngleFor,
} from '../src/score/aim.ts';
import { createScoreState } from '../src/score/score.ts';
import type { ScoreState } from '../src/score/types.ts';
import { orbitRadius } from '../src/sim/orbit.ts';
import { Trail } from '../src/render/ship.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { createBodies, fieldBounds } from '../src/sim/world.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { Scene } from '../src/render/scene.ts';
import { captureSnapshot } from '../src/render/snapshot.ts';
import type { RenderSnapshot } from '../src/render/snapshot.ts';

const rcfg = DEFAULT_RENDER_CONFIG;
const field = fieldBounds(DEFAULT_CONFIG, createBodies(DEFAULT_CONFIG));
const ANOMALY = createBodies(DEFAULT_CONFIG).find((b) => b.kind === 'anomaly' && b.x > 195)!;

function cam() {
  const c = createCamera(rcfg);
  fitCamera(c, { w: 390, h: 844, dpr: 1 });
  centerCamera(c, 195, 0, field, null);
  return c;
}

/**
 * A capture snapshot with sensible defaults, so a test can name only the fields
 * it cares about. Added after the third round of every literal needing updating
 * whenever RenderSnapshot grew a field.
 */
function captureOf(over: Partial<NonNullable<RenderSnapshot['capture']>> = {}) {
  return {
    phase: 'settle' as const,
    planet: 0,
    settleProgress: 1,
    settleT: 1.2,
    orbit: null,
    rPeri: 100,
    boost: 0,
    boostFull: 0,
    boostT: 0,
    overEscape: 0,
    rx: 0,
    ry: -100,
    vx: 200,
    vy: 0,
    minR: 58,
    ...over,
  };
}

describe('starfield', () => {
  it('is deterministic for a given seed', () => {
    const a = recordingContext();
    const b = recordingContext();
    new Starfield(rcfg, 12345).draw(a.ctx, cam(), rcfg);
    new Starfield(rcfg, 12345).draw(b.ctx, cam(), rcfg);
    expect(a.ops).toEqual(b.ops);
    expect(a.calls('fillRect').length).toBe(rcfg.starCount);
  });

  it('differs for a different seed', () => {
    const a = recordingContext();
    const b = recordingContext();
    new Starfield(rcfg, 1).draw(a.ctx, cam(), rcfg);
    new Starfield(rcfg, 2).draw(b.ctx, cam(), rcfg);
    expect(a.ops).not.toEqual(b.ops);
  });

  it('batches state changes by depth tier, not per star', () => {
    const r = recordingContext();
    new Starfield(rcfg, 7).draw(r.ctx, cam(), rcfg);
    // three tiers => at most three fillStyle and four globalAlpha writes
    expect(r.calls('=fillStyle').length).toBeLessThanOrEqual(3);
    expect(r.calls('=globalAlpha').length).toBeLessThanOrEqual(4);
  });

  it('responds to horizontal camera movement', () => {
    const stars = new Starfield(rcfg, 7);
    const a = recordingContext();
    const b = recordingContext();
    const c1 = cam();
    const c2 = cam();
    c2.left += 40;
    stars.draw(a.ctx, c1, rcfg);
    stars.draw(b.ctx, c2, rcfg);
    expect(a.calls('fillRect')).not.toEqual(b.calls('fillRect'));
  });
});

describe('hazard zones', () => {
  it('warn INSIDE the playfield, where the ship can still be', () => {
    const r = recordingContext();
    const c = cam();
    drawHazardZones(r.ctx, c, rcfg, field);

    const leftEdge = toScreenX(c, field.left);
    const rightEdge = toScreenX(c, field.right);

    for (const [, x, , w] of r.calls('fillRect') as Array<[string, number, number, number]>) {
      // every warned pixel lies between the two field edges, never beyond them
      expect(x).toBeGreaterThanOrEqual(Math.min(leftEdge, rightEdge) - 1e-6);
      expect(x + w).toBeLessThanOrEqual(Math.max(leftEdge, rightEdge) + 1e-6);
    }
    expect(r.calls('fillRect').length).toBeGreaterThan(0);
  });

  it('marks the hard limit at the field edge itself', () => {
    const r = recordingContext();
    const c = cam();
    drawHazardZones(r.ctx, c, rcfg, field);
    const xs = (r.calls('lineTo') as Array<[string, number, number]>).map((o) => o[1]);
    expect(xs.some((x) => Math.abs(x - toScreenX(c, field.left)) < 1e-6)).toBe(true);
  });

  it('draws no band at the ceiling, which is a finish line and not a wall', () => {
    // The ceiling briefly had one. `clearAtTop` turned that stretch into the
    // finish, and a hazard band there paints red across the line the player is
    // meant to fly through — reported as "too aggressive and threatening". The
    // cue moved to a green FINISH arrow; nothing fences it off any more.
    const r = recordingContext();
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, field.top + 200, field, null);
    drawHazardZones(r.ctx, c, rcfg, field);
    const ys = (r.calls('lineTo') as Array<[string, number, number]>).map((o) => o[2]);
    expect(ys.some((y) => Math.abs(y - toScreenY(c, field.top)) < 1e-6)).toBe(false);
  });
});

describe('the finish marker', () => {
  /** Draw the markers with the ship `dist` below the finish line. */
  function draw(dist: number | null, finish = true) {
    const r = recordingContext();
    const c = cam();
    const snap = {
      ...captureSnapshot(createInitialState(DEFAULT_CONFIG), false, DEFAULT_CONFIG),
      x: 195,
      y: 0,
    };
    const finishY = finish ? -(dist ?? 0) : null;
    drawEdgeMarkers(r.ctx, c, rcfg, snap, [], 0, finishY);
    const text = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    return { r, text, label: text.find((t) => t.startsWith('FINISH')) };
  }

  it('says nothing when the field cannot be cleared', () => {
    expect(draw(400, false).label).toBeUndefined();
  });

  it('says nothing when the finish is already behind', () => {
    // A line the ship has passed is not news, and an arrow pointing back down the
    // climb is the clutter the whole marker system refuses to draw.
    expect(draw(-400).label).toBeUndefined();
  });

  it('appears at the same range the bodies announce themselves at', () => {
    expect(draw(rcfg.edgeMarkerRange + 200).label).toBeUndefined();
    expect(draw(rcfg.edgeMarkerRange - 200).label).toBeDefined();
  });

  it('counts down the distance rather than just pointing', () => {
    expect(draw(600).label).toBe('FINISH 600');
    // Thousands are abbreviated exactly as a body's distance is. Kept inside
    // `edgeMarkerRange` (1300) — beyond it there is no marker to read at all.
    expect(draw(1200).label).toBe('FINISH 1.2k');
  });

  it('brightens as it closes', () => {
    const alphaOf = (d: number) => {
      const { r } = draw(d);
      const fills = (r.ops.filter((o) => o[0] === '=fillStyle') as Array<[string, string]>)
        .map((o) => o[1])
        .filter((v) => v.startsWith('rgba(92,226,140'));
      return Number(fills[0]!.split(',')[3]!.replace(')', ''));
    };
    expect(alphaOf(600)).toBeGreaterThan(alphaOf(1200));
  });

  it('stands down once the line itself is on screen', () => {
    // The rule every body arrow follows: a marker pointing at something already
    // visible is clutter drawn over the exact thing it points at. 300px up is
    // inside a 844-tall viewport centred on the ship; 600 is not.
    expect(draw(300).label, 'line visible — arrow stands down').toBeUndefined();
    expect(draw(600).label, 'line off screen — arrow speaks').toBeDefined();
  });

  it('draws in the finish green, not the ladder’s green', () => {
    // Two colour systems that must not be merged: the arrows are category-coded
    // and the ladder answers "how good was that". Sharing a value would make a
    // ladder retune silently move a navigation cue.
    const { r } = draw(600);
    const fills = (r.ops.filter((o) => o[0] === '=fillStyle') as Array<[string, string]>).map(
      (o) => o[1],
    );
    expect(fills.some((v) => v.startsWith('rgba(92,226,140'))).toBe(true);
    expect(fills.some((v) => v.includes('92,214,122'))).toBe(false);
  });
});

describe('the finish line', () => {
  /** Draw the line with the camera looking at `at`. */
  function draw(finishY: number | null, at = 0) {
    const r = recordingContext();
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, at, field, null);
    drawFinishLine(r.ctx, c, field, finishY);
    return r;
  }

  it('draws nothing when the field cannot be cleared', () => {
    expect(draw(null).calls('rect').length).toBe(0);
  });

  it('draws nothing while it is nowhere near the screen', () => {
    expect(draw(-9000, 0).calls('rect').length).toBe(0);
  });

  it('is chequered, not a dashed limit like every hazard here', () => {
    // The grammar matters more than the colour. Walls and the trailing floor are
    // all "wash deepening to a dashed line", and the eye learned that shape as
    // "do not pass". Chequers say the opposite thing without being taught.
    const r = draw(-200, 0);
    // Cells are accumulated into one path and filled once — one blur instead of
    // fifty — so they are `rect` calls, not `fillRect` ones.
    expect(r.calls('rect').length, 'many cells, not one stroked line').toBeGreaterThan(8);
    expect(r.calls('setLineDash').length, 'and no dashes at all').toBe(0);
  });

  it('spans the field it is the end of', () => {
    const r = draw(-200, 0);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, 0, field, null);
    const rects = r.calls('rect') as Array<[string, number, number, number, number]>;
    const xs = rects.map(([, x]) => x);
    const rights = rects.map(([, x, , w]) => x + w);
    expect(Math.min(...xs)).toBeCloseTo(toScreenX(c, field.left), 4);
    expect(Math.max(...rights)).toBeCloseTo(toScreenX(c, field.right), 4);
  });

  it('glows, in one blur rather than one per cell', () => {
    // ~50 cells at the default field width. Shadowing each fill separately would
    // be fifty blur operations a frame on a device that has already reported
    // render slowdown; one path, filled twice, costs two.
    const r = draw(-200, 0);
    const blurs = (r.ops.filter((o) => o[0] === '=shadowBlur') as Array<[string, number]>)
      .map((o) => o[1])
      .filter((v) => v > 0);
    expect(blurs.length, 'glow is applied').toBeGreaterThan(0);
    expect(r.calls('fill').length, 'and the whole band fills as one shape').toBeLessThan(4);
  });

  it('is drawn in the same green as the arrow that points at it', () => {
    const r = draw(-200, 0);
    const fills = (r.ops.filter((o) => o[0] === '=fillStyle') as Array<[string, string]>).map(
      (o) => o[1],
    );
    expect(fills.some((v) => typeof v === 'string' && v.startsWith('rgba(92,226,140'))).toBe(true);
  });
});

describe('the speed carpet', () => {
  function draw(finishY: number | null, at = 0, timeMs = 0) {
    const r = recordingContext();
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, at, field, null);
    drawSpeedCarpet(r.ctx, c, field, finishY, DEFAULT_CONFIG.finishFunnelDepth, timeMs);
    return r;
  }

  it('draws nothing when the field cannot be cleared', () => {
    expect(draw(null).calls('fill').length).toBe(0);
  });

  it('draws chevrons — six points with a notch, not a bent line', () => {
    // The shape is the request. A stroked V has three points and gets its weight
    // from lineWidth; this is a closed polygon whose ends are cut horizontally
    // and whose underside is notched, which is what the icon actually is.
    const r = draw(-3000, -2600, 0);
    const moves = r.calls('moveTo').length;
    const lines = r.calls('lineTo').length;
    expect(moves, 'one subpath per chevron').toBeGreaterThan(0);
    expect(lines / moves, 'five lineTo per moveTo').toBe(5);
    expect(r.calls('closePath').length).toBe(moves);
    expect(r.calls('stroke').length, 'filled, never stroked').toBe(0);
  });

  it('is taller than it is wide, so it reads as direction not shelter', () => {
    // A wide, shallow `^` is a tent: the eye takes it as a roof over something.
    // A steep one is an arrow. Measured on the drawn points rather than on the
    // constants, so it stays true through the size ramp along the runway.
    const r = draw(-3000, -2600, 0);
    const pts = [
      ...(r.calls('moveTo') as Array<[string, number, number]>),
      ...(r.calls('lineTo') as Array<[string, number, number]>),
    ];
    expect(pts.length).toBeGreaterThan(0);
    const xs = pts.map((o) => o[1]);
    const ys = pts.map((o) => o[2]);
    // One chevron's own extent: take the tightest cluster by using the first six
    // points, which are one complete subpath in draw order.
    const first = [
      (r.calls('moveTo') as Array<[string, number, number]>)[0]!,
      ...(r.calls('lineTo') as Array<[string, number, number]>).slice(0, 5),
    ];
    const width = Math.max(...first.map((o) => o[1])) - Math.min(...first.map((o) => o[1]));
    const height = Math.max(...first.map((o) => o[2])) - Math.min(...first.map((o) => o[2]));
    expect(height).toBeGreaterThan(width * 0.85);
    expect(xs.length).toBe(ys.length);
  });

  it('is symmetric about its own apex', () => {
    // The apex is the only point not paired with a mirror, so a chevron whose
    // arms disagree shows up here rather than as something subtly lopsided that
    // nobody can name.
    const r = draw(-3000, -2600, 0);
    const first = [
      (r.calls('moveTo') as Array<[string, number, number]>)[0]!,
      ...(r.calls('lineTo') as Array<[string, number, number]>).slice(0, 5),
    ];
    const xs = first.map((o) => o[1]).sort((a, b) => a - b);
    const apexX = (Math.min(...xs) + Math.max(...xs)) / 2;
    // Outer tips and notch corners both mirror across the apex.
    expect(xs[0]! + xs[5]!).toBeCloseTo(apexX * 2, 6);
    expect(xs[1]! + xs[4]!).toBeCloseTo(apexX * 2, 6);
  });

  it('costs one compare for the whole rest of the run', () => {
    // The common case is every frame that is not near the finish. If this ever
    // starts building a path there, it is doing it for the entire game.
    expect(draw(-40000, 0).calls('moveTo').length).toBe(0);
  });

  it('sweeps upward as time passes', () => {
    // Same camera, same line, different clock: the surface has to have moved, and
    // moved TOWARD the line rather than away from it.
    const yAt = (t: number) => {
      const ops = draw(-500, 0, t).calls('moveTo') as Array<[string, number, number]>;
      return Math.min(...ops.map((o) => o[2]));
    };
    expect(yAt(0)).not.toBeCloseTo(yAt(120), 3);
  });

  it('is a stable surface, not a per-frame reshuffle', () => {
    // The jitter is a hash of the row, so the same clock always yields the same
    // arrangement. A Math.random per row would boil instead of scrolling.
    const a = draw(-500, 0, 250).calls('moveTo');
    const b = draw(-500, 0, 250).calls('moveTo');
    expect(a).toEqual(b);
  });

  it('thickens toward the line rather than running at constant density', () => {
    // Compared across two CAMERA positions, not within one frame. A single
    // viewport only ever sees a thin slice of the runway, where every row has
    // nearly the same nearness — which is how this first "measured" a ramp as
    // 18 against 19 and proved nothing.
    const finishY = -3000;
    const nearLine = draw(finishY, finishY + 300, 0).calls('moveTo').length;
    const farBack = draw(finishY, finishY + 1200, 0).calls('moveTo').length;
    expect(nearLine, 'more arrows per screen close to the line').toBeGreaterThan(farBack);
  });

  it('stays fainter than the line it feeds', () => {
    // Reads strokeStyle, not fillStyle. The chevrons are stroked, so a fill-based
    // check passes over an empty list and proves nothing — which is exactly what
    // it did for one commit after the shape changed.
    const carpet = draw(-200, 0, 0);
    // Scans BOTH paint properties rather than naming one. These chevrons have
    // been a stroked V and a filled polygon in successive commits, and each time
    // a test that named the old primitive went on passing over an empty list —
    // agreeing with whatever it found. What the assertion is about is the colour,
    // so the colour is what it looks for.
    //
    // `fillStyle` also carries gradient objects, which have no `startsWith`.
    const alphaOf = (r: RecordingContext) =>
      (
        r.ops.filter((o) => o[0] === '=fillStyle' || o[0] === '=strokeStyle') as Array<
          [string, unknown]
        >
      )
        .map((o) => o[1])
        .filter((v): v is string => typeof v === 'string' && v.startsWith('rgba(92,226,140'))
        .map((v) => Number(v.split(',')[3]!.replace(')', '')));
    const lineR = recordingContext();
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, 0, field, null);
    drawFinishLine(lineR.ctx, c, field, -200);
    const carpetAlphas = alphaOf(carpet);
    expect(carpetAlphas.length, 'the carpet actually drew something').toBeGreaterThan(0);
    expect(Math.max(...carpetAlphas)).toBeLessThan(Math.max(...alphaOf(lineR)));
  });

  it('fades in and out instead of popping at the runway ends', () => {
    // Every row is drawn at its own alpha, and the faintest ones sit at the two
    // extremes. A single alpha for the whole carpet is what made rows appear and
    // vanish at full strength.
    const alphas = (
      draw(-3000, -2600, 0).ops.filter(
        (o) => o[0] === '=fillStyle' || o[0] === '=strokeStyle',
      ) as Array<[string, unknown]>
    )
      .map((o) => o[1])
      .filter((v): v is string => typeof v === 'string' && v.startsWith('rgba(92,226,140'))
      .map((v) => Number(v.split(',')[3]!.replace(')', '')));
    expect(new Set(alphas).size, 'rows differ in opacity').toBeGreaterThan(1);
    expect(Math.min(...alphas)).toBeGreaterThan(0);
  });

  it('scrolls as one surface rather than resnapping when the phase wraps', () => {
    // THE REPORTED BUG. Keyed to the loop index, a row's jitter is stable only
    // until the scroll wraps — then row `i` inherits row `i-1`'s position while
    // keeping its own offset, and every chevron on screen teleports at once.
    // Keyed to the absolute world row, an offset travels with the row that owns
    // it, so consecutive frames differ only by whatever entered or left.
    const xsAt = (t: number) =>
      (draw(-3000, -2600, t).calls('moveTo') as Array<[string, number, number]>)
        .map((o) => Math.round(o[1]))
        .sort((a, b) => a - b);

    let worstChurn = 0;
    let prev = xsAt(0);
    for (let t = 16; t <= 3000; t += 16) {
      const now = xsAt(t);
      const before = new Set(prev);
      // How many positions are new this frame. One row entering is `perRow` of
      // them; a resnap is every row at once.
      const churn = now.filter((x) => !before.has(x)).length;
      if (churn > worstChurn) worstChurn = churn;
      prev = now;
    }
    expect(worstChurn, 'at most a row or so changes between frames').toBeLessThanOrEqual(6);
  });
});

describe('edge markers clear the score band', () => {
  it('reaches below the score the HUD draws, not just the DOM header', () => {
    // The 2026-08-22 playtest's loudest finding: planet labels drawn straight
    // through the score, producing `P21 84P20 57 51` across the multiplier. The
    // arrows were already avoiding `headerBottom` — but that is measured from a
    // DOM element, and the score is drawn on the canvas, so the one thing they
    // most needed to clear was invisible to the calculation.
    expect(SCORE_BAND_BOTTOM).toBeGreaterThan(rcfg.edgeMarkerInset);
  });
});

describe('trail', () => {
  it('length does not depend on frame rate', () => {
    // Same world path, same simulation ticks, different render cadence.
    const path = Array.from({ length: 200 }, (_, i) => ({ x: 100 + i * 6.7, y: 0 }));

    const slow = new Trail(rcfg);
    const fast = new Trail(rcfg);
    const sink = recordingContext();
    const c = cam();

    for (const p of path) {
      slow.sample(p.x, p.y);
      slow.draw(sink.ctx, c, 1e6, 1e6); // 1 render per tick
    }
    for (const p of path) {
      fast.sample(p.x, p.y);
      fast.draw(sink.ctx, c, 1e6, 1e6); // 4 renders per tick
      fast.draw(sink.ctx, c, 1e6, 1e6);
      fast.draw(sink.ctx, c, 1e6, 1e6);
      fast.draw(sink.ctx, c, 1e6, 1e6);
    }

    const a = recordingContext();
    const b = recordingContext();
    slow.draw(a.ctx, c, 1e6, 1e6);
    fast.draw(b.ctx, c, 1e6, 1e6);
    expect(a.calls('arc')).toEqual(b.calls('arc'));
  });

  it('honours minimum spacing and maximum length', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 500; i++) t.sample(i * 0.5, 0); // finer than trailSpacing
    const r = recordingContext();
    t.draw(r.ctx, cam(), 1e6, 1e6);
    const arcs = r.calls('arc') as Array<[string, number, number]>;
    expect(arcs.length).toBeLessThanOrEqual(rcfg.trailMax);
    for (let i = 1; i < arcs.length; i++) {
      expect(Math.abs(arcs[i]![1] - arcs[i - 1]![1])).toBeGreaterThanOrEqual(
        rcfg.trailSpacing - 1e-9,
      );
    }
  });

  it('keeps the wake clear of the ship sprite', () => {
    // The head circle used to poke through the ship's tail notch at speed: the
    // newest sample sits 3-10px back and grows to ~4.8px across, against a
    // silhouette only 6px deep.
    const t = new Trail(rcfg);
    for (let i = 0; i < 40; i++) t.sample(i * 4, 0, 400);
    const shipX = 39 * 4; // where the ship is now: right on top of the newest point
    const r = recordingContext();
    const c = cam();
    t.draw(r.ctx, c, shipX, 0);

    const arcs = r.calls('arc') as Array<[string, number, number, number]>;
    expect(arcs.length).toBeGreaterThan(0);
    for (const [, x, y, radius] of arcs) {
      const wx = (x - c.offsetX) / c.scale + c.left;
      const wy = (y - c.offsetY - (c.viewH * c.scale) / 2) / c.scale + c.centerY;
      const d = Math.hypot(wx - shipX, wy - 0);
      expect(d, 'a wake dot was drawn inside the head gap').toBeGreaterThanOrEqual(
        rcfg.trailHeadGap - 1e-6,
      );
      // and its nearest edge clears the ship's 6px tail
      expect(d - radius / c.scale).toBeGreaterThan(6);
    }
  });

  it('draw does not mutate the trail', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 40; i++) t.sample(i * 10, 0);
    const a = recordingContext();
    const b = recordingContext();
    t.draw(a.ctx, cam(), 1e6, 1e6);
    t.draw(b.ctx, cam(), 1e6, 1e6);
    expect(a.ops).toEqual(b.ops);
  });
});

describe('scene', () => {
  // Drives the real simulation and renders every tick, so a null anchor, a NaN
  // coordinate or a bad draw call surfaces here rather than on a phone.
  const SCENES = [
    { name: 'drift then capture then release', press: 18, release: 150, ticks: 220 },
    {
      name: 'crash and respawn',
      press: -1,
      release: -1,
      ticks: 150,
      ship: { x: 189, y: 200, vx: 0, vy: -97 },
    },
    {
      name: 'flyby braked',
      press: 20,
      release: 200,
      ticks: 240,
      ship: { x: 105, y: 354, vx: 0, vy: -400 },
    },
    // An anomaly is its own drawing path: the capture freezes at the press, so
    // there is never a live dive to preview and the curve drawn from the first
    // tick is the destination circle. Nothing else in the suite renders one.
    {
      name: 'parked at an anomaly',
      press: 5,
      release: 200,
      ticks: 260,
      ship: { x: ANOMALY.x - 300, y: ANOMALY.y - 70, vx: 344, vy: 0 },
    },
    // A charged window is a whole set of drawing paths nothing else reaches: the
    // nebula and its lightning, the ship's glow and arcs, the countdown gauge and
    // the closing tally. Without this scene every one of them is dead code as far
    // as the suite is concerned.
    {
      name: 'charged, hopping',
      press: 5,
      release: 200,
      ticks: 260,
      ship: { x: ANOMALY.x - 300, y: ANOMALY.y - 70, vx: 344, vy: 0 },
      charged: true,
    },
    // The scar's own path. Nothing else in the suite drifts at a side wall, so
    // without this the spindles, the broken arm and the mark left behind are all
    // drawn for the first time on a phone.
    {
      name: 'drifting into the wall',
      press: -1,
      release: -1,
      ticks: 220,
      ship: { x: 189, y: 120, vx: 230, vy: -70 },
    },
  ];

  /**
   * An offscreen buffer for the charged storm's curtains.
   *
   * Injected so the suite exercises the COMPOSITED path — the low-resolution buffer
   * plus `drawImage` upscale that produces the blur. Without it `Nebula` finds no
   * `document`, falls back to stroking straight onto the canvas, and every test
   * here would be covering a renderer that never ships.
   */
  function bufferFactory(): { make: () => OffscreenTarget; rec: RecordingContext } {
    const rec = recordingContext();
    const canvas: OffscreenTarget = {
      width: 0,
      height: 0,
      getContext: () => rec.ctx,
    };
    return { make: () => canvas, rec };
  }

  it.each(SCENES)('$name renders every tick without error', (sc) => {
    const state = createInitialState(DEFAULT_CONFIG);
    if (sc.ship) Object.assign(state.ship, sc.ship);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const buf = bufferFactory();
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
      buf.make,
    );
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const r = recordingContext();

    let held = false;
    let drawn = 0;
    let compositedFrames = 0;
    // The ship's glow ramps with how many bodies the window has taken, so the
    // charged scene has to exercise a non-empty log as well as an empty one.
    const chargedScore = createScoreState();
    if (sc.charged) chargedScore.hopped.push('P1', 'P2', 'P3', 'P4', 'P5');
    for (let i = 0; i < sc.ticks; i++) {
      const pressed = i === sc.press;
      const released = i === sc.release;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(state, DEFAULT_CONFIG, { held: held || pressed, pressed, released }, FIXED_DT);

      // Force the window on for the charged scene, and let it drain to zero
      // partway through so the fade-out and the tally both get drawn.
      if (sc.charged && state.chargedT <= 0 && i < 150) {
        state.chargedT = DEFAULT_CONFIG.chargedSecs * (1 - i / 200);
      }
      // Fed on the tick at the app's own cadence, so the scar is exercised
      // through the same path `app/main.ts` drives it with.
      if (i % 6 === 0 && !state.ending.active) {
        // Priced the way `app/main.ts` prices it, so the scene test exercises the
        // sizing path rather than always drawing a minimum-size mark.
        const s = rescueScar(state, DEFAULT_CONFIG, FIXED_DT);
        scene.scar.observe(
          s,
          s ? previewBurn(s.flight, f, state.bodies, DEFAULT_SCORE_CONFIG, FIXED_DT) : 0,
          rcfg,
          FIXED_DT * 6,
        );
      }
      const snap = captureSnapshot(state, held, DEFAULT_CONFIG);
      scene.trail.sample(snap.x, snap.y);
      centerCamera(c, snap.x, snap.y, f, null);

      r.reset();
      scene.draw(r.ctx, c, snap, {
        timeMs: i * 16.67,
        paused: false,
        viewportW: 390,
        viewportH: 844,
        headerBottom: 0,
        frameDt: 1 / 60,
        score: chargedScore,
      });
      drawn++;
      if (sc.charged && snap.chargedFrac > 0) compositedFrames += r.calls('drawImage').length;

      // no NaN or Infinity ever reaches the canvas
      for (const op of r.ops) {
        for (const arg of op.slice(1)) {
          if (typeof arg === 'number') {
            expect(Number.isFinite(arg), `${op[0]} received ${arg} at tick ${i}`).toBe(true);
          }
        }
      }
    }
    expect(drawn).toBe(sc.ticks);
    if (sc.charged) {
      // The blur IS the composite: without it the curtains are a stack of hard
      // strokes, which is the thing this replaced. A charged frame that never
      // reaches `drawImage` is drawing the fallback renderer.
      expect(compositedFrames, 'the curtain buffer was never composited').toBeGreaterThan(0);
    }
  });

  it('marks the point of no return, and leaves the mark behind once it is passed', () => {
    // "Renders without error" cannot tell a drawn scar from an absent one, and an
    // absent one is the failure mode this feature has: every gate in `rescueScar`
    // returns null, so a wiring mistake anywhere reads as a clean pass.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const r = recordingContext();

    /** Fills in the hazard band's red, which is the scar and nothing else here. */
    const scarFills = (): number =>
      r.ops.filter((op) => op[0] === '=fillStyle' && String(op[1]).startsWith('rgba(255,70,90'))
        .length;

    const frame = (): void => {
      const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
      centerCamera(c, snap.x, snap.y, f, null);
      r.reset();
      scene.draw(r.ctx, c, snap, {
        timeMs: 0,
        paused: false,
        viewportW: 390,
        viewportH: 844,
        headerBottom: 0,
        frameDt: 1 / 60,
        score: createScoreState(),
      });
    };

    frame();
    expect(scarFills(), 'nothing is drawn before the scar has been observed').toBe(0);

    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT);
    expect(scar, 'the fixture is meant to be committed to a wall').not.toBeNull();
    expect(scar!.cross, 'and to still have a way out').not.toBeNull();
    scene.scar.observe(scar, 0, rcfg, FIXED_DT);
    frame();
    const ahead = scarFills();
    expect(ahead, 'the scar is drawn once it has been observed').toBeGreaterThan(0);

    // Fly past the cross. The prediction now has no live press left, and the mark
    // must stay where it was rather than vanishing at the moment it matters.
    const crossTick = Math.round(scar!.cross!.t / FIXED_DT);
    for (let i = 0; i <= crossTick + 2; i++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
    }
    scene.scar.observe(rescueScar(state, DEFAULT_CONFIG, FIXED_DT), 0, rcfg, FIXED_DT);
    frame();
    expect(scarFills(), 'the mark stays behind after the cross is passed').toBeGreaterThan(0);

    // A grab answers the question, so the mark ages out rather than blinking:
    // a tap IS a capture, and a hard clear made tapping through the band strobe.
    scene.scar.observe(null, 0, rcfg, rcfg.scarFadeOutSecs * 0.25);
    frame();
    expect(scarFills(), 'a brief capture does not blink the mark out').toBeGreaterThan(0);
    scene.scar.observe(null, 0, rcfg, rcfg.scarFadeOutSecs);
    frame();
    expect(scarFills(), 'but it does expire').toBe(0);
  });

  it('replaces an interrupted mark rather than dragging it across the field', () => {
    // Reported as "the cross kind of jumped forward a few times". On the session
    // that reported it the scar was absent for 3.9s — a capture — and the cross
    // that came back sat 456px away, which the follower dragged across the screen
    // in three visible steps. Two unrelated situations, nothing continuous
    // between them: the old mark is let go where it stands.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const scar = new Scar();
    const at = (): { x: number; y: number; born: number } | null =>
      (scar as unknown as { mark: { x: number; y: number; born: number } | null }).mark;

    const first = rescueScar(state, DEFAULT_CONFIG, FIXED_DT);
    expect(first?.cross).toBeTruthy();
    scar.observe(first, 0, rcfg, FIXED_DT);
    const born = { ...at()! };

    // An interruption: a capture makes the prediction null for as long as it lasts.
    scar.observe(null, 0, rcfg, FIXED_DT);
    expect(at()!.x, 'the mark holds its ground while interrupted').toBeCloseTo(born.x, 6);

    // A different answer comes back, a long way off.
    const far = {
      ...first!,
      cross: { x: born.x + 400, y: born.y - 200, t: first!.cross!.t },
    };
    scar.observe(far, 0, rcfg, FIXED_DT);
    scar.update(1, rcfg);
    expect(at()!.x, 'the new mark is born AT the new answer, not eased toward it').toBeCloseTo(
      far.cross.x,
      6,
    );
    expect(at()!.y).toBeCloseTo(far.cross.y, 6);

    // Uninterrupted, a moved answer IS eased — that is the other half of the rule.
    const nudged = {
      ...first!,
      cross: { x: far.cross.x + 40, y: far.cross.y, t: first!.cross!.t },
    };
    scar.observe(nudged, 0, rcfg, FIXED_DT);
    scar.update(1 / 60, rcfg);
    const x = at()!.x;
    expect(x, 'an uninterrupted correction is followed, not snapped').toBeGreaterThan(far.cross.x);
    expect(x, 'and not covered in a single frame').toBeLessThan(nudged.cross.x - 1);
  });

  it('draws a bigger mark when a bigger fire is waiting at the cross', () => {
    // The prize rides SIZE and not brightness, because alpha already carries how
    // close the deadline is — a dim cross would otherwise mean either "small
    // fire" or "still far away" with no way to tell which.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT);
    expect(scar?.cross).toBeTruthy();

    const spanOf = (prize: number): number => {
      const mark = new Scar();
      mark.observe(scar, prize, rcfg, FIXED_DT);
      mark.update(1, rcfg);
      const c = createCamera(rcfg);
      fitCamera(c, { w: 390, h: 844, dpr: 1 });
      centerCamera(c, state.ship.x, state.ship.y, fieldBounds(DEFAULT_CONFIG, state.bodies), null);
      const r = recordingContext();
      mark.draw(r.ctx, c, rcfg);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const op of r.ops) {
        if (op[0] === 'moveTo' || op[0] === 'lineTo') {
          xs.push(op[1] as number);
          ys.push(op[2] as number);
        }
      }
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };

    const nothing = spanOf(0);
    const middling = spanOf(rcfg.scarPrizeFull / 2);
    const big = spanOf(rcfg.scarPrizeFull);
    expect(middling, 'a middling fire draws a bigger mark than none').toBeGreaterThan(nothing);
    expect(big, 'and a full one bigger still').toBeGreaterThan(middling);

    // It saturates rather than growing without limit: the top of the measured
    // distribution is three times the p90 the span is set to.
    expect(spanOf(rcfg.scarPrizeFull * 10)).toBeCloseTo(big, 6);
  });

  it('shows the skull only when a press was made past the last chance', () => {
    // Measured: a press past the cross is fatal 94% of the time and precedes 43%
    // of deaths by a median 0.85s. It is drawn on the side AWAY from the wall, so
    // it never sits over the hazard gradient or the receding scar.
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
    centerCamera(c, snap.x, snap.y, f, null);

    const drawWith = (verdict: Partial<ScoreState>) => {
      const r = recordingContext();
      scene.draw(r.ctx, c, snap, {
        timeMs: 0,
        paused: false,
        viewportW: 390,
        viewportH: 844,
        headerBottom: 0,
        frameDt: 1 / 60,
        score: { ...createScoreState(), ...verdict },
      });
      const xs: number[] = [];
      const ys: number[] = [];
      let skull = false;
      let inside = false;
      for (const op of r.ops) {
        // The skull is the only thing in the scene that punches holes back out.
        if (op[0] === '=globalCompositeOperation' && op[1] === 'destination-out') {
          skull = true;
          inside = true;
        }
        // ...and `drawVerdict` restores immediately after it. The window has to
        // close, or every ellipse the rest of the frame draws lands in `ys` and
        // the glyph's centre becomes the centre of whatever else was on screen.
        if (inside && op[0] === 'restore') inside = false;
        if (inside && (op[0] === 'ellipse' || op[0] === 'fillRect' || op[0] === 'lineTo')) {
          xs.push(op[1] as number);
          ys.push(op[2] as number);
        }
      }
      // The glyph's own centre, so an assertion about where it SITS is not really
      // an assertion about how wide a skull is.
      const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
      return { skull, xs, ys, cx: mid(xs), cy: mid(ys) };
    };

    expect(drawWith({}).skull, 'nothing is drawn when nothing is owed').toBe(false);

    const right = drawWith({ doomed: { wall: 'right', tick: snap.tick } });
    expect(right.skull, 'the skull is drawn when a press was too late').toBe(true);
    const left = drawWith({ doomed: { wall: 'left', tick: snap.tick } });
    expect(left.skull).toBe(true);
    const top = drawWith({ doomed: { wall: 'top', tick: snap.tick } });
    expect(top.skull, 'including at the ceiling').toBe(true);

    // Away from the wall: heading at the RIGHT wall puts it left of the ship.
    const shipX = toScreenX(c, snap.x);
    expect(Math.min(...right.xs), 'right wall -> skull sits left of the ship').toBeLessThan(shipX);
    expect(Math.max(...left.xs), 'left wall -> skull sits right of the ship').toBeGreaterThan(
      shipX,
    );

    // And the ceiling flees on the other axis, which the old `-side * OFFSET`
    // could not express: the skull sits BELOW the ship, never between it and the
    // line it is about to cross, and is not displaced sideways at all.
    const shipY = toScreenY(c, snap.y);
    expect(top.cy, 'ceiling -> skull sits below the ship').toBeGreaterThan(shipY);
    expect(top.cx, 'ceiling -> and stays over it').toBeCloseTo(shipX, 6);
  });

  it('glows for a press close to the cross, and not for one that drifted past', () => {
    // Proximity TIMES a press, and both halves matter. It rose with proximity
    // alone for one session and lit on every approach, including the ones the
    // player was going to sail straight past — ambience rather than an answer.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT)!;
    expect(scar.cross).toBeTruthy();

    /** Brightest red drawn after the mark stops being live. */
    const glowOf = (lead: number, ended: 'press' | 'drifted'): number => {
      const mark = new Scar();
      mark.observe({ ...scar, cross: { ...scar.cross!, t: lead } }, 0, rcfg, FIXED_DT);
      mark.update(1, rcfg);
      // A null scar means captured — a press. A scar with no cross left means the
      // ship drifted past without pressing.
      mark.observe(ended === 'press' ? null : { ...scar, cross: null }, 0, rcfg, FIXED_DT);
      const c = createCamera(rcfg);
      fitCamera(c, { w: 390, h: 844, dpr: 1 });
      centerCamera(c, state.ship.x, state.ship.y, f, null);
      const r = recordingContext();
      mark.draw(r.ctx, c, rcfg);
      let peak = 0;
      for (const op of r.ops) {
        if (op[0] !== '=fillStyle') continue;
        const m = /rgba\(255,70,90,([\d.]+)\)/.exec(String(op[1]));
        if (m) peak = Math.max(peak, Number(m[1]));
      }
      return peak;
    };

    const onIt = glowOf(0.02, 'press');
    const early = glowOf(rcfg.scarFullSecs, 'press');
    const missed = glowOf(0.02, 'drifted');

    expect(onIt, 'a press right on the cross lights it').toBeGreaterThan(early);
    expect(onIt, 'up to the configured peak').toBeLessThanOrEqual(rcfg.scarNearAlpha + 1e-6);
    expect(early, 'a press with the whole window left does not').toBeLessThanOrEqual(
      rcfg.scarAlpha + 1e-6,
    );
    expect(missed, 'and drifting past it never lights, however close').toBeLessThanOrEqual(
      rcfg.scarAlpha + 1e-6,
    );
  });

  it('still draws the mark when the ship is right on top of it', () => {
    // The bug this pins: `upto` holds one sample when the cross is inside the
    // first, both ends of the heading resolved to it, the direction came out
    // (0, 0), and the crossbar had zero length — so the mark vanished silently at
    // the exact moment the ship reached it.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT)!;
    const mark = new Scar();
    mark.observe({ ...scar, cross: { ...scar.cross!, t: 0.005 } }, 0, rcfg, FIXED_DT);
    mark.update(1, rcfg);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, state.ship.x, state.ship.y, f, null);
    const r = recordingContext();
    mark.draw(r.ctx, c, rcfg);
    expect(
      r.ops.some((op) => op[0] === '=fillStyle' && String(op[1]).startsWith('rgba(255,70,90')),
      'the mark is still there at the cross',
    ).toBe(true);
  });

  it('cuts a displaced mark short, but not the one left behind at a death', () => {
    // "We should fade old crosses a bit faster if the user taps more. The scars
    // add clutter, and it's only the most recent one that matters." Both halves
    // pull opposite ways on one number, so the duration belongs to the mark: the
    // one explaining a death keeps the long fade, the one shoved aside does not.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT)!;
    const peek = (m: Scar) =>
      m as unknown as { mark: { fade: number } | null; ghost: { fade: number } | null };

    const mark = new Scar();
    mark.observe(scar, 0, rcfg, FIXED_DT);
    expect(peek(mark).mark!.fade, 'a live mark gets the long fade').toBe(rcfg.scarFadeOutSecs);

    // Passed without a press: still the most recent thing, so it keeps it. This
    // is the mark that explains a death, and the fade deliberately outlasts the
    // median 0.53s between the cross and the wall.
    mark.observe({ ...scar, cross: null }, 0, rcfg, FIXED_DT);
    expect(peek(mark).mark!.fade, 'the mark left behind keeps it').toBe(rcfg.scarFadeOutSecs);

    // Displaced by a fresher answer: cut short.
    mark.observe({ ...scar, cross: { ...scar.cross!, x: scar.cross!.x + 400 } }, 0, rcfg, FIXED_DT);
    expect(peek(mark).ghost, 'the old one was let go').not.toBeNull();
    expect(peek(mark).ghost!.fade, 'and is cut short').toBe(rcfg.scarGhostSecs);
    expect(peek(mark).mark!.fade, 'while the new one gets the long fade').toBe(
      rcfg.scarFadeOutSecs,
    );
    expect(rcfg.scarGhostSecs).toBeLessThan(rcfg.scarFadeOutSecs);
  });

  it('leaves no mark behind for a press too brief to have been a decision', () => {
    // A press hides the scar and leaves the mark fading where the cross was, so a
    // burst of taps leaves a burst of marks. `dropMark` takes it away rather than
    // handing it to the ghost slot, so a tap leaves nothing at all.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 189, y: 120, vx: 230, vy: -70 });
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT)!;
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, state.ship.x, state.ship.y, f, null);

    const drew = (mark: Scar): boolean => {
      const r = recordingContext();
      mark.draw(r.ctx, c, rcfg);
      return r.ops.some(
        (op) => op[0] === '=fillStyle' && String(op[1]).startsWith('rgba(255,70,90'),
      );
    };

    // A press leaves the mark behind, fading.
    const held = new Scar();
    held.observe(scar, 0, rcfg, FIXED_DT);
    held.update(1, rcfg);
    held.observe(null, 0, rcfg, FIXED_DT);
    expect(drew(held), 'a real capture leaves its mark').toBe(true);

    // The same, then told the press was a tap.
    const tapped = new Scar();
    tapped.observe(scar, 0, rcfg, FIXED_DT);
    tapped.update(1, rcfg);
    tapped.observe(null, 0, rcfg, FIXED_DT);
    tapped.dropMark();
    expect(drew(tapped), 'a tap leaves nothing').toBe(false);

    // And it does not take an older, unrelated ghost with it: a tap says nothing
    // about the mark before it.
    const withGhost = new Scar();
    withGhost.observe(scar, 0, rcfg, FIXED_DT);
    withGhost.update(1, rcfg);
    withGhost.observe(null, 0, rcfg, FIXED_DT);
    withGhost.observe(
      { ...scar, cross: { ...scar.cross!, x: scar.cross!.x + 400 } },
      0,
      rcfg,
      FIXED_DT,
    );
    withGhost.update(1 / 60, rcfg);
    withGhost.dropMark();
    expect(drew(withGhost), 'the older ghost is left alone').toBe(true);
  });

  it('never draws an arm longer than the clamp, however far away the cross is', () => {
    // The cross sits a median 432px ahead and 1551px at p90, against a 390-wide
    // viewport — so without the clamp the common case is a line across the map.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: 100, y: 300, vx: 120, vy: -40 });
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const scar = rescueScar(state, DEFAULT_CONFIG, FIXED_DT);
    expect(scar?.cross, 'the fixture is meant to have a distant cross').toBeTruthy();
    const reach = Math.hypot(scar!.cross!.x - state.ship.x, scar!.cross!.y - state.ship.y);
    expect(reach, 'and distant enough that the clamp has to bite').toBeGreaterThan(
      rcfg.scarArmMaxPx,
    );

    // The scar alone, not the whole scene: the hazard band and the trailing
    // floor are drawn in the same red family, and an extent measured over all of
    // it would be measuring the field, not the mark.
    scene.scar.observe(scar, 0, rcfg, FIXED_DT);
    // A mark arrives rather than appearing, so it has to be allowed to finish
    // being born before there is anything to measure.
    scene.scar.update(1, rcfg);
    const r = recordingContext();
    centerCamera(c, state.ship.x, state.ship.y, f, null);
    scene.scar.draw(r.ctx, c, rcfg);

    const xs: number[] = [];
    const ys: number[] = [];
    for (const op of r.ops) {
      if (op[0] === 'moveTo' || op[0] === 'lineTo') {
        xs.push(op[1] as number);
        ys.push(op[2] as number);
      }
    }
    expect(xs.length, 'the scar drew nothing to measure').toBeGreaterThan(0);
    const spanPx = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    // The arm, plus the stub past the mark and the crossbar across it.
    const limit = (rcfg.scarArmMaxPx + rcfg.scarStubHalf + rcfg.scarBarHalf) * c.scale;
    expect(
      spanPx,
      `the scar spans ${spanPx.toFixed(0)}px against a ${limit.toFixed(0)}px bound`,
    ).toBeLessThanOrEqual(limit);
  });

  it('draws fire on the ship while it is burning, and none when it is not', () => {
    // The scene tests above all run on a fresh score state, where nothing is ever
    // alight — so without this the flame path would never be drawn at all.
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
    centerCamera(c, snap.x, snap.y, f, null);

    const frames = (burnHeat: number) => {
      const scene = new Scene(
        { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
        99,
      );
      const r = recordingContext();
      // Several frames, because the flame chases the scorer's heat rather than
      // snapping to it — one frame in, it has barely caught.
      for (let i = 0; i < 20; i++) {
        r.reset();
        scene.draw(r.ctx, c, snap, {
          timeMs: i * 16.67,
          paused: false,
          viewportW: 390,
          viewportH: 844,
          headerBottom: 0,
          frameDt: 1 / 60,
          score: { ...createScoreState(), burnHeat },
        });
      }
      return r;
    };

    const hot = frames(0.9);
    const cold = frames(0);
    // The wake is the only linear gradient the ship draws. The stub records a
    // gradient factory under a '=' prefix, like a property set.
    expect(hot.calls('=createLinearGradient').length).toBeGreaterThan(
      cold.calls('=createLinearGradient').length,
    );
    for (const op of hot.ops) {
      for (const arg of op.slice(1)) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('burns orange even when the burn is faint', () => {
    // The defect this pins: opacity and colour both scaled linearly with heat, so
    // a typical real skim — which scores around 0.25, not 1.0 — drew a near-white
    // core at 37% alpha. Over black that is RGB (94,87,70): a warm grey smudge no
    // brighter than the trail. Reported from a phone as "no flames or redness".
    //
    // Fire has to look like fire at the BOTTOM of its range, which is where nearly
    // all of it happens.
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
    centerCamera(c, snap.x, snap.y, f, null);

    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const r = recordingContext();
    for (let i = 0; i < 20; i++) {
      r.reset();
      scene.draw(r.ctx, c, snap, {
        timeMs: i * 16.67,
        paused: false,
        viewportW: 390,
        viewportH: 844,
        headerBottom: 0,
        frameDt: 1 / 60,
        score: { ...createScoreState(), burnHeat: 0.25 },
      });
    }

    const stops = r.calls('addColorStop').map((o) => String(o[2]));
    const rgba = stops
      .map((c) => /rgba?\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(c))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: Number(m[4]),
      }));

    // The flame's opaque stops, ignoring the transparent tail every gradient ends
    // on and the other gradients in the scene, which are not red.
    const fire = rgba.filter((c) => c.a > 0.2 && c.r > c.g && c.g >= c.b);
    expect(fire.length).toBeGreaterThan(0);

    const brightest = fire.reduce((a, b) => (a.a > b.a ? a : b));
    // Actually bright: the old code peaked at 0.37 here.
    expect(brightest.a).toBeGreaterThan(0.5);
    // Actually orange: red must clearly dominate. The old near-white core sat at
    // a red:green ratio of 1.08, which is grey by any useful measure.
    expect(brightest.r / brightest.g).toBeGreaterThan(1.3);
  });

  it('draws the ship and at least one body on a normal frame', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
    centerCamera(c, snap.x, snap.y, f, null);
    const r = recordingContext();
    scene.draw(r.ctx, c, snap, {
      timeMs: 0,
      paused: false,
      viewportW: 390,
      viewportH: 844,
      headerBottom: 0,
      frameDt: 1 / 60,
      score: createScoreState(),
    });

    expect(r.calls('arc').length).toBeGreaterThan(0); // bodies + rings
    expect(r.calls('fillText').length).toBeGreaterThan(0); // planet labels
    expect(
      r.calls('createRadialGradient').length + r.calls('=createRadialGradient').length,
    ).toBeGreaterThan(0);
  });
});

describe('boost halo', () => {
  it('ramps colour amber -> rose -> violet, with violet at peak', () => {
    const [r0, , b0] = boostColor(0);
    const [r1, g1, b1] = boostColor(1);
    // amber at rest: red high, blue low
    expect(b0).toBeLessThan(150);
    expect(r0).toBeGreaterThan(200);
    // violet at peak: blue dominant, matching the build's accent
    expect(b1).toBeGreaterThan(200);
    expect(b1).toBeGreaterThan(r1);
    expect(g1).toBeLessThan(b1);
    // and it never passes through mud (blue must rise monotonically)
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const b = boostColor(t)[2];
      expect(b).toBeGreaterThanOrEqual(prev - 1);
      prev = b;
    }
  });

  it('glow grows with charge and never blinks off between frames', () => {
    const c = cam();
    const sim = DEFAULT_CONFIG;
    const radii: number[] = [];
    const alphas: number[] = [];

    // sweep the whole envelope at 60Hz, sampling the drawn glow each tick. The
    // bound is derived, not 120: the envelope's tail moved out to
    // `settleDur + boostDecayTime` and a fixed count would stop short of it.
    const ticks = Math.ceil((sim.settleDur + sim.boostDecayTime + 0.2) * 60);
    for (let i = 0; i < ticks; i++) {
      const boostT = i * (1 / 60);
      // Read the real envelope rather than restating it: the plateau added by
      // `boostHoldsThroughSettle` changed its shape once already, and a copy here
      // would have kept sweeping the old one and stopped covering the halo.
      const charge = boostEnvelope(sim, 1, boostT);
      if (charge <= 0.02) continue;
      const r = recordingContext();
      drawBoostHalo(
        r.ctx,
        c,
        sim,
        rcfg,
        {
          ...captureSnapshot(createInitialState(sim), true, sim),
          capture: captureOf({ boost: charge * 90, boostFull: 90, boostT }),
        },
        boostT * 1000,
      );
      const arcs = r.calls('arc') as Array<[string, number, number, number]>;
      expect(arcs.length).toBeGreaterThan(0); // never a frame with nothing drawn
      radii.push(arcs[0]![3]);
      const grads = r.calls('=createRadialGradient');
      expect(grads.length).toBe(1);
      alphas.push(charge);
    }

    // the glow at peak charge is clearly larger than at low charge
    const peak = Math.max(...radii);
    const low = Math.min(...radii);
    expect(peak).toBeGreaterThan(low * 1.5);
  });
});

describe('HUD', () => {
  const sim = DEFAULT_CONFIG;

  function snapWith(over: Partial<ReturnType<typeof captureSnapshot>>) {
    const base = captureSnapshot(createInitialState(sim), false, sim);
    return { ...base, ...over };
  }

  it('says nothing while simply drifting with a full tank', () => {
    expect(readoutLines(sim, snapWith({}), true)).toEqual([]);
  });

  it('explains a refused grab, and only briefly', () => {
    const refused = snapWith({
      tick: 100,
      lastGrab: { tick: 90, result: 'refused-crash-cone' as const },
    });
    expect(readoutLines(sim, refused, true)[0]?.text).toContain('TOO LATE');

    // and it ages out rather than lingering forever
    const later = snapWith({
      tick: 400,
      lastGrab: { tick: 90, result: 'refused-crash-cone' as const },
    });
    expect(readoutLines(sim, later, true)).toEqual([]);
  });

  it('names an empty tank as the reason a grab did nothing', () => {
    const dry = snapWith({
      tick: 100,
      fuel: 0,
      lastGrab: { tick: 95, result: 'refused-no-fuel' as const },
    });
    const texts = readoutLines(sim, dry, true).map((l) => l.text);
    expect(texts.some((t) => t.includes('NO FUEL'))).toBe(true);
    expect(texts.some((t) => t.includes('TANK EMPTY'))).toBe(true);
  });

  it('calls the boost peak, and distinguishes it from arming and fading', () => {
    const at = (boostT: number) =>
      readoutLines(
        sim,
        snapWith({
          capture: captureOf({
            settleProgress: 0.5,
            settleT: 0.6,
            boost: 50,
            boostFull: 90,
            boostT,
          }),
        }),
        true,
      ).map((l) => l.text);

    expect(at(0.2).some((t) => t.includes('arming'))).toBe(true);
    expect(at(sim.boostArmTime).some((t) => t.includes('PEAK'))).toBe(true);
    expect(at(1.2).some((t) => t.includes('fading'))).toBe(true);
  });

  it('warns before a capture runs dry rather than after', () => {
    const poor = snapWith({
      fuel: 4,
      capture: captureOf({
        phase: 'settle',
        settleProgress: 0.1,
        settleT: 0.1,
        rPeri: 100,
        boost: 0,
        boostFull: 0,
        boostT: 0,
        overEscape: 0,
      }),
    });
    const texts = readoutLines(sim, poor, false).map((l) => l.text);
    expect(texts.some((t) => t.includes('will not round out'))).toBe(true);
  });

  /**
   * A flyby is not automatically trouble. Measured over a real 82-second session:
   * conversions sat at 1.09-1.22x escape speed and cost under 20 fuel; failures
   * sat at 1.31-1.82x and cost the whole tank. Showing the same alarm for both
   * was the complaint that prompted this.
   */
  function flybyAt(overEscape: number, fuel = 99) {
    return snapWith({
      fuel,
      capture: captureOf({ phase: 'flyby', settleProgress: 0, settleT: 0, rPeri: 0, overEscape }),
    });
  }

  it('reports progress, not alarm, on a flyby that will convert cheaply', () => {
    const texts = readoutLines(sim, flybyAt(0.12), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('BRAKING'))).toBe(true);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(false);
  });

  it('shows how far over escape it still is, counting down', () => {
    const far = readoutLines(sim, flybyAt(0.2), true)[0]!.text;
    const near = readoutLines(sim, flybyAt(0.05), true)[0]!.text;
    expect(far).toContain('20%');
    expect(near).toContain('5%');
  });

  it('escalates only when the brake genuinely is not winning', () => {
    // 0.75 rather than 0.6: `flybyBrake` 320 -> 600 moved the line where a save
    // stops being routine from 0.28 to 0.70. Measured, a grab 65% over escape
    // now converts in 37 ticks for 46 fuel — nothing to shout about — while 80%
    // over costs essentially the whole tank. See FLYBY_HARD in hud.ts.
    const texts = readoutLines(sim, flybyAt(0.75), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(true);
    expect(texts.some((t) => t.includes('costs a lot of fuel'))).toBe(true);
  });

  it('stays calm about a save that is now routine', () => {
    // The whole point of the threshold: 0.6 used to be an alarm and is now a
    // 46-fuel recovery. A readout that cries wolf is the thing the original
    // measurement existed to prevent.
    const texts = readoutLines(sim, flybyAt(0.6), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(false);
    expect(texts.some((t) => t.includes('BRAKING'))).toBe(true);
  });

  it('says the tank is empty rather than blaming speed', () => {
    const texts = readoutLines(sim, flybyAt(0.6, 0), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('OUT OF FUEL'))).toBe(true);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(false);
  });

  it('draws the gauge and its numeric readout inside the design window', () => {
    const c = cam();
    const r = recordingContext();
    drawFuelGauge(r.ctx, c, sim, snapWith({ fuel: 42 }), 0);
    const winL = c.offsetX;
    const winR = c.offsetX + c.designW * c.scale;
    const boxes = [...r.calls('fillRect'), ...r.calls('roundRect')] as Array<
      [string, number, number, number]
    >;
    expect(boxes.length, 'the gauge drew nothing').toBeGreaterThan(0);
    for (const [, x, , w] of boxes) {
      expect(x).toBeGreaterThanOrEqual(winL - 1e-6);
      expect(x + w).toBeLessThanOrEqual(winR + 1e-6);
    }
    expect((r.calls('fillText') as Array<[string, string]>).some((o) => o[1] === '42')).toBe(true);
  });
});

describe('floating score popups', () => {
  const award = (over: Partial<Parameters<Popups['spawn']>[0]> = {}) =>
    ({
      tick: 100,
      kind: 'link' as const,
      points: 240,
      multiplier: 1,
      body: 'P3→P4',
      close: 0.4,
      clearance: 140,
      skim: 90,
      defl: 3,
      timing: 0.1,
      aim: 0.2,
      climb: 400,
      heat: 0,
      ...over,
    }) as Parameters<Popups['spawn']>[0];

  const texts = (r: ReturnType<typeof recordingContext>) =>
    (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);

  it('keeps the routine colour quiet by chroma, not by darkness', () => {
    // The rule that is easy to undo by reaching for a darker grey. ROUTINE was a
    // dark grey once and it was the least legible text in the game while being the
    // one shown most often. It is a near-white now, and what makes it recessive is
    // having no hue — which leaves the ladder free to climb in saturation instead
    // of in light.
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(ROUTINE.color);
    expect(m, 'ROUTINE should be an rgba near-white').not.toBeNull();
    const [r, g, b, a] = [1, 2, 3, 4].map((i) => Number(m![i])) as [number, number, number, number];
    // Near-white: bright, and close to neutral.
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40);
    // Slightly transparent, so it cannot be the brightest thing on a dark screen
    // and the starfield shows through the strokes.
    expect(a).toBeGreaterThan(0.4);
    expect(a).toBeLessThan(0.85);

    // And every rung above it is saturated, so the ladder is a chroma ladder.
    for (const level of [LEVEL.good, LEVEL.great, LEVEL.exceptional]) {
      const [lr, lg, lb] = [1, 3, 5].map((i) => parseInt(level.color.slice(i, i + 2), 16));
      expect(Math.max(lr!, lg!, lb!) - Math.min(lr!, lg!, lb!)).toBeGreaterThan(80);
    }
  });

  it('shows the points for a routine link, with no word', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(texts(r)).toContain('+240');
    expect(texts(r)).toHaveLength(1);
  });

  it('adds the word a praised link earned', () => {
    const p = new Popups();
    p.spawn(award({ aim: AIM.tier2, points: 680 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(texts(r)).toContain('+680');
    // Just the word — no label naming the axis, because the word names it. Each
    // is stroked and filled, so it appears twice.
    const words = texts(r).filter((t) => !t.startsWith('+'));
    expect(words.length).toBeGreaterThan(0);
    expect(WORDS.aim[1]).toContain(words[0]);
  });

  it("rolls a burn's number up after the drag, not during it", () => {
    // A live tally beside the ship was built and taken back out — see PORT_NOTES
    // 51. The count belongs after the act: while the drag is happening the player
    // is inches from a wall and deciding whether to hold on, and a number climbing
    // in their peripheral vision competes with that. Afterwards it has the moment
    // to itself.
    const p = new Popups();
    p.spawn(award({ kind: 'burn' as const, points: 200, heat: 0.9 }), 195, 0);
    const shown = (): number => {
      const r = recordingContext();
      p.draw(r.ctx, cam());
      const n = texts(r).find((t) => t.startsWith('+'))!;
      return Number(n.slice(1).replace(/,/g, ''));
    };

    expect(shown()).toBe(0);
    p.update(0.2);
    const mid = shown();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(200);
    p.update(0.3);
    expect(shown()).toBeGreaterThan(mid);
    p.update(0.4); // past the 0.8s roll
    expect(shown()).toBe(200);
  });

  it('burns the WORD in ember and leaves the number the default grey', () => {
    // The narrow exception in `accolade.ts`: SINGED / SCORCHED / INFERNO name a
    // thing that has a colour, and ladder blue is the one case where the ladder
    // fights the word it is colouring.
    //
    // The number does NOT follow it, and does not follow the ladder either. This
    // assertion wanted `LEVEL.great` for one build, and the ladder is exactly what
    // went wrong: a drag that scored well turned the number BLUE beside an orange
    // word — two hues on one two-line popup, neither of them fire. Grey always,
    // with size still climbing the rung, so how good it was is not lost.
    const p = new Popups();
    // heat 0.8 clears BURN.tier2, so this one earns a word.
    p.spawn(award({ kind: 'burn' as const, points: 180, heat: 0.8 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    const fills = r.calls('=fillStyle').map((o) => String(o[1]));
    expect(fills).toContain(BURN_WORD.color);
    expect(fills).toContain(ROUTINE.color);
    expect(fills).not.toContain(LEVEL.great.color);
    expect(fills).not.toContain(LEVEL.good.color);

    const words = texts(r).filter((t) => !t.startsWith('+'));
    expect(WORDS.burn.flat()).toContain(words[0]);
  });

  it('draws a burn on the rarity ladder, like every other award', () => {
    // This pinned the opposite for one build. A red channel for the burn — its own
    // colour whether or not it earned a word — was asked for, built, and taken back
    // out: "I even preferred your original gray plus points."
    //
    // So the rule in `accolade.ts` stands unbroken after all: colour means HOW GOOD,
    // the word says WHAT, and the only thing red in this feature is the fire itself.
    // A burn under the word threshold is grey, exactly like any other routine award,
    // and that is the commonest thing a burn is.
    const p = new Popups();
    // heat 0.2 is well under BURN.tier1, so this one earns no word.
    p.spawn(award({ kind: 'burn' as const, points: 40, heat: 0.2 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(r.calls('=fillStyle').map((o) => String(o[1]))).toContain(ROUTINE.color);
  });

  it('rises and then expires', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    const yAt = (): number => {
      const r = recordingContext();
      p.draw(r.ctx, cam());
      return (r.calls('fillText') as Array<[string, string, number, number]>)[0]?.[3] ?? NaN;
    };
    const first = yAt();
    p.update(0.3);
    const later = yAt();
    expect(later, 'the popup did not rise').toBeLessThan(first);

    p.update(2);
    expect(p.count()).toBe(0);
    const gone = recordingContext();
    p.draw(gone.ctx, cam());
    expect(gone.ops).toHaveLength(0);
  });

  it('does not age while the game is not advancing it', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    for (let i = 0; i < 100; i++) p.draw(recordingContext().ctx, cam());
    expect(p.count(), 'drawing alone expired a popup').toBe(1);
  });

  it('draws a reckless shout with no number attached', () => {
    const p = new Popups();
    p.shout({ tick: 100, word: 'WILD CHILD!', kind: 'reckless', streak: 3 }, 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    const t = texts(r);
    expect(t.some((x) => x === 'WILD CHILD!')).toBe(true);
    // a shout is not about points, so nothing numeric may ride along with it
    expect(t.some((x) => /^[+-]/.test(x))).toBe(false);
  });

  it('grades by colour, and names the quality in words', () => {
    // Colour carries HOW GOOD, never WHICH quality — six category hues read in
    // peripheral vision over a moving starfield was past what anyone tells apart,
    // and it had to be learned before it meant anything. The label says it
    // outright instead.
    const shot = (over: Partial<Parameters<Popups['spawn']>[0]>) => {
      const p = new Popups();
      p.spawn(award(over), 195, 0);
      const r = recordingContext();
      p.draw(r.ctx, cam());
      const fills = r.ops
        .filter((o) => o[0] === '=fillStyle')
        .map((o) => String(o[1]))
        .filter((v) => v.startsWith('#'));
      return { texts: texts(r), color: fills[fills.length - 1] };
    };

    // Same rung, different quality -> same colour, and the WORD carries which.
    const aimGreat = shot({ aim: AIM.tier2, kind: 'link' });
    const closeGreat = shot({ kind: 'grab', clearance: CLOSE_PX.tier2, skim: 999 });
    expect(aimGreat.color).toBe(closeGreat.color);
    expect(aimGreat.texts.some((t) => WORDS.aim[1].includes(t))).toBe(true);
    expect(closeGreat.texts.some((t) => WORDS.close[1].includes(t))).toBe(true);

    // different level -> different colour
    const aimGood = shot({ aim: AIM.tier1, kind: 'link' });
    expect(aimGood.color).not.toBe(aimGreat.color);
  });

  it('climbs the ladder in size as well as colour', () => {
    // The ordinal has to survive a player who cannot separate the hues, and a
    // player looking at the planet rather than the ship.
    const sizeOf = (over: Partial<Parameters<Popups['spawn']>[0]>) => {
      const p = new Popups();
      p.spawn(award(over), 195, 0);
      const r = recordingContext();
      p.draw(r.ctx, cam());
      // `600 15px ui-monospace, ...` — the weight comes first, so match the px.
      const fonts = r.ops
        .filter((o) => o[0] === '=font')
        .map((o) => Number(/([\d.]+)px/.exec(String(o[1]))?.[1] ?? 0));
      return Math.max(...fonts);
    };
    const good = sizeOf({ kind: 'link', aim: AIM.tier1 });
    const great = sizeOf({ kind: 'link', aim: AIM.tier2 });
    const exceptional = sizeOf({ kind: 'link', aim: AIM.tier2, timing: PEAK.tier2 });
    expect(great).toBeGreaterThan(good);
    expect(exceptional).toBeGreaterThan(great);
  });

  it('names which event a superlative was for', () => {
    // The one case that could not be read before: one gold word for both a
    // superlative arrival and a superlative departure.
    const p = new Popups();
    p.spawn(award({ kind: 'link', aim: AIM.tier2, timing: PEAK.tier2 }), 195, 0);
    p.spawn(award({ kind: 'grab', clearance: CLOSE_PX.tier2, skim: -30, tick: 101 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    // No label says which event it was; the two word lists are disjoint, and the
    // moment each fires is the other half of the answer.
    const t = texts(r);
    expect(
      t.some((x) => WORDS.super[1].includes(x)),
      'no release superlative',
    ).toBe(true);
    expect(
      t.some((x) => WORDS.super[0].includes(x)),
      'no grab superlative',
    ).toBe(true);
  });

  it('draws a shout no louder than a praised release', () => {
    // It pays nothing. It had been the biggest, tilted, and punching to 1.4x on
    // arrival, which is not what "off the ladder" should look like.
    const p = new Popups();
    p.shout({ tick: 100, word: 'RECKLESS!', kind: 'reckless', streak: 3 }, 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    const px = (r.ops.filter((o) => o[0] === '=font') as Array<[string, string]>).map((o) =>
      Number(/([\d.]+)px/.exec(o[1])?.[1] ?? 0),
    );
    expect(Math.max(...px)).toBe(SHOUT.size * cam().scale);
    expect(SHOUT.size, 'a shout outgrew the top of the ladder').toBeLessThanOrEqual(
      LEVEL.exceptional.size,
    );
    // and it is upright: a rotation would show up as a transform
    expect(r.ops.some((o) => o[0] === 'rotate')).toBe(false);
  });

  it('stacks a shout clear of an award raised at the same moment', () => {
    // Reported: the two were drawn through each other and neither could be read.
    // Everything rises the same distance, so landing them on one spot means they
    // stay on it for the whole of both lives.
    const p = new Popups();
    p.spawn(award({ kind: 'grab', clearance: CLOSE_PX.tier2, skim: 999 }), 195, 0);
    p.shout({ tick: 100, word: 'RECKLESS!', kind: 'reckless', streak: 3 }, 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    const ys = (r.ops.filter((o) => o[0] === 'fillText') as Array<[string, string, number, number]>)
      .map((o) => o[3])
      .sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]!);
    // every pair of lines is either the word-and-its-number pair or a clear slot
    // apart; nothing sits on top of anything
    for (const g of gaps) expect(g, 'two popups drawn on the same line').toBeGreaterThan(0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10 * cam().scale);
  });

  it('never piles up more than a readable few', () => {
    const p = new Popups();
    for (let i = 0; i < 12; i++) p.spawn(award({ tick: 100 + i }), 195, 0);
    expect(p.count()).toBeLessThanOrEqual(4);
  });

  it('emits no non-finite coordinate at any point in a popup life', () => {
    const p = new Popups();
    p.spawn(award({ clearance: CLOSE_PX.tier2, aim: AIM.tier2, points: 1240 }), 195, 0);
    for (let i = 0; i < 120; i++) {
      const r = recordingContext();
      p.draw(r.ctx, cam());
      for (const op of r.ops) {
        for (const arg of op.slice(1)) {
          if (typeof arg === 'number') expect(Number.isFinite(arg), `${op[0]} at ${i}`).toBe(true);
        }
      }
      p.update(1 / 60);
    }
  });
});

describe('the score band', () => {
  const sim = DEFAULT_CONFIG;

  function snapAt(tick: number) {
    const base = captureSnapshot(createInitialState(sim), false, sim);
    return { ...base, tick };
  }

  function scoreWith(over: Partial<ReturnType<typeof createScoreState>>) {
    return { ...createScoreState(), ...over };
  }

  const award = (over: Partial<NonNullable<ReturnType<typeof createScoreState>['lastAward']>>) => ({
    tick: 100,
    kind: 'link' as const,
    points: 1240,
    multiplier: 2.25,
    body: 'P3→P4',
    close: 0.84,
    clearance: 32,
    skim: 40,
    defl: 3,
    timing: 0.91,
    aim: 0.96,
    climb: 412,
    heat: 0,
    turn: 0,
    ...over,
  });

  it('groups digits without depending on the device locale', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1240)).toBe('1,240');
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatScore(-150)).toBe('-150');
  });

  it('always shows the total, and the multiplier only once it is above 1', () => {
    const r = recordingContext();
    drawScore(r.ctx, cam(), scoreWith({ score: 1240 }), snapAt(0));
    let texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts).toContain('1,240');
    expect(texts.some((t) => t.startsWith('x'))).toBe(false);

    r.reset();
    drawScore(r.ctx, cam(), scoreWith({ score: 1240, multiplier: 2.25 }), snapAt(0));
    texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts).toContain('x2.25');
  });

  it('names what a link was paid for, so the weights can be read while playing', () => {
    const r = recordingContext();
    const sc = scoreWith({ score: 1240, multiplier: 2.25, lastAward: award({}) });
    drawScore(r.ctx, cam(), sc, snapAt(110));
    const texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts.some((t) => t.includes('+1,240'))).toBe(true);
    // A link reports how the ship LEFT. How it arrived was reported, and paid,
    // at the grab award — see the two tests below.
    const detail = texts.find((t) => t.includes('PEAK'))!;
    expect(detail).toContain('P3→P4');
    expect(detail).toContain('91');
    expect(detail).toContain('96');
    expect(detail).not.toContain('CLOSE');
  });

  it("splits a burn's band line so the word is ember and the number is not", () => {
    // The band draws points, multiplier and word as ONE centred string, so a burn
    // needs two runs to colour only the word. Easy to get wrong in a way nothing
    // else notices — and if it drifts, the band and the popup are back to
    // answering the same question in two different colours, which is the whole
    // reason `accolade.ts` is one table.
    const r = recordingContext();
    const burn = award({ kind: 'burn' as const, points: 180, heat: 0.8, multiplier: 2 });
    drawScore(r.ctx, cam(), scoreWith({ score: 900, lastAward: burn }), snapAt(110));

    const texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    const fills = r.calls('=fillStyle').map((o) => String(o[1]));
    expect(fills).toContain(BURN_WORD.color);

    // The number and the word are drawn separately, not as one string.
    const head = texts.find((t) => t.startsWith('+180'))!;
    expect(head).not.toContain('SCORCHED');
    expect(texts.some((t) => WORDS.burn.flat().some((w) => t.includes(w)))).toBe(true);
  });

  it('never announces a grab as a coasting penalty', () => {
    // This is the regression: `kind` grew a third value and the band still asked
    // `=== 'link'`, so every grab fell through to the deduction arm — the player
    // told off for the capture they had just made. The penalty itself is gone
    // now; what this still pins is that a grab reads as a gain.
    const r = recordingContext();
    const sc = scoreWith({
      score: 200,
      lastAward: award({ kind: 'grab', points: 34, body: 'P1', multiplier: 1 }),
    });
    drawScore(r.ctx, cam(), sc, snapAt(110));
    const texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts.some((t) => t.includes('+34'))).toBe(true);
    expect(texts.some((t) => t.includes('GRAB'))).toBe(true);
    expect(texts.every((t) => !t.includes('-'))).toBe(true);
  });

  it('reports only the qualities the event actually has', () => {
    // A grab has no aim or peak yet; showing them as zeroes would read as a bad
    // release rather than one that has not happened.
    const r = recordingContext();
    drawScore(
      r.ctx,
      cam(),
      scoreWith({ lastAward: award({ kind: 'grab', aim: 0, timing: 0 }) }),
      snapAt(110),
    );
    const detail = (r.calls('fillText') as Array<[string, string]>)
      .map((o) => o[1])
      .find((t) => t.includes('CLOSE'))!;
    expect(detail).not.toContain('AIM');
    expect(detail).not.toContain('PEAK');
  });

  it('ages the award by simulation tick, so a pause cannot expire it', () => {
    const sc = scoreWith({ lastAward: award({}) });
    const fresh = recordingContext();
    drawScore(fresh.ctx, cam(), sc, snapAt(101));
    const stale = recordingContext();
    drawScore(stale.ctx, cam(), sc, snapAt(100 + 200));
    const has = (r: typeof fresh) =>
      (r.calls('fillText') as Array<[string, string]>).some((o) => o[1].includes('+1,240'));
    expect(has(fresh)).toBe(true);
    expect(has(stale)).toBe(false);
  });

  it('stays inside the design window and never emits a non-finite coordinate', () => {
    const c = cam();
    const r = recordingContext();
    drawScore(
      r.ctx,
      c,
      scoreWith({ score: 1234567, multiplier: 5, lastAward: award({}) }),
      snapAt(110),
    );
    expect(r.ops.length).toBeGreaterThan(0);
    for (const op of r.ops) {
      for (const arg of op.slice(1)) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
    for (const [, , x, y] of r.calls('fillText') as Array<[string, string, number, number]>) {
      expect(x).toBeGreaterThan(c.offsetX);
      expect(x).toBeLessThan(c.offsetX + c.designW * c.scale);
      expect(y).toBeGreaterThan(c.offsetY);
    }
  });
});

describe('the predicted capture path', () => {
  const bodies = createBodies(DEFAULT_CONFIG);

  const diving = (over = {}) => ({
    ...captureSnapshot(createInitialState(DEFAULT_CONFIG), true, DEFAULT_CONFIG),
    capture: captureOf({ phase: 'clear' as const, orbit: null, ...over }),
  });

  it('draws something while the grab is still unbound', () => {
    // The old code gave up here — "a hyperbola has no ellipse to draw" — which
    // left the first stretch of every fast grab blank. Measured on a real
    // session: 23 ticks of nothing at the moment of commitment.
    const r = recordingContext();
    drawOrbitCurve(r.ctx, cam(), DEFAULT_CONFIG, diving({ vx: 900, vy: 0 }), bodies[0]!);
    expect(r.calls('lineTo').length, 'no path drawn for an unbound grab').toBeGreaterThan(4);
  });

  it('leaves a hyperbola open and closes a bound orbit', () => {
    const open = recordingContext();
    drawOrbitCurve(open.ctx, cam(), DEFAULT_CONFIG, diving({ vx: 900, vy: 0 }), bodies[0]!);
    expect(open.calls('closePath')).toHaveLength(0);

    const shut = recordingContext();
    drawOrbitCurve(
      shut.ctx,
      cam(),
      DEFAULT_CONFIG,
      {
        ...captureSnapshot(createInitialState(DEFAULT_CONFIG), true, DEFAULT_CONFIG),
        capture: captureOf({ phase: 'orbit', orbit: { a: 100, e: 0.2, argp: 0, dir: 1 } }),
      },
      bodies[0]!,
    );
    expect(shut.calls('closePath').length).toBeGreaterThan(0);
  });

  it('never draws inside the minimum orbit, or off to infinity', () => {
    for (const v of [200, 500, 900, 2000]) {
      const r = recordingContext();
      const anchor = bodies[0]!;
      drawOrbitCurve(r.ctx, cam(), DEFAULT_CONFIG, diving({ vx: v, vy: 0 }), anchor);
      const c = cam();
      for (const [, x, y] of r.calls('lineTo') as Array<[string, number, number]>) {
        expect(Number.isFinite(x) && Number.isFinite(y), `non-finite at v=${v}`).toBe(true);
        const wx = (x - c.offsetX) / c.scale + c.left;
        const wy = (y - c.offsetY) / c.scale + c.centerY - c.viewH / 2;
        const rr = Math.hypot(wx - anchor.x, wy - anchor.y);
        expect(rr).toBeGreaterThanOrEqual(58 - 1e-6);
        expect(rr).toBeLessThanOrEqual(901);
      }
    }
  });
});

describe('release compass', () => {
  const anchor = createBodies(DEFAULT_CONFIG)[0]!;
  const orbit = { a: 90, e: 0.15, argp: 0.4, dir: 1 };

  /** Where the ship ends up if it releases at `angle` and drifts straight. */
  function releaseRay(angle: number, tighten: number) {
    const rr = orbitRadius(orbit, 80, angle, tighten);
    return {
      x: anchor.x + Math.cos(angle) * rr,
      y: anchor.y + Math.sin(angle) * rr,
      hx: -Math.sin(angle) * orbit.dir,
      hy: Math.cos(angle) * orbit.dir,
    };
  }

  it('finds an angle whose tangent actually points at the target', () => {
    for (const target of [
      { x: 400, y: -600 },
      { x: -200, y: -900 },
      { x: 189, y: -1350 },
      { x: 500, y: 200 },
    ]) {
      const { angle, error } = releaseAngleFor(orbit, 80, 0.5, anchor, target);
      expect(error, 'no aiming solution found').toBeLessThan(0.01);

      // verify independently: the release ray must pass close to the target
      const r = releaseRay(angle, 0.5);
      const dx = target.x - r.x;
      const dy = target.y - r.y;
      const len = Math.hypot(dx, dy);
      const cross = Math.abs(r.hx * dy - r.hy * dx); // perpendicular miss distance
      expect(cross / len, 'release ray does not aim at the target').toBeLessThan(0.02);
    }
  });

  it('matches a brute-force search at a fraction of the cost', () => {
    const target = { x: 420, y: -700 };
    let calls = 0;
    const counted = new Proxy(anchor, { get: (t, k) => (calls++, (t as never)[k]) });
    releaseAngleFor(orbit, 80, 0.5, counted as typeof anchor, target);
    const cheap = calls;

    calls = 0;
    releaseAngleFor(orbit, 80, 0.5, counted as typeof anchor, target, 180, 0);
    const brute = calls;

    expect(cheap).toBeLessThan(brute);
    // and the cheap one is MORE accurate, because it refines rather than sampling
    const a = releaseAngleFor(orbit, 80, 0.5, anchor, target);
    const b = releaseAngleFor(orbit, 80, 0.5, anchor, target, 180, 0);
    expect(a.error).toBeLessThan(b.error);
  });

  it('knows when another body is in the way', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const from = { x: bodies[0]!.x, y: bodies[0]!.y - 200 };
    // straight through the middle of a body sitting between us and the target
    const blocker = bodies[1]!;
    const beyond = {
      ...blocker,
      x: blocker.x + (blocker.x - from.x),
      y: blocker.y + (blocker.y - from.y),
    };
    expect(pathBlocked(from, beyond, [...bodies, beyond], [bodies[0]!])).toBe(true);
    // and a clear line is not reported as blocked
    expect(pathBlocked({ x: -400, y: 0 }, bodies[0]!, bodies, [])).toBe(false);
  });

  it('offers the nearest bodies first, and never the anchor', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const targets = aimTargets(bodies, 0, 1e9, 3);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.index)).not.toContain(0);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]!.distance).toBeGreaterThanOrEqual(targets[i - 1]!.distance);
    }
  });

  /**
   * This used to assert the compass drew NOTHING before the orbit froze, and that
   * was the bug: measured on a real session, a grab spent 2.0 seconds diving with
   * no gauge at all — the whole stretch in which a player is deciding where the
   * capture is taking them. It now signposts the predicted orbit instead.
   */
  const diveSnap = (over = {}) => ({
    ...captureSnapshot(createInitialState(DEFAULT_CONFIG), true, DEFAULT_CONFIG),
    capture: captureOf({ phase: 'clear' as const, orbit: null, ...over }),
  });

  it('signposts the predicted orbit while still diving', () => {
    const r = recordingContext();
    const bodies = createBodies(DEFAULT_CONFIG);
    drawCompass(r.ctx, cam(), DEFAULT_CONFIG, rcfg, diveSnap(), bodies, 0);
    expect(r.ops.length, 'nothing drawn during the dive').toBeGreaterThan(0);
    expect((r.calls('fillText') as Array<[string, string]>).length).toBeGreaterThan(0);
  });

  it('promises no alignment until the orbit is real', () => {
    // A release before periapsis earns nothing, so the ship's glow — which says
    // "let go now and it counts" — must stay dark however well lined up it looks.
    const r = recordingContext();
    const bodies = createBodies(DEFAULT_CONFIG);
    const res = drawCompass(r.ctx, cam(), DEFAULT_CONFIG, rcfg, diveSnap(), bodies, 0);
    expect(res.bestAlign).toBe(0);
  });

  it('draws the dive gauge fainter than the settled one', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    // Property sets are recorded as `=strokeStyle` / `=fillStyle`.
    const alphaOf = (r: ReturnType<typeof recordingContext>): number => {
      const alphas = r.ops
        .filter((o) => o[0] === '=strokeStyle' || o[0] === '=fillStyle')
        .map((o) => String(o[1]))
        .filter((v) => v.startsWith('rgba('))
        .map((v) => Number(v.slice(0, -1).split(',').pop()))
        .filter((n) => Number.isFinite(n));
      expect(alphas.length, 'no rgba styles recorded').toBeGreaterThan(0);
      return Math.max(...alphas);
    };
    const dive = recordingContext();
    drawCompass(dive.ctx, cam(), DEFAULT_CONFIG, rcfg, diveSnap(), bodies, 0);
    const settled = recordingContext();
    drawCompass(
      settled.ctx,
      cam(),
      DEFAULT_CONFIG,
      rcfg,
      {
        ...captureSnapshot(createInitialState(DEFAULT_CONFIG), true, DEFAULT_CONFIG),
        capture: captureOf({ phase: 'orbit', orbit: { a: 100, e: 0, argp: 0, dir: 1 } }),
      },
      bodies,
      0,
    );
    expect(alphaOf(dive)).toBeLessThan(alphaOf(settled));
  });

  it('still draws nothing when the grab is too fast to have an orbit at all', () => {
    // A hyperbola has no release point to signpost. The predicted-orbit path must
    // not invent one.
    const r = recordingContext();
    const bodies = createBodies(DEFAULT_CONFIG);
    const res = drawCompass(
      r.ctx,
      cam(),
      DEFAULT_CONFIG,
      rcfg,
      diveSnap({ vx: 2000, vy: 0 }),
      bodies,
      0,
    );
    expect(res.bestAlign).toBe(0);
    expect(r.ops).toHaveLength(0);
  });
});

describe('compass targets point up the climb', () => {
  const bodies = createBodies(DEFAULT_CONFIG);

  it('never offers a body at or below the anchor', () => {
    for (let i = 0; i < bodies.length; i++) {
      const anchor = bodies[i]!;
      for (const t of aimTargets(bodies, i, 1e9, 8)) {
        expect(t.body.y, `${t.body.name} is not above ${anchor.name}`).toBeLessThan(anchor.y);
      }
    }
  });

  it('always points at the next step of the climb', () => {
    const counts = bodies.map((_, i) => aimTargets(bodies, i, AIM_RANGE, 3).length);
    // Everything above the top ROW, not above the top body: a forked row holds
    // two bodies at nearly the same height, so the higher of the two also has
    // nothing above it, and that is the field ending rather than a dead end.
    const top = Math.min(...bodies.map((b) => b.y));
    for (let i = 0; i < bodies.length; i++) {
      const inTopRow = bodies[i]!.y - top < DEFAULT_CONFIG.bodySpacing * 0.5;
      if (inTopRow) continue;
      expect(counts[i], `${bodies[i]!.name} has nowhere to aim`).toBeGreaterThanOrEqual(1);
    }
    // and the very top of the field genuinely runs out. Not `counts.at(-1)`:
    // a forked row emits its two lanes in lane order, not height order, so the
    // last body in the array is not necessarily the highest one.
    const highest = bodies.indexOf(bodies.reduce((a, b) => (b.y < a.y ? b : a)));
    expect(counts[highest]).toBe(0);
  });

  it('keeps the gauge to the near field rather than signposting a long coast', () => {
    // The range shows the next step of the climb, not a target several hops away
    // that would be a featureless drift to reach.
    for (let i = 0; i < bodies.length; i++) {
      for (const t of aimTargets(bodies, i, AIM_RANGE, 3)) {
        expect(t.distance).toBeLessThanOrEqual(AIM_RANGE);
      }
    }
  });

  it('drops anything beyond the range', () => {
    for (let i = 0; i < bodies.length; i++) {
      for (const t of aimTargets(bodies, i, AIM_RANGE, 8)) {
        expect(t.distance).toBeLessThanOrEqual(AIM_RANGE);
      }
    }
  });

  it('shows nothing at the top of the field rather than pointing back down', () => {
    const topIndex = bodies.reduce((best, b, i) => (b.y < bodies[best]!.y ? i : best), 0);
    expect(aimTargets(bodies, topIndex, 1e9, 3)).toEqual([]);
  });
});

describe('the compass ring settles', () => {
  /**
   * Reported from a real session: "the orbit circle that the planet gauges are on
   * did a kind of bounce, shrinking inwards and then growing outwards again."
   *
   * Measured on that capture the ring ran 122 -> 85 through the dive, which is the
   * part worth keeping, then 85 -> 97 -> 85 over the settle as the ship swept out
   * to apoapsis and back. This drives a real capture through the real
   * `drawCompass` and reads the ring radius back off the arcs it emits.
   */
  function ringTrace(): Array<{ tick: number; frozen: boolean; ring: number }> {
    const sim = DEFAULT_CONFIG;
    const state = createInitialState(sim);
    const bodies = state.bodies;
    const out: Array<{ tick: number; frozen: boolean; ring: number }> = [];
    let held = false;

    for (let t = 0; t < 320; t++) {
      const pressed = t === 98;
      const released = t === 260;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(state, sim, { held: held || pressed, pressed, released }, FIXED_DT);
      const cap = state.capture;
      if (!cap) continue;

      const snap = captureSnapshot(state, held, sim);
      const c = cam();
      const anchor = bodies[cap.planet]!;
      centerCamera(c, snap.x, snap.y, fieldBounds(sim, bodies), null);
      const r = recordingContext();
      drawCompass(r.ctx, c, sim, rcfg, snap, bodies, 0);

      const cxs = toScreenX(c, anchor.x);
      const cys = toScreenY(c, anchor.y);
      const radii = (r.calls('arc') as Array<[string, number, number, number, number, number]>)
        .filter((o) => Math.abs(o[1] - cxs) < 1e-6 && Math.abs(o[2] - cys) < 1e-6 && o[5] > 6)
        .map((o) => o[3] / c.scale);
      if (radii.length === 0) continue;
      const frozen = cap.orbit !== null && (cap.phase === 'settle' || cap.phase === 'orbit');
      out.push({ tick: t, frozen, ring: Math.min(...radii) });
    }
    return out;
  }

  it('stops moving once the orbit is real', () => {
    const trace = ringTrace();
    const settled = trace.filter((x) => x.frozen);
    expect(settled.length, 'the capture never froze an orbit').toBeGreaterThan(30);
    const lo = Math.min(...settled.map((x) => x.ring));
    const hi = Math.max(...settled.map((x) => x.ring));
    // Before the fix this spread was ~12 world units and took about a second to
    // play out, on top of a curve the player is trying to read.
    expect(hi - lo, `ring moved ${(hi - lo).toFixed(1)} units after freezing`).toBeLessThan(0.5);
  });

  it('still sweeps inward through the dive', () => {
    const diving = ringTrace().filter((x) => !x.frozen);
    expect(diving.length).toBeGreaterThan(10);
    expect(diving[0]!.ring).toBeGreaterThan(diving[diving.length - 1]!.ring + 10);
  });

  it('does not jump at the moment it freezes', () => {
    // The switch is continuous by construction: at periapsis the ship IS at
    // rPeri, so both expressions agree on the tick they change over.
    const trace = ringTrace();
    const i = trace.findIndex((x) => x.frozen);
    expect(i).toBeGreaterThan(0);
    expect(Math.abs(trace[i]!.ring - trace[i - 1]!.ring)).toBeLessThan(1.5);
  });
});

describe('compass rings encode distance', () => {
  const bodies = createBodies(DEFAULT_CONFIG);

  /** Radii of the arcs drawn centred on the anchor, in world units. */
  function ringRadii(anchorIndex: number) {
    const sim = DEFAULT_CONFIG;
    const state = createInitialState(sim);
    const c = cam();
    const anchor = bodies[anchorIndex]!;
    // sit the ship in a settled circular orbit around the anchor
    const snap = {
      ...captureSnapshot(state, true, sim),
      x: anchor.x,
      y: anchor.y - 80,
      capture: captureOf({
        phase: 'orbit',
        orbit: { a: 80, e: 0, argp: 0, dir: 1 },
        rPeri: 80,
        planet: anchorIndex,
      }),
    };
    const r = recordingContext();
    drawCompass(r.ctx, c, sim, rcfg, snap, bodies, 0);
    const cxs = toScreenX(c, anchor.x);
    const cys = toScreenY(c, anchor.y);
    // full circles only: [x, y, radius, 0, TAU]
    return (r.calls('arc') as Array<[string, number, number, number, number, number]>)
      .filter((o) => Math.abs(o[1] - cxs) < 1e-6 && Math.abs(o[2] - cys) < 1e-6 && o[5] > 6)
      .map((o) => o[3] / c.scale);
  }

  it('gives each target its own ring, wider for the further body', () => {
    const radii = [...new Set(ringRadii(0).map((r) => +r.toFixed(4)))].sort((a, b) => a - b);
    const targets = aimTargets(bodies, 0, AIM_RANGE, AIM_MAX_TARGETS);
    expect(targets.length).toBeGreaterThan(1);
    expect(radii.length, 'one ring per target').toBe(targets.length);
    // rings are strictly increasing, and in the same order as target distance
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
  });

  it('never signposts more than the configured maximum', () => {
    // even with the whole field in range
    for (let i = 0; i < bodies.length; i++) {
      expect(aimTargets(bodies, i, 1e9, AIM_MAX_TARGETS).length).toBeLessThanOrEqual(
        AIM_MAX_TARGETS,
      );
    }
  });

  it('scales ring size with distance rather than merely with rank', () => {
    const sim = DEFAULT_CONFIG;
    const near = aimTargets(bodies, 0, AIM_RANGE, 3);
    const radii = [...new Set(ringRadii(0).map((r) => +r.toFixed(4)))].sort((a, b) => a - b);
    // the gap between rings should track the gap between target distances
    const distRatio = near[1]!.distance / near[0]!.distance;
    const inner = rcfg.compassRingInner;
    const spread = rcfg.compassRingSpread;
    const expected0 = inner + (near[0]!.distance / AIM_RANGE) * spread;
    const expected1 = inner + (near[1]!.distance / AIM_RANGE) * spread;
    // 3 decimals: ringRadii() rounds to 4 when de-duplicating
    expect(radii[1]! - radii[0]!).toBeCloseTo(expected1 - expected0, 3);
    expect(distRatio).toBeGreaterThan(1);
    void sim;
  });
});

describe('edge markers point up the climb', () => {
  const bodies = createBodies(DEFAULT_CONFIG);
  const sim = DEFAULT_CONFIG;

  /** Screen positions of the arrows drawn for a ship at world y. */
  function markerYs(shipY: number) {
    const c = cam();
    const state = createInitialState(sim);
    const snap = { ...captureSnapshot(state, false, sim), x: 195, y: shipY };
    centerCamera(c, snap.x, snap.y, field, null);
    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies);
    // each arrow is translate(ex, ey) followed by rotate
    return (r.calls('translate') as Array<[string, number, number]>).map((o) => o[2]);
  }

  /** Arc radii drawn for a ship at (x, y) with `grabOffer` pointing at `offer`. */
  function ringsFor(x: number, y: number, offer: number) {
    const c = cam();
    const state = createInitialState(sim);
    const snap = { ...captureSnapshot(state, false, sim), x, y, grabOffer: offer };
    centerCamera(c, snap.x, snap.y, field, null);
    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies);
    return (r.calls('arc') as Array<[string, number, number, number]>).length;
  }

  it('rings the one body a press would actually take', () => {
    // The missing half of an anomaly approach. Measured on the session that
    // reported it, the ship was inside the grab window for 1.03s and could see the
    // anomaly for 0.23 of it — the rest was spent reading an arrow that looked the
    // same whether a press would work or not.
    //
    // `grabOffer` is `grabTarget`'s answer, so the ring means what a press means,
    // including the part that surprises: a nearer planet takes the press instead.
    const b = bodies.findIndex((x) => x.kind === 'anomaly');
    const a = bodies[b]!;
    // far enough that the anomaly is off screen, so this is the arrow case
    const x = a.x + 420;
    const y = a.y + 120;
    expect(ringsFor(x, y, -1), 'a ring appeared with nothing on offer').toBe(0);
    expect(ringsFor(x, y, b), 'no ring for the offered body').toBe(1);
  });

  it('keeps the ring when the body comes into view', () => {
    // The cue must not blink out at the moment the thing it points at appears —
    // that is exactly when the decision is being made. Off screen it rides the
    // arrow; on screen it goes round the body.
    const b = bodies.findIndex((x) => x.kind === 'anomaly');
    const a = bodies[b]!;
    // right beside it: the anomaly is on screen, so no arrow is drawn at all
    expect(ringsFor(a.x + 60, a.y, -1)).toBe(0);
    expect(ringsFor(a.x + 60, a.y, b)).toBe(1);
  });

  it('never puts an arrow below the ship', () => {
    // partway up the field, so there are bodies both above and below
    const shipY = bodies[6]!.y;
    const c = cam();
    centerCamera(c, 195, shipY, field, null);
    const middle = c.offsetY + (c.viewH * c.scale) / 2;
    const ys = markerYs(shipY);
    expect(ys.length, 'no markers drawn at all').toBeGreaterThan(0);
    for (const y of ys) {
      expect(y, 'an arrow pointed back down the climb').toBeLessThan(middle);
    }
  });

  it('shows nothing once everything is behind you', () => {
    const top = Math.min(...bodies.map((b) => b.y));
    expect(markerYs(top - 1)).toEqual([]);
  });
});

describe('the captured body is highlighted', () => {
  it('draws a halo only around the body holding the ship', () => {
    const sim = DEFAULT_CONFIG;
    const bodies = createBodies(sim);
    const c = cam();
    const state = createInitialState(sim);

    const drift = { ...captureSnapshot(state, false, sim), capture: null };
    const held = {
      ...captureSnapshot(state, true, sim),
      capture: captureOf({ phase: 'orbit', planet: 0 }),
    };

    const a = recordingContext();
    const b = recordingContext();
    new BodyRenderer().draw(a.ctx, c, sim, bodies, -1);
    new BodyRenderer().draw(b.ctx, c, sim, bodies, held.capture!.planet);

    // the halo is an extra radial gradient beyond the per-radius sphere cache
    const gradsIdle = a.calls('=createRadialGradient').length;
    const gradsHeld = b.calls('=createRadialGradient').length;
    expect(gradsHeld).toBeGreaterThan(gradsIdle);
    void drift;
  });
});

describe('the fuel gauge pills', () => {
  const sim = DEFAULT_CONFIG;

  function gaugeOps(fuel: number) {
    const c = cam();
    const r = recordingContext();
    const base = captureSnapshot(createInitialState(sim), false, sim);
    drawFuelGauge(r.ctx, c, sim, { ...base, fuel }, 0);
    return r;
  }

  /** Each pill as drawn: its y, its colour, and how brightly it is burning. */
  function pills(fuel: number) {
    const r = gaugeOps(fuel);
    const out: Array<{ y: number; color: string; alpha: number }> = [];
    let color = '';
    let alpha = 1;
    for (const op of r.ops) {
      if (op[0] === '=fillStyle') color = String(op[1]);
      else if (op[0] === '=globalAlpha') alpha = Number(op[1]);
      else if (op[0] === 'roundRect') out.push({ y: Number(op[2]), color, alpha });
    }
    // top of the bar first, so index 0 is the last pill to light
    return out.sort((a, b) => a.y - b.y);
  }

  const rgb = (c: string): [number, number, number] => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];

  it('draws one pill per graduation the ticks used to mark', () => {
    expect(pills(sim.fuelMax)).toHaveLength(GAUGE.pills);
    // and the empty tank still draws all of them: the scale is permanent, which
    // is the point of colouring by height rather than by level
    expect(pills(0)).toHaveLength(GAUGE.pills);
  });

  it('gives every pill one colour, fixed by where it sits', () => {
    // The whole reason for the change. A pill's colour must not depend on the
    // level, or the stack goes back to being a single lerp cut into pieces.
    const full = pills(sim.fuelMax).map((p) => p.color);
    const empty = pills(0).map((p) => p.color);
    const quarter = pills(sim.fuelMax / 4).map((p) => p.color);
    expect(full).toEqual(empty);
    expect(full).toEqual(quarter);
  });

  it('steps through a fixed palette rather than a continuous ramp', () => {
    // Ten pills sampling a lerp is a gradient wearing pills: ten colours a few
    // units apart, which the eye reads as one wash. The banding only does work
    // if there are few enough steps to count.
    const colors = pills(sim.fuelMax).map((p) => p.color);
    expect(new Set(colors).size).toBe(FUEL_RAMP.length);
    for (const c of colors) expect(FUEL_RAMP).toContain(c);
    // every step is used, and the repeats are adjacent — a colour that reappears
    // after a gap would read as a mistake rather than as a band
    for (const step of FUEL_RAMP) {
      const at = colors.indexOf(step);
      expect(at, `${step} is never drawn`).toBeGreaterThanOrEqual(0);
      expect(colors.lastIndexOf(step) - at).toBe(colors.filter((c) => c === step).length - 1);
    }
  });

  it('runs the ramp green at the top to red at the bottom', () => {
    const p = pills(sim.fuelMax);
    const top = rgb(p[0]!.color);
    const bottom = rgb(p[p.length - 1]!.color);
    expect(top[1], 'the top of the tank is not the greenest').toBeGreaterThan(bottom[1]);
    expect(bottom[0] - bottom[2], 'the bottom of the tank is not the reddest').toBeGreaterThan(
      top[0] - top[2],
    );
    // monotone all the way down, so no pill reads as out of order — steps repeat
    // but never go back up
    const greens = p.map((x) => rgb(x.color)[1]);
    for (let i = 1; i < greens.length; i++) expect(greens[i]).toBeLessThanOrEqual(greens[i - 1]!);
  });

  it('burns the pills below the level and leaves the rest showing faintly', () => {
    const p = pills(sim.fuelMax * 0.6);
    // 6 lit at the bottom, 4 dim at the top, and the dim ones are still drawn —
    // that is how the red you are heading toward stays visible.
    const lit = p.filter((x) => x.alpha > 0.5);
    const dim = p.filter((x) => x.alpha <= 0.5);
    expect(lit).toHaveLength(6);
    expect(dim).toHaveLength(4);
    for (const d of dim) expect(d.alpha).toBeGreaterThan(0);
    // the dim ones are the top ones
    expect(Math.max(...dim.map((x) => x.y))).toBeLessThan(Math.min(...lit.map((x) => x.y)));
  });

  it('fades the pill the level lands inside, rather than shrinking it', () => {
    // So the gauge still moves while fuel drains within one pill. A part-height
    // pill would read as a smaller pill, not as a partial one.
    const p = pills(sim.fuelMax * 0.55);
    const partial = p.find((x) => x.alpha > 0.2 && x.alpha < 0.9);
    expect(partial, 'no pill is part-lit at 55%').toBeDefined();
    // every pill is drawn at the same height whatever the level
    const heights = new Set(
      (gaugeOps(sim.fuelMax * 0.55).calls('roundRect') as Array<[string, ...number[]]>).map(
        (o) => o[4],
      ),
    );
    expect(heights.size, 'a pill was drawn shorter than the others').toBe(1);
  });
});

describe('edge markers clear the header text', () => {
  const bodies = createBodies(DEFAULT_CONFIG);
  const sim = DEFAULT_CONFIG;

  /** Stand-in for the measured header, in design units. */
  const HEADER_BOTTOM = 21;

  it('keeps every arrow just below the header text', () => {
    const c = cam();
    const state = createInitialState(sim);
    // partway up, so several bodies are off-screen above
    const shipY = bodies[8]!.y + 200;
    const snap = { ...captureSnapshot(state, false, sim), x: 195, y: shipY };
    centerCamera(c, snap.x, snap.y, field, null);

    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies, HEADER_BOTTOM);
    const ys = (r.calls('translate') as Array<[string, number, number]>).map((o) => o[2]);
    expect(ys.length, 'no arrows drawn').toBeGreaterThan(0);

    const topLimit = c.offsetY + (HEADER_BOTTOM + rcfg.edgeMarkerHeaderGap) * c.scale;
    for (const y of ys) {
      expect(y, 'an arrow sat in the header band').toBeGreaterThanOrEqual(topLimit - 1e-6);
      // and just below it, not pushed halfway down the screen
      expect(y, 'an arrow was pushed far below the header').toBeLessThan(topLimit + 30 * c.scale);
    }
  });

  it('still hugs the sides at the ordinary inset', () => {
    const c = cam();
    const state = createInitialState(sim);
    // a body far off to one side, so the ray exits through a vertical edge
    const snap = { ...captureSnapshot(state, false, sim), x: -600, y: bodies[4]!.y };
    centerCamera(c, snap.x, snap.y, field, null);
    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies, HEADER_BOTTOM);
    const xs = (r.calls('translate') as Array<[string, number, number]>).map((o) => o[1]);
    const left = c.offsetX + rcfg.edgeMarkerInset * c.scale;
    const right = c.offsetX + c.designW * c.scale - rcfg.edgeMarkerInset * c.scale;
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(left - 1e-6);
      expect(x).toBeLessThanOrEqual(right + 1e-6);
    }
  });
});

/**
 * The fuel warning beside the ship.
 *
 * Every one of these pins a transition, not a state: the badge exists precisely
 * because a standing indicator is not a warning. The gauge in the corner already
 * says what the level IS.
 */
describe('the fuel warning beside the ship', () => {
  const sim = DEFAULT_CONFIG;
  const base = captureSnapshot(createInitialState(sim), false, sim);
  const snap = (over: Partial<RenderSnapshot> = {}): RenderSnapshot => ({ ...base, ...over });

  const full = sim.fuelMax;
  const lowAt = FUEL_LOW_FRAC * full;

  /**
   * Feed a series of fuel levels, one per tick, letting each flash lapse before
   * the next level arrives. Reports the flashes in the order they fired.
   */
  function feed(levels: number[]): string[] {
    const w = new FuelWarning();
    const fired: string[] = [];
    for (const fuel of levels) {
      w.observe(snap({ fuel }), sim);
      const now = w.live();
      if (now !== null) fired.push(now);
      w.update(FUEL_WARNING.PULSES * FUEL_WARNING.PULSE_SEC);
    }
    return fired;
  }

  it('flashes yellow on the way down through the gauge’s own low line', () => {
    expect(feed([full, lowAt + 1, lowAt - 1])).toEqual(['low']);
  });

  it('says nothing while the tank is merely low, only when it becomes low', () => {
    // Sitting below the line is not an event. It is 4.7% of a session.
    expect(feed([lowAt - 1, lowAt - 2, lowAt - 3, lowAt - 4])).toEqual([]);
  });

  it('does not re-fire while the tank hovers on the line', () => {
    expect(feed([full, lowAt - 1, lowAt + 1, lowAt - 1, lowAt + 1, lowAt - 1])).toEqual(['low']);
  });

  it('re-arms once a real refill has come back', () => {
    const refilled = FUEL_WARNING.LOW_REARM_FRAC * full + 1;
    expect(feed([full, lowAt - 1, refilled, lowAt - 1])).toEqual(['low', 'low']);
  });

  it('flashes red when the tank runs dry — the reason the ship stopped', () => {
    expect(feed([full, lowAt - 1, 4, 0])).toEqual(['low', 'empty']);
  });

  it('lets the worse warning interrupt the better one', () => {
    const w = new FuelWarning();
    w.observe(snap({ fuel: full }), sim);
    w.observe(snap({ fuel: lowAt - 1 }), sim);
    expect(w.live()).toBe('low');
    w.update(0.2);
    w.observe(snap({ fuel: 0 }), sim);
    expect(w.live()).toBe('empty');
    // and it restarts rather than inheriting what was left of the low flash
    w.update(FUEL_WARNING.PULSES * FUEL_WARNING.PULSE_SEC - 0.21);
    expect(w.live()).toBe('empty');
  });

  it('flashes red when a grab is refused for an empty tank', () => {
    const w = new FuelWarning();
    w.observe(snap({ tick: 10, fuel: 0.4 }), sim);
    w.observe(
      snap({ tick: 11, fuel: 0.4, lastGrab: { tick: 11, result: 'refused-no-fuel' } }),
      sim,
    );
    expect(w.live()).toBe('empty');
  });

  it('ignores a grab refused for any other reason', () => {
    const w = new FuelWarning();
    w.observe(snap({ tick: 10, fuel: full }), sim);
    w.observe(
      snap({ tick: 11, fuel: full, lastGrab: { tick: 11, result: 'refused-crash-cone' } }),
      sim,
    );
    expect(w.live()).toBe(null);
  });

  it('keeps quiet during the crash freeze — the crash is its own message', () => {
    const w = new FuelWarning();
    const ending = { active: true, t: 0, x: 0, y: 0, reason: 'impact' as const };
    w.observe(snap({ fuel: full }), sim);
    w.observe(snap({ fuel: 0, ending }), sim);
    expect(w.live()).toBe(null);
  });

  it('does not flash on the refill a respawn brings', () => {
    const w = new FuelWarning();
    w.observe(snap({ fuel: 2 }), sim);
    w.observe(snap({ fuel: full }), sim);
    expect(w.live()).toBe(null);
  });

  it('is three flashes, and then it is gone', () => {
    const step = 0.005;
    let flashes = 0;
    let on = false;
    for (let t = 0; t < FUEL_WARNING.PULSES * FUEL_WARNING.PULSE_SEC + 0.5; t += step) {
      const lit = pulseAlpha(t) > 0;
      if (lit && !on) flashes++;
      on = lit;
    }
    expect(flashes).toBe(FUEL_WARNING.PULSES);
    expect(pulseAlpha(FUEL_WARNING.PULSES * FUEL_WARNING.PULSE_SEC)).toBe(0);

    const w = new FuelWarning();
    w.observe(snap({ fuel: full }), sim);
    w.observe(snap({ fuel: 0 }), sim);
    w.update(FUEL_WARNING.PULSES * FUEL_WARNING.PULSE_SEC - 0.01);
    expect(w.live()).toBe('empty');
    w.update(0.02);
    expect(w.live()).toBe(null);
  });

  it('sits below the ship, clear of the lane the score popups rise through', () => {
    const w = new FuelWarning();
    const c = cam();
    const at = snap({ x: 195, y: 0, fuel: 0 });
    w.observe(snap({ fuel: full }), sim);
    w.observe(at, sim);
    w.update(FUEL_WARNING.PULSE_SEC / 4); // past the attack ramp, which starts at zero
    const r = recordingContext();
    w.draw(r.ctx, c, at);
    const shipY = toScreenY(c, at.y);
    const ys = (r.calls('fillText') as Array<[string, string, number, number]>).map((o) => o[3]);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y).toBeGreaterThan(shipY);
  });

  it('takes both colours from the gauge’s own ramp, so the two cannot drift', () => {
    const drawn = (fuels: number[]): string[] => {
      const w = new FuelWarning();
      for (const f of fuels) w.observe(snap({ fuel: f }), sim);
      w.update(FUEL_WARNING.PULSE_SEC / 4);
      const r = recordingContext();
      w.draw(r.ctx, cam(), snap({ x: 195, y: 0 }));
      return (r.calls('=strokeStyle') as Array<[string, string]>).map((o) => o[1]);
    };
    expect(drawn([full, lowAt - 1])).toContain(FUEL_RAMP[3]);
    expect(drawn([full, 0])).toContain(FUEL_RAMP[0]);
  });

  it('draws nothing at all when there is no warning', () => {
    const r = recordingContext();
    new FuelWarning().draw(r.ctx, cam(), snap());
    expect(r.ops).toEqual([]);
  });

  it('fires once, in order, over a real fuel-burning flyby', () => {
    // The braked flyby from test/flyby-fuel.test.ts, started on a third of a
    // tank: the brake burns through the low line and then through the bottom.
    // On a FULL tank this same flyby converts with 43 left, which is the point —
    // the badge fires on the transitions, not on the manoeuvre.
    const state = createInitialState(sim);
    state.ship.x = 105;
    state.ship.y = 354;
    state.ship.vx = 0;
    state.ship.vy = -400;
    state.fuel = 0.33 * sim.fuelMax;
    const w = new FuelWarning();
    const fired: string[] = [];
    let prev: string | null = null;
    for (let i = 0; i < 300; i++) {
      stepSim(state, sim, { held: i >= 20, pressed: i === 20, released: false }, FIXED_DT);
      w.observe(captureSnapshot(state, i >= 20, sim), sim);
      const now = w.live();
      if (now !== null && now !== prev) fired.push(now);
      prev = now;
      w.update(FIXED_DT);
    }
    expect(fired).toEqual(['low', 'empty']);
  });
});
