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
import { FLOOR_GAP, MEDIAN_RADIUS, SCALE, SETTLE_TICKS } from '../sim/units.ts';
import { easeStep } from './decay.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from './design.ts';
import type { CameraView } from './types.ts';

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
 * How far ahead of the craft the view sits at [`LOOK_REF_SPEED`](#) and above, in
 * design units.
 *
 * **The prototype's own extent, and it is a distance rather than a fraction.**
 * Its look-ahead is written as `0.18` of the design window's **width**, because
 * its playfield is wider than its window and sideways is where its interesting
 * movement is — `0.18 x 390 = 70` prototype units, which is `70 x SCALE = 210`
 * here. This field is a vertical corridor and the whole game is a climb, so the
 * behaviour — *"look where you are going, not where you have been"* — belongs on
 * the other axis (ADR-0013).
 *
 * ## The fraction did not survive the crossing, and the author felt it
 *
 * Carrying `0.18` and applying it to `DESIGN_HEIGHT` gives **456** — more than
 * twice the prototype's actual reach, because the axis it was a fraction *of* is
 * this repo's short side and the axis it now leads along is the long one. Flown,
 * that read as *"the camera is really aggressively locked on the ship"*
 * (2026-08-30): a lead that large turns every change in vertical speed into a
 * large movement of the target, so the view is always chasing something.
 *
 * Measured on the run the author flagged, as camera travel over craft travel
 * where 1.0 is glued to the ship: **0.618 at 456, 0.568 at 210, and 0.553 with no
 * lead at all.** So the prototype's own extent costs almost nothing over having
 * none, and keeps most of the forward view it was added for. The number that is
 * carried is the distance; the fraction was an artefact of which axis it was
 * written against.
 *
 * ## Why it was added
 *
 * The author, 2026-08-30: *"when I go fast I often feel like the camera isn't
 * showing me far enough ahead to make a safe capture."* Measured over 6 267 ticks
 * of climbing in their own dispatches, the craft sat **337 design units above
 * centre at p50 and 497 at p95** — the ease lag and the deadzone between them —
 * so the view was spending a third of its height showing where the craft had
 * been. The prototype's own reason is the same one and names the mechanism
 * exactly: *"a deadzone that has no idea which way you are going."* It also
 * records why this is safe where centring the target is not — *"this is a
 * function of the ship's velocity, which the camera cannot influence, so there is
 * no loop."*
 */
export const LOOK_AHEAD = 70 * SCALE;

/**
 * The speed at which the look-ahead reaches its full extent, in design units per
 * second — the prototype's 260 at this repo's `SCALE`.
 *
 * Signed and symmetric, as the prototype's is: falling is also going somewhere,
 * and a lead that only worked upward would step to zero at the top of a climb,
 * which is the moment the view can least afford a discontinuity.
 */
export const LOOK_REF_SPEED = 260 * SCALE;

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
 * **Nothing displaces this camera, and that is now a ruling rather than a gap.**
 *
 * Spec [02 · §5](../../docs/spec/02-release.md) put ADR-0012's **punch** here —
 * 6px along the exit tangent, home in 180ms with one overshoot. It was built,
 * flown and refused: *"I still feel a brief pause or shake at release — we don't
 * want that... we don't really want shake effects or pauses like that, it turns
 * out that really disrupts the flow"* (author, 2026-08-29). Spec 02 §5 had
 * argued that a **directional** kick says departure where a shake says damage,
 * and that the exemption in spec [00 · §5](../../docs/spec/00-tokens.md)'s
 * *"never shaken"* therefore covered it. Flown, the distinction did not survive:
 * moving the whole world moves the whole world, whichever way it goes. The punch
 * lives on the craft's own stretch now — [`punch.ts`](./punch.ts).
 *
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
 * The camera at the first tick of a run.
 *
 * Placed, not eased into place. A run that opened by gliding from wherever the
 * last one ended would begin with a lurch, and the prototype records exactly
 * that as the reason its own reset is a placement.
 */
export function openCamera(sim: SimState): CameraView {
  return { x: centreline(), y: sim.craft.y, lock: 0, offset: 0 };
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
export function followCamera(previous: CameraView, sim: SimState): CameraView {
  const craftY = sim.craft.y;
  const lock = lockOf(sim);

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
  // By then the deadzone has already brought the view to a stop, so the nearest
  // still point is the one it is standing on, and arriving there costs nothing.
  //
  // **That last clause stopped being true and is true again.** It held while the
  // band was full through the whole settle; once the oval was flown
  // (`OVAL_BAND`, 2026-08-30) the view arrived at the ramp still moving, and the
  // author flew the consequence on 2026-08-31 — *"the camera eventually settles
  // downwards a little bit."* `bandOf` now closes the band over the settle's last
  // `LOCK_TICKS` so the view is at rest before the lock, and `closing` takes it
  // to the anchor on the lock's own curve rather than leaving it to the ease.
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
  const anchor = lock > 0 ? stillPoint(previous.y, sim.field.bodies[sim.heldBody!]!.y) : 0;
  const offset = lock > 0 ? (anchor - craftY) * lock : 0;

  // **Look where you are going.** Off entirely once the dive has frozen, which is
  // the prototype's own hard-learned gate rather than a precaution: after the
  // freeze the craft rides a phase clock and its velocity reverses every half
  // orbit — *"measured at +397 -> -285 -> +137 -> -207 across one settle. Anything
  // steering off it swings the view"* — so what the velocity means stops being a
  // heading. It stays **on through the dive**, where the craft is on real physics
  // with a real heading and where suppressing it *"put a 110px lurch into the
  // dive"*. `sim.orbit` is exactly that distinction and needs no second flag.
  const lead = sim.orbit === null ? leadOf(sim.craft.vy) : 0;

  const subjectY = craftY + offset + lead;
  const homing = homingShare(sim);
  // While the lock is arriving the view goes to its anchor on the lock's own
  // curve; every other tick it is the deadzone and the follow ease, untouched.
  // See `closing` for why the arrival is not left to the ease.
  return {
    x: centreline(),
    y:
      lock > 0 && previous.lock < 1
        ? previous.y + (anchor - previous.y) * closing(previous.lock, lock)
        : homing > 0 && outOfFrame(previous.y, sim) !== null
          ? previous.y +
            (outOfFrame(previous.y, sim)! - previous.y) * closing(homingShare(sim, 1), homing)
          : previous.y +
            (targetY(previous.y, subjectY, bandOf(sim)) - previous.y) * easeStep(FOLLOW_RATE),
    lock,
    offset,
  };
}

/**
 * What share of the distance still to go the view covers this tick, so that all
 * of it is covered exactly when the lock finishes arriving.
 *
 * ## The lock named a duration it did not keep
 *
 * [`LOCK_TICKS`](#lock_ticks) is *"slow enough to read as the view settling with
 * the orbit and fast enough not to trail it"*, and that was a description of the
 * **weight** rather than of the movement. The weight ramped over twenty ticks;
 * what the view did with its new subject was hand it to the deadzone and the
 * follow ease, which spend 5% of what is left per tick and approach without
 * arriving. So the lock could be at full while the view was still walking.
 *
 * `(lock − lock_prev) / (1 − lock_prev)` is the share of the remainder which,
 * compounded across the ramp, telescopes to exactly one — the view is on its
 * anchor when the weight reaches full, on the smootherstep the weight already
 * had, and not a tick later.
 *
 * ## It is half of one correction and the other half is in `bandOf`
 *
 * On its own this made things worse rather than better, and the measurement is
 * why it is written here beside the other half. With the band still snapping
 * shut at the settle's end the view is *moving* when the lock starts, so
 * completing the trip on a fixed clock only spends the same distance faster:
 * measured over the author's re-flown dispatches, the ramp's travel went **up**.
 *
 * With [`bandOf`](#bandof) closing first the view is already at rest, the anchor
 * is the point it is standing on, and the remainder is zero — so on the two
 * swings `test/state/camera.test.ts` flies the ramp now travels **0.0 design
 * units** against 12.6 and 15.0 before, and on the capture the author flagged it
 * travels 0.0 against 1.8. The pair does what neither does alone.
 *
 * **It remembers nothing new.** `previous.lock` was already carried in
 * [`CameraView`](./types.ts) for the renderer, so this is a second reader of a
 * number that was there rather than a second memory — which is the promise the
 * header makes and it is kept.
 */
function closing(was: number, now: number): number {
  if (was >= 1) return 1;
  return (now - was) / (1 - was);
}

/**
 * How far ahead of the craft to look, in design units, from its vertical speed.
 *
 * Clamped rather than ramped without bound, so that the fastest run in the game
 * and a merely fast one frame alike — the prototype's `clamp(v / ref, -1, 1)`.
 */
function leadOf(vy: number): number {
  const share = Math.max(-1, Math.min(1, vy / LOOK_REF_SPEED));
  return share * LOOK_AHEAD;
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
function targetY(cameraY: number, subjectY: number, band: number): number {
  const offset = subjectY - cameraY;
  return cameraY + offset - held(offset, band);
}

/**
 * How wide the band is right now — see [`OVAL_BAND`](#oval_band) for why it is
 * ever anything other than [`DEADZONE`](#deadzone).
 *
 * ## The band used to snap back, and that was the corner the author felt
 *
 * *"When I capture a planet and circularize, the camera eventually settles
 * downwards a little bit. Can we instead just have the camera more smoothly lock
 * into place on the planet?"* (author, 2026-08-31, the run flagged at tick 931).
 *
 * The handover at the settle's end was written as two mechanisms that did not
 * know about each other. `OVAL_BAND` is zero, so through the settle the view is
 * glued to the craft and flying the oval; on the tick the settle ended the band
 * went to `DEADZONE` **in one step**, which absorbs any excursion under 168 units
 * outright — so a view moving at several units a tick stopped dead on a single
 * tick, and [`lockOf`](#lockof) then began easing in behind it. Measured on the
 * capture the author flagged, the view was travelling **2.5 units a tick and
 * reached zero on the next one.**
 *
 * That is a discontinuity in *velocity*, which is exactly the fault
 * [`held`](#held) was written to remove from the band's own edge — *"the view
 * goes from parked to tracking at a single point, and every crossing is a start
 * or a stop with nothing in between"* — reappearing at the other boundary, where
 * nothing was watching for it.
 *
 * ## So the band closes **before** the lock rather than at the same instant
 *
 * It shuts over the last [`LOCK_TICKS`](#lock_ticks) of the settle, so the view
 * decelerates out of following the oval and is **already at rest when the lock
 * takes over**. The two halves of the handover share one duration deliberately:
 * the lock's third of a second is *"slow enough to read as the view settling
 * with the orbit and fast enough not to trail it"*, and coming to a stop is the
 * same movement seen from the other side. One number, already argued.
 *
 * Measured over 11 captures held on one unbroken orbit, from the author's own
 * dispatches re-flown at `SIM_VERSION` 9 — **a different run, and it is said
 * plainly** because everything before 9 refuses to replay:
 *
 * | | before | after |
 * |---|---|---|
 * | jerk across the handover, p50 | 3.12 | **0.65** |
 * | jerk across the handover, worst | 7.48 | **0.88** |
 * | view travel after the settle ends, p50 | 0.71 | **0.15** |
 * | ticks until the view is still, p50 | 1 | 1 |
 *
 * On the flagged capture itself the reversal disappears outright: the view used
 * to run `… 1.4, 0.7, −0.1, −0.9, −1.7, −2.5, 0.0` — swinging one way, back the
 * other, then stopping dead — and now reaches rest seven ticks before the lock
 * arrives and holds it.
 *
 * ## What it costs, which is the author's own ruling and so is stated
 *
 * `OVAL_BAND` at zero was ruled so the view flies **99%** of the oval's swing
 * rather than 70%. This gives a little of that back: over the same 11 captures
 * the share falls from **0.80 to 0.73** on a path-length reading. The last third
 * of a second of a settle is the part where the orbit is already nearly round and
 * the swing is at its smallest, which is why it is the cheapest place to spend
 * it — but it is a taste call on the author's own ruling, and `LOCK_TICKS` is on
 * the bench so it can be flown from 0 (the old snap) upward.
 */
function bandOf(sim: SimState): number {
  const orbit = sim.orbit;
  if (orbit === null) return DEADZONE;
  const closed = (orbit.ticksSinceFreeze - (SETTLE_TICKS - LOCK_TICKS)) / LOCK_TICKS;
  const open = OVAL_BAND + (1 - OVAL_BAND) * Math.max(0, Math.min(1, closed));
  return DEADZONE * open;
}

/**
 * How much of the band survives while the **oval** is still being flown. **None**,
 * which is the prototype's own answer on this axis.
 *
 * The author, 2026-08-30: *"in the original prototype the camera follows the ship
 * a bit during the eccentric oval phase of circularization. Can we mimic that
 * here?"*
 *
 * ## This file already agreed with them, and the band was quietly disagreeing
 *
 * The header's own rule is that *"the dive and the settle are flown; only the
 * round orbit at the end of them is watched"*, and [`lockOf`](#lockof) is
 * deliberately zero for the whole settle so the oval keeps its swing — a ruling
 * that cost the prototype a measurement, *"of 83px of total swing only 41
 * survived."* The deadzone knew nothing about any of that. Measured over **69
 * settles** in the author's own dispatches, the craft swings **436 design units
 * at p50** through the oval and the view was flying only **70%** of it.
 *
 * At zero it flies **99%**, and the swept alternatives are recorded because the
 * choice is a taste one and the author flew it: a quarter of the band leaves 90%,
 * half leaves 82%.
 *
 * ## Why removing it here is safe when removing it everywhere was not
 *
 * The author refused a bandless camera earlier the same day — *"WAY too fixed on
 * the ship"* — so this looks like the same move and is not. That one was during
 * the **coast**, where the craft runs in a straight line and a view pinned to it
 * shows a still picture of a moving world. An oval is the opposite: the craft
 * swings and comes back, so what the view tracks is bounded, returns to where it
 * started, and is the most dramatic thing in a capture. It is the one stretch of
 * a run where following closely is the point.
 *
 * It lasts until [`LOCK_TICKS`](#lock_ticks) before the end of
 * [`SETTLE_TICKS`](../sim/units.ts) — **not to the end of it, which is the
 * 2026-08-31 correction** — and then hands over to `lockOf`, which stops the
 * round orbit being chased at all. See [`bandOf`](#bandof) for why the last third
 * of a second is spent closing rather than following, and what it cost.
 */
const OVAL_BAND = 0;

/**
 * How far into the band the camera stays parked, as a fraction of it.
 *
 * Inside this the view does not move at all, which is the half of the deadzone
 * that has to survive: a band that merely *slows* near the middle has no
 * equilibrium except the craft itself, so over a long straight coast it creeps
 * all the way onto it — which is the *"WAY too fixed on the ship"* the author
 * refused earlier the same day, arriving slowly instead of at once.
 */
export const PARKED = 0.7;

/**
 * How much of an excursion the band absorbs — a deadzone with a **rounded edge**.
 *
 * ## The hard band is what the author flew as *"mechanical"*
 *
 * A band that absorbs everything up to `DEADZONE` and nothing past it is
 * continuous in *position* — at the edge it hands over exactly where it left off
 * — but its **slope steps from 0 to 1** there. So the view goes from parked to
 * tracking at a single point, and every crossing is a start or a stop with
 * nothing in between: *"if I hop to a planet, orbit, hop to another, the camera
 * moves, freezes, and moves. Can it be a bit more elastic or something?"*
 * (author, 2026-08-30).
 *
 * ## Two pieces that meet in both value and slope
 *
 * Inside `PARKED` the whole excursion is absorbed and the view is exactly still.
 * Outside it the absorbed share eases from there up to `DEADZONE` on
 * `1 − (1−A)² / ((e−A) + (1−A))`, which is chosen for its two ends rather than
 * its shape: it **is** `A` at the join and its slope there **is** 1, so it leaves
 * the parked region without a corner, and it approaches `DEADZONE` from below, so
 * a craft far outside is still brought to the band's edge exactly as before.
 *
 * So the view now decelerates into stillness and accelerates out of it, where it
 * used to stop dead and start dead. Measured over the author's dispatches, the
 * camera is exactly still on **31%** of ticks against 37% before — it still
 * parks, it just no longer arrives with a step — while how locked it is to the
 * craft is unmoved at **0.57**, and the tick-to-tick change in its movement falls
 * at p95.
 *
 * ## It cannot cycle, which is the thing this file most has to protect
 *
 * `targetY`'s own warning is that a target defaulting to **centred** pans the
 * subject inside the band, which moves the target back to centre, which pans the
 * other way — measured on the prototype as the view wobbling while flying
 * straight. This cannot do that: what is left over, `x − held(x)`, is zero inside
 * the parked region and otherwise has the sign of `x` and a magnitude below it.
 * **The target is always between the camera and the subject**, so the view
 * approaches without overshooting and there is nothing to oscillate about.
 *
 * Division and `Math.abs` only. The natural way to write a rounded corner is an
 * exponential, and ADR-0014 bans `exp` with the rest of the approximated `Math`.
 */
function held(offset: number, band: number): number {
  if (band <= 0) return 0;
  const at = Math.abs(offset) / band;
  if (at <= PARKED) return offset;
  const rest = 1 - PARKED;
  const share = 1 - (rest * rest) / (at - PARKED + rest);
  return offset < 0 ? -band * share : band * share;
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

/**
 * The level the view has to be at for the orbit it is about to watch to be
 * framed — or `null` when it is already framed, which is most of the time.
 *
 * ## The settle used to be paid for after the orbit was round
 *
 * *"I still see the camera settling in lower once the orbit is reached. I think
 * it'd be nicer if the camera just stayed at the level it was at when I first
 * started circularizing"* (author, 2026-08-31, flagged at tick 518).
 *
 * [`stillPoint`](#stillpoint) clamps the lock's anchor to within a
 * [`DEADZONE`](#deadzone) of the body, and on a wide orbit that clamp **binds**.
 * Measured on the flagged capture, the view ended the oval 247 units above the
 * body against an anchor at 168, so it had **79 design units** to travel — and
 * every one of them was spent *after* the orbit had become round, which is
 * precisely the moment a player has stopped expecting the picture to move.
 *
 * So the travel happens over the settle's last [`LOCK_TICKS`](#lock_ticks)
 * instead, the same window [`bandOf`](#bandof) closes the band across. The view
 * is finishing its swing there anyway; the clamp's pull rides inside movement
 * that is already happening, and by the time the orbit is round the view is
 * where it is going to stay. **Nothing is removed and nothing is loosened** —
 * the same distance is covered, at a moment when it does not read as the picture
 * drifting on its own.
 *
 * ## `null` is the common case and is why this is cheap
 *
 * Nine of the thirteen captures in the author's dispatches are already framed
 * when the settle ends: the clamp does not bind, this returns `null`, and the
 * band and the follow ease do exactly what they did before. What changes is only
 * **when** the other four pay.
 */
function outOfFrame(cameraY: number, sim: SimState): number | null {
  if (sim.heldBody === null) return null;
  const bound = stillPoint(cameraY, sim.field.bodies[sim.heldBody]!.y);
  return bound === cameraY ? null : bound;
}

/**
 * How far through coming to rest the view is, from 0 to 1 — zero for the whole
 * dive and most of the settle, then over the settle's last
 * [`LOCK_TICKS`](#lock_ticks), then one for as long as the orbit lasts.
 *
 * It is the same window [`bandOf`](#bandof) closes the band over, because it is
 * the same movement: the band stops the view *following*, and this puts it where
 * it is going to stay.
 *
 * **Smootherstep, the curve [`lockOf`](#lockof) arrives on.** Both ends have to
 * be seamless, and it is what makes the pair below a true ease: a fixed
 * destination with [`closing`](#closing)'s telescoping increment lands the view
 * exactly on `lerp(where it started, where it is going, this)`, so the curve
 * chosen here *is* the movement's shape. A linear share crosses at a constant
 * speed that starts and stops with a step — measured at 27 units/tick² of jerk,
 * four times what this exists to remove.
 */
function homingShare(sim: SimState, ago = 0): number {
  const orbit = sim.orbit;
  if (orbit === null) return 0;
  const through = Math.max(
    0,
    Math.min(1, (orbit.ticksSinceFreeze - ago - (SETTLE_TICKS - LOCK_TICKS)) / LOCK_TICKS),
  );
  return through * through * through * (through * (through * 6 - 15) + 10);
}
