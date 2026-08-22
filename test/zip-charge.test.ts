/**
 * The zip charge: an earned effect the ship carries and a later press spends.
 *
 * PORT_NOTES 47. The zip out to an anomaly reads as the best moment in the game
 * and the ride home as the flattest, so leaving one grants a charge that gives the
 * NEXT capture the same authored arrival — note 43's glide, at a planet.
 *
 * Written against `grantCharge` rather than against anomalies wherever it can be,
 * because the charge is deliberately not an anomaly feature: the mechanism is the
 * thing being pinned, and the anomaly is only today's source of one.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { grantCharge, spendCharge } from '../src/sim/charges.ts';
import { createBodies } from '../src/sim/world.ts';
import { hypot } from '../src/sim/orbit.ts';
import { createScoreState, scoreTick } from '../src/score/score.ts';
import { DEFAULT_SCORE_CONFIG } from '../src/score/config.ts';

const BODIES = createBodies(DEFAULT_CONFIG);

/** Fly at a planet and hold. `charged` grants a zip first. */
function grab(
  cfg: SimConfig,
  bi: number,
  dist: number,
  aim: number,
  speed: number,
  charged: boolean,
) {
  const p = BODIES[bi]!;
  const st = createInitialState(cfg);
  const x = p.x;
  const y = p.y + dist;
  const toward = Math.atan2(p.y - y, p.x - x) + Math.atan2(aim, dist);
  Object.assign(st.ship, { x, y, vx: Math.cos(toward) * speed, vy: Math.sin(toward) * speed });
  // Above the trailing floor: `highWaterY` is the highest point REACHED, so a
  // value below the ship means the run has already been lost and the whole
  // capture freezes in the ending hold.
  st.highWaterY = y - 600;
  st.fuel = cfg.fuelMax;
  if (charged) grantCharge(st, 'zip');
  const sc = createScoreState();
  let press = -1;
  let parked = -1;
  let r = 0;
  let zipped = false;
  let award = -1;
  for (let i = 0; i < 900; i++) {
    stepSim(st, cfg, { held: i >= 1, pressed: i === 1, released: false }, FIXED_DT);
    const out = scoreTick(sc, st, cfg, FIXED_DT, DEFAULT_SCORE_CONFIG);
    for (const a of out.awards) if (a.kind === 'grab' && award < 0) award = a.points;
    const cap = st.capture;
    if (i === 1) {
      if (!cap) return null;
      press = i;
      zipped = cap.zipped;
    }
    if (press < 0) continue;
    if (cap && cap.phase === 'orbit' && parked < 0) {
      parked = i;
      r = hypot(cap.rx, cap.ry);
    }
    if (parked >= 0 && award >= 0) break;
    if (st.ending.active || !cap) break;
  }
  return { secs: parked < 0 ? -1 : (parked - press) / 60, r, zipped, award: Math.max(0, award) };
}

/** Every geometry worth measuring, as (body, distance, aim, speed). */
const APPROACHES: Array<[number, number, number, number]> = [];
for (const bi of [3, 7, 11, 17, 23])
  for (const dist of [90, 140, 220, 320, 440])
    for (const aim of [-150, -90, -45, 0, 45, 90, 150])
      for (const speed of [260, 340, 420]) APPROACHES.push([bi, dist, aim, speed]);

