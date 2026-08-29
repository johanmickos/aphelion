/**
 * The orbit a swing freezes onto, and the clock that sweeps it.
 *
 * `CONTEXT.md` — the **freeze** is *"the moment at the end of the dive when the
 * orbit is fixed and the craft passes from simulated gravity onto a fixed
 * orbit"*, and the **settle** is *"the stretch after the freeze in which the
 * orbit rounds toward a circle and the speed the dive earned is spent."*
 *
 * **Nothing here is integrated.** After the freeze the craft rides a phase
 * clock, so a swing held for a minute cannot accumulate the error a swing held
 * for a second does not have. The settle's 1.2 seconds are advanced tick by tick
 * because its rate changes throughout them; everything after it is one
 * multiplication against the tick count, which is the half that actually
 * mattered.
 *
 * ## §6a, which a tidy-minded rewrite will delete
 *
 * Spec [01 · §6a](../../docs/spec/01-swing.md) is **deliberately physically
 * inconsistent**, confirmed by measurement, and it is the mechanism the whole
 * swing turns on. Three quantities, from three places, that do not agree:
 *
 * - **The floor sets the radius.** The frozen periapsis is wherever
 *   [`dive.ts`](./dive.ts) held the craft, which is the floor for essentially
 *   every dive.
 * - **The cap sets the shape.** Eccentricity is clamped at 0.6, and the clamp
 *   binds on all but the slowest dives.
 * - **The dive sets the speed, and the cap does not apply to it.** The sweep is
 *   seeded from the dive's peak energy, and the *eccentricity* clamp does not
 *   reach it. So the craft sweeps a clamped oval at a rate derived from an orbit
 *   that would have been more eccentric than that. (What does bound it is escape
 *   speed at the periapsis, which is a different clamp for a different reason —
 *   see [`FREEZE_ESCAPE_FRACTION`](./units.ts).)
 *
 * Measured, four dives differing only in approach speed produce **the same
 * ellipse — same axis, same eccentricity, same periapsis, same apoapsis — ridden
 * at 400, 415, 435 and 435.** A faster dive does not buy a different orbit; it
 * buys *the same orbit, flown faster*. Making the rate agree with the clamped
 * shape is the obvious correction and it **throws away the only channel by which
 * the quality of a dive survives into the orbit**.
 *
 * And the settle spends it: by 1.2s every one of those dives is at exactly the
 * circular speed at the floor, however it arrived. The reward for a good dive is
 * a speed advantage with a **1.2-second shelf life**, and cashing it before it
 * expires is the whole of spec 01 §11's timing problem. A rewrite where holding
 * indefinitely preserves the advantage has removed the reason to let go.
 */
import type { Body } from './body.ts';
import { floorRadius } from './body.ts';
import type { Craft } from './craft.ts';
import type { Dive } from './dive.ts';
import {
  angularMomentum,
  circularSpeed,
  eccentricityFor,
  escapeSpeed,
  specificEnergy,
} from './kepler.ts';
import { magnitude } from './math.ts';
import { angleOf, cos, sin } from './trig.ts';
import {
  ECCENTRICITY_CAP,
  FREEZE_ESCAPE_FRACTION,
  SECONDS_PER_TICK,
  SETTLE_TICKS,
  SUBSTEPS,
} from './units.ts';

export interface Orbit {
  /** Where the craft was when the dive bottomed out — the floor, in practice. */
  readonly periapsis: number;
  /** The shape at the freeze, capped. The settle eases it to nothing. */
  readonly eccentricity: number;
  /** Angular momentum at the freeze, from the dive's peak energy and uncapped. */
  readonly momentum: number;
  /** Which way the periapsis lies from the body — the orbit's own north. */
  readonly periapsisAngle: number;
  /** Which way round the craft goes: +1 counter-clockwise, −1 clockwise. */
  readonly direction: number;
  /**
   * How far the dive committed, as a fraction of the distance from the grab to
   * the floor (`CONTEXT.md`: **depth**). What [`boost.ts`](./boost.ts) is paid
   * on, and the one thing the orbit keeps from the dive that is not geometry.
   */
  readonly depth: number;
  /**
   * How far round from periapsis the craft has swept, in radians.
   *
   * Accumulated through the settle and then left alone: once the shape and the
   * momentum stop changing the angle is a straight multiplication against the
   * tick count, which is what makes a long hold free of drift.
   */
  phase: number;
  /** The clock every part of the swing after the dive is dated from. */
  ticksSinceFreeze: number;
}

