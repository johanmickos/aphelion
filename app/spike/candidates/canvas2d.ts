/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * Rung (a) of M0.5's ladder — Canvas2D with bloom hand-rolled as an offscreen
 * half-resolution blur composited with `lighter` — and, beneath it, the scene
 * drawn with no post-processing at all.
 *
 * The bare scene is not one of the plan's four options. It is here because spec
 * 14's acceptance asks for the grade's cost to be measured, and a single total
 * cannot say whether the expensive thing is the lattice or the coat on top of
 * it. Subtracting one from the other is the only way the verdict says something
 * actionable rather than just pass or fail.
 */
import { DESIGN_H, DESIGN_W, drawEmissive, drawScene, drawStructure } from '../scene.ts';
import type { Scene } from '../scene.ts';
import { BAYER_4, GRADE } from '../grade.ts';
import type { Backing, Candidate, Renderer } from './types.ts';

function mount(host: HTMLElement, backing: Backing): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = backing.w;
  canvas.height = backing.h;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  host.append(canvas);
  // `alpha: false` matters: the sky is opaque VOID, and an opaque canvas lets
  // the compositor skip blending the whole surface against the page.
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('no 2d context');
  return [canvas, ctx];
}

function scratch(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  return ctx;
}

/** A 4×4 ordered Bayer tile at ~1/255 amplitude (spec 14 §2 stage 3). */
function ditherTile(): CanvasPattern | null {
  const ctx = scratch(4, 4);
  for (let i = 0; i < 16; i++) {
    // `GRADE.dither` is already an amplitude in 0..1 (one 255th), and the alpha
    // channel of `rgba()` is in 0..1 too. Scaling it by 255 here would paint a
    // near-white 4×4 grid over the whole frame at `lighter`, which is a wash,
    // not a dither.
    ctx.fillStyle = `rgba(255,255,255,${((BAYER_4[i] ?? 0) / 16) * GRADE.dither})`;
    ctx.fillRect(i % 4, Math.floor(i / 4), 1, 1);
  }
  return ctx.createPattern(ctx.canvas, 'repeat');
}

/**
 * Grain is resampled per frame (spec 14 §2 stage 4), and getImageData per frame
 * over three million pixels is not a thing a phone will do. One tile, offset by
 * a different amount every frame, is how this is actually done.
 */
function grainTile(): CanvasPattern | null {
  const size = 256;
  const ctx = scratch(size, size);
  const img = ctx.createImageData(size, size);
  let s = 0x9e3779b9;
  for (let i = 0; i < size * size; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 128 + ((s >>> 24) - 128) * 0.5;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.round(GRADE.grain * 255);
  }
  ctx.putImageData(img, 0, 0);
  return ctx.createPattern(ctx.canvas, 'repeat');
}

/** Scanlines at the spec's 2-design-px pitch, in backing pixels. */
function scanTile(scale: number): CanvasPattern | null {
  const pitch = Math.max(2, Math.round(GRADE.scanlines.pitch * scale));
  const ctx = scratch(1, pitch);
  ctx.fillStyle = `rgba(0,0,0,${GRADE.scanlines.strength})`;
  ctx.fillRect(0, 0, 1, Math.max(1, Math.floor(pitch / 2)));
  return ctx.createPattern(ctx.canvas, 'repeat');
}

export const sceneOnly: Candidate = {
  id: 'scene',
  label: 'baseline · scene, no post',
  create(host, scene, backing): Renderer {
    const [canvas, ctx] = mount(host, backing);
    return {
      note: 'not a candidate — the floor the other numbers are read against',
      frame(): void {
        ctx.setTransform(backing.scale, 0, 0, backing.scale, 0, 0);
        drawScene(ctx, scene);
      },
      dispose(): void {
        canvas.remove();
      },
    };
  },
};

