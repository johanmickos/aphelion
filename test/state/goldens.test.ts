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
import { RING_MIN_GAP } from '../../src/state/compass.ts';
import {
  CALLOUT_DECAY_TICKS,
  calloutTicks,
  LINGER_TICKS,
  POP_RISE,
  TAKEN_WINDOW_TICKS,
} from '../../src/state/callout.ts';
import { STRETCH_ACROSS, STRETCH_ALONG } from '../../src/state/deformation.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';
import { bloomOf } from '../../src/state/energy.ts';
import { PUNCH_FLOOR, PUNCH_STRETCH, PUNCH_TICKS, punchSpan } from '../../src/state/punch.ts';
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
    // Spec 02 §4 and §5, which are one element since the camera's share of the
    // punch was withdrawn (2026-08-29).
    expect(PUNCH_TICKS).toBe(11); // 180ms
    expect(PUNCH_STRETCH).toBe(0.5); // ADR-0012's "half again as long"
    expect(PUNCH_FLOOR).toBe(0.45); // what a release of no quality still earns
    expect(punchSpan(1)).toBe(17);
    expect(STRETCH_ALONG).toBe(1.5);
    expect(STRETCH_ACROSS).toBe(0.7);
    // Spec 06 §4.
    expect(POP_RISE).toBe(150); // its curve carried, its amplitude ruled up for the bump
    expect(LINGER_TICKS).toBe(72); // 1.2s — the one two specs disagree about
    expect(CALLOUT_DECAY_TICKS).toBe(24); // 400ms
    expect(calloutTicks()).toBe(96);
    expect(TAKEN_WINDOW_TICKS).toBe(25); // spec 02 §6's 420ms, a quarter of the word's
    // Spec 00 §6's ring count, ruled to three on 2026-08-29.
    expect(RINGS).toBe(3);
    expect(RING_MIN_GAP).toBe(48); // a window's full width at full aim, clear
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
    expect(RUN.length - 1).toBe(3945);
    expect(edges('grab')).toEqual([
      70, 294, 338, 373, 416, 454, 507, 562, 782, 976, 1225, 1404, 1584, 1761, 1940, 2119, 2300,
      2483, 2661, 2876, 2937, 2982, 3026, 3071, 3200, 3252, 3358, 3678, 3720, 3766, 3837,
    ]);
    expect(edges('release')).toEqual([
      254, 328, 360, 403, 453, 492, 561, 781, 975, 1224, 1402, 1583, 1760, 1939, 2118, 2299, 2482,
      2660, 2853, 2918, 2957, 3007, 3040, 3183, 3235, 3357, 3664, 3700, 3748, 3813,
    ]);
  });
});

/**
 * **The first swing, and the best one in the run.** Grabbed on 70, frozen on
 * 185, released on 254 — sixty-nine ticks past the freeze, which is inside the
 * plateau, so the envelope is exactly 1 and the punch is at its full extent.
 */
const FREEZE = 185;
const RELEASE = 254;

