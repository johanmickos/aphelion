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
import { BURN_MIN_HEAT, edgeHeat } from './burn.ts';
import { rescueDeadline, turnedAway, wallAt } from '../sim/rescue.ts';

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
import type { PendingFlyby, PendingLink, RunStats, ScoreAward, ScoreState } from './types.ts';

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
    bank: 0,
    carry: 0,
    carryCold: 0,
    carryPx: 0,
    chain: 0,
    coastClimb: 0,
    lastHighY: 0,
    best: 0,
    streak: 0,
    multiplier: 1,
    grabs: 0,
    links: 0,
    flybys: 0,
    burns: 0,
    burnHeat: 0,
    burnPeak: 0,
    fireHeatSecs: 0,
    fireSpan: 0,
    band: 1,
    lastAward: null,
    pending: null,
    endingSeen: false,
    lastDrift: null,
    wasCaptured: false,
    grabSkim: Infinity,
    grabClearance: Infinity,
    maxDefl: 0,
    capTurn: 0,
    periSeen: false,
    flybyR: Infinity,
    flybyFalling: false,
    pendingFlyby: null,
    recklessStreak: 0,
    capKinked: false,
    inKink: false,
    inHardKink: false,
    putterOuts: 0,
    claimed: [],
    doomed: null,
    hopped: [],
    motes: 0,
    wasCharged: false,
    hopCarry: 0,
    run: emptyRun(),
    lastRun: null,
    driftTicks: 0,
    lastEnding: null,
    sessionMax: emptyRun(),
  };
}

/** A run that has measured nothing yet. */
function emptyRun(): RunStats {
  return {
    ticks: 0,
    topSpeed: 0,
    distance: 0,
    peakChain: 0,
    fireSecs: 0,
    roughPasses: 0,
    impacts: 0,
    anomalies: 0,
    score: 0,
    highWaterY: 0,
  };
}

/**
 * Fold a finished run into the session's element-wise maximum.
 *
 * Every field is a max, including the ones where a larger number is a worse
 * pilot. See `sessionMax` for why that is deliberate rather than sloppy.
 */
