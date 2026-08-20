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

/** Smootherstep, the settle's easing curve. */
export function smootherstep(u: number): number {
  return u * u * u * (u * (u * 6 - 15) + 10);
}
