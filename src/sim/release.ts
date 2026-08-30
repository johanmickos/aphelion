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
 * permanent share.** **A release that put all of its boost into permanent
 * velocity would compound up the field forever**; 22% is what keeps the
 * escalation bounded, and spec 01 §5a's flat median speed across eight altitude
 * bands is the evidence it works.
 *
 * **The other 78% is the punch, and it is spent rather than kept** (ADR-0012).
 * It never reaches `vx`/`vy` — it rides beside them as a decaying burst and is
 * gone within a second or so, so nothing about it compounds and what a run is
 * worth is untouched by how good it felt. Spec 01 §9's *"exact straight line"*
 * survives it exactly, because the burst runs **along the exit tangent** and
 * scales a velocity rather than adding to one: the heading is untouched, the ray
 * is the same ray, and spec 01 §11's closed-form compass is solved on it
 * unchanged. What §9 gives up is *"exactly constant speed"*, and it says so.
 *
 * **A release during the dive changes nothing about the craft** — which was a
 * claim rather than a fact until 2026-08-30. It has no frozen orbit to be paid
 * on, and turning it onto a tangent would hand the player a way to steer — a
 * second verb, which `VISION.md`'s first pillar calls a repeal rather than a
 * feature. What it still has is [`quality.ts`](./quality.ts)'s reading of how
 * hard the body was bending it, which is what the punch is scaled by.
 *
 * ## It changed everything about the craft's speed, and now it gives it back
 *
 * Nothing here paid a dive release, and it did not need paying: a dive is real
 * gravity, falling accelerates the craft, and gravity stops acting the instant
 * the button comes up (spec 01 §2), so the way in was free and the way out was
 * never charged. Measured over the author's own 129 swings, **a release taken
 * during the dive handed the craft a median +548 design units/s and gained 81%
 * of the time** — 7.7× what a fully flown swing paid, and the best-paid move in
 * the game. [`DIVE_PAYBACK`](./units.ts) carries the whole measurement and the
 * ruling.
 *
 * So an unfinished swing now returns the craft to the speed the press found it
 * at. **The turn is kept and the speed is not**: what a tap buys is a different
 * heading at the same pace, which is spec 01 §8's own description of what a
 * release is and is the half of it worth having.
 */
import { boostOf } from './boost.ts';
import { speedOf } from './craft.ts';
import type { SimState } from './types.ts';
import { qualityOf } from './quality.ts';
import {
  DIVE_PAYBACK,
  PERMANENT_SHARE,
  TRANSIENT_SECONDS,
  TRANSIENT_SHARE,
  TRANSIENT_STRETCH,
} from './units.ts';

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

  // **An unfinished swing gives back what falling gave it** — see
  // [`DIVE_PAYBACK`](./units.ts) for the measurement that made this a ruling.
  // Scaling the velocity rather than rebuilding it is what keeps the turn: the
  // heading a dive bent the craft onto is exactly the heading it leaves on, and
  // only the pace returns to what the press found. A dial rather than a flag so
  // the author can fly the range, and at zero this is the behaviour it replaced.
  const dive = state.dive;
  if (dive !== null) {
    const speed = speedOf(state.craft);
    if (speed > 0) {
      const scale = (speed + DIVE_PAYBACK * (dive.entrySpeed - speed)) / speed;
      state.craft.vx *= scale;
      state.craft.vy *= scale;
    }
  }

  // **And the other 78%, which is the punch** — spent rather than kept, and
  // carried beside the velocity rather than in it (`craft.ts`). It is scaled by
  // the quality of the swing on the same two curves the craft's stretch is:
  // a square root on the size, half again on the span. A release that never froze
  // an orbit gets the bend instead, and a tap gets nothing without anything
  // having to check.
  const quality = qualityOf(state);
  const strength = Math.sqrt(Math.min(Math.max(quality, 0), 1));
  state.craft.burst = TRANSIENT_SHARE * strength;
  state.craft.burstSpan = TRANSIENT_SECONDS * (1 + TRANSIENT_STRETCH * strength);
  state.craft.burstLeft = state.craft.burstSpan;

  state.heldBody = null;
  state.dive = null;
  state.orbit = null;
}
