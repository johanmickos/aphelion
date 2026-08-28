/**
 * Spec [01 · §10](../../docs/spec/01-swing.md)'s four endings, and the shape of
 * the run they end.
 *
 * The acceptance for [M1.4](../../docs/plan/m1-the-swing.md) is *"a run ends for
 * each distinct reason and reports which"*, and that sentence is already an
 * observable: nothing below reaches into the simulation for a flag, because the
 * ending **is** what the simulation says out loud.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { bodyOnOffer, grabRange } from '../../src/sim/grab.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { clearedAbove } from '../../src/sim/run.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import type { Field, SimState } from '../../src/sim/types.ts';
import { CORRIDOR_GRACE, FELL_BEHIND_GAP, SCALE } from '../../src/sim/units.ts';
import type { Body } from '../../src/sim/body.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';
import { openField } from './fixtures.ts';
import { PRESS } from './swing.ts';
import { flyRun } from './run.ts';

const field = fixtureField();

/** Fly with one input held until the run ends, or give up. */
function until(state: SimState, input = NO_INPUT, ticks = 4000): SimState {
  for (let i = 0; i < ticks && state.ending === null; i++) stepSim(state, input);
  return state;
}

/** A craft in the fixture field, placed and pointed. */
function inField(x: number, y: number, vx: number, vy: number): SimState {
  return createInitialState(field, createCraft(x, y, vx, vy), 1);
}

describe('a run', () => {
  it('opens alive, with its mark where the craft is standing', () => {
    const state = createInitialState(field, fixtureCraft(), 1);
    expect(state.ending).toBe(null);
    expect(state.highWater).toBe(fixtureCraft().y);
  });

  /**
   * DAILY is one run, no retry, no lives (ADR-0007). A simulation that kept
   * ticking a dead craft would be a simulation with an opinion about what comes
   * next, and the debrief is spec 09's picture rather than this layer's.
   */
  it('does not advance once it has ended', () => {
    const state = until(inField(field.corridor.centreline, 0, 900 * SCALE, 0));
    expect(state.ending).toBe('OUT_OF_BOUNDS');

    const at = { tick: state.tick, x: state.craft.x, y: state.craft.y };
    for (let i = 0; i < 60; i++) stepSim(state, PRESS);
    expect(state.tick).toBe(at.tick);
    expect(state.craft.x).toBe(at.x);
    expect(state.craft.y).toBe(at.y);
    expect(state.ending).toBe('OUT_OF_BOUNDS');
  });
});

describe('out of bounds', () => {
  it('ends a run that leaves the corridor sideways', () => {
    const state = until(inField(field.corridor.centreline, 0, 900 * SCALE, 0));
    const across = Math.abs(state.craft.x - field.corridor.centreline);
    expect(state.ending).toBe('OUT_OF_BOUNDS');
    expect(across).toBeGreaterThan(field.corridor.halfWidth + CORRIDOR_GRACE);
  });

  /** The grace is four units and not a second line: inside it the run lives. */
  it('survives inside the four units of grace, and not past them', () => {
    const { centreline, halfWidth } = field.corridor;
    const inside = inField(centreline + halfWidth + CORRIDOR_GRACE * 0.9, 0, 0, -1);
    const outside = inField(centreline + halfWidth + CORRIDOR_GRACE * 1.1, 0, 0, -1);
    stepSim(inside, NO_INPUT);
    stepSim(outside, NO_INPUT);
    expect(inside.ending).toBe(null);
    expect(outside.ending).toBe('OUT_OF_BOUNDS');
  });

  /**
   * And out of the foot, which is the other half of the same ending.
   *
   * It needs a field of its own, because in the one the gate flies **the foot
   * cannot be reached** — the fell-behind line trails the mark by 700 and the
   * mark opens at the spawn, so it is always the higher of the two. That is
   * true of the prototype at this tuning too, and it is why the foot is a
   * backstop rather than a line anyone meets.
   */
  it('ends a run that falls out of the foot', () => {
    const shallow: Field = {
      bodies: field.bodies,
      corridor: { ...field.corridor, foot: 300 * SCALE },
    };
    const state = until(
      createInitialState(shallow, createCraft(field.corridor.centreline, 0, 0, 200 * SCALE), 1),
    );
    expect(state.ending).toBe('OUT_OF_BOUNDS');
    expect(state.craft.y).toBeGreaterThan(shallow.corridor.foot);
  });
});

