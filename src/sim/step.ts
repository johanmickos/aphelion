/**
 * The simulation step.
 *
 * Two-level structure, preserved from the prototype and load-bearing: one frame
 * advances `SUB` substeps, but clearance easing decrements once per *frame* while
 * the floor clamp, energy tracking, flyby brake, contacts and periapsis detection
 * all run per *substep*. Flattening the loop would change behaviour.
 *
 * Drift is deliberately a single step per frame with no forces at all — not
 * gravity summing to zero. Ambient attractors (black holes) will enter as force
 * contributors; the seam is `driftAccel` below.
 */
import type { SimConfig } from './config.ts';
import { DEFAULT_CONFIG } from './config.ts';
import type { Body, Capture, EndingReason, Input, SimState } from './types.ts';
import { circSpeed, escapeSpeed, gAccel, hypot, orbitRadius, smootherstep } from './orbit.ts';
import { applyClearance, beginCapture, freezeOrbit, releaseCapture } from './capture.ts';
import { contactPolicy, reflectCoefficient } from './contact.ts';
import { boostEnvelope } from './boost.ts';
import { burn, regen } from './fuel.ts';
import { backtrackFloorY, createBodies, fieldBounds, inAnomalyField, SPAWN } from './world.ts';

/** A fresh run. Deterministic: same config in, same state out. */
export function createInitialState(cfg: SimConfig = DEFAULT_CONFIG): SimState {
  const state: SimState = {
    tick: 0,
    ship: { x: 0, y: 0, vx: 0, vy: 0, alive: true, burstX: 0, burstY: 0, burstT: 0 },
    capture: null,
    bodies: createBodies(cfg),
    fuel: cfg.fuelMax,
    highWaterY: 0,
    ending: { active: false, t: 0, x: 0, y: 0, reason: 'impact' },
    holdConsumed: false,
    telemetry: { lastGrab: null, floorSubsteps: 0, floorSubstepsTotal: 0, putterOuts: 0 },
  };
  respawn(state, cfg);
  state.tick = 0;
  return state;
}

/** Return the ship to its start, keeping the world. */
export function respawn(state: SimState, cfg: SimConfig): void {
  const { ship } = state;
  ship.x = SPAWN.x;
  ship.y = SPAWN.y;
  ship.vx = 0;
  ship.vy = -cfg.cruise;
  ship.alive = true;
  ship.burstX = 0;
  ship.burstY = 0;
  ship.burstT = 0;
  state.fuel = cfg.fuelMax;
  state.highWaterY = ship.y;
  state.capture = null;
  // The prototype cleared its input flag here; input is an input, so the
  // equivalent fact is recorded in state. See docs/PORT_NOTES.md note 7.
  state.holdConsumed = true;
}

/** The ship's world position, wherever it currently lives. */
export function shipWorldPos(state: SimState): { x: number; y: number } {
  const cap = state.capture;
  if (!cap) return { x: state.ship.x, y: state.ship.y };
  const b = state.bodies[cap.planet]!;
  return { x: b.x + cap.rx, y: b.y + cap.ry };
}

/** The ship's velocity, wherever it currently lives. */
export function shipVelocity(state: SimState): { vx: number; vy: number } {
  const cap = state.capture;
  return cap ? { vx: cap.vx, vy: cap.vy } : { vx: state.ship.vx, vy: state.ship.vy };
}

/**
 * Ambient acceleration during drift. Empty today by design: the prototype's drift
 * is a literal straight line, and Stage 0 reproduces that exactly. Black holes
 * become contributors here rather than a new code path.
 */
function driftAccel(_state: SimState, _x: number, _y: number): { ax: number; ay: number } {
  return { ax: 0, ay: 0 };
}

/** Freeze the ship and start the hold before respawn. */
function endRun(state: SimState, reason: EndingReason, x: number, y: number): void {
  state.capture = null;
  state.ship.x = x;
  state.ship.y = y;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.ship.alive = false;
  state.ending.active = true;
  state.ending.t = 0;
  state.ending.x = x;
  state.ending.y = y;
  state.ending.reason = reason;
}

