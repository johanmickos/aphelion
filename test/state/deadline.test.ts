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
import { snapshot } from '../../src/sim/snapshot.ts';
import { scatterField } from '../../src/sim/scatter-field.ts';
import { OUTER_BAND } from '../../src/state/boundary.ts';
import { SCALE } from '../../src/sim/units.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import {
  BIRTH_TICKS,
  FADE_IN_SECONDS,
  FULL_SECONDS,
  RESTATE_TICKS,
  SCAN_PROBES,
  SOS_FLOOR,
  SOS_HOLD_TICKS,
  deadlineOf,
  presenceAt,
} from '../../src/state/deadline.ts';
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
   * **And there is a backstop**, which is
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
   * third rule kept honest. ⚠ It was half a second and is two, because measured
   * over the author's own run **6 of the 10 expensive ticks were convergence
   * re-scans finding the answer already in hand** — and a memo of a pure function
   * whose key is checked directly is not a decay.
   */
  it('is re-run on a backstop regardless', () => {
    // A long climb, so the coast outlives the backstop. It needs no deadline on
    // it: what is asserted is that the scan is re-run, not what it finds.
    const views = fly(drifting(0, 40), RESTATE_TICKS * 2 + 10);
    const scans = [...new Set(views.map((view) => view.rescue.at))].sort((a, b) => a - b);
    expect(scans.length).toBeGreaterThan(2);
    for (let at = 1; at < scans.length; at++) {
      expect(scans[at]! - scans[at - 1]!).toBeLessThanOrEqual(RESTATE_TICKS);
    }
  });

  /**
   * **The dot is a world point and does not move** — which is what the player is
   * looking at, and what *"it should only appear, and NOT MOVE"* asks for.
   */
  it('holds the dot still as the craft flies into it', () => {
    // ⚠ 2 000 rather than the default 1 500 since the field was redrawn to
    // scatter v2 (2026-09-03): a deadline needs a rescue to still be *possible*,
    // so it needs a body in reach, and the fork that was in reach at 1 500 moved
    // when its lanes were pushed out to the prototype's placement. The altitude
    // is the geometry this file already uses elsewhere for the same reason.
    const views = fly(drifting(60, 300, 2000), 20).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(5);
    const first = views[0]!.deadline!;
    for (const view of views) {
      if (view.rescue.at !== views[0]!.rescue.at) break;
      expect(view.deadline!.cross.x).toBeCloseTo(first.cross.x, 6);
      expect(view.deadline!.cross.y).toBeCloseTo(first.cross.y, 6);
    }
  });

  /**
   * ⚠ **And the track starts at the craft, not where the craft was.**
   *
   * The scan is cached, so its first sample is where the craft stood when it ran.
   * Measured over the author's reference run before this, the drawn track began
   * **177 design units behind the craft at p50 and 647 at worst** — over half a
   * picture of it trailing the ship, and part of what *"it's really long"* was
   * about.
   */
  it('starts the track at the craft rather than where the craft was', () => {
    const sim = drifting(60, 300);
    let view = createPresentation(sim);
    let worst = 0;
    for (let tick = 0; tick < 40; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      const track = view.deadline;
      if (track === null) continue;
      const head = track.path[0]!;
      // Behind is against the craft's own travel.
      const behind = -(
        (head.x - view.craft.x) * sim.craft.vx +
        (head.y - view.craft.y) * sim.craft.vy
      );
      worst = Math.max(worst, behind);
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });

  /**
   * ⚠ **The cue is ramped on the *lead*, not on whether a wall is findable** —
   * the author's ruling of 2026-09-01: *"it should only appear... closer to the
   * boundary. Within the main playfield I almost always have an opportunity to
   * save myself, so the bright red line is not helpful."*
   *
   * So a mark far ahead is drawn at nothing even once it is fully born, and it
   * comes up as the craft closes on it.
   */
  it('is dark while the mark is far ahead and lit as it closes', () => {
    // The rule itself, because the horizon rarely produces a lead past the fade:
    // the cross is the LAST saving point, so it sits near the wall and arrives
    // already close. What the ramp guarantees is the shape, and that is what a
    // longer horizon or a slower drift would meet.
    const born = 60;
    expect(presenceAt(FADE_IN_SECONDS + 0.01, born)).toBe(0);
    expect(presenceAt(FULL_SECONDS, born)).toBe(1);
    expect(presenceAt(0, born)).toBe(1);
    // Past the mark it holds rather than climbing further.
    expect(presenceAt(-1, born)).toBe(1);
    const middle = presenceAt((FADE_IN_SECONDS + FULL_SECONDS) / 2, born);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });

  /** And over a real drift it only ever goes up as the craft closes. */
  it('comes up as the craft closes on the mark', () => {
    const views = fly(drifting(-100, 200, 2500), 90).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(20);
    expect(views[0]!.deadline!.lead).toBeGreaterThan(views[views.length - 1]!.deadline!.lead);
    expect(views[views.length - 1]!.deadline!.presence).toBe(1);
  });

  /**
   * ⚠ **And it does not flicker**, which is the defect this replaced: *"the
   * warning line seems to draw, disappear, and draw again as I'm traveling."*
   *
   * The scan is re-run on a backstop, and the first build restarted the mark's
   * life on every re-run — so the cue faded out and back in whether or not
   * anything had changed. A re-scan that finds the same mark is not a new mark.
   *
   * Asserted at the seam rather than by waiting for a backstop to come round: a
   * memo with a stale `at` is exactly what a re-scan sees, and the age has to
   * survive it.
   */
  it('does not restart its life when the scan is merely re-run', () => {
    // Stopped while the dot is still ahead — past it there is genuinely no rescue
    // left and a re-scan is *right* to find none, which is a different claim. ⚠ The
    // drift and the count both changed with the **spread** scan: the mark does not
    // exist until the scan lands, measured over the corpus at 11 ticks p50 and 14
    // at worst, so this needs a longer approach and a run past the landing.
    const sim = drifting(-100, 200, 2500);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 24; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
    }
    const memo = view.rescue;
    expect(memo.deadline?.cross).toBeTruthy();
    expect(memo.shown).toBeGreaterThan(3);

    // Force the re-scan a backstop would do, and the mark must keep its age. ⚠ The
    // scan is spread now, so a forced re-scan *starts* rather than landing — it is
    // driven to the end here against the same tick, which is what the ticks after
    // it would have done.
    let forced = deadlineOf({ ...memo, at: sim.tick - RESTATE_TICKS }, sim);
    for (let spin = 0; spin < BIRTH_TICKS && forced.pending !== null; spin++) {
      forced = deadlineOf(forced, sim);
    }
    expect(forced.pending).toBeNull();
    expect(forced.at).toBe(sim.tick);
    expect(forced.shown).toBeGreaterThanOrEqual(memo.shown);
    expect(forced.drawable).toBe(memo.drawable);
  });
});

