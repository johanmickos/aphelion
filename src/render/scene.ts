/**
 * Draw orchestration. Owns the draw order and nothing else.
 *
 * Everything below the HUD is drawn clipped to the design window, so no world
 * content can spill onto the letterbox bars.
 */
import type { SimConfig } from '../sim/config.ts';
import type { Body } from '../sim/types.ts';
import type { FieldBounds } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { clipToWindow } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { Starfield } from './starfield.ts';
import { BodyRenderer, drawHazardZones } from './world.ts';
import { drawAnchorLine, drawBoostHalo, drawOrbitCurve } from './capture.ts';
import { Trail, drawShip } from './ship.ts';
import { drawEndingNotice, drawPaused } from './overlays.ts';
import type { RenderSnapshot } from './snapshot.ts';

export interface SceneDeps {
  sim: SimConfig;
  render: RenderConfig;
  bodies: readonly Body[];
  field: FieldBounds;
}

export class Scene {
  readonly trail: Trail;
  private readonly stars: Starfield;
  private readonly bodyRenderer = new BodyRenderer();

  private readonly deps: SceneDeps;

  constructor(deps: SceneDeps, seed: number) {
    this.deps = deps;
    this.stars = new Starfield(deps.render, seed);
    this.trail = new Trail(deps.render);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    opts: { timeMs: number; paused: boolean; viewportW: number; viewportH: number },
  ): void {
    const { sim, render, bodies, field } = this.deps;

    // the bars
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, opts.viewportW, opts.viewportH);

    ctx.save();
    clipToWindow(ctx, cam);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, opts.viewportW, opts.viewportH);

    this.stars.draw(ctx, cam, render);
    drawHazardZones(ctx, cam, render, field);
    this.bodyRenderer.draw(ctx, cam, sim, bodies);

    const cap = snap.capture;
    if (cap) {
      const anchor = bodies[cap.planet];
      if (anchor) {
        drawOrbitCurve(ctx, cam, sim, snap, anchor);
        drawAnchorLine(ctx, cam, sim, snap, anchor);
      }
      drawBoostHalo(ctx, cam, sim, render, snap, opts.timeMs);
    }

    this.trail.draw(ctx, cam);
    drawShip(ctx, cam, snap);

    drawEndingNotice(ctx, cam, sim, snap);

    ctx.restore();

    if (opts.paused) drawPaused(ctx, cam);
  }
}