/** Advance one simulation tick. Mutates `state` in place. */
export function stepSim(state: SimState, cfg: SimConfig, input: Input, dt: number): void {
  // ---- input edges, applied before the frame as the prototype's handlers were
  if (input.pressed) {
    state.holdConsumed = false;
    if (!state.capture) {
      const result = beginCapture(state, cfg);
      state.telemetry.lastGrab = { tick: state.tick, result };
      if (result === 'captured') state.telemetry.floorSubsteps = 0;
    }
  }
  if (input.released) {
    if (state.holdConsumed) state.holdConsumed = false;
    else if (state.capture) releaseCapture(state, cfg, false);
  }
  const holding = input.held && !state.holdConsumed;

  // ---- ending hold: freeze so the player sees what happened, then respawn
  if (state.ending.active) {
    state.ending.t += dt;
    if (state.ending.t >= cfg.crashPause) {
      state.ending.active = false;
      respawn(state, cfg);
    }
    state.tick++;
    return;
  }

  if (state.capture) {
    stepCapture(state, cfg, holding, dt);
    if (state.capture?.puttered) {
      state.telemetry.putterOuts++;
      releaseCapture(state, cfg, true);
      state.holdConsumed = true;
    }
  } else if (state.ship.alive) {
    // The prototype returned from update() the instant a lethal contact landed,
    // which skips the bounds test and the fuel regen below for that one tick.
    // Reproduced deliberately: dropping it leaks one tick of regen (0.25 fuel).
    if (stepDrift(state, cfg, dt)) {
      state.tick++;
      return;
    }
  }

  // ---- bounds: leaving the field ends the run
  const pos = shipWorldPos(state);
  const fb = fieldBounds(cfg, state.bodies);
  // An orbit is a round trip. The height gained going round its near side is not
  // ground gained, and counting it puts the trailing floor at the orbit's APEX —
  // which the far side of that same orbit then flies straight into. Measured on
  // the session that reported it: a settled r=290 orbit set the floor 520px
  // above its own nadir and killed a ship that had not lost a pixel. Held here,
  // the mark resumes at the release point, which is the height actually kept.
  const banking = !(cfg.holdClimbInCapture && state.capture);
  if (banking && pos.y < state.highWaterY) state.highWaterY = pos.y;

  // Falling too far behind the high-water mark ends the run. The floor trails the
  // climb, so it is pressure to keep going rather than a wall you meet once.
  const floorY = backtrackFloorY(cfg, state.highWaterY);
  if (floorY !== null && pos.y > floorY) {
    endRun(state, 'fell-behind', pos.x, pos.y);
    state.tick++;
    return;
  }

  // The side boundary is suspended inside an anomaly's bubble, which is what a
  // release aimed past the barrier is flying through. Nothing else is suspended:
  // leaving the far side of the bubble puts the ship back outside `fb.right` on
  // the very next tick and ends the run, which is the miss.
  const outX =
    (pos.x < fb.left - 4 || pos.x > fb.right + 4) && !inAnomalyField(pos.x, pos.y, state.bodies);
  const outY = pos.y > fb.bottom || pos.y < fb.top;
  if (outX || outY) {
    // Hold on the boundary the way an impact does, so leaving the field reads as
    // an event with a cause rather than a silent teleport back to the start.
    endRun(state, 'out-of-bounds', pos.x, pos.y);
    state.tick++;
    return;
  }

  if (!state.capture) state.fuel = regen(cfg, state.fuel, dt);

  state.tick++;
}

function stepCapture(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  if (cap.phase === 'clear' || cap.phase === 'flyby') stepPhysical(state, cfg, holding, dt);
  else stepPhase(state, cfg, holding, dt);
}

