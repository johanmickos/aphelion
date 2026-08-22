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
import type { ScoreAward } from '../score/types.ts';
import { fingerprintHex } from '../sim/serialize.ts';
import { shipVelocity, shipWorldPos } from '../sim/step.ts';

/** [tick, 1 = press, 0 = release] */
export type InputRecord = [number, 0 | 1];

/**
 * One scoring event exactly as the phone paid it.
 *
 * `[tick, kind, points, mult, close, clearance, skim, defl, timing, aim, climb, body]`
 * with `kind` 'g' for a grab, 'l' for a link and 'h' for a hop.
 *
 * WHY THIS IS RECORDED AT ALL, when a score is a pure function of
 * (config, seed, inputLog) and a replay can recompute it: because in practice
 * the replay increasingly cannot. `sin`, `cos` and `atan2` are still
 * implementation-approximated (PORT_NOTES 15-16 replaced only `Math.hypot`), the
 * phase clock calls them every tick of a settle, and a capture amplifies the
 * difference — so a long unbroken chain forks. Measured across five sessions on
 * one build, the trustworthy prefix fell to 2.0s of a 41.7s run, and past it the
 * replay does not merely go quiet: it reports deaths that never happened.
 *
 * Recomputed awards are therefore evidence about the REPLAY. These are evidence
 * about the SESSION, and they stay true however far the trajectory drifted —
 * which is what lets the scoring be calibrated while the trig is still wrong.
 *
 * They are also a much finer fidelity signal than checkpoints: an award lands at
 * every grab and every release rather than on a fixed interval, so comparing the
 * two lists localises a divergence to the capture that caused it.
 */
export type AwardRecord = [
  number,
  'g' | 'l' | 'h',
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
];
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
  /** Keep at most this many awards (the most recent ones). */
  maxAwards: number;
}

/**
 * 20 ticks, not 60.
 *
 * Checkpoints began as a way to PROVE a replay reproduced the run, and at that
 * job one per second is ample. They are now also the only trustworthy account of
 * a session whose replay diverged, and at that job one per second is not: a death
 * holds for `crashPause` 0.7s = 42 ticks, which is less than a 60-tick gap, so a
 * whole death and respawn could pass between two samples and leave no trace. That
 * is not hypothetical — one recorded session showed a single unbroken life at 1Hz
 * while its replay claimed three deaths, and only a fuel jump to 100 and a
 * 5,153px position jump gave away that a real one had happened at all.
 *
 * 20 rather than 30 — 30 would already guarantee a death is sampled at least once
 * — because the fuel and phase traces are read as traces, and at 3Hz a capture is
 * legible in them rather than merely present.
 *
 * `maxCheckpoints` is then set by the size budget, not by taste: checkpoints cost
 * about 57 bytes each and `test/diagnostics.test.ts` holds a ten-minute report
 * under 40KB so it can still be pasted out of a phone. 320 lands that worst case
 * at 35KB, and covers 107 seconds before the oldest start being dropped — longer
 * than any session recorded so far, and the ones dropped are the oldest, which is
 * the right bias when the interesting part is where the run ended.
 */
export const DEFAULT_RECORDER_OPTIONS: RecorderOptions = {
  checkpointEvery: 20,
  maxCheckpoints: 320,
  maxMarkers: 40,
  maxAwards: 300,
};

export class RunRecorder {
  readonly input: InputRecord[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly markers: Marker[] = [];
  readonly awards: AwardRecord[] = [];
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

  /** Call with whatever `scoreTick` paid on this tick. */
  recordAwards(awards: readonly ScoreAward[]): void {
    // Two decimals on the 0..1 qualities and whole numbers elsewhere: these are
    // read as distributions across a session, and the digits below that are
    // report size rather than information.
    const q = (n: number): number => Math.round(n * 100) / 100;
    for (const a of awards) {
      this.awards.push([
        a.tick,
        a.kind === 'grab' ? 'g' : a.kind === 'link' ? 'l' : 'h',
        Math.round(a.points),
        q(a.multiplier),
        q(a.close),
        Math.round(a.clearance),
        Math.round(a.skim),
        Math.round(a.defl),
        q(a.timing),
        q(a.aim),
        Math.round(a.climb),
        a.body,
      ]);
      if (this.awards.length > this.opts.maxAwards) {
        this.awards.shift();
        this.truncated = true;
      }
    }
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
