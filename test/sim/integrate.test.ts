/**
 * Spec [01 · §12](../../docs/spec/01-swing.md): the tick, the substeps, and the
 * stability margin.
 *
 * The spec measured six substeps as **converged, not chosen**, against a
 * 96-substep reference on the prototype's integrator — and then wrote its
 * tolerance as a convergence test rather than as the number six, *"so the
 * rewrite can choose its own count and prove it."* This file is that proof, run
 * on this integrator rather than inherited from the one next door.
 *
 * Lengths are design units, so spec 01's prototype-unit tolerances are ×3:
 * 0.5 units becomes 1.5, and 2 units/s becomes 6.
 */
import { describe, expect, it } from 'vitest';
import { createCraft, speedOf } from '../../src/sim/craft.ts';
import { integrate } from '../../src/sim/integrate.ts';
import { distance } from '../../src/sim/math.ts';
import { SECONDS_PER_TICK, SUBSTEPS } from '../../src/sim/units.ts';
import { MEDIAN_BODY } from './fixtures.ts';

const RADIUS_TOLERANCE = 0.5 * 3;
const SPEED_TOLERANCE = 2 * 3;

/**
 * The envelope the dive actually lands in, stated as where it ends rather than
 * where it began.
 *
 * Spec 01 §5a's headline is that *"periapsis radius is pinned at the floor
 * across almost the whole envelope"* at a periapsis speed of 340 – 440 prototype
 * units/s — 1020 – 1320 here — however the approach was shaped. That is the
 * geometry §12's stability argument is about: *"how far the craft moves in one
 * integration step relative to the geometry it must not miss."*
 *
 * The first attempt at this file described approaches instead, and every one of
 * them was a lazy pass at a comfortable radius: **one substep per tick agreed
 * with ninety-six to within 0.8 units**, so the convergence test would have
 * passed on a curve that was flat everywhere and proved nothing. Building the
 * approach backwards from the closest approach puts the test where the game is.
 *
 * These are unaided paths — the clearance of §4, which is what lets a shallower
 * aim reach the floor at all, is M1.3's. A core test that needed it would be
 * testing the swing.
 */
function approachReaching(
  periapsis: number,
  escapeFraction: number,
  wantedStart: number,
): { x: number; y: number; speed: number; periapsis: number; escapeFraction: number } {
  const escapeSpeed = Math.sqrt((2 * MEDIAN_BODY.mass) / periapsis);
  const periapsisSpeed = escapeFraction * escapeSpeed;
  const energy = (periapsisSpeed * periapsisSpeed) / 2 - MEDIAN_BODY.mass / periapsis;

  // A bound path cannot begin further out than its own apoapsis, and at these
  // speeds the apoapsis is often inside the grab range — which is spec 01 §5a's
  // point restated: the dive normalises speed, so a slow far approach and a fast
  // near one arrive doing roughly the same thing.
  const apoapsis = energy < 0 ? -MEDIAN_BODY.mass / energy - periapsis : Infinity;
  const startRadius = Math.min(wantedStart, 0.92 * apoapsis);

  const speed = Math.sqrt(2 * energy + (2 * MEDIAN_BODY.mass) / startRadius);
  const offset = (periapsisSpeed * periapsis) / speed;
  return {
    x: -Math.sqrt(startRadius * startRadius - offset * offset),
    y: offset,
    speed,
    periapsis,
    escapeFraction,
  };
}

/**
 * Six dives spanning the measured band: periapsis from the floor of the median
 * body (168) out to two and a half times it, at 0.77 – 0.99 of escape speed.
 */
const GEOMETRIES = [
  approachReaching(180, 0.79, 1050),
  approachReaching(180, 0.9, 1050),
  approachReaching(180, 0.99, 1500),
  approachReaching(220, 0.85, 1050),
  approachReaching(300, 0.95, 1050),
  approachReaching(420, 0.78, 900),
];

/** A geometry, said in the terms the failure message needs. */
function describe_(geometry: (typeof GEOMETRIES)[number]): string {
  return (
    `periapsis ${geometry.periapsis} at ${geometry.escapeFraction} of escape, ` +
    `from (${geometry.x.toFixed(0)}, ${geometry.y.toFixed(0)}) at ${geometry.speed.toFixed(0)}/s`
  );
}

interface Closest {
  radius: number;
  speed: number;
  seconds: number;
  worstStep: number;
}

/**
 * Fly one dive at a chosen substep count and report its closest approach.
 *
 * The trace runs at substep resolution — `integrate(craft, body, dt, 1)` with
 * `dt` the substep's own length is the same arithmetic `integrate(craft, body,
 * tick, n)` performs, so watching every substep costs nothing and does not
 * change the answer. That is what makes the worst *integrated* step observable
 * rather than estimated.
 */
