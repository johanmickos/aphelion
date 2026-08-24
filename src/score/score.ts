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
import { fieldBounds } from '../sim/world.ts';
import { shipWorldPos } from '../sim/step.ts';
import { readAim } from './aim.ts';
import { edgeHeat } from './burn.ts';
import { rescueScar, turnedAway } from '../sim/rescue.ts';

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
import type { PendingFlyby, PendingLink, ScoreAward, ScoreState } from './types.ts';

/**
 * Ticks between periapsis and the grab award landing.
 *
 * Long enough that it reads as "you swung through and came out", short enough to
 * still be the same moment. At the bottom of a dive the ship is moving fastest,
 * so two ticks is a visible distance travelled rather than a pause.
 */
const GRAB_AWARD_DELAY = 2;

/**
 * Speed at closest approach below which a flyby pays nothing, in px/s.
 *
 * Measured, and the measurement is the interesting part: it is a FLOOR under a
 * dead tail, not a bar that selects fast passes. Across 167 unconverted flyby
 * closest approaches replayed out of `diagnostics/`, speed runs p10 149, p25 290,
 * p50 314, p90 400 — because an unconverted flyby is unbound by definition, so
 * its speed is pinned near escape velocity and cannot say who was going fast.
 * What the bottom decile IS is the puttered-out flyby: braked below
 * `flybyBrakeMinSpeed`, going nowhere, waiting to be dropped. That is what this
 * excludes.
 *
 * Any value in [150, 243) selects exactly the same 90% — the distribution is
 * empty between p10 and p15 — so the number is legible rather than fitted to the
 * last pixel. What decides who gets paid is how MANY of these a life strings
 * together, which is the density the streak already reads: 2.7 a minute in
 * ordinary play against upward of 38 in a fast one.
 */
export const FLYBY_SPEED_MIN = 150;

/**
 * Degrees of heading swept below which a pass is not a scoring event at all.
 *
 * A constant and not a weight, by the rule in AGENTS.md: it decides WHEN a flyby
 * is judged, never what one costs. `ScoreConfig.flybyTurnSpan` is the half that
 * costs, and it is the half that does most of the work here.
 *
 * What THIS one exists for is the ladder. The award scales to nothing on its own
 * as the turn goes to zero, but `awardFlyby` also steps the streak, and a step is
 * not divisible — so without a floor a press that bent the ship by two degrees
 * would still climb the multiplier every later award is paid at. That is the
 * compounding half of the reported exploit, and the half a span cannot reach.
 *
 * Refusing costs a run nothing beyond the step: a flyby that does not qualify is
 * a non-event exactly as a dive abandoned early is, so it does not BREAK a
 * streak, it only fails to advance one.
 *
 * Eight degrees, measured. Sorted, the 249 paid flybys in `diagnostics/` have a
 * gap between 7.63 and 9.47 — every value in that band selects the identical 23
 * passes, 9.6% of the corpus. On the other side, synthetic taps aimed at closest
 * approach sweep p50 1.4-4.7 degrees and p90 3.0-9.4, so the floor sits above the
 * tap distribution and below all but one verified real pass.
 *
 * The one session in the corpus that was actually PLAYED under the flyby award
 * confirms the placement from the other direction: its shortest press, 7 ticks,
 * swept 8.7 degrees and had been paid 442. It is the only pass in that session
 * anywhere near this line, and the next shortest press up — 13 ticks, 10.1
 * degrees — had been paid 977.
 */
export const FLYBY_TURN_MIN = 8;

