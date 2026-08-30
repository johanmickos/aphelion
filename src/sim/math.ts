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

/**
 * `e` raised to `x`, computed from correctly-rounded operations only.
 *
 * `Math.exp` is on ECMA-262's implementation-approximated list with `sin`,
 * `cos` and `pow`, and
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)
 * bans the whole list in `src/sim/`, `src/state/` and `src/input/` for the
 * reason [`trig.ts`](./trig.ts) measures: two engines return different bits, a
 * recipe recorded on the phone is replayed on a laptop, and the two failures
 * look identical in the numbers. The ADR banned it before anything needed it;
 * spec [05 · §3](../../docs/spec/05-field.md) is the first thing that does —
 * **both** the rungs' gravity bow and their wake are exponential falloffs — so
 * this is the ban's own answer, written the same way `trig.ts` was.
 *
 * ## How
 *
 * The textbook reduction, and the same shape `trig.ts` uses for its own: split
 * `x = k·ln2 + r` with `k` whole and `|r| ≤ ln2/2`, evaluate `exp(r)` where the
 * series converges fast, and scale by `2^k`, which is exact in binary floating
 * point.
 *
 * Two details carry the accuracy. **`ln2` is split in two** so that `k · LN2_HI`
 * is exact for every `k` this reduces by — `LN2_HI` has its low bits cleared, so
 * the product of a small whole number with it needs no rounding — and the
 * leftover is subtracted separately. And **the polynomial computes `exp(r) − 1`
 * rather than `exp(r)`**, so the leading 1 is added exactly rather than being
 * rounded together with terms a thousand times smaller than it.
 *
 * Measured against a 400-bit fixed-point reference over 50 000 arguments spread
 * across the supported domain, the worst error is **0.914 ulp** and the mean
 * **0.271**, against **0.808** and **0.269** for V8's own `Math.exp` on the same
 * reference and the same arguments; over the `-3 … 0` the falloffs actually use,
 * 0.891 against 0.811. As with `trig.ts`, being level on accuracy was not the
 * goal and it very nearly came for free.
 *
 * ## The measurement
 *
 * ADR-0014's own probe, pointed at the function it banned before anything needed
 * it. Both engines evaluated the same 20 000 arguments over `±300` and the same
 * 20 000 over the `-3 … 0` the falloffs live in, compared as raw float64 bits:
 *
 * | Function | Arguments where V8 and JavaScriptCore return different bits |
 * |---|---|
 * | `Math.exp`, over ±300 | **9.5%** |
 * | `Math.exp`, over -3 … 0 | **10.0%** |
 * | this function, both ranges | **0%**, over all 40 000 |
 *
 * It costs **3.1×** — 71M calls/s against `Math.exp`'s 221M — which is the same
 * order `trig.ts` pays for `sin` and, unlike `sin`, this one is called per sample
 * point of every rung. `docs/plan/m3-the-field.md` records what that came to in a
 * frame.
 *
 * ## The domain, and why it is stated rather than saturated
 *
 * Throws outside `|x| ≤ 300`, which is `power`'s own stance one line up: a
 * silent fallback in this file would produce a simulation that replays on one
 * engine and not another. `exp(300)` is 1.9e130 and `exp(-300)` is 5.1e-131, so
 * the bound is far outside anything a field can ask — the widest falloff spec 05
 * states reaches `exp(-3)` at its own cutoff — and it keeps `twoTo` clear of the
 * range where squaring its base would overflow.
 */
export function exp(x: number): number {
  if (!(Math.abs(x) <= 300)) {
    throw new Error(
      `exp(): ${x} is outside the supported domain of |x| <= 300, and the simulation has no ` +
        'engine-independent way to evaluate it there (ADR-0014)',
    );
  }
  const k = Math.round(x * INV_LN2);
  // Cody–Waite: `k * LN2_HI` is exact, so the only rounding in the reduced
  // argument is the one subtraction of a term already near the ulp of `r`.
  const r = x - k * LN2_HI - k * LN2_LO;
  return (1 + expm1Small(r)) * twoTo(k);
}

/** ln 2, split so that `k * LN2_HI` is exact for every `k` we reduce by. */
const LN2_HI = 6.9314718036912381649e-1; // low 32 bits zero, so `k * LN2_HI` is exact
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.4426950408889634;

/**
 * `exp(r) − 1` for `|r| ≤ ln2/2`, as `r` plus the rest.
 *
 * Taylor to `r¹³/13!`, whose first dropped term is `4.1e-18` at the ends of the
 * range — a fiftieth of an ulp of the 1 it is added to. It is written as
 * `r + r²·(…)` so the two terms that carry almost all of the value are exact and
 * only the tail, which never exceeds 0.06, accumulates the Horner rounding.
 */
function expm1Small(r: number): number {
  const tail =
    1 / 2 +
    r *
      (1 / 6 +
        r *
          (1 / 24 +
            r *
              (1 / 120 +
                r *
                  (1 / 720 +
                    r *
                      (1 / 5040 +
                        r *
                          (1 / 40320 +
                            r *
                              (1 / 362880 +
                                r *
                                  (1 / 3628800 +
                                    r *
                                      (1 / 39916800 + r * (1 / 479001600 + r / 6227020800))))))))));
  return r + r * r * tail;
}

/**
 * Two raised to a whole `k`, exactly.
 *
 * Binary powering rather than `Math.pow`, which is banned here, and rather than
 * `k` doublings, which is exact but walks. Every intermediate is a power of two
 * and every product of two of them is exact, so this is not an approximation of
 * `2^k` — it *is* `2^k` — for the range [`exp`](#exp) admits.
 */
function twoTo(k: number): number {
  let base = k < 0 ? 0.5 : 2;
  let steps = Math.abs(k);
  let result = 1;
  while (steps > 0) {
    if (steps % 2 === 1) result = result * base;
    base = base * base;
    steps = Math.floor(steps / 2);
  }
  return result;
}
