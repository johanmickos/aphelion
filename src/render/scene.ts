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
import { OUTRO_SECS, drawNebula } from './nebula.ts';
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
   * The charged storm's closing animation. See `drawNebula`.
   *
   * Seconds since the window ended, or -1 when nothing is playing. Render state
   * and nothing else: a replay reproduces the window itself from
   * `(config, seed, inputLog)`, and how long its send-off has been on screen is
   * not something the simulation has an opinion about.
   */
  private chargedWas = false;

  private outroT = -1;

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

    // Charged: a purple nebula storm, centred on the ship and travelling with it.
    //
    // Under the starfield deliberately. Stars parallax THROUGH the storm as the
    // camera moves, which is what makes it read as a volume the ship is inside of
    // rather than as a filter laid over the picture. See `src/render/nebula.ts`.
    //
    // The closing animation is clocked HERE and not in the drawing, because it
    // describes a window that has already ended: `chargedFrac` is 0 throughout it,
    // so the drawing has nothing left to derive a phase from. Frozen while paused,
    // for the same reason the popups are — an animation must not age out behind an
    // overlay.
    if (snap.chargedFrac > 0) {
      this.chargedWas = true;
      this.outroT = -1;
    } else if (this.chargedWas) {
      this.chargedWas = false;
      this.outroT = 0;
    } else if (this.outroT >= 0 && !opts.paused) {
      this.outroT += opts.frameDt;
      if (this.outroT >= OUTRO_SECS) this.outroT = -1;
    }
    drawNebula(
      ctx,
      cam,
      snap,
      opts.timeMs,
      opts.viewportW,
      opts.viewportH,
      this.outroT >= 0 ? Math.min(1, this.outroT / OUTRO_SECS) : null,
    );

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
    }

    this.trail.draw(ctx, cam, snap.x, snap.y);
    drawAlignGlow(ctx, cam, snap, compass.bestAlign, opts.timeMs);
    drawShip(ctx, cam, snap, opts.score.hopped.length);

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
