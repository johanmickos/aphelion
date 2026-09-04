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
 *
 * ## And that it can see the layer that would hurt
 *
 * M3.3 added two layers whose cost the census could not previously have seen, and
 * one of them is the most expensive thing in the game. **Dust** draws as strokes,
 * which were already counted. The **anomaly** draws as radial gradients poured
 * into `fillRect`s, and `fillRect` was deliberately uncounted — so a layer
 * blending twelve screens a frame would have reported as four gradients and no
 * paint. `Census.blended` is that hole closed, and the assertions below are what
 * stops it re-opening.
 *
 * The shipped run flies **through** the anomaly (5% of its ticks are inside one),
 * which is what makes that assertable here at all rather than only synthetically.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import type { PresentationState } from '../src/state/types.ts';
import type { Economy } from '../src/state/economy.ts';
import { draw } from '../src/render/index.ts';
import { applyGrade } from '../src/render/grade.ts';
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

/**
 * What the retro grade costs a frame, in screens, at the value the game ships —
 * asked of the pass itself rather than stated.
 *
 * It is a full-screen composite or two ([`grade.ts`](../src/render/grade.ts)), so
 * it is part of what every frame pays and has to come out of any figure that is
 * about some *other* layer. Measured here so that moving the knob moves the
 * baseline with it.
 */
function gradeScreens(): number {
  const into = blankCensus();
  const context = counter(into);
  Object.defineProperty(context, 'canvas', { value: { width: 1170, height: 2532 } });
  applyGrade(context, 1, 0);
  return into.blended / (1170 * 2532);
}

function blankCensus(): Census {
  return {
    gradients: 0,
    arcs: 0,
    fills: 0,
    strokes: 0,
    points: 0,
    filled: 0,
    gradientFilled: 0,
    blended: 0,
  };
}

function tally(views: readonly PresentationState[], economies?: readonly Economy[]): Census {
  const into = blankCensus();
  const context = counter(into);
  // The canvas the census pretends to have, at the design space's own size.
  Object.defineProperty(context, 'canvas', { value: { width: 1170, height: 2532 } });
  // **The economy, where there is one.** The trail's brightness and the fuel halo
  // are drawn from it, so a census of the game the author flies has to fold it —
  // see `tools/profile.ts`, which does the same for the same reason.
  for (const [at, view] of views.entries()) draw(view, context, {}, economies?.[at]);
  return into;
}

