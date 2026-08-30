/**
 * The field as a medium — spec [05](../../docs/spec/05-field.md)'s acceptance,
 * asked of presentation state rather than of a canvas.
 *
 * Every criterion in §Acceptance that concerns the rungs is here, and each is
 * written against the numbers the picture is drawn from rather than against the
 * pixels, because [AGENTS.md](../../AGENTS.md) §4 asks for observables: *"if the
 * only way to check a characteristic is to reach inside the simulation and read a
 * field, it is specified wrong."* Where a criterion needed re-reading to be
 * literally checkable, the re-reading is argued at the test rather than assumed.
 *
 * The layer criterion §6 asks every step to write is the last one in this file:
 * **the rungs move nothing in the simulation.** A picture that could change a
 * tick would have put the field's decoration inside determinism's contract.
 */
import { describe, expect, it } from 'vitest';
import { createBody } from '../../src/sim/body.ts';
import { createCraft } from '../../src/sim/craft.ts';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { Field, SimState } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS, METRE, SCALE } from '../../src/sim/units.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { ticksIn } from '../../src/state/decay.ts';
import {
  ADDRESSED_EVERY,
  BOW_CAP,
  BOW_FALLOFF,
  RUNG_SPACING,
  WAKE_FALLOFF,
  WAKE_TICKS,
  altitudeOf,
  bowOf,
  falloff,
  hasRungs,
  reachOf,
  rungAbove,
  rungBelow,
  rungPointAt,
} from '../../src/state/rung.ts';
import type { BodyView, PresentationState, WakeView } from '../../src/state/types.ts';

const PRESS = { pressed: true };
const LET_GO = { pressed: false };

/** A body as the picture sees it — only the three fields a rung ever asks about. */
function seen(x: number, y: number, radius: number): BodyView {
  const body = createBody(x, y, radius);
  return { x, y, radius, bow: bowOf(body) } as BodyView;
}

/** Where a rung point lands, as a displacement from where it hangs. */
function displaced(
  x: number,
  y: number,
  bodies: readonly BodyView[],
  wake?: WakeView,
): { dx: number; dy: number } {
  const at = { x: 0, y: 0 };
  rungPointAt(x, y, bodies, wake, at);
  return { dx: at.x - x, dy: at.y - y };
}

function magnitude(of: { dx: number; dy: number }): number {
  return Math.sqrt(of.dx * of.dx + of.dy * of.dy);
}

/** Fly the shipped field, holding the button over the stated ticks. */
function fly(ticks: number, pressing: (tick: number) => boolean): PresentationState[] {
  const sim = createInitialState(fixtureField(), fixtureCraft(), 1);
  let view = createPresentation(sim);
  const views = [view];
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, pressing(tick) ? PRESS : LET_GO);
    view = derive(view, sim);
    views.push(view);
  }
  return views;
}

describe('a metre', () => {
  /**
   * The ruling `units.ts` argues, held to the arithmetic that produced it rather
   * than to its value — so that a later change to `SCALE` moves both together and
   * a change to the metre alone fails here with the reason attached.
   */
  it('is a prototype unit, which is the conversion the project already ruled', () => {
    expect(METRE).toBe(SCALE);
  });

  /**
   * The check that decided it. Spec 07 §2 fixes the outer band 220 m inward from
   * the line and the fire band 90 m; the corridor this field is flown in is
   * 1 111.5 design units of half-width. At this metre that is 370.5 m and the ×1
   * core is 150.5 m deep. At the board-derived alternative of 5.52 design units
   * it would be 201 m, the outer band alone would be deeper than the whole
   * corridor, and every run would open inside the boundary.
   */
  it('leaves a corridor with room in it outside spec 07 §2 bands', () => {
    const halfWidth = fixtureField().corridor.halfWidth / METRE;
    expect(halfWidth).toBeCloseTo(370.5, 1);
    expect(halfWidth - 220).toBeGreaterThan(0);
  });
});

