/**
 * [M4.6](../docs/plan/m4-the-economy.md)'s acceptance: *"a score must be a pure
 * function of `(config, seed, input log)`... replaying a recipe recomputes its
 * exact score."*
 *
 * The command is `pnpm scenarios` and this is the same claim inside the suite,
 * which is the pair `pnpm portable` and `test/portability.test.ts` already are:
 * the command is what a person runs and reads, and the test is what stops the
 * expectation drifting between one being run and the other.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COVERS, SCENARIOS, flyScenario, shortfall } from '../tools/scenarios.ts';
import type { Outcome } from '../tools/scenarios.ts';

const EXPECTED: Record<string, Outcome> = JSON.parse(
  readFileSync(fileURLToPath(new URL('./scenarios/expected.json', import.meta.url)), 'utf8'),
);

const FLOWN: Record<string, Outcome> = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.name, flyScenario(scenario)]),
);

describe('every scenario', () => {
  /** The acceptance, said as plainly as it can be said. */
  it.each(SCENARIOS.map((one) => one.name))('recomputes its exact score, for %s', (name) => {
    expect(FLOWN[name]).toEqual(EXPECTED[name]);
  });

  /**
   * And it is a **function**, which is the half a pinned number cannot show: two
   * flights of the same recipe under the same mode agree in every field, so the
   * expectation above is pinning a rule rather than a mood.
   */
  it.each(SCENARIOS.map((one) => one.name))('is a pure function of its recipe, for %s', (name) => {
    const scenario = SCENARIOS.find((one) => one.name === name)!;
    expect(flyScenario(scenario)).toEqual(flyScenario(scenario));
  });
});

describe('the suite', () => {
  /**
   * The half that rots. A set of pinned numbers passes for the wrong reason the
   * day a run stops demonstrating the rule it was chosen for, and `COVERS` is
   * what notices.
   */
  it('still demonstrates every sentence it is about', () => {
    expect(shortfall(FLOWN)).toEqual([]);
    expect(COVERS.length).toBeGreaterThan(10);
  });

  /** Every scenario is filed, and nothing is filed that is not a scenario. */
  it('has an expectation for each run and no others', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(SCENARIOS.map((one) => one.name).sort());
  });

  /**
   * ZEN is in the suite and it is the whole reason the suite can make a claim
   * about the seam: the same presses, priced by nothing.
   */
  it('holds a run with no ledger at all', () => {
    const zen = Object.values(FLOWN).filter((one) => !one.ledger);
    expect(zen).toHaveLength(1);
    expect(zen[0]!.bank).toBe(0);
    expect(zen[0]!.fuel).toBeNull();
    // And it flies the identical run: same presses, same length, same ending.
    const daily = FLOWN['the run this repo ships']!;
    expect(zen[0]!.ticks).toBe(daily.ticks);
    expect(zen[0]!.ending).toBe(daily.ending);
    expect(zen[0]!.cashes).toBe(daily.cashes);
    expect(zen[0]!.chain).toBe(daily.chain);
    expect(zen[0]!.streak).toBe(daily.streak);
  });
});