function foldSessionMax(max: RunStats, run: RunStats): void {
  max.ticks = Math.max(max.ticks, run.ticks);
  max.topSpeed = Math.max(max.topSpeed, run.topSpeed);
  max.distance = Math.max(max.distance, run.distance);
  max.peakChain = Math.max(max.peakChain, run.peakChain);
  max.fireSecs = Math.max(max.fireSecs, run.fireSecs);
  max.roughPasses = Math.max(max.roughPasses, run.roughPasses);
  // A session total rather than a maximum: a run either crashed or it did not,
  // so a max over 0-or-1 would only ever say "you crashed at least once".
  max.impacts += run.impacts;
  max.anomalies = Math.max(max.anomalies, run.anomalies);
  max.score = Math.max(max.score, run.score);
  // Up is negative, so the furthest climb is the SMALLEST y.
  max.highWaterY = Math.min(max.highWaterY, run.highWaterY);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Metres, priced but unpaid — Direction 08's carry, accrued a tick at a time.
 *
 * THE ONLY PLACE POINTS ARE MADE. Everything else in this file multiplies what
 * this produced. Axiom 1: progress is the only base currency, metres climbed
 * while engaged — not time, not kills, not combos of combos.
 *
 * THE GATE. `highWaterY` only ratchets, so a dip inside an orbit cannot accrue
 * negative ground. While captured, every metre counts and the coast resets. While
 * drifting, metres count until the ship has climbed `cfg.grabRange` without
 * engaging anything — after that it is out of reach of everything it left, which
 * is aimless drift by the game's own definition rather than by a number chosen
 * for the economy. It is measured rather than argued: at the board's own rung
 * (25px) the gate leaves 58.6% of all corpus climb unpaid, which is 93% of the
 * way to paying only for captured metres and re-decides by the back door a
 * question that was answered the other way; at `grabRange` it leaves 7.3%.
 *
 * The gate is also what breaks the chain, on the same edge and for the same
 * reason. See `ScoreState.coastClimb` for the per-body-reach rule that comes with
 * reading the global.
 *
 * THE CHAIN PRICES THE METRES AS THEY ARE CLIMBED, which is what puts it inside
 * the carry rather than beside the streak in the cash step. A long chain is
 * therefore worth more for the ground it is covering NOW, and the carry the
 * player can see glowing already has it in.
 */
function accrueCarry(sc: ScoreState, state: SimState, cfg: SimConfig, scfg: ScoreConfig): void {
  const high = state.highWaterY;
  // A fresh life, or the first tick of the session: seed and accrue nothing.
  if (sc.lastHighY === 0) {
    sc.lastHighY = high;
    return;
  }
  const gained = Math.max(0, sc.lastHighY - high);
  sc.lastHighY = high;
  const cold = scfg.climbPerPx * (1 + scfg.chainStep * sc.chain);
  // THE FIRE IS A RATE, NOT A BAND. Metres climbed inside the dead zone are worth
  // more per metre, in proportion to how deep they were climbed — which is what
  // the hazard gradient has always drawn and what the old ladder could not say.
  //
  // It sits here, beside the chain, because this is where an axis that describes
  // how the swing was FLOWN belongs: F04's own ruling re-homed grab quality the
  // same way ("Grab quality prices the carry instead, which is where the board
  // already puts chain"). The band lived at the cash step only because it was
  // integrated as a bank, and that placement is what let a two-tenths-of-a-second
  // graze double 813px of climb earned nowhere near the wall.
  //
  // MEAN HEAT ACROSS THE STRETCH THE METRES WERE EARNED OVER, NOT THIS TICK'S.
  // The first version of this read `sc.burnHeat` directly and was wrong in exactly
  // the way it was written to fix. `SimConfig.holdClimbInCapture` freezes
  // `highWaterY` for the whole of a capture, so a swing's metres do not arrive a
  // tick at a time — they arrive as ONE LUMP on the release tick. Sampling the
  // heat there prices an entire capture's climb at whatever the ship happened to
  // be doing in its final frame, which is the same defect relocated: a graze at
  // the instant of release would have paid the whole swing at full rate.
  //
  // So the heat is integrated between one arrival of metres and the next, and the
  // lump is priced at the average over that stretch. A two-tenths-of-a-second
  // graze inside a three-second capture is worth two tenths of three seconds of
  // fire; a ride that spends the whole capture at the wall is worth all of it.
  const mean = sc.fireSpan > 0 ? sc.fireHeatSecs / sc.fireSpan : sc.burnHeat;
  const rate = cold * (1 + scfg.fireBoost * mean);
  // `sc.wasCaptured` and not only `state.capture`, and the difference is a whole
  // capture's ground. `SimConfig.holdClimbInCapture` freezes `highWaterY` for the
  // duration of a capture — deliberately, because an orbit is a round trip and
  // counting the near side's height would put the trailing floor at the apex the
  // far side then flies into — so the mark does not move at all while the ship is
  // attached and then jumps by the whole climb on the tick it lets go.
  //
  // That lump is engaged ground arriving one tick late, not a coast. Read through
  // `state.capture` alone it was being clipped to whatever the gate had left, and
  // a 880px swing banked 560 of it. `wasCaptured` is still last tick's value here,
  // because `scoreTick` updates it at the bottom, so the release tick sees the
  // capture it just ended.
  //
  // It also settles where the orbiting faucet is closed: it is closed in the
  // SIMULATION, by the held mark, which is why nothing here needs a rule about
  // laps. Altitude while orbiting is zero because the mark says so.
  if (state.capture || sc.wasCaptured) {
    sc.coastClimb = 0;
    sc.carryPx += gained;
    sc.carry += gained * rate;
    sc.carryCold += gained * cold;
    if (gained > 0) {
      sc.fireHeatSecs = 0;
      sc.fireSpan = 0;
    }
    return;
  }
  const allowed = Math.max(0, cfg.grabRange - sc.coastClimb);
  const paid = Math.min(gained, allowed);
  sc.carryPx += paid;
  sc.carry += paid * rate;
  sc.carryCold += paid * cold;
  if (gained > 0) {
    sc.fireHeatSecs = 0;
    sc.fireSpan = 0;
  }
  sc.coastClimb += gained;
  // Out of reach of everything it left. The metres stopped counting on the tick
  // above; the chain stops here, so there is one edge and not two thresholds to
  // keep in step.
  if (sc.coastClimb >= cfg.grabRange) sc.chain = 0;
}

/**
 * An arrival prices everything carried into it.
 *
 * TIGHTNESS, and it is the whole of what used to be `closeBonus`, `nerveBonus`
 * and `flybyCloseBonus` — three flat sums paid at three moments for one quantity,
 * clearance above the minimum orbit. It scales from 1 at `closeSpan` to
 * `tightMax` at the surface, so a loose arrival is never a penalty: rewards are
 * withheld, nothing is taken away.
 *
 * WHY THE WHOLE CARRY AND NOT THE MOMENT. Direction 08's grade prices everything
 * carried through the orbit rather than awarding a flat bonus, and the arrival is
 * the half of that a capture settles first — `AGENTS.md`'s rule that a capture is
 * two scoring events, with the reason updated: a tap in place has climbed zero
 * metres, so `0 * anything = 0` and the faucet the old reason feared is now
 * structurally impossible. What the rule survives on is the receipt.
 *
 * The receipt is the carry visibly jumping at the bottom of the dive, and the
 * pixel that announced it beforehand is the `closeSpan` gradient the minimum-orbit
 * ring draws above itself.
 *
 * A NERVE GRAB LANDS AT THE TOP OF IT BY CONSTRUCTION. A line already headed
 * inside the minimum orbit has no clearance left, so the axis `nerveBonus` used
 * to pay flat is now the extreme of the one this reads — which is what makes it
 * one term instead of a threshold bolted onto a ramp.
 */
function priceArrival(sc: ScoreState, scfg: ScoreConfig, clearance: number): void {
  const close = clamp01(1 - clearance / scfg.closeSpan);
  const tight = 1 + (scfg.tightMax - 1) * close;
  sc.carry *= tight;
  // The cold twin takes every multiply the real carry takes except the fire, so
  // `carry / carryCold` isolates the fire and nothing else. Miss this and the
  // receipt's FIRE figure quietly becomes "fire times tightness".
  sc.carryCold *= tight;
}

/**
 * How well the swing was released, on Direction 06's ladder.
 *
 * THE CONJUNCTION, not the angle. VISION pillar 2 is that the boost envelope and
 * the release marker FIGHT — the boost peaks a fixed interval after the orbit
 * freezes and the marker sits at a fixed angle, so hitting both means shaping the
 * dive to bring them together, and "the scoring layer only gives it a name". An
 * angle-only tier would grade a perfectly aimed release at a dead envelope as
 * PERFECT, which deletes half of the pillar from scoring.
 *
 * A PASS GRADES ON ONE AXIS THROUGH THE SAME FUNCTION, by passing its swept turn
 * as both. That is not a trick: the thresholds are `zone^aimSharpness *
 * zone^timingSharpness`, so a single quality raised to the same total exponent
 * lands on exactly the same rungs, and there is one ladder rather than two sets
 * of thresholds free to drift apart.
 *
 * ONE LADDER IS NOT THE SAME AS ONE DISTRIBUTION, and it took a measurement to
 * see it. The rungs are the same on both manoeuvres by construction, but the
 * quantities fed into them are not the same shape, so the same rung can catch
 * half of all passes and a fifth of all releases — which it did. That is what
 * `ScoreConfig.flybyTurnSpan` is for, and why it is calibrated against the
 * releases rather than against the passes alone.
 */
function tierQuality(scfg: ScoreConfig, aim: number, timing: number): number {
  return Math.pow(aim, scfg.aimSharpness) * Math.pow(timing, scfg.timingSharpness);
}

/** The rung that quality earned, as its multiplier. 1 for a release under TRUE. */
function tierFor(scfg: ScoreConfig, q: number): number {
  if (q >= scfg.tierPerfectAt) return scfg.tierPerfect;
  if (q >= scfg.tierSharpAt) return scfg.tierSharp;
  if (q >= scfg.tierTrueAt) return scfg.tierTrue;
  return 1;
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
  // The live run only. `lastRun` is a sealed copy taken by the caller before this
  // point, and `sessionMax` outlives every life by construction.
  sc.run = emptyRun();
  sc.bank = 0;
  // The carry dies with the life it was at stake in — that IS what "at stake"
  // means, and it is the one part of Direction 08's death rule that is universal
  // across the mode matrix. What varies by mode is the bank.
  sc.carry = 0;
  sc.carryCold = 0;
  sc.carryPx = 0;
  sc.chain = 0;
  sc.coastClimb = 0;
  // Not reset to a value: reseeded by the next tick from the new life's own
  // `highWaterY`, so a respawn far below cannot register as a mountain of climb.
  sc.lastHighY = 0;
  sc.pending = null;
  sc.pendingFlyby = null;
  sc.streak = 0;
  // A death ends a reckless run too. Flying like that into the ground is not the
  // same as getting away with it three times.
  sc.recklessStreak = 0;
  sc.capKinked = false;
  sc.inKink = false;
  sc.inHardKink = false;
  // The claim log clears, so a new life may take an anomaly it already took in
  // the last one — the once-only rule exists to stop a window being refreshed by
  // re-grabbing the same body in one flight, not to retire it from the field.
  sc.claimed.length = 0;
  // The omen dies with the ship it was over. Nothing is paid or withheld by it —
  // see `ScoreState.doomed` — but a fresh ship must never be born under one.
  sc.doomed = null;
  sc.hopped.length = 0;
  // A death ends the window without a tally. Left set, the falling edge would be
  // seen on the first tick after the respawn and the player would be shown a
  // total for a frenzy that ended in a crash.
  sc.wasCharged = false;
  sc.hopCarry = 0;
  // The carpet's dots come back with the ship — `respawn` un-takes them — so the
  // tally they are counted against has to come back too, or the next life's first
  // dot would look like one already collected.
  sc.motes = 0;
  // The band a hot swing had earned is dropped rather than cashed. Flying into
  // the ground is how a hot pass goes wrong, and the multiplier it would have
  // cashed at is exactly what the death is taking — 78% of edge drags end this
  // way, which is what makes the fire a stake rather than a bonus.
  sc.burnHeat = 0;
  sc.burnPeak = 0;
  // The new life starts where the old one did, not adrift for as long as the
  // last one was. `lastEnding` has already been sealed off this by the time this
  // runs — the same ordering `lastRun` depends on.
  sc.driftTicks = 0;
}

/**
 * What one tick produced, on two channels.
 *
 * `awards` are points changing hands. `shouts` are the game reacting to how the
 * ship is being flown and cost nothing — see `src/score/reckless.ts` for why they
 * are not the same thing.
 */
/**
 * A charged window closing, and what it was worth.
 *
 * Display only, and it always was — but what it restates has changed. It used to
 * sum the flat `hopBonus` each hop had already been paid; hops pay nothing now,
 * so what a frenzy is worth is the ground it covered at a chain that stepped on
 * every body it touched. That is `ScoreState.hopCarry`, and it is CARRIED rather
 * than banked: it cashes at the next release like any other metre, and a death
 * inside the window takes it like any other carry.
 *
 * It is emphatically NOT an award. Nothing is paid here, then or now.
 */
export interface Tally {
  tick: number;
  /** Carry accrued while the window was open. Already in `ScoreState.carry`. */
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

  // How long the ship has been adrift, counted before anything else so the
  // ending block below reads the drift that reached the wall rather than one
  // tick short of it. A capture zeroes it: hanging off a planet is not drifting,
  // which is the same distinction `edgeHeat` draws to decide what burns.
  if (state.capture) sc.driftTicks = 0;
  else sc.driftTicks++;

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
      // ---- seal the run BEFORE the reset that is two lines below
      //
      // Order is the whole point. `endLife` clears everything the sheet wants to
      // report, and it runs on this same tick — so a summary read afterwards is a
      // summary of nothing. Reading the final numbers here, into a copy that
      // survives, is what makes a post-mortem possible.
      sc.run.impacts = state.ending.reason === 'impact' ? 1 : 0;
      sc.run.score = sc.bank;
      sc.run.highWaterY = state.highWaterY;
      sc.lastRun = { ...sc.run };
      // Which wall, and how long the ship had been adrift when it reached one.
      //
      // `wallAt` rather than a second copy of the same three comparisons — the
      // predictor already owns that definition and this is the second caller it
      // was exported for. It returns null for the floor and for an ending that is
      // not at a boundary at all, which is exactly when the debrief should say
      // nothing.
      sc.lastEnding =
        state.ending.reason === 'out-of-bounds'
          ? (() => {
              const wall = wallAt(fieldBounds(cfg, state.bodies), state.ending.x, state.ending.y);
              return wall ? { wall, driftSecs: sc.driftTicks * dt, alight: sc.burnHeat > 0 } : null;
            })()
          : null;
      foldSessionMax(sc.sessionMax, sc.lastRun);
      endLife(sc);
    }
    sc.putterOuts = state.telemetry.putterOuts;
    sc.multiplier = multiplierFor(sc, scfg);
    return { awards, shouts, tally };
  }
  sc.endingSeen = false;

  // ---- the fire, BEFORE the carry, because it prices it
  //
  // This block used to sit below the awards and integrate `burnBank`, which chose
  // a band the whole swing then cashed in. That is gone: the fire is a RATE on the
  // metres climbed inside it, so it has to be known before `accrueCarry` runs.
  //
  // Placed outside the capture branch so a release mid-burn still counts the tick
  // it let go on. A player will let go at the hottest instant on purpose — it is
  // also the best boost — and those metres are the ones worth the most.
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
    if (heat > BURN_MIN_HEAT) {
      // A flare beginning. Counted here rather than at an award, so `burns` still
      // means what the replay prints it as: how many separate times this session
      // went into the red and came out.
      if (sc.burnHeat <= 0) sc.burns++;
      sc.burnHeat = heat;
      sc.run.fireSecs += dt;
      if (heat > sc.burnPeak) sc.burnPeak = heat;
    } else {
      sc.burnHeat = 0;
    }
    // The integral the next lump of metres will be priced at. Runs every tick,
    // hot or not, because the average has to be over the whole stretch — counting
    // only the hot ticks would price a graze as a wall-ride.
    sc.fireHeatSecs += sc.burnHeat * dt;
    sc.fireSpan += dt;
  }

  const carryBefore = sc.carry;
  accrueCarry(sc, state, cfg, scfg);

  // ---- what this life is measuring about itself
  //
  // Here rather than scattered through the award paths, because none of it is
  // about an award: these are facts about the flight that hold whether or not a
  // single point was scored. The two that DO hang off events — a rough passage
  // and an anomaly claim — are counted at their edges further down, next to the
  // edge detection that already exists for them.
  const flying = state.capture;
  const vx = flying ? flying.vx : state.ship.vx;
  const vy = flying ? flying.vy : state.ship.vy;
  const speed = hypot(vx, vy);
  sc.run.ticks++;
  if (speed > sc.run.topSpeed) sc.run.topSpeed = speed;
  // From speed, not from a position delta. A respawn teleports the ship the
  // length of the field, and differencing positions would bank that jump as
  // distance flown.
  sc.run.distance += speed * dt;
  if (sc.streak > sc.run.peakChain) sc.run.peakChain = sc.streak;

  // ---- dots flown through in the carpet
  //
  // Counted rather than event-driven, which is the observer's whole method: the
  // simulation emits nothing, so "a dot was taken" is recovered by noticing that
  // more of them are taken now than were last tick. Several can land on one tick
  // at speed, and each pays its own award — they merge into one receipt popup,
  // which is what a run of them should read as.
  if (state.motes.length > 0) {
    let taken = 0;
    for (const m of state.motes) if (m.taken) taken++;
    for (let i = sc.motes; i < taken; i++) awards.push(awardMote(sc, state, scfg));
    sc.motes = taken;
  }

  // ---- a charged window opened: the hop log describes the window in progress
  //
  // Edge-detected off the simulation's own countdown rather than off the release
  // that opened it, so there is one definition of "a window is running" and the
  // scorer is reading it rather than keeping a second copy in step.
  const charged = state.chargedT > 0;
  if (charged && !sc.wasCharged) {
    sc.hopped.length = 0;
    sc.hopCarry = 0;
  }
  // What the window built, measured as the carry it added rather than as points
  // it paid — nothing inside a window is paid any more. Taken from the delta
  // across `accrueCarry` above, so a hop's own tightness multiply is in it: a
  // frenzy flown tight is worth visibly more than one flown wide, which is the
  // whole reason to zip to the body rather than past it.
  if (charged) sc.hopCarry += Math.max(0, sc.carry - carryBefore);
  // The window ran out. Not a death — `endLife` clears `wasCharged`, so a crash
  // mid-frenzy never reaches here.
  // Gated on the HOPS and not only on the carry. A window that opened over a ship
  // that never zipped anywhere still accrues ground, because the ship is still
  // climbing — and a tally for that would be a receipt for the ordinary flying
  // that was going to happen anyway. The frenzy is the subject.
  if (!charged && sc.wasCharged && sc.hopped.length > 0 && sc.hopCarry > 0) {
    tally = { tick: state.tick, points: Math.round(sc.hopCarry), hops: sc.hopped.length };
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
    // Let go of before the ship ever turned away. Cleared here rather than left
    // to expire, so a later capture cannot inherit an omen that was read at a
    // different press against a different wall.
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
      sc.doomed = armDoom(sc, state, cfg, dt);
      // Every capture begun is an engagement, whether it converts, putters out or
      // sails past as a pass — so the chain steps here and not at any award. That
      // is where `hopBonus` went: a zip is an engagement, so a charged window
      // drives the chain rather than paying a flat sum a body.
      sc.chain++;
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
        const pass = readPendingFlyby(sc, state, scfg, cap, r);
        if (pass && !sc.pendingFlyby) {
          sc.pendingFlyby = pass;
          // A pass is an arrival too, and it prices the carry at the same moment
          // and on the same span a grab does — "grabs AND passes alike". This is
          // where `flybyCloseBonus` went, and it is the same term as
          // `closeBonus`: one quantity, one multiplier, two ways of arriving.
          priceArrival(sc, scfg, pass.clearance);
        }
      } else if (dR < 0) sc.flybyFalling = true;
      sc.flybyR = r;
    } else {
      // It converted. The pass became a capture, so its periapsis is the arrival
      // that prices the carry and its release is the cash — the flyby is owed
      // nothing. That is what stops one press being settled twice, and what keeps
      // a zip from being a discount.
      sc.flybyR = Infinity;
      sc.flybyFalling = false;
      sc.pendingFlyby = null;
    }

    // ---- the arrival: it prices the carry, once, when the swing has happened
    //
    // NOT AT THE PRESS, and that rule outlived the reason it was written with.
    // The old reason was a faucet: beside a planet you are already close to the
    // surface, so paying tightness at the press would make every tap a tight grab.
    // Under a pure multiplier a tap in place has climbed zero metres, so
    // `0 * anything = 0` and the faucet cannot exist. What survives is the
    // receipt — a capture is two scoring events, and this is the first of them.
    //
    // For a dive the arrival is periapsis, the moment the swing actually
    // occurred. For a zip it is the end of the glide, which is the same moment
    // wearing different clothes: the point at which the ship is where it was
    // going. Pricing either at the press would be pricing the intention.
    //
    // The two-tick delay this used to carry is gone with the popup it existed
    // for. A multiplier has to land when the act did, or the carry the player is
    // watching jumps two ticks after the thing that moved it.
    const arrived = cap.zipped ? cap.phase === 'orbit' : cap.passedPeri;
    if (!sc.periSeen && arrived) {
      sc.periSeen = true;
      sc.grabs++;
      priceArrival(sc, scfg, sc.grabClearance);
      // A claimable body is logged once per life, and pays nothing for it. The
      // anomaly's reward is the charged window it opens, which is spent rather
      // than received — `anomalyBonus` was 2.4% of corpus best across ONE capture
      // in 28 faithful sessions, and that number prices the anomaly's
      // reachability rather than its award. See F08.
      const body = state.bodies[cap.planet];
      if (body?.traits.claimable && !sc.claimed.includes(body.name)) {
        sc.claimed.push(body.name);
        sc.run.anomalies++;
      }
      // The hop log still tracks bodies, because the ship's arcs read it and the
      // window's tally counts them. Nothing is paid for being on it.
      if (cap.zipped && body && !body.traits.claimable && !sc.hopped.includes(body.name)) {
        sc.hopped.push(body.name);
      }
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
      // The same edge, counted rather than streaked. `recklessStreak` resets on a
      // smooth capture because it is asking "are you ON a tear"; this is asking
      // "how rough was the whole run", so it only ever climbs.
      sc.run.roughPasses++;
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

    // ---- the omen: a press made past the last one that could have worked
    //
    // NOTHING IS PAID OR WITHHELD HERE, and that is the interesting part of F04.
    // A rescue used to be an award — `rescueBonus` scaled by how little of the
    // window was left — and it was expected to be structurally unpayable under a
    // climb-only currency, since a rescue is a lateral save and the constitution
    // pays only for climb.
    //
    // The measurement reversed the prediction. The link after a rescue banks a
    // median carry of 1352px against 554px for an ordinary one — 2.44x, because a
    // rescue means the ship drifted a long way and saved it — the coast gate
    // costs it nothing, since a drift toward a SIDE wall accrues little vertical
    // climb per coast, and the swing cashes in the x3 fire band it was flying
    // through. About 7x an ordinary swing, with no weight and no exception, and
    // VISION pillar 4 gets stronger by deleting the key that was serving it.
    //
    // So all that is left of the rescue in the scorer is the skull the renderer
    // draws, withdrawn if the ship turns away regardless — which it does 6% of
    // the time, because the prediction is deliberately conservative.
    if (sc.doomed && turnedAway(cap, sc.doomed.wall)) sc.doomed = null;

    sc.pending = readPending(state, cfg, scfg, cap, sc.grabSkim, sc.maxDefl);
  } else {
    // Held so the next grab can measure the line it came in on — see
    // `skimClearance`. Nothing else happens while drifting.
    const { ship } = state;
    sc.lastDrift = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
  }
  sc.wasCaptured = cap !== null;

  // What the fire has been worth to this swing so far, for the drawing. Published
  // every tick because the band it replaced was, and because the score band reads
  // it live rather than only at a cash.
  sc.band = sc.carryCold > 0 ? sc.carry / sc.carryCold : 1;
  sc.multiplier = multiplierFor(sc, scfg);
  if (sc.bank > sc.best) sc.best = sc.bank;
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
    // Carried beside `timing` rather than instead of it: `timing` is what the
    // tier grades and what the halo draws, and this is what says where in the
    // envelope it came from once the envelope has a flat top to hide inside.
    boostT: cap.boostT,
    aim,
    target,
  };
}

