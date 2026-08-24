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
import type { RenderSnapshot } from './snapshot.ts';
import { FINISH, SUMMIT_RGB, withAlpha } from './palette.ts';

/**
 * Seconds spent COASTING before the warp begins.
 *
 * THE FINISH LINE HAS TO LEAVE. The first version started stretching the stars on
 * the tick the ship crossed, which meant the chequers — the thing the whole
 * runway was built to deliver the player to — were replaced before they could be
 * looked at. Reported as "the transition from finish line to the starfield is too
 * fast". So the ceremony now opens by simply flying on: the world recedes, the
 * line slides off the bottom of the screen, and only once it is gone does
 * anything else happen.
 */
const COAST = 1.35;

/**
 * How far the world falls away during the coast, in design units.
 *
 * Sized to carry the line off the bottom from anywhere it can be crossed. The
 * design window is 844 tall and the ship crosses somewhere in its upper half, so
 * a shade over one screen height clears it with margin at every camera position.
 */
const COAST_DIST = 900;

/**
 * Seconds from the end of the coast to full warp.
 *
 * Slower than it was. The warp used to reach full stretch in 1.15s measured from
 * the crossing itself, which arrived while the player was still reading the line;
 * it now starts after the coast and takes longer to get there, so the sky opens
 * up rather than snapping.
 */
const SPOOL = 1.8;

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
export function ceremonyPhase(snap: RenderSnapshot): Ceremony | null {
  if (!snap.ending.active || snap.ending.reason !== 'cleared') return null;
  const t = snap.ending.t;
  return {
    t,
    // Eased, so the coast decelerates into the warp instead of stopping dead at
    // the handover. The ship has just been accelerated by the funnel; a world
    // that halts the instant the timer says so would undo that in one frame.
    shift: COAST_DIST * ease(t / COAST),
    // Nothing until the line is gone.
    warp: ease((t - COAST) / SPOOL),
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
