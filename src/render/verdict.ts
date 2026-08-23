/**
 * The wall's verdict on a press: the skull, or the spark.
 *
 * One slot beside the ship, two things it can say, and they are mutually
 * exclusive by construction — the skull is owed for a press made past the last
 * chance, the spark for a rescue that came back out of the fire. On the 6% of
 * doomed presses that turn away anyway both are true in sequence: `score.doomed`
 * clears on the very tick `score.tight` is set, so the slot changes its mind at
 * the moment the ship does.
 *
 * WHY A SLOT AND NOT TWO. `fuel-warning.ts` owns the space below the ship and the
 * popups own the lane above it, so there is one place left. Putting both verdicts
 * in it is also the honest layout: they answer the same question.
 *
 * ON THE SIDE AWAY FROM THE WALL, so neither draws over the hazard gradient or
 * the receding scar — both red, both already in that space — and so the mark sits
 * where an escape would be.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { ScoreState } from '../score/types.ts';

/** Design units to the side of the ship the verdict sits at. */
const OFFSET = 24;
/** Cranium radius, in design units. */
const R = 6.2;
/** Seconds per pulse. The fuel warning's own rate, so every badge beats alike. */
const PULSE_SEC = 0.36;
/**
 * Pulses the spark gets before it is gone.
 *
 * The skull needs no count — it beats until the wall arrives, which is a median
 * 0.85s away. The spark has no such deadline to end it, so it borrows the fuel
 * warning's three, which is what a flash looks like when it is a flash and not a
 * status.
 */
const SPARK_PULSES = 3;

/**
 * Sharp in, slow out. A heartbeat rather than a sine, which at this size reads as
 * urgency where a smooth swell reads as breathing.
 */
function beat(phase: number): number {
  return phase < 0.22 ? phase / 0.22 : 1 - (phase - 0.22) / 0.78;
}

/** The death's-head: filled silhouette, holes punched back out to the sky. */
function skull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  ctx.fillStyle = `rgba(255,70,90,${alpha})`;
  // One filled path with the jaw hanging off it, so the glyph is a single
  // silhouette rather than a stack of shapes that can separate at small sizes.
  ctx.beginPath();
  ctx.arc(x, y - r * 0.16, r, Math.PI * 0.86, Math.PI * 0.14);
  ctx.lineTo(x + r * 0.52, y + r * 0.72);
  ctx.lineTo(x + r * 0.3, y + r * 0.72);
  ctx.lineTo(x + r * 0.3, y + r * 1.02);
  ctx.lineTo(x - r * 0.3, y + r * 1.02);
  ctx.lineTo(x - r * 0.3, y + r * 0.72);
  ctx.lineTo(x - r * 0.52, y + r * 0.72);
  ctx.closePath();
  ctx.fill();

  // Sockets and nose, punched out rather than filled dark, so the holes read
  // against whatever is behind the ship instead of against an assumption about it.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.42, y - r * 0.2, r * 0.28, r * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.42, y - r * 0.2, r * 0.28, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.1);
  ctx.lineTo(x + r * 0.17, y + r * 0.44);
  ctx.lineTo(x - r * 0.17, y + r * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - r * 0.06, y + r * 0.72, r * 0.12, r * 0.3);
}

/**
 * The spark: you came back out of the fire.
 *
 * Four tapered points, which is the SCAR'S OWN GEOMETRY — its crossbar and arm
 * are two crossed spindles tapering to nothing, and this is the same construction
 * stood upright. The resemblance is the point: the mark you were aiming at,
 * flashing back at you. Longer points and a bright core keep it from being
 * mistaken for a small scar.
 *
 * COLOURLESS, and that is the whole colour reasoning. Every hue in the frame is
 * already spoken for — red is the wall, `#ee3f2c` is fire, purple is an anomaly,
 * and the rarity ladder owns "how good" for text. Note 51 found the remaining
 * channel the hard way: a near-white is recessive because it has NO hue, which
 * leaves lightness free to be whatever legibility wants. A red spark would say
 * danger and an ember one would say burning, when what this says is neither.
 */
function spark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  ctx.fillStyle = `rgba(232,240,255,${alpha})`;
  const long = r * 1.7;
  const short = r * 0.34;
  ctx.beginPath();
  ctx.moveTo(x, y - long);
  ctx.lineTo(x + short, y - short);
  ctx.lineTo(x + long, y);
  ctx.lineTo(x + short, y + short);
  ctx.lineTo(x, y + long);
  ctx.lineTo(x - short, y + short);
  ctx.lineTo(x - long, y);
  ctx.lineTo(x - short, y - short);
  ctx.closePath();
  ctx.fill();
  // A core, so the middle does not read as a hole where the four points meet.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw whichever verdict is owed, if either.
 *
 * A pure function of the snapshot and the score — it holds no state, because the
 * only thing it would have to remember is a phase, and the tick is already a clock
 * that stops when the game does. `fuel-warning.ts` keeps state because it counts
 * pulses from a transition it has to detect itself; both of these arrive with the
 * tick they started on.
 */
export function drawVerdict(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  score: ScoreState,
): void {
  // Nothing during the ending hold: the `LOST — OFF COURSE` notice is the
  // explanation from there, and a countdown that continues past the thing it was
  // counting to is noise.
  if (snap.ending.active) return;

  const doom = score.doomed;
  const tight = score.tight;
  if (!doom && !tight) return;

  // Ticks, not milliseconds: the pulse freezes with the simulation the way the
  // popups do behind an overlay, and a replay of a report beats identically.
  const startTick = doom ? doom.tick : tight!.tick;
  const age = (snap.tick - startTick) * rcfg.verdictTickSecs;
  if (age < 0) return;
  if (!doom && age > SPARK_PULSES * PULSE_SEC) return;

  const alpha =
    (doom ? rcfg.doomAlpha : rcfg.tightAlpha) * (0.45 + 0.55 * beat((age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the wall it was about to hit; `side` is +1 for the right boundary.
  // The spark has no side of its own — it is the same verdict slot, so it takes
  // the side of the wall the rescue was from.
  const side = doom ? doom.side : tight!.side;
  const x = toScreenX(cam, snap.x - side * OFFSET);
  const y = toScreenY(cam, snap.y);

  ctx.save();
  if (doom) skull(ctx, x, y, R * s, alpha);
  else spark(ctx, x, y, R * s, alpha);
  ctx.restore();
}
