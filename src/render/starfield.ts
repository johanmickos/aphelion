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
     * How far the world has fallen since the ceremony began, in design units.
     *
     * WITHOUT A SCROLL THE WARP IS A STILL LIFE. Stretching each star into a
     * streak makes a picture OF speed; it does not make motion. The camera is
     * frozen with the ship during the ceremony, so every parallax position it
     * feeds is frozen too, and the first version drew long static lines that
     * simply sat there — reported as "it stops animating on FIELD CLEARED".
     *
     * A DISTANCE, AND THE SAME ONE THE WORLD FALLS BY, which is what makes the
     * transition continuous. Driven by a clock that only started at the handover,
     * the stars would sit still through the coast and then JUMP by however much
     * scroll had accumulated by the time the streaks appeared. Driven by the
     * world's own fall, the very same dots that were on screen a moment ago are
     * already moving before they elongate — the sky never restarts, it only
     * changes shape. It is also the truer statement: the ship is climbing away,
     * and the stars are what that looks like.
     */
    scroll = 0,
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

      // Parallax on the ceremony scroll, exactly as on the camera: a near tier
      // sweeps past faster than a far one. Applied in BOTH branches, so a dot and
      // the streak it becomes are drawn at the same place.
      const stream = scroll * (0.18 + t * 0.34) * cam.scale;

      if (warp <= 0) {
        for (const s of stars) {
          const p = lo + s.z * (hi - lo);
          const y = mod(s.y * h - cam.centerY * p * cam.scale + stream, h);
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
      // ---- length spread is what stops this being rain
      //
      // Rain is uniform: every drop the same length, the same brightness, evenly
      // spread. A warp is DEPTH — the things near you tear past and the things far
      // away barely move — and the eye reads that difference long before it reads
      // any individual streak. At a 9-to-31 spread across the three tiers, every
      // tier looked much like its neighbour and the whole field read as weather.
      // Squared, the spread runs 3 to 83: the far tier is still very nearly a
      // point, and only the near one really travels.
      const gain = warp * (2.5 + t * t * 20) * cam.scale;
      ctx.strokeStyle = tier.color;
      ctx.lineWidth = size;
      ctx.lineCap = 'butt';
      // Dimmer with distance, on top of the tier alpha the still field already
      // has. A streak is brighter than a dot simply by covering more pixels, so
      // holding the dot's alpha closed the field into a wall — and fading the far
      // tiers harder is the same depth statement the length makes, in the other
      // channel the eye reads it in.
      ctx.globalAlpha *= 0.34 + t * 0.28;
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
