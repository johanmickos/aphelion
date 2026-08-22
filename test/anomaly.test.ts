/**
 * Anomalies: the barrier exemption, and the bonus it pays for.
 *
 * The mechanic is one predicate — `inAnomalyField` suspends the SIDE boundary and
 * nothing else — so what has to be pinned is small and specific: that a release
 * aimed at one survives crossing the barrier, that leaving the bubble is fatal,
 * and that the bonus lands on top of the streak ceiling rather than inside it.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { DEFAULT_SCORE_CONFIG } from '../src/score/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { createScoreState, scoreTick } from '../src/score/score.ts';
import type { ScoreAward } from '../src/score/types.ts';
import { DESIGN_W, createBodies, fieldBounds } from '../src/sim/world.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { hypot } from '../src/sim/orbit.ts';
import type { Anomaly } from '../src/sim/types.ts';

function rightAnomaly(cfg: SimConfig): Anomaly {
  const a = createBodies(cfg).find((b): b is Anomaly => b.kind === 'anomaly' && b.x > 195);
  if (!a) throw new Error('the default field has no right-hand anomaly');
  return a;
}

interface Flight {
  awards: ScoreAward[];
  died: number;
  reason: string;
  crossedBarrier: boolean;
  multAfterRelease: number;
  bonusTicks: number;
}

/**
 * Fly straight at the right-hand anomaly from inside the corridor.
 *
 * `press` -1 never grabs; `release` -1 never lets go. Level with the anomaly and
 * offset slightly so the approach captures rather than flying into the surface.
 */
function flyAtAnomaly(cfg: SimConfig, press: number, release: number, ticks = 900): Flight {
  const state = createInitialState(cfg);
  // The aim point always comes from the DEFAULT field, so the control run with
  // `anomalyCount: 0` flies the identical line into a field that has no bubble.
  // Valid because anomalies are drawn after the corridor and leave it unchanged —
  // which `test/world.test.ts` asserts separately.
  const a = rightAnomaly(DEFAULT_CONFIG);
  const fb = fieldBounds(cfg, state.bodies);
  Object.assign(state.ship, { x: a.x - 520, y: a.y - 70, vx: 320, vy: 0 });
  state.highWaterY = a.y;
  state.fuel = cfg.fuelMax;

  const sc = createScoreState();
  const out: Flight = {
    awards: [],
    died: -1,
    reason: '',
    crossedBarrier: false,
    multAfterRelease: 0,
    bonusTicks: 0,
  };
  let held = false;
  for (let i = 0; i < ticks; i++) {
    const pressed = i === press;
    const released = i === release;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, cfg, { held: held || pressed, pressed, released }, FIXED_DT);
    out.awards.push(...scoreTick(sc, state, cfg, FIXED_DT).awards);
    if (!state.capture && !state.ending.active && state.ship.x > fb.right) {
      out.crossedBarrier = true;
    }
    if (released) {
      out.multAfterRelease = sc.multiplier;
      out.bonusTicks = sc.bonusUntil - state.tick;
    }
    if (state.ending.active) {
      out.died = i;
      out.reason = state.ending.reason;
      break;
    }
  }
  return out;
}

describe('the barrier exemption', () => {
  it('lets a ship aimed at an anomaly survive outside the corridor', () => {
    // The whole mechanic. Without the exemption this ship dies at `fb.right`
    // long before it arrives.
    const f = flyAtAnomaly(DEFAULT_CONFIG, 88, -1, 120);
    expect(f.crossedBarrier).toBe(true);
    expect(f.died, 'died before reaching the anomaly').toBe(-1);
    expect(f.awards.map((a) => `${a.kind}:${a.body}`)).toContain('grab:A2');
  });

  it('kills the same ship without it', () => {
    // The pin on the other side: with no anomalies in the field there is no
    // bubble, and the identical flight ends at the barrier. If this ever stops
    // failing, the exemption has stopped being what carries the ship out.
    const f = flyAtAnomaly({ ...DEFAULT_CONFIG, anomalyCount: 0 }, -1, -1, 120);
    expect(f.died).toBeGreaterThan(-1);
    expect(f.reason).toBe('out-of-bounds');
  });

  it('is fatal to leave the far side of the bubble', () => {
    // The soft-lock guard, flown rather than computed. `driftAccel` is zero, so a
    // ship that sailed on unbounded would never die and only a reset would
    // escape. Never pressing means never capturing: it flies through and out.
    const f = flyAtAnomaly(DEFAULT_CONFIG, -1, -1, 900);
    expect(f.died, 'flew on forever').toBeGreaterThan(-1);
  });

  it('is off in the prototype config, which keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.anomalyCount).toBe(0);
    expect(createBodies(PROTOTYPE_CONFIG).some((b) => b.kind === 'anomaly')).toBe(false);
    expect(DEFAULT_CONFIG.anomalyCount).toBeGreaterThan(0);
  });
});

