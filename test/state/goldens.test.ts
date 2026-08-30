/**
 * [M2.5](../../docs/plan/m2-the-instrument.md)'s acceptance: *"assert derived
 * presentation values at named ticks across a recorded recipe... a regression in
 * any choreography fails a test. No canvas, no PNG diffing."*
 *
 * The recipe is the one this repo ships and `pnpm replay` flies with no
 * argument, so **a number here and a number in that terminal output are the same
 * number**. Every tick named below is a tick the author can fly.
 *
 * ## Why the values are written out rather than snapshotted
 *
 * A digest of the whole stream would catch every regression and explain none of
 * them: it fails as one opaque hash, and the fix for a deliberate change is to
 * accept the new hash, which is not a review. What is written below is what the
 * picture *is* at each moment — a tier, a displacement, a span, a count of
 * stretches — so a failure says which element moved and a deliberate change
 * requires editing the sentence that describes it.
 *
 * The exception is [`the shape of the run`](#), which is a list of ticks. That
 * one is deliberately a wall of numbers, because its job is to fail loudly if
 * the *simulation* moves underneath the picture — and if it does, `SIM_VERSION`
 * and `test/sim/version.test.ts` will have failed first and said so better.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { BOOST_ARM_TICKS, BOOST_PLATEAU_TICKS, BOOST_ZERO_TICKS } from '../../src/sim/units.ts';
import { RINGS } from '../../src/sim/compass.ts';
import {
  CALLOUT_DECAY_TICKS,
  calloutTicks,
  LINGER_TICKS,
  POP_RISE,
  POP_TICKS,
} from '../../src/state/callout.ts';
import { subjectOf } from '../../src/state/camera.ts';
import { DEFORM_TICKS, STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from '../../src/state/energy.ts';
import { FAREWELL_SPREAD, FAREWELL_TICKS } from '../../src/state/farewell.ts';
import { PUNCH_GRAB, PUNCH_RELEASE, PUNCH_STRETCH, PUNCH_TICKS } from '../../src/state/punch.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';

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

/** The picture on a named tick. Indices are ticks, because tick zero is index zero. */
const at = (tick: number): PresentationState => {
  const view = RUN[tick]!;
  expect(view.tick).toBe(tick);
  return view;
};

const held = (view: PresentationState): boolean => view.bodies.some((body) => body.held);

const edges = (kind: 'grab' | 'release'): number[] => {
  const out: number[] = [];
  for (let i = 1; i < RUN.length; i++) {
    const was = held(RUN[i - 1]!);
    const now = held(RUN[i]!);
    if (kind === 'grab' ? !was && now : was && !now) out.push(i);
  }
  return out;
};

/**
 * **The numbers themselves, against the specs that fix them.**
 *
 * Every tick named in this file is written as a literal rather than as the
 * constant that produced it, and this block is why: a golden that indexes by the
 * constant it is testing cannot catch a change to that constant — it moves the
 * expectation and the fixture together and passes. Found by mutating each one and
 * watching the file stay green, which is the only way that class of gap ever
 * shows up.
 *
 * So the ticks below are the arithmetic, once, in one place.
 */
describe('the numbers the choreography is built from', () => {
  it('are the ones the specs fix', () => {
    // Spec 02 §5, at three design units per board pixel (ADR-0010).
    expect(PUNCH_RELEASE).toBe(18);
    expect(PUNCH_GRAB).toBe(9);
    expect(PUNCH_TICKS).toBe(11); // 180ms
    expect(PUNCH_STRETCH).toBe(0.5); // ADR-0012's "half again as long"
    // Spec 02 §4.
    expect(DEFORM_TICKS).toBe(11); // 180ms
    expect(STRETCH_ALONG).toBe(1.5);
    expect(STRETCH_ACROSS).toBe(0.7);
    // Spec 02 §2 and §6.
    expect(FAREWELL_TICKS).toBe(24); // 400ms
    expect(FAREWELL_SPREAD).toBe(1.6); // an opening position, and on the bench
    // Spec 06 §4.
    expect(POP_TICKS).toBe(7); // 120ms
    expect(POP_RISE).toBe(90); // ~30px
    expect(LINGER_TICKS).toBe(72); // 1.2s — the one two specs disagree about
    expect(CALLOUT_DECAY_TICKS).toBe(24); // 400ms
    expect(calloutTicks()).toBe(103);
    // Spec 00 §3, and spec 00 §6's ring count, ruled to three on 2026-08-29.
    expect(E3_TICKS).toBe(24);
    expect(E3_BLOOM).toBe(144);
    expect(RINGS).toBe(3);
    // Spec 01 §7's envelope, which the flown arc is cut on.
    expect(BOOST_ARM_TICKS).toBe(27); // 0.45s
    expect(BOOST_PLATEAU_TICKS).toBe(72); // 1.2s, and the settle's end
    expect(BOOST_ZERO_TICKS).toBe(156); // 2.6s
  });
});

