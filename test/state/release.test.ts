/**
 * The release — spec [02](../../docs/spec/02-release.md)'s 400ms, as things a
 * test can name a tick for.
 *
 * The file's acceptance is *"an agent with no canvas can assert that the camera
 * is offset 6px along the tangent at a given tick"*, and everything below is
 * that sentence for one element or another. Nothing here imports the renderer.
 *
 * **The timeline is dated from `T0`.**
 * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
 * withdrew the 70ms hitstop every beat used to be dated from, so `T0` is the tick
 * the button came up and there is no freeze between it and anything else. What
 * survived the rebase untouched is the exit-tangent rule, the
 * award-lands-at-the-dot rule, and every duration measured from the start of its
 * own element — and the three of them are what this file checks.
 */
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { BOOST_ARM_TICKS, BOOST_PLATEAU_TICKS, SETTLE_TICKS } from '../../src/sim/units.ts';
import { calloutTicks, POP_TICKS } from '../../src/state/callout.ts';
import { subjectOf } from '../../src/state/camera.ts';
import { DEFORM_TICKS } from '../../src/state/deformation.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { FAREWELL_TICKS } from '../../src/state/farewell.ts';
import {
  PUNCH_GRAB,
  PUNCH_RELEASE,
  PUNCH_TICKS,
  punchSize,
  punchSpan,
} from '../../src/state/punch.ts';
import type { PresentationState } from '../../src/state/types.ts';

const PRESS = { pressed: true };
const LET_GO = { pressed: false };

interface Flight {
  readonly views: readonly PresentationState[];
  /** The tick the body was taken, and the tick it was let go of. */
  readonly grabbed: number;
  readonly released: number;
}

/** When the press goes down. The dive from here takes about 130 ticks to freeze. */
const GRAB_AT = 20;

/**
 * Fly one swing and keep every tick of the picture, letting go a named number of
 * ticks **after the freeze**.
 *
 * Dated from the freeze rather than from the press, because that is the clock
 * everything in this file is about: spec 01 §7's envelope starts there, spec 01
 * §11's whole tension is measured there, and a swing released on tick 117 of the
 * run is released wherever the dive happened to have got to. A `sinceFreeze` of
 * 0 is a release at the freeze itself, where the envelope is exactly zero.
 */
function fly(sinceFreeze: number, ticks = 640): Flight {
  const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
  const views: PresentationState[] = [createPresentation(sim)];
  let grabbed = -1;
  let released = -1;
  for (let tick = 0; tick < ticks; tick++) {
    const before = sim.heldBody;
    const holding =
      tick >= GRAB_AT &&
      released === -1 &&
      (sim.heldBody === null || sim.orbit === null || sim.orbit.ticksSinceFreeze < sinceFreeze);
    stepSim(sim, holding ? PRESS : LET_GO);
    if (before === null && sim.heldBody !== null) grabbed = views.length;
    if (before !== null && sim.heldBody === null) released = views.length;
    views.push(derive(views[views.length - 1]!, sim));
  }
  return { views, grabbed, released };
}

/**
 * A swing let go of **inside the plateau, on a window it earns a word for**.
 *
 * Both halves matter and they are independent: the envelope is 1 at 71 ticks past
 * the freeze (the plateau runs 27 to 72), and the geometry of the fixture field
 * puts the hand inside a window there. One flight therefore carries a punch at
 * full quality *and* a callout, which is what lets the two be checked against the
 * same tick rather than against two different swings.
 */
const AT_PEAK = fly(BOOST_PLATEAU_TICKS - 1);

/** And one let go of at the freeze itself, where the envelope is exactly zero. */
const AT_FREEZE = fly(0);

/** How far a vector lies off a heading, as a fraction of its own length. */
function acrossTangent(heading: number, x: number, y: number): number {
  return Math.abs(x * -Math.sin(heading) + y * Math.cos(heading));
}

