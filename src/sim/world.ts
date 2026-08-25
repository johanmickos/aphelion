/**
 * World layout — absolute world units, frozen forever.
 *
 * The prototype authored planet positions in *viewport* units (`y: d.y * H`,
 * `x: W*0.5 + d.dx`) and re-ran the layout on every resize, which moved planets
 * mid-flight and left the active capture holding a stale object. It also meant
 * different devices played a materially different game: the same gravity with
 * P1->P8 spread over 5047px in portrait but 2331px in landscape.
 *
 * Here the layout is evaluated once at the design viewport (390x844) and baked in.
 * Resize is inert. The renderer scales and letterboxes to fit. See PORT_NOTES 10.
 */
import type { Body } from './types.ts';
import type { SimConfig } from './config.ts';
import { mulberry32 } from './rng.ts';

/** Design viewport the world coordinates were frozen from. */
export const DESIGN_W = 390;
export const DESIGN_H = 844;

/**
 * The prototype's hand-authored planets. The field continues procedurally beyond
 * these; see `createBodies`.
 *
 * `dx` is the offset from the field's centre column and `y` is in screen-heights.
 * The pattern is deliberate: sides strictly alternate, |dx| runs 6..44, radii run
 * 34..56, and vertical spacing grows 0.78 -> 0.90 before plateauing.
 */
const DEFS: ReadonlyArray<{ dx: number; y: number; R: number }> = [
  { dx: -6, y: 0, R: 46 },
  { dx: 34, y: -0.78, R: 40 },
  { dx: -40, y: -1.6, R: 52 },
  { dx: 18, y: -2.44, R: 34 },
  { dx: -24, y: -3.3, R: 44 },
  { dx: 44, y: -4.18, R: 38 },
  { dx: -10, y: -5.08, R: 56 },
  { dx: 30, y: -5.98, R: 36 },
];

/**
 * Build the world's bodies. Deterministic and viewport-independent.
 *
 * Two layouts: the prototype's authored eight, which the equality gate compares
 * against and which must never change; and the game's own field, generated from
 * a fixed seed so every player climbs the same route and a replay reconstructs
 * it exactly.
 *
 * The generated field is a sequence of ROWS, not a sequence of bodies. Most rows
 * hold one body and the sides alternate, which is the authored weave. Some hold
 * two, one in each outer lane, and those are the point: a row with two bodies is
 * a row where the release has a choice, and the climb stops being a single line
 * that is merely followed.
 *
 * DRAW ORDER IS PART OF THE FIELD. The single-body path draws x, then the
 * vertical gap, then the radius, exactly as it did before rows existed, and the
 * fork decision above it short-circuits before its draw when `rowPairChance` is
 * 0. Together those mean a report recorded before any of these keys existed
 * still reconstructs its own field: `configFromReport` fills the missing keys
 * from PROTOTYPE_CONFIG, and at those values this function is the old one.
 */
