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
import {
  MIN_LEAD_SECONDS,
  advanceScan,
  openScan,
  strandedWhileHeld,
  turnedAway,
} from '../sim/rescue.ts';
import type { Deadline, Scan, Wall } from '../sim/rescue.ts';
import type { SimState } from '../sim/types.ts';
import { SECONDS_PER_TICK } from '../sim/units.ts';
import { OUTER_BAND } from './boundary.ts';
import { ticksIn } from './decay.ts';
import type { DeadlineView, SosView } from './types.ts';

/**
 * How much lead the mark needs before it is drawn at all, in seconds, and how
 * much before it is at full strength — the prototype's **2.63** and **1.35**.
 *
 * ## ⚠ This is what the author flew and refused, 2026-09-01
 *
 * > *"It's really long, impacting my normal playing field. I feel like it should
 * > only appear... closer to the boundary. Within the main playfield I almost
 * > always have an opportunity to save myself, so the bright red line is not
 * > helpful."*
 *
 * The first build ramped only on spec 03 §5's 300 ms fade and then drew at full
 * strength for as long as the projection could see a wall — six seconds of it,
 * across the whole field. **The prototype ramps on the *lead* instead**, which is
 * the thing the complaint is about: a cross more than 2.63 s ahead is invisible,
 * one 1.35 s ahead is at full strength, and between them it comes up. So the cue
 * is a property of *how close the decision is* rather than of whether a wall is
 * findable at all, and the middle of the field stays empty because that is where
 * a rescue is never in doubt.
 *
 * It replaces the 300 ms fade rather than joining it: two ramps on one alpha is
 * two things that can disagree about whether the cue is up.
 */
export const FADE_IN_SECONDS = 2.63;
export const FULL_SECONDS = 1.35;

/**
 * How long a carried scan may go without being re-run, in ticks — **two seconds,
 * and it is a backstop rather than a mechanism.**
 *
 * ## ⚠ It was half a second, and it was the majority of the cost on real play
 *
 * Measured over the author's own reference run, **6 of the 10 ticks that cost over
 * 0.3 ms were convergence re-scans** — full scans that found the answer already in
 * hand. On the shipped pilot it is 4 scans; on a run that spends its time coasting
 * at walls it is 8, and they dominate.
 *
 * **A memo of a pure function is not a decay**, which is the distinction
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s third
 * rule is written about. What the scan depends on is the **ray**, and the ray is
 * checked directly ([`sameLine`](#sameline)) — the craft advancing along it changes
 * none of the answer, because every point in it is a world point. So this is
 * insurance against a cache key that is wrong, not the thing that keeps the value
 * true.
 *
 * **And the one job it was quietly doing has been taken off it.** A craft that
 * passes its own dot has no rescue left, and that used to be learned by the next
 * re-scan reporting no cross — up to half a second late. It is read off the lead
 * now ([`hasRescue`](#hasrescue)), immediately, which is both cheaper and sooner.
 */
export const RESTATE_TICKS = ticksIn(2000);

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
  /**
   * How many ticks the mark has existed for, so nothing pops into being.
   *
   * ⚠ It counts the **mark's own life** and not the scan's. The first build reset
   * it on every re-scan, and since the scan is re-run every
   * [`RESTATE_TICKS`](#restate_ticks) whether or not anything changed, the cue
   * faded out and back in twice a second — *"the warning line seems to draw,
   * disappear, and draw again as I'm traveling"* (author, 2026-09-01). A re-scan
   * that finds the same mark is not a new mark.
   */
  readonly shown: number;
  /**
   * A scan that has begun and is still being paid for, a few probes a tick.
   *
   * **This is where the spreading lives, and the side of the line it lives on is
   * the decision this field records.** The scan itself is
   * [`src/sim/rescue.ts`](../sim/rescue.ts)'s because it forward-simulates and
   * needs `stepSim`. *When it runs* is the picture's, because nothing in a tick
   * asks: `stepSim` never calls the scan, so spreading changes when work happens
   * and not what a tick does, and **`SIM_VERSION` does not move.**
   * `test/state/deadline.test.ts` proves it by stepping two runs side by side
   * rather than by reading a fingerprint, which is
   * `test/sim/version.test.ts`'s own *picture, not flight* case.
   */
  readonly pending: Scan | null;
  /**
   * The wall a **grab** armed the SOS about, or `null`.
   *
   * The one thing here that is genuinely remembered rather than re-derived. See
   * [`SosView.held`](./types.ts).
   */
  readonly doomed: Wall | null;
  /** The last tick the held craft was asked whether it is stranded — see `doomOf`. */
  readonly checked: number;
  /**
   * Whether the mark is worth **drawing**, decided once when it is born.
   *
   * The prototype's birth gate: a cross that appears with less lead than a person
   * can react in *"would be a red blink and nothing else."* ⚠ It is a rule about
   * the picture and it lives here rather than in the scan, because the scan's
   * `cross` is also what says whether a rescue **exists** — and conflating the two
   * told the author a press that worked was too late.
   *
   * Decided at birth and carried, so a mark that is drawn stays drawn through its
   * own arrival: re-testing it every tick *"would blink it out at the moment the
   * player is closest to it."*
   */
  readonly drawable: boolean;
}

