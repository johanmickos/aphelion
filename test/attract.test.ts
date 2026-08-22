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
  createAttractLoop,
  drawAttractLoop,
} from '../src/render/attract.ts';
import { DEFAULT_CONFIG } from '../src/sim/config.ts';
import { circSpeed } from '../src/sim/orbit.ts';

const loop = createAttractLoop(DEFAULT_CONFIG);

/** Smallest signed difference between two headings. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
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
    const maxSpeed = circSpeed(DEFAULT_CONFIG, ORBIT_SMALL);
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
    expect(worstStep).toBeLessThan(maxSpeed * dt * 1.05);
    // The tightest turn is the small orbit's sweep rate, ~3.3 rad/s.
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

  it('runs at the game’s own orbital speeds', () => {
    // Not a round number chosen to look right: sqrt(GM/r) is what the ship would
    // actually be doing at these radii, and the lobes differ because a tighter
    // orbit is genuinely faster.
    const speedAt = (t: number): number => {
      const a = loop.pose(t);
      const b = loop.pose(t + 1e-4);
      return Math.hypot(b.x - a.x, b.y - a.y) / 1e-4;
    };
    expect(speedAt(loop.period * 0.2)).toBeCloseTo(circSpeed(DEFAULT_CONFIG, ORBIT_BIG), 2);
    expect(speedAt(loop.period * 0.75)).toBeCloseTo(circSpeed(DEFAULT_CONFIG, ORBIT_SMALL), 2);
  });

  it('holds a whole cycle inside ten and a half seconds', () => {
    // Pinned because the pacing is a decision, not an accident: one extra lap per
    // lobe. If a radius is retuned this moves, and it should be looked at.
    expect(loop.period).toBeGreaterThan(9.5);
    expect(loop.period).toBeLessThan(10.5);
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
