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
import type { SimConfig } from '../src/sim/config.ts';
import { KNOBS } from '../src/app/tune.ts';
import type { DiagReport } from '../src/app/report.ts';
import type { AwardRecord } from '../src/app/recorder.ts';
import { KINK_THRESHOLD_DEG, createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { fingerprintHex } from '../src/sim/serialize.ts';
import { fieldBounds } from '../src/sim/world.ts';
import { BODY_TYPES } from '../src/sim/bodies.ts';
import { courseOf } from '../src/sim/course.ts';
import type { GrabResult, Input, SimState } from '../src/sim/types.ts';
import { createScoreState, praiseFor, scoreTick } from '../src/score/index.ts';
import type { ScoreAward, ScoreState, Shout } from '../src/score/index.ts';

/** The keys the tune panel can move. A difference in one of these is a choice. */
const TUNED_KEYS = new Set<string>(KNOBS.map((k) => k.key));

/**
 * Keys the dev server always sets, which are therefore never build skew.
 *
 * Dev sessions are where diagnostics reports come from, so classifying one of
 * these as skew would raise "THIS REPORT CAME FROM A DIFFERENT BUILD" on every
 * report ever filed — which is exactly the crying-wolf failure the three-way
 * split was introduced to end.
 */
const DEV_KEYS = new Set<string>(['anomalyAtSpawn']);

/**
 * Keys the armed screen's course picker sets.
 *
 * A fifth meaning, and it needed one: choosing the short course is not a feel
 * tune, not a randomised field, and not a dev-server default — but it is also
 * emphatically not build skew, and leaving it unclassified would fire the banner
 * on every session played on it. The report says which course was flown, which is
 * something a reader wants to know anyway: sixty bodies and twelve are not the
 * same run, and a cadence figure from one says nothing about the other.
 */
export const COURSE_KEYS = new Set<string>(['bodyCount', 'anomalyCount']);

/**
 * Keys that USED to be config and are now data, mapped to what the data says now.
 *
 * A sixth meaning, and it needed one for the same reason the fifth did. Every
 * report ever filed stores a FULL config, so the six keys that described an
 * anomaly are in all sixty-seven of them. Deleting the keys without this would
 * have made every historical report announce six differences and cry "DIFFERENT
 * BUILD" — the crying-wolf failure this split exists to end, arriving for the
 * third time.
 *
 * IT IS NOT A BLANKET PARDON. The value is here so it can be COMPARED: a report
 * that ran the same number the table now holds changed nothing and is reported as
 * retired, while one that ran a different number really would replay differently,
 * because the table is not config and the replay cannot honour what the session
 * flew. That case is genuine skew and still says so.
 */
const RETIRED_KEYS = new Map<string, number>([
  ['anomalyOffset', BODY_TYPES.anomaly.wallOffset],
  ['anomalyBubble', BODY_TYPES.anomaly.traits.shelter],
  ['anomalyOrbitR', BODY_TYPES.anomaly.traits.authored!.orbitR],
  ['anomalyOrbitPeriod', BODY_TYPES.anomaly.traits.authored!.orbitPeriod],
  ['anomalyRefuel', BODY_TYPES.anomaly.traits.authored!.refuel],
  ['anomalySettleDur', BODY_TYPES.anomaly.traits.authored!.settleDur],
]);

/** A difference in a retired key that the body-type table still agrees with. */
function isRetired(key: string, theirs: number | boolean): boolean {
  return RETIRED_KEYS.get(key) === theirs;
}

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
  /**
   * Reentry heat this tick, 0..1 and 0 when nothing is alight.
   *
   * Recorded per frame because the question a burn report has to answer is not
   * how hot it got but how LONG it was lit — a flare of three ticks is invisible
   * however hot its peak, and the peak alone cannot say so.
   */
  burnHeat: number;
  /** Fraction of the charged window still running, 0 when none is. */
  chargedFrac: number;
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
  /**
   * The last checkpoint that still matched bit for bit, and the first that did
   * not.
   *
   * A diverged replay is not worthless, and saying only "diverged" throws away
   * the half of it that is perfectly good. Everything up to `lastExactTick` IS
   * the session that was played.
   */
  lastExactTick: number | null;
  firstDivergedTick: number | null;
  /** Phase at the first checkpoint that stopped matching. */
  firstDivergedPhase: string | null;
  findings: string[];
  events: Event[];
  frames: Frame[];
  /**
   * The score this session earned, recomputed here.
   *
   * A score is a pure function of (config, seed, inputLog), which is exactly what
   * a report carries — so this IS the score the phone showed, not an estimate of
   * it. When the fidelity above says `exact`, that is proof rather than a claim.
   */
  score: ScoreState;
  awards: ScoreAward[];
  /** Reckless shouts, which pay nothing and are not awards. */
  shouts: Shout[];
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

/** Exhaustive, so a new way for a press to take nothing cannot go unreported. */
const REFUSAL_TEXT: Record<Exclude<GrabResult, 'captured'>, string> = {
  // Not a refusal at all: in the run-in carpet a press bends the line instead of
  // reaching for a planet. Reported anyway, because a reader working out why a
  // press produced no capture needs to be told which of the two it was.
  carved: 'CARVED — a press inside the run-in carpet',
  'refused-crash-cone': 'GRAB REFUSED — inside the crash cone (too late to recover)',
  'refused-no-fuel': 'GRAB REFUSED — tank empty',
  'refused-out-of-range': 'GRAB REFUSED — out of reach',
  'refused-no-body': 'GRAB REFUSED — no body in range',
};
export const DRIFT_PX = 40;

export function replayReport(report: DiagReport): Analysis {
  const cfg = configFromReport(report);
  const edges = new Map(report.input);
  const state: SimState = createInitialState(cfg);
  const field = fieldBounds(cfg, state.bodies);
  const score = createScoreState();
  const awards: ScoreAward[] = [];
  const shouts: Shout[] = [];
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
    const scored = scoreTick(score, state, cfg, report.dt);
    awards.push(...scored.awards);
    shouts.push(...scored.shouts);

    const p = shipWorldPos(state);
    const cap = state.capture;
    const isFirst = cap ? firstOfCapture : false;
    firstOfCapture = !cap;

    // --- events the player experienced but could not see
    const g = state.telemetry.lastGrab;
    if (g && g.tick !== lastGrabTick) {
      lastGrabTick = g.tick;
      if (g.result !== 'captured') {
        events.push({ tick: g.tick, text: REFUSAL_TEXT[g.result] });
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
      burnHeat: score.burnHeat,
      chargedFrac: state.chargedT > 0 ? state.chargedT / cfg.chargedSecs : 0,
      floorTotal: state.telemetry.floorSubstepsTotal,
      fp: fingerprintHex(state),
    });
  }

  const byTick = new Map(frames.map((f) => [f.tick, f]));
  let exactMatches = 0;
  let maxDelta = 0;
  let phaseMismatch: Analysis['phaseMismatch'] = null;
  let lastExactTick: number | null = null;
  let firstDivergedTick: number | null = null;
  let firstDivergedPhase: string | null = null;
  for (const [tick, fp, x, y, , , , phase] of report.checks) {
    const f = byTick.get(tick);
    if (!f) continue;
    if (f.fp === fp) {
      exactMatches++;
      // Only while the run has never yet parted company: a state that matches
      // again after diverging is a coincidence or a respawn resetting both sides
      // to the same constants, not evidence the run in between was reproduced.
      if (firstDivergedTick === null) lastExactTick = tick;
    } else if (firstDivergedTick === null) {
      firstDivergedTick = tick;
      firstDivergedPhase = phase;
    }
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

  // `best`, not `score`: the score is the current LIFE's and resets on every
  // death, so at the final tick of a recording it is usually zero and says
  // nothing about how the session went.
  findings.push(
    `best life scored ${score.best} (${score.bank} standing at the end) — ` +
      `${score.grabs} arrival(s), ${score.links} link(s), ` +
      `${score.flybys} flyby(s), ${score.burns} burn(s), ` +
      `best multiplier x${Math.max(1, ...awards.map((a) => a.multiplier)).toFixed(2)}`,
  );
  if (score.burns > 0) {
    // The fire pays nothing directly any more — it selects the band the whole
    // carry cashes in — so what a finding can honestly report is how much of the
    // session was spent earning one, and how deep it got. Which band the swings
    // actually cashed at is on the award lines below.
    const captures = frames.filter((f, i) => f.r !== null && frames[i - 1]?.r == null).length;
    // How long the fire was actually lit is the number that matters and the one
    // that was missing: a flare has to survive long enough to be SEEN, and heat
    // just over the ignition floor clears it for only a frame or two.
    const hotTicks = frames.filter((f) => f.burnHeat > 0).length;
    const hottest = Math.max(0, ...frames.map((f) => f.burnHeat));
    findings.push(
      `${score.burns} burn(s) over ${captures} capture(s) — ` +
        `hottest ${hottest.toFixed(2)}, alight for ${hotTicks} tick(s) ` +
        `(${(hotTicks * report.dt).toFixed(2)}s of the session)`,
    );
    // Deliberately NOT an inference about visibility. It says how long the ship
    // was alight, which is what these ticks are. The flame outlives them by a wide
    // margin — the renderer's ember decay stretched a 7-tick pass to 77 frames on
    // a real session.
  }
  if (score.links > 0) {
    const links = awards.filter((a) => a.kind === 'link');
    const mean = (pick: (a: ScoreAward) => number): string =>
      (links.reduce((n, a) => n + pick(a), 0) / links.length).toFixed(2);
    findings.push(
      `release quality, averaged over ${links.length} link(s): ` +
        `boost peak ${mean((a) => a.timing)} · aim ${mean((a) => a.aim)}  (0-1 each) — ` +
        `tier x${mean((a) => a.tier)}, fire band x${mean((a) => a.band)}`,
    );
  }
  {
    // A charged window pays nothing directly — its hops step the chain instead —
    // so what there is to report is how much CARRY the frenzies built. Counted
    // off the state rather than off awards, since there are no hop awards to
    // count any more.
    const chargedTicks = frames.filter((f) => f.chargedFrac > 0).length;
    if (chargedTicks > 0) {
      findings.push(
        `${(chargedTicks * report.dt).toFixed(1)}s spent inside a charged window ` +
          `(${((100 * chargedTicks) / Math.max(1, frames.length)).toFixed(0)}% of the session)`,
      );
    }
  }

  if (shouts.length > 0) {
    const deepest = Math.max(...shouts.map((x) => x.streak));
    findings.push(`${shouts.length} reckless shout(s); longest run of rough captures: ${deepest}`);
  }
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
    lastExactTick,
    firstDivergedTick,
    firstDivergedPhase,
    findings,
    events,
    frames,
    score,
    awards,
    shouts,
  };
}