export function createScoreState(): ScoreState {
  return {
    score: 0,
    best: 0,
    streak: 0,
    multiplier: 1,
    grabs: 0,
    links: 0,
    flybys: 0,
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
    capTurn: 0,
    periSeen: false,
    grabDue: -1,
    flybyR: Infinity,
    flybyFalling: false,
    pendingFlyby: null,
    recklessStreak: 0,
    capKinked: false,
    inKink: false,
    inHardKink: false,
    putterOuts: 0,
    claimed: [],
    rescue: null,
    rescued: [],
    doomed: null,
    hopped: [],
    wasCharged: false,
    hopTotal: 0,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The live multiplier: the streak ladder, and nothing else.
 *
 * An anomaly used to raise the ceiling here for ten seconds. It no longer does —
 * the anomaly's reward is the charged window, which is spent rather than
 * received, and a hop pays flat outside this function entirely. See
 * `ScoreConfig.hopBonus`.
 */
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
  sc.pendingFlyby = null;
  sc.streak = 0;
  // A death ends a reckless run too. Flying like that into the ground is not the
  // same as getting away with it three times.
  sc.recklessStreak = 0;
  sc.capKinked = false;
  sc.inKink = false;
  sc.inHardKink = false;
  sc.climbFromY = null;
  // The claim log clears, so a new life may take an anomaly it already took in
  // the last one — the once-only rule exists to stop a window being refreshed by
  // re-grabbing the same body in one flight, not to retire it from the field.
  sc.claimed.length = 0;
  // A rescue that had not yet turned the ship away dies with the life it was
  // meant to save, and the paid list clears with everything else: a new life may
  // be rescued by the same planet, exactly as it may re-claim an anomaly.
  sc.rescue = null;
  sc.rescued.length = 0;
  sc.doomed = null;
  sc.hopped.length = 0;
  // A death ends the window without a tally. Left set, the falling edge would be
  // seen on the first tick after the respawn and the player would be shown a
  // total for a frenzy that ended in a crash.
  sc.wasCharged = false;
  sc.hopTotal = 0;
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
/**
 * A charged window closing, and what its hops came to.
 *
 * Display only. Every point in it was banked as its hop landed — this restates
 * the window's total so the small per-hop numbers can be receipts and the finale
 * can be the headline. It is emphatically NOT a fourth award: paying here as well
 * would double the window, and holding the points back until here would mean
 * dying mid-window cost you everything you had already earned.
 */
export interface Tally {
  tick: number;
  /** Points already paid across this window's hops. */
  points: number;
  /** How many bodies were hopped to. */
  hops: number;
}

export interface ScoreTick {
  awards: ScoreAward[];
  shouts: Shout[];
  /** At most one window can close on a tick. */
  tally: Tally | null;
}

/**
 * Advance the score by one tick. Call immediately after `stepSim`.
 *
 * It used to take `dt`, because it owned a duration: the ten-second anomaly bonus
 * window, which would have silently re-tuned itself if the timestep ever moved.
 * That window is now the simulation's — it grants an ability, not points, so it
 * had to be — and the scorer owns no duration at all again. A parameter kept
 * against a future need is a parameter every caller has to be told to ignore, so
 * it is gone; `state.tick` remains the only clock anything here reads.
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
  let tally: Tally | null = null;

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
    sc.multiplier = multiplierFor(sc, scfg);
    return { awards, shouts, tally };
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
    // Position from `shipWorldPos`, which resolves a capture's body-relative
    // coordinates — `state.ship` is stale during one, and a burn is by definition
    // something that only happens during one.
    const p = shipWorldPos(state);
    const heat = edgeHeat(
      p.x,
      p.y,
      fieldBounds(cfg, state.bodies),
      state.bodies,
      state.capture !== null,
      scfg,
    );
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

  // ---- a charged window opened: the hop log describes the window in progress
  //
  // Edge-detected off the simulation's own countdown rather than off the release
  // that opened it, so there is one definition of "a window is running" and the
  // scorer is reading it rather than keeping a second copy in step.
  const charged = state.chargedT > 0;
  if (charged && !sc.wasCharged) {
    sc.hopped.length = 0;
    sc.hopTotal = 0;
  }
  // The window ran out. Not a death — `endLife` clears `wasCharged`, so a crash
  // mid-frenzy never reaches here.
  if (!charged && sc.wasCharged && sc.hopTotal > 0) {
    tally = { tick: state.tick, points: sc.hopTotal, hops: sc.hopped.length };
  }
  sc.wasCharged = charged;

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
  // ---- the pass ended still being a pass: pay the flyby it was
  //
  // Ahead of the release below, so a flyby's award lands before anything the same
  // tick might do with the streak it just stepped.
  if (sc.pendingFlyby && !state.capture) {
    const f = sc.pendingFlyby;
    sc.pendingFlyby = null;
    // Null when the pass never turned the ship far enough to be one. Not a
    // failure and not a broken streak — see `FLYBY_TURN_MIN`.
    const flyby = awardFlyby(sc, state, scfg, f);
    if (flyby) awards.push(flyby);
  }

  if (sc.pending && !state.capture) {
    const p = sc.pending;
    sc.pending = null;
    if (p.earned) awards.push(awardLink(sc, state, scfg, p));
  }

  const cap = state.capture;

  // A capture that ended without ever being thrown around breaks the run. Checked
  // before the branch below so it sees the capture that just went away.
  if (sc.wasCaptured && !cap) {
    // Let go of before it ever turned away: the press was not a rescue after all.
    // Cleared here rather than left to expire, so a later capture cannot inherit
    // a quality that was read at a different press against a different wall.
    sc.rescue = null;
    sc.doomed = null;
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
      const armed = armRescue(sc, state, cfg, scfg, dt);
      sc.rescue = armed.rescue;
      sc.doomed = armed.doomed;
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
      sc.capTurn = 0;
      sc.periSeen = false;
      sc.grabDue = -1;
      sc.flybyR = Infinity;
      sc.flybyFalling = false;
      sc.pendingFlyby = null;
    }

    // ---- the flyby award: owed at the bottom of the pass, paid when it ends
    //
    // The bottom is where a pass is decided, so that is where its qualities are
    // read — but it is not yet where the pass has finished being one. See
    // `PendingFlyby`: a flyby can bottom out unbound, arc back on the brake and
    // convert, and paying here would pay a single press twice.
    //
    // `stepSim` does not find this periapsis itself — its detection is gated on
    // `phase !== 'flyby'`, because a flyby has no orbit to freeze — so the
    // observer runs the same rising-edge test on the radius it can already see.
    if (cap.phase === 'flyby') {
      const r = hypot(cap.rx, cap.ry);
      const dR = r - sc.flybyR;
      if (sc.flybyFalling && dR >= 0) {
        // Cleared on the edge whether or not anything was owed, or the test stays
        // true for every remaining tick of the outbound leg and fires once a tick.
        sc.flybyFalling = false;
        sc.pendingFlyby ??= readPendingFlyby(sc, state, scfg, cap, r);
      } else if (dR < 0) sc.flybyFalling = true;
      sc.flybyR = r;
    } else {
      // It converted. The pass became a capture, so the grab award is the one
      // that describes it and the flyby is owed nothing — that is what stops one
      // press paying twice, and what keeps a zip from being a discount.
      sc.flybyR = Infinity;
      sc.flybyFalling = false;
      sc.pendingFlyby = null;
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

    // ---- how far this pass has swung the ship around, accumulating
    //
    // The same `cap.defl` the line above takes a maximum of, integrated instead.
    // Two readings of one measurement: the worst tick says how rough the ride
    // was, the sum says how much of a ride it was at all. See `capTurn` for why
    // this is swept rather than net.
    sc.capTurn += cap.defl;

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

    // ---- the rescue: paid the instant the ship stops closing on the wall
    //
    // The award describes the press, but it waits on the outcome, because the
    // press alone cannot tell a rescue from a death: a press past the cross looks
    // identical until the ship fails to come back. Turning away is what the cross
    // promises, so it is what the points are settled against.
    if (sc.rescue) {
      const r = sc.rescue;
      if (turnedAway(cap, r.wall)) {
        sc.rescue = null;
        const award = awardRescue(sc, state, scfg, r);
        if (award) awards.push(award);
      }
    }

    // A press past the cross that turned away anyway. Rare — 6% of them — and the
    // prediction was wrong about that one, so the omen is withdrawn rather than
    // left standing over a ship that is plainly fine.
    if (sc.doomed && turnedAway(cap, sc.doomed.wall)) sc.doomed = null;

    sc.pending = readPending(state, cfg, scfg, cap, sc.grabSkim, sc.maxDefl);
  } else {
    // Held so the next grab can measure the line it came in on — see
    // `skimClearance`. Nothing else happens while drifting.
    const { ship } = state;
    sc.lastDrift = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
  }
  sc.wasCaptured = cap !== null;

  sc.multiplier = multiplierFor(sc, scfg);
  if (sc.score > sc.best) sc.best = sc.score;
  if (awards.length > 0) sc.lastAward = awards[awards.length - 1]!;
  return { awards, shouts, tally };
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
  const multiplier = multiplierFor(sc, scfg);
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
    // Nor is the turn: a capture is judged on the orbit it reached, and the arc
    // it took to get there is the flyby award's question.
    timing: 0,
    aim: 0,
    climb: 0,
    heat: 0,
    turn: 0,
  };
  const body = state.bodies[cap.planet];

  // ---- a hop: a zipped arrival at a planet, inside a charged window
  //
  // Read off `cap.zipped` and NOT off the live window, and that difference is the
  // rule: a zip is committed at the press, and the 0.45s glide it buys can easily
  // outlast the countdown. Re-checking here would mean a hop begun legally inside
  // the window silently paid nothing because it landed a tick late — punishing the
  // player for the one thing the window is asking them to do, which is hurry.
  //
  // An anomaly is never a hop even when zipped to. Arriving at one is the thing
  // `anomalyBonus` exists to pay for, and it opens the next window; calling that a
  // hop would replace the largest award in the game with a flat 500 and quietly
  // make chaining anomalies worth less than chaining planets.
  if (cap.zipped && body && body.kind !== 'anomaly' && !sc.hopped.includes(body.name)) {
    sc.hopped.push(body.name);
    award.kind = 'hop';
    // Flat. The only award in the game that does not take the multiplier — see
    // `ScoreConfig.hopBonus` — so it carries the multiplier it was actually paid
    // at rather than the one in force, which the popup would otherwise print.
    award.multiplier = 1;
    award.points = scfg.hopBonus;
    sc.score += award.points;
    sc.hopTotal += award.points;
    sc.grabs++;
    return award;
  }

  // An anomaly pays its own flat award on top of whatever the arrival was worth.
  // Once per life: without the claim log a player could orbit out and back to
  // refresh the window indefinitely, which is the same faucet the grab award
  // already refuses to open by paying at the press.
  let anomaly = 0;
  if (body?.kind === 'anomaly' && !sc.claimed.includes(body.name)) {
    sc.claimed.push(body.name);
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
 * Read the rescue this press was, or null if it was not one.
 *
 * Called on the FIRST tick of a capture and never again. The quality is a
 * property of the instant the button went down, and one tick later the drift it
 * was measured against no longer exists.
 *
 * `sc.lastDrift` is the state `beginCapture` actually read — held for exactly
 * this kind of question, and not interchangeable with the capture's own
 * `rx`/`ry`, which `stepCapture` has already advanced by a tick on this same
 * tick. Everything else is taken from the live state: `clear` is the free phase,
 * so the fuel a rescue would have to brake with has not moved yet.
 *
 * COST. This runs `rescueScar`, which forward-simulates. It is affordable because
 * it happens once per capture and because the great majority of presses take its
 * cheap refusal — measured over the corpus, 37% of presses are made while
 * committed to a wall and the other 63% never reach the projection at all.
 */
function armRescue(
  sc: ScoreState,
  state: SimState,
  cfg: SimConfig,
  scfg: ScoreConfig,
  dt: number,
): { rescue: ScoreState['rescue']; doomed: ScoreState['doomed'] } {
  const none = { rescue: null, doomed: null };
  const cap = state.capture;
  const drift = sc.lastDrift;
  if (!cap || !drift) return none;
  const body = state.bodies[cap.planet];
  if (!body) return none;

  const pre: SimState = {
    ...state,
    capture: null,
    ship: { ...state.ship, x: drift.x, y: drift.y, vx: drift.vx, vy: drift.vy },
    ending: { ...state.ending },
    telemetry: { ...state.telemetry },
    bodies: state.bodies.slice(),
  };
  const scar = rescueScar(pre, cfg, dt);
  if (!scar) return none;

  // Past the last press that could have worked. Asked before the once-per-body
  // rule below, deliberately: whether the run is lost is not a question about
  // whether it has already been paid.
  //
  // It is still armed at the top of the scale. The only way such a press can ever
  // collect is by turning the ship away regardless — which happens 6% of the time,
  // because the prediction is conservative — and a press that beats a prediction
  // pinned to the tick has earned the top of the scale. The omen is withdrawn on
  // the same event that pays it.
  if (!scar.cross) {
    const doomed = { wall: scar.wall, tick: state.tick };
    if (sc.rescued.includes(body.name)) return { rescue: null, doomed };
    return { rescue: { wall: scar.wall, quality: 1, body: body.name }, doomed };
  }

  // Once per body per life. A drag along the wall hangs off one distant planet,
  // so without this the tightest rescue would also be the most repeatable one.
  if (sc.rescued.includes(body.name)) return none;

  const quality = clamp01(1 - scar.cross.t / Math.max(1e-6, scfg.rescueSpan));
  return { rescue: { wall: scar.wall, quality, body: body.name }, doomed: null };
}

/**
 * Pay a rescue that turned the ship away from the wall.
 *
 * Nothing here reads how deep it went, deliberately. That is the burn's
 * quantity, integrated over the fire and already paid; this pays for the decision
 * that set the fire up. See `ScoreConfig.rescueBonus`.
 */
function awardRescue(
  sc: ScoreState,
  state: SimState,
  scfg: ScoreConfig,
  r: NonNullable<ScoreState['rescue']>,
): ScoreAward | null {
  const multiplier = multiplierFor(sc, scfg);
  const points = Math.round(scfg.rescueBonus * r.quality * multiplier);
  // A rescue so loose it rounds to nothing pays nothing and says nothing, the
  // same rule `awardGrab` and `awardBurn` both keep.
  if (points <= 0) return null;
  sc.rescued.push(r.body);
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'rescue',
    points,
    multiplier,
    body: r.body,
    // Arrival and release qualities belong to the grab and the link. Reported as
    // absent so nothing downstream can pay or praise them a second time.
    close: 0,
    clearance: Infinity,
    skim: Infinity,
    defl: 0,
    // The one quality this award carries, on the axis it is about: how much of
    // the rescue window was spent. Carried in `timing` rather than in a field of
    // its own because it IS a timing, and `tools/replay.ts` already prints that
    // column.
    timing: r.quality,
    aim: 0,
    climb: 0,
    // The heat the ship was at when it turned away, which is the whole of what
    // makes a rescue a TIGHT one — "the player would've been in the flames
    // section of the side". `praiseEscape` reads it and nothing else, so the word
    // needs no threshold. The burn block above has already updated `burnHeat` for
    // this tick, so this is the same heat the flame beside the ship is drawing at.
    heat: sc.burnHeat,
    // A rescue is paid for one decision at one instant. How far the ride swung
    // the ship is the flyby's quantity, and the capture this happened inside is
    // still running — there is no finished pass here to report.
    turn: 0,
  };
  sc.score += points;
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
 * would come up short by every burn. The player sees the number climb afterwards
 * instead: the popup rolls it up over 0.8s, deliberately longer than the 0.45s
 * drag it is summing, so it reads as a tally rather than a replay.
 */
function awardBurn(sc: ScoreState, state: SimState, scfg: ScoreConfig): ScoreAward | null {
  if (sc.burnBank <= 0) return null;
  const raw = sc.burnBank;
  const peak = sc.burnPeak;
  sc.burnBank = 0;
  sc.burnPeak = 0;

  const multiplier = multiplierFor(sc, scfg);
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
    turn: 0,
  };
  sc.score += points;
  sc.burns++;
  return award;
}

/**
 * Pay for a pass that was never a capture.
 *
 * Owed at the closest approach, which is where the pass was decided, and paid
 * when the pass ends still being one — see `PendingFlyby` for why those are two
 * different moments and what went wrong when they were the same one. Paying at
 * the press would be paying for the intention, exactly as it would for a grab.
 *
 * AND IT STEPS THE STREAK, which is the larger half of what this award does. The
 * ladder was a count of links, so it could only be climbed by stopping at bodies
 * — a life measured covering 3.1x the ground per second was stuck at x2 while a
 * chained one ran at x5-x7, and earned a fifteenth as much per pixel climbed for
 * flying the harder line. Nothing about that was a decision anyone made; the
 * counter simply could not see the style.
 *
 * Whether the pass was one at all is settled by `readPendingFlyby`. Whether it
 * EARNED anything is settled at the release, by how far it turned the ship — the
 * one quality of a pass that is still being made when the bottom goes by. See
 * `FLYBY_TURN_MIN` and `ScoreConfig.flybyTurnSpan`.
 */
function readPendingFlyby(
  sc: ScoreState,
  state: SimState,
  scfg: ScoreConfig,
  cap: Capture,
  r: number,
): PendingFlyby | null {
  // A flyby braked below this is not going fast past anything — it has puttered
  // out and is waiting to be dropped. See `FLYBY_SPEED_MIN`, and note it is a
  // floor under a dead tail rather than a bar that picks out fast passes: it
  // cannot be one, because every unconverted flyby is fast by definition.
  if (hypot(cap.vx, cap.vy) < FLYBY_SPEED_MIN) return null;
  const clearance = Math.max(0, r - cap.minR);
  return {
    body: state.bodies[cap.planet]?.name ?? '?',
    // Measured HERE, not at the press: a flyby's press is not the choice, the
    // pass is. See `close` in `./types.ts`.
    close: clamp01(1 - clearance / scfg.closeSpan),
    clearance,
    // The approach line the press was made on, which means the same thing for a
    // flyby as for a grab. It names nothing here — `isNerveGrab` is gated on the
    // kind — but it is real and measured, so it travels into the report.
    skim: sc.grabSkim,
    defl: sc.maxDefl,
  };
}

function awardFlyby(
  sc: ScoreState,
  state: SimState,
  scfg: ScoreConfig,
  p: PendingFlyby,
): ScoreAward | null {
  // How far the pass actually swung the ship, which is the whole of what a flyby
  // is paid for. Read HERE and not in `readPendingFlyby` with the other
  // qualities, because unlike them it is not finished at the bottom: the outbound
  // half of a pass steers as much as the inbound half, and a player who holds
  // through the swing has earned all of it.
  //
  // It measures what it does because gravity acts on the ship ONLY while it is
  // captured — an uncaptured ship drifts in a dead straight line — so every
  // degree here was bought by keeping the button down next to a planet. That is
  // what makes one number cover both halves of what was asked for: some pressing,
  // and some course altering.
  const turn = sc.capTurn;
  if (turn < FLYBY_TURN_MIN) return null;

  const raw =
    (scfg.flybyBase + p.close * scfg.flybyCloseBonus) * clamp01(turn / scfg.flybyTurnSpan);
  const multiplier = multiplierFor(sc, scfg);
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'flyby',
    points: Math.round(raw * multiplier),
    multiplier,
    body: p.body,
    close: p.close,
    clearance: p.clearance,
    skim: p.skim,
    defl: p.defl,
    turn,
    // Release qualities. There is no release: the ship never stopped.
    timing: 0,
    aim: 0,
    climb: 0,
    // Nor is it a burn: a flyby is not captured, and only a captured ship can be
    // dragged along the dead zone.
    heat: 0,
  };
  sc.score += award.points;
  sc.flybys++;
  sc.streak++;
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

  const multiplier = multiplierFor(sc, scfg);
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
    turn: 0,
  };
  award.points = Math.round(raw * multiplier);
  sc.score += award.points;
  sc.links++;
  sc.streak++;
  return award;
}
