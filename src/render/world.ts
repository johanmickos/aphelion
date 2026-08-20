/**
 * World layer: hazard zones and bodies.
 */
import type { Body } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import type { FieldBounds } from '../sim/world.ts';
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
  const height = cam.designH * cam.scale;

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
 * Bodies. Dispatches on `kind`, so adding a black hole makes tsc name this site.
 * Gradients are cached: the world is frozen, so they never need rebuilding.
 */
export class BodyRenderer {
  /** Gradients are drawn in translated space, so only radius and scale matter. */
  private cache = new Map<number, CanvasGradient>();
  private cacheScale = -1;

  draw(ctx: CanvasRenderingContext2D, cam: Camera, sim: SimConfig, bodies: readonly Body[]): void {
    if (cam.scale !== this.cacheScale) {
      this.cache = new Map();
      this.cacheScale = cam.scale;
    }
    const view = visibleWorldY(cam);
    const pad = 120;

    for (const b of bodies) {
      if (b.y + b.R < view.top - pad || b.y - b.R > view.bottom + pad) continue;
      switch (b.kind) {
        case 'planet':
          this.drawPlanet(ctx, cam, sim, b);
          break;
      }
    }
  }

  private drawPlanet(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    sim: SimConfig,
    p: Extract<Body, { kind: 'planet' }>,
  ): void {
    const x = toScreenX(cam, p.x);
    const y = toScreenY(cam, p.y);
    const r = p.R * cam.scale;

    // minimum-orbit ring
    ctx.beginPath();
    ctx.arc(x, y, (p.R + sim.minOrbitGap) * cam.scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130,150,185,.30)';
    ctx.setLineDash([3 * cam.scale, 5 * cam.scale]);
    ctx.lineWidth = Math.max(1, cam.scale);
    ctx.stroke();
    ctx.setLineDash([]);

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
    ctx.strokeStyle = 'rgba(150,175,215,.55)';
    ctx.lineWidth = 1.2 * cam.scale;
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
