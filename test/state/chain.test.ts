/**
 * Spec [08 · §4](../../docs/spec/08-economy.md)'s chain, and the acceptance
 * sentence it is written under:
 *
 * > *"Coasting for 24 m then grabbing preserves the chain; coasting for 26 m
 * > then grabbing breaks it."*
 *
 * ⚠ **Those two numbers have moved and the rule has not.** §4's break is *"one
 * full rung"* and a rung has been **50 m** since the author refused 25 on
 * 2026-08-30 ([`RUNG_SPACING`](../../src/state/rung.ts)), so the criterion is
 * asserted at **49 m and 51 m** — the same sentence about the same rung. See
 * [`CHAIN_BREAK_RUNGS`](../../src/state/chain.ts) and
 * `docs/plan/m4-the-economy.md`, which carries the measurement for the author.
 *
 * The chain is driven here through `chainOf` with a hand-built state rather than
 * through a flown run, because *"coast exactly 49 m and then grab"* is a
 * geometry no field in the repo offers on demand — and the run below then checks
 * that the rule the unit test states is the rule the game plays.
 */
import { describe, expect, it } from 'vitest';
import { METRE } from '../../src/sim/units.ts';
import type { SimState } from '../../src/sim/types.ts';
import { RUNG_SPACING } from '../../src/state/rung.ts';
import { CHAIN_BLOOM } from '../../src/state/energy.ts';
import {
  MILESTONES,
  MILESTONE_TICKS,
  NO_CHAIN,
  chainBloom,
  chainBreak,
  chainOf,
  coastedMetres,
} from '../../src/state/chain.ts';
import type { ChainView } from '../../src/state/chain.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

/** Just enough of a simulation for the chain to read: where the craft is, and what it holds. */
const world = (y: number, heldBody: number | null = null, ending = null): SimState =>
  ({ craft: { y }, heldBody, ending }) as unknown as SimState;

/** Coast a chain that has just released to altitude `to`, and say what it did. */
function coast(released: ChainView, to: number): ChainView {
  return chainOf(released, world(to), false);
}

describe('spec 08 §4', () => {
  /** *"Counts: consecutive engaged swings."* A link lands at the release. */
  it('adds a link at each release', () => {
    let chain = NO_CHAIN;
    expect(chain.links).toBe(0);
    chain = chainOf(chain, world(0, 0), true);
    expect(chain.links).toBe(1);
    chain = chainOf(chain, world(0, 0), true);
    expect(chain.links).toBe(2);
  });

  /**
   * The acceptance, at the rung the game actually draws: 49 m of coasting keeps
   * the link and 51 m loses it.
   */
  it('survives 49 m of coasting and breaks at 51', () => {
    const one = chainOf(NO_CHAIN, world(0, 0), true);
    expect(coast(one, -49 * METRE).links).toBe(1);
    expect(coast(one, -51 * METRE).links).toBe(0);
    expect(chainBreak()).toBe(RUNG_SPACING);
  });

  /**
   * **Downward counts too.** A run that falls a rung has not been engaged for a
   * rung either, and design `y` grows downward — so the test is on the distance
   * and not on the sign.
   */
  it('breaks on a rung of falling as well as a rung of climbing', () => {
    const one = chainOf(NO_CHAIN, world(0, 0), true);
    expect(coast(one, 51 * METRE).links).toBe(0);
  });

  /**
   * **Held is not coasting.** A swing that took four seconds has spent none of
   * the rung its last release is measured from, so the mark is dropped at the
   * grab rather than paused.
   */
  it('is not broken by a long hold', () => {
    let chain = chainOf(NO_CHAIN, world(0, 0), true);
    for (let tick = 0; tick < 600; tick++) chain = chainOf(chain, world(-900 * METRE, 3), false);
    expect(chain.links).toBe(1);
    expect(chain.since).toBeNull();
  });

  /** *"Also breaks: on death."* */
  it('is broken by death', () => {
    const chain = chainOf(NO_CHAIN, world(0, 0), true);
    expect(chainOf(chain, { ...world(0, 0), ending: 'IMPACT' } as SimState, false)).toEqual(
      NO_CHAIN,
    );
  });

  /**
   * *"A miss does not break the chain (a missed release is still an engaged
   * swing)"* — spec 08 §5. `chainOf` is told a release happened and is never told
   * what it graded, which is the strongest form of that: there is nothing here
   * for a tier to change.
   */
  it('cannot see what a release graded', () => {
    expect(chainOf.length).toBe(3);
  });

  /**
   * *"Effect on light: gates the craft's bloom — +4px per link"* (spec 00 §3),
   * and spec 06 §6's *"one bloom step"* while a milestone is alive.
   */
  it('is worth four board pixels a link', () => {
    expect(chainBloom({ links: 3, since: null, milestone: null })).toBe(3 * CHAIN_BLOOM);
    expect(chainBloom({ links: 3, since: null, milestone: { age: 0, span: 10 } })).toBe(
      4 * CHAIN_BLOOM,
    );
  });

  /** *"Milestones: ×5, ×10, ×15 get a masthead pulse and one bloom step. No word."* */
  it('pulses at five, ten and fifteen and nowhere else', () => {
    let chain = NO_CHAIN;
    const pulsed: number[] = [];
    for (let link = 1; link <= 16; link++) {
      chain = chainOf(chain, world(0, 0), true);
      if (chain.milestone !== null && chain.milestone.age === 0) pulsed.push(link);
      // Age the pulse out before the next link, so a pulse still running is not
      // mistaken for a new one.
      for (let tick = 0; tick < MILESTONE_TICKS; tick++) {
        chain = chainOf(chain, world(0, 0), false);
      }
    }
    expect(pulsed).toEqual([...MILESTONES]);
  });

  /** How far this coast has run, in the metres the rule is stated in. */
  it('measures its coast in metres', () => {
    const chain = chainOf(NO_CHAIN, world(0, 0), true);
    expect(coastedMetres(chain, -30 * METRE)).toBeCloseTo(30, 10);
    expect(coastedMetres(NO_CHAIN, -30 * METRE)).toBe(0);
  });
});

describe('the shipped run', () => {
  const RUN = pricedRun(shippedRecipe());

  /**
   * The rule the unit tests state is the rule the game plays: on every tick the
   * chain fell, the craft had coasted at least a rung since its last release.
   */
  it('only ever breaks after a rung of coasting, or a death', () => {
    let breaks = 0;
    for (let tick = 1; tick < RUN.views.length; tick++) {
      const before = RUN.views[tick - 1]!;
      const now = RUN.views[tick]!;
      if (now.chain.links >= before.chain.links) continue;
      breaks += 1;
      // A death is the other way it falls, and this run ends in one.
      if (tick === RUN.views.length - 1) continue;
      // Otherwise it was earned by distance, measured against the mark the last
      // release set — which is the same subtraction `chainOf` makes.
      expect(coastedMetres(before.chain, now.craft.y)).toBeGreaterThanOrEqual(chainBreak() / METRE);
    }
    expect(breaks).toBeGreaterThan(0);
  });

  /** And it reaches at least one link, or every claim above is about a flat line. */
  it('reaches a link', () => {
    expect(Math.max(...RUN.views.map((view) => view.chain.links))).toBeGreaterThan(0);
  });
});
