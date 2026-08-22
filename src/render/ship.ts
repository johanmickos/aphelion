/**
 * The ship and its trail.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';

/**
 * Trail.
 *
 * Sampled on the fixed simulation tick, not in render. The prototype pushed from
 * render(), so on a 120Hz display it collected twice as many points over the same
 * world distance and the trail was half as long — the same ship at the same speed
 * left a shorter wake on a better phone.
 */
export class Trail {
  private readonly pts: Array<{ x: number; y: number; speed: number }> = [];

  private readonly cfg: RenderConfig;

  constructor(cfg: RenderConfig) {
    this.cfg = cfg;
  }

  clear(): void {
    this.pts.length = 0;
  }

  /** Call once per simulation tick. */
  sample(x: number, y: number, speed = 0): void {
    const last = this.pts[this.pts.length - 1];
    const gap = this.cfg.trailSpacing;
    if (!last || (x - last.x) ** 2 + (y - last.y) ** 2 > gap * gap) {
      this.pts.push({ x, y, speed });
      if (this.pts.length > this.cfg.trailMax) this.pts.shift();
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, shipX: number, shipY: number): void {
    const n = this.pts.length;
    const { trailSpeedCalm: calm, trailSpeedHot: hot, trailHeadGap: gap } = this.cfg;
    const gap2 = gap * gap;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]!;
      // Keep the wake clear of the ship. Distance-based rather than "skip the
      // newest point", because how far back that point sits varies with speed.
      const dx = p.x - shipX;
      const dy = p.y - shipY;
      if (dx * dx + dy * dy < gap2) continue;
      const f = i / (n - 1 || 1); // 0 at the tail, 1 at the head
      // Each point keeps the speed it was laid down at, so a boosted exit leaves
      // a visibly hot streak that cools as the ship settles — the wake records
      // the run rather than just reporting the current instant.
      const heat = Math.max(0, Math.min(1, (p.speed - calm) / Math.max(1, hot - calm)));
      const [r, g, b] = trailColor(heat);
      const rad = (0.6 + (2.6 + 1.6 * heat) * f) * cam.scale;
      const alpha = (0.08 + 0.5 * f) * (0.75 + 0.35 * heat);
      ctx.beginPath();
      ctx.arc(toScreenX(cam, p.x), toScreenY(cam, p.y), rad, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.fill();
    }
  }
}

/**
 * Muted indigo when drifting, through the build's violet, to a hot cyan-white at
 * speed. Deliberately not the boost's amber-to-violet ramp: the trail reports how
 * fast you are going, the halo reports when to release, and two cues that meant
 * different things in the same colours would be unreadable together.
 */
export function trailColor(heat: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [104, 92, 150]],
    [0.5, [185, 140, 255]],
    [1.0, [150, 240, 255]],
  ];
  const t = Math.max(0, Math.min(1, heat));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i]!;
    const [p0, c0] = stops[i - 1]!;
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1]![1];
}

/**
 * The ship's silhouette, nose along +x, as a path ready to fill or stroke.
 *
 * Extracted so the attract loop on the title screen draws the same ship the game
 * does. Two copies of these five numbers would drift, and the title screen would
 * end up advertising a vessel that does not exist.
 */
export function shipPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(9 * s, 0);
  ctx.lineTo(-6 * s, 5 * s);
  ctx.lineTo(-3 * s, 0);
  ctx.lineTo(-6 * s, -5 * s);
  ctx.closePath();
}

/**
 * Arcs thrown off a charged hull. See `SimConfig.chargedSecs`.
 *
 * Drawn OUTSIDE the silhouette rather than on it, and that is the whole reason
 * this reads at all: the hull is nine design pixels long, and both markings it
 * already carries live on its outline — amber for a braking flyby, purple for a
 * held grab. A third treatment there would have to compete with those; the space
 * around the ship is empty and free.
 *
 * Seeded from the tick, not `Math.random`, so a replay shows the crackle the
 * player saw. Render may reach for a wall clock — `src/render/world.ts` does, for
 * the anomaly pulse — but a report that reproduced everything except what the
 * screen looked like would be a strange thing to hand someone debugging feel.
 *
 * Fades with the window: the arcs thin out as the time does, so the effect is
 * telling you the same thing the gauge is.
 */
function drawArcs(ctx: CanvasRenderingContext2D, s: number, tick: number, frac: number): void {
  const n = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    // A cheap integer hash of (tick, i). The arcs must jump rather than sweep —
    // a smoothly rotating spark reads as a propeller — so this is re-rolled on a
    // slow beat instead of every frame.
    const beat = (tick / 4) | 0;
    let h = (beat * 2654435761 + i * 40503) >>> 0;
    h ^= h >>> 13;
    h = (h * 1274126177) >>> 0;
    const a = ((h >>> 8) / 0x1000000) * Math.PI * 2;
    const len = (5 + ((h >>> 4) & 7)) * s;
    const r0 = 6 * s;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    // One kink per arc, so it is a discharge rather than a whisker.
    const midR = r0 + len * 0.55;
    const kink = (((h >>> 20) & 15) / 15 - 0.5) * 0.9;
    ctx.beginPath();
    ctx.moveTo(cosA * r0, sinA * r0);
    ctx.lineTo(Math.cos(a + kink) * midR, Math.sin(a + kink) * midR);
    ctx.lineTo(cosA * (r0 + len), sinA * (r0 + len));
    ctx.strokeStyle = `rgba(214,164,255,${(0.35 + 0.45 * frac).toFixed(3)})`;
    ctx.lineWidth = 1.1 * s;
    ctx.stroke();
  }
}

/**
 * The ship, rotated to its velocity.
 *
 * It now carries phase. The prototype distinguished only held-vs-not, so `flyby`
 * — where you are burning fuel hard to brake an unbound approach — looked exactly
 * like a normal capture, and the only cue was HUD text.
 */
export function drawShip(ctx: CanvasRenderingContext2D, cam: Camera, snap: RenderSnapshot): void {
  const x = toScreenX(cam, snap.x);
  const y = toScreenY(cam, snap.y);
  const ang = Math.atan2(snap.vy, snap.vx);
  const s = cam.scale;
  const phase = snap.capture?.phase;

  ctx.save();
  ctx.translate(x, y);
  // The arcs are drawn before the rotation, in the ship's own frame but unturned:
  // a discharge has no nose, and rotating it made the whole effect appear to spin
  // with the ship every time it swung through a capture.
  if (snap.chargedFrac > 0) drawArcs(ctx, s, snap.tick, snap.chargedFrac);
  ctx.rotate(ang);
  shipPath(ctx, s);
  ctx.fillStyle = snap.held ? '#fff' : '#cfdcf2';
  ctx.fill();

  if (phase === 'flyby') {
    // braking an unbound approach: amber, matching the anchor line
    ctx.strokeStyle = 'rgba(255,176,32,.95)';
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
  } else if (snap.held) {
    ctx.strokeStyle = 'rgba(185,140,255,.9)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
  }
  ctx.restore();
}