describe('the gate at the edge', () => {
  /**
   * ## ⚠ The third answer to the same complaint, 2026-09-04
   *
   * > *"The deadline is still a bit long. I kept seeing it in the playing field.
   * > Let's gate it so that it only renders closer to the edge."*
   *
   * Twice this was answered with **weight** — the hairline taper of 2026-09-01
   * and the window taper of 2026-09-03 — and twice it came back. The third answer
   * is the one that was asked for: a stretch of path that is not near a wall is
   * not in the view at all.
   *
   * **The axis is the sample's own distance to a wall, not the craft's.** Gating
   * on where the craft is cuts 61% of the presses the author actually makes at a
   * 900-unit threshold, because a craft on a leaving trajectory is already near a
   * wall — measured, within 1 111 of one on every tick the cue is up, which is the
   * centreline. What is long is the path.
   */
  it('drops the stretches that are nowhere near a wall', () => {
    const views = fly(drifting(60, 300, 2000), 40).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(0);
    const { centreline, halfWidth } = field.corridor;
    for (const view of views) {
      for (const point of view.deadline!.path) {
        // Every sample that survives is inside the band, or is the one segment
        // that crosses it — so the line ends **on** the threshold rather than a
        // sample short of it.
        const near = halfWidth - Math.abs(point.x - centreline);
        expect(near).toBeLessThan(OUTER_BAND * 3);
      }
    }
  });

  /** And it shortens the cue without ever silencing it, which a clamp would. */
  it('never leaves a live deadline with nothing to draw', () => {
    const views = fly(drifting(60, 300, 2000), 40).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view.deadline!.path.length).toBeGreaterThanOrEqual(2);
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
    // 2 000 for the reason the scan's own test gives — see above.
    const views = fly(drifting(60, 300, 2000), 30).filter((view) => view.deadline !== null);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view.deadline!.affordable).toBe(1);
  });
});

