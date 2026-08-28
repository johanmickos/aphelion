/**
 * Spec [01 · §3](../../docs/spec/01-swing.md): the grab.
 *
 * *"One press. It takes exactly one body, and the choice is a fact rather than a
 * threshold."* Every tolerance in §3 is here except the refusal rates, which are
 * percentiles of real play and are in [`corpus.test.ts`](./corpus.test.ts) with
 * the caveat they need.
 *
 * Lengths are design units; spec 01's prototype figures are a third of these.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { attemptGrab, bodyOnOffer, grabRange } from '../../src/sim/grab.ts';
import { distance } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { MEDIAN_RADIUS, LEAD_SECONDS, SCALE } from '../../src/sim/units.ts';
import { openField } from './fixtures.ts';
import { BODY, LET_GO, PRESS, placed, geometry, scaled } from './swing.ts';

/** Spec 01 §3's grab range of 560 prototype units. */
const RANGE = scaled(560);

function world(bodies: ReturnType<typeof createBody>[], craft: ReturnType<typeof createCraft>) {
  return createInitialState(openField(bodies), craft, 1);
}

describe('the range', () => {
  it('is 560 prototype units at the median body, within 10%', () => {
    expect(Math.abs(grabRange(BODY) / RANGE - 1)).toBeLessThan(0.1);
  });

  /**
   * Measured from the outside, as the furthest place a press is still answered
   * from. The bisection is on the observable — whether the press took — and not
   * on the constant behind it.
   */
  it('is where a press stops being answered', () => {
    const answered = (out: number): boolean => {
      const state = world([BODY], createCraft(-out, 0, 0, 0));
      return attemptGrab(state);
    };
    let inside = 1;
    let outside = 10 * RANGE;
    for (let i = 0; i < 60; i++) {
      const middle = (inside + outside) / 2;
      if (answered(middle)) inside = middle;
      else outside = middle;
    }
    expect(Math.abs(inside / grabRange(BODY) - 1)).toBeLessThan(1e-6);
    expect(answered(grabRange(BODY) * 1.001)).toBe(false);
  });

  /**
   * Spec 01 §13.2's ruling: *"grab range scales with mass"*, so that whatever
   * exponent the author picks at the M1 gate has somewhere to land. Stated as
   * monotonicity rather than as a law, because the law is `grab.ts`'s to choose
   * and the ruling is only that heavier reaches further.
   */
  it('is further from a heavier body and nearer a lighter one', () => {
    const small = createBody(0, 0, MEDIAN_RADIUS * 0.78);
    const large = createBody(0, 0, MEDIAN_RADIUS * 1.26);
    expect(grabRange(small)).toBeLessThan(grabRange(BODY));
    expect(grabRange(BODY)).toBeLessThan(grabRange(large));
  });
});

describe('which body a press takes', () => {
  /**
   * *"Nearest to `position + velocity × 0.2s`, not nearest to the craft."* This
   * is exact, not statistical: the chosen body must be the one nearest to the
   * lead-displaced point in 100% of cases.
   */
  it('is the one nearest to where the craft will be in two tenths of a second', () => {
    const bodies = [
      createBody(0, 900, MEDIAN_RADIUS),
      createBody(1500, 0, MEDIAN_RADIUS),
      createBody(-600, -1000, MEDIAN_RADIUS),
    ];
    for (let vx = -1200; vx <= 1200; vx += 100) {
      for (let vy = -1200; vy <= 1200; vy += 100) {
        const craft = createCraft(300, 200, vx, vy);
        const leadX = craft.x + vx * LEAD_SECONDS;
        const leadY = craft.y + vy * LEAD_SECONDS;
        const reachable = bodies
          .map((body, index) => ({ body, index }))
          .filter(({ body }) => distance(craft.x, craft.y, body.x, body.y) <= grabRange(body));
        const nearest = reachable.sort(
          (a, b) =>
            distance(leadX, leadY, a.body.x, a.body.y) - distance(leadX, leadY, b.body.x, b.body.y),
        )[0];
        const chosen = bodyOnOffer(openField(bodies), craft);
        expect(chosen, `at velocity ${vx},${vy}`).toBe(nearest ? nearest.index : null);
      }
    }
  });

  /**
   * The lead is not a cone and it costs nothing at rest — the displacement is
   * zero there, so a stationary craft takes the body it is beside. A heading
   * test or a closing-speed rule would need a threshold, *"and a threshold is a
   * cliff the player falls off as a body drifts across an arbitrary line."*
   */
  it('is the nearest body when the craft is not moving', () => {
    const bodies = [createBody(700, 0, MEDIAN_RADIUS), createBody(-400, 0, MEDIAN_RADIUS)];
    expect(bodyOnOffer(openField(bodies), createCraft(0, 0, 0, 0))).toBe(1);
  });

  /**
   * And it is continuous: an arbitrarily small change of velocity cannot change
   * the answer unless the two bodies are equally far from the lead point, which
   * is a set of measure zero rather than a line the player can fall off.
   */
  it('changes only where two bodies are equally near the lead point', () => {
    const bodies = [createBody(900, 600, MEDIAN_RADIUS), createBody(900, -600, MEDIAN_RADIUS)];
    let flips = 0;
    let previous = bodyOnOffer(openField(bodies), createCraft(0, 0, 1200, -1200));
    for (let vy = -1200; vy <= 1200; vy += 1) {
      const chosen = bodyOnOffer(openField(bodies), createCraft(0, 0, 1200, vy));
      if (chosen !== previous) flips += 1;
      previous = chosen;
    }
    expect(flips).toBe(1);
  });
});

