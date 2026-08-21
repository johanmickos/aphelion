/**
 * Release geometry — where to let go, and how close you came.
 *
 * Drift is a straight line in this simulation, so a release sends the ship along
 * the orbit's tangent and it keeps going. That makes "where do I release to reach
 * that planet?" exactly solvable: find the orbit angle whose tangent points at
 * the target. That solution is the compass the player reads, and it is also the
 * quantity the score pays for a well-aimed release.
 *
 * It lives here, in `src/score/`, rather than in the renderer that used to own it,
 * for one reason: the player must never be scored against something they cannot
 * see. One sweep produces the rings that get drawn AND the alignment that gets
 * paid, so the two cannot drift apart. `src/render/compass.ts` is now only the
 * drawing of this reading.
 *
 * (It is not in `src/sim/` because it is a game rule, not physics — nothing here
 * can move the ship, and the simulation must stay exactly the ported prototype.)
 */
import type { Body, Orbit } from '../sim/types.ts';
import { hypot, orbitRadius } from '../sim/orbit.ts';

const TAU = Math.PI * 2;

/**
 * Bodies within this distance of the anchor are signposted, and are the only ones
 * a release can be scored against.
 *
 * Originally about two body-spacings: the next step of the climb and the one
 * after, no further. Anything beyond that is a long, featureless coast, and
 * signposting it invites the player to aim past the interesting part of the
 * field.
 *
 * At the current 280 spacing it is nearer three, and it is left at 800 anyway
 * because `AIM_MAX_TARGETS` is what actually binds in a field this dense —
 * measured over the generated field, dropping the range to 620 moves the mean
 * number of targets offered from 2.6 to 2.5. Narrowing it would re-scale every
 * aim score for that, and the aim thresholds in `praise.ts` are percentiles of
 * measured aim scores.
 *
 * This tracks `SimConfig.bodySpacing` — retuning the field's density changes how
 * many bodies a fixed distance covers, so revisit it alongside.
 */
export const AIM_RANGE = 800;

/** Never signpost — or score against — more than this many targets. */
export const AIM_MAX_TARGETS = 3;

export function normalizeAngle(a: number): number {
  let d = a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * The alignment ramp: 1 at a perfect line-up, 0 at 90 degrees off.
 *
 * The single definition of "lined up" in the game. The compass brightens on it,
 * the ship's halo fades in on it, and the score pays for it — so it is defined
 * once. Reporting the same quantity two different ways is what made the
 * prototype's glow snap on while its wedge brightened smoothly.
 */
export function alignment(errorRad: number): number {
  return Math.max(0, 1 - Math.abs(errorRad) / (Math.PI * 0.5));
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
 * worse than no marker, and paying points for aiming at one would be worse still.
 * The prototype had no notion of this.
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

export interface AimTarget {
  body: Body;
  index: number;
  /** Distance from the anchor body, which is what sizes the compass ring. */
  distance: number;
  /** Orbit angle whose tangent points at the body. */
  angle: number;
  /** Signed angular error from where the ship is now to that angle. */
  error: number;
  /** `alignment(error)` — 1 lined up, 0 ninety degrees off. */
  align: number;
  /** The straight run from the release point is obstructed by another body. */
  blocked: boolean;
}

export interface AimReading {
  targets: AimTarget[];
  /** Best alignment among the unblocked targets. 0 when nothing is reachable. */
  best: number;
  /** The body `best` refers to, or null. */
  bestTarget: Body | null;
}

const EMPTY_READING: AimReading = { targets: [], best: 0, bestTarget: null };

/**
 * The bodies worth aiming at from here: UPWARD and within reach, nearest first.
 *
 * Upward only, because the game is a climb. Offering the planet you just came
 * from as an equal option invites you to bounce between two bodies forever,
 * which is a local maximum neither the compass nor the score should signpost.
 * Smaller world y is up.
 *
 * (The prototype had a `nextPlanet(from)` helper that found "the nearest planet
 * ABOVE the grabbed one" and never called it — the intent predates this.)
 */
export function aimTargets(
  bodies: readonly Body[],
  anchorIndex: number,
  maxDistance: number = AIM_RANGE,
  count: number = AIM_MAX_TARGETS,
): Array<{ body: Body; index: number; distance: number }> {
  const anchor = bodies[anchorIndex];
  if (!anchor) return [];
  const out: Array<{ body: Body; index: number; distance: number }> = [];
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

/**
 * Solve every signposted target at once: where to release for each, and how far
 * the ship currently is from that point.
 *
 * This is the whole reading. The compass draws it and the scorer pays for it,
 * which is the point of it being one function.
 */
export function readAim(
  orbit: Orbit,
  rPeri: number,
  tighten: number,
  bodies: readonly Body[],
  anchorIndex: number,
  shipAng: number,
  maxDistance: number = AIM_RANGE,
  count: number = AIM_MAX_TARGETS,
): AimReading {
  const anchor = bodies[anchorIndex];
  if (!anchor) return EMPTY_READING;
  const near = aimTargets(bodies, anchorIndex, maxDistance, count);
  if (near.length === 0) return EMPTY_READING;

  const targets: AimTarget[] = [];
  let best = 0;
  let bestTarget: Body | null = null;

  for (const t of near) {
    const { angle } = releaseAngleFor(orbit, rPeri, tighten, anchor, t.body);
    const error = normalizeAngle(shipAng - angle);
    const align = alignment(error);

    // A release that runs into another body is worse than no marker at all.
    const rr = orbitRadius(orbit, rPeri, angle, tighten);
    const from = { x: anchor.x + Math.cos(angle) * rr, y: anchor.y + Math.sin(angle) * rr };
    const blocked = pathBlocked(from, t.body, bodies, [anchor]);

    if (!blocked && align > best) {
      best = align;
      bestTarget = t.body;
    }
    targets.push({ ...t, angle, error, align, blocked });
  }

  return { targets, best, bestTarget };
}
