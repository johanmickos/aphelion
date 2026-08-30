/**
 * The punch — how hard a release is felt, and for how long.
 *
 * `CONTEXT.md`: *"the kick a release lands, scaled by the quality of the swing
 * and gone within a second or so. Bought with speed rather than with stopped
 * time (ADR-0012), and carried entirely by the transient, so it never changes
 * what a run is worth."*
 *
 * ## It moves the craft and not the world, and that is a ruling
 *
 * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
 * withdrew the 70ms hitstop and spec [02 · §5](../../docs/spec/02-release.md)
 * put what replaced it on the **camera** — 6px along the exit tangent, home in
 * 180ms with one overshoot. It was built that way, flown, and **rejected**:
 * *"I still feel a brief pause or shake at release — we don't want that... we
 * don't really want shake effects or pauses like that, it turns out that really
 * disrupts the flow"* (author, 2026-08-29).
 *
 * That is the same finding the hitstop got, one element along, and it is worth
 * seeing that spec [00 · §5](../../docs/spec/00-tokens.md) half-predicted it:
 * *"the camera is never rotated, never shaken and never randomised. A shake
 * would say damage; this game has no damage, only commitment."* Spec 02 §5
 * argued a **directional** kick says departure rather than damage and is
 * therefore exempt. Flown, the distinction did not survive contact — moving the
 * whole world moves the whole world, whichever way it goes.
 *
 * **So the punch is spent on the craft.** Spec 02 §4's stretch was already
 * there, already flown and already accepted, and it is the one element in the
 * sequence that is *about* the craft leaving. What quality now does is decide
 * **how much of that stretch a release earns and how long it takes coming
 * home** — ADR-0012's *"quality enters twice, as size and as duration"*, with
 * the world left alone. Nothing on screen moves that the craft is not attached
 * to.
 *
 * ## The curves, both carried rather than chosen
 *
 * **The strength is a square root.** ADR-0012 carries the prototype's own
 * finding: applied linearly *"the median recorded release paid 29% of full and
 * read as nothing happening"*, and √0.29 is 0.54. *"The curve lifts weak
 * releases, leaves the top where it was, and cannot lift a tap because it cannot
 * lift zero."* `Math.sqrt` is the one root ECMA-262 requires to be correctly
 * rounded, so [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)
 * has nothing to say about it.
 *
 * **And the duration is the gentler channel**, deliberately: a release at the
 * top of its envelope holds its punch half again as long as a scraped one, so
 * what a mistimed release loses is how far the punch carries rather than whether
 * there was one.
 */
import { ticksIn } from './decay.ts';

/**
 * How much of spec 02 §4's stretch a release of **no** quality still earns.
 *
 * **Not zero, and this is the number that keeps the release marked.** A tap
 * beside a body has no arc behind it and pays nothing — that is ADR-0012's
 * *"structurally rather than by a guard"* and it must stay true of the
 * **boost** — but the craft still left, and the stretch is what says so. At zero
 * the release of a swing that never armed would be indistinguishable from no
 * release at all.
 *
 * It is an opening position and it is on the bench. Set it to 1 and quality
 * stops reaching the stretch entirely, which is exactly what spec 02 §4 said
 * before ADR-0012, so the slider spans the whole argument.
 */
export const PUNCH_FLOOR = 0.45;

/**
 * How long the punch takes to come home — spec 02 §4's and §5's **180ms**, which
 * they shared even when they were on two elements.
 *
 * Eleven ticks. It stays the span of the stretch's recovery, so the withdrawal
 * of the camera's share changed which element carries the punch and not how long
 * a punch lasts.
 */
export const PUNCH_TICKS = ticksIn(180);

/**
 * How much longer a punch at full quality carries than a scraped one, as a
 * fraction of [`PUNCH_TICKS`](#).
 *
 * ADR-0012's *"half again as long"*, and the whole of quality's second channel.
 */
export const PUNCH_STRETCH = 0.5;

/** Quality, clamped to the range it is defined on. */
function graded(quality: number): number {
  return Math.min(Math.max(quality, 0), 1);
}

/**
 * How much of the full stretch a release of this quality earns, from
 * [`PUNCH_FLOOR`](#) to 1.
 */
export function punchSize(quality: number): number {
  return PUNCH_FLOOR + (1 - PUNCH_FLOOR) * Math.sqrt(graded(quality));
}

/** And how long it takes coming home, in ticks. */
export function punchSpan(quality: number): number {
  return Math.round(PUNCH_TICKS * (1 + PUNCH_STRETCH * graded(quality)));
}
