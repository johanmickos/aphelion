/**
 * Spec [01 · §6a](../../docs/spec/01-swing.md): *"the floor sets the radius, the
 * cap sets the shape, the dive sets the **speed**."*
 *
 * This is the mechanism the whole swing turns on, it is **deliberately
 * physically inconsistent**, and spec 01 says so plainly because *"a tidy-minded
 * rewrite will delete it."* Making the sweep rate agree with the clamped shape
 * is the obvious correction and it throws away the only channel by which the
 * quality of a dive survives into the orbit. §6a states it as three separate
 * tests for exactly that reason, and this file is those three.
 *
 * **On restating the first one.** §6a words it as *"the same frozen ellipse —
 * semi-major axis and eccentricity within 1%"*. Neither is observable from
 * outside: the settle begins deforming the shape in the same tick the freeze
 * hands it out, so the ellipse never exists anywhere a test can see it. What §6a
 * itself says in prose is observable, and is what is asserted here — **"a faster
 * dive does not buy a different orbit; it buys the same orbit, flown faster"** —
 * read as two craft tracing the same path on different clocks
 * ([ADR-0013](../../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
 */
import { describe, expect, it } from 'vitest';
import { circularSpeed, escapeSpeed } from '../../src/sim/kepler.ts';
import { SECONDS_PER_TICK, SETTLE_TICKS } from '../../src/sim/units.ts';
import type { Swung } from './swing.ts';
import { BODY, ENVELOPE, FLOOR, fly, geometry } from './swing.ts';

/**
 * The two dives §6a's table is built from: same body, same grab distance,
 * head-on, differing only in approach speed, and both fast enough that the
 * eccentricity cap binds on them.
 */
const SLOWER = fly(geometry(207, 120, 0), 300);
const FASTER = fly(geometry(207, 200, 0), 300);

/** Where the craft was, and when, the first time it had swept `degrees`. */
function whenSwept(s: Swung, degrees: number): { radius: number; seconds: number } | null {
  const want = (degrees * Math.PI) / 180;
  const from = s.taken[0]!.swept;
  for (let i = 1; i < s.taken.length; i++) {
    const before = Math.abs(s.taken[i - 1]!.swept - from);
    const now = Math.abs(s.taken[i]!.swept - from);
    if (now >= want) {
      const part = (want - before) / (now - before);
      return {
        radius: s.taken[i - 1]!.radius + part * (s.taken[i]!.radius - s.taken[i - 1]!.radius),
        seconds: (s.taken[i - 1]!.since + part) * SECONDS_PER_TICK,
      };
    }
  }
  return null;
}

describe('1 · the same orbit, flown faster', () => {
  it('freezes both dives on the same floor', () => {
    expect(Math.abs(SLOWER.closest / FASTER.closest - 1)).toBeLessThan(0.01);
    expect(SLOWER.closest / FLOOR).toBeLessThan(1.01);
  });

  /**
   * The same path: over the first quarter turn, where the settle has barely
   * begun, the two craft are at the same radius at the same swept angle. This is
   * the half a rewrite breaks by letting the cap leak into the shape.
   */
  it('puts both craft at the same radius at the same angle round', () => {
    for (const degrees of [30, 60, 90]) {
      const slower = whenSwept(SLOWER, degrees)!;
      const faster = whenSwept(FASTER, degrees)!;
      expect(Math.abs(slower.radius / faster.radius - 1), `${degrees}°`).toBeLessThan(0.02);
    }
  });

  /**
   * And different clocks: the faster dive gets round sooner, by a margin §6a
   * requires to be at least 5%. **A rewrite that returns the same rate has
   * collapsed the channel.**
   */
  it('gets the faster dive round sooner, by more than a twentieth', () => {
    for (const degrees of [30, 60, 90]) {
      const slower = whenSwept(SLOWER, degrees)!;
      const faster = whenSwept(FASTER, degrees)!;
      expect(slower.seconds / faster.seconds - 1, `${degrees}°`).toBeGreaterThan(0.05);
    }
  });

  it('rides it faster at the freeze, having arrived at the same place', () => {
    expect(FASTER.speedAtFreeze / SLOWER.speedAtFreeze - 1).toBeGreaterThan(0.05);
  });

  /**
   * The whole point, in one line: the sweep rate the dive earned varies while
   * the floor it froze on does not. Over four approach speeds, as §6a's table.
   */
  it('holds the radius still while the speed climbs, across four approaches', () => {
    const rows = [120, 160, 180, 200].map((v) => fly(geometry(207, v, 0), 200));
    const radii = rows.map((s) => s.closest);
    const speeds = rows.map((s) => s.speedAtFreeze);
    expect(Math.max(...radii) / Math.min(...radii) - 1).toBeLessThan(0.01);
    expect(Math.max(...speeds) / Math.min(...speeds) - 1).toBeGreaterThan(0.05);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThan(speeds[i - 1]!);
  });

  /**
   * And at the very top the channel closes, deliberately: spec 01 §5a measures
   * the frozen speed at no more than 0.99 of escape speed at the periapsis, and
   * §6a's own table shows approaches of 200 and 260 freezing at **the same** 435
   * units/s. Past that point a faster dive buys nothing, because what it would
   * buy is a speed the orbit it is being handed cannot be ridden at.
   */
  it('stops paying for approach speed once the freeze is at escape speed', () => {
    const rows = [260, 330, 400].map((v) => fly(geometry(207, v, 0), 200));
    const speeds = rows.map((s) => s.speedAtFreeze);
    expect(Math.max(...speeds) / Math.min(...speeds) - 1).toBeLessThan(0.02);
    for (const s of rows) {
      expect(s.speedAtFreeze / escapeSpeed(BODY.mass, s.closest)).toBeLessThan(1);
    }
  });
});

