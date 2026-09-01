/**
 * The **deadline**: where a press still saves a craft that is drifting out of the
 * field, and where it stops doing so.
 *
 * `CONTEXT.md`: the deadline is *"the ION window drawn on the craft's own
 * projected line when it is leaving the field. Its dot is the last press that can
 * still save the run — the compass inverted, saying press here rather than
 * release here."*
 *
 * ## Which save, and why that makes this buildable now
 *
 * Spec [03 · §5](../../docs/spec/03-hud.md) and spec
 * [07 · §4](../../docs/spec/07-boundary.md) both write the deadline against spec
 * 07 §5's **burn** — the fuel-priced carve back into the field — which is why it
 * was scoped out of M3.4 along with everything else fuel touches.
 *
 * **The author re-based it on the grab** (2026-09-01): *"I want to have something
 * visual on the field that tells me where I need to save myself by. If I grab
 * after, or just don't grab, I'm heading for extinction."* A grab needs no fuel,
 * so the whole instrument comes forward — and what M4 adds later is the
 * **luminance** and nothing else, which is what spec 03 §5 already promises: the
 * fuel coupling is *"by luminance, never geometry."*
 *
 * ## Carried from the prototype, which does this well
 *
 * The author asked for it (*"let's draw a bit of inspiration from the original
 * prototype here. It does it fairly well"*), and the shape below is its
 * `src/sim/rescue.ts` re-derived: a closed-form refusal, one projection of the
 * drift, a strided scan, and a refinement pass. What crosses is the **structure
 * and the arithmetic**, not the code (ADR-0001, ADR-0013).
 *
 * **It is a prediction and it says so.** The prototype measured its own honesty
 * and the measurement carries: the condition is *"no single press-and-hold from
 * here turns the ship away"*, and it *"does not consider releasing and grabbing a
 * DIFFERENT body, which is a real escape the player has and the projection never
 * tries."* Over its corpus the drifting cue was followed by an out-of-bounds
 * ending **95%** of the time. That is why the word beside it is `SOS` rather than
 * `DOOMED` or `LOST` — at 95% neither is entitled to a claim about the outcome,
 * and *"SOS asserts nothing except that the ship is in trouble, which is exactly
 * what is known."*
 *
 * ## Nothing here moves a tick
 *
 * Every projection runs on a **clone**. `SIM_VERSION` does not move, no recipe
 * replays differently, and `test/sim/version.test.ts`'s question — *did a tick
 * move?* — answers no. It lives in `src/sim/` rather than beside the picture
 * because it forward-simulates and needs [`stepSim`](./step.ts), which is the
 * same reason [`predictOrbit`](./orbit.ts) is here.
 */
import type { Craft } from './craft.ts';
import { bodyOnOffer } from './grab.ts';
import { CORRIDOR_GRACE, SECONDS_PER_TICK } from './units.ts';
import { stepSim } from './step.ts';
import type { SimState } from './types.ts';

/** Which side of the corridor a drift is going to leave through. */
export type Wall = 'left' | 'right';

/**
 * How far ahead the projection looks, in seconds — **the prototype's six.**
 *
 * ⚠ Measured over the author's own dispatches, the drift from the start of a
 * coast to the line runs **p50 1.6 s, p90 7.2 s and 9.0 s at the longest**, so
 * six seconds finds about the first 85% of them and the longest approaches arrive
 * unmarked until they are inside it. That is recorded rather than fixed: raising
 * it costs only the drift projection (the scan is bounded by
 * [`MAX_SAMPLES`](#max_samples) whatever the horizon is), so it is the first thing
 * to move if the mark reads as arriving late, and it is on the bench for that.
 */
export const HORIZON_SECONDS = 6;

/**
 * How many ticks apart the scan's samples are — **three**, the prototype's, and
 * the author's own answer when given the cost table.
 *
 * Fifty milliseconds of path per sample, which is far below anything a player
 * reacts to, and the edges are rounded toward safety
 * ([`rescueDeadline`](#rescuedeadline)) so a coarse answer always under-claims.
 */
export const SAMPLE_STRIDE = 3;

/**
 * The most samples a scan may spend, however long the drift is.
 *
 * **The stride widens rather than the cost growing**, which is the prototype's
 * own device: *"a six-second drift is then sampled every 9 ticks rather than every
 * 3, which costs resolution in the holes and bounds the work."* It matters more
 * here than there — measured, a drift in this game reaches **541 ticks**, which at
 * a fixed stride of three would be 180 evaluations on the tick a coast begins.
 *
 * And a coast begins on a press **up**. `docs/plan/m3-the-field.md` records that
 * one frame is dropped per press on the author's phone and that every stall lands
 * on a press-**down** edge; an unbounded scan here would put a new one on the
 * other edge.
 */
