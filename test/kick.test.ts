/**
 * Every release pays something, and how much is how well it was flown.
 *
 * WHAT THIS REPLACED. The kick already existed and was already graded on both
 * axes — `tightness` at the freeze sets `boostFull`, and the envelope's value at
 * the release sets `boost` — but it was gated on `earned`, so a manoeuvre that
 * never converted paid nothing at all. Measured across 366 releases in the 28
 * diagnostics reports that replay faithfully, that silenced 54% of releases, and
 * only 31 of them flew badly: 128 were still flybys and 165 never reached
 * periapsis.
 *
 * A hitstop was the alternative considered and rejected — "even at 30ms it feels
 * too jarring" — so the punch is bought with speed rather than with stopped time.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState } from '../src/sim/step.ts';
import { releaseCapture } from '../src/sim/capture.ts';
import type { Capture, SimState } from '../src/sim/types.ts';

/** A capture parked mid-flyby, so only the fields under test differ. */
function captured(over: Partial<Capture>): Capture {
  return {
    phase: 'flyby',
    planet: 0,
    rx: 100,
    ry: 0,
    vx: 0,
    vy: -200,
    grabR: 300,
    minR: 60,
    prevR: 100,
    prevDR: 0,
    passedPeri: false,
    periR: 0,
    apoR: 0,
    clearFramesLeft: 0,
    clearDvx: 0,
    clearDvy: 0,
    whipE: undefined,
    orbit: null,
    theta: 0,
    phaseSpeed: 0,
    phaseSpeedReal: 0,
    phaseMul: 1,
    Lfrozen: undefined,
    rPeri: 100,
    settleT: 0,
    settleProgress: 0,
    tightness: 0,
    boostFull: 0,
    boost: 0,
    boostT: 0,
    settleSweep: 0,
    refuel: 0,
    approachR0: 0,
    approachVR: 0,
    settleDur: 1.2,
    zipped: false,
    puttered: false,
    brakeSpent: 0,
    fuelSpent: 0,
    fuelBack: 0,
    escapeSide: 0,
    escaped: false,
    lastAngle: 0,
    defl: 0,
    ...over,
  };
}

/** Speed gained by a release, burst included, in px/s. */
function gain(cfg: SimConfig, over: Partial<Capture>, weak = false): number {
  const state: SimState = createInitialState(cfg);
  const cap = captured(over);
  state.capture = cap;
  const before = Math.hypot(cap.vx, cap.vy);
  releaseCapture(state, cfg, weak);
  const { ship } = state;
  return Math.hypot(ship.vx + ship.burstX, ship.vy + ship.burstY) - before;
}

/** A capture that converted, released at `q` of its envelope's peak. */
const converted = (q: number): Partial<Capture> => ({
  phase: 'orbit',
  passedPeri: true,
  orbit: { a: 100, e: 0, argp: 0, dir: 1 },
  boostFull: 60,
  boost: 60 * q,
});

describe('a release that never converted', () => {
  it('pays, where it used to pay nothing', () => {
    // The whole point. At the median recorded deflection this is small; the
    // assertion is that it is not zero.
    expect(gain(DEFAULT_CONFIG, { defl: 0.608 })).toBeGreaterThan(0);
  });

  it('pays by how hard the body was bending it at the instant of release', () => {
    // Deflection is instantaneous, not accumulated, so letting go at the top of
    // the turn is worth more than letting go on the way in. That is the timing
    // skill a flyby has, and it is the same shape as the boost envelope's.
    const quartiles = [0.323, 0.608, 1.112, 2.1].map((defl) => gain(DEFAULT_CONFIG, { defl }));
    for (let i = 1; i < quartiles.length; i++) {
      expect(quartiles[i]!, `defl step ${i}`).toBeGreaterThan(quartiles[i - 1]!);
    }
  });

  it('saturates at the measured span rather than running away', () => {
    // `flybyDeflSpan` is the p90 of deflection at a real flyby release. Past it
    // the kick is full — an unbounded ramp would make one freak sample the best
    // release in the session.
    const atSpan = gain(DEFAULT_CONFIG, { defl: DEFAULT_CONFIG.flybyDeflSpan });
    const wayPast = gain(DEFAULT_CONFIG, { defl: DEFAULT_CONFIG.flybyDeflSpan * 40 });
    expect(wayPast).toBeCloseTo(atSpan, 6);
  });

  it('does not withhold the kick from a release that ran the tank dry', () => {
    // A putter-out is a release like any other and the body was still bending it.
    // The tank running dry is already paid for by the link that did not happen;
    // taking the kick away as well would be confiscating rather than withholding.
    //
    // ASSERTED ON THE BURST, NOT ON NET SPEED, and the difference matters. A weak
    // release damps the whole velocity by 0.35 — a separate, older behaviour — so
    // its net change is negative however much the swing adds. "Still pays" is a
    // claim about the kick being present, not about the release coming out ahead.
    const burstOf = (cfg: SimConfig): number => {
      const state = createInitialState(cfg);
      state.capture = captured({ defl: 1.112 });
      releaseCapture(state, cfg, true);
      return Math.hypot(state.ship.burstX, state.ship.burstY);
    };
    expect(burstOf(DEFAULT_CONFIG)).toBeGreaterThan(0);
    // ...and it is the swing that put it there.
    expect(burstOf({ ...DEFAULT_CONFIG, releaseKick: 0 })).toBe(0);
  });
});

