/**
 * What a run is worth — the one place a **mode** differs from another mode.
 *
 * Spec [08 · §7](../../docs/spec/08-economy.md)'s binding rule is the whole of
 * why this file is four fields and not a strategy object: *"modes may change
 * what the currency is and what death takes. They may **never** change how a
 * swing is graded."* So the grader ([`tier.ts`](../sim/tier.ts)) has no mode in
 * its signature, the compass has none, the callout has none, and every number
 * below is read by the **pricing** side of the seam and by nothing else.
 *
 * ## It is deliberately a value and not a code path
 *
 * ADR-0005 builds ZEN *"for an architectural reason rather than a commercial
 * one: it is the same game with the ledger deleted, so if the tiers still speak
 * with no points in the game, the seam between grading a swing and pricing a
 * swing is real rather than aspirational."* The shape that makes that true is a
 * **`null` currency** — ZEN does not open a ledger, so there is nothing to
 * branch on and nothing to stub. `test/state/seam.test.ts` holds it from the
 * other side: nothing `derive.ts` can reach imports the ledger.
 *
 * ## Two modes, and the third is blocked on a ruling
 *
 * ADR-0005 as amended by ADR-0007 ships **DAILY, ZEN and DRIFT**. DRIFT is not
 * here, and the reason is spec 08 §7's own open call: *"what death takes in
 * DRIFT"* is unruled, the spec recommends carry-only and explicitly declines to
 * rule it, and [`deathTakesBank`](#) is exactly the value it would set. Writing
 * it would be inventing the ruling ([AGENTS.md](../../AGENTS.md) §5); the shape
 * is here and the mode is one object literal away once the author answers.
 *
 * The two modes v1 designs for and does not build — INFINITE (death takes carry
 * only) and CORRIDORS (currency is time) — are what the two fields are shaped
 * against, which is spec 08 §7's *"the mode boundary must accommodate all five
 * — currency, and what death takes — from the start."*
 */

/**
 * What a graded release pays into.
 *
 * `null` is ZEN and is a real absence rather than a zero: a run with no currency
 * opens no ledger at all, so there is no bank to be zero and no carry to be at
 * stake. `'POINTS'` is the constitution's own currency and the only one v1
 * builds; CORRIDORS' seconds are designed for and are the reason this is a name
 * rather than a boolean (spec 08 §7).
 */
export type Currency = 'POINTS' | null;

/** One mode's economy. Nothing here can reach the grader. */
export interface Mode {
  /** What the debrief and the results sheet call it. */
  readonly name: string;
  readonly currency: Currency;
  /**
   * Whether death clears the **bank** as well as the carry.
   *
   * Spec 08 §7's acceptance: *"death sets carry to 0 in every mode that has a
   * carry; whether it also clears bank is read from one mode-configuration value
   * and from nowhere else."* This is that value, and
   * `test/state/ledger.test.ts` asserts there is no second reader.
   */
  readonly deathTakesBank: boolean;
  /**
   * Whether the run has a **tank** at all.
   *
   * Spec [13 · §6](../../docs/spec/13-fuel.md): ZEN has *"no fuel, no deadline,
   * no burn. There is no death in ZEN, so there is nothing for a save to cost"*
   * — and its acceptance is that *"ZEN's build contains no fuel state"*, which
   * is the same absence the currency is, one system along.
   */
  readonly fuel: boolean;
}

/**
 * **DAILY** — the full constitution. One run, one bank, and the run is the
 * wager (`CONTEXT.md`, ADR-0007).
 */
export const DAILY: Mode = {
  name: 'DAILY',
  currency: 'POINTS',
  deathTakesBank: true,
  fuel: true,
};

/**
 * **ZEN** — the ledger deleted. No points, no bank, no multipliers, no fuel.
 *
 * `deathTakesBank` is `false` and says nothing about ZEN: spec 08 §7 gives it no
 * death at all, and a mode with no currency has no bank for the value to be
 * about. It is `false` rather than absent because a mode is four fields
 * everywhere, and a reader that had to ask *which* fields a mode carries would
 * be the branch this file exists to not have.
 */
export const ZEN: Mode = {
  name: 'ZEN',
  currency: null,
  deathTakesBank: false,
  fuel: false,
};

/** The modes this build ships, by the name the shell is asked for. */
const MODES: readonly Mode[] = [DAILY, ZEN];

/**
 * The mode of that name, or `null` — case-insensitively, because the name
 * arrives from a query string the author types.
 *
 * A refusal rather than a fallback: a shell asked for a mode this build does not
 * have should say so, not fly DAILY and let the author draw conclusions about
 * ZEN from it.
 */
export function modeNamed(name: string): Mode | null {
  const wanted = name.toUpperCase();
  return MODES.find((mode) => mode.name === wanted) ?? null;
}
