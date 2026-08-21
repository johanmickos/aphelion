/**
 * The trailing floor: a climb should not be indefinitely reversible.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { beginCapture } from '../src/sim/capture.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import type { SimConfig } from '../src/sim/config.ts';

/** Drift straight up or down at a chosen speed and report what happened. */
function drift(cfg: SimConfig, vy: number, ticks: number) {
  const state = createInitialState(cfg);
  state.ship.vy = vy;
  let endedAt = -1;
  let deepest = 0;
  for (let i = 0; i < ticks; i++) {
    stepSim(state, cfg, NO_INPUT, FIXED_DT);
    deepest = Math.max(deepest, shipWorldPos(state).y - state.highWaterY);
    if (state.ending.active && endedAt < 0) endedAt = state.tick;
  }
  return { state, endedAt, deepest };
}

describe('falling behind the climb', () => {
  it('ends the run once you drop past the limit', () => {
    const r = drift(DEFAULT_CONFIG, 97, 600); // downward
    expect(r.endedAt).toBeGreaterThan(0);
    expect(r.state.ending.reason).toBe('fell-behind');
  });

  it('ends it at the configured depth, not before', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    state.ship.vy = 97;
    let dropAtEnd = 0;
    for (let i = 0; i < 600; i++) {
      const before = shipWorldPos(state).y - state.highWaterY;
      stepSim(state, cfg, NO_INPUT, FIXED_DT);
      if (state.ending.active) {
        dropAtEnd = before;
        break;
      }
    }
    // within one tick of travel of the limit
    expect(dropAtEnd).toBeGreaterThan(cfg.backtrackLimit - 97 * FIXED_DT - 1);
    expect(dropAtEnd).toBeLessThanOrEqual(cfg.backtrackLimit + 1);
  });

  it('leaves ordinary play alone', () => {
    // Real sessions drop 160-254px below their best in normal play; the limit
    // must sit clear of that.
    expect(DEFAULT_CONFIG.backtrackLimit).toBeGreaterThan(254 * 1.8);
  });

  it('never fires while climbing', () => {
    const r = drift(DEFAULT_CONFIG, -97, 2000);
    expect(r.state.ending.reason).not.toBe('fell-behind');
    expect(r.deepest).toBe(0);
  });

  it('ratchets: regaining height moves the floor up with you', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    // climb a long way, so the floor follows
    state.ship.vy = -97;
    for (let i = 0; i < 600; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    const high = state.highWaterY;
    expect(high).toBeLessThan(0);

    // now descend: it must end relative to the NEW high-water mark
    state.ship.vy = 97;
    let ended = -1;
    for (let i = 0; i < 900 && ended < 0; i++) {
      stepSim(state, cfg, NO_INPUT, FIXED_DT);
      if (state.ending.active) ended = i;
    }
    expect(ended).toBeGreaterThan(0);
    expect(state.ending.y).toBeCloseTo(high + cfg.backtrackLimit, -1);
  });

  it('resets with the run', () => {
    const r = drift(DEFAULT_CONFIG, 97, 600);
    const cfg = DEFAULT_CONFIG;
    // step through the ending hold to the respawn
    for (let i = 0; i < 60; i++) stepSim(r.state, cfg, NO_INPUT, FIXED_DT);
    expect(r.state.ending.active).toBe(false);
    expect(r.state.highWaterY).toBe(r.state.ship.y);
  });

  it('is disabled for the prototype config, so the gate is untouched', () => {
    expect(PROTOTYPE_CONFIG.backtrackLimit).toBe(0);
    const r = drift(PROTOTYPE_CONFIG, 97, 900);
    expect(r.state.ending.reason).not.toBe('fell-behind');
  });
});

describe('grab range', () => {
  it('refuses a body further away than the limit', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    const body = state.bodies[0]!;
    // sit just outside reach, straight below it
    state.ship.x = body.x;
    state.ship.y = body.y + cfg.grabRange + 10;
    expect(beginCapture(state, cfg)).toBe('refused-out-of-range');
    expect(state.capture).toBeNull();

    // and just inside it
    state.ship.y = body.y + cfg.grabRange - 10;
    expect(beginCapture(state, cfg)).toBe('captured');
  });

  it('reaches less far than a screen, so you can only grab what you can see', () => {
    // visible height is ~646 on a phone; the reach must sit under that
    expect(DEFAULT_CONFIG.grabRange).toBeLessThan(646);
    expect(DEFAULT_CONFIG.grabRange).toBeGreaterThan(400);
  });

  it('still reaches the opening body from the spawn', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    const body = state.bodies[0]!;
    const reach = Math.hypot(state.ship.x - body.x, state.ship.y - body.y);
    expect(reach, 'the first grab of every run would be refused').toBeLessThan(cfg.grabRange);
  });

  it('is unlimited for the prototype config, so the gate is untouched', () => {
    expect(PROTOTYPE_CONFIG.grabRange).toBe(0);
    const state = createInitialState(PROTOTYPE_CONFIG);
    const body = state.bodies[0]!;
    state.ship.x = body.x;
    state.ship.y = body.y + 3000;
    expect(beginCapture(state, PROTOTYPE_CONFIG)).toBe('captured');
  });
});
