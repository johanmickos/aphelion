/**
 * The farewell ring — the orbit detaching from the body and expanding away.
 *
 * Spec [02 · §6](../../docs/spec/02-release.md): *"the farewell ring is the orbit
 * itself, detaching and expanding away from the body, in AURORA — the only
 * AURORA the baseline field ever wears."* `CONTEXT.md` carries it in one line and
 * this is that line, built.
 *
 * ## Why it is the compass's own path and not a circle
 *
 * The compass hands the renderer the orbit **sampled** rather than
 * parameterised, because the settle rounds it every tick and *"handing it a
 * periapsis, an eccentricity and an argument would be handing it a formula to get
 * wrong"* ([`compass.ts`](./compass.ts)). The ring that leaves is that shape,
 * taken at the shape it had on the tick the craft let go — so what expands away
 * is the ellipse actually ridden, and a shallow swing's ring leaves oval while a
 * settled one's leaves round. A circle standing in for it would have thrown away
 * the one thing the ring is a record of.
 *
 * It is **placed**, not eased into: the path is copied on the release tick and
 * never re-read, because the compass it came from is already on its way out and
 * the body it is about to be nothing to.
 *
 * ## It is a stroke, and that is a performance decision with a number under it
 *
 * A large expanding **filled** ring is the one element in this milestone that
 * could move the renderer's overdraw off its measured **1.53 screens**
 * ([performance](../../docs/plan/performance.md) §6) — it is the shape whose area
 * grows as the square of the thing being animated. The design asks for an orbit
 * detaching, which is a line, so there is nothing to give up: it is stroked, it
 * costs one path, and the census stays where it was.
 */
import { advance, fade, place, progress, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import type { CompassView, FarewellView } from './types.ts';

/**
 * How long it takes to go — spec 02 §2's `T0 → T+400ms`, which after the rebase
 * is measured from the release itself.
 *
 * The same 400ms the E3 decays over (spec 00 §3), because they are the same beat
 * seen on two elements: the flash marks the place and this marks the orbit, and a
 * ring still expanding after the light that lit it had gone would be two clocks
 * where the design has one.
 */
export const FAREWELL_TICKS = ticksIn(400);

/**
 * How far out it reaches by the end, as a multiple of the orbit it was.
 *
 * **An opening position.** Spec 02 §6 says *"expands away from the body"* and
 * fixes no distance, and the only honest bound is the one the eye gives: far
 * enough to read as leaving, near enough that it is still recognisably the orbit
 * that was flown. It is on the bench, which is where a number with nothing behind
 * it belongs.
 */
export const FAREWELL_SPREAD = 1.6;

/**
 * The ring the compass leaves behind, or `null` when there was no orbit to leave.
 *
 * A release during the **dive** has no frozen orbit and therefore no ring: there
 * was never a path detached from the body, only one the craft was still falling
 * along, and expanding a prediction away would be a farewell to something that
 * never happened.
 */
export function detach(compass: CompassView | null): FarewellView | null {
  if (compass === null || compass.path.length === 0 || compass.predicted) return null;
  return shapeOf(compass.x, compass.y, compass.path, place(FAREWELL_TICKS));
}

/** The same ring one tick on, or `null` once it is gone. */
export function expand(previous: FarewellView | null): FarewellView | null {
  if (previous === null) return null;
  const decay = advance(previous.decay);
  if (decay === null) return null;
  return shapeOf(previous.x, previous.y, previous.path, decay);
}

function shapeOf(x: number, y: number, path: readonly number[], decay: Decay): FarewellView {
  return {
    x,
    y,
    path,
    // Linear in its own clock while the light falls on [`fade`](./decay.ts), so
    // it is still moving at the instant it disappears rather than creeping to a
    // stop — the opposite of the fault M2.3 measured on the compass's exit, and
    // the right way round for something that is leaving rather than landing.
    spread: 1 + (FAREWELL_SPREAD - 1) * progress(decay),
    decay,
  };
}

/** How much of it is left to see, from 1 toward 0. */
export function farewellStrength(farewell: FarewellView): number {
  return fade(farewell.decay);
}
