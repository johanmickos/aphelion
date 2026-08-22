/**
 * The attract loop above the title on the armed screen.
 *
 * Two planets, a ship, and nothing else. It exists to say "you orbit, then you
 * transfer" before a word of the instruction below it is read, so anything that
 * is not one of those two facts has been left out — no trail, no HUD, no boost
 * halo, no accolades.
 *
 * AUTHORED, NOT SIMULATED — AND THAT IS NOT A SHORTCUT. Outside a capture
 * `driftAccel` returns zero, so the game's transfers are literal straight lines;
 * inside one the settle is `approachRadius`, a quintic on a fixed clock swept by
 * a phase clock, which is not integrated gravity either. A circular arc at
 * `circSpeed(r)/r` joined to a straight tangent is therefore the same motion
 * `stepSim` produces, computed in closed form. What that buys is exact
 * periodicity: the loop closes because each arc ENDS at the point its tangent
 * BEGINS, not because a search found an input log that nearly closes. Driving
 * the real `stepSim` was considered and declined for the opposite reason — the
 * press and release ticks would have to be solved offline against today's
 * capture tuning, and the next `settleDur` change would silently break the
 * figure with nothing in the suite to catch it.
 *
 * THE FIGURE-8 IS FORCED, NOT DRAWN. Two circles have exactly two INTERNAL
 * tangents; they cross between the bodies; and a ship that leaves along one and
 * arrives along the other must round its two lobes in opposite senses. The whole
 * construction is `cos φ = (r1 + r2) / d`. There is no path data in this file,
 * which is why the shape cannot drift out of true when the radii are retuned.
 *
 * ONE LOBE ORBITS, ONE SLINGSHOTS. The small body gets the extra lap and reads
 * as somewhere the ship settles; the large one gets only the arc the tangents
 * force, which is a single wide sweep round its far side and reads as a pass.
 * That asymmetry is the whole lesson the screen teaches, and it is `LAPS_BIG` /
 * `LAPS_SMALL` — nothing else in here knows about it.
 *
 * NO BOOST, STILL. `boostEnvelope` is zero 2.6s after periapsis (`settleDur` 1.2
 * plus `boostDecayTime` 1.4). The slingshot lobe is now held for 2.61s, which
 * clears that cliff by ten milliseconds, and the orbit lobe for 3.54s — so
 * `releaseCapture` pays nothing at either and `releaseFlingBoost` is 1. The exit
 * speed is the orbital speed, exactly as the game would give it at these dwells,
 * and the slingshot is carried by the SHAPE of the pass rather than by
 * acceleration. Tightening `ORBIT_BIG` to about 95 would drop that lobe under
 * two seconds and earn a real ~1.3x fling, at the cost of the two lobes looking
 * nearly the same size.
 */
import type { SimConfig } from '../sim/config.ts';
import { circSpeed } from '../sim/orbit.ts';
import { shipPath } from './ship.ts';

/** Orbit radius at the larger body. */
export const ORBIT_BIG = 110;
/** Orbit radius at the smaller body. */
export const ORBIT_SMALL = 80;
/**
 * Distance between the two centres.
 *
 * HARD FLOOR AT `ORBIT_BIG + ORBIT_SMALL` = 190. Below that the orbits overlap,
 * the internal tangents do not exist, `Math.acos` of a ratio above 1 is NaN, and
 * the whole figure quietly becomes nothing. 215 is as close as the bodies can be
 * drawn together while the crossing is still long enough to read as a transfer
 * rather than as a kink — the gap between the two orbit CIRCLES is 25 units here
 * against 70 at the original 260, so they look far closer than the centres moved.
 * Bringing the centres nearer than this means tightening the orbits too, which
 * speeds the whole loop up: `circSpeed` goes as 1/sqrt(r).
 */
const GAP = 215;
/** Body radii. Both sit well inside their orbit, `minOrbitGap` included. */
const R_BIG = 52;
const R_SMALL = 34;

