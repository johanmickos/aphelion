/**
 * The release: letting go, along the exit tangent.
 *
 * `CONTEXT.md` — *"payday: the moment a swing is graded and priced."* Spec
 * [01 · §8](../../docs/spec/01-swing.md) fixes two things about it and nothing
 * else needs fixing.
 *
 * **The direction is exactly the tangent**, and here that costs no code at all:
 * the craft's velocity has been exactly tangential every tick since the freeze
 * ([`orbit.ts`](./orbit.ts)), because the nose points along the exit tangent for
 * the whole of an orbit. A release only changes how fast.
 *
 * **The exit speed is the orbital speed at the release radius plus the boost's
 * permanent share.** The other 78% is the punch, and it is spent rather than
 * kept (ADR-0012) — it never reaches the craft's velocity, so a coasting craft
 * still travels *"an exact straight line at exactly constant speed"* (spec 01
 * §9) from the first tick after a release, and what a run is worth is untouched
 * by how good it felt. **A release that put all of its boost into permanent
 * velocity would compound up the field forever**; 22% is what keeps the
 * escalation bounded, and spec 01 §5a's flat median speed across eight altitude
 * bands is the evidence it works.
 *
 * **A release during the dive changes nothing about the craft.** It has no
 * frozen orbit to be paid on, and turning it onto a tangent would hand the
 * player a way to steer — a second verb, which `VISION.md`'s first pillar calls
 * a repeal rather than a feature. What it still has is
 * [`quality.ts`](./quality.ts)'s reading of how hard the body was bending it,
 * which is what the punch is scaled by.
 */
import { boostOf } from './boost.ts';
import { speedOf } from './craft.ts';
import type { SimState } from './types.ts';
import { PERMANENT_SHARE } from './units.ts';

/**
 * Let go.
 *
 * Safe to call while coasting, where it does nothing: the verb is one button and
 * the simulation reads its state, not its edges.
 */
export function release(state: SimState): void {
  const orbit = state.orbit;
  if (orbit) {
    const speed = speedOf(state.craft);
    if (speed > 0) {
      const scale = (speed + PERMANENT_SHARE * boostOf(orbit)) / speed;
      state.craft.vx *= scale;
      state.craft.vy *= scale;
    }
  }

  state.heldBody = null;
  state.dive = null;
  state.orbit = null;
}