describe('where the rungs hang', () => {
  it('is one every 50 m, counted from the foot of the field', () => {
    expect(RUNG_SPACING / METRE).toBe(50);
    const foot = fixtureField().corridor.foot;
    expect(altitudeOf(foot, 0)).toBe(foot);
    expect(altitudeOf(foot, 1)).toBe(foot - RUNG_SPACING);
    // Design `y` falls as the craft climbs, so a higher rung has a smaller `y`.
    expect(altitudeOf(foot, 10)).toBeLessThan(altitudeOf(foot, 9));
  });

  /**
   * The author's own correction, kept as a number rather than as a sentence:
   * *"the rungs are too close together, it feels chaotic at speed"* (2026-08-30).
   * Their phone shows 1 938 design units of height (`GUARANTEED_BAND`), and
   * Direction 05's own frame draws 13.5 rungs at once.
   */
  it('shows about as many at once as the board draws', () => {
    const onThePhone = (2532 * 0.77) / RUNG_SPACING;
    expect(onThePhone).toBeGreaterThan(11);
    expect(onThePhone).toBeLessThan(15);
  });

  it('addresses every fifth', () => {
    expect(ADDRESSED_EVERY).toBe(5);
  });

  /**
   * A window bounded above and below asks for exactly the rungs inside it, and
   * for none when it spans no whole one. The pair is what stops a very tall
   * window walking the whole field.
   */
  it('asks for the rungs a window spans and no others', () => {
    const foot = 0;
    // A window from y = -1000 (high) to y = 0 (the foot).
    expect(rungAbove(foot, 0)).toBe(0);
    expect(rungBelow(foot, -1000)).toBe(Math.floor(1000 / RUNG_SPACING));
    // A sliver between two rungs spans none.
    const between = -RUNG_SPACING * 1.2;
    expect(rungBelow(foot, between)).toBeLessThan(rungAbove(foot, between - 1));
  });

  /**
   * A field with no foot has no datum and therefore no ladder.
   * `tools/check-portability.ts` builds exactly that on purpose, and this is the
   * guard that stopped it walking an unbounded index into `exp`.
   */
  it('is absent from a field with no foot', () => {
    expect(hasRungs(Infinity)).toBe(false);
    expect(hasRungs(fixtureField().corridor.foot)).toBe(true);
  });
});

