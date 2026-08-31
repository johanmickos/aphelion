/**
 * [M2.1](../../docs/plan/m2-the-instrument.md)'s acceptance, in the words it is
 * written in: *"presentation state is derived per tick, is pure, passes the
 * portability check, and a frame is a function of `(recipe, tick)`"*, verified
 * by *"a test asserting derived values at named ticks with no canvas involved."*
 *
 * The ticks are the ones `pnpm replay` prints for the run this repo ships — the
 * same file, the same seed, the same swings — so a number here and a number in
 * that terminal output are the same number, and a disagreement about the picture
 * is a disagreement about a tick that both sides can fly.
 *
 * Since 2026-08-31 they are **found rather than named**, which is
 * [`test/moments.ts`](../moments.ts) and carries its own argument. A `describe`
 * block below is titled with the ticks its moment turned out to land on, so a
 * red test still says where to point `pnpm replay` — and a physics change moves
 * those ticks without editing a line here.
 *
 * **Asking a claim of every instance rather than of one restated two of them**,
 * and both are worth reading: a grab does not *strike* a deformation, rather
 * than finding the craft at rest, and a spent body is dark only once it has
 * finished going out. Both were true of the single tick each was pinned to and
 * false of the run.
 *
 * **No canvas, and no renderer**: nothing under `src/render/` is imported below,
 * which is what the acceptance means and what makes ADR-0006's promise worth
 * having.
 */
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { punchSpan } from '../../src/state/punch.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { EMIT_AT } from '../../src/state/body.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from '../../src/state/energy.ts';
import type { PresentationState } from '../../src/state/types.ts';
import {
  each,
  grabTicks,
  heading,
  held,
  releasesWhere,
  shippedRecipe,
  shippedRun,
  ticksWhere,
} from '../moments.ts';

const RECIPE = shippedRecipe();
const RUN = shippedRun();

/** The picture on a named tick. They are indices because tick zero is index zero. */
const at = (tick: number): PresentationState => {
  const view = RUN[tick]!;
  expect(view.tick).toBe(tick);
  return view;
};

/**
 * **The moments this file is about, found rather than named** —
 * [`test/moments.ts`](../moments.ts) carries the argument. Every tick below used
 * to be a literal that a physics change re-pinned by hand.
 */
const GRABS = grabTicks(RUN);

/** A grab the craft was still holding forty ticks later, which is a body lit and gripping. */
const STILL_HELD = ticksWhere(
  RUN,
  'a grab the craft is still holding forty ticks later',
  (view, before, tick) => !held(before) && held(view) && held(RUN[tick + 40] ?? view),
);

/**
 * A swing let go at the very top of its boost envelope. The quality a release
 * pays the punch with **is** the envelope on the tick before it, so this is the
 * moment spec 02 §4's whole stretch is owed on.
 */
const FULL_BOOST = releasesWhere(
  RUN,
  'a swing let go at the very top of its boost envelope',
  (_view, before) => before.compass!.envelope === 1,
);

