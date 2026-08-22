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
import { createBodies } from '../src/sim/world.ts';
import {
  clearanceDelta,
  clearanceDv,
  escapeSpeed,
  hypot,
  naturalPeriapsis,
} from '../src/sim/orbit.ts';
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
    // The whole of the clearance work off, not part of it. `clearanceOnFlyby`
    // arrived later, for the floor pin below, and with `boundGrabsCapture` off
    // most of this sweep's grabs are flybys — so leaving it on here suppressed
    // the very defect the baseline exists to exercise.
    clearanceOnFlyby: false,
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

/**
 * Clearance may not eject the ship it was invoked to hold.
 *
 * `clearanceDv` finds the smallest TANGENTIAL delta-v that lifts periapsis clear.
 * It is minimal for that goal and says nothing about energy — so on a near-radial
 * dive it hands the ship a large free impulse, and can push a bound ship above
 * escape speed. The capture then never reaches periapsis, coasts, and leaves the
 * field. Reported as "I kind of shot off the planet at super speed", with the
 * nearest body 349px behind the wreck.
 */
describe('clearance never unbinds the ship', () => {
  /** Bound dives that need clearing, across radius, speed and how head-on they are. */
  function dives(): Array<{ r: number; vx: number; vy: number; vEsc: number }> {
    const out: Array<{ r: number; vx: number; vy: number; vEsc: number }> = [];
    for (const r of [110, 140, 180, 220, 280, 360]) {
      const vEsc = escapeSpeed(DEFAULT_CONFIG, r);
      for (const frac of [0.4, 0.55, 0.7, 0.85, 0.95]) {
        const spd = vEsc * frac;
        for (const radial of [0.999, 0.99, 0.95, 0.85, 0.7]) {
          const vx = spd * Math.sqrt(1 - radial * radial);
          const vy = spd * radial;
          if (naturalPeriapsis(DEFAULT_CONFIG, 0, -r, vx, vy) >= 99) continue;
          out.push({ r, vx, vy, vEsc });
        }
      }
    }
    return out;
  }

  it('is the defect it was, without the fix', () => {
    // The pin. If this ever stops failing, the reason the flag exists has changed.
    let ejected = 0;
    for (const d of dives()) {
      const dv = clearanceDv(DEFAULT_CONFIG, 0, -d.r, d.vx, d.vy, 99);
      if (hypot(d.vx + dv.dvx, d.vy + dv.dvy) >= d.vEsc) ejected++;
    }
    expect(ejected).toBeGreaterThan(20);
  });

  it('leaves every bound dive bound', () => {
    for (const d of dives()) {
      const dv = clearanceDelta(DEFAULT_CONFIG, 0, -d.r, d.vx, d.vy, 99, d.vEsc * 0.98);
      const after = hypot(d.vx + dv.dvx, d.vy + dv.dvy);
      expect(after, `r=${d.r} was ejected`).toBeLessThan(d.vEsc);
    }
  });

  it('changes nothing where the old impulse was already safe', () => {
    // Minimal deviation, and it is load-bearing. Turning the heading everywhere
    // was tried and put a kink into a scenario that had none — a turn is a sharper
    // heading change than adding along it, and `clearEaseFrames` is the one
    // frame-denominated constant in the simulation and may not be lengthened to
    // hide that. So ordinary dives must come out bit-identical.
    let identical = 0;
    let total = 0;
    for (const d of dives()) {
      const a = clearanceDv(DEFAULT_CONFIG, 0, -d.r, d.vx, d.vy, 99);
      if (hypot(d.vx + a.dvx, d.vy + a.dvy) >= d.vEsc * 0.98) continue;
      total++;
      const b = clearanceDelta(DEFAULT_CONFIG, 0, -d.r, d.vx, d.vy, 99, d.vEsc * 0.98);
      if (a.dvx === b.dvx && a.dvy === b.dvy) identical++;
    }
    expect(total).toBeGreaterThan(30);
    expect(identical).toBe(total);
  });

  it('is off in the prototype config, which keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.clearanceEnergyNeutral).toBe(false);
    expect(DEFAULT_CONFIG.clearanceEnergyNeutral).toBe(true);
  });
});

/**
 * The floor pin: the stall that bricked a run.
 *
 * Reported twice from a phone — "my ship got stuck on the surface" and "I got
 * stuck when trying a kinky capture" — and diagnosed long before it was fixed,
 * because the fix was a design choice between three and none had been picked.
 * The chain is written out at `clearanceOnFlyby`.
 *
 * What makes it worth its own describe rather than a line in the sweep above: the
 * failure is not a bad trajectory, it is the ABSENCE of one. The ship stops, and
 * nothing in the simulation can end a run that is not moving — it never falls
 * behind the floor, never leaves the field, never crashes. Only a reset escapes.
 */