export const MAX_SAMPLES = 40;

/**
 * How long a rescue is flown before it is given up on, in ticks.
 *
 * The prototype's 360 — six seconds, the same as the horizon — and **measured
 * here before it was kept**, because it is the term the whole scan's cost is
 * multiplied by and the obvious saving is to cut it.
 *
 * Over 992 successful rescues in this field, the craft turns away in **p50 37
 * ticks, p90 63, p99 158 and 349 at the worst**. So 360 is a ceiling that is
 * genuinely reached and cutting it to, say, 120 would lose the top 1% —
 * reclassifying real rescues as none, which moves the dot earlier and strobes the
 * SOS at a craft that could still be saved. Wrong in the direction a distress
 * signal must never be wrong in.
 */
export const RESCUE_BUDGET = 360;

/**
 * How much lead a mark must have to be born at all, in seconds — the prototype's
 * **0.25**.
 *
 * *"A cross that appears with less lead than a person can react in cannot inform
 * the press it is asking for... so it would be a red blink and nothing else."*
 *
 * **A birth gate and not a live one**, which is the half that matters: once a mark
 * exists it stays through its own arrival, because *"re-testing every observation
 * would blink it out at the moment the player is closest to it."*
 */
export const MIN_LEAD_SECONDS = 0.25;

/** One sample of the scan: a place on the drift, and whether a press there saves. */
export interface DeadlineSample {
  readonly x: number;
  readonly y: number;
  /** Whether a press-and-hold from here turns the craft away from the wall. */
  readonly saves: boolean;
}

/** What the drift is heading for, and where a press about it still works. */
export interface Deadline {
  readonly wall: Wall;
  /**
   * The scan, in order along the drift.
   *
   * Kept whole rather than reduced to a span because the saveable stretch **has
   * gaps in it**: measured over 966 doomed drifts, 58% hold one contiguous window,
   * **8% hold more than one** (up to four) as a second body comes into range, and
   * 34% hold none at all. The author ruled that every window is drawn, so the
   * picture needs the structure rather than its envelope.
   */
  readonly path: readonly DeadlineSample[];
  /**
   * The **dot**: the last place a press still saves the run, or `null` when none
   * does.
   *
   * `null` is the whole of what the SOS is about — see
   * [`rescueDeadline`](#rescuedeadline).
   */
  readonly cross: { readonly x: number; readonly y: number } | null;
  /**
   * How many ticks from the craft to the cross, at the moment of the scan.
   *
   * The whole of what decides whether the mark is **drawn**: the prototype ramps
   * its alpha on the *lead* rather than on distance, so a cross four seconds ahead
   * is invisible and one a second ahead is at full strength. That is what keeps
   * the cue out of the middle of the field — see `deadline.ts`.
   */
  readonly leadTicks: number;
}

/**
 * Has a craft with this velocity stopped closing on `wall`?
 *
 * **The bar, and it is deliberately this low** (author, 2026-09-01). Not *the
 * swing is safe* and not *you are back in the field* — the danger was closing on
 * this wall and a rescue is having stopped. What the swing does afterwards is the
 * player's business, and a bar that judged it would refuse to mark a grab that
 * saves a life and then swings wide, which is a real and legitimate thing to do.
 *
 * Exported because the picture settles the same question about a live craft and a
 * second copy of a definition is two things that can drift apart — which the
 * prototype records happening to this exact predicate.
 */
export function turnedAway(craft: Craft, wall: Wall): boolean {
  return wall === 'right' ? craft.vx <= 0 : craft.vx >= 0;
}

/**
 * Does a press and hold from here turn the craft away from `wall` before the run
 * ends?
 *
 * The hold is held forever, which is both what a player does in this situation
 * and self-limiting — the run ends if it was never going to work.
 *
 * ## ⚠ A refused press *does* need a branch here, and the prototype's note is why
 *
 * It records that *"a refused grab needs no branch. `stepSim` starts a capture
 * only on the pressed edge, so a refusal leaves the ship drifting with the button
 * uselessly down — exactly what the player would experience — and the drift ends
 * where it was always going to."* Both halves are true here too, and the
 * conclusion still costs too much: **this game's drifts are longer.** Measured
 * over the author's dispatches a drift reaches **541 ticks**, so a refused press
 * deep in the field walks the whole [`RESCUE_BUDGET`](#rescue_budget) to
 * rediscover a drift the caller has already projected — and most of a scan's
 * samples are refusals, because most of a drift is nowhere near a body.
 *
 * Measured before and after over the shipped run: **8 ticks a run cost about a
 * millisecond** without this, which lands on the tick a coast opens — a press-up
 * edge, and the one the phone does *not* already drop a frame on
 * (`docs/plan/m3-the-field.md`). With it, the whole scan is under a tick's own
 * budget.
 *
 * The short circuit is exact rather than an approximation: a grab is attempted on
 * the **press** and not on every tick the button is held, so a press with nothing
 * in reach never becomes one, and the drift it leaves behind is the drift this
 * function was called about.
 */
