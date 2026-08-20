/**
 * Records everything needed to reproduce a play session exactly.
 *
 * Because the simulation is deterministic, a session is fully described by
 * `(config, seed, inputLog)` — so this records a *recipe*, not a recording. A
 * ten-minute session is a few kilobytes, which is what makes it practical to
 * copy off a phone and paste into a conversation.
 *
 * Checkpoints are state fingerprints taken at intervals. They are not needed to
 * replay; they are how a replay proves it reproduced the same run rather than a
 * plausible-looking different one.
 */
import type { SimState } from '../sim/types.ts';
import { fingerprintHex } from '../sim/serialize.ts';
import { shipVelocity, shipWorldPos } from '../sim/step.ts';

/** [tick, 1 = press, 0 = release] */
export type InputRecord = [number, 0 | 1];
/**
 * [tick, fingerprint, x, y, vx, vy, fuel, phase]
 *
 * The fingerprint gives an exact match when the replay runs on the same
 * JavaScript engine. It cannot when it does not: `Math.hypot`, `atan2`, `sin`
 * and `cos` are not required to be correctly rounded, and JavaScriptCore and V8
 * genuinely disagree — measured at 36% of inputs for `hypot` alone. So the raw
 * values travel too, and a cross-engine replay is verified against them within a
 * tolerance instead. See docs/PORT_NOTES.md note 15.
 */
export type Checkpoint = [number, string, number, number, number, number, number, string];
/** [tick, note] — the player flagging a moment that felt wrong. */
export type Marker = [number, string];

export interface RecorderOptions {
  /** Ticks between checkpoints. */
  checkpointEvery: number;
  /** Keep at most this many checkpoints (the most recent ones). */
  maxCheckpoints: number;
  maxMarkers: number;
}

export const DEFAULT_RECORDER_OPTIONS: RecorderOptions = {
  checkpointEvery: 60,
  maxCheckpoints: 300,
  maxMarkers: 40,
};

export class RunRecorder {
  readonly input: InputRecord[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly markers: Marker[] = [];
  private readonly opts: RecorderOptions;
  /** True once checkpoints have been dropped, so a report can say so. */
  private truncated = false;

  constructor(opts: RecorderOptions = DEFAULT_RECORDER_OPTIONS) {
    this.opts = opts;
  }

  /** Call with the edges applied on this tick, before stepping. */
  recordInput(tick: number, pressed: boolean, released: boolean): void {
    if (pressed) this.input.push([tick, 1]);
    if (released) this.input.push([tick, 0]);
  }

  /** Call after stepping. */
  recordTick(state: SimState): void {
    if (state.tick % this.opts.checkpointEvery !== 0) return;
    const p = shipWorldPos(state);
    const v = shipVelocity(state);
    const r2 = (n: number): number => Math.round(n * 100) / 100;
    this.checkpoints.push([
      state.tick,
      fingerprintHex(state),
      r2(p.x),
      r2(p.y),
      r2(v.vx),
      r2(v.vy),
      Math.round(state.fuel * 10) / 10,
      state.capture ? state.capture.phase : state.ending.active ? state.ending.reason : 'drift',
    ]);
    if (this.checkpoints.length > this.opts.maxCheckpoints) {
      this.checkpoints.shift();
      this.truncated = true;
    }
  }

  /** The player flagged this moment. */
  mark(tick: number, note = ''): void {
    if (this.markers.length >= this.opts.maxMarkers) this.markers.shift();
    this.markers.push([tick, note]);
  }

  get checkpointsTruncated(): boolean {
    return this.truncated;
  }

  clearMarkers(): void {
    this.markers.length = 0;
  }
}
