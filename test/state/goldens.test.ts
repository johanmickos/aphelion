/**
 * [M2.5](../../docs/plan/m2-the-instrument.md)'s acceptance: *"assert derived
 * presentation values at named ticks across a recorded recipe... a regression in
 * any choreography fails a test. No canvas, no PNG diffing."*
 *
 * The recipe is the one this repo ships and `pnpm replay` flies with no
 * argument, so **a number here and a number in that terminal output are the same
 * number**. Every tick this file is about is a tick the author can fly — and
 * since 2026-08-31 the file **finds** those ticks rather than naming them, which
 * is [`test/moments.ts`](../moments.ts) and its own argument. What a red test
 * prints in its name is where to point `pnpm replay`.
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
 *
 * ## The ticks that are left, and there are two kinds
 *
 * **Claims about this run** stay written down: the shape of the run below, and
 * the arrival's *two words in twenty-seven captures*, which the arrival's own
 * prose argues for at length. Both are supposed to move, both are one line, and
 * both are regenerated in one step.
 *
 * **Durations** — 17, 24, 25, 96 — are not coordinates either. They are the
 * choreography's own lengths, they are asserted as literals on purpose (see
 * *the numbers the choreography is built from*, which is why), and they do not
 * move when the physics does.
 *
 * Everything else that used to be a tick number is now a sentence.
 */
