/**
 * The ship and its trail.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';
import { BOOST_AMBER, FLAME_DEEP, FLAME_FADE, FLAME_HOT, FLAME_MID, withAlpha } from './palette.ts';

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

  /**
   * @param warp 0 for ordinary flight; 1 during the ceremony's full warp.
   * @param warpT Seconds into the ceremony, for the pulse.
   *
   * WHY THE WAKE PULSES AND THE STARS DO NOT. The starfield sells the SPEED — a
   * whole sky moving at once — and it does that by being uniform; a flickering
   * background would read as a rendering fault rather than as motion. The wake is
   * the one thing on screen attached to the ship, so it is where an engine can be
   * heard without anything else having to shake. It is also the only element the
   * player has been watching all run: making it behave differently is a statement
   * about the ship, not about the scene.
   *
   * The pulse travels ALONG the wake rather than flashing it whole. A wake that
   * brightens uniformly is a lamp being turned up; one with a wave running down it
   * is something being expelled, which is what a drive does.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    shipX: number,
    shipY: number,
    warp = 0,
    warpT = 0,
  ): void {
    const n = this.pts.length;
    const gap = this.cfg.trailHeadGap;
    const gap2 = gap * gap;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]!;
      // Keep the wake clear of the ship. Distance-based rather than "skip the
      // newest point", because how far back that point sits varies with speed.
      const dx = p.x - shipX;
      const dy = p.y - shipY;
      if (dx * dx + dy * dy < gap2) continue;
      const f = i / (n - 1 || 1); // 0 at the tail, 1 at the head
      drawWakePoint(ctx, this.cfg, toScreenX(cam, p.x), toScreenY(cam, p.y), {
        f,
        speed: p.speed,
        scale: cam.scale,
        warp,
        warpT,
      });
    }
  }
}

/** Where one point of a wake sits in it, and what the wake is doing. */
export interface WakePoint {
  /** 0 at the tail, 1 at the head. Drives size, brightness and streak length. */
  f: number;
  /** Speed the ship was going here, px/s. Drives the colour. */
  speed: number;
  scale: number;
  /** 0 for ordinary flight; 1 during the ceremony's full warp. */
  warp: number;
  /** Seconds into the ceremony, for the pulse. */
  warpT: number;
}

/**
 * How big a wake point draws, and how wide the streak it throws is.
 *
 * SPLIT OUT SO A CALLER CAN SPACE BY IT. `signature.ts` hangs a curtain out of
 * these streaks and needs them touching without merging, which is a statement
 * about their WIDTH — and that width varies threefold along a wake, because it is
 * built from `f` and from speed. A caller pacing itself by a fixed step gets a comb
 * at one end and a solid sheet at the other; pacing by this it gets the same
 * texture everywhere.
 *
 * `drawWakePoint` uses them too, so there is one formula rather than a copy that
 * would drift the first time a wake was retuned.
 */
export function wakeDotRadius(cfg: RenderConfig, at: WakePoint): number {
  const { trailSpeedCalm: calm, trailSpeedHot: hot } = cfg;
  const heat = Math.max(0, Math.min(1, (at.speed - calm) / Math.max(1, hot - calm)));
  return (0.6 + (2.6 + 1.6 * heat) * at.f) * at.scale;
}

export function wakeStreakWidth(radius: number): number {
  return Math.max(0.6, radius * 0.5);
}

/**
 * One point of a wake.
 *
 * EXTRACTED SO THE SIGNATURE CAN BE DRAWN BY IT. The line a run draws through the
 * carpet is the ship's wake — the whole of it rather than the last half second —
 * and it was briefly drawn as a stroked line of its own, which put two wakes on the
 * ceremony in two different treatments. Reported as exactly that. There is one
 * renderer now, and `src/render/signature.ts` feeds it a longer path.
 *
 * Takes SCREEN coordinates rather than world ones, which is the whole reason this
 * is a free function and not a method: the trail lives in the world and the
 * signature is a fitted portrait of a path that is no longer where it happened, so
 * they agree on everything except how a point becomes a pixel.
 *
 * Each point keeps the speed it was laid down at, so a boosted exit leaves a
 * visibly hot streak that cools as the ship settles — the wake records the run
 * rather than just reporting the current instant.
 */
