/**
 * The charged storm: what the sky does while a charged window is running.
 *
 * See `SimConfig.chargedSecs`. The ship leaves an anomaly carrying its colour,
 * and the space around it becomes a purple aurora.
 *
 * IT IS ANCHORED IN WORLD SPACE, NOT ON THE SHIP. A screen-space wash is a filter
 * laid over the picture and reads as the game changing its mind about the
 * palette; a single gradient centred on the ship fixes that and is dead, the same
 * smooth blob at every moment with no structure to move past. Both were tried.
 * What is here is a field of clouds and a set of aurora curtains hashed from
 * world-space grids, so they parallax with the starfield: the ship is always
 * inside the storm because cells are drawn around wherever it is, but WHICH part
 * of the storm it is inside changes as it flies.
 *
 * THE CURTAINS ARE RENDERED SMALL AND SCALED UP, WHICH IS THE WHOLE TRICK. They
 * were first drawn as a stack of strokes of decreasing width, and that cannot
 * produce a soft edge however many passes it uses: every stroke is solid with a
 * hard boundary, so N passes draw N terraces and the result is a contour map.
 * Eight passes on a Gaussian profile only made the terraces finer, and on a phone
 * they were still plainly visible as concentric lines fanning out of each band.
 *
 * So the curtains go into an offscreen canvas at 1/`DOWNSCALE`, and are drawn back
 * up to full size with image smoothing on. The bilinear filter blurs across every
 * step for free, and the whole thing costs a fraction of what the stack did:
 * three strokes over 1/64th of the pixels, plus one composite.
 * `ctx.filter = 'blur()'` is the direct alternative and is declined — it forces an
 * offscreen rasterisation of its own on every draw call, its cost scales with the
 * blurred area rather than with the geometry, and it would have to be applied once
 * per curtain rather than once per frame.
 *
 * IT DOES NOT FADE OUT WITH THE COUNTDOWN. An earlier version scaled everything
 * by the window's remaining fraction, which dimmed it linearly to nothing and let
 * the best moment in the game end without a signal — reported as "it kind of
 * fizzles". The intensity holds, the last fifth agitates, and the window closes
 * on a bloom and a long collapse. The countdown is the gauge's job.
 *
 * There is no lightning. It was tried and cut: forked bolts over a moving
 * starfield read as tacky decoration rather than as weather, and they competed
 * with the ship's own arcs, which are the cue that actually means something.
 *
 * Nothing here feeds the simulation. The drift reads a wall clock, which is legal
 * in render and which `src/render/world.ts` already does for the anomaly's pulse.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';

/** How far from the ship clouds are drawn, in world units. */
const REACH = 760;

/** World size of one cloud cell. Smaller means more, tighter puffs. */
const CELL = 300;

/** World spacing between aurora curtains. */
const BAND = 480;

/**
 * How much smaller the curtain buffer is than the viewport.
 *
 * This is the blur radius in disguise: the upscale interpolates across
 * `DOWNSCALE` screen pixels, so a larger number is both softer and cheaper. Eight
 * is where the softness stops improving and the ribbon starts losing its shape —
 * the wave has features a few tens of pixels across, and past this they go the
 * way of the edges.
 */
const DOWNSCALE = 8;

/** Seconds the closing bloom-and-collapse runs for. */
export const OUTRO_SECS = 1.05;

/** Fraction of the window over which the storm visibly agitates before closing. */
const AGITATE_FROM = 0.22;

/**
 * The passes a curtain is drawn with: screen width, and alpha at full brightness.
 *
 * Only three, and with no Gaussian weighting, because the upscale does the
 * smoothing now. At 1/8 these are 23, 14 and 6 buffer pixels wide and the
 * bilinear filter spreads each edge over eight screen pixels on the way back up.
 * The stack survives only to give the ribbon a brighter core than its skirt.
 */
const PASSES: ReadonlyArray<readonly [number, number]> = [
  [184, 0.16],
  [112, 0.14],
  [48, 0.16],
];

/** A canvas the storm can draw into. Injectable so tests exercise the real path. */
export interface OffscreenTarget {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

export type CanvasFactory = () => OffscreenTarget | null;

const defaultFactory: CanvasFactory = () =>
  typeof document === 'undefined' ? null : document.createElement('canvas');

/** Cheap integer hash of a cell coordinate. Stable, so a cloud stays put. */
function hash(a: number, b: number): number {
  let h = (a * 2654435761 + b * 40503) >>> 0;
  h ^= h >>> 13;
  h = (h * 1274126177) >>> 0;
  return h >>> 0;
}

/** 0..1 from a hash, taking bits well above the low ones. */
function unit(h: number, shift: number): number {
  return ((h >>> shift) & 0xffff) / 0x10000;
}

export class Nebula {
  private readonly makeCanvas: CanvasFactory;

