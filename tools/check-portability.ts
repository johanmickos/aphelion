/**
 * Proves the layer boundary ADR-0006 depends on.
 *
 * The simulation is pure and headless and the presentation state derived from it
 * is equally pure, which is what makes a frame a pure function of `(recipe,
 * tick)` — an agent with no canvas can assert what the camera did at tick 412,
 * and a look can be regression-tested with a golden rather than an opinion. That
 * property is worth exactly as much as it is enforced. ADR-0006 says so itself:
 * the cost of the third layer "is a layer that has to be kept honest ... or it
 * will quietly grow a dependency on the renderer." This file is the thing that
 * stops it being quiet.
 *
 * Two passes, in this order and for a reason:
 *
 *   1. A static scan of `src/sim/` and `src/state/`. Nothing is imported yet —
 *      importing first would execute the code, and a banned browser global would
 *      surface as a raw ReferenceError from somewhere inside the module instead
 *      of as this tool's own diagnosis with a file and a line.
 *   2. A proof of life: the simulation is loaded and run under plain `node`. The
 *      scan can only find what it knows to look for; actually running the thing
 *      with no bundler, no DOM and no test framework is what catches the rest.
 *
 * Run it with plain `node`, deliberately — `node tools/check-portability.ts`.
 * If this file executes at all, the simulation loaded without a bundler.
 *
 * Usage: node tools/check-portability.ts [srcRoot]
 * A `srcRoot` other than the real `src/` scans only; the proof of life needs the
 * real simulation. Test fixtures use that path.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const REAL_SRC = fileURLToPath(new URL('../src', import.meta.url));
const root = process.argv[2] ? resolve(process.argv[2]) : REAL_SRC;
const isRealSrc = root === REAL_SRC;

/**
 * Which directories are held to the bans, and what each may reach.
 *
 * `src/render/` is deliberately absent. It owns pixels and is the one layer
 * allowed a browser — scanning it would ban the only thing it is for. What
 * constrains the renderer is that nothing else may import it.
 *
 * Two of these rules go slightly beyond the letter of M0.3, which asks only that
 * `src/state/` not import `src/render/`. `src/sim/` reaching outside itself at
 * all, and `src/state/` reaching anywhere but `src/sim/`, are the same rule
 * stated positively: a layer may see the layer below it and nothing else. Said
 * as a whitelist rather than as a list of forbidden neighbours, it does not need
 * amending every time a directory is added.
 */
const LAYERS: ReadonlyArray<{ dir: string; mayImport: readonly string[] }> = [
  { dir: 'sim', mayImport: [] },
  { dir: 'state', mayImport: ['sim'] },
];

/**
 * Bare identifiers that must not be referenced. A DOM global in the simulation
 * is the headline case, but `globalThis` is on the list too: it is the door
 * through which every other name on this list can be reached without being
 * spelled.
 */
const BANNED_GLOBALS = new Map<string, string>([
  ['document', 'DOM global'],
  ['window', 'DOM global'],
  ['navigator', 'DOM global'],
  ['location', 'DOM global'],
  ['localStorage', 'browser storage'],
  ['sessionStorage', 'browser storage'],
  ['requestAnimationFrame', 'browser frame clock'],
  ['cancelAnimationFrame', 'browser frame clock'],
  ['setTimeout', 'wall-clock scheduling — the simulation owns the only clock'],
  ['setInterval', 'wall-clock scheduling — the simulation owns the only clock'],
  ['performance', 'wall-clock read — time is counted in ticks, never in seconds'],
  ['fetch', 'network access — there is no backend (ADR-0003)'],
  ['XMLHttpRequest', 'network access — there is no backend (ADR-0003)'],
  ['WebSocket', 'network access — there is no backend (ADR-0003)'],
  ['Worker', 'browser API'],
  ['Image', 'browser API'],
  ['HTMLElement', 'DOM type'],
  ['HTMLCanvasElement', 'DOM type'],
  ['CanvasRenderingContext2D', 'DOM type'],
  ['WebGLRenderingContext', 'DOM type'],
  ['WebGL2RenderingContext', 'DOM type'],
  ['globalThis', 'reaches every banned global without naming one'],
]);

/** Member reads that are banned even though the object itself is legitimate. */
const BANNED_MEMBERS = new Map<string, string>([
  ['Math.random', 'unseeded randomness — a run must replay from its recipe (ADR-0004)'],
  ['Date.now', 'wall-clock read — time is counted in ticks, never in seconds (ADR-0006)'],
  [
    'Math.hypot',
    'not correctly rounded, and differs between engines — the prototype was bitten by this; ' +
      'write a hypot in src/sim/ and import it',
  ],
]);

interface Violation {
  file: string;
  line: number;
  message: string;
}

const violations: Violation[] = [];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );
}

