/**
 * The charged storm: what the sky does while a charged window is running.
 *
 * See `SimConfig.chargedSecs`. The ship leaves an anomaly carrying its colour,
 * and the space around it becomes a purple nebula.
 *
 * IT TRAVELS WITH THE SHIP. That is the whole brief and it is the one thing a
 * flat screen-space wash cannot do: a uniform tint over the viewport is a filter
 * laid on the picture, and reads as the game changing its mind about the palette.
 * Anchoring the densest part to the ship's own position makes it a place the ship
 * is INSIDE of — the storm moves because you are carrying it, and the starfield
 * parallaxing through it is what sells that.
 *
 * IT DOES NOT FADE OUT. An earlier version scaled everything by the window's
 * remaining fraction, which meant the storm dimmed linearly to nothing and the
 * end of the most exciting thing in the game arrived without a signal — reported
 * as "it kind of fizzles". So the intensity holds, the last second visibly
 * agitates, and the window closes on a bloom-and-collapse that cannot be missed.
 * The countdown is the gauge's job; this one's job is atmosphere and an ending.
 *
 * There is no lightning. It was tried and cut: forked bolts over a moving
 * starfield read as tacky decoration rather than as weather, and they competed
 * with the ship's own arcs, which are the cue that actually means something.
 *
 * Nothing here feeds the simulation. The pulse reads a wall clock, which is legal
 * in render and which `src/render/world.ts` already does for the anomaly's pulse.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';

/** Radius of the storm around the ship, in design units before camera scale. */
const REACH = 620;

/** Seconds the closing bloom-and-collapse runs for. */
export const OUTRO_SECS = 0.5;

/**
 * Fraction of the window over which the storm visibly agitates before closing.
 *
 * Long enough to be a warning and short enough to still be a surprise: the whole
 * point is that the end arrives with notice, not that it is counted down twice.
 */
const AGITATE_FROM = 0.22;

/**
 * Draw the storm.
 *
 * `outro` is null while the window runs, and 0..1 through the closing animation —
 * the Scene owns that clock because the state it describes outlives the window
 * that produced it, and `chargedFrac` is already 0 by then.
 */
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

  const x = toScreenX(cam, snap.x);
  const y = toScreenY(cam, snap.y);
  const s = cam.scale;

  // How hard the storm is running, and how big it is. While the window is live
  // both hold: only the last fifth agitates, and only the outro moves them.
  let strength = 1;
  let reachMul = 1;
  let beat = 1.1;

  if (outro !== null) {
    // Bloom, then collapse. The bloom is short and bright so the eye is caught by
    // it; the collapse pulls the whole storm into the ship and takes the light
    // with it, which reads as the charge being spent rather than running out.
    const bloom = 0.3;
    if (outro < bloom) {
      const u = outro / bloom;
      strength = 1 + 1.6 * u;
      reachMul = 1 + 0.35 * u;
    } else {
      const u = (outro - bloom) / (1 - bloom);
      strength = 2.6 * (1 - u) * (1 - u);
      reachMul = 1.35 * (1 - u);
    }
  } else if (frac < AGITATE_FROM) {
    // Running out: the pulse quickens and deepens, so the last second feels
    // unstable without the room getting darker.
    const u = 1 - frac / AGITATE_FROM;
    beat = 1.1 + 4.5 * u;
    strength = 1 + 0.25 * u;
  }

  if (strength <= 0 || reachMul <= 0) return;

  const pulse = 0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * beat);

  ctx.save();

  // A tint on the whole sky, so the storm has no visible edge where it stops —
  // without it the gradient below terminates in a circle on the screen.
  const skyA = Math.min(0.6, (0.13 + 0.05 * pulse) * strength);
  ctx.fillStyle = `rgba(78,26,140,${skyA.toFixed(3)})`;
  ctx.fillRect(0, 0, viewportW, viewportH);

  // The storm proper, densest on the ship and fading outward. This is the part
  // that travels: its centre is the ship's own position, so the field slides
  // through it as the camera moves.
  const reach = REACH * reachMul * s;
  const g = ctx.createRadialGradient(x, y, 0, x, y, reach);
  const core = Math.min(0.85, (0.4 + 0.14 * pulse) * strength);
  g.addColorStop(0, `rgba(150,64,246,${core.toFixed(3)})`);
  g.addColorStop(0.4, `rgba(112,40,205,${(core * 0.55).toFixed(3)})`);
  g.addColorStop(0.75, `rgba(88,28,170,${(core * 0.22).toFixed(3)})`);
  g.addColorStop(1, 'rgba(70,20,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);

  ctx.restore();
}
