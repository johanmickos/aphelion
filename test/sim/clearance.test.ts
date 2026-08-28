/**
 * Spec [01 · §4](../../docs/spec/01-swing.md): clearance, *"the single most
 * load-bearing behaviour in the swing and the easiest to get wrong."*
 *
 * The two guarantees are exact and are tested as such: **no grab may leave the
 * craft below the floor**, and **no grab may eject the craft it caught**. The
 * rate at which the clearance fires is a percentile of real play and lives in
 * [`corpus.test.ts`](./corpus.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { clearanceTicksFor, easeClearance, needsClearance } from '../../src/sim/clearance.ts';
import { speedOf } from '../../src/sim/craft.ts';
import { escapeSpeedAt, momentumToReach, energyAt } from '../../src/sim/gravity.ts';
import { angularMomentum } from '../../src/sim/kepler.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { angleOf } from '../../src/sim/trig.ts';
import {
  CLEARANCE_ESCAPE_FRACTION,
  CLEARANCE_TICKS_MAX,
  CLEARANCE_TICKS_MIN,
  CLEARANCE_TURN_PER_TICK,
  SECONDS_PER_TICK,
} from '../../src/sim/units.ts';
import { openField } from './fixtures.ts';
import { BODY, ENVELOPE, FLOOR, PRESS, fly, geometry, placed } from './swing.ts';

describe('when it fires', () => {
  /**
   * *"The unperturbed periapsis of the current path is inside the floor."*
   * Checked against the closed-form statement of the same thing — a craft whose
   * angular momentum is short of what the floor asks for at its energy — so the
   * test asserts the rule rather than restating the implementation's branch.
   */
  it('fires exactly when the path the craft is on would strike inside the floor', () => {
    for (const g of ENVELOPE) {
      const craft = placed(g).craft;
      const r = distance(0, 0, craft.x, craft.y);
      const receding = (craft.x * craft.vx + craft.y * craft.vy) / r >= 0;
      const needed = momentumToReach(BODY.mass, energyAt(BODY.mass, r, speedOf(craft)), FLOOR);
      const short =
        !receding &&
        needed !== null &&
        Math.abs(angularMomentum(craft.x, craft.y, craft.vx, craft.vy)) < needed;
      expect(needsClearance(craft, BODY), `${g.grabDistance}/${g.approachSpeed}/${g.aim}`).toBe(
        short,
      );
    }
  });

  it('does not fire on a path that was always going to clear', () => {
    // Aimed to pass wide, at a speed gravity cannot bend far enough to matter.
    expect(needsClearance(placed(geometry(350, 400, 340)).craft, BODY)).toBe(false);
  });

  it('does not fire on a craft already moving away from the body', () => {
    const state = placed(geometry(200, 300, 0));
    state.craft.vx = -state.craft.vx;
    expect(needsClearance(state.craft, BODY)).toBe(false);
  });
});

describe('the floor, which is the one guarantee a grab makes', () => {
  /**
   * Exact, over the whole stated envelope: *"where it fires, the resulting
   * periapsis is ≥ the floor on 100% of grabs."* This is the promise the press
   * makes, and it is held by the floor rather than only by the aim — where the
   * turn the clearance can afford falls short, spec 01 §4 rules that *"the floor
   * catches the remainder."*
   */
  it('is never breached, at any geometry in the envelope', () => {
    for (const g of ENVELOPE) {
      const swung = fly(g, 200);
      expect(swung.closest, `${g.grabDistance}/${g.approachSpeed}/${g.aim}`).toBeGreaterThanOrEqual(
        FLOOR - 1e-9,
      );
    }
  });

  /**
   * And it is a floor rather than a bounce. Spec 01 §10: contact while a body is
   * held *"bounces off the held body at `R + 12` with zero restitution"* — so a
   * craft driven straight into it slides along it, and nothing is returned.
   */
  it('takes the whole of the radial speed of a craft driven into it', () => {
    const state = createInitialState(openField([BODY]), placed(geometry(120, 60, 0)).craft, 1);
    stepSim(state, PRESS);
    let touched = false;
    let worstOutward = 0;
    for (let tick = 0; tick < 200; tick++) {
      stepSim(state, PRESS);
      const r = distance(0, 0, state.craft.x, state.craft.y);
      if (r < FLOOR * 1.0001) {
        touched = true;
        worstOutward = Math.max(
          worstOutward,
          (state.craft.x * state.craft.vx + state.craft.y * state.craft.vy) / r,
        );
      }
    }
    if (touched) expect(worstOutward).toBeLessThan(speedOf(state.craft) * 0.02);
  });
});