export const canvas2dBloom: Candidate = {
  id: 'a',
  label: '(a) Canvas2D · hand-rolled bloom',
  create(host, scene: Scene, backing: Backing): Renderer {
    const [canvas, ctx] = mount(host, backing);

    // The blur chain: half, quarter, eighth. The plan asks for a
    // half-resolution blur; three levels rather than one because spec 00 §3
    // gives three bloom radii (6px, 18px, 48px) and one blur can only produce
    // one. Downsample all the way, then add back up — each upsample is a
    // bilinear widening, which is where the blur actually comes from.
    const lvl = [2, 4, 8].map((d) => scratch(backing.w / d, backing.h / d));
    for (const l of lvl) l.imageSmoothingEnabled = true;

    const dither = ditherTile();
    const grain = grainTile();
    const scan = scanTile(backing.scale);
    let seed = 1;

    return {
      note:
        "Canvas2D cannot express the grade: 'multiply' cannot scale a channel above 1, so gain " +
        'is applied normalised (channel ratios kept, overall level not), and per-channel gamma ' +
        'has no expression at all. Bloom threshold is likewise unavailable — the chain blurs the ' +
        'emissive layer as drawn, with no bright-pass.',

      frame(): void {
        // 1 · the scene, crisp
        ctx.setTransform(backing.scale, 0, 0, backing.scale, 0, 0);
        drawStructure(ctx, scene);
        drawEmissive(ctx, scene);

        // 2 · the emissive layer alone, at half resolution
        const l0 = lvl[0]!;
        l0.setTransform(1, 0, 0, 1, 0, 0);
        l0.clearRect(0, 0, l0.canvas.width, l0.canvas.height);
        l0.setTransform(backing.scale / 2, 0, 0, backing.scale / 2, 0, 0);
        drawEmissive(l0, scene);

        // 3 · down the chain
        for (let i = 1; i < lvl.length; i++) {
          const dst = lvl[i]!;
          const src = lvl[i - 1]!;
          dst.setTransform(1, 0, 0, 1, 0, 0);
          dst.globalCompositeOperation = 'copy';
          dst.drawImage(src.canvas, 0, 0, dst.canvas.width, dst.canvas.height);
        }

        // 4 · and back up, each level adding its width to the one below
        for (let i = lvl.length - 1; i > 0; i--) {
          const dst = lvl[i - 1]!;
          const src = lvl[i]!;
          dst.globalCompositeOperation = 'lighter';
          dst.globalAlpha = GRADE.bloom.weights[i] ?? 0.3;
          dst.drawImage(src.canvas, 0, 0, dst.canvas.width, dst.canvas.height);
          dst.globalAlpha = 1;
        }

        // 5 · composite the bloom over the scene with `lighter`
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GRADE.bloom.intensity * (GRADE.bloom.weights[0] ?? 0.5);
        ctx.drawImage(l0.canvas, 0, 0, backing.w, backing.h);
        ctx.globalAlpha = 1;

        // 6 · grade. See `note`: this is the closest Canvas2D gets.
        const g = GRADE.gain;
        const peak = Math.max(g[0], g[1], g[2]);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${(g[0] / peak) * 255},${(g[1] / peak) * 255},${(g[2] / peak) * 255})`;
        ctx.fillRect(0, 0, backing.w, backing.h);

        ctx.globalCompositeOperation = 'lighter';
        const li = GRADE.lift;
        ctx.fillStyle = `rgb(${li[0] * 255},${li[1] * 255},${li[2] * 255})`;
        ctx.fillRect(0, 0, backing.w, backing.h);

        // 7 · dither
        if (dither) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = dither;
          ctx.fillRect(0, 0, backing.w, backing.h);
        }

        // 8 · grain, resampled by moving the tile rather than regenerating it
        if (grain) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const ox = seed % 251;
          const oy = (seed >>> 8) % 251;
          ctx.globalCompositeOperation = 'overlay';
          ctx.setTransform(1, 0, 0, 1, -ox, -oy);
          ctx.fillStyle = grain;
          ctx.fillRect(ox, oy, backing.w, backing.h);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // 9 · scanlines
        if (scan) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = scan;
          ctx.fillRect(0, 0, backing.w, backing.h);
        }

        ctx.globalCompositeOperation = 'source-over';
      },

      dispose(): void {
        canvas.remove();
      },
    };
  },
};

export const DESIGN = { w: DESIGN_W, h: DESIGN_H };
