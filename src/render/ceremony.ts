/**
 * The victory ceremony: the field falls away and the ship goes to lightspeed.
 *
 * WHY THIS IS RENDERING AND NOT SIMULATION. The decision it celebrates already
 * happened — `stepSim` ended the run as `cleared` and is holding, deliberately,
 * because what comes next is not the simulation's business. So none of this is
 * flown: the ship is frozen at the point it crossed, and the world is animated
 * past it. `attract.ts` made the same call for the title loop and its header
 * explains why at length; the short version is that a cutscene driven by the real
 * `stepSim` has to be solved offline against today's tuning and silently breaks
 * the next time anything is retuned.
 *
 * THE CLOCK IS `ending.t`, NOT A WALL CLOCK. The simulation keeps advancing that
 * value through the hold — it is ticks times dt — so the ceremony freezes when the
 * game is paused, ages identically in a replay, and never needs a second timeline
 * that could drift from the one the run is recorded against. It is also why
 * nothing here takes `frameDt`.
 *
 * THE SHIP DOES NOT MOVE; THE UNIVERSE DOES. The camera is frozen with the ship,
 * because the ship is frozen — so animating the ship upward would fly it off the
 * top of a stationary screen. Pinning it to the middle and streaming the stars
 * past it is both the easier thing and the more correct one: a warp looks like a
 * warp because of what the background does.
 *
 * AND IT STREAMS FLAT. The stars fall straight down in parallel rather than
 * radiating from a vanishing point — this game is side-on and has never implied
 * depth, so a cone would put a horizon in a world with no horizon. See the streak
 * block in `starfield.ts` for the full argument; it is the one place the ceremony
 * could most easily have contradicted the rest of the game's grammar.
 */
import type { Camera } from './camera.ts';
import { toScreenY } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';
import { FINISH, SUMMIT_RGB, withAlpha } from './palette.ts';

/**
 * Seconds over which the world accelerates from the speed the ship crossed at to
 * `CRUISE`.
 *
 * THE COAST USED TO START FROM A STANDSTILL, and that was a bug hiding inside an
 * easing function. `smoothstep` has zero derivative at zero, so the world began
 * falling at no speed at all on the tick a ship crossed the line at several
 * hundred pixels a second — a stop, and then a go, at the exact seam the whole
 * ceremony exists to make seamless.
 *
 * It is now a constant acceleration from the real crossing speed, in closed form
 * so it stays a pure function of the tick. That is also what makes the brief work
 * — "roughly the speed they come in, and then only speed up in the last bit
 * across the line and into the starfield": the runway hands the ship over at its
 * own speed and the ceremony does the speeding up, on the far side of the line
 * where there is nothing left to read.
 */
const ACCEL = 1.2;

/**
 * Design units per second the world settles at, once it is done accelerating.
 *
 * The number the sky ends up streaming at. Comfortably above any speed a ship can
 * cross the line at, so the ceremony always reads as a further acceleration
 * rather than as the world catching up with something already faster.
 */
const CRUISE = 1400;

/**
 * Design units of further travel, after the line has left, to reach full warp.
 *
 * A DISTANCE AND NOT A DURATION, which is the whole fix for the lag. The first
 * version handed over on a fixed timer, so the warp began 1.35s after the
 * crossing whether or not the chequers were still on screen — and since how far
 * the line has to fall depends on where the ship happened to cross, it usually
 * cleared early and left a hole. Reported as "once the finish line is off screen
 * we can start the starfield; now there's a noticeable lag".
 *
 * Measuring both halves in the same units removes the seam: the sky begins to
 * open at the exact moment the last of the chequers leaves the bottom of the
 * screen, wherever that happens to be.
 *
 * 260 -> 1200, once the coast started accelerating properly. Distance is not
 * time, and the difference bit: at the old shift rate 260 units was most of a
 * second, but the world now passes through it in a quarter of one, so the sky
 * snapped open instead of spooling. The units are right; the number had been
 * calibrated against a slower world.
 */
const SPOOL_DIST = 1200;

/**
 * Further travel, in design units, over which the sheet fades in once the warp is
 * at full stretch.
 *
 * AFTER THE WARP, NOT WITH IT. The panel is the reward for the thing the warp is
 * celebrating, and putting it up while the sky is still opening would make the
 * spectacle the backdrop to a results screen rather than the point. Measured in
 * distance like everything else here, so the whole ceremony is paced by one
 * quantity and cannot develop a seam.
 */
const SHEET_DIST = 1100;

/** Seconds spent easing the ship from where it crossed to the middle. */
const CENTRE = 0.8;

export interface Ceremony {
  /** 0 before the crossing, climbing to 1 at full warp, then held. */
  warp: number;
  /** How far the ship has been drawn toward the middle of the screen, 0..1. */
  centred: number;
  /**
   * How far the WORLD has fallen away since the crossing, in design units.
   *
   * The ship is frozen, so this is what "flying on" is made of: the bodies, the
   * runway and the finish line are all drawn shifted down by it, and slide off
   * the bottom while the ship holds its place.
   */
  shift: number;
  /** How far the results sheet has faded in, 0..1. */
  sheet: number;
  /** Seconds since the crossing. */
  t: number;
}

