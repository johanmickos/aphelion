/**
 * The simulation step.
 *
 * Two-level structure, preserved from the prototype and load-bearing: one frame
 * advances `SUB` substeps, but clearance easing decrements once per *frame* while
 * the floor clamp, energy tracking, flyby brake, contacts and periapsis detection
 * all run per *substep*. Flattening the loop would change behaviour.
 *
 * Drift is deliberately a single step per frame with no forces at all — not
 * gravity summing to zero. Ambient attractors (black holes) will enter as force
 * contributors; the seam is `driftAccel` below.
 */
import type { SimConfig } from './config.ts';
import { DEFAULT_CONFIG } from './config.ts';
import type { Body, Capture, EndingReason, Input, SimState } from './types.ts';
import { circSpeed, escapeSpeed, gAccel, hypot, orbitRadius, smootherstep } from './orbit.ts';
import { applyClearance, beginCapture, freezeOrbit, releaseCapture } from './capture.ts';
import { contactPolicy, reflectCoefficient } from './contact.ts';
import { boostEnvelope } from './boost.ts';
import { burn, regen } from './fuel.ts';
import {
  backtrackFloorY,
  createBodies,
  createMotes,
  fieldBounds,
  finishLineY,
  sheltered,
  runInBand,
  SPAWN,
} from './world.ts';

/** A fresh run. Deterministic: same config in, same state out. */
export function createInitialState(cfg: SimConfig = DEFAULT_CONFIG): SimState {
  const state: SimState = {
    tick: 0,
    ship: { x: 0, y: 0, vx: 0, vy: 0, alive: true, burstX: 0, burstY: 0, burstT: 0 },
    capture: null,
    bodies: createBodies(cfg),
    motes: [],
    carveDir: 0,
    fuel: cfg.fuelMax,
    highWaterY: 0,
    ending: { active: false, t: 0, x: 0, y: 0, reason: 'impact' },
    holdConsumed: false,
    chargedT: 0,
    cameFrom: -1,
    telemetry: { lastGrab: null, floorSubsteps: 0, floorSubstepsTotal: 0, putterOuts: 0 },
  };
  // After the bodies, because the carpet is positioned off the crest.
  state.motes = createMotes(cfg, state.bodies);
  respawn(state, cfg);
  state.tick = 0;
  return state;
}

/** Return the ship to its start, keeping the world. */
export function respawn(state: SimState, cfg: SimConfig): void {
  const { ship } = state;
  ship.x = SPAWN.x;
  ship.y = SPAWN.y;
  ship.vx = 0;
  ship.vy = -cfg.cruise;
  ship.alive = true;
  ship.burstX = 0;
  ship.burstY = 0;
  ship.burstT = 0;
  state.fuel = cfg.fuelMax;
  state.highWaterY = ship.y;
  state.capture = null;
  // The prototype cleared its input flag here; input is an input, so the
  // equivalent fact is recorded in state. See docs/PORT_NOTES.md note 7.
  state.holdConsumed = true;
  // The charge dies with the ship. It is earned by flying, and carrying it across
  // a death would pay the next run for the last one's work.
  state.chargedT = 0;
  state.cameFrom = -1;
  // The carpet is the same puzzle on every attempt: the dots come back, so the
  // choice they present is the same choice.
  for (const m of state.motes) m.taken = false;
  state.carveDir = 0;
}

/** The ship's world position, wherever it currently lives. */
export function shipWorldPos(state: SimState): { x: number; y: number } {
  const cap = state.capture;
  if (!cap) return { x: state.ship.x, y: state.ship.y };
  const b = state.bodies[cap.planet]!;
  return { x: b.x + cap.rx, y: b.y + cap.ry };
}

/** The ship's velocity, wherever it currently lives. */
export function shipVelocity(state: SimState): { vx: number; vy: number } {
  const cap = state.capture;
  return cap ? { vx: cap.vx, vy: cap.vy } : { vx: state.ship.vx, vy: state.ship.vy };
}

/**
 * Ambient acceleration during drift.
 *
 * Empty in the prototype config by design: its drift is a literal straight line
 * and Stage 0 reproduces that exactly. This is the seam the file header reserved
 * — "ambient attractors will enter as force contributors" — and the run-in funnel
 * is the first thing to use it.
 *
 * THE FUNNEL. Inside `finishFunnelDepth` of the finish line, a drifting ship is
 * steered toward the middle of the field and accelerated upward, ramping from
 * nothing at the crest to full at the line. It exists so the ship ARRIVES at the
 * ceremony centred and fast, rather than being teleported into position at the
 * moment the player is watching hardest.
 *
 * Critically damped on the lateral axis. An undamped spring does not centre a
 * ship, it swings it across the middle and out the other side — which at this
 * point in a run would be a wall. `2*sqrt(k)` is the damping that arrives without
 * overshooting, and it is derived rather than tuned so it stays correct if the
 * stiffness moves.
 *
 * Nothing here fights a capture: this is called from `stepDrift` only, so an
 * orbit at the last planet feels none of it.
 */
