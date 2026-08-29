/**
 * Where the world is watched from, and the two things that decide it.
 *
 * **Unspecified, and decided here.** Spec 05 says nothing about scrolling; spec
 * [00 · §5](../../docs/spec/00-tokens.md) rules only that the camera is never
 * rotated, never shaken and never randomised; spec 02's kick and spec 12's held
 * finish are later milestones'. [M3.1](../../docs/plan/m3-the-field.md) builds
 * the camera and the design space properly. This is the smallest one that can be
 * flown, and the plan records where the lines were drawn.
 *
 * ## It does not move sideways
 *
 * The field is a corridor whose bodies fit inside the design space's width, so
 * the whole corridor is on screen at all times and there is nothing to pan
 * toward. That is not a small saving: the prototype's playfield is wider than
 * its window, and the four mechanisms it needs as a consequence — a horizontal
 * deadzone, a velocity look-ahead, a clamp to the field, and a backstop for the
 * frames the ease has not caught up on — all answer a question this field does
 * not ask. **The decision expires when the field outgrows the design space**,
 * which is M1.4's boundary and M3's corridor (spec 17 §4).
 *
 * Everything below is therefore vertical, and the lock in particular is a
 * vertical lock. In a field that panned, the same blend would carry x too.
 *
 * ## The two mechanisms, and why they are two
 *
 * **The deadzone** answers *the view is too sensitive to small movement*. The
 * camera holds still until the craft leaves a band, and then moves only enough
 * to bring it back to the band's edge — never toward the centre, which is the
 * trap: a target that defaults to centred pans the craft inside the band, which
 * moves the target back to centre, which pans the other way. The prototype
 * measured that limit cycle as the view wobbling while flying straight.
 *
 * **The lock** answers *the world slides while I orbit*. Through a settled orbit
 * the craft goes round a still point, and a view holding the craft still moves
 * the world instead. So the camera's **subject** eases from the craft onto the
 * body it is orbiting, which is a thing no deadzone can do, because the craft's
 * excursion there is the orbit's whole diameter.
 *
 * **The lock must not run during the settle**, and this is the one place the
 * prototype's own measurement is emphatic. Easing it in on the settle's progress
 * flattened the oval's 59 → 107 → 59px swing to under 2px — *"of 83px of total
 * swing only 41 survived"* — and the oval is the most dramatic part of a capture.
 * The dive and the settle are flown; only the round orbit at the end of them is
 * watched.
 */
import type { SimState } from '../sim/types.ts';
import { FLOOR_GAP, MEDIAN_RADIUS, SETTLE_TICKS } from '../sim/units.ts';
import { easeStep } from './decay.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from './design.ts';
import type { CameraView, PunchView } from './types.ts';

/**
 * How far the craft may drift from the camera before the camera follows, in
 * design units either side.
 *
 * **Derived rather than chosen**: it is the floor radius of the field's median
 * body, so a craft going round a typical body at its floor moves the view not at
 * all — the same job the lock does, done by geometry, and available before the
 * lock arrives and to flybys that never freeze at all. An oval reaches several
 * times this and still moves the view, which is the half of the behaviour that
 * must survive.
 *
 * It is an opening position in the sense the spec README means: the derivation
 * says what magnitude it should be, and only the gate can say whether it reads
 * right.
 */
export const DEADZONE = MEDIAN_RADIUS + FLOOR_GAP;

/**
 * How fast the camera closes on its target, in units of 1/second.
 *
 * Its job is to round the deadzone's edges rather than to trail the craft: a
 * band alone starts and stops the view abruptly at its own edge, and this makes
 * that a movement instead of a step. **The rate is bounded from below by the
 * thumb line** — an ease lags a moving craft by `v × (1 − k) / k`, and at spec
 * 01 §8's p95 exit speed the lag plus [`DEADZONE`](#) has to still leave the
 * craft above [`THUMB_BUDGET`](#).
 *
 * **Three, flown** (author, 2026-08-28): *"camera follow rate feels much better
 * at a lower value to smoothen movement going back down."* It is the prototype's
 * own rate, which this file previously assumed it could only afford because its
 * view is a third the height of this one; the thumb line says otherwise, and the
 * budget holds at 3 over every swing `test/state/camera.test.ts` flies.
 *
 * **Two is the floor and it is not a matter of taste.** At 2 presentation state
 * stops shedding a disagreement within a bounded time, which is
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
 * third rule and the property that makes the memory safe rather than merely
 * convenient. Three is the slowest rate that keeps it.
 */
