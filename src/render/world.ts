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

/**
 * Danger gradient at the field edges.
 *
 * The prototype drew this OUTSIDE the boundary — but the run ends 4px past that
 * line, so ~93% of the red band was already fatal and the player could never see
 * themselves inside it. A warning you cannot occupy warns nothing.
 *
 * Here the gradient builds INWARD from the edge, so it reads as pressure while
 * there is still time to turn, and the hard dashed line marks the actual limit.
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

  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? field.left : field.right;
    const inner = edge - side * zone;
    const xEdge = toScreenX(cam, edge);
    const xInner = toScreenX(cam, inner);
    const x0 = Math.min(xEdge, xInner);
    const w = Math.abs(xEdge - xInner);
    if (w < 0.5) continue;

    const g = ctx.createLinearGradient(xInner, 0, xEdge, 0);
    g.addColorStop(0, 'rgba(255,70,90,0)');
    g.addColorStop(1, 'rgba(255,70,90,.22)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, w, height);

    ctx.strokeStyle = 'rgba(255,70,90,.5)';
    ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
    ctx.lineWidth = Math.max(1, 1.5 * cam.scale);
    ctx.beginPath();
    ctx.moveTo(xEdge, top);
    ctx.lineTo(xEdge, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
  g.addColorStop(0, 'rgba(255,70,90,0)');
  g.addColorStop(1, 'rgba(255,70,90,.22)');
  ctx.fillStyle = g;
  ctx.fillRect(left, yInner, width, yEdge - yInner);

  ctx.strokeStyle = 'rgba(255,70,90,.5)';
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