describe('the escape cap, which is why a grab cannot eject what it caught', () => {
  /**
   * *"Speed after the impulse is ≤ 0.98 × local escape speed on 100% of grabs,
   * so no grab can eject the craft it caught."* Read as what the clearance
   * leaves: it never raises a craft's speed above the cap, which is the whole of
   * the failure it exists to prevent — the prototype measured the textbook
   * alternative handing a craft at half escape speed up to 277 units/s and
   * putting it above escape.
   */
  it('never raises a craft above 0.98 of local escape speed', () => {
    // Read on the impulse itself rather than through a tick, because gravity
    // carries a diving craft past its local escape speed all on its own and
    // that is not the clearance's doing.
    for (const g of ENVELOPE) {
      const craft = placed(g).craft;
      for (let left = CLEARANCE_TICKS_MAX; left >= 1; left--) {
        const before = speedOf(craft);
        const r = distance(0, 0, craft.x, craft.y);
        const cap = CLEARANCE_ESCAPE_FRACTION * escapeSpeedAt(BODY.mass, r);
        easeClearance(craft, BODY, left);
        expect(speedOf(craft), `${g.grabDistance}/${g.approachSpeed}`).toBeLessThanOrEqual(
          Math.max(before, cap) * (1 + 1e-9),
        );
      }
    }
  });

  /**
   * And the consequence that matters, through the whole simulation: **a craft
   * that was bound to the body when it pressed is still bound when the impulse
   * has finished arriving.** Gravity conserves energy on its own, so anything
   * that fails this was added by the grab — which is exactly the failure spec 01
   * §4 records, *"I kind of shot off the planet at super speed."*
   */
  it('never unbinds a craft that was bound when it pressed', () => {
    for (const g of ENVELOPE) {
      const state = placed(g);
      const r0 = distance(0, 0, state.craft.x, state.craft.y);
      if (energyAt(BODY.mass, r0, speedOf(state.craft)) >= 0) continue;
      stepSim(state, PRESS);
      for (let tick = 0; tick < CLEARANCE_TICKS_MAX; tick++) stepSim(state, PRESS);
      const r = distance(0, 0, state.craft.x, state.craft.y);
      expect(
        energyAt(BODY.mass, r, speedOf(state.craft)),
        `${g.grabDistance}/${g.approachSpeed}/${g.aim}`,
      ).toBeLessThan(0);
    }
  });

  /** And it is never a brake: a clearance only ever turns or adds. */
  it('never slows a craft down', () => {
    for (const g of ENVELOPE.filter((g) => needsClearance(placed(g).craft, BODY))) {
      const state = placed(g);
      const before = speedOf(state.craft);
      stepSim(state, PRESS);
      expect(speedOf(state.craft), `${g.grabDistance}/${g.approachSpeed}`).toBeGreaterThan(
        before * 0.999,
      );
    }
  });
});

