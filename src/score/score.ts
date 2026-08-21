/**
 * The scorer.
 *
 * WHY IT IS AN OBSERVER
 *
 * `scoreTick` is called after `stepSim` and reads `SimState`. It writes nothing
 * the simulation can see, and the simulation knows nothing about it. That is not
 * squeamishness about coupling — it is the only shape that keeps the hard
 * requirement true:
 *
 *   a score is a pure function of (config, seed, inputLog)
 *
 * `SimState` is already a pure function of those three. A scorer that only reads
 * `SimState` and its own frozen weights therefore is too, and a diagnostics
 * report — which carries exactly (config, seed, inputLog) — replays to the same
 * score it showed on the phone. `tools/replay.ts` prints it, which is how that
 * claim gets checked against real sessions rather than only in a test.
 *
 * It also means the equality gate never has to hear about any of this: nothing
 * under `src/sim/` changed, so the divergence stays at exactly zero and no golden
 * needs recapturing.
 *
 * WHAT IT WATCHES FOR
 *
 * The simulation emits no events, so the transitions are recovered by diffing
 * state across ticks:
 *
 *   release   a capture was here last tick and is gone this tick, the ship is
 *             alive, and no putter-out was recorded — see `PendingLink`
 *   miss      the drifting ship has risen clear of a body it came within reach
 *             of and never grabbed
 *   death     `ending.active` went true
 *
 * Reading `telemetry.putterOuts` is fair game: telemetry is written by the
 * simulation and never read by it, so observing it cannot feed back.
 */
import type { SimConfig } from '../sim/config.ts';
import type { Capture, SimState } from '../sim/types.ts';
import { grabTarget } from '../sim/capture.ts';
import { hypot } from '../sim/orbit.ts';
import { readAim } from './aim.ts';
import type { ScoreConfig } from './config.ts';
import { DEFAULT_SCORE_CONFIG } from './config.ts';
import type { PendingLink, ScoreAward, ScoreState } from './types.ts';

/**
 * How far clear of a body's surface the ship must rise before it counts as having
 * passed it.
 *
 * Not a weight, and deliberately not in `ScoreConfig`: it defines *when* a pass is
 * judged, never *what* one costs, and it measured as unable to change any score —
 * which is exactly what a definition should do. `test/score.test.ts` requires
 * every key in `ScoreConfig` to move some score, and it is right to.
 */
const PASSED_CLEARANCE = 40;

/** Per-body bits in `ScoreState.flags`. */
const OFFERED = 1;
const GRABBED = 2;
const JUDGED = 4;

