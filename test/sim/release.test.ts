/**
 * Spec [01 · §8 and §9](../../docs/spec/01-swing.md): the release, and the
 * straight line it leaves on — plus
 * [ADR-0012](../../docs/adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)'s
 * **quality**, which is the half of the punch M1.3 owns.
 */
import { describe, expect, it } from 'vitest';
import { createCraft, headingOf, speedOf } from '../../src/sim/craft.ts';
import { circularSpeed } from '../../src/sim/kepler.ts';
import { qualityOf } from '../../src/sim/quality.ts';
import { release } from '../../src/sim/release.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { angleOf } from '../../src/sim/trig.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  DIVE_PAYBACK,
  PERMANENT_SHARE,
  SECONDS_PER_TICK,
} from '../../src/sim/units.ts';
import { holdWithoutGrabbing, openField } from './fixtures.ts';
import { BODY, ENVELOPE, LET_GO, PRESS, fly, geometry, placed, scaled } from './swing.ts';

describe('the direction', () => {
  /**
   * *"Exactly along the tangent ... on 100% of releases — this is exact, and it
   * is the one thing `CONTEXT.md` fixes about a release."* It costs nothing to
   * hold, because the craft's velocity has been tangential every tick since the
   * freeze: the nose points along the exit tangent for the whole of an orbit.
   */
  it('is exactly along the tangent, at every release from every geometry', () => {
    for (const g of ENVELOPE) {
      const s = fly(g, 200);
      for (const t of s.taken) {
        let off = t.heading - t.orbitAngle;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        const fromTangent = (Math.abs(Math.abs(off) - Math.PI / 2) * 180) / Math.PI;
        expect(
          fromTangent,
          `${g.grabDistance}/${g.approachSpeed}/${g.aim} at tick ${t.since}`,
        ).toBeLessThan(1);
      }
    }
  });

  /**
   * And it is the tangent the craft was already on: letting go turns nothing.
   * A release that redirected the craft would be a second verb, which
   * `VISION.md`'s first pillar calls a repeal rather than a feature.
   */
  it('is the heading the craft already had', () => {
    const state = placed(geometry(200, 150, 40));
    for (let tick = 0; tick < 90; tick++) stepSim(state, PRESS);
    const before = headingOf(state.craft);
    release(state);
    expect(headingOf(state.craft)).toBe(before);
  });
});

describe('the exit speed', () => {
  /**
   * *"The orbital speed at the release radius, plus the boost's permanent
   * share"* — 22% of the boost, the other 78% being the punch, which is spent
   * rather than kept.
   */
  it('is the orbital speed plus 22% of what the swing was worth', () => {
    const s = fly(geometry(200, 150, 20), 300);
    const peak = Math.max(...s.taken.map((t) => t.excess));
    const full = peak / PERMANENT_SHARE;
    for (const t of s.taken.filter(
      (t) => t.since >= BOOST_ARM_TICKS && t.since <= BOOST_PLATEAU_TICKS,
    )) {
      expect(Math.abs(t.exit - (t.onOrbit + PERMANENT_SHARE * full)) / t.exit).toBeLessThan(0.05);
    }
  });

  /**
   * **Not monotone in how long you hold**, and spec 01 §8 is emphatic about why:
   * *"holding longer is not 'more speed'; it is a different angle at a similar
   * speed. That is precisely what makes the timing a decision rather than a
   * greedy accumulation, and a rewrite in which holding monotonically pays has
   * removed the choice."*
   */
  it('falls well below its freeze value before it comes back', () => {
    for (const g of [geometry(200, 150, 20), geometry(300, 220, 60), geometry(150, 260, 0)]) {
      const s = fly(g, 200);
      const where = `${g.grabDistance}/${g.approachSpeed}/${g.aim}`;
      const firstSecond = s.taken.filter((t) => t.since <= 60);
      const atFreeze = firstSecond[0]!.exit;
      const trough = Math.min(...firstSecond.map((t) => t.exit));
      expect(1 - trough / atFreeze, where).toBeGreaterThan(0.2);
    }
  });

  /** And a release once the boost is gone is worth exactly the orbit and nothing more. */
  it('is exactly the orbital speed once the envelope has run out', () => {
    const s = fly(geometry(200, 150, 20), 300);
    for (const t of s.taken.filter((t) => t.since >= BOOST_ZERO_TICKS)) {
      expect(t.exit, `tick ${t.since}`).toBe(t.onOrbit);
    }
  });
});

