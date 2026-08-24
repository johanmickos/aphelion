/**
 * World layer: hazard zones and bodies.
 */
import type { Body } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import type { FieldBounds } from '../sim/world.ts';
import { backtrackFloorY } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY, visibleWorldY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { HAZARD_BAND_FROM, HAZARD_BAND_TO, HAZARD_EDGE } from './palette.ts';

/**
 * Danger gradient at the field edges.
 *
 * The prototype drew this OUTSIDE the boundary — but the run ends 4px past that
 * line, so ~93% of the red band was already fatal and the player could never see
 * themselves inside it. A warning you cannot occupy warns nothing.
 *
 * Here the gradient builds INWARD from the edge, so it reads as pressure while
 * there is still time to turn, and the hard dashed line marks the actual limit.
 *
 * THREE EDGES, NOT TWO. The ceiling — `field.top`, 800px above the highest body —
 * had no treatment at all until the playtest of 2026-08-23 flew into it: the
 * session cleared the last planet in the field, coasted up through 2.7 seconds of
 * empty starfield with nothing on screen to say a limit existed, and ended
 * `LOST — OFF COURSE`. The two side walls had a gradient and a scar cross the
 * whole time. This was never a decision that the top should be unmarked; it was
 * the two horizontal bounds getting the attention and the vertical one being
 * inherited from the prototype's screen-space test (PORT_NOTES 9) and forgotten.
 *
 * `field.bottom` stays unmarked deliberately. It is only reachable in the opening
 * seconds, before `highWaterY` has moved, and after that the trailing floor — a
 * `fell-behind` ending with its own band and its own burn — is always the nearer
 * of the two. A second red line under the first would be warning about the wrong
 * one.
 */
export function drawHazardZones(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cfg: RenderConfig,
  field: FieldBounds,
): void {
  const zone = cfg.hazardZoneWidth;
  const top = cam.offsetY;
  const height = cam.viewH * cam.scale;

  ctx.save();
  ctx.strokeStyle = HAZARD_EDGE;
  ctx.lineWidth = Math.max(1, 1.5 * cam.scale);

  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? field.left : field.right;
    const inner = edge - side * zone;
    const xEdge = toScreenX(cam, edge);
    const xInner = toScreenX(cam, inner);
    const x0 = Math.min(xEdge, xInner);
    const w = Math.abs(xEdge - xInner);
    if (w < 0.5) continue;

    const g = ctx.createLinearGradient(xInner, 0, xEdge, 0);
    g.addColorStop(0, HAZARD_BAND_FROM);
    g.addColorStop(1, HAZARD_BAND_TO);
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, w, height);

    ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
    ctx.beginPath();
    ctx.moveTo(xEdge, top);
    ctx.lineTo(xEdge, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawCeiling(ctx, cam, cfg, field);
  ctx.restore();
}

/**
 * The ceiling band, drawn like the floor and for the same reason.
 *
 * The gradient builds UPWARD toward the lethal line, so the ship flies into
 * deepening red rather than meeting a decorated region it cannot survive — the
 * inward rule `drawHazardZones` records, applied to the one edge that never got
 * it.
 *
 * Skipped entirely while the line is off the top of the screen, which is almost
 * the whole game: the ceiling sits 800px above the highest body, so it is only
 * ever visible to a ship that has run out of field.
 */