export const FOLLOW_RATE = 3;

/**
 * How long the lock takes to arrive, in ticks, once the settle is over.
 *
 * The prototype's third of a second, carried with its reason: the lock **steps**
 * rather than ramps — the settle keeps its whole oval and the lock arrives when
 * the orbit becomes round — so this stretch *is* the blend. *"Slow enough to
 * read as the view settling with the orbit and fast enough not to trail it."*
 *
 * It is a stretch on the swing's own clock rather than a filter, which is what
 * lets the weight be a **pure function of the simulation**: the only thing this
 * camera has to remember is the displacement it is currently applying, and one
 * remembered number is a smaller promise than two.
 */
export const LOCK_TICKS = 20;

/**
 * **The release lets go of the view as well as of the body**, and it used to
 * take its time about it.
 *
 * The displacement the lock is holding used to decay after a release at the
 * prototype's own rate — 3/s, 5% a tick — on the argument that dropping it
 * outright *"would snap the view by an orbit radius on the one tick the swing is
 * paid for"*. Flown, that argument was wrong twice over.
 *
 * **It was the delay the author reported.** *"The slight delay is making it seem
 * jagged and jumpy. Let's remove any camera/speed delay there"* (author,
 * 2026-08-29). Measured over the 29 releases in the recorded dispatches that were
 * carrying a hold at all: the view spent **41 ticks at p50 and up to 104** —
 * nearly two seconds — walking off the orbit's hold, travelling **356 design
 * units at p50 and 553 at worst** away from a craft that was accelerating in the
 * other direction. That is not a settle; it is the camera finishing the orbit
 * after the player has left it.
 *
 * **And the snap it was guarding against is not one.** What is dropped is the
 * camera's *subject*, not the camera: the deadzone absorbs
 * [`DEADZONE`](#deadzone) of the change outright and the follow ease spends the
 * rest at 5% a tick, so the largest single-tick movement the view can make is the
 * same one it can make at any other moment. The guard was protecting a number
 * that never reached the picture.
 */

/** Where the camera sits sideways: the corridor's centreline, always. */ /** Where the camera sits sideways: the corridor's centreline, always. */
function centreline(): number {
  return DESIGN_WIDTH / 2;
}

/**
 * Where the camera is **following** — its position with the punch taken back out.
 *
 * The punch travels along the exit tangent (spec
 * [02 · §5](../../docs/spec/02-release.md)), so it has a horizontal component,
 * and this file does not move sideways until [M3.1](../../docs/plan/m3-the-field.md).
 * Both are right, and this is where they meet: the punch is a **displacement
 * from** where the camera is standing rather than a second opinion about where
 * it should stand. What the sideways rule constrains is the subject, and this is
 * it — `test/state/camera.test.ts` asserts the centreline on this rather than on
 * `x`, and the recurrence eases from this rather than from a position that has a
 * transient in it, because easing from a kicked position would feed the punch
 * back into the follow and leave a bruise the deadzone would have to walk off.
 */
export function subjectOf(camera: CameraView): { x: number; y: number } {
  const punch = camera.punch;
  return punch === null
    ? { x: camera.x, y: camera.y }
    : { x: camera.x - punch.x, y: camera.y - punch.y };
}

/**
 * The camera at the first tick of a run.
 *
 * Placed, not eased into place. A run that opened by gliding from wherever the
 * last one ended would begin with a lurch, and the prototype records exactly
 * that as the reason its own reset is a placement.
 */
export function openCamera(sim: SimState): CameraView {
  return { x: centreline(), y: sim.craft.y, lock: 0, offset: 0, punch: null };
}

/**
 * How much the view is held on the body rather than on the craft, from 0 to 1.
 *
 * **A pure function of the simulation**, on the swing's own clock: zero unless a
 * body is held *and* the dive has frozen *and* the settle is over, then eased in
 * over [`LOCK_TICKS`](#). Smootherstep rather than a line because both ends have
 * to be seamless — the same reason the settle itself uses one.
 */
export function lockOf(sim: SimState): number {
  const orbit = sim.orbit;
  if (sim.heldBody === null || orbit === null) return 0;
  const since = orbit.ticksSinceFreeze - SETTLE_TICKS;
  if (since <= 0) return 0;
  if (since >= LOCK_TICKS) return 1;
  const x = since / LOCK_TICKS;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * The camera one tick on.
 *
 * A pure function of the previous camera and the current simulation, evaluated
 * exactly once per tick ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)).
 * Every carried value eases toward something this tick determines, so two
 * cameras that disagree agree again within a bounded time — which is what makes
 * the memory safe rather than merely convenient.
 */
