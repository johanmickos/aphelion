/**
 * Guards for the title-screen attract loop.
 *
 * The point of authoring the path in closed form rather than driving `stepSim`
 * was that the loop CLOSES and stays smooth by construction. These assert that
 * it actually does, and that the figure is still an 8 — two lobes rounded in
 * opposite senses with crossing transfers — because every one of those is a
 * property the geometry is supposed to force, not a property anyone drew.
 */
import { describe, expect, it } from 'vitest';
import { recordingContext } from './canvas-stub.ts';
import {
  ATTRACT,
  ORBIT_BIG,
  ORBIT_SMALL,
  PLAYBACK_RATE,
  createAttractLoop,
  drawAttractLoop,
} from '../src/render/attract.ts';
import { DEFAULT_CONFIG } from '../src/sim/config.ts';
import { circSpeed } from '../src/sim/orbit.ts';
import { boostEnvelope } from '../src/sim/boost.ts';

const loop = createAttractLoop(DEFAULT_CONFIG);

/** Smallest signed difference between two headings. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * The three interior seam times, found from the poses alone: a straight stretch
 * is the only place the heading holds still. Derived rather than imported so the
 * tests keep checking the shape rather than the bookkeeping that built it.
 */
function segmentEnds(): number[] {
  const dt = 0.0005;
  const out: number[] = [];
  let straight = false;
  let prev = loop.pose(0);
  for (let t = dt; t < loop.period; t += dt) {
    const p = loop.pose(t);
    const turning = Math.abs(angleDelta(p.angle, prev.angle)) > 1e-9;
    if (turning === straight) {
      out.push(t);
      straight = !turning;
    }
    prev = p;
  }
  return out;
}

