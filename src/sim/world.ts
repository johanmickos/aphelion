/**
 * World layout — absolute world units, frozen forever.
 *
 * The prototype authored planet positions in *viewport* units (`y: d.y * H`,
 * `x: W*0.5 + d.dx`) and re-ran the layout on every resize, which moved planets
 * mid-flight and left the active capture holding a stale object. It also meant
 * different devices played a materially different game: the same gravity with
 * P1->P8 spread over 5047px in portrait but 2331px in landscape.
 *
 * Here the layout is evaluated once at the design viewport (390x844) and baked in.
 * Resize is inert. The renderer scales and letterboxes to fit. See PORT_NOTES 10.
 */
import type { Body } from './types.ts';
import type { SimConfig } from './config.ts';

/** Design viewport the world coordinates were frozen from. */
export const DESIGN_W = 390;
export const DESIGN_H = 844;

/** Planet definitions exactly as the prototype declared them. */
const DEFS: ReadonlyArray<{ dx: number; y: number; R: number }> = [
  { dx: -6, y: 0, R: 46 },
  { dx: 34, y: -0.78, R: 40 },
  { dx: -40, y: -1.6, R: 52 },
  { dx: 18, y: -2.44, R: 34 },
  { dx: -24, y: -3.3, R: 44 },
  { dx: 44, y: -4.18, R: 38 },
  { dx: -10, y: -5.08, R: 56 },
  { dx: 30, y: -5.98, R: 36 },
];

/** Build the world's bodies. Deterministic and viewport-independent. */
export function createBodies(): Body[] {
  const cx = DESIGN_W * 0.5;
  return DEFS.map((d, i) => ({
    kind: 'planet' as const,
    x: cx + d.dx,
    y: d.y * DESIGN_H,
    R: d.R,
    name: 'P' + (i + 1),
  }));
}

/** Ship spawn, frozen from the prototype's `resetShip` at the design viewport. */
export const SPAWN = Object.freeze({
  x: DESIGN_W * 0.5 - 6 - 84,
  y: DESIGN_H * 0.42,
});

export interface FieldBounds {
  left: number;
  right: number;
  width: number;
  /** Beyond this (climbing) the run ends. */
  top: number;
  /** Beyond this (falling) the run ends. */
  bottom: number;
}

/**
 * Playfield bounds in world units.
 *
 * Horizontal bounds are the prototype's exactly, evaluated at the design width.
 * Vertical bounds replace a screen-space test that read the smoothed camera and
 * the live viewport height — which made the death condition depend on render
 * state and on device size. The margins mirror the originals (800 above, 1244
 * below) measured from the world's extents instead of the camera. PORT_NOTES 9.
 */
export function fieldBounds(cfg: SimConfig, bodies: readonly Body[]): FieldBounds {
  const fw = DESIGN_W * cfg.fieldWidthFrac;
  const cx = DESIGN_W * 0.5;
  let highest = 0;
  for (const b of bodies) if (b.y < highest) highest = b.y;
  return {
    left: cx - fw / 2,
    right: cx + fw / 2,
    width: fw,
    top: highest - 800,
    bottom: SPAWN.y + DESIGN_H + 400,
  };
}
