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
import type { RenderConfig } from './config.ts';
import type { DeadlineWall } from '../sim/rescue.ts';
import { HAZARD, HAZARD_WARN } from './palette.ts';
import type { WarningLight } from './warnings.ts';

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

/** Design units wide the skull draws. Height is the panel's row. */
const GLYPH_W = 16;

/**
 * The death's-head, in three features.
 *
 * IT HAS BEEN DRAWN FOUR TIMES AND THIS IS THE FIRST ONE THAT IS NOT A DRAWING
 * PROBLEM. The versions before it were bare red on whatever happened to be
 * behind them, at 11px, on a moving ship, over a wake — and every attempt to fix
 * that added detail, which at that size subtracts legibility. The verdicts, in
 * order: "a bit bubbly and not immediately recognisable as death", then "too
 * blocky/bulky, and near impossible to tell what it is due to the busy overlap of
 * bones".
 *
 * What actually fixed it was not the path. It was the panel: a plate to sit on, a
 * fixed place to sit, and a word beside it. POSITION AND CONTEXT CARRY THE
 * IDENTITY NOW, so the glyph does not have to — which is exactly why a car's oil
 * light can be an unreadable squiggle and still be understood instantly.
 *
 * So it is three features and nothing else: a cranium, and two sockets whose top
 * edge slants down toward the nose. That slant is the only thing making it read
 * as a skull rather than a lozenge, and it is the last detail worth spending
 * pixels on. The crossbones, the nose and the tooth gap are all gone.
 *
 * THE VOIDS ARE FILLED, NOT PUNCHED. They used to use `destination-out`, which
 * erased the game behind the badge rather than the badge itself — and cannot work
 * at all once there is a plate underneath to erase too. Filling them in the
 * plate's own colour is both correct and simpler.
 */
function skull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  plate: string,
): void {
  const cx = x + w / 2;
  const r = w / 2;
  const top = y + h * 0.1;
  const cheek = y + h * 0.62;
  const bottom = y + h * 0.94;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r, top + r * 0.42);
  ctx.quadraticCurveTo(cx - r, top - r * 0.16, cx - r * 0.34, top - r * 0.16);
  ctx.lineTo(cx + r * 0.34, top - r * 0.16);
  ctx.quadraticCurveTo(cx + r, top - r * 0.16, cx + r, top + r * 0.42);
  ctx.lineTo(cx + r * 0.92, cheek);
  ctx.lineTo(cx + r * 0.42, cheek + (bottom - cheek) * 0.3);
  ctx.lineTo(cx + r * 0.38, bottom);
  ctx.lineTo(cx - r * 0.38, bottom);
  ctx.lineTo(cx - r * 0.42, cheek + (bottom - cheek) * 0.3);
  ctx.lineTo(cx - r * 0.92, cheek);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = plate;
  const sy = top + r * 0.62;
  for (const d of [-1, 1] as const) {
    const sx = cx + d * r * 0.44;
    ctx.beginPath();
    ctx.moveTo(sx - d * r * 0.28, sy - r * 0.3);
    ctx.lineTo(sx + d * r * 0.26, sy - r * 0.06);
    ctx.lineTo(sx + d * r * 0.17, sy + r * 0.34);
    ctx.lineTo(sx - d * r * 0.25, sy + r * 0.28);
    ctx.closePath();
    ctx.fill();
  }
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
 * The word beside the skull.
 *
 * MEASURED BEFORE IT WAS CHOSEN, because the obvious words all overclaim. The
 * condition is "no single press-and-hold from here turns the ship away" — it does
 * not consider releasing and grabbing a DIFFERENT body, which is a real escape
 * the player has and the projection never tries. So the light is a strong
 * prediction rather than a fact: over the corpus the drifting half is followed by
 * an out-of-bounds ending 95% of the time, and the captured half 134 times out of
 * 135.
 *
 * A DISTRESS CALL RATHER THAN A VERDICT, which is both shorter to read and more
 * honest than the alternatives. `DOOMED` and `LOST` are both claims about the
 * outcome, and at 95% neither is quite entitled to one — and `LOST` would have
 * merely repeated the ending notice, which already says `LOST — BURNED UP` two
 * thirds of the time. `SOS` asserts nothing except that the ship is in trouble,
 * which is exactly what is known.
 *
 * Three characters also means the badge stays narrow enough to read at a glance,
 * which is the whole reason a dashboard light has a word at all.
 *
 * Exported so the pins read it rather than repeating the literal — two copies of
 * one string is how a rename leaves a test asserting the old one.
 */
export const DOOM_WORD = 'SOS';

/**
 * The doom light, or null when none is owed.
 *
 * A pure function of its arguments — it holds no state, because the only thing it
 * would have to remember is a phase, and `age` already carries one from a clock
 * that stops when the game does.
 *
 * NO LONGER DRAWS ITSELF. It used to place a mark at `OFFSET` design units on the
 * "away from the boundary" axis, which is the same direction as the wake for
 * every wall — so it was drawn over the ship's trail every single time. It is a
 * row in `warnings.ts` now, and where a row goes is the panel's business.
 */
export function doomLight(rcfg: RenderConfig, doom: Doom | null): WarningLight | null {
  if (!doom || doom.age < 0) return null;
  const alpha = rcfg.doomAlpha * (0.45 + 0.55 * beat((doom.age % PULSE_SEC) / PULSE_SEC));
  if (alpha <= 0.004) return null;
  return {
    kind: 'doom',
    alpha,
    color: HAZARD_WARN,
    word: DOOM_WORD,
    glyphW: GLYPH_W,
    glyph: (ctx, x, y, w, h, _s, plate) =>
      skull(ctx, x, y, w, h, `rgb(${HAZARD[0]},${HAZARD[1]},${HAZARD[2]})`, plate),
  };
}