describe('the shape of the run', () => {
  /**
   * Twenty-three releases and twenty-four grabs, on these ticks. If this fails
   * and `test/sim/version.test.ts` did not, the *picture* has started disagreeing
   * with the simulation about when a swing began or ended — which is the one
   * thing the middle layer must never do.
   */
  it('grabs and releases on the ticks pnpm replay prints', () => {
    expect(RUN.length - 1).toBe(2775);
    expect(edges('grab')).toEqual([
      74, 294, 351, 404, 452, 487, 524, 559, 612, 659, 868, 978, 1108, 1241, 1385, 1536, 1688, 1845,
      2004, 2189, 2331, 2375, 2425, 2520,
    ]);
    expect(edges('release')).toEqual([
      258, 310, 372, 422, 461, 498, 536, 584, 656, 867, 977, 1107, 1239, 1384, 1535, 1687, 1844,
      2003, 2164, 2302, 2356, 2399, 2489,
    ]);
  });
});

/**
 * **The first swing, and the best one in the run.** Grabbed on 74, frozen on 188,
 * released on 258 — seventy ticks past the freeze, which is inside the plateau,
 * so the envelope is exactly 1 and the punch is at its full 18 design units.
 */
const FREEZE = 188;
const RELEASE = 258;

describe('the release at 258 · a swing let go at full boost', () => {
  it('is at the top of its envelope on the tick before', () => {
    expect(at(RELEASE - 1).compass!.envelope).toBe(1);
  });

  /** Spec 02 §5's 6px, converted, and its span half again as long at full quality. */
  it('punches the view 18 design units along the exit tangent, for 17 ticks', () => {
    const punch = at(RELEASE).camera.punch!;
    expect(Math.hypot(punch.x, punch.y)).toBeCloseTo(18, 9);
    expect(punch.decay.span).toBe(17);
    expect(punch.decay.age).toBe(0);
    // Home on the seventeenth tick, and the view back on the centreline with it.
    expect(at(RELEASE + 16).camera.punch).not.toBeNull();
    expect(at(RELEASE + 17).camera.punch).toBeNull();
    expect(at(RELEASE + 17).camera.x).toBe(DESIGN_WIDTH / 2);
  });

  /** Spec 02 §4, dated from `T0` — the whole point of the rebase. */
  it('stretches the craft on the release tick and recovers it by T+180ms', () => {
    expect(at(RELEASE).craft.deformation.along).toBeCloseTo(1.5, 9);
    expect(at(RELEASE).craft.deformation.across).toBeCloseTo(0.7, 9);
    expect(at(RELEASE + 10).craft.deformation.recovery).not.toBeNull();
    expect(at(RELEASE + 11).craft.deformation.recovery).toBeNull();
  });

  /** Spec 02 §6's farewell ring: placed at 1.0 and expanding away over 400ms. */
  it('detaches the orbit and expands it away over 400ms', () => {
    expect(at(RELEASE).farewell!.spread).toBe(1);
    expect(at(RELEASE + 1).farewell!.spread).toBeCloseTo(1.025, 3);
    expect(at(RELEASE + 17).farewell!.spread).toBeCloseTo(1.425, 3);
    expect(at(RELEASE + 23).farewell).not.toBeNull();
    expect(at(RELEASE + 24).farewell).toBeNull();
  });

  /** Spec 06 §4's word, born at the dot and lit through its pop and linger. */
  it('says TRUE at the dot, pops it, and holds it lit', () => {
    expect(at(RELEASE).callout!.tier).toBe('TRUE');
    expect(at(RELEASE).callout!.life.age).toBe(0);
    expect(at(RELEASE).callout!.y).toBe(at(RELEASE).callout!.bornY);
    // Risen by the end of the pop — 30 design px, converted — and still at full
    // light. The rise is asserted as a distance rather than as *less than where it
    // started*, so a pop that stopped moving would fail rather than pass quietly.
    expect(at(RELEASE).callout!.bornY - at(RELEASE + 7).callout!.y).toBeCloseTo(90, 6);
    expect(at(RELEASE + 7).callout!.strength).toBe(1);
    expect(at(RELEASE + 24).callout!.strength).toBe(1);
  });

  /** The instrument leaves over 100ms, which is M2.3's ruling and is untouched. */
  it('takes the compass with it inside 100ms', () => {
    expect(at(RELEASE).compass).not.toBeNull();
    // Unused rings die instantly — spec 02 §6, *"no fade"*.
    expect(at(RELEASE).compass!.rings).toEqual([]);
    expect(at(RELEASE + 5).compass).not.toBeNull();
    expect(at(RELEASE + 6).compass).toBeNull();
  });
});

