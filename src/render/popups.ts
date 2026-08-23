/**
 * Floating score popups — the points, and the word, next to the ship.
 *
 * A number that only ticks up in the corner teaches nothing about which release
 * was the good one. These rise from where the thing actually happened, so the
 * feedback lands on the act rather than on the scoreboard.
 *
 * Ages in seconds off the frame delta rather than by simulation tick, unlike the
 * score band in `hud.ts`. The two want different things: the band holds one award
 * long enough to read and must not expire while the game is paused, whereas these
 * are motion, and motion quantised to 60Hz on a 120Hz screen is visibly steppy
 * next to a ship that interpolates. The pause case is handled by simply not
 * advancing them — see `Scene.draw`.
 */
import type { Praise, ScoreAward, Shout } from '../score/index.ts';
import { praiseFor } from '../score/index.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import { formatScore } from './hud.ts';

/** Seconds a popup lives. The superlative lingers, because it is rare. */
const LIFE = 1.15;
const LIFE_SUPER = 1.6;
const LIFE_SHOUT = 1.4;
/**
 * A burn lives longer than it burns, because its number has to count.
 *
 * Long enough that the roll-up below finishes well before the fade starts: the
 * fade takes the last 45% of the life, so at 1.7s it begins at 0.94s and the roll
 * lands at 0.8s.
 */
const LIFE_BURN = 1.7;

/**
 * Seconds a burn's number spends counting up to its total.
 *
 * The flare itself is a flash — measured over 760 real ones, the median lasts
 * 0.17s and the longest on record 0.37s, and that is not a length a tally can be
 * read at. Widening the hot zone does not help: the speed term bounds the flare,
 * not the altitude, so tripling the zone moved the median from 0.17s to 0.18s.
 *
 * So the fire stays honest and the READOUT is what lingers. The points are
 * settled the instant the flame dies — this rolls a number that is already
 * decided, it does not keep earning.
 */
const ROLL = 0.8;

/** World units risen over a full life. */
const RISE = 34;
/**
 * World units above the ship a popup starts at.
 *
 * Without it the first few frames draw the word straight through the sprite —
 * measured at 3px from the ship centre on a real release, and the ship is 13px
 * across. The rise clears it quickly, but "quickly" is exactly the moment the
 * player is looking.
 */
const SPAWN_LIFT = 22;
/** Fraction of the life spent fading, measured from the end. */
const FADE = 0.45;

/**
 * Never stack more than this many at once.
 *
 * Chained captures can land two awards within a few ticks of each other, and a
 * pile of overlapping text next to the ship is worse feedback than one clear
 * line. The oldest goes.
 */
const MAX_LIVE = 4;

/**
 * World units between two popups that would otherwise be raised on the same spot.
 *
 * Capping the count was not enough: a grab award and a shout can land within a
 * few ticks of each other, and since every popup rises the same distance over its
 * life they then sat on top of each other for the whole of it — two legible lines
 * of text drawn through one another, which is worse than either alone.
 *
 * Bigger than the tallest word so the two lines cannot touch. Chosen at spawn
 * rather than maintained per frame, because the older popup is always further
 * along the same rise: the gap opens, it does not close.
 */
const STACK_GAP = 20;

/**
 * How near two popups have to be horizontally to count as the same spot.
 *
 * Everything is raised at the ship, so in practice this only separates popups
 * left over from a body the ship has since flown away from.
 */
const STACK_X = 80;

import { LEVEL, ROUTINE, SHOUT } from './accolade.ts';

function easeOutCubic(u: number): number {
  const k = 1 - u;
  return 1 - k * k * k;
}

interface Popup {
  x: number;
  y: number;
  t: number;
  life: number;
  /** Null for a shout, which is not about points at all. */
  points: number | null;
  praise: Praise | null;
  shout: string | null;
  /** Seconds the number spends counting up to `points`. 0 shows it at once. */
  roll: number;
}

export class Popups {
  private live: Popup[] = [];

  clear(): void {
    this.live = [];
  }

  /** For tests and for the HUD; not part of drawing. */
  count(): number {
    return this.live.length;
  }

