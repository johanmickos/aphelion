/**
 * The trailing floor: a climb should not be indefinitely reversible.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { hypot } from '../src/sim/orbit.ts';
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

/**
 * Reported from a real session: "I grabbed a SUPER WIDE orbit around a larger
 * planet, circularized, and my orbit took me out of bounds."
 *
 * The ship never left the orbit and never lost a pixel of ground. A settled
 * circular orbit of radius r sets the high-water mark at its own APEX, and then
 * carries the ship 2r down the far side — so with the mark free to advance, any
 * orbit with 2r > backtrackLimit is fatal the moment it settles. The session's
 * was r=290 against a limit of 520: sixty pixels too tall.
 */
describe('an orbit is a round trip, not a climb', () => {
  /** Grab, hold long enough to settle, and report the widest orbit and the fate. */
  function orbit(cfg: SimConfig, pressAt: number, ticks: number) {
    const state = createInitialState(cfg);
    let held = false;
    let widest = 0;
    let markAtGrab: number | null = null;
    let deepest = 0;
    for (let i = 0; i < ticks; i++) {
      const pressed = i === pressAt;
      if (pressed) held = true;
      stepSim(state, cfg, { held: held || pressed, pressed, released: false }, FIXED_DT);
      const cap = state.capture;
      if (cap) {
        if (markAtGrab === null) markAtGrab = state.highWaterY;
        widest = Math.max(widest, hypot(cap.rx, cap.ry));
      }
      deepest = Math.max(deepest, shipWorldPos(state).y - state.highWaterY);
      if (state.ending.active) break;
    }
    return { state, widest, markAtGrab, deepest, reason: state.ending.reason };
  }

  it('holds the high-water mark still while a capture runs', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    let held = false;
    let markWhenGrabbed: number | null = null;
    let climbedInOrbit = 0;
    for (let i = 0; i < 500; i++) {
      const pressed = i === 120;
      if (pressed) held = true;
      stepSim(state, cfg, { held: held || pressed, pressed, released: false }, FIXED_DT);
      if (!state.capture) continue;
      if (markWhenGrabbed === null) markWhenGrabbed = state.highWaterY;
      // how far above the mark the orbit has carried the ship
      climbedInOrbit = Math.max(climbedInOrbit, markWhenGrabbed - shipWorldPos(state).y);
      expect(state.highWaterY, 'the orbit banked height it had not kept').toBe(markWhenGrabbed);
    }
    expect(
      climbedInOrbit,
      'the orbit never lifted the ship, so this proves nothing',
    ).toBeGreaterThan(50);
  });

  it('banks the release height, so letting go still counts', () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg);
    let held = false;
    let markInOrbit = 0;
    for (let i = 0; i < 400; i++) {
      const pressed = i === 120;
      const released = i === 260;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(state, cfg, { held: held || pressed, pressed, released }, FIXED_DT);
      if (state.capture) markInOrbit = state.highWaterY;
    }
    // the ship climbed away after release, so the mark must have moved on
    expect(state.highWaterY).toBeLessThan(markInOrbit);
  });

  it('lets a wide orbit complete, where a free mark would kill it', () => {
    // The same grab under both rules. Held, the drop is measured from where the
    // ship arrived; free, it is measured from the apex the orbit itself reached.
    const free = { ...DEFAULT_CONFIG, holdClimbInCapture: false };
    const wide = orbit(DEFAULT_CONFIG, 150, 1400);
    const wideFree = orbit(free, 150, 1400);
    expect(wide.widest, 'this grab does not make a wide enough orbit to test with').toBeGreaterThan(
      100,
    );
    expect(wide.deepest, 'the held mark still measured the drop from the apex').toBeLessThan(
      wideFree.deepest,
    );
    expect(wide.reason).not.toBe('fell-behind');
  });

  it('leaves room for an orbit wider than any yet recorded', () => {
    // Widest settled orbit over every session in diagnostics/ is r=294, and the
    // limit has to clear 2r or the orbit is fatal by construction. 700 covers
    // r=350. Ordinary play drops p90 222 and p99 396 below its best, so the
    // floor is still nowhere near what happens by accident.
    expect(DEFAULT_CONFIG.backtrackLimit).toBeGreaterThan(2 * 294);
    expect(DEFAULT_CONFIG.holdClimbInCapture).toBe(true);
    expect(PROTOTYPE_CONFIG.holdClimbInCapture, 'the gate would move').toBe(false);
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