/**
 * **The release at 310, which is the whole game in one tick.**
 *
 * Frozen on 309 and let go on 310 — one tick later. The aim is **PERFECT** and
 * the envelope is **exactly zero**: the best word in the game, and not one unit
 * of boost to go with it. Spec [01 · §11](../../docs/spec/01-swing.md)'s tension
 * is that the two wanted different moments, and this is a release that took one
 * and paid the whole price of the other.
 */
describe('the release at 310 · perfect aim, no boost at all', () => {
  it('earns the top word on an envelope of zero', () => {
    expect(at(309).compass!.envelope).toBe(0);
    expect(at(310).callout!.tier).toBe('PERFECT');
  });

  /**
   * *"A tap pays nothing, structurally rather than by a guard"* (ADR-0012) — at
   * zero quality there is no punch to place, and nothing had to check for it.
   */
  it('lands no punch, because there was no quality to scale one by', () => {
    expect(at(310).camera.punch).toBeNull();
    expect(at(310).camera.x).toBe(DESIGN_WIDTH / 2);
  });

  /**
   * And the word is graded on aim alone, so it is undimmed by the timing. Spec
   * 06's acceptance: *"grading is a pure function of `(d, W)` and imports nothing
   * from the economy."*
   */
  it('still strikes the E3, because PERFECT is E3 whatever the boost was', () => {
    const flash = at(310).flash!;
    expect(flash.decay.age).toBe(0);
    expect(flash.decay.span).toBe(24);
    expect(flash.radius).toBe(144);
    // At the dot that earned it, which is where the word is standing.
    expect(flash.x).toBe(at(310).callout!.bornX);
    expect(flash.y).toBe(at(310).callout!.bornY);
  });
});

