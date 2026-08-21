/**
 * The camera encodes two locked decisions: every device sees the same slice of
 * world (letterboxed design window), and the window pans horizontally across the
 * wider playfield rather than being sized to it.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_VIEW_H,
  MIN_VIEW_H,
  cameraTarget,
  centerCamera,
  createCamera,
  fitCamera,
  toScreenX,
  toScreenY,
} from '../src/render/camera.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { SPAWN, createBodies, fieldBounds } from '../src/sim/world.ts';
import { DEFAULT_CONFIG } from '../src/sim/config.ts';

const rcfg = DEFAULT_RENDER_CONFIG;
const field = fieldBounds(DEFAULT_CONFIG, createBodies());

describe('fitting the viewport', () => {
  const PHONES = [
    { name: 'iPhone 15, Firefox chrome', w: 393, h: 651 },
    { name: 'iPhone 15, Safari', w: 393, h: 852 },
    { name: 'iPhone Pro Max', w: 430, h: 932 },
    { name: 'small phone', w: 360, h: 640 },
    { name: 'tall narrow', w: 360, h: 900 },
  ];

  it.each(PHONES)('$name: fills the width exactly, with no bars at all', (vp) => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
    expect(cam.offsetX, 'horizontal bars on a portrait phone').toBeCloseTo(0, 6);
    expect(cam.offsetY, 'vertical bars on a portrait phone').toBeCloseTo(0, 6);
    expect(cam.designW * cam.scale).toBeCloseTo(vp.w, 6);
    expect(cam.viewH * cam.scale).toBeCloseTo(vp.h, 6);
  });

  it.each(PHONES)('$name: horizontal framing is identical everywhere', (vp) => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
    // The world width spanned by the screen is the same on every device — this is
    // the property that matters for a vertical climb, and it is why width is
    // fixed and height flexes rather than the other way round.
    expect(cam.designW).toBe(rcfg.designW);
    expect(vp.w / cam.scale).toBeCloseTo(rcfg.designW, 6);
  });

  it.each(PHONES)('$name: how much world you see ahead stays sane', (vp) => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
    expect(cam.viewH).toBeGreaterThanOrEqual(MIN_VIEW_H - 1e-6);
    expect(cam.viewH).toBeLessThanOrEqual(MAX_VIEW_H + 1e-6);
  });

  it('clamps rather than zooming in blindly on a wide screen', () => {
    // A tablet would otherwise scale to ~2x and show barely any world ahead.
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 768, h: 1024, dpr: 1 });
    expect(cam.viewH).toBeCloseTo(MIN_VIEW_H, 6);
    expect(cam.offsetX).toBeGreaterThan(0); // bars, deliberately
    expect(cam.offsetX * 2 + cam.designW * cam.scale).toBeCloseTo(768, 6);
  });

  it('keeps the window centred whenever bars do appear', () => {
    for (const vp of [
      { w: 768, h: 1024 },
      { w: 844, h: 390 },
    ]) {
      const cam = createCamera(rcfg);
      fitCamera(cam, { ...vp, dpr: 1 });
      expect(cam.offsetX * 2 + cam.designW * cam.scale).toBeCloseTo(vp.w, 6);
      expect(cam.offsetY * 2 + cam.viewH * cam.scale).toBeCloseTo(vp.h, 6);
    }
  });

  it('never draws outside the viewport', () => {
    for (const vp of [
      ...PHONES,
      { name: 'tablet', w: 768, h: 1024 },
      { name: 'landscape', w: 844, h: 390 },
    ]) {
      const cam = createCamera(rcfg);
      fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
      expect(cam.designW * cam.scale).toBeLessThanOrEqual(vp.w + 1e-6);
      expect(cam.viewH * cam.scale).toBeLessThanOrEqual(vp.h + 1e-6);
    }
  });

  it('places the camera centre at the middle of the window', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 393, h: 651, dpr: 1 });
    cam.centerY = -1000;
    expect(toScreenY(cam, -1000)).toBeCloseTo(cam.offsetY + (cam.viewH * cam.scale) / 2, 9);
  });
});

describe('horizontal panning', () => {
  it('never scrolls past the field edges', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    for (let x = field.left - 200; x <= field.right + 200; x += 7) {
      centerCamera(cam, x, 0, field);
      expect(cam.left).toBeGreaterThanOrEqual(field.left - 1e-9);
      expect(cam.left + cam.designW).toBeLessThanOrEqual(field.right + 1e-9);
    }
  });

  it('pans by exactly the field overhang, no more', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    let min = Infinity;
    let max = -Infinity;
    for (let x = field.left; x <= field.right; x += 3) {
      centerCamera(cam, x, 0, field);
      min = Math.min(min, cam.left);
      max = Math.max(max, cam.left);
    }
    expect(max - min).toBeCloseTo(field.width - cam.designW, 6);
  });

  it('does not pan while the ship stays inside the margins', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    const centred = field.left + (field.width - cam.designW) / 2;
    cam.left = centred;
    const margin = cam.designW * rcfg.cameraMarginFrac;
    const t = cameraTarget(cam, rcfg, centred + cam.designW / 2, 0, field);
    expect(t.left).toBeCloseTo(centred, 9);
    // and it does pan once the ship crosses a margin
    const past = cameraTarget(cam, rcfg, centred + cam.designW - margin + 10, 0, field);
    expect(past.left).toBeGreaterThan(centred);
  });

  it('keeps the ship on screen at both field edges', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    for (const x of [field.left + 1, field.right - 1]) {
      centerCamera(cam, x, 0, field);
      const sx = toScreenX(cam, x);
      expect(sx).toBeGreaterThanOrEqual(cam.offsetX - 1e-9);
      expect(sx).toBeLessThanOrEqual(cam.offsetX + cam.designW * cam.scale + 1e-9);
    }
  });
});

describe('deadzone (no wobble)', () => {
  /** Drive the camera the way the app does: compute a target, then ease toward it. */
  function fly(path: number[], startAt = path[0]!): number[] {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    centerCamera(cam, startAt, 0, field);
    const seen: number[] = [];
    for (const x of path) {
      const t = cameraTarget(cam, rcfg, x, 0, field);
      cam.left += (t.left - cam.left) * Math.min(1, (1 / 60) * rcfg.cameraFollow);
      seen.push(cam.left);
    }
    return seen;
  }

  /**
   * A position where panning is active but the field-edge clamp is NOT binding.
   * This matters: at the extreme edges the clamp pins the camera and hides the
   * oscillation entirely, which is why a first attempt at these tests passed
   * against the broken implementation.
   */
  const MID_FIELD = 360;

  /**
   * The wobble, reproduced. An orbiting ship's x swings across the pan margin
   * every revolution; a recentring target then flips between "follow the ship"
   * and "return to centre" on each crossing, and the camera lurches back and
   * forth. Measured against the old implementation: 573px of camera travel and
   * 46 direction changes over ten seconds, while the deadzone version moves 0.
   *
   * A steady ship does NOT expose this — exponential easing approaches its target
   * asymptotically and never overshoots — which is why the first attempt at these
   * tests passed against the broken code.
   */
  it('does not lurch while the ship orbits near the field edge', () => {
    const path: number[] = [];
    for (let i = 0; i < 600; i++) path.push(330 + 70 * Math.sin(i / 28));

    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    centerCamera(cam, path[0]!, 0, field);

    let travel = 0;
    let reversals = 0;
    let prevD = 0;
    for (const x of path) {
      const before = cam.left;
      const t = cameraTarget(cam, rcfg, x, 0, field);
      cam.left += (t.left - cam.left) * Math.min(1, (1 / 60) * rcfg.cameraFollow);
      const d = cam.left - before;
      travel += Math.abs(d);
      if (prevD * d < -1e-12) reversals++;
      prevD = d;
    }
    expect(reversals, `camera changed direction ${reversals} times`).toBeLessThan(4);
    expect(travel, `camera travelled ${travel.toFixed(0)}px while the ship orbited`).toBeLessThan(
      60,
    );
  });

  it('comes to rest when the ship parks mid-field', () => {
    const seen = fly(
      Array.from({ length: 600 }, () => MID_FIELD),
      195,
    );
    const tail = seen.slice(-120);
    const spread = Math.max(...tail) - Math.min(...tail);
    expect(
      spread,
      `camera never settled: it moved ${spread.toFixed(2)}px while the ship was still`,
    ).toBeLessThan(0.05);
  });

  it('does not reverse direction while the ship creeps outward', () => {
    // Slow enough that the camera can catch up — which is precisely when a
    // recentring target flips and sends the camera back the other way.
    const path: number[] = [];
    for (let x = 200; x < MID_FIELD; x += 0.25) path.push(x);
    const seen = fly(path, 195);
    let reversals = 0;
    for (let i = 2; i < seen.length; i++) {
      const a = seen[i - 1]! - seen[i - 2]!;
      const b = seen[i]! - seen[i - 1]!;
      if (a > 1e-9 && b < -1e-9) reversals++;
    }
    expect(reversals, 'camera reversed while the ship moved steadily one way').toBe(0);
  });

  it('holds completely still while the ship moves inside the margins', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    centerCamera(cam, 195, 0, field);
    const before = cam.left;
    const margin = cam.designW * rcfg.cameraMarginFrac;
    for (const x of [
      before + margin + 1,
      before + cam.designW - margin - 1,
      before + cam.designW / 2,
    ]) {
      expect(cameraTarget(cam, rcfg, x, 0, field).left).toBe(before);
    }
  });
});

