/**
 * The release compass: where to let go to reach each nearby body.
 *
 * Drift is a straight line in this simulation, so a release sends the ship along
 * the orbit's tangent and it keeps going. That makes "where do I release to reach
 * that planet?" exactly solvable: find the orbit angle whose tangent points at
 * the target.
 */
import type { Body } from '../sim/types.ts';
import type { Orbit } from '../sim/types.ts';
import { hypot, orbitRadius } from '../sim/orbit.ts';
import type { SimConfig } from '../sim/config.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';

const TAU = Math.PI * 2;

export function normalizeAngle(a: number): number {
  let d = a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Signed angle between the release heading at `ang` and the bearing to `target`. */
function releaseError(
  orbit: Orbit,
  rPeri: number,
  tighten: number,
  anchor: Body,
  target: { x: number; y: number },
  ang: number,
): number {
  const rr = orbitRadius(orbit, rPeri, ang, tighten);
  const x = anchor.x + Math.cos(ang) * rr;
  const y = anchor.y + Math.sin(ang) * rr;
  const hx = -Math.sin(ang) * orbit.dir;
  const hy = Math.cos(ang) * orbit.dir;
  return normalizeAngle(Math.atan2(hy, hx) - Math.atan2(target.y - y, target.x - x));
}

/**
 * The orbit angle whose tangent aims at `target`.
 *
 * A coarse sweep brackets the roots, then bisection converges on one. The
 * prototype scanned 180 evenly spaced angles per target and kept the best, which
 * cost 540 samples a frame — about 162,000 trig calls per second — and still only
 * resolved to a 2-degree grid. This costs roughly 50 samples per target and
 * resolves to about a thousandth of a degree.
 */
export function releaseAngleFor(
  orbit: Orbit,
  rPeri: number,
  tighten: number,
  anchor: Body,
  target: { x: number; y: number },
  coarse = 24,
  refine = 12,
): { angle: number; error: number } {
  const err = (a: number): number => releaseError(orbit, rPeri, tighten, anchor, target, a);

  let bestAng = 0;
  let bestAbs = Infinity;
  let prevAng = 0;
  let prevErr = err(0);

  for (let k = 1; k <= coarse; k++) {
    const ang = (k / coarse) * TAU;
    const e = err(ang);
    if (Math.abs(e) < bestAbs) {
      bestAbs = Math.abs(e);
      bestAng = ang;
    }
    // A sign change brackets a root — but only if it is a genuine crossing and
    // not the +pi/-pi wrap, which flips sign without passing through zero.
    if (prevErr * e < 0 && Math.abs(prevErr - e) < Math.PI) {
      let lo = prevAng;
      let hi = ang;
      let flo = prevErr;
      for (let i = 0; i < refine; i++) {
        const mid = (lo + hi) / 2;
        const fm = err(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      const root = (lo + hi) / 2;
      const rErr = Math.abs(err(root));
      if (rErr < bestAbs) {
        bestAbs = rErr;
        bestAng = root;
      }
    }
    prevAng = ang;
    prevErr = e;
  }
  return { angle: bestAng, error: bestAbs };
}

/**
 * Is the straight run from a release point to a target blocked by another body?
 *
 * Worth knowing: a marker that points at a planet you cannot actually reach is
 * worse than no marker, and the prototype had no notion of this.
 */
export function pathBlocked(
  from: { x: number; y: number },
  to: Body,
  bodies: readonly Body[],
  ignore: readonly Body[],
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = hypot(dx, dy);
  if (len < 1) return false;
  const ux = dx / len;
  const uy = dy / len;

  for (const b of bodies) {
    if (b === to || ignore.includes(b)) continue;
    const px = b.x - from.x;
    const py = b.y - from.y;
    const t = px * ux + py * uy;
    if (t <= 0 || t >= len) continue; // behind us, or past the target
    const perp = Math.abs(px * uy - py * ux);
    if (perp < b.R) return true;
  }
  return false;
}

export interface CompassTarget {
  body: Body;
  index: number;
  distance: number;
}

/**
 * The bodies worth aiming at from here: UPWARD and within reach, nearest first.
 *
 * Upward only, because the game is a climb. Offering the planet you just came
 * from as an equal option invites you to bounce between two bodies forever,
 * which is a local maximum the compass should not be signposting. Smaller world
 * y is up.
 *
 * (The prototype had a `nextPlanet(from)` helper that found "the nearest planet
 * ABOVE the grabbed one" and never called it — the intent predates this.)
 *
 * The range cutoff is about what is worth aiming at rather than what is
 * physically achievable: drift is frictionless, so a release aimed anywhere
 * eventually arrives. A target several bodies away is a long, featureless coast.
 */
export function compassTargets(
  bodies: readonly Body[],
  anchorIndex: number,
  maxDistance: number,
  count: number,
): CompassTarget[] {
  const anchor = bodies[anchorIndex];
  if (!anchor) return [];
  const out: CompassTarget[] = [];
  for (let i = 0; i < bodies.length; i++) {
    if (i === anchorIndex) continue;
    const b = bodies[i]!;
    if (b.y >= anchor.y) continue; // not upward
    const d = hypot(b.x - anchor.x, b.y - anchor.y);
    if (d <= maxDistance) out.push({ body: b, index: i, distance: d });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, count);
}

// ------------------------------------------------------------------- drawing

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
  if (!cap?.orbit || (cap.phase !== 'settle' && cap.phase !== 'orbit')) return { bestAlign: 0 };
  const anchor = bodies[cap.planet];
  if (!anchor) return { bestAlign: 0 };

  const targets = compassTargets(bodies, cap.planet, rcfg.compassRange, rcfg.compassMaxTargets);
  if (targets.length === 0) return { bestAlign: 0 };

  const tighten = sim.tightenFrac * cap.settleProgress;
  const shipAng = Math.atan2(cap.ry, cap.rx);
  const orbitRnow = orbitRadius(cap.orbit, cap.rPeri, shipAng, tighten);
  // Anchored to the radius the orbit settles at, so the rings do not pump in and
  // out as the ship sweeps its orbit.
  const gaugeR = cap.rPeri * (1 - rcfg.gaugeFollow) + orbitRnow * rcfg.gaugeFollow;
  const s = cam.scale;
  const cx = toScreenX(cam, anchor.x);
  const cy = toScreenY(cam, anchor.y);

  /** Ring radius for a target: further body, wider ring. */
  const ringFor = (distance: number): number =>
    gaugeR +
    rcfg.compassRingInner +
    Math.min(1, distance / Math.max(1, rcfg.compassRange)) * rcfg.compassRingSpread;

  let bestAlign = 0;
  let outermost = 0;

  targets.forEach((t, ti) => {
    const ringR = ringFor(t.distance);
    outermost = Math.max(outermost, ringR);
    const { angle } = releaseAngleFor(cap.orbit!, cap.rPeri, tighten, anchor, t.body);
    const align = Math.max(0, 1 - Math.abs(normalizeAngle(shipAng - angle)) / (Math.PI * 0.5));

    // A release that runs into another body is worse than no marker at all.
    const rr = orbitRadius(cap.orbit!, cap.rPeri, angle, tighten);
    const from = { x: anchor.x + Math.cos(angle) * rr, y: anchor.y + Math.sin(angle) * rr };
    const blocked = pathBlocked(from, t.body, bodies, [anchor]);
    if (!blocked) bestAlign = Math.max(bestAlign, align);

    const c = HUES[ti % HUES.length]!;
    const dim = blocked ? 0.3 : 1;
    const near = align > 0.9 && !blocked;
    const pulse = near ? 0.6 + 0.4 * Math.sin(timeMs / 90) : 1;

    // the ring itself
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * s, 0, TAU);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.13 * dim})`;
    ctx.lineWidth = Math.max(1, s);
    ctx.stroke();

    // an arc leading into the marker, brightening as the sweep approaches
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * s, angle - 0.35, angle + 0.35);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.15 + 0.5 * align) * dim})`;
    ctx.lineWidth = (2 + 2 * align) * s;
    ctx.stroke();

    const mx = cx + Math.cos(angle) * ringR * s;
    const my = cy + Math.sin(angle) * ringR * s;
    ctx.beginPath();
    ctx.arc(mx, my, (near ? 5 : 3.5) * pulse * s, 0, TAU);
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.7 + 0.3 * align) * dim})`;
    ctx.fill();

    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85 * dim})`;
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(
      blocked ? `${t.body.name} ✕` : t.body.name,
      cx + Math.cos(angle) * (ringR + 12) * s,
      cy + Math.sin(angle) * (ringR + 12) * s + 3 * s,
    );
  });

  // The sweep: where the ship is, drawn across every ring so alignment with any
  // of them can be read at a glance.
  const ux = Math.cos(shipAng);
  const uy = Math.sin(shipAng);
  ctx.beginPath();
  ctx.moveTo(cx + ux * gaugeR * s, cy + uy * gaugeR * s);
  ctx.lineTo(cx + ux * outermost * s, cy + uy * outermost * s);
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();

  for (const t of targets) {
    const ringR = ringFor(t.distance);
    ctx.beginPath();
    ctx.arc(cx + ux * ringR * s, cy + uy * ringR * s, 2.5 * s, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
  }

  return { bestAlign };
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
