/**
 * The **ledger** — carry, cash and bank. Spec
 * [08](../../docs/spec/08-economy.md)'s arithmetic, and nothing else in the game
 * knows it.
 *
 * ```
 * GRAB ──── carry accrues ────► RELEASE ──── cash ────► BANK
 *                                  │
 *                               (miss)
 *                                  │
 *                                  └──► carry rides into the next swing (ADR-0008)
 * ```
 *
 * ## Where it sits, and why it is not inside `derive`
 *
 * It is **composed beside the picture rather than within it**. `derive.ts` does
 * not import this file and nothing it imports does either, which is the seam spec
 * 08's own acceptance asks for — *"deleting the economy module leaves grading,
 * callouts, streaks and every timing intact"* — held as a fact about the import
 * graph rather than as a convention. `test/state/seam.test.ts` walks it.
 *
 * That is also what makes **ZEN a configuration and not a branch** (ADR-0005,
 * M4.7): a run with no currency never opens a ledger, so there is no mode to test
 * for here and no stub to leave behind. There is exactly one `Mode` field read in
 * this file, and it is read once, at death.
 *
 * The app shell carries it beside the simulation and the picture:
 *
 * ```ts
 * previous = current;
 * stepSim(sim, input);
 * current = derive(previous, sim);
 * ledger = tally(ledger, previous, current, sim, mode);
 * ```
 *
 * ## It is a recurrence, like the picture and for the same reason
 *
 * ADR-0015's three rules apply unchanged: it advances **once per tick**, it is
 * **seeded** by [`openLedger`](#openledger) rather than inherited, and every
 * memory it holds is shed at a bounded event — the swing's mark at the next grab,
 * the band at the next grab, the carry at the next graded release. Nothing in it
 * eases, so there is no feedback loop to drift.
 *
 * ## The three numbers a reader will want
 *
 * - **Carry is an exact real and is rounded once, at cash time** (spec 08 §3).
 *   Rounding per tick would make the wage depend on how many ticks a swing took.
 * - **Carry is not bounded by one swing** (ADR-0008). A missed release neither
 *   pays nor destroys, so the carry rides; three misses and a PERFECT cash the
 *   whole accumulation at once, which is spec 08's own acceptance.
 * - **Multipliers multiply and never add** (spec 08 §3). The theoretical maximum
 *   over base for one swing is `2.0 × 3.0 × 1.5 = ×9`, and it is legible exactly
 *   because there is one product and no sum anywhere in this file.
 */
import { METRE } from '../sim/units.ts';
import type { Ending, SimState } from '../sim/types.ts';
import type { Tier } from '../sim/tier.ts';
import { bandAt } from './boundary.ts';
import { struckNow } from './callout.ts';
import { takenBy } from './compass.ts';
import { struckStreak } from './streak.ts';
import type { Mode } from './mode.ts';
import type { PresentationState } from './types.ts';

/**
 * What one metre climbed while engaged is worth before any multiplier — spec
 * 08 §3's **1 point per metre**.
 *
 * Axiom 1's whole content, as a number: *"progress is the only base currency.
 * Metres climbed while engaged. Not time, not kills, not combos of combos."*
 */
export const POINT_PER_METRE = 1;

/** What one link of chain adds to the accrual — spec 08 §4's flat **+10% per link**. */
export const CHAIN_STEP = 0.1;

/**
 * The run's ledger.
 *
 * Four of the six fields are the constitution's; two are the marks the recurrence
 * needs and they are on the same object rather than beside it, so there is one
 * thing to seed and one thing to carry.
 */
export interface Ledger {
  /**
   * Points accrued this run and still at stake — `CONTEXT.md`'s **carry**.
   *
   * An exact real, held unrounded from tick to tick and rounded once at cash
   * (spec 08 §3). Visible as the brightness of the **trail** and never as a
   * number (spec 08 §8).
   */
  readonly carry: number;
  /** Points that are safe — `CONTEXT.md`'s **bank**. Always an integer. */
  readonly bank: number;
  /**
   * What a graded release **right now** would cash, or `null` when a release now
   * would miss.
   *
   * Spec 08 §8 puts it on the BANK chip's second line while a graded release is
   * armed. It is a projection and not a promise, and the promise is testable:
   * the value standing here on the tick before a release is exactly the cash that
   * release pays, because both are computed from the same compass, the same
   * carry, the same band and the same streak. `test/state/ledger.test.ts` asserts
   * it over a flown run.
   */
  readonly armed: number | null;
  /**
   * The highest the craft has been since the current engagement began, as design
   * `y`, or `null` while coasting.
   *
   * **This is what makes waiting worth nothing.** See [`climbOf`](#climbof).
   */
  readonly mark: number | null;
  /**
   * The deepest boundary band the craft has occupied since the grab — spec
   * 08 §3's derived aggregation.
   */
  readonly band: 1 | 2 | 3;
}

