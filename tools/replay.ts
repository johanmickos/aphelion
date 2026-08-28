/**
 * `pnpm replay` — take a recipe, fly it, and say whether it lands where it
 * landed before.
 *
 *   pnpm replay                     the recipe this repo ships
 *   pnpm replay diagnostics/….json  a dispatch that arrived from the phone
 *   pbpaste | pnpm replay -         one pasted into a terminal
 *   pnpm replay … --at 1420         and say what tick 1420 was doing
 *
 * This is [M1.5](../docs/plan/m1-the-swing.md)'s acceptance made executable: *a
 * recorded run replays to a bit-identical final state, four times its own
 * length.* The sentence has two readings and this checks both, because neither
 * costs anything and one of them is nearly vacuous on its own — **four
 * independent replays**, each compared at every tick and not merely at the end,
 * and each carried to **four times the run's recorded length**. For a run that
 * ended, those extra ticks are provably nothing, which is what an ending means
 * ([`step.ts`](../src/sim/step.ts) stops advancing a run that has one); for a
 * run still flying when its log ran out they are three more lengths of coasting
 * that still have to agree.
 *
 * It is also the seam a verifying service would run through (ADR-0003): replay
 * plus recompute, with nothing but a recipe on the way in. There is no backend
 * and this is not one — it is a command on the author's own machine.
 *
 * The replay loop itself is [`src/sim/replay.ts`](../src/sim/replay.ts), which
 * is pure and portable and knows nothing about files. This half owns the
 * arguments, the disk and the printing, exactly as `check-portability.ts` owns
 * the terminal and `src/` owns the rules.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Recipe } from '../src/sim/recipe.ts';
import { parseRecipe } from '../src/sim/recipe.ts';
import { replayRun } from '../src/sim/replay.ts';
import { firstDifference, snapshot } from '../src/sim/snapshot.ts';
import type { Tick } from '../src/sim/types.ts';
import { parseDispatch } from './dispatch.ts';
import type { Dispatch } from './dispatch.ts';
import { formatDispatch, formatTrail, walkRun } from './trail.ts';

/**
 * The recipe `pnpm replay` reaches for when it is given nothing.
 *
 * A real run in the real format, so the command has something to prove itself
 * on before the author has flown one — and it says in its own note that it was
 * flown by the headless pilot rather than by a person.
 */
const SHIPPED = fileURLToPath(new URL('../test/recipes/pilot-76s.json', import.meta.url));

/** How many times over, and how many lengths — M1.5's acceptance, as numbers. */
const REPLAYS = 4;
const LENGTHS = 4;

interface Flight {
  /** Every tick's state, folded into one digest, so memory does not grow with the run. */
  readonly stream: string;
  /** The final state's bytes, kept whole so a divergence can name its offset. */
  readonly bytes: Uint8Array;
  readonly ticks: Tick;
}

function fly(recipe: Recipe, ticks: Tick): Flight {
  const stream = createHash('sha256');
  const final = replayRun(recipe, { ticks, onTick: (state) => stream.update(snapshot(state)) });
  return { stream: stream.digest('hex'), bytes: snapshot(final), ticks: final.tick };
}

/** Only ever called once something has already disagreed: this is the diagnosis. */
function firstDivergentTick(recipe: Recipe, ticks: Tick): number {
  const digest = (bytes: Uint8Array): string =>
    createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const first: string[] = [];
  replayRun(recipe, { ticks, onTick: (state) => first.push(digest(snapshot(state))) });
  let at = -1;
  let index = 0;
  replayRun(recipe, {
    ticks,
    onTick: (state) => {
      if (at < 0 && first[index] !== digest(snapshot(state))) at = index;
      index += 1;
    },
  });
  return at;
}

/** Four replays at one length, all compared against the first. */
function agree(recipe: Recipe, ticks: Tick): { ok: boolean; flight: Flight; why: string } {
  const first = fly(recipe, ticks);
  for (let i = 1; i < REPLAYS; i++) {
    const next = fly(recipe, ticks);
    const at = firstDifference(first.bytes, next.bytes);
    if (next.stream !== first.stream || at !== -1) {
      const tick = firstDivergentTick(recipe, ticks);
      return {
        ok: false,
        flight: first,
        why:
          `replay ${i + 1} of ${REPLAYS} diverged` +
          (tick >= 0 ? ` first at tick ${tick}` : '') +
          (at === -1 ? '' : `, final state differs from byte ${at}`),
      };
    }
  }
  return { ok: true, flight: first, why: '' };
}

function usage(): never {
  console.error('usage: pnpm replay [<recipe or dispatch>.json | -] [--at <tick>]');
  process.exit(2);
}

const args = process.argv.slice(2);
const at: Tick[] = [];
let source: string | null = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--at') {
    const tick = Number(args[++i]);
    if (!Number.isInteger(tick) || tick < 0) usage();
    at.push(tick);
  } else if (arg.startsWith('-') && arg !== '-') {
    usage();
  } else if (source === null) {
    source = arg;
  } else {
    usage();
  }
}

const path = source ?? SHIPPED;
let text: string;
try {
  text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
} catch (err) {
  console.error(`\n  cannot read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}

let recipe: Recipe;
let dispatch: Dispatch | null = null;
try {
  const raw: unknown = JSON.parse(text);
  // A dispatch says what it is; anything else is asked to be a recipe. Both go
  // through the same validator underneath (`parseRecipe`), which is the only
  // door a recipe comes in through wherever it arrives from.
  const kind =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).kind : undefined;
  if (kind === undefined) {
    recipe = parseRecipe(raw);
  } else {
    dispatch = parseDispatch(raw);
    recipe = dispatch.recipe;
  }
} catch (err) {
  console.error(`\n  not a recipe: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}

const lines = dispatch ? formatDispatch(dispatch, at) : formatTrail(walkRun(recipe, at));
for (const line of lines) console.log(line);

const own = agree(recipe, recipe.ticks);
const long = agree(recipe, recipe.ticks * LENGTHS);
const tick = (n: number): string => `${n} tick${n === 1 ? '' : 's'}`;
const verdict = (ok: boolean): string => (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m');

console.log('');
console.log(
  `  ${verdict(own.ok)} ${REPLAYS} replays of ${tick(recipe.ticks)}, bit-identical at every ` +
    `tick${own.ok ? '' : ` — ${own.why}`}`,
);
console.log(
  `  ${verdict(long.ok)} ${REPLAYS} replays of ${tick(recipe.ticks * LENGTHS)} — ` +
    (long.ok
      ? own.flight.ticks < recipe.ticks * LENGTHS
        ? `the run ended at ${own.flight.ticks}, so the further ticks are nothing, which is what an ending is`
        : 'four times its own length, and still agreeing'
      : long.why),
);
console.log('');

process.exit(own.ok && long.ok ? 0 : 1);
