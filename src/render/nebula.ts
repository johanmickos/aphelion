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
  const skyA = Math.min(0.4, (0.05 + 0.02 * pulse) * strength);
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
      const a = Math.min(0.42, 0.13 * near * near * own * strength * (0.7 + 0.5 * pink));
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

  ctx.restore();
}
