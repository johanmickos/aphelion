/**
 * Spec [04](../../docs/spec/04-bodies.md)'s acceptance, in presentation state
 * and with no canvas:
 *
 * - *"A body transitions AHEAD → IN REACH → HELD → SPENT and back to nothing,
 *   and no transition changes its hue."*
 * - *"On the tick of grab, the body's energy is E2. On the tick of release, and
 *   not before, it is DUSK."*
 * - *"With the craft orbiting at constant rate, the tide bearing lags the craft
 *   bearing by a bounded, non-zero angle."*
 *
 * The first criterion in §1 — *"rendering a body at radius 20 and at radius 200
 * produces identical rim and tide stroke widths"* — is the renderer's and is
 * held there by the widths being constants rather than fractions of a radius.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBody, floorRadius } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { grabRange } from '../../src/sim/grab.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS, SETTLE_TICKS } from '../../src/sim/units.ts';
import {
  EMIT_AT,
  pullOf,
  TIDE_HALF_WIDTH_MAX,
  TIDE_LAG_RATE_MAX,
  TIDE_LIFT,
} from '../../src/state/body.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { bloomOf } from '../../src/state/energy.ts';
import type { BodyState, PresentationState } from '../../src/state/types.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { parseDispatch } from '../../tools/dispatch.ts';
import { openField } from '../sim/fixtures.ts';

const PRESS = { pressed: true };

function world(): SimState {
  return createInitialState(fixtureField(), fixtureCraft(), 1);
}

/** Fly the fixture field, pressing between two ticks, and keep every picture. */
function fly(grabAt: number, letGoAt: number, ticks = 400): PresentationState[] {
  const sim = world();
  const views = [createPresentation(sim)];
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, tick >= grabAt && tick < letGoAt ? PRESS : NO_INPUT);
    views.push(derive(views[views.length - 1]!, sim));
  }
  return views;
}

/**
 * The run `pnpm replay` ships, as the picture. Enough real play for every
 * transition in spec 04 §3 to happen to somebody.
 */
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

/** The states one body passes through, in order, with repeats collapsed. */
function journey(views: readonly PresentationState[], address: number): BodyState[] {
  const seen: BodyState[] = [];
  for (const view of views) {
    const state = view.bodies[address]!.state;
    if (seen[seen.length - 1] !== state) seen.push(state);
  }
  return seen;
}