describe('the punch', () => {
  /**
   * Spec 02 §5's first row, and the one the file's own acceptance is written
   * about: **6px along the exit tangent**, which is 18 design units at three per
   * board pixel.
   */
  it('displaces the view along the exit tangent, at T0', () => {
    const at = AT_PEAK.views[AT_PEAK.released]!;
    expect(at.camera.punch).not.toBeNull();
    const punch = at.camera.punch!;
    expect(punch.decay.age).toBe(0);
    expect(Math.hypot(punch.x, punch.y)).toBeCloseTo(punchSize(quality(AT_PEAK)), 6);
    expect(punchSize(1)).toBe(PUNCH_RELEASE);
  });

  /**
   * Spec 02's rule 2, unchanged by the rebase because it was never the freeze:
   * *"every motion is strictly along the exit tangent — never radial, never a
   * shake."* Its acceptance states the test exactly: project each onto the
   * tangent's normal and find zero.
   */
  it('has no component across the tangent it was struck along', () => {
    // At the instant it is struck, against the craft's own heading.
    for (const flight of [AT_PEAK, AT_FREEZE]) {
      for (const tick of [flight.grabbed, flight.released]) {
        const view = flight.views[tick]!;
        const punch = view.camera.punch;
        if (punch === null) continue;
        expect(acrossTangent(view.craft.heading, punch.alongX, punch.alongY)).toBeLessThan(1e-12);
      }
    }
    // And on every tick after, against the direction it was struck along — which
    // is the honest reading, because a grabbed craft is turning and a punch that
    // swung round with it would be a second streak that is not parallel to the
    // velocity it was born from.
    for (const view of AT_PEAK.views) {
      const punch = view.camera.punch;
      if (punch === null) continue;
      const along = Math.atan2(punch.alongY, punch.alongX);
      expect(acrossTangent(along, punch.x, punch.y)).toBeLessThan(1e-12);
    }
  });

  /** And it is a **displacement**, so the thing the camera follows never moves sideways. */
  it('never moves the camera it is displacing', () => {
    const centres = new Set(AT_PEAK.views.map((view) => subjectOf(view.camera).x));
    expect(centres.size).toBe(1);
  });

  /**
   * ADR-0012's *"quality enters twice — as size and as duration"*, and the reason
   * the strength is a root: applied linearly *"the median recorded release paid
   * 29% of full and read as nothing happening."*
   */
  it('is scaled by quality, in size and in span', () => {
    expect(punchSize(0.29) / PUNCH_RELEASE).toBeCloseTo(0.54, 2);
    expect(punchSize(0)).toBe(0);
    expect(punchSize(1)).toBe(PUNCH_RELEASE);
    // Half again as long at the top of the envelope, and no longer than that.
    expect(punchSpan(0)).toBe(PUNCH_TICKS);
    expect(punchSpan(1)).toBe(Math.round(PUNCH_TICKS * 1.5));
    expect(punchSpan(0.5)).toBeGreaterThan(punchSpan(0));
    expect(punchSpan(0.5)).toBeLessThan(punchSpan(1));
  });

  /**
   * *"A tap pays nothing, structurally rather than by a guard"* — a release at
   * the freeze sits at exactly zero on the envelope, so there is nothing to
   * place and nothing has to check.
   */
  it('pays a release at the freeze almost nothing', () => {
    const at = AT_FREEZE.views[AT_FREEZE.released]!;
    const struck = at.camera.punch === null ? 0 : Math.hypot(at.camera.punch.x, at.camera.punch.y);
    expect(struck).toBeLessThan(PUNCH_RELEASE / 4);
  });

  /** Spec 02 §7: the grab is the release's mirror, at lower amplitude and reversed. */
  it('marks a grab at half the size, into the orbit', () => {
    const at = AT_PEAK.views[AT_PEAK.grabbed]!;
    expect(at.camera.punch).not.toBeNull();
    expect(at.camera.punch!.size).toBe(-PUNCH_GRAB);
    expect(Math.hypot(at.camera.punch!.x, at.camera.punch!.y)).toBeCloseTo(PUNCH_GRAB, 6);
    // Reversed: the **displacement** points against the way the craft is going,
    // which is what carrying a signed size rather than a flipped direction buys —
    // the grab and the release are one rule with one sign between them.
    const punch = at.camera.punch!;
    const along = punch.x * Math.cos(at.craft.heading) + punch.y * Math.sin(at.craft.heading);
    expect(along).toBeCloseTo(-PUNCH_GRAB, 6);
  });

  /**
   * Spec 02 §5's return: **home in 180ms with one overshoot** — and *"one"* is
   * the whole of it, because a displacement that eases home has its story in the
   * first third and then creeps.
   */
  it('comes home past rest exactly once, and then is gone', () => {
    const from = AT_PEAK.released;
    const span = AT_PEAK.views[from]!.camera.punch!.decay.span;
    const along: number[] = [];
    for (let i = from; i < from + span; i++) {
      const punch = AT_PEAK.views[i]!.camera.punch;
      expect(punch).not.toBeNull();
      along.push(punch!.x * punch!.alongX + punch!.y * punch!.alongY);
    }
    expect(AT_PEAK.views[from + span]!.camera.punch).toBeNull();
    const crossings = along.filter((v, i) => i > 0 && Math.sign(v) !== Math.sign(along[i - 1]!));
    expect(crossings.length).toBe(1);
    expect(Math.min(...along)).toBeLessThan(0);
  });
});

