/**
 * The boundary's law, asserted without a canvas.
 *
 * Spec [07 · §1](../../docs/spec/07-boundary.md)'s first law is the whole
 * design — *"a barrier reacts to where you are; a risk reacts to what you are
 * doing"* — and it is a claim about arithmetic before it is a claim about
 * pixels. So it is tested here, the way `test/state/rungs.test.ts` tests spec
 * 05's geometry: presentation state carries the heat, and a test can ask it what
 * skimming and diving are worth without ever drawing anything.
 *
 * What is drawn *from* these numbers — the gradient, the motes, the labels, the
 * line and the colour a shelter changes — is `test/render/bands.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { METRE } from '../../src/sim/units.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';
import {
  CLOSING_CONSTANT,
  FIRE_BAND,
  HEAT_CAP,
  HEAT_FLOOR,
  OUTER_BAND,
  SHELTERS,
  bandAt,
  boundaryOf,
  hasBoundary,
  heatOf,
  shelters,
} from '../../src/state/boundary.ts';

/** The corpus's own median dive into the fire band: 210 m/s — see `CLOSING_CONSTANT`. */
const MEDIAN_DIVE = 210 * METRE;

/** A craft standing `away` design units inside the right-hand line, closing at `closing`. */
function at(away: number, closing: number) {
  const field = fixtureField();
  const { centreline, halfWidth } = field.corridor;
  const craft = fixtureCraft();
  craft.x = centreline + halfWidth - away;
  craft.y = 0;
  craft.vx = closing;
  craft.vy = 0;
  return { field, craft };
}

/** The right-hand side of the boundary, which is the one `at` places the craft against. */
function rightOf(away: number, closing: number) {
  const { field, craft } = at(away, closing);
  return boundaryOf(field, craft)[1]!;
}

describe('the first law — intensity is closing speed, not proximity', () => {
  /**
   * The law itself, stated as the comparison it is: **at one distance**, closing
   * faster is hotter, every time. There is no distance in this assertion at all,
   * which is the point.
   */
  it('rises with closing speed at every fixed distance', () => {
    for (const away of [OUTER_BAND, OUTER_BAND / 2, FIRE_BAND, FIRE_BAND / 2, 20 * METRE]) {
      let last = -Infinity;
      for (const closing of [0, 50, 100, 200, 300, 400].map((m) => m * METRE)) {
        const heat = heatOf(closing, away);
        // Once the cap binds it stops rising, which is the cap doing its job —
        // so the claim is monotone rather than strictly increasing.
        expect(heat).toBeGreaterThanOrEqual(last);
        last = heat;
      }
      // And it really moved: the range is not flat at any distance.
      expect(heatOf(400 * METRE, away)).toBeGreaterThan(heatOf(0, away) + 0.1);
    }
  });

  /**
   * **The half that makes it a law rather than a preference.** Spec 07 §3: *"the
   * dominant term is closing; the proximity term only sharpens it."* Measured as
   * the two ratios, over the whole boundary: crossing the band at a fixed closing
   * speed moves the heat by less than closing does at a fixed distance.
   */
  it('answers a dive harder than it answers an approach', () => {
    // The whole of the boundary, at rest: what pure proximity is worth.
    const byProximity = heatOf(0, FIRE_BAND / 2) / heatOf(0, OUTER_BAND);
    // Standing still at the outer band's edge and turning to dive: what pure
    // closing speed is worth, at a distance that never changes.
    const byClosing = heatOf(MEDIAN_DIVE, OUTER_BAND) / heatOf(0, OUTER_BAND);
    expect(byClosing).toBeGreaterThan(byProximity);
  });

  /**
   * Spec 07's own acceptance, both halves, at one distance — *"flying parallel to
   * the line inside the fire band produces `heat ≤ 0.25` sustained; turning to
   * dive at the same distance raises it above 0.6. Distance did not change."*
   *
   * ⚠ Asserted from the fire band's outer edge inward to **40 m** rather than
   * across the whole of it, and that boundary is the spec's own arithmetic rather
   * than a tolerance chosen here: at zero closing the formula returns
   * `0.10 × (1 + 60/d)`, which passes 0.25 at exactly `d = 40 m` — **with no
   * closing speed at all and whatever `K` is**. The criterion is unsatisfiable
   * over the fire band's inner 40 m for reasons that have nothing to do with
   * anything tuned here. `boundary.ts`'s [`heatOf`](../../src/state/boundary.ts)
   * records it and `docs/plan/m3-the-field.md` carries it for the author.
   */
  it('is calm skimming and hot diving at the same distance', () => {
    for (const metres of [90, 80, 70, 60, 50, 40]) {
      const away = metres * METRE;
      expect(heatOf(0, away)).toBeLessThanOrEqual(0.25);
      expect(heatOf(MEDIAN_DIVE, away)).toBeGreaterThan(0.6);
    }
  });

  /** And the inner 40 m, stated as the thing it is rather than left to be discovered. */
  it('cannot be calm inside 40 m however parallel the craft flies', () => {
    expect(heatOf(0, 39 * METRE)).toBeGreaterThan(0.25);
    expect(heatOf(0, 41 * METRE)).toBeLessThan(0.25);
  });

  /** Receding is not negative closing — spec 07 §3 clamps it at ≥ 0. */
  it('reads a craft flying away as closing on nothing', () => {
    const away = FIRE_BAND / 2;
    // Straight at the line, and straight away from it at the same speed.
    expect(rightOf(away, MEDIAN_DIVE).closing).toBeCloseTo(MEDIAN_DIVE, 6);
    expect(rightOf(away, -MEDIAN_DIVE).closing).toBe(0);
    expect(rightOf(away, -MEDIAN_DIVE).heat).toBeCloseTo(heatOf(0, away), 6);
  });
});

