/**
 * The deadline and the SOS, as the picture needs them.
 *
 * The prediction itself is [`rescue.ts`](../sim/rescue.ts) — it forward-simulates
 * and needs `stepSim`, which is why it lives beside the simulation. What is here
 * is the two things presentation state owns: **when the scan is worth re-running**,
 * and **what the SOS remembers**.
 *
 * ## The scan is a property of the coast, not of the frame
 *
 * A drift takes no input, so the whole projection stays true for as long as the
 * craft is on the same line — and measured over the author's dispatches, a
 * coasting craft's heading is constant on **99.92% of ticks**, the exceptions
 * being the four contacts in the corpus (one of them a 101.9° bounce). So this
 * recomputes when the line changes and carries the answer otherwise, which turns
 * a 0.019 ms scan into something a run pays about once every 26 ticks.
 *
 * **It still converges**, which is
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
 * third rule and the only thing that makes a carried value safe: the scan is
 * re-run at least every [`RESTATE_TICKS`](#restate_ticks) whatever else happens,
 * so a deadline that somehow disagreed with the simulation cannot survive half a
 * second of it.
 */
import { rescueDeadline, turnedAway } from '../sim/rescue.ts';
import type { Deadline, Wall } from '../sim/rescue.ts';
import type { SimState } from '../sim/types.ts';
import { ticksIn } from './decay.ts';
import type { DeadlineView, SosView } from './types.ts';

/** Spec [03 · §5](../../docs/spec/03-hud.md)'s **300ms** fade-in, in ticks. */
export const FADE_TICKS = ticksIn(300);

/**
 * How long a carried scan may go without being re-run, in ticks.
 *
 * Half a second. It is a **convergence bound rather than a refresh rate**: the
 * scan is already re-run whenever the drift changes, so this only exists to make
 * ADR-0015's third rule literally true — nothing here can carry a disagreement
 * for longer than this, whatever the disagreement was about. At 0.019 ms a scan
 * it costs a run about 0.04 ms a second.
 */
export const RESTATE_TICKS = ticksIn(500);

/**
 * How much of its own brightness the SOS carries at the bottom of its strobe.
 *
 * Spec 07 §6 asks for a strobe *"at 2Hz. It is a signal, not a scream"*, and a
 * strobe that reaches zero is a thing that keeps disappearing — which reads as
 * broken rather than as urgent, and is the one thing a distress call must not do.
 * The prototype pulses between 0.45 and 1 of its own alpha for the same reason and
 * this is that floor.
 */
export const SOS_FLOOR = 0.45;

/** Spec 07 §6's **2Hz**, as a period in ticks. */
export const SOS_PERIOD = ticksIn(500);

/** What was worked out last tick, so this one can decide whether to work again. */
export interface DeadlineMemo {
  readonly deadline: Deadline | null;
  /** The velocity the scan was run at, so a change of line can be seen. */
  readonly vx: number;
  readonly vy: number;
  /** The tick it was run on, for [`RESTATE_TICKS`](#restate_ticks). */
  readonly at: number;
  /** How many ticks it has been fading in for — spec 03 §5's 300ms. */
  readonly shown: number;
  /**
   * The wall a **grab** armed the SOS about, or `null`.
   *
   * The one thing here that is genuinely remembered rather than re-derived. See
   * [`SosView.held`](./types.ts).
   */
  readonly doomed: Wall | null;
}

export const NO_DEADLINE: DeadlineMemo = {
  deadline: null,
  vx: 0,
  vy: 0,
  at: -1,
  shown: 0,
  doomed: null,
};

/**
 * Whether the drift this scan was run for is still the drift the craft is on.
 *
 * **Direction, not speed.** A release leaves a decaying burst behind it that
 * changes how fast the craft covers its line without changing the line — spec
 * 01 §8's transient *"moves the craft's position, never its heading"* — so
 * comparing velocities outright would re-run the scan every tick of every coast
 * for no change in the answer. The cross product is zero exactly when the two are
 * parallel, and it needs no `atan2` (ADR-0014 bans it here anyway).
 */
function sameLine(memo: DeadlineMemo, sim: SimState): boolean {
  const cross = memo.vx * sim.craft.vy - memo.vy * sim.craft.vx;
  const scale = Math.abs(memo.vx) + Math.abs(memo.vy) + Math.abs(sim.craft.vx) + 1;
  return Math.abs(cross) < scale * scale * 1e-12;
}

