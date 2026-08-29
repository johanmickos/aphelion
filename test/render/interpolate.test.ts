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
import { UNDEFORMED } from '../../src/state/deformation.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from '../../src/state/energy.ts';
import { hueOf } from '../../src/state/identity.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { interpolate } from '../../src/render/interpolate.ts';

function view(x: number, y: number, heading: number): PresentationState {
  return {
    tick: x,
    camera: { x: 585, y, lock: 0, offset: 0 },
    craft: {
      x,
      y,
      heading,
      speed: 100,
      energy: 2,
      bloom: bloomOf(2),
      deformation: UNDEFORMED,
    },
    bodies: [
      {
        x: 0,
        y: 0,
        radius: 132,
        held: false,
        state: 'AHEAD',
        offered: false,
        closing: 0,
        grip: 0,
        hue: hueOf(0),
        energy: 1,
        bloom: bloomOf(1),
        tide: null,
      },
    ],
    corridor: { centreline: 585, halfWidth: 1111.5 },
    flash: null,
    sightings: [],
    compass: null,
  };
}

/** The same view with an E3 `age` ticks into its span, at the origin. */
function flashing(age: number, radius: number): PresentationState {
  return {
    ...view(0, 0, 0),
    flash: { x: 0, y: 0, radius, decay: { age, span: E3_TICKS } },
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

  /**
   * Spec [00 · §5](../../docs/spec/00-tokens.md)'s first motion rule: **things
   * arrive; they do not fade in.** An E3 struck on the later tick is at full
   * radius on the first frame that shows it, however far into the gap that frame
   * falls — interpolating it up from nothing would be a 16ms fade-in, which is
   * exactly what the rule forbids and what the eye reads as softness.
   */
  it('does not fade an E3 in', () => {
    const struck = flashing(0, E3_BLOOM);
    for (const alpha of [0, 0.25, 0.5, 0.9]) {
      expect(interpolate(view(0, 0, 0), struck, alpha).flash?.radius).toBe(E3_BLOOM);
    }
  });

  /** And once it is alive, it is crossed like any other length. */
  it('crosses an E3 already alive', () => {
    const frame = interpolate(flashing(3, 100), flashing(4, 80), 0.5);
    expect(frame.flash?.radius).toBe(90);
    // The clock itself is the later tick's: it is the input to the next
    // derivation, and a frame is not a tick (ADR-0015).
    expect(frame.flash?.decay).toEqual({ age: 4, span: E3_TICKS });
  });

  it('lets an E3 that has ended stay ended', () => {
    expect(interpolate(flashing(23, 1), view(0, 0, 0), 0.5).flash).toBeNull();
  });
});