describe('the release at 254 · a swing let go at full boost', () => {
  it('is at the top of its envelope on the tick before', () => {
    expect(at(RELEASE - 1).compass!.envelope).toBe(1);
  });

  /**
   * Spec 02 §4, dated from `T0` — and it carries the **punch** now, so a release
   * at the top of its envelope earns the whole stretch and holds it half again as
   * long: 17 ticks against 11.
   */
  it('stretches the craft the whole way, for seventeen ticks', () => {
    expect(at(RELEASE).craft.deformation.amount).toBe(1);
    expect(at(RELEASE).craft.deformation.along).toBeCloseTo(1.5, 9);
    expect(at(RELEASE).craft.deformation.across).toBeCloseTo(0.7, 9);
    expect(at(RELEASE + 16).craft.deformation.recovery).not.toBeNull();
    expect(at(RELEASE + 17).craft.deformation.recovery).toBeNull();
  });

  /** Spec 06 §4's word, born at the dot and lit through its climb and linger. */
  it('says SHARP at the dot, climbs it, and holds it lit', () => {
    expect(at(RELEASE).callout!.tier).toBe('SHARP');
    expect(at(RELEASE).callout!.life.age).toBe(0);
    expect(at(RELEASE).callout!.y).toBe(at(RELEASE).callout!.bornY);
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
    const climbed = (tick: number): number =>
      at(RELEASE).callout!.bornY - at(RELEASE + tick).callout!.y;
    expect(climbed(24) / POP_RISE).toBeGreaterThan(0.4);
    expect(climbed(24)).toBeGreaterThan(climbed(6));
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
 * **The release at 328, which is the whole game in one tick.**
 *
 * Frozen on 327 and let go on 328 — one tick later. The aim is **PERFECT** and
 * the envelope is **exactly zero**: the best word in the game, and not one unit
 * of boost to go with it. Spec [01 · §11](../../docs/spec/01-swing.md)'s tension
 * is that the two wanted different moments, and this is a release that took one
 * and paid the whole price of the other.
 */
describe('the release at 328 · perfect aim, no boost at all', () => {
  it('earns the top word on an envelope of zero', () => {
    expect(at(327).compass!.envelope).toBe(0);
    expect(at(328).callout!.tier).toBe('PERFECT');
  });

  /**
   * The punch is at its **floor** — the craft still left, and the stretch is what
   * says so, but there was no quality to pay for anything above it. What a tap
   * pays nothing of is the **boost**, which is a different channel (ADR-0012).
   */
  it('earns only the floor of the punch, because there was no quality', () => {
    expect(at(328).craft.deformation.amount).toBe(PUNCH_FLOOR);
    expect(at(328).craft.deformation.recovery!.span).toBe(PUNCH_TICKS);
  });

  /**
   * And the word is graded on aim alone, so it is undimmed by the timing. Spec
   * 06's acceptance: *"grading is a pure function of `(d, W)` and imports nothing
   * from the economy."*
   */
  it('says the top word, and strikes no flash under it', () => {
    expect(at(328).callout!.tier).toBe('PERFECT');
    // No glow of any kind behind it. The CORE-white E3 went first, then spec 06
    // §4's own per-tier bloom — *"the blur circle behind the popup text isn't
    // doing us any favours, it's blurring the legibility."* What keeps the word
    // legible is a rim, which is the renderer's and is paint.
    expect(at(328).flash).toBeNull();
    expect(at(328).callout!.bloom).toBe(6);
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
    // Three ticks in: the ramp is 3/27 of the way up and one stretch wide.
    expect(at(188).compass!.envelope).toBeCloseTo(3 / 27, 9);
    expect(at(188).compass!.flown).toHaveLength(1);
    expect(at(188).compass!.arming).toHaveLength(4);
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
    const flown = at(213).compass!.flown;
    expect(flown).toHaveLength(7);

    const ramp = flown.slice(0, 6);
    // Six stretches climbing 0 → 1 in equal steps of the envelope's own value…
    expect(ramp.map((run) => Number(run.to.toFixed(3)))).toEqual([
      0.185, 0.333, 0.519, 0.667, 0.852, 1,
    ]);
    expect(ramp[0]!.at).toBe(0);
    // …across steadily shorter arcs, because the craft is slowing.
    const spans = ramp.map((run) => Math.abs(run.span));
    expect(spans[0]!).toBeCloseTo(0.5666, 3);
    expect(spans[5]!).toBeCloseTo(0.1627, 3);
    expect(spans[0]! / spans[5]!).toBeGreaterThan(2.5);
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
    const compass = at(213).compass!;
    const flown = compass.flown;
    for (let i = 1; i < flown.length; i++) {
      expect(flown[i]!.from).toBeCloseTo(flown[i - 1]!.from + flown[i - 1]!.span, 9);
    }
    const last = flown[flown.length - 1]!;
    expect(last.from + last.span).toBeCloseTo(compass.hand!, 9);
  });

  it('grows through the settle', () => {
    const swept = [188, 200, 213, 225, RELEASE - 1].map((tick) => at(tick).compass!.swept);
    for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);
    expect(swept[swept.length - 1]!).toBeCloseTo(4.614, 3);
  });

  /**
   * **And past it, which it did not before M2.4.** The compass read `orbit.phase`,
   * and that stops advancing at the settle's end because it is the datum the
   * closed form is measured from — so the drawn arc froze at 1.2s while the craft
   * kept going round it.
   *
   * It has to be asserted **here** and not on the first swing: that one freezes on
   * 185 and is let go on 254, which is inside its own 72-tick settle, so every
   * tick of it grows either way. The swing frozen on **1141** is held for 83, past
   * its settle, and is where the bug is visible at all. That is worth knowing: a
   * golden written on the most convenient swing would have passed with the fault
   * back in.
   */
  it('keeps growing past the settle', () => {
    // 1141 + 72 = 1213, so these three ticks are all in closed-form territory.
    const swept = [1214, 1219, 1223].map((tick) => at(tick).compass!.swept);
    for (let i = 1; i < swept.length; i++) expect(swept[i]!).toBeGreaterThan(swept[i - 1]!);
    // And the envelope is decaying by then, which is the other half of the same
    // fact: past the settle there is a stretch of arc the boost is dying along.
    expect(at(1223).compass!.envelope).toBeLessThan(1);
    expect(at(1223).compass!.envelope).toBeGreaterThan(0);
    expect(at(1223).compass!.flown.length).toBeGreaterThan(7);
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

describe('which word is alive when', () => {
  /**
   * **One slot, and a new release takes it.** The SHARP struck on 254 is 73 ticks
   * into its 96 when the PERFECT lands on 328, so the two overlap — and there is
   * still exactly one word, because spec 06 §4 makes queueing structural: *"one
   * release, one word."*
   */
  it('is one word, and a later release replaces an earlier one still lit', () => {
    expect(at(327).callout!.tier).toBe('SHARP');
    expect(at(327).callout!.life.age).toBe(73);
    expect(at(328).callout!.tier).toBe('PERFECT');
    expect(at(328).callout!.life.age).toBe(0);
  });

  /**
   * **The window leaves with the instrument, and the word stays.** Spec
   * [02 · §6](../../docs/spec/02-release.md) gives the taken window 420ms and spec
   * 06 §4 gives the word 1 720ms; built on one clock the arc hung on screen four
   * times too long, and the author caught it — *"the planet's compass window stays
   * after the rest of the compass disappears"* (2026-08-29).
   */
  it('lets the taken window go long before the word', () => {
    expect(at(RELEASE).callout!.windowStrength).toBe(1);
    // Gone at 420ms, while the word is still at full through its linger.
    expect(at(RELEASE + 24).callout!.windowStrength).toBeGreaterThan(0);
    expect(at(RELEASE + 25).callout!.windowStrength).toBe(0);
    expect(at(RELEASE + 25).callout!.strength).toBe(1);
  });

  /** A make is carried and speaks nothing — spec 06 §2's *"points only"*. */
  it('carries a make without spending a word on it', () => {
    expect(at(453).callout!.tier).toBe('MAKE');
    expect(at(453).flash).toBeNull();
  });

  /** And it outlives the rest of the sequence, world-anchored, being left behind. */
  it('is the only thing still alive 400ms after a release', () => {
    // The next swing is already under way by then — this run's swings are close
    // together — so what is asserted is that nothing of *this* release survives:
    // its stretch is home, and its word is not.
    const settled = at(RELEASE + 24);
    expect(settled.craft.deformation.recovery).toBeNull();
    expect(settled.callout).not.toBeNull();
  });

  /**
   * And it ends on its own clock — asserted on the release at **975**, one of the
   * few in this run with no other release inside its lifetime: the next is 249
   * ticks later, against a word that lives 96. Most of the run's swings overlap,
   * which is spec 06 §3's merge rule waiting for the streaks that will need it.
   */
  it('ends 1 600ms after the release that earned it', () => {
    expect(at(975).callout!.tier).toBe('MAKE');
    expect(at(975).callout!.life.age).toBe(0);
    expect(at(975 + 95).callout).not.toBeNull();
    expect(at(975 + 95).callout!.strength).toBeLessThan(0.05);
    expect(at(975 + 96).callout).toBeNull();
  });

  /**
   * Over the whole run: twenty-three releases, three of them PERFECT — and the E3
   * is struck **not once**. Spec 00 §3's *"at most one E3 alive"* is a shape
   * rather than a check, and what the shape now holds is nothing: the author has
   * taken the release, the grab and the award off the list in turn, and what is
   * left for it is spec 12's checkered line, in M6.
   */
  it('leaves the E3 slot empty, for all three of its users are withdrawn', () => {
    // `life.age === 0` and not merely the tier: a release that earns no word
    // leaves the previous one lingering, so a test that read the tier alone would
    // count one PERFECT several times over.
    const perfects = edges('release').filter(
      (tick) => at(tick).callout?.life.age === 0 && at(tick).callout?.tier === 'PERFECT',
    );
    expect(perfects).toEqual([328, 2957, 3040, 3183, 3748]);
    expect(RUN.filter((view) => view.flash !== null)).toHaveLength(0);
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

  /** And nothing inside a window is ever ungraded, which is the other half of it. */
  it('never withholds a word from a release inside the window', () => {
    for (const view of RUN) {
      for (const ring of view.compass?.rings ?? []) {
        if (Math.abs(ring.offset) <= ring.halfWidth) expect(ring.tier).not.toBeNull();
      }
    }
  });
});

describe('the camera, over the whole run', () => {
  /**
   * The rule this milestone had to be careful with, asserted over 2 775 ticks —
   * and exact again, now that the camera's share of the punch is withdrawn.
   */
  it('follows the centreline on every tick of the run', () => {
    for (const view of RUN) expect(view.camera.x).toBe(DESIGN_WIDTH / 2);
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
