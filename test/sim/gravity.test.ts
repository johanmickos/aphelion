/**
 * Spec [01 · §2](../../docs/spec/01-swing.md), which contains three things a
 * physics engine gets wrong by default. Each one is a test.
 *
 * Everything here is measured from the outside: the acceleration is read as the
 * velocity a craft gained over a tick, never as a number a module was asked for.
 */
import { describe, expect, it } from 'vitest';
import { createBody, floorRadius, massForRadius } from '../../src/sim/body.ts';
import { createCraft, speedOf } from '../../src/sim/craft.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS, SECONDS_PER_TICK, SOFTENING } from '../../src/sim/units.ts';
import { HELD, MEDIAN_BODY, holdWithoutGrabbing } from './fixtures.ts';

/** Spec 01 §3's grab range of 560 prototype units, in design units. */
const GRAB_RANGE = 560 * 3;

/** The acceleration a craft at rest at distance `r` actually receives, per second². */
function measuredAccelerationAt(r: number): number {
  const state = createInitialState({ bodies: [MEDIAN_BODY] }, createCraft(-r, 0, 0, 0), 1);
  holdWithoutGrabbing(state);
  stepSim(state, HELD);
  return speedOf(state.craft) / SECONDS_PER_TICK;
}

describe('the force law', () => {
  const expected = (r: number): number => MEDIAN_BODY.mass / (r * r + SOFTENING * SOFTENING);

  it('is μ / (r² + ε²) within 2%, from the floor to the grab range', () => {
    // From just above the floor, because *at* the floor a craft released from
    // rest cannot fall: the floor holds it, which is the next test. One design
    // unit is well clear of the 0.7 a tick of falling covers at this depth.
    const floor = floorRadius(MEDIAN_BODY) + 1;
    for (let r = floor; r <= GRAB_RANGE; r += 20) {
      const ratio = measuredAccelerationAt(r) / expected(r);
      expect(ratio, `at r = ${r}`).toBeGreaterThan(0.98);
      expect(ratio, `at r = ${r}`).toBeLessThan(1.02);
    }
  });

  /**
   * And at the floor itself the craft does not fall at all. Spec
   * [01 · §6a](../../docs/spec/01-swing.md): *"the floor is a floor, not a
   * suggestion"*, and `CONTEXT.md` calls it *"a hard limit that is never
   * crossed, and the one guarantee a grab makes."*
   */
  it('cannot pull a held craft through the floor', () => {
    const floor = floorRadius(MEDIAN_BODY);
    const state = createInitialState({ bodies: [MEDIAN_BODY] }, createCraft(-floor, 0, 0, 0), 1);
    holdWithoutGrabbing(state);
    for (let tick = 0; tick < 120; tick++) stepSim(state, HELD);
    expect(distance(0, 0, state.craft.x, state.craft.y)).toBeGreaterThanOrEqual(floor - 1e-9);
  });

  /**
   * The softening is measured behaviour, not a numerical guard. Spec 01 §2
   * states the departure from inverse-square at three radii, in prototype units;
   * they are ×3 here, and the percentages transfer untouched.
   */
  it('departs from inverse-square by the measured amounts', () => {
    const inverseSquare = (r: number): number => MEDIAN_BODY.mass / (r * r);
    const weakerAt = (r: number): number => 100 * (1 - expected(r) / inverseSquare(r));

    expect(weakerAt(floorRadius(MEDIAN_BODY))).toBeCloseTo(9.4, 0);
    expect(weakerAt(100 * 3)).toBeCloseTo(3.1, 0);
    expect(weakerAt(200 * 3)).toBeCloseTo(0.8, 1);
  });
});

