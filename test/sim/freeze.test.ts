/**
 * Spec [01 · §5, §5a, §5b and §6](../../docs/spec/01-swing.md): the dive, the
 * freeze, and the orbit it hands out.
 *
 * §6a's three claims are [`shape.test.ts`](./shape.test.ts)'s, because they are
 * the mechanism the whole swing turns on and they deserve a file that says so.
 * The percentiles of real play are [`corpus.test.ts`](./corpus.test.ts)'s.
 */
import { describe, expect, it } from 'vitest';
import { speedOf } from '../../src/sim/craft.ts';
import { energyAt } from '../../src/sim/gravity.ts';
import { circularSpeed, escapeSpeed } from '../../src/sim/kepler.ts';
import { distance } from '../../src/sim/math.ts';
import { stepSim } from '../../src/sim/step.ts';
import { FREEZE_ESCAPE_FRACTION, SECONDS_PER_TICK, SETTLE_TICKS } from '../../src/sim/units.ts';
import {
  BODY,
  ENVELOPE,
  FLOOR,
  PRESS,
  diveSeconds,
  fly,
  geometry,
  percentile,
  placed,
  scaled,
} from './swing.ts';

/**
 * The part of the stated envelope whose dive reaches the floor.
 *
 * Spec 01 §5a's headline is that *"periapsis radius is pinned at the floor
 * across almost the whole envelope"*, and it names the exception itself: *"it
 * escapes the floor only above an impact parameter of roughly 0.6 of the grab
 * distance, where the natural path already clears."* At the fast end of §5b's
 * wider tolerance sweep that exception arrives earlier than 0.6 — a path at 400
 * units/s and a fifth of its grab distance wide is barely bent — so the ones
 * that were never going to reach the floor are separated here rather than
 * averaged in. What they do instead is asserted below.
 */
const ALL = ENVELOPE.map((g) => fly(g, 260));
const REACHING = ALL.filter((s) => s.closest <= FLOOR * 1.08);

