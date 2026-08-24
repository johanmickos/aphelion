/**
 * The wall's verdict, in one slot beside the ship, over three beats.
 *
 * ONE THING, and it took three tries to get there. A rescue had a badge for the
 * recovery (SAFE) and a badge for the press that dared it (Nice!), and both were
 * cut on sight — "it's too crowded and the anticipation is fun", then "the 'nice!'
 * is a bit cluttered". Both readings are right, and together they say something
 * this file should not forget: the good news does not need a badge. The scar
 * already says where the line is and the flames say you are on it, so announcing
 * the outcome the instant it resolves spends the two seconds the game is at its
 * most tense.
 *
 * What replaced the praise is not a label at all: the CROSS ITSELF brightens and
 * thickens as the ship closes on it, the way the compass rings do as the sweep
 * lines up. See `src/render/scar.ts`. An instrument reacting is worth more than a
 * word about the instrument.
 *
 * So the slot says only the thing nothing else can: a death that has not happened
 * yet. There is no award for being doomed.
 *
 * WHY THEY LIVE HERE AND NOT IN THE POPUPS. They were a praise word for one
 * session, an `escape` axis in `praise.ts` drawn in the burn's ember, and it was
 * withdrawn: "we already have the point reward from going through flames". The
 * burn pays for the fire and names it; a second word about the same fire in the
 * same second was the vocabulary arguing with itself. These say something the
 * points do not — whether you are still alive — and they say it at the ship
 * rather than on the score.
 *
 * ON THE SIDE AWAY FROM THE BOUNDARY, so none of them draws over the hazard gradient
 * or the receding scar — both red, both already in that space — and so the mark
 * sits where an escape would be.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { ScoreState } from '../score/types.ts';
import type { ScarWall } from '../sim/rescue.ts';

/** Design units from the ship the verdict sits at. */
const OFFSET = 24;
/**
 * Which way is "away from the boundary", per wall it could be.
 *
 * A unit direction rather than the old `-side` on x, because the ceiling's answer
 * is on the other axis. Down-screen is +y, so fleeing the ceiling is +1 there.
 */
const DOOM_AWAY: Record<ScarWall, { x: number; y: number }> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  top: { x: 0, y: 1 },
};
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
 * Draw the skull, if one is owed.
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
  if (!doom) return;
  const age = ageOf(doom);
  if (age < 0) return;

  const alpha = rcfg.doomAlpha * (0.45 + 0.55 * beat((age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the boundary it is about to cross, so the mark never sits between
  // the ship and the thing about to kill it: beside the ship at a side wall,
  // below it at the ceiling.
  const away = DOOM_AWAY[doom.wall];
  const x = toScreenX(cam, snap.x + away.x * OFFSET);
  const y = toScreenY(cam, snap.y + away.y * OFFSET);

  ctx.save();
  skull(ctx, x, y, R * s, alpha);
  ctx.restore();
}