describe('the craft, leaving', () => {
  /**
   * Spec 02 §4, dated from `T0` exactly as the rebase notice prescribes — *"every
   * `T+70ms` becomes `T0`"*, and the 180ms is measured from the start of its own
   * element and is therefore untouched.
   */
  it('is stretched on the release tick and recovered 180ms later', () => {
    const at = AT_PEAK.views[AT_PEAK.released]!;
    expect(at.craft.deformation.along).toBeCloseTo(1.5, 6);
    expect(at.craft.deformation.across).toBeCloseTo(0.7, 6);
    const home = AT_PEAK.views[AT_PEAK.released + DEFORM_TICKS]!;
    expect(home.craft.deformation.along).toBe(1);
    expect(home.craft.deformation.across).toBe(1);
    expect(home.craft.deformation.recovery).toBeNull();
  });
});

describe('the farewell ring', () => {
  /** Spec 02 §6: the orbit itself, detaching and expanding away from the body. */
  it('is the orbit that was flown, placed at T0', () => {
    const at = AT_PEAK.views[AT_PEAK.released]!;
    expect(at.farewell).not.toBeNull();
    expect(at.farewell!.spread).toBe(1);
    expect(at.farewell!.decay.age).toBe(0);
    // The same body, and the same sampled shape the compass was drawing.
    const before = AT_PEAK.views[AT_PEAK.released - 1]!.compass!;
    expect(at.farewell!.x).toBe(before.x);
    expect(at.farewell!.path).toEqual(before.path);
  });

  it('expands away and is gone after 400ms', () => {
    const from = AT_PEAK.released;
    const spreads = [];
    for (let i = from; i < from + FAREWELL_TICKS; i++) {
      expect(AT_PEAK.views[i]!.farewell).not.toBeNull();
      spreads.push(AT_PEAK.views[i]!.farewell!.spread);
    }
    expect(AT_PEAK.views[from + FAREWELL_TICKS]!.farewell).toBeNull();
    for (let i = 1; i < spreads.length; i++) expect(spreads[i]!).toBeGreaterThan(spreads[i - 1]!);
  });

  /**
   * A release during the **dive** has no frozen orbit, so there is no path to
   * detach. Expanding a prediction away would be a farewell to something that
   * never happened.
   */
  it('is not placed by a release that never froze', () => {
    // Released while still diving, so there was never a frozen orbit to leave.
    const early = flyDuringDive();
    expect(early.released).toBeGreaterThan(0);
    expect(early.views[early.released]!.farewell).toBeNull();
  });
});

describe('the callout', () => {
  /**
   * Spec 02's rule 3, untouched by the rebase: **the award word lands at the dot
   * that earned it**, not in a band at the top of the screen.
   */
  it('is born at the dot of the window that was taken', () => {
    const at = AT_PEAK.views[AT_PEAK.released]!;
    const word = at.callout!;
    const ring = AT_PEAK.views[AT_PEAK.released - 1]!.compass!.rings.find(
      (r) => r.body === word.body,
    )!;
    expect(word.dot).toBe(ring.dot);
    expect(word.halfWidth).toBe(ring.halfWidth);
    expect(word.radius).toBe(ring.radius);
    // On the ring, at the dot's own angle, and only clear of it by the birth
    // offset spec 06 §4 asks for.
    const away = Math.hypot(word.bornX - word.aboutX, word.bornY - word.aboutY);
    expect(away).toBeGreaterThan(ring.radius);
    expect(away - ring.radius).toBeLessThan(30 * 3);
  });

  /**
   * Spec 06 §4's clock, each stretch measured from the start of its own element:
   * a **120ms** pop, a **1.2s** linger at full, and a **400ms** decay to zero.
   */
  it('pops, lingers and decays on its own clock', () => {
    const from = AT_PEAK.released;
    const born = AT_PEAK.views[from]!.callout!;
    expect(born.life.age).toBe(0);
    expect(born.strength).toBe(1);
    expect(born.y).toBe(born.bornY);

    // The pop is over at 120ms, and it has carried the word upward.
    const popped = AT_PEAK.views[from + POP_TICKS]!.callout!;
    expect(popped.y).toBeLessThan(born.bornY);
    expect(popped.strength).toBe(1);

    // Still full through the linger, and out by the end.
    expect(AT_PEAK.views[from + calloutTicks() - 1]!.callout!.strength).toBeLessThan(0.05);
    expect(AT_PEAK.views[from + calloutTicks()]!.callout).toBeNull();
  });

  /** And the pop passes rest once, which is spec 06 §4's *"one overshoot"*. */
  it('overshoots its rise exactly once', () => {
    const from = AT_PEAK.released;
    const rise: number[] = [];
    for (let i = from; i <= from + POP_TICKS; i++) {
      const word = AT_PEAK.views[i]!.callout!;
      rise.push(word.bornY - word.y);
    }
    const top = Math.max(...rise);
    expect(top).toBeGreaterThan(rise[rise.length - 1]!);
  });

  /**
   * Spec 06 §5: a release outside the window gets **silence**. And it does not
   * take down a word already in the air — ADR-0008 makes a miss *"a debt, not a
   * loss"*, and confiscating the previous release's word would be a punishment.
   */
  it('says nothing for a miss, and takes nothing away', () => {
    const swing = fly(BOOST_ARM_TICKS + 15);
    const missed = swing.views.findIndex(
      (view, i) =>
        i > 0 &&
        view.compass === null &&
        swing.views[i - 1]!.compass !== null &&
        swing.views[i - 1]!.compass!.rings.every((ring) => ring.tier === null),
    );
    if (missed === -1) return; // this geometry always lands in a window
    expect(swing.views[missed]!.callout?.life.age).not.toBe(0);
  });

  /** One slot, so two words can never fight over an instant (spec 06 §4). */
  it('is one word and never a queue', () => {
    for (const view of AT_PEAK.views) {
      expect(view.callout === null || typeof view.callout.tier === 'string').toBe(true);
    }
  });
});

