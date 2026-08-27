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
import type { Body, Mote } from './types.ts';
import { BODY_TYPES } from './bodies.ts';
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

/** Draw a radius from a type's range. `min + rnd() * (max - min)`, once. */
function radiusOf(type: keyof typeof BODY_TYPES, rnd: () => number): number {
  const [lo, hi] = BODY_TYPES[type].radius;
  return lo + rnd() * (hi - lo);
}

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
      type: 'planet',
      x: cx + d.dx,
      y: d.y * DESIGN_H,
      R: d.R,
      name: 'P' + (i + 1),
      traits: BODY_TYPES.planet.traits,
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
      placed.push({ x: left, y: rowY - lean, R: radiusOf('planet', rnd) });
      x = right;
      y = rowY + lean;
      R = radiusOf('planet', rnd);
      continue;
    }

    // Sides alternate so the climb weaves rather than drifting to one wall, and
    // the gap jitters +/-10% so the rhythm does not become metronomic.
    x = cx + side * (8 + rnd() * (cfg.bodyWeave - 8));
    rowY -= cfg.bodySpacing * (0.9 + rnd() * 0.2);
    y = rowY;
    R = radiusOf('planet', rnd);
    side = -side;
  }

  const bodies: Body[] = placed.map((b, i) => ({
    kind: 'planet' as const,
    type: 'planet',
    ...b,
    name: 'P' + (i + 1),
    traits: BODY_TYPES.planet.traits,
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
    const off = BODY_TYPES.anomaly.wallOffset;
    const x = side < 0 ? wallL - off : wallR + off;
    out.push({
      kind: 'anomaly',
      type: 'anomaly',
      x,
      y,
      R: radiusOf('anomaly', rnd),
      name: 'A' + (i + 1),
      traits: BODY_TYPES.anomaly.traits,
    });
    side = -side;
  }
  return out;
}

/**
 * The dots scattered up the run-in carpet.
 *
 * Deterministic like everything else about the world, and from its own `rnd`
 * stream rather than the one `createBodies` walks: a seed's CORRIDOR must be the
 * same corridor whether there are ten dots in the carpet or none, exactly as it is
 * the same corridor whether or not there are anomalies. Drawing from the shared
 * stream would have made a change to `carpetMoteCount` silently relayout the whole
 * field, and the two would then never be comparable again.
 *
 * The seed is offset rather than reused so the two streams do not run in step —
 * with the same seed the first draw of each is the same number, and the dots would
 * lean the same way the first row does on every world.
 *
 * ALTERNATING SIDES, EVENLY SPREAD. See `SimConfig.carpetMoteCount` for why this
 * is a weave rather than a scatter. The band is inset at both ends: a dot sitting
 * on the finish line would be collected on the tick the run clears, which
 * `scoreTick` scores nothing on, so it would pay nothing and read as a bug.
 */
export function createMotes(cfg: SimConfig, bodies: readonly Body[]): Mote[] {
  if (cfg.carpetMoteCount <= 0) return [];
  const band = runInBand(cfg, fieldBounds(cfg, bodies));
  if (band === null) return [];

  const rnd = mulberry32((cfg.worldSeed ^ 0x9e3779b9) >>> 0);
  const fw = DESIGN_W * cfg.fieldWidthFrac;
  const cx = DESIGN_W * 0.5;
  const depth = band.bottom - band.top;
  // Amplitude and opening phase from the seed, so the same shape is not flown
  // twice, and the run does not always begin by asking for the same hand.
  const amp = fw * (0.1 + rnd() * 0.06);
  const phase = rnd() * Math.PI * 2;
  const out: Mote[] = [];
  for (let i = 0; i < cfg.carpetMoteCount; i++) {
    // 0 at the bottom of the band, 1 at the top, inset at both ends: a dot on the
    // finish line would be taken on the tick the run clears, and `scoreTick`
    // scores nothing on that tick.
    const t = 0.08 + ((i + 0.5) / cfg.carpetMoteCount) * 0.84;
    out.push({
      x: cx + amp * Math.sin(phase + t * Math.PI * 2 * MOTE_CYCLES),
      y: band.bottom - depth * t,
      taken: false,
    });
  }
  return out;
}

/**
 * How many lateral swings the chain of dots makes up the carpet.
 *
 * THE CHAIN IS THE RHYTHM, WHICH IS WHY IT IS A CURVE AND NOT A ZIG-ZAG. The
 * first version alternated the dots hard from side to side, and it was
 * uncollectable rather than difficult: ten dots over a 560px band is one every
 * 47px, and at the 400px/s a ship crosses the carpet at that is 0.12s to cross
 * 300px of corridor. Nobody threads that, so the row degenerated into "collect
 * whichever two happen to be near your line", which is the confetti problem it was
 * written to avoid wearing different clothes.
 *
 * Laid along a sine instead, the dots describe a line a player can actually fly —
 * and two cycles over the band is one swing per half second at ordinary crossing
 * speed, which is about the rhythm a press-release-press cadence produces. The
 * chain is therefore a demonstration of the carve, and following it is the tutorial.
 */
const MOTE_CYCLES = 1;

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
 * Where a run ends as `cleared`, or null when the field cannot be cleared.
 *
 * ONE DEFINITION, FOR THE SAME REASON `runInBand` IS ONE. This was derived
 * independently in three places — where the simulation ends the run, where the
 * renderer draws the chequers, and inside the band helper itself — all spelling
 * `crest - grabRange` by hand. They agree today because they are the same
 * expression, which is exactly the kind of agreement that stops being true
 * quietly: change the basis in the simulation and the line goes on being PAINTED
 * where it used to be, so the player crosses a finish that is no longer there.
 *
 * `grabRange` is the basis because that is the distance at which the last body
 * stops being grabbable — see the clear test in `stepSim` for why that, and not
 * a chosen margin.
 */
export function finishLineY(cfg: SimConfig, fb: FieldBounds): number | null {
  return finishAboveCrest(cfg, fb.crest);
}

/**
 * The same line, from the crest alone.
 *
 * Split out because `fieldBounds` needs it BEFORE it has a `FieldBounds` to hand
 * — the ceiling has to be kept clear of the finish, and it cannot ask a function
 * that takes the thing it is still building. Two copies of the `max` below would
 * be exactly the two-definitions bug this file's other helpers exist to prevent.
 */
function finishAboveCrest(cfg: SimConfig, crest: number): number | null {
  if (!cfg.clearAtTop) return null;
  // `grabRange` is the FLOOR and `finishFunnelDepth` is the setting, and it took a
  // playtest to see that those are two different jobs wearing one number.
  //
  // The floor is a correctness bound: below it the last body is still grabbable at
  // the line, so the run would end while the player was reaching for it — the
  // defect the note in `stepSim` calls "unplayable in the most annoying possible
  // way". The setting is a FEEL choice: how much sky there is between the last
  // planet and the finish, which is how long the carpet lasts and therefore how
  // much there is room to do in it.
  //
  // They were the same 560 by coincidence, and raising the carpet on its own would
  // have pushed the band DOWN past the crest — putting the carve where the
  // approach to the last planet is, so a press meant to slingshot would have bent
  // the line instead. One expression, and the max is what keeps the bound.
  return crest - Math.max(cfg.grabRange, cfg.finishFunnelDepth);
}

/**
 * How far the ceiling stays above the finish line.
 *
 * 240px, which is what the gap has always been — `fb.top` sat 800 above the crest
 * and the line 560 — and `stepSim` quotes the figure where it explains why the
 * ceiling is unreachable once the field can be cleared. Naming it is what lets the
 * carpet get deeper without the two crossing over: at 840 the old arithmetic put
 * the finish line 40px ABOVE the ceiling, which is not a death (the top bound is
 * switched off under `clearAtTop`) but is a world that no longer makes sense.
 */
const CEILING_GAP = 240;

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
  const finishY = finishLineY(cfg, fb);
  if (finishY === null || cfg.finishFunnelDepth <= 0) return null;
  // THE CREST, NOT `finishY + finishFunnelDepth`. The band is the sky between the
  // last planet and the line, which is a statement about where things ARE — so it
  // is read off the two of them rather than reconstructed by adding a length to
  // one. Adding the length was correct only while the depth and `grabRange`
  // happened to be equal; the moment the carpet was made deeper it reached back
  // down past the crest into the approach.
  return { top: finishY, bottom: fb.crest };
}

