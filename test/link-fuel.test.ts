/**
 * The link fuel refund: fuel back for a release that earned its boost, scaled by
 * where in the boost envelope it happened.
 *
 * Pinned because the refund is the only thing that pays fuel for PLAYING —
 * `fuelRegen` pays for pausing — and because it is gated on exactly the same
 * `earned` test as the boost itself. If that gate ever loosens, tapping beside a
 * planet becomes a fuel faucet in the same way it would have become a points
 * faucet, which is the failure `PendingLink.earned` exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import type { SimConfig } from '../src/sim/config.ts';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import type { Input } from '../src/sim/types.ts';

interface Run {
  /** Fuel immediately before the release tick resolved. */
  before: number;
  /** Fuel immediately after it. */
  after: number;
  refund: number;
  /** `cap.boost / cap.boostFull` as the release saw it. */
  peakFrac: number;
  earned: boolean;
}

/**
 * Drive one capture and release it at `releaseTick`, reporting the fuel step
 * across that single tick.
 *
 * The refund is read as a one-tick delta rather than from the end state because
 * `regen` also runs on the release tick — it is a small fixed amount and would
 * otherwise be indistinguishable from a small refund.
 */
function capture(cfg: SimConfig, pressTick: number, releaseTick: number, startFuel?: number): Run {
  const state = createInitialState(cfg);
  // Default to a half tank. At a full one the refund silently clips against
  // `fuelMax` and the scaling being asserted is invisible — which is exactly how
  // the first version of this test failed.
  state.fuel = startFuel ?? cfg.fuelMax * 0.5;
  let held = false;
  let out: Run | null = null;

  for (let i = 0; i <= releaseTick; i++) {
    const pressed = i === pressTick;
    const released = i === releaseTick;
    if (pressed) held = true;
    if (released) held = false;
    const input: Input = { held: held || pressed, pressed, released };

    const cap = state.capture;
    const before = state.fuel;
    const peakFrac = cap && cap.boostFull > 0 ? cap.boost / cap.boostFull : 0;
    const earned = !!cap && cap.orbit !== null && cap.passedPeri && cap.phase !== 'flyby';

    stepSim(state, cfg, input, FIXED_DT);

    if (released && cap) {
      // `regen` runs on this tick too; subtract it so `refund` is the refund.
      const regenTick = cfg.fuelRegen * FIXED_DT;
      out = {
        before,
        after: state.fuel,
        refund: state.fuel - before - regenTick,
        peakFrac,
        earned,
      };
    }
  }
  if (!out) throw new Error('no release happened');
  return out;
}

/**
 * Fly a dive and report the tank across the periapsis freeze, which is where the
 * arrival award lands. Returns null if the dive never converted.
 */
function freeze(
  cfg: SimConfig,
  pressTick = 179,
  ticks = 420,
): { before: number; after: number; tight: number } | null {
  const state = createInitialState(cfg);
  // THE NERVE-GRAB LINE, not the default spawn's, and the difference decides
  // whether this file tests anything. The spawn's dive arrives 228-291px above the
  // minimum orbit at every press tick from 10 to 50 — always outside
  // `arrivalTightSpan`, so the award is always exactly 0 and every assertion below
  // would pass on a fixture that could never earn it. This line is
  // `test/score.test.ts`'s 'head-on, pressed late' and arrives at 52px, which is
  // a tightness of 0.74 against real play's median 0.56.
  Object.assign(state.ship, { x: 189, y: 400, vx: 0, vy: -97 });
  for (let i = 0; i < ticks; i++) {
    // Set at the PRESS, not at the start: the dive-in drifts for three seconds and
    // `fuelRegen` refills the tank to full over it, which clips the award to zero
    // and hides the scaling being asserted.
    if (i === pressTick) state.fuel = cfg.fuelMax * 0.5;
    // BY VALUE, not by reference. `state.capture` is mutated in place rather than
    // replaced, so holding the object and reading `.phase` after the step reads
    // the NEW phase and the transition is never seen — which is how the first
    // version of this helper returned null on every config.
    const wasPhase = state.capture?.phase ?? null;
    const before = state.fuel;
    const grabR = state.capture?.grabR ?? 0;
    const minR = state.capture?.minR ?? 0;
    stepSim(
      state,
      cfg,
      { held: i >= pressTick, pressed: i === pressTick, released: false },
      FIXED_DT,
    );
    if (wasPhase !== null && wasPhase !== 'settle' && state.capture?.phase === 'settle') {
      const over = (grabR - minR) / Math.max(1e-6, cfg.arrivalTightSpan);
      return { before, after: state.fuel, tight: over < 0 ? 1 : over > 1 ? 0 : 1 - over };
    }
  }
  return null;
}

