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
 * THE FLING IS EARNED, NOT DRAWN EITHER. `boostEnvelope` holds its peak until
 * `settleDur` 1.2s past periapsis and is spent by 2.6s. The radii are chosen to
 * straddle that cliff. The slingshot lobe takes 1.71s, inside the window, so its
 * release pays: 38 of `boostMax` 60, which `releaseCapture` splits into a
 * permanent +8 along the tangent and a +54 burst decaying over
 * `boostBurstDecay`. It leaves at 1.25x its orbital speed and cools as it
 * crosses. The orbit lobe takes 2.64s, past the cliff by forty milliseconds, so
 * it earns exactly nothing and leaves at the speed it was already going.
 *
 * That contrast is the game's actual rule — a long hold forfeits the boost —
 * shown rather than stated. Both radii are load-bearing for it and neither is
 * free to move: see their notes.
 *
 * THE ONE ASSUMPTION. `boostFull` is `boostMax * over`, and `over` grades how
 * deep the dive went — but the attract ship has no dive, it arrives already on
 * its circle, so a value has to be chosen rather than derived. This takes full
 * credit, `tightness` 1, because a title screen shows the game flown well. A
 * player earns that only by bottoming the dive out on the floor.
 */
import type { SimConfig } from '../sim/config.ts';
import { boostEnvelope } from '../sim/boost.ts';
import { circSpeed } from '../sim/orbit.ts';
import { shipPath } from './ship.ts';
import { CORE, DUSK, INK, VOID, solid, withAlpha } from './palette.ts';

/**
 * Orbit radius at the larger body.
 *
 * Tuned against `boostEnvelope`, not against the drawing. It sets how long the
 * slingshot lobe takes, and that duration is what the fling is paid for: at 110
 * the lobe ran 2.61s and earned nothing, at 89 it runs 1.71s and earns 38 of 60.
 * Raising it back past ~103 silently kills the fling and leaves a pass that
 * looks identical and means nothing.
 */
export const ORBIT_BIG = 89;
/**
 * Orbit radius at the smaller body.
 *
 * Also tuned against the envelope, from the other side: the orbit lobe has to
 * stay PAST the 2.6s cliff so a long hold visibly forfeits its boost. At 68 it
 * runs 2.64s and clears by forty milliseconds. Below about 66 it starts earning
 * one too and the two lobes stop meaning different things.
 *
 * Together with `ORBIT_BIG` it also sets the crossing: `sqrt(d² - (r1+r2)²)` is
 * 147 units here. A larger pair shortens that toward zero and the 8 collapses.
 */
export const ORBIT_SMALL = 68;
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
 *
 * Applied LAST, after the dwell that decides the boost, which is what makes it
 * safe to turn: the fling is earned in simulation seconds and the projector
 * cannot buy a bigger one. The ceiling is perceptual instead. At 1.6 the flung
 * crossing lasts 0.31s, about eighteen frames, which is still long enough to see
 * the ship leave faster than it was going; past roughly 2.0 it is not, and the
 * whole point of the pass is lost even though every number still checks out.
 */
export const PLAYBACK_RATE = 1.6;

/** Colours. Grey enough that the violet wordmark below is the only hue. */
export const ATTRACT = {
  planetFill: withAlpha(INK, 0.04),
  planetLine: withAlpha(DUSK, 0.5),
  ship: solid(CORE),
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
  /** Fastest the ship moves during it, for `AttractLoop.maxSpeed`. */
  peak: number;
  pose(t: number): Pose;
}

