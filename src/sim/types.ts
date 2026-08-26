/**
 * Simulation types.
 *
 * Bodies and pickups are discriminated unions: adding a `kind` makes the compiler
 * enumerate every site that must handle it (forces, contact, targeting, render).
 * Stage 0 has exactly one body kind; the union shape is deliberate, not premature.
 */

export interface Vec {
  x: number;
  y: number;
}

// --------------------------------------------------------------------- bodies

export interface Planet {
  kind: 'planet';
  x: number;
  y: number;
  /** Surface radius. */
  R: number;
  name: string;
}

/**
 * An anomaly: an alien body sitting OUTSIDE the corridor, past the barrier.
 *
 * It is a normal gravitating body in every respect the simulation cares about —
 * captured by the same code, orbited by the same phase clock, contacted by the
 * same policy. The only thing that makes it special is `bubble`.
 *
 * The bubble is a radius within which the field's side boundary does not kill.
 * That single exemption is the whole mechanic: it is what lets a well-aimed
 * release coast THROUGH the barrier, and what kills a badly-aimed one the moment
 * it drifts out the far side. The barrier itself never moves — `fieldBounds` is
 * untouched — so ordinary play is unaffected everywhere the bubble does not
 * reach, and the protection cannot leak to the opposite wall because the two are
 * further apart than any bubble is wide.
 */
export interface Anomaly {
  kind: 'anomaly';
  x: number;
  y: number;
  /** Surface radius. */
  R: number;
  name: string;
  /** Radius within which the side boundary is suspended. */
  bubble: number;
  /**
   * The orbit a capture here settles to, regardless of how the dive arrived.
   *
   * An anomaly is a rest stop, not a test of the approach: a fixed modest orbit
   * at a fixed unhurried pace is the breathing room it exists to give. Held on
   * the BODY rather than read from config at the point of use, like `bubble`, so
   * that anomalies of different kinds can differ without any of this moving.
   */
  orbitR: number;
  /** Seconds for one lap of that orbit, once settled. */
  orbitPeriod: number;
  /** Fuel per second restored while parked in it. */
  refuel: number;
  /**
   * Seconds to reach that orbit, instead of `SimConfig.settleDur`.
   *
   * Shorter, because the arrival is not the point here. Reported as "I spent a
   * second or so waiting to stabilize which felt wasted — the screen with just
   * the purple orb is really powerful and I don't want to delay that effect": the
   * settle is the delay between committing and getting the thing you committed
   * for.
   */
  settleDur: number;
}

export type Body = Planet | Anomaly;

// ---------------------------------------------------------------------- motes

/**
 * A green dot in the run-in carpet: flown through rather than grabbed.
 *
 * DELIBERATELY NOT A THIRD `Body.kind`, which is what `docs/IDEAS.md` proposed
 * and what `contactPolicy` would have made cheap. A body is a thing with mass and
 * a surface, and every one of those facts is load-bearing somewhere: `fieldBounds`
 * takes the crest from the topmost body, so a dot placed above the last planet
 * would MOVE THE FINISH LINE; `nearestBody` would offer one to a press; the
 * capture loop would bounce off it. A dot has none of those properties — it has a
 * position and a boolean — so it is its own list, and the four subsystems that
 * would each have needed a `kind !== 'mote'` guard never learn it exists.
 *
 * Only `taken` ever changes, and only from false to true within a life; a respawn
 * puts them all back. That is what keeps the carpet the same puzzle on every
 * attempt.
 */
export interface Mote {
  x: number;
  y: number;
  taken: boolean;
}

// ------------------------------------------------------------------ signature

/**
 * The line the ship drew through the carpet, kept so the ceremony can show it.
 *
 * IT CANNOT COME FROM `Trail`. That is capped at `trailMax` points and cleared on
 * a respawn — it is a wake, which is a picture of the last half second, not a
 * record. This opens when the ship enters the run-in band and closes when the run
 * does, and because it is written by `stepSim` it is a pure function of
 * `(config, seed, inputLog)` like everything else: a replay reproduces the same
 * signature the player was shown, which is what would make one shareable or
 * verifiable rather than decorative.
 *
 * NOTHING IN THE SIMULATION READS IT. It is written in the same spirit as
 * `Telemetry` and excluded from `fingerprint()` for the same reason — a report
 * recorded before it existed must not read as diverged — but it is not
 * diagnostics, so it does not live there.
 *
 * SAMPLED BY DISTANCE, AND DECIMATED RATHER THAN TRUNCATED. Sampling every tick
 * would make the density depend on speed, which is exactly the defect `Trail`'s
 * header records about the prototype. And when the buffer fills, dropping the
 * OLDEST points would quietly amputate the start of the signature — the part
 * nearest the crest, where the carving usually begins. Throwing away every second
 * point instead and doubling the spacing keeps the whole shape at half the
 * resolution, which is a thing nobody can see.
 */
