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
 *   death     `ending.active` went true
 *
 * Reading `telemetry.putterOuts` is fair game: telemetry is written by the
 * simulation and never read by it, so observing it cannot feed back.
 */
import type { SimConfig } from '../sim/config.ts';
import type { Capture, SimState } from '../sim/types.ts';
import { hypot } from '../sim/orbit.ts';
import { readAim } from './aim.ts';
import { burnHeat } from './burn.ts';
import { isNerveGrab } from './praise.ts';
import {
  BONK_SPEED,
  RECKLESS_DEG,
  RECKLESS_HARD_DEG,
  RECKLESS_STREAK,
  bonkWord,
  shoutWord,
} from './reckless.ts';
import type { Shout } from './reckless.ts';
import type { ScoreConfig } from './config.ts';
import { DEFAULT_SCORE_CONFIG } from './config.ts';
import type { PendingLink, ScoreAward, ScoreState } from './types.ts';

/**
 * Ticks between periapsis and the grab award landing.
 *
 * Long enough that it reads as "you swung through and came out", short enough to
 * still be the same moment. At the bottom of a dive the ship is moving fastest,
 * so two ticks is a visible distance travelled rather than a pause.
 */
const GRAB_AWARD_DELAY = 2;

export function createScoreState(): ScoreState {
  return {
    score: 0,
    best: 0,
    streak: 0,
    multiplier: 1,
    bonusActive: false,
    bonusFrac: 0,
    grabs: 0,
    links: 0,
    burns: 0,
    burnHeat: 0,
    burnBank: 0,
    burnPeak: 0,
    lastAward: null,
    pending: null,
    climbFromY: null,
    endingSeen: false,
    lastDrift: null,
    wasCaptured: false,
    grabSkim: Infinity,
    grabClearance: Infinity,
    maxDefl: 0,
    periSeen: false,
    grabDue: -1,
    recklessStreak: 0,
    capKinked: false,
    inKink: false,
    inHardKink: false,
    putterOuts: 0,
    bonusUntil: -1,
    bonusArmed: false,
    claimed: [],
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The live multiplier: the streak ladder, plus any anomaly bonus ON TOP of the
 * ceiling.
 *
 * Deliberately outside the `min`. Inside it — `min(streakMax, 1 + step*streak +
 * bonus)` — the bonus does literally nothing to a maxed streak, which is exactly
 * the player who earned the right to go and fetch it. The ceiling being
 * breakable is the whole reward: a strong run otherwise spends its last third at
 * x5 with nothing left to climb toward.
 */
function multiplierFor(sc: ScoreState, scfg: ScoreConfig, tick: number): number {
  const streak = Math.min(scfg.streakMax, 1 + scfg.streakStep * sc.streak);
  return streak + (sc.bonusUntil >= tick ? scfg.anomalyBonusMult : 0);
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
  // A death ends a reckless run too. Flying like that into the ground is not the
  // same as getting away with it three times.
  sc.recklessStreak = 0;
  sc.capKinked = false;
  sc.inKink = false;
  sc.inHardKink = false;
  sc.climbFromY = null;
  // A death takes the bonus with the points. The claim log clears too, so a new
  // life may take an anomaly it already took in the last one — the once-only rule
  // exists to stop a bonus being refreshed by re-grabbing the same body in one
  // flight, not to retire it from the field.
  sc.bonusUntil = -1;
  sc.bonusArmed = false;
  sc.claimed.length = 0;
  // A flare still burning at the moment of death is dropped rather than paid.
  // Flying into the ground is how a hot pass goes wrong, and the score it would
  // have banked is exactly what the death is taking.
  sc.burnHeat = 0;
  sc.burnBank = 0;
  sc.burnPeak = 0;
}

/**
 * What one tick produced, on two channels.
 *
 * `awards` are points changing hands. `shouts` are the game reacting to how the
 * ship is being flown and cost nothing — see `src/score/reckless.ts` for why they
 * are not the same thing.
 */
export interface ScoreTick {
  awards: ScoreAward[];
  shouts: Shout[];
}

/**
 * Advance the score by one tick. Call immediately after `stepSim`, with the SAME
 * `dt`.
 *
 * `dt` is threaded rather than read from `FIXED_DT` for the reason that constant
 * states itself: it is passed as a parameter, never read globally. The scorer now
 * owns a duration — the anomaly bonus window — and a duration that assumed the
 * timestep would silently re-tune itself if the timestep ever moved.
 */
export function scoreTick(
  sc: ScoreState,
  state: SimState,
  cfg: SimConfig,
  dt: number,
  scfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreTick {
  const awards: ScoreAward[] = [];
  const shouts: Shout[] = [];

  // ---- the ending hold: nothing is scored, and the life is over
  if (state.ending.active) {
    if (!sc.endingSeen) {
      sc.endingSeen = true;
      // The impact itself, before the life is wound up. Read from `lastDrift`
      // rather than the ship, because a fatal contact zeroes the velocity it is
      // being judged on — and the scorer is an observer, so the simulation is
      // not going to start carrying a field for it.
      const hit = sc.lastDrift;
      if (state.ending.reason === 'impact' && hit) {
        const speed = hypot(hit.vx, hit.vy);
        if (speed >= BONK_SPEED) {
          shouts.push({ tick: state.tick, word: bonkWord(state.tick), kind: 'bonk', streak: 0 });
        }
      }
      endLife(sc);
    }
    sc.putterOuts = state.telemetry.putterOuts;
    sc.multiplier = multiplierFor(sc, scfg, state.tick);
    sc.bonusActive = sc.bonusUntil >= state.tick;
    const span = Math.max(1, Math.round(scfg.anomalyBonusSecs / dt));
    sc.bonusFrac = sc.bonusActive
      ? Math.max(0, Math.min(1, (sc.bonusUntil - state.tick) / span))
      : 0;
    return { awards, shouts };
  }
  sc.endingSeen = false;
  if (sc.climbFromY === null) sc.climbFromY = state.highWaterY;

  // ---- the burn: heat integrated over a hot pass, paid when the fire dies
  //
  // Ahead of the release below, and deliberately: a hot pass happens during the
  // ride, so when a release ends a flare the two awards land on the same tick and
  // the one that describes the earlier moment should be the earlier of the pair.
  //
  // Both ends of a flare are edges on the same quantity, so a flare is exactly
  // one continuous stretch above the ignition heat — no separate latch to get out
  // of step with the fire the player is watching. A settle that dips through the
  // hot zone on two passes pays twice, which is right: it burned twice.
  //
  // Placed outside the capture branch so a release mid-burn settles here too.
  // Otherwise letting go at the hottest instant — which is a thing a player will
  // do on purpose, because it is also the best boost — would silently forfeit the
  // whole flare.
  {
    const cap = state.capture;
    const heat = cap ? burnHeat(hypot(cap.rx, cap.ry) - cap.minR, hypot(cap.vx, cap.vy), scfg) : 0;
    if (heat > scfg.burnMinHeat) {
      sc.burnHeat = heat;
      sc.burnBank += heat * dt * scfg.burnRate;
      if (heat > sc.burnPeak) sc.burnPeak = heat;
    } else {
      sc.burnHeat = 0;
      const burn = awardBurn(sc, state, scfg);
      if (burn) awards.push(burn);
    }
  }

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
    // The anomaly bonus starts HERE, as the ship leaves — not at the grab. It
    // starts whether or not the release earned a link, because the achievement it
    // pays for was arriving, and a player who fumbles the exit of the hardest
    // thing in the game has already been punished by the link they did not get.
    if (sc.bonusArmed) {
      sc.bonusArmed = false;
      sc.bonusUntil = state.tick + Math.round(scfg.anomalyBonusSecs / dt);
    }
  }

  const cap = state.capture;

  // A capture that ended without ever being thrown around breaks the run. Checked
  // before the branch below so it sees the capture that just went away.
  if (sc.wasCaptured && !cap) {
    if (!sc.capKinked) sc.recklessStreak = 0;
    sc.capKinked = false;
    sc.inKink = false;
    sc.inHardKink = false;
  }

  if (cap) {
    // First tick of this capture: the drift state held from last tick is exactly
    // what `beginCapture` read, so the approach line can be measured now and
    // never again — the capture's own rx/ry/vx/vy start moving immediately.
    if (!sc.wasCaptured) {
      sc.grabSkim = skimClearance(sc, state, cap);
      // The press distance, for a zipped capture exactly as for a flown one, and
      // that is a correction to what this was nearly changed to.
      //
      // Judging a zip on the ORBIT it reaches sounds fairer — the zip does the
      // closing, so score the closing — and was measured to be the opposite.
      // `predictedCaptureOrbit` applies the clearance correction, so almost
      // anything aimed near a body zips to a periapsis at `minR`: scoring that
      // paid a zipped grab 1.35x what the same approach earned by flying, p90
      // 7.6x, worst 14.6x, and it paid MOST for the lazy point-blank press it was
      // supposed to discourage. On `grabR` the ratio is 1.00 across all 446 pairs.
      //
      // Which is the right answer for a reason better than the numbers: a zip is
      // a shortcut, not a discount or a bonus. It buys back the three seconds of
      // flying, and what the capture is worth is left alone.
      sc.grabClearance = Math.max(0, cap.grabR - cap.minR);
      sc.maxDefl = 0;
      sc.periSeen = false;
      sc.grabDue = -1;
    }

    // ---- the grab award: owed once the dive swings through periapsis
    //
    // Not at the press. A light tap should earn nothing, and paying at the press
    // would make one next to a planet a points faucet — you are already close to
    // the surface, so every tap would be a tight grab. Periapsis is the moment
    // the swing actually happened; a couple of ticks past it is when it reads as
    // having happened, on the way back out.
    // The arrival has happened. For a dive that is periapsis — the moment the
    // swing actually occurred. For a zip it is the end of the glide, which is the
    // same moment wearing different clothes: the point at which the ship is where
    // it was going. Paying either at the press would be paying for the intention.
    const arrived = cap.zipped ? cap.phase === 'orbit' : cap.passedPeri;
    if (!sc.periSeen && arrived) {
      sc.periSeen = true;
      sc.grabDue = GRAB_AWARD_DELAY;
    }
    if (sc.grabDue > 0) sc.grabDue--;
    else if (sc.grabDue === 0) {
      sc.grabDue = -1;
      const grab = awardGrab(sc, state, scfg, cap);
      if (grab) awards.push(grab);
    }
    // Accumulated rather than sampled at release: recklessness is a property of
    // the whole ride, and the roughest moment of it is usually the brake biting
    // early on, long before the ship is let go of.
    if (cap.defl > sc.maxDefl) sc.maxDefl = cap.defl;

    // Rising edges only: one rough passage is one event, however many ticks the
    // deflection stays over the line. Two edges because there are two questions —
    // `RECKLESS_DEG` is "was that rough", which only means something as a run of
    // three, and `RECKLESS_HARD_DEG` is "was that violent", which is complete on
    // its own. They are tracked separately because a capture ramps into its worst
    // sample: watching only the first edge would see a 30-degree crossing and
    // miss the 80 degrees that followed it.
    const rough = cap.defl >= RECKLESS_DEG;
    const hard = cap.defl >= RECKLESS_HARD_DEG;
    const roughEdge = rough && !sc.inKink;
    const hardEdge = hard && !sc.inHardKink;
    sc.inKink = rough;
    sc.inHardKink = hard;

    if (roughEdge && !sc.capKinked) {
      sc.capKinked = true;
      sc.recklessStreak++;
    }
    // At most one shout a tick, however both gates opened.
    if (hardEdge || (roughEdge && sc.recklessStreak >= RECKLESS_STREAK)) {
      shouts.push({
        tick: state.tick,
        word: shoutWord(state.tick),
        kind: 'reckless',
        streak: sc.recklessStreak,
      });
    }

    sc.pending = readPending(state, cfg, scfg, cap, sc.grabSkim, sc.maxDefl);
  } else {
    // Held so the next grab can measure the line it came in on — see
    // `skimClearance`. Nothing else happens while drifting.
    const { ship } = state;
    sc.lastDrift = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
  }
  sc.wasCaptured = cap !== null;

  sc.multiplier = multiplierFor(sc, scfg, state.tick);
  sc.bonusActive = sc.bonusUntil >= state.tick;
  const span = Math.max(1, Math.round(scfg.anomalyBonusSecs / dt));
  sc.bonusFrac = sc.bonusActive ? Math.max(0, Math.min(1, (sc.bonusUntil - state.tick) / span)) : 0;
  if (sc.score > sc.best) sc.best = sc.score;
  if (awards.length > 0) sc.lastAward = awards[awards.length - 1]!;
  return { awards, shouts };
}

/**
 * How close the drift line was going to come, in px above the minimum orbit.
 *
 * Positive is a miss, negative means the ship was already headed inside the
 * minimum-orbit zone. Infinity when the body is behind the ship — a body you
 * have already passed is not one you were bearing down on.
 */
function skimClearance(sc: ScoreState, state: SimState, cap: Capture): number {
  const d = sc.lastDrift;
  const body = state.bodies[cap.planet];
  if (!d || !body) return Infinity;
  const sp = hypot(d.vx, d.vy);
  if (sp < 1) return Infinity;
  const ux = d.vx / sp;
  const uy = d.vy / sp;
  const rx = d.x - body.x;
  const ry = d.y - body.y;
  // Behind us: the closest approach is in the past.
  if (-(rx * ux + ry * uy) <= 0) return Infinity;
  return Math.abs(rx * uy - ry * ux) - cap.minR;
}

/** Snapshot the live capture as the release it would be if let go of now. */
function readPending(
  state: SimState,
  cfg: SimConfig,
  scfg: ScoreConfig,
  cap: Capture,
  skim: number,
  defl: number,
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
    skim,
    defl,
    // Where in the envelope the release landed. A dive too shallow to bank any
    // boost has no window to hit, so it scores no timing rather than full marks
    // for a division that never happened.
    timing: cap.boostFull > 0 ? clamp01(cap.boost / cap.boostFull) : 0,
    aim,
    target,
  };
}

/**
 * Pay for how the ship arrived.
 *
 * Returns null when the arrival was worth nothing — a grab from beyond
 * `closeSpan` earns no closeness and was no kind of nerve, and a `+0` floating
 * off the ship is worse than silence.
 */
function awardGrab(
  sc: ScoreState,
  state: SimState,
  scfg: ScoreConfig,
  cap: Capture,
): ScoreAward | null {
  const close = clamp01(1 - sc.grabClearance / scfg.closeSpan);
  const multiplier = multiplierFor(sc, scfg, state.tick);
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'grab',
    points: 0,
    multiplier,
    body: state.bodies[cap.planet]?.name ?? '?',
    close,
    clearance: sc.grabClearance,
    skim: sc.grabSkim,
    defl: sc.maxDefl,
    // Release qualities are not this event's business and must read as absent
    // rather than as zero-scoring. The burn is not this event's business either:
    // the arrival is one instant, and heat is a stretch of the ride after it.
    timing: 0,
    aim: 0,
    climb: 0,
    heat: 0,
  };
  // An anomaly pays its own flat award on top of whatever the arrival was worth,
  // and arms the bonus window for the release. Once per life: without the claim
  // log a player could orbit out and back to refresh the window indefinitely,
  // which is the same faucet the grab award already refuses to open by paying at
  // the press.
  const body = state.bodies[cap.planet];
  let anomaly = 0;
  if (body?.kind === 'anomaly' && !sc.claimed.includes(body.name)) {
    sc.claimed.push(body.name);
    sc.bonusArmed = true;
    anomaly = scfg.anomalyBonus;
  }

  const raw = close * scfg.closeBonus + (isNerveGrab(award) ? scfg.nerveBonus : 0) + anomaly;
  if (raw <= 0) return null;
  award.points = Math.round(raw * multiplier);
  sc.score += award.points;
  sc.grabs++;
  return award;
}

