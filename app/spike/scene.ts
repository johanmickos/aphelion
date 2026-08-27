/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * The scene M0.5 measures, and the Canvas2D drawing of it. Every candidate that
 * draws its scene in Canvas2D calls these same functions, so a difference
 * between two candidates is a difference in their post-processing and nothing
 * else. That is the whole reason the scene lives apart from the candidates.
 *
 * What is in it, per the plan: ~120 rungs deforming toward 3 bodies, 40 glowing
 * elements at mixed energies. Plus the things those two cannot be drawn without
 * — the sky, dust, the bodies' own anatomy, the craft and one boundary gradient
 * — because a rung that bows toward nothing is not the frame the phone has to
 * survive.
 *
 * Two rules govern the arithmetic here, and both come straight from why this
 * step exists:
 *
 *   - **Nothing returns early.** A real renderer would skip bodies too far from
 *     a rung point to bend it. This one does not, because `VISION.md` records a
 *     rendering slowdown that reached a phone, and that class of bug hides
 *     behind an average of calls that mostly return early. The scene is the
 *     worst case on purpose.
 *   - **Every rung is recomputed every frame.** No caching, no dirty flags. The
 *     craft moves, so the wake moves, so the lattice is new every frame in the
 *     real game too.
 */
import {
  BODY_FILL,
  CORE,
  DUSK,
  ION,
  VOID,
  identity,
  identityBright,
  withAlpha,
} from './palette.ts';

/** Spec 05 §3: DUSK at α 0.16, and α 0.28 on every 5th — the addressed cadence. */
const RUNG_PLAIN = withAlpha(DUSK, 0.16);
const RUNG_ADDRESSED = withAlpha(DUSK, 0.28);

/** Spec 00 §7: the design space is a phone held in portrait (ADR-0010). */
export const DESIGN_W = 1170;
export const DESIGN_H = 2532;

/** Spec 05 §3: bow is clamped here, and the clamp is load-bearing for the look. */
const BOW_MAX = 30;
/** Spec 05 §3: `wake(d) = W * exp(-d / 34)`. */
const WAKE_FALLOFF = 34;
const WAKE_AMPLITUDE = 26;

/** Spec 05 §3, adapted: 25 m of altitude, at the spike's provisional m→px scale. */
const RUNG_SPACING = 26;
const RUNG_COUNT = 120;
/**
 * One sample every 14 design px across a 1170-px field: 86 points per rung,
 * 10,320 points per frame, each of which asks three bodies and the craft where
 * they are. This number is the single biggest lever on the verdict, so it is
 * named rather than buried, and it is reported with the measurement.
 */
const RUNG_SAMPLE_STEP = 14;

const DUST_COUNT = 140;

/**
 * Spec 07 §2: the outer band starts 220 m from the line and the fire band 90 m.
 * At the spike's provisional metre-to-pixel scale that is the whole graded
 * region, and it is drawn as one dithered ramp (spec 14 §3 rule 2).
 */
const BOUNDARY_W = 320;
const GLOW_COUNT = 40;

export interface SceneBody {
  x: number;
  y: number;
  r: number;
  /** oklch hue in degrees — spec 00 §2. Identity, and it never changes. */
  hue: number;
  /** Scales the bow's magnitude with mass, per spec 05 §3. */
  G: number;
  rim: string;
  tide: string;
  strata1: string;
  strata2: string;
  core: string;
}

/**
 * One glowing element. `energy` is the ordinal channel and the only thing that
 * decides how far it blooms (spec 00 §3) — no code path here sets bloom from a
 * hue.
 */
export interface SceneGlow {
  cx: number;
  cy: number;
  radius: number;
  a0: number;
  a1: number;
  /** 0..3, the E-step. */
  energy: number;
  colour: string;
  /** Arcs are compass windows and rims; dots are ghosts, cores and motes. */
  dot: boolean;
}

export interface Scene {
  bodies: SceneBody[];
  glows: SceneGlow[];
  /** x, y, alpha, per mote. */
  dust: Float32Array;
  craft: { x: number; y: number; vx: number; vy: number };
  scroll: number;
  /** Scratch for one rung's deformed polyline; reused every rung, every frame. */
  points: Float32Array;
  samples: number;
  boundary: HTMLCanvasElement | null;
  /** Reported alongside the timings so a number can be read back in context. */
  facts: Record<string, number>;
}

/**
 * A deterministic generator. `Math.random` is banned in `src/sim/` and
 * `src/state/` and this is neither, but a scene that differs between two runs
 * cannot be compared with itself, and the whole exercise is a comparison.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The boundary gradient, baked once with an ordered dither rather than
 * interpolated: spec 14 §3 rule 2 says any fill ramping over more than ~100
 * design px is dithered, and this one ramps over 600. Baking it is also the
 * honest cost — a real renderer would not re-dither a static ramp per frame.
 */
