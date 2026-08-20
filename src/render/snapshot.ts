/**
 * What the renderer needs from the simulation, sampled per tick and interpolated
 * per frame. Keeping this narrow is what stops rendering from reaching into sim
 * internals and re-deriving things the sim already computed.
 */
import type { CapturePhase, EndingReason, SimState } from '../sim/types.ts';

export interface RenderSnapshot {
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
  } | null;
  fuel: number;
  held: boolean;
  ending: { active: boolean; t: number; x: number; y: number; reason: EndingReason };
}

export function captureSnapshot(state: SimState, held: boolean): RenderSnapshot {
  const cap = state.capture;
  const b = cap ? state.bodies[cap.planet]! : null;
  return {
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
        }
      : null,
    fuel: state.fuel,
    held,
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