describe('2 · the settle spends it', () => {
  /**
   * §6a: *"speed at the end of the settle is the circular speed at the settled
   * radius, within 1%, for every dive — so the advantage is fully spent and no
   * dive keeps a permanent edge."* **A rewrite where holding indefinitely
   * preserves the advantage has removed the reason to let go.**
   *
   * **Amended 2026-08-29, and the second half is what matters.** The settle no
   * longer spends the advantage *fully*: `SETTLE_RETURN` leaves the orbit a
   * bounded share of what the dive earned, because erasing it entirely made every
   * settled swing leave at the same speed whatever brought it in and read as
   * being punished for going fast. What is asserted now is a **band with both
   * ends**: the settled speed is above its own circle, and by a fixed amount that
   * does not grow with how the craft arrived — so no dive keeps a *permanent
   * edge*, which is the sentence §6a was actually protecting.
   */
  it('leaves every dive a fixed step above the circular speed of its own circle', () => {
    const over: number[] = [];
    for (const g of ENVELOPE) {
      const s = fly(g, 240);
      const settled = s.taken.find((t) => t.since === SETTLE_TICKS);
      if (!settled) continue;
      const wanted = circularSpeed(BODY.mass, settled.radius);
      over.push(settled.onOrbit / wanted);
    }
    expect(over.length).toBeGreaterThan(4);
    for (const ratio of over) {
      expect(ratio).toBeGreaterThan(1.0);
      expect(ratio).toBeLessThan(1.2);
    }
    // The step is nearly the same step whatever the dive was — the spread across
    // the whole envelope is under 15%, against the 20 – 45% the freeze itself
    // hands out. It is not uniform, because the freeze's escape clamp binds on an
    // energetic dive and not on a lazy one; what matters is that it is **bounded
    // and does not grow with the approach**, so no dive keeps a permanent edge.
    expect(Math.max(...over) / Math.min(...over) - 1).toBeLessThan(0.15);
  });

  /**
   * However fast it arrived. Four dives, four speeds at the freeze, one after —
   * within **3%** rather than 1% since the settle stopped erasing the dive
   * entirely, which is the whole of what that ruling cost this characteristic.
   */
  it('brings four different arrivals to the same speed', () => {
    const rows = [160, 200, 230, 260].map((v) => fly(geometry(207, v, 0), 200));
    const settled = rows.map((s) => s.taken.find((t) => t.since === SETTLE_TICKS)!.onOrbit);
    expect(Math.max(...settled) / Math.min(...settled) - 1).toBeLessThan(0.03);
    const frozen = rows.map((s) => s.speedAtFreeze);
    expect(Math.max(...frozen) / Math.min(...frozen) - 1).toBeGreaterThan(0.05);
  });
});

describe('3 · what the freeze is worth', () => {
  /**
   * *"Speed at the freeze exceeds the settled circular speed by 20 – 45% across
   * the real-play envelope. Measured 1.24× – 1.40×; the band is the room the
   * rewrite has."*
   *
   * Over §6a's own envelope, and past it: approach speeds from 80 to 400 from
   * one grab distance. The top of the band is not a coincidence — a freeze is
   * held below escape speed at its periapsis (`FREEZE_ESCAPE_FRACTION`), and
   * `0.98 × √2` is **1.386**, which is §6a's measured 1.40 to three figures.
   */
  it('is 20 to 45% faster than the circle it decays to', () => {
    for (const v of [80, 120, 160, 200, 230, 260, 330, 400]) {
      const s = fly(geometry(207, v, 0), 200);
      const ratio = s.speedAtFreeze / circularSpeed(BODY.mass, s.closest);
      expect(ratio, `approach ${v}`).toBeGreaterThan(1.2);
      expect(ratio, `approach ${v}`).toBeLessThan(1.45);
    }
  });

  /**
   * And the advantage has a shelf life of exactly the settle. Read as the excess
   * over the circle, which starts at 20 – 45% and is **mostly** gone by 1.2s —
   * *"the reward for a good dive is a speed advantage with a 1.2-second shelf
   * life, and cashing it before it expires is the whole of §11's timing
   * problem."*
   *
   * **Mostly, since 2026-08-29.** `SETTLE_RETURN` leaves a bounded share of it
   * behind rather than all of it, so what expires is the difference between the
   * two — measured here, an excess of 0.38 at the freeze falls to 0.12 and then
   * holds. The timing problem survives it: **two thirds of what a dive earns is
   * still gone by the settle**, and nothing further is lost afterwards, which is
   * the *shelf life* half of the sentence.
   */
  it('has spent most of the advantage by the time the settle ends', () => {
    const s = fly(geometry(207, 260, 0), 300);
    const excess = (since: number): number => {
      const t = s.taken.find((t) => t.since === since)!;
      return t.onOrbit / circularSpeed(BODY.mass, t.radius) - 1;
    };
    expect(excess(0)).toBeGreaterThan(0.2);
    // Most of it goes…
    expect(excess(SETTLE_TICKS)).toBeLessThan(excess(0) / 2);
    expect(excess(SETTLE_TICKS)).toBeGreaterThan(0);
    // …and then nothing more does, however long the swing runs.
    expect(Math.abs(excess(SETTLE_TICKS + 120) - excess(SETTLE_TICKS))).toBeLessThan(0.01);
  });
});