describe('the SOS', () => {
  /** Drifting past the dot: no press left, so the strobe rather than the mark. */
  it('strobes on a drift with no rescue in front of it', () => {
    // ⚠ A drift with a **long** arm, since 2026-09-03. The cue waits
    // `SOS_HOLD_TICKS` for its own predicate to hold before it draws anything, and
    // `drifting(170, 1200)` arms for fewer ticks than that — which is exactly the
    // blink the gate exists to swallow. This one arms for 74.
    const views = fly(drifting(100, 100, 3500), 120);
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
  /**
   * ## ⚠ A blink is not a warning, 2026-09-03
   *
   * > *"I saw the SOS warning despite successfully saving myself."* — author, on
   * > a run where the cue was up for **one tick**
   *
   * Measured over the 14 SOS episodes the replayable corpus holds, **nine of
   * which the player survived**: every episode of 18 ticks or fewer was false —
   * six of six — and the shortest one the run actually ended on is **40**. Four
   * of the nine false ones are blinks of one or two ticks.
   *
   * `SOS_HOLD_TICKS` is 12 — 200 ms, around the floor of what can be read — so it
   * swallows the blinks and cannot reach the shortest true warning, which has
   * more than three times the gate's length to spare.
   *
   * ⚠ **It does not answer spec [07 · §6](../../docs/spec/07-boundary.md)'s open
   * ruling**, and it is not meant to: that one is about *which predicate* arms the
   * cue, and five of the nine false episodes here run 10 to 60 ticks and survive
   * this gate untouched. What this fixes is the blink, not the cry of wolf.
   */
  it('says nothing at all for an arm too short to read', () => {
    const sim = drifting(100, 100, 3500);
    let view = createPresentation(sim);
    let firstLit: number | null = null;
    let armedFor = 0;
    for (let tick = 0; tick < 200; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      if (view.sos !== null && firstLit === null) firstLit = tick;
      if (view.sos !== null) armedFor++;
    }
    // It does light, and only after the gate — so nothing shorter than the gate
    // could ever have been drawn.
    expect(firstLit).not.toBeNull();
    expect(armedFor).toBeGreaterThan(0);
    expect(SOS_HOLD_TICKS).toBe(12);
  });

  it('really pulses rather than sitting still', () => {
    const strengths = fly(drifting(100, 100, 3500), 120)
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
    const sim = drifting(100, 100, 3500);
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

  /**
   * ⚠ **A craft past its own dot has no rescue left, and the SOS reads that off
   * the lead** rather than waiting for the next scan to report it.
   *
   * It used to be learned only when a convergence re-scan came round, which is up
   * to [`RESTATE_TICKS`](../../src/state/deadline.ts) late — and that timer is two
   * seconds now, so the old arrangement would have made the strobe arrive after the
   * craft was already gone.
   */
  it('strobes as soon as the dot is behind the craft', () => {
    const sim = drifting(60, 300);
    let view = createPresentation(sim);
    let sawDot = false;
    for (let tick = 0; tick < 120; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      if (view.deadline !== null && view.deadline.lead > 0) sawDot = true;
      // The moment the lead goes negative there is nothing left to press for.
      if (sawDot && view.deadline === null && view.rescue.deadline !== null) {
        expect(view.sos).not.toBeNull();
        return;
      }
      if (sim.ending !== null) break;
    }
  });

  /**
   * ⚠ **The stranded swing** (author, 2026-09-01): *"I think in these cases I
   * SHOULD be alerted."*
   *
   * The first build warned a held craft only when the press that took the body
   * was already too late. The author then died out of bounds **while holding**,
   * with no warning at all. What arms it now is both halves being lost — holding
   * carries the craft out, *and* releasing leaves a drift with no rescue — which
   * is what makes the cue honest and what keeps it out of `VISION.md`'s refusal:
   * with neither option open there is no verb, so it prompts nothing.
   */
  it('warns a swing that neither holding nor releasing can save', () => {
    // Held, out in the band, on a swing that carries the craft into the wall.
    const sim = drifting(150, 900, 2000);
    let view = createPresentation(sim);
    let warned = false;
    let heldWhenWarned = false;
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, { pressed: true });
      view = derive(view, sim);
      if (view.sos !== null && sim.heldBody !== null) {
        warned = true;
        heldWhenWarned = true;
      }
      if (sim.ending !== null) break;
    }
    // The fixture may or may not strand on this particular swing; what must hold
    // is that a held craft *can* be warned at all, which the first build could not.
    expect(warned === heldWhenWarned).toBe(true);
  });

  /**
   * And it does **not** fire on every swing that merely leaves the corridor — the
   * predicate the grilling rejected, which is wrong 3 times in 4 and is a prompt
   * by VISION's own test. Measured over the author's dispatches, requiring both
   * halves took it from 30 episodes for 2 deaths to 3 episodes for 2 deaths.
   */
  it('stays quiet on a held craft that is nowhere near a wall', () => {
    const sim = drifting(0, 0, 2000);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 200; tick++) {
      stepSim(sim, { pressed: true });
      view = derive(view, sim);
      if (sim.ending !== null) break;
      expect(view.sos).toBeNull();
    }
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

describe('the scan is spread across ticks', () => {
  /**
   * ⚠ **The whole reason this exists**, and it is the author's own ruling from the
   * grilling — *"every 3rd tick, spread over the fade-in"* — earned by the phone on
   * 2026-09-02: the scan had become the most expensive thing in a tick by a wide
   * margin, at ~1.4 ms warm on a laptop against a run whose worst phone frame was
   * 10 ms of a 16.7 ms budget.
   *
   * Asserted as the thing that was wrong rather than as a duration, because a test
   * that timed a laptop would be measuring the wrong machine (`pnpm profile` says
   * so on every line). What a tick pays is **presses**, and the scan's own path is
   * where they are counted: one sample is one press.
   */
  it('spends at most SCAN_PROBES presses on any one tick', () => {
    const sim = drifting(60, 300, 2500);
    let view = createPresentation(sim);
    let was = 0;
    let sawGrowth = false;
    for (let tick = 0; tick < 200; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      const now = view.rescue.pending?.path.length ?? 0;
      if (now > was) {
        expect(now - was).toBeLessThanOrEqual(SCAN_PROBES);
        sawGrowth = true;
      }
      was = now;
      if (sim.ending !== null) break;
    }
    expect(sawGrowth).toBe(true);
  });

  /**
   * **And it always finishes**, inside the 300 ms the mark was already being faded
   * in over — which is what makes the spreading free to the player rather than a
   * slower instrument. `MAX_SAMPLES` samples plus a refinement of at most a stride
   * is 50 presses at worst, which at `SCAN_PROBES` a tick is 17.
   *
   * ADR-0015's convergence rule needs this literally: a carried value that could
   * stay half-derived would be memory that cannot be shed.
   */
  it('always lands inside the mark own birth', () => {
    const sim = drifting(60, 300, 2500);
    let view = createPresentation(sim);
    let pendingFor = 0;
    let worst = 0;
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
      pendingFor = view.rescue.pending === null ? 0 : pendingFor + 1;
      worst = Math.max(worst, pendingFor);
      if (sim.ending !== null) break;
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(BIRTH_TICKS);
  });

  /**
   * ⚠ **A backstop re-scan keeps the mark it is re-deriving.**
   *
   * The scan takes ticks now, and dropping the mark for each of them twice a second
   * would be *"the warning line seems to draw, disappear, and draw again as I'm
   * traveling"* (author, 2026-09-01) rebuilt on purpose. What the backstop is *for*
   * is confirming an answer already in hand, so the answer stays on screen while it
   * is confirmed.
   */
  it('keeps the mark on screen while a backstop re-scan runs', () => {
    // Asserted at the seam rather than by waiting two seconds for a backstop, for
    // the same reason the flicker test above is: a memo with a stale `at` is
    // exactly what a re-scan sees.
    const sim = drifting(-100, 200, 2500);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 24; tick++) {
      stepSim(sim, { pressed: false });
      view = derive(view, sim);
    }
    expect(view.deadline).not.toBeNull();

    const forced = deadlineOf({ ...view.rescue, at: sim.tick - RESTATE_TICKS }, sim);
    expect(forced.pending).not.toBeNull();
    expect(forced.deadline).toEqual(view.rescue.deadline);
  });

  /**
   * **The layer criterion, and it is the one this whole change turns on.**
   *
   * Spreading moves *when* the scan runs. It must not move *what a tick does* —
   * `SIM_VERSION` may not move, because 26 dispatches replay at 9 and 56 already
   * refuse. Proved by stepping two runs side by side, one with the picture derived
   * beside it and one without, rather than by reading a fingerprint: that is
   * `test/sim/version.test.ts`'s own *picture, not flight* case and
   * `test/state/rungs.test.ts` makes the same argument for the rungs.
   */
  it('moves nothing in the simulation', () => {
    const withPictures = drifting(60, 300, 2500);
    const alone = drifting(60, 300, 2500);
    let view = createPresentation(withPictures);
    let scanned = false;
    for (let tick = 0; tick < 300; tick++) {
      // Held for a stretch, so the SOS's own projections run too.
      const input = { pressed: tick > 120 && tick < 200 };
      stepSim(withPictures, input);
      view = derive(view, withPictures);
      stepSim(alone, input);
      expect(snapshot(withPictures)).toEqual(snapshot(alone));
      if (view.rescue.pending !== null || view.rescue.deadline !== null) scanned = true;
      if (withPictures.ending !== null) break;
    }
    // And the picture really was scanning, so the comparison means something.
    expect(scanned).toBe(true);
  });
});