describe('the four states', () => {
  const views = fly(20, 300);
  const grabbed = views.findIndex((view) => view.bodies.some((body) => body.held));
  const address = views[grabbed]!.bodies.findIndex((body) => body.held);
  const released = views.findIndex((view, i) => i > grabbed && !view.bodies[address]!.held);

  /**
   * Spec 04's own criterion, over the run this repo ships rather than over a
   * scripted press: somewhere in thirty-two swings a body goes the whole way.
   * The fixture field spawns the craft already inside body 0's reach, so a short
   * flight can only ever show three of the four.
   */
  it('runs ahead, in reach, held, spent', () => {
    const flown = shippedRun();
    const journeys = flown[0]!.bodies.map((_, i) => journey(flown, i));
    expect(journeys).toContainEqual(['AHEAD', 'IN_REACH', 'HELD', 'SPENT']);
  });

  /** And reach is a distance rather than a latch: a body can fall back out of it. */
  it('lets a body fall back out of reach', () => {
    expect(journey(fly(100, 300), 1)).toEqual(['AHEAD', 'IN_REACH', 'AHEAD']);
  });

  /**
   * *"The lamp goes out at release, not at grab."* This is the ruling the spec
   * README records Direction 04 winning over Direction 01 on, so it gets an
   * assertion on the exact two ticks rather than a range.
   */
  it('is E2 on the tick of the grab and E0 on the tick of the release, not before', () => {
    expect(views[grabbed]!.bodies[address]!.energy).toBe(2);
    expect(views[released - 1]!.bodies[address]!.energy).toBe(2);
    expect(views[released]!.bodies[address]!.energy).toBe(0);
    expect(views[released]!.bodies[address]!.bloom).toBe(0);
  });

  /**
   * **A body glows when it is gripping you, not when it is reachable.** Spec 04
   * §3 gives a body AHEAD *"E0–E1"* and [`EMIT_AT`](../../src/state/body.ts) is
   * where in that range it sits — M2.2 read it at the top and lit twenty-four
   * bodies at once, which the author's first note after flying it was about.
   * What is left of a distant body is its rim, which is §3's other sentence:
   * *"a constellation of dim coloured rings, never a row of grey balls."*
   */
  it('does not bloom until it is actually gripping the craft', () => {
    const quiet = views.filter((view) => view.bodies[address]!.state !== 'HELD');
    const dark = quiet.filter((view) => view.bodies[address]!.energy === 0);
    expect(dark.length).toBeGreaterThan(0);
    for (const view of views) {
      const body = view.bodies[address]!;
      if (body.state === 'HELD' || body.state === 'SPENT') continue;
      expect(body.energy).toBe(body.grip > EMIT_AT ? 1 : 0);
    }
  });

  /** And grip is a fact about *now*: it rises as the craft closes and never sticks. */
  it('grips harder the nearer the craft is', () => {
    const field = fixtureField();
    const body = field.bodies[0]!;
    const at = (gap: number): number => {
      const sim = createInitialState(field, createCraft(body.x, body.y + gap, 0, 0), 1);
      return createPresentation(sim).bodies[0]!.grip;
    };
    expect(at(floorRadius(body))).toBeCloseTo(1, 6);
    expect(at(floorRadius(body) * 2)).toBeLessThan(at(floorRadius(body)));
    expect(at(grabRange(body))).toBeLessThan(0.1);
  });

  it('never changes hue, whatever happens to it', () => {
    const hues = new Set(views.map((view) => view.bodies[address]!.hue));
    expect(hues.size).toBe(1);
  });

  /**
   * The AHEAD → IN REACH boundary is spec 01's grab-range predicate and not a
   * second opinion about it, so the state flips exactly where a press would
   * start being answered.
   */
  it('comes into reach exactly where a press would take it', () => {
    const field = fixtureField();
    const body = field.bodies[0]!;
    const reach = grabRange(body);
    const just = (gap: number): BodyState => {
      const sim = createInitialState(field, createCraft(body.x, body.y + gap, 0, 0), 1);
      return createPresentation(sim).bodies[0]!.state;
    };
    expect(just(reach * 0.99)).toBe('IN_REACH');
    expect(just(reach * 1.01)).toBe('AHEAD');
  });

  /**
   * SPENT is the one thing here the current tick cannot answer, and it is
   * deliberately permanent: *"a field of spent bodies behind the craft is the
   * run's scoreboard, drawn in the world."* It survives the craft flying far
   * away and coming back.
   */
  it('stays spent however far the craft goes', () => {
    const after = views.slice(released);
    expect(after.length).toBeGreaterThan(50);
    expect(after.every((view) => view.bodies[address]!.state === 'SPENT')).toBe(true);
  });

  /**
   * And a re-grab wins: HELD is what a body *is*, whatever it has been. The
   * shipped run does this repeatedly around body 11, so it is not a corner case.
   */
  it('is held again if it is grabbed again', () => {
    const sim = world();
    let view = createPresentation(sim);
    const seen: BodyState[] = [];
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, tick >= 20 && tick < 60 ? PRESS : tick >= 90 && tick < 200 ? PRESS : NO_INPUT);
      view = derive(view, sim);
      const state = view.bodies[address]!.state;
      if (seen[seen.length - 1] !== state) seen.push(state);
    }
    expect(seen).toEqual(['IN_REACH', 'HELD', 'SPENT', 'HELD', 'SPENT']);
  });

  it('opens a run with nothing spent', () => {
    expect(createPresentation(world()).bodies.every((body) => body.state !== 'SPENT')).toBe(true);
  });
});