export function followCamera(
  previous: CameraView,
  sim: SimState,
  punch: PunchView | null,
): CameraView {
  const craftY = sim.craft.y;
  const lock = lockOf(sim);
  const was = subjectOf(previous);

  // While the lock is on, the displacement is exact and not eased toward:
  // an eased displacement would lag a target that goes round once a second, and
  // a lagging displacement is the orbit's swing coming back at reduced
  // amplitude, which is the whole fault this exists to remove.
  //
  // **What it holds still on is where the view already is**, not the body, and
  // that is the second correction the demo asked for. Locking onto the body
  // moves the view by whatever the two happen to be apart when the orbit
  // settles — measured at 49 design units over the ramp, reported as *"a slight
  // camera up/down movement right at the moment the ship settles into orbit"*.
  // By then the deadzone has already brought the view to a stop (measured: zero
  // movement over the twenty ticks before the ramp), so the nearest still point
  // is the one it is standing on, and arriving there costs nothing.
  //
  // Clamped to within a deadzone of the body, because "wherever it happens to
  // be" is only good enough while it is near: a shallow dive settles into a
  // circle far above the floor, the view has no reason to be near its centre,
  // and an unclamped anchor would let the craft swing below the thumb line.
  //
  // While the lock is off there is no displacement at all — the release lets go
  // of the view on the same tick it lets go of the body. See the note above
  // `centreline`: what this drops is the *subject*, and the deadzone and the
  // follow ease are what turn that into a movement.
  const offset =
    lock > 0 ? (stillPoint(was.y, sim.field.bodies[sim.heldBody!]!.y) - craftY) * lock : 0;

  const subjectY = craftY + offset;
  const followed = was.y + (targetY(was.y, subjectY) - was.y) * easeStep(FOLLOW_RATE);
  return {
    // The subject is the centreline and the punch is what moves off it — the one
    // horizontal movement in this file, and it is transient by construction.
    x: centreline() + (punch?.x ?? 0),
    y: followed + (punch?.y ?? 0),
    lock,
    offset,
    punch,
  };
}

/**
 * The point a locked view holds on: where it already is, unless that is too far
 * from the body to keep the orbit framed.
 */
function stillPoint(cameraY: number, bodyY: number): number {
  return Math.min(Math.max(cameraY, bodyY - DEADZONE), bodyY + DEADZONE);
}

/**
 * Where the camera would like to be: the deadzone, and nothing else.
 *
 * The camera stays exactly where it is unless the subject leaves the band, and
 * then moves only enough to bring it back to the band's edge — never toward the
 * centre, which is the trap. A target that defaults to centred pans the subject
 * inside the band, which moves the target back to centre, which pans the other
 * way; the prototype measured that limit cycle as the view wobbling while flying
 * straight.
 *
 * **The lock does not appear here, and that is the point.** The prototype
 * centres a locked subject, on the reasoning that a stationary anchor converges
 * rather than cycling — but its anchor is the *body*, so it has somewhere to go.
 * Ours is the point the view is already standing on, so there is nowhere to go
 * and pulling toward it can only produce movement. Blending the two targets by
 * the lock did exactly that: both ends of the ramp were correct and the middle
 * pulled `(craft − camera) × lock × (1 − lock)`, which peaks a quarter of a
 * deadzone away at half lock and oscillates with the orbit underneath it. That
 * is the 46 design units the ramp still travelled after the anchor was fixed,
 * and it is what this comment exists to stop being reintroduced.
 */
function targetY(cameraY: number, subjectY: number): number {
  const offset = subjectY - cameraY;
  if (offset > DEADZONE) return subjectY - DEADZONE;
  if (offset < -DEADZONE) return subjectY + DEADZONE;
  return cameraY;
}

/**
 * How far below the middle of the design space the craft may sit before it is
 * under the player's own thumb.
 *
 * Spec [00 · §7](../../docs/spec/00-tokens.md) puts the thumb line at 2/3 of the
 * height and rules that nothing readable lives below it, ever. The craft is the
 * most readable thing on the screen, so this is the budget the deadzone and the
 * follow lag are spending between them, and `test/state/camera.test.ts` holds
 * them to it over real swings rather than by arithmetic.
 */
export const THUMB_BUDGET = THUMB_LINE - DESIGN_HEIGHT / 2;