export function drawWakePoint(
  ctx: CanvasRenderingContext2D,
  cfg: RenderConfig,
  sx: number,
  sy: number,
  at: WakePoint,
): void {
  const { trailSpeedCalm: calm, trailSpeedHot: hot } = cfg;
  const { f, scale, warp, warpT } = at;
  const heat = Math.max(0, Math.min(1, (at.speed - calm) / Math.max(1, hot - calm)));
  let [r, g, b] = trailColor(heat);
  const rad = wakeDotRadius(cfg, at);
  let alpha = (0.08 + 0.5 * f) * (0.75 + 0.35 * heat);

  if (warp > 0) {
    // ---- sparks, not bubbles
    //
    // The first version scaled the wake's own dots up with the pulse, and a
    // circle that grows is a bubble however brightly it is lit — reported as
    // "too bubbly". At lightspeed a wake is not a row of beads getting bigger,
    // it is bright specks tearing past, so the ceremony swaps the primitive
    // rather than the parameters: a short streak, thinner than the dot it
    // replaces and longer than it is wide.
    //
    // The wave still travels down the trail — `f` is 1 at the head, so
    // subtracting it from the phase sends the crest away from the ship, which
    // is the direction an exhaust goes. What it drives is now LENGTH and
    // brightness, not girth.
    const wave = 0.5 + 0.5 * Math.sin((warpT * 9 - f * 7) * Math.PI);
    const pulse = warp * wave;
    // Toward the hot end of the wake's own ramp rather than a new colour: the
    // trail already means "how fast", and this is the fastest the ship goes.
    const peak = trailColor(1);
    r = Math.round(r + (peak[0] - r) * pulse);
    g = Math.round(g + (peak[1] - g) * pulse);
    b = Math.round(b + (peak[2] - b) * pulse);
    alpha = Math.min(1, alpha * (1 + 2.6 * pulse));
    const len = (5 + 26 * pulse) * f * scale;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.lineWidth = wakeStreakWidth(rad);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    // Straight down the screen, with the streaming sky. A spark belongs to the
    // motion of the field, not to the ship's own heading.
    ctx.lineTo(sx, sy + len);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.arc(sx, sy, rad, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  ctx.fill();
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
  const h = flick;
  const reach = (18 + 52 * vis) * s;

  // BRIGHTNESS DOES NOT SCALE TO NOTHING, and that was the bug the first two
  // attempts at this shared. Opacity was linear in `vis`, on the assumption that
  // heat near 1.0 would be the common case. It is not — a typical real skim scores
  // around 0.25, so `vis` sits near 0.5 and every flame rendered at half strength:
  // measured off a real session, peak alpha 0.37 against a near-white core, which
  // over black is RGB (94,87,70). A warm grey smudge, no brighter than the trail
  // that is always there. Reported as "no flames or redness".
  //
  // So heat drives SIZE and COLOUR TEMPERATURE, and only gently drives opacity. A
  // small fire is still a fire.
  const alpha = 0.58 + 0.42 * vis;

  // Colour temperature climbs with heat, which is both how fire works and what
  // keeps a faint one legible: the white-hot core is reserved for a flare that
  // earned it, and everything below reads as unmistakable orange-red rather than
  // washing out to cream. Squared, so white is the top of the range and not its
  // middle.
  const white = vis * vis;
  const cr = 255;
  const cg = Math.round(150 + 94 * white);
  const cb = Math.round(38 + 176 * white);

  ctx.save();
  // Additive, so overlapping tongues brighten toward white at the core the way a
  // real flame does, and so the ship's own fill shows through the thin edges of
  // it rather than being covered by a flat orange shape.
  ctx.globalCompositeOperation = 'lighter';

  // ---- the wake: a tapered tongue streaming off the tail
  const wake = ctx.createLinearGradient(-3 * s, 0, -reach, 0);
  wake.addColorStop(0, `rgba(${cr},${cg},${cb},${(alpha * h).toFixed(3)})`);
  wake.addColorStop(0.3, withAlpha(FLAME_HOT, (0.72 * alpha * h).toFixed(3)));
  wake.addColorStop(0.68, withAlpha(FLAME_DEEP, (0.4 * alpha * h).toFixed(3)));
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

  // ---- the bow shock: a hot crescent standing off the nose
  const nose = 9 * s;
  const shockR = (10 + 6 * vis) * s;
  const shock = ctx.createRadialGradient(nose, 0, 0, nose, 0, shockR);
  shock.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.8 * alpha * h).toFixed(3)})`);
  shock.addColorStop(0.45, withAlpha(FLAME_MID, (0.5 * alpha * h).toFixed(3)));
  shock.addColorStop(1, withAlpha(FLAME_FADE, 0));
  ctx.fillStyle = shock;
  ctx.beginPath();
  ctx.arc(nose, 0, shockR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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
function drawArcs(
  ctx: CanvasRenderingContext2D,
  s: number,
  tick: number,
  frac: number,
  hops: number,
): void {
  // The charge builds as the chain does. Each body taken adds arcs and brightness,
  // so a window that is going well is visibly hotter than one that is not — the
  // ship reports the streak, which no countdown can.
  //
  // Capped, because the effect has to stay legible at the point it matters most:
  // past about four the arcs stop reading as separate discharges and start
  // reading as a fuzzy ring.
  const heat = Math.min(1, hops / 4);
  const n = 5 + Math.round(heat * 7);
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
    const len = (5 + ((h >>> 4) & 7)) * (1 + heat * 0.7) * s;
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
    ctx.strokeStyle = `rgba(214,164,255,${((0.35 + 0.45 * frac) * (0.7 + 0.3 * heat)).toFixed(3)})`;
    ctx.lineWidth = (1.1 + heat * 0.7) * s;
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
export function drawShip(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: RenderSnapshot,
  /** Bodies hopped to in the current charged window. Drives how hot the arcs are. */
  hops = 0,
  burn = 0,
  timeMs = 0,
  /**
   * Heading in radians, when the velocity cannot supply one.
   *
   * `endRun` zeroes the velocity, and `atan2(0, 0)` is 0 — so at the end of every
   * run the ship silently snaps to pointing RIGHT, whatever it was doing a tick
   * earlier. Harmless while the frame is held for a fraction of a second over a
   * crash; not harmless when the ceremony holds that frame and flies the sky past
   * it for several seconds.
   */
  heading?: number,
): void {
  const x = toScreenX(cam, snap.x);
  const y = toScreenY(cam, snap.y);
  const ang = heading ?? Math.atan2(snap.vy, snap.vx);
  const s = cam.scale;
  const phase = snap.capture?.phase;

  ctx.save();
  ctx.translate(x, y);
  // The arcs are drawn before the rotation, in the ship's own frame but unturned:
  // a discharge has no nose, and rotating it made the whole effect appear to spin
  // with the ship every time it swung through a capture.
  if (snap.chargedFrac > 0) {
    // A glow under the arcs, growing with the chain. It is what makes the ramp
    // visible at a glance — arc COUNT is only countable when you are not flying.
    const heat = Math.min(1, hops / 4);
    const r = (10 + heat * 14) * s;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const a = (0.16 + 0.3 * heat) * snap.chargedFrac;
    g.addColorStop(0, `rgba(198,150,255,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(168,92,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    drawArcs(ctx, s, snap.tick, snap.chargedFrac, hops);
  }
  ctx.rotate(ang);
  // Under the hull, so the silhouette stays readable through the brightest part
  // of the fire — the ship is what the player is steering.
  if (burn > 0) drawBurn(ctx, burn, s, timeMs);
  shipPath(ctx, s);
  ctx.fillStyle = snap.held ? '#fff' : '#cfdcf2';
  ctx.fill();

  if (phase === 'flyby') {
    // braking an unbound approach: amber, matching the anchor line
    ctx.strokeStyle = withAlpha(BOOST_AMBER, 0.95);
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
  } else if (snap.held) {
    ctx.strokeStyle = 'rgba(185,140,255,.9)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
  }
  ctx.restore();
}
