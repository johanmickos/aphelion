/**
 * Draw orchestration. Owns the draw order and nothing else.
 *
 * Everything below the HUD is drawn clipped to the design window, so no world
 * content can spill onto the letterbox bars.
 */
import type { SimConfig } from '../sim/config.ts';
import { FIXED_DT } from '../sim/config.ts';
import type { Body } from '../sim/types.ts';
import type { FieldBounds } from '../sim/world.ts';
import { finishLineY, runInBand } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { clipToWindow, toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { Starfield } from './starfield.ts';
import {
  drawBacktrackFloor,
  drawFinishLine,
  drawHazardZones,
  drawMotes,
  drawSpeedCarpet,
} from './world.ts';
import { drawAnchorLine, drawBoostHalo, drawOrbitCurve } from './capture.ts';
import { Trail, drawShip } from './ship.ts';
import { Nebula, OUTRO_SECS } from './nebula.ts';
import type { CanvasFactory } from './nebula.ts';
import { FuelWarning } from './fuel-warning.ts';
import { Deadline } from './deadline.ts';
import { doomLight } from './verdict.ts';
import { Popups } from './popups.ts';
import { drawEndingNotice, drawPaused } from './overlays.ts';
import { drawWarnings } from './warnings.ts';
import type { WarningLight } from './warnings.ts';
import { ceremonyPhase, ceremonyShipPos, drawCeremonyWash, drawFinishFlash } from './ceremony.ts';
import type { Ceremony } from './ceremony.ts';
import { CLEARED_SHEET, DEATH_SHEET, drawSheet } from './sheet.ts';

import { SCORE_BAND_BOTTOM, drawFuelGauge, drawReadout, drawScore, readoutLines } from './hud.ts';
import { drawAlignGlow, drawCompass } from './compass.ts';
import { BodyRenderer } from './body.ts';
import { drawEdgeMarkers } from './edge-markers.ts';
import { canAffordCircularise } from './capture.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { Frame } from './frame.ts';
import { DEFAULT_THEME } from './theme.ts';
import type { Theme } from './theme.ts';
import { DEFAULT_SCORE_CONFIG } from '../score/config.ts';
import type { ScoreState } from '../score/types.ts';
import { VOID, solid } from './palette.ts';
import { mix } from './theme.ts';

export interface SceneDeps {
  sim: SimConfig;
  render: RenderConfig;
  bodies: readonly Body[];
  field: FieldBounds;
  /**
   * The palette this scene paints in. Defaults to the canonical one.
   *
   * Optional rather than required because every caller today wants the default,
   * and making ten test constructions say so would be noise instead of
   * explicitness. A region passes its own — which is the whole point of the theme
   * being a value, and the thing `palette.ts` could not do while it was a module
   * of constants.
   */
  theme?: Theme;
}

/**
 * What the app hands the scene each frame, as opposed to what the scene derives.
 *
 * Named rather than inline because `frame()` takes it too, and an inline type
 * repeated in two signatures is one rename away from being two types.
 */
export interface DrawOpts {
  timeMs: number;
  paused: boolean;
  viewportW: number;
  viewportH: number;
  /** Bottom of the header text, in design units. */
  headerBottom: number;
  /** Seconds since the last frame, for animation that is not tick-locked. */
  frameDt: number;
  /**
   * The live score. Passed in rather than carried on the snapshot: the snapshot
   * is derived from `SimState`, and the score deliberately is not part of it —
   * see `src/score/score.ts`.
   */
  score: ScoreState;
  /**
   * Fade of a DEATH sheet, 0..1, or null when none is up.
   *
   * Clocked by the app rather than derived here, because a worthy death has no
   * ceremony to hang a phase off — and it cannot borrow the simulation's hold
   * either: whether a death earned a sheet is a question about `ScoreState`,
   * which `src/sim/` must never be able to see. So the app stops stepping and
   * runs this clock itself. A CLEAR needs no such field; its fade rides the
   * ceremony, which the scene already has.
   */
  deathSheet?: number | null;
  /** Seconds since a death sheet was raised, for its roll. */
  deathSheetT?: number;
}

export class Scene {
  /**
   * THE DRAW ORDER, AND IT IS LOAD-BEARING.
   *
   * Every comment on a row below records a defect someone paid for once. This used
   * to be 180 lines of statements, so the order was only visible by reading all of
   * them — and Direction 05 adds four more world layers, Direction 02 a hitstop that
   * freezes some of these and not others, and Directions 09 to 11 glass cards over a
   * field that is still moving. Each of those is a row here now.
   */
  static readonly LAYERS: readonly Layer[] = [
    { name: 'letterbox', draw: (s, f) => s.letterbox(f) },
    {
      name: 'window',
      // Everything below the HUD is clipped to the design window, so no world
      // content can spill onto the letterbox bars.
      wrap: (f, inner) => {
        f.ctx.save();
        clipToWindow(f.ctx, f.cam);
        inner();
        f.ctx.restore();
      },
      children: [
        { name: 'ground', draw: (s, f) => s.ground(f) },
        // UNDER THE STARFIELD, deliberately. Stars parallax THROUGH the storm as the
        // camera moves, which is what makes it read as a volume the ship is inside
        // of rather than as a filter laid over the picture. See `nebula.ts`.
        { name: 'storm', draw: (s, f) => s.storm(f) },
        { name: 'starfield', draw: (s, f) => s.starfield(f) },
        {
          name: 'world',
          // ---- the world falls away
          //
          // The ship is frozen where it crossed, so "flying on" is the world
          // receding rather than the ship advancing. Everything in world space
          // shifts down together — bodies, runway, chequers — and slides off the
          // bottom while the ship holds its place. The ship is drawn after this
          // closes, so it stays put while the field leaves.
          wrap: (f, inner) => {
            const receding = f.cer !== null && f.cer.shift > 0;
            if (!receding) return inner();
            f.ctx.save();
            f.ctx.translate(0, f.cer!.shift * f.cam.scale);
            inner();
            f.ctx.restore();
          },
          children: [
            { name: 'hazard-zones', draw: (s, f) => s.hazardZones(f) },
            { name: 'backtrack-floor', draw: (s, f) => s.backtrackFloor(f) },
            // Under the bodies, so the chequers stay the brightest thing in that
            // part of the sky.
            {
              name: 'runway',
              when: (f) => !f.cer || f.cer.warp < 1,
              draw: (s, f) => s.runway(f),
            },
            { name: 'bodies', draw: (s, f) => s.bodies(f) },
          ],
        },
        { name: 'capture', draw: (s, f) => s.capture(f) },
        // Under the ship and its wake: it describes where the ship is going, and
        // nothing about it should ever obscure the ship itself.
        { name: 'deadline', draw: (s, f) => s.deadlineMark(f) },
        { name: 'compass', draw: (s, f) => s.compass(f) },
        { name: 'advance', draw: (s, f) => s.advance(f) },
        { name: 'ceremony-wash', draw: (s, f) => s.ceremonyWash(f) },
        { name: 'ship', draw: (s, f) => s.ship(f) },
        // Above the ship and its wake, below the HUD: they belong to the world, but
        // nothing in the world should ever cover them.
        { name: 'floating-scores', draw: (s, f) => s.floatingScores(f) },
        { name: 'warnings', draw: (s, f) => s.warnings(f) },
        { name: 'edge-markers', draw: (s, f) => s.edgeMarkers(f) },
        { name: 'resolve-sheet', draw: (s, f) => s.resolveSheet(f) },
        { name: 'instruments', when: (f) => !f.cer, draw: (s, f) => s.instruments(f) },
        { name: 'score-band', draw: (s, f) => s.scoreBand(f) },
        { name: 'readout', when: (f) => !f.cer, draw: (s, f) => s.readout(f) },
        { name: 'sheet', draw: (s, f) => s.sheet(f) },
      ],
    },
    // Outside the clip: a pause covers the whole screen, letterbox bars included.
    { name: 'paused', when: (f) => f.paused, draw: (s, f) => s.paused(f) },
  ];

  readonly trail: Trail;
  readonly popups = new Popups();
  readonly fuelWarning = new FuelWarning();
  /**
   * The point of no return. Fed on the tick from `app/main.ts`, which is where
   * the full `SimState` the prediction needs lives — the snapshot is deliberately
   * narrow and a deadline is not something it should learn to carry.
   */
  readonly deadline = new Deadline();
  private readonly stars: Starfield;
  private readonly bodyRenderer = new BodyRenderer();

  /**
   * The charged storm. Holds an offscreen buffer, so it is an object rather than
   * a function — see `src/render/nebula.ts`.
   */
  private readonly nebula: Nebula;

  private readonly deps: SceneDeps;

  /**
   * The results panel, over everything.
   *
   * Reads `lastRun` and never `run`: the live one was cleared by `endLife` on the
   * tick the run ended, which is the trap `ScoreState.lastRun` exists to close.
   */
  private drawSheetLayer(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    cer: Ceremony | null,
    alpha: number,
    opts: { score: ScoreState; deathSheetT?: number },
  ): void {
    if (alpha <= 0 || !opts.score.lastRun) return;
    drawSheet(ctx, cam, {
      style: cer ? CLEARED_SHEET : DEATH_SHEET,
      run: opts.score.lastRun,
      ending: opts.score.lastEnding,
      max: opts.score.sessionMax,
      bodies: this.deps.bodies,
      dt: FIXED_DT,
      alpha,
      // Any steadily-growing clock will do: the marquee is periodic, so where its
      // light happens to be when the panel fades in is not something anyone can
      // perceive. This used to subtract a hardcoded guess at when the sheet
      // appears — a number with nothing keeping it true, which had already drifted
      // out of step with the fade once and stalled the roll at zero.
      t: cer ? cer.t : (opts.deathSheetT ?? 0),
      // The roll rides the fade, so the digits move on the first readable frame.
      roll: alpha,
    });
  }

  /**
   * The ship, its wake, and the mark the ceremony stamps beside it.
   *
   * Extracted because `draw` had grown from 140 lines to nearly 300 as the
   * ceremony went in, and this is the part of it that is genuinely one idea:
   * everything drawn AT the ship, in the ship's own place, which during a
   * ceremony is not where the simulation left it.
   *
   * A translate rather than a position argument, because the trail has to travel
   * with the hull — they are one object, and moving only the hull would leave the
   * wake behind at the crossing point.
   */
  private drawShipLayer(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    cer: Ceremony | null,
    bestAlign: number,
    opts: { timeMs: number; score: ScoreState },
  ): void {
    const sx = toScreenX(cam, snap.x);
    const sy = toScreenY(cam, snap.y);
    const to = cer ? ceremonyShipPos(cam, cer, sx, sy) : null;
    const shifted = to !== null && (to.x !== sx || to.y !== sy);
    if (shifted) {
      ctx.save();
      ctx.translate(to.x - sx, to.y - sy);
    }
    this.trail.draw(ctx, cam, snap.x, snap.y, cer ? cer.warp : 0, cer ? cer.t : 0);
    drawAlignGlow(ctx, cam, snap, bestAlign, opts.timeMs);
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

    // After the ship, so it is never drawn under it, and OUTSIDE the shift so it
    // stamps the moment rather than receding with the world.
    if (cer && to) drawFinishFlash(ctx, cam, cer, to.x, to.y);
  }

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
   * The ship's speed on the last tick it was alive.
   *
   * `endRun` zeroes the velocity, so by the time the ceremony wants to know how
   * fast the player arrived, the answer is gone from the state. Carrying it here
   * is render bookkeeping of exactly the kind `burn` already is — nothing the
   * simulation can see, and nothing a replay has to reproduce.
   */
  private entrySpeed = 0;

  /**
   * How far the results sheet had faded in on the last frame drawn.
   *
   * Published so the app can refuse a dismissing tap until there is something to
   * dismiss. It could recompute the ceremony to find out, but that means a second
   * copy of where the finish line is and how the fade is paced — two derivations
   * of one number, free to drift. The renderer already knows; it just had no way
   * to say so.
   */
  sheetAlpha = 0;

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
   * How well the release is aimed, from the compass, for the glow the ship wears.
   *
   * A local until the draw order became a list. The two layers that need it are
   * four rows apart, and threading a value through the rows between them would
   * make every one of them carry something it does not use.
   */
  private bestAlign = 0;

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

  /**
   * Assemble the frame.
   *
   * The two derived values are computed HERE and nowhere else. `finishY` is read
   * by the chequered line, by the arrow that points at it and by the carpet that
   * runs up to it, and `world.ts` spends a header explaining what happens when one
   * geometry is derived twice. `cer` answers "is this the victory frame", which a
   * dozen layers ask.
   */
  private frame(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    opts: DrawOpts,
  ): Frame {
    const { sim, render, bodies, field } = this.deps;
    const finishY = finishLineY(sim, field);
    // The ceremony needs the speed the ship arrived at, and `endRun` has already
    // zeroed the velocity by the time it asks — so the last live reading is kept.
    if (!snap.ending.active) {
      this.entrySpeed = Math.sqrt(snap.vx * snap.vx + snap.vy * snap.vy);
    }
    return {
      ctx,
      cam,
      snap,
      sim,
      render,
      theme: this.deps.theme ?? DEFAULT_THEME,
      bodies,
      field,
      score: opts.score,
      scoreCfg: DEFAULT_SCORE_CONFIG,
      cer: ceremonyPhase(snap, cam, finishY, this.entrySpeed),
      finishY,
      timeMs: opts.timeMs,
      frameDt: opts.frameDt,
      paused: opts.paused,
      viewportW: opts.viewportW,
      viewportH: opts.viewportH,
      headerBottom: opts.headerBottom,
      deathSheet: opts.deathSheet ?? null,
      deathSheetT: opts.deathSheetT ?? 0,
    };
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, snap: RenderSnapshot, opts: DrawOpts): void {
    runLayers(this, this.frame(ctx, cam, snap, opts), Scene.LAYERS);
  }

  // ------------------------------------------------------------ layer bodies
  //
  // One method per layer, named for what it draws. They are private and the list
  // below is module-level, so `runLayers` reaches them through `SceneInternals` —
  // see the note there.

  /** The letterbox bars, outside the clip. Nothing else may paint here. */
  private letterbox(f: Frame): void {
    f.ctx.fillStyle = LETTERBOX;
    f.ctx.fillRect(0, 0, f.viewportW, f.viewportH);
  }

  /** The ground the world is drawn on. */
  private ground(f: Frame): void {
    f.ctx.fillStyle = GROUND;
    f.ctx.fillRect(0, 0, f.viewportW, f.viewportH);
  }

  /**
   * Charged: a purple storm, centred on the ship and travelling with it.
   *
   * The closing animation is clocked HERE and not in the drawing, because it
   * describes a window that has already ended: `chargedFrac` is 0 throughout it,
   * so the drawing has nothing left to derive a phase from. Frozen while paused,
   * for the same reason the popups are — an animation must not age out behind an
   * overlay.
   */
  private storm(f: Frame): void {
    if (f.snap.chargedFrac > 0) {
      this.chargedWas = true;
      this.outroT = -1;
    } else if (this.chargedWas) {
      this.chargedWas = false;
      this.outroT = 0;
    } else if (this.outroT >= 0 && !f.paused) {
      this.outroT += f.frameDt;
      if (this.outroT >= OUTRO_SECS) this.outroT = -1;
    }
    this.nebula.draw(
      f.ctx,
      f.cam,
      f.snap,
      f.timeMs,
      this.outroT >= 0 ? Math.min(1, this.outroT / OUTRO_SECS) : null,
    );
  }

  private starfield(f: Frame): void {
    this.stars.draw(f.ctx, f.cam, f.render, f.cer ? f.cer.warp : 0, f.cer ? f.cer.shift : 0);
  }

  private hazardZones(f: Frame): void {
    drawHazardZones(f.ctx, f.cam, f.render, f.field);
  }

  private backtrackFloor(f: Frame): void {
    drawBacktrackFloor(f.ctx, f.cam, f.sim, f.render, f.snap.highWaterY);
  }

  /**
   * The runway: chevrons, the dots in them, and the chequered line they feed.
   *
   * Kept up THROUGH the coast, and only then dropped. Cutting them at the crossing
   * meant the chequers — the thing the whole runway exists to deliver the player
   * to — were gone before they could be looked at. They recede with the rest of
   * the world instead, and by the time the warp starts they have left the screen
   * on their own.
   */
  private runway(f: Frame): void {
    // The band's own depth rather than the config key, so the chevrons cover
    // exactly the stretch the funnel acts on. See `finishLineY`.
    const band = runInBand(f.sim, f.field);
    drawSpeedCarpet(f.ctx, f.cam, f.field, f.finishY, band ? band.bottom - band.top : 0, f.timeMs);
    // Over the chevrons and under the chequers, which is where they sit in the
    // world: a dot is a thing IN the carpet, and the line is still the brightest
    // thing in that stretch of sky.
    drawMotes(f.ctx, f.cam, f.snap.motes, f.timeMs);
    drawFinishLine(f.ctx, f.cam, f.field, f.finishY);
  }

  private bodies(f: Frame): void {
    this.bodyRenderer.draw(f);
  }

  /** The orbit the ship is on, the line to its anchor, and the boost it is building. */
  private capture(f: Frame): void {
    const cap = f.snap.capture;
    if (!cap) return;
    const anchor = f.bodies[cap.planet];
    if (anchor) {
      drawOrbitCurve(f.ctx, f.cam, f.sim, f.snap, anchor);
      drawAnchorLine(f.ctx, f.cam, f.sim, f.snap, anchor);
    }
    drawBoostHalo(f.ctx, f.cam, f.sim, f.render, f.snap, f.timeMs);
  }

  /**
   * The point of no return.
   *
   * The follower advances here rather than where the deadline is fed, so the mark
   * glides at display rate instead of stepping at the ten-times-a-second the
   * prediction is recomputed at. Frozen while paused, like the popups: a mark must
   * not slide to a new place behind an overlay.
   */
  private deadlineMark(f: Frame): void {
    if (!f.paused) this.deadline.update(f.frameDt, f.render);
    this.deadline.draw(f.ctx, f.cam, f.render);
  }

  /**
   * The compass, which also answers how well the release is aimed.
   *
   * The answer is kept on the scene because the ship layer draws the glow for it
   * and the two are several layers apart. It was a local before the list existed.
   */
  private compass(f: Frame): void {
    this.bestAlign = drawCompass(
      f.ctx,
      f.cam,
      f.sim,
      f.render,
      f.snap,
      f.bodies,
      f.timeMs,
    ).bestAlign;
  }

  /**
   * Advance every clock that is not tick-locked. Draws nothing.
   *
   * A STEP IN THE FRAME RATHER THAN A DRAW, and it is in the list because its
   * POSITION is the point: the flame it advances is read by the ship two layers
   * down, and the popups and the fuel badge are drawn below that. Hoisting it out
   * of the order would work today and silently stop working the first time
   * something above it learns to read one of these.
   *
   * Paused means paused: nothing here may age behind an overlay.
   */
  private advance(f: Frame): void {
    if (f.paused) return;
    this.popups.update(f.frameDt);
    this.fuelWarning.update(f.frameDt);
    // Catches in ~0.03s and dies over ~0.25s. The rise is deliberately quicker
    // than it first was: a flare runs about 0.2s, so a follower that needed a
    // tenth of that to catch was shaving the peak off the very thing it draws.
    const target = f.score.burnHeat;
    const rate = target > this.burn ? 30 : 4;
    this.burn += (target - this.burn) * Math.min(1, f.frameDt * rate);
    if (this.burn < 0.002) this.burn = 0;
  }

  /** The gold, over the world and under the ship: it tints the sky, never the ship. */
  private ceremonyWash(f: Frame): void {
    if (f.cer) drawCeremonyWash(f.ctx, f.cam, f.cer);
  }

  private ship(f: Frame): void {
    this.drawShipLayer(f.ctx, f.cam, f.snap, f.cer, this.bestAlign, {
      timeMs: f.timeMs,
      score: f.score,
    });
  }

  private floatingScores(f: Frame): void {
    this.popups.draw(f.ctx, f.cam);
  }

  /**
   * Every ship-local warning light, in one place.
   *
   * The skull's two sources are resolved here. Drifting, the deadline knows;
   * captured, the scorer does. They cannot both be true — `rescueDeadline` returns
   * null during a capture, and `doomed` is armed only at the start of one — so this
   * is one meaning in two states rather than a priority between two opinions, and
   * `doomLight` never learns either source exists.
   */
  private warnings(f: Frame): void {
    const fated = this.deadline.fated;
    const doomed = f.score.doomed;
    const doom = fated
      ? { wall: fated.wall, age: fated.age }
      : doomed
        ? { wall: doomed.wall, age: (f.snap.tick - doomed.tick) * f.render.verdictTickSecs }
        : null;
    // Nothing during the ending hold: the notice is the explanation from there,
    // and a warning that outlives the thing it was warning about is noise.
    const lights = [
      f.snap.ending.active ? null : doomLight(f.render, doom),
      this.fuelWarning.light(),
    ].filter((l): l is WarningLight => l !== null);
    drawWarnings(f.ctx, f.cam, f.snap, lights);
  }

  private edgeMarkers(f: Frame): void {
    drawEdgeMarkers(
      f.ctx,
      f.cam,
      f.render,
      f.theme,
      f.snap,
      f.bodies,
      // The DOM header OR the canvas score band, whichever reaches further down.
      // The arrows have to clear both, and only one of them was ever measured.
      Math.max(f.headerBottom, SCORE_BAND_BOTTOM),
      f.finishY,
    );
  }

  /**
   * How far the results panel has faded in. Draws nothing.
   *
   * In the list because two layers below it read the answer and one of them
   * cross-fades against it, and because it is published for the app — which
   * refuses a dismissing tap until there is something to dismiss.
   */
  private resolveSheet(f: Frame): void {
    this.sheetAlpha = f.cer ? f.cer.sheet : (f.deathSheet ?? 0);
  }

  /**
   * THE INSTRUMENTS BELONG TO A RUN, AND THE RUN IS OVER.
   *
   * The boxed notice explains a failure and there is none; the gauge reports a
   * resource that is no longer being spent. Left up during a ceremony they are
   * flight furniture sitting on top of a curtain call — and the notice in
   * particular says FIELD CLEARED in a small industrial box while the whole sky is
   * already saying it much better.
   */
  private instruments(f: Frame): void {
    drawEndingNotice(f.ctx, f.cam, f.sim, f.snap, f.score.lastEnding?.alight ?? false);
    // HUD sits inside the clip too: it is laid out in design space, so it must
    // never be drawn over a letterbox bar.
    drawFuelGauge(f.ctx, f.cam, f.sim, f.snap, f.timeMs);
  }

  /**
   * The band hands the score over to the sheet.
   *
   * Two readouts of one number, and only one should be lit. Before the sheet
   * arrives the band is the ONLY place the score exists — `endLife` has already
   * cleared the live figure, so the band is showing the sealed one — and once the
   * sheet is up it says the same thing, larger, with everything that qualifies it.
   * So they cross-fade rather than either being cut: no flicker, and no moment
   * where the score is nowhere.
   *
   * This is why the band is NOT suppressed during a ceremony the way the
   * instruments above it are.
   */
  private scoreBand(f: Frame): void {
    const fade = 1 - this.sheetAlpha;
    if (fade <= 0.005) return;
    f.ctx.save();
    f.ctx.globalAlpha = fade;
    drawScore(f.ctx, f.cam, f.score, f.snap);
    f.ctx.restore();
  }

  /** The telemetry line. Narrates a manoeuvre, so it goes when there is none left. */
  private readout(f: Frame): void {
    drawReadout(
      f.ctx,
      f.cam,
      readoutLines(f.sim, f.snap, canAffordCircularise(f.sim, f.snap)),
      f.timeMs,
    );
  }

  /** Over everything: the only thing the player is meant to be reading by now. */
  private sheet(f: Frame): void {
    this.drawSheetLayer(f.ctx, f.cam, f.cer, this.sheetAlpha, {
      score: f.score,
      deathSheetT: f.deathSheetT,
    });
  }

  private paused(f: Frame): void {
    drawPaused(f.ctx, f.cam);
  }
}

/**
 * The two grounds.
 *
 * GROUND is the sky itself — VOID, "violet-black, never pure", because true black
 * belongs to the anomaly's cloud gaps and nothing else. LETTERBOX is what the
 * window is letterboxed INTO, so it has to be darker than the world or the bars
 * read as more sky; it is the one place the palette is deliberately undershot.
 */
const GROUND = solid(VOID);
const LETTERBOX = solid(mix(VOID, [0, 0, 0], 0.55));

/**
 * A step in the frame.
 *
 * Most of them draw. Two — `advance` and `resolveSheet` — move a clock or settle a
 * number, and they are in the list because their POSITION relative to the drawing
 * is the whole of what makes them correct.
 */
export interface Layer {
  name: string;
  /** Skip the layer entirely this frame. */
  when?: (f: Frame) => boolean;
  draw?: (s: Scene, f: Frame) => void;
  /**
   * Wrap `children` in a canvas state. Must balance its own save/restore.
   *
   * The alternative was a pair of pseudo-layers opening and closing a transform
   * from opposite ends of a flat list, which is an unbalanced `restore` waiting to
   * happen the first time someone reorders the rows between them.
   */
  wrap?: (f: Frame, inner: () => void) => void;
  children?: readonly Layer[];
}

/**
 * The order, flattened, outermost first and children in place.
 *
 * Exists for the pin in `test/render.test.ts`. Every row of the list carries a
 * comment recording a defect someone paid for once — the storm under the stars,
 * the deadline under the ship, the chequers over the chevrons — and a silent
 * reorder undoes one of them without failing anything. Now it fails.
 */
export function layerOrder(layers: readonly Layer[] = Scene.LAYERS): string[] {
  const out: string[] = [];
  for (const l of layers) {
    out.push(l.name);
    if (l.children) out.push(...layerOrder(l.children));
  }
  return out;
}

function runLayers(s: Scene, f: Frame, layers: readonly Layer[]): void {
  for (const l of layers) {
    if (l.when && !l.when(f)) continue;
    if (l.children) {
      const inner = (): void => runLayers(s, f, l.children!);
      if (l.wrap) l.wrap(f, inner);
      else inner();
    }
    l.draw?.(s, f);
  }
}
