/**
 * The **streak** — accuracy, counted, and the `×N` beside the word.
 *
 * Spec [06 · §3](../../docs/spec/06-awards.md): *"a streak counts consecutive
 * releases at the same tier. It is accuracy."* `CONTEXT.md` keeps it apart from
 * the **chain** in the same breath — *"engagement, not accuracy"* — and spec
 * [08 · §4](../../docs/spec/08-economy.md) states the rule the two are built
 * against: **two systems, two pixels, no overlap.**
 *
 * ## It is presentation state and not the ledger, and that is the seam
 *
 * The streak *prices* a cash (spec 08 §3's multiplier table) and it is not part
 * of the pricing. Spec 08 §7's mode matrix keeps it in ZEN — *"words and `×N`
 * remain — they are feedback, not price"* — so a ledger that owned the counter
 * would take the `×N` away with the points, and ZEN would stop being the same
 * game with the ledger deleted. The counter lives here, on the picture; the
 * ledger reads [`multiplierOf`](#multiplierof) and never writes it.
 *
 * ## Escalation is counting, never a new word
 *
 * Spec 06 §1: *"streaks escalate by **counting**, never by inventing a
 * synonym."* So there is one number and one tier here, and the whole of what a
 * streak can do to the vocabulary is put a numeral after it.
 */
import type { Tier } from '../sim/tier.ts';

/**
 * How much one step is worth — spec 06 §3's **+10% per step**, where a step is
 * `N − 1`.
 */
export const STREAK_STEP = 0.1;

/**
 * How many steps it may climb — spec 06 §3's **capped at 5**, so `×6` and above
 * all pay ×1.5.
 *
 * It is a cap on the *multiplier* and not on the count: spec 10 posts the
 * longest PERFECT streak as a stat, so the number goes on rising after the price
 * stops.
 */
export const STREAK_CAP = 5;

/** The count at which the `×N` is first drawn — spec 06 §3's **second** occurrence. */
export const STREAK_SHOWN_AT = 2;

/**
 * The streak as the picture carries it.
 *
 * `tier` is `null` before the first graded release of a run and after a death,
 * which are the two states spec 06 §3 gives no count to.
 */
export interface StreakView {
  readonly tier: Tier | null;
  /** How many consecutive releases have landed on `tier`. Zero when there is none. */
  readonly count: number;
  /** What it prices a cash at — spec 08 §3's `1 + 0.10 × min(N−1, 5)`. */
  readonly multiplier: number;
  /** Whether the `×N` is drawn at all — spec 06 §3's first-display rule. */
  readonly shown: boolean;
}

/** No streak: the state a run opens in and the state a death returns it to. */
export const NO_STREAK: StreakView = { tier: null, count: 0, multiplier: 1, shown: false };

/** Spec 08 §3's `1 + 0.10 × min(N − 1, 5)`, and `×1` for no streak at all. */
export function multiplierOf(count: number): number {
  if (count <= 1) return 1;
  return 1 + STREAK_STEP * Math.min(count - 1, STREAK_CAP);
}

/**
 * The streak after a graded release at `tier`.
 *
 * **Any change of tier opens a new count at one, in both directions**, and that
 * is spec 06 §3 read as its own acceptance states it rather than as its two rows
 * read separately: *"the sequence SHARP, SHARP, PERFECT, SHARP yields `SHARP ×1`,
 * `SHARP ×2`, `PERFECT ×1`, `SHARP ×1`."* The *"broken downward only"* row and
 * the *"upgrades"* row are the same arithmetic seen from two sides — a lesser
 * result resets, and a better one *"ends the SHARP count and opens `PERFECT ×1`"*
 * — so there is one branch here and not two.
 *
 * What *"broken downward only"* is protecting is that nothing else may touch it:
 * no timer, no coast, no grab. See [`streakAfter`](#streakafter)'s callers.
 */
export function struckStreak(previous: StreakView, tier: Tier): StreakView {
  const count = previous.tier === tier ? previous.count + 1 : 1;
  return {
    tier,
    count,
    multiplier: multiplierOf(count),
    shown: count >= STREAK_SHOWN_AT,
  };
}

/**
 * The streak one tick on: struck by a graded release, ended by death, and
 * **untouched by everything else**.
 *
 * The list of things that deliberately do nothing here is longer than the list
 * that does, and every one of them is a rule:
 *
 * - **A miss** is not a graded release, so it changes no counter (spec 06 §3,
 *   ADR-0008). It arrives as `tier === null` and falls through.
 * - **Coasting** cannot expire it. Spec 06 §3: *"no timer... expiry-by-clock
 *   would punish route-reading."* There is no clock in this function to expire
 *   anything with, which is the strongest form of that rule.
 * - **A grab** is not graded at all (spec 06 §1 as amended: an *arrival* earns
 *   its own word and no streak — the arrival's vocabulary is one rung and spec
 *   06 §3's counter is written about releases).
 *
 * **Death ends every streak** (spec 06 §3). What the debrief wants is the value
 * the run died *holding* — spec 06 §8's *"CHAIN ×11 WENT WITH YOU"* — and
 * capturing that is spec [09](../../docs/spec/09-debrief.md)'s and M6's; this is
 * the rule as spec 06 states it, and the card that reports it will have to read
 * the tick before rather than the tick of.
 */
export function streakOf(previous: StreakView, struck: Tier | null, ended: boolean): StreakView {
  if (ended) return NO_STREAK;
  if (struck === null) return previous;
  return struckStreak(previous, struck);
}