describe('what the craft does next', () => {
  /**
   * Spec 01 §9: *"no drag, no gravity, no force of any kind"*, and it applies
   * from the first tick after a release just as it does anywhere else. The
   * punch is what makes this worth asserting *here*: ADR-0012 puts the kick
   * entirely in the transient and **none of it into permanent velocity**, so a
   * craft that has just let go of a body must coast exactly, not nearly.
   */
  it('coasts in an exact straight line at an exactly constant speed', () => {
    const state = placed(geometry(200, 150, 20));
    for (let tick = 0; tick < 90; tick++) stepSim(state, PRESS);
    stepSim(state, LET_GO);

    const speed = speedOf(state.craft);
    const heading = headingOf(state.craft);
    for (let tick = 0; tick < 600; tick++) {
      stepSim(state, NO_INPUT);
      expect(Math.abs(speedOf(state.craft) / speed - 1)).toBeLessThan(1e-9);
      expect(Math.abs(headingOf(state.craft) - heading)).toBeLessThan(1e-6);
    }
  });

  it('feels nothing from the body it just let go of, however close it passes', () => {
    const state = createInitialState(openField([BODY]), placed(geometry(200, 150, 20)).craft, 1);
    for (let tick = 0; tick < 90; tick++) stepSim(state, PRESS);
    stepSim(state, LET_GO);
    const { vx, vy } = state.craft;
    for (let tick = 0; tick < 300; tick++) stepSim(state, NO_INPUT);
    expect(state.craft.vx).toBe(vx);
    expect(state.craft.vy).toBe(vy);
  });
});