/**
 * Was this press already past the last one that could have turned the ship away?
 *
 * Called on the FIRST tick of a capture and never again. The question is about
 * the instant the button went down, and one tick later the drift it is asked
 * against no longer exists.
 *
 * `sc.lastDrift` is the state `beginCapture` actually read — held for exactly
 * this kind of question, and not interchangeable with the capture's own
 * `rx`/`ry`, which `stepCapture` has already advanced by a tick on this same
 * tick. Everything else is taken from the live state: `clear` is the free phase,
 * so the fuel a rescue would have to brake with has not moved yet.
 *
 * OBSERVABILITY, NOT SCORING. Nothing here pays or withholds a point — it did
 * once, and F04 deleted the award; see the omen block in `scoreTick` for why the
 * rescue is worth more without it. It stays in the scorer because the answer is
 * a forward simulation and the renderer must not run a second one, which is the
 * same reason `burnHeat` is published here.
 *
 * COST. `rescueDeadline` forward-simulates. It is affordable because it happens
 * once per capture and because the great majority of presses take its cheap
 * refusal — measured over the corpus, 37% of presses are made while committed to
 * a wall and the other 63% never reach the projection at all.
 */
function armDoom(
  sc: ScoreState,
  state: SimState,
  cfg: SimConfig,
  dt: number,
): ScoreState['doomed'] {
  const cap = state.capture;
  const drift = sc.lastDrift;
  if (!cap || !drift) return null;
  if (!state.bodies[cap.planet]) return null;

  const pre: SimState = {
    ...state,
    capture: null,
    ship: { ...state.ship, x: drift.x, y: drift.y, vx: drift.vx, vy: drift.vy },
    ending: { ...state.ending },
    telemetry: { ...state.telemetry },
    bodies: state.bodies.slice(),
  };
  const deadline = rescueDeadline(pre, cfg, dt);
  if (!deadline || deadline.cross) return null;
  return { wall: deadline.wall, tick: state.tick };
}

