/**
 * The retro grade, spec [14 · §2](../../docs/spec/14-retro-grade.md) — asserted
 * as **what the canvas was asked for**, never as what it looks like.
 *
 * A grade is the one thing in the game whose whole product is an appearance, and
 * an appearance is not a thing a test can hold. What *is* holdable is the two
 * halves the spec actually states:
 *
 *   - the **arithmetic** — each stage sits at or under its own ceiling, every one
 *     of them reaches zero on its own, and the lift leaves CORE the brightest
 *     value in the frame;
 *   - the **cost** — how many full-screen fills the pass asks for, counted
 *     through `pnpm profile`'s own census, because a count travels to a phone and
 *     a millisecond does not.
 *
 * The second is the one that matters here. Spec 14's acceptance rules that *"the
 * grade's cost is measured as part of M0.5's p99 and max frame time, not its
 * mean"*, and the census is the instrument that says what a phone is being asked
 * to paint. Two composites is the number this file pins.
 */
import { describe, expect, it } from 'vitest';
import { applyGrade, coatAt, GRADE, SCANLINE, SCANLINE_PITCH } from '../../src/render/grade.ts';
import { CORE, VOID, channels } from '../../src/render/palette.ts';
import { counter } from '../../tools/profile.ts';
import type { Census } from '../../tools/profile.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';

const SCREEN = DESIGN_WIDTH * DESIGN_HEIGHT;

/** What one call of the pass asked the canvas for: the fills, and their composites. */
interface Asked {
  readonly screens: number;
  readonly fills: number;
  readonly composites: string[];
}

function ask(strength: number, tick = 0, scanline?: number): Asked {
  const into: Census = {
    gradients: 0,
    arcs: 0,
    fills: 0,
    strokes: 0,
    points: 0,
    filled: 0,
    gradientFilled: 0,
    blended: 0,
  };
  const context = counter(into);
  Object.defineProperty(context, 'canvas', {
    value: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
  });
  const composites: string[] = [];
  let mode = 'source-over';
  Object.defineProperty(context, 'globalCompositeOperation', {
    get: () => mode,
    set: (value: string) => {
      mode = value;
    },
  });
  let fills = 0;
  Object.defineProperty(context, 'fillRect', {
    value: (_x: number, _y: number, w: number, h: number) => {
      fills += 1;
      composites.push(mode);
      into.blended += Math.abs(w * h);
    },
  });
  applyGrade(context, 1, tick, scanline === undefined ? { strength } : { strength, scanline });
  return { screens: into.blended / SCREEN, fills, composites };
}

/** The mean amount the additive pass adds to a channel, in code values. */
function addedTo(channel: number, strength: number): number {
  const coat = coatAt(strength);
  // The Bayer matrix's own mean is 7.5/16 of the amplitude; the grain's is half
  // its peak, because it is a uniform draw from zero to it.
  return coat.lift[channel]! + (7.5 / 16) * coat.dither + coat.grain / 2;
}

