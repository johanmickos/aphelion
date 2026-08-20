/**
 * Replay and analysis, shared by the CLI (`tools/replay.ts`) and the dev-server
 * endpoint that receives reports from a phone.
 *
 * Verification comes first and is not optional: a replay that cannot reproduce
 * the session's checkpoints is not evidence of anything, so the analysis says so
 * loudly rather than quietly presenting numbers from a different run.
 */
import { configDelta, configFromReport, summarize } from '../src/app/report.ts';
import { DEFAULT_CONFIG, SIM_VERSION } from '../src/sim/config.ts';
import type { DiagReport } from '../src/app/report.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { fingerprintHex } from '../src/sim/serialize.ts';
import { KINK_THRESHOLD_DEG } from '../src/sim/trace.ts';
import { fieldBounds } from '../src/sim/world.ts';
import type { Input, SimState } from '../src/sim/types.ts';

export interface Frame {
  tick: number;
  phase: string;
  x: number;
  y: number;
  speed: number;
  r: number | null;
  fuel: number;
  defl: number;
  boost: number;
  tightness: number;
  /** First sample after a grab: its deflection is a measurement artifact. */
  firstOfCapture: boolean;
  clearance: number | null;
  /** Floor clamps accumulated so far this session. */
  floorTotal: number;
  fp: string;
}

/** Something the player could not see, surfaced from telemetry. */
export interface Event {
  tick: number;
  text: string;
}

/** How closely the replay reproduced the recorded session. */
export type Fidelity = 'exact' | 'close' | 'drifted' | 'diverged' | 'unverifiable';

export interface Analysis {
  fidelity: Fidelity;
  /** Checkpoints matching bit-for-bit (same engine). */
  exactMatches: number;
  total: number;
  /** Largest position difference at any checkpoint, in world px. */
  maxDelta: number;
  /** Tick where the phase disagreed, if any — the loudest kind of divergence. */
  phaseMismatch: { tick: number; want: string; got: string } | null;
  findings: string[];
  events: Event[];
  frames: Frame[];
}

/**
 * Positional tolerance, in world pixels.
 *
 * Checkpoints store two decimal places, so ~0.007px of the measured difference is
 * always just that rounding.
 *
 * Cross-engine float differences accumulate through the chaotic parts of orbital
 * motion. Measured between JavaScriptCore and V8 on a real 30-second session: 0px
 * through drift, growing to ~5.6px after several captures. Under this bound the
 * qualitative behaviour is the same run; above it, treat detail with suspicion.
 */
export const CLOSE_PX = 2;
export const DRIFT_PX = 40;

