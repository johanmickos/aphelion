/**
 * State serialisation for goldens, replays and diagnostics.
 *
 * Full precision, no rounding. The prototype's trace rounded times to 5 decimals
 * and indexed events by time; the rounded value was slightly *larger* than the
 * true step time, so replays comparing `t >= e.t` fired one step late and six
 * scenarios diverged in a way that read exactly like a physics bug. Everything
 * here is addressed by integer tick. See docs/PORT_NOTES.md note 5.
 */
import type { SimState } from './types.ts';
import { shipVelocity, shipWorldPos } from './step.ts';

/** One tick of trajectory, at full precision. The unit the equality gate compares. */
export interface TrajectorySample {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  phase: string;
  /** Radius from the anchor body, or null while drifting. */
  r: number | null;
}

export function sampleTrajectory(state: SimState): TrajectorySample {
  const pos = shipWorldPos(state);
  const vel = shipVelocity(state);
  const cap = state.capture;
  return {
    tick: state.tick,
    x: pos.x,
    y: pos.y,
    vx: vel.vx,
    vy: vel.vy,
    fuel: state.fuel,
    phase: cap ? cap.phase : state.crash.active ? 'crash' : 'drift',
    r: cap ? Math.hypot(cap.rx, cap.ry) : null,
  };
}

/** A complete state snapshot, for rewind and for diagnostics. */
export function serialize(state: SimState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SimState {
  return JSON.parse(json) as SimState;
}