describe('a charge is a thing the ship has, not a fact about its history', () => {
  it('grants and spends without knowing where it came from', () => {
    const st = createInitialState(DEFAULT_CONFIG);
    expect(st.charges.zip).toBe(0);
    expect(spendCharge(st, 'zip')).toBe(false);
    grantCharge(st, 'zip');
    grantCharge(st, 'zip');
    expect(st.charges.zip).toBe(2);
    expect(spendCharge(st, 'zip')).toBe(true);
    expect(st.charges.zip).toBe(1);
  });

  it('dies with the ship', () => {
    // Earned by flying, so carrying one across a death would pay the next run for
    // the last one's work.
    const st = createInitialState(DEFAULT_CONFIG);
    grantCharge(st, 'zip');
    Object.assign(st.ship, { x: 100000, y: 0, vx: 0, vy: 0 });
    for (let i = 0; i < 120; i++)
      stepSim(st, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
    expect(st.ship.alive).toBe(true); // respawned
    expect(st.charges.zip).toBe(0);
  });

  it('is granted by leaving an anomaly, and only by leaving one', () => {
    const cfg = DEFAULT_CONFIG;
    const a = BODIES.find((b) => b.kind === 'anomaly')!;
    const st = createInitialState(cfg);
    Object.assign(st.ship, { x: a.x + 300, y: a.y + 80, vx: -300, vy: -60 });
    st.highWaterY = a.y - 400;
    st.fuel = cfg.fuelMax;
    let atPark = -1;
    for (let i = 0; i < 200; i++) {
      stepSim(
        st,
        cfg,
        { held: i >= 5 && i < 120, pressed: i === 5, released: i === 120 },
        FIXED_DT,
      );
      if (st.capture?.phase === 'orbit' && atPark < 0) atPark = st.charges.zip;
    }
    // nothing at the grab, one at the release
    expect(atPark, 'a charge appeared at the grab').toBe(0);
    expect(st.charges.zip, 'leaving the anomaly granted nothing').toBe(1);
  });
});

describe('a spent charge replaces the dive with the glide', () => {
  it('parks in zipDur from anywhere, however far the press was', () => {
    const ticks = Math.round(DEFAULT_CONFIG.zipDur / FIXED_DT);
    let checked = 0;
    for (const [bi, dist, aim, speed] of APPROACHES) {
      const z = grab(DEFAULT_CONFIG, bi, dist, aim, speed, true);
      if (!z || !z.zipped || z.secs < 0) continue;
      checked++;
      expect(Math.round(z.secs * 60), `(${bi},${dist},${aim},${speed})`).toBe(ticks);
    }
    expect(checked, 'no approach zipped').toBeGreaterThan(100);
  });

  it('lands where the dive would have taken it, so aim still decides', () => {
    // The zip is a shortcut, not a different destination: it glides to the orbit
    // `predictedCaptureOrbit` says the dive was heading for — the same curve the
    // compass previews while diving. Measured, the parked radius is within 15% of
    // the flown one in 86% of approaches.
    let close = 0;
    let n = 0;
    for (const [bi, dist, aim, speed] of APPROACHES) {
      const d = grab(DEFAULT_CONFIG, bi, dist, aim, speed, false);
      const z = grab(DEFAULT_CONFIG, bi, dist, aim, speed, true);
      if (!d || !z || !z.zipped || d.secs < 0 || z.secs < 0) continue;
      n++;
      if (Math.abs(d.r - z.r) / Math.max(1, d.r) < 0.15) close++;
    }
    expect(n).toBeGreaterThan(100);
    expect(close / n).toBeGreaterThan(0.8);
  });

  it('is worth exactly what the capture was worth before', () => {
    // The pin that matters, and the one that was nearly got wrong. Judging a
    // zipped grab on the ORBIT it reaches sounds fairer and measured 1.35x the
    // flown award, p90 7.6x, worst 14.6x — most generous of all to the lazy
    // point-blank press it was meant to discourage, because
    // `predictedCaptureOrbit` clears the surface and lands almost any near aim at
    // `minR`. A zip buys back the flying time; it does not change the price.
    let n = 0;
    for (const [bi, dist, aim, speed] of APPROACHES) {
      const d = grab(DEFAULT_CONFIG, bi, dist, aim, speed, false);
      const z = grab(DEFAULT_CONFIG, bi, dist, aim, speed, true);
      if (!d || !z || !z.zipped || d.award <= 0 || z.award <= 0) continue;
      n++;
      expect(z.award, `(${bi},${dist},${aim},${speed}) paid differently`).toBe(d.award);
    }
    expect(n, 'no approach paid a grab award').toBeGreaterThan(100);
  });

  it('spends the charge, and only one', () => {
    const z = grab(DEFAULT_CONFIG, 7, 220, 45, 340, true);
    expect(z!.zipped).toBe(true);
    // and with none, the same approach flies the dive
    const d = grab(DEFAULT_CONFIG, 7, 220, 45, 340, false);
    expect(d!.zipped).toBe(false);
    expect(d!.secs).toBeGreaterThan(z!.secs);
  });

  it('is inert wherever zipDur is 0', () => {
    const off = { ...DEFAULT_CONFIG, zipDur: 0 };
    const z = grab(off, 7, 220, 45, 340, true);
    expect(z!.zipped).toBe(false);
    expect(PROTOTYPE_CONFIG.zipDur).toBe(0);
    // and the prototype has no source of one anyway, which is what keeps the gate
    // at zero without a second flag
    expect(PROTOTYPE_CONFIG.anomalyCount).toBe(0);
  });
});