describe('the heat itself', () => {
  it('idles at the floor far from any line and never passes the cap', () => {
    // Deep in the field the proximity term is 1 + ε, so the floor is what is left.
    expect(heatOf(0, 100000)).toBeCloseTo(HEAT_FLOOR, 3);
    for (const away of [OUTER_BAND, FIRE_BAND, 10 * METRE, 0, -50]) {
      expect(heatOf(4000 * METRE, away)).toBeLessThanOrEqual(HEAT_CAP);
    }
  });

  /**
   * Past the line is reachable — spec 01 §10's four units of grace mean the craft
   * is briefly outside and still alive — so the arithmetic has to stay finite
   * through it rather than divide by a distance of zero.
   */
  it('stays finite past the line', () => {
    for (const away of [0, -1, -12, -1000]) {
      const heat = heatOf(MEDIAN_DIVE, away);
      expect(Number.isFinite(heat)).toBe(true);
      expect(heat).toBeCloseTo(HEAT_CAP, 6);
    }
  });

  /** `K` is a closing speed, so the term it divides is 1 at exactly that speed. */
  it('spends its whole closing term at K', () => {
    // Deep enough that the proximity term is 1 to well past the tolerance below,
    // which is what isolates the closing term.
    const deep = 1e9;
    expect(heatOf(CLOSING_CONSTANT, deep)).toBeCloseTo(HEAT_CAP, 6);
    expect(heatOf(CLOSING_CONSTANT / 2, deep)).toBeCloseTo(HEAT_FLOOR + 0.5, 3);
  });
});

describe('the bands', () => {
  it('prices the three regions spec 07 §2 names', () => {
    expect(bandAt(OUTER_BAND + 1)).toBe(1);
    expect(bandAt(OUTER_BAND)).toBe(2);
    expect(bandAt(FIRE_BAND + 1)).toBe(2);
    expect(bandAt(FIRE_BAND)).toBe(3);
    expect(bandAt(0)).toBe(3);
    // Past the line is still the fire band's price, because there is no run left
    // to pay it — spec 07 §2's GONE row is about what is *drawn*, and the
    // renderer is where a mote stops existing.
    expect(bandAt(-10)).toBe(3);
  });

  it('sits where spec 07 metres put them', () => {
    expect(OUTER_BAND / METRE).toBe(220);
    expect(FIRE_BAND / METRE).toBe(90);
  });
});

describe('both sides, always', () => {
  it('gives each line its own heat', () => {
    const boundary = rightOfPair(FIRE_BAND, MEDIAN_DIVE);
    const left = boundary[0]!;
    const right = boundary[1]!;
    // Diving right flares the right line and calms the left, in one frame. That
    // is the first law applied honestly rather than a single distance-to-the-
    // nearest-wall standing in for two.
    expect(right.heat).toBeGreaterThan(0.6);
    // The far line is a whole corridor away, so its proximity term is 1.09 and
    // its heat is the floor and nothing else — the craft is closing on it at
    // exactly zero however hard it is diving at the other one.
    expect(left.heat).toBeCloseTo(HEAT_FLOOR * (1 + (60 * METRE) / left.away), 6);
    expect(left.heat).toBeLessThan(right.heat / 5);
    expect(right.closing).toBeGreaterThan(0);
    expect(left.closing).toBe(0);
  });

  it('measures away inward on both sides', () => {
    const field = fixtureField();
    const { centreline, halfWidth } = field.corridor;
    const craft = fixtureCraft();
    craft.x = centreline;
    craft.y = 0;
    craft.vx = 0;
    const [left, right] = boundaryOf(field, craft) as [
      ReturnType<typeof rightOf>,
      ReturnType<typeof rightOf>,
    ];
    expect(left.away).toBeCloseTo(halfWidth, 6);
    expect(right.away).toBeCloseTo(halfWidth, 6);
    expect(left.line).toBeCloseTo(centreline - halfWidth, 6);
    expect(right.line).toBeCloseTo(centreline + halfWidth, 6);
    expect(left.inward).toBe(1);
    expect(right.inward).toBe(-1);
  });

  /**
   * The field `tools/check-portability.ts` builds on purpose — `halfWidth` and
   * `foot` both `Infinity`, because *"a corridor here would be geometry the proof
   * has to dodge."* The same field [`hasRungs`](../../src/state/rung.ts) exists
   * for, and the same failure it was found by.
   */
  it('has nothing to draw in a field with no line', () => {
    expect(hasBoundary(Infinity)).toBe(false);
    const field = fixtureField();
    const craft = fixtureCraft();
    const unbounded = {
      ...field,
      corridor: { ...field.corridor, halfWidth: Infinity, foot: Infinity },
    };
    expect(boundaryOf(unbounded, craft)).toHaveLength(0);
  });
});