export const NO_DEADLINE: DeadlineMemo = {
  deadline: null,
  vx: 0,
  vy: 0,
  at: -1,
  shown: 0,
  pending: null,
  doomed: null,
  checked: -1,
  drawable: false,
};

/**
 * How many of the scan's presses one tick may pay for — **ten**.
 *
 * ## ⚠ The spreading, ruled 2026-09-01 and earned 2026-09-02
 *
 * The scan was chosen in the grilling as *"every 3rd tick, spread over the
 * fade-in"* and only the stride half was built, deferred with the reason written
 * down: *"the measurement came in under the stated budget on a laptop, and the
 * phone is where that has to be settled."*
 *
 * **The ruling bounds when the scan finishes, not how many presses a tick buys.**
 * A scan is at most [`MAX_SAMPLES`](../sim/rescue.ts) samples plus a refinement of
 * at most a stride — 50 presses at worst — and what it has to fit inside is the
 * [`BIRTH_TICKS`](#birth_ticks) 18 the mark takes to come up anyway. At ten it
 * lands in **3 ticks at p50 and 4 at worst**, measured over the 27 replayable
 * dispatches; the fade-in is met with a wide margin rather than exactly.
 *
 * ## ⚠ It was three, and three was too dear — corrected 2026-09-02
 *
 * Three is the arithmetic that makes the *worst case* land in 17 ticks, and it
 * bought that bound with **34% of the mark's drawn life** (2 505 → 1 653 ticks
 * over the corpus, and the same fall presence-weighted). Ten costs 10%. The
 * author's own dispatches settled it: see the ⚠ note in
 * `docs/plan/m3-the-field.md` — the deadline scan's cost does **not** convert to
 * the phone at the factor an average tick does, because it is `stepSim` in a
 * tight loop rather than the allocating work of a normal `derive`. Measured, its
 * worst tick landed inside a phone frame that cost **3 ms in total** on two
 * separate runs, so the tail is worth bounding and was never worth that price.
 *
 * It also takes back the one regression three had introduced: at three the corpus
 * carries a **fourth** SOS gap that the whole scan does not, and at ten it is back
 * to three.
 *
 * It is not on the bench. The grilling ruled the same of `MAX_SAMPLES` and for
 * the same reason: *"nobody can judge a cost knob by eye."*
 */
export const SCAN_PROBES = 10;

/**
 * Whether the drift a scan was run for is still the drift the craft is on.
 *
 * **Direction, not speed.** A release leaves a decaying burst behind it that
 * changes how fast the craft covers its line without changing the line — spec
 * 01 §8's transient *"moves the craft's position, never its heading"* — so
 * comparing velocities outright would re-run the scan every tick of every coast
 * for no change in the answer. The cross product is zero exactly when the two are
 * parallel, and it needs no `atan2` (ADR-0014 bans it here anyway).
 */
function sameLine(vx: number, vy: number, sim: SimState): boolean {
  const cross = vx * sim.craft.vy - vy * sim.craft.vx;
  const scale = Math.abs(vx) + Math.abs(vy) + Math.abs(sim.craft.vx) + 1;
  return Math.abs(cross) < scale * scale * 1e-12;
}

