/**
 * Spec [14 · §3.1](../../docs/spec/14-retro-grade.md)'s stroke-weight rule, as a
 * lint: *"No stroke in any render path is narrower than 1 px in design
 * coordinates; a lint over the render layer finds none."*
 *
 * The rule exists because of what a phone does to a thin line. Spec 14 §3.1
 * states it sharper than the acceptance does — **1.5 design px** for anything the
 * player is expected to read as a line and **1 px** for structure — and gives the
 * reason: *"at 1170×2532 scaled to a real phone, a 0.5px stroke dithers into a
 * grey suggestion and the field stops being a ladder."*
 *
 * ## Why it is not a text scan, and not an evaluator either
 *
 * Seven of the twenty-three widths the renderer sets are expressions over
 * presentation state — `rim + (peak - rim) * taper`, `(TRACK_WIDTH + LEAD_WIDTH *
 * nose) * body`, `WINDOW_WIDTH * (1 + ring.aim)`. A scan that read the source and
 * multiplied constants would have to either evaluate those or skip them, and
 * skipping them skips the only one in the game that is actually thin.
 *
 * So the lint is **two halves that check each other**, and neither is sufficient
 * alone:
 *
 *   - **The enumeration is static.** Every `…lineWidth = …` in `src/render/` is
 *     found by parsing, so a *new* place the renderer sets a width cannot appear
 *     without this file noticing. That is the half a run cannot do: a path nobody
 *     flew draws nothing and reports nothing.
 *   - **The widths are observed.** The real renderer is driven over a real run
 *     through the census's own recording context, and what is recorded is the
 *     number that reached the canvas. That is the half a parser cannot do, and it
 *     is AGENTS.md §4's rule — the observable is the width the canvas was asked
 *     for, not the text that computed it.
 *
 * Each half is checked against the other: every static site must be reached by
 * the run, and every recorded width must belong to a static site. A site the
 * corpus never draws fails here rather than passing silently, which is what stops
 * this from becoming a lint over the paths that happen to be easy.
 *
 * **What it does not prove**: that a width is at its own minimum. The corpus
 * bounds each site from above — the narrowest this run ever asked for — and a
 * flight that made `taper` smaller would find a thinner tide. The one width that
 * matters is bounded analytically as well and says so below.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { PresentationState } from '../../src/state/types.ts';
import { draw } from '../../src/render/index.ts';
import { counter } from '../../tools/profile.ts';
import type { Census } from '../../tools/profile.ts';
import type { Economy } from '../../src/state/economy.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RENDER = join(ROOT, 'src', 'render');

/**
 * Spec 14 §3.1's two floors, in design units.
 *
 * `STRUCTURE` is the acceptance's own number — the one this file fails on.
 * `READABLE` is §3.1's higher floor for *"anything the player is expected to read
 * as a line"*, and what falls between the two is a list rather than a failure,
 * because **which of the two a track is has not been ruled**. See the second test.
 */
const STRUCTURE = 1;
const READABLE = 1.5;

/** Where a width was set: the file, the function, and the line. */
interface Site {
  readonly file: string;
  readonly line: number;
}

const key = (site: Site): string => `${site.file}:${site.line}`;

/**
 * Every `…lineWidth = …` in the render layer, by parsing rather than by grepping
 * — so a width set on a line that also carries the word in a comment is not a
 * site, and one written across two lines still is.
 */
