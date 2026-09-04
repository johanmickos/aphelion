/**
 * Spec [13](../../docs/spec/13-fuel.md)'s acceptance, and ADR-0009's ruling
 * underneath it: **fuel is returned by skill, and by nothing else.**
 *
 * The load-bearing one is the property: *"fuel returned by a release is unchanged
 * when carry, band, streak, chain and velocity are varied and tier is held fixed.
 * A property test over those five inputs finds one value per tier."* It is
 * load-bearing because the failure it guards against is the one ADR-0009 exists
 * to prevent — paying fuel per point, which *"would refuel longest on the longest
 * orbits, rewarding exactly the slow, coasting-adjacent play the economy leaves
 * unpaid."*
 *
 * ⚠ **Nothing spends the tank on this build**, so `f` is 1.0 through every run
 * and two of the three warning states are unreachable in play. They are asserted
 * directly instead — see [`fuel.ts`](../../src/state/fuel.ts)'s header for what
 * they wait on, which is spec [07 · §5](../../docs/spec/07-boundary.md)'s burn.
 */
import { describe, expect, it } from 'vitest';
import {
  COST_MAX,
  COST_MIN,
  EMPTY_PERIOD,
  FUEL_LOW,
  LOW_PERIOD,
  REFERENCE_CLOSING,
  SPEED_FACTOR_MAX,
  SPEED_FACTOR_MIN,
  TIER_FUEL,
  WARNING_FLOOR,
  affordableAt,
  costOf,
  haloOf,
  openTank,
  refuelled,
  speedFactor,
} from '../../src/state/fuel.ts';
import type { Tank } from '../../src/state/fuel.ts';
import type { Tier } from '../../src/sim/tier.ts';
import { openEconomy } from '../../src/state/economy.ts';
import { DAILY, ZEN } from '../../src/state/mode.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

const TIERS: readonly Tier[] = ['MAKE', 'TRUE', 'SHARP', 'PERFECT'];

describe('spec 13 §1 · what fuel is', () => {
  it('starts full', () => {
    expect(openTank().level).toBe(1);
  });

  /** *"Passive drain: none. Fuel is not a clock."* There is no tick in `refuelled`. */
  it('has no clock in it', () => {
    const tank = { level: 0.4 };
    expect(refuelled(tank, null)).toBe(tank);
  });
});

describe('spec 13 §4 · how fuel returns', () => {
  /** *"Strictly increasing in tier."* */
  it('pays more for a better word', () => {
    for (let at = 1; at < TIERS.length; at++) {
      expect(TIER_FUEL[TIERS[at]!]).toBeGreaterThan(TIER_FUEL[TIERS[at - 1]!]);
    }
  });

  /** *"`make > 0`, so a struggling run can still refuel and the game has no fuel death spiral."* */
  it('pays a make something', () => {
    expect(TIER_FUEL.MAKE).toBeGreaterThan(0);
  });

  /** *"Clamped: `f = min(1, f + return)`."* */
  it('never fills past a full tank', () => {
    expect(refuelled({ level: 0.99 }, 'PERFECT').level).toBe(1);
  });

  /** *"A miss — not a graded release — returns 0."* */
  it('pays a miss nothing', () => {
    expect(refuelled({ level: 0.5 }, null).level).toBe(0.5);
  });

  /**
   * **ADR-0009's law, as the property spec 13's acceptance asks for.**
   *
   * The five things fuel must not read are carry, band, streak, chain and
   * velocity, and the strongest form of *"it does not read them"* available is
   * that they are not in the signature at all: `refuelled` takes a tank and a
   * tier. So the property is asserted the way a caller could break it — by
   * sweeping all five through the composition that pays the fuel and finding one
   * value per tier.
   */
  it('returns one value per tier, whatever else the swing did', () => {
    for (const tier of TIERS) {
      const seen = new Set<number>();
      for (const carry of [0, 12.5, 340, 5000]) {
        for (const band of [1, 2, 3]) {
          for (const streak of [1, 1.2, 1.5]) {
            for (const chain of [0, 4, 30]) {
              for (const velocity of [0, 700, 1400]) {
                // Every one of these is in scope where the fuel is paid
                // (`economy.ts`), and none of them may reach it.
                void carry;
                void band;
                void streak;
                void chain;
                void velocity;
                seen.add(refuelled({ level: 0.5 }, tier).level);
              }
            }
          }
        }
      }
      expect(seen.size).toBe(1);
      expect([...seen][0]).toBeCloseTo(0.5 + TIER_FUEL[tier], 10);
    }
  });

  /** *"A run that never releases at better than `make` still gains fuel, monotonically."* */
  it('refuels a run that only ever makes it', () => {
    let tank: Tank = { level: 0 };
    let last = 0;
    for (let release = 0; release < 1 / TIER_FUEL.MAKE; release++) {
      tank = refuelled(tank, 'MAKE');
      expect(tank.level).toBeGreaterThanOrEqual(last);
      last = tank.level;
    }
    expect(tank.level).toBe(1);
  });
});

