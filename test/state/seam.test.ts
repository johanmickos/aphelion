/**
 * **M4.7's proof, and it is a fact about the import graph rather than a
 * convention.**
 *
 * [ADR-0005](../../docs/adr/0005-v1-ships-daily-and-zen-only.md) builds ZEN for
 * an architectural reason: *"it is the same game with the ledger deleted, so if
 * the tiers still speak with no points in the game, the seam between grading a
 * swing and pricing a swing is real rather than aspirational."* Spec
 * [08](../../docs/spec/08-economy.md)'s acceptance states the same thing as a
 * deletion: *"deleting the economy module leaves grading, callouts, streaks and
 * every timing intact — ZEN runs with the ledger module absent, not stubbed."*
 *
 * A mode flag can satisfy the *behaviour* and fail the *architecture*, and it
 * would fail silently — which is exactly what
 * [M4.7](../../docs/plan/m4-the-economy.md) says the risk is: *"ZEN is a
 * configuration rather than a branch through the grader, which is the only one of
 * the four that can fail quietly."* So this walks the graph.
 *
 * ## What is asserted
 *
 * 1. Nothing the **simulation** imports reaches the economy. The grader is
 *    `src/sim/tier.ts` and it is a pure function of `(d, W)` — spec 06's own
 *    acceptance — so this is the strongest form of *"grading imports nothing from
 *    the economy"*.
 * 2. Nothing **`derive.ts`** imports reaches the economy. That is the callouts,
 *    the streak, the chain, the compass and every decay in the game, so deleting
 *    the economy leaves all of them compiling and unchanged.
 * 3. The economy is reachable from exactly the places that are allowed to price a
 *    run: the shell, the renderer's trail, and the tools. Nothing in the picture.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The modules that are the economy — the ones ZEN flies without. */
const ECONOMY = ['src/state/ledger.ts', 'src/state/fuel.ts', 'src/state/economy.ts'];

function importsOf(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [first] = node.arguments;
      if (first && ts.isStringLiteral(first)) found.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every repo-relative module reachable from `entry`, following relative imports only. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const key = relative(ROOT, file);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith('.')) continue;
      queue.push(resolve(dirname(file), specifier));
    }
  }
  return seen;
}

describe('the seam between grading a swing and pricing one', () => {
  it.each(ECONOMY)('is not reachable from the simulation, for %s', (module) => {
    // The whole simulation, entered through the one verb that advances it.
    expect([...reachableFrom('src/sim/step.ts')]).not.toContain(module);
    // And the grader itself, which spec 06's acceptance holds to importing
    // nothing from the economy.
    expect([...reachableFrom('src/sim/tier.ts')]).not.toContain(module);
  });

  it.each(ECONOMY)('is not reachable from the picture, for %s', (module) => {
    expect([...reachableFrom('src/state/derive.ts')]).not.toContain(module);
  });

  /**
   * The other half of the same claim, and the reason it is worth stating: the
   * picture is not a small module. Everything the design puts between the physics
   * and the pixels is downstream of `derive.ts`, so *"the economy is not in it"*
   * is a claim about most of the game.
   */
  it('leaves the whole picture standing, which is most of the game', () => {
    const picture = reachableFrom('src/state/derive.ts');
    expect(picture.size).toBeGreaterThan(20);
    for (const module of [
      'src/sim/tier.ts',
      'src/state/callout.ts',
      'src/state/streak.ts',
      'src/state/chain.ts',
      'src/state/compass.ts',
      'src/state/decay.ts',
    ]) {
      expect([...picture]).toContain(module);
    }
  });

  /**
   * And the economy is composed where a run is, rather than where a frame is.
   * The renderer reaches it because the **trail**'s brightness is the carry (spec
   * 02 §6) and that is the one place the two meet by design.
   */
  it('is composed by the shell and read by the trail', () => {
    expect([...reachableFrom('app/main.ts')]).toContain('src/state/economy.ts');
    expect([...reachableFrom('src/render/index.ts')]).toContain('src/state/economy.ts');
  });
});

/**
 * **M4.7's other half: the grader has no mode-specific branch.**
 *
 * The plan asks for *"a reviewer confirming the grader has no mode-specific
 * branch"*, which is a thing a reviewer forgets and a parser does not. Spec
 * 08 §7's rule is that modes *"may never change how a swing is graded"*, and the
 * strongest available form of that is: **the word `Mode` does not appear anywhere
 * a swing is graded, and cannot.**
 */
describe('the grader', () => {
  /** Nothing the simulation or the picture imports can name a mode. */
  it.each(['src/sim/step.ts', 'src/sim/tier.ts', 'src/state/derive.ts'])(
    'cannot reach a mode at all, from %s',
    (entry) => {
      expect([...reachableFrom(entry)]).not.toContain('src/state/mode.ts');
    },
  );

  /**
   * And the whole list of things that *can* is three files long — the two the
   * economy is made of, and the mode itself. Everything else that knows a mode
   * exists is outside `src/`: the shell, which opens a run, and the tools, which
   * fly one.
   */
  it('is read by the economy and by nothing else in src/', () => {
    const readers = readdirSync(resolve(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts'))
      .filter((name) =>
        importsOf(join(resolve(ROOT, 'src'), name)).some((one) => one.endsWith('mode.ts')),
      )
      .sort();
    expect(readers).toEqual(['state/economy.ts', 'state/ledger.ts']);
  });
});