/**
 * Pay for a hot pass, once the fire is out.
 *
 * Returns null when nothing was burning, which is the common case — this is
 * called on every tick the ship is not alight, purely to catch the falling edge.
 *
 * The bank is committed in ONE award rather than a slice a tick, even though it
 * was accumulated a slice a tick. Paying continuously would break the promise
 * `test/score.test.ts` pins — that awards inside a life sum to the score — and
 * with it `tools/replay.ts`, which reconstructs a session from its award list and
 * would come up short by every burn. The player still sees the number climb: the
 * popup rolls it up over 0.8s, outliving the flame it is counting, because the
 * flame itself is only about 0.17s long and a number that resolved in 0.17s would
 * be a flicker rather than a tally.
 */
function awardBurn(sc: ScoreState, state: SimState, scfg: ScoreConfig): ScoreAward | null {
  if (sc.burnBank <= 0) return null;
  const raw = sc.burnBank;
  const peak = sc.burnPeak;
  sc.burnBank = 0;
  sc.burnPeak = 0;

  const multiplier = multiplierFor(sc, scfg, state.tick);
  const points = Math.round(raw * multiplier);
  // A flare so faint it rounds to nothing pays nothing and says nothing: a `+0`
  // floating off the ship is worse than silence, the same rule `awardGrab` keeps.
  if (points <= 0) return null;

  const cap = state.capture;
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'burn',
    points,
    multiplier,
    // The body it burned against, or the one it just left — a release can end a
    // flare, and by then the capture is already gone.
    body: (cap ? state.bodies[cap.planet]?.name : sc.pending?.body) ?? '?',
    // Arrival and release qualities both belong to other events. Reported as
    // absent so nothing downstream can pay or praise them a second time.
    close: 0,
    clearance: Infinity,
    skim: Infinity,
    defl: 0,
    timing: 0,
    aim: 0,
    climb: 0,
    heat: peak,
  };
  sc.score += points;
  sc.burns++;
  return award;
}

