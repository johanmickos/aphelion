/**
 * The wall's verdict on a press: the skull, or SAFE.
 *
 * One slot beside the ship, two things it can say, and they are mutually
 * exclusive by construction — the skull is owed for a press made past the last
 * chance, SAFE for a rescue that came back out of the fire. On the 6% of
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
/** Size of the SAFE label, matching `fuel-warning.ts`'s own. */
const LABEL_SIZE = 9.5;
/** Seconds per pulse. The fuel warning's own rate, so every badge beats alike. */
const PULSE_SEC = 0.36;
/**
 * Pulses SAFE gets before it is gone.
 *
 * The skull needs no count — it beats until the wall arrives, which is a median
 * 0.85s away. This has no such deadline to end it, so it borrows the fuel
 * warning's three, which is what a flash looks like when it is a flash and not a
 * status.
 */
const SAFE_PULSES = 3;

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
 * SAFE: you came back out of the fire.
 *
 * It was a glyph first — four tapered points borrowing the scar's own crossed
 * spindles, on the theory that the mark you aimed at should flash back at you.
 * Reported immediately as "the spark isn't intuitive enough. I think it should
 * say 'safe'", and the fix is not to add a caption to it. `accolade.ts` records
 * the rule: a vocabulary that needs a caption is a vocabulary that has not been
 * chosen carefully enough. A spark that has to be labelled SAFE is a spark that
 * was not saying SAFE, so the label became the whole mark.
 *
 * WHY THE SKULL DOES NOT NEED THE SAME TREATMENT, since the pair now mixes a
 * glyph and a word: a skull already means what it means, to everyone, with no
 * game to learn it in. There is no equivalent universal sign for "you got away
 * with it" — which is exactly what the first attempt discovered.
 *
 * COLOURLESS, and that is the whole colour reasoning. Every hue in the frame is
 * spoken for — red is the wall, `#ee3f2c` is fire, purple is an anomaly, and the
 * rarity ladder owns "how good" for text. Note 51 found the remaining channel the
 * hard way: a near-white is recessive because it has NO hue, which leaves
 * lightness free to be whatever legibility wants. Red would say danger and ember
 * would say burning; this says neither.
 *
 * `600 ui-monospace` at the fuel warning's own label size, because that is the
 * other badge that speaks beside the ship and two badges that speak should not be
 * set in two typefaces.
 */
function safe(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
  ctx.fillStyle = `rgba(232,240,255,${alpha})`;
  ctx.font = `600 ${LABEL_SIZE * s}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SAFE', x, y);
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

  const doom = score.doomed;
  const tight = score.tight;
  if (!doom && !tight) return;

  // Ticks, not milliseconds: the pulse freezes with the simulation the way the
  // popups do behind an overlay, and a replay of a report beats identically.
  const startTick = doom ? doom.tick : tight!.tick;
  const age = (snap.tick - startTick) * rcfg.verdictTickSecs;
  if (age < 0) return;
  if (!doom && age > SAFE_PULSES * PULSE_SEC) return;

  const alpha =
    (doom ? rcfg.doomAlpha : rcfg.tightAlpha) * (0.45 + 0.55 * beat((age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the wall it was about to hit; `side` is +1 for the right boundary.
  // Both verdicts take the side of the wall they are about: it is one slot, and a
  // mark that moved between them would read as two different badges.
  const side = doom ? doom.side : tight!.side;
  const x = toScreenX(cam, snap.x - side * OFFSET);
  const y = toScreenY(cam, snap.y);

  ctx.save();
  if (doom) skull(ctx, x, y, R * s, alpha);
  else safe(ctx, x, y, s, alpha);
  ctx.restore();
}
