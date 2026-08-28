/**
 * The frames between the ticks — the half of the renderer's job ADR-0006 names
 * beside pixels.
 *
 * It matters at the M1 gate specifically: the simulation is 60Hz and fixed, the
 * phone the author flies on is not, and a swing judged through a stuttering
 * picture is a swing judged wrongly. It is arithmetic on two presentation
 * states, so it is tested without a canvas.
 */
import { describe, expect, it } from 'vitest';
import type { PresentationState } from '../../src/state/types.ts';
import { interpolate } from '../../src/render/interpolate.ts';

function view(x: number, y: number, heading: number): PresentationState {
  return {
    tick: x,
    camera: { x: 585, y, lock: 0, offset: 0 },
    craft: { x, y, heading, speed: 100 },
    bodies: [{ x: 0, y: 0, radius: 132, held: false }],
    corridor: { centreline: 585, halfWidth: 1111.5 },
  };
}

describe('a frame between two ticks', () => {
  it('is the earlier tick at the start of the gap and the later one at its end', () => {
    const from = view(0, 0, 0);
    const to = view(100, 200, 1);
    expect(interpolate(from, to, 0).craft.x).toBe(0);
    expect(interpolate(from, to, 1).craft.x).toBe(100);
    expect(interpolate(from, to, 0.25).craft.y).toBe(50);
  });

  it('moves the camera with it, so the world does not shear', () => {
    const frame = interpolate(view(0, 0, 0), view(100, 200, 0), 0.5);
    expect(frame.camera.y).toBe(100);
    expect(frame.craft.y - frame.camera.y).toBe(0);
  });

  /**
   * The case that happens once a revolution on every orbit in the game: a
   * heading crossing between just under π and just over −π has turned a hair,
   * and interpolated as plain numbers it spins the craft the whole way back
   * through zero.
   */
  it('turns the craft the short way round the wrap', () => {
    const before = Math.PI - 0.05;
    const after = -Math.PI + 0.05;
    const half = interpolate(view(0, 0, before), view(0, 0, after), 0.5).craft.heading;
    expect(Math.abs(Math.atan2(Math.sin(half - before), Math.cos(half - before)))).toBeLessThan(
      0.05,
    );
  });

  it('never shows a position the simulation did not reach', () => {
    const from = view(0, 0, 0);
    const to = view(100, 0, 0);
    for (let alpha = 0; alpha <= 1; alpha += 0.05) {
      const x = interpolate(from, to, alpha).craft.x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
  });

  /**
   * A frame belongs to the tick it is drawn from — half a tick is not a tick —
   * and bodies come from that tick whole rather than interpolated, because they
   * do not move and promising otherwise before spec 04's moving bodies exist
   * would be a promise nothing tests.
   */
  it('belongs to the later tick, and takes its bodies from it', () => {
    const from = view(0, 0, 0);
    const to = view(100, 0, 0);
    const frame = interpolate(from, to, 0.5);
    expect(frame.tick).toBe(to.tick);
    expect(frame.bodies).toBe(to.bodies);
  });
});
