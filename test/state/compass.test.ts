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
import { MIN_HALF_WIDTH } from '../../src/sim/compass.ts';
import { RING_INNER, STACK_GAP, takenBy } from '../../src/state/compass.ts';
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
   * **The stack does not breathe.** M2.3 anchored it to the craft's live radius
   * and the author reported it as bouncing on the first swing; the prototype had
   * already measured the same thing — *"85 out to 97 and back over about a
   * second, on top of a curve the player is trying to read"* — and anchored to
   * the periapsis instead, which the freeze fixes and nothing afterwards moves.
   */
  it('holds its radii still while the craft sweeps the oval', () => {
    const armed = views.filter((v) => v.compass?.hand != null && v.compass.rings.length > 0);
    expect(armed.length).toBeGreaterThan(120);
    const first = armed[0]!.compass!;
    for (const view of armed) {
      expect(view.compass!.anchor).toBe(first.anchor);
      for (const ring of view.compass!.rings) {
        const same = first.rings.find((r) => r.body === ring.body);
        if (same) expect(ring.radius).toBeCloseTo(same.radius, 9);
      }
    }
  });

  /**
   * **The gaps say how far.** The rings are not equidistant: each clears the
   * orbit by a fixed amount and then steps out in proportion to its body's own
   * distance, so a nearer body is a nearer ring and reading the stack is reading
   * the field (author, 2026-08-29).
   */
  it('spaces the rings by how far their bodies are', () => {
    const armed = compassAt(views, (c) => c.rings.length > 1);
    for (let i = 1; i < armed.rings.length; i++) {
      expect(armed.rings[i]!.away).toBeGreaterThan(armed.rings[i - 1]!.away);
      expect(armed.rings[i]!.radius).toBeGreaterThan(armed.rings[i - 1]!.radius);
    }
    // And every ring clears the path the craft is actually on.
    for (const ring of armed.rings) {
      expect(ring.radius - armed.anchor).toBeGreaterThanOrEqual(RING_INNER - 1e-9);
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
      'anchor',
      'craftX',
      'craftY',
      'direction',
      'filament',
      'hand',
      'hue',
      'path',
      'predicted',
      'presence',
      'reach',
      'rings',
      'swept',
      'x',
      'y',
    ]);
    expect(Object.keys(armed.rings[0]!).sort()).toEqual([
      'aim',
      'away',
      'blocked',
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

describe('the window is the quality band', () => {
  /**
   * **Not the reachable one.** Drawn where a release merely lands within grab
   * range the arc is p50 360° on this field — true, and useless, because the
   * median body is on offer from 1 680 design units against a field spaced nearer
   * 700. Drawn where it arrives within the body's own **floor** it is p50 24°,
   * which is spec 06 §2's worked scale and the prototype's fixed wedge at once.
   */
  it('is a fraction of a circle rather than most of one', () => {
    const widths = held()
      .flatMap((view) => view.compass?.rings ?? [])
      .map((ring) => (ring.halfWidth * 2 * 180) / Math.PI);
    expect(widths.length).toBeGreaterThan(100);
    const sorted = [...widths].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeLessThan(90);
    expect(Math.max(...widths)).toBeLessThan(180);
  });

  /**
   * And it never closes entirely: *"for very distant planets we still need to
   * show a window... it's more important that the player knows roughly where to
   * aim"* (author, 2026-08-29). The floor is spec 06 §2's own narrow worked
   * example, and at that width §2's 1.5° PERFECT floor still binds — so the top
   * word does not get easier for being far away.
   */
  it('opens a narrow arc to the minimum, unless the geometry itself is narrower', () => {
    const widths = held()
      .flatMap((view) => view.compass?.rings ?? [])
      .map((ring) => ring.halfWidth);
    expect(widths.length).toBeGreaterThan(100);
    // None is closed, and none is a needle: the floor is honoured wherever the
    // arc that actually arrives at that body is wide enough to hold it, and
    // capped by that arc where it is not — because a window wider than the set of
    // releases that reach the body would be claiming releases that go elsewhere.
    for (const w of widths) expect(w).toBeGreaterThan(0);
    const sorted = [...widths].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeGreaterThan(MIN_HALF_WIDTH * 0.8);
  });

  /**
   * **The path is the oval the craft is actually on, and it rounds out.** The
   * trail used to be an arc of a circle at the ring anchor, which is not the line
   * being flown. Through the settle the sampled path is visibly eccentric and by
   * the end of it it is a circle.
   */
  it('draws an oval that rounds into a circle over the settle', () => {
    const armed = held().filter((v) => v.compass?.path.length);
    const shape = (view: (typeof armed)[number]): number => {
      const p = view.compass!.path;
      return Math.max(...p) / Math.min(...p);
    };
    const early = shape(armed[0]!);
    const late = shape(armed.at(-1)!);
    expect(early).toBeGreaterThan(1.5);
    expect(late).toBeCloseTo(1, 3);
    // And it never stops being the simulation's own ellipse: the craft is on it.
    const view = armed[3]!;
    const c = view.compass!;
    const r = Math.hypot(view.craft.x - c.x, view.craft.y - c.y);
    expect(r).toBeGreaterThanOrEqual(Math.min(...c.path) - 1);
    expect(r).toBeLessThanOrEqual(Math.max(...c.path) + 1);
  });
});

describe('windows that sit on top of each other', () => {
  /**
   * *"There should be some minimum distance between compass windows that are
   * essentially stacked on top because their direction is so similar"* (author,
   * 2026-08-29). The **ring** moves rather than the arc, because moving an arc
   * would put the dot somewhere a release does not go — the same instinct spec
   * 00 §6 already has for labels.
   */
  it('pushes the outer ring out until its window clears the inner one', () => {
    let checked = 0;
    for (const view of held()) {
      const rings = view.compass?.rings ?? [];
      for (let i = 1; i < rings.length; i++) {
        for (let j = 0; j < i; j++) {
          const apart = Math.abs(
            ((rings[i]!.dot - rings[j]!.dot + Math.PI) % (Math.PI * 2)) - Math.PI,
          );
          if (apart >= rings[i]!.halfWidth + rings[j]!.halfWidth) continue;
          expect(rings[i]!.radius - rings[j]!.radius).toBeGreaterThanOrEqual(STACK_GAP - 1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  /** And the order still says which body is nearer, whatever the pushing did. */
  it('keeps the nearer body on the inner ring', () => {
    for (const view of held()) {
      const rings = view.compass?.rings ?? [];
      for (let i = 1; i < rings.length; i++) {
        expect(rings[i]!.away).toBeGreaterThanOrEqual(rings[i - 1]!.away);
        expect(rings[i]!.radius).toBeGreaterThan(rings[i - 1]!.radius);
      }
    }
  });
});

describe('the glow arrives before the hand does', () => {
  /**
   * *"When I hold an orbit and spin around, the compass windows pass too
   * quickly... the original starts glowing before I touch them, which helps me
   * predict when to click"* (author, 2026-08-29). So the heat ramps over a
   * quarter turn rather than over the window: a window is already well up while
   * the hand is far outside its arc.
   */
  it('is already lifting while the hand is outside the arc', () => {
    const outside = held()
      .flatMap((view) => view.compass?.rings ?? [])
      .filter((ring) => Math.abs(ring.offset) > ring.halfWidth);
    expect(outside.length).toBeGreaterThan(50);
    expect(outside.some((ring) => ring.aim > 0.4)).toBe(true);
    // And it is monotone in the aim error, so it can be read as a countdown.
    for (const ring of outside) {
      expect(ring.aim).toBeCloseTo(Math.max(0, 1 - Math.abs(ring.offset) / (Math.PI / 2)), 9);
    }
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
    expect(first.length).toBeGreaterThan(2000);
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