function drawCeiling(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cfg: RenderConfig,
  field: FieldBounds,
): void {
  const view = visibleWorldY(cam);
  const band = cfg.hazardZoneWidth;
  if (field.top + band < view.top) return; // still well above the screen

  const yEdge = toScreenY(cam, field.top);
  const yInner = toScreenY(cam, field.top + band);
  const left = cam.offsetX;
  const width = cam.designW * cam.scale;

  const g = ctx.createLinearGradient(0, yInner, 0, yEdge);
  g.addColorStop(0, HAZARD_BAND_FROM);
  g.addColorStop(1, HAZARD_BAND_TO);
  ctx.fillStyle = g;
  ctx.fillRect(left, yEdge, width, yInner - yEdge);

  ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
  ctx.beginPath();
  ctx.moveTo(left, yEdge);
  ctx.lineTo(left + width, yEdge);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * The floor that trails the climb.
 *
 * Drawn like the side boundaries and for the same reason: the gradient builds
 * toward the lethal line so it reads as pressure while there is still time to
 * turn, rather than decorating a region you can never occupy and survive.
 *
 * It hangs below the highest point reached, so at your best height it is just off
 * the bottom of the screen and only appears once you start losing ground.
 */
export function drawBacktrackFloor(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  rcfg: RenderConfig,
  highWaterY: number,
): void {
  const floorY = backtrackFloorY(sim, highWaterY);
  if (floorY === null) return;
  const view = visibleWorldY(cam);
  const band = rcfg.hazardZoneWidth;
  if (floorY - band > view.bottom) return; // still well below the screen

  const yEdge = toScreenY(cam, floorY);
  const yInner = toScreenY(cam, floorY - band);
  const left = cam.offsetX;
  const width = cam.designW * cam.scale;

  const g = ctx.createLinearGradient(0, yInner, 0, yEdge);
  g.addColorStop(0, HAZARD_BAND_FROM);
  g.addColorStop(1, HAZARD_BAND_TO);
  ctx.fillStyle = g;
  ctx.fillRect(left, yInner, width, yEdge - yInner);

  ctx.strokeStyle = HAZARD_EDGE;
  ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
  ctx.lineWidth = Math.max(1, 1.5 * cam.scale);
  ctx.beginPath();
  ctx.moveTo(left, yEdge);
  ctx.lineTo(left + width, yEdge);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Bodies. Dispatches on `kind`, so adding a black hole makes tsc name this site.
 * Gradients are cached: the world is frozen, so they never need rebuilding.
 */
export class BodyRenderer {
  /** Gradients are drawn in translated space, so only radius and scale matter. */
  private cache = new Map<number, CanvasGradient>();
  private cacheScale = -1;

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    sim: SimConfig,
    bodies: readonly Body[],
    /** Index of the body currently holding the ship, if any. */
    anchorIndex = -1,
    /** Wall clock, for the anomaly pulse only. Nothing here feeds the sim. */
    timeMs = 0,
  ): void {
    if (cam.scale !== this.cacheScale) {
      this.cache = new Map();
      this.cacheScale = cam.scale;
    }
    const view = visibleWorldY(cam);
    const pad = 120;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      if (b.y + b.R < view.top - pad || b.y - b.R > view.bottom + pad) continue;
      switch (b.kind) {
        case 'planet':
          this.drawPlanet(ctx, cam, sim, b, i === anchorIndex);
          break;
        case 'anomaly':
          drawAnomaly(ctx, cam, sim, b, i === anchorIndex, timeMs);
          break;
      }
    }
  }

  private drawPlanet(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    sim: SimConfig,
    p: Extract<Body, { kind: 'planet' }>,
    /** This is the body that currently has the ship. */
    held: boolean,
  ): void {
    const x = toScreenX(cam, p.x);
    const y = toScreenY(cam, p.y);
    const r = p.R * cam.scale;

    // Minimum-orbit ring. Solid: it is a hard limit the simulation clamps to,
    // not a suggestion, and dashing made it read as advisory. Alpha is pulled
    // down a little because a solid line at the old opacity reads much heavier.
    ctx.beginPath();
    ctx.arc(x, y, (p.R + sim.minOrbitGap) * cam.scale, 0, Math.PI * 2);
    ctx.strokeStyle = held ? 'rgba(185,170,235,.5)' : 'rgba(130,150,185,.24)';
    ctx.lineWidth = Math.max(1, cam.scale) * (held ? 1.4 : 1);
    ctx.stroke();

    // lit sphere; light from the upper left, consistent across the field
    let g = this.cache.get(p.R);
    if (!g) {
      g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.15, 0, 0, r);
      g.addColorStop(0, '#4a5b82');
      g.addColorStop(0.7, '#1e2740');
      g.addColorStop(1, '#0a0f1a');
      this.cache.set(p.R, g);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Held: the rim lifts and a soft halo sits just outside it. Deliberately
    // slight — enough to answer "which one has me?" without competing with the
    // boost glow or the compass rings for attention.
    if (held) {
      const halo = ctx.createRadialGradient(0, 0, r, 0, 0, r + 14 * cam.scale);
      halo.addColorStop(0, 'rgba(185,170,235,.22)');
      halo.addColorStop(1, 'rgba(185,170,235,0)');
      ctx.beginPath();
      ctx.arc(0, 0, r + 14 * cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
    }
    ctx.strokeStyle = held ? 'rgba(214,205,245,.85)' : 'rgba(150,175,215,.55)';
    ctx.lineWidth = (held ? 1.8 : 1.2) * cam.scale;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(190,205,235,.65)';
    ctx.font = `${10 * cam.scale}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, x, y);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * An anomaly and the bubble it projects.
 *
 * The bubble is drawn because it is a BOUNDARY, and the same lesson applies that
 * `drawHazardZones` records: a limit the player cannot see is a limit they cannot
 * play against. Its edge is where the side barrier resumes and the run ends, so
 * it gets a hard line exactly like the red one does.
 *
 * The gradient runs the other way round from the hazard band, though, and
 * deliberately: there the danger is OUTSIDE a line you approach, so the warning
 * builds toward it. Here the safety is INSIDE, so the fill is densest at the
 * anomaly and fades to nothing at the rim — it reads as a pocket of shelter you
 * are inside of rather than a wall you are heading for.
 */
function drawAnomaly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  a: Extract<Body, { kind: 'anomaly' }>,
  held: boolean,
  timeMs: number,
): void {
  const x = toScreenX(cam, a.x);
  const y = toScreenY(cam, a.y);
  const s = cam.scale;
  const bubble = a.bubble * s;

  ctx.save();

  // The shelter, densest at the centre and gone by the rim.
  const g = ctx.createRadialGradient(x, y, 0, x, y, bubble);
  g.addColorStop(0, 'rgba(168,92,255,.20)');
  g.addColorStop(0.55, 'rgba(140,70,230,.09)');
  g.addColorStop(1, 'rgba(120,60,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.fill();

  // The rim: the exact line the run ends at, drawn like the barrier it replaces.
  ctx.setLineDash([6 * s, 6 * s]);
  ctx.strokeStyle = 'rgba(190,120,255,.42)';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Minimum-orbit ring, same as a planet's — it is captured by the same code and
  // clamped to the same limit, so it must advertise the same limit.
  ctx.beginPath();
  ctx.arc(x, y, (a.R + sim.minOrbitGap) * s, 0, Math.PI * 2);
  ctx.strokeStyle = held ? 'rgba(225,180,255,.55)' : 'rgba(180,130,235,.28)';
  ctx.lineWidth = Math.max(1, s) * (held ? 1.4 : 1);
  ctx.stroke();

  // The body. A slow breath so it reads as alive rather than as scenery, and
  // slow enough not to compete with the boost halo's pulse.
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 620);
  const r = a.R * s;
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  body.addColorStop(0, `rgba(226,178,255,${0.95 - 0.12 * pulse})`);
  body.addColorStop(0.6, 'rgba(150,70,220,.95)');
  body.addColorStop(1, 'rgba(74,26,120,.95)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Corona, breathing opposite the surface so the whole thing never goes flat.
  ctx.strokeStyle = `rgba(206,150,255,${0.25 + 0.3 * pulse})`;
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  ctx.arc(x, y, r + 5 * s, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