describe('the fell-behind line', () => {
  it('ends a run that drops 700 units below its own best', () => {
    const start = -3000 * SCALE;
    // Well off the centreline, in a column the field puts nothing in: this is
    // about the line and not about hitting something on the way down.
    const state = until(inField(field.corridor.centreline + 800, start, 0, 120 * SCALE));
    expect(state.ending).toBe('FELL_BEHIND');
    expect(state.craft.y - start).toBeGreaterThanOrEqual(FELL_BEHIND_GAP);
  });

  /**
   * **The mark does not advance while a body is held, and this is the whole
   * reason.** An orbit is a round trip: the height gained going round its near
   * side is not ground kept, and counting it puts the line at the orbit's apex,
   * which the far side of the same orbit then flies straight into.
   *
   * The body here is deliberately enormous — 150 units of radius against the
   * field's 34 – 56 — because that is what it takes to make one orbit taller
   * than the 700 the line trails by. It is the recorded case magnified, not a
   * new one: the prototype reported the same fault on a settled orbit of its
   * own, on a craft *"that had not lost a pixel"*.
   */
  it('does not advance during a grab, so an orbit cannot fly into its own line', () => {
    // **The body is far larger than anything the field holds, and that is the
    // finding rather than a convenience.** An orbit has to be taller than the
    // 700 units the line trails by before the rule can save anything, and a
    // settled circle is twice the floor: with the fixture field's radii of
    // 34 – 56 the tallest orbit in the game is about 400 units, so *no swing
    // this field can produce reaches its own line*. The rule is carried because
    // spec 01 §10 measured it — the prototype reported it on *"a settled r =
    // 290 orbit"* that killed a craft *"that had not lost a pixel"* — and it is
    // exercised here at the size it starts to bite at.
    const big = createBody(0, 0, 400 * SCALE);
    const state = createInitialState(openField([big]), createCraft(-800 * SCALE, 0, 300, 0), 1);

    let highest = Infinity;
    let lowest = -Infinity;
    for (let i = 0; i < 3000 && state.ending === null; i++) {
      stepSim(state, PRESS);
      if (state.orbit === null) continue;
      highest = Math.min(highest, state.craft.y);
      lowest = Math.max(lowest, state.craft.y);
    }

    // The swing climbed further than the line trails and then came back down
    // through where it started. A mark that had followed it up would have left
    // the line above the craft's own path.
    expect(lowest - highest).toBeGreaterThan(FELL_BEHIND_GAP);
    expect(state.ending).toBe(null);
    expect(state.heldBody).toBe(0);
  });
});

describe('cleared', () => {
  /**
   * The win, and the line it happens at is **where the last body goes out of
   * grab range** rather than a chosen margin. The prototype paid to learn the
   * difference: ending the run at the topmost body's centre made the final body
   * unplayable — you reached for it and got a results screen.
   *
   * The craft climbs the column of the body that sets the line, so *out of
   * range* and *above the line* are the same distance and the test can hold them
   * to each other.
   */
  it('ends when nothing is left to grab, and not before', () => {
    // The body that sets the line is not always the highest one: grab range
    // scales with mass, so a large body below the crest can still be on offer
    // above a small body at it. The craft climbs that body's own column, so
    // *out of range* and *above the line* are the same distance.
    let setter: Body = field.bodies[0]!;
    for (const body of field.bodies) {
      if (body.y - grabRange(body) < setter.y - grabRange(setter)) setter = body;
    }
    const line = clearedAbove(field);
    expect(line).toBe(setter.y - grabRange(setter));
    const state = inField(setter.x, line + 400 * SCALE, 0, -200 * SCALE);

    let onOfferBefore: number | null = 0;
    for (let i = 0; i < 600 && state.ending === null; i++) {
      onOfferBefore = bodyOnOffer(state.field, state.craft);
      stepSim(state, NO_INPUT);
    }

    expect(state.ending).toBe('CLEARED');
    // Something was still on offer on the tick before, and nothing is now.
    expect(onOfferBefore).not.toBe(null);
    expect(bodyOnOffer(state.field, state.craft)).toBe(null);
  });

  it('does not end at the crest, where the last body is still reachable', () => {
    let crest = field.bodies[0]!;
    for (const body of field.bodies) if (body.y < crest.y) crest = body;
    const state = inField(crest.x, crest.y, 0, 0);
    stepSim(state, NO_INPUT);
    expect(state.ending).toBe(null);
    expect(bodyOnOffer(state.field, state.craft)).not.toBe(null);
  });
});

