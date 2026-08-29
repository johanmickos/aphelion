/**
 * The compass's promise, and the only way to check it is to keep it: **fly to
 * the dot, let go, and see where you end up.**
 *
 * Spec [00 · §6](../../docs/spec/00-tokens.md) says the windows are *"where the
 * craft will go if it releases now"*, and `VISION.md`'s fourth pillar is that
 * the game states facts and never gives instructions. An instrument that is
 * merely self-consistent satisfies neither — it would draw a beautiful arc for a
 * body the craft cannot reach, and nothing would fail. So the load-bearing test
 * here runs the whole thing through `stepSim`: hold until the hand is on the
 * dot, release, coast, and assert the craft actually arrives.
 */
import { describe, expect, it } from 'vitest';
import { handOf, RINGS, windowsOn } from '../../src/sim/compass.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { grabRange } from '../../src/sim/grab.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';

const PRESS = { pressed: true };
const TWO_PI = Math.PI * 2;

const world = (): SimState => createInitialState(fixtureField(), fixtureCraft(), 1);

/** Fly until a body is held and its orbit has frozen. */
function orbiting(grabAt = 20, ticks = 400): SimState {
  const sim = world();
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, tick >= grabAt ? PRESS : NO_INPUT);
    if (sim.orbit !== null && sim.orbit.ticksSinceFreeze > 60) return sim;
  }
  throw new Error('the fixture field did not produce an orbit');
}

const shortWay = (angle: number): number => {
  let d = angle % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
};

describe('when there is a compass at all', () => {
  it('has none while coasting', () => {
    const sim = world();
    expect(windowsOn(sim)).toEqual([]);
    expect(handOf(sim)).toBeNull();
  });

  /**
   * And none through the dive. The compass needs an orbit, which is what makes
   * its arrival the freeze made visible — and what a **sighting** covers for a
   * craft that has none (spec 03 §6).
   */
  it('has none while diving', () => {
    const sim = world();
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
      if (sim.heldBody !== null && sim.orbit === null) {
        expect(windowsOn(sim)).toEqual([]);
        expect(handOf(sim)).toBeNull();
        return;
      }
    }
    throw new Error('no dive was flown');
  });

  it('never offers more rings than there are', () => {
    const sim = orbiting();
    expect(windowsOn(sim).length).toBeGreaterThan(0);
    expect(windowsOn(sim).length).toBeLessThanOrEqual(RINGS);
  });

  it('gives each body at most one window', () => {
    const bodies = windowsOn(orbiting()).map((w) => w.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});

describe('the windows are true', () => {
  /**
   * **The load-bearing one.** Hold the swing until the hand reaches a window's
   * dot, then let go — and the craft, coasting in a straight line because a
   * coasting craft feels nothing, has to arrive within that body's own grab
   * range. Nothing here reads the compass's own arithmetic back to itself: the
   * arrival is measured off `stepSim`.
   */
  it('a release at the dot arrives at the body it promised', () => {
    const sim = orbiting();
    const field = sim.field;
    const target = windowsOn(sim)[0]!;
    const body = field.bodies[target.body]!;

    // Hold until the hand crosses the dot. The dot moves as the orbit rounds, so
    // it is re-asked every tick — which is what the player is reading too.
    let closest = Infinity;
    let released = false;
    for (let tick = 0; tick < 600 && !released; tick++) {
      const rings = windowsOn(sim);
      const ring = rings.find((r) => r.body === target.body);
      const hand = handOf(sim);
      if (ring !== undefined && hand !== null) {
        const offset = Math.abs(shortWay(hand - ring.dot));
        if (offset < closest) closest = offset;
        // Let go on the tick after the aim starts opening again: that is as near
        // the dot as a sixty-hertz hand can get.
        if (offset > closest && closest < ring.halfWidth) released = true;
      }
      stepSim(sim, released ? NO_INPUT : PRESS);
    }
    expect(released).toBe(true);

    let nearest = Infinity;
    for (let tick = 0; tick < 900 && sim.ending === null; tick++) {
      stepSim(sim, NO_INPUT);
      nearest = Math.min(nearest, distance(sim.craft.x, sim.craft.y, body.x, body.y));
    }
    expect(nearest).toBeLessThanOrEqual(grabRange(body));
  });

  /**
   * And the dot is the *best* release rather than merely a release inside the
   * window: the ray through it passes nearer the body than the ray from either
   * edge does.
   */
  it('puts the dot where the ray passes closest', () => {
    const sim = orbiting();
    for (const ring of windowsOn(sim)) {
      expect(ring.closest).toBeLessThanOrEqual(grabRange(sim.field.bodies[ring.body]!));
      expect(ring.halfWidth).toBeGreaterThan(0);
      expect(ring.halfWidth).toBeLessThanOrEqual(Math.PI);
    }
  });

  /** Windows partition the orbit rather than overlapping it: one release, one body. */
  it('does not overlap another window', () => {
    const rings = windowsOn(orbiting());
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        const gap = Math.abs(shortWay(rings[i]!.dot - rings[j]!.dot));
        expect(gap).toBeGreaterThan(rings[i]!.halfWidth + rings[j]!.halfWidth - 1e-6);
      }
    }
  });
});

describe('it is a fact rather than an opinion', () => {
  it('answers the same state the same way', () => {
    const sim = orbiting();
    expect(windowsOn(sim)).toEqual(windowsOn(sim));
    expect(handOf(sim)).toBe(handOf(sim));
  });

  /**
   * And it does not touch the simulation. The compass is asked *of* a state and
   * never writes to one — which is why it can be computed once per tick in the
   * picture without moving `SIM_VERSION`.
   */
  it('changes nothing it is asked about', () => {
    const sim = orbiting();
    const before = JSON.stringify({
      craft: sim.craft,
      orbit: sim.orbit,
      held: sim.heldBody,
      tick: sim.tick,
    });
    windowsOn(sim);
    handOf(sim);
    expect(
      JSON.stringify({ craft: sim.craft, orbit: sim.orbit, held: sim.heldBody, tick: sim.tick }),
    ).toBe(before);
  });
});
