/**
 * The craft's stretch — what a release does to its shape, and how it comes back.
 *
 * Spec [02 · §4](../../docs/spec/02-release.md): the craft leaves along its nose
 * scaled **1.5 along the velocity vector and 0.7 across it**, and recovers with
 * one overshoot. *"Stretch is always along the velocity vector. Never along a
 * screen axis, never around a centre"* — which is spec 00 §5's second motion
 * rule, that nothing in this game radiates from a point.
 *
 * ## Where the clock starts, after ADR-0012
 *
 * Spec 02's table dates the stretch from `T+70ms`, which was the end of a
 * hitstop that no longer exists:
 * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
 * withdrew it and the file's own notice says how it rebases — *"every `T+70ms`
 * in §2 and §3 becomes `T0`"*, and *"every duration measured from the start of
 * its own element is untouched"*. So the stretch starts on the release tick and
 * runs **180ms**, which is `T+70 → T+250` measured from its own start. The
 * amplitudes were never the freeze's and do not move. Rewriting the spec around
 * that is [M2.4](../../docs/plan/m2-the-instrument.md)'s; what is here is the
 * value, already dated the way the notice says to date it.
 *
 * ## Two axes, one rebound
 *
 * The board's keyframes overshoot by different amounts on the two axes — 0.95
 * along against a 0.5 displacement is a tenth of it, and 1.06 across against a
 * 0.3 displacement is a fifth. One motion with two rebound shapes is two
 * grammars, and spec 00 §5's tokens are emphatically one, so both axes use
 * [`home`](./decay.ts) at the tenth the along axis states. Two costs, both
 * stated rather than hidden: **the across axis rebounds to 1.03 where the board
 * draws 1.06**, on the axis the eye reads least during a motion that is by
 * definition along the other one; and **the rebound is deepest 58% of the way
 * back where the board puts it at 83%**, because four hand-set keyframes are not
 * a curve and the depth is the number worth matching. Both are knobs on the
 * bench, and M2.4 flies them.
 */
import type { Decay } from './decay.ts';
import { advance, home, place, ticksIn } from './decay.ts';
import type { DeformationView } from './types.ts';

/** How far the craft stretches along its velocity at a release — spec 02 §4. */
export const STRETCH_ALONG = 1.5;

/** And how far it narrows across it, the same instant — spec 02 §4. */
export const STRETCH_ACROSS = 0.7;

/**
 * How long the recovery takes — spec 02 §4's `T+70 → T+250`, measured from its
 * own start and therefore untouched by ADR-0012's rebase.
 *
 * Eleven ticks. Spec 00 §5's motion law wants **decay ≥ 10 × attack** and the
 * attack here is one tick: the stretch is *placed* rather than eased into, which
 * is the same rule [`place`](./decay.ts) is named for.
 */
export const DEFORM_TICKS = ticksIn(180);

/** A craft that is not recovering from anything. */
export const UNDEFORMED: DeformationView = { along: 1, across: 1, recovery: null };

/** The craft's shape on the tick it lets go. */
export function stretch(): DeformationView {
  return shapeOf(place(DEFORM_TICKS));
}

/** The craft's shape one tick on, from what it was. */
export function relax(previous: DeformationView): DeformationView {
  const recovery = advance(previous.recovery);
  return recovery === null ? UNDEFORMED : shapeOf(recovery);
}

function shapeOf(recovery: Decay): DeformationView {
  const left = home(recovery);
  return {
    along: 1 + (STRETCH_ALONG - 1) * left,
    across: 1 + (STRETCH_ACROSS - 1) * left,
    recovery,
  };
}
