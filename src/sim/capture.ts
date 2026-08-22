/**
 * Capture lifecycle: grab, freeze, release.
 *
 * Ported verbatim from the prototype's `beginCapture`, `freezeOrbit` and
 * `releaseHeld`. Behaviour and arithmetic are unchanged.
 *
 * WHY IT IS SHAPED THIS WAY
 *
 * The capture took 16+ failed attempts. The tension: gravity has to catch and
 * reel you in so it feels physical, let you whip around into an eccentric oval,
 * then optionally circularise — with the tightness of that final orbit
 * controllable, and without the motion ever looking rigid, snapping, or clipping
 * the surface.
 *
 * What finally worked was refusing to author any of it as one quantity. Three
 * separate concerns:
 *
 *   clearance  do not hit the surface — one minimal early nudge lifting periapsis
 *              to the minimum orbit radius, and nothing else
 *   shape      the oval, which is pure gravity. The dive is simulated and nothing
 *              authors it
 *   tightness  how tight the settled orbit ends up, applied at the SETTLE and
 *              never at the approach
 *
 * Nothing touches the approach. That decoupling is why `freezeOrbit` exists at
 * all: the dive is real, and only once it reaches periapsis does anything
 * authored take over.
 *
 * Rejected, and expensive to rediscover: rigid or snapped orbit insertion. That
 * was the entire 16-failure saga. Keep it simulated.
 *
 * Note that tightness therefore follows the DEPTH of the dive —
 * `(grabR - rPeri) / span` — not the quality of the aim. The prototype's design
 * document claimed the opposite; that mechanic was never implemented. See
 * docs/PORT_NOTES.md note 17.
 */
import type { SimConfig } from './config.ts';
import type { Body, Capture, GrabResult, SimState } from './types.ts';
import { circSpeed, clearanceDv, escapeSpeed, hypot, naturalPeriapsis } from './orbit.ts';

export type { GrabResult } from './types.ts';

/**
 * Index of the body a press would take. Returns -1 if there are none.
 *
 * `lead` seconds of the ship's own velocity are added to its position before the
 * distances are compared, so the question asked is "which body am I arriving at"
 * rather than "which body am I beside". At lead 0 this is exactly nearest-body,
 * which is what the prototype did and what PROTOTYPE_CONFIG still asks for.
 *
 * The lead is deliberately not a cone, a heading test, or a closing-speed rule.
 * Those all need a threshold, and a threshold is a cliff the player falls off:
 * a body drifts from "behind me" to "ahead of me" through an arbitrary line.
 * Displacing the query point is continuous in both position and velocity, and it
 * costs nothing at rest — a ship that is not moving has no next planet, and gets
 * the nearest one.
 */
export function nearestBody(state: SimState, lead = 0): number {
  const x = state.ship.x + state.ship.vx * lead;
  const y = state.ship.y + state.ship.vy * lead;
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < state.bodies.length; i++) {
    const p = state.bodies[i]!;
    const d = hypot(x - p.x, y - p.y);
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
 *
 * The severity this returns only reaches the refusal threshold below
 * `crashConeSeverityFloor`; the prototype's floor of 0.4 sits above it and so
 * suppresses the distance term entirely. See the note on that key in config.ts
 * for what that measured out to.
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
  return Math.max(0, Math.min(1, Math.max(cfg.crashConeSeverityFloor, closeF)));
}

export function inCrashCone(cfg: SimConfig, state: SimState, body: Body): boolean {
  return crashCone(cfg, state, body) > 0.35;
}

/**
 * The body a grab would take right now, and why it would be refused if it would.
 *
 * Factored out of `beginCapture` so that "a grab was on offer" has exactly one
 * definition — a second copy of these four tests would drift from this one the
 * first time either moved. It was written for the scorer, which used to ask on
 * every drifting tick because coasting past a planet cost points; that penalty
 * is gone, and this is now the grab path's own answer.
 *
 * Note the targeting rule is part of the answer, not an implementation detail: a
 * press takes ONE body, so a reachable planet that is not that one was never
 * actually on offer.
 */