/**
 * Whole revolutions added to each lobe beyond the arc the tangents force.
 *
 * The forced arc is `2π - 2φ` with `φ < π/2`, so it is always more than half a
 * turn: a crossing figure-8 cannot have a short dwell, only a fast one. What it
 * can have is two different ones, which is the point of splitting these. The big
 * body gets nothing added — one sweep round the back and out, a slingshot. The
 * small body gets a lap, so the ship visibly stays. Equal values here make both
 * lobes the same manoeuvre and the screen stops saying anything.
 */
const LAPS_BIG = 0;
const LAPS_SMALL = 1;

/**
 * How much faster than real time the loop plays.
 *
 * A deliberate departure and the only one: the radii are set by how much room
 * there is above the wordmark, and at that size the honest sweep rates read as a
 * drift. Uniform, so the shape is untouched and the ratio between the two lobes
 * is still the `1/sqrt(r)` the simulation would give — this changes the wall
 * clock, not the physics, the way a montage does.
 */
export const PLAYBACK_RATE = 1.25;

/** Colours. Grey enough that the violet wordmark below is the only hue. */
export const ATTRACT = {
  planetFill: 'rgba(255,255,255,.04)',
  planetLine: 'rgba(200,210,230,.35)',
  ship: '#cfdcf2',
  /**
   * The box shrinks with the viewport; below this the ship stops shrinking. Set
   * against the smallest canvas the layout produces — the ship has to stay a
   * recognisable arrowhead there without becoming the biggest thing on screen.
   */
  minShipScale: 0.45,
  /** Breathing room inside the canvas, in CSS pixels. */
  pad: 4,
} as const;

export interface Pose {
  x: number;
  y: number;
  /** Heading in radians, always the direction of travel. */
  angle: number;
}

export interface AttractPlanet {
  x: number;
  y: number;
  R: number;
}

interface Segment {
  dur: number;
  pose(t: number): Pose;
}

export interface AttractLoop {
  readonly planets: readonly AttractPlanet[];
  /** Bounding box of the whole figure in loop units, orbits included. */
  readonly box: { x: number; y: number; w: number; h: number };
  /** Seconds for one full cycle. */
  readonly period: number;
  /** A time mid-transfer, for the still frame shown under reduced motion. */
  readonly stillT: number;
  pose(t: number): Pose;
}

/** An arc of a circle, swept at a constant rate. `dir` is +1 anticlockwise. */
function arc(
  cx: number,
  cy: number,
  r: number,
  theta0: number,
  dir: 1 | -1,
  omega: number,
  sweep: number,
): Segment {
  return {
    dur: sweep / omega,
    pose(t: number): Pose {
      const th = theta0 + dir * omega * t;
      return {
        x: cx + r * Math.cos(th),
        y: cy + r * Math.sin(th),
        angle: Math.atan2(dir * Math.cos(th), -dir * Math.sin(th)),
      };
    },
  };
}

/** A straight run at constant speed — what the game does between captures. */
function line(x0: number, y0: number, x1: number, y1: number, speed: number): Segment {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  return {
    dur: len / speed,
    pose(t: number): Pose {
      const u = (speed * t) / len;
      return { x: x0 + dx * u, y: y0 + dy * u, angle };
    },
  };
}

