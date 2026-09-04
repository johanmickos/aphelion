/**
 * `pnpm scenarios` — a set of named runs with the outcomes they are expected to
 * produce, re-flown on every commit.
 *
 *   pnpm scenarios            fly them all and say whether they agree
 *   pnpm scenarios --record   write down what they do now
 *
 * [M4.6](../docs/plan/m4-the-economy.md)'s acceptance in one sentence: **a score
 * is a pure function of `(config, seed, input log)`**, and *"replaying a recipe
 * recomputes its exact score."* ADR-0004 makes that the contract the whole
 * project rests on — *"a claimed score is a fact rather than an assertion"* — and
 * until now nothing checked it end to end, because until M4 there was no score.
 *
 * ## Why it is a command and not a golden
 *
 * `test/state/goldens.test.ts` asserts what a *picture* does at a moment named by
 * a sentence. This asserts what a whole *run is worth*, which is one number per
 * run and is the thing a player would argue about. The two fail differently: a
 * golden fails when the picture moves and this fails when the wage does, and a
 * change that moves one and not the other is a change worth being told about
 * precisely.
 *
 * ## Where the runs come from, and why they are not invented
 *
 * Every scenario is a run **the author actually flew**, chosen for the sentence
 * it demonstrates rather than authored to demonstrate it. A hand-written input
 * log that produced a deferred carry would be a log about this file's idea of the
 * game; a dispatch that produced one is evidence.
 *
 * The list is fixed rather than *"every dispatch on disk"*, for the same reason
 * `tools/fixture.ts` proposes and `pnpm check` disposes: a dispatch arriving from
 * the phone must not fail the build it arrived on.
 *
 * ## And the coverage half, which is the one that rots
 *
 * A suite of pinned numbers goes stale invisibly: a physics change re-records it
 * and nobody notices that the run which used to demonstrate the fire band no
 * longer reaches it. So [`COVERS`](#covers) names the sentences the suite has to
 * still be **about**, and a scenario set that stops demonstrating one fails here
 * naming it — the same shape `test/moments.ts` uses for the goldens, one level
 * up.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Recipe } from '../src/sim/recipe.ts';
import { pressAt } from '../src/sim/recipe.ts';
import { openRun } from '../src/sim/replay.ts';
import { stepSim } from '../src/sim/step.ts';
import type { Ending, Tick } from '../src/sim/types.ts';
import type { Tier } from '../src/sim/tier.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import { openEconomy, stepEconomy } from '../src/state/economy.ts';
import { modeNamed } from '../src/state/mode.ts';
import { struckNow } from '../src/state/callout.ts';
import { parseDispatch } from './dispatch.ts';

const ROOT = new URL('../', import.meta.url);

/** Where the expected outcomes live. One file, so a re-record is one diff. */
const EXPECTED = fileURLToPath(new URL('test/scenarios/expected.json', ROOT));

/** One named run, and the sentence it is here for. */
interface Scenario {
  /** What it is called. Stable — it is the key the expectation is filed under. */
  readonly name: string;
  /** Why it is in the suite: the sentence it demonstrates. */
  readonly why: string;
  /** The dispatch or recipe it is flown from, relative to the repo root. */
  readonly from: string;
  /** Which mode prices it. */
  readonly mode: string;
}

