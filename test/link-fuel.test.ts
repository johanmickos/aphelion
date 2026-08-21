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

  it('is worth about one capture at the top of the envelope', () => {
    // The number is sized against measured play: an earned capture costs a median
    // 23-26 fuel across two recorded sessions, so a release at the peak roughly
    // pays for its own capture and a median one (~0.15 of the envelope) does not.
    // If this ever fails, the sizing rationale in config.ts is out of date.
    expect(DEFAULT_CONFIG.linkFuelReward).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_CONFIG.linkFuelReward).toBeLessThanOrEqual(30);
  });
});
