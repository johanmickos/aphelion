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
import { clipToWindow, toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { Starfield } from './starfield.ts';
import {
  BodyRenderer,
  drawBacktrackFloor,
  drawFinishLine,
  drawHazardZones,
  drawSpeedCarpet,
} from './world.ts';
import { drawAnchorLine, drawBoostHalo, drawOrbitCurve } from './capture.ts';
import { Trail, drawShip } from './ship.ts';
import { Nebula, OUTRO_SECS } from './nebula.ts';
import type { CanvasFactory } from './nebula.ts';
import { FuelWarning } from './fuel-warning.ts';
import { Scar } from './scar.ts';
import { drawVerdict } from './verdict.ts';
import { Popups } from './popups.ts';
import { drawEndingNotice, drawPaused } from './overlays.ts';
import { ceremonyPhase, ceremonyShipPos, drawCeremonyWash } from './ceremony.ts';
import { SCORE_BAND_BOTTOM, drawFuelGauge, drawReadout, drawScore, readoutLines } from './hud.ts';
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
  /**
   * The point of no return. Fed on the tick from `app/main.ts`, which is where
   * the full `SimState` the prediction needs lives — the snapshot is deliberately
   * narrow and a scar is not something it should learn to carry.
   */
  readonly scar = new Scar();
  private readonly stars: Starfield;
  private readonly bodyRenderer = new BodyRenderer();

  /**
   * The charged storm. Holds an offscreen buffer, so it is an object rather than
   * a function — see `src/render/nebula.ts`.
   */
  private readonly nebula: Nebula;

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

  /**
   * `makeCanvas` supplies the storm's offscreen buffer. Injectable so a test can
   * exercise the composited path rather than the no-`document` fallback, which is
   * a different renderer and the one nobody ships.
   */
  constructor(deps: SceneDeps, seed: number, makeCanvas?: CanvasFactory) {
    this.deps = deps;
    this.stars = new Starfield(deps.render, seed);
    this.trail = new Trail(deps.render);
    this.nebula = new Nebula(makeCanvas);
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
    // Where the run ends as `cleared`, or null when the field cannot be cleared.
    // Derived once and shared by the line and the arrow that points at it, so the
    // two can never disagree about where the finish is.
    const finishY = sim.clearAtTop ? field.crest - sim.grabRange : null;
    // Null unless the field has just been cleared. Everything the ceremony
    // touches reads it, so "is this the victory frame" is asked once.
    const cer = ceremonyPhase(snap, cam, finishY);

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
    this.nebula.draw(
      ctx,
      cam,
      snap,
      opts.timeMs,
      opts.viewportW,
      opts.viewportH,
      this.outroT >= 0 ? Math.min(1, this.outroT / OUTRO_SECS) : null,
    );

    this.stars.draw(ctx, cam, render, cer ? cer.warp : 0, cer ? cer.shift : 0);

    // ---- the world falls away
    //
    // The ship is frozen where it crossed, so "flying on" is the world receding
    // rather than the ship advancing. Everything in world space is shifted down
    // together — bodies, runway, chequers — and slides off the bottom while the
    // ship holds its place. The ship and its trail are drawn AFTER this is
    // restored, so they stay put while the field leaves.
    const receding = cer !== null && cer.shift > 0;
    if (receding) {
      ctx.save();
      ctx.translate(0, cer.shift * cam.scale);
    }
    drawHazardZones(ctx, cam, render, field);
    drawBacktrackFloor(ctx, cam, sim, render, snap.highWaterY);
    // Under the line it feeds into, so the chequers stay the brightest thing in
    // that part of the sky.
    // Kept up THROUGH the coast, and only then dropped. Cutting them at the
    // crossing meant the chequers — the thing the whole runway exists to deliver
    // the player to — were gone before they could be looked at. They recede with
    // the rest of the world instead, and by the time the warp starts they have
    // left the screen on their own.
    if (!cer || cer.warp < 1) {
      drawSpeedCarpet(ctx, cam, field, finishY, sim.finishFunnelDepth, opts.timeMs);
      drawFinishLine(ctx, cam, field, finishY);
    }
    this.bodyRenderer.draw(
      ctx,
      cam,
      sim,
      bodies,
      snap.capture ? snap.capture.planet : -1,
      opts.timeMs,
    );

    if (receding) ctx.restore();

    const cap = snap.capture;
    if (cap) {
      const anchor = bodies[cap.planet];
      if (anchor) {
        drawOrbitCurve(ctx, cam, sim, snap, anchor);
        drawAnchorLine(ctx, cam, sim, snap, anchor);
      }
      drawBoostHalo(ctx, cam, sim, render, snap, opts.timeMs);
    }

    // Under the ship and its wake: it describes where the ship is going, and
    // nothing about it should ever obscure the ship itself.
    //
    // The follower advances here rather than where the scar is fed, so the mark
    // glides at display rate instead of stepping at the ten-times-a-second the
    // prediction is recomputed at. Frozen while paused, like the popups: a mark
    // must not slide to a new place behind an overlay.
    if (!opts.paused) this.scar.update(opts.frameDt, render);
    this.scar.draw(ctx, cam, render);

    const compass = drawCompass(ctx, cam, sim, render, snap, bodies, opts.timeMs);

    // Paused means paused: a popup must not age out behind the overlay.
    if (!opts.paused) {
      this.popups.update(opts.frameDt);
      this.fuelWarning.update(opts.frameDt);
      // Catches in ~0.03s and dies over ~0.25s. The rise is deliberately quicker
      // than it first was: a flare runs about 0.2s, so a follower that needed a
      // tenth of that to catch was shaving the peak off the very thing it draws.
      // A pause holds the flame where it was, for the same reason it holds the
      // popups: nothing should burn down behind the overlay.
      const target = opts.score.burnHeat;
      const rate = target > this.burn ? 30 : 4;
      this.burn += (target - this.burn) * Math.min(1, opts.frameDt * rate);
      if (this.burn < 0.002) this.burn = 0;
    }

    // The gold, over the world and under the ship: it should tint the sky the
    // ship is flying through, never the ship itself.
    if (cer) drawCeremonyWash(ctx, cam, cer);

    // During the ceremony the ship is drawn away from where the simulation left
    // it, easing to the middle. A translate rather than a position argument,
    // because the trail has to travel with it — they are one object, and moving
    // only the hull would leave the wake behind at the crossing point.
    let shifted = false;
    if (cer) {
      const sx = toScreenX(cam, snap.x);
      const sy = toScreenY(cam, snap.y);
      const to = ceremonyShipPos(cam, cer, sx, sy);
      if (to.x !== sx || to.y !== sy) {
        ctx.save();
        ctx.translate(to.x - sx, to.y - sy);
        shifted = true;
      }
    }
    this.trail.draw(ctx, cam, snap.x, snap.y);
    drawAlignGlow(ctx, cam, snap, compass.bestAlign, opts.timeMs);
    // Nose up through the ceremony. See `drawShip`'s `heading`.
    drawShip(
      ctx,
      cam,
      snap,
      opts.score.hopped.length,
      this.burn,
      opts.timeMs,
      cer ? -Math.PI / 2 : undefined,
    );
    if (shifted) ctx.restore();

    // Above the ship and its wake, below the HUD: it belongs to the world, but
    // nothing in the world should ever cover it.
    this.popups.draw(ctx, cam);
    // Under the ship, in the lane the rising popups leave clear.
    this.fuelWarning.draw(ctx, cam, snap);
    // Beside the ship, on the side away from the wall — clear of the fuel badge
    // below it and of the popups above it. See `verdict.ts`.
    drawVerdict(ctx, cam, render, snap, opts.score);

    drawEdgeMarkers(
      ctx,
      cam,
      render,
      snap,
      bodies,
      // The DOM header OR the canvas score band, whichever reaches further down.
      // The arrows have to clear both, and only one of them was ever measured.
      Math.max(opts.headerBottom, SCORE_BAND_BOTTOM),
      finishY,
    );

    // THE INSTRUMENTS BELONG TO A RUN, AND THE RUN IS OVER.
    //
    // The boxed notice explains a failure and there is none; the gauge reports a
    // resource that is no longer being spent; the readout narrates a manoeuvre
    // that has finished. Left up, they are three pieces of flight furniture
    // sitting on top of a curtain call — and the notice in particular says FIELD
    // CLEARED in a small industrial box while the whole sky is already saying it
    // much better.
    //
    // The score band stays. It is the number the sheet is about to be built
    // around, and cutting it at the crossing only to bring it back a beat later
    // would be a flicker rather than a transition.
    if (!cer) {
      drawEndingNotice(ctx, cam, sim, snap);
      // HUD sits inside the clip too: it is laid out in design space, so it must
      // never be drawn over a letterbox bar.
      drawFuelGauge(ctx, cam, sim, snap, opts.timeMs);
    }
    drawScore(ctx, cam, opts.score, snap);
    if (!cer) {
      drawReadout(ctx, cam, readoutLines(sim, snap, canAffordCircularise(sim, snap)), opts.timeMs);
    }

    ctx.restore();

    if (opts.paused) drawPaused(ctx, cam);
  }
}
