/**
 * Where the anomaly is, and what the sky reads off it.
 *
 * Spec [05 · §5](../../docs/spec/05-field.md) places its extent *"by the day
 * recipe (spec 17)"* and spec 17's generator does not exist, so what is asserted
 * here is mostly the **property** the stand-in has to have rather than the
 * numbers it currently produces: it is a pure function of the field, it replays,
 * and it needs no clock and no random stream (ADR-0004, ADR-0014). Those survive
 * the generator arriving. The two numbers that do not — where it sits and how
 * tall it is — are asserted once each, as the record of what was flown.
 *
 * The sky's own ramp is asserted against spec 05 §2's **≤ 6%**, which is the
 * acceptance criterion M3.3 is written on: *nothing outside an anomaly repaints
 * the sky.*
 */
import { describe, expect, it } from 'vitest';
import {
  ANOMALY_AT,
  ANOMALY_SPAN,
  SKY_LEAD,
  SKY_TINT,
  anomalyAt,
  anomalyOf,
} from '../../src/state/anomaly.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { METRE } from '../../src/sim/units.ts';
import { DESIGN_HEIGHT } from '../../src/state/design.ts';
import type { Field } from '../../src/sim/types.ts';

const FIELD = fixtureField();
const FOOT = FIELD.corridor.foot;

/** An altitude in metres above the field's foot, as a design `y`. */
const at = (metres: number): number => FOOT - metres * METRE;
/** And back, so a failure prints a number the author can read off a rung. */
const metresOf = (y: number): number => (FOOT - y) / METRE;

const PLACED = anomalyAt(FIELD)!;

describe('where the anomaly is', () => {
  it('is one contiguous stretch, top above bottom', () => {
    expect(PLACED.top).toBeLessThan(PLACED.bottom);
    expect(PLACED.bottom - PLACED.top).toBe(ANOMALY_SPAN);
  });

  /**
   * **800 m**, which is the prototype's own `shelter` diameter carried as a
   * magnitude rather than as a mechanism — see `ANOMALY_SPAN`. Asserted in metres
   * because that is the unit the field is a ruler in (spec 05 §6) and the unit
   * spec 17 will place its own in.
   */
  it('is 800 metres tall', () => {
    expect((PLACED.bottom - PLACED.top) / METRE).toBe(800);
  });

  /**
   * The record of what the author flew: foot at 4 140 m, middle at 4 540, top at
   * 4 940. Over the 13 dispatches replaying at `SIM_VERSION` 9 this is reached by
   * three and flown through by two, which is the rarity §5's *"the baseline's
   * restraint is what keeps it rare"* is about.
   */
  it('sits where the prototype places a single anomaly', () => {
    expect(Math.round(metresOf(PLACED.bottom))).toBe(4140);
    expect(Math.round(metresOf(PLACED.top))).toBe(4940);
  });

  /** And it is somewhere you have to climb to reach, which is the carried behaviour. */
  it('is well above the spawn, and below the top of the field', () => {
    const spawn = fixtureCraft().y;
    expect(PLACED.bottom).toBeLessThan(spawn);
    expect(metresOf(PLACED.bottom) - metresOf(spawn)).toBeGreaterThan(2000);
    const highest = Math.min(...FIELD.bodies.map((body) => body.y));
    expect(PLACED.top).toBeGreaterThan(highest);
  });

  /**
   * **The property that outlives the numbers.** ADR-0004 makes determinism the
   * contract, and a decoration placed from a clock or a stream would break it
   * quietly: two players flying one day would meet the weather in two places, and
   * a replay would show a run that was never flown.
   */
  it('is a pure function of the field, and says the same thing every time', () => {
    for (let i = 0; i < 5; i++) expect(anomalyAt(fixtureField())).toEqual(PLACED);
  });

  it('moves with the field it is placed in', () => {
    const taller: Field = {
      ...FIELD,
      bodies: FIELD.bodies.map((body) => ({ ...body, y: body.y * 2 })),
    };
    const moved = anomalyAt(taller)!;
    expect(moved.top).toBeLessThan(PLACED.top);
    // Still the same fraction of the way up the bodies it was given.
    const lowest = Math.max(...taller.bodies.map((body) => body.y));
    const highest = Math.min(...taller.bodies.map((body) => body.y));
    const middle = (moved.top + moved.bottom) / 2;
    expect((lowest - middle) / (lowest - highest)).toBeCloseTo(ANOMALY_AT, 10);
  });

  /**
   * A field with no bodies and no foot is not hypothetical:
   * `tools/check-portability.ts` builds exactly that one, and it is how
   * [`hasRungs`](../../src/state/rung.ts) was found to be needed.
   */
  it('places none in a field that has nowhere to put one', () => {
    expect(anomalyAt({ ...FIELD, bodies: [] })).toBeNull();
    expect(
      anomalyAt({ ...FIELD, corridor: { ...FIELD.corridor, foot: Number.POSITIVE_INFINITY } }),
    ).toBeNull();
  });
});