/** Speed a release KEEPS once the punch has decayed, in px/s. */
function kept(cfg: SimConfig, over: Partial<Capture>): number {
  const state: SimState = createInitialState(cfg);
  const cap = captured(over);
  state.capture = cap;
  const before = Math.hypot(cap.vx, cap.vy);
  releaseCapture(state, cfg, false);
  return Math.hypot(state.ship.vx, state.ship.vy) - before;
}

/** Speed a release adds transiently, all of which decays, in px/s. */
function punch(cfg: SimConfig, over: Partial<Capture>): number {
  const state: SimState = createInitialState(cfg);
  state.capture = captured(over);
  releaseCapture(state, cfg, false);
  return Math.hypot(state.ship.burstX, state.ship.burstY);
}

describe('feel and economy are separate channels', () => {
  /**
   * THIS REPLACED A PIN THAT COMPARED TOTALS, and the change is the point.
   *
   * It used to assert that a median conversion out-paid a median flyby threefold,
   * measured on the speed immediately after release. That was the right assertion
   * while the kick was part of the economy. It is the wrong one now: the punch is
   * deliberately generous to weak releases — that is the whole ask — so totals
   * converge while the thing that decides what a run is WORTH does not.
   */
  it('keeps nothing at all from a release that never converted', () => {
    // The whole of "it does not impact gameplay too much when just tapping". A
    // flyby buys a punch and banks none of it, however hard it was turning.
    for (const defl of [0.323, 0.608, 1.112, 2.1, 90]) {
      expect(kept(DEFAULT_CONFIG, { defl }), `defl ${defl}`).toBe(0);
    }
  });

  it('keeps speed only from a conversion, and more from a better one', () => {
    const weak = kept(DEFAULT_CONFIG, converted(0.1));
    const good = kept(DEFAULT_CONFIG, converted(0.75));
    const perfect = kept(DEFAULT_CONFIG, converted(1));
    expect(weak).toBeGreaterThan(0);
    expect(good).toBeGreaterThan(weak);
    expect(perfect).toBeGreaterThan(good);
  });

  it('pays a tap nothing, structurally rather than by a guard', () => {
    // `lastAngle` is seeded from the real velocity at the grab and `defl` starts
    // at 0, so a press and release with no arc between them has no quality to be
    // paid for. The shaping curve lifts the weak end and cannot lift zero.
    expect(punch(DEFAULT_CONFIG, { defl: 0 })).toBe(0);
    expect(kept(DEFAULT_CONFIG, { defl: 0 })).toBe(0);
  });

  it('lands a punch on a weak release that a linear ramp would have hidden', () => {
    // The measured p25 flyby. Linear it was 15% of full and read as nothing on a
    // ship doing several hundred px/s; shaped it is nearer 40%.
    const full = punch(DEFAULT_CONFIG, { defl: DEFAULT_CONFIG.flybyDeflSpan });
    const weak = punch(DEFAULT_CONFIG, { defl: 0.323 });
    expect(weak / full).toBeGreaterThan(0.3);
    // ...and the top of the range did not move to get there.
    expect(full).toBeCloseTo(DEFAULT_CONFIG.releaseKick, 6);
  });

  it('leaves a perfect conversion the hardest-landing release in the game', () => {
    const best = punch(DEFAULT_CONFIG, converted(1));
    const bestFlyby = punch(DEFAULT_CONFIG, { defl: DEFAULT_CONFIG.flybyDeflSpan * 10 });
    expect(best).toBeGreaterThan(bestFlyby * 2);
  });
});

describe('the kick carries further when it was flown better', () => {
  it('holds a full-quality burst longer than a scraped one', () => {
    const scraped = createInitialState(DEFAULT_CONFIG);
    scraped.capture = captured(converted(0));
    releaseCapture(scraped, DEFAULT_CONFIG, false);

    const perfect = createInitialState(DEFAULT_CONFIG);
    perfect.capture = captured(converted(1));
    releaseCapture(perfect, DEFAULT_CONFIG, false);

    expect(perfect.ship.burstDecay).toBeGreaterThan(scraped.ship.burstDecay);
    expect(scraped.ship.burstDecay).toBeCloseTo(DEFAULT_CONFIG.boostBurstDecay, 6);
    expect(perfect.ship.burstDecay).toBeCloseTo(
      DEFAULT_CONFIG.boostBurstDecay * (1 + DEFAULT_CONFIG.kickHold),
      6,
    );
  });

  it('keeps duration the smaller of the two channels', () => {
    // Quality enters twice — once as strength, once as duration — which widens the
    // gap between a good release and a great one faster than either knob suggests.
    // Duration is deliberately the gentler one, so strength keeps the range.
    const strengthRatio =
      gain(DEFAULT_CONFIG, converted(1)) / gain(DEFAULT_CONFIG, converted(0.369));
    const durationRatio = 1 + DEFAULT_CONFIG.kickHold;
    expect(durationRatio).toBeLessThan(strengthRatio);
  });
});

describe('the prototype cannot see any of it', () => {
  it('pays a flyby nothing, however hard it was turning', () => {
    // `flybyKick` is 0 there, which is what keeps the equality gate at exactly
    // zero — the config split doing the job it exists for.
    expect(gain(PROTOTYPE_CONFIG, { defl: 90 })).toBe(0);
  });

  it('leaves the burst decaying at the constant it always did', () => {
    const state = createInitialState(PROTOTYPE_CONFIG);
    state.capture = captured(converted(1));
    releaseCapture(state, PROTOTYPE_CONFIG, false);
    expect(state.ship.burstDecay).toBeCloseTo(PROTOTYPE_CONFIG.boostBurstDecay, 6);
  });
});