/** Real softened-gravity integration: the physical dive and slingshot. */
function stepPhysical(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  const anchor = state.bodies[cap.planet]!;
  const h = dt / cfg.SUB;

  for (let s = 0; s < cfg.SUB; s++) {
    const r = hypot(cap.rx, cap.ry);
    const rhx = cap.rx / r;
    const rhy = cap.ry / r;

    // Clearance eases in once per FRAME, not per substep. Frame-denominated by
    // inheritance; see SimConfig.clearEaseFrames.
    if (cap.clearFramesLeft > 0 && s === 0) {
      cap.vx += cap.clearDvx;
      cap.vy += cap.clearDvy;
      cap.clearFramesLeft--;
    }

    const g = gAccel(cfg, r);
    const ax = -g * rhx;
    const ay = -g * rhy;
    cap.vx += ax * h;
    cap.vy += ay * h;
    cap.rx += cap.vx * h;
    cap.ry += cap.vy * h;

    // Capture the true orbital energy each substep BEFORE the floor can clamp it.
    // Reading speed after a clamp underreports a head-on dive and would flatten
    // its oval into a circle.
    {
      const rr0 = hypot(cap.rx, cap.ry);
      const v0 = hypot(cap.vx, cap.vy);
      const Enow = 0.5 * v0 * v0 - cfg.GM / Math.max(rr0, 1);
      cap.whipE = cap.whipE === undefined ? Enow : Math.max(cap.whipE, Enow);
    }

    // --- contact with the anchor: the minimum-orbit floor
    {
      const rr = hypot(cap.rx, cap.ry);
      if (rr < cap.minR) {
        state.telemetry.floorSubsteps++;
        state.telemetry.floorSubstepsTotal++;
        const nx = cap.rx / rr;
        const ny = cap.ry / rr;
        cap.rx = nx * cap.minR;
        cap.ry = ny * cap.minR;
        const vr = cap.vx * nx + cap.vy * ny;
        if (vr < 0) {
          cap.vx -= vr * nx;
          cap.vy -= vr * ny;
        }
      }
    }

    // --- contact with other bodies while coasting through the field
    {
      const wx = anchor.x + cap.rx;
      const wy = anchor.y + cap.ry;
      for (const p of state.bodies) {
        if (p === anchor) continue;
        const policy = contactPolicy(cfg, 'capture-other', p);
        if (policy.kind !== 'bounce') continue;
        const surf = p.R + policy.offset;
        const ddx = wx - p.x;
        const ddy = wy - p.y;
        const dd = hypot(ddx, ddy);
        if (dd < surf) {
          const nx = ddx / dd;
          const ny = ddy / dd;
          cap.rx = p.x + nx * surf - anchor.x;
          cap.ry = p.y + ny * surf - anchor.y;
          const vn = cap.vx * nx + cap.vy * ny;
          if (vn < 0) {
            const k = reflectCoefficient(policy.restitution);
            cap.vx -= k * vn * nx;
            cap.vy -= k * vn * ny;
          }
        }
      }
    }

    // --- holding a flyby burns fuel to brake it toward a bound orbit
    if (cap.phase === 'flyby' && holding && state.fuel > 0) {
      const spdF = hypot(cap.vx, cap.vy);
      if (spdF > 1) {
        const rr = hypot(cap.rx, cap.ry);
        const rhx2 = cap.rx / rr;
        const rhy2 = cap.ry / rr;
        let thx = -rhy2;
        let thy = rhx2;
        if (thx * cap.vx + thy * cap.vy < 0) {
          thx = -thx;
          thy = -thy;
        }
        let vr = cap.vx * rhx2 + cap.vy * rhy2;
        let vt = cap.vx * thx + cap.vy * thy;

        // Direction- and speed-dependent. Outbound: brake gently so the ship
        // coasts wide and arcs back. Below flybyBrakeMinSpeed: off entirely,
        // because at low speed gravity swings the heading fast on its own and
        // braking only sheds more speed — a vicious spin cycle.
        const outward = vr > 0;
        const lo = cfg.flybyBrakeMinSpeed;
        const hi = cfg.flybyBrakeRefSpeed;
        const speedTaper = Math.max(0, Math.min(1, (spdF - lo) / Math.max(1, hi - lo)));
        const brakeStr =
          (outward ? cfg.flybyBrake * cfg.flybyOutwardEase : cfg.flybyBrake) * speedTaper;
        const b = brakeStr * h;

        if (vr > 0) vr = Math.max(0, vr - b * cfg.flybyRadialBias);
        else vr = vr + b * 0.15;
        vt = Math.max(0, vt - b * (1 - cfg.flybyRadialBias));

        cap.vx = rhx2 * vr + thx * vt;
        cap.vy = rhy2 * vr + thy * vt;

        // The brake shed energy the player paid for; lower the whip mark by
        // exactly that much, or the freeze hands it all back. `whipE` is a
        // running max precisely so the floor clamp cannot lower it, and a brake
        // is the opposite of a clamp. See `flybyBrakeShedsWhip`. Radius does not
        // change across an impulse, so the potential term cancels and what the
        // brake removed is the kinetic difference alone.
        if (cfg.flybyBrakeShedsWhip && cap.whipE !== undefined) {
          const spdAfter = hypot(cap.vx, cap.vy);
          cap.whipE -= 0.5 * (spdF * spdF - spdAfter * spdAfter);
        }
        // Bill for the brake actually applied, not for holding the button. The
        // flat rate charged full price through the whole taper and kept charging
        // after `speedTaper` reached zero, where the impulse above is identically
        // nothing. See `flybyFuelTracksBrake`.
        const rate = cfg.flybyFuelTracksBrake
          ? cfg.flybyFuelPerSec * speedTaper
          : cfg.flybyFuelPerSec;
        const before = state.fuel;
        state.fuel = burn(state.fuel, rate, h);
        // What the brake actually cost, not what it was quoted: `burn` clamps at
        // an empty tank, and a brake the tank could not pay for must not earn a
        // refund for fuel that was never there.
        cap.brakeSpent += before - state.fuel;
      }
    }

    // A flyby converts to a capturable dive once it is bound AND inbound.
    if (cap.phase === 'flyby' && holding) {
      const rNowF = hypot(cap.rx, cap.ry);
      const spdF = hypot(cap.vx, cap.vy);
      const vEscF = escapeSpeed(cfg, rNowF);
      const vradF = (cap.vx * cap.rx + cap.vy * cap.ry) / rNowF;
      if (spdF < vEscF * 0.98 && vradF < 0) {
        cap.phase = 'clear';
        // A capture is a capture however it began. Without this the converted
        // path dives through the surface and is caught by the floor clamp.
        if (cfg.clearanceOnConvert) applyClearance(cap, cfg);
        // The rescue landed: hand back part of what the brake cost. Paid HERE and
        // not folded into the release refund, because the whole point is to reach
        // the capture that is about to burn fuel — arriving at the release would
        // be after the putter-out it exists to prevent. See `flybyConvertRefund`.
        if (cfg.flybyConvertRefund > 0 && cap.brakeSpent > 0) {
          state.fuel = Math.min(cfg.fuelMax, state.fuel + cfg.flybyConvertRefund * cap.brakeSpent);
          cap.brakeSpent = 0;
        }
      }
    }

    // --- periapsis detection -> freeze and hand off to the phase clock
    const nr = hypot(cap.rx, cap.ry);
    const dR = nr - cap.prevR;
    if (cap.phase !== 'flyby' && cap.prevDR < 0 && dR >= 0 && !cap.passedPeri) {
      cap.passedPeri = true;
      cap.periR = nr;
      if (holding) {
        const anchor = state.bodies[cap.planet];
        freezeOrbit(cap, cfg, anchor?.kind === 'anomaly' ? anchor : null);
        cap.phase = 'settle';
      }
    }
    cap.prevR = nr;
    cap.prevDR = dR;
  }

  updateDefl(state);
}

