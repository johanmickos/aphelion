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
 * A burn lives longer than the others, because its number has to count.
 *
 * Long enough that the roll below finishes well before the fade starts: the fade
 * takes the last 45% of the life, so at 1.7s it begins at 0.94s and the roll lands
 * at 0.8s.
 */
const LIFE_BURN = 1.7;

/**
 * Seconds a burn's number spends counting up to its total.
 *
 * The count happens AFTER the drag, not during it. A live tally beside the ship
 * was built and taken out again — see PORT_NOTES 51 — and the reason it lost is
 * that a number climbing next to a ship that is inches from a wall competes with
 * the decision the player is actually making. Afterwards there is nothing left to
 * decide and the number has the moment to itself.
 *
 * 0.8s against a drag that runs 0.45s at the median: the tally deliberately takes
 * longer than the thing it is counting, so it reads as a total being tallied up
 * rather than as a replay of the drag in real time.
 */
const ROLL = 0.8;

/**
 * The closing tally of a charged window. Longest-lived thing that floats.
 *
 * It arrives as the frenzy ends, when nothing else is coming, and it is the one
 * number summarising the seven seconds the player just spent — so it is allowed
 * to hang there and be read.
 */
const LIFE_TALLY = 2.2;

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

import { BURN_WORD, HOP, HOP_TALLY, LEVEL, ROUTINE, SHOUT } from './accolade.ts';

/**
 * The dark rim that keeps text legible over planets and stars.
 *
 * Thinner and lighter than it was — 3px at .55 alpha, which was sized for a text
 * colour that no longer exists. `ROUTINE` used to be a dark grey that needed
 * separating from a dark sky by force; it is a near-white now, and the rim only
 * has to keep it off the occasional bright star. A heavy black outline under pale
 * text reads as a sticker.
 */
const RIM_WIDTH = 2;
const RIM = 'rgba(0,0,0,.38)';

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
  /** A hop inside a charged window: off the rarity ladder, purple. */
  hop: boolean;
  /** The closing tally of a window. Drawn large, and without a `+`. */
  tally: boolean;
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
      hop: award.kind === 'hop',
      tally: false,
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
      hop: false,
      tally: false,
      shout: shout.word,
      roll: 0,
    });
    while (this.live.length > MAX_LIVE) this.live.shift();
  }

  /**
   * Raise the closing tally of a charged window.
   *
   * Not routed through `spawn`, for the reason `shout` is not: there is no award
   * behind it. Every point in it was banked as its hop landed, and inventing an
   * award to carry it would put a number into the score band that the score has
   * already counted once.
   *
   * Lives longer than a popup and rises from higher up, because nothing else is
   * arriving by then — the window is over — so it has the screen to itself.
   */
  tally(points: number, x: number, y: number): void {
    this.live.push({
      x,
      y: y - SPAWN_LIFT * 1.6,
      t: 0,
      life: LIFE_TALLY,
      points,
      praise: null,
      hop: false,
      tally: true,
      shout: null,
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
        ctx.lineWidth = RIM_WIDTH * s;
        ctx.strokeStyle = RIM;
        ctx.strokeText(p.shout, x, y);
        ctx.fillStyle = SHOUT.color;
        ctx.fillText(p.shout, x, y);
        continue;
      }

      // A hop is off the ladder: it pays flat, so there is no quality for a
      // rarity colour to report. See `HOP` in `accolade.ts`.
      const style = p.tally ? HOP_TALLY : p.hop ? HOP : p.praise ? LEVEL[p.praise.level] : ROUTINE;
      const burning = p.praise?.category === 'burn';
      // The ember is the WORD's, never the number's.
      const wordColor = burning ? BURN_WORD.color : style.color;
      // And a burn's number is always the default grey, whether or not it earned a
      // word. Letting it take a ladder colour meant a drag that scored well turned
      // BLUE next to an orange word — two hues on one two-line popup, neither of
      // them fire. Size still climbs with the rung, so how good it was is not lost.
      const numberColor = burning ? ROUTINE.color : style.color;

      if (p.praise) {
        // A brief overshoot on the way in. Only the top of the ladder gets it —
        // on an ordinary word it reads as a wobble rather than as emphasis.
        const pop = p.praise.level === 'exceptional' ? 1 + 0.35 * Math.max(0, 1 - u * 6) : 1;
        ctx.font = `600 ${style.size * pop * s}px ui-monospace, monospace`;
        ctx.fillStyle = wordColor;
        // A dark rim rather than a filled plate: the word sits over planets and
        // stars, and a box that size would punch a hole in the scene.
        ctx.lineWidth = RIM_WIDTH * s;
        ctx.strokeStyle = RIM;
        ctx.strokeText(p.praise.word, x, y);
        ctx.fillText(p.praise.word, x, y);
      }

      // The number sits below the word, always, praised or not.
      if (p.points === null) continue;
      const numY = y + (p.praise ? style.size + 2 : 0) * s;
      ctx.font = `600 ${(p.praise ? style.size - 2 : style.size) * s}px ui-monospace, monospace`;
      ctx.fillStyle = numberColor;
      ctx.lineWidth = RIM_WIDTH * s;
      ctx.strokeStyle = RIM;
      // Always a gain: nothing takes points away.
      //
      // A rolling number decelerates into its total rather than arriving at a
      // constant rate: the last digits settling slowly is what makes it read as a
      // tally coming to rest instead of a counter that was cut off.
      const shownPoints =
        p.roll > 0 ? Math.round(p.points * easeOutCubic(Math.min(1, p.t / p.roll))) : p.points;
      // The tally is the one thing here that is not a payment — it restates what
      // the window's hops already banked — so it drops the `+`. A fourth `+500`
      // arriving as the total of three would read as a fourth award.
      const text = p.tally ? formatScore(p.points) : `+${formatScore(shownPoints)}`;
      ctx.strokeText(text, x, numY);
      ctx.fillText(text, x, numY);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