export function createScoreState(): ScoreState {
  return {
    score: 0,
    best: 0,
    streak: 0,
    multiplier: 1,
    links: 0,
    misses: 0,
    lastAward: null,
    pending: null,
    climbFromY: null,
    flags: [],
    endingSeen: false,
    putterOuts: 0,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function multiplierFor(sc: ScoreState, scfg: ScoreConfig): number {
  return Math.min(scfg.streakMax, 1 + scfg.streakStep * sc.streak);
}

/**
 * A death takes the points.
 *
 * The score is the current life's, not the session's: dying costs the run rather
 * than only the multiplier. `best` survives, so what a death takes is legible —
 * you can see the number you have to beat sitting above the one you are rebuilding.
 *
 * The bookkeeping has to go with it. After a respawn the field is re-flown from
 * the bottom, so the per-body flags and the climb baseline must reset too, or the
 * second pass would be judged against the first one's — no penalties for planets
 * already passed once, and a climb banked from a high-water mark the ship is now
 * far below.
 *
 * (Resetting the score also closes the only re-banking exploit this design had:
 * with points surviving a death, deliberately crashing and re-flying the bottom
 * of the field re-earned its climb. It was never worth doing — a fresh life runs
 * at 1x — but it no longer exists to argue about.)
 */
function endLife(sc: ScoreState): void {
  sc.score = 0;
  sc.pending = null;
  sc.streak = 0;
  sc.climbFromY = null;
  sc.flags = [];
}

/** Advance the score by one tick. Call immediately after `stepSim`. */
export function scoreTick(
  sc: ScoreState,
  state: SimState,
  cfg: SimConfig,
  scfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreAward[] {
  const awards: ScoreAward[] = [];

  // ---- the ending hold: nothing is scored, and the life is over
  if (state.ending.active) {
    if (!sc.endingSeen) {
      sc.endingSeen = true;
      endLife(sc);
    }
    sc.putterOuts = state.telemetry.putterOuts;
    sc.multiplier = multiplierFor(sc, scfg);
    return awards;
  }
  sc.endingSeen = false;
  if (sc.climbFromY === null) sc.climbFromY = state.highWaterY;

  // ---- ran dry mid-circularisation: a failure, not a release
  if (state.telemetry.putterOuts > sc.putterOuts) {
    sc.putterOuts = state.telemetry.putterOuts;
    sc.pending = null;
    sc.streak = 0;
  }

  // ---- the capture is gone: score the release it was
  //
  // A release that never reached a frozen orbit — a dive abandoned early, or a
  // flyby let go of — is not a failure, it is a non-event. It pays nothing and
  // costs nothing, and in particular it does not break a streak.
  if (sc.pending && !state.capture) {
    const p = sc.pending;
    sc.pending = null;
    if (p.earned) awards.push(awardLink(sc, state, scfg, p));
  }

  const cap = state.capture;
  if (cap) {
    // A body you grabbed can never be one you coasted past, however the capture
    // turns out.
    sc.flags[cap.planet] = (sc.flags[cap.planet] ?? 0) | GRABBED;
    sc.pending = readPending(state, cfg, scfg, cap);
  } else {
    judgePasses(sc, state, cfg, scfg, awards);
  }

  sc.multiplier = multiplierFor(sc, scfg);
  if (sc.score > sc.best) sc.best = sc.score;
  if (awards.length > 0) sc.lastAward = awards[awards.length - 1]!;
  return awards;
}

/** Snapshot the live capture as the release it would be if let go of now. */
function readPending(
  state: SimState,
  cfg: SimConfig,
  scfg: ScoreConfig,
  cap: Capture,
): PendingLink {
  // Deliberately the same test `releaseCapture` applies before paying a boost:
  // what earns speed and what earns points are the same release.
  const earned = cap.orbit !== null && cap.passedPeri && cap.phase !== 'flyby';

  let aim = 0;
  let target = null;
  // The compass only exists once the orbit is frozen, so a release before that
  // cannot be aimed and is not scored as though it were.
  if (cap.orbit && (cap.phase === 'settle' || cap.phase === 'orbit')) {
    const reading = readAim(
      cap.orbit,
      cap.rPeri,
      cfg.tightenFrac * cap.settleProgress,
      state.bodies,
      cap.planet,
      Math.atan2(cap.ry, cap.rx),
    );
    aim = reading.best;
    target = reading.bestTarget;
  }

  return {
    earned,
    body: state.bodies[cap.planet]?.name ?? '?',
    // Clearance above the minimum orbit at the moment of the grab: 0px away is a
    // grab off the surface, `closeSpan` away scores nothing.
    close: clamp01(1 - (cap.grabR - cap.minR) / scfg.closeSpan),
    clearance: Math.max(0, cap.grabR - cap.minR),
    // Where in the envelope the release landed. A dive too shallow to bank any
    // boost has no window to hit, so it scores no timing rather than full marks
    // for a division that never happened.
    timing: cap.boostFull > 0 ? clamp01(cap.boost / cap.boostFull) : 0,
    aim,
    target,
  };
}

function awardLink(sc: ScoreState, state: SimState, scfg: ScoreConfig, p: PendingLink): ScoreAward {
  // Climb is measured on `highWaterY` rather than on release positions: it only
  // ratchets, so a dip inside an orbit cannot bank negative ground, and the
  // baseline survives the whole flight between two links.
  const climb = sc.climbFromY === null ? 0 : Math.max(0, sc.climbFromY - state.highWaterY);
  sc.climbFromY = state.highWaterY;

  const timing = Math.pow(p.timing, scfg.timingSharpness);
  const aim = Math.pow(p.aim, scfg.aimSharpness);
  const raw =
    scfg.linkBase +
    climb * scfg.climbPerPx +
    p.close * scfg.closeBonus +
    timing * scfg.timingBonus +
    aim * scfg.aimBonus;

  const multiplier = multiplierFor(sc, scfg);
  const points = Math.round(raw * multiplier);
  sc.score += points;
  sc.links++;
  sc.streak++;

  return {
    tick: state.tick,
    kind: 'link',
    points,
    multiplier,
    body: p.target ? `${p.body}→${p.target.name}` : p.body,
    close: p.close,
    clearance: p.clearance,
    timing: p.timing,
    aim: p.aim,
    climb,
  };
}

/**
 * Coasting past a planet you could have taken.
 *
 * A body becomes "offered" on any drifting tick where pressing would actually
 * have grabbed it, and is judged once the ship has risen clear of it. Take it at
 * any point in between and it is settled; sail by and it costs.
 *
 * "Would actually have grabbed it" is `grabTarget`, the simulation's own answer,
 * rather than a distance test written a second time here. It matters: a body can
 * be a hundred pixels away and still not be on offer, because the tank is empty,
 * because it is not the nearest body, or because the ship is already committed
 * inside its crash cone. Charging the player for skipping a grab the game would
 * have refused is worse than not charging them at all.
 *
 * `missRange` then narrows that further, to bodies close enough that passing one
 * up reads as a decision rather than as a planet going by in the distance.
 */
function judgePasses(
  sc: ScoreState,
  state: SimState,
  cfg: SimConfig,
  scfg: ScoreConfig,
  out: ScoreAward[],
): void {
  const { y } = state.ship;

  // Exactly one body can be on offer at a time — the nearest one.
  const offer = grabTarget(state, cfg);
  if (offer.index >= 0) {
    const b = state.bodies[offer.index]!;
    if (hypot(state.ship.x - b.x, y - b.y) <= scfg.missRange) {
      sc.flags[offer.index] = (sc.flags[offer.index] ?? 0) | OFFERED;
    }
  }

  for (let i = 0; i < state.bodies.length; i++) {
    const flags = sc.flags[i] ?? 0;
    if (flags & (GRABBED | JUDGED) || !(flags & OFFERED)) continue;
    const b = state.bodies[i]!;

    // Smaller y is up: the ship has passed the body once it is clear above it.
    if (y < b.y - b.R - PASSED_CLEARANCE) {
      sc.flags[i] = flags | JUDGED;
      const points = -Math.min(sc.score, scfg.missPenalty);
      sc.score += points;
      sc.misses++;
      sc.streak = 0;
      out.push({
        tick: state.tick,
        kind: 'miss',
        points,
        multiplier: 1,
        body: b.name,
        close: 0,
        clearance: 0,
        timing: 0,
        aim: 0,
        climb: 0,
      });
    }
  }
}
