/**
 * Spec [03 · §6](../../docs/spec/03-hud.md)'s sightings, and the two acceptance
 * criteria they carry:
 *
 * - *"A body on screen has no sighting, and one behind the climb has none; the
 *   count of sightings is a pure function of the bodies, the camera and what the
 *   picture can show."*
 * - *"No instruction text — arrows, `RISK ZONE`, `TURN` — is drawn anywhere in
 *   the world ... a sighting is held to the same line: its position carries the
 *   direction and no vector is drawn."*
 *
 * The second is a statement about what presentation state *does not carry*, and
 * that is the strongest form it can take: there is no direction on a
 * [`SightingView`](../../src/state/types.ts) for a renderer to draw an arrow
 * from, only a place on the edge.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { openRun, replayRun } from '../../src/sim/replay.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS } from '../../src/sim/units.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from '../../src/state/design.ts';
import { hueOf } from '../../src/state/identity.ts';
import { SIGHTING_RADIUS, SIGHTING_RANGE } from '../../src/state/sighting.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { parseDispatch } from '../../tools/dispatch.ts';
import { openField } from '../sim/fixtures.ts';

/**
 * One body, placed relative to the craft, and the picture of it.
 *
 * The craft sits on the corridor's centreline, which is where the camera always
 * is sideways ([`camera.ts`](../../src/state/camera.ts)), so an offset here is an
 * offset from the middle of the picture.
 */
const MIDDLE = DESIGN_WIDTH / 2;
function withBodyAt(x: number, y: number): PresentationState {
  const field = openField([createBody(MIDDLE + x, y, MEDIAN_RADIUS)]);
  return createPresentation(createInitialState(field, createCraft(MIDDLE, 0, 0, -300), 1));
}

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

describe('which bodies get one', () => {
  /** *"A mark pointing at a thing the player can see is clutter over the exact thing it was pointing at."* */
  it('never marks a body the picture is already showing', () => {
    expect(withBodyAt(0, -400).sightings).toEqual([]);
    expect(withBodyAt(300, -900).sightings).toEqual([]);
  });

  /** *"A mark below the craft points at somewhere it has already been."* */
  it('never marks a body behind the climb', () => {
    expect(withBodyAt(0, DESIGN_HEIGHT).sightings).toEqual([]);
    expect(withBodyAt(0, -DESIGN_HEIGHT).sightings.length).toBe(1);
  });

  /**
   * And none past **reach**. Spec 03 §6 records *"reach is not yet a number"* and
   * defers it to spec 17; the prototype carries one, and what is carried is the
   * behaviour it buys — past it the coast is long and featureless, and marking it
   * *"invites the player to aim past the interesting part of the field."*
   */
  it('never marks a body past reach', () => {
    expect(withBodyAt(0, -(SIGHTING_RANGE * 0.9)).sightings.length).toBe(1);
    expect(withBodyAt(0, -(SIGHTING_RANGE * 1.1)).sightings).toEqual([]);
  });

  /** A body whose disc merely touches the picture is on it, and gets none. */
  it('counts a body that only half fits as on screen', () => {
    const justInside = -(DESIGN_HEIGHT / 2) - MEDIAN_RADIUS * 0.5;
    const justOutside = -(DESIGN_HEIGHT / 2) - MEDIAN_RADIUS * 1.5;
    expect(withBodyAt(0, justInside).sightings).toEqual([]);
    expect(withBodyAt(0, justOutside).sightings.length).toBe(1);
  });

  /**
   * And a spent body has none, which §6 does not say and spec
   * [04 · §3](../../docs/spec/04-bodies.md) does: its lamp is out, and a
   * sighting is that lamp seen from further away.
   */
  it('never marks a spent body', () => {
    const field = fixtureField();
    const sim = createInitialState(field, fixtureCraft(), 1);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 300; tick++) {
      stepSim(sim, tick >= 20 && tick < 60 ? { pressed: true } : NO_INPUT);
      view = derive(view, sim);
    }
    const spent = view.bodies.flatMap((body, i) => (body.state === 'SPENT' ? [i] : []));
    expect(spent.length).toBeGreaterThan(0);
    for (const address of spent) {
      expect(view.sightings.some((mark) => mark.hue === hueOf(address))).toBe(false);
    }
  });
});

