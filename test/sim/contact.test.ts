/**
 * Spec [01 · §10](../../docs/spec/01-swing.md)'s contact rules, and the
 * asymmetry that is the whole of them.
 *
 * *"The same geometry is lethal coasting and safe held, and that asymmetry is
 * the rule, not an oversight: a grab is a promise that you will not be killed by
 * the thing you grabbed."*
 *
 * Every approach below runs along `+x` with the body at the origin, so the
 * geometry is stated in the one quantity the graze rule is written on — **the
 * impact parameter**, how far the undisturbed line passes from the centre. For a
 * straight line meeting a circle of radius `s` at impact parameter `b`, the
 * fraction of the craft's speed pointed at the body on arrival is exactly
 * `√(1 − (b/s)²)`, so sweeping `b` sweeps the predicate and the threshold can be
 * found from outside rather than read out of a constant.
 *
 * Flying sideways also keeps every test clear of the other three endings, which
 * are `run.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { createBody, floorRadius } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import type { SimState } from '../../src/sim/types.ts';
import { BOUNCE_GAP, GRAZE_RATIO, IMPACT_GAP, MEDIAN_RADIUS, SCALE } from '../../src/sim/units.ts';
import { holdWithoutGrabbing, openField } from './fixtures.ts';
import { BODY, PRESS } from './swing.ts';

const HELD = PRESS;
/** Where contact with `BODY` begins for a coasting craft — spec 01 §10's `R + 5`. */
const SURFACE = BODY.radius + IMPACT_GAP;

/**
 * A craft `out` to the left of `BODY`, flying at it with impact parameter
 * `across`.
 *
 * Slow on purpose. A tick is a jump, and the fraction of speed pointed at a body
 * falls as a straight line goes deeper into it, so a coarse step reads a grazing
 * approach as more parallel than it arrived — at 60 units/s a tick is three
 * design units against a surface of a hundred and fifty, and the threshold below
 * lands where the geometry says it should.
 */
function approach(out: number, across: number, speed = 60 * SCALE): SimState {
  return createInitialState(openField([BODY]), createCraft(-out, across, speed, 0), 1);
}

/** Fly until something ends the run, or give up. */
function flyUntilEnded(state: SimState, input = NO_INPUT, ticks = 2000): SimState {
  for (let i = 0; i < ticks && state.ending === null; i++) stepSim(state, input);
  return state;
}

describe('contact while coasting', () => {
  it('ends the run on a head-on approach, and says it was an impact', () => {
    expect(flyUntilEnded(approach(900 * SCALE, 0)).ending).toBe('IMPACT');
  });

  it('leaves the craft on the surface it hit, stopped', () => {
    const state = flyUntilEnded(approach(900 * SCALE, 0));
    expect(distance(state.craft.x, state.craft.y, BODY.x, BODY.y)).toBeCloseTo(SURFACE, 6);
    expect(state.craft.vx).toBe(0);
    expect(state.craft.vy).toBe(0);
  });

  /**
   * The other half, and the reason a bare distance test will not do: *"flinging
   * tangentially past a body you have just left is legitimate flying"*. This is
   * that manoeuvre — a craft leaving the body's own floor along the tangent,
   * which is exactly where a release puts it.
   */
  it('lets a tangential departure past the surface live', () => {
    const radius = floorRadius(BODY);
    const state = flyUntilEnded(
      createInitialState(openField([BODY]), createCraft(0, -radius, 400 * SCALE, 0), 1),
    );
    expect(state.ending).toBe(null);
  });

  /**
   * And it is turned away rather than let through. Spec 01 §10 says what a graze
   * is *not* and stops there; something still has to happen, because a straight
   * line inside the disc only ever gets less head-on as it goes, so a craft left
   * alone would come out of the far side having flown through a planet. The
   * prototype bounces it, and that is what is carried (ADR-0013).
   */
  it('turns a graze away instead of letting it through the body', () => {
    const state = approach(900 * SCALE, SURFACE * 0.995);
    let deepest = Infinity;
    for (let i = 0; i < 2000 && state.ending === null; i++) {
      stepSim(state, NO_INPUT);
      deepest = Math.min(deepest, distance(state.craft.x, state.craft.y, BODY.x, BODY.y));
    }
    expect(state.ending).toBe(null);
    expect(deepest).toBeGreaterThanOrEqual(SURFACE - 1e-9);
  });

  /**
   * The threshold itself, found from outside. The impact parameter is swept
   * until the run stops ending, and the closing fraction that switch corresponds
   * to is computed from the geometry rather than read from the simulation. Spec
   * 01 §10 fixes it at **0.18**, which is a ratio and therefore the one number
   * in this step that does not scale.
   */
  it('kills exactly above 0.18 of the craft-speed pointed at the body', () => {
    const closingAt = (across: number): number =>
      Math.sqrt(Math.max(0, 1 - (across / SURFACE) * (across / SURFACE)));

    let lethalUpTo = 0;
    let survivesFrom = 1;
    for (let f = 0.9; f <= 1.0; f += 0.002) {
      const ending = flyUntilEnded(approach(900 * SCALE, SURFACE * f)).ending;
      if (ending === 'IMPACT') lethalUpTo = Math.max(lethalUpTo, f);
      else survivesFrom = Math.min(survivesFrom, f);
    }

    // The switch is a band because the impact parameter is sampled, not solved.
    // Both edges of it have to sit on 0.18.
    expect(closingAt(SURFACE * lethalUpTo)).toBeGreaterThan(GRAZE_RATIO - 0.02);
    expect(closingAt(SURFACE * lethalUpTo)).toBeLessThan(GRAZE_RATIO + 0.02);
    expect(closingAt(SURFACE * survivesFrom)).toBeLessThan(GRAZE_RATIO + 0.02);
    expect(survivesFrom).toBeLessThan(lethalUpTo + 0.01);
  });
});