describe('the gravity bow', () => {
  /**
   * Spec 05's acceptance, in its own words: *"sweeping a body's mass from minimum
   * to maximum increases peak bow monotonically and never exceeds 30px"* — with
   * the clamp now at 45, overturned in place in spec 05 and argued at
   * [`BOW_CAP`](../../src/state/rung.ts).
   *
   * **The peak is the one at the rim**, because a rung point inside a body is
   * drawn behind the body's disc and nobody sees it. Mass is swept the only way
   * spec 04 §1 permits — **mass is size** — across the whole range this field
   * places and spec 17 §4 authors.
   */
  it('increases with mass, monotonically, across the range a day places', () => {
    let previous = -Infinity;
    for (let radius = 20; radius <= 56; radius += 1) {
      const body = seen(0, 0, radius * SCALE);
      const peak = magnitude(displaced(radius * SCALE, 0, [body]));
      expect(peak).toBeGreaterThan(previous);
      expect(peak).toBeLessThanOrEqual(BOW_CAP);
      previous = peak;
    }
  });

  /**
   * And the bound on where that stops being true, held as a number so it cannot
   * quietly walk back into the field.
   *
   * Above this the clamp binds at the rim and the visible peak falls again — a
   * heavier body holds its rim further out into the falloff while the amplitude
   * is held flat. At the spec's original 30px the turnover was at radius **44**,
   * inside the field; it is now at 60, above both the 56 this field places and
   * spec 17 §4's largest of 55.
   */
  it('keeps its mass distinction clear of the largest body any day places', () => {
    const peakAt = (radius: number): number =>
      magnitude(displaced(radius * SCALE, 0, [seen(0, 0, radius * SCALE)]));
    let turnover = Infinity;
    for (let radius = 21; radius <= 90; radius += 1) {
      if (peakAt(radius) < peakAt(radius - 1)) {
        turnover = radius;
        break;
      }
    }
    expect(turnover).toBeGreaterThan(56);
  });

  /** Everywhere, and not only over the sweep above — the cap is absolute. */
  it('never exceeds the cap, at any distance from any body', () => {
    const body = seen(0, 0, 56 * SCALE);
    for (let d = 0; d <= reachOf(BOW_FALLOFF) + 100; d += 3) {
      expect(magnitude(displaced(d, 0, [body]))).toBeLessThanOrEqual(BOW_CAP + 1e-9);
    }
  });

  /** It bows **toward** the mass, which is the whole statement it makes. */
  it('pulls a rung toward the body and not away from it', () => {
    const body = seen(0, -300, MEDIAN_RADIUS);
    const at = displaced(0, 0, [body]);
    expect(at.dy).toBeLessThan(0);
    expect(Math.abs(at.dx)).toBeLessThan(1e-9);
  });

  /**
   * *"Bows from multiple bodies sum, then clamp"* — spec 05 §3. The field forks
   * at two altitudes in five, so a rung between a pair really is pulled twice.
   */
  it('sums two bodies and still clamps the sum', () => {
    // Stacked rather than straddling: two bodies either side of a rung point pull
    // it in opposite directions and the sum is *smaller* than one of them, which
    // is correct and says nothing about clamping. These pull the same way.
    const pair = [seen(0, -300, 56 * SCALE), seen(0, -450, 56 * SCALE)];
    const both = magnitude(displaced(0, 0, pair));
    const one = magnitude(displaced(0, 0, [pair[0]!]));
    expect(both).toBeGreaterThan(one);

    // And nowhere does the sum pass the clamp, including between a pair placed
    // as tightly as the field's own forks place them.
    const fork = [seen(-126 * SCALE, 0, 56 * SCALE), seen(110 * SCALE, 0, 56 * SCALE)];
    for (let x = -1500; x <= 1500; x += 5) {
      for (const y of [0, -60, -150]) {
        expect(magnitude(displaced(x, y, fork))).toBeLessThanOrEqual(BOW_CAP + 1e-9);
        expect(magnitude(displaced(x, y, pair))).toBeLessThanOrEqual(BOW_CAP + 1e-9);
      }
    }
  });

  /**
   * *"Rendered at any altitude, the field contains no element whose scale or blur
   * depends on a depth coordinate — there is no depth coordinate."* The rung's
   * geometry takes only world positions, so the same relative geometry gives the
   * same bow wherever in the field it happens.
   */
  it('says the same thing at any altitude', () => {
    const low = displaced(0, 0, [seen(0, -300, MEDIAN_RADIUS)]);
    const high = displaced(0, -90_000, [seen(0, -90_300, MEDIAN_RADIUS)]);
    expect(high.dx).toBeCloseTo(low.dx, 9);
    expect(high.dy).toBeCloseTo(low.dy, 9);
  });

  /** A rung asks nothing of a body outside the reach, which is what bounds the cost. */
  it('ends rather than becoming very small', () => {
    const body = seen(0, 0, MEDIAN_RADIUS);
    expect(magnitude(displaced(reachOf(BOW_FALLOFF), 0, [body]))).toBe(0);
    expect(magnitude(displaced(reachOf(BOW_FALLOFF) - 1, 0, [body]))).toBeGreaterThan(0);
  });
});

