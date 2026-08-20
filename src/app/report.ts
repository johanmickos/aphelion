/**
 * The diagnostics report: everything needed to re-run a session elsewhere.
 *
 * Config is stored as a *diff* against DEFAULT_CONFIG, so the common case costs
 * nothing and any tuning the player changed is explicit. Nothing here is a
 * recording of what happened — it is the recipe that produces it.
 */
import type { SimConfig } from '../sim/config.ts';
import { DEFAULT_CONFIG, FIXED_DT, SIM_VERSION } from '../sim/config.ts';
import type { Checkpoint, InputRecord, Marker, RunRecorder } from './recorder.ts';

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
  ticks: number;
  input: InputRecord[];
  marks: Marker[];
  checks: Checkpoint[];
  checksTruncated: boolean;
  note: string;
}

/** Keys where two configs disagree, with both values. */
export function configDelta(
  a: SimConfig,
  b: SimConfig,
): Array<{ key: string; theirs: number; ours: number }> {
  const out: Array<{ key: string; theirs: number; ours: number }> = [];
  const ar = a as unknown as Record<string, number>;
  const br = b as unknown as Record<string, number>;
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
}): DiagReport {
  return {
    aphelion: REPORT_SCHEMA,
    at: new Date().toISOString(),
    dt: FIXED_DT,
    seed: args.seed,
    device: args.device,
    config: { ...args.config },
    simVersion: SIM_VERSION,
    ticks: args.ticks,
    input: args.recorder.input,
    marks: args.recorder.markers,
    checks: args.recorder.checkpoints,
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

/** The exact config a session ran with — carried in full, so nothing is inferred. */
export function configFromReport(r: DiagReport): SimConfig {
  return r.config;
}

/** True when the report was produced by a different build of the simulation. */
export function isStale(r: DiagReport): boolean {
  return r.simVersion !== SIM_VERSION || configDelta(r.config, DEFAULT_CONFIG).length > 0;
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
