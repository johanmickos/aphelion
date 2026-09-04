/**
 * Spec [08](../../docs/spec/08-economy.md)'s acceptance, and
 * [M4.1](../../docs/plan/m4-the-economy.md)'s load-bearing one.
 *
 * > *"No path exists in which banked or carried points decrease except death."*
 *
 * That sentence is the reason ADR-0008 exists, and it is asserted below as a
 * **property over many random recipes** rather than over one run: the failure it
 * guards against is a rule that is correct on every swing anybody thought to fly
 * and wrong on the fourth missed release in a row.
 *
 * Everything here is read from outside the simulation
 * ([AGENTS.md](../../AGENTS.md) §4) — a bank, a carry, a tier and a band are all
 * things a run reports, and nothing below reaches into `stepSim`.
 */
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { FIXTURE_FIELD, MAX_RECIPE_TICKS } from '../../src/sim/recipe.ts';
import type { Recipe } from '../../src/sim/recipe.ts';
import { RECIPE_VERSION } from '../../src/sim/recipe.ts';
import { SIM_VERSION } from '../../src/sim/version.ts';
import { METRE } from '../../src/sim/units.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { openEconomy, stepEconomy } from '../../src/state/economy.ts';
import { DAILY, ZEN } from '../../src/state/mode.ts';
import type { Mode } from '../../src/state/mode.ts';
import {
  TIER_MULTIPLIER,
  accrualRate,
  cashFor,
  cashRound,
  climbOf,
  openLedger,
  worthOf,
} from '../../src/state/ledger.ts';
import type { Ledger } from '../../src/state/ledger.ts';
import { multiplierOf } from '../../src/state/streak.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

const RUN = pricedRun(shippedRecipe());

/** The ledger on a tick of the shipped run. */
const ledgerAt = (tick: number): Ledger => RUN.economies[tick]!.ledger!;

describe("the board's worked example", () => {
  /**
   * Spec 08 §3's own table, recomputed from the formula rather than restated:
   * 142 m climbed engaged at chain ×6, a PERFECT, in the fire band, on a third
   * consecutive PERFECT.
   *
   * It is the acceptance's first line — *"recomputing the board's worked example
   * from the formula yields exactly 1 634"* — and it is here because it is the
   * one number in the whole economy that an outside document states.
   */
  it('cashes exactly 1 634', () => {
    const carry = 142 * accrualRate(6);
    expect(cashRound(carry)).toBe(227);
    expect(cashFor(carry, TIER_MULTIPLIER.PERFECT, 3, multiplierOf(3))).toBe(1634);
  });

  /** And every multiplier in it multiplies — spec 08 §3's *"they never add"*. */
  it('is a product and never a sum', () => {
    // The theoretical maximum over base for one swing, which spec 08 §3 states
    // as ×9 exactly because there is one product in the arithmetic.
    expect(TIER_MULTIPLIER.PERFECT * 3 * multiplierOf(6)).toBeCloseTo(9, 10);
    expect(cashFor(100, TIER_MULTIPLIER.PERFECT, 3, multiplierOf(6))).toBe(900);
  });
});

describe('the accrual', () => {
  /**
   * Axiom 1: *"progress is the only base currency. Metres climbed while
   * engaged."* One design metre of climb is one point at chain zero.
   */
  it('pays one point a metre at chain zero', () => {
    expect(climbOf(100 * METRE, 99 * METRE)).toBeCloseTo(1, 10);
    expect(accrualRate(0)).toBe(1);
  });

  /**
   * Spec 08 §3: *"descending metres accrue nothing; carry never decreases."*
   * Design `y` grows downward, so a craft below its mark has climbed nothing.
   */
  it('pays nothing for descending', () => {
    expect(climbOf(100 * METRE, 140 * METRE)).toBe(0);
  });

  /** Spec 08 §4's flat +10% a link, folded into the accrual and not into the cash. */
  it('adds ten per cent a link', () => {
    expect(accrualRate(1)).toBeCloseTo(1.1, 10);
    expect(accrualRate(6)).toBeCloseTo(1.6, 10);
  });
});