describe('the wake', () => {
  /**
   * Spec 05's acceptance: *"a frame rendered with the craft removed and a frame
   * rendered with it present differ only within ~3 × 34px of the craft's
   * position."*
   *
   * **Read as the wake's own sources rather than as the craft's position**, and
   * the reading is forced by the sentence two lines above it in the same spec:
   * the parted rung *"relaxes back over ~400ms"*. A wake that relaxes is still
   * displaced after the craft has moved on, so a difference measured against
   * where the craft is **now** must extend behind it by however far the craft
   * travelled in those 400ms. What the criterion is protecting — that the craft
   * disturbs a bounded patch of field and nothing radiates — is exactly this pair
   * of assertions: every difference sits inside the reach of a source, and every
   * source is a place the craft actually was, recently.
   */
  it('confines its difference to the reach of places the craft has been', () => {
    const views = fly(420, (tick) => tick > 60 && tick < 260);
    const reach = reachOf(WAKE_FALLOFF);
    let sawOne = false;
    for (const view of views) {
      const foot = view.corridor.foot;
      for (const wake of view.wake) {
        sawOne = true;
        const y = altitudeOf(foot, wake.rung);
        // Nothing outside the reach of this source moves because of it.
        const outside = displaced(wake.x + reach, y, [], wake);
        expect(magnitude(outside)).toBe(0);
        // And the source is somewhere the craft has been inside the decay's span.
        const wasThere = views
          .slice(Math.max(0, view.tick - WAKE_TICKS), view.tick + 1)
          .some(
            (past) =>
              Math.abs(past.craft.x - wake.x) < 1e-6 && Math.abs(past.craft.y - wake.y) < 1e-6,
          );
        expect(wasThere).toBe(true);
      }
    }
    expect(sawOne).toBe(true);
  });

  /** Away from the source, never toward it — the parting is a parting. */
  it('pushes a rung away from where the craft pressed', () => {
    const wake: WakeView = { rung: 0, x: 0, y: 0, strength: 1, life: { age: 0, span: WAKE_TICKS } };
    expect(displaced(60, 0, [], wake).dx).toBeGreaterThan(0);
    expect(displaced(-60, 0, [], wake).dx).toBeLessThan(0);
  });

  /**
   * *"Nothing radiates from the craft — the wake is a local displacement of an
   * existing structure, not an emitted ring."* A ring would put its maximum at a
   * radius; this one is strongest at the source and falls away from it, all the
   * way out.
   */
  it('is strongest at the source and only ever weaker further out', () => {
    const wake: WakeView = { rung: 0, x: 0, y: 0, strength: 1, life: { age: 0, span: WAKE_TICKS } };
    let previous = Infinity;
    for (let x = 1; x < reachOf(WAKE_FALLOFF); x += 5) {
      const here = magnitude(displaced(x, 0, [], wake));
      expect(here).toBeLessThan(previous);
      previous = here;
    }
  });

  /** ~400ms, which is spec 05 §3's own figure and `decay.ts`'s shared grammar. */
  it('relaxes over 400ms', () => {
    expect(WAKE_TICKS).toBe(ticksIn(400));
  });

  /**
   * The thing the memory exists for: a rung the craft has left is still parted,
   * and gets less parted every tick until it is **absent** rather than very
   * small (`CONTEXT.md`: decay).
   */
  it('holds a rung parted behind the craft, and then lets go of it entirely', () => {
    const views = fly(600, (tick) => tick > 60 && tick < 200);
    // A rung that was pressed at some point and is no longer being pressed.
    const strengths: number[][] = [];
    const seenRungs = new Map<number, number[]>();
    for (const view of views) {
      for (const wake of view.wake) {
        const trail = seenRungs.get(wake.rung) ?? [];
        trail.push(wake.strength);
        seenRungs.set(wake.rung, trail);
      }
    }
    for (const trail of seenRungs.values()) if (trail.length > 3) strengths.push(trail);
    expect(strengths.length).toBeGreaterThan(3);

    for (const trail of strengths) {
      // It reaches full strength while the craft is on it...
      expect(Math.max(...trail)).toBeCloseTo(1, 6);
      // ...and once it starts coming back it never strengthens again.
      const peak = trail.lastIndexOf(Math.max(...trail));
      for (let at = peak + 1; at < trail.length; at++) {
        expect(trail[at]!).toBeLessThan(trail[at - 1]!);
      }
      // And it is finite: nothing carries past the decay's own span.
      expect(trail.length - peak).toBeLessThanOrEqual(WAKE_TICKS + 1);
    }
  });

  /**
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
   * third rule, which is what makes the memory safe rather than merely
   * convenient: two pictures that disagree agree again within a bounded time.
   */
  it('sheds a disagreement within its own span', () => {
    const sim = createInitialState(fixtureField(), fixtureCraft(), 1);
    let honest = createPresentation(sim);
    let lied: PresentationState = {
      ...honest,
      wake: [{ rung: 9999, x: 1e4, y: -1e4, strength: 1, life: { age: 0, span: WAKE_TICKS } }],
    };
    for (let tick = 0; tick <= WAKE_TICKS + 1; tick++) {
      stepSim(sim, LET_GO);
      honest = derive(honest, sim);
      lied = derive(lied, sim);
    }
    expect(lied.wake).toEqual(honest.wake);
  });

  /**
   * ADR-0015's second rule. A run that opened with the rungs already parted would
   * be showing the player a passage that has not happened.
   */
  it('opens empty', () => {
    const sim = createInitialState(fixtureField(), fixtureCraft(), 1);
    expect(createPresentation(sim).wake).toEqual([]);
  });

  /** Bounded, and by the reach rather than by the field — see `rung.ts`'s cost note. */
  it('never grows with the size of the field', () => {
    const views = fly(900, (tick) => tick % 200 > 40 && tick % 200 < 150);
    const worst = Math.max(...views.map((view) => view.wake.length));
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(2 * Math.ceil(reachOf(WAKE_FALLOFF) / RUNG_SPACING) + 20);
  });
});

