/**
 * The top band's **facts** — spec [03 · §2](../../docs/spec/03-hud.md)'s three
 * sublines, its pop, and the one input the BANK chip's opacity is a function of.
 *
 * Where they are drawn is `test/render/hud.test.ts`'s; what they say is here,
 * because spec 03 §3's whole claim is that those are two different questions:
 * *"nothing moves between states; only energy and content change."*
 */
import { describe, expect, it } from 'vitest';
import { POP_TICKS, RISING_FLOOR, RISING_TICKS, NO_HUD, hudOf } from '../../src/state/hud.ts';
import { OUTER_BAND } from '../../src/state/boundary.ts';
import type { SimState } from '../../src/sim/types.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

/** Just enough of a world for the band to read. */
const world = (speed: number, heldBody: number | null = null): SimState =>
  ({ craft: { vx: speed, vy: 0 }, heldBody }) as unknown as SimState;

/** And just enough of a picture: the boundary, which is the only thing it looks at. */
const seen = (presence: number, closing: number): Omit<PresentationState, 'hud'> =>
  ({ boundary: [{ presence, closing, away: OUTER_BAND }] }) as unknown as Omit<
    PresentationState,
    'hud'
  >;

const quiet = seen(0, 0);

describe('the subline', () => {
  /**
   * *"States the current fact."* A coasting craft feels no gravity at all (spec
   * 01 §2), so its speed is constant and the line is plain.
   */
  it('is plain while nothing is happening', () => {
    expect(hudOf(NO_HUD, quiet, world(700), false, 700).subline).toBe('PLAIN');
  });

  /** It says RISING while the craft is being accelerated, and latches so it cannot flicker. */
  it('says RISING while the craft is gaining speed, and holds', () => {
    let hud = hudOf(NO_HUD, quiet, world(700 + RISING_FLOOR), false, 700);
    expect(hud.subline).toBe('RISING');
    // It holds for its own span with the speed flat, and then it goes.
    for (let tick = 1; tick < RISING_TICKS; tick++) {
      hud = hudOf(hud, quiet, world(700), false, 700);
      expect(hud.subline).toBe('RISING');
    }
    expect(hudOf(hud, quiet, world(700), false, 700).subline).toBe('PLAIN');
  });

  /** And a speed that moves by less than the floor is arithmetic rather than a fact. */
  it('ignores a rise smaller than its floor', () => {
    expect(hudOf(NO_HUD, quiet, world(700.0001), false, 700).subline).toBe('PLAIN');
  });

  /**
   * **TOWARD EDGE wins, and only while the edge is drawn.** The author's ruling
   * of 2026-09-01 is that the boundary is off screen for most of play and *"I
   * don't want to signal danger during normal gameplay"* — so a subline that
   * announced it with nothing on screen would be doing exactly that.
   */
  it('says TOWARD EDGE only when the boundary is on screen and being closed on', () => {
    const rising = world(700 + RISING_FLOOR);
    expect(hudOf(NO_HUD, seen(0.5, 200), rising, false, 700).subline).toBe('TOWARD_EDGE');
    // Drawn but not being closed on: not a fact about risk.
    expect(hudOf(NO_HUD, seen(0.5, 0), rising, false, 700).subline).toBe('RISING');
    // Closing but off screen: the ruling.
    expect(hudOf(NO_HUD, seen(0, 200), rising, false, 700).subline).toBe('RISING');
  });
});

describe('the pop', () => {
  /** Spec 03 §2: *"digits pop to 120% on a release and settle in 180ms."* */
  it('is struck by a release and gone in 180ms', () => {
    let hud = hudOf(NO_HUD, quiet, world(700), true, 700);
    expect(hud.pop).not.toBeNull();
    expect(hud.pop!.age).toBe(0);
    for (let tick = 1; tick < POP_TICKS; tick++) hud = hudOf(hud, quiet, world(700), false, 700);
    expect(hud.pop).not.toBeNull();
    expect(hudOf(hud, quiet, world(700), false, 700).pop).toBeNull();
  });
});

describe('engagement', () => {
  /** The BANK chip's one input, and it is a fact about the simulation. */
  it('is exactly whether a body is held', () => {
    expect(hudOf(NO_HUD, quiet, world(700, null), false, 700).engaged).toBe(false);
    expect(hudOf(NO_HUD, quiet, world(700, 3), false, 700).engaged).toBe(true);
  });
});

describe('the shipped run', () => {
  const RUN = pricedRun(shippedRecipe());

  /** Engagement tracks the held body over a real flight, tick for tick. */
  it('agrees with the picture about what is held', () => {
    for (const view of RUN.views) {
      expect(view.hud.engaged).toBe(view.bodies.some((body) => body.held));
    }
  });

  /** And the run reaches more than one subline, or the rules above are untested. */
  it('says more than one thing over a run', () => {
    expect(new Set(RUN.views.map((view) => view.hud.subline)).size).toBeGreaterThan(1);
  });
});
