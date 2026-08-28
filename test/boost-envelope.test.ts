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

/** Where the peak arrives: `boostArmTime` as a floor under a fraction of the settle. */
function peakOf(cfg: SimConfig): number {
  return cfg.boostHoldsThroughSettle
    ? Math.max(cfg.boostArmTime, cfg.boostPeakAt * cfg.settleDur)
    : cfg.boostArmTime;
}

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
    // THIS PIN USED TO START THE PLATEAU AT `boostArmTime`, and that was the
    // over-correction: the flat top spanned the whole settle, so 29% of the
    // envelope could not grade a release at all and the tier reads that quantity
    // as one of its two axes. `boostPeakAt` now owns where the ramp ends.
    const peak = peakOf(cfg);
    expect(peak).toBeGreaterThan(cfg.boostArmTime);
    // The plateau must be a real span, not a degenerate point — if the settle is
    // ever tuned below the ramp this asserts nothing and a later test covers it.
    expect(cfg.settleDur).toBeGreaterThan(peak);
    for (let t = peak; t <= cfg.settleDur; t += 0.01) {
      expect(boostEnvelope(cfg, 60, t)).toBeCloseTo(60, 9);
    }
  });

  it('still lands the peak exactly on settle completion, which is the whole point', () => {
    // The defect `boostHoldsThroughSettle` fixed, re-pinned from the other end.
    // Narrowing the plateau is only safe while it is narrowed from the LEFT: a
    // release at the moment the orbit goes round has to be worth full marks. Cut
    // it from the right instead and the peak lands before the manoeuvre finishes,
    // which is the defect this flag was added for.
    const cfg = DEFAULT_CONFIG;
    expect(boostEnvelope(cfg, 60, cfg.settleDur)).toBeCloseTo(60, 9);
    expect(boostEnvelope(cfg, 60, cfg.settleDur + 0.01)).toBeLessThan(60);
  });

  it('grades the stretch the plateau used to pay flat', () => {
    // The reason the key exists. A release halfway through the settle scored a
    // full `timing` before and has to score strictly less now, or the tier's
    // second axis is still a plain.
    const cfg = DEFAULT_CONFIG;
    const half = cfg.settleDur / 2;
    expect(half).toBeGreaterThan(cfg.boostArmTime);
    expect(boostEnvelope(cfg, 60, half)).toBeLessThan(60);
    expect(boostEnvelope({ ...cfg, boostPeakAt: 0 }, 60, half)).toBeCloseTo(60, 9);
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

  it('never arms faster than boostArmTime, so a tap-through still earns nothing', () => {
    // The plateau is not a relaxation of the skill window. Neither end of it may
    // arm the boost faster, or the footgun comes back.
    //
    // THIS USED TO PIN THE RAMP AT EXACTLY `boostArmTime` and now pins it as a
    // FLOOR, because `boostPeakAt` made the ramp longer rather than shorter. The
    // property that mattered is the one kept: a press this short is worth less
    // than it was, never more.
    const cfg = DEFAULT_CONFIG;
    const peak = peakOf(cfg);
    for (let t = 0; t < cfg.boostArmTime; t += 0.01) {
      expect(boostEnvelope(cfg, 60, t)).toBeCloseTo(60 * (t / peak), 9);
      expect(boostEnvelope(cfg, 60, t)).toBeLessThanOrEqual(60 * (t / cfg.boostArmTime) + 1e-9);
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