function closestApproach(
  geometry: (typeof GEOMETRIES)[number],
  substeps: number,
  ticks = 600,
): Closest {
  const craft = createCraft(geometry.x, geometry.y, geometry.speed, 0);
  const dt = SECONDS_PER_TICK / substeps;
  let best: Closest = { radius: Infinity, speed: 0, seconds: 0, worstStep: 0 };
  let turned = false;

  for (let step = 1; step <= ticks * substeps && !turned; step++) {
    const fromX = craft.x;
    const fromY = craft.y;
    integrate(craft, MEDIAN_BODY, dt, 1);
    const travelled = distance(fromX, fromY, craft.x, craft.y);
    const r = distance(0, 0, craft.x, craft.y);
    const worstStep = Math.max(best.worstStep, travelled);
    if (r < best.radius) {
      best = { radius: r, speed: speedOf(craft), seconds: step * dt, worstStep };
    } else {
      best = { ...best, worstStep };
      turned = true;
    }
  }

  expect(turned, 'the dive never turned — the trace is too short to hold a minimum').toBe(true);
  return best;
}

/**
 * The curve this file's assertions sit on, measured on these six geometries
 * against a 96-substep reference. Design units; spec 01's prototype figures are
 * a third of these.
 *
 * | substeps | worst Δ periapsis | worst Δ speed | worst integrated step |
 * |---|---|---|---|
 * | 1 | 2.138 | 10.93 | 20.60 |
 * | 2 | 1.107 | 5.570 | 10.30 |
 * | 3 | 0.742 | 3.655 | 6.867 |
 * | **6** | **0.365** | **1.787** | **3.433** |
 * | 12 | 0.171 | 0.837 | 1.717 |
 * | 48 | 0.025 | 0.120 | 0.429 |
 *
 * Six lands a factor of four inside both tolerances and one substep does not,
 * which is what makes the assertions below capable of failing. The worst
 * integrated step at six — 3.43 design units, or 1.14 in the units spec 01 §12
 * measured in — sits beside the prototype's measured worst of 1.45 over 474
 * seconds of real play, from a different integrator on a different geometry.
 */
describe('six substeps is converged, not chosen', () => {
  const reference = GEOMETRIES.map((g) => closestApproach(g, 96));

  it('agrees with a 96-substep reference across the envelope', () => {
    GEOMETRIES.forEach((geometry, i) => {
      const at6 = closestApproach(geometry, SUBSTEPS);
      const truth = reference[i]!;
      const where = describe_(geometry);
      expect(Math.abs(at6.radius - truth.radius), where).toBeLessThan(RADIUS_TOLERANCE);
      expect(Math.abs(at6.speed - truth.speed), where).toBeLessThan(SPEED_TOLERANCE);
    });
  });

  /**
   * The tolerance as spec 01 §12 actually words it: *"substep count sufficient
   * that halving it changes periapsis radius by < 0.5 units and periapsis speed
   * by < 2 units/s."* Halving is the real test — it says the count is past the
   * knee of the curve rather than merely near an answer.
   */
  it('is unchanged by halving the count, which is what converged means', () => {
    GEOMETRIES.forEach((geometry) => {
      const at6 = closestApproach(geometry, SUBSTEPS);
      const at3 = closestApproach(geometry, SUBSTEPS / 2);
      const where = describe_(geometry);
      expect(Math.abs(at6.radius - at3.radius), where).toBeLessThan(RADIUS_TOLERANCE);
      expect(Math.abs(at6.speed - at3.speed), where).toBeLessThan(SPEED_TOLERANCE);
    });
  });

  /**
   * And the other half of "converged": that sixteen times the work buys nothing
   * measurable is only interesting if *four* times the work would have been too
   * little. A count that is converged should have a visibly unconverged
   * neighbour below it, or the convergence test is passing on a curve that was
   * flat everywhere and proves nothing.
   */
  it('has an unconverged neighbour below it, so the test can fail at all', () => {
    const worst = GEOMETRIES.reduce((most, geometry, i) => {
      const at1 = closestApproach(geometry, 1);
      return Math.max(most, Math.abs(at1.radius - reference[i]!.radius));
    }, 0);
    expect(worst).toBeGreaterThan(RADIUS_TOLERANCE);
  });
});

describe('the stability margin', () => {
  /**
   * Spec 01 §12: the worst integrated step in 474 seconds of real play was 1.45
   * prototype units against a smallest body radius of 34 and a floor gap of 12.
   * The tolerance is an **opening position** — *"worst integrated step over a
   * full run below 4 units, giving at least an 8× margin on the smallest
   * body"* — and §13.7 says it should be replaced by a percentile of this
   * game's own play the first time there is one.
   */
  it('keeps every integrated step far shorter than the tightest feature in the field', () => {
    const worstStep = GEOMETRIES.reduce(
      (most, geometry) => Math.max(most, closestApproach(geometry, SUBSTEPS).worstStep),
      0,
    );
    expect(worstStep).toBeLessThan(4 * 3);

    // The smallest body spec 17 generates, converted: radius 32 → 96.
    expect(96 / worstStep).toBeGreaterThan(8);
  });
});
