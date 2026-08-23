/**
 * The charged storm: what the sky does while a charged window is running.
 *
 * See `SimConfig.chargedSecs`. The ship leaves an anomaly carrying its colour,
 * and the space around it becomes a purple nebula.
 *
 * IT IS BUILT FROM WORLD-ANCHORED PUFFS, NOT ONE GRADIENT ON THE SHIP. A single
 * radial gradient centred on the ship travels with it perfectly and is completely
 * dead: the same smooth blob at every moment, with no structure to move past, so
 * flying through it feels like carrying a lamp. Instead the storm is a field of
 * overlapping clouds hashed from a coarse WORLD grid — they parallax with the
 * starfield, they differ from one another in size and hue, and the gaps between
 * them stay near black. The ship is always inside the storm because cells are
 * drawn around wherever it is; but which cloud it is inside changes as it flies.
 *
 * Some puffs lean pink and some deep violet, which is where the variegation comes
 * from. Nothing here darkens: the sky under it is already black, so "darker
 * areas" are simply the places no puff is lighting.
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

/**
 * World spacing between aurora curtains.
 *
 * The clouds give the storm volume but no direction, and a field of soft blobs
 * reads as fog rather than as an aurora — reported as "I don't really see any
 * northern lights effects". These are the northern lights: long wavy ribbons
 * hung across the field, anchored in world y so they sweep past as the ship
 * climbs.
 */
const BAND = 480;

/**
 * Seconds the closing bloom-and-collapse runs for.
 *
 * Long enough to exhale rather than snap: at 0.5 the collapse read as the effect
 * being switched off, which is accurate but joyless. The bloom stays brief — the
 * length belongs in the release, not the attack.
 */
export const OUTRO_SECS = 1.05;

/** Fraction of the window over which the storm visibly agitates before closing. */
const AGITATE_FROM = 0.22;

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

export function drawNebula(
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

  const s = cam.scale;

  // How hard the storm is running, and how big. While the window is live both
  // hold: only the last fifth agitates, and only the outro moves them.
  let strength = 1;
  let swell = 1;
  let beat = 1.1;

  if (outro !== null) {
    // A short bloom and a long collapse — the shape of an exhale. The collapse is
    // cubic so it leaves quickly at first and then lingers, instead of the linear
    // ramp that read as the effect being switched off.
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

  // A floor of colour across the sky, so the clouds have no hard edge where they
  // run out. Deliberately faint — the structure is the point, and a strong flat
  // layer under it is what made the first version read as a filter.
  const skyA = Math.min(0.4, (0.1 + 0.035 * pulse) * strength);
  ctx.fillStyle = `rgba(58,18,104,${skyA.toFixed(3)})`;
  ctx.fillRect(0, 0, viewportW, viewportH);

  // Clouds, on a world grid so they parallax past the ship rather than riding it.
  const reach = REACH * swell;
  const c0x = Math.floor((snap.x - reach) / CELL);
  const c1x = Math.floor((snap.x + reach) / CELL);
  const c0y = Math.floor((snap.y - reach) / CELL);
  const c1y = Math.floor((snap.y + reach) / CELL);

  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const h = hash(cx, cy);
      // Not every cell holds a cloud; the gaps are what make it look like weather
      // rather than wallpaper.
      if (unit(h, 24) > 0.82) continue;

      // Jittered off the cell centre so the grid itself is never visible.
      const wx = (cx + 0.15 + unit(h, 0) * 0.7) * CELL;
      const wy = (cy + 0.15 + unit(h, 4) * 0.7) * CELL;

      // Distance from the ship decides how lit this cloud is: the storm is always
      // densest around the ship, but WHICH clouds are dense changes as it moves.
      const dx = wx - snap.x;
      const dy = wy - snap.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > reach) continue;
      const near = 1 - d / reach;

      // Each cloud breathes on its own phase, so the field churns instead of
      // throbbing in unison.
      const phase = unit(h, 8) * Math.PI * 2;
      const own = 0.6 + 0.4 * Math.sin(t * Math.PI * 0.5 * beat + phase);

      // Pink or deep violet. The mix is per-cloud and fixed, which is what gives
      // the field its variegation.
      const pink = unit(h, 12);
      const r = Math.round(96 + 118 * pink);
      const g = Math.round(28 + 34 * pink);
      const b = Math.round(168 + 62 * pink);

      const rad = (CELL * (0.62 + unit(h, 16) * 0.75) * swell + 40) * s;
      // Clouds overlap, and alpha compositing stacks: four at 0.13 reach about
      // 0.40 together, which is where the densest part of the field lands. The cap
      // is what stops the outro's bloom turning the screen into a flat sheet.
      const a = Math.min(0.46, 0.24 * near * near * own * strength * (0.7 + 0.5 * pink));
      if (a < 0.004) continue;

      const px = toScreenX(cam, wx);
      const py = toScreenY(cam, wy);
      // Cull off-screen clouds before touching a gradient. `reach` is 760 world
      // units in every direction and the viewport is a tall narrow slice of that,
      // so most cells in the grid are behind the camera's back — and each one that
      // is not culled costs a full-viewport alpha blend, which is the sort of
      // overdraw a phone notices.
      if (px + rad < 0 || px - rad > viewportW || py + rad < 0 || py - rad > viewportH) continue;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(a * 0.42).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }

  drawCurtains(ctx, cam, snap, t, viewportH, strength, swell);

  ctx.restore();
}

