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
import { hypot } from './orbit.ts';

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
    phase: cap
      ? cap.phase
      : state.ending.active
        ? // 'crash' is the prototype's wire value for an impact; keep it so the
          // equality gate keeps comparing like for like.
          state.ending.reason === 'impact'
          ? 'crash'
          : state.ending.reason
        : 'drift',
    r: cap ? hypot(cap.rx, cap.ry) : null,
  };
}

/** A complete state snapshot, for rewind and for diagnostics. */
export function serialize(state: SimState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SimState {
  return JSON.parse(json) as SimState;
}

/**
 * A 32-bit fingerprint of the exact simulation state.
 *
 * Hashes the raw IEEE-754 bits, not rounded values, so any divergence at all
 * shows up. Its job is to let a replay prove it reproduced what the player
 * actually experienced: if a report's checkpoints match, the replay is the same
 * run, and any analysis done on it is trustworthy.
 */
export function fingerprint(state: SimState): number {
  const cap = state.capture;
  const f = new Float64Array([
    state.tick,
    state.ship.x,
    state.ship.y,
    state.ship.vx,
    state.ship.vy,
    state.ship.burstX,
    state.ship.burstY,
    state.fuel,
    state.ending.active ? 1 : 0,
    state.ending.t,
    cap ? 1 : 0,
    cap ? cap.rx : 0,
    cap ? cap.ry : 0,
    cap ? cap.vx : 0,
    cap ? cap.vy : 0,
    cap ? cap.theta : 0,
    cap ? cap.settleT : 0,
    cap ? cap.boost : 0,
    cap ? (PHASE_ORDINAL[cap.phase] ?? -1) : -1,
  ]);
  const u = new Uint32Array(f.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    h ^= u[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const PHASE_ORDINAL: Record<string, number> = {
  clear: 0,
  flyby: 1,
  settle: 2,
  orbit: 3,
};

export function fingerprintHex(state: SimState): string {
  return fingerprint(state).toString(16).padStart(8, '0');
}