describe('opening frame', () => {
  /**
   * The run used to open on a red boundary stripe. The ship spawns 90px left of
   * the field's centre, so a 1.45-wide field left the camera clamped hard against
   * that edge — the boundary landed at exactly screen x = 0, a 2.25px shortfall.
   *
   * Spawning at the field centre instead is not the fix: the centre is x=195 and
   * P1 sits at x=189 with R=46, which is a collision course drifting straight up.
   */
  it('shows neither field boundary when the run starts', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 393, h: 651, dpr: 1 });
    centerCamera(cam, SPAWN.x, SPAWN.y, field);

    const winL = cam.offsetX;
    const winR = cam.offsetX + cam.designW * cam.scale;
    const leftEdge = toScreenX(cam, field.left);
    const rightEdge = toScreenX(cam, field.right);

    expect(leftEdge, 'left boundary is on screen at spawn').toBeLessThan(winL);
    expect(rightEdge, 'right boundary is on screen at spawn').toBeGreaterThan(winR);
  });

  it('keeps the hazard gradient off screen too, not just the line', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 393, h: 651, dpr: 1 });
    centerCamera(cam, SPAWN.x, SPAWN.y, field);
    // the gradient builds inward from the edge, so its inner lip is what matters
    const innerLip = toScreenX(cam, field.left + rcfg.hazardZoneWidth);
    expect(innerLip).toBeLessThan(cam.offsetX);
  });

  it('the ship does not start on a collision course with P1', () => {
    const p1 = createBodies()[0]!;
    expect(Math.abs(SPAWN.x - p1.x)).toBeGreaterThan(p1.R + DEFAULT_CONFIG.minOrbitGap);
  });
});
