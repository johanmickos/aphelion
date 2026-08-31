/**
 * The fixture search: which pilot seed still carries everything the goldens are
 * written about.
 *
 * `node tools/fixture.ts [--seeds N] [--from N] [--write]`
 *
 * ## What this replaces
 *
 * A sentence in `test/recipes/pilot-60s.json`'s own note — *"the seed is chosen
 * on coverage rather than length... of six thousand seeds searched exactly ONE
 * still carries all of them"* — and a hand-run script that produced it and was
 * not kept. Coverage criteria that live in a note are criteria that drift from
 * what the goldens actually need, and a search nobody committed is one the next
 * physics change has to reinvent under time pressure.
 *
 * The criteria are [`COVERAGE`](../test/moments.ts), beside the finders that
 * spend them.
 *
 * ## It proposes and `pnpm check` disposes
 *
 * A seed this prints is a seed **worth trying**, not one proven to pass. The
 * proof is the goldens themselves, where a moment nobody thought to put in
 * `COVERAGE` fails at its own finder and names itself. That division is
 * deliberate: making the search authoritative would mean keeping two copies of
 * every golden's subject in step, and the copy that rotted would be the one
 * nobody reads.
 *
 * ## What it costs, measured
 *
 * A seed is one pilot flight plus one derived replay. Six thousand takes about
 * 23 seconds on a laptop and thirty thousand about three minutes, which is why
 * the sweep is a command rather than a background job.
 */
import { writeFileSync } from 'node:fs';
import { fixtureCraft, fixtureField } from '../src/sim/fixture-field.ts';
import { FIXTURE_FIELD, createRecorder, recipeOf, recordPress } from '../src/sim/recipe.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { SIM_VERSION } from '../src/sim/version.ts';
import { COVERAGE, presentRun, shortfall } from '../test/moments.ts';
import { flyRun } from '../test/sim/run.ts';

/** How long a fixture has to be. The goldens need room to watch a word all the way out. */
const LEAST_TICKS = 2000;

function pilotRecipe(seed: number): Recipe {
  const recorder = createRecorder(FIXTURE_FIELD, seed);
  flyRun(fixtureField(), fixtureCraft(), seed, 20_000, (tick, pressed) =>
    recordPress(recorder, tick, pressed),
  );
  return recipeOf(recorder);
}

interface Candidate {
  readonly seed: number;
  readonly ticks: number;
  readonly missing: readonly string[];
}

/**
 * Every seed is judged on **coverage and length separately**, and short runs are
 * derived rather than skipped.
 *
 * Skipping them was the first version and it lied: every moment came back at
 * 100%, because a seed rejected on length had never been asked about anything
 * else. The per-moment column is the thing this tool is for — it says which
 * moment binds the search — so it has to be a reading of all the seeds.
 */
function judge(seed: number): Candidate {
  const recipe = pilotRecipe(seed);
  return { seed, ticks: recipe.ticks, missing: shortfall(presentRun(recipe)) };
}

function flag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} wants a whole number`);
  return value;
}

const count = flag('seeds', 6000);
const from = flag('from', 1);
const write = process.argv.includes('--write');

const started = Date.now();
const carried = new Map<string, number>();
const passed: Candidate[] = [];
let longEnough = 0;

for (let seed = from; seed < from + count; seed++) {
  const candidate = judge(seed);
  if (candidate.ticks >= LEAST_TICKS) longEnough++;
  for (const need of COVERAGE) {
    if (!candidate.missing.some((gone) => gone.startsWith(need.what))) {
      carried.set(need.what, (carried.get(need.what) ?? 0) + 1);
    }
  }
  if (candidate.missing.length === 0 && candidate.ticks >= LEAST_TICKS) passed.push(candidate);
}

const width = Math.max(...COVERAGE.map((need) => need.what.length));
const share = (n: number): string => `${((100 * n) / count).toFixed(2)}%`;

console.log(
  `Swept seeds ${from}..${from + count - 1} in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
);
console.log(
  `SIM_VERSION ${SIM_VERSION}, field ${FIXTURE_FIELD.generator} v${FIXTURE_FIELD.version}.`,
);
console.log('');
console.log(`How many seeds carry each moment on its own — the rarest is the one that binds:`);
console.log('');
for (const need of [...COVERAGE].sort(
  (a, b) => (carried.get(a.what) ?? 0) - (carried.get(b.what) ?? 0),
)) {
  const n = carried.get(need.what) ?? 0;
  console.log(`  ${need.what.padEnd(width)}  ${String(n).padStart(6)}  ${share(n).padStart(7)}`);
}
console.log('');
console.log(
  `  ${`${LEAST_TICKS}+ ticks`.padEnd(width)}  ${String(longEnough).padStart(6)}  ${share(longEnough).padStart(7)}`,
);
console.log(
  `  ${'ALL OF IT, IN ONE FLIGHT'.padEnd(width)}  ${String(passed.length).padStart(6)}  ${share(passed.length).padStart(7)}`,
);
console.log('');

if (passed.length === 0) {
  console.log('No seed in this sweep carries every moment.');
  console.log('Widen it with --seeds / --from before concluding anything; if a wider sweep');
  console.log('still finds none, the moments have outgrown one flight and the question in');
  console.log("docs/plan/m3-the-field.md — one fixture or several — is the author's to answer.");
  process.exitCode = 1;
} else {
  console.log(
    `Seeds carrying everything: ${passed.map((c) => `${c.seed} (${c.ticks} ticks)`).join(', ')}`,
  );
  const best = passed.reduce((a, b) => (b.ticks > a.ticks ? b : a));
  console.log(`Longest is seed ${best.seed} at ${best.ticks} ticks.`);
  if (write) {
    const recipe = pilotRecipe(best.seed);
    const path = new URL('../test/recipes/pilot-60s.json', import.meta.url);
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          kind: 'run-dispatch',
          at: '2026-08-28T00:00:00.000Z',
          recipe,
          observed: {
            ticks: [],
            note:
              `Flown by the headless pilot in test/sim/run.ts, not by a person. Re-flown for ` +
              `SIM_VERSION ${SIM_VERSION}. The seed is chosen on coverage rather than length, and ` +
              `the criteria are COVERAGE in test/moments.ts rather than this sentence -- run ` +
              `\`node tools/fixture.ts\` to re-search. Of ${count} seeds swept, ${passed.length} ` +
              `carried every moment the goldens are written about.`,
          },
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote seed ${best.seed} to test/recipes/pilot-60s.json. Run \`pnpm check\`.`);
  } else {
    console.log('Pass --write to record the longest of them as the shipped fixture.');
  }
}
