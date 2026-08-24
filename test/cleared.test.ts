/**
 * Clearing the field: the one ending that is not a failure.
 *
 * The 2026-08-23 capture flew all sixty bodies and was then killed by the 800px
 * of empty space above the last one, scored `LOST — OFF COURSE`, and respawned in
 * under a second. These pin the three things that has to stop being true: the
 * clear fires, it fires at the crest rather than at the ceiling, and it does not
 * quietly respawn the way every other ending does.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import type { SimState } from '../src/sim/types.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import { fieldBounds } from '../src/sim/world.ts';

/** A ship placed just under the crest, climbing hard enough to cross it. */
function aboutToClear(cfg: SimConfig, below = 200): SimState {
  const state = createInitialState(cfg);
  const fb = fieldBounds(cfg, state.bodies);
  // Off to one side of the topmost body, so the climb passes it rather than
  // flying into it — an impact would end the run before the crest is reached.
  state.ship.x = fb.left + fb.width * 0.5 + 300;
  state.ship.y = fb.crest + below;
  state.ship.vx = 0;
  state.ship.vy = -400;
  state.ship.burstX = 0;
  state.ship.burstY = 0;
  state.highWaterY = state.ship.y;
  return state;
}

/** Step until the run ends, or `limit` ticks pass. */
function runOut(state: SimState, cfg: SimConfig, limit = 600): SimState {
  for (let i = 0; i < limit && !state.ending.active; i++) {
    stepSim(state, cfg, NO_INPUT, FIXED_DT);
  }
  return state;
}

describe('clearing the field', () => {
  const cfg = DEFAULT_CONFIG;

  it('ends the run as cleared when the ship rises past the crest', () => {
    const state = runOut(aboutToClear(cfg), cfg);
    expect(state.ending.active).toBe(true);
    expect(state.ending.reason).toBe('cleared');
  });

  it('fires at the crest, not at the ceiling 800px above it', () => {
    // The distinction the whole feature turns on. Ending at `top` would mean the
    // player crosses a line drawn in hazard red all run and is congratulated for
    // it — and that a session which flew the entire field could still die in the
    // empty space above it, which is exactly what the capture recorded.
    const state = runOut(aboutToClear(cfg), cfg);
    const fb = fieldBounds(cfg, state.bodies);
    expect(state.ending.y).toBeLessThanOrEqual(fb.crest);
    expect(state.ending.y, 'and nowhere near the ceiling').toBeGreaterThan(fb.top);
  });

  it('holds instead of respawning, because what comes next is not the sim’s call', () => {
    const state = runOut(aboutToClear(cfg), cfg);
    expect(state.ending.reason).toBe('cleared');
    // Every other ending lets go after `crashPause`. Step well past it.
    const held = Math.ceil((cfg.crashPause / FIXED_DT) * 3);
    for (let i = 0; i < held; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ending.active, 'a cleared field waits for the caller').toBe(true);
    expect(state.ending.t, 'while the clock still runs, so the moment can age').toBeGreaterThan(
      cfg.crashPause,
    );
  });

  it('still respawns on the endings that ARE failures', () => {
    // The guard against the hold leaking onto every death and making failure
    // expensive — the thing `lifecycle.ts` argues hardest against.
    const state = createInitialState(cfg);
    runOut(state, cfg, 5000);
    expect(state.ending.active).toBe(true);
    expect(state.ending.reason).not.toBe('cleared');
    const held = Math.ceil((cfg.crashPause / FIXED_DT) * 3);
    for (let i = 0; i < held; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ending.active, 'a failure lets go on its own').toBe(false);
  });
});

describe('the prototype never clears', () => {
  it('is off in PROTOTYPE_CONFIG, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.clearAtTop).toBe(false);
    expect(DEFAULT_CONFIG.clearAtTop).toBe(true);
  });

  it('flies straight through the crest to the ceiling with the flag off', () => {
    // Proves the flag is what decides it, not something incidental about the
    // fixture: same climb, same field, opposite ending.
    const off: SimConfig = { ...DEFAULT_CONFIG, clearAtTop: false };
    const state = runOut(aboutToClear(off), off);
    expect(state.ending.reason).toBe('out-of-bounds');
    const fb = fieldBounds(off, state.bodies);
    expect(state.ending.y).toBeLessThan(fb.top);
  });
});

describe('the crest is named rather than re-derived', () => {
  it('sits exactly at the topmost body', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, state.bodies);
    let highest = 0;
    for (const b of state.bodies) if (b.y < highest) highest = b.y;
    expect(fb.crest).toBe(highest);
  });

  it('keeps the ceiling a fixed margin above it', () => {
    // Before `crest` existed, the clear line had to be recovered by adding 800
    // back onto `top` — the same magic number written in two places, free to
    // disagree. This is the relationship, asserted once.
    const state = createInitialState(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, state.bodies);
    expect(fb.crest - fb.top).toBe(800);
  });
});
