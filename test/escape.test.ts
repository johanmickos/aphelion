/**
 * Getting out of the dead zone alive, and what it is worth.
 *
 * Three promises, and the first is the one the others rest on: the reward must
 * not tax the manoeuvre. An earlier version added the speed at the moment of the
 * escape and it cost 56-64% of the link points those captures used to earn, because
 * speed added mid-capture is speed the capture has to shed to convert and settle.
 * Everything now lands at the release, and the capture itself is untouched.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import { fingerprint } from '../src/sim/serialize.ts';
import { hypot } from '../src/sim/orbit.ts';

const NONE: Input = { held: false, pressed: false, released: false };
const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };
const UP: Input = { held: false, pressed: false, released: true };

/** A drift at the right wall that presses late enough to end up in the band. */
const WALL = { x: 165.5, y: 150, vx: 150, vy: -60 };

interface Flight {
  state: SimState;
  /** Fingerprint at every tick, so two runs can be compared exactly. */
  prints: number[];
  escapedAt: number;
  fuelAtEscape: number;
  releaseSpeed: number;
  burst: number;
}

/** Press at `press`, hold to `release`, then drift. */
function fly(cfg: SimConfig, press: number, release: number, ticks = 400): Flight {
  const state = createInitialState(cfg);
  Object.assign(state.ship, WALL);
  const out: Flight = {
    state,
    prints: [],
    escapedAt: -1,
    fuelAtEscape: 0,
    releaseSpeed: 0,
    burst: 0,
  };
  let held = false;
  for (let t = 0; t < ticks; t++) {
    let input = NONE;
    if (t === press) {
      held = true;
      input = PRESS;
    } else if (t === release) {
      held = false;
      input = UP;
    } else if (held) {
      input = HOLD;
    }
    const before = state.fuel;
    stepSim(state, cfg, input, FIXED_DT);
    if (state.capture?.escaped && out.escapedAt < 0) {
      out.escapedAt = t;
      out.fuelAtEscape = state.fuel - before;
    }
    if (t === release) {
      out.releaseSpeed = hypot(state.ship.vx, state.ship.vy);
      out.burst = hypot(state.ship.burstX, state.ship.burstY);
    }
    out.prints.push(fingerprint(state));
    if (state.ending.active) break;
  }
  return out;
}

const off: SimConfig = { ...DEFAULT_CONFIG, escapeFling: 0, escapeRefund: 0 };

describe('escaping the dead zone', () => {
  it('notices a capture that stops closing on a wall from inside the band', () => {
    const f = fly(DEFAULT_CONFIG, 100, 300);
    expect(f.escapedAt, 'the fixture is meant to escape').toBeGreaterThan(0);
  });

  it('does not notice a capture that never went near a wall', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    let held = false;
    for (let t = 0; t < 300; t++) {
      let input = NONE;
      if (t === 18) {
        held = true;
        input = PRESS;
      } else if (held) input = HOLD;
      stepSim(state, DEFAULT_CONFIG, input, FIXED_DT);
      expect(state.capture?.escaped ?? false, `escaped at tick ${t}`).toBe(false);
    }
  });

  it('changes nothing at all until the release', () => {
    // THE PROMISE THE WHOLE DESIGN RESTS ON. Every tick up to the release is
    // bit-identical with the feature off, so the reward cannot tax the manoeuvre
    // it is rewarding — which the version that kicked mid-arc demonstrably did.
    const a = fly(off, 100, 300);
    const b = fly({ ...DEFAULT_CONFIG, escapeRefund: 0 }, 100, 300);
    expect(b.escapedAt, 'and it really did escape').toBeGreaterThan(0);
    for (let t = 0; t < 300; t++) {
      expect(b.prints[t], `tick ${t} differs before the release`).toBe(a.prints[t]);
    }
    expect(b.prints[300], 'and differs at it').not.toBe(a.prints[300]);
  });

  it('flings harder on the way out, as a burst plus a permanent carry', () => {
    const a = fly(off, 100, 300);
    const b = fly({ ...DEFAULT_CONFIG, escapeRefund: 0 }, 100, 300);
    expect(b.releaseSpeed, 'the lasting half').toBeGreaterThan(a.releaseSpeed);
    expect(b.burst, 'and the fading half').toBeGreaterThan(a.burst);
  });

  it('hands fuel back at the escape, and only for what is still out of pocket', () => {
    const none = fly({ ...DEFAULT_CONFIG, escapeRefund: 0 }, 100, 300);
    const half = fly(DEFAULT_CONFIG, 100, 300);
    expect(none.fuelAtEscape, 'no refund, no fuel back on that tick').toBeLessThanOrEqual(0);
    expect(half.fuelAtEscape, 'half the unrefunded spend comes back').toBeGreaterThan(0);

    // Never more than was spent. `flybyConvertRefund` may already have returned
    // some of the brake, and note 29 is titled "A rescue paid for itself twice".
    const cap = half.state.capture;
    if (cap) expect(cap.fuelBack).toBeLessThanOrEqual(cap.fuelSpent + 1e-9);
  });

  it('is inert in the prototype, so the equality gate cannot see it', () => {
    expect(PROTOTYPE_CONFIG.escapeFling).toBe(0);
    expect(PROTOTYPE_CONFIG.escapeRefund).toBe(0);
    // And the band is stated in three places that must agree; `test/score.test.ts`
    // pins all three together.
    expect(PROTOTYPE_CONFIG.escapeBandWidth).toBe(DEFAULT_CONFIG.escapeBandWidth);
  });
});
