/**
 * The bench's patches still apply.
 *
 * `pnpm bench` builds a browser copy of the game with a listed handful of
 * constants made settable, and every patch is a piece of text that has to appear
 * in the real source. A renamed constant, a moved line or a reworded declaration
 * leaves the patch matching nothing — and a bench whose sliders are wired to
 * nothing is worse than no bench, because it answers questions confidently and
 * wrongly.
 *
 * So the anchors are checked here rather than at build time only: this runs on
 * every `pnpm check`, which means the session that moves a constant is the
 * session that finds out, instead of the author discovering it the next time
 * they try to fly something.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATCHES } from '../tools/bench/patches.ts';

const source = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('the bench', () => {
  it.each(PATCHES.map((p) => [`${p.file}: ${p.find.split('\n')[0]!}`, p] as const))(
    'can still patch %s',
    (_what, patch) => {
      const text = source(patch.file);
      const first = text.indexOf(patch.find);
      expect(first, `not found — ${patch.why}`).toBeGreaterThanOrEqual(0);
      expect(text.indexOf(patch.find, first + 1), 'found more than once').toBe(-1);
    },
  );

  /** The page is the other half, and an empty placeholder is a blank bench. */
  it('has somewhere to put the bundle', () => {
    expect(source('tools/bench/page.html')).toContain('__BENCH_JS__');
  });

  /**
   * **Every patch has a slider and every slider has a patch.**
   *
   * The test above asks only whether a patch's text still matches, which is why
   * six constants sat here settable with nothing in `entry.ts` driving them —
   * a patch that makes a `const` a `let` for nobody, invisible to every check in
   * the repo. The other direction is worse and was never possible by accident: a
   * slider whose constant is not patched moves a binding that is still `const`,
   * so the bench would answer a question confidently and wrongly, which is the
   * failure `patches.ts` opens by naming.
   *
   * Read off the source rather than off the module, because `entry.ts` imports
   * paths that only exist inside the built bench and cannot be loaded here.
   */
  it('wires every patch to a slider and every slider to a patch', () => {
    const entry = source('tools/bench/entry.ts');
    const named = new Set<string>();
    for (const patch of PATCHES) {
      // Both halves: `settable` puts the binding in `replace`, and the two
      // hand-written toggles declare theirs in `append` beside the setter.
      for (const match of `${patch.replace}\n${patch.append ?? ''}`.matchAll(
        /export let ([A-Z_0-9]+)/g,
      )) {
        named.add(match[1]!);
      }
    }
    const driven = new Set<string>();
    // A slider names its setter as a *reference* (`apply: units.set_X`) rather
    // than calling it, so this matches the name and not a call.
    for (const match of entry.matchAll(/\bset_([A-Z_0-9]+)\b/g)) driven.add(match[1]!);

    expect([...named].filter((name) => !driven.has(name))).toEqual([]);
    expect([...driven].filter((name) => !named.has(name))).toEqual([]);
    // And the count is the thing the author asked to come down, so it is stated.
    expect(named.size).toBeLessThanOrEqual(60);
  });
});
