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
import { FuelWarning } from './fuel-warning.ts';
import { Popups } from './popups.ts';
import { drawEndingNotice, drawPaused } from './overlays.ts';
import { drawFuelGauge, drawReadout, drawScore, readoutLines } from './hud.ts';
import { drawAlignGlow, drawCompass } from './compass.ts';
import { drawEdgeMarkers } from './edge-markers.ts';
import { canAffordCircularise } from './capture.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { ScoreState } from '../score/types.ts';

export interface SceneDeps {
  sim: SimConfig;
  render: RenderConfig;
  bodies: readonly Body[];
  field: FieldBounds;
}

export class Scene {
  readonly trail: Trail;
  readonly popups = new Popups();
  readonly fuelWarning = new FuelWarning();
  private readonly stars: Starfield;
  private readonly bodyRenderer = new BodyRenderer();

  private readonly deps: SceneDeps;

  /**
   * The flame's own heat, chasing the scorer's.
   *
   * Two reasons it is not drawn straight from `score.burnHeat`. It is sampled on
   * the simulation tick, and a hot pass is only about ten of them — on a 120Hz
   * screen an un-smoothed flame would visibly step through a dozen sizes beside a
   * ship that interpolates. And fire has thermal inertia: it should catch fast and
   * die slowly, so the asymmetric rates below are the look, not just a filter.
   *
   * Render-only state. The scorer's value is untouched, and nothing here can
   * reach the simulation.
   */
  private burn = 0;

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
      /** Seconds since the last frame, for animation that is not tick-locked. */
      frameDt: number;
      /**
       * The live score. Passed in rather than carried on the snapshot: the
       * snapshot is derived from `SimState`, and the score deliberately is not
       * part of it — see `src/score/score.ts`.
       */
      score: ScoreState;
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
    this.bodyRenderer.draw(
      ctx,
      cam,
      sim,
      bodies,
      snap.capture ? snap.capture.planet : -1,
      opts.timeMs,
    );

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

    // Paused means paused: a popup must not age out behind the overlay.
    if (!opts.paused) {
      this.popups.update(opts.frameDt);
      this.fuelWarning.update(opts.frameDt);
      // Catches in ~0.05s and dies over ~0.25s. A pause holds the flame where it
      // was, for the same reason it holds the popups: nothing should burn down
      // behind the overlay.
      const target = opts.score.burnHeat;
      const rate = target > this.burn ? 20 : 4;
      this.burn += (target - this.burn) * Math.min(1, opts.frameDt * rate);
      if (this.burn < 0.002) this.burn = 0;
    }

    this.trail.draw(ctx, cam, snap.x, snap.y);
    drawAlignGlow(ctx, cam, snap, compass.bestAlign, opts.timeMs);
    drawShip(ctx, cam, snap, this.burn, opts.timeMs);

    // Above the ship and its wake, below the HUD: it belongs to the world, but
    // nothing in the world should ever cover it.
    this.popups.draw(ctx, cam);
    // Under the ship, in the lane the rising popups leave clear.
    this.fuelWarning.draw(ctx, cam, snap);

    drawEdgeMarkers(ctx, cam, render, snap, bodies, opts.headerBottom);

    drawEndingNotice(ctx, cam, sim, snap);

    // HUD sits inside the clip too: it is laid out in design space, so it must
    // never be drawn over a letterbox bar.
    drawFuelGauge(ctx, cam, sim, snap, opts.timeMs);
    drawScore(ctx, cam, opts.score, snap);
    drawReadout(ctx, cam, readoutLines(sim, snap, canAffordCircularise(sim, snap)), opts.timeMs);

    ctx.restore();

    if (opts.paused) drawPaused(ctx, cam);
  }
}
