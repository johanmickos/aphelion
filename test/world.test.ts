/**
 * The field must be the same for every player and every replay, and the
 * generated part must continue the authored pattern rather than diverge from it.
 */
import { describe, expect, it } from 'vitest';
import { createBodies, fieldBounds, DESIGN_W } from '../src/sim/world.ts';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { hypot } from '../src/sim/orbit.ts';

describe('world generation', () => {
  it('is deterministic — the same config always builds the same field', () => {
    expect(createBodies(DEFAULT_CONFIG)).toEqual(createBodies(DEFAULT_CONFIG));
  });

  it('leaves the prototype config with exactly the authored eight', () => {
    const proto = createBodies(PROTOTYPE_CONFIG);
    expect(proto).toHaveLength(8);
    // The authored layout is the prototype's world and the equality gate compares
    // against it, so retuning the game's field must not touch it.
    expect(proto[0]).toEqual({ kind: 'planet', x: 189, y: 0, R: 46, name: 'P1' });
    expect(Math.min(...proto.map((b) => b.y))).toBeCloseTo(-5.98 * 844, 6);
  });

  it('opens on the authored first body, whose approach is tuned', () => {
    // The spawn sits 84px to its left; generating this one would put a random
    // radius and offset in front of every run's first grab.
    const game = createBodies(DEFAULT_CONFIG);
    expect(game[0]).toEqual(createBodies(PROTOTYPE_CONFIG)[0]);
  });

  it('keeps alternating sides all the way up', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const cx = DESIGN_W * 0.5;
    for (let i = 1; i < bodies.length; i++) {
      const a = Math.sign(bodies[i - 1]!.x - cx);
      const b = Math.sign(bodies[i]!.x - cx);
      expect(b, `${bodies[i]!.name} is on the same side as ${bodies[i - 1]!.name}`).toBe(-a);
    }
  });

  it('spaces bodies at the configured distance, within jitter', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const spacing = DEFAULT_CONFIG.bodySpacing;
    for (let i = 1; i < bodies.length; i++) {
      const dy = Math.abs(bodies[i]!.y - bodies[i - 1]!.y);
      expect(dy).toBeGreaterThan(spacing * 0.85);
      expect(dy).toBeLessThan(spacing * 1.15);
    }
  });

  it('puts the next body inside the visible window, so a release can be aimed at it', () => {
    // The point of the spacing: at 360 with a ~323 visible half-height and radii
    // around 44, the next body is on screen while still in orbit around this one.
    const bodies = createBodies(DEFAULT_CONFIG);
    for (let i = 1; i < bodies.length; i++) {
      const dy = Math.abs(bodies[i]!.y - bodies[i - 1]!.y);
      expect(
        dy - bodies[i]!.R,
        `${bodies[i]!.name} is not in view from ${bodies[i - 1]!.name}`,
      ).toBeLessThan(380);
    }
  });

  it('never overlaps two bodies', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const gap = hypot(a.x - b.x, a.y - b.y) - a.R - b.R;
        expect(gap, `${a.name} overlaps ${b.name}`).toBeGreaterThan(DEFAULT_CONFIG.minOrbitGap * 2);
      }
    }
  });

  it('keeps every body inside the playfield', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, bodies);
    for (const b of bodies) {
      expect(b.x - b.R, `${b.name} crosses the left boundary`).toBeGreaterThan(fb.left);
      expect(b.x + b.R, `${b.name} crosses the right boundary`).toBeLessThan(fb.right);
    }
  });

  it('extends the climb rather than just adding bodies', () => {
    const short = createBodies(PROTOTYPE_CONFIG);
    const long = createBodies(DEFAULT_CONFIG);
    const top = (bs: typeof long) => Math.min(...bs.map((b) => b.y));
    expect(top(long)).toBeLessThan(top(short) * 2);
  });
});
