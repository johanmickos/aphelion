/**
 * The punch — what a release does to the view, and how quality is spent on it.
 *
 * `CONTEXT.md`: *"the kick a release lands, scaled by the quality of the swing
 * and gone within a second or so. Bought with speed rather than with stopped
 * time (ADR-0012), and carried entirely by the transient, so it never changes
 * what a run is worth."*
 *
 * ## It is the thing the hitstop is not
 *
 * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
 * withdrew the 70ms world freeze spec [02](../../docs/spec/02-release.md)'s whole
 * timeline was dated from — *"even a 30ms stop made it feel like the game was
 * buffering"* — and what replaces it is this. Spec 02 §5 gives it a magnitude and
 * a direction: **6px along the exit tangent at a release, 3px reversed at a
 * grab, home in 180ms with one overshoot.** Spec 00 §5 rules what it may never
 * be: *"never rotational, never random... a shake would say damage; this game
 * has no damage, only commitment."*
 *
 * ## Quality enters twice, and the second channel is the gentler one
 *
 * ADR-0012: *"a release at the top of its envelope holds its punch half again as
 * long as a scraped one. Strength is the punch; duration is how far it carries."*
 * So [`quality`](../sim/quality.ts) — one number, and deliberately only one
 * definition of it — scales both the displacement and the span, and the span by
 * half as much again rather than by the same curve.
 *
 * **The strength is a square root and that is measured, not chosen.** ADR-0012
 * carries the prototype's own finding: applied linearly *"the median recorded
 * release paid 29% of full and read as nothing happening"*, and √0.29 is 0.54.
 * *"The curve lifts weak releases, leaves the top where it was, and cannot lift a
 * tap because it cannot lift zero."*
 *
 * `Math.sqrt` is the one root ECMA-262 requires to be correctly rounded, so
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md) has
 * nothing to say about it and `pnpm portable` agrees.
 *
 * ## A displacement, and not a second opinion about where the camera is
 *
 * The punch travels along the exit tangent, so it has a **horizontal**
 * component — and [`camera.ts`](./camera.ts) does not move sideways at all until
 * [M3.1](../../docs/plan/m3-the-field.md), with a test asserting the centreline on
 * every tick of every swing. Both are right, and the way they meet is that this
 * is a displacement *from* wherever the camera is standing rather than a claim
 * about where it should stand: the camera follows what it always followed, and
 * the punch is added on top and taken off again. What the centreline test asserts
 * is the camera's **subject** — see [`subjectOf`](./camera.ts).
 */
import { magnitude } from '../sim/math.ts';
import type { Craft } from '../sim/craft.ts';
import { SCALE } from '../sim/units.ts';
import { advance, home, place, ticksIn } from './decay.ts';
import type { PunchView } from './types.ts';

/**
 * How far a release displaces the view at full quality, in design units.
 *
 * Spec 02 §5's **6px**, read into design units at three per board pixel — the
 * same conversion [`energy.ts`](./energy.ts) applies to the bloom radii, and the
 * same ×3 the author confirmed for spec 01's lengths (ADR-0010).
 *
 * It is the punch at the top of the envelope and nothing below it gets this far:
 * ADR-0012 rules the punch *"can be large without touching the economy"*, so
 * this end of the range is the one to fly, and it is on the bench.
 */
export const PUNCH_RELEASE = 6 * SCALE;

/**
 * And a grab's, reversed into the orbit — spec 02 §5's **3px**.
 *
 * **Not scaled by quality, and that is spec 06 §1 rather than an omission:**
 * *"grabs are never graded; only releases are."* A grab is the same gesture at
 * half the amplitude, pointing the other way, so *"even the camera distinguishes
 * catching from letting go"* — and a graded grab would be the second definition
 * of *how good was that* ADR-0012 exists to refuse.
 */
export const PUNCH_GRAB = 3 * SCALE;

/**
 * How long the punch takes to come home — spec 02 §5's **180ms**, with one
 * overshoot.
 *
 * Eleven ticks, the same span as the craft's stretch
 * ([`deformation.ts`](./deformation.ts)) and on the same rebound curve, because
 * spec 00 §5's motion tokens are one grammar and the two are one gesture seen on
 * two elements.
 */
export const PUNCH_TICKS = ticksIn(180);

/**
 * How much longer a punch at full quality carries than a scraped one, as a
 * fraction of [`PUNCH_TICKS`](#).
 *
 * ADR-0012's *"half again as long"*, which is the whole of quality's second
 * channel. It is deliberately the gentler one: a release that mistimed its
 * envelope still gets a punch, and what it loses is how far the punch carries
 * rather than whether there was one.
 */
export const PUNCH_STRETCH = 0.5;

/** What a release of this quality is worth as a displacement, in design units. */
export function punchSize(quality: number): number {
  return PUNCH_RELEASE * Math.sqrt(Math.min(Math.max(quality, 0), 1));
}

/** And how long it carries, in ticks. */
export function punchSpan(quality: number): number {
  return Math.round(PUNCH_TICKS * (1 + PUNCH_STRETCH * Math.min(Math.max(quality, 0), 1)));
}

/**
 * The punch a release of this quality lands, along the craft's own exit tangent.
 *
 * The direction is read off the velocity rather than off a heading, so it is
 * **exactly** the tangent with no trig in the way: spec 01 §8 makes the exit
 * direction exactly tangential by construction, and normalising the vector the
 * craft is already carrying inherits that instead of re-deriving it through an
 * angle and back.
 *
 * `null` for a craft that is not moving and for a quality of zero — a tap has no
 * arc behind it, so there is nothing to be paid for and nothing to place.
 * ADR-0012: *"a tap pays nothing, structurally rather than by a guard."*
 */
export function releasePunch(craft: Craft, quality: number): PunchView | null {
  return punchAlong(craft, punchSize(quality), punchSpan(quality));
}

/** And the grab's mirror: half the amplitude, into the orbit rather than out of it. */
export function grabPunch(craft: Craft): PunchView | null {
  return punchAlong(craft, -PUNCH_GRAB, PUNCH_TICKS);
}

/** The same punch one tick on, or `null` once it is home. */
export function relaxPunch(previous: PunchView | null): PunchView | null {
  if (previous === null) return null;
  const decay = advance(previous.decay);
  if (decay === null) return null;
  return displacementOf(previous.alongX, previous.alongY, previous.size, decay);
}

/**
 * A punch of `size` design units along the craft's velocity, lasting `span`.
 *
 * A negative size points the other way, which is what makes the grab the
 * release's mirror rather than a second rule.
 */
function punchAlong(craft: Craft, size: number, span: number): PunchView | null {
  const speed = magnitude(craft.vx, craft.vy);
  if (speed === 0 || size === 0 || span <= 0) return null;
  return displacementOf(craft.vx / speed, craft.vy / speed, size, place(span));
}

/**
 * Where the view is displaced to now, from the direction it was struck in.
 *
 * The direction is carried rather than recomputed, because the craft is turning
 * the instant after a grab and flying straight the instant after a release: a
 * punch that re-read the velocity every tick would swing round with the craft on
 * one of the two and not the other, and spec 02 §5's rule is that *every* motion
 * in the sequence is parallel to the exit tangent.
 */
function displacementOf(
  alongX: number,
  alongY: number,
  size: number,
  decay: Parameters<typeof home>[0],
): PunchView {
  const left = home(decay);
  return {
    x: alongX * size * left,
    y: alongY * size * left,
    alongX,
    alongY,
    size,
    decay,
  };
}