import { describe, expect, it } from 'vitest';
import { BOOST_ARM_TICKS, BOOST_PLATEAU_TICKS, BOOST_ZERO_TICKS } from '../../src/sim/units.ts';
import { RINGS } from '../../src/sim/compass.ts';
import { EXIT_TICKS, RING_MIN_GAP } from '../../src/state/compass.ts';
import {
  CALLOUT_DECAY_TICKS,
  calloutTicks,
  LINGER_TICKS,
  POP_RISE,
  TAKEN_WINDOW_TICKS,
} from '../../src/state/callout.ts';
import { STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { ARRIVAL_WORDS, arrivalTicks } from '../../src/state/arrival.ts';
import { SPEND_TICKS } from '../../src/state/body.ts';
import { PERFECT_FLOOR } from '../../src/sim/tier.ts';
import { KNOCK_WORDS, knockTicks } from '../../src/state/knock.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';
import { bloomOf } from '../../src/state/energy.ts';
import { PUNCH_FLOOR, PUNCH_STRETCH, PUNCH_TICKS, punchSpan } from '../../src/state/punch.ts';
import type { PresentationState } from '../../src/state/types.ts';
import {
  each,
  freezeTicks,
  grabTicks,
  heading,
  held,
  once,
  releaseTicks,
  releasesWhere,
  shippedRun,
  shortfall,
  ticksWhere,
} from '../moments.ts';

const RUN = shippedRun();

/**
 * **There used to be two more runs here, both the author's, and they are gone.**
 *
 * The arrival and the knock were pinned on real play because the headless pilot
 * could not produce either: `test/sim/run.ts` says in its own prose that **aim**
 * is the one input it cannot reproduce, and under the physics before SIM_VERSION
 * 7 that showed up as thirty-two captures in the shipped pilot run without a
 * single tight arrival among them.
 *
 * The dive payback changed that. A swing that does not commit no longer keeps
 * what falling gave it, so the pilot's own presses now produce captures that
 * differ from one another, and the run below carries both words.
 *
 * So these goldens ride on the same run as every other one in this file, which is
 * where they always belonged — one fixture, one `pnpm replay`, and a number here
 * is a number in that terminal output.
 */

/**
 * The picture on a named tick. Indices are ticks, because tick zero is index zero.
 *
 * It refuses a tick past the end of the run in a sentence rather than in a
 * `TypeError`, because that is the one way a **found** moment can go wrong that
 * naming one could not: a moment discovered near the end of a shorter run has no
 * room left for the choreography that is asserted after it.
 */
const at = (tick: number): PresentationState => {
  const view = RUN[tick];
  if (view === undefined) {
    throw new Error(
      `This golden reached tick ${tick} and the run ends at ${RUN.length - 1}.\n` +
        `The moment it is written about was found too near the end for the choreography\n` +
        `after it to be watched all the way out. Re-record a longer fixture with\n` +
        `\`node tools/fixture.ts\`, or narrow the moment so it cannot be found there.`,
    );
  }
  expect(view.tick).toBe(tick);
  return view;
};

const GRABS = grabTicks(RUN);
const RELEASES = releaseTicks(RUN);
const FREEZES = freezeTicks(RUN);

/**
 * How long the swing frozen on this tick was held for afterwards.
 *
 * The freeze is where every one of the arc's own measurements is dated from, and
 * how long the craft stayed on the orbit is what decides which of them there was
 * time to make — so it is the one number the moments below are cut on.
 */
const heldFor = (freeze: number): number => {
  const release = RELEASES.find((tick) => tick > freeze);
  return (release ?? RUN.length) - freeze;
};

const isFreeze = (tick: number): boolean => FREEZES.includes(tick);

/** Whether a release earned a word of its own on this tick, rather than inheriting one. */
const spoke = (view: PresentationState): boolean => view.callout?.life.age === 0;

/**
 * **The numbers themselves, against the specs that fix them.**
 *
 * Every duration named in this file is written as a literal rather than as the
 * constant that produced it, and this block is why: a golden that indexes by the
 * constant it is testing cannot catch a change to that constant — it moves the
 * expectation and the fixture together and passes. Found by mutating each one and
 * watching the file stay green, which is the only way that class of gap ever
 * shows up.
 *
 * So the durations below are the arithmetic, once, in one place. **They are not
 * what the 2026-08-31 refactor took out**, and the distinction is the whole of
 * that change: a duration is a fact about the choreography and holds whatever run
 * it is measured on, where a tick number was a fact about one recording.
 */
describe('the numbers the choreography is built from', () => {
  it('are the ones the specs fix', () => {
    // Spec 02 §4 and §5, which are one element since the camera's share of the
    // punch was withdrawn (2026-08-29).
    expect(PUNCH_TICKS).toBe(11); // 180ms
    expect(PUNCH_STRETCH).toBe(0.5); // ADR-0012's "half again as long"
    expect(PUNCH_FLOOR).toBe(0.45); // what a release of no quality still earns
    expect(punchSpan(1)).toBe(17);
    // Spec 02 §4 draws 1.5 / 0.7 and the author deepened both by half on
    // 2026-08-30 — *"a bit more punchy at the start"*. What is pinned is the
    // board's own **ratio between the axes**, which is what survived the change:
    // the displacements are 0.75 and 0.45, which is 5 : 3, exactly as the board's
    // 0.5 and 0.3 were.
    expect(STRETCH_ALONG).toBe(1.75);
    expect(STRETCH_ACROSS).toBe(0.55);
    expect((STRETCH_ALONG - 1) / (1 - STRETCH_ACROSS)).toBeCloseTo(5 / 3, 9);
    // Spec 06 §4.
    expect(POP_RISE).toBe(150); // its curve carried, its amplitude ruled up for the bump
    expect(LINGER_TICKS).toBe(72); // 1.2s — the one two specs disagree about
    expect(CALLOUT_DECAY_TICKS).toBe(24); // 400ms
    expect(calloutTicks()).toBe(96);
    expect(TAKEN_WINDOW_TICKS).toBe(25); // spec 02 §6's 420ms, a quarter of the word's
    // Spec 00 §6's ring count, ruled to three on 2026-08-29.
    expect(RINGS).toBe(3);
    expect(RING_MIN_GAP).toBe(48); // a window's full width at full aim, clear
    // M2.3's ruling, and the length the instrument's departure is measured over.
    expect(EXIT_TICKS).toBe(6); // 100ms
    // The other two words' lives, added 2026-08-31. **They were a gap**: the
    // arrival and the knock were watched out to `arrivalTicks()` and
    // `knockTicks()`, which is a golden indexing by the constant it is testing —
    // the exact fault this block was written to close, left open on two of the
    // three words. Lengthening either linger passed. Now it does not.
    expect(arrivalTicks()).toBe(60); // 600ms lingering, 400ms leaving
    expect(knockTicks()).toBe(48); // 400ms and 400ms — an interjection
    expect(SPEND_TICKS).toBe(13); // 210ms, the lamp going out after a release
    // Spec 01 §7's envelope, which the flown arc is cut on.
    expect(BOOST_ARM_TICKS).toBe(27); // 0.45s
    expect(BOOST_PLATEAU_TICKS).toBe(72); // 1.2s, and the settle's end
    expect(BOOST_ZERO_TICKS).toBe(156); // 2.6s
  });
});

describe('the shape of the run', () => {
  /**
   * Twenty-nine grabs and twenty-eight releases — the run ends holding, which is
   * why they differ by one. If this fails
   * and `test/sim/version.test.ts` did not, the *picture* has started disagreeing
   * with the simulation about when a swing began or ended — which is the one
   * thing the middle layer must never do.
   *
   * **This is the wall of numbers, and it is the only one left.** Since the rest
   * of the file finds its moments, re-recording the fixture is this block and
   * nothing else: one list of ticks, regenerated in one step, exactly as it was
   * always meant to be.
   */
  it('grabs and releases on the ticks pnpm replay prints', () => {
    expect(RUN.length - 1).toBe(2506);
    expect(GRABS).toEqual([
      113, 311, 330, 384, 416, 457, 491, 682, 985, 1037, 1065, 1115, 1144, 1184, 1220, 1256, 1292,
      1328, 1366, 1448, 1520, 1575, 1622, 1732, 1784, 2086, 2258, 2368, 2424,
    ]);
    expect(RELEASES).toEqual([
      286, 320, 362, 393, 437, 473, 650, 955, 1007, 1044, 1093, 1130, 1175, 1201, 1247, 1279, 1310,
      1354, 1431, 1507, 1563, 1605, 1715, 1774, 2085, 2245, 2362, 2412,
    ]);
  });

  /**
   * **And that it still carries every moment this file goes looking for.**
   *
   * [`COVERAGE`](../moments.ts) is what `tools/fixture.ts` searches seeds on, and
   * this is the other end of that: the criteria and the fixture, checked against
   * each other rather than trusted to have stayed in step. It is not a
   * substitute for the finders — a moment missing from `COVERAGE` still fails at
   * its own finder, which is the gate — it is what catches the search asking for
   * something this run does not have, which would send the next re-record
   * hunting for a seed it did not need.
   */
  it('carries every moment tools/fixture.ts searches for', () => {
    expect(shortfall(RUN)).toEqual([]);
  });

  /**
   * And that the run flew its whole recipe rather than dying early inside it,
   * which is what makes the length above a fact about the flight rather than
   * about the file. Asserted as an agreement between two readings instead of as
   * a second copy of the number.
   */
  it('flies to the end of the log it was recorded from', () => {
    expect(RUN.length - 1).toBe(RUN.at(-1)!.tick);
    expect(RELEASES.length).toBe(GRABS.length - 1);
  });
});

/**
 * **The best kind of swing in the run**, and it is a kind rather than a swing:
 * let go inside the plateau, so the envelope is exactly 1 and the punch is at its
 * full extent. This run holds three.
 *
 * The quality a release pays the punch with **is** the envelope on the tick
 * before it ([`derive.ts`](../../src/state/derive.ts)'s `qualityBehind`), so
 * describing the moment by its envelope and asserting the punch is not a
 * tautology dressed up — it is the one place the two layers are wired together,
 * and it is what would break silently.
 *
 * ⚠ **What is not here any more is the word.** This block used to assert SHARP,
 * which is a fact about the swing's **aim** sitting under a moment defined by its
 * **boost** — and spec [01 · §11](../../docs/spec/01-swing.md) is explicitly
 * about those two being independent. Asked of all three, it fails: the third
 * earns no word at all. The word's own choreography is asserted below, under a
 * moment that is about words.
 */
const FULL_BOOST = releasesWhere(
  RUN,
  'a swing let go at the very top of its boost envelope',
  (_view, before) => before.compass!.envelope === 1,
);

describe(heading(FULL_BOOST), () => {
  /**
   * Spec 02 §4, dated from `T0` — and it carries the **punch** now, so a release
   * at the top of its envelope earns the whole stretch and holds it half again as
   * long: 17 ticks against 11.
   */
  it('stretches the craft the whole way, for seventeen ticks', () => {
    for (const tick of each(FULL_BOOST)) {
      expect(at(tick).craft.deformation.amount).toBe(1);
      expect(at(tick).craft.deformation.along).toBeCloseTo(STRETCH_ALONG, 9);
      expect(at(tick).craft.deformation.across).toBeCloseTo(STRETCH_ACROSS, 9);
      expect(at(tick + 16).craft.deformation.recovery).not.toBeNull();
      expect(at(tick + 17).craft.deformation.recovery).toBeNull();
    }
  });
});

/**
 * **The whole game in one tick**: the aim is **PERFECT** and the envelope is
 * **exactly zero** — the best word in the game, and not one unit of boost to go
 * with it. Spec [01 · §11](../../docs/spec/01-swing.md)'s tension is that the two
 * wanted different moments, and this is a release that took one and paid the
 * whole price of the other.
 *
 * It is [`once`](../moments.ts) and not `each` because the conjunction really
 * does pick out one swing here: this run has twelve releases on a zero envelope
 * and two PERFECTs, and exactly one release that is both. A run with two of them
 * would be a different fixture and this sentence would need re-reading, which is
 * what `once` refusing it says.
 */
const NO_BOOST = releasesWhere(
  RUN,
  'a release at PERFECT aim with no boost at all',
  (view, before) =>
    before.compass!.envelope === 0 && spoke(view) && view.callout!.tier === 'PERFECT',
);
const AT_NO_BOOST = once(NO_BOOST);

describe(heading(NO_BOOST), () => {
  it('earns the top word on an envelope of zero', () => {
    expect(at(AT_NO_BOOST - 1).compass!.envelope).toBe(0);
    expect(at(AT_NO_BOOST).callout!.tier).toBe('PERFECT');
  });

  /**
   * The punch is at its **floor** — the craft still left, and the stretch is what
   * says so, but there was no quality to pay for anything above it. What a tap
   * pays nothing of is the **boost**, which is a different channel (ADR-0012).
   */
  it('earns only the floor of the punch, because there was no quality', () => {
    expect(at(AT_NO_BOOST).craft.deformation.amount).toBe(PUNCH_FLOOR);
    expect(at(AT_NO_BOOST).craft.deformation.recovery!.span).toBe(PUNCH_TICKS);
  });

  /**
   * And the word is graded on aim alone, so it is undimmed by the timing. Spec
   * 06's acceptance: *"grading is a pure function of `(d, W)` and imports nothing
   * from the economy."*
   */
  it('says the top word, and strikes no flash under it', () => {
    // No glow of any kind behind it. The CORE-white E3 went first, then spec 06
    // §4's own per-tier bloom — *"the blur circle behind the popup text isn't
    // doing us any favours, it's blurring the legibility."* What keeps the word
    // legible is a rim, which is the renderer's and is paint.
    expect(at(AT_NO_BOOST).flash).toBeNull();
    expect(at(AT_NO_BOOST).callout!.bloom).toBe(6);
  });
});

/**
 * **Every dive that froze into an orbit.** The arc's own clock starts at the
 * freeze, so this is the datum all of it is dated from — and asserting the empty
 * start over all twenty-seven of them is what makes it a rule about the element
 * rather than about one swing.
 */
const FREEZE = ticksWhere(RUN, 'a dive frozen into an orbit', (_view, _before, tick) =>
  isFreeze(tick),
);

/**
 * The freezes there was time to draw a whole ramp from — 28 ticks, which is the
 * arming length and one tick more, so the plateau's own stretch exists to be
 * told apart from the six that climb to it.
 */
const WHOLE_RAMP = ticksWhere(
  RUN,
  'a swing held long enough to draw its whole boost ramp',
  (_view, _before, tick) => isFreeze(tick) && heldFor(tick) > 28,
);

describe(heading(FREEZE), () => {
  /**
   * At the freeze there is nothing to draw: the envelope's clock starts here, so
   * an arc drawn before it would be saying something about a boost that does not
   * exist yet.
   */
  it('is empty at the freeze and grows a stretch at a time', () => {
    for (const tick of each(FREEZE, 10)) {
      expect(at(tick).compass!.flown).toEqual([]);
      expect(at(tick).compass!.envelope).toBe(0);
      expect(at(tick).compass!.arming).toHaveLength(1);
    }

    // Three ticks in: the ramp is 3/27 of the way up and one stretch wide.
    for (const tick of each(WHOLE_RAMP, 3)) {
      expect(at(tick + 3).compass!.envelope).toBeCloseTo(3 / 27, 9);
      expect(at(tick + 3).compass!.flown).toHaveLength(1);
      expect(at(tick + 3).compass!.arming).toHaveLength(4);
    }
  });
});

describe(heading(WHOLE_RAMP), () => {
  /**
   * **The ramp's stretches are not equal, and that is the measurement the latch
   * exists for.** The craft leaves periapsis at its fastest and slows on the way
   * out, so equal slices of *time* are unequal slices of *arc*.
   *
   * **How unequal is a fact about the swing and not about the game**, which is
   * what asking it of every ramp rather than of one showed: over the seven here
   * the first stretch is between **2.0 and 3.8** times the sixth, where the
   * single swing this used to be written on gave 3.1 and read like a constant.
   * So the shape is asserted on every ramp and the magnitude is asserted the way
   * the ring count is — a floor that must hold everywhere, and a ceiling that
   * must actually be reached somewhere, so neither a run of gentle ramps nor a
   * flattened one passes.
   *
   * **The floor is a tolerance and it was set too tight once already.** Written
   * at 2.0 it fitted this fixture exactly and failed the first physics change it
   * met: flying the acceptance test on 2026-08-31 — `SETTLE_RETURN` 0.3 → 0.34,
   * re-recorded — the same eight ramps ran **1.30 to 2.59**, because how much
   * the craft slows across its ramp is what that constant is *about*. A floor
   * calibrated to one run is the coordinate problem again in a decimal, so what
   * is asserted is what makes the latch necessary rather than what one build
   * measured: **any** inequality above 1.15 fails a ramp shaded evenly along the
   * arc, and a ceiling above 2 somewhere in the run says the effect is large and
   * not merely present. Both hold on both tunings.
   *
   * Shading the ramp evenly along the arc instead is wrong by 0.19 of the
   * envelope's range, and wrong in the direction that says the boost armed
   * sooner than it did.
   */
  it('cuts the ramp on the clock and not on the arc', () => {
    let steepest = 0;
    for (const tick of each(WHOLE_RAMP, 3)) {
      const flown = at(tick + 28).compass!.flown;
      expect(flown).toHaveLength(7);

      const ramp = flown.slice(0, 6);
      // Six stretches climbing 0 → 1 in equal steps of the envelope's own value.
      // These are the envelope's quantisation at fixed offsets from the freeze,
      // so they are the same six numbers on every ramp in every run — which is
      // exactly why they are worth asserting and the arc spans below are not.
      expect(ramp.map((run) => Number(run.to.toFixed(3)))).toEqual([
        0.185, 0.333, 0.519, 0.667, 0.852, 1,
      ]);
      expect(ramp[0]!.at).toBe(0);

      // …across steadily shorter arcs, because the craft is slowing.
      const spans = ramp.map((run) => Math.abs(run.span));
      for (let i = 1; i < spans.length; i++) expect(spans[i]!).toBeLessThan(spans[0]!);
      expect(spans[0]! / spans[5]!).toBeGreaterThan(1.15);
      steepest = Math.max(steepest, spans[0]! / spans[5]!);

      // And the plateau is one stretch at full, because it does not vary.
      expect(flown[6]!.at).toBe(1);
      expect(flown[6]!.to).toBe(1);
    }
    // The effect is large somewhere in the run, and not merely present.
    expect(steepest).toBeGreaterThan(2);
  });

  /**
   * The stretches join end to end and finish under the craft, which is what makes
   * the arc a strip chart rather than a scatter of marks: the bright end is where
   * the eye already is.
   */
  it('runs unbroken from the freeze to the hand', () => {
    for (const tick of each(WHOLE_RAMP, 3)) {
      const compass = at(tick + 28).compass!;
      const flown = compass.flown;
      for (let i = 1; i < flown.length; i++) {
        expect(flown[i]!.from).toBeCloseTo(flown[i - 1]!.from + flown[i - 1]!.span, 9);
      }
      const last = flown[flown.length - 1]!;
      expect(last.from + last.span).toBeCloseTo(compass.hand!, 9);
    }
  });

  it('grows through the settle', () => {
    for (const tick of each(WHOLE_RAMP, 3)) {
      const swept = [3, 14, 28].map((on) => at(tick + on).compass!.swept);
      for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);
      expect(swept[0]!).toBeGreaterThan(0);
    }
  });
});

