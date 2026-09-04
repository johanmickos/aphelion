/**
 * The **economy** — the ledger and the tank, opened together and advanced
 * together, and absent together.
 *
 * This is the module the plan means by *"delete the ledger"*
 * ([M4.7](../../docs/plan/m4-the-economy.md)). It is one composition rather than
 * two so that the app shell, the replay tools and the scenario runner all fold
 * the same thing in the same order, and so that ZEN is one `null` instead of
 * two.
 *
 * ## The seam, stated plainly
 *
 * ```
 * stepSim(sim, input)          the simulation  — owns the clock
 * derive(previous, sim)        the picture     — grading, callouts, streaks, chain
 * step(economy, view, sim)     the economy     — carry, cash, bank, fuel
 * ```
 *
 * **Nothing on the second line imports anything on the third.** `derive.ts` does
 * not reach [`ledger.ts`](./ledger.ts) or [`fuel.ts`](./fuel.ts), and nothing it
 * imports does either — `test/state/seam.test.ts` walks the import graph and
 * fails if it ever does. That is spec [08](../../docs/spec/08-economy.md)'s own
 * acceptance held as a fact rather than as a habit: *"deleting the economy module
 * leaves grading, callouts, streaks and every timing intact — ZEN runs with the
 * ledger module absent, not stubbed."*
 *
 * ## Why it is not part of presentation state
 *
 * It would fit: it is derived per tick, it is pure, and it is drawn. What it
 * would cost is the sentence above. A `PresentationState.ledger` would put the
 * ledger's import inside `derive.ts`, where the callouts and every timing live,
 * and deleting the economy would then break the picture — so ZEN would need a
 * branch, and the seam ADR-0005 built ZEN to prove would be a convention rather
 * than a wall.
 */
import type { SimState } from '../sim/types.ts';
import type { Ledger } from './ledger.ts';
import { openLedger, tally } from './ledger.ts';
import type { Mode } from './mode.ts';
import type { PresentationState } from './types.ts';

/**
 * What a run is worth so far, or the absences ZEN flies with.
 *
 * Both fields are `null` in ZEN and neither is a zero: spec 08 §7 gives ZEN
 * *"none"* for a currency and spec [13 · §6](../../docs/spec/13-fuel.md) gives it
 * no tank, and a zero bank would be a score of nothing where what is meant is no
 * score at all.
 */
export interface Economy {
  readonly ledger: Ledger | null;
}

/** A run with no economy at all — what ZEN flies, and what a tool that wants none passes. */
export const NO_ECONOMY: Economy = { ledger: null };

/** The economy this mode opens a run with (ADR-0015's second rule, one system along). */
export function openEconomy(mode: Mode): Economy {
  return { ledger: mode.currency === null ? null : openLedger() };
}

/**
 * The economy one tick on. Call once per tick, after `derive` and with the
 * picture that tick produced.
 *
 * **After `derive`, and that ordering is load bearing**: the cash is triggered by
 * the callout the picture struck, so the pricing reads the pixel that announced
 * the grade rather than grading the same geometry a second time
 * ([`ledger.ts`](./ledger.ts)).
 */
export function stepEconomy(
  previous: Economy,
  view: PresentationState,
  sim: SimState,
  mode: Mode,
): Economy {
  return {
    ledger: previous.ledger === null ? null : tally(previous.ledger, view, sim, mode),
  };
}