describe('the tide', () => {
  /**
   * **On the body a press would take, and nowhere else.** Spec 04 §2 says
   * *"present on every body within grab range"*, which on this field is most of
   * them at once; flown, that is noise rather than gravity (author, 2026-08-29),
   * and the prototype narrows it to the same two with the same reason — the tide
   * is the body *reaching for you*, and that is the one a press would answer.
   */
  it('is on the offered body and absent beyond its reach', () => {
    const field = fixtureField();
    const body = field.bodies[0]!;
    const at = (gap: number): boolean => {
      const sim = createInitialState(field, createCraft(body.x, body.y + gap, 0, 0), 1);
      return createPresentation(sim).bodies[0]!.tide !== null;
    };
    expect(at(grabRange(body) * 0.9)).toBe(true);
    expect(at(grabRange(body) * 1.1)).toBe(false);
  });

  it('is drawn on at most one body that is not held', () => {
    for (const view of fly(20, 300)) {
      const lit = view.bodies.filter((body) => body.tide !== null && !body.held);
      expect(lit.length).toBeLessThanOrEqual(1);
      for (const body of lit) expect(body.offered).toBe(true);
    }
  });

  /**
   * Spec 04's acceptance. The lag is the behaviour and not a defect in the
   * tracking: a tide that kept up exactly would have stopped saying how heavy
   * its body is.
   */
  it('lags the craft by a bounded, non-zero angle through a settled orbit', () => {
    const views = fly(20, 320);
    const settled = views.filter((view) => {
      const held = view.bodies.find((body) => body.held);
      return held?.tide != null && view.tick > 20 + SETTLE_TICKS + 40;
    });
    expect(settled.length).toBeGreaterThan(60);

    const lags = settled.map((view) => {
      const body = view.bodies.find((b) => b.held)!;
      const bearing = Math.atan2(view.craft.y - body.y, view.craft.x - body.x);
      let delta = (bearing - body.tide!.bearing) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      return Math.abs(delta);
    });

    expect(Math.min(...lags)).toBeGreaterThan(0);
    expect(Math.max(...lags)).toBeLessThan(Math.PI / 2);
  });

  /**
   * Spec 04 §2: *"a heavier body reaches with a longer, brighter,
   * tighter-tracking tide ... the three must move together and monotonically
   * with mass."* They do so by construction — all three are readings of
   * [`pullOf`](../../src/state/body.ts) — and this is the assertion that keeps
   * it that way.
   */
  it('is longer, brighter and tighter-tracking on a heavier body', () => {
    const radii = [MEDIAN_RADIUS * 0.7, MEDIAN_RADIUS, MEDIAN_RADIUS * 1.4];
    const tides = radii.map((radius) => {
      const body = createBody(0, 0, radius);
      const field = openField([body]);
      const sim = createInitialState(field, createCraft(0, grabRange(body) * 0.5, 0, 0), 1);
      return createPresentation(sim).bodies[0]!.tide!;
    });

    for (let i = 1; i < tides.length; i++) {
      expect(tides[i]!.halfWidth).toBeGreaterThan(tides[i - 1]!.halfWidth);
      expect(tides[i]!.strength).toBeGreaterThan(tides[i - 1]!.strength);
    }
    // And they never run away: an arc lives on a circle, so the law saturates.
    for (const tide of tides) expect(tide.halfWidth).toBeLessThan(TIDE_HALF_WIDTH_MAX);
  });

  /**
   * *"I also want the tide window to grow in brightness as I get near. So we can
   * tweak each final tide color to be a touch brighter than right now"* (author,
   * 2026-08-29). The width already grew into itself as the craft closed and the
   * brightness did not.
   *
   * The lift is additive on purpose, and this pins both halves of why: the far
   * end lands exactly on `pull`, where the author already tuned it, so nothing
   * in the field gets dimmer — and the near end arrives brighter than anything
   * that shipped before it.
   */
  it('brightens as the craft closes, without dimming anything far away', () => {
    const body = createBody(0, 0, MEDIAN_RADIUS);
    const field = openField([body]);
    const at = (fraction: number): number => {
      const sim = createInitialState(field, createCraft(0, grabRange(body) * fraction, 0, 0), 1);
      return createPresentation(sim).bodies[0]!.tide!.strength;
    };

    const far = at(0.999);
    const near = at(0.05);

    // Monotone the whole way in.
    const walk = [0.999, 0.8, 0.6, 0.4, 0.2, 0.05].map(at);
    for (let i = 1; i < walk.length; i++) expect(walk[i]!).toBeGreaterThan(walk[i - 1]!);

    // The floor is mass alone — untouched.
    expect(far).toBeCloseTo(pullOf(body), 2);
    // And the ceiling is the lift, spent on the room mass left over.
    expect(near).toBeCloseTo(pullOf(body) + (1 - pullOf(body)) * TIDE_LIFT, 2);
    expect(near).toBeLessThanOrEqual(1);
  });

  /**
   * The median body is where the spec's own reference numbers land.
   *
   * The tracking is **30** and not §2's stated 6, and the size of that gap is
   * the taper's doing. The arc peaks on the bearing and fades to nothing at both
   * ends, so what reads as *the tide* is its bright middle half — and against
   * that, halving the lag was not enough: *"it seems like we moved the wrong way.
   * I want the tide to be more directly under the ship"* (author, 2026-08-29).
   * Measured, the craft is inside the bright core 11% of the time at 12 and
   * **91%** at 30, where the lag is still a readable p50 2.1°. Ruled by the
   * author and carried in §2's notice.
   */
  it('reads spec 04 §2 at the median body', () => {
    const median = createBody(0, 0, MEDIAN_RADIUS);
    expect(pullOf(median)).toBeCloseTo(0.5, 12);
    expect(TIDE_HALF_WIDTH_MAX * pullOf(median)).toBeCloseTo(0.3, 12);
    expect(TIDE_LAG_RATE_MAX * pullOf(median)).toBeCloseTo(30, 12);
  });

  /**
   * ADR-0015's second rule, for the one value here that can appear from nothing:
   * a tide arriving is **placed** on the true bearing rather than eased onto it
   * from wherever the body last had one. Easing it in would sweep the limb round
   * the body at the moment the player is deciding whether to press.
   */
  it('arrives placed rather than easing in from a stale bearing', () => {
    const body = createBody(0, 0, MEDIAN_RADIUS);
    const field = openField([body]);
    const sim = createInitialState(field, createCraft(0, grabRange(body) * 1.2, 0, -300), 1);

    let view = createPresentation(sim);
    expect(view.bodies[0]!.tide).toBeNull();
    while (view.bodies[0]!.tide === null) {
      stepSim(sim, NO_INPUT);
      view = derive(view, sim);
    }
    const bearing = Math.atan2(sim.craft.y - body.y, sim.craft.x - body.x);
    expect(view.bodies[0]!.tide!.bearing).toBeCloseTo(bearing, 6);
  });

  it('is gone once the body is spent, because the lamp is out', () => {
    const views = fly(20, 120);
    const spent = views.find((view) => view.bodies.some((body) => body.state === 'SPENT'))!;
    const body = spent.bodies.find((b) => b.state === 'SPENT')!;
    expect(body.tide).toBeNull();
    expect(body.bloom).toBe(bloomOf(0));
  });
});
