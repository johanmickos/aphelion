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
 * Reentry fire, drawn in ship-local space with the nose along +x.
 *
 * A bow shock ahead of the nose and a wake streaming behind it, because that is
 * where the heat actually is — a plume out of the back alone would read as a
 * thruster, which is the one thing this must not look like: the ship has no
 * engine, and the whole game is about not having one.
 *
 * RED, AND ONLY HERE. Colour on an award means how good it was and nothing else —
 * the rarity ladder in `accolade.ts` owns that, and the burn's points and word
 * ride it like every other award. This is not an award. It is the ship being on
 * fire, and fire is the one thing in the game allowed to be the colour of fire.
 * It is kept clear of the amber `flyby` outline by being redder, much larger, and
 * soft-edged where that cue is a 1.6px stroke.
 *
 * The flicker is driven by `timeMs`, which render may read and the simulation may
 * not. Nothing here feeds back: the flame is a picture of `heat`, and `heat` came
 * from the scorer, which is an observer.
 */
function drawBurn(ctx: CanvasRenderingContext2D, heat: number, s: number, timeMs: number): void {
  // Two out-of-phase waves rather than one, so the flame breathes instead of
  // pulsing on a period the eye can lock onto and start reading as a countdown.
  const flick = 0.86 + 0.1 * Math.sin(timeMs * 0.033) + 0.06 * Math.sin(timeMs * 0.071 + 1.3);

  // PRESENTATION CURVE, not a change to the physics. `heat` stays exactly the
  // number the scorer integrated; what it drives here is a picture, and the two
  // do not have to be linear in each other.
  //
  // They were, and the flame lost the bottom half of its range to it: a real 2px
  // graze scores heat around 0.25, which drew a 27px plume at 21% alpha over a
  // moving starfield — reported, accurately, as no flare at all. The square root
  // lifts that to 0.5, and leaves the top of the range where it was. Paired with
  // `burnMinHeat`, it means the faintest fire that can exist is one you can see.
  const vis = Math.sqrt(heat);
  const h = vis * flick;
  const reach = (18 + 52 * vis) * s;

  ctx.save();
  // Additive, so overlapping tongues brighten toward white at the core the way a
  // real flame does, and so the ship's own fill shows through the thin edges of
  // it rather than being covered by a flat orange shape.
  ctx.globalCompositeOperation = 'lighter';

  // ---- the wake: a tapered tongue streaming off the tail
  const wake = ctx.createLinearGradient(-3 * s, 0, -reach, 0);
  wake.addColorStop(0, `rgba(255,236,190,${(0.85 * h).toFixed(3)})`);
  wake.addColorStop(0.28, `rgba(255,138,40,${(0.7 * h).toFixed(3)})`);
  wake.addColorStop(0.65, `rgba(226,42,18,${(0.34 * h).toFixed(3)})`);
  wake.addColorStop(1, 'rgba(150,16,8,0)');
  ctx.fillStyle = wake;
  ctx.beginPath();
  ctx.moveTo(-2 * s, -5.4 * s);
  // Two long curves meeting at a point, drawn with the control handles pulled
  // outward so the tongue swells just behind the hull before it narrows.
  ctx.quadraticCurveTo(-reach * 0.45, -7 * s * (0.6 + 0.5 * vis), -reach, 0);
  ctx.quadraticCurveTo(-reach * 0.45, 7 * s * (0.6 + 0.5 * vis), -2 * s, 5.4 * s);
  ctx.closePath();
  ctx.fill();

  // ---- the bow shock: a thin hot crescent standing off the nose
  const nose = 9 * s;
  const shock = ctx.createRadialGradient(nose, 0, 0, nose, 0, 13 * s);
  shock.addColorStop(0, `rgba(255,246,214,${(0.7 * h).toFixed(3)})`);
  shock.addColorStop(0.45, `rgba(255,122,30,${(0.42 * h).toFixed(3)})`);
  shock.addColorStop(1, 'rgba(210,30,12,0)');
  ctx.fillStyle = shock;
  ctx.beginPath();
  ctx.arc(nose, 0, 13 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * The ship, rotated to its velocity.
 *
 * It now carries phase. The prototype distinguished only held-vs-not, so `flyby`
 * — where you are burning fuel hard to brake an unbound approach — looked exactly
 * like a normal capture, and the only cue was HUD text.
 */
export function drawShip(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: RenderSnapshot,
  burn = 0,
  timeMs = 0,
): void {
  const x = toScreenX(cam, snap.x);
  const y = toScreenY(cam, snap.y);
  const ang = Math.atan2(snap.vy, snap.vx);
  const s = cam.scale;
  const phase = snap.capture?.phase;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Under the hull, so the silhouette stays readable through the brightest part
  // of the fire — the ship is what the player is steering.
  if (burn > 0) drawBurn(ctx, burn, s, timeMs);
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