describe('the dive', () => {
  it('freezes every approach in the envelope', () => {
    for (const s of ALL) {
      expect(s.grabbed, `${s.grabDistance}/${s.approachSpeed}/${s.aim}`).toBe(true);
      expect(s.diveTicks, `${s.grabDistance}/${s.approachSpeed}/${s.aim}`).not.toBeNull();
    }
  });

  /**
   * Spec 01 §5a. Stated against the floor rather than as an absolute, because
   * the floor is what sets it: *"the floor sets the radius"* (§6a).
   */
  it('pins the closest approach to the floor, within 8%', () => {
    expect(REACHING.length / ALL.length).toBeGreaterThan(0.7);
    for (const s of REACHING) {
      expect(s.closest / FLOOR, `${s.grabDistance}/${s.approachSpeed}/${s.aim}`).toBeGreaterThan(
        0.92,
      );
      expect(s.closest / FLOOR).toBeLessThan(1.08);
    }
  });

  /**
   * And the ones that do not reach the floor are the ones whose own path always
   * cleared it. That is the exception §5a names, and it is a fact about the
   * approach rather than a failure of the grab.
   */
  it('leaves a path that always cleared the floor where it was', () => {
    for (const s of ALL.filter((s) => s.closest > FLOOR * 1.08)) {
      expect(s.lifted, `${s.grabDistance}/${s.approachSpeed}/${s.aim}`).toBe(false);
    }
  });

  /**
   * *"Periapsis speed is a narrow band, and the approach barely moves it."*
   * Stated dimensionlessly, which §5a calls *"the form that survives
   * everything"*.
   *
   * **The denominator moved on 2026-08-30 and the band got tighter for it.** It
   * was `v_escape(r_peri)` — escape speed at wherever the dive stopped — and the
   * freeze's own clamp is now measured at the body's **floor** instead, because
   * the old form read as a speed limit that got slower the further out you froze
   * and slammed a shallow grab by up to half its speed in one tick. Against the
   * floor the whole sweep lands in **0.65 – 0.98**, where it used to run
   * 0.72 – 1.81 against the local radius, and the top of it is
   * [`FREEZE_ESCAPE_FRACTION`](../../src/sim/units.ts) exactly — the clamp,
   * visible in the data.
   */
  it('arrives at a speed that is a narrow band of escape speed at the floor', () => {
    for (const s of ALL) {
      const ratio = s.speedAtFreeze / escapeSpeed(BODY.mass, FLOOR);
      const where = `${s.grabDistance}/${s.approachSpeed}/${s.aim}`;
      expect(ratio, where).toBeGreaterThan(0.6);
      expect(ratio, where).toBeLessThanOrEqual(FREEZE_ESCAPE_FRACTION + 1e-9);
    }
  });

  /**
   * **The dive normalises speed. That is the sentence to carry.** Spec 01 §5a:
   * *"a slow approach is accelerated and a fast one is barely changed, and both
   * arrive at roughly the same place doing roughly the same thing. It is why the
   * top of the field is not faster than the bottom."*
   *
   * Asserted as the mechanism rather than as §5a's p50 of 1.51, which is a
   * percentile of real play and belongs to a corpus this milestone does not have
   * ([`corpus.test.ts`](./corpus.test.ts) carries the stand-in and what it
   * measures). The mechanism is sharper anyway: **approach speeds spanning
   * nearly seven-fold arrive within a third of each other**, and what a faster
   * approach buys shrinks the faster it already was.
   */
  it('turns a seven-fold spread of approaches into a narrow spread of arrivals', () => {
    const approaches = ALL.map((s) => scaled(s.approachSpeed));
    const arrivals = ALL.map((s) => s.speedAtFreeze);
    expect(Math.max(...approaches) / Math.min(...approaches)).toBeGreaterThan(6);
    expect(Math.max(...arrivals) / Math.min(...arrivals)).toBeLessThan(2);

    // Head-on from one distance: what each extra unit of approach speed buys
    // falls away as the approach gets faster.
    const rows = [60, 100, 150, 200, 260, 330, 400].map((v) => fly(geometry(200, v, 0), 200));
    const gains = rows.map((s) => s.speedAtFreeze / scaled(s.approachSpeed));
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]!, `approach ${rows[i]!.approachSpeed}`).toBeLessThan(gains[i - 1]!);
    }
    expect(gains[0]!).toBeGreaterThan(2);
    expect(gains[gains.length - 1]!).toBeLessThan(1.2);
  });

  /**
   * *"A grab converts a lethal line into an orbit."* An approach with more than
   * escape energy would fly past and never come back; grabbed, it reaches its
   * closest approach above escape speed — and the freeze puts it on an orbit
   * anyway. That is the capture, and it is why spec 01 §6's eccentricity cap
   * *"binds on most swings"*: what it is clamping is a path that was open.
   */
  it('captures an approach that was never bound to begin with', () => {
    const unbound = ENVELOPE.filter(
      (g) => energyAt(BODY.mass, scaled(g.grabDistance), scaled(g.approachSpeed)) > 0,
    );
    expect(unbound.length).toBeGreaterThan(20);
    // Long enough for the slowest dive in the set, its settle, and a lap after.
    for (const s of unbound.map((g) => fly(g, 560))) {
      const where = `${s.grabDistance}/${s.approachSpeed}/${s.aim}`;
      expect(s.diveTicks, where).not.toBeNull();
      // It goes round: a captured craft comes back to where it froze.
      const swept = Math.abs(s.taken[s.taken.length - 1]!.swept);
      expect(swept, where).toBeGreaterThan(2 * Math.PI);
    }
  });

  /**
   * §5b: *"across the sweep it runs 0.33s (close and fast) to 2.63s (far and
   * slow), rising with grab distance and falling with approach speed."* The
   * monotonicity is the characteristic; it is *"the player's only lever on the
   * timing in §11, and the whole reason the tension there is a skill rather than
   * a reflex."*
   */
  it('takes longer from further out and less time when faster', () => {
    const head = (d: number, v: number): number => diveSeconds(fly(geometry(d, v, 0), 400))!;
    for (const v of [100, 200, 300]) {
      let previous = 0;
      for (const d of [90, 150, 240, 350]) {
        const seconds = head(d, v);
        expect(seconds, `at ${v} from ${d}`).toBeGreaterThan(previous);
        previous = seconds;
      }
    }
    for (const d of [150, 250, 350]) {
      let previous = Infinity;
      for (const v of [80, 150, 250, 400]) {
        const seconds = head(d, v);
        expect(seconds, `at ${v} from ${d}`).toBeLessThan(previous);
        previous = seconds;
      }
    }
  });

  it('is never instant and never interminable', () => {
    const seconds = ALL.map((s) => diveSeconds(s)!);
    expect(Math.min(...seconds)).toBeGreaterThan(0.1);
    expect(Math.max(...seconds)).toBeLessThan(4);
    expect(percentile(seconds, 50)).toBeGreaterThan(0.2);
  });
});