describe('quality, which the punch is scaled by', () => {
  /** *"A tap pays nothing, structurally rather than by a guard."* */
  it('is nothing for a craft that is holding nothing', () => {
    const state = placed(geometry(200, 150, 20));
    expect(qualityOf(state)).toBe(0);
  });

  /**
   * A swing that froze is graded on **when it let go** — its position on the
   * boost envelope. Zero at the freeze, full across the plateau, gone by 2.6s.
   */
  it('follows the envelope for a swing that froze an orbit', () => {
    const state = placed(geometry(200, 150, 20));
    const read: Record<number, number> = {};
    let frozenAt: number | null = null;
    for (let tick = 0; tick < 260; tick++) {
      stepSim(state, PRESS);
      if (!state.orbit) continue;
      // Counted here rather than read out of the orbit, so the envelope's clock
      // is checked against a tick count and not against itself.
      frozenAt ??= tick;
      read[tick - frozenAt] = qualityOf(state);
    }
    expect(read[0]).toBe(0);
    for (let tick = 1; tick < BOOST_ARM_TICKS; tick++) {
      expect(read[tick], `arming at tick ${tick}`).toBeCloseTo(tick / BOOST_ARM_TICKS, 10);
    }
    expect(read[BOOST_ARM_TICKS]).toBe(1);
    expect(read[BOOST_PLATEAU_TICKS]).toBe(1);
    expect(read[BOOST_ZERO_TICKS]).toBe(0);
  });

  /**
   * It is graded on *when*, and on nothing else. ADR-0012: *"a player tapping
   * beside bodies gets the punch and keeps none of it, while a player flying
   * well gets the punch **and** the boost underneath it"* — so a shallow swing
   * that is paid no boost at all still has a full-quality moment, and feel and
   * economy stay separate channels.
   */
  it('does not read depth, so a swing that pays nothing still has its moment', () => {
    const shallow = placed(geometry(350, 400, 300));
    let best = 0;
    for (let tick = 0; tick < 260; tick++) {
      stepSim(shallow, PRESS);
      best = Math.max(best, qualityOf(shallow));
    }
    expect(fly(geometry(350, 400, 300), 240).depth).toBeLessThan(0.5);
    expect(best).toBe(1);
  });

  /**
   * A release that never froze an orbit has no envelope, *"but the body is still
   * bending its heading, so it is graded on how hard it is turning at the
   * instant the button comes up."* Read against the tightest bend the body could
   * hold the craft in at that distance, so it means the same thing at every
   * radius and around every body.
   */
  it('reads the bend for a swing that has not frozen yet', () => {
    const radius = scaled(300);

    // Aimed exactly at the body: the pull is exactly along the velocity, there
    // is no bend at all, and a release here is worth exactly nothing. This is
    // the tap paying nothing structurally — the arithmetic has a zero in it, and
    // no guard is checking anything.
    const straightIn = createInitialState(openField([BODY]), createCraft(-radius, 0, 900, 0), 1);
    holdWithoutGrabbing(straightIn);
    expect(qualityOf(straightIn)).toBe(0);

    // Broadside at the same distance and speed: the same body is now bending it
    // as hard as it can, and the reading follows.
    const broadside = createInitialState(openField([BODY]), createCraft(-radius, 0, 0, 900), 1);
    holdWithoutGrabbing(broadside);
    expect(qualityOf(broadside)).toBeGreaterThan(qualityOf(straightIn));

    // At exactly the speed of a circle here, the body is bending the craft
    // exactly as much as a circle would, which is what a reading of one means.
    const circular = createInitialState(
      openField([BODY]),
      createCraft(-radius, 0, 0, circularSpeed(BODY.mass, radius)),
      1,
    );
    holdWithoutGrabbing(circular);
    expect(qualityOf(circular)).toBeCloseTo(1, 2);

    // And it never exceeds that, at any point of any dive in the envelope.
    for (const g of ENVELOPE) {
      const state = placed(g);
      for (let tick = 0; tick < 200; tick++) {
        stepSim(state, PRESS);
        if (state.orbit) break;
        const q = qualityOf(state);
        expect(q, `${g.grabDistance}/${g.approachSpeed}/${g.aim}`).toBeGreaterThanOrEqual(0);
        expect(q, `${g.grabDistance}/${g.approachSpeed}/${g.aim}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is nothing again the moment the craft lets go', () => {
    const state = placed(geometry(200, 150, 20));
    for (let tick = 0; tick < 90; tick++) stepSim(state, PRESS);
    expect(qualityOf(state)).toBeGreaterThan(0);
    stepSim(state, LET_GO);
    expect(qualityOf(state)).toBe(0);
  });

  /**
   * And it is one number with one definition. The envelope half and the bend
   * half are the same skill *"wearing different clothes"*, so both are read
   * through this one function — there is nowhere a second definition could be
   * added without deleting this test.
   */
  it('is the same reading whether the swing froze or not', () => {
    const frozen = placed(geometry(200, 150, 20));
    for (let tick = 0; tick < 90; tick++) stepSim(frozen, PRESS);
    const diving = placed(geometry(350, 60, 120));
    stepSim(diving, PRESS);
    stepSim(diving, PRESS);
    for (const state of [frozen, diving]) {
      const q = qualityOf(state);
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });
});

describe('a release during the dive', () => {
  /**
   * **No boost, and no change of direction** — but the speed goes back, and that
   * is [`DIVE_PAYBACK`](../../src/sim/units.ts)'s ruling of 2026-08-30.
   *
   * This test used to assert that a dive release changed the velocity **not at
   * all**, which is what `release.ts` claimed and what spec 01 §7 assumed when it
   * called the arming ramp a safety catch against tap-throughs. Measured over the
   * author's own 129 swings it was false by +548 design units/s at the median:
   * the dive had already helped itself on the way in, and gravity stops at a
   * release, so nothing ever took the fall back.
   *
   * So what is asserted now is the pair that is actually true. **The heading is
   * untouched** — turning the craft onto a tangent would hand the player a way to
   * steer, which is a second verb — and **the speed returns toward what the press
   * found**, by the dial's own share. Position is untouched either way.
   *
   * What it *does* get is the **punch**, which is a different channel: ADR-0012
   * grades an unfrozen release on how hard the body is bending its heading, and
   * pays a transient on that. The transient rides beside the velocity rather than
   * in it, so it is invisible to both assertions below.
   */
  it('gives back the share of the fall the dial names, and turns the craft not at all', () => {
    const state = placed(geometry(350, 60, 120));
    stepSim(state, PRESS);
    for (let tick = 0; tick < 20; tick++) stepSim(state, PRESS);
    expect(state.orbit).toBeNull();
    const entry = state.dive!.entrySpeed;

    const { x, y } = state.craft;
    const before = speedOf(state.craft);
    const heading = headingOf(state.craft);
    // The dive really did hand the craft speed, or this proves nothing.
    expect(before).toBeGreaterThan(entry);

    release(state);
    expect({ x: state.craft.x, y: state.craft.y }).toEqual({ x, y });
    // Within an ulp rather than exactly, and the ulp is honest: the payback
    // scales `vx` and `vy` by one factor, and the two products round
    // independently. Spec 01 §9's *exactly* constant heading is about **coasting**
    // — after this tick nothing touches the velocity again — and the punch keeps
    // its own exactness by riding beside the velocity rather than in it.
    expect(Math.abs(headingOf(state.craft) - heading)).toBeLessThan(1e-12);
    expect(speedOf(state.craft)).toBeCloseTo(before + DIVE_PAYBACK * (entry - before), 9);
    expect(state.heldBody).toBeNull();
  });

  /**
   * And the two ends of the dial, stated so that moving it is a decision. At 0
   * this is the behaviour the ruling replaced; at 1 an unfinished swing is exactly
   * speed-neutral and buys a heading and nothing else.
   */
  it('is a dial between keeping the fall and giving all of it back', () => {
    expect(DIVE_PAYBACK).toBeGreaterThanOrEqual(0);
    expect(DIVE_PAYBACK).toBeLessThanOrEqual(1);
  });

  it('leaves the craft coasting exactly, like any other release', () => {
    const state = placed(geometry(350, 60, 120));
    for (let tick = 0; tick < 21; tick++) stepSim(state, PRESS);
    stepSim(state, LET_GO);
    const speed = speedOf(state.craft);
    for (let tick = 0; tick < 300; tick++) stepSim(state, NO_INPUT);
    expect(Math.abs(speedOf(state.craft) / speed - 1)).toBeLessThan(1e-12);
  });
});

describe('the whole verb, end to end', () => {
  it('presses, holds, lets go, and coasts away in a straight line', () => {
    const state = placed(geometry(200, 150, 20));
    const seen: string[] = [];
    for (let tick = 1; tick <= 200; tick++) {
      stepSim(state, tick < 90 ? PRESS : LET_GO);
      const now =
        state.heldBody === null ? 'coasting' : state.orbit === null ? 'diving' : 'on the orbit';
      if (seen[seen.length - 1] !== now) seen.push(now);
    }
    expect(seen).toEqual(['diving', 'on the orbit', 'coasting']);
    expect(angleOf(state.craft.vx, state.craft.vy)).toBe(headingOf(state.craft));
    expect(SECONDS_PER_TICK * 200).toBeCloseTo(3.333, 3);
  });
});