describe('the draw census', () => {
  /**
   * The whole run, every element the game has: bodies in all four states, the
   * compass with its rings and its flown arc, sightings, and the award word
   * with its rim. If the renderer reaches for a canvas call the
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
    // Path points are the rungs' own axis, and the one a stroke count cannot
    // see: a rung drawn from two points and one drawn from a hundred are one
    // stroke either way.
    expect(into.points).toBeGreaterThan(into.strokes);
    expect(into.fills).toBeGreaterThan(RUN.length);
    // Overdraw is the figure spec-level decisions are argued with, so it has to
    // be a real area rather than a zero that never moves.
    expect(into.filled).toBeGreaterThan(0);
    expect(into.gradientFilled).toBeGreaterThan(0);
    expect(into.gradientFilled).toBeLessThanOrEqual(into.filled);
    // Rect-blended area is the anomaly's own axis and the sky's — at the very
    // least the whole-buffer VOID fill, once per frame.
    expect(into.blended).toBeGreaterThanOrEqual(RUN.length * 1170 * 2532);
  });

  /**
   * **The layer that would hurt, seen.** The shipped run flies through the
   * anomaly, so the frames inside one can be compared against the frames outside
   * it over the same run — and the anomaly has to cost visibly more, or the
   * census is not measuring it.
   *
   * The numbers themselves are `pnpm profile`'s to print and the plan's to
   * record. What is asserted is that they are not zero and not the same, which is
   * the failure the `strokeText` incident is the precedent for.
   */
  it('sees the anomaly cost more than the sky it replaces', () => {
    const inside = RUN.filter((view) => view.anomaly?.inside === true);
    const clear = RUN.filter((view) => (view.anomaly?.warmth ?? 0) === 0);
    expect(inside.length).toBeGreaterThan(50);
    expect(clear.length).toBeGreaterThan(50);

    const storm = tally(inside);
    const quiet = tally(clear);
    const per = (of: Census, over: readonly unknown[]): number => of.blended / over.length;
    // Several screens more per frame, not several per cent.
    expect(per(storm, inside)).toBeGreaterThan(per(quiet, clear) * 4);
    // And its curtains are strokes over points, which `blended` cannot see.
    expect(storm.strokes / inside.length).toBeGreaterThan(quiet.strokes / clear.length);
    expect(storm.points / inside.length).toBeGreaterThan(quiet.points / clear.length);
  });

  /**
   * And **the dust is in every frame**, which is the other half of the same
   * worry: a sparse layer is exactly the kind of thing that is free on a laptop
   * and not on a phone, and five strokes a frame is the shape of it.
   */
  it('sees the dust in a frame with nothing else in it', () => {
    const quietest = RUN.filter(
      (view) =>
        view.compass === null &&
        view.callout === null &&
        view.knock === null &&
        (view.anomaly?.warmth ?? 0) === 0,
    );
    expect(quietest.length).toBeGreaterThan(20);
    const into = tally(quietest);
    // Five batches for the dust, and the rungs above it. Nothing draws no strokes.
    expect(into.strokes / quietest.length).toBeGreaterThan(5);
    expect(into.points / quietest.length).toBeGreaterThan(2 * 10);
  });

  /**
   * **The boundary is absent for the great majority of play, and that is the
   * ruling rather than an accident** — the author, 2026-09-01: *"the boundary
   * SHOULD be off screen for majority of play... I don't want to signal danger
   * during normal gameplay, only when the ship is along the edge."*
   *
   * Measured here rather than asserted as an intent: over the author's own 18
   * replayable dispatches the boundary draws on **3.4% of frames**, and over the
   * shipped run — which dies out of bounds, so it does go to the wall — on 8.8%.
   *
   * The census is the right place for it because *absent* has to mean **nothing
   * asked of the canvas**, not a gradient at alpha zero. A dimmed layer would pass
   * an eye test and cost the phone the same.
   */
  it('asks the canvas for nothing at all while the craft is in the field', () => {
    // Clear of the anomaly, so what `blended` holds is the buffer's own VOID fill
    // and the boundary's wash and nothing else — the anomaly blends thirteen
    // screens and would swamp a fifth of one.
    const clear = RUN.filter((view) => (view.anomaly?.warmth ?? 0) === 0);
    const away = clear.filter((view) => view.boundary.every((side) => side.presence === 0));
    const out = clear.filter((view) => view.boundary.some((side) => side.presence > 0));
    // The great majority of a run is spent nowhere near a wall.
    expect(away.length).toBeGreaterThan(clear.length * 0.8);
    expect(out.length).toBeGreaterThan(50);

    const screens = (of: Census, over: readonly unknown[]): number =>
      of.blended / over.length / (1170 * 2532);

    // **What every frame pays whatever is happening**: the buffer's own VOID
    // fill, plus the retro grade's composites at the value the game ships
    // (`src/render/grade.ts`, one below the scanline threshold and two above it).
    //
    // ⚠ **Measured rather than written down.** The grade's share was one screen
    // the day it landed and is a knob the author moves, so a literal here would
    // be a number that goes stale the next time they rule one — and it would go
    // stale by making *this* assertion pass while the boundary was drawing.
    const constant = 1 + gradeScreens();

    // **Away from a wall the boundary adds nothing at all** — the constant cost
    // and not a unit more. This is the assertion the ruling actually needs: a
    // layer dimmed to alpha zero would pass an eye test and cost the phone the
    // same.
    expect(screens(tally(away), away)).toBeLessThan(constant + 0.01);

    // At a wall it is a ninth of a screen — one side's wash, clipped to the
    // picture. The ceiling is what fails if the clip is ever dropped, because the
    // whole band unclipped is 1.13 screens.
    const wash = screens(tally(out), out) - constant;
    expect(wash).toBeGreaterThan(0.02);
    expect(wash).toBeLessThan(0.5);
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
      if (view.callout !== null) releases.push(view);
      else if (view.compass === null) coasts.push(view);
    }
    expect(releases.length).toBeGreaterThan(50);
    expect(coasts.length).toBeGreaterThan(50);
    const busy = tally(releases);
    const quiet = tally(coasts);
    expect(busy.strokes / releases.length).toBeGreaterThan(quiet.strokes / coasts.length);
  });
});
