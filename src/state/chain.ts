/**
 * The **chain** — engagement, counted, and the light on the craft.
 *
 * `CONTEXT.md`: *"consecutive engaged swings, broken by coasting past one rung.
 * Engagement, not accuracy. Gates the craft's bloom."* Spec
 * [08 · §4](../../docs/spec/08-economy.md) owns it and states the rule it is
 * built against beside the **streak**: **two systems, two pixels, no overlap.**
 *
 * ## Why it is here and not in the ledger
 *
 * It pays into the ledger — spec 08 §3 folds `+10% per link` into the *accrual*
 * rather than into the cash step — and it is not the ledger's. It gates the
 * craft's bloom (spec 00 §3's +4px per link) and the dust's density (spec
 * 05 §2), and spec 08 §7's mode matrix keeps it alive in ZEN with the points
 * gone. A counter the ledger owned would go with the ledger and take the light
 * with it.
 *
 * ## What one link is
 *
 * A **swing** is *"one grab, one orbit, one release"* (`CONTEXT.md`), so a link
 * is complete at the release and not at the grab — which is also where spec
 * [02 · §3](../../docs/spec/02-release.md)'s storyboard puts it: at `T+400` the
 * only permanent change is *"chain +1, so the craft's bloom is 4px wider than an
 * orbit ago."*
 *
 * **A missed release still counts.** Spec 08 §5: *"a miss does not break the
 * streak and does not break the chain (a missed release is still an engaged
 * swing). It breaks neither because neither is about cashing."*
 */