export function createBodies(cfg: SimConfig): Body[] {
  const cx = DESIGN_W * 0.5;
  if (!cfg.proceduralLayout) {
    return DEFS.slice(0, cfg.bodyCount).map((d, i) => ({
      kind: 'planet' as const,
      x: cx + d.dx,
      y: d.y * DESIGN_H,
      R: d.R,
      name: 'P' + (i + 1),
    }));
  }

  const rnd = mulberry32(cfg.worldSeed);
  const placed: Array<{ x: number; y: number; R: number }> = [];
  // The opening body is the authored one: the spawn sits 84px to its left and
  // that first approach is tuned. Everything above it is generated.
  const first = DEFS[0]!;
  let x = cx + first.dx;
  let y = first.y * DESIGN_H;
  let R = first.R;
  // The row's own height, carried separately from the height a body is emitted
  // at. A fork leans its two lanes off the row, and folding that lean back into
  // the running height would make the NEXT row's gap the configured one plus a
  // lean — a drift that compounds all the way up the field.
  let rowY = y;
  // The opener sits left of centre, so the weave resumes to the right.
  let side = 1;

  while (placed.length < cfg.bodyCount) {
    placed.push({ x, y, R });
    if (placed.length >= cfg.bodyCount) break;

    const fork =
      cfg.rowPairChance > 0 && placed.length + 1 < cfg.bodyCount && rnd() < cfg.rowPairChance;

    if (fork) {
      // Both lanes pushed well out, so the row reads as two routes rather than
      // as one wide planet, and leaned off each other so it is never a straight
      // line of two. `side` is left alone: the fork covered both sides, so the
      // weave resumes where the last single row left it.
      rowY -= cfg.bodySpacing * (0.9 + rnd() * 0.2);
      // Equal and opposite, so the row's two lanes tilt off each other while the
      // row itself still sits exactly where the spacing put it.
      const lean = cfg.bodySpacing * 0.12 * (rnd() * 2 - 1);
      const left = cx - cfg.bodySpread * (0.6 + rnd() * 0.4);
      const right = cx + cfg.bodySpread * (0.6 + rnd() * 0.4);
      placed.push({ x: left, y: rowY - lean, R: 34 + rnd() * 22 });
      x = right;
      y = rowY + lean;
      R = 34 + rnd() * 22;
      continue;
    }

    // Sides alternate so the climb weaves rather than drifting to one wall, and
    // the gap jitters +/-10% so the rhythm does not become metronomic.
    x = cx + side * (8 + rnd() * (cfg.bodyWeave - 8));
    rowY -= cfg.bodySpacing * (0.9 + rnd() * 0.2);
    y = rowY;
    R = 34 + rnd() * 22; // 34..56, the authored range
    side = -side;
  }

  const bodies: Body[] = placed.map((b, i) => ({
    kind: 'planet' as const,
    ...b,
    name: 'P' + (i + 1),
  }));
  return bodies.concat(placeAnomalies(cfg, rnd, placed));
}

/**
 * Anomalies, out past the barrier on alternating sides.
 *
 * Placed AFTER the corridor and from the same `rnd`, so the field a seed
 * produces is unchanged in every respect except the anomalies themselves — a
 * seed's corridor is the same corridor whether `anomalyCount` is 0 or 3, which is
 * what lets the two be compared.
 *
 * The y positions are spread evenly over the rows the generator actually built,
 * with the bottom eighth skipped: an anomaly beside the opening bodies would ask
 * for the commit before the player has a corridor rhythm to break away from.
 */
function placeAnomalies(
  cfg: SimConfig,
  rnd: () => number,
  placed: ReadonlyArray<{ x: number; y: number; R: number }>,
): Body[] {
  if (cfg.anomalyCount <= 0 || placed.length === 0) return [];

  const fw = DESIGN_W * cfg.fieldWidthFrac;
  const cx = DESIGN_W * 0.5;
  const wallL = cx - fw / 2;
  const wallR = cx + fw / 2;

  let topY = 0;
  for (const b of placed) if (b.y < topY) topY = b.y;
  const bottomY = placed[0]!.y;
  const span = bottomY - topY;

  const out: Body[] = [];
  // Alternate sides so a run cannot present every anomaly on the same hand, and
  // start the alternation from the seed so which hand comes first still varies.
  let side = rnd() < 0.5 ? -1 : 1;
  for (let i = 0; i < cfg.anomalyCount; i++) {
    const t = 0.125 + ((i + 0.5) / cfg.anomalyCount) * 0.875;
    // The first one may be dragged down level with the opening body, for testing
    // the charged window without climbing to reach one. See `anomalyAtSpawn` —
    // it is off in both configs and turned on only by the dev shell.
    //
    // Placed by overriding the position rather than by branching around the loop,
    // so `rnd()` is called the same number of times in the same order: the field a
    // seed produces is otherwise a different field, and the flag would quietly
    // change the corridor it was supposed to leave alone.
    const y = cfg.anomalyAtSpawn && i === 0 ? bottomY : bottomY - span * t;
    const x = side < 0 ? wallL - cfg.anomalyOffset : wallR + cfg.anomalyOffset;
    out.push({
      kind: 'anomaly',
      x,
      y,
      R: 40 + rnd() * 16,
      name: 'A' + (i + 1),
      bubble: cfg.anomalyBubble,
      orbitR: cfg.anomalyOrbitR,
      orbitPeriod: cfg.anomalyOrbitPeriod,
      refuel: cfg.anomalyRefuel,
      settleDur: cfg.anomalySettleDur,
    });
    side = -side;
  }
  return out;
}