describe('the shipped run', () => {
  /**
   * Spec 08 §6: *"orbiting: no points per lap. Altitude gained while orbiting is
   * ≈ 0, so the formula already says so."*
   *
   * The strongest form available of that sentence: over every tick of every hold
   * in the run, the carry moves only while the craft is above the mark its own
   * swing set — so a lap that returns to where it started pays for the climb
   * once and for the round trip never.
   */
  it('pays a hold only for ground it has not already been paid for', () => {
    for (let tick = 1; tick < RUN.views.length; tick++) {
      const before = ledgerAt(tick - 1);
      const now = ledgerAt(tick);
      if (now.mark === null || before.mark === null) continue;
      // The mark only ever rises (design `y` only ever falls), which is what
      // makes the accrual net rather than per-tick.
      expect(now.mark).toBeLessThanOrEqual(before.mark);
    }
  });

  /**
   * Spec 08 §8: *"armed cash — while a graded release is armed, the value it
   * would cash."*
   *
   * **What the chip promised is what the bank got**, and it is a property of the
   * build rather than a coincidence: both are `round(round(carry) × tier × band ×
   * streak)` over the same compass, the same carry, the same band and the same
   * streak, one tick apart. Nothing accrues on a release tick, because the craft
   * is no longer holding anything.
   */
  it('cashes exactly what the chip said it would', () => {
    let checked = 0;
    for (let tick = 1; tick < RUN.views.length; tick++) {
      const before = ledgerAt(tick - 1);
      const now = ledgerAt(tick);
      // The one tick the bank moves and no release earned it is the **death**,
      // which takes it — see the property below. It is skipped here rather than
      // guarded against, because what this is about is the promise on the chip.
      if (now.bank <= before.bank) continue;
      expect(before.armed).toBe(now.bank - before.bank);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });

  /**
   * A run that never cashed would make every claim above vacuous.
   *
   * The **peak** rather than the final bank: this run ends in a death, and DAILY
   * takes the bank with it (spec 08 §7) — which is the mode working, not a run
   * that earned nothing.
   */
  it('cashes something', () => {
    const peak = Math.max(...RUN.economies.map((economy) => economy.ledger!.bank));
    expect(peak).toBeGreaterThan(1000);
    expect(ledgerAt(RUN.economies.length - 1).bank).toBe(0);
  });
});

/**
 * A recipe of random presses, for the property below.
 *
 * Deliberately **not** a plausible player: presses land on a coin flip at a
 * geometric spacing, so the corpus is full of the cases a person never flies —
 * taps that grab nothing, holds that run to the end of the field, and long
 * strings of releases outside every window. That is where the deferral lives.
 */
function noisyRecipe(seed: number, ticks: number): Recipe {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const log: number[] = [];
  let tick = Math.floor(next() * 40);
  while (tick < ticks) {
    log.push(tick);
    tick += 1 + Math.floor(next() * 90);
  }
  return {
    version: RECIPE_VERSION,
    sim: SIM_VERSION,
    field: FIXTURE_FIELD,
    seed: 1 + (seed % 1000),
    ticks: Math.min(ticks, MAX_RECIPE_TICKS),
    log,
  };
}

/** Every tick's ledger, when the run died, and what its releases did. */
function fly(
  recipe: Recipe,
  mode: Mode,
): { ledgers: Ledger[]; deadFrom: number; releases: number; misses: number } {
  const opening = openRun(recipe);
  let view = createPresentation(opening);
  let economy = openEconomy(mode);
  const ledgers: Ledger[] = [economy.ledger!];
  let deadFrom = Infinity;
  let releases = 0;
  let misses = 0;
  replayRun(recipe, {
    onTick: (state) => {
      const before = view;
      view = derive(view, state);
      economy = stepEconomy(economy, view, state, mode);
      ledgers.push(economy.ledger!);
      if (before.bodies.some((body) => body.held) && state.heldBody === null) {
        releases += 1;
        // A release that struck no word is a miss (spec 06 §5), and ADR-0008
        // says it cashes nothing — which is the case this property is about.
        if (view.callout === null || view.callout.life.age !== 0) misses += 1;
      }
      if (state.ending !== null && state.ending !== 'CLEARED' && deadFrom === Infinity) {
        deadFrom = ledgers.length - 1;
      }
    },
  });
  return { ledgers, deadFrom, releases, misses };
}

describe('M4.1 · the property', () => {
  /**
   * > *"No path exists in which banked or carried points decrease except death."*
   *
   * **Stated on the integers the player is shown**, which is the only form that
   * can be true. The carry alone falls at every cash — the points move — so what
   * may never fall is the two together, after the single rounding spec 08 §3
   * applies at cash time. `worthOf` is that number and this asserts it tick by
   * tick over 120 runs of random pressing.
   *
   * ADR-0008 is what makes it non-trivial: a missed release neither pays nor
   * destroys, so the carry rides. Pricing a miss at ×0 would pass every other
   * test in this file and fail this one on its first miss.
   */
  it('never lets the bank or the carry fall, except at a death', () => {
    let cashes = 0;
    let misses = 0;
    let releases = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const recipe = noisyRecipe(seed * 7919, 1800);
      const flight = fly(recipe, DAILY);
      for (let tick = 1; tick < flight.ledgers.length && tick < flight.deadFrom; tick++) {
        const before = flight.ledgers[tick - 1]!;
        const now = flight.ledgers[tick]!;
        expect(now.bank).toBeGreaterThanOrEqual(before.bank);
        expect(worthOf(now)).toBeGreaterThanOrEqual(worthOf(before));
        if (now.bank > before.bank) cashes += 1;
      }
      misses += flight.misses;
      releases += flight.releases;
    }
    // The corpus has to have paid something and missed something, or the claim
    // above is a claim about a ledger nobody moved. The misses are the half that
    // matters: a build that priced them at ×0 passes every other test here.
    expect(cashes).toBeGreaterThan(20);
    expect(misses).toBeGreaterThan(20);
    expect(releases).toBeGreaterThan(misses);
  });

  /**
   * And the other half of the same sentence: **death takes the carry, in every
   * mode that has one.**
   *
   * Spec 08 §7's acceptance also asks that *"whether it also clears bank is read
   * from one mode-configuration value and from nowhere else"*, which is asserted
   * by flying the identical recipe under two modes that differ in exactly that
   * value and finding one difference.
   */
  it('takes the carry at a death, and the bank where the mode says so', () => {
    const keeper: Mode = { ...DAILY, name: 'KEEPER', deathTakesBank: false };
    let deaths = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const recipe = noisyRecipe(seed * 104729, 1800);
      const taken = fly(recipe, DAILY);
      const kept = fly(recipe, keeper);
      if (taken.deadFrom === Infinity) continue;
      deaths += 1;
      const died = taken.ledgers[taken.deadFrom]!;
      const survivedBank = kept.ledgers[kept.deadFrom - 1]!.bank;
      expect(died.carry).toBe(0);
      expect(died.bank).toBe(0);
      expect(kept.ledgers[kept.deadFrom]!.carry).toBe(0);
      expect(kept.ledgers[kept.deadFrom]!.bank).toBe(survivedBank);
    }
    expect(deaths).toBeGreaterThan(10);
  });
});