describe('attract loop', () => {
  it('closes exactly: the end of the cycle is its beginning', () => {
    const a = loop.pose(0);
    const b = loop.pose(loop.period);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-9);
    expect(Math.abs(angleDelta(b.angle, a.angle))).toBeLessThan(1e-9);
  });

  it('never jumps: position and heading are continuous across every seam', () => {
    // The seams are what a hand-authored path gets wrong. Sampled finer than any
    // frame so a discontinuity cannot hide between two samples.
    const dt = 0.001;
    let worstStep = 0;
    let worstTurn = 0;
    let prev = loop.pose(0);
    for (let t = dt; t <= loop.period + dt; t += dt) {
      const p = loop.pose(t);
      worstStep = Math.max(worstStep, Math.hypot(p.x - prev.x, p.y - prev.y));
      worstTurn = Math.max(worstTurn, Math.abs(angleDelta(p.angle, prev.angle)));
      prev = p;
    }
    // A step larger than the fastest the ship ever moves would be a teleport.
    expect(worstStep).toBeLessThan(loop.maxSpeed * dt * 1.05);
    // The tightest turn is the small orbit's sweep rate, ~4.1 rad/s once played.
    expect(worstTurn).toBeLessThan(0.01);
  });

  it('is a figure-8: the two lobes are rounded in opposite senses', () => {
    // Measured from the poses rather than read off the construction, so this
    // still fails if the tangent pairing is swapped and the shape quietly
    // becomes a racetrack.
    const turn = (t: number): number => {
      const a = loop.pose(t);
      const b = loop.pose(t + 0.02);
      return angleDelta(b.angle, a.angle);
    };
    // Deep inside each lobe, clear of both seams.
    const big = turn(loop.period * 0.2);
    const small = turn(loop.period * 0.75);
    expect(big).not.toBe(0);
    expect(small).not.toBe(0);
    expect(Math.sign(big)).not.toBe(Math.sign(small));
  });

  it('is a figure-8: the two transfers cross between the bodies', () => {
    // A racetrack uses the external tangents and they never meet. Find the two
    // straight stretches by their zero curvature and check they intersect.
    const b1 = loop.planets[0]!;
    const b2 = loop.planets[1]!;
    const gap = (x: number, y: number): boolean =>
      Math.hypot(x - b1.x, y - b1.y) > ORBIT_BIG + 1 &&
      Math.hypot(x - b2.x, y - b2.y) > ORBIT_SMALL + 1;
    let crossings = 0;
    const dt = 0.002;
    // The crossing sits on the axis of symmetry, y = 0, out in the gap that
    // neither orbit reaches — which is exactly where an external tangent would
    // never take the ship.
    let prev = loop.pose(0);
    for (let t = dt; t <= loop.period; t += dt) {
      const p = loop.pose(t);
      if (gap(p.x, p.y) && p.y * prev.y < 0) crossings++;
      prev = p;
    }
    // Once per transfer: the two straights meet in the gap.
    expect(crossings).toBe(2);
  });

  it('never touches either body', () => {
    let worst = Infinity;
    for (let t = 0; t < loop.period; t += 0.005) {
      const p = loop.pose(t);
      for (const b of loop.planets) {
        worst = Math.min(worst, Math.hypot(p.x - b.x, p.y - b.y) - b.R);
      }
    }
    // Clear by more than `minOrbitGap`, so the ship is never inside a limit the
    // simulation would have clamped it out of.
    expect(worst).toBeGreaterThan(DEFAULT_CONFIG.minOrbitGap);
  });

  it('runs at the game’s own orbital speeds, played at one rate', () => {
    // Not numbers chosen to look right: sqrt(GM/r) is what the ship would
    // actually be doing at these radii. PLAYBACK_RATE is the single deliberate
    // departure and it is UNIFORM — if it ever leaks into one lobe and not the
    // other, the shape stops being the simulation's and this fails.
    const speedAt = (t: number): number => {
      const a = loop.pose(t);
      const b = loop.pose(t + 1e-4);
      return Math.hypot(b.x - a.x, b.y - a.y) / 1e-4;
    };
    const big = speedAt(loop.period * 0.2);
    const small = speedAt(loop.period * 0.8);
    expect(big).toBeCloseTo(circSpeed(DEFAULT_CONFIG, ORBIT_BIG) * PLAYBACK_RATE, 2);
    expect(small).toBeCloseTo(circSpeed(DEFAULT_CONFIG, ORBIT_SMALL) * PLAYBACK_RATE, 2);
    // The ratio survives the rate, because the rate is uniform.
    expect(small / big).toBeCloseTo(Math.sqrt(ORBIT_BIG / ORBIT_SMALL), 6);
  });

  it('orbits the small body and slingshots the large one', () => {
    // The asymmetry IS the lesson: the ship must visibly stay at one and pass the
    // other. Measured as total turning, which is what "went round it again" means.
    const turned = (t0: number, t1: number): number => {
      let total = 0;
      const dt = 0.001;
      let prev = loop.pose(t0);
      for (let t = t0 + dt; t <= t1; t += dt) {
        const p = loop.pose(t);
        total += Math.abs(angleDelta(p.angle, prev.angle));
        prev = p;
      }
      return total;
    };
    // Segment boundaries, found by where the heading stops changing (a straight).
    const bigArcEnd = segmentEnds()[0]!;
    const smallArcStart = segmentEnds()[1]!;
    const smallArcEnd = segmentEnds()[2]!;
    const bigTurn = turned(0, bigArcEnd);
    const smallTurn = turned(smallArcStart, smallArcEnd);
    // Under one full turn round the big body; more than one round the small.
    expect(bigTurn).toBeLessThan(2 * Math.PI);
    expect(smallTurn).toBeGreaterThan(2 * Math.PI);
    // And the extra is exactly one lap, not a fudge.
    expect(smallTurn - bigTurn).toBeCloseTo(2 * Math.PI, 1);
  });

  it('holds a whole cycle inside three and a half seconds', () => {
    // Pinned because the pacing is a decision, not an accident: one lap at the
    // small body, none at the large, played at PLAYBACK_RATE. If a radius is
    // retuned this moves, and it should be looked at rather than absorbed.
    expect(loop.period).toBeGreaterThan(3.1);
    expect(loop.period).toBeLessThan(3.7);
  });

  it('keeps the slingshot lobe inside the boost window', () => {
    // ORBIT_BIG is 95 rather than 110 for exactly this reason, and nothing else
    // in the file records it. boostEnvelope holds its peak to settleDur and is
    // spent by settleDur + boostDecayTime; the short lobe has to land inside
    // that or the fling below silently becomes nothing.
    const cliff = DEFAULT_CONFIG.settleDur + DEFAULT_CONFIG.boostDecayTime;
    const bigDwell = segmentEnds()[0]! * PLAYBACK_RATE;
    const smallDwell = (segmentEnds()[2]! - segmentEnds()[1]!) * PLAYBACK_RATE;
    expect(bigDwell).toBeLessThan(cliff);
    expect(boostEnvelope(DEFAULT_CONFIG, DEFAULT_CONFIG.boostMax, bigDwell)).toBeGreaterThan(30);
    // And the long one is past it, which is the game's own rule on display.
    expect(smallDwell).toBeGreaterThan(cliff);
    expect(boostEnvelope(DEFAULT_CONFIG, DEFAULT_CONFIG.boostMax, smallDwell)).toBe(0);
  });

  it('flings off the slingshot and coasts off the orbit', () => {
    const speedAt = (t: number): number => {
      const a = loop.pose(t);
      const b = loop.pose(t + 1e-4);
      return Math.hypot(b.x - a.x, b.y - a.y) / 1e-4;
    };
    const ends = segmentEnds();
    const orbitalBig = circSpeed(DEFAULT_CONFIG, ORBIT_BIG) * PLAYBACK_RATE;
    const orbitalSmall = circSpeed(DEFAULT_CONFIG, ORBIT_SMALL) * PLAYBACK_RATE;
    // Just after each release, before the burst has bled off.
    const offBig = speedAt(ends[0]! + 1e-3);
    const offSmall = speedAt(ends[2]! + 1e-3);
    expect(offBig / orbitalBig).toBeGreaterThan(1.2);
    // The long hold forfeited the boost, so this one leaves at what it was doing.
    expect(offSmall / orbitalSmall).toBeCloseTo(1, 2);
    // And the fling decays rather than persisting: the game's burst, not a speed
    // the ship simply keeps.
    expect(speedAt(ends[1]! - 1e-3)).toBeLessThan(offBig);
  });

  it('paints the region opaque before anything else', () => {
    // The armed overlay is dimmed, not removed, so a transparent frame would show
    // the live field through the figure.
    const rec = recordingContext();
    drawAttractLoop(rec.ctx, loop, 0, 360, 176);
    const first = rec.ops.findIndex(([k]) => k === 'fillRect');
    const fillStyle = rec.ops.slice(0, first).filter(([k]) => k === '=fillStyle');
    expect(fillStyle[fillStyle.length - 1]?.[1]).toBe('#000');
    expect(rec.ops[first]).toEqual(['fillRect', 0, 0, 360, 176]);
  });

  it('draws two bodies and one ship, and nothing else', () => {
    const rec = recordingContext();
    drawAttractLoop(rec.ctx, loop, loop.period * 0.3, 360, 176);
    // Two circles for the planets; the ship is a closed polygon, not an arc.
    expect(rec.calls('arc')).toHaveLength(2);
    expect(rec.calls('closePath')).toHaveLength(1);
    // No text, no gradients: this screen carries no HUD and no score.
    expect(rec.calls('fillText')).toHaveLength(0);
    expect(rec.calls('=createRadialGradient')).toHaveLength(0);
    expect(rec.calls('=createLinearGradient')).toHaveLength(0);
  });

  it('keeps the ship legible when the box is squeezed', () => {
    // Landscape phones drop the canvas to ~160x78. The figure scales, the ship
    // stops.
    const rec = recordingContext();
    drawAttractLoop(rec.ctx, loop, 0, 160, 78);
    const nose = rec.calls('moveTo').at(-1)!;
    expect(nose[1]).toBeCloseTo(9 * ATTRACT.minShipScale, 6);
  });
});
