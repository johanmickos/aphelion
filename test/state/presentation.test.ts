/**
 * [M2.1](../../docs/plan/m2-the-instrument.md)'s acceptance, in the words it is
 * written in: *"presentation state is derived per tick, is pure, passes the
 * portability check, and a frame is a function of `(recipe, tick)`"*, verified
 * by *"a test asserting derived values at named ticks with no canvas involved."*
 *
 * The named ticks are the ones `pnpm replay` prints for the run this repo ships
 * — the same file, the same seed, the same swings — so a number here and a
 * number in that terminal output are the same number, and a disagreement about
 * the picture is a disagreement about a tick that both sides can fly.
 *
 * **No canvas, and no renderer**: nothing under `src/render/` is imported below,
 * which is what the acceptance means and what makes ADR-0006's promise worth
 * having.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { DEFORM_TICKS, STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from '../../src/state/energy.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';

/**
 * Every tick of the shipped run, as the picture. Derived beside the simulation
 * from tick zero, once per tick, because
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)
 * means it cannot be asked for out of the blue.
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

const RUN = shippedRun();

/** The picture on a named tick. They are indices because tick zero is index zero. */
const at = (tick: number): PresentationState => {
  const view = RUN[tick]!;
  expect(view.tick).toBe(tick);
  return view;
};

/**
 * The first swing of the shipped run: the press is recorded on tick 73 and the
 * grab lands on 74, and the release lands on 258. `pnpm replay` prints both.
 */
const GRAB = 74;
const RELEASE = 258;

describe('the run pnpm replay ships', () => {
  it('is the sixty seconds the trail prints', () => {
    expect(RUN.length - 1).toBe(3598);
  });
});

describe('the one E3', () => {
  /**
   * Spec [00 · §3](../../docs/spec/00-tokens.md) gives an E3 to a release and to
   * a grab alike, and spec [02 · §7](../../docs/spec/02-release.md) makes the
   * grab the release's mirror. It arrives at full radius: spec 00 §5's first
   * motion rule is that things arrive rather than fading in.
   */
  it('is struck at the grab, at full radius, where the craft was', () => {
    expect(at(GRAB - 1).flash).toBeNull();

    const flash = at(GRAB).flash!;
    expect(flash.decay).toEqual({ age: 0, span: E3_TICKS });
    expect(flash.radius).toBe(E3_BLOOM);
    expect(flash.x).toBe(at(GRAB).craft.x);
    expect(flash.y).toBe(at(GRAB).craft.y);
  });

  /** And it stays where it was struck. The craft has left; the flash has not. */
  it('does not travel with the craft', () => {
    const struck = at(GRAB).flash!;
    expect(at(GRAB + 6).flash!.x).toBe(struck.x);
    expect(at(GRAB + 6).flash!.y).toBe(struck.y);
    expect(at(GRAB + 6).craft.x).not.toBe(struck.x);
  });

  it('falls to nothing over 400ms and then is gone', () => {
    expect(at(RELEASE).flash!.radius).toBe(E3_BLOOM);
    expect(at(RELEASE + 12).flash!.radius).toBe(E3_BLOOM * 0.25);
    expect(at(RELEASE + E3_TICKS - 1).flash!.decay.age).toBe(E3_TICKS - 1);
    expect(at(RELEASE + E3_TICKS).flash).toBeNull();
  });

  /**
   * Spec 00 §3's rule, and spec 00's acceptance criterion: *"at most one E3 is
   * alive on any tick."* It holds over the whole run and not by a check — the
   * layer has one slot, so a second E3 has nowhere to be.
   */
  it('is at most one, on every tick of a whole run', () => {
    for (const view of RUN) {
      expect(view.flash === null || typeof view.flash.radius === 'number').toBe(true);
    }
    // 32 swings' worth of events, and never two at once: the count of ticks
    // carrying a flash is bounded by one span per event rather than by their sum.
    const lit = RUN.filter((view) => view.flash !== null).length;
    expect(lit).toBeGreaterThan(1000);
    expect(lit).toBeLessThan(RUN.length);
  });

  /**
   * A new one replaces the old rather than stacking, which is only observable as
   * the clock going back to zero. The shipped run re-grabs body 11 on the tick
   * after it lets go of it, so the release's E3 is 1 tick old when the grab's
   * arrives.
   */
  it('is replaced by the next one rather than stacked with it', () => {
    const struck = RUN.flatMap((view, tick) => (view.flash?.decay.age === 0 ? [tick] : []));
    const second = struck.findIndex((tick, i) => i > 0 && tick - struck[i - 1]! < E3_TICKS);
    expect(second).toBeGreaterThan(0);

    const older = struck[second - 1]!;
    const newer = struck[second]!;
    // The tick before, the older E3 is still alive and counting from its own
    // strike; the tick after, the clock is back at zero and the flash is
    // somewhere else. That is a replacement, and there is nowhere for a second
    // one to have gone.
    expect(RUN[newer - 1]!.flash!.decay.age).toBe(newer - 1 - older);
    expect(RUN[newer]!.flash!.decay.age).toBe(0);
    expect(RUN[newer]!.flash!.x).not.toBe(RUN[older]!.flash!.x);
  });
});