function sitesIn(file: string): Site[] {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'lineWidth'
    ) {
      // The **property's** own position, because that is what V8 reports for an
      // assignment through a setter and the two have to be comparable.
      const at = source.getLineAndCharacterOfPosition(node.left.name.getStart(source));
      found.push({ file: relative(ROOT, file), line: at.line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const STATIC: Site[] = readdirSync(RENDER, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.ts'))
  .flatMap((name) => sitesIn(join(RENDER, name)));

/** The narrowest width each site was ever asked for, and where the ask came from. */
interface Observed {
  readonly site: Site;
  readonly what: string;
  readonly narrowest: number;
}

/**
 * A frame or two of V8's stack, back to the render-layer line that set the width.
 *
 * The recording context is one object with a setter on it, so the frames are
 * always `Error`, this setter, then the caller. It is asserted rather than
 * assumed: if the shape ever changes, `at` comes back `null`, the site goes
 * unmatched and the coverage test says so.
 */
function callerOf(stack: string | undefined): { site: Site; what: string } | null {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const found = /at (?:new )?([\w.<>]+) \((.+):(\d+):\d+\)/.exec(line);
    if (found === null) continue;
    const file = relative(ROOT, found[2]!);
    if (!file.startsWith('src/render/')) continue;
    return { site: { file, line: Number(found[3]) }, what: found[1]! };
  }
  return null;
}

/**
 * The census's own stand-in for a canvas, with a watch on `lineWidth`.
 *
 * Built on [`counter`](../../tools/profile.ts) rather than beside it, for the
 * reason that file gives: a hand-written stand-in for a browser API rots when the
 * renderer starts using a call it does not have, and **one** of them rotting is a
 * thing `test/census.test.ts` already catches. A second copy would rot quietly.
 *
 * `save` and `restore` are wrapped because the census's are no-ops and a width is
 * part of what a `save` holds — a stroke issued after a restore is issued at the
 * width that was in force before the save, and a recorder that missed that would
 * report a width the canvas was never at.
 */
function watch(): { widths: Map<string, Observed>; context: CanvasRenderingContext2D } {
  const into: Census = {
    gradients: 0,
    arcs: 0,
    fills: 0,
    strokes: 0,
    points: 0,
    filled: 0,
    gradientFilled: 0,
    blended: 0,
  };
  const context = counter(into);
  Object.defineProperty(context, 'canvas', { value: { width: 1170, height: 2532 } });

  const widths = new Map<string, Observed>();
  const unattributed: string[] = [];
  let width = 1;
  const stack: number[] = [];
  const record = (value: number): void => {
    const from = callerOf(new Error().stack);
    if (from === null) {
      unattributed.push(String(value));
      return;
    }
    const at = key(from.site);
    const before = widths.get(at);
    widths.set(at, {
      site: from.site,
      what: from.what,
      narrowest: Math.min(before?.narrowest ?? Infinity, value),
    });
  };
  Object.defineProperty(context, 'lineWidth', {
    get: () => width,
    set: (value: number) => {
      width = value;
      record(value);
    },
  });
  const save = context.save.bind(context);
  const restore = context.restore.bind(context);
  Object.defineProperty(context, 'save', {
    value: () => {
      stack.push(width);
      save();
    },
  });
  Object.defineProperty(context, 'restore', {
    value: () => {
      width = stack.pop() ?? width;
      restore();
    },
  });
  Object.defineProperty(context, 'unattributed', { value: unattributed });
  return { widths, context };
}

/**
 * The corpus: the shipped run, plus the one state it never reaches.
 *
 * A sighting draws a ring around the body **a press would take**, and the shipped
 * run never has one offered on a frame a sighting is also drawn on. Rather than
 * hunt for a recipe that does, the frames that have sightings are re-derived with
 * the offer set — which is a state the game reaches, expressed the only way a
 * renderer test is allowed to express one: as presentation state.
 */
function corpus(): { view: PresentationState; economy: Economy }[] {
  // **Priced as well as pictured.** The trail's brightness and the fuel halo are
  // drawn from the economy, so a run flown without one leaves two width sites
  // unreached — and an unreached site fails here rather than passing quietly,
  // which is the whole design of this lint.
  const run = pricedRun(shippedRecipe());
  const frames = run.views.map((view, at) => ({ view, economy: run.economies[at]! }));
  const offered = frames
    .filter(({ view }) => view.sightings.length > 0)
    .slice(0, 8)
    .map(({ view, economy }) => ({
      view: {
        ...view,
        sightings: view.sightings.map((mark) => ({ ...mark, offered: true })),
      },
      economy,
    }));
  return [...frames, ...offered];
}

const SEEN = ((): Map<string, Observed> => {
  const { widths, context } = watch();
  for (const { view, economy } of corpus()) draw(view, context, {}, economy);
  return widths;
})();

describe('spec 14 §3’s stroke-weight rule', () => {
  it('finds every place the renderer sets a width', () => {
    expect(STATIC.length).toBeGreaterThan(20);
  });

  /**
   * **Both halves, against each other.** A static site the corpus never draws is
   * a width this lint has not checked, and a recorded width with no static site
   * behind it means the stack shape changed and the attribution is guesswork.
   */
  it('draws every one of them', () => {
    const drawn = new Set(SEEN.keys());
    const missed = STATIC.filter((site) => !drawn.has(key(site))).map(key);
    expect(missed).toEqual([]);
    const known = new Set(STATIC.map(key));
    expect([...drawn].filter((at) => !known.has(at))).toEqual([]);
    expect((SEEN.size as number) > 0).toBe(true);
  });

  /**
   * Spec 14's acceptance, and the one assertion in this file that is a gate: **no
   * stroke anywhere in the render layer is narrower than 1 design px.**
   */
  it('sets no width below the structure floor', () => {
    const thin = [...SEEN.values()]
      .filter((seen) => seen.narrowest < STRUCTURE)
      .map((seen) => `${seen.site.file}:${seen.site.line} ${seen.what} at ${seen.narrowest}`);
    expect(thin).toEqual([]);
  });

  /**
   * ## ⚠ The list between the two floors is empty, and it closed twice
   *
   * Spec 14 §3.1 has **two** floors — 1.5 design px for *"anything the player is
   * expected to read as a line"* and 1 px for *"structure"* — and it does not say
   * which a **track** is. For a day the deadline's hairline sat between them at
   * `TRACK_WIDTH × HAIR` = 1.32, and this test named it rather than picking.
   *
   * It closed twice on 2026-09-03, in the same sitting:
   *
   * 1. **The author ruled it** — *"the hairline is not really noticeable, but I
   *    think that's OK."* A track is **structure**, so 1 px binds and 1.32 was
   *    always inside the rule.
   * 2. **And then it stopped existing.** The deadline was rebuilt to spec 03 §5's
   *    window-and-dot grammar in the same sitting, which replaced the taper with
   *    the compass's own two weights — 3 and 9 design units — so the render layer
   *    now has nothing at all between the floors.
   *
   * The assertion is the empty list rather than the ruling, because the ruling is
   * what makes an empty list *correct* rather than merely current: a new stroke
   * arriving in this band is a thing to look at, and it fails here.
   */
  it('names every width between the structure floor and the readable one', () => {
    const between = [...SEEN.values()]
      .filter((seen) => seen.narrowest >= STRUCTURE && seen.narrowest < READABLE)
      .map((seen) => `${seen.site.file} ${seen.what} at ${seen.narrowest.toFixed(2)}`)
      .sort();
    expect(between).toEqual([]);
  });

  /**
   * And the deadline's own thinnest stroke is now the compass's **ring** weight,
   * which is what it was rebuilt to resemble — a board pixel, above both floors.
   */
  it('draws the deadline at the compass’s own two weights', () => {
    const widths = [...SEEN.values()]
      .filter((seen) => seen.site.file === 'src/render/deadline.ts')
      .map((seen) => seen.narrowest)
      .sort((a, b) => a - b);
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(READABLE);
  });
});