/**
 * **And past the settle, which it did not do before M2.4.** The compass read
 * `orbit.phase`, and that stops advancing at the settle's end because it is the
 * datum the closed form is measured from — so the drawn arc froze at 1.2s while
 * the craft kept going round it.
 *
 * **It cannot be asserted on a swing that is let go inside its own settle**, and
 * that is the whole reason this moment is described the way it is rather than by
 * a tick. Most of this run's swings freeze and are released within 72 ticks, so
 * every tick of them grows either way and a golden written on the convenient one
 * passed with the fault put back in. What is wanted is a swing held **well** past
 * the settle's end — far enough that there is arc on the far side of it to
 * measure — and the reach the assertions below need is the same number the moment
 * is cut on, so the finder cannot hand back a swing too short to test.
 *
 * Two of this run's twenty-seven swings qualify. That scarcity is real and it is
 * the pilot's: `test/sim/run.ts` releases as soon as the aim arrives, so a swing
 * held for twice its settle is rare on its own merits. Of thirty thousand pilot
 * seeds swept on 2026-08-31, this was the moment missing from the most runs that
 * were otherwise complete.
 */
const PAST_SETTLE = ticksWhere(
  RUN,
  'a swing held well past the end of its own settle',
  (_view, _before, tick) => isFreeze(tick) && heldFor(tick) > BOOST_PLATEAU_TICKS + 36,
);

