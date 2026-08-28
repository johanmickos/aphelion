/**
 * Simulation in, presentation state out. Once per tick, no memory of its own.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 *
 * It is also where the simulation's numbers become the renderer's: heading and
 * speed instead of a velocity, a `held` flag instead of an index. The renderer
 * never asks the simulation a question — everything it draws is already an
 * answer, which is what makes a frame a pure function of `(recipe, tick)`.
 */
import { headingOf, speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import { DESIGN_WIDTH } from './design.ts';
import type { PresentationState } from './types.ts';

/**
 * Where the world is watched from. **Unspecified, and decided here** — spec 05
 * says nothing about scrolling, spec 00 §5 rules only that the camera is never
 * rotated, shaken or randomised, and spec 02's kick and spec 12's held finish
 * are both later milestones'. [M3.1](../../docs/plan/m3-the-field.md) is where
 * the camera and the design space are built properly; M1.6 needed one on its
 * first frame, so this is the smallest camera that can be flown, and the plan
 * records where the line was drawn.
 *
 * **It does not move sideways.** The field is a corridor whose bodies fit inside
 * the design space's width, so the whole corridor is on screen at all times and
 * there is nothing to pan toward. That is not a small saving: the prototype's
 * playfield is wider than its window, and the four mechanisms it needs as a
 * consequence — a horizontal deadzone, a velocity look-ahead, a clamp to the
 * field, and a backstop for the frames the ease has not caught up on — all exist
 * to answer a question this field does not ask. **The decision expires when the
 * field outgrows the design space**, which is M3's corridor (spec 17 §4) and
 * M1.4's boundary.
 *
 * **It is centred on the craft vertically, and it does not lag.** Centred is the
 * framing the prototype's feel was tuned at (ADR-0013 — carry the behaviour),
 * and the design space is taller than the prototype's own view, so this already
 * looks further ahead than the swing was measured looking. It cannot sit lower
 * than centre: spec 00 §7's thumb line is at 2/3 of the height and the craft is
 * the most readable thing on the screen, so putting it there would park it under
 * the player's own thumb.
 *
 * The lag is refused rather than omitted. A camera that eases toward a target
 * needs to remember where it was, and presentation state deliberately has no
 * memory between ticks — deriving the same simulation twice must give the same
 * answer, which is what makes a frame a pure function of `(recipe, tick)` and is
 * `test/state/derive.test.ts`'s boundary criterion. The prototype's evidence
 * says the lag is also what costs: following a craft round a *settled* orbit
 * through a 0.33s ease put a vertical oscillation over half the orbit's own
 * period into the view — too slow to track, and it could only smear — and the
 * answer it needed was a second mechanism, easing the camera's subject from the
 * craft onto the body it is orbiting. Rigid, none of that arises; what is left
 * is the world sliding with the orbit, which is **the thing to watch for at the
 * gate**. If it reads badly, the prototype's anchor is the recorded answer, and
 * it belongs with spec 02 §5's release kick in M2, where presentation state has
 * to carry a decaying transient anyway.
 */
function cameraFor(sim: SimState): PresentationState['camera'] {
  // The corridor's centreline, which the fixture field puts at the middle of the
  // design space. A field with a centreline of its own — M3's, which narrows
  // with altitude — states it in the field rather than here.
  return { x: DESIGN_WIDTH / 2, y: sim.craft.y };
}

export function derive(sim: SimState): PresentationState {
  return {
    tick: sim.tick,
    camera: cameraFor(sim),
    craft: {
      x: sim.craft.x,
      y: sim.craft.y,
      heading: headingOf(sim.craft),
      speed: speedOf(sim.craft),
    },
    bodies: sim.field.bodies.map((body, index) => ({
      x: body.x,
      y: body.y,
      radius: body.radius,
      held: index === sim.heldBody,
    })),
  };
}
