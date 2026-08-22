/**
 * Orbital mathematics. Pure functions, no state.
 *
 * Expression structure is preserved from the prototype deliberately: algebraically
 * equivalent rewrites (multiplying by a reciprocal rather than dividing, for
 * instance) reassociate the floating point and shift results by ~1 ulp, which is
 * enough to fail an equality gate for no benefit.
 */
import type { SimConfig } from './config.ts';
import type { Orbit } from './types.ts';

/**
 * Vector length, deliberately NOT `Math.hypot`.
 *
 * `Math.hypot` is not required to be correctly rounded, and engines genuinely
 * disagree: measured across 20,000 inputs, JavaScriptCore and V8 return different
 * results 36% of the time. Since this is called six times per substep, that alone
 * made a session recorded on a phone impossible to replay on a laptop — the error
 * compounded through orbital motion until, after ~10 seconds, it flipped whole
 * decisions (capture vs flyby).
 *
 * `sqrt` IS correctly rounded by IEEE-754, and `*` and `+` are exact operations,
 * so this form is identical on every engine — verified at 0.000000px divergence
 * over a full session where Math.hypot gave 5.63px.
 *
 * Overflow is not a concern at this scale: coordinates are ~1e4 at most, so the
 * squares are ~1e8 against a float64 ceiling of 1.8e308.
 *
 * See docs/PORT_NOTES.md note 16.
 */
export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Circular orbital speed at radius r. */
export function circSpeed(cfg: SimConfig, r: number): number {
  return Math.sqrt(cfg.GM / Math.max(r, 1));
}

/** Softened gravitational acceleration magnitude at radius r. */
export function gAccel(cfg: SimConfig, r: number): number {
  return cfg.GM / (r * r + cfg.soft * cfg.soft);
}

/** Escape speed at radius r (unsoftened; the prototype's own approximation). */
export function escapeSpeed(cfg: SimConfig, r: number): number {
  return Math.sqrt((2 * cfg.GM) / Math.max(r, 1));
}

/**
 * Periapsis radius of the unperturbed two-body orbit through (r, v).
 * Returns 0 for degenerate (radial) cases, matching the prototype.
 */
export function naturalPeriapsis(
  cfg: SimConfig,
  rx: number,
  ry: number,
  vx: number,
  vy: number,
): number {
  const r = hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const L = Math.abs(rx * vy - ry * vx);
  const E = 0.5 * v2 - cfg.GM / r;
  if (L < 1e-6) return 0;
  const a = E;
  const b = cfg.GM;
  const c = -0.5 * L * L;
  const disc = b * b - 4 * a * c;
  if (Math.abs(a) < 1e-9) return (0.5 * L * L) / cfg.GM;
  if (disc < 0) return r;
  const s = Math.sqrt(disc);
  const r1 = (-b + s) / (2 * a);
  const r2 = (-b - s) / (2 * a);
  const cs = [r1, r2].filter((x) => x > 0);
  return cs.length ? Math.min.apply(null, cs) : 0;
}

/**
 * Smallest tangential delta-v that lifts the natural periapsis to `target`.
 * Bisection, 40 iterations — the prototype's exact search.
 */
export function clearanceDv(
  cfg: SimConfig,
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  target: number,
): { dvx: number; dvy: number } {
  const r = hypot(rx, ry);
  let tx = -ry / r;
  let ty = rx / r;
  if (tx * vx + ty * vy < 0) {
    tx = -tx;
    ty = -ty;
  }
  let lo = 0;
  let hi = circSpeed(cfg, target) * 1.2;
  let best = 0;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const p = naturalPeriapsis(cfg, rx, ry, vx + tx * m, vy + ty * m);
    if (p < target) lo = m;
    else {
      hi = m;
      best = m;
    }
  }
  return { dvx: tx * best, dvy: ty * best };
}

/**
 * Radius of the (possibly tightening) frozen orbit at absolute angle `ang`.
 * `tightenAmt` blends the natural ellipse toward a circle at the periapsis radius.
 */
export function orbitRadius(orbit: Orbit, rPeri: number, ang: number, tightenAmt: number): number {
  const rNat = (orbit.a * (1 - orbit.e * orbit.e)) / (1 + orbit.e * Math.cos(ang - orbit.argp));
  const rCirc = rPeri;
  return rNat * (1 - tightenAmt) + rCirc * tightenAmt;
}

/**
 * The velocity change that lifts periapsis clear, WITHOUT inventing energy.
 *
 * `clearanceDv` adds tangential speed, which is the honest way to raise a
 * periapsis and also a free energy injection: measured, it hands a ship at half
 * its escape speed up to 277px/s and puts it above escape. The capture then never
 * reaches periapsis, coasts, and leaves the field — reported as "I kind of shot
 * off the planet at super speed".
 *
 * So this turns the velocity toward tangential first, at constant speed. That
 * raises angular momentum and therefore periapsis for nothing, and cannot unbind
 * a ship by construction. Measured over 144 sampled bound dives it clears the
 * target on its own in 94 of them.
 *
 * Only where turning is not enough does it add speed, and then no more than
 * `maxSpeed` allows. What is still short of the target the floor clamp catches,
 * which is what the floor is for — an expensive outcome, but a survivable one,
 * where being ejected is neither.
 *
 * Returns the total delta, so the caller can ease it in exactly as before.
 */
