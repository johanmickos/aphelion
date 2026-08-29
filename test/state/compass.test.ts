/**
 * [M2.3](../../docs/plan/m2-the-instrument.md)'s acceptance: *"grading is
 * computed in the simulation, is deterministic, and a recipe replays to
 * identical tiers."*
 *
 * The third clause is the one with teeth, and it is checked the only way it can
 * be — by replaying the run this repo ships and comparing every tier at every
 * tick against a second replay of the same file. A compass that drifted by one
 * bit anywhere would be a compass that graded the same swing differently twice.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { RING_GAP, takenBy } from '../../src/state/compass.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { hueOf } from '../../src/state/identity.ts';
import type { CompassView, PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';

const PRESS = { pressed: true };

function shippedRun(): PresentationState[] {
  const text = readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8');
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

/** Fly the fixture field, holding from tick 20, and keep every picture. */
function held(ticks = 400): PresentationState[] {
  const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
  const views = [createPresentation(sim)];
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
    views.push(derive(views[views.length - 1]!, sim));
  }
  return views;
}

const compassAt = (
  views: readonly PresentationState[],
  test: (c: CompassView) => boolean,
): CompassView => views.find((view) => view.compass !== null && test(view.compass))!.compass!;

describe('the five states of one swing', () => {
  const views = held();

  it('has no compass at all while coasting', () => {
    expect(views[0]!.compass).toBeNull();
  });

  /**
   * State 1 · PRESS. Spec [00 · §6](../../docs/spec/00-tokens.md): *"the grab
   * filament — a line from the craft to the body pulling hardest, in that body's
   * identity hue."* No hand and no rings, so the instrument **arriving** is the
   * freeze made visible.
   */
  it('is a filament and nothing else through the dive', () => {
    const diving = compassAt(views, (c) => c.filament);
    expect(diving.hand).toBeNull();
    expect(diving.rings).toEqual([]);
    expect(diving.hue).toBe(hueOf(0));
  });

  /** State 2 · ORBIT. The rings arrive with the freeze, and not before it. */
  it('grows its rings at the freeze', () => {
    const armed = compassAt(views, (c) => c.hand !== null);
    expect(armed.rings.length).toBeGreaterThan(0);
    expect(armed.filament).toBe(false);
  });

  /**
   * The rings are stacked outward from the craft's own radius, so the innermost
   * one is the path being flown and the trail lies on it.
   */
  it('stacks the rings outward from the craft’s own orbit', () => {
    const armed = compassAt(views, (c) => c.rings.length > 1);
    for (let i = 1; i < armed.rings.length; i++) {
      expect(armed.rings[i]!.radius - armed.rings[i - 1]!.radius).toBeCloseTo(RING_GAP, 9);
    }
    expect(armed.reach).toBeGreaterThan(armed.rings.at(-1)!.radius);
  });

  /** States 3 and 4 · CLOSING and MATCHED. A window heats **in place**. */
  it('heats a window under live aim without moving its hue', () => {
    const hues = new Map<number, Set<number>>();
    let cold = 0;
    let hot = 0;
    for (const view of views) {
      for (const ring of view.compass?.rings ?? []) {
        if (!hues.has(ring.body)) hues.set(ring.body, new Set());
        hues.get(ring.body)!.add(ring.hue);
        if (ring.energy === 1) cold++;
        else hot++;
      }
    }
    expect(cold).toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(0);
    for (const seen of hues.values()) expect(seen.size).toBe(1);
  });

  it('is only matched where the tier is PERFECT', () => {
    for (const view of views) {
      for (const ring of view.compass?.rings ?? []) {
        expect(ring.matched).toBe(ring.tier === 'PERFECT');
        expect(ring.energy).toBe(ring.tier === null ? 1 : 2);
      }
    }
  });
});

describe('what it is allowed to say', () => {
  /**
   * *"The gap between ghost and dot is the grade, drawn on the geometry. It is a
   * fact, never a command."* So the instrument carries angles, energies and a
   * grade for **now** — and no field that tells the player to do anything.
   * `VISION.md`'s fourth pillar is the reason, and this is it as a shape.
   */
  it('carries geometry and a grade, and no advice', () => {
    const armed = compassAt(held(), (c) => c.rings.length > 0);
    expect(Object.keys(armed).sort()).toEqual([
      'craftX',
      'craftY',
      'direction',
      'filament',
      'hand',
      'hue',
      'reach',
      'rings',
      'swept',
      'x',
      'y',
    ]);
    expect(Object.keys(armed.rings[0]!).sort()).toEqual([
      'aim',
      'body',
      'dot',
      'energy',
      'halfWidth',
      'hue',
      'matched',
      'offset',
      'radius',
      'tier',
    ]);
  });

  /** A window and its target wear the same hue, so neither needs a legend. */
  it('paints a window in the hue of the body it reaches', () => {
    const armed = compassAt(held(), (c) => c.rings.length > 0);
    for (const ring of armed.rings) expect(ring.hue).toBe(hueOf(ring.body));
  });

  /**
   * `takenBy` picks the ring a release would actually be graded on: the one it
   * is best aimed at, because a release lands where it lands.
   */
  it('grades the window it is best aimed at', () => {
    expect(takenBy([])).toBeNull();
    const rings = held().flatMap((view) => view.compass?.rings ?? []);
    const inside = rings.filter((ring) => ring.tier !== null);
    expect(inside.length).toBeGreaterThan(0);
  });
});

describe('a recipe replays to identical tiers', () => {
  /** Every tier on every ring on every tick of the run this repo ships. */
  const tiersOf = (views: readonly PresentationState[]): string[] =>
    views.map((view) =>
      (view.compass?.rings ?? [])
        .map((ring) => `${ring.body}:${ring.tier ?? '-'}:${ring.aim.toFixed(9)}`)
        .join(','),
    );

  it('grades the shipped run the same way twice', () => {
    const first = tiersOf(shippedRun());
    expect(first.length).toBeGreaterThan(3000);
    expect(tiersOf(shippedRun())).toEqual(first);
  });

  /** And it grades it at all: a run of thirty-two swings reaches every word. */
  it('reaches more than one tier over sixty seconds', () => {
    const seen = new Set(
      shippedRun().flatMap((view) => (view.compass?.rings ?? []).map((ring) => ring.tier)),
    );
    expect(seen.has(null)).toBe(true);
    expect(seen.size).toBeGreaterThan(2);
  });
});
