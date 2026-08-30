/**
 * The draw census, driven through the **real** renderer.
 *
 * `pnpm profile` counts what the renderer asks the canvas for rather than timing
 * it, *"because a count travels to a phone and a millisecond does not"* — and it
 * does that by handing `draw()` a hand-written stand-in for a `CanvasRenderingContext2D`
 * that tallies calls instead of painting them.
 *
 * **A hand-written stand-in for a browser API rots in one direction**: the
 * renderer starts using a call it does not have. That happened the moment the
 * award word gained its rim — `strokeText` was missing, the census threw, and
 * nothing failed, because `pnpm check` does not run `pnpm profile`. The tool the
 * project reaches for to answer *what did this choreography cost* was broken and
 * said nothing.
 *
 * So this drives it over a real run and asserts it both **survives** and
 * **counts**. It is deliberately not a test of the numbers: those move with every
 * design ruling and belong in the plan's before-and-after tables, not in an
 * assertion. What is asserted is that the instrument works.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import type { PresentationState } from '../src/state/types.ts';
import { draw } from '../src/render/index.ts';
import { counter } from '../tools/profile.ts';
import type { Census } from '../tools/profile.ts';
import { parseDispatch } from '../tools/dispatch.ts';

/** Every tick of the shipped run, as the picture — the same run `pnpm profile` walks. */
function shippedRun(): PresentationState[] {
  const text = readFileSync(new URL('./recipes/pilot-60s.json', import.meta.url), 'utf8');
  const { recipe } = parseDispatch(JSON.parse(text));
  let view = createPresentation(openRun(recipe));
  const views = [view];
  replayRun(recipe, {
    onTick: (state) => {
      view = derive(view, state);
      views.push(view);
    },
  });
  return views;
}

const RUN = shippedRun();

function tally(views: readonly PresentationState[]): Census {
  const into: Census = {
    gradients: 0,
    arcs: 0,
    fills: 0,
    strokes: 0,
    filled: 0,
    gradientFilled: 0,
  };
  const context = counter(into);
  // The canvas the census pretends to have, at the design space's own size.
  Object.defineProperty(context, 'canvas', { value: { width: 1170, height: 2532 } });
  for (const view of views) draw(view, context);
  return into;
}

describe('the draw census', () => {
  /**
   * The whole run, every element the game has: bodies in all four states, the
   * compass with its rings and its flown arc, sightings, the farewell ring and
   * the award word with its rim. If the renderer reaches for a canvas call the
   * stand-in lacks, this throws — which is what it is for.
   */
  it('survives every frame of the shipped run', () => {
    expect(() => tally(RUN)).not.toThrow();
  });

  /**
   * And it actually counts. A stand-in whose members were all no-ops would pass
   * the test above and report a game that draws nothing, which is the failure
   * that would be worth catching and the one hardest to notice.
   */
  it('counts what the renderer asks for', () => {
    const into = tally(RUN);
    expect(into.arcs).toBeGreaterThan(RUN.length);
    expect(into.strokes).toBeGreaterThan(RUN.length);
    expect(into.gradients).toBeGreaterThan(RUN.length);
    expect(into.fills).toBeGreaterThan(RUN.length);
    // Overdraw is the figure spec-level decisions are argued with — the farewell
    // ring is stroked rather than filled because of it — so it has to be a real
    // area rather than a zero that never moves.
    expect(into.filled).toBeGreaterThan(0);
    expect(into.gradientFilled).toBeGreaterThan(0);
    expect(into.gradientFilled).toBeLessThanOrEqual(into.filled);
  });

  /**
   * The frames that carry the release's own choreography cost more than the
   * quiet ones, which is the sense in which the census answers *what did this
   * choreography cost* at all.
   */
  it('sees the release cost more than a coast', () => {
    const releases: PresentationState[] = [];
    const coasts: PresentationState[] = [];
    for (const view of RUN) {
      if (view.callout !== null || view.farewell !== null) releases.push(view);
      else if (view.compass === null) coasts.push(view);
    }
    expect(releases.length).toBeGreaterThan(50);
    expect(coasts.length).toBeGreaterThan(50);
    const busy = tally(releases);
    const quiet = tally(coasts);
    expect(busy.strokes / releases.length).toBeGreaterThan(quiet.strokes / coasts.length);
  });
});