describe('the flown arc · the boost envelope, drawn', () => {
  /**
   * At the freeze there is nothing to draw: the envelope's clock starts here, so
   * an arc drawn before it would be saying something about a boost that does not
   * exist yet.
   */
  it('is empty at the freeze and grows a stretch at a time', () => {
    expect(at(FREEZE).compass!.flown).toEqual([]);
    expect(at(FREEZE).compass!.envelope).toBe(0);
    expect(at(FREEZE).compass!.arming).toHaveLength(1);

    // Twelve ticks in: the ramp is 12/27 of the way up and three stretches wide.
    expect(at(200).compass!.envelope).toBeCloseTo(12 / 27, 9);
    expect(at(200).compass!.flown).toHaveLength(3);
    expect(at(200).compass!.arming).toHaveLength(13);
  });

  /**
   * **The ramp's stretches are not equal, and that is the measurement the latch
   * exists for.** The craft leaves periapsis at its fastest and slows on the way
   * out, so equal slices of *time* are unequal slices of *arc* — here they shrink
   * from 0.565 to 0.161 radians, a factor of **3.5** across one ramp. Shading the
   * ramp evenly along the arc instead is wrong by 0.19 of the envelope's range,
   * and wrong in the direction that says the boost armed sooner than it did.
   */
  it('cuts the ramp on the clock and not on the arc', () => {
    const flown = at(240).compass!.flown;
    expect(flown).toHaveLength(7);

    const ramp = flown.slice(0, 6);
    // Six stretches climbing 0 → 1 in equal steps of the envelope's own value…
    expect(ramp.map((run) => Number(run.to.toFixed(3)))).toEqual([
      0.185, 0.333, 0.519, 0.667, 0.852, 1,
    ]);
    expect(ramp[0]!.at).toBe(0);
    // …across steadily shorter arcs, because the craft is slowing.
    const spans = ramp.map((run) => Math.abs(run.span));
    expect(spans[0]!).toBeCloseTo(0.5653, 3);
    expect(spans[5]!).toBeCloseTo(0.1609, 3);
    expect(spans[0]! / spans[5]!).toBeGreaterThan(3);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!).toBeLessThan(spans[0]!);

    // And the plateau is one stretch at full, because it does not vary.
    expect(flown[6]!.at).toBe(1);
    expect(flown[6]!.to).toBe(1);
  });

  /**
   * The stretches join end to end and finish under the craft, which is what makes
   * the arc a strip chart rather than a scatter of marks: the bright end is where
   * the eye already is.
   */
  it('runs unbroken from the freeze to the hand', () => {
    const compass = at(240).compass!;
    const flown = compass.flown;
    for (let i = 1; i < flown.length; i++) {
      expect(flown[i]!.from).toBeCloseTo(flown[i - 1]!.from + flown[i - 1]!.span, 9);
    }
    const last = flown[flown.length - 1]!;
    expect(last.from + last.span).toBeCloseTo(compass.hand!, 9);
  });

  it('grows through the settle', () => {
    const swept = [200, 215, 240, 250, RELEASE - 1].map((tick) => at(tick).compass!.swept);
    for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);
    expect(swept[swept.length - 1]!).toBeCloseTo(4.541, 3);
  });

  /**
   * **And past it, which it did not before M2.4.** The compass read `orbit.phase`,
   * and that stops advancing at the settle's end because it is the datum the
   * closed form is measured from — so the drawn arc froze at 1.2s while the craft
   * kept going round it.
   *
   * It has to be asserted **here** and not on the first swing: that one freezes on
   * 188 and is let go on 258, which is inside its own 72-tick settle, so every
   * tick of it grows either way. The swing frozen on **2221** is the only one in
   * this run held past its settle — 81 ticks — and the only place the bug is
   * visible at all. That is worth knowing: a golden written on the most convenient
   * swing would have passed with the fault back in.
   */
  it('keeps growing past the settle', () => {
    // 2221 + 72 = 2293, so these four ticks are all in closed-form territory.
    const swept = [2294, 2297, 2300, 2301].map((tick) => at(tick).compass!.swept);
    for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);
    // And the envelope is decaying by then, which is the other half of the same
    // fact: past the settle there is a stretch of arc the boost is dying along.
    expect(at(2301).compass!.envelope).toBeLessThan(1);
    expect(at(2301).compass!.envelope).toBeGreaterThan(0);
    expect(at(2301).compass!.flown.length).toBeGreaterThan(7);
  });
});

describe('the ring count, ruled to three on 2026-08-29', () => {
  /**
   * *"Four is a bit unwieldy and makes it hard to decide where to go next"*
   * (author). It is a **cap** and not a promise — a body near the top of the field
   * has fewer than three others inside aim range — so what is asserted is the
   * ceiling over the whole run, and that the ceiling is actually reached.
   */
  it('never draws more than three rings, and does draw three', () => {
    let most = 0;
    for (const view of RUN) {
      if (view.compass === null) continue;
      expect(view.compass.rings.length).toBeLessThanOrEqual(3);
      most = Math.max(most, view.compass.rings.length);
    }
    expect(most).toBe(3);
  });
});

