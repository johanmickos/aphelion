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

/** The reckless shout. Unused elsewhere in the palette, and loud on purpose. */
const SHOUT_COLOR = '#ff45c8';
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

/** Colour per category. Drawn from the palette each quality already owns. */
const COLOR: Record<Praise['category'], string> = {
  // the compass align glow is this green, so aim praise matches the thing that
  // was glowing while the player lined the release up
  aim: '#54f39a',
  // the BOOST PEAK readout is this violet
  peak: '#b98cff',
  close: '#ff9a3c',
  // Unused elsewhere in the game's palette, so a nerve grab never reads as any
  // of the other three at a glance.
  nerve: '#3fe0ff',
  super: '#ffe27a',
};

const ROUTINE = '#ffcd32';
const DEDUCTION = '#ff5566';

interface Popup {
  x: number;
  y: number;
  t: number;
  life: number;
  /** Null for a shout, which is not about points at all. */
  points: number | null;
  praise: Praise | null;
  deduction: boolean;
  shout: string | null;
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
    this.live.push({
      x,
      y: y - SPAWN_LIFT,
      t: 0,
      life: praise?.category === 'super' ? LIFE_SUPER : LIFE,
      points: award.points,
      praise,
      deduction: award.kind === 'miss',
      shout: null,
    });
    while (this.live.length > MAX_LIVE) this.live.shift();
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
      y: y - SPAWN_LIFT,
      t: 0,
      life: LIFE_SHOUT,
      points: null,
      praise: null,
      deduction: false,
      shout: shout.word,
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
        // Bigger than any link word and slightly askew, because it is a reaction
        // rather than a readout. The tilt is derived from the position so it does
        // not jitter frame to frame.
        const pop = 1 + 0.4 * Math.max(0, 1 - u * 5);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((((p.x * 7919) % 100) / 100 - 0.5) * 0.18);
        ctx.font = `600 ${19 * pop * s}px ui-monospace, monospace`;
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeText(p.shout, 0, 0);
        ctx.fillStyle = SHOUT_COLOR;
        ctx.fillText(p.shout, 0, 0);
        ctx.restore();
        continue;
      }

      if (p.praise) {
        const sup = p.praise.category === 'super';
        // A brief overshoot on the way in. Only the superlative gets it — on an
        // ordinary word it reads as a wobble rather than as emphasis.
        const pop = sup ? 1 + 0.35 * Math.max(0, 1 - u * 6) : 1;
        const size = (sup ? 17 : p.praise.tier === 2 ? 14 : 12) * pop;
        ctx.font = `600 ${size * s}px ui-monospace, monospace`;
        ctx.fillStyle = COLOR[p.praise.category];
        // A dark rim rather than a filled plate: the word sits over planets and
        // stars, and a box that size would punch a hole in the scene.
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.strokeText(p.praise.word, x, y);
        ctx.fillText(p.praise.word, x, y);
      }

      // The number sits below the word, always, praised or not.
      if (p.points === null) continue;
      const numY = y + (p.praise ? 14 : 0) * s;
      ctx.font = `600 ${(p.praise ? 12 : 13) * s}px ui-monospace, monospace`;
      ctx.fillStyle = p.deduction ? DEDUCTION : p.praise ? COLOR[p.praise.category] : ROUTINE;
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      const text = `${p.points >= 0 ? '+' : ''}${formatScore(p.points)}`;
      ctx.strokeText(text, x, numY);
      ctx.fillText(text, x, numY);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