/**
 * The authored approach: radius as a quintic with both ends nailed down.
 *
 * Five conditions, and each one is a thing that would otherwise be visible:
 *
 *   r(0)  = where the ship is        position cannot jump
 *   r'(0) = how fast it was closing  velocity cannot jump
 *   r''(0)= 0                        the pull-in cannot start with a yank
 *   r(1)  = the authored radius      it arrives where it was told to
 *   r'(1) = r''(1) = 0               and stops there rather than passing through
 *
 * The cubic that only nails the first two and the last two was tried first and is
 * the reason the second derivative is in the list: with no condition on it, the
 * curve opens with its full acceleration — measured at 8770px/s² applied between
 * one tick and the next on a 426px arrival, which is a velocity step of 146px/s
 * at the exact moment of the press. Continuous and still a jolt. The quintic eases
 * the same distance in and out for a peak radial speed 25% higher in the middle,
 * which is nobody's complaint.
 *
 * It takes `settleDur` however far away the press was — that is the whole of
 * "quick regardless of speed or distance": the clock is fixed and the distance is
 * whatever it is.
 *
 * Clamped at the floor because a curve with a fast inbound end can overshoot the
 * target radius; the ship would dip inside the body it is parking around and come
 * back out. Inert on every ordinary arrival.
 */
function approachRadius(cap: Capture, u: number): number {
  const T = Math.max(0.01, cap.settleDur);
  const s2 = u * u;
  const s3 = s2 * u;
  const s4 = s3 * u;
  const s5 = s4 * u;
  const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
  const h1 = u - 6 * s3 + 8 * s4 - 3 * s5;
  const h3 = 10 * s3 - 15 * s4 + 6 * s5;
  return Math.max(cap.minR, h0 * cap.approachR0 + h1 * T * cap.approachVR + h3 * cap.rPeri);
}