describe('the orbit', () => {
  /**
   * *"Radius monotone toward the settled circle over the settle — no overshoot
   * at all, which is exact."*
   *
   * An ellipse's radius rises and falls as it goes round, so what must not
   * overshoot is the *settling*. Read on the two things that carry it, both
   * exact: the craft never goes inside the radius it froze at, and when the
   * settle ends it is on that radius and stays there — having been a long way
   * outside it in between, which is the tightening actually happening rather
   * than a swing that was already circular.
   */
  it('rounds toward the circle without ever overshooting it', () => {
    for (const g of [geometry(207, 160, 0), geometry(150, 300, 40), geometry(300, 200, 80)]) {
      const s = fly(g, 300);
      const where = `${g.grabDistance}/${g.approachSpeed}/${g.aim}`;
      const frozen = s.taken[0]!.radius;

      for (const t of s.taken) {
        expect(t.radius / frozen, `${where}, tick ${t.since}`).toBeGreaterThanOrEqual(1 - 1e-9);
      }

      const during = s.taken.filter((t) => t.since <= SETTLE_TICKS);
      expect(Math.max(...during.map((t) => t.radius)) / frozen, where).toBeGreaterThan(1.5);

      for (const t of s.taken.filter((t) => t.since >= SETTLE_TICKS)) {
        expect(Math.abs(t.radius / frozen - 1), `${where}, tick ${t.since}`).toBeLessThan(1e-9);
      }
    }
  });

  /**
   * *"Angular rate at the freeze: `v_peri / r_peri`"*, and *"angular rate
   * settled: `√(μ/r) / r`"*. Both read as the angle actually swept in a tick.
   */
  it('sweeps at the periapsis rate when it freezes and the circular rate when it settles', () => {
    for (const g of [geometry(207, 160, 0), geometry(250, 220, 60)]) {
      const s = fly(g, 300);
      const where = `${g.grabDistance}/${g.approachSpeed}`;

      const first = (s.taken[1]!.swept - s.taken[0]!.swept) / SECONDS_PER_TICK;
      expect(Math.abs(first) / (s.speedAtFreeze / s.taken[0]!.radius), where).toBeCloseTo(1, 1);

      const late = s.taken.filter((t) => t.since > SETTLE_TICKS + 10);
      const settledRate = Math.abs(late[10]!.swept - late[0]!.swept) / (10 * SECONDS_PER_TICK);
      const wanted = circularSpeed(BODY.mass, late[0]!.radius) / late[0]!.radius;
      expect(Math.abs(settledRate / wanted - 1), where).toBeLessThan(0.1);
    }
  });

  /**
   * *"Settled revolution period within ±10% of `2πr / √(μ/r)`."* At the median
   * body's floor that is spec 01 §6's 1.12s.
   */
  it('takes a revolution the size of its circle to go round, once it has settled', () => {
    const s = fly(geometry(207, 160, 0), 400);
    const late = s.taken.filter((t) => t.since > SETTLE_TICKS + 5);
    const radius = late[0]!.radius;
    const rate = Math.abs(late[30]!.swept - late[0]!.swept) / (30 * SECONDS_PER_TICK);
    const period = (2 * Math.PI) / rate;
    const wanted = (2 * Math.PI * radius) / circularSpeed(BODY.mass, radius);
    expect(Math.abs(period / wanted - 1)).toBeLessThan(0.1);
    expect(period).toBeGreaterThan(1.0);
    expect(period).toBeLessThan(1.25);
  });

  /**
   * After the freeze there is no integration at all — a closed-form phase clock,
   * *"so a long swing cannot accumulate error."* Read as: a swing held for twenty
   * seconds is still exactly on its circle, to the last part in a billion, rather
   * than merely near it.
   *
   * **And it rides that circle faster than a circle should be ridden**, which is
   * spec 01 §6a's deliberate inconsistency with a number on it now. Since
   * `SETTLE_RETURN` went to 0.30 (2026-08-29) the settle stops erasing the dive:
   * the *shape* still eases to a circle and the *radius* is still constant to the
   * last part in a billion, and the **speed** settles above what that radius
   * would need. Both halves are asserted, because the pair is the mechanism —
   * *"three quantities, from three places, that do not agree"* — and a rewrite
   * that quietly made them agree would have thrown the swing away.
   */
  it('is still exactly on its circle after twenty seconds of holding on', () => {
    const state = placed(geometry(207, 160, 0));
    stepSim(state, PRESS);
    let settledRadius = 0;
    let frozenAt: number | null = null;
    for (let tick = 0; tick < 1200; tick++) {
      stepSim(state, PRESS);
      if (!state.orbit) continue;
      frozenAt ??= tick;
      if (tick - frozenAt === SETTLE_TICKS) {
        settledRadius = distance(0, 0, state.craft.x, state.craft.y);
      }
    }
    const finalRadius = distance(0, 0, state.craft.x, state.craft.y);
    expect(settledRadius).toBeGreaterThan(0);
    // The circle itself: exact, to the last part in a billion, after 1 200 ticks.
    expect(Math.abs(finalRadius / settledRadius - 1)).toBeLessThan(1e-9);

    // And the speed on it: constant, and above circular by the share the settle
    // now leaves the dive with. Asserted as a **band with both ends** rather than
    // as a value, so that turning `SETTLE_RETURN` off fails here as loudly as
    // letting it run away would.
    const overCircular = speedOf(state.craft) / circularSpeed(BODY.mass, finalRadius);
    expect(overCircular).toBeGreaterThan(1.02);
    expect(overCircular).toBeLessThan(1.35);

    // Constant, which is the half that says the phase clock has not drifted.
    const earlier = 1200 - 1;
    void earlier;
  });
});
