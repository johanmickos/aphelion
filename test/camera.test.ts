/**
 * The camera encodes two locked decisions: every device sees the same slice of
 * world (letterboxed design window), and the window pans horizontally across the
 * wider playfield rather than being sized to it.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_VIEW_H,
  MIN_VIEW_H,
  anomalyFocus,
  cameraTarget,
  centerCamera,
  createCamera,
  fitCamera,
  barrierRelax,
  followCamera,
  frozenOrbit,
  orbitLock,
  toScreenX,
  toScreenY,
  visibleWorldY,
} from '../src/render/camera.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { SPAWN, createBodies, fieldBounds } from '../src/sim/world.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { Camera } from '../src/render/camera.ts';
import type { Anomaly } from '../src/sim/types.ts';
import { backtrackFloorY } from '../src/sim/world.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { hypot } from '../src/sim/orbit.ts';

const rcfg = DEFAULT_RENDER_CONFIG;

/** A camera fitted to the design viewport, which is what every framing test wants. */
function cam390(): Camera {
  const c = createCamera(DEFAULT_RENDER_CONFIG);
  fitCamera(c, { w: 390, h: 844, dpr: 2 });
  return c;
}
const field = fieldBounds(DEFAULT_CONFIG, createBodies(DEFAULT_CONFIG));

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
      centerCamera(cam, x, 0, field, null);
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
      centerCamera(cam, x, 0, field, null);
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
    const t = cameraTarget(cam, rcfg, centred + cam.designW / 2, 0, field, null);
    expect(t.left).toBeCloseTo(centred, 9);
    // and it does pan once the ship crosses a margin
    const past = cameraTarget(cam, rcfg, centred + cam.designW - margin + 10, 0, field, null);
    expect(past.left).toBeGreaterThan(centred);
  });

  it('keeps the ship on screen at both field edges', () => {
    const cam = createCamera(rcfg);
    fitCamera(cam, { w: 390, h: 844, dpr: 1 });
    for (const x of [field.left + 1, field.right - 1]) {
      centerCamera(cam, x, 0, field, null);
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
    centerCamera(cam, startAt, 0, field, null);
    const seen: number[] = [];
    for (const x of path) {
      const t = cameraTarget(cam, rcfg, x, 0, field, null);
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
    centerCamera(cam, path[0]!, 0, field, null);

    let travel = 0;
    let reversals = 0;
    let prevD = 0;
    for (const x of path) {
      const before = cam.left;
      const t = cameraTarget(cam, rcfg, x, 0, field, null);
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
    centerCamera(cam, 195, 0, field, null);
    const before = cam.left;
    const margin = cam.designW * rcfg.cameraMarginFrac;
    for (const x of [
      before + margin + 1,
      before + cam.designW - margin - 1,
      before + cam.designW / 2,
    ]) {
      expect(cameraTarget(cam, rcfg, x, 0, field, null).left).toBe(before);
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
    centerCamera(cam, SPAWN.x, SPAWN.y, field, null);

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
    centerCamera(cam, SPAWN.x, SPAWN.y, field, null);
    // the gradient builds inward from the edge, so its inner lip is what matters
    const innerLip = toScreenX(cam, field.left + rcfg.hazardZoneWidth);
    expect(innerLip).toBeLessThan(cam.offsetX);
  });

  it('the ship does not start on a collision course with P1', () => {
    const p1 = createBodies(DEFAULT_CONFIG)[0]!;
    expect(Math.abs(SPAWN.x - p1.x)).toBeGreaterThan(p1.R + DEFAULT_CONFIG.minOrbitGap);
  });
});

/**
 * Reported from a real session: "I don't think we should ever see past the
 * dashed line. The camera should just stop panning when we approach it."
 *
 * The vertical axis had no clamp at all — `centerY` was simply the ship's y — so
 * the view followed the ship down into a region where the run is already over.
 * Worse, with the ship held centred it is the LINE that appears to move, which
 * reads as the floor rising rather than as the ship falling.
 */
describe('the view stops at the trailing floor', () => {
  function camAt(shipY: number, floorY: number | null) {
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    centerCamera(c, 195, shipY, field, floorY);
    return c;
  }

  it('never shows anything below the line', () => {
    const floorY = 1000;
    // ship well clear: ordinary framing, the line is off screen below
    const clear = camAt(0, floorY);
    expect(clear.centerY).toBe(0);
    expect(visibleWorldY(clear).bottom).toBeLessThan(floorY);

    // ship right up against it: the view has stopped, and the line sits exactly
    // on the bottom edge rather than somewhere up the frame
    const near = camAt(floorY - 40, floorY);
    expect(visibleWorldY(near).bottom).toBeCloseTo(floorY, 6);
    expect(near.centerY).toBeLessThan(floorY - 40);
  });

  it('holds the line still, so it is the ship that visibly falls', () => {
    const floorY = 1000;
    const a = camAt(floorY - 200, floorY);
    const b = camAt(floorY - 60, floorY);
    // the ship dropped 140px and the line did not move on screen at all
    expect(toScreenY(b, floorY)).toBeCloseTo(toScreenY(a, floorY), 6);
    expect(toScreenY(b, floorY - 60)).toBeGreaterThan(toScreenY(a, floorY - 200));
  });

  it('does not clamp when there is no floor', () => {
    // the prototype has no trailing floor at all
    expect(camAt(5000, null).centerY).toBe(5000);
  });

  it('eases to the clamped target rather than the ship', () => {
    const floorY = 1000;
    const c = camAt(0, floorY);
    for (let i = 0; i < 200; i++) followCamera(c, rcfg, 195, floorY - 20, field, floorY, 1 / 60);
    // exponential easing only asymptotes, so this settles at the line rather
    // than landing exactly on it
    expect(visibleWorldY(c).bottom).toBeCloseTo(floorY, 1);
  });
});

/**
 * What the camera watches, and which way it leans.
 *
 * All three of these are regressions that shipped or nearly shipped, so they are
 * pinned as behaviour rather than left to the eye.
 */
describe('what the camera watches', () => {
  it('locks a settled orbit still, and only a settled orbit', () => {
    // Reported as the view bouncing while orbiting. Measured on a real capture
    // the ship travels 129px vertically per orbit with a ~0.6s period, against a
    // camera lag of 0.33s — too slow to track it, and with no vertical deadzone
    // to ignore it, so all it could do was smear.
    const run = (anchored: boolean): number[] => {
      const st = createInitialState(DEFAULT_CONFIG);
      const cam = cam390();
      const ys: number[] = [];
      for (let i = 0; i < 700; i++) {
        stepSim(
          st,
          DEFAULT_CONFIG,
          { held: i >= 18, pressed: i === 18, released: false },
          FIXED_DT,
        );
        const p = shipWorldPos(st);
        const cap = st.capture;
        const b = cap ? st.bodies[cap.planet]! : null;
        const anchor = b
          ? { x: b.x, y: b.y, lock: orbitLock(cap!.phase, cap!.settleProgress), id: cap!.planet }
          : null;
        followCamera(
          cam,
          { ...DEFAULT_RENDER_CONFIG, cameraOrbitLock: anchored ? 1 : 0 },
          p.x,
          p.y,
          field,
          backtrackFloorY(DEFAULT_CONFIG, st.highWaterY),
          FIXED_DT,
          anchor,
          st.ship.vx,
        );
        if (i > 400 && st.capture?.phase === 'orbit') ys.push(cam.centerY);
      }
      return ys;
    };
    const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
    expect(spread(run(false)), 'the ship-following case should wobble').toBeGreaterThan(30);
    expect(spread(run(true))).toBeLessThan(0.5);
  });

  it('never shows dead space past a wall in ordinary play', () => {
    // The anomaly work relaxed this clamp so the view could follow a ship out
    // past the barrier — unconditionally, which also fired in ordinary play and
    // panned up to 80px beyond the wall to show nothing. The relaxation is gated
    // on the ship actually being outside; inside, the wall is a hard stop.
    const cam = cam390();
    for (const shipX of [400, 480, 540, 560, field.right]) {
      cam.left = field.right - cam.designW;
      const t = cameraTarget(cam, DEFAULT_RENDER_CONFIG, shipX, -1000, field, null, 0);
      expect(t.left + cam.designW, `ship at ${shipX} panned past the wall`).toBeLessThanOrEqual(
        field.right + 0.5,
      );
    }
  });

  it('never shows dead space past a wall once the camera has actually moved', () => {
    // The sibling above pins the TARGET, and the target was never the leak. The
    // backstop in `followCamera` wrote its own bound — framing only, at the full
    // `cameraBackstopEdge`, with no field rule — so a ship hugging a side wall
    // dragged the view 18px past the dashed line to hold itself 18px inside the
    // window. Measured at exactly -18px against `field.left` at every speed, with
    // no anomaly within thousands of px. Both clamps read `panBounds` now.
    const bodies = createBodies(DEFAULT_CONFIG);
    for (const dir of [-1, 1] as const) {
      for (const speed of [100, 300, 500]) {
        const cam = cam390();
        let x = dir < 0 ? field.left + 300 : field.right - 300;
        const y = -2000;
        cam.left = Math.max(field.left, Math.min(field.right - 390, x - 195));
        cam.centerY = y;
        for (let i = 0; i < 400; i++) {
          x = Math.min(field.right, Math.max(field.left, x + dir * speed * FIXED_DT));
          const r = barrierRelax(bodies, x, y, DEFAULT_RENDER_CONFIG);
          followCamera(
            cam,
            DEFAULT_RENDER_CONFIG,
            x,
            y,
            field,
            null,
            FIXED_DT,
            null,
            dir * speed,
            false,
            r,
          );
          expect(
            cam.left,
            `${dir} at ${speed}px/s panned past the left wall`,
          ).toBeGreaterThanOrEqual(field.left - 1e-9);
          expect(
            cam.left + cam.designW,
            `${dir} at ${speed}px/s panned past the right wall`,
          ).toBeLessThanOrEqual(field.right + 1e-9);
          // and the ship is still on screen, which is what the backstop is for
          expect(x - cam.left).toBeGreaterThanOrEqual(-1e-9);
          expect(x - cam.left).toBeLessThanOrEqual(cam.designW + 1e-9);
        }
      }
    }
  });

  it('leans the way the ship is going, so coming off a wall is not a dead second', () => {
    // The deadzone parks the ship at whichever margin it last crossed, so leaving
    // the right wall the view held completely still for 310px — over a second —
    // before the ship reached the far margin. Reported as the camera lagging; it
    // is not the smoothing, it is a deadzone with no idea which way you are going.
    const wake = (look: number): number => {
      const cam = cam390();
      const rcfg = { ...DEFAULT_RENDER_CONFIG, cameraLookAhead: look };
      cam.left = field.right - cam.designW;
      const start = cam.left;
      let x = 545;
      for (let i = 0; i < 200; i++) {
        x -= 300 * FIXED_DT;
        followCamera(cam, rcfg, x, -1000, field, null, FIXED_DT, null, -300);
        if (start - cam.left > 3) return i;
      }
      return 200;
    };
    expect(wake(0), 'the unbiased case should be the slow one').toBeGreaterThan(55);
    expect(wake(DEFAULT_RENDER_CONFIG.cameraLookAhead)).toBeLessThan(wake(0));
  });

  it('does not lean once the orbit is frozen, at any lock weight', () => {
    // A frozen orbit's vx is the phase clock's, not a heading: measured across one
    // settle it runs +397 -> -285 -> +137 -> -207. Anything steering off it swings
    // the view left and right in time with the orbit, which is what was reported.
    //
    // Asserted at anchorW 0 as well as 1, and that is the case that actually
    // regressed: the look-ahead used to be gated on the lock weight, so the moment
    // the settle stopped being locked — to give the oval its bounce back — the
    // lean came back on through the whole oval.
    for (const w of [0, 0.5, 1]) {
      const cam = cam390();
      cam.anchorW = w;
      cam.anchorX = 200;
      cam.anchorY = -1000;
      const a = cameraTarget(cam, DEFAULT_RENDER_CONFIG, 200, -1000, field, null, 300, 0, true);
      const b = cameraTarget(cam, DEFAULT_RENDER_CONFIG, 200, -1000, field, null, -300, 0, true);
      expect(a.left, `anchorW ${w} leaned on a frozen orbit`).toBe(b.left);
    }
  });

  it('still leans through the dive, where velocity IS a heading', () => {
    // `clear` and `flyby` run on real physics. Suppressing the lean there was
    // measured to put a 110px lurch into the dive, so the gate is the frozen
    // phases and not the whole capture.
    expect(frozenOrbit('clear')).toBe(false);
    expect(frozenOrbit('flyby')).toBe(false);
    expect(frozenOrbit('settle')).toBe(true);
    expect(frozenOrbit('orbit')).toBe(true);
    // Placed so the deadzone is actually engaged; inside it the target does not
    // move at all and the lean has nothing to show.
    const cam = cam390();
    cam.left = 0;
    const a = cameraTarget(cam, DEFAULT_RENDER_CONFIG, 330, -1000, field, null, 300, 0, false);
    const b = cameraTarget(cam, DEFAULT_RENDER_CONFIG, 330, -1000, field, null, -300, 0, false);
    expect(a.left).not.toBe(b.left);
  });

  it('keeps the ship in the window however fast it outruns the camera', () => {
    // `cameraTarget` refuses to AIM anywhere the ship would be off screen, but
    // `cam.left` only eases toward that. At `cameraFollow` 3 the camera trails by
    // about v/3 — 117px at the 352px/s a release toward an anomaly reaches — so
    // the ship overtook a correct target and left the frame. Reported as "my ship
    // flew faster than the camera".
    //
    // Inside the corridor, which is where the guarantee is unconditional. Past a
    // wall it is not — see the sibling below — so the run stops at the boundary,
    // which is also where the simulation would have ended it.
    const W = 390;
    for (const speed of [200, 300, 352, 500]) {
      const cam = cam390();
      let x = 100;
      cam.left = x - W / 2;
      let worstOff = 0;
      for (let i = 0; i < 240; i++) {
        x -= speed * FIXED_DT;
        if (x <= field.left) break;
        followCamera(cam, DEFAULT_RENDER_CONFIG, x, -1000, field, null, FIXED_DT, null, -speed);
        const sx = x - cam.left;
        // The WINDOW, not the margins. Pressed against a wall the field clamp
        // outranks this and the ship legitimately sits inside the margin — but it
        // must never leave the screen.
        worstOff = Math.max(worstOff, Math.max(0, -sx), Math.max(0, sx - W));
      }
      expect(worstOff, `ship left the window at ${speed}px/s`).toBe(0);
    }
  });

  it('lets the ship go rather than show what is past the wall', () => {
    // The other half of the same rule, and the regression that made it explicit:
    // the framing guarantee is not unconditional, because the field rule outranks
    // it. A ship past a wall with no anomaly holding it open is four pixels and
    // one tick from the end of the run — and then the ending holds the wreck there
    // for `crashPause`, with the camera free to keep panning. Replayed from the
    // session that reported it, the view sat 82px into the void on both walls.
    //
    // So the ship leaves the frame instead. It is dead; the wall is the thing
    // worth looking at.
    const W = 390;
    const cam = cam390();
    let x = field.left + 200;
    cam.left = field.left;
    let ever = 0;
    for (let i = 0; i < 120; i++) {
      x -= 300 * FIXED_DT;
      followCamera(cam, DEFAULT_RENDER_CONFIG, x, -1000, field, null, FIXED_DT, null, -300);
      expect(cam.left, `panned past the wall at shipX ${x.toFixed(0)}`).toBeGreaterThanOrEqual(
        field.left - 1e-9,
      );
      ever = Math.max(ever, Math.max(0, cam.left - x));
    }
    // and it really did go off the edge, or this asserts nothing
    expect(ever).toBeGreaterThan(20);
    expect(cam.left).toBeCloseTo(field.left, 6);
    void W;
  });

  it('holds the wall through the death and the hold after it', () => {
    // The reported shape, flown rather than asserted about: a ship leaves the
    // corridor, the run ends four pixels past the line, and `crashPause` then
    // holds the wreck out there — frames during which the camera is still being
    // driven and the ship is still outside. That hold is most of what the player
    // actually sees of the mistake, and the view spent it drifting into the void.
    // Replayed from the session that reported it: 82px past the dashed line on the
    // left wall and 82 on the right.
    //
    // Driven through `stepSim` because the ending is the part that matters and no
    // hand-placed ship reproduces it: `endRun` freezes the position, so the ship
    // stops moving while the camera does not.
    const cfg = DEFAULT_CONFIG;
    for (const dir of [-1, 1] as const) {
      const st = createInitialState(cfg);
      const startX = dir < 0 ? field.left + 260 : field.right - 260;
      Object.assign(st.ship, { x: startX, y: -2000, vx: dir * 320, vy: -40 });
      st.highWaterY = -2000;
      const cam = cam390();
      centerCamera(cam, startX, -2000, field, null);
      let ended = 0;
      let worst = 0;
      for (let i = 0; i < 200; i++) {
        stepSim(st, cfg, { held: false, pressed: false, released: false }, FIXED_DT);
        const p = shipWorldPos(st);
        followCamera(
          cam,
          DEFAULT_RENDER_CONFIG,
          p.x,
          p.y,
          field,
          backtrackFloorY(cfg, st.highWaterY),
          FIXED_DT,
          null,
          st.ship.vx,
          false,
          barrierRelax(st.bodies, p.x, p.y, DEFAULT_RENDER_CONFIG),
        );
        if (st.ending.active) ended++;
        worst = Math.max(worst, field.left - cam.left, cam.left + cam.designW - field.right);
      }
      // The run really did end at the wall and really was held there, or this is
      // asserting about a ship that never left.
      //
      // Derived from `crashPause` rather than counted once and written down. The
      // literal 30 here was a stand-in for 0.7s of hold, and it failed the moment
      // that became 0.45 — reporting a camera fault for a change that had nothing
      // to do with the camera. What this case is about is that the view stays on
      // the wall for the WHOLE hold, however long the hold is.
      const holdFrames = Math.floor(cfg.crashPause / FIXED_DT);
      expect(ended, `dir ${dir} never ended at the wall`).toBeGreaterThanOrEqual(holdFrames);
      expect(worst, `dir ${dir} showed dead space past the wall`).toBeLessThan(1e-9);
    }
  });

  it('leans toward an anomaly so it is on screen before the ship arrives', () => {
    // Reported as "I didn't have a lot of time to react to the anomaly to capture
    // it. I was en route to crash into it." Reconstructed from that session — the
    // approach is pure drift, so it is exact rather than a replay — the anomaly's
    // disc first appeared 0.15s AFTER the press and 0.23s before impact, at
    // 303px/s. It sits its type's `wallOffset` past the wall and the view may not reach it
    // until the bubble opens the barrier, so it arrives on screen with the ship.
    //
    // The ceiling worth knowing: an instant camera glued to the anomaly reaches
    // 0.83s. Camera work cannot make this calm on its own, which is why the grab
    // ring in `edge-markers.ts` carries the other half.
    const cfg = DEFAULT_CONFIG;
    const bodies = createBodies(cfg);
    const a = bodies.find((b) => b.kind === 'anomaly')!;
    const visibleFor = (lead: number): number => {
      const rc = { ...DEFAULT_RENDER_CONFIG, cameraAnomalyLead: lead };
      const cam = createCamera(rc);
      fitCamera(cam, { w: 393, h: 651, dpr: 2 });
      // straight at it from inside the corridor, at the speed the report showed
      const sp = 303;
      let x = a.x + 500;
      let y = a.y + 160;
      const len = hypot(a.x - x, a.y - y);
      const vx = ((a.x - x) / len) * sp;
      const vy = ((a.y - y) / len) * sp;
      centerCamera(cam, x, y, field, null);
      for (let i = 0; i < 60; i++) followCamera(cam, rc, x, y, field, null, FIXED_DT, null, vx);
      let first = -1;
      let impact = -1;
      for (let t = 0; t < 400; t++) {
        x += vx * FIXED_DT;
        y += vy * FIXED_DT;
        followCamera(
          cam,
          rc,
          x,
          y,
          field,
          null,
          FIXED_DT,
          anomalyFocus(bodies, x, y, rc, vx, vy),
          vx,
          false,
          barrierRelax(bodies, x, y, rc),
        );
        const sx = toScreenX(cam, a.x);
        const sy = toScreenY(cam, a.y);
        const r = a.R * cam.scale;
        const on =
          sx + r > cam.offsetX &&
          sx - r < cam.offsetX + cam.designW * cam.scale &&
          sy + r > cam.offsetY &&
          sy - r < cam.offsetY + cam.viewH * cam.scale;
        if (on && first < 0) first = t;
        if (hypot(x - a.x, y - a.y) <= a.R + cfg.minOrbitGap) {
          impact = t;
          break;
        }
      }
      expect(first, 'the anomaly never came on screen').toBeGreaterThanOrEqual(0);
      expect(impact, 'the run never reached the anomaly').toBeGreaterThan(0);
      return (impact - first) / 60;
    };
    const bare = visibleFor(0);
    const led = visibleFor(DEFAULT_RENDER_CONFIG.cameraAnomalyLead);
    // 0.117s -> 0.300s on this line, and 0.23 -> 0.40 on the reported one, which
    // came in shallower. Both bounds are asserted: the ratio, because that is what
    // the lean does, and an absolute floor, because a ratio over a vanishing
    // number would satisfy the first while still giving the player nothing.
    expect(led, `lead bought nothing: ${bare.toFixed(2)}s -> ${led.toFixed(2)}s`).toBeGreaterThan(
      bare * 2,
    );
    expect(led).toBeGreaterThanOrEqual(0.25);
  });

  it('holds the lean through an authored settle rather than dropping it', () => {
    // A planet's settle is deliberately unlocked — the oval is the drama and the
    // lock flattens it. An anomaly's settle has no oval: it is a glide onto the
    // authored circle, so there is nothing to protect and dropping the weight
    // there would put a dip between the approach's lean and the parked orbit's
    // lock.
    //
    // Measured on a real anomaly capture, the dip is not cosmetic: without it the
    // lock arrives after the ship has parked and pans 367px/s of its own, and the
    // ship is squeezed to 5% of the window on the way in against 14% with it.
    expect(orbitLock('settle', 0.5, true)).toBe(1);
    expect(orbitLock('settle', 0.5, false)).toBe(0);
    expect(orbitLock('orbit', 1, false)).toBe(1);
    // and the dive is still flown, authored or not
    expect(orbitLock('clear', 0, true)).toBe(0);
    expect(orbitLock('flyby', 0, true)).toBe(0);
  });

  it('leans only inside a bubble, and ramps with how far in', () => {
    const cfg = DEFAULT_CONFIG;
    const bodies = createBodies(cfg);
    const a = bodies.find((b) => b.kind === 'anomaly')!;
    const rc = DEFAULT_RENDER_CONFIG;
    // closing on it, head on, from the corridor side
    const toward = (x: number) => [x > a.x ? -300 : 300, 0] as const;
    const at = (x: number) => {
      const [vx, vy] = toward(x);
      return anomalyFocus(bodies, x, a.y, rc, vx, vy);
    };
    expect(at(195), 'leaned from the middle of the corridor').toBe(null);
    expect(at(a.x + a.traits.shelter + 1)).toBe(null);
    // A pixel inside the bubble the weight is a thousandth, not a step: the lean
    // has to arrive with the barrier opening or it is the switch note 37 spent a
    // session removing.
    expect(at(a.x + a.traits.shelter - 1)!.lock).toBeLessThan(0.01);
    const half = at(a.x + a.traits.shelter - rc.cameraBarrierRelax / 2)!;
    const full = at(a.x + 1)!;
    expect(half.lock).toBeCloseTo(rc.cameraAnomalyLead / 2, 2);
    expect(full.lock).toBeCloseTo(rc.cameraAnomalyLead, 1);
    expect(full.x).toBe(a.x);
    expect(full.y).toBe(a.y);
  });

  it('lets go of the anomaly on the way home', () => {
    // The lean exists to put the anomaly on screen before the ship gets there. On
    // the way out of the bubble it is a hand on the shoulder pulling backwards —
    // and worse, it is still holding weight when a press takes a body in the
    // field, which swaps the anchor out from under it. Reported as the return to
    // the field feeling abrupt.
    //
    // Faded by the radial component rather than switched on its sign, so a parked
    // orbit — which closes and recedes every half lap — has nothing to flicker.
    const cfg = DEFAULT_CONFIG;
    const bodies = createBodies(cfg);
    const a = bodies.find((b) => b.kind === 'anomaly')!;
    const rc = DEFAULT_RENDER_CONFIG;
    const x = a.x + 200;
    const closing = anomalyFocus(bodies, x, a.y, rc, -300, 0)!;
    const across = anomalyFocus(bodies, x, a.y, rc, 0, 300);
    const leaving = anomalyFocus(bodies, x, a.y, rc, 300, 0);
    expect(closing.lock).toBeGreaterThan(0.2);
    expect(across, 'leaned while flying past it').toBe(null);
    expect(leaving, 'leaned while flying away from it').toBe(null);
    // and it fades rather than stepping: half the closing speed, half the lean
    const half = anomalyFocus(bodies, x, a.y, rc, -300 * Math.SQRT1_2, 300 * Math.SQRT1_2)!;
    expect(half.lock).toBeCloseTo(closing.lock * Math.SQRT1_2, 4);
  });

  it('will not adopt a new anchor while the old one still has weight', () => {
    // The subject is `ship + (anchor - ship) * w`, so swapping the anchor under a
    // non-zero weight moves the subject by the distance between the two bodies
    // times that weight — instantly, because only the weight eases. Measured on
    // the reported session: the approach lean was holding 0.43 when a press took a
    // planet 500px away, and the view moved 6846px/s on that single tick.
    const cam = cam390();
    cam.anchorW = 0.5;
    cam.anchorX = 1000;
    cam.anchorY = -1000;
    cam.anchorId = 4;
    const before = cam.anchorX;
    followCamera(
      cam,
      DEFAULT_RENDER_CONFIG,
      200,
      -1000,
      field,
      null,
      FIXED_DT,
      { x: -900, y: -2000, lock: 1, id: 9 },
      0,
    );
    // the old body is held, and its weight is on the way out
    expect(cam.anchorX, 'adopted the new body immediately').toBe(before);
    expect(cam.anchorId).toBe(4);
    expect(cam.anchorW).toBeLessThan(0.5);
    // once the weight is gone, the new one is taken up
    for (let i = 0; i < 200; i++) {
      followCamera(
        cam,
        DEFAULT_RENDER_CONFIG,
        200,
        -1000,
        field,
        null,
        FIXED_DT,
        { x: -900, y: -2000, lock: 1, id: 9 },
        0,
      );
    }
    expect(cam.anchorId).toBe(9);
    expect(cam.anchorX).toBe(-900);
  });

  it('corrects minimally when it does engage', () => {
    // The backstop once repositioned to a preferred side rather than clamping to
    // the nearest bound, on the reasoning that a lagging camera should show what
    // is ahead. Because the condition is marginal exactly when the ship grazes the
    // edge, a sub-pixel violation became a 109px jump mid-orbit. It must move the
    // camera no further than it has to.
    const W = 390;
    const margin = W * DEFAULT_RENDER_CONFIG.cameraMarginFrac;
    const cam = cam390();
    const shipX = 200;
    // park the camera a hair beyond the legal range, then step with no motion
    cam.left = shipX - (W - margin) - 0.5;
    const before = cam.left;
    followCamera(cam, DEFAULT_RENDER_CONFIG, shipX, -1000, field, null, 1 / 600, null, 0);
    expect(Math.abs(cam.left - before)).toBeLessThan(2);
  });
});

/**
 * The orbit lock's shape.
 *
 * Pinned separately from the wobble measurement because the SHAPE is the fix: a
 * hard switch removed the wobble too, and lurched the view across up to
 * `grabRange` at every grab doing it. What has to stay true is that the lock is
 * zero while the anchor is far away and only reaches full once it is not.
 */
describe('the orbit lock', () => {
  it('is off for everything that is not a true orbit, the settle included', () => {
    expect(orbitLock('clear', 0)).toBe(0);
    expect(orbitLock('flyby', 0)).toBe(0);
    expect(orbitLock('orbit', 1)).toBe(1);
    // The settle is the OVAL, and it is deliberately unlocked at every point of
    // it. This assertion used to read `toBeCloseTo(0.5)` — the lock rode
    // `settleProgress` and that was measured to eat half the oval, because
    // smootherstep already reads 0.47 at the apoapsis and 0.83-0.94 through the
    // 12-14px return swing. Of 83px of swing only 41 survived.
    for (const sp of [0, 0.25, 0.5, 0.75, 0.99, 1]) {
      expect(orbitLock('settle', sp), `settle at ${sp} should be unlocked`).toBe(0);
    }
  });

  it('leaves the oval exactly as the old camera flew it', () => {
    // The point of waiting for a true orbit. The settle must be bit-for-bit the
    // unlocked camera, or the thing that made a capture exciting is being eaten.
    const travel = (lock: number): { settle: number; orbit: number; peak: number } => {
      const st = createInitialState(DEFAULT_CONFIG);
      const cam = cam390();
      const rcfg2 = { ...DEFAULT_RENDER_CONFIG, cameraOrbitLock: lock };
      const settle: number[] = [];
      const late: number[] = [];
      let px = cam.left;
      let py = cam.centerY;
      let peak = 0;
      for (let i = 0; i < 700; i++) {
        stepSim(
          st,
          DEFAULT_CONFIG,
          { held: i >= 18, pressed: i === 18, released: false },
          FIXED_DT,
        );
        const p = shipWorldPos(st);
        const cap = st.capture;
        const b = cap ? st.bodies[cap.planet]! : null;
        const anchor = b
          ? { x: b.x, y: b.y, lock: orbitLock(cap!.phase, cap!.settleProgress), id: cap!.planet }
          : null;
        followCamera(
          cam,
          rcfg2,
          p.x,
          p.y,
          field,
          backtrackFloorY(DEFAULT_CONFIG, st.highWaterY),
          FIXED_DT,
          anchor,
          st.ship.vx,
        );
        if (cap?.phase === 'settle') settle.push(cam.centerY);
        if (cap?.phase === 'orbit' && i > 300) late.push(cam.centerY);
        if (i > 20) peak = Math.max(peak, Math.hypot(cam.left - px, cam.centerY - py) * 60);
        px = cam.left;
        py = cam.centerY;
      }
      const sp = (v: number[]): number => (v.length ? Math.max(...v) - Math.min(...v) : 0);
      return { settle: sp(settle), orbit: sp(late), peak };
    };

    const off = travel(0);
    const on = travel(1);
    expect(off.settle, 'the oval should move the camera a long way').toBeGreaterThan(50);
    expect(on.settle).toBeCloseTo(off.settle, 6);
    // ...and then the settled orbit holds still, which is the whole trade.
    expect(off.orbit).toBeGreaterThan(50);
    expect(on.orbit).toBeLessThan(1);
    // No camera movement the plain follower did not already have.
    expect(on.peak).toBeLessThanOrEqual(off.peak + 1);
  });

  it('is fully switchable off, back to the plain follower', () => {
    const cam = cam390();
    cam.anchorW = 0;
    const off = { ...DEFAULT_RENDER_CONFIG, cameraOrbitLock: 0 };
    followCamera(
      cam,
      off,
      200,
      -1000,
      field,
      null,
      FIXED_DT,
      { x: 900, y: -2000, lock: 1, id: 0 },
      0,
    );
    expect(cam.anchorW).toBe(0);
  });
});

/**
 * Out at an anomaly: the two things a player reported seeing there.
 *
 * Both were the same mistake in different clothes — a rule about FRAMING being
 * expressed as a hard bound, so it fought whatever was above it.
 */
describe('the view around an anomaly', () => {
  const anomaly = createBodies(DEFAULT_CONFIG).find(
    (b): b is Anomaly => b.kind === 'anomaly' && b.x < 0,
  )!;

  it('holds the orbited anomaly dead centre and perfectly still', () => {
    // Reported as "the camera oscillates left/right as I orbit the anomaly. The
    // anomaly should be fixed in the center." It was not: measured at 83px of
    // swing with the lock weight at exactly 1. Two causes, both about the ship's
    // position leaking into a target that was supposed to be the anchor's — the
    // backstop clamping on the deadzone MARGINS, which orbit with the ship, and
    // `cameraTarget` clamping an out-of-field target back into the field and then
    // rebuilding it from `shipX`.
    const cam = cam390();
    const r = 62;
    cam.left = anomaly.x - 390 / 2;
    cam.centerY = anomaly.y;
    cam.anchorW = 1;
    cam.anchorX = anomaly.x;
    cam.anchorY = anomaly.y;
    // Built by hand, so the identity has to be built too: a weight held against a
    // stale id reads as a swap, which is exactly what it is meant to catch.
    cam.anchorId = 0;
    const lefts: number[] = [];
    const centres: number[] = [];
    for (let i = 0; i < 400; i++) {
      const th = i * 0.105;
      const x = anomaly.x + Math.cos(th) * r;
      const y = anomaly.y + Math.sin(th) * r;
      followCamera(
        cam,
        DEFAULT_RENDER_CONFIG,
        x,
        y,
        field,
        null,
        FIXED_DT,
        { x: anomaly.x, y: anomaly.y, lock: 1, id: 0 },
        0,
        true,
        barrierRelax(createBodies(DEFAULT_CONFIG), x, y, DEFAULT_RENDER_CONFIG),
      );
      if (i > 60) {
        lefts.push(cam.left);
        centres.push(anomaly.x - cam.left);
      }
    }
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(0.5);
    expect(centres[0]!).toBeCloseTo(390 / 2, 0);
  });

  it('crosses the barrier without a jerk', () => {
    // Reported as a jagged transition across the red zone. The field rule used to
    // let go all at once at the boundary, so the view went from pinned to matching
    // the ship's speed in a single tick: 1247px/s of camera movement against a
    // ship doing 228. The bubble opens the allowance over the 150px BEFORE the
    // wall, so the camera is already moving when the ship crosses.
    const bodies = createBodies(DEFAULT_CONFIG);
    const dx = anomaly.x - 200;
    const dy = anomaly.y - -3003;
    const L = Math.hypot(dx, dy);
    const run = (speed: number, relaxOn: boolean) => {
      const cam = cam390();
      let x = 200;
      let y = -3003;
      cam.left = Math.max(field.left, Math.min(field.right - 390, x - 390 / 2));
      cam.centerY = y;
      let worst = 0;
      let offScreen = 0;
      let pastWall = 0;
      for (let i = 0; i < 220; i++) {
        x += (dx / L) * speed * FIXED_DT;
        y += (dy / L) * speed * FIXED_DT;
        const r = relaxOn ? barrierRelax(bodies, x, y, DEFAULT_RENDER_CONFIG) : 0;
        const before = cam.left;
        followCamera(
          cam,
          DEFAULT_RENDER_CONFIG,
          x,
          y,
          field,
          null,
          FIXED_DT,
          null,
          (dx / L) * speed,
          false,
          r,
        );
        worst = Math.max(worst, Math.abs(cam.left - before) * 60);
        // Either wall: the anomalies alternate sides, so which one this run
        // crosses is a property of the seed and not of the rule being measured.
        offScreen = Math.max(offScreen, x - (cam.left + 390), cam.left - x);
        pastWall = Math.max(pastWall, field.left - cam.left, cam.left + 390 - field.right);
        if (Math.hypot(anomaly.x - x, anomaly.y - y) < 70) break;
      }
      return { worst, offScreen, pastWall };
    };
    for (const speed of [228, 352]) {
      // The pin, updated rather than deleted, and three times now — each rewrite
      // is a note in PORT_NOTES, and each one changed what the unrelaxed arm even
      // MEANS. It first read `> 900`, when the allowance was the whole of the fix.
      // Then the backstop stopped carrying its own field rule and the unrelaxed
      // crossing fell to ~430px/s on its own, so it became a comparison. Then the
      // backstop shared the target's bounds again and it rose to 643-1280.
      //
      // It is not a comparison any more, because `relax` is now the ONLY thing
      // that lets the view past a barrier at all: with it forced to zero the
      // camera does not follow the ship out, it stops at the wall and lets the
      // ship go. So the unrelaxed arm is no longer a rougher version of the same
      // crossing — it is a different outcome, and that is what is asserted.
      const relaxed = run(speed, true);
      const bare = run(speed, false);

      // Bounded as a multiple of the SHIP's speed, because what the allowance
      // leaves is a proportionate catch-up rather than a discontinuity — 1.09x at
      // 228px/s and 1.11x at 352, unchanged across all three rewrites.
      expect(relaxed.worst, `${speed}: relaxed crossing jerks`).toBeLessThan(speed * 1.8);
      // With the allowance the ship stays framed and the view goes out with it.
      expect(relaxed.offScreen, `${speed}: relaxed crossing lost the ship`).toBeLessThan(1);
      expect(relaxed.pastWall, `${speed}: the allowance opened nothing`).toBeGreaterThan(100);
      // Without it the wall holds absolutely, and the ship is the one that leaves.
      expect(bare.pastWall, `${speed}: the bare crossing showed dead space`).toBeLessThan(1e-9);
      expect(bare.offScreen, `${speed}: the bare crossing kept the ship`).toBeGreaterThan(50);
    }
  });

  it('opens the barrier only inside a bubble', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const rc = DEFAULT_RENDER_CONFIG;
    // dead centre of the corridor, nowhere near one
    expect(barrierRelax(bodies, 195, anomaly.y, rc)).toBe(0);
    // just outside the bubble, then just inside
    expect(barrierRelax(bodies, anomaly.x + anomaly.traits.shelter + 1, anomaly.y, rc)).toBe(0);
    expect(
      barrierRelax(bodies, anomaly.x + anomaly.traits.shelter - 40, anomaly.y, rc),
    ).toBeCloseTo(40, 0);
    // fully open well inside
    expect(barrierRelax(bodies, anomaly.x, anomaly.y, rc)).toBe(rc.cameraBarrierRelax);
  });
});
