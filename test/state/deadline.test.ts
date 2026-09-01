/**
 * What presentation state adds to the deadline: **when the scan is worth
 * re-running**, and **what the SOS remembers**.
 *
 * The prediction itself is `test/sim/rescue.test.ts`. This is the two things that
 * are only true across ticks, and both are claims the cost of the feature rests
 * on.
 */
import { describe, expect, it } from 'vitest';
import { createCraft } from '../../src/sim/craft.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { scatterField } from '../../src/sim/scatter-field.ts';
import { SCALE } from '../../src/sim/units.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { RESTATE_TICKS, SOS_FLOOR } from '../../src/state/deadline.ts';
import type { PresentationState } from '../../src/state/types.ts';
import type { SimState } from '../../src/sim/types.ts';

const field = scatterField();
const { centreline } = field.corridor;

function drifting(off: number, across: number, up = 1500): SimState {
  return createInitialState(
    field,
    createCraft(centreline + off * SCALE, -up * SCALE, across * SCALE, -300 * SCALE),
    1,
  );
}

/** Fly `ticks` of it, deriving beside it as `derive` is meant to be used. */
function fly(sim: SimState, ticks: number, pressed = false): PresentationState[] {
  let view = createPresentation(sim);
  const out = [view];
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, { pressed });
    view = derive(view, sim);
    out.push(view);
  }
  return out;
}

describe('the scan is a property of the coast', () => {
  /**
   * **The whole cost argument, asserted.** A drift takes no input, so the
   * projection stays true for as long as the craft is on the same line — measured
   * over the author's dispatches, a coasting heading is constant on 99.92% of
   * ticks. If this stopped holding, the feature would go from 0.019 ms a coast to
   * 0.019 ms a tick.
   */
  it('is not re-run while the drift is unchanged', () => {
    const views = fly(drifting(60, 300), 40);
    // Distinct scan ticks over forty ticks of unchanged drift: one when the coast
    // opens, and one more when the convergence bound below comes due. Not forty.
    const scans = new Set(views.map((view) => view.rescue.at));
    expect(scans.size).toBeLessThanOrEqual(3);
    expect(views.length).toBe(41);
  });

  /**
   * **And it converges anyway**, which is
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
   * third rule and the only thing that makes a carried value safe. Nothing here
   * can hold a disagreement longer than half a second, whatever it was about.
   */
  it('is re-run at least every half second regardless', () => {
    const views = fly(drifting(60, 300), RESTATE_TICKS * 2 + 4);
    const scans = [...new Set(views.map((view) => view.rescue.at))].sort((a, b) => a - b);
    expect(scans.length).toBeGreaterThan(2);
    for (let at = 1; at < scans.length; at++) {
      expect(scans[at]! - scans[at - 1]!).toBeLessThanOrEqual(RESTATE_TICKS);
    }
  });

  /** The points are world points, so the craft advancing into them moves nothing. */
  it('holds its window still as the craft flies into it', () => {
    const views = fly(drifting(60, 300), 20).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(5);
    const first = views[0]!.deadline!;
    for (const view of views) {
      if (view.rescue.at !== views[0]!.rescue.at) break;
      expect(view.deadline!.path[0]!.x).toBeCloseTo(first.path[0]!.x, 6);
    }
  });

  /** Spec 03 §5's *"it fades in over 300ms"* — from nothing, and only upward. */
  it('fades in rather than snapping on', () => {
    const views = fly(drifting(60, 300), 30).filter((view) => view.deadline !== null);
    expect(views[0]!.deadline!.presence).toBe(0);
    expect(views[views.length - 1]!.deadline!.presence).toBe(1);
    for (let at = 1; at < views.length; at++) {
      if (views[at]!.rescue.at !== views[at - 1]!.rescue.at) continue;
      expect(views[at]!.deadline!.presence).toBeGreaterThanOrEqual(
        views[at - 1]!.deadline!.presence,
      );
    }
  });
});

describe('the fuel coupling', () => {
  /**
   * **A named zero in the shape of a full tank.** Spec 03 §5 couples fuel to the
   * deadline *"by luminance, never geometry"*, so M4.4 changes this number and
   * nothing else about the picture — and its neutral value is **1** rather than 0,
   * because a constraint that does not exist yet is one that does not bind.
   */
  it('lights the whole window while there is no fuel to spend', () => {
    const views = fly(drifting(60, 300), 30).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view.deadline!.affordable).toBe(1);
  });
});

describe('the SOS', () => {
  /** Drifting past the dot: no press left, so the strobe rather than the mark. */
  it('strobes on a drift with no rescue in front of it', () => {
    const views = fly(drifting(170, 1200), 40);
    const strobing = views.filter((view) => view.sos !== null);
    expect(strobing.length).toBeGreaterThan(0);
    for (const view of strobing) {
      expect(view.sos!.held).toBe(false);
      expect(view.sos!.toward).toBe(1);
      // Spec 07 §6's strobe: *"a signal, not a scream"* — it never goes out.
      expect(view.sos!.strength).toBeGreaterThanOrEqual(SOS_FLOOR);
      expect(view.sos!.strength).toBeLessThanOrEqual(1);
    }
  });

  /**
   * **And it actually strobes** — the value moves rather than sitting at a
   * constant, which is the one thing a test of a 2Hz signal has to check.
   */
  it('really pulses rather than sitting still', () => {
    const strengths = fly(drifting(170, 1200), 40)
      .filter((view) => view.sos !== null)
      .map((view) => view.sos!.strength);
    expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(0.2);
  });

  /**
   * **The held half: the press that took this body was already too late.**
   *
   * The prototype's `armDoom`, and the defect it exists for: *"dropping the
   * captured half would make the skull vanish on the very press that sealed the
   * run — the player panics, presses, and the death mark disappears, which reads
   * as a save."* So this is asserted across the press, not on either side of it.
   */
  it('survives the press that seals the run', () => {
    const sim = drifting(170, 1200);
    let view = createPresentation(sim);
    let sawDrifting = false;
    let sawHeld = false;
    let wentQuiet = false;
    for (let tick = 0; tick < 200; tick++) {
      // Coast until the SOS is up, then press — the panic press the prototype
      // names, which must not take the mark away.
      const press = sawDrifting && sim.heldBody === null;
      stepSim(sim, { pressed: press });
      view = derive(view, sim);
      if (view.sos !== null && !view.sos.held) sawDrifting = true;
      if (sim.heldBody !== null) {
        if (view.sos !== null && view.sos.held) sawHeld = true;
        else if (sawHeld) wentQuiet = true;
        if (sawHeld && wentQuiet) break;
      }
      if (sim.ending !== null) break;
    }
    expect(sawDrifting).toBe(true);
    expect(sawHeld).toBe(true);
  });

  /** Nothing once the run is over — *"a warning that outlives the thing it was warning about is noise."* */
  it('goes quiet at an ending', () => {
    const sim = drifting(170, 1200);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 300; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      if (sim.ending !== null) break;
    }
    expect(sim.ending).not.toBeNull();
    expect(view.sos).toBeNull();
    expect(view.deadline).toBeNull();
  });

  /** A craft going nowhere near a wall is told nothing at all. */
  it('says nothing on an ordinary climb', () => {
    for (const view of fly(drifting(0, 0), 60)) {
      expect(view.sos).toBeNull();
      expect(view.deadline).toBeNull();
    }
  });
});
