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
import { mulberry32 } from './rng.ts';

/** Design viewport the world coordinates were frozen from. */
export const DESIGN_W = 390;
export const DESIGN_H = 844;

/**
 * The prototype's hand-authored planets. The field continues procedurally beyond
 * these; see `generatedDef`.
 *
 * `dx` is the offset from the field's centre column and `y` is in screen-heights.
 * The pattern is deliberate: sides strictly alternate, |dx| runs 6..44, radii run
 * 34..56, and vertical spacing grows 0.78 -> 0.90 before plateauing.
 */
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

/**
 * Seed for the generated part of the field.
 *
 * Fixed, and part of the world's definition rather than a runtime choice: every
 * player climbs the same field, and a replay must reconstruct it exactly.
 */
const WORLD_SEED = 0x5eed_1e55;

/**
 * Build the world's bodies. Deterministic and viewport-independent.
 *
 * Two layouts: the prototype's authored eight, which the equality gate compares
 * against and which must never change; and the game's own field, generated from
 * a fixed seed so every player climbs the same route and a replay reconstructs
 * it exactly.
 */
export function createBodies(cfg: SimConfig): Body[] {
  const cx = DESIGN_W * 0.5;
  if (!cfg.proceduralLayout) {
    return DEFS.slice(0, cfg.bodyCount).map((d, i) => ({
      kind: 'planet' as const,
      x: cx + d.dx,
      y: d.y * DESIGN_H,
      R: d.R,
      name: 'P' + (i + 1),
    }));
  }

  const rnd = mulberry32(WORLD_SEED);
  const out: Body[] = [];
  // The opening body is the authored one: the spawn sits 84px to its left and
  // that first approach is tuned. Everything above it is generated.
  const first = DEFS[0]!;
  let x = cx + first.dx;
  let y = first.y * DESIGN_H;
  let R = first.R;

  for (let i = 0; i < cfg.bodyCount; i++) {
    out.push({ kind: 'planet', x, y, R, name: 'P' + (i + 1) });
    // Sides alternate so the climb weaves rather than drifting to one wall, and
    // the gap jitters +/-10% so the rhythm does not become metronomic.
    const side = i % 2 === 0 ? 1 : -1;
    x = cx + side * (8 + rnd() * 36); // |dx| 8..44, the authored range
    y -= cfg.bodySpacing * (0.9 + rnd() * 0.2);
    R = 34 + rnd() * 22; // 34..56, the authored range
  }
  return out;
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