/** A swing let go of part way down the dive, before any orbit was frozen. */
function flyDuringDive(): Flight {
  const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
  const views: PresentationState[] = [createPresentation(sim)];
  let grabbed = -1;
  let released = -1;
  for (let tick = 0; tick < 320; tick++) {
    const before = sim.heldBody;
    stepSim(sim, tick >= GRAB_AT && released === -1 && tick < GRAB_AT + 40 ? PRESS : LET_GO);
    if (before === null && sim.heldBody !== null) grabbed = views.length;
    if (before !== null && sim.heldBody === null) released = views.length;
    views.push(derive(views[views.length - 1]!, sim));
  }
  return { views, grabbed, released };
}

/** What the swing was worth on the tick the button came up. */
function quality(flight: Flight): number {
  return flight.views[flight.released - 1]!.compass!.envelope;
}

describe('the whole sequence', () => {
  /**
   * Spec 02's acceptance, rebased. The old criterion ended the sequence at
   * `T+511ms`, and it could never have held: spec 06 §4's own pop, linger and
   * decay sum to 1 720ms and then cite spec 02 for 510. The rebase notice rules
   * which way that resolves — *"every duration measured from the start of its own
   * element is untouched"* — so the word's clock stands and the end column moves
   * to what it sums to. **Nothing else in the sequence outlives 400ms.**
   */
  it('is over, except the word, 400ms after the release', () => {
    const from = AT_PEAK.released;
    const settled = AT_PEAK.views[from + FAREWELL_TICKS]!;
    expect(settled.farewell).toBeNull();
    expect(settled.camera.punch).toBeNull();
    expect(settled.craft.deformation.recovery).toBeNull();
    expect(settled.compass).toBeNull();
    // And the word is still there, world-anchored and being left behind.
    expect(settled.callout).not.toBeNull();
    expect(AT_PEAK.views[from + calloutTicks()]!.callout).toBeNull();
  });

  /**
   * The layer criterion [AGENTS.md](../../AGENTS.md) §6 asks every step for, and
   * the one this step could most easily have broken: everything above is derived
   * from the simulation and none of it is in it. Flying the same recipe twice
   * gives the same picture, tick for tick.
   */
  it('is a pure function of the recipe and the tick', () => {
    const again = fly(BOOST_PLATEAU_TICKS - 1);
    expect(again.released).toBe(AT_PEAK.released);
    for (let i = 0; i < AT_PEAK.views.length; i++) {
      expect(again.views[i]!.camera).toEqual(AT_PEAK.views[i]!.camera);
      expect(again.views[i]!.callout).toEqual(AT_PEAK.views[i]!.callout);
      expect(again.views[i]!.farewell).toEqual(AT_PEAK.views[i]!.farewell);
    }
  });

  /**
   * And the settle and the plateau end together, which is the fact the flown arc
   * is drawn on rather than a coincidence it relies on (spec 01 §7).
   */
  it('ends its plateau exactly where the settle ends', () => {
    expect(BOOST_PLATEAU_TICKS).toBe(SETTLE_TICKS);
  });
});
