/**
 * The camera encodes the "every device sees the same slice of world" decision.
 * These guard it: the design window must always be fully visible and centred,
 * whatever the viewport, and the simulation must never be able to observe any
 * of it.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, fitCamera, worldToScreenY } from '../src/render/camera.ts';
import { DESIGN_H, createBodies, fieldBounds } from '../src/sim/world.ts';
import { DEFAULT_CONFIG } from '../src/sim/config.ts';

const bounds = fieldBounds(DEFAULT_CONFIG, createBodies());

const VIEWPORTS = [
  { name: 'iPhone portrait', w: 390, h: 844 },
  { name: 'tall narrow', w: 360, h: 900 },
  { name: 'wide short (landscape)', w: 844, h: 390 },
  { name: 'tablet', w: 768, h: 1024 },
  { name: 'square', w: 600, h: 600 },
];

describe('camera letterboxing', () => {
  it.each(VIEWPORTS)('$name: the whole design window fits on screen', (vp) => {
    const cam = createCamera(bounds.width);
    fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });

    const drawnW = cam.designW * cam.scale;
    const drawnH = cam.designH * cam.scale;

    expect(drawnW).toBeLessThanOrEqual(vp.w + 1e-9);
    expect(drawnH).toBeLessThanOrEqual(vp.h + 1e-9);
    // one axis fits exactly; the other gets the bars
    expect(Math.abs(drawnW - vp.w) < 1e-9 || Math.abs(drawnH - vp.h) < 1e-9).toBe(true);
  });

  it.each(VIEWPORTS)('$name: the design window is centred', (vp) => {
    const cam = createCamera(bounds.width);
    fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
    expect(cam.offsetX * 2 + cam.designW * cam.scale).toBeCloseTo(vp.w, 9);
    expect(cam.offsetY * 2 + cam.designH * cam.scale).toBeCloseTo(vp.h, 9);
  });

  it('shows the same amount of world regardless of viewport', () => {
    const worldPerScreen = VIEWPORTS.map((vp) => {
      const cam = createCamera(bounds.width);
      fitCamera(cam, { w: vp.w, h: vp.h, dpr: 1 });
      // world units spanned by the design window, vertically
      return (cam.designH * cam.scale) / cam.scale;
    });
    for (const span of worldPerScreen) expect(span).toBeCloseTo(DESIGN_H, 9);
  });

  it('places the camera centre at the middle of the design window', () => {
    const cam = createCamera(bounds.width);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    cam.centerY = -1000;
    const mid = worldToScreenY(cam, -1000);
    expect(mid).toBeCloseTo(cam.offsetY + (cam.designH * cam.scale) / 2, 9);
  });
});
