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
import { angleOf } from '../../src/sim/trig.ts';
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
   * And the hull is turned away rather than let sink in. `R + 5` is the craft's
   * own half-width, so a graze is the hull *on* the surface; spec 01 §10 says
   * that is not lethal and stops there, and something still has to happen or the
   * craft settles into the disc it is touching. The lethality test will not
   * catch it later either — a straight line only ever gets *less* head-on as it
   * goes deeper, so a contact that arrived as a graze stays one. The prototype
   * skips it off, and that is what is carried (ADR-0013).
   */
  it('skips a grazing hull off the surface instead of letting it sink in', () => {
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
   * **The two thresholds never disagree, and that is arithmetic rather than
   * luck.** Any straight line that would put the craft's *centre* inside the
   * body arrives at more than 0.18 and is lethal, so no graze is ever a line
   * that was going to hit the planet — it is always the hull brushing past. That
   * holds for every body under 301 prototype units of radius, against a field
   * whose largest is 56, and it is why the graze exemption cannot be used to fly
   * through anything.
   */
  it('never spares a line that was going to strike the body itself', () => {
    // The largest impact parameter that is still lethal, from spec 01 §10's own
    // ratio: `√(1 − 0.18²)` of the contact radius.
    const largestLethal = SURFACE * Math.sqrt(1 - GRAZE_RATIO * GRAZE_RATIO);
    expect(largestLethal).toBeGreaterThan(BODY.radius);

    // And flown, either side of the body's own surface.
    expect(flyUntilEnded(approach(900 * SCALE, BODY.radius)).ending).toBe('IMPACT');
    expect(flyUntilEnded(approach(900 * SCALE, BODY.radius * 0.999)).ending).toBe('IMPACT');
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
  /**
   * And what the skip costs, which spec 01 §10 does not state either.
   *
   * The deflection is the only visible consequence of a decision the spec left
   * open, so it is held rather than left to be rediscovered: **up to 17° at the
   * lethal threshold, falling to nothing as the pass becomes exactly
   * tangential.** Whether that reads as a skip or as a snag is the gate's, and a
   * number it can move is better than a surprise it cannot see.
   */
  it('costs a graze up to 17 degrees, and an exactly tangential pass nothing', () => {
    const turnedBy = (across: number): number => {
      const state = approach(900 * SCALE, across);
      let before = 0;
      for (let i = 0; i < 2000 && state.ending === null; i++) {
        if (state.craft.x < -300) before = angleOf(state.craft.vx, state.craft.vy);
        stepSim(state, NO_INPUT);
        if (state.craft.x > 400) break;
      }
      expect(state.ending).toBe(null);
      return (Math.abs(angleOf(state.craft.vx, state.craft.vy) - before) * 180) / Math.PI;
    };

    // Just inside the exemption, and exactly tangential.
    expect(turnedBy(SURFACE * 0.985)).toBeGreaterThan(10);
    expect(turnedBy(SURFACE * 0.985)).toBeLessThan(20);
    expect(turnedBy(SURFACE)).toBeCloseTo(0, 6);
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
