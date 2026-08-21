/**
 * What the renderer needs from the simulation, sampled per tick and interpolated
 * per frame. Keeping this narrow is what stops rendering from reaching into sim
 * internals and re-deriving things the sim already computed.
 */
import type { CapturePhase, EndingReason, GrabResult, SimState } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import { escapeSpeed, hypot } from '../sim/orbit.ts';

export interface RenderSnapshot {
  /** Simulation tick, so the HUD can age transient messages without a wall clock. */
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Null while drifting. */
  capture: {
    phase: CapturePhase;
    planet: number;
    /** Settle easing, taken from the sim rather than recomputed. */
    settleProgress: number;
    /** Seconds into the settle, for the circularisation-affordability check. */
    settleT: number;
    orbit: { a: number; e: number; argp: number; dir: number } | null;
    rPeri: number;
    boost: number;
    boostFull: number;
    /** Seconds since the orbit froze — tells rising from falling. */
    boostT: number;
    /**
     * How far above the capture threshold this grab still is, as a fraction:
     * 0 means bound (about to convert), 0.3 means 30% too fast.
     *
     * Braking a flyby sheds this toward zero. Showing it turns "TOO FAST" from
     * an alarm into a progress readout, which matters because most flybys
     * convert in a fraction of a second for a fraction of the tank.
     */
    overEscape: number;
    /** Planet-relative state, so the renderer can derive the live orbit. */
    rx: number;
    ry: number;
    vx: number;
    vy: number;
    /** Minimum orbit radius for this body. */
    minR: number;
  } | null;
  fuel: number;
  /** Highest point reached this run — the trailing floor hangs below it. */
  highWaterY: number;
  held: boolean;
  /** The most recent grab attempt and its outcome, for the readout. */
  lastGrab: { tick: number; result: GrabResult } | null;
  ending: { active: boolean; t: number; x: number; y: number; reason: EndingReason };
}

export function captureSnapshot(state: SimState, held: boolean, cfg: SimConfig): RenderSnapshot {
  const cap = state.capture;
  const b = cap ? state.bodies[cap.planet]! : null;
  let overEscape = 0;
  if (cap) {
    const r = hypot(cap.rx, cap.ry);
    const threshold = escapeSpeed(cfg, r) * 0.98;
    overEscape = threshold > 0 ? hypot(cap.vx, cap.vy) / threshold - 1 : 0;
  }
  return {
    tick: state.tick,
    x: b && cap ? b.x + cap.rx : state.ship.x,
    y: b && cap ? b.y + cap.ry : state.ship.y,
    vx: cap ? cap.vx : state.ship.vx,
    vy: cap ? cap.vy : state.ship.vy,
    capture: cap
      ? {
          phase: cap.phase,
          planet: cap.planet,
          settleProgress: cap.settleProgress,
          settleT: cap.settleT,
          orbit: cap.orbit ? { ...cap.orbit } : null,
          rPeri: cap.rPeri,
          boost: cap.boost,
          boostFull: cap.boostFull,
          boostT: cap.boostT,
          overEscape,
          rx: cap.rx,
          ry: cap.ry,
          vx: cap.vx,
          vy: cap.vy,
          minR: cap.minR,
        }
      : null,
    fuel: state.fuel,
    highWaterY: state.highWaterY,
    held,
    lastGrab: state.telemetry.lastGrab ? { ...state.telemetry.lastGrab } : null,
    ending: { ...state.ending },
  };
}

/** Interpolate position and velocity between two ticks. */
export function lerpSnapshot(a: RenderSnapshot, b: RenderSnapshot, t: number): RenderSnapshot {
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vx: a.vx + (b.vx - a.vx) * t,
    vy: a.vy + (b.vy - a.vy) * t,
  };
}