describe('spec 13 §2 · fuel and the deadline window', () => {
  /** *"A save at `p = 0.2` costs strictly less than a save at `p = 0.8` at the same closing speed."* */
  it('costs more the later it is taken', () => {
    expect(costOf(0.2, REFERENCE_CLOSING)).toBeLessThan(costOf(0.8, REFERENCE_CLOSING));
    // Strictly increasing everywhere, not only at those two points.
    let last = -1;
    for (let p = 0; p <= 1; p += 0.01) {
      const cost = costOf(p, REFERENCE_CLOSING);
      expect(cost).toBeGreaterThan(last);
      last = cost;
    }
  });

  /** The table's own endpoints, at the speed it is stated at. */
  it('is C_MIN at the earliest press and C_MAX at the dot', () => {
    expect(speedFactor(REFERENCE_CLOSING)).toBeCloseTo(1, 10);
    expect(costOf(0, REFERENCE_CLOSING)).toBeCloseTo(COST_MIN, 10);
    expect(costOf(1, REFERENCE_CLOSING)).toBeCloseTo(COST_MAX, 10);
  });

  /** *"A faster dive is a more expensive carve"*, clamped both ways. */
  it('clamps the speed factor', () => {
    expect(speedFactor(0)).toBe(SPEED_FACTOR_MIN);
    expect(speedFactor(-1000)).toBe(SPEED_FACTOR_MIN);
    expect(speedFactor(1e9)).toBe(SPEED_FACTOR_MAX);
    expect(speedFactor(2 * REFERENCE_CLOSING)).toBeGreaterThan(speedFactor(REFERENCE_CLOSING));
  });

  /** *"Half a tank lights the early half; an empty tank shows the whole window in DUSK."* */
  it('lights what the tank can afford, from the earliest press upward', () => {
    expect(affordableAt({ level: 0 }, REFERENCE_CLOSING)).toBe(0);
    expect(affordableAt({ level: COST_MIN }, REFERENCE_CLOSING)).toBeCloseTo(0, 10);
    expect(affordableAt({ level: (COST_MIN + COST_MAX) / 2 }, REFERENCE_CLOSING)).toBeCloseTo(
      0.5,
      10,
    );
    expect(affordableAt({ level: 1 }, REFERENCE_CLOSING)).toBe(1);
  });

  /**
   * ⚠ **The measurement that says this coupling is invisible today.** At a full
   * tank the whole window is lit at every closing speed the corpus contains: the
   * fraction only falls below 1 above a factor of 1.667, which needs 2.67× the
   * reference — **1 450** design units a second against a measured maximum of
   * **1 031** over the 2 137 ticks the deadline is up.
   */
  it('lights the whole window at a full tank, at every speed ever flown at it', () => {
    for (const closing of [0, 230, 543, 934, 1031]) {
      expect(affordableAt({ level: 1 }, closing)).toBe(1);
    }
    // And the speed at which it would finally bind, so the claim above has a
    // number rather than an assurance.
    expect(affordableAt({ level: 1 }, 1450)).toBeLessThan(1);
  });
});

