/**
 * The layer boundary [AGENTS.md](../../AGENTS.md) §6 asks every step to write a
 * criterion for, in the direction `pnpm portable` deliberately does not look.
 *
 * The checker scans `src/sim/`, `src/state/` and `src/input/` and skips
 * `src/render/`, because the renderer is the one layer allowed a browser and
 * scanning it would ban the only thing it is for. That leaves the other
 * direction unguarded, and it is the one this milestone was most able to break:
 * **the renderer draws presentation state and asks the simulation nothing.** A
 * renderer that read the held body off `SimState`, or the phase off an `Orbit`,
 * would still draw a correct-looking frame — and ADR-0006's promise that a frame
 * is a pure function of `(recipe, tick)` would be gone with nothing failing.
 *
 * The fix, when this fails, is never to relax it: what the renderer needs is a
 * field on [`PresentationState`](../../src/state/types.ts), derived in
 * `derive.ts`, and assertable without a canvas.
 *
 * ⚠ **This file is about the layer boundary and not about the game's**, and the
 * two have shared a name since M3.4 built the second one. The game's boundary —
 * spec 07's bands, their heat and what a canvas is asked to draw of them — is
 * `test/state/boundary.test.ts` and `test/render/bands.test.ts`. This file is
 * older than the game having an edge of its own.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RENDER = fileURLToPath(new URL('../../src/render', import.meta.url));

const files = readdirSync(RENDER, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(RENDER, name));

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

describe('the renderer', () => {
  it.each(files)('asks the simulation nothing, in %s', (file) => {
    const reaching = importsOf(file).filter((specifier) => /(^|\/)sim\//.test(specifier));
    expect(reaching).toEqual([]);
  });

  /**
   * And it reaches nothing else either. A package would be a runtime dependency
   * ([AGENTS.md](../../AGENTS.md) §6 has none), and `src/input/` is upstream of
   * the simulation rather than of the picture.
   */
  it.each(files)('imports only presentation state and itself, in %s', (file) => {
    for (const specifier of importsOf(file)) {
      expect(specifier.startsWith('.')).toBe(true);
      expect(/(^|\/)(sim|input)\//.test(specifier)).toBe(false);
    }
  });
});