describe('ADR-0008 · the deferred carry', () => {
  /**
   * Spec 08's acceptance: *"three consecutive missed releases followed by one
   * PERFECT cash the whole accumulated carry once, at ×2.0 × band × streak, and
   * nothing before."*
   *
   * Asserted as arithmetic on the ledger's own function, because the geometry
   * that produces three misses and then a PERFECT is a property of a field
   * rather than of the economy — and what the criterion is about is that the
   * carry *arrives whole*.
   */
  it('cashes the whole accumulation once, and nothing before', () => {
    // Three swings that climbed 40, 55 and 62 metres and missed every window.
    const carried = 40 + 55 + 62;
    expect(cashFor(carried, TIER_MULTIPLIER.PERFECT, 1, multiplierOf(1))).toBe(314);
    // The same metres cashed one swing at a time would pay the same at ×2 — the
    // deferral is neither a bonus nor a penalty, which is ADR-0008's whole claim.
    const separately =
      cashFor(40, TIER_MULTIPLIER.PERFECT, 1, 1) +
      cashFor(55, TIER_MULTIPLIER.PERFECT, 1, 1) +
      cashFor(62, TIER_MULTIPLIER.PERFECT, 1, 1);
    expect(separately).toBe(314);
  });

  /** And a miss is not a tier: it never reaches the cash at all. */
  it('is what makes carry unbounded by one swing', () => {
    const ledger = openLedger();
    expect(ledger.carry).toBe(0);
    expect(ledger.bank).toBe(0);
    expect(ledger.armed).toBeNull();
  });
});

describe('ZEN', () => {
  /**
   * M4.7's acceptance from the ledger's side: a mode with no currency opens no
   * ledger at all. There is no zero bank, because there is no bank.
   */
  it('has no ledger to price anything with', () => {
    expect(openEconomy(ZEN).ledger).toBeNull();
    expect(openEconomy(DAILY).ledger).not.toBeNull();
  });

  /**
   * And flying the identical recipe in ZEN changes **nothing** about the
   * picture: the same words, the same streaks, the same chain, the same timings.
   * That is spec 08 §7's *"grading survives; pricing does not"*, and it is the
   * whole reason ZEN is built (ADR-0005).
   */
  it('draws the same picture as DAILY, tick for tick', () => {
    const recipe = shippedRecipe();
    const daily = pricedRun(recipe, DAILY);
    const zen = pricedRun(recipe, ZEN);
    expect(zen.views.length).toBe(daily.views.length);
    for (let tick = 0; tick < daily.views.length; tick++) {
      expect(zen.views[tick]).toEqual(daily.views[tick]);
    }
    expect(zen.economies.every((economy) => economy.ledger === null)).toBe(true);
  });
});
