/**
 * The **scatter field** — the demo's ladder, placed sideways from a seed.
 *
 * `test/sim/fixture-field.test.ts` is this file's pair, and the two are
 * deliberately separate: the fixture is a **frozen replay target** and this is a
 * field that is meant to keep changing, so a test that held both would be one
 * edit away from deleting the dispatch corpus. The first assertion below is that
 * the fixture still resolves, because that is the guarantee the whole design of
 * two generators exists to make.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { distance } from '../../src/sim/math.ts';
import { floorRadius } from '../../src/sim/body.ts';
import { FIXTURE_FIELD, SCATTER_FIELD, fieldFor } from '../../src/sim/recipe.ts';
import { fixtureField } from '../../src/sim/fixture-field.ts';
import { SCATTER_FIELD_VERSION, scatterCraft, scatterField } from '../../src/sim/scatter-field.ts';
import { SCALE } from '../../src/sim/units.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';

const field = scatterField();
const bodies = field.bodies;
/** Everything in this file is argued in the prototype's own units, as the generator is. */
const off = (at: number): number => (at - field.corridor.centreline) / SCALE;
const HALF_WIDTH = field.corridor.halfWidth / SCALE;

describe('the scatter field', () => {
  /**
   * **The reason there are two generators rather than two versions of one.**
   *
   * The author asked for more lateral spread and then asked whether a seeded
   * generator would help. It does, and the help is here: a recipe names
   * `{ generator, version }` and [`fieldFor`](../../src/sim/recipe.ts) resolves
   * the generator first, so every recipe flown in `fixture` goes on resolving to
   * the field it was actually flown in. Editing the fixture would have refused
   * all 18 dispatches that still replay — the parked camera session's *"evidence
   * and nothing else"*.
   */
  it('leaves the fixture field resolvable and untouched', () => {
    const resolved = fieldFor(FIXTURE_FIELD);
    const frozen = fixtureField();
    expect(resolved.field.bodies.map((body) => [body.x, body.y, body.radius])).toEqual(
      frozen.bodies.map((body) => [body.x, body.y, body.radius]),
    );
    expect(FIXTURE_FIELD.generator).not.toBe(SCATTER_FIELD.generator);
  });

  it('is what the demo is flown in', () => {
    const resolved = fieldFor(SCATTER_FIELD);
    expect(resolved.field.bodies).toHaveLength(bodies.length);
    expect(resolved.craft.x).toBe(scatterCraft().x);
  });

  /**
   * The same guarantee the fixture's version carries, for the same reason: a
   * recipe names this field rather than carrying it, so anything that moves what
   * the generator builds — the ladder, the seed, the spread, the corridor, the
   * spawn, or `MASS_EXPONENT` — has to move the version with it.
   */
  it('has a version that moves whenever the field it names does', () => {
    const craft = scatterCraft();
    const written = [
      `corridor ${field.corridor.centreline} ${field.corridor.halfWidth} ${field.corridor.foot}`,
      `craft ${craft.x} ${craft.y} ${craft.vx} ${craft.vy}`,
      ...bodies.map((body) => `${body.x} ${body.y} ${body.radius} ${body.mass} ${body.type}`),
    ].join('\n');
    const fingerprint = createHash('sha256').update(written).digest('hex').slice(0, 16);
    // ⚠ **2 since 2026-09-03**: the author ruled a fork's two lanes out to the
    // prototype's own placement, which redrew every fork in the field. The 18
    // dispatches flown in v1 no longer replay, which is what this version is for.
    expect(SCATTER_FIELD_VERSION).toBe(2);
    expect(
      fingerprint,
      'the scatter field changed: bump SCATTER_FIELD_VERSION and this fingerprint together',
      // A **literal**, and it has to be: a fingerprint computed from the field it
      // is checking can never fail, which is the shape of test this repo has
      // already been caught by once.
    ).toBe('3214fcabc67c889f');
  });

  /** A pure function of its seed, so two machines build one field. */
  it('builds the same field every time', () => {
    const again = scatterField();
    expect(again.bodies.map((body) => [body.x, body.y, body.radius])).toEqual(
      bodies.map((body) => [body.x, body.y, body.radius]),
    );
  });

  /**
   * **The point of the change** (author, 2026-09-01): *"a bit more left/right
   * stretch... more options for traveling near it."*
   *
   * Asserted as the thing that makes it an *option* rather than as a distance:
   * spec [07](../../docs/spec/07-boundary.md)'s outer band starts 220 m inside
   * the line, so a body whose centre is past that is one you are paid **×2** to
   * orbit. The fixture has none; this has eight.
   */
  it('puts real bodies inside the outer band, where the fixture put none', () => {
    const outerBand = HALF_WIDTH - 220;
    const inside = bodies.filter((body) => Math.abs(off(body.x)) >= outerBand);
    expect(inside.length).toBeGreaterThanOrEqual(6);
    const fixture = fixtureField();
    const before = fixture.bodies.filter(
      (body) =>
        Math.abs((body.x - fixture.corridor.centreline) / SCALE) >=
        fixture.corridor.halfWidth / SCALE - 220,
    );
    expect(before).toHaveLength(0);
  });

  /**
   * **And not fully to the boundary**, which is the other half of what was asked.
   * The cap is measured rather than chosen — at 195 about one swing in ten around
   * an outermost body carries the craft out of the corridor, and spec 07 §5's
   * **save**, which is what makes that recoverable, is not built.
   */
  it('stops short of the fire band, and of the measured ceiling', () => {
    const fireBand = HALF_WIDTH - 90;
    for (const body of bodies) {
      expect(Math.abs(off(body.x))).toBeLessThanOrEqual(195);
      // No body's centre reaches the fire band, and no body's *rim* does either.
      expect(Math.abs(off(body.x)) + body.radius / SCALE).toBeLessThan(fireBand);
    }
  });

  /**
   * **The corridor has to hold the orbits of its own bodies** — the criterion
   * that decided where the line went, and the one this change puts under the most
   * pressure. A settled swing is a circle at the body's floor.
   */
  it('holds every settled orbit its own bodies can hand out', () => {
    for (const body of bodies) {
      const reach = Math.abs(body.x - field.corridor.centreline) + floorRadius(body);
      expect(reach).toBeLessThan(field.corridor.halfWidth);
    }
  });

  /**
   * Spec 17 §4: *"consecutive bodies alternate side of the centreline."* A rule
   * here rather than twenty-four signs typed by hand, which is what lets it
   * survive the ladder changing under it — and what makes a **fork** two answers
   * rather than one.
   */
  it('alternates sides all the way up', () => {
    for (let at = 1; at < bodies.length; at++) {
      expect(Math.sign(off(bodies[at]!.x))).toBe(-Math.sign(off(bodies[at - 1]!.x)));
    }
  });

  /**
   * Spec 17 §5's third invariant — *"no two bodies overlap, and no two are within
   * 40 m of each other's rims."*
   *
   * ⚠ **This caught a real defect on the first draw**, and it is the invariant a
   * seeded generator most needs that a hand-typed field never did: a **fork** is
   * two bodies at one altitude, so nothing but their lateral placement holds them
   * apart, and the first seed put the pair at 1 100 m eight units *through* each
   * other. A person placing them by hand can see that; a draw cannot.
   */
  it('keeps every pair of bodies 40 m clear of each other', () => {
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const one = bodies[a]!;
        const two = bodies[b]!;
        const gap = distance(one.x, one.y, two.x, two.y) - one.radius - two.radius;
        expect(gap / SCALE).toBeGreaterThanOrEqual(40);
      }
    }
  });

  /**
   * ⚠ **Bodies now leave the design space, and that is the change working rather
   * than a break.** The fixture's own test asserts every body fits inside the
   * design width about the centreline, on the reasoning that the camera *"has
   * nothing to pan toward"*. The camera pans since 2026-09-01 and the whole point
   * of this field is bodies out where the picture cannot reach — so what holds
   * instead is the **corridor**, which is where a run is actually flown.
   */
  it('places its bodies inside the corridor rather than inside the picture', () => {
    const outside = bodies.filter(
      (body) => Math.abs(off(body.x)) + body.radius / SCALE > DESIGN_WIDTH / 2 / SCALE,
    );
    expect(outside.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(Math.abs(off(body.x)) + body.radius / SCALE).toBeLessThan(HALF_WIDTH);
    }
  });

  /** The spawn is measured from wherever the first body landed, not from a constant. */
  it('spawns the craft against its own first body', () => {
    expect(scatterCraft().x).toBeCloseTo(bodies[0]!.x - 84 * SCALE, 6);
  });
});