/** Human-readable analysis, for a terminal. */
/**
 * The awards the PHONE paid, rebuilt from the report.
 *
 * A recomputed award is only as good as the trajectory it was recomputed on, and
 * past a divergence that trajectory belongs to a different session. These do not
 * have that problem: they were written down as they were paid. Reports recorded
 * before the field existed return null and the caller falls back to recomputing,
 * which is what it always did.
 */
/**
 * The inverse of `AWARD_CODE` in `src/app/recorder.ts`.
 *
 * A table rather than a ternary chain, so an unrecognised letter cannot quietly
 * become whichever kind happened to be on the last branch — a report is the only
 * evidence a phone session leaves, and silently relabelling one of its awards is
 * the kind of error that reads as a scoring bug for an afternoon.
 */
const AWARD_KIND: Partial<Record<AwardRecord[1], ScoreAward['kind']>> = {
  l: 'link',
  f: 'flyby',
  d: 'mote',
};

/**
 * Codes that belonged to awards F04 deleted: grab, hop, burn, rescue.
 *
 * A report is the only evidence a phone session leaves behind, and every
 * recording in `diagnostics/` predates the constitution — so most of them carry
 * awards there is no longer a kind for. They are dropped rather than mapped onto
 * something else, and counted, so a reader is told the report is from the old
 * economy instead of quietly shown a shorter list.
 *
 * The right way to read one of those now: the FRAMES are still phone truth —
 * positions, velocity and fuel every 60 ticks off a fixed seed — and it is the
 * PRICES that no longer exist. See `AGENTS.md` on reading a diagnostics report.
 */