describe('the craft', () => {
  /** Spec 00 §3: *"E2 — craft baseline"*, and it never moves off it. */
  it('burns at E2 for the whole run', () => {
    for (const view of RUN) {
      expect(view.craft.energy).toBe(2);
      expect(view.craft.bloom).toBe(bloomOf(2));
    }
  });

  /**
   * Spec [02 · §4](../../docs/spec/02-release.md): the craft leaves stretched
   * 1.5 along the velocity vector and 0.7 across it, and recovers with one
   * overshoot. Dated from the release tick rather than from `T+70ms`, because
   * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
   * withdrew the freeze that offset was measured from and the file's own notice
   * says every such offset becomes `T0`.
   */
  it('is stretched by the release and not by the grab', () => {
    expect(at(GRAB).craft.deformation).toEqual({ along: 1, across: 1, recovery: null });

    const struck = at(RELEASE).craft.deformation;
    expect(struck.along).toBe(STRETCH_ALONG);
    expect(struck.across).toBe(STRETCH_ACROSS);
    expect(struck.recovery).toEqual({ age: 0, span: DEFORM_TICKS });
  });

  it('passes rest once on the way back, and is home in 180ms', () => {
    const shapes = [];
    for (let tick = RELEASE; tick <= RELEASE + DEFORM_TICKS; tick++) {
      shapes.push(at(tick).craft.deformation);
    }

    // Spec 02 §4's own rebound: 0.95 against a 1.5 stretch, a tenth of the way
    // past rest. The board puts it at 83% of the return and this curve puts it
    // at 58%; the depth is the number, and the plan records the difference.
    const deepest = Math.min(...shapes.map((shape) => shape.along));
    expect(deepest).toBeCloseTo(0.95, 2);
    expect(shapes.filter((shape) => shape.along < 1).length).toBeGreaterThan(1);

    expect(at(RELEASE + DEFORM_TICKS).craft.deformation).toEqual({
      along: 1,
      across: 1,
      recovery: null,
    });
  });
});

describe('the bodies', () => {
  /**
   * Spec 00 §3 puts a held body at E2 and a body's rim at E1, and the spec
   * README's ruling is that *"a held body is E2 and alive, and goes DUSK only
   * after release"*. The E0 a spent body drops to needs a memory of what has
   * been released and is [M2.2](../../docs/plan/m2-the-instrument.md)'s.
   */
  it('burn at E1, and the held one at E2', () => {
    const held = at(GRAB + 40);
    const lit = held.bodies.filter((body) => body.held);
    expect(lit.length).toBe(1);
    expect(lit[0]!.energy).toBe(2);
    expect(lit[0]!.bloom).toBe(bloomOf(2));

    for (const body of held.bodies.filter((body) => !body.held)) {
      expect(body.energy).toBe(1);
      expect(body.bloom).toBe(bloomOf(1));
    }
  });

  it('are all at E1 while the craft coasts', () => {
    const coasting = at(GRAB - 1);
    expect(coasting.bodies.every((body) => body.energy === 1)).toBe(true);
  });
});

describe('a frame as a function of (recipe, tick)', () => {
  /**
   * ADR-0006's promise, with everything M2.1 added inside it. The same recipe
   * derived twice is the same picture at every one of 3 598 ticks — energies,
   * bloom radii, stretch, flash clocks and all.
   */
  it('replays identically, down to the clocks', () => {
    expect(shippedRun()).toEqual(RUN);
  });

  /**
   * And it still cannot be asked for out of the blue, which is what a recurrence
   * means. `test/sim/replay.test.ts` makes this claim about the camera; every
   * value M2.1 added inherits it, and the flash is the sharpest case — asking
   * the final state what it looks like cannot know an E3 was ever struck.
   */
  it('is not the same as asking a state what it looks like', () => {
    const arrived = at(RELEASE);
    expect(arrived.flash).not.toBeNull();
    expect(arrived.craft.deformation.recovery).not.toBeNull();

    // A picture opened on that same tick has neither, because neither is a fact
    // about the tick — both are facts about what happened on it.
    const opened = createPresentation(
      replayRun(
        parseDispatch(
          JSON.parse(readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8')),
        ).recipe,
      ),
    );
    expect(opened.flash).toBeNull();
    expect(opened.craft.deformation.recovery).toBeNull();
  });
});