function awardLink(sc: ScoreState, state: SimState, scfg: ScoreConfig, p: PendingLink): ScoreAward {
  // Climb is measured on `highWaterY` rather than on release positions: it only
  // ratchets, so a dip inside an orbit cannot bank negative ground, and the
  // baseline survives the whole flight between two links.
  const climb = sc.climbFromY === null ? 0 : Math.max(0, sc.climbFromY - state.highWaterY);
  sc.climbFromY = state.highWaterY;

  const timing = Math.pow(p.timing, scfg.timingSharpness);
  const aim = Math.pow(p.aim, scfg.aimSharpness);
  // Closeness and nerve were paid at periapsis, by `awardGrab`. What is left here
  // is what the release itself was worth.
  const raw =
    scfg.linkBase + climb * scfg.climbPerPx + timing * scfg.timingBonus + aim * scfg.aimBonus;

  const multiplier = multiplierFor(sc, scfg, state.tick);
  // Built once so the nerve test sees the finished award rather than a copy of
  // its own inputs — one definition of what a nerve grab is, in praise.ts.
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'link',
    points: 0,
    multiplier,
    body: p.target ? `${p.body}→${p.target.name}` : p.body,
    // Arrival qualities belong to the grab award and are reported as absent here,
    // so nothing downstream can pay or praise them twice.
    close: 0,
    clearance: Infinity,
    skim: Infinity,
    defl: p.defl,
    timing: p.timing,
    aim: p.aim,
    climb,
    heat: 0,
  };
  award.points = Math.round(raw * multiplier);
  sc.score += award.points;
  sc.links++;
  sc.streak++;
  return award;
}