/**
 * Pay for a dot in the carpet.
 *
 * The simplest award in the game and deliberately so: a flat figure, no
 * multiplier, no streak step, no word. See `ScoreConfig.moteBonus`.
 *
 * It reports `multiplier: 1` rather than the live one, and that is not a rounding
 * of the truth — the band and the popups both print `multiplier` when it is above
 * one, and printing x5 beside a number that was not multiplied by five is the
 * readout lying about its own arithmetic.
 */
function awardMote(sc: ScoreState, state: SimState, scfg: ScoreConfig): ScoreAward {
  const points = Math.round(scfg.moteBonus);
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'mote',
    points,
    multiplier: 1,
    // Not a body, and there is no honest name to put here. `DOT` is what the band
    // and the replay's body column print, which is the true answer to "what was
    // that award about".
    body: 'DOT',
    tier: 1,
    band: 1,
    carry: 0,
    close: 0,
    clearance: Infinity,
    skim: Infinity,
    defl: 0,
    timing: 0,
    aim: 0,
    boostT: 0,
    arrival: 0,
    climb: 0,
    heat: 0,
    turn: 0,
  };
  sc.bank += points;
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
  // is graded on. Read HERE and not in `readPendingFlyby` with the other
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

  // The same ladder a release is graded on, with the turn standing in for both
  // axes — see `tierQuality`. A pass has no frozen orbit, so it has neither a
  // compass marker nor a boost envelope; what it has instead is the one quality
  // that says what the pass DID, and `flybyTurnSpan` is where its rungs sit.
  const tier = tierFor(
    scfg,
    tierQuality(scfg, clamp01(turn / scfg.flybyTurnSpan), clamp01(turn / scfg.flybyTurnSpan)),
  );
  const cash = priceSwing(sc, scfg, tier);
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'flyby',
    points: cash.points,
    multiplier: cash.multiplier,
    tier,
    band: cash.band,
    carry: cash.carry,
    body: p.body,
    close: p.close,
    clearance: p.clearance,
    skim: p.skim,
    defl: p.defl,
    turn,
    // Release qualities. There is no release: the ship never stopped.
    timing: 0,
    aim: 0,
    boostT: 0,
    arrival: 0,
    climb: cash.climb,
    heat: cash.heat,
  };
  sc.bank += award.points;
  sc.flybys++;
  sc.streak++;
  return award;
}