function driftAccel(
  state: SimState,
  cfg: SimConfig,
  x: number,
  y: number,
  holding: boolean,
): { ax: number; ay: number } {
  if (!cfg.clearAtTop || cfg.finishFunnelDepth <= 0) return { ax: 0, ay: 0 };

  const fb = fieldBounds(cfg, state.bodies);
  const band = runInBand(cfg, fb);
  if (band === null) return { ax: 0, ay: 0 };
  // The band's OWN depth, not the config key. They are the same number wherever
  // `finishFunnelDepth` is the larger of it and `grabRange`, and `finishLineY`
  // records why that is not something to rely on.
  const depth = band.bottom - band.top;
  const below = y - band.top;
  if (below < 0 || below > depth) return { ax: 0, ay: 0 };

  // ---- the carpet lifts, whatever else is happening
  //
  // A ONE-SIDED SPRING, so it is silent on the climb it is meant to protect and
  // firm on the one case that needs it: a ship that came over the crest already
  // falling, which is the only way to be in here going the wrong way. See
  // `SimConfig.carpetLift` for why this is not a clamp on `vy`.
  //
  // Outside the `holding` branch below because it is a property of the CARPET and
  // not of the button: "you cannot go backwards in here" has to be true of a
  // player who never presses at all, or it is not a rule, it is a reward.
  let lift = 0;
  if (cfg.carpetLift > 0 && state.ship.vy > -cfg.carpetRise) {
    lift = -cfg.carpetLift * (state.ship.vy + cfg.carpetRise);
  }

  // 0 at the crest, 1 at the line. Smoothed so the pull arrives rather than
  // switching on — a step change in acceleration is a shove, and the player is
  // still flying at this point.
  const t = smootherstep(1 - below / depth);
  const cx = (fb.left + fb.right) / 2;
  const k = cfg.finishFunnelPull;
  const damping = 2 * Math.sqrt(k);
  // TWO ACCELERATIONS, NOT ONE RAMP. A single smooth ramp pushes harder with
  // every pixel, so the ship is at its top speed by the time it reaches the
  // chequers and the line goes past in a blur. What the runway should feel like
  // is being picked up and carried at roughly the speed you arrived with — the
  // `hold` — and then kicked, once, right at the end.
  //
  // The kick is a fifth power because that is what "stays out of the way until
  // the very end" looks like as a curve: it is under 4% of full at the runway's
  // midpoint and under a third at 80% of the way along. A smootherstep would be a
  // third of the way up by halfway, which is the shape being replaced.
  const kick = t * t * t * t * t;
  // ---- the carve: the player's own line through the last stretch
  //
  // While the button is down the centring spring is OFF and a flat sideways push
  // takes its place. The two are alternatives rather than a sum, and that is the
  // whole feel: hold and the funnel lets go of the wheel, release and it takes it
  // back. A carve fighting a spring stiff enough to save a wall drift is a carve
  // that goes nowhere near the edges, which is where the interesting shapes are.
  //
  // NOT RAMPED BY `t`, unlike everything else here. The funnel's forces grow
  // toward the line because they are a handover that must not switch on; this is a
  // control, and a control whose strength depends on where you happen to be is a
  // control that cannot be learned.
  const carving = holding && cfg.carpetCarve > 0 && state.carveDir !== 0;
  // ---- and it eases off as the sideways speed approaches its ceiling
  //
  // A TAPER RATHER THAN A CUT-OFF, the same shape `flybyBrake`'s `speedTaper`
  // already uses: the push falls to nothing as `carpetCarveMax` is reached, so the
  // ship settles onto a terminal sideways speed instead of hitting a wall in the
  // acceleration. `SimConfig.carpetCarveMax` records what happened without it.
  //
  // The clamp's upper bound is 2, not 1, and that is a feel decision rather than a
  // safety one: a ship already travelling the WRONG way — off a bumper, say — gets
  // up to double thrust to turn around, which is what makes weaving answer. It is
  // still bounded, so nothing here can run away.
  let carveScale = 1;
  if (carving && cfg.carpetCarveMax > 0) {
    const along = state.carveDir * state.ship.vx;
    carveScale = Math.max(0, Math.min(2, 1 - along / cfg.carpetCarveMax));
  }
  return {
    ax: carving
      ? state.carveDir * cfg.carpetCarve * carveScale
      : (k * (cx - x) - damping * state.ship.vx) * t,
    ay: -(cfg.finishFunnelHold * t + cfg.finishFunnelBoost * kick) + lift,
  };
}

/** Freeze the ship and start the hold before respawn. */
function endRun(state: SimState, reason: EndingReason, x: number, y: number): void {
  state.capture = null;
  state.ship.x = x;
  state.ship.y = y;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.ship.alive = false;
  state.ending.active = true;
  state.ending.t = 0;
  state.ending.x = x;
  state.ending.y = y;
  state.ending.reason = reason;
}

