/**
 * The field the M1 gate flies in.
 *
 * It is a fixture, not a generator (spec [17 · §3](../../docs/spec/17-daily-field.md)
 * rules that a day is generated once as data, and the generator is M3's), so
 * what is worth asserting is not that it is well generated but that it is
 * **flyable and that it lets the gate's open questions be asked in the hand**.
 * Two of M1's rulings are the author's and both are only judgeable if the field
 * allows them: spec 01 §13.2's mass-to-radius exponent, and §13.5's eccentricity
 * cap.
 */
import { describe, expect, it } from 'vitest';
import { floorRadius } from '../../src/sim/body.ts';
import { grabRange } from '../../src/sim/grab.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState } from '../../src/sim/step.ts';
import { MASS_EXPONENT, SCALE } from '../../src/sim/units.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createPresentation } from '../../src/state/derive.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';

const field = fixtureField();
const bodies = field.bodies;

describe('the fixture field', () => {
  /**
   * The camera's whole simplification rests on this: the field is no wider than
   * the design space, so there is nothing to pan toward
   * ([`derive.ts`](../../src/state/derive.ts)). The two live in different layers
   * and cannot import each other, so this is where they are held in agreement.
   */
  it('fits inside the design space, where the camera is looking', () => {
    const camera = createPresentation(createInitialState(field, fixtureCraft(), 1)).camera;
    expect(camera.x).toBe(DESIGN_WIDTH / 2);
    for (const body of bodies) {
      expect(body.x - body.radius).toBeGreaterThanOrEqual(0);
      expect(body.x + body.radius).toBeLessThanOrEqual(DESIGN_WIDTH);
    }
  });

  /**
   * **The spread is the point.** A field of identically-sized bodies makes spec
   * 01 §13.2's exponent unflyable: at any value of it, every body would pull and
   * reach the same. Stated as the ratio the author actually feels — the reach of
   * the largest body against the smallest — because that is what changes when
   * the exponent moves, and at `MASS_EXPONENT = 0` it is 1 and the question is
   * unaskable.
   */
  it('spreads its radii, so the mass-to-radius exponent can be flown', () => {
    const radii = bodies.map((body) => body.radius);
    expect(Math.min(...radii)).toBeLessThanOrEqual(34 * SCALE);
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(56 * SCALE);

    const reaches = bodies.map(grabRange);
    const spread = Math.max(...reaches) / Math.min(...reaches);
    expect(spread).toBeCloseTo(Math.pow(56 / 34, MASS_EXPONENT), 6);
    expect(spread).toBeGreaterThan(1.5);
  });

  /** Spec 17 §5's third invariant. A field that overlaps itself is not a field. */
  it('holds no two bodies that overlap', () => {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        expect(distance(a.x, a.y, b.x, b.y)).toBeGreaterThan(floorRadius(a) + floorRadius(b));
      }
    }
  });

  /**
   * Somewhere to release *to* rather than along. The prototype's field forks
   * about two altitudes in five, and a climb without a choice in it is a line
   * that is merely followed.
   */
  it('offers a choice at some altitudes', () => {
    const altitudes = new Set(bodies.map((body) => body.y));
    expect(altitudes.size).toBeLessThan(bodies.length);
  });

  /**
   * The gaps are half a grab range and never the same twice: close enough that
   * the next body is already on offer, far enough that reaching it is a
   * decision, and irregular enough that a rhythm cannot be learned instead of a
   * distance.
   */
  it('spaces its altitudes the way the measured field does', () => {
    const altitudes = [...new Set(bodies.map((body) => body.y))].sort((a, b) => b - a);
    const gaps: number[] = [];
    for (let i = 1; i < altitudes.length; i++) gaps.push(altitudes[i - 1]! - altitudes[i]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(252 * SCALE);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(308 * SCALE);
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  /**
   * The opening is the prototype's authored one, and it is tuned: the craft
   * begins inside the first body's reach, coasting straight up, so the field
   * opens with a grab that is on offer rather than one that has to be chased.
   */
  it('opens with the first body already on offer', () => {
    const craft = fixtureCraft();
    const first = bodies[0]!;
    expect(craft.vx).toBe(0);
    expect(craft.vy).toBeLessThan(0);
    expect(distance(craft.x, craft.y, first.x, first.y)).toBeLessThan(grabRange(first));
  });
});
