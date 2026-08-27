/**
 * The arithmetic the simulation is allowed to use, where the language's own is
 * not the same on every engine.
 *
 * The trigonometric half of that problem is [`trig.ts`](./trig.ts) and
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md).
 * This file is the rest of it, and it is short because most of the rest is
 * already exact: `+`, `-`, `*`, `/` and `Math.sqrt` are correctly rounded by
 * IEEE-754, and `Math.abs`, `Math.min`, `Math.max`, `Math.round`, `Math.floor`
 * and `Math.sign` are specified exactly by ECMA-262. Those may be used directly.
 */

/**
 * The length of the vector `(x, y)`.
 *
 * Written out rather than `Math.hypot`, which ECMA-262 leaves
 * implementation-approximated: measured over 20 000 coordinate pairs, V8 and
 * JavaScriptCore return different bits **36.4% of the time**, and spec
 * [01 · §12a](../../docs/spec/01-swing.md) records what that cost the prototype
 * — a session diverging 5.63 units against 0.000 for this form, and past roughly
 * ten seconds a grab becoming a fly-past. The same probe finds **zero**
 * disagreement here.
 *
 * `pnpm portable` bans `Math.hypot` outright and points at this function.
 * Overflow is not a concern at this scale: coordinates reach ~1e4, so the
 * squares reach ~1e8 against a float64 ceiling of 1.8e308.
 */
export function magnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** The distance between two points. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return magnitude(bx - ax, by - ay);
}

/**
 * `base` raised to `exponent`, for exponents that are whole or half.
 *
 * `Math.pow` and the `**` operator carry the same latitude as the trigonometric
 * functions and are banned in this layer for the same reason. This covers what
 * the simulation actually needs — the mass-to-radius law of spec
 * [01 · §13.2](../../docs/spec/01-swing.md), whose exponent is an author
 * parameter deferred to the M1 gate.
 *
 * **Halves cost nothing and are supported deliberately.** `Math.sqrt` is
 * correctly rounded, so `base^½` is exact, and every half-integer power is then
 * a whole number of exact multiplications of it. That keeps the gate free to
 * pick 2.5 without reopening a determinism question — which is the whole point
 * of leaving the exponent open.
 *
 * Throws on anything else, rather than falling back to an approximation. A
 * silent fallback here would produce a simulation that replays on one engine and
 * not another, which is exactly the failure ADR-0014 exists to prevent.
 */
export function power(base: number, exponent: number): number {
  const halves = exponent * 2;
  if (!Number.isInteger(halves)) {
    throw new Error(
      `power(): exponent ${exponent} is not a whole or half number, and the simulation ` +
        'has no engine-independent way to raise a base to it (ADR-0014)',
    );
  }

  // A whole exponent multiplies `base` directly. A half exponent multiplies
  // `√base`, which takes twice as many steps to reach the same place.
  const whole = Number.isInteger(exponent);
  const factor = whole ? base : Math.sqrt(base);
  const negative = halves < 0;
  const steps = Math.abs(whole ? exponent : halves);

  let result = 1;
  for (let i = 0; i < steps; i++) result = result * factor;
  return negative ? 1 / result : result;
}