describe('the refusals', () => {
  it('refuses a press with nothing in range', () => {
    const state = world([BODY], createCraft(-grabRange(BODY) * 1.2, 0, 300, 0));
    expect(attemptGrab(state)).toBe(false);
    expect(state.heldBody).toBeNull();
  });

  /**
   * *"The heading ray strikes the body **and** the craft is within ≈ 32.5 of its
   * surface."* Both halves have to hold, which is what keeps this the refusal
   * spec 01 measures on 0.4% of presses rather than a second range check.
   */
  it('refuses only a press that is both pointed into the body and almost on it', () => {
    const justInside = BODY.radius + scaled(20);
    const wellOutside = BODY.radius + scaled(60);

    const intoIt = world([BODY], createCraft(-justInside, 0, 600, 0));
    expect(attemptGrab(intoIt)).toBe(false);

    // Same distance, pointed past the body rather than into it.
    const pastIt = world([BODY], createCraft(-justInside, 0, 0, 600));
    expect(attemptGrab(pastIt)).toBe(true);

    // Pointed into the body, but with room to be lifted clear.
    const roomToLift = world([BODY], createCraft(-wellOutside, 0, 600, 0));
    expect(attemptGrab(roomToLift)).toBe(true);

    // Pointed into the body but travelling away from it.
    const leaving = world([BODY], createCraft(-justInside, 0, -600, 0));
    expect(attemptGrab(leaving)).toBe(true);
  });
});

describe('what a grab conserves', () => {
  /**
   * *"Position exactly. Velocity exactly, unless §4 fires."* The clearance is
   * spread over the five ticks after the press, so at the press itself there is
   * nothing to conserve it against.
   */
  it('leaves the craft exactly where it was, going exactly as fast', () => {
    for (const g of [geometry(150, 300, 20), geometry(300, 150, 200), geometry(90, 400, 0)]) {
      const state = placed(g);
      const before = { ...state.craft };
      expect(attemptGrab(state)).toBe(true);
      expect(state.craft).toEqual(before);
    }
  });
});

describe('the one verb', () => {
  /**
   * A press that was refused stays refused. A button that kept retrying every
   * tick would make the grab a sweep rather than a decision, and would turn the
   * too-late refusal into a delay.
   */
  it('answers a press once, not every tick the button is held', () => {
    // Far out, closing on the body: the press is refused for range, and holding
    // the button through the range boundary must not grab.
    const state = world([BODY], createCraft(-grabRange(BODY) * 1.05, 0, 600, 0));
    for (let tick = 0; tick < 60; tick++) stepSim(state, PRESS);
    expect(distance(0, 0, state.craft.x, state.craft.y)).toBeLessThan(grabRange(BODY));
    expect(state.heldBody).toBeNull();

    // Lifting the button and pressing again is a new press, and it is answered.
    stepSim(state, LET_GO);
    stepSim(state, PRESS);
    expect(state.heldBody).toBe(0);
  });

  it('lets go the moment the button comes up', () => {
    const state = placed(geometry(200, 250, 40));
    stepSim(state, PRESS);
    expect(state.heldBody).toBe(0);
    stepSim(state, LET_GO);
    expect(state.heldBody).toBeNull();
  });
});

describe('the world beyond the swing', () => {
  /** A grab of one body cannot be a grab of another; there is one at a time. */
  it('takes exactly one body', () => {
    const bodies = [
      BODY,
      createBody(600, 400, MEDIAN_RADIUS),
      createBody(-500, 700, MEDIAN_RADIUS),
    ];
    const state = createInitialState(openField(bodies), createCraft(-600, 0, 300 * SCALE, 0), 1);
    stepSim(state, PRESS);
    expect(state.heldBody).not.toBeNull();
    stepSim(state, PRESS);
    expect(state.heldBody).not.toBeNull();
  });
});