import { METRE } from '../sim/units.ts';
import type { SimState } from '../sim/types.ts';
import { CHAIN_BLOOM } from './energy.ts';
import { RUNG_SPACING } from './rung.ts';
import { advance, place, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';

/**
 * How many rungs of coasting break the chain — spec 08 §4's **one full rung**.
 *
 * ## ⚠ Spec 08 §4 says *"one full rung — 25 m of altitude"* and a rung is 50 m
 *
 * The sentence and its gloss stopped agreeing on 2026-08-30, when the author flew
 * 25 m rungs and refused them — *"the rungs are too close together, it feels
 * chaotic at speed"* — and [`RUNG_SPACING`](./rung.ts) doubled. §4's
 * parenthetical is the old number; its subject, and `CONTEXT.md`'s binding entry
 * — *"broken by coasting past **one rung**"* — are not. So the rule reads the rung
 * the player can actually see, and spec 08's acceptance moves with it: **49 m of
 * coasting preserves the chain and 51 m breaks it**, where the spec's own line
 * says 24 and 26.
 *
 * ## ⚠ And measured on the author's own play, one rung breaks nearly everything
 *
 * Over the 26 dispatches this build replays — 222 release-to-grab transitions —
 * the coast between letting go and taking the next body runs **p25 86 m, p50 128,
 * p75 169, p95 268**: two and a half rungs at the median, because that is how far
 * apart this field puts its bodies.
 *
 * | break at | links that survive it |
 * |---|---|
 * | 25 m (§4's own gloss) | **4.5%** |
 * | **50 m — one rung, what ships** | **10.8%** |
 * | 100 m | 33.8% |
 * | 200 m | 89.2% |
 * | 400 m | 98.2% |
 *
 * The chain therefore reaches **4 at most across the whole corpus**, so §4's
 * milestones at ×5, ×10 and ×15 are unreachable, its *"uncapped in v1"* prices
 * nothing, and spec 05 §2's dust never thickens. The prototype's own equivalent
 * counter — *"consecutive scoring passages, unbroken by a putter-out or a
 * death"* — has **no distance term at all** and ran at ×5 – ×7 in a chained life,
 * which is the behaviour ADR-0013 would carry.
 *
 * **The number is not moved here.** Spec 08 §4 states one rung and
 * [AGENTS.md](../../AGENTS.md) §5 says a spec that is wrong is said so and not
 * rewritten, so what ships is the rule as written and what is added is a slider:
 * this is a **count of rungs** rather than a distance, so moving it composes with
 * the rung spacing instead of quietly disagreeing with it.
 * `docs/plan/m4-the-economy.md` carries the table for the author.
 */
export const CHAIN_BREAK_RUNGS = 1;

/**
 * How far a craft may coast without being engaged before the chain breaks, in
 * design units.
 *
 * **A function and not a `const`**, for [`callout.ts`](./callout.ts)'s recorded
 * reason: both terms are on the bench, and a derived constant is evaluated once
 * at module load — so a slider that moved the rung spacing would move the rungs
 * and not the rule, and the bench would answer confidently and wrongly.
 */
export function chainBreak(): number {
  return CHAIN_BREAK_RUNGS * RUNG_SPACING;
}

/** The links that pulse the masthead — spec [06 · §6](../../docs/spec/06-awards.md)'s ×5, ×10, ×15. */
export const MILESTONES: readonly number[] = [5, 10, 15];

/**
 * How long a milestone's pulse lasts — spec 00 §5's **DECAY**, 420ms.
 *
 * Spec 06 §6 gives the milestone *"a masthead pulse and one bloom step"* and no
 * duration, so it takes the one the token table already states for everything
 * that leaves rather than inventing a sixth length.
 */
export const MILESTONE_TICKS = ticksIn(420);

/**
 * The chain as the picture carries it.
 *
 * `since` is the memory, and it is on the view for the same reason
 * [`PresentationState.rescue`](./types.ts) is: this layer is a recurrence
 * (ADR-0015) and a memo it can read next tick is how it remembers. It is the
 * **altitude the current coast began at** rather than a running total, because a
 * coasting craft feels no gravity and therefore travels an exact straight line
 * (spec 01 §2) — so the distance covered is a subtraction and never an
 * accumulation that could drift.
 */
export interface ChainView {
  /** Consecutive engaged swings. **Uncapped in v1** — spec 08 §4. */
  readonly links: number;
  /** Design `y` the current coast began at, or `null` while a body is held. */
  readonly since: number | null;
  /** The milestone pulse, or `null`. */
  readonly milestone: Decay | null;
}

/** A run opens with no chain, no coast behind it and nothing pulsing. */
export const NO_CHAIN: ChainView = { links: 0, since: null, milestone: null };

/**
 * What the chain adds to the craft's bloom, in design units — spec 00 §3's +4px
 * per link, plus **one more step while a milestone is alive** (spec 06 §6's
 * *"one bloom step"*).
 *
 * A step of the *chain's* own channel rather than an E3: spec 00 §3 allows one
 * E3 alive at a time and nothing strikes one today (`derive.ts`), and a milestone
 * that lit the game's single flash slot would be a fourth user of it arriving
 * without a ruling. `CONTEXT.md` already makes a link of chain a radius, so one
 * more link's worth is the step this system already has.
 */
export function chainLinksLit(chain: ChainView): number {
  return chain.links + (chain.milestone === null ? 0 : 1);
}

/** How much light the chain is worth right now, in design units. */
export function chainBloom(chain: ChainView): number {
  return chainLinksLit(chain) * CHAIN_BLOOM;
}

/**
 * The chain one tick on.
 *
 * `released` is whether the button came up off a held body this tick — the same
 * event `derive.ts` reads off the previous picture, so nothing is recorded in the
 * simulation for the chain's benefit and `SIM_VERSION` stays where it is.
 *
 * Three things move it and nothing else does:
 *
 * - **A release** adds a link, whatever it graded (spec 08 §5).
 * - **Coasting a full rung** breaks it. The mark is set at the release and read
 *   against the craft's altitude every coasting tick; a grab clears it, which is
 *   what *"without being engaged"* means.
 * - **Death** breaks it (spec 08 §4).
 */
export function chainOf(previous: ChainView, sim: SimState, released: boolean): ChainView {
  if (sim.ending !== null) return NO_CHAIN;

  const milestone = advance(previous.milestone);

  if (released) {
    const links = previous.links + 1;
    return {
      links,
      // The coast that decides whether this link survives starts here, at the
      // altitude the craft let go at.
      since: sim.craft.y,
      milestone: MILESTONES.includes(links) ? place(MILESTONE_TICKS) : milestone,
    };
  }

  // **Held is not coasting**, so the mark is dropped on the grab rather than
  // being paused: a swing that took four seconds has not spent any of the rung
  // its last release was measured from.
  if (sim.heldBody !== null) return { links: previous.links, since: null, milestone };

  if (previous.since === null) return { links: previous.links, since: null, milestone };

  const coasted = Math.abs(sim.craft.y - previous.since);
  // Downward as well as upward, and the absolute value is why: a run that falls a
  // rung has not been engaged for a rung either. The prototype's own break is a
  // distance and this game's rungs are horizontal, so altitude is the axis the
  // word *rung* is about.
  if (coasted >= chainBreak()) return { links: 0, since: null, milestone };

  return { links: previous.links, since: previous.since, milestone };
}

/** How far this coast has run, in metres — what a test asserts the break with. */
export function coastedMetres(chain: ChainView, craftY: number): number {
  if (chain.since === null) return 0;
  return Math.abs(craftY - chain.since) / METRE;
}