/**
 * The suite.
 *
 * Seven runs, six of them the author's own and one the headless pilot's. They
 * were chosen by flying the whole replayable corpus and taking the runs that
 * between them demonstrate every sentence in [`COVERS`](#covers).
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'the richest run in the corpus',
    why: 'thirteen cashes, eight misses, three PERFECTs and a swing in the fire band',
    from: 'diagnostics/2026-09-03T20-40-59-354Z-run-dispatch.json',
    mode: 'DAILY',
  },
  {
    name: 'the longest chain in the corpus',
    why: 'four links, and two swings priced in the fire band',
    from: 'diagnostics/2026-09-03T22-43-28-040Z-run-dispatch.json',
    mode: 'DAILY',
  },
  {
    name: 'a run that misses far more than it makes',
    why: 'nineteen releases outside a window against three inside one — ADR-0008’s deferral, at length',
    from: 'diagnostics/2026-09-01T05-34-49-926Z-run-dispatch.json',
    mode: 'DAILY',
  },
  {
    name: 'a run that never lets go',
    why: 'no release at all, so no cash and no miss: the ledger has to stay still',
    from: 'diagnostics/2026-09-01T18-24-19-712Z-run-dispatch.json',
    mode: 'DAILY',
  },
  {
    name: 'the longest streak in the corpus',
    why: 'four consecutive releases at one tier, which is the ladder above its first step',
    from: 'diagnostics/2026-09-01T06-00-36-885Z-run-dispatch.json',
    mode: 'DAILY',
  },
  {
    name: 'the run this repo ships',
    why: 'the recipe `pnpm replay` flies with no argument, so a number here and a number there agree',
    from: 'test/recipes/pilot-60s.json',
    mode: 'DAILY',
  },
  {
    name: 'the run this repo ships, with the ledger deleted',
    why: 'ZEN — the same presses, the same words, and no ledger at all (ADR-0005)',
    from: 'test/recipes/pilot-60s.json',
    mode: 'ZEN',
  },
];

/** What a run turned out to be worth. Everything here is observable from outside. */
export interface Outcome {
  readonly ending: Ending | null;
  readonly ticks: Tick;
  /** The bank the run ended holding. Zero after a death in DAILY (spec 08 §7). */
  readonly bank: number;
  /** The most it ever held, which is what a death takes. */
  readonly peak: number;
  /** What was still at stake when it stopped. */
  readonly carry: number;
  readonly cashes: number;
  readonly misses: number;
  /** Cashes that carried more than one swing — ADR-0008's deferral, counted. */
  readonly deferred: number;
  /** The longest chain and the longest streak the run reached. */
  readonly chain: number;
  readonly streak: number;
  /** How many cashes each tier and each band paid. */
  readonly tiers: Readonly<Record<Tier, number>>;
  readonly bands: readonly [number, number, number];
  /** The tank it ended on, or `null` in a mode with none. */
  readonly fuel: number | null;
  /** Whether it had a ledger at all. */
  readonly ledger: boolean;
}

/** Fly one scenario and say what it was worth. */
export function flyScenario(scenario: Scenario): Outcome {
  const mode = modeNamed(scenario.mode);
  if (mode === null) throw new Error(`${scenario.name}: no such mode ${scenario.mode}`);
  const recipe = recipeAt(scenario.from);
  const sim = openRun(recipe);
  let view = createPresentation(sim);
  let economy = openEconomy(mode);

  let peak = 0;
  let cashes = 0;
  let misses = 0;
  let deferred = 0;
  let chain = 0;
  let streak = 0;
  let swings = 0;
  const tiers: Record<Tier, number> = { MAKE: 0, TRUE: 0, SHARP: 0, PERFECT: 0 };
  /** Cashes in the field, the outer band and the fire band — spec 07 §2's three. */
  const bands: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  for (let tick = 0; tick < recipe.ticks; tick++) {
    const previous = view;
    stepSim(sim, { pressed: pressAt(recipe.log, tick) });
    view = derive(previous, sim);
    const before = economy;
    economy = stepEconomy(economy, view, sim, mode);

    // A release is a body being held that is not — the same reading `derive`
    // makes, so nothing is recorded in the simulation for this file's benefit.
    if (previous.bodies.some((body) => body.held) && sim.heldBody === null) {
      swings += 1;
      const struck = struckNow(view.callout);
      if (struck === null) {
        misses += 1;
      } else {
        cashes += 1;
        tiers[struck] += 1;
        if (swings > 1) deferred += 1;
        if (before.ledger !== null) bands[before.ledger.band] += 1;
        swings = 0;
      }
    }

    if (economy.ledger !== null) peak = Math.max(peak, economy.ledger.bank);
    chain = Math.max(chain, view.chain.links);
    streak = Math.max(streak, view.streak.count);
    if (sim.ending !== null) break;
  }

  return {
    ending: sim.ending,
    ticks: sim.tick,
    bank: economy.ledger?.bank ?? 0,
    peak,
    carry: round(economy.ledger?.carry ?? 0),
    cashes,
    misses,
    deferred,
    chain,
    streak,
    tiers,
    bands: [bands[1], bands[2], bands[3]],
    fuel: economy.tank === null ? null : round(economy.tank.level),
    ledger: economy.ledger !== null,
  };
}

