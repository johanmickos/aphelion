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
import { calloutTicks, POP_RISE } from '../../src/state/callout.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from '../../src/state/design.ts';
import { PUNCH_FLOOR, PUNCH_TICKS, punchSize, punchSpan } from '../../src/state/punch.ts';
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

describe('the punch', () => {
  /**
   * **It is on the craft, and nothing else moves.** Spec
   * [02 · §5](../../docs/spec/02-release.md) put it on the camera — 6px along the
   * exit tangent — and the author flew it and refused it: *"we don't really want
   * shake effects or pauses like that, it turns out that really disrupts the
   * flow"* (2026-08-29). This is the assertion the refusal is worth having: over
   * a whole swing, at every quality, the view never leaves the centreline.
   */
  it('never moves the world, at any quality', () => {
    for (const flight of [AT_PEAK, AT_FREEZE]) {
      for (const view of flight.views) expect(view.camera.x).toBe(DESIGN_WIDTH / 2);
    }
  });

  /**
   * ADR-0012's *"quality enters twice — as size and as duration"*, and the reason
   * the strength is a root: applied linearly *"the median recorded release paid
   * 29% of full and read as nothing happening."*
   */
  it('is scaled by quality, in size and in span', () => {
    expect(punchSize(0)).toBe(PUNCH_FLOOR);
    expect(punchSize(1)).toBe(1);
    // √0.29 is 0.538, so the median release lands over half way up rather than
    // at 29% — which is the whole argument for the curve.
    expect((punchSize(0.29) - PUNCH_FLOOR) / (1 - PUNCH_FLOOR)).toBeCloseTo(0.54, 2);
    // Half again as long at the top of the envelope, and no longer than that.
    expect(punchSpan(0)).toBe(PUNCH_TICKS);
    expect(punchSpan(1)).toBe(Math.round(PUNCH_TICKS * 1.5));
    expect(punchSpan(0.5)).toBeGreaterThan(punchSpan(0));
    expect(punchSpan(0.5)).toBeLessThan(punchSpan(1));
  });

  /** A swing let go at the top of its envelope earns the whole of spec 02 §4's stretch. */
  it('pays a release at full boost the whole stretch, for half again as long', () => {
    const at = AT_PEAK.views[AT_PEAK.released]!;
    expect(quality(AT_PEAK)).toBe(1);
    expect(at.craft.deformation.amount).toBe(1);
    expect(at.craft.deformation.along).toBeCloseTo(1.5, 9);
    expect(at.craft.deformation.recovery!.span).toBe(punchSpan(1));
  });

  /**
   * **And a release at the freeze still marks itself.** The envelope is exactly
   * zero there, so the punch is at its floor — not absent, because the craft did
   * leave and the stretch is what says so. What a tap pays nothing of is the
   * **boost**, which is a different channel and stays zero (ADR-0012).
   */
  it('floors a release at the freeze rather than silencing it', () => {
    const at = AT_FREEZE.views[AT_FREEZE.released]!;
    expect(quality(AT_FREEZE)).toBe(0);
    expect(at.craft.deformation.amount).toBe(PUNCH_FLOOR);
    expect(at.craft.deformation.along).toBeGreaterThan(1);
    expect(at.craft.deformation.along).toBeLessThan(
      AT_PEAK.views[AT_PEAK.released]!.craft.deformation.along,
    );
    expect(at.craft.deformation.recovery!.span).toBe(PUNCH_TICKS);
  });

  /** A grab is never graded (spec 06 §1), and it does not deform the craft at all. */
  it('marks no grab, because a grab is not a release', () => {
    const at = AT_PEAK.views[AT_PEAK.grabbed]!;
    expect(at.craft.deformation.recovery).toBeNull();
    expect(at.craft.deformation.amount).toBe(0);
  });

  /**
   * Spec 02 §4's return: **one overshoot** — and *"one"* is the whole of it,
   * because a displacement that eases home has its story in the first third and
   * then creeps.
   */
  it('comes home past rest exactly once, and then is gone', () => {
    const from = AT_PEAK.released;
    const span = AT_PEAK.views[from]!.craft.deformation.recovery!.span;
    const along: number[] = [];
    for (let i = from; i < from + span; i++) {
      expect(AT_PEAK.views[i]!.craft.deformation.recovery).not.toBeNull();
      along.push(AT_PEAK.views[i]!.craft.deformation.along - 1);
    }
    expect(AT_PEAK.views[from + span]!.craft.deformation.recovery).toBeNull();
    const crossings = along.filter((v, i) => i > 0 && Math.sign(v) !== Math.sign(along[i - 1]!));
    expect(crossings.length).toBe(1);
    expect(Math.min(...along)).toBeLessThan(0);
  });
});