function report(source: ts.SourceFile, node: ts.Node, message: string): void {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push({ file: relative(process.cwd(), source.fileName), line: line + 1, message });
}

/**
 * True when this identifier is a name being written rather than a value being
 * read — a property, a declaration, a label. `sim.window` and `{ document: 1 }`
 * are not references to a browser global and must not be reported as if they
 * were.
 */
function isNamePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
  if (ts.isMethodSignature(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return true;
  // A declaration of the same name is shadowing, not a reach for the global.
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return false;
}

/** Every module specifier in the file: static, side-effect, re-export, dynamic. */
function moduleSpecifiers(source: ts.SourceFile): ts.StringLiteralLike[] {
  const found: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Holds one layer to its bans and its import whitelist. */
function checkLayer(dir: string, mayImport: readonly string[]): void {
  const layerRoot = join(root, dir);
  const allowed = [layerRoot, ...mayImport.map((d) => join(root, d))];

  for (const file of walk(layerRoot)) {
    const source = parse(file);

    for (const specifier of moduleSpecifiers(source)) {
      const text = specifier.text;
      if (!text.startsWith('.')) {
        report(source, specifier, `imports package "${text}" — src/${dir} must be dependency-free`);
        continue;
      }
      if (/\?(raw|url|worker|inline)$/.test(text)) {
        report(source, specifier, `bundler-specific import query "${text}"`);
        continue;
      }
      const target = resolve(file, '..', text);
      const inside = allowed.some((a) => target === a || target.startsWith(a + sep));
      if (!inside) {
        const reach = relative(root, target);
        report(
          source,
          specifier,
          `imports "${text}" — src/${dir} may reach ` +
            (mayImport.length ? mayImport.map((d) => `src/${d}`).join(', ') : 'nothing') +
            `, not src/${reach.split(sep)[0]}`,
        );
      }
    }

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !isNamePosition(node)) {
        const why = BANNED_GLOBALS.get(node.text);
        if (why) report(source, node, `${node.text} — ${why}`);
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        const key = `${node.expression.text}.${node.name.text}`;
        const why = BANNED_MEMBERS.get(key);
        if (why) report(source, node, `${key} — ${why}`);
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Date'
      ) {
        report(source, node, 'new Date — wall-clock read; time is counted in ticks (ADR-0006)');
      }
      if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
        report(source, node, 'import.meta — bundler-coupled; a pure layer has no build context');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

/**
 * TypeScript that emits code rather than being erased. Node runs `.ts` by
 * stripping types and nothing else, so a parameter property, an `enum` or a
 * `namespace` fails there while passing every test and every build — the
 * bundler accepts them, which is exactly why they slip in unnoticed. Held
 * across all of `src/`, because it is a rule about running under node rather
 * than about layering.
 */
function checkErasable(): void {
  for (const file of walk(root)) {
    const source = parse(file);
    const visit = (node: ts.Node): void => {
      if (ts.isParameter(node) && node.modifiers?.length) {
        report(source, node, 'parameter property — emits code, so plain node cannot run it');
      }
      if (
        ts.isEnumDeclaration(node) &&
        !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
      ) {
        report(
          source,
          node,
          'enum — emits code, so plain node cannot run it; use a union of literals',
        );
      }
      if (
        ts.isModuleDeclaration(node) &&
        !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
      ) {
        report(source, node, 'namespace — emits code, so plain node cannot run it');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

for (const layer of LAYERS) checkLayer(layer.dir, layer.mayImport);
checkErasable();

if (violations.length) {
  for (const v of violations) console.error(`${v.file}:${v.line}  ${v.message}`);
  console.error(
    `\n${violations.length} portability violation(s) — not attempting to load the simulation.`,
  );
  process.exit(1);
}

if (!isRealSrc) {
  console.log(`${relative(process.cwd(), root)}: no portability violations (scan only)`);
  process.exit(0);
}

// The proof of life. Dynamic, and down here, so it runs only once the scan is
// clean: a static rule can only catch what it was told to look for, and actually
// executing the simulation with no bundler and no DOM is what catches the rest.
const { createInitialState, stepSim } = await import('../src/sim/step.ts');
const { NO_INPUT } = await import('../src/sim/types.ts');
const { derive } = await import('../src/state/derive.ts');

const TICKS = 120;
const sim = createInitialState();
for (let i = 0; i < TICKS; i++) stepSim(sim, NO_INPUT);

let failed = false;
if (sim.tick !== TICKS) {
  console.error(`proof of life: expected tick ${TICKS}, got ${sim.tick}`);
  failed = true;
}
if (derive(sim).tick !== sim.tick) {
  console.error(
    'proof of life: presentation state does not agree with the simulation it came from',
  );
  failed = true;
}
if (failed) process.exit(1);

console.log(
  `src/sim and src/state are portable — ${TICKS} ticks under plain node, no bundler, no DOM`,
);