describe('which word is alive when', () => {
  /**
   * **One slot, and a new release takes it.** The TRUE struck on 258 is 52 ticks
   * into its 103 when the PERFECT lands on 310, so the two overlap — and there is
   * still exactly one word, because spec 06 §4 makes queueing structural: *"one
   * release, one word."*
   */
  it('is one word, and a later release replaces an earlier one still lit', () => {
    expect(at(309).callout!.tier).toBe('TRUE');
    expect(at(309).callout!.life.age).toBe(51);
    expect(at(310).callout!.tier).toBe('PERFECT');
    expect(at(310).callout!.life.age).toBe(0);
  });

  /** A make is carried and speaks nothing — spec 06 §2's *"points only"*. */
  it('carries a make without spending a word on it', () => {
    expect(at(372).callout!.tier).toBe('MAKE');
    expect(at(372).flash).toBeNull();
  });

  /** And it outlives the rest of the sequence, world-anchored, being left behind. */
  it('is the only thing still alive 400ms after a release', () => {
    const settled = at(RELEASE + 24);
    expect(settled.farewell).toBeNull();
    expect(settled.camera.punch).toBeNull();
    expect(settled.compass).toBeNull();
    expect(settled.craft.deformation.recovery).toBeNull();
    expect(settled.callout).not.toBeNull();
  });

  /**
   * And it ends on its own clock — asserted on the release at **1384**, one of the
   * seven in this run with no other release inside its lifetime: the next is 151
   * ticks later, against a word that lives 103. The first nine swings all overlap,
   * which is spec 06 §3's merge rule waiting for the streaks that will need it.
   */
  it('ends 1 720ms after the release that earned it', () => {
    expect(at(1384).callout!.tier).toBe('TRUE');
    expect(at(1384).callout!.life.age).toBe(0);
    expect(at(1384 + 102).callout).not.toBeNull();
    expect(at(1384 + 102).callout!.strength).toBeLessThan(0.05);
    expect(at(1384 + 103).callout).toBeNull();
  });

  /**
   * Over the whole run: twenty-three releases, three of them PERFECT, and the E3
   * is struck exactly three times. Spec 00 §3's *"at most one E3 alive"* is a
   * shape rather than a check, and this is what the shape produces.
   */
  it('strikes the E3 once per PERFECT and never otherwise', () => {
    const perfects = edges('release').filter((tick) => at(tick).callout?.tier === 'PERFECT');
    expect(perfects).toEqual([310, 422, 1239]);
    const struck = RUN.filter((view) => view.flash?.decay.age === 0);
    expect(struck).toHaveLength(perfects.length);
  });
});

describe('the camera, over the whole run', () => {
  /** The rule this milestone had to be careful with, asserted over 2 775 ticks. */
  it('follows the centreline on every tick, and the punch is the only thing off it', () => {
    let displaced = 0;
    for (const view of RUN) {
      expect(subjectOf(view.camera).x).toBe(DESIGN_WIDTH / 2);
      if (view.camera.x === DESIGN_WIDTH / 2) continue;
      expect(view.camera.punch).not.toBeNull();
      displaced++;
    }
    expect(displaced).toBeGreaterThan(100);
  });

  /** And it carries nothing out of an orbit it has left — the delay that was removed. */
  it('holds no orbit once the body is gone', () => {
    for (const view of RUN) {
      if (held(view)) continue;
      expect(view.camera.offset).toBe(0);
      expect(view.camera.lock).toBe(0);
    }
  });
});

describe('the craft', () => {
  /**
   * Spec 00 §3's acceptance: *"bloom radius is a pure function of energy step and
   * chain length; no code path sets bloom from a hue."* The chain is spec 08's and
   * arrives in M4, so today this is E2's radius exactly — and the term it
   * multiplies is built, so when the chain exists it is a number to pass rather
   * than a rule to invent.
   */
  it('burns at E2 for the whole run, at the radius the chain will widen', () => {
    for (const view of RUN) {
      expect(view.craft.energy).toBe(2);
      expect(view.craft.bloom).toBe(54);
    }
    // Spec 00 §3's +4px a link, converted: chain 7 is 54 + 7 × 12.
    expect(bloomOf(2, 7)).toBe(138);
  });
});