/**
 * Is this point inside some body's shelter?
 *
 * `stepSim` suspends the SIDE boundary — and only the side boundary — while this
 * is true, which is what lets a well-aimed release coast through the barrier and
 * back.
 *
 * NAMED FOR THE CAPABILITY, NOT FOR THE ANOMALY. It was `inAnomalyField` and read
 * `kind === 'anomaly'`, which made the exemption sound like a property of one
 * body type rather than a thing any body might project. It is the same predicate;
 * only what it asks has changed.
 *
 * Deliberately not applied to the top, bottom or the trailing floor. The side
 * walls are the only boundary a sheltering body sits beyond, and a shelter that
 * suspended the others would open a hole with nothing on the far side of it: a
 * ship exempted from every bound drifts forever in a straight line, because
 * `driftAccel` is zero and nothing would ever catch it. Leaving the far side must
 * always be reachable and always be fatal.
 */
export function sheltered(x: number, y: number, bodies: readonly Body[]): boolean {
  for (const b of bodies) {
    const r = b.traits.shelter;
    if (r <= 0) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= r * r) return true;
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
  // 800 above the crest, or clear of the finish line, whichever is higher. The two
  // agree exactly at a 560-deep carpet, which is where the 800 came from; a deeper
  // one pushes the ceiling up with it rather than being allowed to pass it. Inert
  // in PROTOTYPE_CONFIG, where there is no finish line at all — which is what keeps
  // this out of the equality gate.
  const finish = finishAboveCrest(cfg, highest);
  const ceiling = highest - 800;
  return {
    left: cx - fw / 2,
    right: cx + fw / 2,
    width: fw,
    crest: highest,
    top: finish === null ? ceiling : Math.min(ceiling, finish - CEILING_GAP),
    bottom: SPAWN.y + DESIGN_H + 400,
  };
}
