/**
 * **Fuel** — what a save costs, and the one resource in the game that is
 * returned by flying well rather than by collecting anything (ADR-0009).
 *
 * Spec [13](../../docs/spec/13-fuel.md) §1 is the whole of what it does: *"it is
 * not a resource the player spends on movement, and there is no throttle to
 * spend it on. It does exactly one thing: it limits how much of the deadline
 * window the craft can afford."*
 *
 * ## ⚠ Nothing spends it on this build, and that is a handover rather than a gap
 *
 * A **save** is *"a press inside the deadline window"* (`CONTEXT.md`) and spec
 * [13 · §3](../../docs/spec/13-fuel.md) charges `cost(p)` at that press. On this
 * build a save is an ordinary **grab**, because spec
 * [03 · §5](../../docs/spec/03-hud.md)'s notice re-based the deadline off spec
 * [07 · §5](../../docs/spec/07-boundary.md)'s **burn** on the author's own
 * instruction — *"a grab needs no fuel, so the instrument comes forward, and what
 * M4.4 adds is the luminance and nothing else."*
 *
 * So the tank starts full, rises by tier, clamps at 1, and **never falls**. Three
 * things below are therefore built and unreachable in play, in the same shape
 * [`SHELTERS`](./boundary.ts) and the chain's own zero were before them:
 *
 * - the **LOW** and **EMPTY** warnings, which need `f ≤ 0.25` and `f = 0`;
 * - the luminance coupling, which at `f = 1` lights the whole window at every
 *   closing speed the corpus contains (see [`REFERENCE_CLOSING`](#));
 * - spec 13 §1's *"`f = 0` removes the ability to save"*, which is the only part
 *   of this system that is **not** built here, because refusing a press is a
 *   change to the simulation and M4 may not move `SIM_VERSION`.
 *
 * All three land with the burn. What is built is the law, so that when the burn
 * arrives it charges rather than invents.
 *
 * ## And it is not the ledger, deliberately
 *
 * ADR-0009 keeps fuel and points apart at both ends: fuel is returned *"in
 * proportion to the tier of a release, never in proportion to the points
 * cashed"*, and powerups *"may pay fuel and time, never points and never
 * multipliers."* They share a file only in the sense that
 * [`economy.ts`](./economy.ts) opens and closes them together, because spec
 * 13 §6 deletes both in the same mode.
 */
import type { Tick } from '../sim/types.ts';
import type { Tier } from '../sim/tier.ts';
import { ticksIn } from './decay.ts';

/** A tank, as spec 13 §1's fraction. Nothing else is in it, and nothing else needs to be. */
export interface Tank {
  /** `f ∈ [0, 1]`. A run opens at 1.0 and there is no passive drain — fuel is not a clock. */
  readonly level: number;
}

/** Spec 13 §1: *"start of run: `f = 1.0`."* */
export function openTank(): Tank {
  return { level: 1 };
}

/**
 * What each tier returns — spec 13 §4's table, and every one of them is an
 * **opening position** the spec says is *"to be tuned on the phone"*.
 *
 * What is not an opening position is the shape, and spec 13 §4 lists it as four
 * invariants: strictly increasing in tier, a function of tier **alone**, `make >
 * 0` so a struggling run can still refuel, and clamped. `test/state/fuel.test.ts`
 * holds all four, the second as a property over carry, band, streak, chain and
 * velocity — because ADR-0009's whole argument is that fuel must not be able to
 * read any of them.
 */
export const TIER_FUEL: Readonly<Record<Tier, number>> = {
  MAKE: 0.02,
  TRUE: 0.05,
  SHARP: 0.09,
  PERFECT: 0.16,
};

/** Spec 13 §2's cost of the earliest legal save, at reference closing speed. */
export const COST_MIN = 0.15;

/** And of a save at the dot — *"the latest legal save is the longest, hottest and most expensive."* */
export const COST_MAX = 0.6;

/** Spec 13 §2's floor and ceiling on the speed factor. */
export const SPEED_FACTOR_MIN = 0.6;
export const SPEED_FACTOR_MAX = 1.8;

/** How much of the factor answers to speed, above its floor — spec 13 §2's 0.4. */
export const SPEED_FACTOR_GAIN = 0.4;

/**
 * The closing speed spec 13 §2's table is stated at, in design units per second —
 * **measured**, because the spec names it *"referenceClosing"* and gives it no
 * value.
 *
 * Over the **2 137 ticks the deadline is up** across the 26 dispatches this build
 * replays, the craft's closing speed on the wall it is leaving through runs p05
 * **230**, p25 359, **p50 543**, p75 700, p95 934, max 1 031. Near the dot — the
 * last fifth of a second before the last press that saves — it runs p50 858.
 *
 * The median is the anchor because that is what the table's numbers are *about*:
 * *"the cost of the earliest legal save, at reference closing speed"* is a
 * sentence about a typical press, and a reference taken at the extreme would
 * price every ordinary save at the factor's floor.
 *
 * ⚠ **What it produces today is a window that is always fully lit**, and that is
 * the finding rather than a defect. At `f = 1` the affordable fraction only falls
 * below 1 above a factor of 1.667, which needs a closing speed of **2.67× the
 * reference — 1 450** — against a corpus maximum of 1 031. Nothing spends the
 * tank, so nothing else can move it either. See the header.
 */