export function replayReport(report: DiagReport): Analysis {
  const cfg = configFromReport(report);
  const edges = new Map(report.input);
  const state: SimState = createInitialState(cfg);
  const field = fieldBounds(cfg, state.bodies);
  const frames: Frame[] = [];
  const events: Event[] = [];
  let held = false;
  let firstOfCapture = true;
  let lastGrabTick = -1;
  let floorRunStart = -1;
  let prevFloorTotal = 0;

  for (let tick = 0; tick < report.ticks; tick++) {
    const e = edges.get(tick);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    const input: Input = { held: held || pressed, pressed, released };
    stepSim(state, cfg, input, report.dt);

    const p = shipWorldPos(state);
    const cap = state.capture;
    const isFirst = cap ? firstOfCapture : false;
    firstOfCapture = !cap;

    // --- events the player experienced but could not see
    const g = state.telemetry.lastGrab;
    if (g && g.tick !== lastGrabTick) {
      lastGrabTick = g.tick;
      if (g.result !== 'captured') {
        events.push({
          tick: g.tick,
          text:
            g.result === 'refused-crash-cone'
              ? 'GRAB REFUSED — inside the crash cone (too late to recover)'
              : g.result === 'refused-no-fuel'
                ? 'GRAB REFUSED — tank empty'
                : 'GRAB REFUSED — no body in range',
        });
      }
    }
    const touchingFloor = state.telemetry.floorSubstepsTotal > prevFloorTotal;
    prevFloorTotal = state.telemetry.floorSubstepsTotal;
    if (touchingFloor && floorRunStart < 0) floorRunStart = state.tick;
    if (!touchingFloor && floorRunStart >= 0) {
      const len = state.tick - floorRunStart;
      if (len >= 2) {
        events.push({
          tick: floorRunStart,
          text: `RODE THE MINIMUM-ORBIT FLOOR for ${len} ticks (${(len * report.dt).toFixed(2)}s) — this is what "stuck to the surface" looks like`,
        });
      }
      floorRunStart = -1;
    }
    frames.push({
      tick: state.tick,
      phase: cap ? cap.phase : state.ending.active ? state.ending.reason : 'drift',
      x: p.x,
      y: p.y,
      speed: cap ? Math.hypot(cap.vx, cap.vy) : Math.hypot(state.ship.vx, state.ship.vy),
      r: cap ? Math.hypot(cap.rx, cap.ry) : null,
      fuel: state.fuel,
      defl: cap ? cap.defl : 0,
      boost: cap ? cap.boost : 0,
      tightness: cap ? cap.tightness : 0,
      firstOfCapture: isFirst,
      clearance: cap ? Math.hypot(cap.rx, cap.ry) - cap.minR : null,
      floorTotal: state.telemetry.floorSubstepsTotal,
      fp: fingerprintHex(state),
    });
  }

  const byTick = new Map(frames.map((f) => [f.tick, f]));
  let exactMatches = 0;
  let maxDelta = 0;
  let phaseMismatch: Analysis['phaseMismatch'] = null;
  for (const [tick, fp, x, y, , , , phase] of report.checks) {
    const f = byTick.get(tick);
    if (!f) continue;
    if (f.fp === fp) exactMatches++;
    maxDelta = Math.max(maxDelta, Math.hypot(f.x - x, f.y - y));
    if (f.phase !== phase && !phaseMismatch) {
      phaseMismatch = { tick, want: phase, got: f.phase };
    }
  }

  let fidelity: Fidelity;
  if (report.checks.length === 0) fidelity = 'unverifiable';
  else if (exactMatches === report.checks.length) fidelity = 'exact';
  else if (phaseMismatch || maxDelta > DRIFT_PX) fidelity = 'diverged';
  else if (maxDelta <= CLOSE_PX) fidelity = 'close';
  else fidelity = 'drifted';

  // ---- automatic findings
  const findings: string[] = [];
  let firstKink: Frame | undefined;
  let kinks = 0;
  let minClear = Infinity;
  let dryTicks = 0;
  for (const f of frames) {
    // The first sample of a capture always reports ~160 degrees, because
    // lastAngle is seeded from the position angle (PORT_NOTES 6). Counting it
    // would put a phantom kink in every single report.
    if (f.defl > KINK_THRESHOLD_DEG && !f.firstOfCapture && f.r !== null) {
      kinks++;
      if (!firstKink) firstKink = f;
    }
    if (f.fuel <= 0.5) dryTicks++;
    if (f.clearance !== null) minClear = Math.min(minClear, f.clearance);
  }

  const ends = frames.filter(
    (f, i) =>
      (f.phase === 'crash' || f.phase === 'out-of-bounds') && frames[i - 1]?.phase !== f.phase,
  );
  if (ends.length) {
    findings.push(
      `${ends.length} run(s) ended: ` +
        ends.map((e) => `${e.phase} at t=${(e.tick * report.dt).toFixed(1)}s`).join(', '),
    );
  }
  if (kinks > 0 && firstKink) {
    findings.push(
      `${kinks} kink(s) over ${KINK_THRESHOLD_DEG}°; first is ${firstKink.defl.toFixed(0)}° ` +
        `in ${firstKink.phase} at tick ${firstKink.tick}`,
    );
  } else {
    findings.push('no kinks — every capture stayed smooth');
  }
  if (minClear !== Infinity && minClear < 0.5) {
    findings.push(
      `reached the minimum-orbit floor (clearance ${minClear.toFixed(1)}px) — expect a floor bounce`,
    );
  }
  if (dryTicks > 0) {
    findings.push(`fuel was at or below empty for ${(dryTicks * report.dt).toFixed(1)}s`);
  }
  findings.push(
    `field ${field.width.toFixed(0)} wide · closest approach above the orbit floor ` +
      `${minClear === Infinity ? 'n/a (never captured)' : minClear.toFixed(1) + 'px'}`,
  );

  if (state.telemetry.putterOuts > 0) {
    findings.push(
      `${state.telemetry.putterOuts} capture(s) ran dry mid-circularisation and puttered out`,
    );
  }
  if (state.telemetry.floorSubstepsTotal > 0) {
    findings.push(
      `floor clamp engaged on ${state.telemetry.floorSubstepsTotal} substeps ` +
        `(${(state.telemetry.floorSubstepsTotal / cfg.SUB).toFixed(0)} ticks of riding the minimum orbit)`,
    );
  }

  return {
    fidelity,
    exactMatches,
    total: report.checks.length,
    maxDelta,
    phaseMismatch,
    findings,
    events,
    frames,
  };
}

