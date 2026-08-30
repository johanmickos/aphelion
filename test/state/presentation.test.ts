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
import { STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { punchSpan } from '../../src/state/punch.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { EMIT_AT } from '../../src/state/body.ts';
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
 * The first swing of the shipped run: the grab lands on tick 70 and the
 * release on 254. `pnpm replay` prints both.
 */
const GRAB = 70;
const RELEASE = 254;

describe('the run pnpm replay ships', () => {
  it('is the run the trail prints', () => {
    expect(RUN.length - 1).toBe(3945);
  });
});

describe('the one E3', () => {
  /**
   * **Nothing strikes one, and that is three rulings rather than a gap.** Spec
   * [00 · §3](../../docs/spec/00-tokens.md) gives the E3 to *"release, grab,
   * award, the checkered line"*, and the author has flown and refused the first
   * three.
   *
   * The release and the grab went first — *"the white dot that is emitted when I
   * grab is too noisy and too much... let's let the PLANET speak about our grab"*
   * — and the **award** followed the same evening, once M2.4 had put a flash
   * under the top word: *"there's a weird white-ish blur circle that appears when
   * I get 'perfect', in addition to the yellow one beneath the text. I don't like
   * that white one."* The word already blooms in its own tier colour, so a
   * CORE-white additive flash under a SOLAR word was two glows arguing about one
   * instant.
   *
   * What is left for it is the checkered line at the crossing, which is spec 12's
   * and M6's.
   */
  it('is never struck, over a whole run', () => {
    expect(RUN.length).toBeGreaterThan(2000);
    for (const view of RUN) expect(view.flash).toBeNull();
  });

  /**
   * The slot stays, and so does the machinery under it. Spec 00 §3 still gives
   * the E3 to the **award** and to the **checkered line**, and the rule that at
   * most one is alive is a shape rather than a check — one nullable field, so a
   * second has nowhere to be. This is what M2.4 will decay through.
   */
  it('is still a single slot the layer cannot double', () => {
    const view = RUN[GRAB]!;
    expect('flash' in view).toBe(true);
    const struck: PresentationState = {
      ...view,
      flash: { x: 1, y: 2, radius: E3_BLOOM, decay: { age: 0, span: E3_TICKS } },
    };
    // Placed by hand and then aged by the layer: it falls to nothing and ends,
    // which is what an award will do when M2.4 lights one.
    let carried = struck;
    const sim = openRun(
      parseDispatch(
        JSON.parse(readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8')),
      ).recipe,
    );
    for (let i = 0; i < E3_TICKS - 1; i++) carried = derive(carried, sim);
    expect(carried.flash).not.toBeNull();
    expect(carried.flash!.radius).toBeLessThan(E3_BLOOM);
    expect(derive(carried, sim).flash).toBeNull();
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
    expect(at(GRAB).craft.deformation).toEqual({ along: 1, across: 1, amount: 0, recovery: null });

    // The swing released on 258 is let go at the top of its envelope, so it earns
    // the whole of spec 02 §4's stretch and holds it half again as long — which
    // is where the **punch** lives since the camera's share of it was withdrawn.
    const struck = at(RELEASE).craft.deformation;
    expect(struck.amount).toBe(1);
    expect(struck.along).toBe(STRETCH_ALONG);
    expect(struck.across).toBe(STRETCH_ACROSS);
    expect(struck.recovery).toEqual({ age: 0, span: punchSpan(1) });
  });

  it('passes rest once on the way back, and is home again', () => {
    const shapes = [];
    for (let tick = RELEASE; tick <= RELEASE + punchSpan(1); tick++) {
      shapes.push(at(tick).craft.deformation);
    }

    // Spec 02 §4's own rebound: 0.95 against a 1.5 stretch, a tenth of the way
    // past rest. The board puts it at 83% of the return and this curve puts it
    // at 58%; the depth is the number, and the plan records the difference.
    const deepest = Math.min(...shapes.map((shape) => shape.along));
    expect(deepest).toBeCloseTo(0.95, 2);
    expect(shapes.filter((shape) => shape.along < 1).length).toBeGreaterThan(1);

    expect(at(RELEASE + punchSpan(1)).craft.deformation).toEqual({
      along: 1,
      across: 1,
      amount: 0,
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
  it('burn at E2 when held, and only glow at all when they are gripping', () => {
    const held = at(GRAB + 40);
    const lit = held.bodies.filter((body) => body.held);
    expect(lit.length).toBe(1);
    expect(lit[0]!.energy).toBe(2);
    expect(lit[0]!.bloom).toBe(bloomOf(2));

    for (const body of held.bodies.filter((body) => !body.held)) {
      expect(body.energy).toBe(body.state === 'SPENT' ? 0 : body.grip > EMIT_AT ? 1 : 0);
      expect(body.bloom).toBe(bloomOf(body.energy));
    }
  });

  /**
   * **The field ahead is dark, and that is the point.** Over a whole run the vast
   * majority of body-ticks carry no bloom at all — only a rim, which is spec 04
   * §3's *"constellation of dim coloured rings"*. M2.2 lit every one of them.
   */
  it('leaves almost the whole field unlit at any moment', () => {
    let lit = 0;
    let total = 0;
    for (const view of RUN) {
      for (const body of view.bodies) {
        total++;
        if (body.energy > 0) lit++;
      }
    }
    expect(lit / total).toBeLessThan(0.05);
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
    expect(arrived.craft.deformation.recovery).not.toBeNull();

    const opened = createPresentation(
      replayRun(
        parseDispatch(
          JSON.parse(readFileSync(new URL('../recipes/pilot-60s.json', import.meta.url), 'utf8')),
        ).recipe,
      ),
    );
    // The stretch is a fact about what happened on the tick rather than about the
    // tick, so a picture opened there does not have it.
    expect(opened.craft.deformation.recovery).toBeNull();

    // And the sharpest case is now the scoreboard: a run arrived at has spent
    // bodies behind it, and one opened at the same instant has none, because
    // *spent* is a record of releases nobody watching only this tick could know.
    const last = RUN.at(-1)!;
    expect(last.bodies.some((body) => body.state === 'SPENT')).toBe(true);
    expect(opened.bodies.every((body) => body.state !== 'SPENT')).toBe(true);
  });
});