export function grabTarget(state: SimState, cfg: SimConfig): { index: number; result: GrabResult } {
  if (state.fuel <= 0.5) return { index: -1, result: 'refused-no-fuel' };
  const pi = nearestBody(state, cfg.grabLeadTime);
  if (pi < 0) return { index: -1, result: 'refused-no-body' };
  const p = state.bodies[pi]!;
  if (cfg.grabRange > 0) {
    const reach = hypot(state.ship.x - p.x, state.ship.y - p.y);
    if (reach > cfg.grabRange) return { index: -1, result: 'refused-out-of-range' };
  }
  if (inCrashCone(cfg, state, p)) return { index: -1, result: 'refused-crash-cone' };
  return { index: pi, result: 'captured' };
}

/**
 * Attempt a grab.
 *
 * A grab is blocked only when the tank is truly empty: entering an orbit and
 * slingshotting off must always be possible, because that is the core loop.
 * Only circularizing costs fuel.
 *
 * Still open: a near-stationary grab from a distance is still reeled in. That is
 * physically correct but can feel like the ship crawled over to the planet rather
 * than being caught by it. A minimum-approach-energy gate would let genuinely
 * dead grabs drift past instead.
 */
export function beginCapture(state: SimState, cfg: SimConfig): GrabResult {
  const { index: pi, result } = grabTarget(state, cfg);
  if (pi < 0) return result;
  const p = state.bodies[pi]!;

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
  // A bound ship is coming back whatever direction it happens to be pointing, so
  // being momentarily outbound does not make it a flyby.
  const isFlyby = cfg.boundGrabsCapture ? !bound : !bound || (movingOutward && inb < 0.02);

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
    brakeSpent: 0,
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
    // Seeded from the VELOCITY angle, which is what updateDefl compares against.
    // index.html seeded it from the position angle, so the first sample of every
    // capture reported the angle between position and velocity — ~160° on a
    // typical grab — and the SMOOTH/KINK pill read "1 KINK" on every run
    // including perfectly clean ones. PORT_NOTES note 6. Telemetry only, so the
    // equality gate (position · velocity · fuel · phase) does not observe it.
    lastAngle: Math.atan2(vy, vx),
    defl: 0,
  };

  if (!isFlyby) applyClearance(cap, cfg);

  state.capture = cap;
  return 'captured';
}

/**
 * The clearance impulse: the minimum tangential nudge that lifts the natural
 * periapsis clear of the surface, spread over `clearEaseFrames` so it never reads
 * as a snap.
 *
 * Separated out because a capture can begin two ways — directly, or by a flyby
 * being braked into one — and both need it. Only the first had it.
 */
export function applyClearance(cap: Capture, cfg: SimConfig): void {
  if (naturalPeriapsis(cfg, cap.rx, cap.ry, cap.vx, cap.vy) >= cap.minR) return;
  const dv = clearanceDv(cfg, cap.rx, cap.ry, cap.vx, cap.vy, cap.minR);
  cap.clearDvx = dv.dvx / cfg.clearEaseFrames;
  cap.clearDvy = dv.dvy / cfg.clearEaseFrames;
  cap.clearFramesLeft = cfg.clearEaseFrames;
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

  // Fuel back for capturing well. Read the envelope fraction BEFORE the capture
  // is torn down below, and pay only on `earned` — the same test the boost
  // itself is gated on, so a putter-out, a flyby and a tap that never reached
  // periapsis all refund nothing, exactly as they earn no boost.
  if (earned && cfg.linkFuelReward > 0 && cap.boostFull > 0) {
    const peakFrac = Math.max(0, Math.min(1, cap.boost / cap.boostFull));
    state.fuel = Math.min(cfg.fuelMax, state.fuel + cfg.linkFuelReward * peakFrac);
  }
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
