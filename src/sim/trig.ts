/**
 * Trigonometry the simulation owns, because the engine's is not the same
 * everywhere.
 *
 * Spec [01 · §12a](../../docs/spec/01-swing.md) left this open and named it
 * M1.2's to decide. The decision and its evidence are
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md);
 * what follows is the implementation and the reason it is shaped this way.
 *
 * ECMA-262 marks `Math.sin`, `Math.cos` and `Math.atan2` **implementation-
 * approximated**, and engines take the latitude. Measured over 20 000 inputs,
 * V8 and JavaScriptCore return different bits for `sin` 4.3% of the time, for
 * `cos` 4.6%, and for `atan2` 17.9%. Each disagreement is about one unit in the
 * last place, which is why this is invisible until it is fatal: an orbit clock
 * calls these every tick, the difference compounds, and a replay of the author's
 * phone session on a laptop eventually flips a grab into a fly-past. That is
 * indistinguishable in the numbers from a simulation that is simply
 * non-deterministic (ADR-0004 makes reproducibility the contract).
 *
 * So the simulation computes its own. **Everything below uses only `+`, `-`,
 * `*`, `/` and `Math.sqrt`**, all of which IEEE-754 requires to be correctly
 * rounded, plus `Math.round` and `Math.abs`, which ECMA-262 specifies exactly.
 * There is no latitude left for an engine to take, and the same probe that found
 * the disagreements above finds **zero** between these two engines for every
 * function in this file.
 *
 * The algorithms are the standard ones — Cody–Waite argument reduction onto
 * [-π/4, π/4] and minimax polynomials on the reduced argument, and for `atan`
 * an interval-split rational approximation. They are textbook rather than
 * invented, and the coefficients are the published minimax ones; what this file
 * contributes is that they run in double arithmetic that cannot vary.
 *
 * Accuracy is not the point, and turned out to cost nothing: measured against a
 * 256-bit fixed-point reference over 50 000 arguments each, the worst error is
 * **0.73 ulp** for `sin`, **0.72** for `cos` and **1.27** for `angleOf` — level
 * with what the same reference scores V8's own `Math` functions at (0.81, 0.81,
 * 1.27). Being *wrong by the same amount everywhere* would have been worth
 * paying for; it did not come to that.
 */

/** π, and the part of it that does not fit in a double. */
const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

/** π/2, as one double. The three-part split below is a different thing. */
const HALF_PI = 1.5707963267948966;

/** π/2, split so that `k * PI_OVER_2_HI` is exact for every `k` we reduce by. */
const PI_OVER_2_HI = 1.5707963267341256; // 33 significant bits
const PI_OVER_2_MID = 6.077100506506192e-11;
const PI_OVER_2_LO = 3.5215598651832e-27;

const TWO_OVER_PI = 0.6366197723675814;

/**
 * Reduced argument from the last `reduce` call: `x - quadrant * π/2`, carried in
 * two parts so the kernels can use the bits that did not fit.
 *
 * Module-level rather than an allocated pair, because this runs six times per
 * substep and the prototype's experience is that per-tick allocation is what a
 * long replay actually costs (`stepSim` mutates for the same reason). Nothing
 * reads these except the two functions below, in the statement after the call.
 */
let reducedHi = 0;
let reducedLo = 0;
let quadrant = 0;

/**
 * Bring `x` onto [-π/4, π/4] and record which quarter-turn it came from.
 *
 * Cody–Waite: subtracting `k × π/2` in three pieces keeps the cancellation exact
 * where a single-constant subtraction would throw away the low bits of a large
 * argument — which is precisely the case an orbit clock produces, since it
 * accumulates angle for as long as the swing lasts.
 */
function reduce(x: number): void {
  const k = Math.round(x * TWO_OVER_PI);
  quadrant = k & 3;

  // Exact: k has at most ~20 bits over the range the field can reach, and
  // PI_OVER_2_HI has 33, so the product fits in 53 with room to spare.
  const t = x - k * PI_OVER_2_HI;
  const mid = k * PI_OVER_2_MID;
  const r = t - mid;
  // `(t - r) - mid` is the exact residual of the subtraction that produced `r`.
  reducedLo = t - r - mid - k * PI_OVER_2_LO;
  reducedHi = r;
}

const S1 = -0.16666666666666632;
const S2 = 0.008333333333322489;
const S3 = -0.00019841269829857949;
const S4 = 2.7557313707070068e-6;
const S5 = -2.5050760253406863e-8;
const S6 = 1.5896909952115501e-10;

/** sin of the reduced argument `hi + lo`, |hi| ≤ π/4. */
function kernelSin(hi: number, lo: number): number {
  const z = hi * hi;
  const v = z * hi;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return hi - (z * (0.5 * lo - v * r) - lo - v * S1);
}

const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 2.480158728947673e-5;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