/** Advance one simulation tick. Mutates `state` in place. */
export function stepSim(state: SimState, cfg: SimConfig, input: Input, dt: number): void {
  // ---- the charged window drains first, before anything reads it
  //
  // Ahead of the input edges deliberately. A grab this tick is judged against the
  // window as it stands NOW, so one that arrives exactly as the window runs out
  // dives rather than zipping; and a release this tick opens a full window that
  // this tick does not immediately take a slice out of. Between them that makes
  // the window exactly `chargedSecs` of simulated time long, measured from the
  // release — which is what the config key promises.
  if (state.chargedT > 0) state.chargedT = Math.max(0, state.chargedT - dt);

  // Did a capture end on this tick? Deliberately the scorer's own definition of a
  // release — a capture was here last tick and is gone now — because the clear
  // test near the bottom of this function exists to keep the two in step. It
  // covers all three ways a hold can end: the release edge below, a putter-out,
  // and the clear test letting go for the player.
  const wasCaptured = state.capture !== null;

  // ---- input edges, applied before the frame as the prototype's handlers were
  if (input.pressed) {
    state.holdConsumed = false;
    if (!state.capture) {
      const result = beginCapture(state, cfg);
      state.telemetry.lastGrab = { tick: state.tick, result };
      if (result === 'captured') state.telemetry.floorSubsteps = 0;
      // ---- the press landed in the carpet, so it bends the line instead
      //
      // `grabTarget` owns that decision, which is why this reads its answer rather
      // than asking the question again: two copies of "is the ship in the run-in"
      // is exactly the kind of pair `runInBand`'s header exists to stop.
      //
      // The direction flips on every press, and the first of a life bends toward
      // the middle of the field. See `SimState.carveDir`.
      if (result === 'carved') {
        if (state.carveDir === 0) {
          const fb = fieldBounds(cfg, state.bodies);
          state.carveDir = state.ship.x > (fb.left + fb.right) / 2 ? -1 : 1;
        } else {
          state.carveDir = -state.carveDir;
        }
      }
    }
  }
  if (input.released) {
    if (state.holdConsumed) state.holdConsumed = false;
    else if (state.capture) releaseCapture(state, cfg, false);
  }
  const holding = input.held && !state.holdConsumed;

  // ---- ending hold: freeze so the player sees what happened, then respawn
  if (state.ending.active) {
    state.ending.t += dt;
    // A cleared field never respawns on its own. Every other ending is a failure
    // the player wants to be over, so the hold is a beat and the game moves on;
    // this one is the end of the course, and what happens next — a ceremony, a
    // fresh field, a look at the numbers — is not the simulation's decision. It
    // holds, and the caller ends it. `state.ending.t` keeps climbing either way,
    // so anything that wants to age the moment still can.
    if (state.ending.reason !== 'cleared' && state.ending.t >= cfg.crashPause) {
      state.ending.active = false;
      respawn(state, cfg);
    }
    state.tick++;
    return;
  }

  if (state.capture) {
    stepCapture(state, cfg, holding, dt);
    if (state.capture?.puttered) {
      state.telemetry.putterOuts++;
      releaseCapture(state, cfg, true);
      state.holdConsumed = true;
    }
  } else if (state.ship.alive) {
    // The prototype returned from update() the instant a lethal contact landed,
    // which skips the bounds test and the fuel regen below for that one tick.
    // Reproduced deliberately: dropping it leaks one tick of regen (0.25 fuel).
    if (stepDrift(state, cfg, holding, dt)) {
      state.tick++;
      return;
    }
  }

  // ---- bounds: leaving the field ends the run
  const pos = shipWorldPos(state);
  const fb = fieldBounds(cfg, state.bodies);
  // An orbit is a round trip. The height gained going round its near side is not
  // ground gained, and counting it puts the trailing floor at the orbit's APEX —
  // which the far side of that same orbit then flies straight into. Measured on
  // the session that reported it: a settled r=290 orbit set the floor 520px
  // above its own nadir and killed a ship that had not lost a pixel. Held here,
  // the mark resumes at the release point, which is the height actually kept.
  const banking = !(cfg.holdClimbInCapture && state.capture);
  if (banking && pos.y < state.highWaterY) state.highWaterY = pos.y;

  // ---- the carpet's own bookkeeping: what was collected
  //
  // Before the endings below rather than after, so the last tick of a life counts.
  // It reads the resolved world position, so a ship that swings through the carpet
  // while still attached to the last planet collects exactly as a drifting one does
  // — the dots are flown through, and how you came to be flying through them is not
  // something they have an opinion about.
  const band = runInBand(cfg, fb);
  collectMotes(state, cfg, pos.x, pos.y);

  // Falling too far behind the high-water mark ends the run. The floor trails the
  // climb, so it is pressure to keep going rather than a wall you meet once.
  const floorY = backtrackFloorY(cfg, state.highWaterY);
  if (floorY !== null && pos.y > floorY) {
    endRun(state, 'fell-behind', pos.x, pos.y);
    state.tick++;
    return;
  }

  // Past the last body there is no more field to fly, so the run is over and it
  // is over having succeeded. Tested BEFORE the boundaries below, because the
  // ceiling is only 800px further up and whichever fires first is the story the
  // player gets told about what they just did.
  //
  // NOT AT THE CREST ITSELF, which is where this first fired and was wrong in the
  // most annoying possible way: `crest` is the topmost body's CENTRE, so the run
  // ended the instant the ship's y crossed it — on the APPROACH, while the player
  // was lining up to grab the last planet. The final body was unplayable. You
  // reached for it and got a results screen.
  //
  // The line is therefore where that body goes OUT OF REACH. `grabRange` is the
  // distance at which `grabTarget` stops offering a body at all, so above this
  // there is provably nothing left to grab — which is the real meaning of "no
  // more field", rather than a margin picked to look safe. Measured against it:
  // settled captures of the topmost body reach at most ~265px above its centre,
  // so the line clears every one of them with room to spare.
  //
  // AND IT LETS GO FOR YOU. This used to wait for the release — a ship still
  // attached kept orbiting and the run ended whenever the player finally let go —
  // on the argument that cutting off a manoeuvre is the same defect as cutting
  // off the approach. Played, it is not: above the line `grabTarget` has nothing
  // left to offer, so a manoeuvre that continues past it cannot lead anywhere
  // new, and what the wait actually buys is dead time. Measured on the session
  // that reported it, a hold drifting through the line at 89px/s: crossed at tick
  // 1425, released at 1603 — three seconds of a finished run still being flown,
  // and then the whole ceremony on top of that. Crossing is what says you are
  // done with it.
  //
  // THE RELEASE IS REAL, not a putter-out: the player did everything the link
  // asked of them, so it pays its boost and its fuel exactly as a chosen release
  // would, and the ceremony gets a crossing speed to start from.
  //
  // ONE TICK LATER, THOUGH, AND THIS IS THE SUBTLE PART. `scoreTick` scores
  // nothing on a tick where `ending.active` is set, and it recognises a release
  // by exactly the diff `wasCaptured` records at the top of this function — a
  // capture was here last tick and is gone now — so
  // ending on the same tick as the release silently forfeits the last manoeuvre
  // of the run. That was already happening to every voluntary release taken past
  // the line: the flyby in the reported session ran 363 ticks and paid nothing.
  // Letting the tick finish and ending on the next one costs 16ms nobody can see
  // and hands the scorer the release it is owed. Nothing can re-grab in between —
  // above the line no body is within `grabRange` by construction, which is what
  // the line IS — so this defers by one tick and never by two.
  //
  // The tick ENDS here either way, which is the other half of the deferral: a
  // ship that has crossed is finished, so nothing below may still take the
  // ending away from it. `outX` would have — the bumpers stop at the line, so a
  // release that crosses wide of a wall was one tick from being scored as lost
  // off the side of a field it had just beaten.
  const clearY = finishLineY(cfg, fb);
  if (clearY !== null && pos.y < clearY) {
    if (state.capture) {
      releaseCapture(state, cfg, false);
      // The button is still down. Nothing may act on the release edge when it
      // eventually arrives — the same guard the putter-out sets, for the same
      // reason.
      state.holdConsumed = true;
    } else if (!wasCaptured) {
      endRun(state, 'cleared', pos.x, pos.y);
    }
    state.tick++;
    return;
  }

  // ---- bumpers: nothing dies in the run-in
  //
  // The chevrons say "you are nearly there" and the funnel is actively carrying
  // the ship, so a run that ends against a side wall in that stretch is the game
  // taking something away at the exact moment it promised to hand it over. Inside
  // the band the walls bounce instead.
  //
  // The death is suppressed for a CAPTURED ship too, not only a drifting one. A
  // wide orbit at the last planet can swing over the line, and "no possible way
  // to die here" has to mean no possible way — a rule with an exception in it is
  // not the rule the player will remember. Only the drift is reflected, because
  // an orbit will carry itself back anyway and rewriting a capture's velocity
  // would be reaching into a manoeuvre that is already resolving.
  const inRunIn =
    cfg.finishBumper > 0 && band !== null && pos.y <= band.bottom && pos.y >= band.top;
  if (inRunIn && !state.capture) {
    const { ship } = state;
    if (ship.x < fb.left) {
      ship.x = fb.left + (fb.left - ship.x) * cfg.finishBumper;
      ship.vx = Math.abs(ship.vx) * cfg.finishBumper;
      ship.burstX = Math.abs(ship.burstX) * cfg.finishBumper;
    } else if (ship.x > fb.right) {
      ship.x = fb.right - (ship.x - fb.right) * cfg.finishBumper;
      ship.vx = -Math.abs(ship.vx) * cfg.finishBumper;
      ship.burstX = -Math.abs(ship.burstX) * cfg.finishBumper;
    }
  }

  // The side boundary is suspended inside an anomaly's bubble, which is what a
  // release aimed past the barrier is flying through. Nothing else is suspended:
  // leaving the far side of the bubble puts the ship back outside `fb.right` on
  // the very next tick and ends the run, which is the miss.
  const outX =
    (pos.x < fb.left - 4 || pos.x > fb.right + 4) &&
    !inRunIn &&
    !sheltered(pos.x, pos.y, state.bodies);
  // THE CEILING IS NOT A DEATH ONCE THE FIELD CAN BE CLEARED. With `clearAtTop`
  // on, the clear fires at `clearY` — 240px below `fb.top` — for a drifting ship
  // and a captured one alike, and no tick moves 240px, so the ceiling is now
  // unreachable rather than merely usually missed.
  //
  // It stays suppressed anyway, because the reason it was written is worth
  // keeping in view: while the clear waited for a release, a fast capture of the
  // last body carried as far as 800px above its centre — exactly where the
  // ceiling sits — so holding a good final slingshot killed the run it should
  // have finished. A ship up there was attached to the last planet, not lost in
  // the void this exists to catch.
  //
  // The floor below stays a death in every config: falling out of the bottom is
  // not an achievement.
  const outY = pos.y > fb.bottom || (!cfg.clearAtTop && pos.y < fb.top);
  if (outX || outY) {
    // Hold on the boundary the way an impact does, so leaving the field reads as
    // an event with a cause rather than a silent teleport back to the start.
    endRun(state, 'out-of-bounds', pos.x, pos.y);
    state.tick++;
    return;
  }

  if (!state.capture) state.fuel = regen(cfg, state.fuel, dt);

  state.tick++;
}