/**
 * The deadline one tick on: carried while the drift is unchanged, and otherwise
 * **paid for a few presses at a time** — see [`SCAN_PROBES`](#scan_probes).
 *
 * A held craft has no grab deadline — the escape from a capture is a release, not
 * a grab, which is the author's ruling of 2026-09-01 and the prototype's own
 * split. What covers that case is the SOS below, armed on the press.
 *
 * ## What a scan in flight does to the picture
 *
 * **A backstop re-scan keeps the answer it is re-deriving**, so the mark stays on
 * screen and does not flicker: the scan running is the one whose whole purpose is
 * to confirm what is already there (ADR-0015's convergence rule), and dropping the
 * mark for seventeen ticks twice a second to re-learn it would be the *"draw,
 * disappear, and draw again"* defect built on purpose.
 *
 * **A drift that has genuinely changed keeps nothing.** A mark drawn on a line the
 * craft has left is worse than no mark, so the picture says nothing until the new
 * scan lands. Measured, that case is the tick a coast opens — where there was no
 * mark to lose, because a held craft has none — and the four contacts in the whole
 * dispatch corpus.
 */
export function deadlineOf(previous: DeadlineMemo, sim: SimState): DeadlineMemo {
  const doomed = doomOf(previous, sim);
  if (sim.heldBody !== null || sim.ending !== null) {
    return { ...NO_DEADLINE, ...doomed };
  }

  // A scan already begun and still owed presses. It takes precedence over the
  // carried answer below: while it is in flight the memo's own `at` is the tick
  // that scan is *about*, so the staleness test would otherwise start it again.
  const pending = previous.pending;
  if (pending !== null && sameLine(pending.vx, pending.vy, sim)) {
    const advanced = advanceScan(pending, SCAN_PROBES);
    if (!advanced.done)
      return { ...previous, shown: previous.shown + 1, pending: advanced, ...doomed };
    return { ...land(previous, advanced.found, pending.vx, pending.vy, pending.from), ...doomed };
  }

  // Whether the answer in hand is about the line the craft is on. It is a
  // different question from the staleness below: a scan that comes due keeps its
  // answer on screen while it re-derives it, and a craft that has turned keeps
  // nothing — see the header.
  const onLine = sameLine(previous.vx, previous.vy, sim);
  const stale = previous.at < 0 || sim.tick - previous.at >= RESTATE_TICKS;
  if (pending === null && !stale && onLine) {
    // Carried. The scan's points are world points, so the craft advancing into
    // them changes nothing at all — which is what the author asked for: *"it
    // should only appear, and NOT MOVE, along my trajectory."*
    return { ...previous, shown: previous.shown + 1, ...doomed };
  }

  const opened = openScan(sim);
  const started = opened === null ? null : advanceScan(opened, SCAN_PROBES);
  if (started !== null && !started.done) {
    return onLine
      ? { ...previous, shown: previous.shown + 1, pending: started, ...doomed }
      : { ...NO_DEADLINE, pending: started, ...doomed };
  }
  // Nothing to scan, or a scan short enough to have finished inside one tick's
  // presses — a drift with a handful of samples on it, which is most of them.
  return {
    ...land(
      previous,
      started === null ? null : started.found,
      sim.craft.vx,
      sim.craft.vy,
      sim.tick,
    ),
    ...doomed,
  };
}

/** A finished scan becoming the answer the picture carries. */
function land(
  previous: DeadlineMemo,
  found: Deadline | null,
  vx: number,
  vy: number,
  at: number,
): Omit<DeadlineMemo, 'doomed' | 'checked'> {
  const same = sameMark(previous, found);
  return {
    deadline: found,
    vx,
    vy,
    // **The tick the scan was *about*, not the tick it finished on.** Every offset
    // in the answer — `leadTicks` above all — is measured from where the drift was
    // when the scan opened, and `leadOf` subtracts the elapsed ticks from it. A
    // spread scan that stamped itself with its landing tick would hand the mark
    // back the seventeen ticks it took to work out.
    at,
    // **The age survives a re-scan that finds the same mark**, and that is the
    // whole of the flicker fix: the scan is re-run twice a second for convergence
    // and a mark that started its life again each time faded out and back in.
    // A mark is new when there was none, or when the one there has been passed —
    // *"a mark that has been passed is not moved, it is replaced"*, which is the
    // prototype's own note against a cross that jumped forward.
    shown: same ? previous.shown + 1 : 0,
    pending: null,
    // Decided once, when the mark is new — see [`drawable`](#deadlinememo).
    drawable: same ? previous.drawable : bornDrawable(found),
  };
}

