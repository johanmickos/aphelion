/**
 * Drawing the release compass.
 *
 * The geometry — which bodies are worth aiming at, where on the orbit to let go
 * for each, and how close the ship currently is — lives in `src/score/aim.ts`,
 * because the score pays for exactly the alignment these rings display. One
 * reading feeds both, so the player can never be scored against something the
 * compass did not show them.
 */
import type { Body } from '../sim/types.ts';
import { AIM_RANGE, readAim } from '../score/aim.ts';
import type { SimConfig } from '../sim/config.ts';
import { orbitRadius, predictedCaptureOrbit } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';

const TAU = Math.PI * 2;

/** Distinct hues per target, so a marker stays identifiable as you rotate. */
const HUES: ReadonlyArray<readonly [number, number, number]> = [
  [120, 220, 150],
  [255, 180, 70],
  [110, 180, 255],
];

export interface CompassResult {
  /** Best alignment with any target, 0..1. Drives the ship's release glow. */
  bestAlign: number;
}

/**
 * Draw one ring per reachable body, sized by how far away that body is.
 *
 * Markers on a single shared ring encode direction only — three targets look
 * equally far off. A ring each, growing with distance, says direction and
 * distance in one read: the innermost ring is the next hop, the outer ones are
 * further up the climb.
 *
 * A radial sweep line marks where the ship currently is, crossing every ring, so
 * alignment can be judged against any of them at once. Line the sweep up with a
 * marker and let go.
 */
export function drawCompass(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  bodies: readonly Body[],
  timeMs: number,
): CompassResult {
  const cap = snap.capture;
  if (!cap) return { bestAlign: 0 };
  const anchor = bodies[cap.planet];
  if (!anchor) return { bestAlign: 0 };

  const frozen = cap.orbit !== null && (cap.phase === 'settle' || cap.phase === 'orbit');

  /**
   * Before periapsis there is no frozen orbit, and the compass used to show
   * nothing at all until there was. Measured on a real session that was 2.0
   * seconds of blank sky from the grab — the entire dive, which is precisely when
   * a player is deciding where this capture is taking them.
   *
   * The predicted orbit is good enough to signpost with: it converges on the real
   * one as the dive proceeds and its periapsis lands on the actual one. It is
   * drawn faint, and it deliberately reports NO alignment, so the ship's release
   * glow still means "let go now and it counts" — which before periapsis it does
   * not, since a release that never froze an orbit earns nothing.
   */
  let orbit = cap.orbit;
  let rPeri = cap.rPeri;
  if (!frozen) {
    const o = predictedCaptureOrbit(sim, cap.rx, cap.ry, cap.vx, cap.vy, cap.minR);
    if (!o.bound || !Number.isFinite(o.a) || o.periapsis <= 0) return { bestAlign: 0 };
    orbit = { a: o.a, e: o.e, argp: o.argp, dir: o.dir };
    rPeri = o.periapsis;
  }
  if (!orbit) return { bestAlign: 0 };

  const tighten = frozen ? sim.tightenFrac * cap.settleProgress : 0;
  const shipAng = Math.atan2(cap.ry, cap.rx);
  const aim = readAim(orbit, rPeri, tighten, bodies, cap.planet, shipAng);
  if (aim.targets.length === 0) return { bestAlign: 0 };

  // Provisional while the orbit is still being flown into existence.
  const fade = frozen ? 1 : 0.45;

  const orbitRnow = orbitRadius(orbit, rPeri, shipAng, tighten);
  // Anchored to the radius the orbit settles at, so the rings do not pump in and
  // out as the ship sweeps its orbit.
  const gaugeR = cap.rPeri * (1 - rcfg.gaugeFollow) + orbitRnow * rcfg.gaugeFollow;
  const s = cam.scale;
  const cx = toScreenX(cam, anchor.x);
  const cy = toScreenY(cam, anchor.y);

  /** Ring radius for a target: further body, wider ring. */
  const ringFor = (distance: number): number =>
    gaugeR + rcfg.compassRingInner + Math.min(1, distance / AIM_RANGE) * rcfg.compassRingSpread;

  let outermost = 0;

  aim.targets.forEach((t, ti) => {
    const ringR = ringFor(t.distance);
    outermost = Math.max(outermost, ringR);

    const c = HUES[ti % HUES.length]!;
    const dim = (t.blocked ? 0.3 : 1) * fade;
    const near = t.align > 0.9 && !t.blocked;
    const pulse = near ? 0.6 + 0.4 * Math.sin(timeMs / 90) : 1;

    // the ring itself
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * s, 0, TAU);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.13 * dim})`;
    ctx.lineWidth = Math.max(1, s);
    ctx.stroke();

    // an arc leading into the marker, brightening as the sweep approaches
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * s, t.angle - 0.35, t.angle + 0.35);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.15 + 0.5 * t.align) * dim})`;
    ctx.lineWidth = (2 + 2 * t.align) * s;
    ctx.stroke();

    const mx = cx + Math.cos(t.angle) * ringR * s;
    const my = cy + Math.sin(t.angle) * ringR * s;
    ctx.beginPath();
    ctx.arc(mx, my, (near ? 5 : 3.5) * pulse * s, 0, TAU);
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.7 + 0.3 * t.align) * dim})`;
    ctx.fill();

    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85 * dim})`;
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(
      t.blocked ? `${t.body.name} ✕` : t.body.name,
      cx + Math.cos(t.angle) * (ringR + 12) * s,
      cy + Math.sin(t.angle) * (ringR + 12) * s + 3 * s,
    );
  });

  // The sweep: where the ship is, drawn across every ring so alignment with any
  // of them can be read at a glance.
  const ux = Math.cos(shipAng);
  const uy = Math.sin(shipAng);
  ctx.beginPath();
  ctx.moveTo(cx + ux * gaugeR * s, cy + uy * gaugeR * s);
  ctx.lineTo(cx + ux * outermost * s, cy + uy * outermost * s);
  ctx.strokeStyle = `rgba(255,255,255,${(0.28 * fade).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();

  for (const t of aim.targets) {
    const ringR = ringFor(t.distance);
    ctx.beginPath();
    ctx.arc(cx + ux * ringR * s, cy + uy * ringR * s, 2.5 * s, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
    ctx.fill();
  }

  // No alignment reported until the orbit is real — see the note above.
  return { bestAlign: frozen ? aim.best : 0 };
}

/**
 * A halo on the ship as it lines up with a release marker.
 *
 * Fades in continuously rather than snapping on at a threshold, which is what the
 * prototype did — the compass wedge brightened smoothly while the ship's glow
 * appeared all at once, so the same quantity was reported two different ways.
 */
export function drawAlignGlow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: RenderSnapshot,
  align: number,
  timeMs: number,
): void {
  if (align <= 0.55 || !snap.held) return;
  const t = (align - 0.55) / 0.45;
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 90);
  const s = cam.scale;
  ctx.beginPath();
  ctx.arc(toScreenX(cam, snap.x), toScreenY(cam, snap.y), (13 + 3 * pulse * t) * s, 0, TAU);
  ctx.strokeStyle = `rgba(84,243,154,${(0.15 + 0.75 * t * (0.6 + 0.4 * pulse)).toFixed(3)})`;
  ctx.lineWidth = (1 + 1.5 * t) * s;
  ctx.stroke();
}