export interface Signature {
  /** Path points in world coordinates, oldest first. */
  pts: Vec[];
  /** Current sample spacing, px. Doubles each time the buffer is decimated. */
  spacing: number;
}

// -------------------------------------------------------------------- contact

/**
 * How a contact resolves. Stage 0 only ever constructs `bounce`; the other
 * variants exist so wormholes (teleport), nebulae and belts (drag) can be added
 * without restructuring the resolver's return type.
 */
export type ContactResponse =
  | { kind: 'bounce'; offset: number; restitution: number; lethal: boolean }
  | { kind: 'teleport'; to: Vec }
  | { kind: 'drag'; coef: number }
  | { kind: 'pass' };

// ---------------------------------------------------------------------- phase

/**
 * Capture phase.
 *
 * NOTE: the prototype documents a `whip` phase but never assigns it — `clear`
 * carries the entire dive. Reproduced faithfully. See docs/PORT_NOTES.md note 4.
 */
export type CapturePhase = 'clear' | 'flyby' | 'settle' | 'orbit';

/** A frozen orbit: the geometric ellipse the phase clock sweeps. */
export interface Orbit {
  /** Semi-major axis. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Argument of periapsis (absolute angle at which periapsis sits). */
  argp: number;
  /** Sweep direction, +1 or -1. */
  dir: number;
}

// -------------------------------------------------------------------- entities

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** Transient escape burst, applied on top of velocity during drift and decaying. */
  burstX: number;
  burstY: number;
  burstT: number;
}

export interface Capture {
  phase: CapturePhase;
  /** Index into SimState.bodies of the grabbed body. */
  planet: number;

  /** Position and velocity, in coordinates relative to the grabbed body. */
  rx: number;
  ry: number;
  vx: number;
  vy: number;

  grabR: number;
  /** Minimum permitted orbit radius: body.R + minOrbitGap. */
  minR: number;

  prevR: number;
  prevDR: number;
  passedPeri: boolean;
  periR: number;
  apoR: number;

  clearFramesLeft: number;
  clearDvx: number;
  clearDvy: number;

  /** Peak specific orbital energy seen during the dive, captured before any floor clamp. */
  whipE: number | undefined;

  orbit: Orbit | null;
  /** Current true anomaly along the frozen orbit. */
  theta: number;
  /** Current angular sweep rate (rad/s). */
  phaseSpeed: number;
  /** Sweep rate implied by the dive's true periapsis speed. */
  phaseSpeedReal: number;
  phaseMul: number;
  /** Frozen angular momentum of the oval. */
  Lfrozen: number | undefined;
  rPeri: number;

  settleT: number;
  settleProgress: number;
  tightness: number;

  /** Peak boost potential banked at periapsis. */
  boostFull: number;
  /** Live boost value: ramps up, then decays. */
  boost: number;
  /** Seconds since the orbit froze. */
  boostT: number;

  /**
   * Angular rate the settle eases to, or 0 to ease to the circular rate.
   *
   * Set only by a body that authors its own orbit. `rPeri` carries the authored
   * RADIUS — it is the circle the settle tightens toward, which is what every
   * consumer downstream already reads it as — and this carries the pace.
   */
  settleSweep: number;
  /** Fuel per second restored while parked, from the body. */
  refuel: number;
  /**
   * The radius and radial speed the authored approach starts from.
   *
   * An authored orbit is not an ellipse being tightened toward a circle — there
   * is no ellipse, because the freeze happens at the press rather than at a
   * periapsis, and at a press the ship is usually still falling. These are the
   * boundary conditions at the near end of the glide: where the ship was and how
   * fast it was closing. The far end is the authored circle, reached with no
   * radial speed left. Zero for every capture that is not authored.
   */
  approachR0: number;
  approachVR: number;
  /** Seconds this capture takes to settle. `SimConfig.settleDur` unless authored. */
  settleDur: number;

  /**
   * This capture's arrival was bought with a `zip` charge rather than flown.
   *
   * Physics never reads it — the authored glide is already described by
   * `settleSweep` and friends. It exists for the SCORER, and for one thing only:
   * WHEN the grab award is owed. A flown capture owes it at periapsis, the moment
   * the swing happened; a zipped one has no periapsis to swing through, so it owes
   * it when the glide ends and the ship is where it was going. What the award is
   * worth is deliberately identical either way — see `score.ts`.
   */
  zipped: boolean;
  /** Ran dry mid-circularization; the ship putters out with a weak, boostless release. */
  puttered: boolean;