describe(heading(PAST_SETTLE), () => {
  it('keeps growing past the settle', () => {
    for (const tick of each(PAST_SETTLE)) {
      // Every one of these is on the far side of the settle's end, in closed-form
      // territory, and the swing is still held on all of them.
      const swept = [6, 21, 36].map((on) => at(tick + BOOST_PLATEAU_TICKS + on).compass!.swept);
      for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);

      // And the envelope is decaying by then, which is the other half of the same
      // fact: past the settle there is a stretch of arc the boost is dying along.
      const late = at(tick + BOOST_PLATEAU_TICKS + 36).compass!;
      expect(late.envelope).toBeLessThan(1);
      expect(late.envelope).toBeGreaterThan(0);
      expect(at(tick + BOOST_PLATEAU_TICKS + 21).compass!.flown.length).toBeGreaterThan(7);
    }
  });
});

describe('the orbit path, while the dive is still owed its clearance', () => {
  /**
   * **One oval, not two.** [`predictOrbit`](../../src/sim/orbit.ts) says of itself
   * that it *"does not model the clearance's remaining turn, so early in a dive
   * that owes one the prediction is coarser than it will be"* — and coarser means
   * a much **larger** oval, because the path has not been bent toward the body
   * yet. Drawn, that reads as two orbits rather than one firming up: *"first when
   * I grab I see a large oval at times, and then when I start diving in it
   * switches. I don't think we should show that first one, it looks like it jumps
   * aggressively"* (author, 2026-08-30).
   *
   * Measured on this run, it was on screen for **4 to 9 ticks** on each of twelve
   * dives — long enough to register and far too short to be a shape.
   */
  it('draws no path until the clearance has been paid', () => {
    let owed = 0;
    for (const view of RUN) {
      const compass = view.compass;
      if (compass === null || !compass.predicted) continue;
      // A predicted path is only ever drawn once the turn it does not model has
      // been made, so a drawn prediction always has a shape to show.
      expect(compass.path.length).toBeGreaterThan(0);
      owed++;
    }
    expect(owed).toBeGreaterThan(100);
  });

  /** And the fade still starts from nothing, so it arrives rather than appearing. */
  it('still fades the path in from nothing when it does arrive', () => {
    const first = RUN.findIndex((v) => v.compass?.predicted === true && v.compass.presence > 0);
    expect(first).toBeGreaterThan(0);
    expect(RUN[first]!.compass!.presence).toBeLessThan(0.3);
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

  /**
   * **And no two of them are drawn at the same height.** The radii are
   * proportional to distance at one design unit per 12.9 of world — finer than
   * the stroke that draws them — so measured over 12 280 adjacent pairs, half sat
   * under 5 units apart on screen while their bodies were a median of 32 units
   * apart in the world. *"Two orbitals are sharing the same height on my compass.
   * Were the planets really the same distance away?"* (author, 2026-08-29). They
   * were not.
   */
  it('holds every ring clear of the one inside it', () => {
    let checked = 0;
    for (const view of RUN) {
      const rings = view.compass?.rings;
      if (!rings || rings.length < 2) continue;
      for (let i = 1; i < rings.length; i++) {
        expect(rings[i]!.radius - rings[i - 1]!.radius).toBeGreaterThanOrEqual(RING_MIN_GAP - 1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  /** And the order still says which is the nearer hop, which is the stack's job. */
  it('keeps the rings in the order of their bodies', () => {
    for (const view of RUN) {
      const rings = view.compass?.rings;
      if (!rings || rings.length < 2) continue;
      for (let i = 1; i < rings.length; i++) {
        expect(rings[i]!.away).toBeGreaterThanOrEqual(rings[i - 1]!.away);
      }
    }
  });
});

/**
 * **Every release that earned a word of its own**, which is the moment all of the
 * callout's choreography actually belongs to — sixteen of this run's twenty-eight
 * releases. `life.age === 0` and not merely a tier being present: a release that
 * earns no word leaves the previous one lingering, so a test that read the tier
 * alone would count one word several times over.
 */
const SPOKE = releasesWhere(RUN, 'a release that earned a word of its own', (view) => spoke(view));

/**
 * The words that were left alone long enough to be watched all the way out —
 * no other release word born inside their whole 96 ticks. Most of this run's
 * swings overlap, which is spec 06 §3's merge rule waiting for the streaks that
 * will need it.
 */
const LEFT_ALONE = releasesWhere(
  RUN,
  'a word with no other release word born inside its whole life',
  (view, _before, tick) => {
    if (!spoke(view)) return false;
    const next = RUN.slice(tick + 1, tick + calloutTicks() + 1).findIndex(spoke);
    return next === -1 && tick + calloutTicks() < RUN.length;
  },
);

/** And the ones a later word interrupted, which is the queueing rule with teeth. */
const REPLACED = releasesWhere(
  RUN,
  'a word struck while an earlier one was still lit',
  (view, _before, tick) => {
    if (!spoke(view)) return false;
    const previous = RUN[tick - 1]?.callout;
    return previous != null && previous.life.age > 0 && previous.life.age < calloutTicks();
  },
);

describe(heading(SPOKE), () => {
  /** Spec 06 §4's word, born at the dot and lit through its climb and linger. */
  it('says its word at the dot, climbs it, and holds it lit', () => {
    for (const tick of each(SPOKE, 5)) {
      expect(at(tick).callout!.life.age).toBe(0);
      expect(at(tick).callout!.y).toBe(at(tick).callout!.bornY);
      // The climb is a **throw**: fastest at birth, and asserted as a distance
      // rather than as *less than where it started*, so a rise that stopped moving
      // would fail rather than pass quietly. A quarter of the way through its life
      // it is over half way up.
      //
      // **The climb and the clamp are both in this number**, and that is honest
      // rather than a confound: the word is world-anchored, the craft is climbing,
      // and spec 00 §7 holds the word above the thumb line — so what the player
      // sees is the throw until the picture catches up with it. The curve puts it
      // 43.75% of the way up by a quarter of its life, against 25% for a line.
      const climbed = (on: number): number => at(tick).callout!.bornY - at(tick + on).callout!.y;
      expect(climbed(24) / POP_RISE).toBeGreaterThan(0.4);
      expect(climbed(24)).toBeGreaterThan(climbed(6));
      expect(at(tick + 24).callout!.strength).toBe(1);
    }
  });

  /**
   * **The window leaves with the instrument, and the word stays.** Spec
   * [02 · §6](../../docs/spec/02-release.md) gives the taken window 420ms and spec
   * 06 §4 gives the word 1 720ms; built on one clock the arc hung on screen four
   * times too long, and the author caught it — *"the planet's compass window stays
   * after the rest of the compass disappears"* (2026-08-29).
   */
  it('lets the taken window go long before the word', () => {
    for (const tick of each(SPOKE, 5)) {
      expect(at(tick).callout!.windowStrength).toBe(1);
      // Gone at 420ms, while the word is still at full through its linger.
      expect(at(tick + 24).callout!.windowStrength).toBeGreaterThan(0);
      expect(at(tick + 25).callout!.windowStrength).toBe(0);
      expect(at(tick + 25).callout!.strength).toBe(1);
    }
  });

  /**
   * And it outlives the rest of the sequence, world-anchored, being left behind.
   *
   * The next swing is often already under way by then — this run's swings are
   * close together — so what is asserted is that nothing of *this* release
   * survives: its stretch is home, and its word is not.
   */
  it('is the only thing still alive 400ms after a release', () => {
    for (const tick of each(SPOKE, 5)) {
      expect(at(tick + 24).craft.deformation.recovery).toBeNull();
      expect(at(tick + 24).callout).not.toBeNull();
    }
  });
});

describe(heading(REPLACED), () => {
  /**
   * **One slot, and a new release takes it.** A word struck while an earlier one
   * is still lit replaces it outright, and there is still exactly one word,
   * because spec 06 §4 makes queueing structural: *"one release, one word."*
   */
  it('is one word, and a later release replaces an earlier one still lit', () => {
    for (const tick of each(REPLACED)) {
      expect(at(tick - 1).callout!.life.age).toBeGreaterThan(0);
      expect(at(tick).callout!.life.age).toBe(0);
      // The slot is a single nullable field, so a second word has nowhere to be —
      // the rule is a shape rather than a check, and this is the shape being kept.
      expect(at(tick).callout).not.toBeNull();
    }
  });
});

describe(heading(LEFT_ALONE), () => {
  /** And it ends on its own clock, 1 600ms after the release that earned it. */
  it('ends 1 600ms after the release that earned it', () => {
    for (const tick of each(LEFT_ALONE)) {
      expect(at(tick).callout!.life.age).toBe(0);
      expect(at(tick + 95).callout).not.toBeNull();
      expect(at(tick + 95).callout!.strength).toBeLessThan(0.05);
      expect(at(tick + 96).callout).toBeNull();
    }
  });
});

/** **A make is carried and speaks nothing** — spec 06 §2's *"points only"*. */
const MAKES = releasesWhere(
  RUN,
  'a release graded MAKE',
  (view) => spoke(view) && view.callout!.tier === 'MAKE',
);

describe(heading(MAKES), () => {
  it('carries a make without spending a word on it', () => {
    for (const tick of each(MAKES)) {
      expect(at(tick).callout!.tier).toBe('MAKE');
      expect(at(tick).flash).toBeNull();
    }
  });
});

/**
 * **The top word, and the E3 that is not struck under it.** Spec 00 §3's *"at
 * most one E3 alive"* is a shape rather than a check, and what the shape now
 * holds is nothing: the author has taken the release, the grab and the award off
 * the list in turn, and what is left for it is spec 12's checkered line, in M6.
 */
const PERFECTS = releasesWhere(
  RUN,
  'a release graded PERFECT',
  (view) => spoke(view) && view.callout!.tier === 'PERFECT',
);

describe(heading(PERFECTS), () => {
  it('leaves the E3 slot empty, for all three of its users are withdrawn', () => {
    for (const tick of each(PERFECTS)) expect(at(tick).flash).toBeNull();
    // And nowhere else in the run either, which is the claim the slot is for.
    expect(RUN.filter((view) => view.flash !== null)).toHaveLength(0);
  });
});

/**
 * **A release the craft does not immediately grab back from**, which is what the
 * instrument's departure can actually be measured on. Twenty-six of this run's
 * twenty-eight releases; the other two are re-grabbed inside the exit's own six
 * ticks, so the compass they are still drawing belongs to the next swing.
 *
 * That exception was invisible while this was pinned to one tick, and it is not a
 * defect: a compass that vanished for four ticks between two swings joined a tick
 * apart would be a flicker, not a departure.
 */
const CLEAN_EXIT = releasesWhere(
  RUN,
  'a release the craft does not immediately grab back from',
  (_view, _before, tick) => !GRABS.some((grab) => grab > tick && grab <= tick + EXIT_TICKS),
);

describe(heading(CLEAN_EXIT), () => {
  /** The instrument leaves over 100ms, which is M2.3's ruling and is untouched. */
  it('takes the compass with it inside 100ms', () => {
    for (const tick of each(CLEAN_EXIT, 10)) {
      expect(at(tick).compass).not.toBeNull();
      // Unused rings die instantly — spec 02 §6, *"no fade"*.
      expect(at(tick).compass!.rings).toEqual([]);
      expect(at(tick + 5).compass).not.toBeNull();
      expect(at(tick + 6).compass).toBeNull();
    }
  });
});

describe('which side of the dot a release fell', () => {
  /**
   * **The dot is a centre, not an edge.** Spec [06 · §2](../../docs/spec/06-awards.md)
   * grades on `d`, *"the **absolute** angular offset of the release from the
   * window's centre"*, so a release that has swept past the dot is worth exactly
   * what one the same distance short of it is worth. Raised from flying — *"I
   * feel like the player should still get award text if they grab after the
   * planet dot on the compass, but still in the window"* (author, 2026-08-29).
   *
   * Measured over the recorded dispatches, they do: **40 graded releases fell
   * before the dot and 50 after it**, and every ungraded one was genuinely
   * outside its window — the nearest by 12% of a half-width. This is that as an
   * assertion rather than as a measurement, so it cannot quietly become
   * one-sided.
   */
  it('grades both sides of the dot the same', () => {
    let past = 0;
    let short = 0;
    for (const view of RUN) {
      for (const ring of view.compass?.rings ?? []) {
        if (ring.tier === null) continue;
        // Inside the window is inside the window, whichever way round.
        expect(Math.abs(ring.offset)).toBeLessThanOrEqual(ring.halfWidth + 1e-9);
        if (ring.offset > 0) past++;
        else short++;
      }
    }
    // Both sides happen, and neither is rare: the hand is only inside a window
    // for a few ticks of each revolution, so these are counts of tens rather than
    // of hundreds.
    expect(past).toBeGreaterThan(20);
    expect(short).toBeGreaterThan(20);
    // Both sides are substantial. They are not equal and should not be asserted
    // so: which side the hand is on when a window is graded depends on which way
    // round the craft is going and where the dot sits, and a run with more of one
    // than the other is a run, not a bias in the grading.
    expect(Math.min(past, short) / Math.max(past, short)).toBeGreaterThan(0.2);
  });

  /**
   * **And each zone ends where spec 06 §2 says it does.** The tiers are
   * fractions of the window's own full width `W`, so a zone that widened would
   * hand a better word to the same geometry — and nothing noticed until
   * 2026-08-31, when widening SHARP from 0.15 to 0.28 of `W` passed every test
   * in this file. The boundaries are read off the run's own graded windows and
   * written down as the spec's numbers rather than as the constants, for the
   * reason the arithmetic block gives.
   *
   * PERFECT carries the **1.5° floor** under it, which is why it is asserted as
   * a ceiling on the fraction *or* the floor, whichever is larger: on a narrow
   * window the absolute floor is what binds, and both are spec 06's own worked
   * examples.
   */
  it('ends each zone where the spec puts it, as a fraction of the window', () => {
    const worst = new Map<string, number>();
    for (const view of RUN) {
      for (const ring of view.compass?.rings ?? []) {
        if (ring.tier === null) continue;
        const width = 2 * ring.halfWidth;
        const share = Math.abs(ring.offset) / width;
        worst.set(ring.tier, Math.max(worst.get(ring.tier) ?? 0, share));
        if (ring.tier === 'PERFECT') {
          expect(Math.abs(ring.offset)).toBeLessThanOrEqual(
            Math.max(0.08 * width, PERFECT_FLOOR) + 1e-9,
          );
        }
        if (ring.tier === 'SHARP') expect(share).toBeLessThanOrEqual(0.15 + 1e-9);
        if (ring.tier === 'TRUE') expect(share).toBeLessThanOrEqual(0.3 + 1e-9);
        expect(share).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
    // And every zone is actually reached, so the ceilings above are not vacuous
    // ceilings over words the run never said.
    for (const tier of ['MAKE', 'TRUE', 'SHARP', 'PERFECT']) {
      expect(worst.get(tier), `no ${tier} window in the run`).toBeGreaterThan(0);
    }
  });

  /** And nothing inside a window is ever ungraded, which is the other half of it. */
  it('never withholds a word from a release inside the window', () => {
    for (const view of RUN) {
      for (const ring of view.compass?.rings ?? []) {
        if (Math.abs(ring.offset) <= ring.halfWidth) expect(ring.tier).not.toBeNull();
      }
    }
  });
});

/**
 * Ruled by the author, 2026-08-30: a capture earns a word of its own, graded on
 * **how close the closest approach came to the body's floor**, on one rung
 * rather than a ladder, in its own slot beside the release's.
 */
const ARRIVALS = ticksWhere(RUN, 'a tight arrival', (view) => view.arrival?.life.age === 0);

describe('the arrival · a word for the capture', () => {
  /**
   * **The count is the test**, because the failure this word had was never a
   * crash: it was a word said too often to mean anything. Twenty-seven captures,
   * two words. Loosening either half of `arrivedTight` moves this number and fails
   * here, which is the only thing standing between the author's verdict and a
   * quiet regression back to the two-in-three it was refused at.
   *
   * **This is a claim and not a coordinate**, which is why it survived the
   * 2026-08-31 refactor with its numbers intact while the ticks around it became
   * sentences. It is a rate, it is meant to move when the grading moves, and it
   * is two integers regenerated in one step.
   *
   * ⚠ **The pilot under-produces this word and always will**, which is why the
   * rate that matters is real play's — measured at 15% over the author's own 105
   * captures against 7% here. `test/sim/run.ts` says why in its own prose: aim is
   * the one input it cannot reproduce, and aim is half of what this grades.
   */
  it('is said twice in twenty-seven captures, and the pilot cannot do better', () => {
    expect(FREEZES).toHaveLength(27);
    expect(ARRIVALS.ticks).toHaveLength(2);
  });

  it('is struck at the freeze and nowhere else', () => {
    for (const tick of each(ARRIVALS, 2)) {
      // The freeze is the tick the closest approach becomes a fact: the compass
      // has a hand from that tick and had none on the one before.
      expect(at(tick).compass?.hand).not.toBeNull();
      expect(at(tick - 1).compass?.hand ?? null).toBeNull();
      expect(isFreeze(tick)).toBe(true);
    }
  });

  /** And placed at the closest approach itself — the place that earned it. */
  it('is born where the craft was when it froze', () => {
    for (const tick of each(ARRIVALS, 2)) {
      const word = at(tick).arrival!;
      expect(word.bornX).toBe(at(tick).craft.x);
      expect(word.bornY).toBe(at(tick).craft.y);
      expect(word.y).toBe(word.bornY);
    }
  });

  /**
   * **One rung, three words, chosen by the body's address** — so it is a pure
   * function of the run and replays identically, and a body says the same thing
   * every time it is arrived at well.
   */
  it('says one of its three words, and the body decides which', () => {
    let said = 0;
    for (const view of RUN) {
      const word = view.arrival;
      if (word === null) continue;
      expect(ARRIVAL_WORDS as readonly string[]).toContain(word.word);
      expect(word.word).toBe(ARRIVAL_WORDS[word.body % ARRIVAL_WORDS.length]);
      if (word.life.age === 0) said++;
    }
    expect(said).toBeGreaterThan(0);
  });

  /**
   * **Its own slot**, which is the point of the ruling: a capture word and a
   * release word can be lit at once, because they are at different places — the
   * body you arrived at, versus the dot you left from.
   */
  it('never displaces the release word, and can be lit beside it', () => {
    const together = RUN.filter((view) => view.arrival !== null && view.callout !== null);
    expect(together.length).toBeGreaterThan(0);
  });

  /**
   * It climbs and leaves on the callout's own curves, because they are one
   * grammar — and it is watched out to **60**, written down, rather than to
   * `arrivalTicks()`, which would move with the constant and never fail.
   */
  it('climbs and fades, and is gone at one second', () => {
    for (const tick of each(ARRIVALS, 2)) {
      const rise: number[] = [];
      for (let on = 0; on < 60; on++) rise.push(at(tick).arrival!.bornY - at(tick + on).arrival!.y);
      for (let i = 1; i < rise.length; i++) expect(rise[i]!).toBeGreaterThanOrEqual(rise[i - 1]!);
      expect(at(tick + 59).arrival!.strength).toBeLessThan(0.05);
      expect(at(tick + 60).arrival).toBeNull();
    }
  });
});

describe('the camera, over the whole run', () => {
  /**
   * ⚠ **The camera moves sideways since 2026-09-01**, so *"follows the centreline
   * on every tick"* is gone. What is asserted over the whole run instead is the
   * property that made the old rule worth having: **the craft is always on
   * screen.**
   *
   * That is the M1.4 defect this axis was built to close. Measured over the
   * author's own dispatches: the craft is outside the picture on **3.4% of ticks**
   * without the pan and on **0.00%** with it — and the shipped run is one that
   * goes to a wall and dies there, so it exercises the case rather than avoiding
   * it.
   */
  it('keeps the craft on screen except where the view has run out of room', () => {
    let pinned = 0;
    for (const view of RUN) {
      const { centreline, halfWidth } = view.corridor;
      // ⚠ **The one exemption, and it is the author's ruling of 2026-09-01**: the
      // view stops at the line, so once the picture's edge is *on* the line the
      // camera has nowhere left to go and a craft still diving at the wall leaves
      // the frame. The field rule beats framing — the prototype's own words,
      // *"a rule about what the player may SEE"*.
      //
      // Everywhere the camera still has room, the craft is on screen. That is the
      // invariant; the exemption is not a tolerance but a place the bound binds.
      const atBound =
        view.camera.x + DESIGN_WIDTH / 2 >= centreline + halfWidth - 1e-6 ||
        view.camera.x - DESIGN_WIDTH / 2 <= centreline - halfWidth + 1e-6;
      if (atBound) {
        pinned++;
        continue;
      }
      // At most exactly the edge: the backstop is a bound the view is held *at*,
      // so a craft the ease could not keep up with sits on the frame's own line
      // rather than inside it.
      expect(Math.abs(view.craft.x - view.camera.x)).toBeLessThanOrEqual(DESIGN_WIDTH / 2 + 1e-6);
    }
    // And the bound binds rarely — a run spends its time in the field, not at a
    // wall. Measured over the author's dispatches it is the last handful of ticks
    // of the runs that die out of bounds.
    expect(pinned).toBeLessThan(RUN.length * 0.05);
  });

  /**
   * The other half of the same ruling: *"not expose stuff past it."* The picture's
   * own edge never passes the line, on any tick of the run — which is what makes
   * the exemption above the honest trade rather than a bug.
   */
  it('never shows past the line', () => {
    for (const view of RUN) {
      const { centreline, halfWidth } = view.corridor;
      expect(view.camera.x + DESIGN_WIDTH / 2).toBeLessThanOrEqual(centreline + halfWidth + 1e-6);
      expect(view.camera.x - DESIGN_WIDTH / 2).toBeGreaterThanOrEqual(
        centreline - halfWidth - 1e-6,
      );
    }
  });

  /**
   * And it goes out there at all — a run that never left the middle would pass the
   * criterion above without ever testing it.
   */
  it('pans far enough to have been worth building', () => {
    const panned = Math.max(...RUN.map((view) => Math.abs(view.camera.x - RUN[0]!.camera.x)));
    expect(panned).toBeGreaterThan(DESIGN_WIDTH / 4);
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

/**
 * Asked for by the author, 2026-08-30, after flying a capture that read as a
 * crash. It is not a new event: spec 01 §10's floor has been catching the craft
 * since M1, and the radial speed it removes **is** the kink. This says so.
 */
const KNOCKS = ticksWhere(RUN, 'a knock', (view) => view.knock?.life.age === 0);

describe(heading(KNOCKS), () => {
  /** At the point of contact, which is the place that earned it. */
  it('is born where the craft hit', () => {
    for (const tick of each(KNOCKS)) {
      expect(at(tick).knock!.bornX).toBe(at(tick).craft.x);
      expect(at(tick).knock!.bornY).toBe(at(tick).craft.y);
    }
  });

  it('says one of its three words, and the tick decides which', () => {
    for (const tick of each(KNOCKS)) {
      expect(KNOCK_WORDS as readonly string[]).toContain(at(tick).knock!.word);
      expect(at(tick).knock!.word).toBe(KNOCK_WORDS[tick % KNOCK_WORDS.length]);
    }
  });

  /**
   * **Never at the same time as an arrival**, and this is the test that keeps it
   * true end to end rather than only at the threshold.
   *
   * It was **breached under SIM_VERSION 7** and is not any more. The dive payback
   * changed what a capture arrives at, and for one build a capture took a hard
   * enough knock to say BONK three ticks before landing tight enough to say
   * NERVE — lit together for 45 ticks. The release kick becoming a square
   * (SIM_VERSION 8) moved approach geometry again and closed it without either
   * threshold being touched. That it healed by itself is worth knowing rather
   * than celebrating: `KNOCK_BAND` sits where it does on a measurement, and a
   * measurement that has drifted twice in two days is one to re-take rather than
   * to trust.
   */
  it('is never lit beside the arrival', () => {
    expect(RUN.filter((v) => v.knock !== null && v.arrival !== null)).toHaveLength(0);
  });

  /**
   * It climbs and leaves on the callout's own curves, because they are one
   * grammar — watched out to **48**, written down for the same reason the
   * arrival's 60 is.
   */
  it('climbs and fades, and is gone at eight hundred milliseconds', () => {
    for (const tick of each(KNOCKS)) {
      const rise: number[] = [];
      for (let on = 0; on < 48; on++) rise.push(at(tick).knock!.bornY - at(tick + on).knock!.y);
      for (let i = 1; i < rise.length; i++) expect(rise[i]!).toBeGreaterThanOrEqual(rise[i - 1]!);
      expect(at(tick + 47).knock!.strength).toBeLessThan(0.05);
      expect(at(tick + 48).knock).toBeNull();
    }
  });

  /**
   * **How often it is said is the test, exactly as the arrival's count is.**
   * [`KNOCK_BAND`](../../src/sim/tier.ts) claims to select *"4% of captures, all
   * of them plunges"*, and one knock in twenty-seven captures is 3.7% — so this
   * is that claim read off a run rather than trusted.
   *
   * ⚠ **And this fixture cannot check the band from below, which is a fact about
   * the run rather than a hole in the test.** Measured over its own dives on
   * 2026-08-31, the share the floor takes is **0.1548** once and then falls
   * straight to 0.0008 — no threshold anywhere between 0.001 and 0.155 changes
   * how many knocks this run says. Dropping `KNOCK_BAND` from 0.15 to 0.04
   * therefore passes, and passed identically before this file found its moments;
   * it is not something a better assertion closes.
   *
   * What that costs is worth stating plainly: the count below catches the band
   * moving **up** past 0.155, which would take the word away entirely, and
   * catches nothing below it. `KNOCK_BAND` is already down for re-measuring
   * (`docs/plan/m3-the-field.md`) and this is a second reason it has to be
   * re-measured on **the author's dispatches** — the pilot's captures are
   * bimodal, one plunge and twenty-six clean arrivals, where real play's are a
   * tail. `test/sim/run.ts` says why in its own prose: aim is what it cannot
   * reproduce, and aim is what the floor's share is a reading of.
   */
  it('is said once in twenty-seven captures, which is the band selecting a tail', () => {
    expect(KNOCKS.ticks).toHaveLength(1);
    expect(FREEZES).toHaveLength(27);
  });
});
