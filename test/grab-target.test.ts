/**
 * Which body a press takes, and when it refuses.
 *
 * Both rules were reported from real sessions and both are pinned against the
 * geometry those sessions recorded, not against invented numbers — the figures
 * in the comments come from replaying diagnostics/ and are quoted in the
 * DEFAULT_CONFIG rationale beside each key.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState } from '../src/sim/step.ts';
import { crashCone, grabTarget, nearestBody } from '../src/sim/capture.ts';
import type { SimConfig } from '../src/sim/config.ts';
import type { Body, SimState } from '../src/sim/types.ts';
import { BODY_TYPES } from '../src/sim/bodies.ts';

/** A bare planet at a chosen spot. Only x, y and R are ever read here. */
function planet(x: number, y: number, R: number, name: string): Body {
  return { kind: 'planet', type: 'planet', x, y, R, name, traits: BODY_TYPES.planet.traits };
}

/** Park the ship relative to two bodies and hand it a velocity. */
function twoBodies(cfg: SimConfig, ship: { x: number; y: number; vx: number; vy: number }) {
  const state = createInitialState(cfg);
  state.bodies = [planet(0, 0, 46, 'P1'), planet(0, -300, 41, 'P2')];
  Object.assign(state.ship, ship);
  return state;
}

describe('which body a press takes', () => {
  // Session 2026-08-21T18:16, tick 271: b0 120px behind and receding at
  // 270 px/s, b1 179px ahead and closing at 294 px/s. Raw distance handed the
  // player the planet they had just left, which became an instant flyby.
  const leaving = { x: 0, y: -120, vx: 0, vy: -300 };

  it('takes the body ahead when the nearest one is behind and receding', () => {
    const state = twoBodies(DEFAULT_CONFIG, leaving);
    expect(nearestBody(state, DEFAULT_CONFIG.grabLeadTime)).toBe(1);
    expect(grabTarget(state, DEFAULT_CONFIG).index).toBe(1);
  });

  it('still takes the nearest body when the ship is barely moving', () => {
    // The whole point of a lead rather than a heading test: a deliberate
    // re-grab of the planet behind you has to keep working. Nothing in 322
    // recorded presses flipped below 216 px/s.
    const state = twoBodies(DEFAULT_CONFIG, { ...leaving, vy: -30 });
    expect(nearestBody(state, DEFAULT_CONFIG.grabLeadTime)).toBe(0);
  });

  it('is continuous: the flip happens where the lead distances cross', () => {
    // 120 + 0.2v from b0 against 180 - 0.2v to b1 crosses at v = 150 px/s.
    const below = twoBodies(DEFAULT_CONFIG, { x: 0, y: -120, vx: 0, vy: -140 });
    const above = twoBodies(DEFAULT_CONFIG, { x: 0, y: -120, vx: 0, vy: -160 });
    expect(nearestBody(below, DEFAULT_CONFIG.grabLeadTime)).toBe(0);
    expect(nearestBody(above, DEFAULT_CONFIG.grabLeadTime)).toBe(1);
  });

  it('is plain nearest-body under the prototype config', () => {
    const state = twoBodies(PROTOTYPE_CONFIG, leaving);
    expect(PROTOTYPE_CONFIG.grabLeadTime).toBe(0);
    expect(nearestBody(state, PROTOTYPE_CONFIG.grabLeadTime)).toBe(0);
  });
});

describe('the crash cone', () => {
  /**
   * WELL BELOW THE ORIGIN, AND THAT IS LOAD-BEARING. `fieldBounds` starts its
   * crest search at y=0, so a fixture body at the origin IS the crest — which puts
   * the run-in carpet at [-560, 0] and the diving ship inside it, where a press
   * carves instead of grabbing and every assertion here reads `carved`. Dropping
   * the whole fixture 600px changes no distance and no angle in these tests; it
   * only moves it out of a band that is nothing to do with what they measure.
   */
  const TARGET = planet(0, 600, 40, 'P1');

  /** Head straight at a body from `surf` px above its surface. */
  function divingAt(cfg: SimConfig, surf: number): SimState {
    const state = createInitialState(cfg);
    state.bodies = [TARGET];
    Object.assign(state.ship, { x: 0, y: TARGET.y - (40 + surf), vx: 0, vy: 150 });
    return state;
  }

  it('lets the distance term decide, so severity falls off with range', () => {
    const near = crashCone(DEFAULT_CONFIG, divingAt(DEFAULT_CONFIG, 10), TARGET);
    const far = crashCone(DEFAULT_CONFIG, divingAt(DEFAULT_CONFIG, 45), TARGET);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.35);
  });

  it('refuses a grab that is genuinely too late', () => {
    const state = divingAt(DEFAULT_CONFIG, 10);
    expect(grabTarget(state, DEFAULT_CONFIG).result).toBe('refused-crash-cone');
  });

  it('allows the last-second save the corpus says is recoverable', () => {
    // All ten crash-cone refusals ever recorded sat 28-50px above the surface,
    // all ten were followed by a crash within 0.30s, and forcing each grab
    // through produces a clean capture. 38px is session 18:50 tick 2913.
    const state = divingAt(DEFAULT_CONFIG, 38);
    expect(grabTarget(state, DEFAULT_CONFIG).result).toBe('captured');
  });

  it('keeps the prototype binary, floor above the threshold', () => {
    // Pinned because it is the defect, not an accident: 0.4 clamps above the
    // 0.35 refusal gate, so crashConeRange is the only thing that matters and
    // distance within it is ignored.
    expect(PROTOTYPE_CONFIG.crashConeSeverityFloor).toBeGreaterThan(0.35);
    const state = divingAt(PROTOTYPE_CONFIG, 60);
    expect(crashCone(PROTOTYPE_CONFIG, state, TARGET)).toBe(0.4);
    expect(grabTarget(state, PROTOTYPE_CONFIG).result).toBe('refused-crash-cone');
  });
});