describe('spec 13 §5 · the warnings', () => {
  /** One hue at three energies, and the thresholds are the spec's own. */
  it('steps at a quarter tank and at empty', () => {
    expect(haloOf({ level: 1 }, 0).severity).toBe('NORMAL');
    expect(haloOf({ level: FUEL_LOW + 0.01 }, 0).severity).toBe('NORMAL');
    expect(haloOf({ level: FUEL_LOW }, 0).severity).toBe('LOW');
    expect(haloOf({ level: 0.01 }, 0).severity).toBe('LOW');
    expect(haloOf({ level: 0 }, 0).severity).toBe('EMPTY');
  });

  /** The gauge is the tank and never a number — spec 08 §8's grammar, one system along. */
  it('sweeps by exactly the tank', () => {
    for (const level of [0, 0.25, 0.5, 1]) {
      expect(haloOf({ level }, 0).sweep).toBe(level);
    }
  });

  /** *"Breathing at 0.8Hz"* at LOW and *"strobing at 2Hz"* at empty, and neither reaches zero. */
  it('breathes at LOW and strobes at EMPTY, and never goes out', () => {
    const beats = (level: number, period: number): number[] =>
      Array.from({ length: period }, (_, tick) => haloOf({ level }, tick).beat);
    for (const [level, period] of [
      [0.1, LOW_PERIOD],
      [0, EMPTY_PERIOD],
    ] as const) {
      const wave = beats(level, period);
      expect(Math.min(...wave)).toBeCloseTo(WARNING_FLOOR, 10);
      expect(Math.max(...wave)).toBeGreaterThan(0.95);
      // One beat per period, and the period is the spec's rate.
      expect(haloOf({ level }, 0).beat).toBeCloseTo(haloOf({ level }, period).beat, 10);
    }
    expect(LOW_PERIOD).toBeGreaterThan(EMPTY_PERIOD);
  });

  /** And nothing breathes while there is nothing to warn about. */
  it('is flat while the tank is comfortable', () => {
    for (let tick = 0; tick < 200; tick++) expect(haloOf({ level: 1 }, tick).beat).toBe(1);
  });
});

describe('spec 13 §6 · fuel by mode', () => {
  /** *"ZEN's build contains no fuel state."* An absence, not a zero. */
  it('gives ZEN no tank at all', () => {
    expect(openEconomy(ZEN).tank).toBeNull();
    expect(openEconomy(DAILY).tank).not.toBeNull();
  });
});

describe('the shipped run', () => {
  const RUN = pricedRun(shippedRecipe());

  /**
   * M4.4's acceptance: *"fuel never rises except by the stated returns"* — and
   * the run's answer to it, which is the finding rather than a pass.
   *
   * ⚠ **The tank is 1.0 on every tick of every run.** It opens full (spec 13 §1),
   * the returns clamp there, and **nothing on this build spends it**: a save is an
   * ordinary grab since spec 03 §5's rebase, and the charge belongs to spec
   * 07 §5's burn. So the run cannot show a rise at all, and what it can show is
   * that there is never a fall — which is the half of the acceptance that is
   * reachable. The rise-by-a-tier half is asserted on `refuelled` above.
   */
  it('is full on every tick, and never falls, because nothing spends it', () => {
    for (let tick = 1; tick < RUN.economies.length; tick++) {
      const before = RUN.economies[tick - 1]!.tank!.level;
      const now = RUN.economies[tick]!.tank!.level;
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBe(1);
    }
    expect(RUN.economies.length).toBeGreaterThan(100);
  });

  /** And the halo the picture draws from it is the resting one, all the way. */
  it('draws a full, resting halo the whole way', () => {
    for (const [tick, economy] of RUN.economies.entries()) {
      const halo = haloOf(economy.tank!, tick);
      expect(halo.severity).toBe('NORMAL');
      expect(halo.sweep).toBe(1);
      expect(halo.beat).toBe(1);
    }
  });
});
