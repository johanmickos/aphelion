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
import { easeClearance, needsClearance } from '../../src/sim/clearance.ts';
import { speedOf } from '../../src/sim/craft.ts';
import { escapeSpeedAt, momentumToReach, energyAt } from '../../src/sim/gravity.ts';
import { angularMomentum } from '../../src/sim/kepler.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { angleOf } from '../../src/sim/trig.ts';
import {
  CLEARANCE_ESCAPE_FRACTION,
  CLEARANCE_TICKS,
  SECONDS_PER_TICK,
} from '../../src/sim/units.ts';
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
    const state = createInitialState({ bodies: [BODY] }, placed(geometry(120, 60, 0)).craft, 1);
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
      for (let left = CLEARANCE_TICKS; left >= 1; left--) {
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
      for (let tick = 0; tick < CLEARANCE_TICKS; tick++) stepSim(state, PRESS);
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
   * *"Eased over 5 frames (83ms at 60Hz) — never a snap"*, and spec 01 §4's
   * tolerance is emphatic: *"a single-tick application is a failure however
   * correct the endpoint."*
   *
   * Measured on a head-on dive, where gravity pulls exactly along the velocity
   * and therefore contributes nothing to the heading — so every degree the
   * heading turns is the clearance's.
   */
  it('spreads the turn over 80 – 90ms, in even shares', () => {
    const state = placed(geometry(200, 200, 0));
    stepSim(state, PRESS);

    const headings = [angleOf(state.craft.vx, state.craft.vy)];
    for (let tick = 0; tick < CLEARANCE_TICKS + 3; tick++) {
      stepSim(state, PRESS);
      headings.push(angleOf(state.craft.vx, state.craft.vy));
    }

    const steps = headings.slice(1).map((h, i) => Math.abs(h - headings[i]!));
    const total = headings[CLEARANCE_TICKS]! - headings[0]!;
    expect(Math.abs(total)).toBeGreaterThan(0.05);

    const spread = CLEARANCE_TICKS * SECONDS_PER_TICK;
    expect(spread).toBeGreaterThanOrEqual(0.08);
    expect(spread).toBeLessThanOrEqual(0.09);

    // No tick carries the impulse on its own.
    for (let i = 0; i < CLEARANCE_TICKS; i++) {
      expect(steps[i]! / Math.abs(total), `tick ${i + 1} of the ease`).toBeLessThan(0.35);
    }
    // And it is finished when it said it would be.
    for (let i = CLEARANCE_TICKS; i < steps.length; i++) {
      expect(steps[i]!, `tick ${i + 1}, after the ease`).toBeLessThan(Math.abs(total) * 0.02);
    }
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
