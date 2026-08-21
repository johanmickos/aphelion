/**
 * Clearance: the impulse that keeps a dive from going through the surface.
 *
 * PORT_NOTES 18. The prototype skipped it for 41% of grabs, which is what "stuck
 * to the surface" and the floor-bounce kink both were.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { hypot } from '../src/sim/orbit.ts';
import type { Input } from '../src/sim/types.ts';

/** Sweep every grab the field allows and report how the dives went. */
function sweep(cfg: SimConfig) {
  let kinks = 0;
  let worstDefl = 0;
  let floorSubsteps = 0;
  let flybyGrabs = 0;
  let grabs = 0;
  for (let press = 60; press <= 600; press += 5) {
    const st = createInitialState(cfg);
    let held = false;
    let first = true;
    let sawFlyby = false;
    let captured = false;
    for (let t = 0; t < press + 400; t++) {
      const pressed = t === press;
      if (pressed) held = true;
      stepSim(st, cfg, { held: held || pressed, pressed, released: false } as Input, FIXED_DT);
      const cap = st.capture;
      if (!cap) {
        first = true;
        continue;
      }
      captured = true;
      if (cap.phase === 'flyby') sawFlyby = true;
      if (first) {
        first = false;
        continue;
      }
      if (cap.defl > 15) kinks++;
      worstDefl = Math.max(worstDefl, cap.defl);
    }
    if (captured) grabs++;
    if (sawFlyby) flybyGrabs++;
    floorSubsteps += st.telemetry.floorSubstepsTotal;
  }
  return { kinks, worstDefl, floorSubsteps, flybyGrabs, grabs };
}

describe('every capture gets clearance', () => {
  const fixed = sweep(DEFAULT_CONFIG);
  const unfixed = sweep({
    ...DEFAULT_CONFIG,
    boundGrabsCapture: false,
    clearanceOnConvert: false,
  });

  it('no dive reaches the minimum-orbit floor', () => {
    expect(unfixed.floorSubsteps, 'the sweep should exercise the old defect').toBeGreaterThan(100);
    expect(fixed.floorSubsteps).toBe(0);
  });

  it('no capture kinks', () => {
    expect(unfixed.kinks).toBeGreaterThan(20);
    expect(fixed.kinks).toBe(0);
    expect(fixed.worstDefl, 'a capture deflected past the visible-kink threshold').toBeLessThan(15);
  });

  it('a bound grab is never called a flyby, whichever way it happens to point', () => {
    // Being momentarily outbound while at a quarter of escape speed is not a
    // flyby; the ship is coming back regardless.
    expect(unfixed.flybyGrabs).toBeGreaterThan(20);
    expect(fixed.flybyGrabs).toBe(0);
  });

  it('still captures everything it used to', () => {
    expect(fixed.grabs).toBe(unfixed.grabs);
  });

  it('leaves the prototype behaviour alone, so the gate is untouched', () => {
    expect(PROTOTYPE_CONFIG.boundGrabsCapture).toBe(false);
    expect(PROTOTYPE_CONFIG.clearanceOnConvert).toBe(false);
  });

  it('a grab well below escape speed captures directly', () => {
    const cfg = DEFAULT_CONFIG;
    const st = createInitialState(cfg);
    // drift up to just past the first body, so the ship is momentarily outbound
    let held = false;
    for (let t = 0; t <= 240; t++) {
      const pressed = t === 240;
      if (pressed) held = true;
      stepSim(st, cfg, { held: held || pressed, pressed, released: false } as Input, FIXED_DT);
    }
    const cap = st.capture!;
    expect(cap.phase).not.toBe('flyby');
    expect(cap.clearFramesLeft, 'clearance was not applied to this capture').toBeGreaterThan(0);
    expect(hypot(cap.rx, cap.ry)).toBeGreaterThanOrEqual(cap.minR);
  });
});