export function createAttractLoop(cfg: SimConfig): AttractLoop {
  const r1 = ORBIT_BIG;
  const r2 = ORBIT_SMALL;
  const d = GAP;

  // The construction, in one line: an internal tangent touches each circle at
  // ±φ from the line of centres. Everything below is bookkeeping.
  const phi = Math.acos((r1 + r2) / d);
  const cph = Math.cos(phi);
  const sph = Math.sin(phi);

  // Centres. The big body sits at the origin; the small one to its right.
  const c1x = 0;
  const c1y = 0;
  const c2x = d;
  const c2y = 0;

  // The four tangent points. `a` is the pair joined by one tangent, `b` the
  // other; the two tangents cross between the bodies, which is the 8.
  const p1a = { x: c1x + r1 * cph, y: c1y + r1 * sph };
  const p1b = { x: c1x + r1 * cph, y: c1y - r1 * sph };
  const p2a = { x: c2x - r2 * cph, y: c2y - r2 * sph };
  const p2b = { x: c2x - r2 * cph, y: c2y + r2 * sph };

  // Real orbital speeds, from the game's own GM, then played at PLAYBACK_RATE.
  // A tighter orbit is genuinely faster, so the small lobe is the quicker one and
  // the transfer it launches is quicker too — the only speed variation in the
  // whole loop, and one the simulation would produce.
  const v1 = circSpeed(cfg, r1) * PLAYBACK_RATE;
  const v2 = circSpeed(cfg, r2) * PLAYBACK_RATE;
  const forced = 2 * Math.PI - 2 * phi;

  const segments: Segment[] = [
    // Big lobe, the slingshot: entered at -φ and left at +φ, which forces it
    // clockwise, and nothing added — one sweep round the far side and gone.
    arc(c1x, c1y, r1, -phi, -1, v1 / r1, forced + 2 * Math.PI * LAPS_BIG),
    line(p1a.x, p1a.y, p2a.x, p2a.y, v1),
    // Small lobe, the orbit: entered at π+φ and left at π-φ — anticlockwise, the
    // opposite sense, because the tangents cross. This is the 8, not a racetrack.
    arc(c2x, c2y, r2, Math.PI + phi, 1, v2 / r2, forced + 2 * Math.PI * LAPS_SMALL),
    line(p2b.x, p2b.y, p1b.x, p1b.y, v2),
  ];

  const period = segments.reduce((a, s) => a + s.dur, 0);

  return {
    planets: [
      { x: c1x, y: c1y, R: R_BIG },
      { x: c2x, y: c2y, R: R_SMALL },
    ],
    box: { x: c1x - r1, y: c1y - r1, w: r1 + d + r2, h: 2 * r1 },
    period,
    stillT: segments[0]!.dur + segments[1]!.dur / 2,
    pose(t: number): Pose {
      let u = t % period;
      if (u < 0) u += period;
      for (const s of segments) {
        if (u < s.dur) return s.pose(u);
        u -= s.dur;
      }
      // Only reachable on a floating-point hair at the very end of the cycle.
      return segments[segments.length - 1]!.pose(segments[segments.length - 1]!.dur);
    },
  };
}

/**
 * Draw one frame into its own canvas.
 *
 * `w` and `h` are CSS pixels; the context is expected to carry the dpr
 * transform already, exactly as the game canvas does. The region is painted
 * opaque black first: the armed overlay behind it is dimmed rather than
 * removed, so anything left transparent would show the live field through the
 * figure.
 */
export function drawAttractLoop(
  ctx: CanvasRenderingContext2D,
  loop: AttractLoop,
  t: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  if (w <= 0 || h <= 0) return;

  const { box } = loop;
  const pad = ATTRACT.pad;
  const s = Math.min((w - pad * 2) / box.w, (h - pad * 2) / box.h);
  const ox = w / 2 - (box.x + box.w / 2) * s;
  const oy = h / 2 - (box.y + box.h / 2) * s;

  for (const p of loop.planets) {
    ctx.beginPath();
    ctx.arc(ox + p.x * s, oy + p.y * s, p.R * s, 0, Math.PI * 2);
    ctx.fillStyle = ATTRACT.planetFill;
    ctx.fill();
    ctx.strokeStyle = ATTRACT.planetLine;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const pose = loop.pose(t);
  ctx.save();
  ctx.translate(ox + pose.x * s, oy + pose.y * s);
  ctx.rotate(pose.angle);
  shipPath(ctx, Math.max(s, ATTRACT.minShipScale));
  ctx.fillStyle = ATTRACT.ship;
  ctx.fill();
  ctx.restore();
}
