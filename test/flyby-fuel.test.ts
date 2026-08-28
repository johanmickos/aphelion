/**
 * The flyby brake's price.
 *
 * `speedTaper` scales the brake from full strength at `flybyBrakeRefSpeed` to
 * nothing at `flybyBrakeMinSpeed`, and the fuel burn used to ignore it entirely —
 * so a ship below 120px/s paid 40 fuel/second for an impulse of exactly zero.
 *
 * Pinned because the defect was invisible from the inside: the brake was correct,
 * the burn was correct, and only the pair was wrong. What has to stay true is that
 * the two read the SAME taper.
 */
import { describe, expect, it } from 'vitest';
import type { SimConfig } from '../src/sim/config.ts';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { hypot } from '../src/sim/orbit.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';

/** The scenario `test/scenarios.ts` calls 'fast unbound grab -> flyby, braked'. */
interface Sample {
  tick: number;
  speed: number;
  taper: number;
  fuel: number;
}
function brakedFlyby(cfg: SimConfig, ticks = 300): Sample[] {
  const state = createInitialState(cfg);
  state.ship.x = 105;
  state.ship.y = 354;
  state.ship.vx = 0;
  state.ship.vy = -400;
  state.fuel = cfg.fuelMax;
  const out: Sample[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(state, cfg, { held: i >= 20, pressed: i === 20, released: false }, FIXED_DT);
    const cap = state.capture;
    if (!cap || cap.phase !== 'flyby') continue;
    const speed = hypot(cap.vx, cap.vy);
    const span = cfg.flybyBrakeRefSpeed - cfg.flybyBrakeMinSpeed;
    out.push({
      tick: i,
      speed,
      taper: Math.max(0, Math.min(1, (speed - cfg.flybyBrakeMinSpeed) / span)),
      fuel: state.fuel,
    });
  }
  return out;
}

/** Fuel spent over the samples where the brake was doing nothing at all. */
function spentOnNothing(rows: Sample[]): number {
  const dead = rows.filter((r) => r.taper === 0);
  if (dead.length < 2) return 0;
  return dead[0]!.fuel - dead[dead.length - 1]!.fuel;
}

/**
 * Speed on the last physical tick of the dive and on the first tick the phase
 * clock drives, which is where the freeze hands over.
 *
 * Read one tick APART on purpose. The tick that flips the phase to `settle` still
 * ran `stepPhysical` — `freezeOrbit` is the last thing it does — so its velocity
 * is the dive's. The step, if there is one, appears on the tick after.
 */
function freezeSeam(cfg: SimConfig, ticks = 900): { before: number; after: number } {
  const state = createInitialState(cfg);
  state.ship.x = 105;
  state.ship.y = 354;
  state.ship.vx = 0;
  state.ship.vy = -400;
  state.fuel = cfg.fuelMax;
  let frozen = false;
  let before = 0;
  for (let i = 0; i < ticks; i++) {
    stepSim(state, cfg, { held: i >= 20, pressed: i === 20, released: false }, FIXED_DT);
    const cap = state.capture;
    if (!cap) continue;
    const speed = hypot(cap.vx, cap.vy);
    if (frozen) return { before, after: speed };
    if (cap.phase === 'settle') {
      frozen = true;
      before = speed;
    }
  }
  throw new Error('never froze');
}

describe('the brake keeps the energy it paid to remove', () => {
  it('does not get it back at the freeze', () => {
    // `whipE` is a running MAX of orbital energy, so the minimum-orbit floor
    // cannot crater the oval a head-on dive earned. A brake is the opposite of a
    // clamp — the player spent fuel to shed that energy — and the max never came
    // back down, so the freeze reconstructed the pre-brake speed and the ship
    // sped up as it settled. Reported from a phone as an anomaly capture that
    // "snapped"; the same scenario shows it at a planet.
    const seam = freezeSeam(DEFAULT_CONFIG);
    expect(seam.after / seam.before).toBeLessThan(1.2);
  });

  it('is the defect it was: a 45% step in one tick', () => {
    // The pin. This scenario brakes for 28 fuel, arrives at periapsis doing
    // 375px/s, and the phase clock's first tick used to put it at 543.
    const seam = freezeSeam({ ...DEFAULT_CONFIG, flybyBrakeShedsWhip: false });
    expect(seam.before).toBeCloseTo(375, 0);
    expect(seam.after).toBeCloseTo(543, 0);
  });

  it('leaves the floor clamp exactly as it was', () => {
    // What survives the fix is the step the FLOOR causes, which is deliberate:
    // this dive clips the minimum-orbit floor, loses radial speed to the clamp,
    // and the freeze restores the oval it had earned. Braking must not be able to
    // lower the mark past that.
    const seam = freezeSeam(DEFAULT_CONFIG);
    expect(seam.after).toBeGreaterThan(seam.before);
  });

  it('is off in the prototype config, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.flybyBrakeShedsWhip).toBe(false);
    expect(DEFAULT_CONFIG.flybyBrakeShedsWhip).toBe(true);
  });
});