function stepCapture(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  if (cap.phase === 'clear' || cap.phase === 'flyby') stepPhysical(state, cfg, holding, dt);
  else stepPhase(state, cfg, holding, dt);
  escapeShove(state, cfg);
}

/**
 * Notice that a captured ship has got out of the dead zone alive.
 *
 * STATED ENTIRELY IN SIMULATION TERMS, and it has to be. What is being rewarded
 * is a scoring idea — a rescue, a burn — and `src/score/` is an observer the
 * simulation may not know exists. So the rule reads only what physics already
 * knows: captured, within `escapeBandWidth` of a boundary, not sheltered by an
 * anomaly, and no longer moving toward it. The scorer recognises the same instant
 * for its own purposes and the two agree because they read the same arithmetic,
 * never because one asks the other.
 *
 * ARMED ON THE WAY IN, SPENT ON THE WAY OUT. A capture that is already leaving
 * when it enters the band was never in trouble and is owed nothing; `escapeSide`
 * records that the ship was genuinely closing, which is the thing being rewarded
 * for surviving. Once per capture, so a settled orbit grazing the band lap after
 * lap cannot draw a wage from it.
 *
 * IT CHANGES NOTHING HERE. An earlier version added the speed at this instant and
 * it was wrong twice over: reported as "the kick during arc doesn't feel good",
 * and measured as costing 56-64% of the link points those captures earned, because
 * speed added mid-capture is speed the capture must shed to convert and settle.
 * The flag is spent by `releaseCapture` instead. Leaving the velocity alone also
 * means the phase clock is no longer a problem — `stepPhase` overwrites `cap.vx`
 * every tick, so a settle could never have kept a shove anyway.
 */
