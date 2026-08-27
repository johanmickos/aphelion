/**
 * The world's units, and the one number that sets them.
 *
 * Spec [01](../../docs/spec/01-swing.md) states every length in the prototype's
 * world units, whose field is 390 wide, because that is what its measurements
 * were taken in and §0 rules that a spec which silently rescales its own
 * evidence is worse than one that does not scale at all. This repo's design
 * space is 1170 × 2532 (ADR-0010), exactly three times that in each direction.
 *
 * **The conversion is confirmed** (author, 2026-08-27, closing spec 01 §13.3):
 * the rewrite should feel the same in the hand on the same phone, so lengths,
 * speeds and accelerations scale by 3, and a gravitational parameter — units of
 * length³ / time² — by 3³ = 27. Times, angles, ratios and tick counts are
 * unchanged and appear below exactly as the spec states them.
 *
 * Every length in the simulation is derived from `SCALE` and the spec's own
 * figure, written as a product so the reader can see both. Declining the
 * conversion later, or moving to a different design size, is this one constant.
 */

/**
 * Design units per prototype unit.
 *
 * Not `3` written thirty times: it is the highest-leverage number in spec 01 and
 * it wanted a name before it wanted a value.
 */
export const SCALE = 3;

/** The same factor applied to a gravitational parameter, which is a volume rate. */
const VOLUME_SCALE = SCALE * SCALE * SCALE;

/**
 * How long a tick lasts.
 *
 * Ticks are the only clock in the game (ADR-0006) and this is the single place a
 * second is named. It is here so that the physical constants below can be the
 * ones spec 01 measured — accelerations in units per second squared, speeds in
 * units per second — rather than a set of per-tick figures 3600× away from every
 * tolerance they have to be checked against.
 *
 * Naming a second is not reading a clock. Nothing in `src/sim/` or `src/state/`
 * can reach `Date`, `performance` or a timer; `pnpm portable` proves it. What
 * crosses the boundary is a duration handed in from outside, and
 * [`clock.ts`](./clock.ts) is the only thing that accepts one.
 */
export const SECONDS_PER_TICK = 1 / 60;

/**
 * Integration steps inside one tick — spec 01 §12.
 *
 * Six is **converged, not chosen**: `test/sim/integrate.test.ts` holds the
 * convergence against a 96-substep reference on every run, which is the form
 * spec 01 §12's tolerance asks for — *"a convergence test, not a fixed number,
 * so the rewrite can choose its own count and prove it."*
 */
export const SUBSTEPS = 6;

/** The most ticks one call may catch up by, so a stall cannot become a fast-forward. */
export const MAX_CATCH_UP_TICKS = 3;

/**
 * The gravitational parameter of a body of median radius — spec 01 §2's
 * 5 500 000, converted.
 *
 * A body's own parameter is a function of its radius; see
 * [`body.ts`](./body.ts). This is the anchor that function is normalised to, so
 * that moving the exponent leaves the median body untouched.
 */
export const MEDIAN_MASS = 5_500_000 * VOLUME_SCALE;

/** The median body's radius — spec 01 §13.2's field median of 44, converted. */
export const MEDIAN_RADIUS = 44 * SCALE;

/**
 * The softening length in `a(r) = μ / (r² + ε²)` — spec 01 §2's 18, converted.
 *
 * It is what makes the force law depart from inverse-square close in: 9.4%
 * weaker at the floor, 3.1% at r = 100 prototype units, 0.8% at 200. That
 * departure is measured behaviour, not a numerical safety valve, so the constant
 * is part of the physics rather than a guard on it.
 */
export const SOFTENING = 18 * SCALE;

/**
 * How far above a body's surface its floor sits — spec 01 §6a's 12, converted.
 *
 * A **feel choice** and stated as one: 16 read as too loose and 10 as a touch
 * tight, and below 8 the craft would clip the surface. Nothing else in the swing
 * depends on it.
 */
export const FLOOR_GAP = 12 * SCALE;

/**
 * How steeply mass follows radius, in `μ(R) = MEDIAN_MASS × (R / MEDIAN_RADIUS)ⁿ`.
 *
 * **An opening position at 2**, and the one genuine knob in the simulation.
 * Spec [04 · §1](../../docs/spec/04-bodies.md) rules *"mass is size"* and spec
 * [01 · §13.2](../../docs/spec/01-swing.md) defers only how steeply — to the M1
 * gate, on the phone, against this repo's own field rather than the prototype's.
 * `0` reproduces the prototype exactly, where every body had one mass and radius
 * touched only the floor and the collision surface.
 *
 * It is a parameter and not a constant because the author explicitly deferred
 * it, which is the argument [AGENTS.md](../../AGENTS.md) §6 asks a knob to make.
 * When the gate closes, this becomes a number and the parameter goes away.
 */
export const MASS_EXPONENT = 2;