function rescues(from: SimState, wall: Wall): boolean {
  if (bodyOnOffer(from.field, from.craft) === null) return false;
  const state = clone(from);
  stepSim(state, { pressed: true });
  // **And again after the press, because a body in reach is not a grab.** Spec
  // 01 §3 counts 278 presses against 270 grabs and 8 refusals, and a refusal is
  // the expensive case: the craft drifts on with the button uselessly down and
  // the loop below walks the whole budget to rediscover a drift the caller has
  // already projected. Measured over the shipped run, catching it here is what
  // takes the scan's worst tick from about a millisecond to under a tick's own
  // budget.
  if (state.heldBody === null) return false;
  for (let tick = 0; tick < RESCUE_BUDGET; tick++) {
    if (state.ending !== null) return false;
    if (turnedAway(state.craft, wall)) return true;
    stepSim(state, { pressed: true });
  }
  return false;
}

/**
 * A working copy the projection may ruin.
 *
 * Bodies are shared by reference and only the array wrapper is not copied at all:
 * nothing in `src/sim/` mutates a body, and a projection that did would be
 * corrupting the field every other system reads. The craft, the dive, the orbit
 * and the stream are the four things a tick writes.
 */
function clone(state: SimState): SimState {
  return {
    ...state,
    craft: { ...state.craft },
    dive: state.dive === null ? null : { ...state.dive },
    orbit: state.orbit === null ? null : { ...state.orbit },
    rng: [...state.rng] as SimState['rng'],
  };
}

/**
 * Which wall a **held** craft is stranded against — or `null`, which is almost
 * always.
 *
 * ## ⚠ The case the first build did not cover, and the author ruled it in
 *
 * The grilling settled that a held craft gets the SOS only when *the press that
 * took the body was already too late*, which is the prototype's own `armDoom`.
 * The author then died out of bounds while holding a body, with no warning at
 * all, and ruled: *"I think in these cases I SHOULD be alerted."*
 *
 * **Both halves have to be lost, and that is what makes it honest.** The
 * grilling's objection to the obvious predicate stands — *the orbit will leave*
 * fires on 74% of exiting swings that a release could still escape, and
 * `VISION.md` refuses a cue whose *"answer is to let go"* because that is a
 * prompt. So this asks both questions:
 *
 * 1. **Holding is lost** — the swing itself carries the craft out.
 * 2. **Releasing is lost** — the drift a release would leave has no rescue on it.
 *
 * When both are true there is **no verb**: holding does not save, letting go does
 * not save, and the cue prompts nothing because there is nothing to prompt. That
 * is the one shape of this cue VISION's open call does not refuse.
 *
 * Measured over the author's dispatches: the second condition alone fires on 30
 * episodes for 2 deaths; **both together fire on 3 episodes, turn off never, and
 * warned both of the captured out-of-bounds deaths** — 0.87 s and 0.47 s ahead,
 * which is all the time there was, because before that a release still worked.
 */
export function strandedWhileHeld(state: SimState): Wall | null {
  if (state.heldBody === null || state.ending !== null) return null;
  const { centreline, halfWidth } = state.field.corridor;
  if (!Number.isFinite(halfWidth)) return null;

  // Holding is lost: fly the swing on, held, and see it leave.
  const holding = clone(state);
  let wall: Wall | null = null;
  for (let tick = 0; tick < RESCUE_BUDGET; tick++) {
    stepSim(holding, { pressed: true });
    const across = holding.craft.x - centreline;
    if (Math.abs(across) > halfWidth) {
      wall = across > 0 ? 'right' : 'left';
      break;
    }
    if (holding.ending !== null) return null;
  }
  if (wall === null) return null;

  // And releasing is lost: the drift a release leaves has no rescue on it. This
  // is [`rescueDeadline`](#rescuedeadline) asked about a craft that has let go —
  // one call, not a search over future release points.
  const drifting = clone(state);
  drifting.heldBody = null;
  drifting.dive = null;
  drifting.orbit = null;
  const escape = rescueDeadline(drifting);
  if (escape === null || escape.cross !== null) return null;
  return wall;
}

