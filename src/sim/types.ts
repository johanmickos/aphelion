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
  /** Seconds this capture takes to settle. `SimConfig.settleDur` unless authored. */
  settleDur: number;

  /** Ran dry mid-circularization; the ship putters out with a weak, boostless release. */
  puttered: boolean;

  /**
   * Fuel spent braking this flyby, for the conversion refund. Zeroed once paid,
   * so a capture cannot collect twice — though `phase` only ever leaves `flyby`
   * one way, so the conversion happens at most once per capture anyway.
   */
  brakeSpent: number;

  /** Per-sample heading deflection, for the trace recorder. Not physics. */
  lastAngle: number;
  defl: number;
}

/** Why a run ended. Drives which notice the player is shown. */
export type EndingReason = 'impact' | 'out-of-bounds' | 'fell-behind';

export interface EndingState {
  active: boolean;
  t: number;
  x: number;
  y: number;
  reason: EndingReason;
}

// ------------------------------------------------------------------- telemetry

/** Why a grab did or did not take. */
export type GrabResult =
  | 'captured'
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
  /** Diagnostics only. Never read by physics; excluded from the fingerprint. */
  telemetry: Telemetry;
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
