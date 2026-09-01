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
 * ## ⚠ It moves sideways now (author, 2026-09-01)
 *
 * It did not, and this file's own note said the decision *"expires when the
 * field outgrows the design space, which is M1.4's boundary and M3's corridor"*.
 * It had — the corridor is 1.9× the design width — and
 * [M3.1](../../docs/plan/m3-the-field.md) has owed the axis since. The author
 * called it due once the boundary was built:
 *
 * > *"I think we need to add the sideways camera movements at this point to
 * > properly test the off-screen boundaries."*
 *
 * **It is the same two mechanisms on a second axis, which is what the old note
 * predicted**: *"in a field that panned, the same blend would carry x too."* The
 * rounded edge, the follow ease and the lock are all shared.
 *
 * ## ⚠ It shipped sharing the vertical band, and the author flew that and refused it
 *
 * This file claimed, for one build, that *"there is no sideways constant, because
 * there is no sideways question the vertical answers differently."* That was
 * wrong, and the author found it on the first flight:
 *
 * > *"The camera follows the ship laterally a bit too much. I'd like to have it
 * > be a bit more lazy/slow, again mimicking the original prototype a bit more."*
 *
 * The prototype has a horizontal band of its own and this repo had not looked at
 * it: `cameraMarginFrac` **0.22** of the window width, keeping the ship between
 * the margins, which is a half-band of `0.28 × W`. See
 * [`SIDEWAYS_BAND`](#sideways_band). Its follow rate is 3 — the one this file
 * already uses — so the laziness was never in the rate.
 *
 * ## ⚠ And the view stops at the line (author, 2026-09-01)
 *
 * > *"The boundary of the hot zone should be the end of the camera. I.e. when the
 * > player approaches an edge, the edge should kind of lock at the screen edge,
 * > and not expose stuff 'past' it with the exception of anomalies and other safe
 * > havens."*
 *
 * The prototype states the same rule and this file had assumed
 * [`visible`](../render/letterbox.ts) was enough. It is not: that clips the
 * *drawing* to the corridor, so a camera panned past the line showed a strip of
 * bare VOID rather than showing world it should not. What the author asked for is
 * the camera stopping, which is [`panBounds`](#panbounds) — the prototype's own
 * *"the view may not show dead space beyond a barrier"*, and its exception with
 * it.
 *
 * ## What it is worth, and what it costs
 *
 * M1.4 measured that the craft can be **538 design units outside the picture and
 * still alive**. Measured over the 18 dispatches that replay at `SIM_VERSION` 9:
 * the craft is outside the picture on **3.4% of ticks** without this and on
 * **0.00%** with it. The whole of the M1.4 defect, closed.
 *
 * **And it is calmer than the axis that is already flown.** The parked camera
 * session's second trap is that *"distance travelled is not what abrupt means —
 * **jerk**, the tick-to-tick change in the view's velocity, is."* Measured that
 * way over the same corpus, sideways against the shipped vertical:
 *
 * | jerk, design units | p50 | p90 | p95 | p99 | max |
 * |---|---|---|---|---|---|
 * | sideways | 0.00 | 0.30 | 0.41 | 0.58 | 13.81 |
 * | vertical | 0.11 | 0.62 | 0.73 | 2.38 | 20.66 |
 *
 * Lower at every percentile, which is the measurement that says this will not
 * read as the thing that evening was about. It is exactly still on **69%** of
 * ticks against the vertical's 31% — the craft weaves rather than climbing
 * sideways, so the stillness is the run's and not the mechanism's, and the
 * rounded edge is what keeps it from arriving with a step.
 *
 * The one number that is *not* better is the max, and it is
 * [`panBounds`](#panbounds): a bound that starts binding is the largest single
 * change this axis can make. It is still under the vertical's, which is the
 * comparison `test/state/camera.test.ts` holds as a standing rule.
 *
 * ## ⚠ What this does **not** reopen
 *
 * The camera was parked on 2026-08-31 after eight corrections in one evening, and
 * `docs/plan/m2-the-instrument.md` holds what they cost. **Every one of them was
 * about the vertical axis** — the lock arriving, `OVAL_BAND`, the settle's
 * descent, the framing clamp. Not one line of the `y` computation is touched
 * here, so that evidence and those complaints are exactly where they were. What
 * is added is an axis that never existed.
 *
 * **The look-ahead is deliberately not carried to `x`**, and that is the parked
 * session's first measurement doing its job: `LOOK_AHEAD` is where the largest
 * single-tick change in the view was found — 10.2 design units at a freeze
 * against 3.1 at a release — and three corrections were made to the lock before
 * anyone looked at it. Adding a second one on a new axis, before the author has
 * flown the axis at all, is the same mistake with the order reversed. It is the
 * obvious next lever if the view feels late going out to a wall, and it is the
 * prototype's own axis for it (see [`LOOK_AHEAD`](#look_ahead)).
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
import { SHELTERS, shelters } from './boundary.ts';
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
 * How far the craft may drift sideways before the camera follows, in design
 * units either side — **the prototype's own horizontal band.**
 *
 * ## Why this is a fraction where [`LOOK_AHEAD`](#look_ahead) is a distance
 *
 * `LOOK_AHEAD`'s note records a fraction that did not survive being carried: the
 * prototype writes its look-ahead as `0.18` of the **window width** and this repo
 * put it on the *vertical* axis, where 0.18 of the long side is more than twice
 * the reach the prototype actually has. The lesson was *the axis a fraction was
 * written against is part of the fraction.*
 *
 * **This is the same fraction rule pointing the other way**, and that is why it
 * is safe: the prototype's `cameraMarginFrac` is a fraction of its window width
 * and it is being carried onto **this repo's window width**, horizontal to
 * horizontal. Nothing about the axis changes, so nothing has to be re-derived —
 * and a deadzone that is a fraction of the picture is the right shape anyway,
 * because what it is protecting is a share of the frame.
 *
 * ## The arithmetic
 *
 * The prototype keeps the ship between `margin` and `W − margin` of its window,
 * at `margin = 0.22 × W`. That is a band `W − 2 × margin` wide, so a **half-band
 * of `(0.5 − 0.22) × W = 0.28 × W`** — 109 of its units against a 390-unit
 * window, and **328 design units** here.
 *
 * That is **1.95× the vertical band** this shipped sharing, which is the whole of
 * what the author felt. Measured over the 18 replayable dispatches, against the
 * shared band it replaces:
 *
 * | | camera still | jerk p95 | jerk max |
 * |---|---|---|---|
 * | shared vertical band (168) | 49% | 0.55 | 12.35 |
 * | the prototype's band (328) | **69%** | **0.41** | **3.48** |
 *
 * So it is lazier *and* smoother — the wider band absorbs the excursions that
 * were driving the view, rather than trading stillness for a harder arrival.
 *
 * **It does not collapse through the settle**, which is the one place it
 * deliberately parts company with the vertical. [`OVAL_BAND`](#oval_band) is zero
 * so that the oval keeps its swing, and the measurement behind that — *"the craft
 * swings 436 design units at p50 through the oval and the view was flying only
 * 70% of it"* — is a **vertical** measurement. Applying it sideways would glue
 * the view to the craft during a capture, which is exactly the moment the author
 * called *too much*.
 */
export const SIDEWAYS_BAND = 0.28 * DESIGN_WIDTH;

/**
 * How far past the line the view may reach, in design units — **zero, and it is a
 * named zero rather than an absence.**
 *
 * The author's ruling has an exception in it: *"not expose stuff past it **with
 * the exception of anomalies and other safe havens**."* A **shelter**
 * (`CONTEXT.md`) is what holds the line open, and only the **anomaly** projects
 * one, which is [M8](../../docs/plan/m8-the-anomaly.md)'s and is deliberately
 * last. So [`SHELTERS`](./boundary.ts) is empty, this is spent by nothing, and the
 * term is built.
 *
 * **The prototype's is 150 of its units and the mechanism is worth carrying with
 * it when M8 lands**, because it records what going without cost: its relax opens
 * over the 150px *before* the wall, *"which is what lets the camera be already
 * moving when the ship crosses instead of pinned against a line it is about to
 * pass. Without it the view held still, then had to match the ship's speed in one
 * tick: measured at 1137px/s of camera jerk, reported as a jagged crossing."* And
 * it is **ramped rather than switched** at both ends — a boolean *"threw the
 * camera 158px, reported as a jagged jump returning to the field."*
 *
 * None of that ramp is built here, because building it would be inventing where
 * M8's shelter goes and how deep it reaches. What is built is the bound it opens.
 */
export const SHELTER_RELAX = 0;

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

/**
 * Where the camera opens sideways: on the craft, exactly as it opens on the
 * craft vertically.
 *
 * *"Placed, not eased into place"* — [`openCamera`](#opencamera)'s own rule, now
 * that there is a second axis for it to be true of. The spawn stands 18 design
 * units off the centreline, so this is a difference of 18 in the opening frame
 * and a difference of principle: a run opens looking at the craft.
 */
function openX(sim: SimState): number {
  return sim.craft.x;
}

/**
 * The camera at the first tick of a run.
 *
 * Placed, not eased into place. A run that opened by gliding from wherever the
 * last one ended would begin with a lurch, and the prototype records exactly
 * that as the reason its own reset is a placement.
 */
export function openCamera(sim: SimState): CameraView {
  return { x: openX(sim), y: sim.craft.y, lock: 0, offset: 0 };
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
  const body = sim.heldBody === null ? null : sim.field.bodies[sim.heldBody]!;
  const offset = lock > 0 && body !== null ? (stillPoint(previous.y, body.y) - craftY) * lock : 0;

  // **The same displacement on the second axis.** An orbit goes round in `x` as
  // well as in `y` — the craft's excursion sideways through a settled orbit is
  // the same diameter — so the lock that stops the world sliding vertically has
  // to stop it sliding sideways too, or a locked view holds one axis still and
  // lets the other swing by the orbit's width. It is the same `lock`, the same
  // still point and the same clamp; only the coordinate differs.
  const offsetX =
    lock > 0 && body !== null ? (stillPoint(previous.x, body.x) - sim.craft.x) * lock : 0;

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
  const subjectX = sim.craft.x + offsetX;
  const step = easeStep(FOLLOW_RATE);

  // **The target is clamped, not the result**, so the ease decelerates into the
  // bound instead of being stopped at it. A clamp applied after the step would
  // hold the view against the line at whatever speed it arrived with, and let go
  // at that speed too — which is a step in the view's velocity at exactly the
  // moment the boundary is loudest.
  const bounds = panBounds(sim);
  const wanted = toward(previous.x, subjectX, SIDEWAYS_BAND);
  const aimed = Math.min(Math.max(wanted, bounds.lo), bounds.hi);
  // **And again on the result, which is the backstop.** The prototype is emphatic
  // that these are one rule and not two: *"the same rule, applied to the place
  // the camera is aiming and then to the place it actually reached. Writing the
  // backstop its own weaker version is what let ordinary play see past the dashed
  // line."* Clamping only the target is not enough because the ease lags it — the
  // aim can be legal while the view has not arrived, which is exactly the case a
  // fast dive produces.
  const eased = previous.x + (aimed - previous.x) * step;

  return {
    // **The same blend on both axes, and a band of its own on each.** The rounded
    // edge, the ease and the lock are shared; what differs is how wide the band
    // is and whether the view may pass the line. See [`SIDEWAYS_BAND`](#sideways_band).
    x: Math.min(Math.max(eased, bounds.lo), bounds.hi),
    y: previous.y + (toward(previous.y, subjectY, bandOf(sim)) - previous.y) * step,
    lock,
    offset,
  };
}

/**
 * How far sideways the view is allowed to sit — the prototype's *"the view may
 * not show dead space beyond a barrier"*, and the author's ruling of 2026-09-01
 * that *"the edge should kind of lock at the screen edge."*
 *
 * The bound is on the **picture**, not on the craft: the design space's own edge
 * may reach the line and no further, so the last thing at the side of the screen
 * is the line itself. Spec [00 · §7](../../docs/spec/00-tokens.md) makes that
 * width a contract — 1170 design units, always — so this is the same bound on
 * every device.
 *
 * **Framing loses to it, deliberately.** A craft past the line is inside spec
 * 01 §10's four units of grace and is about to die there, and the prototype's own
 * ruling is that *"a view with the ship missing is worse than a view with some
 * black in it"* — except that the field rule wins anyway, *"because it is a rule
 * about what the player may SEE."* Measured over the 18 replayable dispatches:
 * the craft leaves the picture on **0.10% of ticks**, and every one of them is in
 * the last eleven ticks of the two runs that die out of bounds, inside the final
 * 46 m before the line. A fifth of a second, while dying at a wall.
 *
 * **A corridor no wider than the picture cannot pan at all**, which is the
 * prototype's own guard and not a hypothetical: spec 17 §4 narrows the corridor
 * with altitude, and a day that narrows it to the design width has one framing
 * and no choice about it. The bounds collapse to the centreline rather than
 * crossing.
 */
function panBounds(sim: SimState): { lo: number; hi: number } {
  const { centreline, halfWidth } = sim.field.corridor;
  const half = DESIGN_WIDTH / 2;
  // **Framing**: the craft may not leave the picture. This is the prototype's
  // *"backstop for the frames the ease has not caught up on"*, and it is not
  // belt-and-braces — the band is 328 units wide and the ease lags a fast dive by
  // 340 more, so without it a craft crossing the corridor at speed leaves the
  // frame in the middle of the field with no wall anywhere near. Measured on the
  // shipped run before this was added: ten ticks, worst 668 units from the view.
  const frameLo = sim.craft.x - half;
  const frameHi = sim.craft.x + half;

  // A field with no sides has no line to stop at — `check-portability` builds
  // exactly that one, which is the same field [`hasRungs`](./rung.ts) exists for.
  if (!Number.isFinite(halfWidth)) return { lo: frameLo, hi: frameHi };

  // **The field**: the view may not show dead space beyond the line. The author's
  // exception rides on it as a named zero — see [`SHELTER_RELAX`](#shelter_relax).
  const relax = shelters(SHELTERS, sim.craft.x, sim.craft.y) ? SHELTER_RELAX : 0;
  const fieldLo = centreline - halfWidth + half - relax;
  const fieldHi = centreline + halfWidth - half + relax;
  // A corridor no wider than the picture has one framing and no choice about it —
  // spec 17 §4 narrows the corridor with altitude, so this is a real case.
  if (fieldHi < fieldLo) return { lo: centreline, hi: centreline };

  const lo = Math.max(fieldLo, frameLo);
  const hi = Math.min(fieldHi, frameHi);
  // **Where they disagree, the field wins**, which is the prototype's own ruling
  // and the author's: *"not expose stuff past it."* They can only disagree with
  // the craft outside the line — inside it, framing is satisfied everywhere the
  // field allows. What is returned is the nearest legal point to what framing
  // wanted, which is continuous in the craft's position and so cannot step.
  if (lo > hi) {
    const nearest = Math.min(Math.max(sim.craft.x, fieldLo), fieldHi);
    return { lo: nearest, hi: nearest };
  }
  return { lo, hi };
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
 * The point a locked view holds on, on one axis: where it already is, unless
 * that is too far from the body to keep the orbit framed.
 *
 * Axis-free, and called once per axis — the clamp is a distance from the body
 * and [`DEADZONE`](#deadzone) is a floor radius, neither of which has a
 * direction.
 */
function stillPoint(camera: number, body: number): number {
  return Math.min(Math.max(camera, body - DEADZONE), body + DEADZONE);
}

/**
 * Where the camera would like to be on one axis: the deadzone, and nothing else.
 *
 * **One function, both axes** since the sideways axis landed — it was `targetY`
 * and nothing in it was ever vertical. The warning below is the reason it is
 * worth keeping one copy: a second one is a second thing that can be given a
 * centred default.
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
function toward(camera: number, subject: number, band: number): number {
  const offset = subject - camera;
  return camera + offset - held(offset, band);
}

/** How wide the band is right now — see `OVAL_BAND`. */
function bandOf(sim: SimState): number {
  const orbit = sim.orbit;
  const settling = orbit !== null && orbit.ticksSinceFreeze < SETTLE_TICKS;
  return settling ? DEADZONE * OVAL_BAND : DEADZONE;
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
 * It lasts exactly [`SETTLE_TICKS`](../sim/units.ts) and hands over to `lockOf`,
 * which stops the round orbit being chased at all.
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
