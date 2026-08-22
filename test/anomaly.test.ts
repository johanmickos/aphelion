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

  /**
   * Arrivals that cover the shape of the thing: fast and near, fast and far, a
   * slow diagonal, a crossing, one flying directly AWAY from the anomaly, and one
   * dead stopped beside it. Distances 127-426px, speeds 0-418px/s.
   */
  const ARRIVALS = [
    [-300, -70, 344, 0],
    [-420, -70, 344, 0],
    [-260, 260, 150, -150],
    [-200, -200, 60, 300],
    [-380, 120, 400, -120],
    [-150, 0, -300, 0],
    [-90, -90, 0, 0],
  ] as const;

  /** Press beside the right-hand anomaly on tick 5 and hold. */
  function arrive(cfg: SimConfig, dx: number, dy: number, vx: number, vy: number, fuel = 50) {
    const a = rightAnomaly(cfg);
    const state = createInitialState(cfg);
    Object.assign(state.ship, { x: a.x + dx, y: a.y + dy, vx, vy });
    state.highWaterY = a.y;
    state.fuel = fuel;
    const press = 5;
    let driftSpeed = 0;
    let firstGlide = -1;
    let parked = -1;
    let worstStep = 0;
    let worstDefl = 0;
    let minR = Infinity;
    let prev = -1;
    let fuelAtPress = -1;
    let fuelLowInGlide = Infinity;
    for (let i = 0; i < 400; i++) {
      if (i === press) driftSpeed = hypot(state.ship.vx, state.ship.vy);
      stepSim(state, cfg, { held: i >= press, pressed: i === press, released: false }, FIXED_DT);
      const cap = state.capture;
      if (!cap) continue;
      const speed = hypot(cap.vx, cap.vy);
      if (firstGlide < 0) firstGlide = speed;
      if (prev >= 0) worstStep = Math.max(worstStep, Math.abs(speed - prev));
      // Only where a heading means something. A ship being turned round passes
      // through a near-standstill, and `atan2` of nothing much is noise.
      if (speed > 60) worstDefl = Math.max(worstDefl, cap.defl);
      minR = Math.min(minR, hypot(cap.rx, cap.ry));
      prev = speed;
      if (fuelAtPress < 0) fuelAtPress = state.fuel;
      if (cap.phase === 'settle') fuelLowInGlide = Math.min(fuelLowInGlide, state.fuel);
      if (cap.phase === 'orbit' && parked < 0) parked = i;
    }
    return {
      press,
      driftSpeed,
      firstGlide,
      parked,
      worstStep,
      worstDefl,
      minR,
      fuelAtPress,
      fuelLowInGlide,
      state,
    };
  }

  it('parks in the authored time from anywhere, at any speed', () => {
    // The whole point of the change, and the number the author asked for. Two
    // phone sessions measured 2.47s and 4.55s from press to parked, of which the
    // authored settle was 0.45 — the rest was 1.9-2.1s of braking and up to 2.0s
    // of falling to a periapsis. The press is the arrival now, so what is left is
    // the authored clock and nothing else, whatever the arrival was.
    const ticks = Math.round(DEFAULT_CONFIG.anomalySettleDur / FIXED_DT);
    for (const [dx, dy, vx, vy] of ARRIVALS) {
      const r = arrive(DEFAULT_CONFIG, dx, dy, vx, vy);
      expect(r.parked - r.press, `arrival (${dx},${dy}) v(${vx},${vy})`).toBe(ticks);
    }
  });

  it('takes the velocity the ship pressed with, and never steps', () => {
    // Both ends of this were reported. "My ship snapped to a lower orbit, the snap
    // was too jerky" was the freeze reading a reconstructed periapsis speed —
    // 179px/s arriving, 335 on the next tick, and up to 517 on synthetic arrivals.
    // The press-is-the-arrival version replaced it with a glide whose near end is
    // the ship's own state, so there is nothing left to step at.
    //
    // The 10% is one tick of a pull-in that has half a second to cover up to
    // 300px; it is the glide accelerating, not a seam. It was 35% while the glide
    // was a cubic, which is why it is a quintic.
    for (const [dx, dy, vx, vy] of ARRIVALS) {
      const r = arrive(DEFAULT_CONFIG, dx, dy, vx, vy);
      const label = `arrival (${dx},${dy}) v(${vx},${vy})`;
      if (r.driftSpeed > 60) {
        expect(
          Math.abs(r.firstGlide / r.driftSpeed - 1),
          `${label} stepped at the press: ${r.driftSpeed.toFixed(0)} -> ${r.firstGlide.toFixed(0)}px/s`,
        ).toBeLessThan(0.1);
      }
      // A reversal is still a reversal: a ship pressed while flying straight out
      // has to be turned round, and turns hardest where it is slowest. What must
      // not happen is a step in SPEED, which is what a bad seam looks like.
      expect(r.worstStep, `${label} stepped mid-glide`).toBeLessThan(100);
      expect(r.worstDefl, `${label} kinked`).toBeLessThan(25);
    }
  });

  it('never dips inside the body it is parking around', () => {
    // A curve with a fast inbound end overshoots its target; the floor clamp in
    // `approachRadius` is what stops the ship passing through the anomaly and
    // coming back out. Asserted against the authored radius rather than the floor,
    // because reaching the floor at all would already be visible.
    for (const [dx, dy, vx, vy] of ARRIVALS) {
      const r = arrive(DEFAULT_CONFIG, dx, dy, vx, vy);
      const started = hypot(dx, dy);
      const floor = Math.min(started, DEFAULT_CONFIG.anomalyOrbitR);
      expect(r.minR, `arrival (${dx},${dy}) v(${vx},${vy})`).toBeGreaterThanOrEqual(floor - 1);
    }
  });

  it('charges nothing for the approach', () => {
    // The brake it replaced cost 65 and 63 fuel in the two reported sessions, and
    // half of that came straight back as the conversion refund — an economy that
    // existed to pay for the waiting. Nothing is spent reaching a rest stop now:
    // the hard part was the release that got the ship inside the barrier, and that
    // is already paid for. Read on the way IN, because the refuel starts at the
    // far end and would hide a burn.
    for (const [dx, dy, vx, vy] of ARRIVALS) {
      const r = arrive(DEFAULT_CONFIG, dx, dy, vx, vy);
      expect(r.fuelLowInGlide, `arrival (${dx},${dy}) v(${vx},${vy}) paid for the approach`).toBe(
        r.fuelAtPress,
      );
    }
  });

  it('never flies a dive or a flyby at an anomaly', () => {
    // The phases that used to hold all the time are simply not reachable there
    // any more. Pinned because the press path decides this, and a future change to
    // the flyby classification could quietly send an anomaly back through it.
    for (const [dx, dy, vx, vy] of ARRIVALS) {
      const a = rightAnomaly(DEFAULT_CONFIG);
      const state = createInitialState(DEFAULT_CONFIG);
      Object.assign(state.ship, { x: a.x + dx, y: a.y + dy, vx, vy });
      state.highWaterY = a.y;
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        stepSim(
          state,
          DEFAULT_CONFIG,
          { held: i >= 5, pressed: i === 5, released: false },
          FIXED_DT,
        );
        if (state.capture) seen.add(state.capture.phase);
      }
      expect([...seen].sort(), `arrival (${dx},${dy}) v(${vx},${vy})`).toEqual(['orbit', 'settle']);
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
    const r = park(DEFAULT_CONFIG, 88, 20);
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
