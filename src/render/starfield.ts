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
import { mulberry32 } from './rng.ts';

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

  draw(ctx: CanvasRenderingContext2D, cam: Camera, cfg: RenderConfig): void {
    const { starParallaxMin: lo, starParallaxMax: hi, starParallaxHorizFrac: hf } = cfg;
    const w = cam.designW * cam.scale;
    const h = cam.designH * cam.scale;

    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t]!;
      const stars = this.tiers[t]!;
      if (stars.length === 0) continue;

      ctx.fillStyle = tier.color;
      // One alpha per tier rather than per star: the eye cannot tell, and it
      // collapses hundreds of state changes into one.
      ctx.globalAlpha = 0.3 + ((t + 0.5) / TIERS.length) * 0.6;
      const size = Math.max(1, tier.size * cam.scale);

      for (const s of stars) {
        const p = lo + s.z * (hi - lo);
        const y = mod(s.y * h - cam.centerY * p * cam.scale, h);
        const x = mod(s.x * w - cam.left * p * hf * cam.scale, w);
        ctx.fillRect(cam.offsetX + x, cam.offsetY + y, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