  private buf: OffscreenTarget | null = null;

  private bufCtx: CanvasRenderingContext2D | null = null;

  private failed = false;

  constructor(makeCanvas: CanvasFactory = defaultFactory) {
    this.makeCanvas = makeCanvas;
  }

  /** The curtain buffer at the current size, or null if none can be had. */
  private target(w: number, h: number): CanvasRenderingContext2D | null {
    if (this.failed || w <= 0 || h <= 0) return null;
    if (!this.buf) {
      const made = this.makeCanvas();
      const c = made?.getContext('2d') ?? null;
      if (!made || !c) {
        // Asked once. A factory that cannot produce a canvas will not start.
        this.failed = true;
        return null;
      }
      this.buf = made;
      this.bufCtx = c;
    }
    // Resizing a canvas clears it, so only touch the size when it really moved.
    if (this.buf.width !== w || this.buf.height !== h) {
      this.buf.width = w;
      this.buf.height = h;
    }
    return this.bufCtx;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    timeMs: number,
    viewportW: number,
    viewportH: number,
    outro: number | null,
  ): void {
    const frac = snap.chargedFrac;
    if (frac <= 0 && outro === null) return;

    // How hard the storm is running, and how big. While the window is live both
    // hold: only the last fifth agitates, and only the outro moves them.
    let strength = 1;
    let swell = 1;
    let beat = 1.1;

    if (outro !== null) {
      // A short bloom and a long collapse — the shape of an exhale. The collapse
      // is cubic so it leaves quickly and then lingers, instead of the linear ramp
      // that read as the effect being switched off.
      const bloom = 0.18;
      if (outro < bloom) {
        const u = outro / bloom;
        strength = 1 + 1.1 * u;
        swell = 1 + 0.2 * u;
      } else {
        const u = (outro - bloom) / (1 - bloom);
        const k = 1 - u;
        strength = 2.1 * k * k * k;
        swell = 1.2 * (0.35 + 0.65 * k);
      }
    } else if (frac < AGITATE_FROM) {
      const u = 1 - frac / AGITATE_FROM;
      beat = 1.1 + 4.5 * u;
      strength = 1 + 0.2 * u;
    }

    if (strength <= 0.001 || swell <= 0) return;

    const t = timeMs / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * beat);

    ctx.save();

    // A floor of colour across the sky, so the clouds have no hard edge where
    // they run out.
    const skyA = Math.min(0.4, (0.1 + 0.035 * pulse) * strength);
    ctx.fillStyle = `rgba(58,18,104,${skyA.toFixed(3)})`;
    ctx.fillRect(0, 0, viewportW, viewportH);

    this.clouds(ctx, cam, snap, t, viewportW, viewportH, strength, swell, beat);
    this.curtains(ctx, cam, snap, t, viewportW, viewportH, strength, swell);

    ctx.restore();
  }

  /**
   * The bed the curtains hang over: overlapping puffs on a world grid.
   *
   * Drawn at full size rather than through the buffer, because a radial gradient
   * is already smooth — there is nothing here for an upscale to fix, and it would
   * only cost them their detail.
   */
  private clouds(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    t: number,
    viewportW: number,
    viewportH: number,
    strength: number,
    swell: number,
    beat: number,
  ): void {
    const s = cam.scale;
    const reach = REACH * swell;
    const c0x = Math.floor((snap.x - reach) / CELL);
    const c1x = Math.floor((snap.x + reach) / CELL);
    const c0y = Math.floor((snap.y - reach) / CELL);
    const c1y = Math.floor((snap.y + reach) / CELL);

    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const h = hash(cx, cy);
        // Not every cell holds a cloud; the gaps are what make it look like
        // weather rather than wallpaper.
        if (unit(h, 24) > 0.82) continue;

        // Jittered off the cell centre so the grid itself is never visible.
        const wx = (cx + 0.15 + unit(h, 0) * 0.7) * CELL;
        const wy = (cy + 0.15 + unit(h, 4) * 0.7) * CELL;

        const dx = wx - snap.x;
        const dy = wy - snap.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach) continue;
        const near = 1 - d / reach;

        // Each cloud breathes on its own phase, so the field churns instead of
        // throbbing in unison.
        const phase = unit(h, 8) * Math.PI * 2;
        const own = 0.6 + 0.4 * Math.sin(t * Math.PI * 0.5 * beat + phase);

        const pink = unit(h, 12);
        const r = Math.round(96 + 118 * pink);
        const g = Math.round(28 + 34 * pink);
        const b = Math.round(168 + 62 * pink);