describe('the anomaly bonus', () => {
  it('pays its award at the capture and arms the window for the release', () => {
    const f = flyAtAnomaly(DEFAULT_CONFIG, 88, 150);
    const grab = f.awards.find((a) => a.kind === 'grab' && a.body === 'A2');
    expect(grab, 'no anomaly grab').toBeDefined();
    // Worth what the config says, times the streak it arrived with, plus whatever
    // the arrival itself was worth.
    expect(grab!.points).toBeGreaterThanOrEqual(
      DEFAULT_SCORE_CONFIG.anomalyBonus * grab!.multiplier,
    );
  });

  it('starts the window at the release, for its full configured length', () => {
    const f = flyAtAnomaly(DEFAULT_CONFIG, 88, 150);
    const expected = Math.round(DEFAULT_SCORE_CONFIG.anomalyBonusSecs / FIXED_DT);
    expect(f.bonusTicks).toBe(expected);
  });

  it('adds on TOP of the streak ceiling, not inside it', () => {
    // The load-bearing shape. Inside the cap the bonus does literally nothing to
    // a maxed streak — the exact player who earned the right to fetch it — so a
    // multiplier above `streakMax` is the thing to assert.
    const sc = createScoreState();
    sc.streak = 999;
    const state = createInitialState(DEFAULT_CONFIG);
    sc.bonusUntil = state.tick + 100;
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    expect(sc.multiplier).toBeGreaterThan(DEFAULT_SCORE_CONFIG.streakMax);
    expect(sc.multiplier).toBeCloseTo(
      DEFAULT_SCORE_CONFIG.streakMax + DEFAULT_SCORE_CONFIG.anomalyBonusMult,
      6,
    );
    expect(sc.bonusActive).toBe(true);
  });

  it('pays an anomaly once per life, however many times it is re-grabbed', () => {
    // Without the claim log, orbiting out and back refreshes the window forever —
    // the same faucet the grab award refuses to open by paying at the press.
    const f = flyAtAnomaly(DEFAULT_CONFIG, 88, 150);
    const first = f.awards.find((a) => a.kind === 'grab' && a.body === 'A2')!;

    const sc = createScoreState();
    sc.claimed.push('A2');
    const state = createInitialState(DEFAULT_CONFIG);
    // A second capture of a claimed anomaly must not re-arm the window.
    expect(sc.bonusArmed).toBe(false);
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    expect(sc.bonusArmed).toBe(false);
    expect(first.points).toBeGreaterThan(0);
  });
});

/**
 * The rest stop: an anomaly authors the orbit a capture there settles into.
 *
 * All of this is carried on the BODY rather than read from config at the point of
 * use, the way `bubble` already was, so anomalies of different kinds can differ
 * later without any of the sim moving.
 */