/** A run's ledger at tick zero: nothing carried, nothing banked, nothing armed. */
export function openLedger(): Ledger {
  return { carry: 0, bank: 0, armed: null, mark: null, band: 1 };
}

/**
 * Spec 08 §3's rounding: **half-up**, and carry is never negative so this is the
 * whole of it.
 *
 * `Math.round` is half-up for positive arguments and exact, so it is not one of
 * the functions [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)
 * takes off this layer — `pnpm portable` bans the approximated ones and this is
 * not among them.
 */
export function cashRound(points: number): number {
  return Math.round(points);
}

/**
 * What the run is worth all told — the number the monotonicity property is about.
 *
 * **Carry alone falls at every cash**, by design: the points move to the bank.
 * What may never fall is the two together, and they are added *after* the same
 * rounding a cash applies, because a cash of a fractional carry rounds it once
 * and `10.4 → 10` is not a loss of points, it is the point count the player has
 * always had. See `test/state/ledger.test.ts`.
 */
export function worthOf(ledger: Ledger): number {
  return ledger.bank + cashRound(ledger.carry);
}

/**
 * How many metres of new altitude this tick bought, given the swing's mark.
 *
 * ## The one derivation in this file, and spec 08 §6 is what settles it
 *
 * *"For each metre of altitude gained"* has two readings and they are not close.
 * Read per tick — every upward tick pays — a craft that simply holds an orbit is
 * paid for the near side of every lap, and spec 08 §6 says the opposite in as
 * many words: *"orbiting: no points per lap. **Altitude gained while orbiting is
 * ≈ 0**, so the formula already says so; no special rule is needed."* That
 * sentence is only true of a **net** reading, so the net reading is the one the
 * spec states.
 *
 * So a swing carries a high-water mark of its own and only ground above it pays.
 * A lap pays its first climb and nothing after it; holding at an apex pays
 * nothing at all, which is §6's *"waiting is priced at exactly its altitude
 * value: none."*
 *
 * **The simulation makes the same distinction one layer down and paid to learn
 * it**: [`markHighWater`](../sim/run.ts) does not advance while a body is held,
 * because *"an orbit is a round trip, and the height gained going round its near
 * side is not ground kept."* This is the same fact priced instead of judged.
 *
 * ## ⚠ Where the mark is reset is derived, not ruled
 *
 * It is reset **at each grab**, so a craft that falls back and re-climbs the same
 * ground is paid for it again. The alternative — one mark for the whole run — is
 * the stricter reading of *"progress"*, and it would pay a recovery nothing,
 * which sits badly beside axiom 3's *"coasting is never punished"*. Spec 08 §3
 * writes the accrual under *"while **engaged**"*, so per-engagement is what the
 * sentence says; it is recorded here and in `docs/plan/m4-the-economy.md` so the
 * author can overrule it cheaply, exactly as §3's band aggregation is.
 */
export function climbOf(mark: number, craftY: number): number {
  return mark > craftY ? (mark - craftY) / METRE : 0;
}

/** What the chain multiplies the accrual by — spec 08 §3's `1 + 0.10 × chainLinks`. */
export function accrualRate(links: number): number {
  return 1 + CHAIN_STEP * links;
}

/**
 * The deepest band the craft is in **as the picture drew it** — spec 08 §3's
 * derived aggregation, taken one tick at a time.
 *
 * Read off [`PresentationState.boundary`](./types.ts) rather than recomputed from
 * the corridor, and that is axiom 5 rather than convenience: *"if a scoring rule
 * cannot point at the thing that announced it, the rule is wrong."* The `away`
 * this prices is the same `away` the motes are laid out along.
 *
 * A field with no line has no bands (`test/state/boundary.test.ts`'s infinite
 * corridor, and `pnpm portable`'s), so it prices at ×1.
 */
export function bandNow(view: PresentationState): 1 | 2 | 3 {
  let deepest: 1 | 2 | 3 = 1;
  for (const side of view.boundary) {
    const band = bandAt(side.away);
    if (band > deepest) deepest = band;
  }
  return deepest;
}