        const rad = (CELL * (0.62 + unit(h, 16) * 0.75) * swell + 40) * s;
        // Clouds overlap and alpha stacks: four at this reach about 0.4 together,
        // which is where the densest part of the field lands.
        const a = Math.min(0.46, 0.24 * near * near * own * strength * (0.7 + 0.5 * pink));
        if (a < 0.004) continue;

        const px = toScreenX(cam, wx);
        const py = toScreenY(cam, wy);
        // Cull before touching a gradient: REACH is 760 world units in every
        // direction and the viewport is a tall narrow slice of that, so most of
        // the grid sits behind the camera's back — and every cell that survives
        // costs up to a full-viewport alpha blend.
        if (px + rad < 0 || px - rad > viewportW || py + rad < 0 || py - rad > viewportH) continue;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},${(a * 0.42).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
    }
  }

  /**
   * The northern lights: wavy ribbons hung across the field.
   *
   * Rendered into the low-resolution buffer and composited up — see the header
   * for why that is the blur. Falls back to drawing straight onto the canvas when
   * no buffer can be had, which is visibly harder-edged but only ever happens
   * where there is no `document` to make one from.
   */
  private curtains(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    snap: RenderSnapshot,
    t: number,
    viewportW: number,
    viewportH: number,
    strength: number,
    swell: number,
  ): void {
    const s = cam.scale;
    const bw = Math.max(1, Math.ceil(viewportW / DOWNSCALE));
    const bh = Math.max(1, Math.ceil(viewportH / DOWNSCALE));
    const buf = this.target(bw, bh);
    const into = buf ?? ctx;
    // Everything is authored in screen pixels, so drawing into the buffer is the
    // same geometry at 1/DOWNSCALE.
    const k = buf ? 1 / DOWNSCALE : 1;

    if (buf) buf.clearRect(0, 0, bw, bh);
    into.lineCap = 'round';
    into.lineJoin = 'round';

    const b0 = Math.floor((snap.y - REACH) / BAND);
    const b1 = Math.floor((snap.y + REACH) / BAND);
    let drew = false;

    for (let bi = b0; bi <= b1; bi++) {
      const h = hash(bi, 0x51ed);
      // Gaps between curtains, so they arrive rather than parade.
      if (unit(h, 24) > 0.85) continue;

      const baseY = (bi + 0.2 + unit(h, 0) * 0.6) * BAND;
      const near = 1 - Math.min(1, Math.abs(baseY - snap.y) / REACH);
      if (near <= 0.02) continue;

      // Amplitude against wavelength is what decides whether a curtain reads as a
      // ribbon or as a snake: below about 0.5 it lies along the screen instead of
      // climbing and diving across it.
      const amp = (130 + unit(h, 4) * 110) * swell;
      const wave = 200 + unit(h, 8) * 160;
      const drift = t * (14 + unit(h, 12) * 22) * (unit(h, 20) < 0.5 ? -1 : 1);
      const pink = unit(h, 16);
      const r = Math.round(112 + 130 * pink);
      const g = Math.round(30 + 42 * pink);
      const b = Math.round(186 + 56 * pink);

      const mid = toScreenY(cam, baseY);
      const reachPx = (amp + 150) * s;
      if (mid + reachPx < 0 || mid - reachPx > viewportH) continue;

      // The wave is two summed sines of different periods: one reads as a drawn
      // ripple, two look blown.
      const yAt = (wx: number): number =>
        baseY +
        Math.sin((wx + drift) / wave) * amp +
        Math.sin((wx - drift * 0.6) / (wave * 0.43)) * amp * 0.35;

      into.beginPath();
      let first = true;
      for (let wx = snap.x - 900; wx <= snap.x + 900; wx += 26) {
        const px = toScreenX(cam, wx) * k;
        const py = toScreenY(cam, yAt(wx)) * k;
        if (first) {
          into.moveTo(px, py);
          first = false;
        } else {
          into.lineTo(px, py);
        }
      }

      const lit = near * near * strength;
      for (const [width, a] of PASSES) {
        const alpha = Math.min(0.6, a * lit);
        if (alpha < 0.004) continue;
        into.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        // Never below half a buffer pixel, or a thin pass vanishes entirely at
        // small camera scales instead of thinning.
        into.lineWidth = Math.max(0.5, width * s * swell * k);
        into.stroke();
        drew = true;
      }
    }

    if (!buf || !drew) return;
    // Up to full size, smoothed. This is where the blur happens.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buf as unknown as CanvasImageSource, 0, 0, viewportW, viewportH);
  }
}