/** The same quintic differentiated: how fast the approach is closing, in px/s. */
function approachRate(cap: Capture, u: number): number {
  const T = Math.max(0.01, cap.settleDur);
  const s2 = u * u;
  const s3 = s2 * u;
  const s4 = s3 * u;
  const dh0 = -30 * s2 + 60 * s3 - 30 * s4;
  const dh1 = 1 - 18 * s2 + 32 * s3 - 15 * s4;
  const dh3 = 30 * s2 - 60 * s3 + 30 * s4;
  return (dh0 * cap.approachR0 + dh1 * T * cap.approachVR + dh3 * cap.rPeri) / T;
}

/**
 * The phase clock: ride the frozen curve, sweeping it the way a real orbit does.
 *
 * dtheta/dt = L / r^2 conserves angular momentum, so motion is fast at periapsis
 * and slow at apoapsis. `phaseRate` scales that honest sweep; `tighten` reshapes
 * the ellipse toward a circle independently. They never fight because the sweep
 * always matches whatever shape currently exists.
 */
function stepPhase(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  const orbit = cap.orbit!;

  cap.settleT += dt;
  // Per capture, not per config: a body may author a shorter settle. Falls back to
  // `cfg.settleDur`, which `freezeOrbit` copies in for every ordinary capture.
  const u = Math.min(1, cap.settleT / Math.max(0.01, cap.settleDur || cfg.settleDur));
  const shape = smootherstep(u);
  const tightenAmt = cfg.tightenFrac * shape;

  // An authored orbit is a glide with boundary conditions, not an ellipse being
  // rounded off. The cubic below leaves the press at exactly the radius and
  // closing rate the ship had, and arrives at the authored circle with no radial
  // speed left — so both ends match and there is nothing to step at either.
  //
  // Radius here does not depend on the angle at all, which is why it is computed
  // once and used for the sweep and for the new position both. A spiral in is not
  // a curve the ship rides round; it is a distance closing on a clock.
  const authored = cap.settleSweep > 0;
  const rNow = authored
    ? approachRadius(cap, u)
    : orbitRadius(orbit, cap.rPeri, cap.theta, tightenAmt);
  if (cap.Lfrozen === undefined) cap.Lfrozen = cap.phaseSpeedReal * cap.rPeri * cap.rPeri;

  // As tightening rounds the orbit toward a circle, holding the oval's angular
  // momentum would spin that small circle at periapsis speed forever. Physically
  // you must shed energy to circularize, so ease L toward the circular value —
  // or, where the body authors its own pace, toward that instead. Easing the same
  // quantity either way is what keeps the settle seamless: the sweep always
  // matches whatever shape currently exists, authored or not.
  const Lcirc = cap.settleSweep > 0 ? cap.settleSweep * rNow * rNow : circSpeed(cfg, rNow) * rNow;
  const Leff = cap.Lfrozen * (1 - tightenAmt) + Lcirc * tightenAmt;
  const sweepRate = (Leff / (rNow * rNow)) * cfg.phaseRate;
  cap.phaseSpeed = sweepRate;
  cap.phaseMul = cfg.phaseRate;
  cap.theta += orbit.dir * sweepRate * dt;

  const rNew = authored ? rNow : orbitRadius(orbit, cap.rPeri, cap.theta, tightenAmt);
  cap.rx = Math.cos(cap.theta) * rNew;
  cap.ry = Math.sin(cap.theta) * rNew;
  const tx = -Math.sin(cap.theta) * orbit.dir;
  const ty = Math.cos(cap.theta) * orbit.dir;
  const tangentialSpeed = cap.phaseSpeed * rNew;
  cap.vx = tx * tangentialSpeed;
  cap.vy = ty * tangentialSpeed;
  // A glide is closing as well as sweeping, and the velocity has to say so — it
  // is what the release flings, what the trail draws and what the camera leans
  // on. The tangential-only form is right for an ellipse, where the phase clock
  // rides a curve; here it would report a ship in a circular orbit while it is
  // visibly falling toward one.
  if (authored) {
    const rDot = approachRate(cap, u);
    cap.vx += Math.cos(cap.theta) * rDot;
    cap.vy += Math.sin(cap.theta) * rDot;
  }

  // Circularizing costs fuel; running dry mid-burn putters the ship out.
  //
  // A body that authors a `refuel` rate pays it back once the orbit is round and
  // the ship is simply parked. Nothing else in the game restores fuel inside a
  // capture, which is precisely why "catch your breath" was not something the
  // economy could say: `fuelRegen` runs only while drifting, so resting anywhere
  // cost the tank. Gated on `u >= 1` so it is the settled orbit that pays, not
  // the circularization on the way in.
  if (holding && !authored && (u < 1 || cap.phaseMul !== 1)) {
    state.fuel = burn(state.fuel, cfg.fuelPerSec, dt);
    if (state.fuel <= 0 && u < 1) cap.puttered = true;
  } else if (!holding) {
    state.fuel = regen(cfg, state.fuel, dt);
  }
  if (cap.refuel > 0 && u >= 1) {
    state.fuel = Math.min(cfg.fuelMax, state.fuel + cap.refuel * dt);
  }

  cap.periR = Math.min(cap.periR, rNew);
  cap.apoR = Math.max(cap.apoR, rNew);
  cap.settleProgress = shape;

  if (cap.boostFull > 0) {
    cap.boostT = (cap.boostT || 0) + dt;
    cap.boost = boostEnvelope(cfg, cap.boostFull, cap.boostT);
  }

  if (u >= 1) cap.phase = 'orbit';
  updateDefl(state);
}