/**
 * The deadline one tick on: re-scanned if the drift has changed, carried if not.
 *
 * A held craft has no grab deadline — the escape from a capture is a release, not
 * a grab, which is the author's ruling of 2026-09-01 and the prototype's own
 * split. What covers that case is the SOS below, armed on the press.
 */
export function deadlineOf(previous: DeadlineMemo, sim: SimState): DeadlineMemo {
  const doomed = doomOf(previous, sim);
  if (sim.heldBody !== null || sim.ending !== null) {
    return { ...NO_DEADLINE, doomed };
  }
  const stale = previous.at < 0 || sim.tick - previous.at >= RESTATE_TICKS;
  if (!stale && sameLine(previous, sim)) {
    // Carried. The scan's points are world points, so the craft advancing into
    // them changes nothing about them — what moves is only how far in the fade is.
    return {
      ...previous,
      shown: previous.deadline === null ? 0 : Math.min(FADE_TICKS, previous.shown + 1),
      doomed,
    };
  }
  const deadline = rescueDeadline(sim);
  return {
    deadline,
    vx: sim.craft.vx,
    vy: sim.craft.vy,
    at: sim.tick,
    // A fresh scan starts its fade from nothing, which is spec 03 §5's *"it fades
    // in over 300ms"* — and is what stops a line that changes mid-drift snapping
    // a new window onto the screen.
    shown: 0,
    doomed,
  };
}

/**
 * Whether a **grab** has armed the SOS, and whether it still holds.
 *
 * **Armed on the press, from the deadline that was already there.** The prototype
 * re-runs its whole projection from the pre-grab state to answer this; here the
 * answer is already on the previous tick's memo, because a drifting craft has been
 * carrying its own deadline all along. If that deadline had no `cross`, the press
 * that has just taken a body was already too late.
 *
 * **Cleared the moment the craft has actually turned away**, which is the
 * prototype's own safety valve: the prediction is 95% rather than certain, so a
 * capture that turns out to work must be able to take the mark back off.
 */
function doomOf(previous: DeadlineMemo, sim: SimState): Wall | null {
  if (sim.ending !== null) return previous.doomed;
  if (sim.heldBody === null) return null;
  if (previous.doomed !== null) {
    return turnedAway(sim.craft, previous.doomed) ? null : previous.doomed;
  }
  // The transition: coasting last tick, held now.
  const was = previous.deadline;
  if (was === null || was.cross !== null) return null;
  return was.wall;
}

/** The deadline as the renderer is handed it, or `null` when there is none. */
export function deadlineView(memo: DeadlineMemo): DeadlineView | null {
  const found = memo.deadline;
  if (found === null) return null;
  return {
    path: found.path,
    cross: found.cross,
    presence: FADE_TICKS <= 0 ? 1 : Math.min(1, memo.shown / FADE_TICKS),
    // **A full tank, and it is a named zero in that shape.** Spec 03 §5 couples
    // fuel to this *"by luminance, never geometry"*, so M4.4 changes this number
    // and nothing else about the picture. Its neutral value is 1 rather than 0
    // because a constraint that does not exist yet is one that does not bind.
    affordable: 1,
  };
}

/**
 * The SOS as the renderer is handed it, or `null`.
 *
 * **One meaning in two states**, which is the author's ruling of 2026-09-01: a
 * drift past its own dot, and a capture that was already too late. Neither is a
 * priority over the other because they cannot both be true — a held craft has no
 * deadline and a drifting one has not grabbed.
 */
export function sosOf(memo: DeadlineMemo, sim: SimState): SosView | null {
  const wall =
    memo.doomed ??
    (memo.deadline !== null && memo.deadline.cross === null ? memo.deadline.wall : null);
  if (wall === null || sim.ending !== null) return null;
  // The strobe, as a triangle rather than a sine: ADR-0014 keeps `sin` out of
  // anything the simulation has to agree about across two engines, and this is
  // derived beside it under the same rule. What the eye reads at 2Hz is the rate
  // and the depth, neither of which the shape changes.
  const at = SOS_PERIOD <= 0 ? 0 : (sim.tick % SOS_PERIOD) / SOS_PERIOD;
  const beat = at < 0.5 ? at * 2 : (1 - at) * 2;
  return {
    toward: wall === 'right' ? 1 : -1,
    strength: SOS_FLOOR + (1 - SOS_FLOOR) * beat,
    held: memo.doomed !== null,
  };
}