describe('over a corpus of flown runs', () => {
  const RUNS = 150;
  const flown = Array.from({ length: RUNS }, (_, i) => flyRun(field, fixtureCraft(), i + 1));
  const share = (ending: string): number =>
    flown.filter((run) => run.ending === ending).length / RUNS;

  /**
   * Spec 01 §10's one statistical tolerance: *"over a comparable corpus of real
   * play, out-of-bounds is the plurality ending, at 60% or more — if the rewrite
   * kills mostly by impact it has changed what the game is about."*
   *
   * The corpus is a stand-in and [`run.ts`](./run.ts) says so in detail. What it
   * reproduces is the two distributions spec 01 measured; what it cannot
   * reproduce is a player's judgement about which release keeps a climb, which is
   * why it falls behind more often than the 8% real play did.
   */
  it('kills mostly by leaving the corridor, as the measured game does', () => {
    expect(share('OUT_OF_BOUNDS')).toBeGreaterThanOrEqual(0.6);
    for (const other of ['IMPACT', 'FELL_BEHIND', 'CLEARED']) {
      expect(share('OUT_OF_BOUNDS')).toBeGreaterThan(share(other));
    }
  });

  /**
   * And the corpus is a corpus of *play*.
   *
   * Every run reaches an ending, because a corpus of timeouts measures the
   * ceiling rather than the game; and every run flies several swings, because a
   * pilot that dies on its first grab is measuring the opening and calling it a
   * distribution. Both of those were true of earlier versions of this pilot,
   * which is why they are assertions rather than observations.
   */
  it('flies rather than falling over, and finishes every run', () => {
    expect(flown.filter((run) => run.ending === null)).toEqual([]);
    const grabs = flown.reduce((total, run) => total + run.grabs, 0) / RUNS;
    expect(grabs).toBeGreaterThan(2);
  });

  /** Each ending is reachable in ordinary play rather than only in a fixture. */
  it('reaches more than one of them', () => {
    const kinds = new Set(flown.map((run) => run.ending));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  /**
   * **You are not usually flying out of the corridor. You are being swung out of
   * it** — and this is the measurement under the camera clause rather than a
   * behaviour to preserve.
   *
   * Almost every out-of-bounds ending in the corpus happens with a body still
   * held, on the wide part of an oval, and the craft is a long way past the edge
   * of the picture when it lands: the corridor is 1.9× the design width and
   * [`camera.ts`](../../src/state/camera.ts) does not pan, so the last thing the
   * player sees is the craft leaving the frame. The band is loose because the
   * pilot holds a swing it cannot aim, which a player would not; what is not
   * loose is the direction, and that is the part the gate needs to know.
   */
  it('records how much of a death happens off the side of the picture', () => {
    const out = flown.filter((run) => run.ending === 'OUT_OF_BOUNDS');
    const held = out.filter((run) => run.endedHolding).length / out.length;
    const past = out.map((run) => run.endedAcross - DESIGN_WIDTH / 2);

    expect(held).toBeGreaterThan(0.5);
    expect(Math.min(...past)).toBeGreaterThan(0);
    // And it is not only the runs that end out there: most of them leave the
    // picture at some point and come back.
    const left = flown.filter((run) => run.widest > DESIGN_WIDTH / 2).length / RUNS;
    expect(left).toBeGreaterThan(0.5);
  });
});

/**
 * The layer criterion [AGENTS.md](../../AGENTS.md) §6 asks every step to write.
 *
 * **M1.4 builds nothing that is drawn.** The unravelling craft, the `SOS` strobe
 * and the debrief card are spec [07 · §6](../../docs/spec/07-boundary.md)'s and
 * are M3's and M6's, so death reaches the picture in a later milestone and not
 * this one. What must not happen in the meantime is presentation state quietly
 * learning about it — a derivation that read the ending would be a decay the
 * renderer could see and no test could name.
 *
 * When death *does* reach the picture, the fix is never to relax this: it is a
 * field on [`PresentationState`](../../src/state/types.ts), derived deliberately,
 * and this test is where that becomes visible.
 */
describe('the layer boundary', () => {
  it('keeps death out of the picture until it is put there on purpose', () => {
    const alive = createInitialState(field, fixtureCraft(), 1);
    const ended = createInitialState(field, fixtureCraft(), 1);
    ended.ending = 'IMPACT';

    expect(derive(createPresentation(alive), ended)).toEqual(
      derive(createPresentation(alive), alive),
    );
  });
});
