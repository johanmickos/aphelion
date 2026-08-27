/**
 * Spec [01 · §9](../../docs/spec/01-swing.md): *"No drag. No gravity. No force
 * of any kind. A coasting craft travels in an exact straight line at exactly
 * constant speed."*
 *
 * The spec's own words on the tolerance are that it is *"effectively exact and
 * should be written as such"*, so it is: `toBe`, not `toBeCloseTo`. This is not
 * an approximation to be improved — the economy says coasting earns nothing and
 * costs nothing, and the physics agrees with it exactly rather than
 * approximately.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft, headingOf, speedOf } from '../../src/sim/craft.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';

const TICKS = 600;

function coastingRun(): ReturnType<typeof createInitialState> {
  // A crowd of bodies, none of them held. If any of them pulls, this fails.
  const field = {
    bodies: [
      createBody(0, 0, MEDIAN_RADIUS),
      createBody(400, 900, MEDIAN_RADIUS),
      createBody(-700, 300, MEDIAN_RADIUS * 1.25),
    ],
  };
  return createInitialState(field, createCraft(-2000, -80, 431.7, 233.11), 1);
}

describe('coasting', () => {
  it('holds speed bit-identical over 600 ticks', () => {
    const state = coastingRun();
    const speed = speedOf(state.craft);
    for (let i = 0; i < TICKS; i++) {
      stepSim(state, NO_INPUT);
      expect(speedOf(state.craft)).toBe(speed);
    }
  });

  it('holds heading bit-identical over 600 ticks', () => {
    const state = coastingRun();
    const heading = headingOf(state.craft);
    for (let i = 0; i < TICKS; i++) {
      stepSim(state, NO_INPUT);
      expect(headingOf(state.craft)).toBe(heading);
    }
  });

  /**
   * The line itself, rather than the speed along it. Measured as the largest
   * distance any sampled position falls from the straight line through the
   * first and last — spec 01 §9's *"exact straight line"* as something visible
   * from outside.
   */
  it('stays on the line it started on', () => {
    const state = coastingRun();
    const start = { x: state.craft.x, y: state.craft.y };
    const samples: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < TICKS; i++) {
      stepSim(state, NO_INPUT);
      samples.push({ x: state.craft.x, y: state.craft.y });
    }

    const endX = state.craft.x - start.x;
    const endY = state.craft.y - start.y;
    const length = Math.sqrt(endX * endX + endY * endY);
    let worst = 0;
    for (const p of samples) {
      const cross = (p.x - start.x) * endY - (p.y - start.y) * endX;
      worst = Math.max(worst, Math.abs(cross) / length);
    }
    // A thousandth of a design pixel over 600 ticks and 8600 units travelled.
    expect(worst).toBeLessThan(1e-3);
  });
});