function escapeShove(state: SimState, cfg: SimConfig): void {
  const cap = state.capture;
  if (!cap || cap.escaped || cfg.escapeFling <= 0) return;

  const pos = shipWorldPos(state);
  const fb = fieldBounds(cfg, state.bodies);
  const toLeft = pos.x - fb.left;
  const toRight = fb.right - pos.x;
  const side = toRight < toLeft ? 1 : -1;
  const gap = Math.min(toLeft, toRight);

  // Outside the band, or standing where the boundary does not kill, there is
  // nothing to escape — and the arming is dropped so a later approach is judged
  // on its own closing rather than on this one.
  if (gap > cfg.escapeBandWidth || sheltered(pos.x, pos.y, state.bodies)) {
    cap.escapeSide = 0;
    return;
  }

  if (cap.vx * side > 0) {
    cap.escapeSide = side;
    return;
  }
  if (cap.escapeSide !== side) return;
  cap.escaped = true;
  cap.escapeSide = 0;

  // Some of the fuel back. An escape costs a median 34 fuel to buy and leaves a
  // quarter of them under 25 in the tank, which is the shape of a mechanic that
  // punishes you for surviving it.
  //
  // Paid on fuel NOBODY HAS REFUNDED YET, which is the whole of the arithmetic
  // here: `flybyConvertRefund` already returns half the brake to a flyby that
  // converts, and note 29 is titled "A rescue paid for itself twice". Measured,
  // 67% of escapes never reach that refund — 46% are released while still a
  // flyby and 21% never braked at all — so this covers the ones it misses and
  // tops up the ones it does not.
  if (cfg.escapeRefund > 0) {
    const owed = Math.max(0, cap.fuelSpent - cap.fuelBack);
    const back = cfg.escapeRefund * owed;
    state.fuel = Math.min(cfg.fuelMax, state.fuel + back);
    cap.fuelBack += back;
  }
}