/** Ship spawn, frozen from the prototype's `resetShip` at the design viewport. */
export const SPAWN = Object.freeze({
  x: DESIGN_W * 0.5 - 6 - 84,
  y: DESIGN_H * 0.42,
});

export interface FieldBounds {
  left: number;
  right: number;
  width: number;
  /**
   * The topmost body in the field — the last thing there is to fly to.
   *
   * Named rather than left implicit because two different lines hang off it and
   * they mean opposite things: rising past THIS is clearing the course, and
   * rising past `top`, 800px further on, is leaving the world. Before this
   * existed the second was stored and the first had to be recovered by adding the
   * 800 back on, which is a magic number in two places instead of one.
   */
  crest: number;
  /** Beyond this (climbing) the run ends. */
  top: number;
  /** Beyond this (falling) the run ends. */
  bottom: number;
}

/**
 * The run-in: the band the funnel pulls through and the bumpers guard.
 *
 * ONE DEFINITION, because there were briefly two and they disagreed. The funnel
 * derives its band from `finishY` and walks DOWN by `finishFunnelDepth`; the
 * bumper was written independently and subtracted both `grabRange` and the depth
 * from the crest, which happen to be the same number today — so it reached 560px
 * past the finish line into the ceremony's airspace and nothing looked wrong.
 * Two expressions of one region is one bug waiting for the day those two keys
 * stop matching.
 *
 * Returns null when the field cannot be cleared, or has no run-in.
 */
export function runInBand(cfg: SimConfig, fb: FieldBounds): { top: number; bottom: number } | null {
  if (!cfg.clearAtTop || cfg.finishFunnelDepth <= 0) return null;
  const finishY = fb.crest - cfg.grabRange;
  return { top: finishY, bottom: finishY + cfg.finishFunnelDepth };
}

/**
 * Is this point inside some anomaly's bubble?
 *
 * The whole anomaly mechanic, in one predicate. `stepSim` suspends the SIDE
 * boundary — and only the side boundary — while this is true, which is what lets
 * a well-aimed release coast through the barrier and back.
 *
 * Deliberately not applied to the top, bottom or the trailing floor. The side
 * walls are the only boundary an anomaly sits beyond, and a bubble that
 * suspended the others would open a hole with nothing on the far side of it: a
 * ship exempted from every bound drifts forever in a straight line, because
 * `driftAccel` is zero and nothing would ever catch it. Leaving the far side of
 * the bubble must always be reachable and always be fatal.
 */
export function inAnomalyField(x: number, y: number, bodies: readonly Body[]): boolean {
  for (const b of bodies) {
    if (b.kind !== 'anomaly') continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= b.bubble * b.bubble) return true;
  }
  return false;
}

/**
 * The trailing floor: the world y at which a climb has been lost.
 *
 * Defined once, because three places need the same line and they must agree —
 * `stepSim` ends the run at it, `drawBacktrackFloor` paints it, and the camera
 * refuses to descend past it. Two of those drifting apart would mean a player
 * dying to a line that was drawn somewhere else.
 *
 * Null when there is no floor at all, which is the prototype's config.
 */
export function backtrackFloorY(cfg: SimConfig, highWaterY: number): number | null {
  return cfg.backtrackLimit > 0 ? highWaterY + cfg.backtrackLimit : null;
}

/**
 * Playfield bounds in world units.
 *
 * Horizontal bounds are the prototype's exactly, evaluated at the design width.
 * Vertical bounds replace a screen-space test that read the smoothed camera and
 * the live viewport height — which made the death condition depend on render
 * state and on device size. The margins mirror the originals (800 above, 1244
 * below) measured from the world's extents instead of the camera. PORT_NOTES 9.
 */
export function fieldBounds(cfg: SimConfig, bodies: readonly Body[]): FieldBounds {
  const fw = DESIGN_W * cfg.fieldWidthFrac;
  const cx = DESIGN_W * 0.5;
  let highest = 0;
  for (const b of bodies) if (b.y < highest) highest = b.y;
  return {
    left: cx - fw / 2,
    right: cx + fw / 2,
    width: fw,
    crest: highest,
    top: highest - 800,
    bottom: SPAWN.y + DESIGN_H + 400,
  };
}