describe('the sky over it', () => {
  const warmthAt = (metres: number): number => anomalyOf(FIELD, at(metres))!.warmth;

  /**
   * **The acceptance criterion, and the reason it is written as a tint rather
   * than as a distance**: spec 05 §2's stack table and §4's prose both cap the
   * sky at 6% outside an anomaly, and *nothing outside it repaints the sky* is
   * what M3.3 is accepted on. Swept over the whole field rather than sampled, so
   * a ramp that overshot anywhere fails.
   */
  it('never spends more than spec 05 §2 allows, anywhere in the field', () => {
    for (let metres = 0; metres < 7000; metres += 5) {
      const view = anomalyOf(FIELD, at(metres))!;
      expect(view.warmth).toBeGreaterThanOrEqual(0);
      expect(view.warmth).toBeLessThanOrEqual(1);
      if (!view.inside) expect(view.warmth * SKY_TINT).toBeLessThanOrEqual(SKY_TINT);
    }
  });

  it('is at rest everywhere further than the lead', () => {
    const clear = SKY_LEAD / METRE + 1;
    expect(warmthAt(metresOf(PLACED.bottom) - clear)).toBe(0);
    expect(warmthAt(metresOf(PLACED.top) + clear)).toBe(0);
    // And that is most of the field: off VOID over 2 488 m of the fixture's
    // 6 828, so at rest over 64% of it — and perceptibly at rest over 74%,
    // because only the last 498 m of each ramp moves a channel at all.
    const off = (2 * SKY_LEAD + ANOMALY_SPAN) / METRE;
    expect(off / 6828).toBeLessThan(0.37);
    const seen = (2 * 498 * METRE + ANOMALY_SPAN) / METRE;
    expect(seen / 6828).toBeLessThan(0.27);
  });

  it('rises to the whole of the allowance at the edge, and holds it inside', () => {
    expect(warmthAt(metresOf(PLACED.bottom))).toBeCloseTo(1, 10);
    expect(warmthAt(metresOf(PLACED.top))).toBeCloseTo(1, 10);
    expect(warmthAt((metresOf(PLACED.top) + metresOf(PLACED.bottom)) / 2)).toBe(1);
  });

  /**
   * **Never spent early**, as arithmetic. A square holds the budget back: a
   * quarter of the way along the lead the tint is 0.4%, which moves no 8-bit
   * channel by more than one level out of 255. A linear ramp would be at 1.5%
   * there.
   */
  it('is imperceptible for the first quarter of its lead', () => {
    const foot = metresOf(PLACED.bottom);
    const quarter = foot - (SKY_LEAD * 3) / 4 / METRE;
    const tint = warmthAt(quarter) * SKY_TINT;
    expect(tint).toBeCloseTo(0.06 * 0.0625, 6);
    // VOID → AURORA, per channel, at that tint. Nothing moves by more than one.
    for (const span of [147, 99, 235]) expect(Math.round(span * tint)).toBeLessThanOrEqual(1);
  });

  /**
   * **And perceptible before the anomaly's foot can be seen**, which is the floor
   * `SKY_LEAD` is derived against: the design space shows 1 266 design units above
   * the craft, so a ramp whose visible part is shorter than that starts warming
   * after the curtains are already on screen.
   */
  it('is a level above VOID before the anomaly can appear at the top of the picture', () => {
    const foot = metresOf(PLACED.bottom);
    const horizon = foot - DESIGN_HEIGHT / 2 / METRE;
    const tint = warmthAt(horizon) * SKY_TINT;
    // The weakest channel is green, at 99 levels between the two tokens.
    expect(Math.round(99 * tint)).toBeGreaterThanOrEqual(1);
  });

  it('rises the whole way in and falls the whole way out, without a step', () => {
    let previous = 0;
    const foot = metresOf(PLACED.bottom);
    for (let metres = foot - SKY_LEAD / METRE; metres <= foot; metres += 1) {
      const now = warmthAt(metres);
      expect(now).toBeGreaterThanOrEqual(previous);
      expect(now - previous).toBeLessThan(0.01);
      previous = now;
    }
    expect(previous).toBeCloseTo(1, 6);
  });

  it('knows when the craft is inside it and when it is not', () => {
    expect(anomalyOf(FIELD, PLACED.bottom + 1)!.inside).toBe(false);
    expect(anomalyOf(FIELD, PLACED.bottom - 1)!.inside).toBe(true);
    expect(anomalyOf(FIELD, PLACED.top + 1)!.inside).toBe(true);
    expect(anomalyOf(FIELD, PLACED.top - 1)!.inside).toBe(false);
  });
});