export function clearanceDelta(
  cfg: SimConfig,
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  target: number,
  maxSpeed: number,
): { dvx: number; dvy: number } {
  const r = hypot(rx, ry);
  const spd = hypot(vx, vy);
  if (r < 1 || spd < 1) return { dvx: 0, dvy: 0 };

  let tx = -ry / r;
  let ty = rx / r;
  if (tx * vx + ty * vy < 0) {
    tx = -tx;
    ty = -ty;
  }

  // Start from exactly what `clearanceDv` would do. Where that keeps the ship
  // bound — which is most of the time — this returns it unchanged, so the feel of
  // an ordinary dive is untouched and only the dives that were being ejected
  // behave differently. Deviating everywhere was tried and put a kink into a
  // scenario that had none: turning the heading is a sharper change than adding
  // along it, and `clearEaseFrames` is the one frame-denominated constant in the
  // simulation and may not be lengthened to hide it.
  const plain = clearanceDv(cfg, rx, ry, vx, vy, target);
  if (hypot(vx + plain.dvx, vy + plain.dvy) <= maxSpeed) return plain;

  // It would eject. Spend the speed that is available, then TURN for the rest:
  // rotating at constant speed raises angular momentum, and therefore periapsis,
  // for nothing, and cannot unbind by construction.
  const room = Math.max(0, maxSpeed - spd);
  let bx = vx + tx * room;
  let by = vy + ty * room;
  const capped = hypot(bx, by) || 1;

  /** `bx,by` turned `m` of the way to tangential, at its own speed. */
  const turned = (m: number): { x: number; y: number } => {
    const cx = bx * (1 - m) + tx * capped * m;
    const cy = by * (1 - m) + ty * capped * m;
    const cl = hypot(cx, cy) || 1;
    return { x: (cx / cl) * capped, y: (cy / cl) * capped };
  };

  let lo = 0;
  let hi = 1;
  let best = -1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const t = turned(m);
    if (naturalPeriapsis(cfg, rx, ry, t.x, t.y) < target) lo = m;
    else {
      hi = m;
      best = m;
    }
  }
  if (best >= 0) {
    const t = turned(best);
    bx = t.x;
    by = t.y;
  } else {
    // Even fully tangential at the capped speed falls short. Take it: the floor
    // clamp catches the remainder, which is expensive but survivable, where being
    // flung out of a capture is neither.
    const t = turned(1);
    bx = t.x;
    by = t.y;
  }
  return { dvx: bx - vx, dvy: by - vy };
}

/** Smootherstep, the settle's easing curve. */
export function smootherstep(u: number): number {
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** The two-body orbit a ship is instantaneously on, derived from its state. */
export interface Osculating {
  a: number;
  e: number;
  argp: number;
  dir: number;
  /** Closed orbit. A grab above escape speed is hyperbolic and has no ellipse. */
  bound: boolean;
  periapsis: number;
}

/**
 * The orbit implied by a position and velocity right now.
 *
 * The frozen orbit only exists once the ship reaches periapsis, so until then
 * there is nothing to draw — which is why the prototype showed no ring for up to
 * half a revolution of the dive and then produced one already formed. This
 * derives the ellipse the ship is *currently* on, so the shape can be previewed
 * from the instant of the grab.
 *
 * It is a prediction, not a promise, and should be drawn as one: it uses
 * unsoftened gravity where the simulation softens it, the clearance impulse has
 * not been applied yet, and `freezeOrbit` will anchor periapsis at the ship's
 * actual position with eccentricity capped at 0.6. Close enough to read the
 * shape and the direction; not close enough to measure.
 */
export function osculatingOrbit(
  cfg: { GM: number },
  rx: number,
  ry: number,
  vx: number,
  vy: number,
): Osculating {
  const r = hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const L = rx * vy - ry * vx;
  const dir = Math.sign(L) || 1;
  const E = 0.5 * v2 - cfg.GM / r;

  // eccentricity vector: points at periapsis, magnitude is the eccentricity
  const rv = rx * vx + ry * vy;
  const k = v2 - cfg.GM / r;
  const ex = (k * rx - rv * vx) / cfg.GM;
  const ey = (k * ry - rv * vy) / cfg.GM;
  const e = hypot(ex, ey);

  return {
    a: E < 0 ? -cfg.GM / (2 * E) : Infinity,
    e,
    argp: Math.atan2(ey, ex),
    dir,
    bound: E < 0,
    periapsis: (L * L) / cfg.GM / (1 + e),
  };
}

/**
 * The orbit a grab will actually follow, including the clearance correction.
 *
 * The raw osculating orbit is not what to show a player: on a steep grab it dips
 * far inside the planet, because the simulation has not yet applied the impulse
 * that lifts periapsis clear of the surface. Applying the same correction first
 * gives the curve the ship will really fly.
 */
export function predictedCaptureOrbit(
  cfg: SimConfig,
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  minR: number,
): Osculating {
  if (naturalPeriapsis(cfg, rx, ry, vx, vy) < minR) {
    const dv = clearanceDv(cfg, rx, ry, vx, vy, minR);
    return osculatingOrbit(cfg, rx, ry, vx + dv.dvx, vy + dv.dvy);
  }
  return osculatingOrbit(cfg, rx, ry, vx, vy);
}