/**
 * The soft-edge profile of a curtain: width multiplier and alpha weight per pass.
 *
 * Built rather than hand-listed, because the hand-listed version was the problem.
 * Three passes at 86/44/16 drew three visibly concentric ribbons — the eye reads
 * the steps as banding, and banding is what made the curtains look drawn on.
 *
 * The alpha weight is a Gaussian in the width, so the stack sums to something
 * close to a real blurred edge: wide passes contribute almost nothing on their
 * own and the light builds smoothly toward the spine. Eight passes is where the
 * banding stops being visible; past that the extra strokes are paying for
 * differences under a 255th of an alpha step.
 */
const PASSES = Array.from({ length: 8 }, (_, i) => {
  const u = i / 7;
  const width = 184 - 162 * u;
  // exp(-2.6 t^2) over the normalised width, then scaled so the whole stack sums
  // to roughly the alpha the three-pass version reached at the spine.
  const t = 1 - u;
  return { width, weight: Math.exp(-2.6 * t * t) };
});
const PASS_SUM = PASSES.reduce((n, p) => n + p.weight, 0);

/**
 * The northern lights: wavy curtains hung across the field.
 *
 * Drawn as a stack of strokes with a Gaussian width profile rather than as a
 * blurred shape. `ctx.filter = 'blur()'` would be the direct way and is declined:
 * it forces an offscreen rasterisation per use, its cost scales with the blurred
 * area rather than the geometry, and support across the engines this has to run on
 * is uneven. A stroke stack costs a fixed handful of polyline draws and looks the
 * same once the profile is smooth — see `PASSES`.
 *
 * Anchored on world y and drifting in x, so a curtain sweeps down past the ship
 * as it climbs and never sits still on the screen. The wave is two summed sines
 * of different periods, because a single one reads as a drawn ripple; two make it
 * look like it is being blown.
 */
function drawCurtains(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: RenderSnapshot,
  t: number,
  viewportH: number,
  strength: number,
  swell: number,
): void {
  const s = cam.scale;
  const b0 = Math.floor((snap.y - REACH) / BAND);
  const b1 = Math.floor((snap.y + REACH) / BAND);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let bi = b0; bi <= b1; bi++) {
    const h = hash(bi, 0x51ed);
    // Gaps between curtains, so they arrive rather than parade.
    if (unit(h, 24) > 0.85) continue;

    const baseY = (bi + 0.2 + unit(h, 0) * 0.6) * BAND;
    const near = 1 - Math.min(1, Math.abs(baseY - snap.y) / REACH);
    if (near <= 0.02) continue;

    // Amplitude against wavelength is what decides whether a curtain reads as a
    // ribbon or as a snake. At 40-130 over a 260-580 wavelength the slope never
    // exceeded about 0.5 and they lay along the screen like horizontal worms; at
    // 90-240 over 220-420 the band climbs and dives across the view instead.
    const amp = (130 + unit(h, 4) * 110) * swell;
    const wave = 200 + unit(h, 8) * 160;
    const drift = t * (14 + unit(h, 12) * 22) * (unit(h, 20) < 0.5 ? -1 : 1);
    const pink = unit(h, 16);
    const r = Math.round(112 + 130 * pink);
    const g = Math.round(30 + 42 * pink);
    const b = Math.round(186 + 56 * pink);

    // Enough span to cross the widest field with room to spare, in world units.
    const halfSpan = 900;
    const step = 26;
    const y = (wx: number): number =>
      baseY +
      Math.sin((wx + drift) / wave) * amp +
      Math.sin((wx - drift * 0.6) / (wave * 0.43)) * amp * 0.35;

    ctx.beginPath();
    let first = true;
    for (let wx = snap.x - halfSpan; wx <= snap.x + halfSpan; wx += step) {
      const px = toScreenX(cam, wx);
      const py = toScreenY(cam, y(wx));
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }

    // Vertical cull: a curtain whose whole band is off-screen still costs three
    // wide strokes, and most bands in range are above or below the viewport.
    const mid = toScreenY(cam, baseY);
    const reachPx = (amp + 150) * s;
    if (mid + reachPx < 0 || mid - reachPx > viewportH) continue;

    const lit = near * near * strength;
    for (const pass of PASSES) {
      // 0.45 and not the 0.34 the three hard passes summed to. A Gaussian stack
      // spreads the same integrated alpha over a visibly wider band, so matching
      // the old total would have read as a dimmer curtain even though the light
      // under the spine is the same.
      const alpha = Math.min(0.5, (pass.weight / PASS_SUM) * 0.45 * lit);
      if (alpha < 0.003) continue;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(4)})`;
      ctx.lineWidth = pass.width * s * swell;
      ctx.stroke();
    }
  }
}