const RETIRED_CODES: ReadonlySet<string> = new Set(['g', 'h', 'b', 'r']);

/** How many recorded awards the last `recordedAwards` call dropped as retired. */
export let retiredAwardCount = 0;

export function recordedAwards(report: DiagReport): ScoreAward[] | null {
  if (!report.awards?.length) return null;
  retiredAwardCount = 0;
  const out: ScoreAward[] = [];
  for (const [
    tick,
    code,
    points,
    multiplier,
    close,
    clearance,
    skim,
    defl,
    timing,
    aim,
    climb,
    body,
    heat,
    turn,
    tier,
    band,
    carry,
    boostT,
    arrival,
  ] of report.awards) {
    const kind = AWARD_KIND[code];
    if (!kind) {
      if (RETIRED_CODES.has(code)) retiredAwardCount++;
      continue;
    }
    out.push({
      tick,
      kind,
      points,
      multiplier,
      // Absent from every report written before F04 stage (b), and from the first
      // session flown under it — the tuple was extended one build late. There is
      // no honest way to recover them from an ADDITIVE report: `multiplier` was
      // the streak alone, so it cannot be divided back into a tier and a band that
      // were never computed. 1 / 1 / 0 read as "unpriced", which is what an award
      // from that economy is.
      //
      // DO NOT REACH FOR `scratch/f04c-recover.ts` HERE, which an earlier version
      // of this comment recommended. It factorises `tier x band` out of the
      // multiplier, and `tierPerfect` 2 collides with the x2 band — so every
      // PERFECT in band 1 is indistinguishable from a tierless swing in band 2 and
      // gets dropped as ambiguous. It reported zero PERFECTs on a session that had
      // 17. Recompute the tier from `aim` / `timing` / `turn`, which the tuple
      // carries, and read the band off `heat`: a recorded peak of 0 means the bank
      // was 0 and the band was exactly x1. PORT_NOTES 76.
      tier: tier ?? 1,
      band: band ?? 1,
      carry: carry ?? 0,
      body,
      close,
      clearance,
      skim,
      defl,
      timing,
      aim,
      climb,
      // Appended after the field existed, so every report recorded before the
      // burn shipped is missing it. Zero is the truth for those: nothing burned,
      // because nothing could.
      heat: heat ?? 0,
      // Same again, one field later: reports from before the flyby turn gate end at
      // `heat`. Zero reads as "this pass turned nothing", which is wrong about
      // those sessions but is the only honest thing a missing field can say — and
      // nothing recomputes an award from it.
      turn: turn ?? 0,
      // And again, the newest field. `timing` cannot be inverted inside the
      // envelope's flat top, so this is the only thing that can say where in the
      // plateau a saturating release landed. Reports written before it end at
      // `carry`, and for those NaN is the honest reading rather than 0 — 0 is a
      // release at the periapsis freeze itself, which is a real and very
      // different thing, and calibrating the plateau on a pile of them is exactly
      // the mistake this field exists to prevent.
      boostT: boostT ?? NaN,
      // NaN for the same reason as `boostT`: 0 is a real arrival — a grab right
      // off the minimum-orbit ring is the tightest there is — so defaulting to it
      // would fill the distribution with phantom perfect grabs.
      arrival: arrival ?? NaN,
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * How far the recomputed awards tracked the recorded ones.
 *
 * A finer fidelity signal than checkpoints, because an award lands at every grab
 * and release rather than on a fixed interval: it names the capture where the
 * two accounts of the session part company.
 */
export function awardAgreement(
  recorded: readonly ScoreAward[],
  replayed: readonly ScoreAward[],
): { matched: number; firstDisagreement: number | null } {
  let matched = 0;
  for (let i = 0; i < Math.min(recorded.length, replayed.length); i++) {
    const r = recorded[i]!;
    const p = replayed[i]!;
    // Points are integers and the qualities are rounded to two places on the way
    // in, so the comparison is against the recorded precision, not exact floats.
    const same =
      r.tick === p.tick &&
      r.kind === p.kind &&
      r.points === Math.round(p.points) &&
      Math.abs(r.timing - Math.round(p.timing * 100) / 100) < 1e-9 &&
      Math.abs(r.aim - Math.round(p.aim * 100) / 100) < 1e-9 &&
      Math.abs(r.heat - Math.round(p.heat * 100) / 100) < 1e-9;
    if (!same) return { matched, firstDisagreement: r.tick };
    matched++;
  }
  return {
    matched,
    firstDisagreement:
      recorded.length === replayed.length ? null : (recorded[matched]?.tick ?? null),
  };
}

export function formatAnalysis(report: DiagReport, a: Analysis): string[] {
  const s = summarize(report);
  const out: string[] = [];
  out.push('');
  out.push('  APHELION — replay');
  out.push('  ' + '─'.repeat(72));
  out.push(`  recorded   ${report.at}`);
  // The bundle the session was played on. A feature that shipped after this
  // moment was not on screen, however current the config and simVersion look.
  if (report.loadedAt) {
    const mins = (Date.parse(report.at) - Date.parse(report.loadedAt)) / 60000;
    out.push(
      `  page load  ${report.loadedAt}` +
        (Number.isFinite(mins) ? `  (${mins.toFixed(0)} min before the report)` : ''),
    );
  } else {
    out.push('  page load  not recorded — this report predates the field');
  }
  out.push(`  device     ${report.device.w}x${report.device.h} @${report.device.dpr}x`);
  out.push(`  session    ${s.seconds.toFixed(1)}s · ${report.ticks} ticks · ${s.grabs} grabs`);
  // Against the resolved config, not the raw one: a key added since the report
  // was recorded is missing from `report.config`, and printing "session ran
  // undefined" hides the value the session actually behaved as.
  const delta = configDelta(configFromReport(report), DEFAULT_CONFIG);
  // Five ways a config can differ from the defaults, and only one of them is a
  // reason to distrust the report. A key the player TUNED is a deliberate
  // experiment; a field the player RANDOMISED is a different world, not a
  // different build; a COURSE is a different length of world, chosen on purpose;
  // a DEV key is what the dev server always sets, and since dev sessions are
  // where reports come from, treating it as skew would fire the banner on every
  // single one; a RETIRED key stopped being config and became body-type data, and
  // the report still holds the value the table holds. Everything else is skew — the session ran code that is no longer
  // what this checkout does — and that is what the banner is for. Lumping them
  // together made the banner fire on ordinary play and then blame the knob for a
  // divergence it had nothing to do with.
  const tuned = delta.filter((d) => TUNED_KEYS.has(d.key));
  const field = delta.find((d) => d.key === 'worldSeed');
  const dev = delta.filter((d) => DEV_KEYS.has(d.key));
  const course = delta.filter((d) => COURSE_KEYS.has(d.key));
  const retired = delta.filter((d) => isRetired(d.key, d.theirs));
  const skew = delta.filter(
    (d) =>
      !TUNED_KEYS.has(d.key) &&
      d.key !== 'worldSeed' &&
      !DEV_KEYS.has(d.key) &&
      !COURSE_KEYS.has(d.key) &&
      !isRetired(d.key, d.theirs),
  );
  out.push(
    `  config     ${skew.length ? `${skew.length} value(s) differ from current defaults` : 'matches current defaults'}` +
      (tuned.length ? ` · ${tuned.length} tuned in the panel` : ''),
  );
  if (field) {
    const hex = (v: number | boolean): string => Number(v).toString(16).padStart(8, '0');
    out.push(`  field      randomised — seed ${hex(field.theirs)} (default ${hex(field.ours)})`);
  }
  for (const d of tuned) {
    out.push(`  tuned      ${d.key}: ${d.theirs} (default ${d.ours})`);
  }
  if (course.length) {
    const bodies = course.find((d) => d.key === 'bodyCount');
    out.push(
      `  course     ${courseOf(configFromReport(report) as SimConfig).toUpperCase()}` +
        (bodies ? ` — ${bodies.theirs} bodies (default ${bodies.ours})` : ''),
    );
  }
  for (const d of dev) {
    out.push(`  dev        ${d.key}: ${d.theirs} — dev-server default, not build skew`);
  }
  if (retired.length) {
    out.push(
      `  retired    ${retired.length} key(s) became body-type data and still hold the recorded value`,
    );
  }
  const skewed = report.simVersion !== SIM_VERSION || skew.length > 0;
  if (skewed) {
    out.push('');
    out.push('  ⚠ THIS REPORT CAME FROM A DIFFERENT BUILD');
    if (report.simVersion !== SIM_VERSION) {
      out.push(`      simVersion ${report.simVersion} recorded, ${SIM_VERSION} here`);
    }
    for (const d of skew) {
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
      if (skewed) {
        out.push(
          '      The report is from a different build (see above) — that is the likely cause.',
        );
      } else {
        // Saying only "this is real" points the reader at non-determinism, which
        // is almost never what this is. The simulation is deterministic and the
        // test suite proves it; what differs is the ENGINE. PORT_NOTES 16 fixed
        // Math.hypot, but sin, cos and atan2 are still implementation-
        // approximated and JavaScriptCore and V8 disagree on them.
        out.push('      Same build and config. Before suspecting non-determinism, note that');
        out.push('      sin/cos/atan2 remain implementation-approximated and differ between');
        out.push('      the phone and this machine (PORT_NOTES 16 fixed only Math.hypot).');
        out.push('      The phase clock uses them, a capture amplifies the difference, and a');
        out.push('      respawn resets it — so a long unbroken chain of captures diverges');
        out.push('      where a crash-heavy session does not.');
      }
      break;
  }
  // A diverged replay is not a worthless one. Everything up to the last matching
  // checkpoint IS the session that was played, and saying so is the difference
  // between a useless report and half a useful one.
  if (a.firstDivergedTick !== null && a.fidelity !== 'close' && a.fidelity !== 'exact') {
    const upto =
      a.lastExactTick === null
        ? '      Nothing in this replay is bit-exact — treat all of it as suspect.'
        : `      Trustworthy up to tick ${a.lastExactTick} (t=${(a.lastExactTick * report.dt).toFixed(1)}s).`;
    out.push('');
    out.push(upto);
    out.push(
      `      First checkpoint that differs: ${a.firstDivergedTick}` +
        (a.firstDivergedPhase ? ` (in ${a.firstDivergedPhase})` : '') +
        '. Read nothing after it.',
    );
  }
  if (report.checksTruncated) out.push('      (early checkpoints were dropped by the recorder)');
  out.push('');
  out.push('  findings');
  for (const f of a.findings) out.push(`    · ${f}`);
  out.push('');

  // The score, tick by tick. Worth printing in full rather than summarised: the
  // weights are still being calibrated by playing, and this is the only place a
  // real session's release qualities can be read next to what they paid.
  const recorded = recordedAwards(report);
  const shown = recorded ?? a.awards;
  if (shown.length) {
    if (recorded) {
      const agree = awardAgreement(recorded, a.awards);
      out.push(
        `  score — AS THE PHONE PAID IT (${recorded.length} events, recorded not recomputed)`,
      );
      if (retiredAwardCount > 0) {
        // Not a fidelity problem and must not be read as one: the trajectory is
        // fine, the ECONOMY changed underneath the recording. F04 deleted the
        // grab, hop, burn and rescue awards, so a session flown before it carries
        // events this build has no kind for.
        out.push(
          `    ${retiredAwardCount} more were grab/hop/burn/rescue awards, deleted by F04 — ` +
            `this session was flown under the additive economy and its PRICES no longer exist`,
        );
      }
      if (agree.matched === recorded.length && agree.firstDisagreement === null) {
        out.push('    the replay recomputed every one of these identically');
      } else if (retiredAwardCount > 0) {
        // NOT A FIDELITY SIGNAL when the report predates the constitution, and
        // saying so matters: the old line read as "the replay diverged", which is
        // the one conclusion a reader must not draw here. The trajectory can be
        // bit-exact and every price still differ, because the prices changed.
        out.push(
          '    the replay prices them differently, which is expected and is not a divergence —' +
            ' check the fidelity line above for whether the FLIGHT was reproduced',
        );
      } else {
        out.push(
          `    the replay agreed on the first ${agree.matched} and then parted company` +
            (agree.firstDisagreement !== null ? ` at tick ${agree.firstDisagreement}` : '') +
            ` — these are the session, its recomputed ones are not`,
        );
      }
    } else {
      out.push('  score — RECOMPUTED (this report predates recorded awards)');
    }
    out.push(
      '    tick  ev      what       points   carry   tier   band   mult   peak    aim   climb  earned',
    );
    for (const w of shown.slice(0, 24)) {
      out.push(
        `    ${String(w.tick).padStart(5)}  ${w.kind.padEnd(6)}  ` +
          `${w.body.padEnd(10)}` +
          `${String(w.points).padStart(7)}  ${w.carry.toFixed(0).padStart(6)}  ` +
          `${('x' + w.tier.toFixed(2)).padStart(5)}  ${('x' + String(w.band)).padStart(4)}  ` +
          `${('x' + w.multiplier.toFixed(2)).padStart(5)}  ` +
          `${(w.kind === 'link' ? w.timing.toFixed(2) : '  · ').padStart(5)}  ` +
          `${(w.kind === 'link' ? w.aim.toFixed(2) : '  · ').padStart(5)}  ` +
          `${w.climb.toFixed(0).padStart(5)}  ` +
          // The word choice is seeded from the tick, so this is the word the
          // player actually saw, not a fresh roll of the same table.
          (praiseFor(w)?.word ?? ''),
      );
    }
    if (shown.length > 24) out.push(`    ... and ${shown.length - 24} more`);
    // `best` comes from the replay's own scoring pass, so it is only the session's
    // number while the replay still is. With recorded awards present, sum them
    // instead — that total is the session's whatever the trajectory did.
    if (recorded) {
      const paid = recorded.reduce((n, w) => n + w.points, 0);
      out.push(`    total paid across the session ${paid} (recorded)`);
    } else {
      out.push(`    best life ${a.score.best}`);
    }
    out.push('');
  }

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
