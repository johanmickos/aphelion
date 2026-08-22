/**
 * The boost envelope's plateau.
 *
 * Pinned because the defect it fixes was invisible in every test that existed:
 * the envelope was internally consistent, the refund scaled by it faithfully, and
 * the two together still paid nothing for a well-flown capture — because the
 * window closed 0.65s before the manoeuvre it was rewarding finished. What has to
 * stay true is the RELATIONSHIP between `boostArmTime`, `settleDur` and
 * `boostDecayTime`, not any one of their values.
 */
import { describe, expect, it } from 'vitest';
import { boostEnvelope } from '../src/sim/boost.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';

/** The pre-plateau envelope, kept verbatim as the thing the flag must reproduce. */
function legacyEnvelope(cfg: SimConfig, boostFull: number, boostT: number): number {
  const f =
    boostT < cfg.boostArmTime
      ? boostT / cfg.boostArmTime
      : Math.max(0, 1 - (boostT - cfg.boostArmTime) / cfg.boostDecayTime);
  return boostFull * f;
}

describe('the boost envelope', () => {
  it('is bit-identical to the old shape when the flag is off', () => {
    // This is what keeps the equality gate at zero. Not `toBeCloseTo`: the
    // prototype comparison is exact, so this one has to be too.
    const cfg = { ...DEFAULT_CONFIG, boostHoldsThroughSettle: false };
    for (let i = 0; i <= 240; i++) {
      const t = i * FIXED_DT;
      expect(boostEnvelope(cfg, 60, t)).toBe(legacyEnvelope(cfg, 60, t));
    }
    expect(PROTOTYPE_CONFIG.boostHoldsThroughSettle).toBe(false);
  });

  it('holds the peak from the end of the ramp to the end of the settle', () => {
    const cfg = DEFAULT_CONFIG;
    expect(cfg.boostHoldsThroughSettle).toBe(true);
    // The plateau must be a real span, not a degenerate point — if the settle is
    // ever tuned below the ramp this asserts nothing and the next test covers it.
    expect(cfg.settleDur).toBeGreaterThan(cfg.boostArmTime);
    for (let t = cfg.boostArmTime; t <= cfg.settleDur; t += 0.01) {
      expect(boostEnvelope(cfg, 60, t)).toBeCloseTo(60, 9);
    }
  });

  it('reaches zero a full decay after the settle, not after the ramp', () => {
    const cfg = DEFAULT_CONFIG;
    const wasDeadAt = cfg.boostArmTime + cfg.boostDecayTime;
    const nowDeadAt = cfg.settleDur + cfg.boostDecayTime;
    expect(boostEnvelope(cfg, 60, wasDeadAt)).toBeGreaterThan(0);
    expect(boostEnvelope(cfg, 60, nowDeadAt - 0.01)).toBeGreaterThan(0);
    // `settleDur + boostDecayTime` is not exactly representable, so the crossing
    // itself is asserted as a limit and the hard zero one tick later.
    expect(boostEnvelope(cfg, 60, nowDeadAt)).toBeCloseTo(0, 9);
    expect(boostEnvelope(cfg, 60, nowDeadAt + FIXED_DT)).toBe(0);
  });

  it('leaves the arming ramp alone, so a tap-through still earns nothing', () => {
    // The plateau is not a relaxation of the skill window. Moving the decay must
    // not also arm the boost faster, or the footgun comes back.
    const cfg = DEFAULT_CONFIG;
    for (let t = 0; t < cfg.boostArmTime; t += 0.01) {
      expect(boostEnvelope(cfg, 60, t)).toBeCloseTo(60 * (t / cfg.boostArmTime), 9);
    }
    expect(boostEnvelope(cfg, 60, 0)).toBe(0);
  });

  it('cannot invert when the settle is tuned shorter than the ramp', () => {
    // `settleDur` is a tune panel slider and goes down to 0.3, below the 0.45
    // ramp. Without the clamp the plateau would end before the peak arrived and
    // the decay would run backwards.
    const cfg = { ...DEFAULT_CONFIG, settleDur: 0.3 };
    let prev = -1;
    let peaked = false;
    for (let t = 0; t <= 3; t += 0.01) {
      const v = boostEnvelope(cfg, 60, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(60 + 1e-9);
      if (v < prev - 1e-9) peaked = true;
      // Once it has turned over it must never rise again.
      if (peaked) expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    expect(boostEnvelope(cfg, 60, cfg.boostArmTime)).toBeCloseTo(60, 9);
  });
});

/**
 * Fly one capture and read the envelope at the release, `holdSeconds` after the
 * orbit froze.
 *
 * Anchored on `boostT` rather than on ticks since the press, because those are
 * not the same clock: from this spawn the ship coasts most of a second in `clear`
 * before it reaches periapsis, and `boostT` is what the envelope reads. It is
 * also what the diagnostics `grab` award marks, so a hold here means the same
 * thing a hold in a session report means.
 */
function release(cfg: SimConfig, holdSeconds: number): { boost: number; boostFull: number } {
  const state = createInitialState(cfg);
  state.fuel = cfg.fuelMax;
  for (let i = 0; i < 2000; i++) {
    const cap = state.capture;
    const done = !!cap && cap.boostFull > 0 && cap.boostT >= holdSeconds;
    if (done && cap) return { boost: cap.boost, boostFull: cap.boostFull };
    stepSim(state, cfg, { held: i >= 18, pressed: i === 18, released: false }, FIXED_DT);
  }
  throw new Error('the capture never reached the requested hold');
}

describe('a capture released once it has settled', () => {
  it('earns its boost, where before it earned none', () => {
    // The measured failure: median holds of 1.42s, 1.47s and 1.83s across the
    // three sessions with award records, against an envelope that hit zero at
    // 1.85s. Held to the end of the settle and a little past it — squarely inside
    // that range — a capture must now be worth something.
    const held = DEFAULT_CONFIG.settleDur + 0.3;
    const now = release(DEFAULT_CONFIG, held);
    const before = release({ ...DEFAULT_CONFIG, boostHoldsThroughSettle: false }, held);

    expect(now.boostFull).toBeGreaterThan(0);
    expect(before.boostFull).toBeCloseTo(now.boostFull, 9);
    expect(before.boost / before.boostFull).toBeLessThan(0.25);
    expect(now.boost / now.boostFull).toBeGreaterThan(0.75);
  });
});
