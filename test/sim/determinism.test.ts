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
import { openField } from './fixtures.ts';

const TICKS = 3600; // a minute of play

/** The one verb, held down. */
const PRESSED = { pressed: true };

/**
 * A run: a field, a starting craft, a seed, and an input log.
 *
 * The log is where the swing enters, and it is one button: pressed between a
 * grab tick and its release tick, up the rest of the time. That is the whole of
 * what a recipe carries (ADR-0004), so a run driven this way is a run the replay
 * of [M1.5](../../docs/plan/m1-the-swing.md) will have to reproduce exactly.
 *
 * The bodies are placed along the craft's own path so that all five presses land
 * on real grabs: the run flies **five complete swings** — dive, freeze, settle,
 * release, coast — rather than pressing at empty space. A draw from the seeded
 * stream is taken at each press so the run's determinism covers the stream as
 * well as the physics.
 */
function fly(seed: number, ticks: number, onSnapshot?: (bytes: Uint8Array) => void): SimState {
  const field = openField([
    createBody(0, 0, MEDIAN_RADIUS),
    createBody(1412, -1652, MEDIAN_RADIUS * 0.8),
    createBody(1478, 3322, MEDIAN_RADIUS * 1.2),
    createBody(-4850, 3036, MEDIAN_RADIUS * 0.9),
    createBody(-9557, -472, MEDIAN_RADIUS * 1.1),
  ]);
  const state = createInitialState(field, createCraft(-1400, 620, 431.7, 233.11), seed);
  const grabs = [40, 640, 1300, 2100, 3000];
  const releases = [420, 1010, 1780, 2600, 3400];

  let holding = false;
  for (let tick = 1; tick <= ticks; tick++) {
    if (grabs.includes(tick)) {
      holding = true;
      // A draw per press, so the stream is part of what has to replay.
      nextFraction(state.rng);
    }
    if (releases.includes(tick)) holding = false;
    stepSim(state, holding ? PRESSED : NO_INPUT);
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
    expect(Object.keys(state).sort()).toEqual([
      'craft',
      'dive',
      'ending',
      'field',
      'heldBody',
      'highWater',
      'orbit',
      'pressed',
      'rng',
      'tick',
    ]);
    // The three `burst` fields are the release's transient (spec 01 §8), which
    // moves the craft and is therefore world state — a snapshot that did not see
    // it would call two different runs the same run.
    expect(Object.keys(state.craft).sort()).toEqual([
      'burst',
      'burstLeft',
      'burstSpan',
      'vx',
      'vy',
      'x',
      'y',
    ]);
    expect(Object.keys(fly(1, 100).dive!).sort()).toEqual([
      'clearanceTicks',
      'grabRadius',
      'peakEnergy',
      'smallestRadius',
    ]);
    expect(Object.keys(fly(1, 300).orbit!).sort()).toEqual([
      'depth',
      'direction',
      'eccentricity',
      'momentum',
      'periapsis',
      'periapsisAngle',
      'phase',
      'ticksSinceFreeze',
    ]);
    expect(Object.keys(state.field).sort()).toEqual(['bodies', 'corridor']);
    expect(Object.keys(state.field.corridor).sort()).toEqual(['centreline', 'foot', 'halfWidth']);
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

    // And the two halves of a swing, which are the state M1.3 added: a run
    // mid-dive and the same run mid-orbit are different runs, and so are two
    // orbits a picometre of phase apart.
    const midDive = fly(1, 100);
    const midOrbit = fly(1, 300);
    expect(midDive.dive).not.toBeNull();
    expect(midOrbit.orbit).not.toBeNull();
    expect(firstDifference(snapshot(midDive), snapshot(midOrbit))).not.toBe(-1);

    const nudged = fly(1, 300);
    nudged.orbit!.phase += 1e-12;
    expect(firstDifference(snapshot(midOrbit), snapshot(nudged))).not.toBe(-1);

    const pressed = fly(1, 300);
    pressed.pressed = !pressed.pressed;
    expect(firstDifference(bytes, snapshot(pressed))).not.toBe(-1);

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
