/**
 * Where the world is watched from.
 *
 * The camera is unspecified — spec 05 says nothing about scrolling, spec 00 §5
 * rules only that it never rotates, shakes or randomises, and spec 02's kick and
 * spec 12's held finish are both later milestones'. [M1.6](../../docs/plan/m1-the-swing.md)
 * needed one on its first frame and decided it deliberately; these are the
 * assertions that decision is worth making in presentation state rather than in
 * the renderer, because *"a camera that lives in the renderer is a camera no test
 * can see"* and spec [02 · §5](../../docs/spec/02-release.md) will want to assert
 * its offset in M2.
 */
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { derive } from '../../src/state/derive.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from '../../src/state/design.ts';

const PRESS = { pressed: true };
const LET_GO = { pressed: false };

function world(): SimState {
  return createInitialState(fixtureField(), fixtureCraft(), 1);
}

/**
 * A whole swing through the fixture field's opening: coast in, press, dive,
 * freeze, settle, orbit, let go, coast out. Every tick's view is kept, because
 * the camera's failure mode is not a wrong frame but a wrong *sequence* of them.
 */
function swing(): ReturnType<typeof derive>[] {
  const state = world();
  const views = [derive(state)];
  for (let tick = 0; tick < 360; tick++) {
    stepSim(state, tick >= 30 && tick < 260 ? PRESS : LET_GO);
    views.push(derive(state));
  }
  return views;
}

describe('the camera', () => {
  it('holds the craft at the centre of the design space, on every tick', () => {
    for (const view of swing()) {
      expect(view.camera.y).toBe(view.craft.y);
    }
  });

  /**
   * Spec [00 · §7](../../docs/spec/00-tokens.md): the thumb line sits at 2/3 of
   * the height and nothing readable may live below it. The craft is the most
   * readable thing on the screen, so this is the constraint that decides how low
   * the camera may put it — and it is the reason the craft is centred rather than
   * further down, where the look-ahead would be longer.
   */
  it('never puts the craft under the thumb line', () => {
    for (const view of swing()) {
      const onScreen = DESIGN_HEIGHT / 2 + (view.craft.y - view.camera.y);
      expect(onScreen).toBeLessThan(THUMB_LINE);
    }
  });

  /**
   * It does not pan. The field is no wider than the design space, so the whole
   * corridor is on screen at all times and there is nothing to pan toward — and
   * the four mechanisms the prototype needs because its playfield *is* wider (a
   * deadzone, a look-ahead, a clamp and a backstop) all answer a question this
   * field does not ask. **The decision expires when the field outgrows the design
   * space**, which is M3's corridor and M1.4's boundary.
   */
  it('does not move sideways, whatever the craft does', () => {
    const views = swing();
    const travelled = Math.max(...views.map((v) => Math.abs(v.craft.x - views[0]!.craft.x)));
    expect(travelled).toBeGreaterThan(100);
    for (const view of views) expect(view.camera.x).toBe(DESIGN_WIDTH / 2);
  });

  /**
   * And it has no memory. A camera that eased toward a target would have to
   * remember where it was, and presentation state is derived per tick and is as
   * pure as the simulation is (ADR-0006) — which is what makes a frame a pure
   * function of `(recipe, tick)`. Asserted here as well as in `derive.test.ts`
   * because the camera is the field most likely to want a filter.
   */
  it('is the same wherever the simulation arrived from', () => {
    const state = world();
    for (let tick = 0; tick < 120; tick++) stepSim(state, PRESS);
    const reached = derive(state).camera;

    const again = world();
    for (let tick = 0; tick < 60; tick++) stepSim(again, PRESS);
    const midway = derive(again).camera;
    for (let tick = 0; tick < 60; tick++) stepSim(again, PRESS);

    expect(derive(again).camera).toEqual(reached);
    expect(midway).not.toEqual(reached);
  });
});
