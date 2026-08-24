/**
 * Parallax starfield.
 *
 * Generated in design-window space from a seeded RNG, so density is identical on
 * every device and a reported frame can be reproduced. The prototype used
 * Math.random() in raw viewport units and never regenerated, so stars teleported
 * on resize and density drifted with screen size.
 *
 * Parallax is horizontal as well as vertical: the camera pans across the field,
 * and a rigid sky would contradict the motion.
 */
import type { Camera } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { mulberry32 } from '../sim/rng.ts';

interface Star {
  x: number;
  y: number;
  z: number;
}

/** Three depth tiers, so the whole field draws in six state changes, not ~320. */
const TIERS = [
  { max: 0.6, color: '#7788a8', size: 1 },
  { max: 0.85, color: '#aebbd8', size: 1 },
  { max: 1.01, color: '#dfe8ff', size: 1.8 },
] as const;

export class Starfield {
  private readonly tiers: Star[][];

  constructor(cfg: RenderConfig, seed: number) {
    const rnd = mulberry32(seed);
    this.tiers = TIERS.map(() => []);
    for (let i = 0; i < cfg.starCount; i++) {
      const s: Star = { x: rnd(), y: rnd(), z: rnd() };
      const ti = TIERS.findIndex((t) => s.z < t.max);
      this.tiers[ti === -1 ? TIERS.length - 1 : ti]!.push(s);
    }
  }

  /**
   * @param warp 0 for the ordinary sky; 1 for full lightspeed, where every star
   * is a streak radiating from the point the ship is heading into.
   *
   * THE SAME STARS STRETCH — this is not a second star system faded in over the
   * first. A warp that swaps one field for another reads as a cut, and the eye
   * catches it: the thing that sells the effect is recognising that the sky you
   * were just looking at is now moving. Density, parallax and seed are all
   * unchanged; only the shape of each mark is different.
   *
   * Downward and parallel, because the game is flat. See the streak block below.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    cfg: RenderConfig,
    warp = 0,
    /**
     * Seconds into the warp, for the scroll.
     *
     * WITHOUT THIS THE WARP IS A STILL LIFE. Stretching each star into a streak
     * makes a picture OF speed; it does not make motion. The camera is frozen with
     * the ship during the ceremony, so every parallax position it feeds is frozen
     * too, and the first version drew long static lines that simply sat there —
     * reported as "it stops animating on FIELD CLEARED". The streaks have to be
     * scrolled by something, and the only honest clock available is the one the
     * simulation is already advancing through the hold.
     */
    warpT = 0,
  ): void {
    const { starParallaxMin: lo, starParallaxMax: hi, starParallaxHorizFrac: hf } = cfg;
    const w = cam.designW * cam.scale;
    const h = cam.viewH * cam.scale;

    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t]!;
      const stars = this.tiers[t]!;
      if (stars.length === 0) continue;

      ctx.fillStyle = tier.color;
      // One alpha per tier rather than per star: the eye cannot tell, and it
      // collapses hundreds of state changes into one.
      ctx.globalAlpha = 0.3 + ((t + 0.5) / TIERS.length) * 0.6;
      const size = Math.max(1, tier.size * cam.scale);

      if (warp <= 0) {
        for (const s of stars) {
          const p = lo + s.z * (hi - lo);
          const y = mod(s.y * h - cam.centerY * p * cam.scale, h);
          const x = mod(s.x * w - cam.left * p * hf * cam.scale, w);
          ctx.fillRect(cam.offsetX + x, cam.offsetY + y, size, size);
        }
        continue;
      }

      // STREAKS FALL STRAIGHT DOWN, PARALLEL, AND THAT IS NOT A SIMPLIFICATION.
      //
      // The first version radiated them from a vanishing point, on the reasoning
      // that a field of parallel lines is rain and perspective is what makes a
      // warp. That reasoning is sound for a cockpit looking down its own flight
      // axis, and wrong for this game, which has never once implied depth: the
      // camera is side-on, the field is flat, and the only third dimension the
      // starfield has ever expressed is PARALLAX — tiers that scroll at different
      // SPEEDS across the same plane. A cone puts a horizon in a game with no
      // horizon, and the eye reads it immediately as a different space.
      //
      // So the streak says what the parallax already says, louder: every star in
      // a tier moves together, downward, because the ship is going up. Length is
      // per tier rather than per star for exactly that reason — within one plane
      // there is nothing to make one star faster than its neighbour.
      // Shorter than the first attempt, which drew a lattice rather than a sky:
      // at full length every tier overlapped the next and the screen read as
      // ruled lines. Length is a hint of travel per frame, not a measure of it.
      const gain = warp * (9 + t * 22) * cam.scale;
      // Nearer tiers stream faster — the same parallax ordering the still field
      // uses, which is why the warp can be built out of it rather than beside it.
      const stream = warpT * (150 + t * 430) * cam.scale;
      ctx.strokeStyle = tier.color;
      ctx.lineWidth = size;
      ctx.lineCap = 'butt';
      // A streak is already brighter than a dot simply by covering more pixels.
      // Holding the dot's alpha made the field close up into a wall.
      ctx.globalAlpha *= 0.62;
      ctx.beginPath();
      for (const s of stars) {
        const p = lo + s.z * (hi - lo);
        const y = mod(s.y * h - cam.centerY * p * cam.scale + stream, h);
        const x = mod(s.x * w - cam.left * p * hf * cam.scale, w);
        ctx.moveTo(cam.offsetX + x, cam.offsetY + y);
        ctx.lineTo(cam.offsetX + x, cam.offsetY + y + gain);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