describe('the arrival award', () => {
  it('pays at the periapsis freeze, scaled by how tight the grab was', () => {
    // Asked for as "they do a big burn, get a tight capture, and then receive a
    // fuel award for the tight capture" — an AWARD rather than the brake's refund,
    // so it is not bounded by anything spent and a dive that never braked gets it.
    const f = freeze(DEFAULT_CONFIG)!;
    expect(f).not.toBeNull();
    expect(f.tight).toBeGreaterThan(0);
    expect(f.after - f.before).toBeCloseTo(DEFAULT_CONFIG.arrivalFuelReward * f.tight, 6);
  });

  it('pays nothing at the freeze when the reward is off', () => {
    // The control. Without it this whole file would pass on a fixture that simply
    // regenerated, which is the trap `AGENTS.md` names for the render knobs.
    const f = freeze({ ...DEFAULT_CONFIG, arrivalFuelReward: 0 })!;
    expect(f.after - f.before).toBeCloseTo(0, 6);
  });

  it('grades it: a looser arrival is worth less', () => {
    // Shrinking the span makes every arrival read as loose, which is the only lever
    // the fixture has over its own geometry.
    const tightSpan = freeze(DEFAULT_CONFIG)!;
    const looseSpan = freeze({ ...DEFAULT_CONFIG, arrivalTightSpan: 1e-9 })!;
    expect(looseSpan.after - looseSpan.before).toBeCloseTo(0, 6);
    expect(tightSpan.after - tightSpan.before).toBeGreaterThan(0);
  });

  it('is off in the prototype config, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.arrivalFuelReward).toBe(0);
    expect(DEFAULT_CONFIG.arrivalFuelReward).toBeGreaterThan(0);
  });

  it('does not count as a refund, because it may exceed what was spent', () => {
    // `Capture.fuelBack` is refunds only and `test/escape.test.ts` pins it at no
    // more than `fuelSpent`. The award is exactly the thing allowed to break that
    // bound — at the freeze a direct dive has spent nothing on braking at all — so
    // it must not be routed through that counter.
    const state = createInitialState(DEFAULT_CONFIG);
    state.fuel = DEFAULT_CONFIG.fuelMax * 0.5;
    for (let i = 0; i < 400; i++) {
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: i >= 18, pressed: i === 18, released: false },
        FIXED_DT,
      );
      const cap = state.capture;
      if (cap && cap.phase === 'settle') {
        expect(cap.fuelBack).toBeLessThanOrEqual(cap.fuelSpent + 1e-9);
        return;
      }
    }
    throw new Error('never froze');
  });
});

describe('the link fuel refund', () => {
  it('pays a release that earned its boost, scaled by the boost envelope', () => {
    const r = capture(DEFAULT_CONFIG, 18, 150);
    expect(r.earned).toBe(true);
    expect(r.peakFrac).toBeGreaterThan(0);
    expect(r.refund).toBeCloseTo(DEFAULT_CONFIG.linkFuelReward * r.peakFrac, 6);
  });

  it('pays nothing at all when the refund is switched off', () => {
    // PROTOTYPE_CONFIG holds it at 0, which is what keeps the equality gate at
    // zero: this whole mechanic must be invisible to the prototype comparison.
    expect(PROTOTYPE_CONFIG.linkFuelReward).toBe(0);
    const r = capture({ ...DEFAULT_CONFIG, linkFuelReward: 0 }, 18, 150);
    expect(r.refund).toBeCloseTo(0, 6);
  });

  it('pays nothing for a release that never reached periapsis', () => {
    // Released two ticks after the press: no orbit was ever frozen, so there is
    // no boost and there must be no fuel. This is the tap-beside-a-planet case.
    const r = capture(DEFAULT_CONFIG, 18, 20);
    expect(r.earned).toBe(false);
    expect(r.refund).toBeLessThanOrEqual(0);
  });

  it('never pays more than the reward, however good the release', () => {
    // The envelope fraction is clamped to 1, so the refund has a hard ceiling
    // even if `boost` ever exceeded `boostFull`.
    for (const releaseTick of [60, 90, 120, 150, 200]) {
      const r = capture(DEFAULT_CONFIG, 18, releaseTick);
      expect(r.refund).toBeLessThanOrEqual(DEFAULT_CONFIG.linkFuelReward + 1e-9);
    }
  });

  it('cannot push the tank above fuelMax', () => {
    // Released with a nearly full tank: the refund is earned and then clipped.
    const r = capture(DEFAULT_CONFIG, 18, 150, DEFAULT_CONFIG.fuelMax);
    expect(r.after).toBe(DEFAULT_CONFIG.fuelMax);
  });

  it('recovers most of a capture at the top of the envelope, and never all of it', () => {
    // Sized against measured play: an earned capture costs a median 23-26 fuel, so
    // staying under that floor is what keeps even a perfect release short of fully
    // self-fuelling — the first session played at 25 never dropped below 39 fuel,
    // which is the constraint removed rather than conditioned. Staying well above
    // half of it is what keeps the refund worth aiming for at all.
    // If this fails, the sizing rationale in config.ts is out of date.
    expect(DEFAULT_CONFIG.linkFuelReward).toBeGreaterThan(12);
    expect(DEFAULT_CONFIG.linkFuelReward).toBeLessThan(23);
  });
});
