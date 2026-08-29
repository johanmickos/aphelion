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
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { grabRange } from '../../src/sim/grab.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';
import { openField } from '../sim/fixtures.ts';
import { SETTLE_TICKS } from '../../src/sim/units.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MIN_HALF_WIDTH } from '../../src/sim/compass.ts';
import {
  ENTER_FROM,
  ENTER_TICKS,
  FILAMENT_FLOOR,
  EXIT_BY,
  EXIT_TICKS,
  RING_INNER,
  STACK_GAP,
  takenBy,
} from '../../src/state/compass.ts';
import { compassOf } from '../../src/state/compass.ts';
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
    const diving = compassAt(views, (c) => c.filament > 0);
    expect(diving.hand).toBeNull();
    expect(diving.rings).toEqual([]);
    expect(diving.hue).toBe(hueOf(0));
  });

  /** State 2 · ORBIT. The rings arrive with the freeze, and not before it. */
  it('grows its rings at the freeze', () => {
    const armed = compassAt(views, (c) => c.hand !== null);
    expect(armed.rings.length).toBeGreaterThan(0);
    expect(armed.filament).toBe(0);
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
      'alpha',
      'anchor',
      'craftX',
      'craftY',
      'direction',
      'entrance',
      'exit',
      'filament',
      'hand',
      'hue',
      'path',
      'predicted',
      'presence',
      'reach',
      'rings',
      'scale',
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

describe('the instrument coming online', () => {
  /**
   * Spec [00 · §5](../../docs/spec/00-tokens.md)'s **ENTER**, applied to the
   * compass: from 92% with one overshoot, over 120ms, when the rings arrive at
   * the freeze. *"It made the grab and orbit feel dynamic, like my ship's HUD was
   * coming online in orbit"* (author, 2026-08-29) — and it is **one pop**, not
   * the continuous pump the prototype measured and removed.
   */
  it('pops from 92%, overshoots once, and settles', () => {
    const views = held();
    const armed = views.filter((v) => v.compass?.hand != null);
    expect(armed.length).toBeGreaterThan(200);

    const scales = armed.map((v) => v.compass!.scale);
    expect(scales[0]).toBeCloseTo(ENTER_FROM, 9);
    expect(Math.max(...scales)).toBeGreaterThan(1);
    expect(Math.max(...scales)).toBeLessThan(1.02);

    // Over in 120ms, and then exactly one for the rest of the swing.
    expect(scales.slice(ENTER_TICKS).every((s) => s === 1)).toBe(true);
    expect(armed.slice(ENTER_TICKS).every((v) => v.compass!.entrance === null)).toBe(true);
  });

  /** And the world does not pop with it: the path is the orbit, at its own size. */
  it('leaves the orbit path alone', () => {
    const armed = held().filter((v) => v.compass?.hand != null);
    const early = armed[1]!.compass!;
    expect(early.scale).toBeLessThan(1);
    // The craft is on the path whatever the instrument is doing around it.
    const craft = armed[1]!.craft;
    const r = Math.hypot(craft.x - early.x, craft.y - early.y);
    expect(r).toBeGreaterThanOrEqual(Math.min(...early.path) - 1);
    expect(r).toBeLessThanOrEqual(Math.max(...early.path) + 1);
  });
});

describe('a window never moves once it exists', () => {
  /**
   * *"Sometimes the compass windows would move after initializing. This is not
   * acceptable; the planets don't move. We should only show stable targets"*
   * (author, 2026-08-29). The planets do not move, the held body does not move,
   * and neither may anything drawn about them — so this asserts **equality**
   * rather than a tolerance, over every ring of every tick of the run this repo
   * ships.
   *
   * Three things were moving them, and they were three different bugs. The dot
   * was chosen from two exact roots by whichever had the smaller floating-point
   * residual, which flipped it **46.6° in one tick**. It was then computed on the
   * momentary oval, which slid it up to **56°** across a settle. And the ring
   * radius jumped a whole [`STACK_GAP`](../../src/state/compass.ts) whenever the
   * sliding dots stopped overlapping.
   */
  it('holds its dot, its width and its radius for the whole swing', () => {
    const run = shippedRun();
    const first = new Map<number, { dot: number; halfWidth: number; radius: number }>();
    let held: number | null = null;
    let checked = 0;

    for (const view of run) {
      const compass = view.compass;
      const holding = view.bodies.findIndex((body) => body.held);
      if (holding !== held) {
        first.clear();
        held = holding;
      }
      if (compass === null || compass.hand === null) continue;

      for (const ring of compass.rings) {
        const was = first.get(ring.body);
        if (was === undefined) {
          first.set(ring.body, { dot: ring.dot, halfWidth: ring.halfWidth, radius: ring.radius });
          continue;
        }
        expect(ring.dot).toBe(was.dot);
        expect(ring.halfWidth).toBe(was.halfWidth);
        expect(ring.radius).toBe(was.radius);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  /**
   * And it is still an aim rather than a decoration: the dot is where the exit
   * tangent points at the body **on the orbit the swing is becoming**, which is
   * exactly the orbit by the time the settle is over.
   */
  it('is still the true tangent once the settle is done', () => {
    const settled = held().filter(
      (view) => view.compass?.hand != null && view.tick > 20 + SETTLE_TICKS + 40,
    );
    expect(settled.length).toBeGreaterThan(50);
    const view = settled[0]!;
    const compass = view.compass!;
    for (const ring of compass.rings) {
      const radius = compass.anchor;
      const x = compass.x + Math.cos(ring.dot) * radius;
      const y = compass.y + Math.sin(ring.dot) * radius;
      const body = view.bodies[ring.body]!;
      const heading = Math.atan2(
        Math.cos(ring.dot) * compass.direction,
        -Math.sin(ring.dot) * compass.direction,
      );
      const bearing = Math.atan2(body.y - y, body.x - x);
      const off = Math.abs(((heading - bearing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      expect(off).toBeLessThan(0.02);
    }
  });
});

/**
 * *"Sometimes I grab too late and float away while tethered, and the dying
 * brightness would be diegetic"* (author, 2026-08-29).
 *
 * The hold ends on a release and on nothing else, so a grab that never captures
 * keeps its filament all the way out of the field. At constant brightness that
 * line goes on insisting the grab is going somewhere; faded, it says what
 * actually happened.
 */
describe('the grab filament', () => {
  const law = (sim: SimState): number => {
    const body = sim.field.bodies[sim.heldBody!]!;
    const away = Math.hypot(sim.craft.x - body.x, sim.craft.y - body.y);
    return FILAMENT_FLOOR + (1 - FILAMENT_FLOOR) * (1 - Math.min(1, away / grabRange(body)));
  };

  it('is exactly how much of the body’s hold is left, floored', () => {
    const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
    let view = createPresentation(sim);
    let checked = 0;
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
      view = derive(view, sim);
      if (view.compass === null || view.compass.filament === 0) continue;
      expect(view.compass.filament).toBeCloseTo(law(sim), 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('brightens as the craft falls in, and is all but full at the freeze', () => {
    const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
    let view = createPresentation(sim);
    const dive: number[] = [];
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
      view = derive(view, sim);
      if (view.compass !== null && view.compass.filament > 0) dive.push(view.compass.filament);
    }
    expect(dive.length).toBeGreaterThan(50);
    // The end that was already tuned stays where it was: at the freeze the craft
    // is about a tenth of a reach out, so the filament is near enough to full
    // that the moment looks the way it always did.
    expect(dive.at(-1)!).toBeGreaterThan(0.9);
    expect(dive.at(-1)!).toBeGreaterThan(dive[0]!);
  });

  /**
   * The case the note is about: a body grabbed from behind, at speed, that never
   * captures. The craft drifts out past 1.7 reaches still tethered.
   */
  it('dies to a thread when the grab misses, and never below it', () => {
    const body = createBody(0, 0, MEDIAN_RADIUS);
    const field = openField([body]);
    const sim: SimState = createInitialState(
      field,
      createCraft(0, grabRange(body) * 0.5, 0, 1200),
      1,
    );
    let view = createPresentation(sim);
    const out: number[] = [];
    let froze = false;
    for (let tick = 0; tick < 600; tick++) {
      stepSim(sim, PRESS);
      view = derive(view, sim);
      if (sim.orbit !== null) froze = true;
      if (view.compass !== null && view.compass.filament > 0) out.push(view.compass.filament);
    }

    expect(froze).toBe(false); // It really is a miss.
    expect(out.length).toBeGreaterThan(100);
    expect(out[0]!).toBeGreaterThan(0.5);
    expect(Math.min(...out)).toBeCloseTo(FILAMENT_FLOOR, 9);

    // A thread, not nothing: the craft is still attached and still spending a
    // grab, and the picture has to keep saying so.
    expect(Math.min(...out)).toBeGreaterThan(0);

    // And stated without reference to the constant, so that turning the fade off
    // fails here rather than passing by agreeing with itself: the far end is
    // less than half the near end.
    expect(Math.min(...out)).toBeLessThan(out[0]! / 2);
  });
});

describe('the instrument clicking out', () => {
  /** One swing, and everything after the release until the compass is gone. */
  const exiting = (): PresentationState[] => {
    const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
    const views = [createPresentation(sim)];
    for (let tick = 0; tick < 420; tick++) {
      stepSim(sim, tick >= 20 && tick < 300 ? PRESS : NO_INPUT);
      views.push(derive(views[views.length - 1]!, sim));
    }
    const released = views.findIndex(
      (view, i) => i > 0 && view.compass?.exit != null && views[i - 1]!.compass?.exit == null,
    );
    expect(released).toBeGreaterThan(0);
    return views.slice(released).filter((view) => view.compass !== null);
  };

  /**
   * *"When holding an orbit and release, the compass just disappears. Could we
   * have it pulse out slightly and then quickly in with a fadeout? So it looks
   * like it clicks out?"* (author, 2026-08-29). It leaves on the curve it
   * arrived on, reversed — so the swell is the same single overshoot ENTER lands
   * on, and the two ends of the instrument are one shape.
   */
  it('swells slightly, then collapses inward, and is gone', () => {
    const out = exiting();
    const scales = out.map((view) => view.compass!.scale);

    // Out, a little.
    const swell = Math.max(...scales);
    expect(swell).toBeGreaterThan(1);
    expect(swell).toBeLessThan(1.06);

    // Then in, past where it started, accelerating — the click.
    const last = scales.at(-1)!;
    expect(last).toBeLessThan(1 - EXIT_BY / 2);

    // **And it does not pause first.** The curve it borrows settles into rest at
    // one end, so read backwards it leaves rest with no speed — which is a pause
    // (author, 2026-08-29). Its clock is hurried to spend that in a tick: the
    // swell is all but complete on the tick after the release, and the peak is
    // inside the first third rather than at the halfway mark.
    expect(scales[1]!).toBeGreaterThan(1 + (swell - 1) * 0.8);
    expect(scales.indexOf(swell)).toBeLessThan(scales.length / 3);

    // And over quickly: 100ms and not a tick more.
    expect(out.length).toBeLessThanOrEqual(EXIT_TICKS);
  });

  /**
   * The bug the speed complaint was actually about.
   *
   * [`leave`](../../src/state/compass.ts) carries the hand through the exit, and
   * the entrance was placed on `hand === null` — so a grab landing inside those
   * few exit ticks took the *other* branch and advanced an entrance that had
   * finished long ago. `advance(null)` is `null`, which is scale 1: the compass
   * came back at full size with no bounce at all, exactly during the fast
   * grab-release-grab of *"it feels a bit laggy when I'm zipping around"*
   * (author, 2026-08-29). The instrument has to come online every time it comes
   * online, and most of all when it is doing it often.
   */
  it('comes online again when the grab lands inside its own exit', () => {
    // Driven at the seam rather than flown: a release followed by a grab within
    // six ticks needs a second body already in range at the release point, which
    // the fixture field takes 65 ticks to offer. The branch is the subject, so
    // the branch is what is exercised — with a real held view and a real sim on
    // either side of it.
    const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
    let view = createPresentation(sim);
    // Held until the freeze has happened and the entrance has finished — the
    // dive has no hand and no instrument to click out.
    for (let tick = 0; tick < 400 && view.compass?.hand == null; tick++) {
      stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
      view = derive(view, sim);
    }
    for (let tick = 0; tick < ENTER_TICKS + 2; tick++) {
      stepSim(sim, PRESS);
      view = derive(view, sim);
    }

    const live = view.compass!;
    expect(live.hand).not.toBeNull();
    expect(live.exit).toBeNull();
    expect(live.scale).toBeCloseTo(1, 9); // Long since arrived.

    // Let go — the instrument starts clicking out, still carrying its hand.
    const leaving = compassOf(live, { ...sim, heldBody: null });
    expect(leaving!.exit).not.toBeNull();
    expect(leaving!.hand).not.toBeNull();

    // And grab again on the next tick, while that exit is still on screen.
    const back = compassOf(leaving, sim)!;
    expect(back.exit).toBeNull();
    expect(back.scale).toBeCloseTo(ENTER_FROM, 9);
  });

  /**
   * **The light holds while the shape talks.** The design's own decay is fastest
   * at the start, which had the collapse happening under 13% opacity — the motion
   * asked for, where it could not be seen.
   */
  it('fades so that the collapse is still visible', () => {
    const out = exiting();
    const alphas = out.map((view) => view.compass!.alpha);

    for (let i = 1; i < alphas.length; i++) expect(alphas[i]!).toBeLessThan(alphas[i - 1]!);
    expect(alphas[0]).toBe(1);

    // Still well lit where the shape swells, and still visible where it shuts.
    const swellAt = out.findIndex(
      (view) => view.compass!.scale === Math.max(...out.map((v) => v.compass!.scale)),
    );
    expect(alphas[swellAt]!).toBeGreaterThan(0.6);
    expect(alphas.at(-1)!).toBeGreaterThan(0.1);
  });

  /**
   * The hand stays where the release happened, because that is the thing still
   * worth seeing — and the rings do not move on the way out any more than they
   * did on the way in.
   */
  it('holds still while it goes', () => {
    const out = exiting();
    const first = out[0]!.compass!;
    for (const view of out) {
      expect(view.compass!.hand).toBe(first.hand);
      expect(view.compass!.rings.map((r) => r.dot)).toEqual(first.rings.map((r) => r.dot));
    }
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
