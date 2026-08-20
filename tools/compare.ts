/** Diffs a scenario between the prototype and the port. Used by the gate and by hand. */
import type { TrajectorySample } from '../src/sim/serialize.ts';

export interface Divergence {
  tick: number;
  field: string;
  proto: number | string | null;
  port: number | string | null;
  delta: number;
}

export interface CompareResult {
  maxPositionDelta: number;
  maxVelocityDelta: number;
  maxFuelDelta: number;
  phaseMismatches: number;
  first: Divergence | null;
}

export function compare(
  proto: readonly TrajectorySample[],
  port: readonly TrajectorySample[],
  eps: number,
): CompareResult {
  const res: CompareResult = {
    maxPositionDelta: 0,
    maxVelocityDelta: 0,
    maxFuelDelta: 0,
    phaseMismatches: 0,
    first: null,
  };
  const n = Math.min(proto.length, port.length);
  for (let i = 0; i < n; i++) {
    const a = proto[i]!;
    const b = port[i]!;
    const dp = Math.hypot(a.x - b.x, a.y - b.y);
    const dv = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    const df = Math.abs(a.fuel - b.fuel);
    if (dp > res.maxPositionDelta) res.maxPositionDelta = dp;
    if (dv > res.maxVelocityDelta) res.maxVelocityDelta = dv;
    if (df > res.maxFuelDelta) res.maxFuelDelta = df;
    if (a.phase !== b.phase) {
      res.phaseMismatches++;
      if (!res.first)
        res.first = { tick: a.tick, field: 'phase', proto: a.phase, port: b.phase, delta: NaN };
    }
    if (!res.first && dp > eps)
      res.first = { tick: a.tick, field: 'position', proto: a.x, port: b.x, delta: dp };
  }
  return res;
}
