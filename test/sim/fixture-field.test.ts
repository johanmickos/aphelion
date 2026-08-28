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
import { CORRIDOR_GRACE, FELL_BEHIND_GAP, MASS_EXPONENT, SCALE } from '../../src/sim/units.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createPresentation } from '../../src/state/derive.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';

const field = fixtureField();
const bodies = field.bodies;

describe('the fixture field', () => {
  /**
   * The **bodies** are no wider than the design space, so the camera has nothing
   * to pan toward to keep them framed. The two live in different layers and
   * cannot import each other, so this is where they are held in agreement.
   *
   * **The corridor is not**, and that is M1.4's, below.
   */
  it('puts its bodies inside the design space, where the camera is looking', () => {
    const camera = createPresentation(createInitialState(field, fixtureCraft(), 1)).camera;
    expect(camera.x).toBe(DESIGN_WIDTH / 2);
    for (const body of bodies) {
      expect(body.x - body.radius).toBeGreaterThanOrEqual(0);
      expect(body.x + body.radius).toBeLessThanOrEqual(DESIGN_WIDTH);
    }
  });

  /**
   * **The corridor has to hold the orbits of its own bodies**, and this is the
   * criterion that decided where its line went.
   *
   * A settled swing is a circle at the body's floor, so the furthest sideways a
   * legitimate orbit ever reaches is a body's own offset plus its floor. A
   * corridor narrower than that kills a craft on the far side of a swing around
   * a body the field itself placed — which is exactly the defect spec
   * [01 · §10](../../docs/spec/01-swing.md) records the fell-behind line having
   * had, *"killing a craft that had not lost a unit of altitude"*.
   *
   * Measured here: the widest settled circle reaches **202** prototype units
   * from the centreline, so a corridor at the design space's own edges — half
   * width 195 — is not one this field can be flown in.
   */
  it('holds every settled orbit its own bodies can hand out', () => {
    const { centreline, halfWidth } = field.corridor;
    for (const body of bodies) {
      const reach = Math.abs(body.x - centreline) + floorRadius(body);
      expect(reach).toBeLessThan(halfWidth);
    }
  });

  /**
   * **The foot cannot be reached**, and it is a backstop rather than a line
   * anyone meets. The fell-behind line trails the high-water mark by 700 and the
   * mark opens at the spawn, so it is always the higher of the two and always
   * fires first. The prototype is the same at this tuning, which is why its own
   * note calls the foot a death *"in every config"* rather than a death anyone
   * sees: it is there for the configs that have no trailing line at all.
   */
  it('puts its foot below the line that trails the climb', () => {
    expect(field.corridor.foot).toBeGreaterThan(fixtureCraft().y + FELL_BEHIND_GAP);
  });

  /**
   * **And the corridor outgrows the design space, which retires a decision.**
   * [`camera.ts`](../../src/state/camera.ts) does not pan sideways and says in
   * its own header that the decision *"expires when the field outgrows the
   * design space"*. It has: the corridor is 1.9× the design width, carried from
   * the prototype's own tuned field, so the craft can be more than half a screen
   * outside the picture and still alive — and, now, still able to die out there.
   *
   * This test is not a complaint; it is the number under the clause, held so
   * that whoever builds M3.1's camera can see what it has to cover.
   */
  it('is wider than the picture, which is what retires the fixed camera', () => {
    const visible = DESIGN_WIDTH / 2;
    const line = field.corridor.halfWidth + CORRIDOR_GRACE;
    expect(line).toBeGreaterThan(visible);
    expect(line - visible).toBeCloseTo(538.5, 6);
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