/** Human-readable analysis, for a terminal. */
export function formatAnalysis(report: DiagReport, a: Analysis): string[] {
  const s = summarize(report);
  const out: string[] = [];
  out.push('');
  out.push('  APHELION — replay');
  out.push('  ' + '─'.repeat(72));
  out.push(`  recorded   ${report.at}`);
  out.push(`  device     ${report.device.w}x${report.device.h} @${report.device.dpr}x`);
  out.push(`  session    ${s.seconds.toFixed(1)}s · ${report.ticks} ticks · ${s.grabs} grabs`);
  const delta = configDelta(report.config, DEFAULT_CONFIG);
  out.push(
    `  config     ${delta.length ? `${delta.length} value(s) differ from current defaults` : 'matches current defaults'}`,
  );
  const skewed = report.simVersion !== SIM_VERSION || delta.length > 0;
  if (skewed) {
    out.push('');
    out.push('  ⚠ THIS REPORT CAME FROM A DIFFERENT BUILD');
    if (report.simVersion !== SIM_VERSION) {
      out.push(`      simVersion ${report.simVersion} recorded, ${SIM_VERSION} here`);
    }
    for (const d of delta) {
      out.push(`      ${d.key}: session ran ${d.theirs}, current default is ${d.ours}`);
    }
    out.push("      The replay below uses the session's own config, so it is still");
    out.push('      valid — but if checkpoints diverge, suspect the code difference');
    out.push('      before suspecting the simulation.');
  }
  if (report.note) out.push(`  note       ${report.note}`);
  out.push('');

  const px = a.maxDelta.toFixed(2);
  switch (a.fidelity) {
    case 'unverifiable':
      out.push('  ⚠ no checkpoints in this report — the replay cannot be verified');
      break;
    case 'exact':
      out.push(`  ✓ replay is EXACT — all ${a.total} checkpoints match bit for bit`);
      break;
    case 'close':
      out.push(
        `  ✓ replay is FAITHFUL — max position difference ${px}px over ${a.total} checkpoints`,
      );
      out.push(
        `      ${a.exactMatches}/${a.total} bit-exact; the rest differ only by floating-point`,
      );
      out.push('      rounding between the recording engine and this one. Detail is trustworthy.');
      break;
    case 'drifted':
      out.push(`  ~ replay DRIFTED — max position difference ${px}px`);
      out.push('      Same decisions, slightly different numbers: cross-engine float rounding');
      out.push('      compounds through captures. Phases and events are reliable; exact');
      out.push('      positions late in the session are not.');
      break;
    case 'diverged':
      out.push(`  ✗ replay DIVERGED — max position difference ${px}px`);
      if (a.phaseMismatch) {
        out.push(
          `      phase disagrees at tick ${a.phaseMismatch.tick}: ` +
            `recorded "${a.phaseMismatch.want}", replay "${a.phaseMismatch.got}"`,
        );
      }
      if (skewed)
        out.push(
          '      The report is from a different build (see above) — that is the likely cause.',
        );
      else out.push('      Same build and config, so this is real: the run took a different path.');
      break;
  }
  if (report.checksTruncated) out.push('      (early checkpoints were dropped by the recorder)');
  out.push('');
  out.push('  findings');
  for (const f of a.findings) out.push(`    · ${f}`);
  out.push('');

  if (a.events.length) {
    out.push('  events (things that happened but were never shown on screen)');
    for (const e of a.events.slice(0, 24)) {
      out.push(`    t=${String(e.tick).padStart(5)}  ${e.text}`);
    }
    if (a.events.length > 24) out.push(`    ... and ${a.events.length - 24} more`);
    out.push('');
  }

  if (report.marks.length === 0) {
    out.push('  no flagged moments in this report');
  } else {
    for (const [tick, note] of report.marks) {
      out.push(
        `  ⚑ flagged tick ${tick} (t=${(tick * report.dt).toFixed(2)}s)${note ? ' — ' + note : ''}`,
      );
      out.push('    tick   phase             r   speed   fuel   defl  boost  tight');
      const lo = Math.max(0, tick - 30);
      const hi = Math.min(a.frames.length - 1, tick + 30);
      for (let i = lo; i <= hi; i += 5) {
        const f = a.frames[i];
        if (!f) continue;
        out.push(
          `    ${String(f.tick).padStart(5)}  ${f.phase.padEnd(13)}` +
            `${(f.r === null ? '—' : f.r.toFixed(0)).padStart(5)}  ` +
            `${f.speed.toFixed(0).padStart(6)}  ${f.fuel.toFixed(0).padStart(5)}  ` +
            `${f.defl.toFixed(1).padStart(5)}  ${f.boost.toFixed(0).padStart(5)}  ` +
            `${f.tightness.toFixed(2).padStart(5)}${f.tick === tick ? ' ◀' : ''}`,
        );
      }
      out.push('');
    }
  }
  return out;
}