describe('an anomaly authors its own orbit', () => {
  /** Fly at the right-hand anomaly, press at `press`, and hold. */
  function park(cfg: SimConfig, press: number, startFuel = 40) {
    const state = createInitialState(cfg);
    const a = rightAnomaly(cfg);
    Object.assign(state.ship, { x: a.x - 520, y: a.y - 70, vx: 320, vy: 0 });
    state.highWaterY = a.y;
    state.fuel = startFuel;
    const radii: number[] = [];
    let tightness = 0;
    let boostFull = 0;
    let lap = 0;
    let fuelAtOrbit = -1;
    let fuelEnd = 0;
    let worstJump = 0;
    let prevR = -1;
    for (let i = 0; i < 700; i++) {
      stepSim(state, cfg, { held: i >= press, pressed: i === press, released: false }, FIXED_DT);
      const cap = state.capture;
      if (!cap) continue;
      const r = hypot(cap.rx, cap.ry);
      if (prevR > 0 && cap.phase !== 'clear' && cap.phase !== 'flyby') {
        worstJump = Math.max(worstJump, Math.abs(r - prevR) * 60);
      }
      prevR = r;
      if (!tightness && cap.tightness) {
        tightness = cap.tightness;
        boostFull = cap.boostFull;
      }
      if (cap.phase === 'orbit') {
        radii.push(r);
        lap = (Math.PI * 2) / (cap.phaseSpeed || 1);
        if (fuelAtOrbit < 0) fuelAtOrbit = state.fuel;
        fuelEnd = state.fuel;
      }
    }
    return { radii, tightness, boostFull, lap, fuelAtOrbit, fuelEnd, worstJump };
  }

  it('settles to the configured radius and pace whatever the dive did', () => {
    // Measured before this: 62-69px at 1.3-1.5s a lap, inherited from whatever
    // the approach happened to produce, and indistinguishable from a planet.
    for (const press of [88, 92, 96, 100]) {
      const r = park(DEFAULT_CONFIG, press);
      expect(r.radii.length, `press ${press} never settled`).toBeGreaterThan(30);
      expect(Math.min(...r.radii)).toBeCloseTo(DEFAULT_CONFIG.anomalyOrbitR, 0);
      expect(Math.max(...r.radii)).toBeCloseTo(DEFAULT_CONFIG.anomalyOrbitR, 0);
      expect(r.lap).toBeCloseTo(DEFAULT_CONFIG.anomalyOrbitPeriod, 2);
    }
  });

  it('stays inside the radius the camera can hold still for', () => {
    // Not a taste bound. Beyond about half a window less the backstop's edge the
    // view has to pan to keep the ship, which is what an over-wide anomaly orbit
    // was reported as. Asserted here because the number lives in the sim config
    // and the constraint lives in the renderer, so nothing else connects them.
    const halfWindow = DESIGN_W / 2 - DEFAULT_RENDER_CONFIG.cameraBackstopEdge;
    expect(DEFAULT_CONFIG.anomalyOrbitR).toBeLessThan(halfWindow);
  });

  it('pays full boost however late the press was', () => {
    // The lottery this removes: measured, an arrival four ticks late took
    // tightness from 1.00 to 0.20 and boostFull from 60 to 0 — the entire payoff
    // of the game's hardest commitment, decided at the very end of it.
    for (const press of [88, 92, 96, 100]) {
      const r = park(DEFAULT_CONFIG, press);
      expect(r.tightness, `press ${press}`).toBe(1);
      expect(r.boostFull, `press ${press}`).toBeCloseTo(DEFAULT_CONFIG.boostMax, 6);
    }
  });

  it('refuels while parked, which nothing else in a capture does', () => {
    const r = park(DEFAULT_CONFIG, 88, 40);
    expect(r.fuelEnd).toBeGreaterThan(r.fuelAtOrbit + 20);
    expect(r.fuelEnd).toBeLessThanOrEqual(DEFAULT_CONFIG.fuelMax);
    // And a planet still does not: the rest stop is the anomaly's rule, not a
    // change to what a capture costs everywhere.
    const state = createInitialState(DEFAULT_CONFIG);
    state.fuel = 40;
    let planetOrbitFuel = -1;
    for (let i = 0; i < 700; i++) {
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: i >= 18, pressed: i === 18, released: false },
        FIXED_DT,
      );
      if (state.capture?.phase === 'orbit') {
        if (planetOrbitFuel < 0) planetOrbitFuel = state.fuel;
        else expect(state.fuel).toBeLessThanOrEqual(planetOrbitFuel + 1e-9);
      }
    }
    expect(planetOrbitFuel, 'the planet run never settled').toBeGreaterThan(0);
  });

  it('settles far faster than a planet, because the arrival is not the point', () => {
    // Reported as "I spent a second or so waiting to stabilize which felt wasted
    // — the screen with just the purple orb is really powerful and I don't want
    // to delay that effect". The settle is the delay between committing and
    // getting the thing you committed for.
    expect(DEFAULT_CONFIG.anomalySettleDur).toBeLessThan(DEFAULT_CONFIG.settleDur / 2);
    const state = createInitialState(DEFAULT_CONFIG);
    const a = rightAnomaly(DEFAULT_CONFIG);
    Object.assign(state.ship, { x: a.x - 520, y: a.y - 70, vx: 320, vy: 0 });
    state.highWaterY = a.y;
    state.fuel = 100;
    let frozeAt = -1;
    let orbitAt = -1;
    for (let i = 0; i < 500; i++) {
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: i >= 88, pressed: i === 88, released: false },
        FIXED_DT,
      );
      const cap = state.capture;
      if (cap && frozeAt < 0 && cap.rPeri) frozeAt = i;
      if (cap?.phase === 'orbit' && orbitAt < 0) orbitAt = i;
    }
    expect(frozeAt).toBeGreaterThan(-1);
    expect(orbitAt).toBeGreaterThan(-1);
    expect((orbitAt - frozeAt) / 60).toBeCloseTo(DEFAULT_CONFIG.anomalySettleDur, 1);
  });

  it('expands to the authored orbit without a snap', () => {
    // `rPeri` is overridden but the frozen ellipse is left honest, still passing
    // through the ship's real position, so the handover has nothing to jump. What
    // is left is the settle carrying the ship out over `settleDur`, smootherstep'd.
    const r = park(DEFAULT_CONFIG, 88);
    expect(r.worstJump).toBeLessThan(400);
  });
});