  /**
   * Raise a popup for an award at a world position.
   *
   * The praise is classified here rather than passed in, so there is exactly one
   * answer to "what word did this release earn" and the replay tool and the game
   * cannot give different ones.
   */
  spawn(award: ScoreAward, x: number, y: number): void {
    const praise = praiseFor(award);
    const burning = award.kind === 'burn';
    this.live.push({
      x,
      y: this.freeY(x, y),
      t: 0,
      life: burning ? LIFE_BURN : praise?.category === 'super' ? LIFE_SUPER : LIFE,
      points: award.points,
      praise,
      shout: null,
      roll: burning ? ROLL : 0,
    });
    while (this.live.length > MAX_LIVE) this.live.shift();
  }

  /**
   * The height to raise a new popup from: the ship, or a clear slot above it if
   * something raised a moment ago is still sitting there.
   */
  private freeY(x: number, y: number): number {
    let cy = y - SPAWN_LIFT;
    for (let i = 0; i < MAX_LIVE; i++) {
      const taken = this.live.some(
        (p) => Math.abs(p.x - x) < STACK_X && Math.abs(p.y - cy) < STACK_GAP,
      );
      if (!taken) break;
      cy -= STACK_GAP;
    }
    return cy;
  }

  /**
   * Raise a reckless shout.
   *
   * Deliberately not routed through `spawn`: a shout has no points, no praise
   * category and no release behind it, and giving it a fake award to travel in
   * would be the first step toward the two channels quietly becoming one.
   */
  shout(shout: Shout, x: number, y: number): void {
    this.live.push({
      x,
      y: this.freeY(x, y),
      t: 0,
      life: LIFE_SHOUT,
      points: null,
      praise: null,
      shout: shout.word,
      roll: 0,
    });
    while (this.live.length > MAX_LIVE) this.live.shift();
  }

  update(dt: number): void {
    for (const p of this.live) p.t += dt;
    this.live = this.live.filter((p) => p.t < p.life);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (this.live.length === 0) return;
    const s = cam.scale;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    for (const p of this.live) {
      const u = p.t / p.life;
      // Decelerating rise: most of the travel happens early, so the popup leaves
      // the ship promptly and then hangs where it can be read.
      const risen = (1 - (1 - u) * (1 - u)) * RISE;
      const alpha = u > 1 - FADE ? Math.max(0, (1 - u) / FADE) : 1;
      const x = toScreenX(cam, p.x);
      const y = toScreenY(cam, p.y - risen);

      ctx.globalAlpha = alpha;

      if (p.shout) {
        // Drawn exactly as a praise word is: same weight, same rim, same rise.
        // Only the colour marks it as a different channel, and only the word
        // says what happened. It used to be 19px, rotated, and punching to 1.4x
        // on arrival — which made the one channel that pays nothing the loudest
        // thing on screen and, at that size, the hardest to read over anything
        // else in the air.
        ctx.font = `600 ${SHOUT.size * s}px ui-monospace, monospace`;
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.strokeText(p.shout, x, y);
        ctx.fillStyle = SHOUT.color;
        ctx.fillText(p.shout, x, y);
        continue;
      }

      const style = p.praise ? LEVEL[p.praise.level] : ROUTINE;

      if (p.praise) {
        // A brief overshoot on the way in. Only the top of the ladder gets it —
        // on an ordinary word it reads as a wobble rather than as emphasis.
        const pop = p.praise.level === 'exceptional' ? 1 + 0.35 * Math.max(0, 1 - u * 6) : 1;
        ctx.font = `600 ${style.size * pop * s}px ui-monospace, monospace`;
        ctx.fillStyle = style.color;
        // A dark rim rather than a filled plate: the word sits over planets and
        // stars, and a box that size would punch a hole in the scene.
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.strokeText(p.praise.word, x, y);
        ctx.fillText(p.praise.word, x, y);
      }

      // The number sits below the word, always, praised or not.
      if (p.points === null) continue;
      const numY = y + (p.praise ? style.size + 2 : 0) * s;
      ctx.font = `600 ${(p.praise ? style.size - 2 : style.size) * s}px ui-monospace, monospace`;
      ctx.fillStyle = style.color;
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      // Always a gain: nothing takes points away.
      //
      // A rolling number decelerates into its total rather than arriving at a
      // constant rate: the last digits settling slowly is what makes it read as a
      // tally coming to rest instead of a counter that was cut off.
      const shownPoints =
        p.roll > 0 ? Math.round(p.points * easeOutCubic(Math.min(1, p.t / p.roll))) : p.points;
      const text = `+${formatScore(shownPoints)}`;
      ctx.strokeText(text, x, numY);
      ctx.fillText(text, x, numY);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
