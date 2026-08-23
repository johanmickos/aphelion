/**
 * The wall's verdict, in one slot beside the ship, over three beats.
 *
 *   Nice!   at the PRESS, if it was made very close to the last one that works
 *   SAFE    when the rescue pays, because you recovered
 *   skull   instead of either, when the press was already too late
 *
 * The two good ones are a sequence and not a choice: you dared, then you made it.
 * They land a median 0.38s apart, so the later simply takes the slot — SAFE is the
 * one that resolves the question, so it wins while it is running.
 *
 * WHY THEY LIVE HERE AND NOT IN THE POPUPS. They were a praise word for one
 * session, an `escape` axis in `praise.ts` drawn in the burn's ember, and it was
 * withdrawn: "we already have the point reward from going through flames". The
 * burn pays for the fire and names it; a second word about the same fire in the
 * same second was the vocabulary arguing with itself. These say something the
 * points do not — whether you are still alive — and they say it at the ship
 * rather than on the score.
 *
 * ON THE SIDE AWAY FROM THE WALL, so none of them draws over the hazard gradient
 * or the receding scar — both red, both already in that space — and so the mark
 * sits where an escape would be.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { ScoreState } from '../score/types.ts';

/** Design units to the side of the ship the verdict sits at. */
const OFFSET = 24;
/**
 * How long each word stays, in pulses.
 *
 * Nice! is the shorter of the two deliberately — it is a reaction to a press, and
 * SAFE is usually only 0.38s behind it. A long one would still be talking when the
 * answer arrives.
 */
const NICE_PULSES = 2;
const SAFE_PULSES = 3;
/** Label sizes in design units. Nice! is the smaller: it is an aside, not a verdict. */
const SAFE_SIZE = 9.5;
const NICE_SIZE = 8;
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
 * A short word beside the ship.
 *
 * Set in `600 ui-monospace` at the fuel warning's own label size, because that is
 * the other badge that speaks beside the ship and two badges that speak should not
 * be set in two typefaces.
 */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  s: number,
  size: number,
  color: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `600 ${size * s}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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

  // Ticks, not milliseconds: the pulse freezes with the simulation the way the
  // popups do behind an overlay, and a replay of a report beats identically.
  const ageOf = (at: { tick: number } | null): number =>
    at ? (snap.tick - at.tick) * rcfg.verdictTickSecs : -1;

  // Priority is the order the moments happen, in reverse: a doomed press is the
  // whole story if it happened, then the recovery that answers the question, then
  // the press that dared. Each is checked against its own lifetime, so an expired
  // one hands the slot back rather than holding it empty.
  const doom = score.doomed;
  const doomAge = ageOf(doom);
  const safeAge = ageOf(score.tight);
  const niceAge = ageOf(score.nice);

  let mark: { side: 1 | -1 } | null = null;
  let age = 0;
  let word: 'SAFE' | 'Nice!' | null = null;
  let size = 0;

  if (doom && doomAge >= 0) {
    mark = doom;
    age = doomAge;
  } else if (score.tight && safeAge >= 0 && safeAge <= SAFE_PULSES * PULSE_SEC) {
    mark = score.tight;
    age = safeAge;
    word = 'SAFE';
    size = SAFE_SIZE;
  } else if (score.nice && niceAge >= 0 && niceAge <= NICE_PULSES * PULSE_SEC) {
    mark = score.nice;
    age = niceAge;
    word = 'Nice!';
    size = NICE_SIZE;
  }
  if (!mark) return;

  const peak = word ? rcfg.tightAlpha : rcfg.doomAlpha;
  const alpha = peak * (0.45 + 0.55 * beat((age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the wall it is about to hit; `side` is +1 for the right boundary.
  const x = toScreenX(cam, snap.x - mark.side * OFFSET);
  const y = toScreenY(cam, snap.y);

  ctx.save();
  if (word) label(ctx, word, x, y, s, size, rcfg.safeColor, alpha);
  else skull(ctx, x, y, R * s, alpha);
  ctx.restore();
}