describe('the flyby brake bills for the brake, not for the button', () => {
  it('spends nothing once the taper has shut the brake off', () => {
    const rows = brakedFlyby(DEFAULT_CONFIG);
    const dead = rows.filter((r) => r.taper === 0);
    // The scenario must actually reach the dead band, or this asserts nothing.
    expect(dead.length).toBeGreaterThan(10);
    expect(spentOnNothing(rows)).toBeCloseTo(0, 6);
  });

  it('is the defect it was: the flat rate burned a quarter tank for zero impulse', () => {
    // The pin. Not deleted when the defect was fixed — it is the measurement that
    // says why the flag exists, and it fails loudly if the old path stops being
    // wrong (which would mean the taper, not the burn, had changed).
    const rows = brakedFlyby({ ...DEFAULT_CONFIG, flybyFuelTracksBrake: false });
    expect(spentOnNothing(rows)).toBeGreaterThan(20);

    const dead = rows.filter((r) => r.taper === 0);
    // ...and the speed it shed over that stretch was gravity's doing, not the
    // brake's: the impulse is identically zero there.
    expect(dead[0]!.speed).toBeGreaterThan(dead[dead.length - 1]!.speed);
  });

  it('leaves a full-strength brake at exactly the old price', () => {
    // The correction removes only what was being sold twice. Where the brake is
    // at full strength both paths must agree to the last decimal.
    const now = brakedFlyby(DEFAULT_CONFIG);
    const before = brakedFlyby({ ...DEFAULT_CONFIG, flybyFuelTracksBrake: false });
    const full = now.filter((r) => r.taper === 1);
    expect(full.length).toBeGreaterThan(10);
    for (const r of full) {
      const b = before.find((x) => x.tick === r.tick)!;
      expect(r.fuel).toBeCloseTo(b.fuel, 9);
    }
  });

  it('is off in the prototype config, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.flybyFuelTracksBrake).toBe(false);
    expect(DEFAULT_CONFIG.flybyFuelTracksBrake).toBe(true);
    // Both configs share the taper bounds, so this genuinely had to be flagged
    // rather than being a no-op under the prototype's numbers.
    expect(PROTOTYPE_CONFIG.flybyBrakeMinSpeed).toBe(DEFAULT_CONFIG.flybyBrakeMinSpeed);
    expect(PROTOTYPE_CONFIG.flybyBrakeRefSpeed).toBe(DEFAULT_CONFIG.flybyBrakeRefSpeed);
  });

  it('does not make holding a dead brake profitable', () => {
    // A capture suppresses `fuelRegen`, so a brake that costs nothing still costs
    // the regen it forgoes. Fuel must never RISE inside a flyby.
    const rows = brakedFlyby(DEFAULT_CONFIG);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.fuel).toBeLessThanOrEqual(rows[i - 1]!.fuel + 1e-9);
    }
  });
});

/**
 * Drive the braked-flyby scenario and report the tank across the conversion.
 * `null` for `convertedAt` means the flyby never converted.
 */
function conversion(cfg: SimConfig): {
  convertedAt: number | null;
  before: number;
  after: number;
  brakeSpent: number;
} {
  const state = createInitialState(cfg);
  state.ship.x = 105;
  state.ship.y = 354;
  state.ship.vx = 0;
  state.ship.vy = -410;
  state.fuel = cfg.fuelMax;
  let wasFlyby = false;
  let before = cfg.fuelMax;
  let brakeSpent = 0;
  for (let i = 0; i < 600; i++) {
    const cap = state.capture;
    if (cap?.phase === 'flyby') {
      wasFlyby = true;
      before = state.fuel;
      brakeSpent = cap.brakeSpent;
    }
    stepSim(state, cfg, { held: i >= 20, pressed: i === 20, released: false }, FIXED_DT);
    const now = state.capture;
    if (wasFlyby && now && now.phase !== 'flyby') {
      return { convertedAt: i, before, after: state.fuel, brakeSpent };
    }
  }
  return { convertedAt: null, before, after: state.fuel, brakeSpent };
}

