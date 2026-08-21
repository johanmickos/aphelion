/**
 * Capture lifecycle: grab, freeze, release.
 *
 * Ported verbatim from the prototype's `beginCapture`, `freezeOrbit` and
 * `releaseHeld`. Behaviour and arithmetic are unchanged.
 */
import type { SimConfig } from './config.ts';
import type { Body, Capture, GrabResult, SimState } from './types.ts';
import { circSpeed, clearanceDv, escapeSpeed, hypot, naturalPeriapsis } from './orbit.ts';

export type { GrabResult } from './types.ts';

/** Index of the body nearest the ship. Returns -1 if there are none. */
export function nearestBody(state: SimState): number {
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < state.bodies.length; i++) {
    const p = state.bodies[i]!;
    const d = hypot(state.ship.x - p.x, state.ship.y - p.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Crash-cone severity in 0..1: the ship's heading ray intersects the body's
 * circle, and it is close enough that recovery is no longer offered.
 *
 * NOTE: the ray is a straight line but the real path curves under gravity, so
 * this over-warns on dives that would capture cleanly. Reproduced faithfully;
 * making it gravity-aware is PORT_NOTES note 1.
 */
export function crashCone(cfg: SimConfig, state: SimState, body: Body): number {
  const { ship } = state;
  const rx = ship.x - body.x;
  const ry = ship.y - body.y;
  const d = hypot(rx, ry);
  if (d > body.R + cfg.crashConeRange) return 0;
  const spd = hypot(ship.vx, ship.vy);
  if (spd < 1) return 0;
  const hx = ship.vx / spd;
  const hy = ship.vy / spd;
  const b = rx * hx + ry * hy;
  const c = rx * rx + ry * ry - body.R * body.R;
  const disc = b * b - c;
  if (disc < 0) return 0;
  const t = -b - Math.sqrt(disc);
  if (t <= 0) return 0;
  const closeF = 1 - (d - body.R) / Math.max(1, cfg.crashConeRange);
  return Math.max(0, Math.min(1, Math.max(0.4, closeF)));
}

export function inCrashCone(cfg: SimConfig, state: SimState, body: Body): boolean {
  return crashCone(cfg, state, body) > 0.35;
}

/**
 * Attempt a grab.
 *
 * A grab is blocked only when the tank is truly empty: entering an orbit and
 * slingshotting off must always be possible, because that is the core loop.
 * Only circularizing costs fuel.
 */
export function beginCapture(state: SimState, cfg: SimConfig): GrabResult {
  if (state.fuel <= 0.5) return 'refused-no-fuel';
  const pi = nearestBody(state);
  if (pi < 0) return 'refused-no-body';
  const p = state.bodies[pi]!;
  if (cfg.grabRange > 0) {
    const reach = hypot(state.ship.x - p.x, state.ship.y - p.y);
    if (reach > cfg.grabRange) return 'refused-out-of-range';
  }
  if (inCrashCone(cfg, state, p)) return 'refused-crash-cone';

  const { ship } = state;
  const rx = ship.x - p.x;
  const ry = ship.y - p.y;
  const vx = ship.vx;
  const vy = ship.vy;
  const minR = p.R + cfg.minOrbitGap;
  const grabR = hypot(rx, ry);
  const r = grabR;
  const spd = hypot(vx, vy);
  const rhx = rx / r;
  const rhy = ry / r;
  const vrad = vx * rhx + vy * rhy;
  const inb = Math.max(0, -vrad / Math.max(spd, 1));

  // A flyby is an unbound grab (at or above escape speed, so gravity cannot hold
  // it) or one already moving outward with no periapsis ahead. Gravity still
  // bends the path; holding burns fuel to brake it into a capture.
  const vEsc = escapeSpeed(cfg, r);
  const bound = spd < vEsc * 0.98;
  const movingOutward = vrad > 0;
  const isFlyby = !bound || (movingOutward && inb < 0.02);

  const natPeri = naturalPeriapsis(cfg, rx, ry, vx, vy);

  const cap: Capture = {
    phase: isFlyby ? 'flyby' : 'clear',
    planet: pi,
    rx,
    ry,
    vx,
    vy,
    grabR,
    minR,
    prevR: grabR,
    prevDR: 0,
    passedPeri: false,
    periR: grabR,
    apoR: grabR,
    clearFramesLeft: 0,
    clearDvx: 0,
    clearDvy: 0,
    whipE: undefined,
    orbit: null,
    theta: 0,
    phaseSpeed: 0,
    phaseSpeedReal: 0,
    phaseMul: 1,
    Lfrozen: undefined,
    rPeri: 0,
    settleT: 0,
    settleProgress: 0,
    tightness: 0,
    boostFull: 0,
    boost: 0,
    boostT: 0,
    puttered: false,
    lastAngle: Math.atan2(ry, rx),
    defl: 0,
  };

  // Clearance: the minimum tangential nudge that lifts the natural periapsis to
  // minR, eased in over `clearEaseFrames` frames so it never reads as a snap.
  if (natPeri < minR && !isFlyby) {
    const dv = clearanceDv(cfg, rx, ry, vx, vy, minR);
    cap.clearDvx = dv.dvx / cfg.clearEaseFrames;
    cap.clearDvy = dv.dvy / cfg.clearEaseFrames;
    cap.clearFramesLeft = cfg.clearEaseFrames;
  }

  state.capture = cap;
  return 'captured';
}

/**
 * Freeze the orbit at periapsis and hand the ship to the phase clock.
 *
 * The frozen ellipse must pass through the ship's actual position and treat that
 * position as periapsis (velocity there is purely tangential, so this radius is
 * the low point). Eccentricity comes from the dive's conserved energy rather than
 * instantaneous speed, because a floor clamp on a head-on dive craters the latter
 * and would flatten the oval into a circle.
 */
export function freezeOrbit(cap: Capture, cfg: SimConfig): void {
  const { rx, ry, vx, vy } = cap;
  const r = hypot(rx, ry);
  const spd = hypot(vx, vy);
  const L = rx * vy - ry * vx;
  const dir = Math.sign(L) || 1;
  const posAng = Math.atan2(ry, rx);

  const rPeri = r;
  const vc = circSpeed(cfg, rPeri);
  let vPeriTrue =
    cap.whipE !== undefined ? Math.sqrt(Math.max(0, 2 * (cap.whipE + cfg.GM / rPeri))) : spd;
  vPeriTrue = Math.max(vPeriTrue, spd);
  let e = Math.max(0, (vPeriTrue * vPeriTrue) / (vc * vc) - 1);
  e = Math.min(e, 0.6);
  const a = rPeri / (1 - e);

  cap.orbit = { a, e, argp: posAng, dir };
  cap.theta = posAng;
  cap.rPeri = rPeri;

  // Seam continuity: seed the sweep rate from the true periapsis speed the dive
  // earned, so a floor-clamped velocity does not start the settle too slow.
  cap.phaseSpeedReal = vPeriTrue / rPeri;
  cap.phaseSpeed = cap.phaseSpeedReal;
  cap.phaseMul = 1;
  cap.settleT = 0;

  const span = Math.max(1, cap.grabR - cap.minR);
  cap.tightness = Math.max(0, Math.min(1, (cap.grabR - cap.rPeri) / span));
  const over = Math.max(0, (cap.tightness - cfg.boostThreshold) / (1 - cfg.boostThreshold));
  cap.boostFull = cfg.boostMax * over;
  cap.boost = 0;
  cap.boostT = 0;
}

/** What a release handed back to the world, for telemetry. */
export interface ReleaseOutcome {
  boostApplied: number;
  weak: boolean;
}

/**
 * Release: hand a real velocity vector back to the world.
 *
 * The boost splits into a small permanent carry baked into velocity plus a
 * punchy transient burst that decays during drift — so escape feels sharp up
 * front then settles to a modest lasting gain, rather than a permanent add that
 * ratchets the ship faster forever.
 *
 * A weak release (puttered out of fuel mid-circularization) earns no boost and
 * is damped: the ship gives up and drifts off unenthusiastically.
 */
export function releaseCapture(state: SimState, cfg: SimConfig, weak: boolean): ReleaseOutcome {
  const cap = state.capture;
  if (!cap) return { boostApplied: 0, weak };
  const body = state.bodies[cap.planet]!;

  const earned = !weak && cap.orbit !== null && cap.passedPeri && cap.phase !== 'flyby';
  const add = earned ? cap.boost || 0 : 0;
  const spd = hypot(cap.vx, cap.vy) || 1;
  const bx = cap.vx / spd;
  const by = cap.vy / spd;
  const flingScale = weak ? 0.35 : cfg.releaseFlingBoost;

  const { ship } = state;
  ship.x = body.x + cap.rx;
  ship.y = body.y + cap.ry;

  const permAdd = add * cfg.boostPermFrac;
  const burstAdd = add * (1 - cfg.boostPermFrac) * cfg.boostPunch;
  ship.vx = (cap.vx + bx * permAdd) * flingScale;
  ship.vy = (cap.vy + by * permAdd) * flingScale;
  ship.burstX = bx * burstAdd;
  ship.burstY = by * burstAdd;
  ship.burstT = 0;

  state.capture = null;

  if (weak) {
    ship.burstX = 0;
    ship.burstY = 0;
  }
  return { boostApplied: add, weak };
}
