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
import { BodyRenderer, drawBacktrackFloor, drawHazardZones } from './world.ts';
import { drawAnchorLine, drawBoostHalo, drawOrbitCurve } from './capture.ts';
import { Trail, drawShip } from './ship.ts';
import { drawEndingNotice, drawPaused } from './overlays.ts';
import { drawFuelGauge, drawReadout, readoutLines } from './hud.ts';
import { drawAlignGlow, drawCompass } from './compass.ts';
import { drawEdgeMarkers } from './edge-markers.ts';
import { canAffordCircularise } from './capture.ts';
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
    opts: {
      timeMs: number;
      paused: boolean;
      viewportW: number;
      viewportH: number;
      /** Bottom of the header text, in design units. */
      headerBottom: number;
    },
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
    drawBacktrackFloor(ctx, cam, sim, render, snap.highWaterY);
    this.bodyRenderer.draw(ctx, cam, sim, bodies, snap.capture ? snap.capture.planet : -1);

    const cap = snap.capture;
    if (cap) {
      const anchor = bodies[cap.planet];
      if (anchor) {
        drawOrbitCurve(ctx, cam, sim, snap, anchor);
        drawAnchorLine(ctx, cam, sim, snap, anchor);
      }
      drawBoostHalo(ctx, cam, sim, render, snap, opts.timeMs);
    }

    const compass = drawCompass(ctx, cam, sim, render, snap, bodies, opts.timeMs);

    this.trail.draw(ctx, cam, snap.x, snap.y);
    drawAlignGlow(ctx, cam, snap, compass.bestAlign, opts.timeMs);
    drawShip(ctx, cam, snap);

    drawEdgeMarkers(ctx, cam, render, snap, bodies, opts.headerBottom);

    drawEndingNotice(ctx, cam, sim, snap);

    // HUD sits inside the clip too: it is laid out in design space, so it must
    // never be drawn over a letterbox bar.
    drawFuelGauge(ctx, cam, sim, snap, opts.timeMs);
    drawReadout(ctx, cam, readoutLines(sim, snap, canAffordCircularise(sim, snap)), opts.timeMs);

    ctx.restore();

    if (opts.paused) drawPaused(ctx, cam);
  }
}