/** Whether a newly-found mark had enough lead to be worth showing. */
function bornDrawable(found: Deadline | null): boolean {
  return found?.cross != null && found.leadTicks >= MIN_LEAD_SECONDS / SECONDS_PER_TICK;
}

/**
 * Whether this scan found the mark the last one did.
 *
 * By **place**, because that is what the player is looking at: a cross that has
 * not moved is the same cross however many times it has been re-derived. The
 * tolerance is a tick of drift at the fastest speed anything is flown at, so a
 * refinement landing one tick either way does not restart a life.
 */
function sameMark(previous: DeadlineMemo, found: Deadline | null): boolean {
  const was = previous.deadline?.cross ?? null;
  const now = found?.cross ?? null;
  if (was === null || now === null) return was === now;
  return Math.abs(was.x - now.x) < SAME_MARK && Math.abs(was.y - now.y) < SAME_MARK;
}

/** How far a re-derived cross may land from the last one and still be the same one. */
const SAME_MARK = 40;

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
function doomOf(previous: DeadlineMemo, sim: SimState): { doomed: Wall | null; checked: number } {
  if (sim.ending !== null) return { doomed: previous.doomed, checked: previous.checked };
  if (sim.heldBody === null) return { doomed: null, checked: -1 };
  if (previous.doomed !== null) {
    // **Cleared the moment the craft has actually turned away** — the prototype's
    // own safety valve, because the prediction is 95% rather than certain.
    const still = turnedAway(sim.craft, previous.doomed) ? null : previous.doomed;
    return { doomed: still, checked: previous.checked };
  }
  // **Armed one: the press that took this body was already too late.** The answer
  // is on the previous tick's memo, because a drifting craft carries its own
  // deadline all along — see the prototype's `armDoom`.
  const was = previous.deadline;
  if (was !== null && was.cross === null) return { doomed: was.wall, checked: sim.tick };

  // **Armed two: the swing itself is stranded** (author, 2026-09-01). Gated twice,
  // because the question is the dearest one in this file.
  //
  // The **band** gate is free and it is exact rather than a heuristic: to leave
  // the corridor the craft must cross the boundary, so a swing that is going to
  // strand is inside it by the time it matters. Measured, that is 13% of held
  // ticks rather than all of them.
  //
  // The **cadence** gate is the same argument as `RESTATE_TICKS` one function up:
  // a swing does not become stranded twice in a tenth of a second, and asking
  // every tick would put the dearest question in the file on the commonest tick
  // in a run.
  const { centreline, halfWidth } = sim.field.corridor;
  const away = halfWidth - Math.abs(sim.craft.x - centreline);
  if (away > OUTER_BAND) return { doomed: null, checked: previous.checked };
  if (previous.checked >= 0 && sim.tick - previous.checked < STRAND_TICKS) {
    return { doomed: null, checked: previous.checked };
  }
  return { doomed: strandedWhileHeld(sim), checked: sim.tick };
}

/**
 * How often a held craft is asked whether it is stranded, in ticks.
 *
 * A tenth of a second. Measured, the answer turns on once and never off — three
 * episodes across the corpus with three transitions between them — so asking more
 * often could only cost, and asking much less often would spend the warning the
 * cue exists to give: the two captured deaths were warned 0.87 s and 0.47 s ahead.
 */
const STRAND_TICKS = 6;