/** Real softened-gravity integration: the physical dive and slingshot. */
function stepPhysical(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  const anchor = state.bodies[cap.planet]!;
  const h = dt / cfg.SUB;

  for (let s = 0; s < cfg.SUB; s++) {
    const r = hypot(cap.rx, cap.ry);
    const rhx = cap.rx / r;
    const rhy = cap.ry / r;

    // Clearance eases in once per FRAME, not per substep. Frame-denominated by
    // inheritance; see SimConfig.clearEaseFrames.
    if (cap.clearFramesLeft > 0 && s === 0) {
      cap.vx += cap.clearDvx;
      cap.vy += cap.clearDvy;
      cap.clearFramesLeft--;
    }

    const g = gAccel(cfg, r);
    const ax = -g * rhx;
    const ay = -g * rhy;
    cap.vx += ax * h;
    cap.vy += ay * h;
    cap.rx += cap.vx * h;
    cap.ry += cap.vy * h;

    // Capture the true orbital energy each substep BEFORE the floor can clamp it.
    // Reading speed after a clamp underreports a head-on dive and would flatten
    // its oval into a circle.
    {
      const rr0 = hypot(cap.rx, cap.ry);
      const v0 = hypot(cap.vx, cap.vy);
      const Enow = 0.5 * v0 * v0 - cfg.GM / Math.max(rr0, 1);
      cap.whipE = cap.whipE === undefined ? Enow : Math.max(cap.whipE, Enow);
    }

    // --- contact with the anchor: the minimum-orbit floor
    {
      const rr = hypot(cap.rx, cap.ry);
      if (rr < cap.minR) {
        state.telemetry.floorSubsteps++;
        state.telemetry.floorSubstepsTotal++;
        const nx = cap.rx / rr;
        const ny = cap.ry / rr;
        cap.rx = nx * cap.minR;
        cap.ry = ny * cap.minR;
        const vr = cap.vx * nx + cap.vy * ny;
        if (vr < 0) {
          cap.vx -= vr * nx;
          cap.vy -= vr * ny;
        }
      }
    }

    // --- contact with other bodies while coasting through the field
    {
      const wx = anchor.x + cap.rx;
      const wy = anchor.y + cap.ry;
      for (const p of state.bodies) {
        if (p === anchor) continue;
        const policy = contactPolicy(cfg, 'capture-other', p);
        if (policy.kind !== 'bounce') continue;
        const surf = p.R + policy.offset;
        const ddx = wx - p.x;
        const ddy = wy - p.y;
        const dd = hypot(ddx, ddy);
        if (dd < surf) {
          const nx = ddx / dd;
          const ny = ddy / dd;
          cap.rx = p.x + nx * surf - anchor.x;
          cap.ry = p.y + ny * surf - anchor.y;
          const vn = cap.vx * nx + cap.vy * ny;
          if (vn < 0) {
            const k = reflectCoefficient(policy.restitution);
            cap.vx -= k * vn * nx;
            cap.vy -= k * vn * ny;
          }
        }
      }
    }

    // --- holding a flyby burns fuel to brake it toward a bound orbit
    if (cap.phase === 'flyby' && holding && state.fuel > 0) {
      const spdF = hypot(cap.vx, cap.vy);
      if (spdF > 1) {
        const rr = hypot(cap.rx, cap.ry);
        const rhx2 = cap.rx / rr;
        const rhy2 = cap.ry / rr;
        let thx = -rhy2;
        let thy = rhx2;
        if (thx * cap.vx + thy * cap.vy < 0) {
          thx = -thx;
          thy = -thy;
        }
        let vr = cap.vx * rhx2 + cap.vy * rhy2;
        let vt = cap.vx * thx + cap.vy * thy;

        // Direction- and speed-dependent. Outbound: brake gently so the ship
        // coasts wide and arcs back. Below flybyBrakeMinSpeed: off entirely,
        // because at low speed gravity swings the heading fast on its own and
        // braking only sheds more speed — a vicious spin cycle.
        const outward = vr > 0;
        const lo = cfg.flybyBrakeMinSpeed;
        const hi = cfg.flybyBrakeRefSpeed;
        const speedTaper = Math.max(0, Math.min(1, (spdF - lo) / Math.max(1, hi - lo)));
        const brakeStr =
          (outward ? cfg.flybyBrake * cfg.flybyOutwardEase : cfg.flybyBrake) * speedTaper;
        const b = brakeStr * h;

        if (vr > 0) vr = Math.max(0, vr - b * cfg.flybyRadialBias);
        else vr = vr + b * 0.15;
        vt = Math.max(0, vt - b * (1 - cfg.flybyRadialBias));

        cap.vx = rhx2 * vr + thx * vt;
        cap.vy = rhy2 * vr + thy * vt;

        // The brake shed energy the player paid for; lower the whip mark by
        // exactly that much, or the freeze hands it all back. `whipE` is a
        // running max precisely so the floor clamp cannot lower it, and a brake
        // is the opposite of a clamp. See `flybyBrakeShedsWhip`. Radius does not
        // change across an impulse, so the potential term cancels and what the
        // brake removed is the kinetic difference alone.
        if (cfg.flybyBrakeShedsWhip && cap.whipE !== undefined) {
          const spdAfter = hypot(cap.vx, cap.vy);
          cap.whipE -= 0.5 * (spdF * spdF - spdAfter * spdAfter);
        }
        // Bill for the brake actually applied, not for holding the button. The
        // flat rate charged full price through the whole taper and kept charging
        // after `speedTaper` reached zero, where the impulse above is identically
        // nothing. See `flybyFuelTracksBrake`.
        const rate = cfg.flybyFuelTracksBrake
          ? cfg.flybyFuelPerSec * speedTaper
          : cfg.flybyFuelPerSec;
        const before = state.fuel;
        state.fuel = burn(state.fuel, rate, h);
        // What the brake actually cost, not what it was quoted: `burn` clamps at
        // an empty tank, and a brake the tank could not pay for must not earn a
        // refund for fuel that was never there.
        cap.brakeSpent += before - state.fuel;
        cap.fuelSpent += before - state.fuel;
      }
    }

    // A flyby converts to a capturable dive once it is bound AND inbound.
    if (cap.phase === 'flyby' && holding) {
      const rNowF = hypot(cap.rx, cap.ry);
      const spdF = hypot(cap.vx, cap.vy);
      const vEscF = escapeSpeed(cfg, rNowF);
      const vradF = (cap.vx * cap.rx + cap.vy * cap.ry) / rNowF;
      if (spdF < vEscF * 0.98 && vradF < 0) {
        cap.phase = 'clear';
        // A capture is a capture however it began. Without this the converted
        // path dives through the surface and is caught by the floor clamp.
        if (cfg.clearanceOnConvert) applyClearance(cap, cfg);
        // The rescue landed: hand back part of what the brake cost. Paid HERE and
        // not folded into the release refund, because the whole point is to reach
        // the capture that is about to burn fuel — arriving at the release would
        // be after the putter-out it exists to prevent. See `flybyConvertRefund`.
        if (cfg.flybyConvertRefund > 0 && cap.brakeSpent > 0) {
          const back = cfg.flybyConvertRefund * cap.brakeSpent;
          state.fuel = Math.min(cfg.fuelMax, state.fuel + back);
          cap.fuelBack += back;
          cap.brakeSpent = 0;
        }
      }
    }

    // --- periapsis detection -> freeze and hand off to the phase clock
    const nr = hypot(cap.rx, cap.ry);
    const dR = nr - cap.prevR;
    if (cap.phase !== 'flyby' && cap.prevDR < 0 && dR >= 0 && !cap.passedPeri) {
      cap.passedPeri = true;
      cap.periR = nr;
      if (holding) {
        const anchor = state.bodies[cap.planet];
        freezeOrbit(cap, cfg, anchor?.traits.authored ?? null);
        cap.phase = 'settle';
      }
    }
    cap.prevR = nr;
    cap.prevDR = dR;
  }

  updateDefl(state);
}

