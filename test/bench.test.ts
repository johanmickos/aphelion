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
});