/** Six places, so a float that is the same run is the same string. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A recipe from a dispatch or from a bare recipe file. */
function recipeAt(path: string): Recipe {
  const raw: unknown = JSON.parse(readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8'));
  return parseDispatch(raw).recipe;
}

/**
 * The sentences the suite has to go on being about.
 *
 * A pinned number that nobody can read is a regression test that passes for the
 * wrong reason. These are read: each one is a claim about the **constitution**,
 * and a suite that stops demonstrating one has stopped covering the rule.
 */
export const COVERS: ReadonlyArray<{ what: string; holds: (of: Outcome) => boolean }> = [
  {
    what: 'a cash that carried more than one swing (ADR-0008)',
    holds: (of) => of.deferred > 0,
  },
  { what: 'a release that cashed nothing at all', holds: (of) => of.misses > 0 },
  { what: 'a swing priced in the fire band, ×3', holds: (of) => of.bands[2] > 0 },
  { what: 'a swing priced in the outer band, ×2', holds: (of) => of.bands[1] > 0 },
  { what: 'a swing priced in the field, ×1', holds: (of) => of.bands[0] > 0 },
  { what: 'a PERFECT', holds: (of) => of.tiers.PERFECT > 0 },
  { what: 'a make — the word that says nothing and pays', holds: (of) => of.tiers.MAKE > 0 },
  { what: 'a streak past its first display', holds: (of) => of.streak >= 2 },
  { what: 'a chain of more than one link', holds: (of) => of.chain > 1 },
  {
    what: 'a death that took a bank with it (spec 08 §7)',
    holds: (of) => of.ledger && of.peak > 0 && of.bank === 0 && of.ending !== null,
  },
  { what: 'a run with no ledger at all — ZEN', holds: (of) => !of.ledger },
  {
    what: 'a run that never released, so the ledger never moved',
    holds: (of) => of.cashes + of.misses === 0,
  },
];

function outcomes(): Record<string, Outcome> {
  const into: Record<string, Outcome> = {};
  for (const scenario of SCENARIOS) into[scenario.name] = flyScenario(scenario);
  return into;
}

/** Which covered sentences no scenario demonstrates. */
export function shortfall(of: Record<string, Outcome>): string[] {
  const flown = Object.values(of);
  return COVERS.filter((cover) => !flown.some((one) => cover.holds(one))).map((one) => one.what);
}

function main(): void {
  const record = process.argv.includes('--record');
  const now = outcomes();
  const missing = shortfall(now);

  if (record) {
    writeFileSync(EXPECTED, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`recorded ${SCENARIOS.length} scenarios → test/scenarios/expected.json`);
  }

  const was: Record<string, Outcome> = JSON.parse(readFileSync(EXPECTED, 'utf8'));
  const wrong: string[] = [];
  for (const scenario of SCENARIOS) {
    const expected = was[scenario.name];
    const got = now[scenario.name]!;
    const agree = expected !== undefined && JSON.stringify(expected) === JSON.stringify(got);
    const bank = got.ledger ? `${got.peak} peak, ${got.bank} kept` : 'no ledger';
    console.log(
      `${agree ? '  ok  ' : '  ✗   '}${scenario.name.padEnd(48)} ${String(got.ticks).padStart(5)} ticks · ${bank}`,
    );
    if (!agree) {
      wrong.push(scenario.name);
      console.log(`        expected ${JSON.stringify(expected)}`);
      console.log(`        got      ${JSON.stringify(got)}`);
    }
  }

  for (const what of missing) console.log(`  ✗   nothing in the suite demonstrates: ${what}`);

  if (wrong.length > 0 || missing.length > 0) {
    console.log(
      `\n${wrong.length} of ${SCENARIOS.length} scenarios disagree, and ${missing.length} sentences are uncovered.`,
    );
    console.log('If the change was deliberate: pnpm scenarios --record, and say so in the commit.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `\n${SCENARIOS.length} scenarios agree, and every one of ${COVERS.length} sentences is demonstrated.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