describe('contact while a body is held', () => {
  /**
   * **The asymmetry, in one test.** The identical approach — same place, same
   * speed, same heading — flown coasting and flown pressed. One is the end of
   * the run and the other is a swing, and nothing about the geometry
   * distinguishes them.
   */
  it('never kills, on the same approach that kills a coasting craft', () => {
    const coasting = flyUntilEnded(approach(400 * SCALE, 0));
    const grabbed = flyUntilEnded(approach(400 * SCALE, 0), HELD, 600);
    expect(coasting.ending).toBe('IMPACT');
    expect(grabbed.ending).toBe(null);
    expect(grabbed.heldBody).toBe(0);
  });

  /**
   * And the held body's own floor is untouched by any of it — the one guarantee
   * a grab makes, which lives in `dive.ts` and is the same operation at zero
   * restitution.
   */
  it('never breaches the floor of the body it is holding', () => {
    const state = approach(400 * SCALE, 0, 300 * SCALE);
    const floor = floorRadius(BODY);
    for (let i = 0; i < 600 && state.ending === null; i++) {
      stepSim(state, HELD);
      expect(distance(state.craft.x, state.craft.y, BODY.x, BODY.y)).toBeGreaterThanOrEqual(
        floor - 1e-9,
      );
    }
    expect(state.heldBody).toBe(0);
    expect(state.ending).toBe(null);
  });

  /**
   * Spec 01 §10's second row: against a body the craft is **not** holding, at
   * `R + 6`, and still never lethal.
   *
   * Held by fixture rather than by a press, because a press would take the
   * intruder — it is nearer the lead point than the body this test is about, and
   * spec 01 §3 makes that the whole of which body a grab chooses.
   */
  it('bounces off a body it is not holding, and lives', () => {
    const intruder = createBody(-500 * SCALE, 0, MEDIAN_RADIUS * 0.6);
    const state = createInitialState(
      openField([BODY, intruder]),
      createCraft(-900 * SCALE, 0, 300 * SCALE, 0),
      1,
    );
    holdWithoutGrabbing(state);

    let deepest = Infinity;
    for (let i = 0; i < 600 && state.ending === null; i++) {
      stepSim(state, HELD);
      deepest = Math.min(
        deepest,
        distance(state.craft.x, state.craft.y, intruder.x, intruder.y) - intruder.radius,
      );
    }

    expect(state.heldBody).toBe(0);
    expect(state.ending).toBe(null);
    // It really met it — otherwise this test would pass by missing.
    expect(deepest).toBeLessThan(BOUNCE_GAP * 2);
    expect(deepest).toBeGreaterThanOrEqual(BOUNCE_GAP - 1e-9);
  });
});