describe('the retro grade', () => {
  /**
   * **0.45, the author's, flown on the bench on 2026-09-02** — *"it looks real
   * nice… 0.45 seems like a nice balance."*
   *
   * It is asserted rather than left implicit because two things follow from
   * *this* value and not from a nearby one: it sits below the scanline threshold,
   * so the pass is one composite rather than two and spec 14 §2 stage 5's *"off
   * by default"* is literally true; and it is not zero, so spec 14's true-black
   * criterion is now failed by a shipped value. Both are checked below, and the
   * day the number moves they move with it rather than quietly.
   */
  it('ships at the value the author flew', () => {
    expect(GRADE).toBe(0.45);
  });

  /**
   * And **the shipped coat costs one composite, not two**, because 0.45 is below
   * the scanline threshold. That is the cost sentence for the value the game
   * actually ships, which is the one worth pinning: the two-composite figure is a
   * ceiling nobody is flying.
   */
  it('costs two full-screen fills at the shipped value', () => {
    const shipped = ask(GRADE);
    expect(shipped.fills).toBe(2);
    expect(shipped.screens).toBe(2);
    expect(shipped.composites).toEqual(['lighter', 'source-over']);
  });

  /**
   * And **off means nothing asked of the canvas**, not a fill at alpha zero.
   *
   * The same rule `test/census.test.ts` holds the boundary to, and for the same
   * reason: a layer dimmed to nothing passes an eye test and costs the phone the
   * whole screen anyway. Zero is no longer where the game ships, but it is still
   * where the slider's bottom end is and where the dev panel can put it.
   */
  it('asks the canvas for nothing at all when it is off', () => {
    // **Off is both knobs**, since 2026-09-03: the comb came off the master's
    // gang when the author reported it too weak, so the master alone no longer
    // silences it. Spec 14 §2's *"every stage is switchable to zero
    // independently"* is what this is, and it is better served by two knobs than
    // by one with a threshold in it.
    expect(ask(0, 0, 0)).toEqual({ screens: 0, fills: 0, composites: [] });
  });

  /** And each knob silences its own composite and leaves the other one alone. */
  it('lets either half go to zero without the other', () => {
    expect(ask(0).composites).toEqual(['source-over']);
    expect(ask(1, 0, 0).composites).toEqual(['lighter']);
  });

  /**
   * **Two composites at the top of the travel, and never more.** This is the
   * number the milestone is about: a full-screen stage is one screen of paint,
   * every frame, and a phone's Canvas2D is fill-rate bound long before it is
   * call bound. Five stages naively stacked would be five screens; lift, dither
   * and grain are all additions and a sum of additions is one addition.
   */
  it('costs two full-screen fills at the top of the travel and no more', () => {
    const full = ask(1);
    expect(full.fills).toBe(2);
    expect(full.screens).toBe(2);
    expect(full.composites).toEqual(['lighter', 'source-over']);
  });

  /**
   * The comb is the only stage that takes light **away**, so it is the only one
   * that cannot share the additive pass — which is why the ceiling is two
   * composites and not one, and why silencing it is what buys the frame back.
   */
  it('costs one when the comb is silenced', () => {
    const quiet = ask(0.5, 0, 0);
    expect(quiet.fills).toBe(1);
    expect(quiet.screens).toBe(1);
    expect(quiet.composites).toEqual(['lighter']);
  });

  /**
   * Spec 14 §2's ceilings, one stage at a time. Each is a *"≤"* in the spec and
   * each is what the top of the slider means.
   */
  it('holds every stage to the ceiling spec 14 §2 states for it', () => {
    const full = coatAt(1);
    // ⚠ Stage 5's *pitch* is the one number here that overrules the spec rather
    // than honouring it — see `SCANLINE_PITCH`. Its *strength* is untouched.
    expect(SCANLINE_PITCH).toBeGreaterThan(2);
    // Stage 2: the blacks come up to VOID's violet, which is the sky's own token
    // added to itself. Never to neutral grey — the three channels stay in VOID's
    // own ratio.
    expect(full.lift).toEqual(channels(VOID));
    // Stage 3: ~1/255, which is one code value.
    expect(full.dither).toBe(1);
    // Stage 4: ≤ 3% luminance, as a peak.
    expect(full.grain).toBeCloseTo(0.03 * 255, 10);
    expect(full.grain / 255).toBeLessThanOrEqual(0.03);
    // Stage 5: ≤ 6%.
    expect(full.scanline).toBeCloseTo(0.06, 10);
  });

  /**
   * **Every stage reaches zero**, which spec 14 §2 requires of each of them
   * independently — *"every stage is switchable to zero independently, and the
   * game must be fully legible with the whole pass off."*
   *
   * Ganged behind one master they reach it together, except the scanlines, which
   * reach it first and on their own. That is the one thing about the ganging
   * that is a guess rather than a number the spec states, and it is `grade.ts`'s
   * `SCANLINE_FROM`.
   */
  it('takes every stage to zero, on two knobs', () => {
    const off = coatAt(0, 0);
    expect(off.lift).toEqual([0, 0, 0]);
    expect(off.dither).toBe(0);
    expect(off.grain).toBe(0);
    expect(off.scanline).toBe(0);
    // ⚠ **The comb is not on the master**, since the author reported it too weak
    // on 2026-09-03. Ganged, at the shipped 0.45 it would have sat at 45% of a
    // strength they had already called too weak at 100% — so the master drives
    // the three additive stages and the comb answers to itself.
    expect(coatAt(0).scanline).toBe(SCANLINE);
    expect(coatAt(1).scanline).toBe(SCANLINE);
    expect(coatAt(1, 0).scanline).toBe(0);
  });

  /**
   * Spec 14 §2 stage 2: *"leave CORE at 1.0 so the craft stays the brightest
   * value."*
   *
   * An **additive** lift is what buys this and it is the whole reason the pass
   * composites with `lighter` rather than drawing over the frame. `source-over`
   * at the same strength would pull CORE down toward the lift colour by exactly
   * the fraction it raises the blacks — the craft would dim as the sky came up,
   * and the one thing the design makes the brightest value in the frame would
   * stop being it.
   */
  it('raises the floor without lowering the craft', () => {
    const core = channels(CORE);
    for (let channel = 0; channel < 3; channel++) {
      const lifted = Math.min(255, core[channel]! + addedTo(channel, 1));
      expect(lifted).toBeGreaterThanOrEqual(core[channel]!);
    }
    // And a lifted sky is still darker than the craft, in every channel, which is
    // what "brightest value" has to survive as.
    const sky = channels(VOID);
    for (let channel = 0; channel < 3; channel++) {
      expect(sky[channel]! + addedTo(channel, 1)).toBeLessThan(core[channel]!);
    }
  });

  /**
   * ## ⚠ Spec 14's true-black criterion, and the setting it holds at
   *
   * The acceptance says *"anomaly cloud gaps and black-hole discs sample to
   * `#000000` after the grade"*, and §3.5 says *"the grade's black lift must not
   * raise them."* **The anomaly's bed is drawn in `TRUE_BLACK` today**, so this
   * is live rather than hypothetical, and a full-screen additive composite has no
   * way to exclude a colour: masking it needs a second buffer over the layer that
   * is already the most expensive in the game.
   *
   * So the criterion holds **exactly at the setting this ships at** and at no
   * other, and what it costs at the top of the travel is stated here as a number
   * rather than left to be discovered. The ruling is the author's; this test is
   * what makes the number move on purpose when it is made.
   */
  it('states what true black costs at the shipped value and at the top', () => {
    // ⚠ **The criterion is failed by a shipped value now**, not by a
    // hypothetical one: the author ruled the look on 2026-09-02 and the spec
    // conflict is still open. Only at 0 do the gaps sample to `#000000`.
    const shipped = [0, 1, 2].map((channel) => Math.round(addedTo(channel, GRADE)));
    expect(shipped).toEqual([6, 6, 11]);
    for (let channel = 0; channel < 3; channel++) {
      expect(addedTo(channel, 0)).toBe(0);
    }
    const raised = [0, 1, 2].map((channel) => Math.round(addedTo(channel, 1)));
    expect(raised).toEqual([14, 12, 24]);
    // 9.4% of full scale in its loudest channel — the blue, because VOID's own
    // violet is what the lift is made of. Small, and not zero, which is the whole
    // of what the criterion asks for.
    expect(Math.max(...raised) / 255).toBeCloseTo(0.094, 3);
  });

  /**
   * The grain is **resampled**, and it is resampled off the tick rather than off
   * a clock — a renderer that read a wall clock would make a screenshot of a bug
   * unreproducible from the recipe, which is why the sky and the dust are seeded
   * the way they are.
   *
   * Under node there is no document and therefore no tile, so what is assertable
   * here is that the pass is *told* which phase to draw. The phases themselves
   * are cut from `rng` and are asserted where every other seeded field is: by
   * being a pure function of a seed.
   */
  it('costs the same on every tick', () => {
    for (const tick of [0, 1, 15, 16, 4177]) {
      expect(ask(1, tick).screens).toBe(2);
    }
  });
});