  /**
   * Fuel spent braking this flyby, for the conversion refund. Zeroed once paid,
   * so a capture cannot collect twice — though `phase` only ever leaves `flyby`
   * one way, so the conversion happens at most once per capture anyway.
   */
  brakeSpent: number;

  /**
   * Fuel this capture has actually DEDUCTED, brake and settle together, and how
   * much of it has already been handed back.
   *
   * Gross and returned are tracked separately so the escape refund can pay only
   * for fuel nobody has refunded yet — `flybyConvertRefund` already returns half
   * the brake on a conversion, and note 29 is titled "A rescue paid for itself
   * twice" for a reason. What was DEDUCTED and not what was quoted, for the reason
   * `brakeSpent` records: a brake held against a near-empty tank must not convert
   * into more fuel than the tank ever had.
   */
  fuelSpent: number;
  fuelBack: number;
  /**
   * The wall this capture is closing on from inside the danger band: -1 left,
   * +1 right, 0 when it is not. Armed on entering the band while still closing,
   * and spent the moment the closing stops. See `SimConfig.escapeKick`.
   */
  escapeSide: number;
  /** This capture has already been paid for one escape. Once per capture. */
  escaped: boolean;
  /** Per-sample heading deflection, for the trace recorder. Not physics. */
  lastAngle: number;
  defl: number;
}

/** Why a run ended. Drives which notice the player is shown. */
/**
 * How a run ended.
 *
 * `cleared` is the only one that is not a failure: the ship rose past the topmost
 * body, which means there is no more field to fly. It is an ENDING rather than a
 * new state because everything downstream already knows how to stop for one —
 * the scorer seals the run, the recorder closes the log, the renderer holds the
 * frame — and inventing a parallel "finished" path would be four places agreeing
 * to do the same thing under a second name.
 */
export type EndingReason = 'impact' | 'out-of-bounds' | 'fell-behind' | 'cleared';

export interface EndingState {
  active: boolean;
  t: number;
  x: number;
  y: number;
  reason: EndingReason;
}

// ------------------------------------------------------------------- telemetry

/**
 * What a press did.
 *
 * `carved` is the odd one and is deliberately not a refusal: inside the run-in
 * carpet a press bends the line instead of reaching for a planet, so nothing was
 * asked for and nothing was denied. See `SimConfig.carpetCarve`.
 */
export type GrabResult =
  | 'captured'
  | 'carved'
  | 'refused-no-fuel'
  | 'refused-crash-cone'
  | 'refused-out-of-range'
  | 'refused-no-body';

/**
 * Observability, written by the simulation and never read by it.
 *
 * Nothing here may influence a trajectory — it exists so a replay can explain
 * *why* something happened, not just what the numbers were. A refused grab, for
 * instance, is otherwise completely invisible: the player presses, nothing
 * happens, and the trace shows an uninterrupted drift.
 */
export interface Telemetry {
  /** The most recent grab attempt and its outcome. */
  lastGrab: { tick: number; result: GrabResult } | null;
  /** Substeps in which the minimum-orbit floor clamped the ship, this capture. */
  floorSubsteps: number;
  /** Substeps clamped by the floor across the whole session. */
  floorSubstepsTotal: number;
  /** Captures that ran dry mid-circularisation and puttered out. */
  putterOuts: number;
}

// ----------------------------------------------------------------------- state

