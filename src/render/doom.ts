/**
 * The skull: you pressed after the last press that could have saved you.
 *
 * The scar draws where the deadline IS; this says you are past it. Between them
 * they answer the playtest's worst moment — a run ending `LOST — OFF COURSE` with
 * full fuel and two planets on screen, where "from the player's seat the failure
 * reads as arbitrary". The cross recedes behind the ship and the skull names what
 * that means, in the second or so before the wall.
 *
 * WHY THIS TRIGGER AND NOT "HOLDING WILL KILL YOU". Both were measured against
 * every death in the corpus. A press made past the cross is fatal 94% of the
 * time, precedes 43% of deaths, and gives a median 0.85s of warning. The live
 * "holding from here ends the run" test catches a different 37% at a similar
 * lead, but it was true and then recovered 141 times against 94 real deaths —
 * because RELEASING is the escape, so it is right about the hold and wrong about
 * the fate. A death's-head that is wrong more often than right teaches the player
 * to ignore it, so it is not the trigger. That test would make a good "let go"
 * cue, which is a different cue.
 *
 * WHY IT MAY STAND RATHER THAN FLASH. `fuel-warning.ts` argues, correctly, that a
 * permanent badge beside the ship becomes part of the ship's silhouette — it was
 * measured riding along for 4.7% of a session. This one cannot: it lives a median
 * 0.85s and p90 1.72s, appears about 1.7 times a session, and all but 6% of the
 * time the thing that ends it is the run ending. It is a countdown, not a status.
 *
 * ON THE SIDE AWAY FROM THE WALL, so it never draws over the hazard gradient or
 * over the receding scar — both of which are red and both of which are already in
 * that space — and so the one thing on screen that is not the wall is on the side
 * any escape would be.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { ScoreState } from '../score/types.ts';

/** Design units to the side of the ship the skull sits at. */
const OFFSET = 24;
/** Cranium radius, in design units. */
const R = 6.2;
/** Seconds per pulse. The fuel warning's own rate, so the two cues beat alike. */
const PULSE_SEC = 0.36;

/**
 * Draw the skull, if one is owed.
 *
 * A pure function of the snapshot and the score — it holds no state, because the
 * only thing it would have to remember is a phase, and the tick is already a
 * clock that stops when the game does. `fuel-warning.ts` keeps state because it
 * counts a fixed number of pulses from a transition; this one beats for as long
 * as it is owed, which needs nothing kept.
 */
export function drawDoom(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  score: ScoreState,
): void {
  const doom = score.doomed;
  if (!doom || snap.ending.active) return;

  // Ticks, not milliseconds: the pulse then freezes with the simulation, the way
  // the popups do behind an overlay, and a replay of a report beats identically.
  const age = (snap.tick - doom.tick) * rcfg.doomTickSecs;
  if (age < 0) return;
  const phase = (age % PULSE_SEC) / PULSE_SEC;
  // Sharp in, slow out: a heartbeat rather than a sine, which reads as urgency at
  // this size where a smooth swell reads as breathing.
  const beat = phase < 0.22 ? phase / 0.22 : 1 - (phase - 0.22) / 0.78;
  const alpha = rcfg.doomAlpha * (0.45 + 0.55 * beat);

  const s = cam.scale;
  // Away from the wall it is about to hit: side is +1 for the right boundary.
  const x = toScreenX(cam, snap.x - doom.side * OFFSET);
  const y = toScreenY(cam, snap.y);
  const r = R * s;

  ctx.save();
  ctx.fillStyle = `rgba(255,70,90,${alpha})`;

  // Cranium, drawn as one filled path with the jaw hanging off it so the whole
  // glyph is a single silhouette rather than a stack of shapes that can separate
  // at small sizes.
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

  // The sockets and the nose, punched back out to the sky. `destination-out`
  // rather than a dark fill, so the holes read against whatever is behind the
  // ship instead of against an assumption about it.
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
  // Two teeth, cut from the jaw.
  ctx.fillRect(x - r * 0.06, y + r * 0.72, r * 0.12, r * 0.3);
  ctx.restore();
}