describe('the falloff both formulas share', () => {
  it('is 1 at the source and exactly 0 at the reach', () => {
    expect(falloff(0, 100)).toBeCloseTo(1, 12);
    expect(falloff(reachOf(100), 100)).toBe(0);
    expect(falloff(reachOf(100) + 1, 100)).toBe(0);
  });

  it('falls the whole way, and never rises', () => {
    let previous = Infinity;
    for (let d = 0; d <= reachOf(100); d += 1) {
      const here = falloff(d, 100);
      expect(here).toBeLessThan(previous);
      previous = here;
    }
  });
});

describe('the layer boundary', () => {
  /**
   * [AGENTS.md](../../AGENTS.md) §6: every spec's acceptance carries at least one
   * criterion that fails if a layer boundary is crossed. **The rungs are a
   * picture**, and a picture may not move a tick — which is also
   * `test/sim/version.test.ts`'s *picture, not flight* case, settled here rather
   * than by reading a fingerprint.
   */
  it('moves nothing in the simulation', () => {
    const withPictures = createInitialState(fixtureField(), fixtureCraft(), 1);
    const alone = createInitialState(fixtureField(), fixtureCraft(), 1);
    let view = createPresentation(withPictures);
    for (let tick = 0; tick < 500; tick++) {
      const input = tick > 60 && tick < 260 ? PRESS : LET_GO;
      stepSim(withPictures, input);
      view = derive(view, withPictures);
      stepSim(alone, input);
      expect(snapshot(withPictures)).toEqual(snapshot(alone));
    }
    // And the picture really was doing something, so the comparison means
    // something.
    expect(view.wake.length + view.bodies.length).toBeGreaterThan(0);
  });

  /**
   * A rung's shape is a pure function of the tick it is drawn for, so two
   * derivations of one tick draw one field — which is what ADR-0006 promises and
   * what makes a screenshot reproducible from a recipe.
   */
  it('draws one field for one tick', () => {
    const first = fly(300, (tick) => tick > 60 && tick < 200);
    const second = fly(300, (tick) => tick > 60 && tick < 200);
    expect(second.at(-1)!.wake).toEqual(first.at(-1)!.wake);
  });
});

/** A field of one body, so a rung's arithmetic is legible in the assertion. */
function oneBody(): Field {
  return {
    bodies: [createBody(0, 0, MEDIAN_RADIUS)],
    corridor: { centreline: 0, halfWidth: 2000, foot: 5000 },
  };
}

describe('the fixture the rest of this file leans on', () => {
  it('is a field a craft can be flown in', () => {
    const sim: SimState = createInitialState(oneBody(), createCraft(0, 3000, 0, -100), 1);
    stepSim(sim, LET_GO);
    expect(sim.ending).toBeNull();
    expect(hasRungs(sim.field.corridor.foot)).toBe(true);
  });
});
