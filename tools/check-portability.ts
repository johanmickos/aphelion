/**
 * Guards the rule that keeps the physics free of tooling: `src/sim/` must import
 * nothing outside itself, use no bundler-specific syntax, and touch no DOM — so
 * it runs under plain node, under Vitest, and under any future bundler.
 *
 * Run with plain `node`, deliberately: if this file executes at all, the sim
 * loaded without a bundler.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// The simulation is imported dynamically, AFTER the static scan below. Importing
// it at module load would execute it first, so a banned browser global would
// surface as a raw ReferenceError instead of this tool's own diagnosis.

const SIM_DIR = fileURLToPath(new URL('../src/sim', import.meta.url));

const BANNED: ReadonlyArray<[RegExp, string]> = [
  [/import\.meta\.(glob|env|hot)/, 'bundler-specific import.meta usage'],
  [/\?(raw|url|worker|inline)['"]/, 'bundler-specific import query'],
  [/\b(document|window|navigator|localStorage|requestAnimationFrame)\b/, 'DOM/browser global'],
  [/\bperformance\s*\.\s*now\b/, 'wall-clock read (physics must be tick-indexed)'],
  [/\bMath\s*\.\s*random\b/, 'unseeded randomness (use the seeded rng)'],
];

let failures = 0;

for (const file of readdirSync(SIM_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(SIM_DIR, file), 'utf8');
  // strip comments so prose about `document` or `performance.now` is not a hit
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  for (const m of code.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1]!;
    if (!spec.startsWith('.')) {
      console.error(`${file}: imports package "${spec}" — src/sim must be dependency-free`);
      failures++;
    } else if (spec.includes('../')) {
      console.error(`${file}: imports "${spec}" outside src/sim`);
      failures++;
    }
  }
  for (const [re, why] of BANNED) {
    if (re.test(code)) {
      console.error(`${file}: ${why}`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`\n${failures} portability violation(s) — not attempting to load the sim.`);
  process.exit(1);
}

// proof of life: the sim runs headlessly, right here, with no bundler involved
const { createInitialState, stepSim } = await import('../src/sim/step.ts');
const { DEFAULT_CONFIG, FIXED_DT } = await import('../src/sim/config.ts');
const { NO_INPUT } = await import('../src/sim/types.ts');

const state = createInitialState(DEFAULT_CONFIG);
for (let i = 0; i < 120; i++) stepSim(state, DEFAULT_CONFIG, NO_INPUT, FIXED_DT);
if (state.tick !== 120) {
  console.error(`smoke run: expected tick 120, got ${state.tick}`);
  failures++;
}
if (!Number.isFinite(state.ship.y)) {
  console.error('smoke run: ship position is not finite');
  failures++;
}

if (failures) {
  console.error(`\n${failures} portability violation(s).`);
  process.exit(1);
}
console.log(`src/sim is portable — ran ${state.tick} ticks under plain node, no bundler`);