export interface SimState {
  /** Monotonic tick counter. All timing derives from this; never wall clock. */
  tick: number;
  ship: Ship;
  /** Null while drifting. */
  capture: Capture | null;
  bodies: Body[];
  /**
   * The dots scattered through the run-in carpet. Empty when there is no carpet.
   *
   * Beside `bodies` rather than inside it, for the reasons `Mote` gives.
   */
  motes: Mote[];
  /**
   * The line drawn through the carpet, for the ceremony to show. See `Signature`.
   *
   * Written by `stepSim` and read by nothing under `src/sim/`.
   */
  signature: Signature;
  /**
   * Which way the next carve in the carpet bends: -1 left, +1 right, 0 unset.
   *
   * ALTERNATES ON EACH PRESS, which is the whole of what makes the carpet
   * expressive with one button. A fixed direction only ever draws the same arc,
   * and "toward the middle" — the other stateless rule available — is the funnel's
   * job already and would draw nothing at all. Flipping means two taps make an S
   * and a rhythm makes a ribbon, so the shape is the player's timing rather than
   * the game's.
   *
   * The first carve of a life bends toward the centre of the field, so a press
   * taken near a wall never opens by driving at it. After that it simply
   * alternates.
   *
   * DELIBERATELY NOT IN `fingerprint()`, for the reason `chargedT` records: it
   * changes the trajectory the moment a carve takes it, and the position and
   * velocity already hashed catch that. Adding a field would make every report
   * recorded before it read as diverged from its first checkpoint.
   */
  carveDir: number;
  /** Ship fuel. Persists across captures and regenerates during drift. */
  fuel: number;
  /**
   * The highest point reached this run (smallest y). Only ever ratchets up.
   *
   * The floor that ends a run for falling behind trails this rather than sitting
   * at a fixed depth, so the pressure follows the player up the climb instead of
   * being something you outrun once and never meet again.
   */
  highWaterY: number;
  ending: EndingState;
  /**
   * The current hold has already been resolved by the simulation (a putter-out),
   * so the pointer-up that follows must be swallowed. The prototype achieved this
   * by having the sim write to its input variable; input is an input here, so the
   * fact is recorded in state instead. See docs/PORT_NOTES.md note 7.
   */
  holdConsumed: boolean;
  /**
   * Seconds left on the charged window. 0 when none is running.
   *
   * Opened by releasing from an anomaly's orbit; while it runs, EVERY grab zips
   * (see `zipOrbit`). This is the anomaly's whole reward now — it replaced both a
   * single `zip` charge and a ten-second scoring multiplier, neither of which
   * asked anything of the player once earned.
   *
   * Seconds drained by `dt` inside `stepSim`, which is how every other duration in
   * the simulation is kept — `ending.t`, `boostT`, `settleT`. The scorer's windows
   * are tick deadlines instead, because the scorer is an observer that must not
   * assume how often it is called; nothing in here has that problem.
   *
   * IT LIVES HERE AND NOT IN THE SCORER because it changes what the ship can
   * physically do. A window that only multiplied points was legal in `ScoreState`;
   * one that decides whether a grab dives or glides is simulation, and a
   * simulation that asked the scorer for permission would stop being a pure
   * function of (config, seed, inputLog).
   *
   * Deliberately NOT in `fingerprint()` — the window changes the trajectory the
   * moment a grab takes it, and the position and velocity already hashed catch
   * that. Adding a field would make every report recorded before it read as
   * diverged from its first checkpoint.
   */
  chargedT: number;
  /**
   * Index of the body the last release left, or -1.
   *
   * Read by `grabTarget` ONLY while a charged window is running, where it is
   * excluded from targeting. Reported as "when we have our anomaly charged, it
   * should never grab the same planet that the player is coming from — it should
   * really feel like Spider-Man sending sticky web forward and pulling us ahead":
   * measured in the session that reported it, three of five presses inside one
   * window zipped straight back onto the planet just released from, because right
   * after a release you are still well inside `grabRange` of it and it is the
   * nearest thing there is.
   *
   * A discrete exclusion of one body rather than a heading cone, deliberately, and
   * `nearestBody` records why: a cone needs a threshold, and a threshold is a
   * cliff the player falls off as a body drifts across an arbitrary line. "The one
   * I just let go of" needs no threshold and cannot drift.
   */
  cameFrom: number;
  /** Diagnostics only. Never read by physics; excluded from the fingerprint. */
  telemetry: Telemetry;
}

/**
 * An orbit a capture is told to settle into, instead of inheriting one from a
 * dive.
 *
 * An anomaly satisfies this structurally, which is how the rest stop authors its
 * own orbit; a zip synthesises one from the orbit the dive WOULD have flown to,
 * so the ship arrives where it was heading without flying there. Anything else
 * that wants to author an arrival implements these four numbers.
 */
export interface AuthoredOrbit {
  /** Radius of the circle the settle glides onto. */
  orbitR: number;
  /** Seconds per lap once parked. */
  orbitPeriod: number;
  /** Fuel per second restored while parked. 0 for most things. */
  refuel: number;
  /** Seconds the glide takes, whatever the distance. */
  settleDur: number;
}

// ----------------------------------------------------------------------- input

/** Edge-triggered input for one tick, plus the current hold level. */
export interface Input {
  /** Pointer is currently down. */
  held: boolean;
  /** Pointer went down on this tick. */
  pressed: boolean;
  /** Pointer came up on this tick. */
  released: boolean;
}

export const NO_INPUT: Readonly<Input> = Object.freeze({
  held: false,
  pressed: false,
  released: false,
});

/** A recorded input edge, addressed by tick so replays are exact. */
export type InputEvent = { tick: number; kind: 'press' | 'release' };
