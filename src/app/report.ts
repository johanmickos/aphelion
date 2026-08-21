/**
 * The diagnostics report: everything needed to re-run a session elsewhere.
 *
 * Config is stored as a *diff* against DEFAULT_CONFIG, so the common case costs
 * nothing and any tuning the player changed is explicit. Nothing here is a
 * recording of what happened — it is the recipe that produces it.
 */
import type { SimConfig } from '../sim/config.ts';
import { FIXED_DT, PROTOTYPE_CONFIG, SIM_VERSION } from '../sim/config.ts';
import type { AwardRecord, Checkpoint, InputRecord, Marker, RunRecorder } from './recorder.ts';

export const REPORT_SCHEMA = 3;

export interface DiagReport {
  aphelion: number;
  at: string;
  dt: number;
  /** Render RNG seed. Does not affect the simulation; reproduces the starfield. */
  seed: number;
  device: { w: number; h: number; dpr: number; ua: string };
  /**
   * The FULL config the session ran with.
   *
   * Deliberately not a diff: a diff is taken against whatever DEFAULT_CONFIG the
   * *client* had, so it reads empty however far the replaying source has moved.
   * That made version skew invisible and, worse, made it look like the
   * simulation had become non-deterministic. A report has to be self-describing.
   */
  config: SimConfig;
  /** Simulation behaviour version, for detecting skew the config cannot show. */
  simVersion: number;
  /**
   * When the page was loaded, ISO.
   *
   * `simVersion` and `config` describe the SIMULATION the session ran, and say
   * nothing about the build around it. A session played on a bundle from before
   * a HUD or scoring change is indistinguishable in a report from one played
   * after it — which turned "the praise word never appeared" into a question no
   * report could answer. This one is answerable: compare it against when the
   * feature shipped.
   *
   * Optional, because adding it is not a reason to make every report already on
   * disk unreadable. Absent means the report predates the field.
   */
  loadedAt?: string;
  ticks: number;
  input: InputRecord[];
  marks: Marker[];
  checks: Checkpoint[];
  checksTruncated: boolean;
  /**
   * Every scoring event exactly as the phone paid it.
   *
   * Optional, for the same reason `loadedAt` is: adding a field is not a reason
   * to make every report already on disk unreadable. Absent means the report
   * predates it, and a replay falls back to recomputing — which is what it always
   * did.
   *
   * Present, it is the score TRUTH: a diverged replay recomputes a different
   * session's awards, and this list is the one the player actually saw. See
   * `AwardRecord`.
   */
  awards?: AwardRecord[];
  note: string;
}

/** Keys where two configs disagree, with both values. */
export function configDelta(
  a: SimConfig,
  b: SimConfig,
): Array<{ key: string; theirs: number | boolean; ours: number | boolean }> {
  const out: Array<{ key: string; theirs: number | boolean; ours: number | boolean }> = [];
  const ar = a as unknown as Record<string, number | boolean>;
  const br = b as unknown as Record<string, number | boolean>;
  for (const k of new Set([...Object.keys(ar), ...Object.keys(br)])) {
    if (ar[k] !== br[k]) out.push({ key: k, theirs: ar[k]!, ours: br[k]! });
  }
  return out;
}

export function buildReport(args: {
  recorder: RunRecorder;
  config: SimConfig;
  seed: number;
  ticks: number;
  note: string;
  device: { w: number; h: number; dpr: number; ua: string };
  /** When the page was loaded. See `DiagReport.loadedAt`. */
  loadedAt?: string;
}): DiagReport {
  return {
    aphelion: REPORT_SCHEMA,
    at: new Date().toISOString(),
    ...(args.loadedAt ? { loadedAt: args.loadedAt } : {}),
    dt: FIXED_DT,
    seed: args.seed,
    device: args.device,
    config: { ...args.config },
    simVersion: SIM_VERSION,
    ticks: args.ticks,
    input: args.recorder.input,
    marks: args.recorder.markers,
    checks: args.recorder.checkpoints,
    awards: args.recorder.awards,
    checksTruncated: args.recorder.checkpointsTruncated,
    note: args.note,
  };
}

/** Compact single-line JSON — this gets pasted into a chat window. */
export function serializeReport(r: DiagReport): string {
  return JSON.stringify(r);
}

export function parseReport(text: string): DiagReport {
  const r = JSON.parse(text) as DiagReport;
  if (r.aphelion !== REPORT_SCHEMA) {
    throw new Error(
      `report schema ${r.aphelion}, expected ${REPORT_SCHEMA}. ` +
        (r.aphelion < REPORT_SCHEMA
          ? 'Schema 1 stored only a config diff against the client, so its session config ' +
            'cannot be recovered and a replay of it would be guesswork. Reload the device ' +
            'and capture a fresh report.'
          : 'This report is newer than this build.'),
    );
  }
  return r;
}

/**
 * The config a session ran with, carried in full so nothing is inferred.
 *
 * Keys added after the report was recorded are the one exception, and they are
 * filled from PROTOTYPE_CONFIG rather than the current defaults. That is not a
 * guess: every new key goes in as a flag that is off in PROTOTYPE_CONFIG and on
 * in DEFAULT_CONFIG (see the config split in AGENTS.md), so the prototype value
 * IS what the code did before the key existed. Filling from DEFAULT_CONFIG would
 * replay an old session under new behaviour and quietly call it faithful; leaving
 * the key `undefined` is worse still, because arithmetic on it yields NaN and a
 * comparison against NaN fails silently in whichever direction the code happens
 * to be written.
 */
export function configFromReport(r: DiagReport): SimConfig {
  return { ...PROTOTYPE_CONFIG, ...r.config };
}

export interface ReportSummary {
  seconds: number;
  grabs: number;
  marks: number;
}

export function summarize(r: DiagReport): ReportSummary {
  return {
    seconds: r.ticks * r.dt,
    grabs: r.input.filter(([, k]) => k === 1).length,
    marks: r.marks.length,
  };
}
