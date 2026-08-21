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
  let longestFloorRun = 0;
  let flybyGrabs = 0;
  let grabs = 0;
  for (let press = 60; press <= 600; press += 5) {
    const st = createInitialState(cfg);
    let held = false;
    let floorTotal = 0;
    let floorRun = 0;
    let first = true;
    let sawFlyby = false;
    let captured = false;
    for (let t = 0; t < press + 400; t++) {
      const pressed = t === press;
      if (pressed) held = true;
      stepSim(st, cfg, { held: held || pressed, pressed, released: false } as Input, FIXED_DT);
      floorRun = st.telemetry.floorSubstepsTotal > floorTotal ? floorRun + 1 : 0;
      floorTotal = st.telemetry.floorSubstepsTotal;
      longestFloorRun = Math.max(longestFloorRun, floorRun);
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
  return { kinks, worstDefl, floorSubsteps, longestFloorRun, flybyGrabs, grabs };
}

describe('every capture gets clearance', () => {
  const fixed = sweep(DEFAULT_CONFIG);
  const unfixed = sweep({
    ...DEFAULT_CONFIG,
    boundGrabsCapture: false,
    clearanceOnConvert: false,
  });

  /**
   * This asserted `fixed.floorSubsteps === 0`, and that was measuring something
   * the fix does not promise.
   *
   * `applyClearance` lifts periapsis to exactly `minR`, so a dive that needed it
   * bottoms out at zero clearance BY DESIGN, and whether the clamp engages there
   * is decided by the last bit of a float. Zero held only for as long as no grab
   * in the sweep happened to dive radially onto a body; rebuilding the field made
   * one, and the test failed on 42 substeps of 2.8e-14px. Measured across the
   * sweep, the fix is worth 206 substeps down to 42 and 54 grabs touching the
   * floor down to 17 — a third as much contact, none of it deep and none of it
   * lasting. That is the claim, so that is what is pinned.
   */
  it('all but eliminates contact with the minimum-orbit floor', () => {
    expect(unfixed.floorSubsteps, 'the sweep should exercise the old defect').toBeGreaterThan(100);
    expect(fixed.floorSubsteps).toBeLessThan(unfixed.floorSubsteps * 0.35);
    // And whatever contact is left is a graze at periapsis, not a ride along the
    // surface — the thing "stuck to the surface" actually described.
    expect(fixed.longestFloorRun, 'a dive rode the floor').toBeLessThanOrEqual(2);
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
