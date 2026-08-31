/**
 * `pnpm bench` — the desktop bench: this game, with the open questions on
 * sliders.
 *
 * The M1 gate was flown on one and every ruling that came out of it came out of
 * here: the clearance's rate bound, the neighbour bounce, the camera's follow
 * rate, spec 00 §7's fit. What makes it worth having rather than a mock-up is
 * that it runs **the repo's own simulation** — `src/sim/`, `src/state/` and
 * `src/render/` exactly as they are, bundled for the browser — so a verdict
 * reached here is a verdict about the game.
 *
 * ## How, and why it is a copy
 *
 * `src/` is copied to a work tree, a listed handful of constants are rewritten
 * into settable bindings ([`patches.ts`](./patches.ts)), and the result is
 * bundled into one file and inlined into [`page.html`](./page.html). The copy is
 * the whole point: **the constants stay `const` in `src/`**, because AGENTS.md
 * §6 asks a knob for an argument about why the decision cannot be made once
 * inside, and *"so it can be flown"* is an argument for a bench rather than for a
 * setting.
 *
 * The work tree is typechecked before it is bundled, so the bench's own entry is
 * held to the patched modules it actually imports; and every patch must apply
 * exactly once, so a constant that is renamed or moved fails here — and fails
 * `test/bench.test.ts` before that, on every `pnpm check`.
 *
 * Output is one self-contained HTML file. Open it, or publish it; it has no
 * server and asks for nothing.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { PATCHES } from './patches.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(ROOT, 'bench');
const WORK = join(OUT, 'work');
const PAGE = join(OUT, 'aphelion-bench.html');

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// `tools/` comes along because the bench reads its trail through the same
// `trail.ts` that `pnpm replay` prints — one reader, so the bench cannot grow a
// second opinion about where on the envelope a release fell. `app/input.ts`
// comes because the rule that turns devices into the one boolean is the real
// one, focus loss and all.
cpSync(join(ROOT, 'src'), join(WORK, 'src'), { recursive: true });
// …but not `fixture.ts`, which is a sweep over the **test** corpus rather than
// anything the game runs: it drives the headless pilot in `test/sim/run.ts` and
// reads its criteria from `test/moments.ts`, neither of which is copied here and
// neither of which should be. Left in, the work tree fails to typecheck against
// imports that are not there — which is the copy telling the truth, so what is
// fixed is the copy rather than the tool.
cpSync(join(ROOT, 'tools'), join(WORK, 'tools'), {
  recursive: true,
  filter: (from) => basename(from) !== 'fixture.ts',
});
mkdirSync(join(WORK, 'app'));
cpSync(join(ROOT, 'app', 'input.ts'), join(WORK, 'app', 'input.ts'));
cpSync(join(HERE, 'entry.ts'), join(WORK, 'entry.ts'));

for (const patch of PATCHES) {
  const path = join(WORK, patch.file);
  const source = readFileSync(path, 'utf8');
  const at = source.indexOf(patch.find);
  if (at === -1 || source.indexOf(patch.find, at + 1) !== -1) {
    console.error(
      `\n  the bench cannot patch ${patch.file}: expected exactly one\n` +
        `    ${patch.find.split('\n')[0]!}\n` +
        `  ${patch.why}\n\n` +
        '  Fix tools/bench/patches.ts to match the source, or the sliders it feeds\n' +
        '  are wired to nothing. test/bench.test.ts checks this on every pnpm check.\n',
    );
    process.exit(1);
  }
  writeFileSync(path, source.replace(patch.find, patch.replace) + (patch.append ?? ''));
}

// Held to the same compiler the game is, against the patched modules the entry
// actually imports — which is why the entry is excluded from the root tsconfig
// rather than typechecked against a `src/` that has no setters in it.
writeFileSync(
  join(WORK, 'tsconfig.json'),
  JSON.stringify(
    {
      extends: join(ROOT, 'tsconfig.json'),
      compilerOptions: { types: ['node'], noEmit: true },
      include: ['entry.ts', 'src', 'tools', 'app'],
      exclude: ['tools/bench'],
    },
    null,
    2,
  ),
);
try {
  execFileSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', WORK], { stdio: 'inherit' });
} catch {
  // tsc has already said what is wrong, above. Line numbers are the work tree's
  // and the entry is copied unchanged, so they are `tools/bench/entry.ts`'s.
  console.error('\n  the bench does not typecheck (line numbers are tools/bench/entry.ts’s)\n');
  process.exit(1);
}

await build({
  root: WORK,
  logLevel: 'warn',
  build: {
    lib: {
      entry: 'entry.ts',
      name: 'AphelionBench',
      formats: ['iife'],
      fileName: () => 'bench.js',
    },
    outDir: join(WORK, 'out'),
    emptyOutDir: true,
    minify: true,
    target: 'es2022',
  },
});

const html = readFileSync(join(HERE, 'page.html'), 'utf8');
const script = readFileSync(join(WORK, 'out', 'bench.js'), 'utf8');
if (!html.includes('__BENCH_JS__')) {
  console.error('  tools/bench/page.html has no __BENCH_JS__ for the bundle to go in');
  process.exit(1);
}
writeFileSync(PAGE, html.replace('__BENCH_JS__', script));

console.log(
  `\n  bench built from ${PATCHES.length} patches · ${(script.length / 1024).toFixed(1)}KB of game\n` +
    `  ${PAGE}\n`,
);