/**
 * How long until the craft reaches the mark, in seconds — negative once past it.
 *
 * The scan measured it once; what has happened since is simply that the craft has
 * flown some of it. **Shared with [`sosOf`](#sosof)**, and that is the point: a
 * craft past its own dot has no rescue left, and reading that off the lead is
 * immediate where waiting for the next scan to report no cross is up to
 * [`RESTATE_TICKS`](#restate_ticks) late.
 */
function leadOf(memo: DeadlineMemo, sim: SimState): number {
  const found = memo.deadline;
  if (found === null || found.cross === null) return 0;
  return (found.leadTicks - (sim.tick - memo.at)) * SECONDS_PER_TICK;
}

/** Whether this drift still has a press left that saves it. */
function hasRescue(memo: DeadlineMemo, sim: SimState): boolean {
  const found = memo.deadline;
  if (found === null) return true;
  return found.cross !== null && leadOf(memo, sim) > 0;
}

/** The deadline as the renderer is handed it, or `null` when there is none. */
export function deadlineView(memo: DeadlineMemo, sim: SimState): DeadlineView | null {
  const found = memo.deadline;
  if (found === null || found.cross === null || !memo.drawable) return null;
  const lead = leadOf(memo, sim);
  return {
    // **Trimmed to the craft**, which is the other half of *"it's really long"*.
    // The scan is cached, so its first sample is where the craft *was* when it
    // ran — measured over the author's own run, the drawn track started **177
    // design units behind the craft at p50 and 647 at worst**, which is over half
    // a picture of it trailing the ship. The prototype's track *"always reaches
    // the ship"*; this is that, once the cache is taken into account.
    path: ahead(found.path, sim),
    cross: found.cross,
    lead,
    presence: presenceAt(lead, memo.shown),
    // **A full tank, and it is a named zero in that shape.** Spec 03 §5 couples
    // fuel to this *"by luminance, never geometry"*, so M4.4 changes this number
    // and nothing else about the picture. Its neutral value is 1 rather than 0
    // because a constraint that does not exist yet is one that does not bind.
    affordable: 1,
  };
}

/**
 * The samples still in front of the craft, with the craft itself at the head of
 * them.
 *
 * A sample is behind when its offset from the craft points against the craft's own
 * travel — one dot product, and no need for the ray's direction to be stored.
 * The craft is prepended so the track still reaches it: the prototype is emphatic
 * that clamping the near end *"drew a segment sitting a quarter of a screen ahead
 * of the ship, touching nothing."*
 */
function ahead(
  path: readonly { readonly x: number; readonly y: number; readonly saves: boolean }[],
  sim: SimState,
): readonly { readonly x: number; readonly y: number; readonly saves: boolean }[] {
  const { x, y, vx, vy } = sim.craft;
  let from = 0;
  while (from < path.length && (path[from]!.x - x) * vx + (path[from]!.y - y) * vy < 0) from++;
  if (from >= path.length) return path.slice(-1);
  // The head carries the sample it replaces' own answer: the craft is standing on
  // that stretch, so whether a press works here is what that sample measured.
  return [{ x, y, saves: path[from]!.saves }, ...path.slice(from)];
}

/**
 * How lit the cue is: **the lead decides it, and the mark's own age only stops it
 * popping into being.**
 *
 * Full strength inside [`FULL_SECONDS`](#full_seconds), nothing beyond
 * [`FADE_IN_SECONDS`](#fade_in_seconds), and the birth eased over the same rate so
 * that a mark that appears already close does not arrive as a step. Past the mark
 * the lead goes negative and the cue holds at full rather than climbing further —
 * it is answering a question that is still being asked right up to the moment it
 * is not.
 */
export function presenceAt(lead: number, shown: number): number {
  const ramp =
    lead <= FULL_SECONDS
      ? 1
      : Math.max(0, 1 - (lead - FULL_SECONDS) / (FADE_IN_SECONDS - FULL_SECONDS));
  const born = Math.min(1, shown / BIRTH_TICKS);
  return ramp * born;
}

/** How long a mark takes to arrive once it exists, in ticks — spec 03 §5's 300ms. */
export const BIRTH_TICKS = ticksIn(300);

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
    memo.doomed ?? (memo.deadline !== null && !hasRescue(memo, sim) ? memo.deadline.wall : null);
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