describe('where the mark sits', () => {
  /**
   * On the edge of the **design space**, in design-space coordinates — not on
   * the edge of whatever the device happens to show. Spec
   * [00 · §7](../../docs/spec/00-tokens.md): *"nothing the player reads is drawn
   * outside it, ever."*
   */
  it('is on the design space, inset by its own radius', () => {
    const mark = withBodyAt(0, -3000).sightings[0]!;
    expect(mark.y).toBeCloseTo(SIGHTING_RADIUS, 6);
    expect(mark.x).toBeCloseTo(MIDDLE, 6);
  });

  /**
   * **The position is the direction, and there is no vector.** A body off to one
   * side puts the mark to that side of the top edge; that is the whole of what a
   * sighting says about where.
   */
  it('moves along the edge with the body it is for', () => {
    const left = withBodyAt(-1800, -1800).sightings[0]!;
    const middle = withBodyAt(0, -1800).sightings[0]!;
    const right = withBodyAt(1800, -1800).sightings[0]!;
    expect(left.x).toBeLessThan(middle.x);
    expect(middle.x).toBeLessThan(right.x);
    expect(Object.keys(left).sort()).toEqual([
      'away',
      'bearing',
      'bloom',
      'energy',
      'hue',
      'offered',
      'radius',
      'strength',
      'x',
      'y',
    ]);
  });

  /**
   * **And it points now**, which reverses the ruling of the day before that it
   * must not (author, 2026-08-29). Its position on the edge still carries the
   * same fact; the arrow agrees with it rather than replacing it — so the two
   * cannot disagree about which way a body is.
   */
  it('points the way the body actually lies', () => {
    for (const [dx, dy] of [
      [0, -1800],
      [-1800, -1800],
      [1800, -1800],
    ] as const) {
      const mark = withBodyAt(dx, dy).sightings[0]!;
      expect(Math.cos(mark.bearing)).toBeCloseTo(dx / Math.hypot(dx, dy), 6);
      expect(Math.sin(mark.bearing)).toBeCloseTo(dy / Math.hypot(dx, dy), 6);
      // The mark sits on the same ray it points along.
      const along = Math.atan2(mark.y - DESIGN_HEIGHT / 2, mark.x - MIDDLE);
      expect(Math.cos(along)).toBeCloseTo(Math.cos(mark.bearing), 6);
    }
  });

  it('never leaves the design space', () => {
    for (const view of shippedRun()) {
      for (const mark of view.sightings) {
        // A hair of tolerance: the inset is exact arithmetic on a ratio, and a
        // ratio of two large coordinates does not come back to the same bits.
        expect(mark.x).toBeGreaterThan(mark.radius - 1e-6);
        expect(mark.x).toBeLessThan(DESIGN_WIDTH - mark.radius + 1e-6);
        expect(mark.y).toBeGreaterThan(mark.radius - 1e-6);
        expect(mark.y).toBeLessThan(DESIGN_HEIGHT - mark.radius + 1e-6);
      }
    }
  });

  /**
   * And never below the thumb line, which spec 00 §7 rules nothing readable may
   * cross. It falls out of the geometry rather than being clamped: a body ahead
   * of the climb cannot be far enough below the camera to put a mark down there,
   * because the camera never trails the craft by half a screen.
   */
  it('never lands under the player’s thumb', () => {
    for (const view of shippedRun()) {
      for (const mark of view.sightings) expect(mark.y).toBeLessThan(THUMB_LINE);
    }
  });
});

describe('what it says', () => {
  it('wears the body’s own hue and nothing else about it', () => {
    const field = fixtureField();
    const sim = createInitialState(field, fixtureCraft(), 1);
    const view = createPresentation(sim);
    expect(view.sightings.length).toBeGreaterThan(0);
    for (const mark of view.sightings) {
      expect(field.bodies.some((_, address) => hueOf(address) === mark.hue)).toBe(true);
    }
  });

  /**
   * Flat E1, and that is where the distance information went (§6): *"brightness
   * is the game's only ordinal channel and hue is already spent on identity, so
   * if a sighting ever needs to say how far, stepping its energy is the one
   * answer that needs no label."*
   */
  /**
   * **It says how far, twice**: as a number, and as brightness. Spec 03 §6
   * recorded both as unbuilt — the label because Direction 03 refused it, the
   * fade because nothing replaced it — and the author ruled them back in on
   * 2026-08-29: *"the distance labels, I think, are a different class, and I
   * personally like the more technical, blueprint-y look of the pointers with
   * distances."*
   */
  it('says how far, as a number and as brightness', () => {
    // Both off the picture: a body nearer than half the design space is on it,
    // and a body on it has no sighting at all.
    const near = withBodyAt(0, -1500).sightings[0]!;
    const far = withBodyAt(0, -3500).sightings[0]!;
    expect(near.away).toBeCloseTo(1500, 6);
    expect(far.away).toBeCloseTo(3500, 6);
    expect(far.strength).toBeLessThan(near.strength);
    // The step stays E1: the fade is an alpha, not a second ordinal channel.
    expect(near.energy).toBe(1);
    expect(far.energy).toBe(1);
    expect(far.bloom).toBe(near.bloom);
  });

  /**
   * A body **a press would take** is at full strength whatever the fade would
   * otherwise say — the difference between *there is a body over there* and *take
   * it now*. Spec 03 §6 records the prototype's measurement of the gap that
   * leaves: inside the grab window for 1.03s, and able to see the body itself for
   * 0.23 of it.
   */
  it('is full strength for the body a press would take', () => {
    const field = fixtureField();
    const sim = createInitialState(field, fixtureCraft(), 1);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 200; tick++) {
      stepSim(sim, NO_INPUT);
      view = derive(view, sim);
      const offered = view.sightings.filter((mark) => mark.offered);
      for (const mark of offered) expect(mark.strength).toBe(1);
    }
  });

  /**
   * *"Always, whether or not a body is held"* — the compass needs an orbit and
   * this does not, which is the whole reason it exists.
   */
  it('is drawn while a body is held too', () => {
    const held = shippedRun().filter(
      (view) => view.bodies.some((body) => body.held) && view.sightings.length > 0,
    );
    expect(held.length).toBeGreaterThan(100);
  });

  /** The count is a pure function of the world and the camera, so a replay repeats it. */
  it('counts the same way twice', () => {
    const counts = (views: PresentationState[]): number[] => views.map((v) => v.sightings.length);
    expect(counts(shippedRun())).toEqual(counts(shippedRun()));
  });
});