function bakeBoundary(width: number, height: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Spec 07 §3: the gradient fills from the outer band's inner edge to the
      // line and intensifies toward it. Drawn at the low end of `heat` — the
      // boundary idling, which is the state it is in most of the time.
      const t = x / (width - 1);
      const a = t * t * 0.3 * 255;
      const threshold = ((bayer[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      const i = (y * width + x) * 4;
      img.data[i] = 0xff;
      img.data[i + 1] = 0x5f;
      img.data[i + 2] = 0xa2;
      img.data[i + 3] = Math.floor(a) + (a % 1 > threshold ? 1 : 0);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createScene(): Scene {
  const rand = rng(0x4a1f);

  // Three bodies, spread across the corridor so no rung escapes all of them.
  // Hues from spec 00 §2's exemplar slots, at the real oklch(0.72 0.13 H).
  const bodies: SceneBody[] = [
    { hue: 55, x: 300, y: 620, r: 140, G: 3.4 },
    { hue: 215, x: 850, y: 1320, r: 90, G: 2.2 },
    { hue: 170, x: 420, y: 2020, r: 62, G: 1.5 },
  ].map((b) => ({
    ...b,
    rim: identity(b.hue),
    tide: identityBright(b.hue),
    strata1: withAlpha(identity(b.hue), 0.22),
    strata2: withAlpha(identity(b.hue), 0.14),
    core: withAlpha(identity(b.hue), 0.8),
  }));

  // 40 glowing elements at mixed energies. Spec 00 §3: at most one E3 is alive
  // at a time, so the mix is 1 × E3, 12 × E2, 27 × E1 — the busiest legal frame,
  // not an impossible one.
  const glows: SceneGlow[] = [];
  for (let i = 0; i < GLOW_COUNT; i++) {
    const energy = i === 0 ? 3 : i < 13 ? 2 : 1;
    const host = bodies[i % bodies.length]!;
    const spread = 1 + Math.floor(i / bodies.length) * 0.34;
    const a0 = rand() * Math.PI * 2;
    glows.push({
      cx: host.x,
      cy: host.y,
      radius: host.r * spread + 40,
      a0,
      a1: a0 + 0.25 + rand() * 0.5,
      energy,
      colour: energy === 3 ? CORE : identity(host.hue),
      dot: i % 3 === 0,
    });
  }

  const dust = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dust[i * 3] = rand() * DESIGN_W;
    dust[i * 3 + 1] = rand() * DESIGN_H;
    // Spec 05 §2: α 0.1–0.3. Brightness varies; velocity never does.
    dust[i * 3 + 2] = 0.1 + rand() * 0.2;
  }

  const samples = Math.ceil(DESIGN_W / RUNG_SAMPLE_STEP) + 1;

  return {
    bodies,
    glows,
    dust,
    craft: { x: DESIGN_W * 0.5, y: DESIGN_H * 0.58, vx: 0, vy: 0 },
    scroll: 0,
    points: new Float32Array(samples * 2),
    samples,
    boundary: bakeBoundary(160, 8),
    facts: {
      rungs: RUNG_COUNT,
      rungSamples: samples,
      rungPointsPerFrame: RUNG_COUNT * samples,
      bodies: bodies.length,
      glows: GLOW_COUNT,
      dust: DUST_COUNT,
    },
  };
}

/**
 * Advances the scene by wall-clock seconds. The spike has no simulation — M0.5
 * measures pixels, and ADR-0006 puts the only clock in `src/sim/`, which is not
 * this. `t` drives the craft so the wake is live and the lattice never repeats.
 */
export function advance(scene: Scene, t: number): void {
  scene.scroll = (t * 210) % (RUNG_SPACING * RUNG_COUNT);
  const c = scene.craft;
  const x = DESIGN_W * 0.5 + Math.sin(t * 0.9) * 300;
  const y = DESIGN_H * 0.58 + Math.cos(t * 0.7) * 220;
  c.vx = x - c.x;
  c.vy = y - c.y;
  c.x = x;
  c.y = y;

  for (let i = 0; i < DUST_COUNT; i++) {
    // Strictly parallel fall at world speed (spec 05 §2). No parallax: every
    // mote carries the same velocity, which is why the offset is shared.
    scene.dust[i * 3 + 1] = (scene.dust[i * 3 + 1]! + 3.4) % DESIGN_H;
  }

  for (const g of scene.glows) {
    g.a0 += 0.011;
    g.a1 += 0.011;
  }
}

/**
 * Fills `scene.points` with one rung's deformed polyline.
 *
 * Every sample asks every body and the craft. Three bodies is three `exp` and
 * three `sqrt` per point before the wake is added, and none of it is skipped.
 */
function deformRung(scene: Scene, y: number): void {
  const { points, samples, bodies, craft } = scene;
  for (let i = 0; i < samples; i++) {
    const px = i * RUNG_SAMPLE_STEP;
    let dx = 0;
    let dy = 0;

    for (const b of bodies) {
      const ax = b.x - px;
      const ay = b.y - y;
      const d = Math.sqrt(ax * ax + ay * ay);
      // Spec 05 §3: bow(d) = min(30, (G * 90) / (d + 26)) * exp(-d / 150)
      const m = Math.min(BOW_MAX, (b.G * 90) / (d + 26)) * Math.exp(-d / 150);
      const inv = m / (d + 0.0001);
      dx += ax * inv;
      dy += ay * inv;
    }

    // Bows from multiple bodies sum, then clamp (spec 05 §3).
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > BOW_MAX) {
      dx = (dx / mag) * BOW_MAX;
      dy = (dy / mag) * BOW_MAX;
    }

    // The wake: displacement away from the craft, spec 05 §3.
    const wx = px - craft.x;
    const wy = y - craft.y;
    const wd = Math.sqrt(wx * wx + wy * wy);
    const w = (WAKE_AMPLITUDE * Math.exp(-wd / WAKE_FALLOFF)) / (wd + 0.0001);
    dx += wx * w;
    dy += wy * w;

    points[i * 2] = px + dx;
    points[i * 2 + 1] = y + dy;
  }
}

/**
 * Sky, boundary, dust, rungs and the bodies' unlit anatomy — everything that is
 * E0, plus the discs the lamps sit on. Nothing here blooms.
 */
export function drawStructure(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  if (scene.boundary) {
    ctx.drawImage(scene.boundary, DESIGN_W - BOUNDARY_W, 0, BOUNDARY_W, DESIGN_H);
    ctx.strokeStyle = withAlpha(ION, 0.7);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(DESIGN_W - 6, 0);
    ctx.lineTo(DESIGN_W - 6, DESIGN_H);
    ctx.stroke();
  }

  ctx.fillStyle = DUSK;
  for (let i = 0; i < DUST_COUNT; i++) {
    ctx.globalAlpha = scene.dust[i * 3 + 2]!;
    ctx.fillRect(scene.dust[i * 3]!, scene.dust[i * 3 + 1]!, 1.5, 4.5);
  }
  ctx.globalAlpha = 1;

  // Spec 05 §3: DUSK, 1px, α 0.16 plain and 0.28 on every 5th.
  ctx.lineWidth = 1;
  const span = RUNG_SPACING * RUNG_COUNT;
  for (let r = 0; r < RUNG_COUNT; r++) {
    const y = ((r * RUNG_SPACING - scene.scroll) % span) - RUNG_SPACING * 4;
    deformRung(scene, y);
    // Two strings, built once at module load. Assembling `rgba(...)` 120 times
    // a frame makes the engine re-parse a CSS colour for a value that has two
    // possible states, and none of that reaches a pixel.
    ctx.strokeStyle = r % 5 === 0 ? RUNG_ADDRESSED : RUNG_PLAIN;
    ctx.beginPath();
    ctx.moveTo(scene.points[0]!, scene.points[1]!);
    for (let i = 1; i < scene.samples; i++) {
      ctx.lineTo(scene.points[i * 2]!, scene.points[i * 2 + 1]!);
    }
    ctx.stroke();
  }

  for (const b of scene.bodies) {
    ctx.fillStyle = BODY_FILL;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    // Strata: concentric internal rings at 0.68r and 0.39r (spec 04 §1).
    ctx.lineWidth = 1;
    ctx.strokeStyle = b.strata1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = b.strata2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.39, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * The lamps: rims, tides, cores, the 40 glow elements and the craft. Drawn
 * crisp — the glow is the post pass's job, and which post pass can afford it is
 * the question M0.5 exists to answer.
 *
 * `scale` lets a candidate draw this same layer into a smaller buffer, which is
 * exactly what option (a)'s half-resolution bloom source is.
 */
export function drawEmissive(ctx: CanvasRenderingContext2D, scene: Scene, scale = 1): void {
  ctx.save();
  ctx.scale(scale, scale);

  for (const b of scene.bodies) {
    // Rim 2.5px and tide 4px, constant in design px regardless of radius
    // (spec 04 §1's scale rule).
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = b.rim;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();

    // The tide: centred on the bearing from the body to the craft (spec 04 §2).
    const bearing = Math.atan2(scene.craft.y - b.y, scene.craft.x - b.x);
    ctx.lineWidth = 4;
    ctx.strokeStyle = b.tide;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, bearing - 0.3, bearing + 0.3);
    ctx.stroke();

    ctx.fillStyle = b.core;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const g of scene.glows) {
    // Energy sets brightness, and brightness alone; hue is untouched. The post
    // pass reads brightness back out as bloom radius, which is what keeps spec
    // 00 §3's ordinal channel ordinal.
    const alpha = g.energy === 3 ? 1 : g.energy === 2 ? 0.6 : 0.35;
    ctx.globalAlpha = alpha;
    if (g.dot) {
      ctx.fillStyle = g.colour;
      ctx.beginPath();
      ctx.arc(
        g.cx + Math.cos(g.a0) * g.radius,
        g.cy + Math.sin(g.a0) * g.radius,
        5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.lineWidth = g.energy === 1 ? 1.5 : 3;
      ctx.strokeStyle = g.colour;
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.radius, g.a0, g.a1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // The craft: E2 baseline, and the brightest value on screen (spec 00 §1).
  const c = scene.craft;
  const heading = Math.atan2(c.vy, c.vx);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(heading);
  ctx.fillStyle = CORE;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  drawStructure(ctx, scene);
  drawEmissive(ctx, scene);
}
