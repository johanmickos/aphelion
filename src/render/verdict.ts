/**
 * The skull: you pressed after the last press that could have saved you.
 *
 * It had a positive twin for a while — first a spark, then the word SAFE — for a
 * rescue that came back out of the fire. Both are gone, and where that went is
 * worth recording: the confirmation moved to the POPUP, as a praise word on the
 * rescue award, beside the points it is confirming. Asked for as "a small red
 * verbal confirmation ... just like we do for tight planetary captures and exits",
 * which is exactly what the popup words are. Two announcements of one event, one
 * beside the ship and one above it, was one too many — the playtest already found
 * three awards inside a second unreadable.
 *
 * So the badge says only the thing the popups cannot: a death that has not
 * happened yet. There is no award for being doomed.
 *
 * ON THE SIDE AWAY FROM THE WALL, so it never draws over the hazard gradient or
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
  if (!doom) return;

  // Ticks, not milliseconds: the pulse freezes with the simulation the way the
  // popups do behind an overlay, and a replay of a report beats identically.
  const age = (snap.tick - doom.tick) * rcfg.verdictTickSecs;
  if (age < 0) return;

  const alpha = rcfg.doomAlpha * (0.45 + 0.55 * beat((age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the wall it is about to hit; `side` is +1 for the right boundary.
  const x = toScreenX(cam, snap.x - doom.side * OFFSET);
  const y = toScreenY(cam, snap.y);

  ctx.save();
  skull(ctx, x, y, R * s, alpha);
  ctx.restore();
}