describe('a flyby that converts gets part of its brake back', () => {
  it('pays the configured fraction as a FLOOR, graded up by how tight the arrival was', () => {
    // THIS PIN USED TO SAY "exactly the configured fraction", and the fraction is
    // now the floor: the refund is graded from it to a full return of the brake by
    // the arrival's clearance over `arrivalTightSpan`. Reported as running dry
    // while orbiting, and the trough turned out to be the brake rather than the
    // wait for the release refund — see `flybyConvertRefund` for both numbers.
    const cfg = DEFAULT_CONFIG;
    const c = conversion(cfg);
    expect(c.convertedAt).not.toBeNull();
    expect(c.brakeSpent).toBeGreaterThan(5);
    // The tank must RISE across the conversion tick, by the refund less whatever
    // that same tick's braking took off it.
    expect(c.after).toBeGreaterThan(c.before);
    const back = c.after - c.before;
    expect(back).toBeGreaterThanOrEqual(cfg.flybyConvertRefund * c.brakeSpent - 1e-9);
    expect(back).toBeLessThanOrEqual(c.brakeSpent + 1e-9);
    // And it is the arrival that decides where in that range it lands. The span is
    // the clearance at which an arrival stops counting as tight, so shrinking it
    // makes every arrival loose and pays the floor exactly...
    const loose = conversion({ ...cfg, arrivalTightSpan: 1e-9 });
    expect(loose.after - loose.before).toBeCloseTo(cfg.flybyConvertRefund * loose.brakeSpent, 4);
    // ...and widening it past any real clearance makes every arrival tight, which
    // returns the whole brake.
    const tight = conversion({ ...cfg, arrivalTightSpan: 1e9 });
    expect(tight.after - tight.before).toBeCloseTo(tight.brakeSpent, 4);
  });

  it('never pays a converting flyby more than its brake cost', () => {
    // The refund is a REFUND. Bounded by what was actually deducted, so no
    // arrival tightness and no span can turn braking into a way to make fuel.
    for (const span of [0, 1, 50, 200, 1000, 1e9]) {
      const c = conversion({ ...DEFAULT_CONFIG, arrivalTightSpan: span });
      if (c.convertedAt === null) continue;
      expect(c.after - c.before, `span ${span}`).toBeLessThanOrEqual(c.brakeSpent + 1e-9);
    }
  });

  it('hands nothing back while the flyby is still running', () => {
    // The tension the refund must not blunt lives here: a brake that has not yet
    // succeeded is charged in full, and the tank may only fall.
    const rows = brakedFlyby(DEFAULT_CONFIG);
    expect(rows.length).toBeGreaterThan(10);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.fuel).toBeLessThanOrEqual(rows[i - 1]!.fuel + 1e-9);
    }
  });

  it('cannot refund fuel that was never spent', () => {
    // `brakeSpent` tracks what `burn` actually DEDUCTED, not what it was quoted,
    // so it can never exceed the fuel that existed to spend. Without that a brake
    // held against a near-empty tank would keep accruing at the quoted rate and
    // convert into more fuel than it ever had.
    //
    // Opens on 2 rather than 0 because a grab is refused outright at `fuel <= 0.5`
    // — an empty ship cannot reach a flyby at all, so 0 tests nothing. `fuelRegen:
    // 0` stops the drift before the press quietly refilling the tank, which is how
    // this test passed for the wrong reason the first time it was written.
    const cfg = { ...DEFAULT_CONFIG, fuelRegen: 0 };
    const START = 2;
    const state = createInitialState(cfg);
    state.ship.x = 105;
    state.ship.y = 354;
    state.ship.vx = 0;
    state.ship.vy = -410;
    state.fuel = START;
    let sawFlyby = false;
    for (let i = 0; i < 200; i++) {
      // Stop at the death: a ship on 2 fuel does not survive long, and a respawn
      // refills the tank, which would look exactly like the leak being tested for.
      if (state.ending.active) break;
      stepSim(state, cfg, { held: i >= 20, pressed: i === 20, released: false }, FIXED_DT);
      const cap = state.capture;
      if (cap?.phase === 'flyby') sawFlyby = true;
      if (cap) expect(cap.brakeSpent).toBeLessThanOrEqual(START + 1e-9);
      // And so the tank can never exceed what it started with plus a refund of
      // half of that — braking can never be a net gain.
      expect(state.fuel).toBeLessThanOrEqual(START * (1 + cfg.flybyConvertRefund) + 1e-9);
    }
    expect(sawFlyby).toBe(true);
  });

  it('is off in the prototype config', () => {
    expect(PROTOTYPE_CONFIG.flybyConvertRefund).toBe(0);
    expect(DEFAULT_CONFIG.flybyConvertRefund).toBeGreaterThan(0);
    // A full refund would make a successful rescue free and delete the decision.
    expect(DEFAULT_CONFIG.flybyConvertRefund).toBeLessThan(1);
  });

  it('leaves the rescue costing about what a capture costs', () => {
    // The sizing rationale in config.ts, asserted. A capture burns fuelPerSec for
    // roughly a settle, and the net brake bill should land in the same order —
    // near enough that a rescue reads as "one more capture", not as a free pass
    // and not as a run-ender. If this fails, that rationale is out of date.
    const cfg = DEFAULT_CONFIG;
    const c = conversion(cfg);
    const netBrakeCost = c.brakeSpent * (1 - cfg.flybyConvertRefund);
    const oneCapture = cfg.fuelPerSec * cfg.settleDur;
    expect(netBrakeCost).toBeGreaterThan(oneCapture * 0.4);
    expect(netBrakeCost).toBeLessThan(oneCapture * 2);
  });
});
