/**
 * The **trail** — spec [02 · §6](../../docs/spec/02-release.md)'s *"solid
 * luminous line"* and spec [08 · §8](../../docs/spec/08-economy.md)'s one pixel
 * for the carry.
 *
 * Two halves, in two layers, and both are here because the claim spans them: the
 * geometry is presentation state's ([`trail.ts`](../../src/state/trail.ts)) and
 * the brightness is the renderer's reading of the ledger
 * ([`trail.ts`](../../src/render/trail.ts)) — which is what lets ZEN keep the
 * line with the ledger deleted.
 */
import { describe, expect, it } from 'vitest';
import { NO_TRAIL, TRAIL_SAMPLES, TRAIL_SPACING, trailOf } from '../../src/state/trail.ts';
import { CARRY_HALF, TRAIL_FLOOR, trailLit } from '../../src/render/trail.ts';
import type { SimState } from '../../src/sim/types.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

const world = (x: number, y: number): SimState => ({ craft: { x, y } }) as unknown as SimState;

describe('the line', () => {
  /** It opens empty — ADR-0015's second rule. A run does not inherit a wake. */
  it('opens with nothing behind it', () => {
    expect(NO_TRAIL).toEqual([]);
  });

  /**
   * The prototype's own behaviour, carried: **a minimum world spacing**, so a
   * craft hanging at an orbit's apex keeps a wake with a length rather than
   * sixteen points in a puddle.
   */
  it('takes no sample until the craft has moved a spacing', () => {
    const one = trailOf(NO_TRAIL, world(0, 0));
    expect(one).toHaveLength(1);
    expect(trailOf(one, world(TRAIL_SPACING * 0.9, 0))).toBe(one);
    expect(trailOf(one, world(TRAIL_SPACING * 1.1, 0))).toHaveLength(2);
  });

  /** And a bounded count, so the trail is a wake rather than a route. */
  it('never grows past its sample count', () => {
    let trail = NO_TRAIL;
    for (let step = 0; step < TRAIL_SAMPLES * 4; step++) {
      trail = trailOf(trail, world(step * TRAIL_SPACING * 2, 0));
    }
    expect(trail).toHaveLength(TRAIL_SAMPLES);
    // Oldest first, and the newest sample is where the craft last was.
    expect(trail[trail.length - 1]!.x).toBe((TRAIL_SAMPLES * 4 - 1) * TRAIL_SPACING * 2);
  });

  /**
   * **Nowhere the craft has not been.** The wake is the craft's own line through
   * the field, so a sample that was not a place the craft stood would be a line
   * about something else — which is the failure a sampled decoration has and a
   * trail must not.
   */
  it('holds only places the craft has stood', () => {
    const { views } = pricedRun(shippedRecipe());
    const stood = new Set<string>();
    for (let tick = 0; tick <= 600; tick++) {
      const view = views[tick]!;
      stood.add(`${view.craft.x},${view.craft.y}`);
    }
    const trail = views[600]!.trail;
    expect(trail.length).toBeGreaterThan(1);
    for (const point of trail) expect(stood.has(`${point.x},${point.y}`)).toBe(true);
  });
});

describe('the brightness', () => {
  /**
   * ADR-0008: *"the carry display must stay legible at values a single swing
   * could never reach."*
   *
   * Measured over the 26 dispatches this build replays, the live carry runs p50
   * **214** and reaches **1 225**. The curve is half way up at the median, still
   * climbing at the corpus maximum, and has no value at which it stops
   * separating one carry from another.
   */
  it('never saturates', () => {
    expect(trailLit(0)).toBe(TRAIL_FLOOR);
    expect(trailLit(CARRY_HALF)).toBeCloseTo(TRAIL_FLOOR + (1 - TRAIL_FLOOR) / 2, 10);
    expect(trailLit(1225)).toBeGreaterThan(trailLit(734));
    expect(trailLit(12_250)).toBeGreaterThan(trailLit(1225));
    expect(trailLit(1e9)).toBeLessThan(1);
  });

  /** Strictly increasing in the carry, so a bigger stake is never a dimmer line. */
  it('rises with every point carried', () => {
    let last = trailLit(0);
    for (let carry = 1; carry < 5000; carry += 7) {
      const lit = trailLit(carry);
      expect(lit).toBeGreaterThan(last);
      last = lit;
    }
  });

  /**
   * And a run with no ledger draws the same line at its floor — spec 08 §7's
   * ZEN, which is *"motion and light"* and would be neither with the wake out.
   */
  it('has a floor, so ZEN still has a wake', () => {
    expect(TRAIL_FLOOR).toBeGreaterThan(0);
    expect(trailLit(0)).toBe(TRAIL_FLOOR);
  });
});