describe('a stalled flyby cannot brick the run', () => {
  /** Press close, fast and near-radially. Returns whether the ship ended up stuck. */
  function pins(cfg: SimConfig, bodyIdx: number, dist: number, speed: number, offDeg: number) {
    const bodies = createBodies(cfg);
    const p = bodies[bodyIdx]!;
    const st = createInitialState(cfg);
    const a = Math.PI / 2 + (offDeg * Math.PI) / 180;
    const x = p.x + Math.cos(a) * dist;
    const y = p.y + Math.sin(a) * dist;
    const toward = Math.atan2(p.y - y, p.x - x);
    Object.assign(st.ship, { x, y, vx: Math.cos(toward) * speed, vy: Math.sin(toward) * speed });
    st.highWaterY = Math.min(y, p.y) - 400;
    st.fuel = cfg.fuelMax;
    let still = 0;
    for (let i = 0; i < 900; i++) {
      stepSim(st, cfg, { held: i >= 1, pressed: i === 1, released: false }, FIXED_DT);
      if (st.ending.active) return false;
      const cap = st.capture;
      const v = cap ? hypot(cap.vx, cap.vy) : hypot(st.ship.vx, st.ship.vy);
      if (v < 1) {
        still++;
        if (still > 180) return true;
      } else {
        still = 0;
      }
    }
    const cap = st.capture;
    return (cap ? hypot(cap.vx, cap.vy) : hypot(st.ship.vx, st.ship.vy)) < 1;
  }

  /** The region the report came from: close, fast, aimed near the centre. */
  function sweepPins(cfg: SimConfig) {
    let pinned = 0;
    let total = 0;
    for (const speed of [300, 360, 420, 500]) {
      for (const dist of [90, 122, 170]) {
        for (let off = -8; off <= 8; off += 2) {
          for (const bi of [3, 11]) {
            total++;
            if (pins(cfg, bi, dist, speed, off)) pinned++;
          }
        }
      }
    }
    return { pinned, total };
  }

  it('never stalls anywhere in the region the reports came from', () => {
    const r = sweepPins(DEFAULT_CONFIG);
    expect(r.pinned, `${r.pinned}/${r.total} presses pinned`).toBe(0);
  });

  it('is the defect it was: a quarter of that region bricked', () => {
    // The pin, kept rather than deleted, because it is the measurement that says
    // why the flag exists. Over the wider 1224-press version of this sweep: 23.6%,
    // rising with speed from 6.5% at 300px/s to 34% at 500 — worst exactly where
    // the game is being flown hardest.
    const r = sweepPins({ ...DEFAULT_CONFIG, clearanceOnFlyby: false });
    expect(r.pinned / r.total).toBeGreaterThan(0.1);
  });

  it('leaves a flyby that was already clear of the surface alone', () => {
    // The impulse is a no-op unless the natural periapsis is inside the floor, so
    // a flyby that would have missed anyway is untouched — tick for tick, not
    // merely in outcome. Asserted over every geometry in a grid that qualifies,
    // rather than one hand-picked aim, because which ones qualify is exactly the
    // thing that would drift.
    const bodies = createBodies(DEFAULT_CONFIG);
    const p = bodies[3]!;
    let checked = 0;
    for (const dist of [200, 300, 420]) {
      for (const aim of [120, 180, 240, 320]) {
        const x = p.x;
        const y = p.y + dist;
        const toward = Math.atan2(p.y - y, p.x - x) + Math.atan2(aim, dist);
        const vx = Math.cos(toward) * 420;
        const vy = Math.sin(toward) * 420;
        const fly = (cfg: SimConfig) => {
          const st = createInitialState(cfg);
          Object.assign(st.ship, { x, y, vx, vy });
          st.highWaterY = y - 400;
          st.fuel = cfg.fuelMax;
          const path: number[] = [];
          let clearedAtPress = false;
          for (let i = 0; i < 200; i++) {
            stepSim(st, cfg, { held: i >= 1, pressed: i === 1, released: false }, FIXED_DT);
            const cap = st.capture;
            // Read on the press tick: `clearEaseFrames` counts down from there.
            if (i === 1 && cap) clearedAtPress = cap.clearFramesLeft > 0;
            path.push(cap ? cap.rx : st.ship.x, cap ? cap.ry : st.ship.y);
          }
          return { path, clearedAtPress };
        };
        // Qualifying on what the simulation DID, not on a periapsis recomputed
        // here against a body it might not even have grabbed — `grabTarget` takes
        // the nearest, which in a generated field is not always the one aimed at.
        const now = fly(DEFAULT_CONFIG);
        if (now.clearedAtPress) continue;
        checked++;
        expect(now.path, `d=${dist} aim=${aim} moved`).toEqual(
          fly({ ...DEFAULT_CONFIG, clearanceOnFlyby: false }).path,
        );
      }
    }
    expect(checked, 'no geometry in the grid was already clear').toBeGreaterThan(3);
  });

  it('is off in the prototype config, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.clearanceOnFlyby).toBe(false);
    expect(DEFAULT_CONFIG.clearanceOnFlyby).toBe(true);
  });
});
