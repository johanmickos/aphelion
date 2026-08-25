/**
 * The wall's verdict, in one slot beside the ship, over three beats.
 *
 * ONE THING, and it took three tries to get there. A rescue had a badge for the
 * recovery (SAFE) and a badge for the press that dared it (Nice!), and both were
 * cut on sight — "it's too crowded and the anticipation is fun", then "the 'nice!'
 * is a bit cluttered". Both readings are right, and together they say something
 * this file should not forget: the good news does not need a badge. The deadline
 * already says where the line is and the flames say you are on it, so announcing
 * the outcome the instant it resolves spends the two seconds the game is at its
 * most tense.
 *
 * What replaced the praise is not a label at all: the DEADLINE'S OWN DOT lifts
 * where the press landed, brighter the closer to the cross it was. See
 * `src/render/deadline.ts`. An instrument reacting is worth more than a word
 * about the instrument.
 *
 * It used to brighten continuously as the ship closed, the way the compass rings
 * do as the sweep lines up, and that was cut: the track is anchored to the ship,
 * so its length already says how close you are, and a second channel restating
 * the first is how an instrument turns back into a smear.
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
 * ON THE SIDE AWAY FROM THE BOUNDARY, so none of them draws over the hazard
 * gradient or the deadline's track — both red, both already in that space — and
 * so the mark sits where an escape would be. The deadline no longer leaves
 * anything receding behind the ship, but the track ahead of it is still there and
 * still in the way.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { DeadlineWall } from '../sim/rescue.ts';
import { HAZARD, withAlpha } from './palette.ts';
import { hypot } from '../sim/orbit.ts';

/** Design units from the ship the verdict sits at. */
const OFFSET = 24;
/**
 * Which way is "away from the boundary", per wall it could be.
 *
 * A unit direction rather than the old `-side` on x, because the ceiling's answer
 * is on the other axis. Down-screen is +y, so fleeing the ceiling is +1 there.
 */
const DOOM_AWAY: Record<DeadlineWall, { x: number; y: number }> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  top: { x: 0, y: 1 },
};
/**
 * Seconds per pulse. The fuel warning's own rate, so every badge beats alike.
 */
const PULSE_SEC = 0.36;

/**
 * Sharp in, slow out. A heartbeat rather than a sine, which at this size reads as
 * urgency where a smooth swell reads as breathing.
 */
function beat(phase: number): number {
  return phase < 0.22 ? phase / 0.22 : 1 - (phase - 0.22) / 0.78;
}

/**
 * How far below centre the bones cross, in units of `r`.
 *
 * They used to cross THROUGH the cranium, and the problem was not the geometry —
 * it was the compositing. Bones and skull were two separate fills at the same
 * alpha, so every overlapping pixel came out at `1-(1-a)²` and the crossing read
 * brighter than either shape. Reported as "the crossbones and the skull overlay
 * in intensity".
 *
 * Both halves of that are fixed here, and the order matters: the single-path fill
 * below is what makes the intensity uniform, and this is what makes the
 * SILHOUETTE legible — bones behind a jaw are a shape, bones through a cranium
 * are a scribble at 11px.
 */
const BONE_DROP = 0.46;

/**
 * Append one bone to the current path: a shaft, and two lobes at each end.
 *
 * APPENDS RATHER THAN DRAWS, which is the whole technique. Every piece of this
 * glyph goes into one path and is filled once, so overlapping pieces fill exactly
 * once — a stroked bone and a filled skull could not do that, however carefully
 * they were placed.
 */
function bonePath(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  k: number,
): void {
  let dx = x1 - x0;
  let dy = y1 - y0;
  const len = hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const nx = -dy;
  const ny = dx;
  ctx.moveTo(x0 + nx * w, y0 + ny * w);
  ctx.lineTo(x1 + nx * w, y1 + ny * w);
  ctx.lineTo(x1 - nx * w, y1 - ny * w);
  ctx.lineTo(x0 - nx * w, y0 - ny * w);
  ctx.closePath();
  for (const [ex, ey] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    for (const side of [1, -1] as const) {
      const cx = ex + nx * k * side;
      const cy = ey + ny * k * side;
      // `moveTo` the arc's start, or the subpath draws a spoke in from the last
      // point and the lobe fills as a wedge.
      ctx.moveTo(cx + k, cy);
      ctx.arc(cx, cy, k, 0, Math.PI * 2);
    }
  }
}

/**
 * The death's-head, over crossed bones.
 *
 * DRAWN FOR ELEVEN PIXELS, which is the only design constraint that mattered.
 * The shape this replaced was described as "a bit bubbly and not immediately
 * recognisable as death", and the cause was feature count rather than proportion:
 * a round cranium, two small sockets, a nose and a tooth gap is five things
 * inside a glyph the size of a word's letter. This spends the pixels on fewer,
 * larger ones.
 *
 * THE SLANT IS THE WHOLE TRICK. Each socket's TOP edge runs downward toward the
 * nose, which is the difference between a skull and an angry one — it reads as a
 * brow. Everything else is silhouette: a flat crown, a cheekbone, a hard notch
 * under it, and a jaw tapered inward.
 *
 * ONE PATH, ONE FILL. Bones, cranium and jaw all append to a single path and are
 * filled once, so no overlap ever composites twice. Alpha is therefore uniform
 * across the whole mark whatever the pieces do, which is what a pulsing glyph
 * needs — the alternative was a mark whose crossing point flashed brighter than
 * its own head.
 */