export interface AttractLoop {
  readonly planets: readonly AttractPlanet[];
  /** Bounding box of the whole figure in loop units, orbits included. */
  readonly box: { x: number; y: number; w: number; h: number };
  /** Seconds for one full cycle. */
  readonly period: number;
  /** Fastest the ship ever moves, in loop units per played second. */
  readonly maxSpeed: number;
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
    peak: r * omega,
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

/** What a release hands the ship, in the same terms `releaseCapture` does. */
interface Release {
  /** Speed retained for the whole crossing. */
  base: number;
  /** Extra speed at the instant of release, decaying linearly to nothing. */
  burst: number;
  /** Seconds the burst takes to decay — `boostBurstDecay`. */
  decay: number;
}

/**
 * `releaseCapture` and `boostEnvelope`, evaluated for a lobe held `dwell`
 * seconds past periapsis.
 *
 * `dwell` is in SIMULATION seconds, not played ones: what the game pays depends
 * on how long the hold actually was, and `PLAYBACK_RATE` is a projector speed.
 * Feeding it the played duration would hand the loop a boost the game never
 * offers, which is the exact dishonesty this file exists to avoid.
 */
function release(cfg: SimConfig, orbitalSpeed: number, dwell: number): Release {
  const add = boostEnvelope(cfg, cfg.boostMax, dwell);
  return {
    // The fling scales the permanent part; the burst is applied after it and is
    // not scaled, matching `releaseCapture`.
    base: (orbitalSpeed + add * cfg.boostPermFrac) * cfg.releaseFlingBoost,
    burst: add * (1 - cfg.boostPermFrac) * cfg.boostPunch,
    decay: cfg.boostBurstDecay,
  };
}

/**
 * The straight crossing between two lobes.
 *
 * `driftAccel` is zero, so the only thing happening out here is the release
 * burst bleeding off — which is why the transfer is a line the ship traverses at
 * a falling speed rather than at a constant one. Solved rather than stepped: the
 * distance covered is the integral of `base + burst·(1 - t/decay)`, so the
 * crossing time is a root of that, and the segment stays exactly as long as the
 * geometry says it is.
 */
function transfer(x0: number, y0: number, x1: number, y1: number, r: Release): Segment {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const { base, burst, decay } = r;

  const dist = (t: number): number =>
    t >= decay ? base * t + (burst * decay) / 2 : base * t + burst * (t - (t * t) / (2 * decay));

  // Inside the decay window the distance is a quadratic in t; past it the burst
  // is spent and what remains is covered at `base`.
  const a = burst / (2 * decay);
  const b = base + burst;
  const dur =
    dist(decay) >= len
      ? a === 0
        ? len / b
        : (b - Math.sqrt(b * b - 4 * a * len)) / (2 * a)
      : decay + (len - dist(decay)) / base;

  return {
    dur,
    peak: base + burst,
    pose(t: number): Pose {
      const u = Math.min(1, dist(Math.min(t, dur)) / len);
      return { x: x0 + dx * u, y: y0 + dy * u, angle };
    },
  };
}

/**
 * Play a segment faster than it happened.
 *
 * Applied once, at the end, to every segment alike — which is what keeps
 * `PLAYBACK_RATE` a projector speed rather than a physics change. Everything
 * upstream of here is in simulation seconds, including the dwell that decides
 * the boost.
 */
function played(seg: Segment, rate: number): Segment {
  return {
    dur: seg.dur / rate,
    peak: seg.peak * rate,
    pose: (t: number): Pose => seg.pose(t * rate),
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

  // Real orbital speeds, from the game's own GM. A tighter orbit is genuinely
  // faster, so the small lobe sweeps quicker. Simulation seconds throughout —
  // PLAYBACK_RATE is applied once, at the bottom.
  const v1 = circSpeed(cfg, r1);
  const v2 = circSpeed(cfg, r2);
  const forced = 2 * Math.PI - 2 * phi;

  // Big lobe, the slingshot: entered at -φ and left at +φ, which forces it
  // clockwise, and nothing added — one sweep round the far side and gone.
  const big = arc(c1x, c1y, r1, -phi, -1, v1 / r1, forced + 2 * Math.PI * LAPS_BIG);
  // Small lobe, the orbit: entered at π+φ and left at π-φ — anticlockwise, the
  // opposite sense, because the tangents cross. This is the 8, not a racetrack.
  const small = arc(c2x, c2y, r2, Math.PI + phi, 1, v2 / r2, forced + 2 * Math.PI * LAPS_SMALL);

  // Each crossing is paid for by the lobe that launched it, at the boost that
  // lobe's own dwell earned. The short pass is inside the window and flings; the
  // long orbit is past it and leaves at the speed it was already going.
  const segments: Segment[] = [
    big,
    transfer(p1a.x, p1a.y, p2a.x, p2a.y, release(cfg, v1, big.dur)),
    small,
    transfer(p2b.x, p2b.y, p1b.x, p1b.y, release(cfg, v2, small.dur)),
  ].map((seg) => played(seg, PLAYBACK_RATE));

  const period = segments.reduce((a, s) => a + s.dur, 0);

  return {
    planets: [
      { x: c1x, y: c1y, R: R_BIG },
      { x: c2x, y: c2y, R: R_SMALL },
    ],
    box: { x: c1x - r1, y: c1y - r1, w: r1 + d + r2, h: 2 * r1 },
    period,
    maxSpeed: segments.reduce((m, seg) => Math.max(m, seg.peak), 0),
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
  ctx.fillStyle = solid(VOID);
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