describe('the run pnpm replay ships', () => {
  /**
   * **Two readings agreeing, rather than a number written twice.** The run's
   * length used to be a literal here and in `goldens.test.ts`, which meant a
   * re-record edited it in two places to say one thing. What is asserted now is
   * that the picture was derived for every tick the recipe records — so it still
   * fails if the run dies early inside its own log, which is the fault the
   * literal was there to catch.
   */
  it('is the run the trail prints, to the last tick of its log', () => {
    expect(RUN.length - 1).toBe(RECIPE.ticks);
    expect(RUN.at(-1)!.tick).toBe(RECIPE.ticks);
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
    const view = RUN[GRABS[0]!]!;
    expect('flash' in view).toBe(true);
    const struck: PresentationState = {
      ...view,
      flash: { x: 1, y: 2, radius: E3_BLOOM, decay: { age: 0, span: E3_TICKS } },
    };
    // Placed by hand and then aged by the layer: it falls to nothing and ends,
    // which is what an award will do when M2.4 lights one.
    let carried = struck;
    const sim = openRun(RECIPE);
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
});

describe(heading(FULL_BOOST), () => {
  /**
   * Spec [02 · §4](../../docs/spec/02-release.md): the craft leaves stretched
   * 1.5 along the velocity vector and 0.7 across it, and recovers with one
   * overshoot. Dated from the release tick rather than from `T+70ms`, because
   * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
   * withdrew the freeze that offset was measured from and the file's own notice
   * says every such offset becomes `T0`.
   */
  it('is stretched by the release and not by the grab', () => {
    // **Every grab in the run, and the claim had to be restated to survive it.**
    // Written as *the craft is at rest at a grab* this passed on tick 113 and is
    // false: eight of this run's twenty-nine grabs land while the craft is still
    // coming home from the **previous** release's punch, one of them a single
    // tick after it. What a grab must not do is **strike** a deformation, which
    // is ADR-0012's withdrawn hitstop coming back through the other door — so
    // what is asserted is that no recovery is ever *born* on a grab.
    let inherited = 0;
    for (const tick of each({ what: 'a grab', ticks: GRABS }, 5)) {
      const shape = at(tick).craft.deformation;
      if (shape.recovery === null) {
        expect(shape).toEqual({ along: 1, across: 1, amount: 0, recovery: null });
      } else {
        expect(shape.recovery.age).toBeGreaterThan(0);
        inherited++;
      }
    }
    // And the case that restated it is really in the run, so a fixture that
    // stopped containing it would say so rather than quietly weakening this.
    expect(inherited).toBeGreaterThan(0);

    // A swing let go at the top of its envelope earns the whole of spec 02 §4's
    // stretch and holds it half again as long — which is where the **punch**
    // lives since the camera's share of it was withdrawn.
    for (const tick of each(FULL_BOOST)) {
      const struck = at(tick).craft.deformation;
      expect(struck.amount).toBe(1);
      expect(struck.along).toBe(STRETCH_ALONG);
      expect(struck.across).toBe(STRETCH_ACROSS);
      expect(struck.recovery).toEqual({ age: 0, span: punchSpan(1) });
    }
  });

  it('passes rest once on the way back, and is home again', () => {
    for (const release of each(FULL_BOOST)) {
      const shapes = [];
      for (let tick = release; tick <= release + punchSpan(1); tick++) {
        shapes.push(at(tick).craft.deformation);
      }

      // Spec 02 §4's own rebound is **a tenth of the displacement** past rest —
      // the board draws 0.95 against a 1.5 stretch, and `OVERSHOOT_FROM` is chosen
      // to reproduce that fraction rather than that number. So what is asserted is
      // the fraction, which is what survived the stretch being deepened on
      // 2026-08-30: at 1.75 the same tenth lands at 0.925. The board puts the
      // deepest point at 83% of the return and this curve puts it at 58%; the depth
      // is the number, and the plan records the difference.
      const deepest = Math.min(...shapes.map((shape) => shape.along));
      expect(1 - deepest).toBeCloseTo((STRETCH_ALONG - 1) / 10, 2);
      expect(shapes.filter((shape) => shape.along < 1).length).toBeGreaterThan(1);

      expect(at(release + punchSpan(1)).craft.deformation).toEqual({
        along: 1,
        across: 1,
        amount: 0,
        recovery: null,
      });
    }
  });
});

describe(`the bodies · ${heading(STILL_HELD)}`, () => {
  /**
   * Spec 00 §3 puts a held body at E2 and a body's rim at E1, and the spec
   * README's ruling is that *"a held body is E2 and alive, and goes DUSK only
   * after release"*. The E0 a spent body drops to needs a memory of what has
   * been released and is [M2.2](../../docs/plan/m2-the-instrument.md)'s.
   */
  it('burn at E2 when held, and only glow at all when they are gripping', () => {
    for (const tick of each(STILL_HELD, 5)) {
      const held = at(tick + 40);
      const lit = held.bodies.filter((body) => body.held);
      expect(lit.length).toBe(1);
      expect(lit[0]!.energy).toBe(2);
      expect(lit[0]!.bloom).toBe(bloomOf(2));

      // **And a body that is not held is dark, unless it is still going out.**
      // Written as *SPENT is E0* this passed on tick 153 and is false: the lamp
      // goes out at the release over `SPEND_TICKS`, so for 210ms afterwards a
      // spent body is still burning at the E2 it was held at. Asked of every
      // grab in the run rather than of one, that case turns up on the fourth.
      for (const body of held.bodies.filter((body) => !body.held)) {
        const expected =
          body.spending !== null ? 2 : body.state === 'SPENT' ? 0 : body.grip > EMIT_AT ? 1 : 0;
        expect(body.energy).toBe(expected);
        expect(body.bloom).toBe(bloomOf(body.energy));
        // And it goes out over **13** ticks, written down rather than taken from
        // `SPEND_TICKS`: indexing by the constant under test moves the
        // expectation with it, which is `goldens.test.ts`'s own rule and was
        // open here — lengthening the spend to 400ms passed until 2026-08-31.
        if (body.spending !== null) expect(body.spending.span).toBe(13);
      }
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
   * derived twice is the same picture at every tick of the run — energies,
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
    const arrived = at(each(FULL_BOOST)[0]!);
    expect(arrived.craft.deformation.recovery).not.toBeNull();

    const opened = createPresentation(replayRun(RECIPE));
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