/**
 * The authored approach: radius as a quintic with both ends nailed down.
 *
 * Five conditions, and each one is a thing that would otherwise be visible:
 *
 *   r(0)  = where the ship is        position cannot jump
 *   r'(0) = how fast it was closing  velocity cannot jump
 *   r''(0)= 0                        the pull-in cannot start with a yank
 *   r(1)  = the authored radius      it arrives where it was told to
 *   r'(1) = r''(1) = 0               and stops there rather than passing through
 *
 * The cubic that only nails the first two and the last two was tried first and is
 * the reason the second derivative is in the list: with no condition on it, the
 * curve opens with its full acceleration — measured at 8770px/s² applied between
 * one tick and the next on a 426px arrival, which is a velocity step of 146px/s
 * at the exact moment of the press. Continuous and still a jolt. The quintic eases
 * the same distance in and out for a peak radial speed 25% higher in the middle,
 * which is nobody's complaint.
 *
 * It takes `settleDur` however far away the press was — that is the whole of
 * "quick regardless of speed or distance": the clock is fixed and the distance is
 * whatever it is.
 *
 * Clamped at the floor because a curve with a fast inbound end can overshoot the
 * target radius; the ship would dip inside the body it is parking around and come
 * back out. Inert on every ordinary arrival.
 */
function approachRadius(cap: Capture, u: number): number {
  const T = Math.max(0.01, cap.settleDur);
  const s2 = u * u;
  const s3 = s2 * u;
  const s4 = s3 * u;
  const s5 = s4 * u;
  const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
  const h1 = u - 6 * s3 + 8 * s4 - 3 * s5;
  const h3 = 10 * s3 - 15 * s4 + 6 * s5;
  return Math.max(cap.minR, h0 * cap.approachR0 + h1 * T * cap.approachVR + h3 * cap.rPeri);
}

/** The same quintic differentiated: how fast the approach is closing, in px/s. */
function approachRate(cap: Capture, u: number): number {
  const T = Math.max(0.01, cap.settleDur);
  const s2 = u * u;
  const s3 = s2 * u;
  const s4 = s3 * u;
  const dh0 = -30 * s2 + 60 * s3 - 30 * s4;
  const dh1 = 1 - 18 * s2 + 32 * s3 - 15 * s4;
  const dh3 = 30 * s2 - 60 * s3 + 30 * s4;
  return (dh0 * cap.approachR0 + dh1 * T * cap.approachVR + dh3 * cap.rPeri) / T;
}

/**
 * The phase clock: ride the frozen curve, sweeping it the way a real orbit does.
 *
 * dtheta/dt = L / r^2 conserves angular momentum, so motion is fast at periapsis
 * and slow at apoapsis. `phaseRate` scales that honest sweep; `tighten` reshapes
 * the ellipse toward a circle independently. They never fight because the sweep
 * always matches whatever shape currently exists.
 */
function stepPhase(state: SimState, cfg: SimConfig, holding: boolean, dt: number): void {
  const cap = state.capture!;
  const orbit = cap.orbit!;

  cap.settleT += dt;
  // Per capture, not per config: a body may author a shorter settle. Falls back to
  // `cfg.settleDur`, which `freezeOrbit` copies in for every ordinary capture.
  const u = Math.min(1, cap.settleT / Math.max(0.01, cap.settleDur || cfg.settleDur));
  const shape = smootherstep(u);
  const tightenAmt = cfg.tightenFrac * shape;

  // An authored orbit is a glide with boundary conditions, not an ellipse being
  // rounded off. The cubic below leaves the press at exactly the radius and
  // closing rate the ship had, and arrives at the authored circle with no radial
  // speed left — so both ends match and there is nothing to step at either.
  //
  // Radius here does not depend on the angle at all, which is why it is computed
  // once and used for the sweep and for the new position both. A spiral in is not
  // a curve the ship rides round; it is a distance closing on a clock.
  const authored = cap.settleSweep > 0;
  const rNow = authored
    ? approachRadius(cap, u)
    : orbitRadius(orbit, cap.rPeri, cap.theta, tightenAmt);
  if (cap.Lfrozen === undefined) cap.Lfrozen = cap.phaseSpeedReal * cap.rPeri * cap.rPeri;

  // As tightening rounds the orbit toward a circle, holding the oval's angular
  // momentum would spin that small circle at periapsis speed forever. Physically
  // you must shed energy to circularize, so ease L toward the circular value —
  // or, where the body authors its own pace, toward that instead. Easing the same
  // quantity either way is what keeps the settle seamless: the sweep always
  // matches whatever shape currently exists, authored or not.
  const Lcirc = cap.settleSweep > 0 ? cap.settleSweep * rNow * rNow : circSpeed(cfg, rNow) * rNow;
  const Leff = cap.Lfrozen * (1 - tightenAmt) + Lcirc * tightenAmt;
  const sweepRate = (Leff / (rNow * rNow)) * cfg.phaseRate;
  cap.phaseSpeed = sweepRate;
  cap.phaseMul = cfg.phaseRate;
  cap.theta += orbit.dir * sweepRate * dt;

  const rNew = authored ? rNow : orbitRadius(orbit, cap.rPeri, cap.theta, tightenAmt);
  cap.rx = Math.cos(cap.theta) * rNew;
  cap.ry = Math.sin(cap.theta) * rNew;
  const tx = -Math.sin(cap.theta) * orbit.dir;
  const ty = Math.cos(cap.theta) * orbit.dir;
  const tangentialSpeed = cap.phaseSpeed * rNew;
  cap.vx = tx * tangentialSpeed;
  cap.vy = ty * tangentialSpeed;
  // A glide is closing as well as sweeping, and the velocity has to say so — it
  // is what the release flings, what the trail draws and what the camera leans
  // on. The tangential-only form is right for an ellipse, where the phase clock
  // rides a curve; here it would report a ship in a circular orbit while it is
  // visibly falling toward one.
  if (authored) {
    const rDot = approachRate(cap, u);
    cap.vx += Math.cos(cap.theta) * rDot;
    cap.vy += Math.sin(cap.theta) * rDot;
  }

  // Circularizing costs fuel; running dry mid-burn putters the ship out.
  //
  // A body that authors a `refuel` rate pays it back once the orbit is round and
  // the ship is simply parked. Nothing else in the game restores fuel inside a
  // capture, which is precisely why "catch your breath" was not something the
  // economy could say: `fuelRegen` runs only while drifting, so resting anywhere
  // cost the tank. Gated on `u >= 1` so it is the settled orbit that pays, not
  // the circularization on the way in.
  if (holding && !authored && (u < 1 || cap.phaseMul !== 1)) {
    const beforeSettle = state.fuel;
    state.fuel = burn(state.fuel, cfg.fuelPerSec, dt);
    cap.fuelSpent += beforeSettle - state.fuel;
    if (state.fuel <= 0 && u < 1) cap.puttered = true;
  } else if (!holding) {
    state.fuel = regen(cfg, state.fuel, dt);
  }
  if (cap.refuel > 0 && u >= 1) {
    state.fuel = Math.min(cfg.fuelMax, state.fuel + cap.refuel * dt);
  }

  cap.periR = Math.min(cap.periR, rNew);
  cap.apoR = Math.max(cap.apoR, rNew);
  cap.settleProgress = shape;

  if (cap.boostFull > 0) {
    cap.boostT = (cap.boostT || 0) + dt;
    cap.boost = boostEnvelope(cfg, cap.boostFull, cap.boostT);
  }

  if (u >= 1) cap.phase = 'orbit';
  updateDefl(state);
}