describe('gravity is not ambient', () => {
  it('gives a coasting craft no measurable acceleration, at any distance', () => {
    for (const r of [floorRadius(MEDIAN_BODY), 200, 500, 1000, GRAB_RANGE, 10_000]) {
      const state = createInitialState({ bodies: [MEDIAN_BODY] }, createCraft(-r, 0, 0, 0), 1);
      // heldBody stays null: this craft is coasting.
      stepSim(state, NO_INPUT);
      expect(speedOf(state.craft), `at r = ${r}`).toBe(0);
    }
  });

  /**
   * The one that a rewrite loses by being tidy. An n-body accumulator would pass
   * every other test in this file and fail this one, and spec 01 §11 says the
   * compass depends on it: the straight lines between swings are what make
   * *"where do I let go to reach that body"* a solved reading.
   */
  it('gives a held craft nothing from any body but the one holding it', () => {
    const crowd = {
      bodies: [
        MEDIAN_BODY,
        createBody(0, 400, MEDIAN_RADIUS),
        createBody(300, -250, MEDIAN_RADIUS),
        createBody(-900, 0, MEDIAN_RADIUS * 1.2),
      ],
    };

    const alone = createInitialState({ bodies: [MEDIAN_BODY] }, createCraft(-900, 600, 360, 0), 1);
    const crowded = createInitialState(crowd, createCraft(-900, 600, 360, 0), 1);
    holdWithoutGrabbing(alone);
    holdWithoutGrabbing(crowded);

    for (let i = 0; i < 240; i++) {
      stepSim(alone, HELD);
      stepSim(crowded, HELD);
    }

    // Bit-identical, not close: the other three bodies contribute exactly
    // nothing, so there is nothing for them to contribute a little of.
    expect(crowded.craft.x).toBe(alone.craft.x);
    expect(crowded.craft.y).toBe(alone.craft.y);
    expect(crowded.craft.vx).toBe(alone.craft.vx);
    expect(crowded.craft.vy).toBe(alone.craft.vy);
  });
});

describe('mass follows radius', () => {
  it('leaves the median body untouched at every exponent', () => {
    for (const n of [0, 1, 2, 2.5, 3]) {
      expect(massForRadius(MEDIAN_RADIUS, n)).toBe(MEDIAN_BODY.mass);
    }
  });

  /**
   * Spec 01 §13.2: `n = 0` **is the prototype exactly** — one μ for every body,
   * with radius entering only the floor and the collision surface. That is what
   * makes the exponent free to be deferred to the M1 gate.
   */
  it('is constant across the field at n = 0, which is the prototype', () => {
    for (const radius of [32 * 3, 44 * 3, 55 * 3]) {
      expect(massForRadius(radius, 0)).toBe(MEDIAN_BODY.mass);
    }
  });

  it('is constant surface gravity at n = 2 and constant density at n = 3', () => {
    const surfaceGravity = (radius: number, n: number): number =>
      massForRadius(radius, n) / (radius * radius);
    const density = (radius: number, n: number): number =>
      massForRadius(radius, n) / (radius * radius * radius);

    for (const radius of [96, 132, 165]) {
      expect(surfaceGravity(radius, 2)).toBeCloseTo(surfaceGravity(MEDIAN_RADIUS, 2), 6);
      expect(density(radius, 3)).toBeCloseTo(density(MEDIAN_RADIUS, 3), 9);
    }
  });

  it('is monotone in radius at every exponent the gate might choose', () => {
    for (const n of [1, 2, 2.5, 3]) {
      const masses = [96, 120, 132, 150, 165].map((r) => massForRadius(r, n));
      for (let i = 1; i < masses.length; i++) expect(masses[i]!).toBeGreaterThan(masses[i - 1]!);
    }
  });
});

describe('the floor', () => {
  it('sits a fixed clearance above the surface, whatever the radius', () => {
    for (const radius of [96, 132, 165]) {
      const body = createBody(0, 0, radius);
      expect(floorRadius(body) - body.radius).toBe(36);
    }
  });
});

describe('escape speed at the floor', () => {
  /**
   * Not a spec row, but the scale everything else is measured against: spec 01
   * §6a says a settled orbit runs at 313 prototype units/s at the floor of the
   * median body, which is 939 here. If this number moves, the conversion moved.
   */
  it('puts the circular speed at the median floor where spec 01 §6a measured it', () => {
    const r = floorRadius(MEDIAN_BODY);
    const circular = Math.sqrt(MEDIAN_BODY.mass / r);
    expect(circular).toBeGreaterThan(939 * 0.9);
    expect(circular).toBeLessThan(939 * 1.1);
  });
});