function skull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  ctx.fillStyle = withAlpha(HAZARD, alpha);
  ctx.beginPath();

  // ---- the bones, behind and below
  const by = y + r * BONE_DROP;
  const L = r * 1.2;
  for (const d of [1, -1] as const) {
    bonePath(ctx, x - L * d, by + r * 0.62, x + L * d, by - r * 0.62, r * 0.12, r * 0.19);
  }

  // ---- cranium and jaw
  const w = r * 1.04;
  const top = y - r * 0.95;
  const cheek = y + r * 0.16;
  ctx.moveTo(x - w, top + r * 0.4);
  ctx.quadraticCurveTo(x - w * 0.98, top - r * 0.14, x - w * 0.36, top - r * 0.16);
  ctx.lineTo(x + w * 0.36, top - r * 0.16);
  ctx.quadraticCurveTo(x + w * 0.98, top - r * 0.14, x + w, top + r * 0.4);
  ctx.lineTo(x + w * 0.94, cheek);
  ctx.lineTo(x + w * 0.44, cheek + r * 0.26);
  ctx.lineTo(x + w * 0.4, cheek + r * 0.82);
  ctx.lineTo(x - w * 0.4, cheek + r * 0.82);
  ctx.lineTo(x - w * 0.44, cheek + r * 0.26);
  ctx.lineTo(x - w * 0.94, cheek);
  ctx.closePath();

  ctx.fill();

  // ---- the voids, punched back out to the sky
  //
  // Punched rather than filled dark, so the holes read against whatever is behind
  // the ship instead of against an assumption about it. Two sockets, one nose,
  // one jaw gap — and nothing else, because a tooth row at this size is a smudge.
  ctx.globalCompositeOperation = 'destination-out';
  const sy = y - r * 0.2;
  for (const d of [-1, 1] as const) {
    const sx = x + d * r * 0.47;
    ctx.beginPath();
    ctx.moveTo(sx - d * r * 0.25, sy - r * 0.3);
    ctx.lineTo(sx + d * r * 0.24, sy - r * 0.1);
    ctx.lineTo(sx + d * r * 0.16, sy + r * 0.26);
    ctx.lineTo(sx - d * r * 0.22, sy + r * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.16);
  ctx.lineTo(x + r * 0.15, y + r * 0.44);
  ctx.lineTo(x - r * 0.15, y + r * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - r * 0.08, cheek + r * 0.34, r * 0.16, r * 0.48);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * What the skull is owed for: a wall ahead, and no press left that reaches it.
 *
 * ONE MEANING, TWO STATES, and they are disjoint by construction — which is why
 * this is a single type rather than a flag with two sources that could disagree.
 *
 *  - DRIFTING, the common case. `rescueDeadline` finds a wall inside its horizon
 *    and no press along the way still turns the ship: `Deadline.fated`.
 *  - CAPTURED, after a press that came too late: `ScoreState.doomed`, armed on
 *    the first tick of the capture.
 *
 * They cannot both be true: `rescueDeadline` returns null while captured (the
 * escape from a capture is a release, not a grab), and `doomed` exists only
 * during one. That is also why BOTH are needed. Dropping the captured half would
 * make the skull vanish on the very press that sealed the run — the player panics,
 * presses, and the death mark disappears, which reads as a save.
 *
 * `age` is seconds and not a tick, because the two sources count differently: one
 * is a render-side clock advanced per frame, the other a tick stamped by the
 * scorer. Resolving that at the seam leaves this file with a single input.
 */
export interface Doom {
  wall: DeadlineWall;
  /** Seconds since it became true, for the pulse phase. */
  age: number;
}

/**
 * Draw the skull, if one is owed.
 *
 * A pure function of its arguments — it holds no state, because the only thing it
 * would have to remember is a phase, and `age` already carries one from a clock
 * that stops when the game does. `fuel-warning.ts` keeps state because it counts
 * pulses from a transition it has to detect itself; this arrives resolved.
 */
export function drawVerdict(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  doom: Doom | null,
): void {
  // Nothing during the ending hold: the `LOST — OFF COURSE` notice is the
  // explanation from there, and a countdown that continues past the thing it was
  // counting to is noise.
  if (snap.ending.active) return;
  if (!doom || doom.age < 0) return;

  const alpha = rcfg.doomAlpha * (0.45 + 0.55 * beat((doom.age % PULSE_SEC) / PULSE_SEC));

  const s = cam.scale;
  // Away from the boundary it is about to cross, so the mark never sits between
  // the ship and the thing about to kill it: beside the ship at a side wall,
  // below it at the ceiling.
  const away = DOOM_AWAY[doom.wall];
  const x = toScreenX(cam, snap.x + away.x * OFFSET);
  const y = toScreenY(cam, snap.y + away.y * OFFSET);

  ctx.save();
  skull(ctx, x, y, rcfg.doomR * s, alpha);
  ctx.restore();
}