export const REFERENCE_CLOSING = 543;

/** Spec 13 §2's `0.6 + 0.4 × (closing / referenceClosing)`, clamped. */
export function speedFactor(closing: number): number {
  const raw = SPEED_FACTOR_MIN + SPEED_FACTOR_GAIN * (closing / REFERENCE_CLOSING);
  return Math.min(SPEED_FACTOR_MAX, Math.max(SPEED_FACTOR_MIN, raw));
}

/**
 * Spec 13 §2's `cost(p) = (C_MIN + (C_MAX − C_MIN) × p) × speedFactor(closing)`.
 *
 * `p` is the normalised position along the window: 0 at the earliest legal press
 * and 1 at the **dot**, the last press that still saves. Strictly increasing in
 * `p`, which is what makes the dot *"a dial the player aims at rather than a
 * warning they obey"* — and, per `VISION.md`'s fourth pillar, the best-paid save
 * is the latest one.
 */
export function costOf(p: number, closing: number): number {
  return (COST_MIN + (COST_MAX - COST_MIN) * p) * speedFactor(closing);
}

/**
 * How much of the window this tank can afford — spec 13 §2's *"the largest `p`
 * for which `cost(p) ≤ f`, lit from `p = 0` upward"*.
 *
 * **The coupling is by luminance and never by geometry** (spec 03 §5, spec 13
 * §2): this is a fraction the renderer lights, and the window's drawn length does
 * not consult it. *"A moment exists, and you cannot buy it."*
 */
export function affordableAt(tank: Tank, closing: number): number {
  const p = (tank.level / speedFactor(closing) - COST_MIN) / (COST_MAX - COST_MIN);
  return Math.min(1, Math.max(0, p));
}

/**
 * The tank after a graded release — spec 13 §4, and ADR-0009's whole ruling.
 *
 * A **miss** returns nothing, because it is not a graded release; it arrives here
 * as `null` and falls through. The clamp is spec 13 §4's `f = min(1, f + return)`.
 */
export function refuelled(tank: Tank, struck: Tier | null): Tank {
  if (struck === null) return tank;
  return { level: Math.min(1, tank.level + TIER_FUEL[struck]) };
}

/** Spec 13 §5's LOW threshold: *"`f ≤ 0.25`"*. */
export const FUEL_LOW = 0.25;

/**
 * How the halo reads: spec 13 §5's three states, and severity rides the **energy**
 * channel rather than a hue ladder.
 *
 * Spec [03 · §4](../../docs/spec/03-hud.md): *"the prototype's yellow-low /
 * red-empty / red-skull ladder is retired: yellow would add a fourth meaning to
 * hue, and severity is ordinal, so it rides the energy channel like everything
 * else."* There is no skull, because *"a skull judges; `SOS` states a fact."*
 */
export type Severity = 'NORMAL' | 'LOW' | 'EMPTY';

/** Spec 13 §5's **0.8Hz** breath at LOW, as a period in ticks. */
export const LOW_PERIOD = ticksIn(1250);

/** And its **2Hz** strobe at EMPTY. The SOS's own rate, which is the one this game already has. */
export const EMPTY_PERIOD = ticksIn(500);

/**
 * How much of its own brightness the warning keeps at the bottom of its beat.
 *
 * [`SOS_FLOOR`](./deadline.ts)'s, and for its recorded reason: *"a strobe that
 * reaches zero is a thing that keeps disappearing — which reads as broken rather
 * than as urgent."* One number for both warnings in the game, rather than two
 * that would drift.
 */
export const WARNING_FLOOR = 0.45;

/** The halo, as the picture needs it. */
export interface HaloView {
  /** How much of the ring is drawn, 0 to 1 — the tank, and never a number. */
  readonly sweep: number;
  readonly severity: Severity;
  /** The beat, 0 to 1. Flat at 1 while there is nothing to warn about. */
  readonly beat: number;
}

/**
 * The halo for this tank on this tick.
 *
 * The beat is a **triangle rather than a sine**, following
 * [`sosOf`](./deadline.ts): ADR-0014 keeps `sin` out of anything this layer has
 * to agree about across two engines, and what the eye reads at 0.8 or 2 Hz is the
 * rate and the depth, neither of which the shape changes.
 */
export function haloOf(tank: Tank, tick: Tick): HaloView {
  const severity: Severity = tank.level <= 0 ? 'EMPTY' : tank.level <= FUEL_LOW ? 'LOW' : 'NORMAL';
  if (severity === 'NORMAL') return { sweep: tank.level, severity, beat: 1 };
  const period = severity === 'EMPTY' ? EMPTY_PERIOD : LOW_PERIOD;
  const at = period <= 0 ? 0 : (tick % period) / period;
  const wave = at < 0.5 ? at * 2 : (1 - at) * 2;
  return { sweep: tank.level, severity, beat: WARNING_FLOOR + (1 - WARNING_FLOOR) * wave };
}