/**
 * THE CASH STEP. One call, and every swing in the game goes through it.
 *
 *   carry x tier x band x streak  ->  bank
 *
 * Direction 08 puts payday at the release, because the unit of scoring is the
 * swing and the unit of play is the swing: "a release isn't a bonus moment — it
 * is payday, and the compass spent the whole orbit setting the wage".
 *
 * The three multipliers are settled at three different moments and are read here
 * together, which is what stops any of them being a second source of points. The
 * tier is a property of THIS instant and is passed in. The band is what the swing
 * did at the field's edge, integrated across the ride. The streak is the ladder,
 * and it is read BEFORE the caller steps it, so the Nth swing is paid at the
 * multiplier the N-1 before it earned.
 *
 * MULTIPLIERS MULTIPLY, never add. That is what makes the ceiling legible rather
 * than emergent, and it is why nothing in this file needs a cap beyond the
 * streak's own.
 *
 * The coast is NOT reset here, and that is deliberate: a cash is not an
 * engagement — the ship has just let go — so the drift that follows a release
 * starts counting immediately, which is the whole point of gating on reach rather
 * than on time since a payment.
 */
function priceSwing(
  sc: ScoreState,
  scfg: ScoreConfig,
  tier: number,
): {
  points: number;
  multiplier: number;
  carry: number;
  climb: number;
  band: number;
  heat: number;
} {
  const carry = sc.carry;
  const climb = sc.carryPx;
  // WHAT THE FIRE WAS WORTH ON THIS SWING, as a multiplier, which is what `band`
  // has always meant on the receipt — only now it is measured rather than
  // selected. `carryCold` took every multiply this carry took except the fire, so
  // the ratio is the fire alone. It is continuous where the ladder was three
  // rungs, so a graze reads 1.02 instead of rounding down to nothing or up to a
  // doubling, and an old report's 1 / 1.5 / 2 still means the same thing.
  const band = sc.carryCold > 0 ? carry / sc.carryCold : 1;
  const heat = sc.burnPeak;
  const streak = multiplierFor(sc, scfg);
  const multiplier = tier * band * streak;

  sc.carry = 0;
  sc.carryCold = 0;
  sc.carryPx = 0;
  // The fire is spent with the metres it priced. The next swing starts cold
  // however hot the ship still is: what the fire was worth is a property of the
  // climb it paid for, not of where the ship happens to be.
  sc.burnPeak = 0;
  sc.band = 1;

  return { points: Math.round(carry * multiplier), multiplier, carry, climb, band, heat };
}

function awardLink(sc: ScoreState, state: SimState, scfg: ScoreConfig, p: PendingLink): ScoreAward {
  const tier = tierFor(scfg, tierQuality(scfg, p.aim, p.timing));
  const cash = priceSwing(sc, scfg, tier);
  // Built once so nothing downstream sees a copy of its own inputs — one
  // definition of what this award was, and `praiseFor` reads the finished thing.
  const award: ScoreAward = {
    tick: state.tick,
    kind: 'link',
    points: cash.points,
    multiplier: cash.multiplier,
    tier,
    band: cash.band,
    carry: cash.carry,
    body: p.target ? `${p.body}\u2192${p.target.name}` : p.body,
    // Arrival qualities belong to the arrival, which has already priced the carry
    // this is cashing. Reported as absent so nothing downstream reads them twice.
    close: 0,
    clearance: Infinity,
    skim: Infinity,
    defl: p.defl,
    timing: p.timing,
    boostT: p.boostT,
    // For the record only — see `ScoreAward.arrival`. `close` above stays 0.
    arrival: p.close,
    aim: p.aim,
    climb: cash.climb,
    heat: cash.heat,
    turn: 0,
  };
  sc.bank += award.points;
  sc.links++;
  sc.streak++;
  return award;
}