/**
 * Where a press still saves this drift, and where it stops — or `null` when there
 * is nothing to mark.
 *
 * **Null while a body is held**, which is the author's ruling of 2026-09-01 and
 * the prototype's own split: the escape from a capture is a release, not a grab,
 * so a *grab* deadline has nothing to say about one. What covers the held case is
 * the SOS, armed at the grab — see `docs/plan/m3-the-field.md`.
 */
export function rescueDeadline(state: SimState): Deadline | null {
  if (state.heldBody !== null || state.ending !== null) return null;
  if (!Number.isFinite(state.field.corridor.halfWidth)) return null;

  // **The cheap refusal, so the common case never pays for the projection.** A
  // drift is a straight line at constant velocity plus a burst that decays to
  // nothing, so the furthest it can travel sideways inside the horizon has a
  // closed form. If neither line is inside that reach there is no out-of-bounds
  // ending to find, and this can only return null where the projection would
  // have — it is an early-out, not a second opinion.
  const { centreline, halfWidth } = state.field.corridor;
  const reach = Math.abs(state.craft.vx) * HORIZON_SECONDS + Math.abs(state.craft.burst) * 0.5;
  const across = state.craft.x - centreline;
  if (Math.abs(across) + reach < halfWidth) return null;

  // **Project the drift once and find the ending.** A drift takes no input, so
  // this is the future exactly, not an estimate of it.
  const ticks = Math.ceil(HORIZON_SECONDS / SECONDS_PER_TICK);
  const drift = clone(state);
  let leaves = -1;
  for (let tick = 1; tick <= ticks; tick++) {
    stepSim(drift, { pressed: false });
    if (drift.ending !== null) {
      if (drift.ending === 'OUT_OF_BOUNDS') leaves = tick;
      break;
    }
  }
  if (leaves < 0) return null;
  const wall: Wall = drift.craft.x > centreline ? 'right' : 'left';
  // Falling out of the corridor's foot is also OUT_OF_BOUNDS and is not what this
  // instrument is about: the deadline is drawn on the **boundary**, and the foot
  // is a backstop nobody reaches (`fixture-field.ts`).
  if (Math.abs(drift.craft.x - centreline) < halfWidth - CORRIDOR_GRACE) return null;

  // **The stride widens so the whole approach fits in `MAX_SAMPLES`** — see there.
  const stride = Math.max(SAMPLE_STRIDE, Math.ceil((leaves + 1) / MAX_SAMPLES));
  const path: DeadlineSample[] = [];
  const walk = clone(state);
  let at = 0;
  let lastSaving: SimState | null = null;
  let firstFailingAfter = -1;
  for (let tick = 0; tick <= leaves; tick += stride) {
    while (at < tick) {
      stepSim(walk, { pressed: false });
      at++;
    }
    const saves = rescues(walk, wall);
    path.push({ x: walk.craft.x, y: walk.craft.y, saves });
    if (saves) {
      lastSaving = clone(walk);
      firstFailingAfter = -1;
    } else if (firstFailingAfter < 0) {
      firstFailingAfter = tick;
    }
  }

  // **Refine the last saving sample to the tick.** Without this the dot hops by a
  // stride as the craft advances into it — the prototype's own note, and the
  // reason the coarse scan is safe: what is refined is a world point, so it stops
  // moving once it is found.
  //
  // Walked forward rather than bisected, because the gap is one stride and a
  // bisection would need a clone of every tick to index into.
  let cross: Deadline['cross'] = null;
  let leadTicks = 0;
  if (lastSaving !== null) {
    let best = lastSaving;
    const probe = clone(lastSaving);
    for (let step = 0; step < stride; step++) {
      stepSim(probe, { pressed: false });
      if (probe.ending !== null || !rescues(probe, wall)) break;
      best = clone(probe);
    }
    cross = { x: best.craft.x, y: best.craft.y };
    leadTicks = best.tick - state.tick;
  }
  // **The birth gate.** A mark with less lead than a person can react in is a
  // blink rather than a cue, and with nothing left behind it says nothing at all.
  // It is refused as a *cross* rather than as a whole deadline, because the drift
  // is still heading out and the SOS still has to know.
  if (cross !== null && leadTicks < MIN_LEAD_SECONDS / SECONDS_PER_TICK) {
    cross = null;
    leadTicks = 0;
  }
  return { wall, path, cross, leadTicks };
}