/** cos of the reduced argument `hi + lo`, |hi| ≤ π/4. */
function kernelCos(hi: number, lo: number): number {
  const z = hi * hi;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const half = 0.5 * z;
  const w = 1 - half;
  return w + (1 - w - half + (z * r - hi * lo));
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  reduce(x);
  switch (quadrant) {
    case 0:
      return kernelSin(reducedHi, reducedLo);
    case 1:
      return kernelCos(reducedHi, reducedLo);
    case 2:
      return -kernelSin(reducedHi, reducedLo);
    default:
      return -kernelCos(reducedHi, reducedLo);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  reduce(x);
  switch (quadrant) {
    case 0:
      return kernelCos(reducedHi, reducedLo);
    case 1:
      return -kernelSin(reducedHi, reducedLo);
    case 2:
      return -kernelCos(reducedHi, reducedLo);
    default:
      return kernelSin(reducedHi, reducedLo);
  }
}

/**
 * atan on four intervals, each with its own exactly-representable split point so
 * that one polynomial covers the reduced argument.
 *
 * The split points are 7/16, 11/16, 19/16 and 39/16, which are exact in binary,
 * so which interval a value lands in cannot vary between engines either.
 */
const ATAN_HI_0 = 0.4636476090008061; // atan(1/2)
const ATAN_HI_1 = 0.7853981633974483; // atan(1)
const ATAN_HI_2 = 0.982793723247329; // atan(3/2)
const ATAN_LO_0 = 2.2698777452961687e-17;
const ATAN_LO_1 = 3.061616997868383e-17;
const ATAN_LO_2 = 1.3903311031230998e-17;
const ATAN_LO_3 = 6.123233995736766e-17;

const T0 = 0.3333333333333293;
const T1 = -0.19999999999876483;
const T2 = 0.14285714272503466;
const T3 = -0.11111110405462356;
const T4 = 0.09090887133436507;
const T5 = -0.0769187620504483;
const T6 = 0.06661073137387531;
const T7 = -0.058335701337905735;
const T8 = 0.049768779946159324;
const T9 = -0.036531572744216916;
const T10 = 0.016285820115365782;

/** atan of a non-negative, finite argument. */
function atanPositive(a: number): number {
  // Beyond 2^66 the answer is π/2 to the last bit.
  if (a >= 7.378697629483821e19) return HALF_PI + ATAN_LO_3;
  // Below 2^-29, atan(a) is a to the last bit.
  if (a < 1.862645149230957e-9) return a;

  let hi: number;
  let lo: number;
  let z: number;
  if (a < 0.4375) {
    hi = 0;
    lo = 0;
    z = a;
  } else if (a < 0.6875) {
    hi = ATAN_HI_0;
    lo = ATAN_LO_0;
    z = (2 * a - 1) / (2 + a);
  } else if (a < 1.1875) {
    hi = ATAN_HI_1;
    lo = ATAN_LO_1;
    z = (a - 1) / (a + 1);
  } else if (a < 2.4375) {
    hi = ATAN_HI_2;
    lo = ATAN_LO_2;
    z = (a - 1.5) / (1 + 1.5 * a);
  } else {
    hi = HALF_PI;
    lo = ATAN_LO_3;
    z = -1 / a;
  }

  const zz = z * z;
  const w = zz * zz;
  const odd = zz * (T0 + w * (T2 + w * (T4 + w * (T6 + w * (T8 + w * T10)))));
  const even = w * (T1 + w * (T3 + w * (T5 + w * (T7 + w * T9))));

  if (hi === 0) return z - z * (odd + even);
  return hi - (z * (odd + even) - lo - z);
}

/**
 * The angle of the vector `(x, y)`, in radians on (-π, π].
 *
 * Argument order is `(x, y)`, not `Math.atan2`'s `(y, x)`. Everything else in
 * the simulation that takes a vector takes it x-first, and one function that
 * reverses it is a bug waiting for the call site that forgets. The name says
 * what it returns rather than how it is computed, for the same reason.
 */
export function angleOf(x: number, y: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;

  if (y === 0) {
    // Object.is distinguishes -0, and on the negative x axis that decides the
    // sign of the answer. Determinism includes the sign of a zero: it reaches
    // the state snapshot as a different byte.
    const negativeZero = Object.is(y, -0);
    if (x > 0 || Object.is(x, 0)) return negativeZero ? -0 : 0;
    return negativeZero ? -PI : PI;
  }
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;

  const quotient = y / x;
  const a = atanPositive(quotient < 0 ? -quotient : quotient);
  if (x > 0) return y > 0 ? a : -a;
  // Second and third quadrants. Written as π − (a − π_lo) rather than as
  // (π + π_lo) − a so the cancellation happens against the double that actually
  // holds π's leading bits.
  return y > 0 ? PI - (a - PI_LO) : a - PI_LO - PI;
}
