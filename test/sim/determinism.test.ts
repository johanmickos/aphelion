/**
 * M1.2's acceptance, and ADR-0004's contract: *"a run is fully described by its
 * configuration, its seed and its input log"*, and spec
 * [01 · §12a](../../docs/spec/01-swing.md)'s tolerance — *"a recipe replayed
 * twice on the same engine produces **byte-identical** state at every tick."*
 *
 * Byte-identical, at every tick, and not merely at the end: a divergence that
 * appears at tick 400 and is gone by tick 4000 is still a divergence, and the
 * end state would not see it.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { nextFraction } from '../../src/sim/rng.ts';
import { firstDifference, snapshot } from '../../src/sim/snapshot.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';

const TICKS = 3600; // a minute of play

/**
 * A run: a field, a starting craft, a seed, and a script of when the craft is
 * held.
 *
 * The script is a **fixture, not a mechanism.** Being caught by a body and
 * letting go of one are the grab and the release, and both are M1.3's; what this
 * needs is for both code paths in `stepSim` to be exercised by something
 * reproducible, and a list of tick numbers is the simplest thing that does it.
 */
function fly(seed: number, ticks: number, onSnapshot?: (bytes: Uint8Array) => void): SimState {
  const field = {
    bodies: [
      createBody(0, 0, MEDIAN_RADIUS),
      createBody(900, 1400, MEDIAN_RADIUS * 0.8),
      createBody(-1100, 2600, MEDIAN_RADIUS * 1.2),
    ],
  };
  const state = createInitialState(field, createCraft(-1400, 620, 431.7, 233.11), seed);
  const grabs = [40, 640, 1300, 2100, 3000];
  const releases = [420, 1010, 1780, 2600, 3400];

  for (let tick = 1; tick <= ticks; tick++) {
    if (grabs.includes(tick)) {
      state.heldBody = Math.floor(nextFraction(state.rng) * field.bodies.length);
    }
    if (releases.includes(tick)) state.heldBody = null;
    stepSim(state, NO_INPUT);
    onSnapshot?.(snapshot(state));
  }
  return state;
}

describe('a recipe replayed twice', () => {
  it('produces byte-identical state at every one of 3600 ticks', () => {
    const first: Uint8Array[] = [];
    fly(2026, TICKS, (bytes) => first.push(bytes));

    let tick = 0;
    fly(2026, TICKS, (bytes) => {
      const at = firstDifference(first[tick]!, bytes);
      expect(at, `tick ${tick + 1} diverged at byte ${at}`).toBe(-1);
      tick += 1;
    });
    expect(tick).toBe(TICKS);
  });

  /**
   * The test above passes trivially if `snapshot` returns the same bytes for
   * every state — so this proves it does not, on the two things a determinism
   * bug would actually move.
   */
  it('is a comparison that can fail, on the seed and on the tick', () => {
    expect(firstDifference(snapshot(fly(1, 600)), snapshot(fly(2, 600)))).not.toBe(-1);
    expect(firstDifference(snapshot(fly(1, 600)), snapshot(fly(1, 601)))).not.toBe(-1);
  });

  it('reaches the same place from the same seed however many runs are interleaved', () => {
    const a = fly(7, 900);
    fly(8, 900);
    fly(9, 900);
    const b = fly(7, 900);
    expect(firstDifference(snapshot(a), snapshot(b))).toBe(-1);
  });
});

describe('the snapshot', () => {
  /**
   * The guard that keeps the test above honest as the simulation grows. A field
   * added to `SimState` and not written into the snapshot would be a field two
   * runs could disagree about silently — so adding one has to fail here until
   * `snapshot.ts` is taught about it.
   */
  it('covers every field of SimState, so nothing escapes the comparison', () => {
    const state = fly(1, 1);
    expect(Object.keys(state).sort()).toEqual(['craft', 'field', 'heldBody', 'rng', 'tick']);
    expect(Object.keys(state.craft).sort()).toEqual(['vx', 'vy', 'x', 'y']);
    expect(Object.keys(state.field).sort()).toEqual(['bodies']);
    expect(Object.keys(state.field.bodies[0]!).sort()).toEqual([
      'mass',
      'radius',
      'type',
      'x',
      'y',
    ]);
  });

  it('sees a change in any one of them', () => {
    const base = fly(1, 300);
    const bytes = snapshot(base);

    const moved = fly(1, 300);
    moved.craft.x += 1e-12;
    expect(firstDifference(bytes, snapshot(moved))).not.toBe(-1);

    const held = fly(1, 300);
    held.heldBody = held.heldBody === null ? 0 : null;
    expect(firstDifference(bytes, snapshot(held))).not.toBe(-1);

    const drawn = fly(1, 300);
    nextFraction(drawn.rng);
    expect(firstDifference(bytes, snapshot(drawn))).not.toBe(-1);
  });

  /**
   * A float64 written whole keeps `-0` apart from `0`. A `===` comparison calls
   * them equal, and they are a genuine divergence: two runs that produced
   * different bits produced different runs.
   */
  it('tells a negative zero from a zero', () => {
    const zero = fly(1, 60);
    zero.craft.vy = 0;
    const negative = fly(1, 60);
    negative.craft.vy = -0;
    expect(negative.craft.vy === zero.craft.vy).toBe(true);
    expect(firstDifference(snapshot(zero), snapshot(negative))).not.toBe(-1);
  });
});