describe('the shelter', () => {
  /**
   * **A named zero.** Only the anomaly projects a shelter and the anomaly is M8's
   * — which is deliberately last, because placing the body bumps
   * `FIXTURE_FIELD_VERSION` and `SIM_VERSION` together and the parked camera
   * session's only evidence is the corpus those two would delete.
   */
  it('is projected by nothing today', () => {
    expect(SHELTERS).toHaveLength(0);
    const field = fixtureField();
    const craft = fixtureCraft();
    for (const side of boundaryOf(field, craft)) expect(side.sheltered).toBe(false);
  });

  /**
   * And the predicate is a predicate rather than a constant `false` — the term is
   * built and only the value is missing, which is the shape `bloomOf`'s chain and
   * `AnomalyView.inside` are already in. `test/render/bands.test.ts` proves the
   * **colour** follows it.
   */
  it('suspends the line inside one and nowhere else', () => {
    const one = [{ x: 100, y: 200, radius: 50 }];
    expect(shelters(one, 100, 200)).toBe(true);
    expect(shelters(one, 140, 200)).toBe(true);
    expect(shelters(one, 100, 249)).toBe(true);
    expect(shelters(one, 151, 200)).toBe(false);
    expect(shelters(one, 100, 251)).toBe(false);
    expect(shelters([], 100, 200)).toBe(false);
  });
});

/** Every tick of the shipped run, as the picture — the run `pnpm profile` walks. */
function shippedRun(): PresentationState[] {
  const text = readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8');
  const { recipe } = parseDispatch(JSON.parse(text));
  let view = createPresentation(openRun(recipe));
  const views = [view];
  replayRun(recipe, {
    onTick: (state) => {
      view = derive(view, state);
      views.push(view);
    },
  });
  return views;
}

describe('over a real run', () => {
  const RUN = shippedRun();

  it('derives both sides on every tick of it', () => {
    for (const view of RUN) expect(view.boundary).toHaveLength(2);
  });

  /**
   * The run has to *reach* the bands, or every assertion above is about a
   * geometry nobody flies. It does: it enters the fire band and crosses the line,
   * which is how it ends.
   */
  it('flies into the bands and out through the line', () => {
    const sides = RUN.flatMap((view) => view.boundary);
    expect(sides.filter((side) => side.away <= OUTER_BAND).length).toBeGreaterThan(100);
    expect(sides.filter((side) => side.away <= FIRE_BAND).length).toBeGreaterThan(0);
    expect(Math.min(...sides.map((side) => side.away))).toBeLessThan(0);
  });

  /**
   * **The first law, over play rather than over a formula.** Among the ticks
   * inside the bands, sort by distance and by closing speed and ask which one the
   * heat actually follows. Closing has to win, or the boundary is a barrier.
   */
  it('tracks what the craft is doing rather than where it is', () => {
    const inside = RUN.flatMap((view) => view.boundary).filter(
      (side) => side.away <= OUTER_BAND && side.away > 0,
    );
    expect(inside.length).toBeGreaterThan(200);
    const correlate = (of: (side: (typeof inside)[number]) => number): number => {
      const xs = inside.map(of);
      const ys = inside.map((side) => side.heat);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let top = 0;
      let bx = 0;
      let by = 0;
      for (let i = 0; i < xs.length; i++) {
        const dx = xs[i]! - mx;
        const dy = ys[i]! - my;
        top += dx * dy;
        bx += dx * dx;
        by += dy * dy;
      }
      return top / Math.sqrt(bx * by);
    };
    // Nearer is hotter, so distance correlates negatively; both are compared as
    // strengths.
    const byClosing = Math.abs(correlate((side) => side.closing));
    const byNearness = Math.abs(correlate((side) => -side.away));
    expect(byClosing).toBeGreaterThan(byNearness);
    expect(byClosing).toBeGreaterThan(0.5);
  });
});

/** Both sides at once, for the pair assertions above. */
function rightOfPair(away: number, closing: number) {
  const { field, craft } = at(away, closing);
  return boundaryOf(field, craft);
}