/**
 * How far through the settle the orbit is, on a smootherstep.
 *
 * Smootherstep rather than a line because both ends have to be seamless: the
 * freeze must not kink the path it just took over, and the arrival at the circle
 * must not stop with a jolt. Its first and second derivatives vanish at both.
 */
function settled(ticks: number): number {
  if (ticks >= SETTLE_TICKS) return 1;
  if (ticks <= 0) return 0;
  const x = ticks / SETTLE_TICKS;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** The shape at `ticks` after the freeze: the frozen oval, eased toward a circle. */
function eccentricityAt(orbit: Orbit, ticks: number): number {
  return orbit.eccentricity * (1 - settled(ticks));
}

/**
 * The angular momentum at `ticks` after the freeze.
 *
 * Eased from what the dive earned to what a circle at the periapsis radius
 * needs. Spec 01 §6: *"as the orbit rounds toward a circle, holding the oval's
 * angular momentum would spin that small circle at periapsis speed forever"* —
 * so the momentum eases on the same clock as the shape. **A rewrite that rounds
 * the shape without easing the momentum will produce an orbit that looks right
 * and moves wrong.**
 */
function momentumAt(orbit: Orbit, mass: number, ticks: number): number {
  const circular = circularSpeed(mass, orbit.periapsis) * orbit.periapsis;
  return orbit.momentum + (circular - orbit.momentum) * settled(ticks);
}

/** Where the ellipse of this shape sits at this angle past its periapsis. */
function radiusAt(orbit: Orbit, eccentricity: number, phase: number): number {
  return (orbit.periapsis * (1 + eccentricity)) / (1 + eccentricity * cos(phase));
}

/**
 * How far round the craft is at `ticks` after the freeze.
 *
 * Inside the settle this is the accumulated phase. Outside it the shape and the
 * momentum are both constant, so the rate is too, and the answer is one
 * multiplication — no matter how long the swing has run.
 *
 * **`orbit.phase` therefore stops advancing at the end of the settle**, and that
 * is not an oversight: it is the datum this multiplication is measured from, and
 * writing the answer back every tick is exactly the accumulation the closed form
 * exists to avoid. Anything outside this file that wants *how far round is the
 * craft now* has to ask [`sweptSince`](#) rather than read the field — the
 * compass read the field, and the arc it drew stopped growing at 1.2s while the
 * craft kept going round it.
 */
function phaseAt(orbit: Orbit, mass: number, ticks: number): number {
  if (ticks <= SETTLE_TICKS) return orbit.phase;
  const circular = circularSpeed(mass, orbit.periapsis) * orbit.periapsis;
  const rate = circular / (orbit.periapsis * orbit.periapsis);
  return orbit.phase + rate * (ticks - SETTLE_TICKS) * SECONDS_PER_TICK;
}

/**
 * How far round from periapsis the craft has swept `ticks` after the freeze, in
 * radians — the flown arc's own clock, and the picture's only honest source for
 * it.
 *
 * Exported because the compass draws the arc already ridden and lights it by what
 * the boost was worth along it (spec [02](../../docs/spec/02-release.md), ruled
 * 2026-08-29), which is a question about **where the craft was at a past tick**
 * and cannot be answered from the current position. Past the settle it is exact
 * and closed-form, so the envelope's decaying stretch — which begins exactly
 * where the settle ends — needs no memory at all.
 *
 * Inside the settle it answers only for the tick the orbit is *on*: the phase
 * there is accumulated at substep resolution and there is no inverse. A caller
 * that wants a corner inside the settle latches it as it passes, which is what
 * [`compass.ts`](../state/compass.ts) does with the one corner that falls there.
 */
export function sweptSince(orbit: Orbit, mass: number, ticks: number): number {
  return phaseAt(orbit, mass, ticks);
}

/**
 * The orbit the craft is *currently on*, before any freeze has fixed one.
 *
 * The osculating ellipse of the live position and velocity: the path the craft
 * would ride if gravity simply kept acting, which through the dive it is. It
 * exists so the picture can show an oval **while the dive runs** rather than
 * snapping one into view at the freeze — *"as soon as an oval orbit is possible I
 * want it to fade in"* (author, 2026-08-29) — and the prototype's own compass
 * carries the same finding from the other side: before periapsis it showed
 * nothing at all, measured at *"2.0 seconds of blank sky from the grab, which is
 * precisely when a player is deciding where this capture is taking them."*
 *
 * `null` while the craft is **unbound** — a hyperbolic pass has no oval to draw,
 * and drawing one would promise a capture the geometry has not offered yet.
 *
 * **Two approximations, both stated.** It does not model the **clearance**'s
 * remaining turn, so early in a dive that owes one the prediction is coarser than
 * it will be — it converges as the dive proceeds and lands on the frozen orbit,
 * which is what the fade is for. And where the natural periapsis would fall
 * inside the **floor** the whole ellipse is scaled up until it sits on it, rather
 * than drawn through the body: the floor is the one guarantee a grab makes, so an
 * oval that dived inside it would be a prediction of something that cannot
 * happen.
 */
export function predictOrbit(craft: Craft, body: Body): Orbit | null {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const r = magnitude(dx, dy);
  if (r <= 0) return null;

  const speed = magnitude(craft.vx, craft.vy);
  const energy = specificEnergy(body.mass, r, speed);
  if (energy >= 0) return null;

  const momentum = angularMomentum(dx, dy, craft.vx, craft.vy);
  const semiLatus = (momentum * momentum) / body.mass;
  if (semiLatus <= 0) return null;

  // The **eccentricity vector**, which points at periapsis and whose length is
  // the eccentricity — so one expression answers both *what shape* and *which way
  // round*, with no inverse cosine. That matters here rather than being tidy:
  // `Math.acos` is one of the functions ECMA-262 leaves implementation-
  // approximated, and `pnpm portable` bans it in this directory (ADR-0014).
  const ex = (craft.vy * momentum) / body.mass - dx / r;
  const ey = (-craft.vx * momentum) / body.mass - dy / r;
  const shape = Math.min(magnitude(ex, ey), 0.999);

  let periapsis = semiLatus / (1 + shape);
  if (periapsis <= 0) return null;

  // The floor is never crossed, so neither is it drawn crossed.
  const floor = floorRadius(body);
  if (periapsis < floor) periapsis = floor;

  return {
    periapsis,
    eccentricity: shape,
    momentum,
    periapsisAngle: angleOf(ex, ey),
    direction: momentum < 0 ? -1 : 1,
    depth: 0,
    phase: 0,
    ticksSinceFreeze: 0,
  };
}

/**
 * Where the orbit path is at `angle` about the body, at the shape it has **now**.
 *
 * The compass is drawn on the orbit path (spec
 * [00 · §6](../../docs/spec/00-tokens.md)), so something outside this file has
 * to be able to ask where that path is at an angle the craft is not at. It is
 * exported from here rather than recomputed there because the ellipse is one
 * thing: a second copy of it would be a compass drawn on a path the craft is not
 * on, and the settle rounds the shape every tick, so the two would agree at rest
 * and disagree exactly when it mattered.
 */
export function pathRadiusAt(orbit: Orbit, angle: number): number {
  return radiusAt(
    orbit,
    eccentricityAt(orbit, orbit.ticksSinceFreeze),
    angle - orbit.periapsisAngle,
  );
}

/**
 * Hand the craft from integrated gravity onto a fixed orbit.
 *
 * The craft does not move: spec 01 §6 fixes *"an ellipse through the craft's
 * actual position, treating it as periapsis"*, so the position the dive reached
 * is the orbit's own datum. What is replaced is the velocity, and that
 * replacement is the whole of §6a — the speed comes from the dive's peak energy
 * while the shape comes from the cap, and the two are not consistent with each
 * other on purpose.
 */
export function freeze(craft: Craft, body: Body, dive: Dive): Orbit {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const periapsis = magnitude(dx, dy);

  // The speed a craft of this energy has at this radius — the dive's, and not
  // what the floor may have left the craft with. Held below escape speed here,
  // because what the freeze hands out is an orbit and an orbit cannot be ridden
  // faster than the speed that would leave it; see `units.ts`. The eccentricity
  // cap below is a different clamp doing a different job, and §6a's rule that it
  // must not reach the rate still holds.
  const sweep = Math.min(
    Math.sqrt(Math.max(0, 2 * (dive.peakEnergy + body.mass / periapsis))),
    FREEZE_ESCAPE_FRACTION * escapeSpeed(body.mass, periapsis),
  );

  const raw = eccentricityFor(body.mass, dive.peakEnergy, periapsis);
  const momentum = angularMomentum(dx, dy, craft.vx, craft.vy);

  const floor = floorRadius(body);
  const reach = dive.grabRadius - floor;

  const orbit: Orbit = {
    periapsis,
    eccentricity: Math.min(Math.max(raw, 0), ECCENTRICITY_CAP),
    momentum: sweep * periapsis,
    periapsisAngle: angleOf(dx, dy),
    // A dive that arrived exactly radially has no way round of its own; the
    // clearance gives every such path a side before it gets here, and this is
    // the same tie-break for the one that somehow did not.
    direction: momentum < 0 ? -1 : 1,
    depth: reach > 0 ? Math.min(Math.max((dive.grabRadius - periapsis) / reach, 0), 1) : 1,
    phase: 0,
    ticksSinceFreeze: 0,
  };

  placeOnOrbit(craft, body, orbit);
  return orbit;
}

/**
 * Put the craft where the orbit says it is, going as fast as the orbit says.
 *
 * The velocity is **exactly tangential**, always. `CONTEXT.md` fixes that the
 * nose points along the exit tangent *for the whole of an orbit*, and heading is
 * read from velocity rather than stored beside it — so a velocity that was not
 * tangential would be a nose pointing somewhere the craft is not going. It is
 * also what makes spec 01 §8's *"release is exactly along the tangent"* true by
 * construction instead of by a correction applied on the way out.
 */
function placeOnOrbit(craft: Craft, body: Body, orbit: Orbit): void {
  const ticks = orbit.ticksSinceFreeze;
  const phase = phaseAt(orbit, body.mass, ticks);
  const radius = radiusAt(orbit, eccentricityAt(orbit, ticks), phase);
  const angle = orbit.periapsisAngle + orbit.direction * phase;

  const towardX = cos(angle);
  const towardY = sin(angle);
  craft.x = body.x + radius * towardX;
  craft.y = body.y + radius * towardY;

  const speed = momentumAt(orbit, body.mass, ticks) / radius;
  craft.vx = -towardY * speed * orbit.direction;
  craft.vy = towardX * speed * orbit.direction;
}

/**
 * Advance the orbit by one tick and place the craft on it.
 *
 * The phase is stepped at substep resolution through the settle for the same
 * reason the dive is: the sweep rate falls by an order of magnitude on the way
 * out to the first apoapsis, and a whole tick of the rate at its start
 * overshoots. It is bounded work — the settle is 72 ticks and never more — and
 * after it the phase is closed-form, which is the property spec 01 §6 is
 * actually buying.
 */
export function rideOrbit(craft: Craft, body: Body, orbit: Orbit): void {
  if (orbit.ticksSinceFreeze < SETTLE_TICKS) {
    const dt = SECONDS_PER_TICK / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      const ticks = orbit.ticksSinceFreeze + i / SUBSTEPS;
      const radius = radiusAt(orbit, eccentricityAt(orbit, ticks), orbit.phase);
      orbit.phase += (momentumAt(orbit, body.mass, ticks) / (radius * radius)) * dt;
    }
  }
  orbit.ticksSinceFreeze += 1;
  placeOnOrbit(craft, body, orbit);
}
