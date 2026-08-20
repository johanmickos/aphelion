/**
 * The capture trace recorder — the project's primary debugging asset.
 *
 * Every sample is addressed by integer tick; wall-clock time never enters. A
 * display time is derived as `tick * dt` when a trace is rendered.
 */
import type { SimState } from './types.ts';
import { hypot } from './orbit.ts';

/** Per-sample deflection above this is a visible kink — the key smoothness metric. */
export const KINK_THRESHOLD_DEG = 15;

export interface TraceSample {
  tick: number;
  r: number;
  spd: number;
  defl: number;
  phase: string;
  fuel: number;
  peri: number;
  apo: number;
  pmul: number;
  kink: boolean;
}

export interface TraceSummary {
  samples: number;
  maxDefl: number;
  kinks: number;
  minR: number;
  maxR: number;
  finalPhase: string;
  finalFuel: number;
}

export class TraceRecorder {
  private samples: TraceSample[] = [];
  private readonly limit: number;

  constructor(limit = 5000) {
    this.limit = limit;
  }

  reset(): void {
    this.samples = [];
  }

  record(state: SimState): void {
    const cap = state.capture;
    if (!cap) return;
    this.samples.push({
      tick: state.tick,
      r: hypot(cap.rx, cap.ry),
      spd: hypot(cap.vx, cap.vy),
      defl: cap.defl,
      phase: cap.phase,
      fuel: state.fuel,
      peri: cap.periR,
      apo: cap.apoR,
      pmul: cap.phaseMul,
      kink: cap.defl > KINK_THRESHOLD_DEG,
    });
    if (this.samples.length > this.limit) this.samples.shift();
  }

  all(): readonly TraceSample[] {
    return this.samples;
  }

  summarize(): TraceSummary | null {
    if (this.samples.length === 0) return null;
    const last = this.samples[this.samples.length - 1]!;
    let maxDefl = 0;
    let minR = Infinity;
    let maxR = 0;
    let kinks = 0;
    for (const s of this.samples) {
      if (s.defl > maxDefl) maxDefl = s.defl;
      if (s.r < minR) minR = s.r;
      if (s.r > maxR) maxR = s.r;
      if (s.kink) kinks++;
    }
    return {
      samples: this.samples.length,
      maxDefl,
      kinks,
      minR,
      maxR,
      finalPhase: last.phase,
      finalFuel: last.fuel,
    };
  }
}