/**
 * Per-sample heading deflection above this is a visible kink.
 *
 * Lived in `src/sim/trace.ts` alongside a `TraceRecorder` that nothing ever
 * instantiated — the diagnostics replay superseded it — so it moved here, next to
 * the code that produces the value it thresholds.
 */
export const KINK_THRESHOLD_DEG = 15;

/** Per-sample heading deflection. Telemetry only; never feeds back into physics. */
function updateDefl(state: SimState): void {
  const cap = state.capture!;
  const ang = Math.atan2(cap.vy, cap.vx);
  let d = ((ang - cap.lastAngle) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  cap.defl = Math.abs(d);
  cap.lastAngle = ang;
}

/**
 * Take any dot the ship is passing through.
 *
 * Proximity and nothing else — no contact, no bounce, no policy. A dot has no
 * surface, which is the difference between flying THROUGH something and hitting
 * it, and it is why these are not bodies.
 *
 * The whole list is swept every tick. Ten dots against sixty bodies and eight
 * substeps of gravity is not a cost worth indexing away, and a spatial structure
 * here would be a second thing that has to stay in step with a respawn.
 */
function collectMotes(state: SimState, cfg: SimConfig, x: number, y: number): void {
  if (state.motes.length === 0 || cfg.carpetMoteRange <= 0) return;
  const r2 = cfg.carpetMoteRange * cfg.carpetMoteRange;
  for (const m of state.motes) {
    if (m.taken) continue;
    const dx = x - m.x;
    const dy = y - m.y;
    if (dx * dx + dy * dy <= r2) m.taken = true;
  }
}

/**
 * Free drift: one step per frame, no forces.
 * Returns true if the ship crashed, which aborts the rest of the tick.
 */
function stepDrift(state: SimState, cfg: SimConfig, holding: boolean, dt: number): boolean {
  const { ship } = state;

  // Transient escape burst, decaying over boostBurstDecay seconds.
  let bx = 0;
  let by = 0;
  if (ship.burstX || ship.burstY) {
    ship.burstT = (ship.burstT || 0) + dt;
    const f = Math.max(0, 1 - ship.burstT / cfg.boostBurstDecay);
    if (f <= 0) {
      ship.burstX = 0;
      ship.burstY = 0;
    } else {
      bx = ship.burstX * f;
      by = ship.burstY * f;
    }
  }

  const { ax, ay } = driftAccel(state, cfg, ship.x, ship.y, holding);
  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.x += (ship.vx + bx) * dt;
  ship.y += (ship.vy + by) * dt;

  // Contact during drift is lethal unless it is essentially a parallel graze —
  // which preserves the legitimate case of flinging tangentially past a planet
  // you just left.
  for (const p of state.bodies as Body[]) {
    const policy = contactPolicy(cfg, 'drift', p);
    if (policy.kind !== 'bounce') continue;
    const surf = p.R + policy.offset;
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const d = hypot(dx, dy);
    if (d >= surf) continue;

    const nx = dx / d;
    const ny = dy / d;
    const spd = hypot(ship.vx, ship.vy);
    const vn = ship.vx * nx + ship.vy * ny;
    const intoSurface = spd > 1 && -vn / spd > cfg.crashGrazeDot;

    if (policy.lethal && intoSurface) {
      ship.x = p.x + nx * surf;
      ship.y = p.y + ny * surf;
      ship.vx = 0;
      ship.vy = 0;
      ship.alive = false;
      endRun(state, 'impact', ship.x, ship.y);
      return true;
    }

    ship.x = p.x + nx * surf;
    ship.y = p.y + ny * surf;
    if (vn < 0) {
      const k = reflectCoefficient(policy.restitution);
      ship.vx -= k * vn * nx;
      ship.vy -= k * vn * ny;
    }
  }
  return false;
}