/**
 * Per-sample heading deflection above this is a visible kink.
 *
 * Lived in `src/sim/trace.ts` alongside a `TraceRecorder` that nothing ever
 * instantiated — the diagnostics replay superseded it — so it moved here, next to
 * the code that produces the value it thresholds.
 */
export const KINK_THRESHOLD_DEG = 15;

/** Per-sample heading deflection. Telemetry only; never feeds back into physics. */
function updateDefl(state: SimState): void {
  const cap = state.capture!;
  const ang = Math.atan2(cap.vy, cap.vx);
  let d = ((ang - cap.lastAngle) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  cap.defl = Math.abs(d);
  cap.lastAngle = ang;
}

/**
 * Free drift: one step per frame, no forces.
 * Returns true if the ship crashed, which aborts the rest of the tick.
 */
function stepDrift(state: SimState, cfg: SimConfig, dt: number): boolean {
  const { ship } = state;

  // Transient escape burst, decaying over boostBurstDecay seconds.
  let bx = 0;
  let by = 0;
  if (ship.burstX || ship.burstY) {
    ship.burstT = (ship.burstT || 0) + dt;
    const f = Math.max(0, 1 - ship.burstT / cfg.boostBurstDecay);
    if (f <= 0) {
      ship.burstX = 0;
      ship.burstY = 0;
    } else {
      bx = ship.burstX * f;
      by = ship.burstY * f;
    }
  }

  const { ax, ay } = driftAccel(state, ship.x, ship.y);
  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.x += (ship.vx + bx) * dt;
  ship.y += (ship.vy + by) * dt;

  // Contact during drift is lethal unless it is essentially a parallel graze —
  // which preserves the legitimate case of flinging tangentially past a planet
  // you just left.
  for (const p of state.bodies as Body[]) {
    const policy = contactPolicy(cfg, 'drift', p);
    if (policy.kind !== 'bounce') continue;
    const surf = p.R + policy.offset;
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const d = hypot(dx, dy);
    if (d >= surf) continue;

    const nx = dx / d;
    const ny = dy / d;
    const spd = hypot(ship.vx, ship.vy);
    const vn = ship.vx * nx + ship.vy * ny;
    const intoSurface = spd > 1 && -vn / spd > cfg.crashGrazeDot;

    if (policy.lethal && intoSurface) {
      ship.x = p.x + nx * surf;
      ship.y = p.y + ny * surf;
      ship.vx = 0;
      ship.vy = 0;
      ship.alive = false;
      endRun(state, 'impact', ship.x, ship.y);
      return true;
    }

    ship.x = p.x + nx * surf;
    ship.y = p.y + ny * surf;
    if (vn < 0) {
      const k = reflectCoefficient(policy.restitution);
      ship.vx -= k * vn * nx;
      ship.vy -= k * vn * ny;
    }
  }
  return false;
}