/**
 * What a graded release at `tier` would cash right now.
 *
 * Spec 08 §3, exactly: `round( round(carry) × tier × band × streak )`. The
 * streak passed is the one **including** this release, because that is what the
 * callout says — the board's worked example reads `PERFECT ×3` over `+1 634` and
 * prices at the ×1.2 that third PERFECT earns.
 */
export function cashFor(carry: number, tier: number, band: number, streak: number): number {
  return cashRound(cashRound(carry) * tier * band * streak);
}

/** Spec 06 §2's tier column, and spec 08 §3's — the one place they are numbers. */
export const TIER_MULTIPLIER: Readonly<Record<Tier, number>> = {
  MAKE: 1,
  TRUE: 1.25,
  SHARP: 1.5,
  PERFECT: 2,
};

/**
 * Whether an ending took the run rather than finished it.
 *
 * **CLEARED is the win and is not a death** ([`run.ts`](../sim/run.ts)), so it
 * does not take the carry. What it *does* with the carry is spec
 * [12](../../docs/spec/12-finish.md)'s and M6's — the results sheet is what the
 * run is left holding — and until that exists the carry rides, unpaid and
 * undestroyed, which is ADR-0008's own shape for the only other case where a
 * swing ends without a graded release.
 */
function died(ending: Ending | null): boolean {
  return ending !== null && ending !== 'CLEARED';
}

/**
 * The ledger one tick on. Call once per tick, after `derive`.
 *
 * The order below is the loop's own order and each step depends on the one above
 * it: a swing accrues, a release prices what it accrued, and the chip states what
 * the next release would be worth.
 */
export function tally(
  previous: Ledger,
  view: PresentationState,
  sim: SimState,
  mode: Mode,
): Ledger {
  // **Death takes the carry in every mode that has one, and the bank only where
  // the mode says so** — spec 08 §7's acceptance, and the one `Mode` field this
  // file reads. There is no second reader.
  if (died(sim.ending)) {
    return {
      carry: 0,
      bank: mode.deathTakesBank ? 0 : previous.bank,
      armed: null,
      mark: null,
      band: 1,
    };
  }

  const held = sim.heldBody !== null;

  // **The mark is placed at the grab and cleared at the release.** A tick that is
  // held and had no mark is the grab (`derive.ts` reads the same event the same
  // way), and its own altitude is the datum the swing is measured from — so the
  // grab tick itself pays nothing, which is correct: no ground has been climbed
  // yet.
  const mark = held ? (previous.mark ?? sim.craft.y) : null;

  let carry = previous.carry;
  if (held && mark !== null) {
    carry += POINT_PER_METRE * climbOf(mark, sim.craft.y) * accrualRate(view.chain.links);
  }

  // The band is deepest-reached **between grab and release** (spec 08 §3), so it
  // opens at the grab rather than carrying the last swing's answer into this one.
  const band: 1 | 2 | 3 = !held
    ? previous.band
    : previous.mark === null
      ? bandNow(view)
      : (Math.max(previous.band, bandNow(view)) as 1 | 2 | 3);

  // **The cash is triggered by the pixel that announced the grade**, not by a
  // second reading of the same geometry — [`struckNow`](./callout.ts), which the
  // streak and the tank read too. Nothing is recorded in the simulation for the
  // ledger's benefit and `SIM_VERSION` does not move.
  const struck = struckNow(view.callout);
  let bank = previous.bank;
  if (struck !== null) {
    bank += cashFor(carry, TIER_MULTIPLIER[struck], previous.band, view.streak.multiplier);
    carry = 0;
  }

  // **A miss cashes nothing and destroys nothing** (ADR-0008). There is no branch
  // for it here, which is the point: a release that graded nothing simply does not
  // reach the line above, and the carry it climbed is still standing.

  return {
    carry,
    bank,
    armed: armedCash(view, carry, held ? band : previous.band),
    mark: held ? Math.min(mark ?? sim.craft.y, sim.craft.y) : null,
    band,
  };
}

/**
 * What the BANK chip's second line states — spec 08 §8's *armed cash*.
 *
 * `null` while coasting and while a release would miss, because spec 03 §2 puts
 * the line up only *"while a graded release is armed"* and the chip states a
 * fact rather than an instruction to release.
 */
function armedCash(view: PresentationState, carry: number, band: 1 | 2 | 3): number | null {
  if (view.compass === null) return null;
  const taken = takenBy(view.compass.rings);
  if (taken === null) return null;
  return cashFor(
    carry,
    TIER_MULTIPLIER[taken.tier],
    band,
    struckStreak(view.streak, taken.tier).multiplier,
  );
}
