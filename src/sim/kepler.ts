/**
 * The two-body relations the authored half of a swing is written in — and the
 * one thing they deliberately ignore.
 *
 * The dive is integrated under the softened law of [`gravity.ts`](./gravity.ts),
 * `a(r) = μ / (r² + ε²)`. Everything the swing *authors* — the clearance's
 * target in [`clearance.ts`](./clearance.ts), the shape and the sweep of the
 * frozen orbit in [`orbit.ts`](./orbit.ts) — is written in the **unsoftened**
 * relations below, and that is a decision rather than an oversight.
 *
 * Two reasons. The frozen orbit is a Kepler ellipse ridden on a phase clock, so
 * its shape and its rate have to come from the arithmetic that ellipse obeys;
 * mixing a softened energy into it would give a shape that is not the shape of
 * anything. And spec [01](../../docs/spec/01-swing.md)'s own figures are in
 * these relations — its escape speed of 443 at r = 56 is `√(2μ/r)` to three
 * figures, and §6a's `a = 119.5, e = 0.530, periapsis 56.1` is exactly the
 * ellipse `√(2(E + μ/r))` = 387 belongs to.
 *
 * The two laws differ by 9.4% at the floor and less than 1% beyond a third of
 * grab range (spec 01 §2). Where that difference lands is recorded at each call
 * site: the clearance's prediction is a *trigger* and the floor is the promise,
 * so a slightly early trigger costs nothing.
 */

/**
 * The specific orbital energy of a craft at distance `r` moving at `speed`.
 *
 * Negative is bound. It is what the freeze reads to decide the shape of the
 * orbit it hands out, and spec 01 §6 requires the **peak** of it over the dive
 * rather than its value at the bottom — see [`dive.ts`](./dive.ts).
 */
export function specificEnergy(mass: number, r: number, speed: number): number {
  return (speed * speed) / 2 - mass / r;
}

/** The speed at which a craft at `r` is no longer bound to the body. */
export function escapeSpeed(mass: number, r: number): number {
  return Math.sqrt((2 * mass) / r);
}

/** The speed of a circular orbit at `r` — what the settle spends down to. */
export function circularSpeed(mass: number, r: number): number {
  return Math.sqrt(mass / r);
}

/**
 * The craft's angular momentum about the body, signed by which way round it
 * goes.
 *
 * Positive is counter-clockwise. The sign is the swing's direction and is
 * carried by the orbit unchanged, because *"the nose points along the exit
 * tangent for the whole of an orbit"* and a swing that reversed would put the
 * nose through the body.
 */
export function angularMomentum(dx: number, dy: number, vx: number, vy: number): number {
  return dx * vy - dy * vx;
}

/**
 * The eccentricity of the ellipse that has this energy and this periapsis.
 *
 * `1 + 2Er/μ`, which is `1 − r/a` with `a = −μ/2E` written so that it does not
 * divide by an energy that may be zero. One and above is a path that leaves;
 * the freeze clamps it (spec 01 §6) and that clamp is why *"the cap binds on
 * most swings"*.
 */
export function eccentricityFor(mass: number, energy: number, periapsis: number): number {
  return 1 + (2 * energy * periapsis) / mass;
}