describe('how it arrives', () => {
  /**
   * **The rate is the characteristic and the duration is the consequence**
   * (author, 2026-08-28, flying it). Spec 01 §4 used to measure the *time* — five
   * ticks, 80 – 90ms — and said nothing about the rate, so a turn of 3.6° and a
   * turn of 62° were both paid in 83ms and the rate between them varied
   * seventeenfold. What that cost is measurable: nearly half of all grabs owe a
   * clearance, the median one owes 59.5°, and five ticks of that is 11.9° a tick
   * against a settled orbit's own p90 of 5.07°.
   *
   * So what is held here is the rate, over the geometries §4 is written in.
   * Measured on head-on dives, where gravity pulls exactly along the velocity and
   * contributes nothing to the heading — every degree the heading turns is the
   * clearance's.
   */
  it('turns no faster than the orbit it is handing the craft to', () => {
    // Three approaches owing very different turns: a distant slow one, the §4
    // geometry, and a close fast one, which is where the old fixed duration bit.
    for (const g of [geometry(320, 150, 0), geometry(200, 200, 0), geometry(150, 320, 0)]) {
      const state = placed(g);
      stepSim(state, PRESS);
      let previous = angleOf(state.craft.vx, state.craft.vy);
      let worst = 0;
      for (let tick = 0; tick < CLEARANCE_TICKS_MAX; tick++) {
        stepSim(state, PRESS);
        const now = angleOf(state.craft.vx, state.craft.vy);
        worst = Math.max(worst, Math.abs(now - previous));
        previous = now;
      }
      // The bound is honoured where the time is there and the cap wins where it
      // is not, so the ceiling is the turn spread over the longest ease allowed.
      const ceiling = Math.max(CLEARANCE_TURN_PER_TICK, Math.PI / 2 / CLEARANCE_TICKS_MAX);
      expect(worst, `${g.grabDistance} out at ${g.approachSpeed}`).toBeLessThanOrEqual(ceiling);
    }
  });

  /**
   * *"A single-tick application is a failure however correct the endpoint"* —
   * still the rule, and now the floor of a band rather than the whole of it.
   */
  it('never lands the turn in one tick, and never runs past its cap', () => {
    const state = placed(geometry(200, 200, 0));
    stepSim(state, PRESS);

    const headings = [angleOf(state.craft.vx, state.craft.vy)];
    for (let tick = 0; tick < CLEARANCE_TICKS_MAX + 3; tick++) {
      stepSim(state, PRESS);
      headings.push(angleOf(state.craft.vx, state.craft.vy));
    }

    const steps = headings.slice(1).map((h, i) => Math.abs(h - headings[i]!));
    const total = headings[CLEARANCE_TICKS_MAX]! - headings[0]!;
    expect(Math.abs(total)).toBeGreaterThan(0.05);

    const shortest = CLEARANCE_TICKS_MIN * SECONDS_PER_TICK;
    expect(shortest).toBeGreaterThanOrEqual(0.08);
    expect(shortest).toBeLessThanOrEqual(0.09);

    // No tick carries the impulse on its own.
    for (let i = 0; i < CLEARANCE_TICKS_MIN; i++) {
      expect(steps[i]! / Math.abs(total), `tick ${i + 1} of the ease`).toBeLessThan(0.35);
    }
    // And it is over by the cap, whatever it was owed.
    for (let i = CLEARANCE_TICKS_MAX; i < steps.length; i++) {
      expect(steps[i]!, `tick ${i + 1}, after the ease`).toBeLessThan(Math.abs(total) * 0.05);
    }
  });

  /**
   * The band exists so that a small turn is not stretched and a large one is not
   * snapped: the duration has to actually move with the turn, or the rate bound
   * is decoration.
   */
  it('takes longer for a bigger turn, between the two ends of the band', () => {
    const gentle = clearanceTicksFor(placed(geometry(320, 150, 60)).craft, BODY);
    const hard = clearanceTicksFor(placed(geometry(150, 320, 0)).craft, BODY);
    expect(gentle).toBe(CLEARANCE_TICKS_MIN);
    expect(hard).toBeGreaterThan(gentle);
    expect(hard).toBeLessThanOrEqual(CLEARANCE_TICKS_MAX);

    // And the cap is reachable rather than theoretical: the head-on approaches
    // §4 is written on are exactly the ones that run out of band.
    const capped = ENVELOPE.filter(
      (g) => clearanceTicksFor(placed(g).craft, BODY) === CLEARANCE_TICKS_MAX,
    );
    expect(capped.length).toBeGreaterThan(0);
  });

  /**
   * The endpoint being correct is not enough, but it does have to be correct: a
   * head-on dive that has been lifted arrives at the floor rather than near it.
   */
  it('lands the dive it lifted on the floor', () => {
    const swung = fly(geometry(200, 200, 0), 200);
    expect(swung.closest / FLOOR).toBeGreaterThan(0.999);
    expect(swung.closest / FLOOR).toBeLessThan(1.02);
  });
});