/** Smooth, flat at both ends. */
function ease(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return c * c * (3 - 2 * c);
}

/**
 * The ceremony's state this frame, or null when there is nothing to celebrate.
 *
 * Null for every ending that is not a clear — a crash gets its own notice and a
 * post-mortem, and gilding a death would be the cruellest possible misreading of
 * the moment.
 */
export function ceremonyPhase(
  snap: RenderSnapshot,
  cam: Camera,
  /** World y of the finish line, so the handover can be geometric. */
  finishY: number | null,
  /**
   * How fast the ship was going on the last tick before it crossed, px/s.
   *
   * `endRun` zeroes the velocity, so this cannot be read off the snapshot — the
   * scene carries the last live value forward. Without it the ceremony has no way
   * to begin at the speed the player arrived with, and any curve it picks instead
   * is a seam.
   */
  entrySpeed = 0,
): Ceremony | null {
  if (!snap.ending.active || snap.ending.reason !== 'cleared') return null;
  const t = snap.ending.t;
  // Eased, so the coast decelerates rather than stopping dead. The ship has just
  // been accelerated by the funnel; a world that halted on a timer would undo
  // that in one frame.
  // Constant acceleration from the crossing speed to `CRUISE`, then straight
  // line. Closed form, so this stays a pure function of the tick — and unbounded,
  // because the starfield scrolls off it and a shift that stopped growing would
  // freeze the sky.
  const v0 = Math.max(0, entrySpeed);
  const shift =
    t < ACCEL
      ? v0 * t + ((CRUISE - v0) * t * t) / (2 * ACCEL)
      : v0 * ACCEL + ((CRUISE - v0) * ACCEL) / 2 + CRUISE * (t - ACCEL);

  // How far the world still has to fall before the last of the chequers is off
  // the bottom of the screen. Derived from where the line actually is, so a ship
  // that crossed high and one that crossed low hand over at the right moment
  // instead of at the same moment.
  let cleared = 0;
  if (finishY !== null) {
    const lineY = toScreenY(cam, finishY);
    const bottom = cam.offsetY + cam.viewH * cam.scale;
    // Half the chequer band plus its glow still hangs below the line itself.
    const tail = 26 * cam.scale;
    cleared = Math.max(0, (bottom - lineY + tail) / cam.scale);
  }

  return {
    t,
    shift,
    warp: ease((shift - cleared) / SPOOL_DIST),
    sheet: ease((shift - cleared - SPOOL_DIST) / SHEET_DIST),
    centred: ease(t / CENTRE),
  };
}

/**
 * Where the ship is drawn during the ceremony: its own screen position, easing to
 * the middle of the design window.
 *
 * The funnel has already done most of this work in the simulation — a ship that
 * flew the runway arrives inside the middle quarter of the field — so this is the
 * last few pixels and a settling, not a yank. That ordering is the point: the
 * player was pulled to the centre while they still had control, and the ceremony
 * only finishes the gesture.
 */
export function ceremonyShipPos(
  cam: Camera,
  cer: Ceremony,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const cx = cam.offsetX + cam.designW * 0.5 * cam.scale;
  const cy = cam.offsetY + cam.viewH * 0.42 * cam.scale;
  return { x: sx + (cx - sx) * cer.centred, y: sy + (cy - sy) * cer.centred };
}

/**
 * The gold, laid over the world once the ship is through the line.
 *
 * GOLD AND NOT THE FINISH GREEN, which is a distinction the two colours earn by
 * doing different jobs. Green is the finish: the arrow, the chequers, the notice
 * that says you reached it — a category, the way an anomaly is purple. Gold is
 * the rarity ladder's top rung, and this is the only moment in the game that
 * deserves it. The player crosses a green line INTO a gold sky.
 *
 * Brightest at the horizon the ship is heading for, so the wash reads as light
 * from somewhere rather than as a filter over everything.
 */
export function drawCeremonyWash(ctx: CanvasRenderingContext2D, cam: Camera, cer: Ceremony): void {
  if (cer.warp <= 0) return;
  const w = cam.designW * cam.scale;
  const h = cam.viewH * cam.scale;
  const x = cam.offsetX;
  const y = cam.offsetY;

  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, withAlpha(SUMMIT_RGB, 0.3 * cer.warp));
  g.addColorStop(0.45, withAlpha(SUMMIT_RGB, 0.1 * cer.warp));
  g.addColorStop(1, withAlpha(SUMMIT_RGB, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // A green afterglow at the bottom, where the line the ship just crossed is
  // receding. It is the two colours overlapping for a moment rather than one
  // cutting to the other, which is what makes the crossing feel continuous.
  if (cer.warp < 1) {
    const fade = 1 - cer.warp;
    const gg = ctx.createLinearGradient(0, y + h, 0, y + h * 0.55);
    gg.addColorStop(0, withAlpha(FINISH, 0.28 * fade));
    gg.addColorStop(1, withAlpha(FINISH, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