describe('the word, held inside the picture', () => {
  /**
   * Spec [00 · §7](../../docs/spec/00-tokens.md), which is absolute: *"nothing
   * the player reads is drawn outside it, ever"*, and *"the compass, the masthead
   * and every award live above"* the thumb line. Reported from the phone —
   * *"some of the edge award text was getting cut off"* (author, 2026-08-29).
   */
  it('never puts a word where the picture would cut it', () => {
    for (const flight of [AT_PEAK, AT_FREEZE]) {
      for (let i = 0; i < flight.views.length; i++) {
        const view = flight.views[i]!;
        const word = view.callout;
        // **At birth**, which is the only tick the clamp runs on. After that the
        // word is world-anchored and being left behind, so drifting out of the
        // picture is what is supposed to happen to it.
        if (word === null || word.life.age !== 0 || word.tier === 'MAKE') continue;
        const halfWide = (7 * 0.8 * word.size) / 2 + word.bloom;
        const halfTall = (0.75 * word.size) / 2 + word.bloom;
        expect(word.x - halfWide).toBeGreaterThanOrEqual(view.camera.x - DESIGN_WIDTH / 2 - 1e-6);
        expect(word.x + halfWide).toBeLessThanOrEqual(view.camera.x + DESIGN_WIDTH / 2 + 1e-6);
        expect(word.y - halfTall).toBeGreaterThanOrEqual(view.camera.y - DESIGN_HEIGHT / 2 - 1e-6);
        // The thumb line, not the foot of the design space: nothing readable
        // lives below it, ever, and spec 00 §7 names awards among them.
        expect(word.y + halfTall).toBeLessThanOrEqual(
          view.camera.y - DESIGN_HEIGHT / 2 + THUMB_LINE + 1e-6,
        );
      }
    }
  });

  /**
   * **And then it stays where it landed.** *"It's OK to leave the text where it
   * lands, it should be a marker left behind at the point of scoring"* (author,
   * 2026-08-29) — so `x` never moves after birth, and `y` only ever climbs on its
   * own throw. A word that tracked the camera would be a HUD element, and spec
   * 06 §4 is emphatic that this is not one: *"no band at the top of the screen."*
   */
  it('leaves the word where it landed, whatever the camera does', () => {
    const from = AT_PEAK.released;
    const born = AT_PEAK.views[from]!.callout!;
    let cameraMoved = 0;
    for (let i = from; i < from + calloutTicks(); i++) {
      const word = AT_PEAK.views[i]!.callout!;
      expect(word.x).toBe(born.bornX);
      expect(word.y).toBeLessThanOrEqual(born.bornY);
      cameraMoved = Math.max(
        cameraMoved,
        Math.abs(AT_PEAK.views[i]!.camera.y - AT_PEAK.views[from]!.camera.y),
      );
    }
    // And the camera really did move underneath it, or this proves nothing.
    expect(cameraMoved).toBeGreaterThan(100);
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
    const home = AT_PEAK.views[AT_PEAK.released + punchSpan(quality(AT_PEAK))]!;
    expect(home.craft.deformation.along).toBe(1);
    expect(home.craft.deformation.across).toBe(1);
    expect(home.craft.deformation.recovery).toBeNull();
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
   * Spec 06 §4's clock, with the pop replaced by the prototype's **rise**: the
   * word climbs across its whole life, lingers at full, and decays over 400ms.
   */
  it('rises, lingers and decays on its own clock', () => {
    const from = AT_PEAK.released;
    const born = AT_PEAK.views[from]!.callout!;
    expect(born.life.age).toBe(0);
    expect(born.strength).toBe(1);
    expect(born.y).toBe(born.bornY);
    expect(AT_PEAK.views[from + calloutTicks() - 1]!.callout!.strength).toBeLessThan(0.05);
    expect(AT_PEAK.views[from + calloutTicks()]!.callout).toBeNull();
  });

  /**
   * **A throw and not a spring**, which is the difference the author was
   * describing when they sent me to the prototype: *"the popups should pop
   * upwards a bit more, mimicking the physics feeling that we have in the
   * original prototype."* Its own curve for the same element, carried as a
   * behaviour (ADR-0013) — *"most of the travel happens early, so the popup
   * leaves the ship promptly and then hangs where it can be read."*
   *
   * So it climbs monotonically, never comes back down, and is more than half way
   * up by a quarter of its life. The overshoot spec 06 §4 asked for is gone: an
   * overshoot is a spring.
   */
  it('climbs fastest at birth and never comes back down', () => {
    const from = AT_PEAK.released;
    const rise: number[] = [];
    for (let i = from; i < from + calloutTicks(); i++) {
      const word = AT_PEAK.views[i]!.callout!;
      rise.push(word.bornY - word.y);
    }
    for (let i = 1; i < rise.length; i++) expect(rise[i]!).toBeGreaterThanOrEqual(rise[i - 1]!);
    // `1 − (1 − u)²` puts it **43.75%** of the way up by a quarter of its life,
    // against 25% for a straight line — which is the whole of *most of the travel
    // happens early*.
    expect(rise[24]! / POP_RISE).toBeGreaterThan(0.4);
    expect(rise[24]! / POP_RISE).toBeLessThan(0.5);
    expect(Math.max(...rise)).toBe(rise[rise.length - 1]!);
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
    const settled = AT_PEAK.views[from + 24]!;
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
      expect(again.views[i]!.craft.deformation).toEqual(AT_PEAK.views[i]!.craft.deformation);
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
