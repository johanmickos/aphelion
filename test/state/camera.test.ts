/**
 * Where the world is watched from.
 *
 * The camera is unspecified — spec 05 says nothing about scrolling, spec 00 §5
 * rules only that it never rotates, shakes or randomises, and spec 02's kick and
 * spec 12's held finish are both later milestones'. M1.6 decided one, flew it,
 * and the demo reported the two faults it had predicted: *"the camera bounces up
 * and down when I orbit a planet"*, and *"generally a bit less sensitive to my
 * ship's up-and-down."* These are the assertions the fix is worth having.
 *
 * They are written on a whole flown swing rather than on the function, because
 * the camera's failure mode is never a wrong frame — it is a wrong *sequence* of
 * them.
 */
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { FLOOR_GAP, MEDIAN_RADIUS, SETTLE_TICKS } from '../../src/sim/units.ts';
import {
  DEADZONE,
  FOLLOW_RATE,
  LOCK_TICKS,
  LOOK_AHEAD,
  LOOK_REF_SPEED,
  lockOf,
  PARKED,
  THUMB_BUDGET,
} from '../../src/state/camera.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import type { PresentationState } from '../../src/state/types.ts';

const PRESS = { pressed: true };
const LET_GO = { pressed: false };

interface Flight {
  readonly views: readonly PresentationState[];
  /** Which of them were flown with a body held, by index. */
  readonly held: readonly boolean[];
  /** Which of them were riding a settled orbit. */
  readonly settled: readonly boolean[];
  /** Which of them had a frozen orbit at all — the look-ahead's own gate. */
  readonly frozen: readonly boolean[];
}

function world(): SimState {
  return createInitialState(fixtureField(), fixtureCraft(), 1);
}

/**
 * Coast in, press, dive, freeze, settle, orbit, let go, coast out.
 *
 * `grabAt` and `letGoAt` are tick numbers, so one geometry can be flown as
 * several different swings — which is how the bounds below are checked against
 * more than one path rather than against the one that happened to be written
 * first.
 */
function fly(grabAt: number, letGoAt: number, ticks = 420): Flight {
  const sim = world();
  const views: PresentationState[] = [createPresentation(sim)];
  const held: boolean[] = [sim.heldBody !== null];
  const settled: boolean[] = [false];
  const frozen: boolean[] = [false];
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, tick >= grabAt && tick < letGoAt ? PRESS : LET_GO);
    views.push(derive(views[views.length - 1]!, sim));
    held.push(sim.heldBody !== null);
    settled.push(sim.orbit !== null && sim.orbit.ticksSinceFreeze >= SETTLE_TICKS);
    frozen.push(sim.orbit !== null);
  }
  return { views, held, settled, frozen };
}

/** The craft's height on screen, in design coordinates. */
function onScreen(view: PresentationState): number {
  return DESIGN_HEIGHT / 2 + (view.craft.y - view.camera.y);
}

/** How far the camera moved between consecutive ticks. */
function steps(views: readonly PresentationState[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < views.length; i++)
    out.push(Math.abs(views[i]!.camera.y - views[i - 1]!.camera.y));
  return out;
}

const SWINGS: ReadonlyArray<readonly [name: string, grabAt: number, letGoAt: number]> = [
  ['grabbed early, held long', 20, 300],
  ['grabbed late, held long', 60, 320],
  ['grabbed early, let go at the settle', 20, 130],
  ['tapped', 20, 24],
];

describe('the camera', () => {
  /**
   * **Nothing ever takes this camera off the centreline**, and that is a stronger
   * statement than it was a day ago. Spec [02 · §5](../../docs/spec/02-release.md)
   * put ADR-0012's punch here — a displacement along the exit tangent, which has a
   * horizontal component — and the author flew it and refused it: *"we don't
   * really want shake effects or pauses like that, it turns out that really
   * disrupts the flow"* (2026-08-29). So the exception this test briefly carried
   * is gone, and the rule is exact again.
   */
  it('does not move sideways, whatever the craft does', () => {
    const { views } = fly(20, 300);
    const travelled = Math.max(...views.map((v) => Math.abs(v.craft.x - views[0]!.craft.x)));
    expect(travelled).toBeGreaterThan(100);
    for (const view of views) expect(view.camera.x).toBe(DESIGN_WIDTH / 2);
  });

  /**
   * The reported fault. Through a settled orbit the craft goes round a still
   * point, and a view holding the craft still slides the world instead. Asserted
   * as what the player sees: over the settled stretch the camera barely moves at
   * all, while the craft goes right round.
   */
  it('holds still through a settled orbit', () => {
    const { views, settled } = fly(20, 320);
    const locked = views.filter((_, i) => settled[i]);
    expect(locked.length).toBeGreaterThan(60);

    // Ignore the first stretch: the lock eases in over about a third of a second
    // rather than snapping, which is the whole reason a release does not lurch.
    const held = locked.slice(45);
    const cameraSwing =
      Math.max(...held.map((v) => v.camera.y)) - Math.min(...held.map((v) => v.camera.y));
    const craftSwing =
      Math.max(...held.map((v) => v.craft.y)) - Math.min(...held.map((v) => v.craft.y));

    expect(craftSwing).toBeGreaterThan(100);
    expect(cameraSwing).toBeLessThan(craftSwing * 0.1);
  });

  /**
   * And the other half of the same decision: **the oval is flown, not watched.**
   * The prototype measured that easing the lock in on the settle's progress
   * flattened the oval's swing to under 2px — *"of 83px of total swing only 41
   * survived"* — and the demo's own next sentence was that the oval is the part
   * that feels great. So the lock is exactly zero until the settle is over.
   */
  it('leaves the oval alone', () => {
    const { views, settled } = fly(20, 320);
    const firstLocked = settled.indexOf(true);
    expect(firstLocked).toBeGreaterThan(0);

    // Exactly zero, not merely small, for every tick from the press to the end
    // of the settle: the dive and the oval are flown rather than watched.
    //
    // ⚠ **The view is on the craft for all of it *but the last `LOCK_TICKS`***,
    // since 2026-08-31: the band closes over that stretch so the view is at rest
    // before the lock rather than stopping dead when it arrives. What that costs
    // is measured — the share of the oval's swing the view flies falls from 0.80
    // to 0.73 over the author's re-flown dispatches — and `bandOf` carries the
    // argument. The **lock** is still exactly zero for the whole settle, which is
    // the ruling this test is named for and is untouched.
    for (let i = 0; i <= firstLocked; i++) {
      expect(views[i]!.camera.lock).toBe(0);
      expect(views[i]!.camera.offset).toBe(0);
    }
    // And the lock is off again the moment there is no settled orbit, whatever
    // displacement is still decaying behind it.
    for (let i = 0; i < views.length; i++) {
      if (!settled[i]) expect(views[i]!.camera.lock).toBe(0);
    }
  });

  /**
   * **And it comes to rest before the lock arrives rather than stopping dead.**
   *
   * *"When I capture a planet and circularize, the camera eventually settles
   * downwards a little bit. Can we instead just have the camera more smoothly
   * lock into place on the planet?"* (author, 2026-08-31, flagged at tick 931 of
   * that run.)
   *
   * The handover was two mechanisms that did not know about each other: the band
   * went from nothing to a whole `DEADZONE` on one tick, so a view following the
   * oval at several units a tick stopped in a single tick, and the lock then
   * eased in behind it. On the flagged capture the view ran
   * `… 1.4, 0.7, −0.1, −0.9, −1.7, −2.5, 0.0` — swinging one way, back the other,
   * and then a corner.
   *
   * What is asserted is the **velocity**, because that is what was reported. Over
   * the forty ticks the handover occupies the view's speed changes by at most
   * **1.67 and 2.85** on these two swings, against **6.30 and 6.66** before — so
   * the bound is 3, which is a tolerance rather than a value to reproduce
   * ([AGENTS.md](../../AGENTS.md) §4) and still fails the behaviour it replaced
   * by a factor of two. Over the author's own re-flown dispatches the same figure
   * runs p50 3.12 → 0.65 and worst 7.48 → 0.88.
   *
   * Distance is asserted next door in *arrives at the lock without moving*, which
   * the same pair took from 12.6 and 15.0 design units to **exactly zero**.
   *
   * ⚠ **The corner is smaller and not gone**, and that is measured rather than
   * hoped. The band shuts before the settle ends, so the view parks — and then
   * the craft, which is still going round, drifts back out of the band and the
   * view follows it again at a unit or two a tick before the lock stops it. What
   * remains is the third of what was there. Closing the band later leaves less
   * room to drift and more corner; over the author's own dispatches a window of
   * twelve ticks measures worse than twenty on both counts, which is why the
   * window is `LOCK_TICKS` rather than something fitted to these two swings.
   */
  it.each(SWINGS.slice(0, 2))('comes to rest before the lock, in %s', (_n, grabAt, letGoAt) => {
    const { views, settled } = fly(grabAt, letGoAt);
    const firstLocked = settled.indexOf(true);
    expect(firstLocked).toBeGreaterThan(0);

    // Across the handover itself — the band closing over the settle's last
    // `LOCK_TICKS`, then the lock arriving over its own — and no wider: the
    // stretch before that is the **oval being flown**, where the view is meant to
    // be tracking a craft that is accelerating, and a bound on its jerk would be
    // a bound on the thing `OVAL_BAND` exists to allow.
    let worst = 0;
    for (let i = firstLocked - LOCK_TICKS; i < firstLocked + LOCK_TICKS; i++) {
      const step = views[i]!.camera.y - views[i - 1]!.camera.y;
      const before = views[i - 1]!.camera.y - views[i - 2]!.camera.y;
      worst = Math.max(worst, Math.abs(step - before));
    }
    expect(worst).toBeLessThan(3);

    // And the view really has slowed down into the handover rather than merely
    // taking a smoother route at the same speed: it arrives at the lock at under
    // half the speed it was flying the oval at.
    let fastest = 0;
    for (let i = firstLocked - SETTLE_TICKS; i < firstLocked - LOCK_TICKS; i++) {
      fastest = Math.max(fastest, Math.abs(views[i]!.camera.y - views[i - 1]!.camera.y));
    }
    const arriving = Math.abs(views[firstLocked]!.camera.y - views[firstLocked - 1]!.camera.y);
    expect(fastest).toBeGreaterThan(2);
    expect(arriving).toBeLessThan(fastest * 0.5);

    // Once the lock has it, it is exactly still — the anchor is the point it is
    // standing on and `closing` has nothing left to cover.
    for (let i = firstLocked + 1; i < firstLocked + 20; i++) {
      expect(Math.abs(views[i]!.camera.y - views[i - 1]!.camera.y)).toBeLessThan(0.1);
    }
  });

  /**
   * **And it does not settle anywhere once the orbit is round.**
   *
   * *"I still see the camera settling in lower once the orbit is reached. I think
   * it'd be nicer if the camera just stayed at the level it was at when I first
   * started circularizing"* (author, 2026-08-31, flagged at tick 518).
   *
   * The first correction that day took the *corner* out of the handover and left
   * the **distance** where it was. On a wide orbit `stillPoint`'s clamp binds —
   * the view finishes the oval further from the body than the lock will hold it
   * — and all of that travel was still being spent after the orbit had become
   * round, which is the one moment the player has stopped expecting the picture
   * to move. On the flagged capture it was 79 design units.
   *
   * [`outOfFrame`](../../src/state/camera.ts) spends it over the settle's last
   * `LOCK_TICKS` instead, inside movement that is already happening. What is
   * asserted is the author's sentence directly: **from the tick the orbit is
   * round, the view does not move at all.** Over their own dispatches re-flown
   * at `SIM_VERSION` 9 the travel in the forty ticks after the settle ends is
   * 0.00 at p50, at p95 and at worst, against 0.71 / 15.61 / 19.30 before.
   *
   * ⚠ **This test cannot see the second correction, and that is worth saying
   * rather than papering over.** No swing of the fixture field puts the view more
   * than a `DEADZONE` from the body when its settle ends — searched over 51
   * grab-and-release pairs — so the clamp never binds here, and this passes on
   * both sides of `outOfFrame`. Displacing the camera by hand does not help
   * either: at any distance large enough for the lock's clamp to bind, the
   * ordinary deadzone is already pulling the view back, so both versions arrive.
   *
   * What it does earn its place for is failing the behaviour before **either**
   * of the day's two corrections. The evidence for the second one is the
   * author's own dispatches and nothing else — travel after the settle ends,
   * p50/p95/worst, **0.71 / 15.61 / 19.30 → 0.00 / 0.00 / 0.00** — which is the
   * cohort this project already treats as the authority on feel, and is a
   * standing reason the fixture field is not a substitute for flying it.
   */
  it.each(SWINGS.slice(0, 2))('does not settle once the orbit is round, in %s', (_n, g, l) => {
    const { views, settled } = fly(g, l);
    const firstLocked = settled.indexOf(true);
    expect(firstLocked).toBeGreaterThan(0);

    let travelled = 0;
    for (let i = firstLocked + 1; i < firstLocked + 40 && settled[i]; i++) {
      travelled += Math.abs(views[i]!.camera.y - views[i - 1]!.camera.y);
    }
    expect(travelled).toBeLessThan(0.5);
  });

  /**
   * *"A bit less sensitive to my ship's up-and-down."* A craft that has not left
   * the band does not move the view at all — and the band is derived rather than
   * chosen, so a craft circling a typical body at its floor is inside it.
   */
  /** `vy` is zeroed to take the look-ahead out of the picture; it has its own tests. */
  function still(): SimState {
    const sim = world();
    sim.craft.vy = 0;
    return sim;
  }

  it('ignores movement inside the parked part of the band', () => {
    const sim = still();
    let view = createPresentation(sim);
    const settledAt = view.camera.y;
    sim.craft.y = settledAt + DEADZONE * PARKED * 0.99;
    view = derive(view, sim);
    expect(view.camera.y).toBe(settledAt);
  });

  /**
   * **And leaves that region without a step**, which is what the author flew as
   * *"the camera moves, freezes, and moves. Can it be a bit more elastic?"* The
   * hard band's slope went from 0 to 1 at a single point; this one's is
   * continuous, so the view decelerates into stillness rather than stopping dead.
   */
  it('eases out of the parked region rather than stepping out of it', () => {
    const moved = (at: number): number => {
      const sim = still();
      let view = createPresentation(sim);
      const from = view.camera.y;
      sim.craft.y = from + DEADZONE * at;
      view = derive(view, sim);
      return view.camera.y - from;
    };
    // Nothing at the join, then a ramp — and each step bigger than the last, with
    // no jump at the boundary itself.
    expect(moved(PARKED)).toBe(0);
    const ramp = [0.75, 0.85, 1, 1.25, 1.5].map(moved);
    for (let i = 0; i < ramp.length; i++)
      expect(ramp[i]!).toBeGreaterThan(i === 0 ? 0 : ramp[i - 1]!);
    // The first step out is a small fraction of what a hard edge would have made
    // it once fully outside.
    expect(ramp[0]!).toBeLessThan(ramp.at(-1)! / 10);
  });

  it('follows once the craft leaves the band', () => {
    const sim = still();
    let view = createPresentation(sim);
    sim.craft.y = view.camera.y + DEADZONE * 4;
    for (let i = 0; i < 4000; i++) view = derive(view, sim);
    // It comes to rest where the band starts absorbing everything, which is the
    // edge of the parked region rather than the edge of the band. Approached from
    // outside this is a limit rather than a stop — the leak shrinks as the view
    // closes on it — exactly as an eased follow approaches anything.
    expect(view.camera.y).toBeCloseTo(sim.craft.y - DEADZONE * PARKED, 0);
  });

  /**
   * **The band still has a true equilibrium**, and that is why it is two pieces
   * rather than one smooth curve. A band that merely slows near the middle comes
   * to rest only on the craft itself, so a long straight coast creeps the view
   * onto it — the *"WAY too fixed on the ship"* the author refused earlier the
   * same day, arriving slowly instead of at once.
   */
  it('settles a band away and does not creep onto the craft', () => {
    const sim = still();
    let view = createPresentation(sim);
    sim.craft.y = view.camera.y + DEADZONE * 4;
    for (let i = 0; i < 4000; i++) view = derive(view, sim);
    const near = sim.craft.y - view.camera.y;
    // Ten times as long again, and it has not closed the gap: the limit is the
    // parked edge and not the craft.
    for (let i = 0; i < 40_000; i++) view = derive(view, sim);
    expect(sim.craft.y - view.camera.y).toBeGreaterThan(DEADZONE * PARKED * 0.999);
    expect(near - (sim.craft.y - view.camera.y)).toBeLessThan(1);
  });

  /**
   * And it **is** exactly still whenever the craft is inside the parked region,
   * which is the common case and the one the float is made of: measured over the
   * author's dispatches the view does not move at all on 30% of ticks.
   */
  it('is exactly still, not merely slow, inside the parked region', () => {
    const sim = still();
    let view = createPresentation(sim);
    const from = view.camera.y;
    for (const at of [0, 0.2, 0.5, PARKED]) {
      sim.craft.y = from + DEADZONE * at;
      const before = view.camera.y;
      view = derive(view, sim);
      expect(view.camera.y).toBe(before);
    }
  });

  /**
   * Reported from the phone, after the lock landed: *"there's still a slight
   * camera up/down movement right at the moment the ship seems to settle into
   * orbit."* Measured at **49 design units** over the ramp, and it was two
   * faults on top of each other — an anchor that had somewhere to go, and a
   * blend that pulled toward it from both ends. Now the ramp is a no-op: by the
   * time it starts, the deadzone has already brought the view to a stop, and the
   * point the lock holds on is the one it is standing on.
   *
   * Asserted as a **fraction of what was reported** rather than as exactly zero,
   * which is what it was until the follow rate came down to 3 (author,
   * 2026-08-28). A slower follow has not finished stopping when the ramp starts,
   * so the point the lock holds on is a hair off the one it will settle to, and
   * the ramp travels a little instead of none.
   *
   * **It travels twice as far since `SETTLE_RETURN` went to 0.30** (2026-08-29),
   * and that is a real and stated cost of the ruling rather than a loosened
   * bound. A settled orbit now keeps some of the dive's speed, so the craft is
   * going faster round the still point when the ramp runs and the follow ease has
   * less time to have stopped: measured, up to **10 design units** across the
   * ramp against under 5 before.
   *
   * **And a little further again since the oval is flown** (2026-08-30,
   * [`OVAL_BAND`](../../src/state/camera.ts)). With no band absorbing the swing,
   * the view ends the settle wherever the craft took it rather than parked near
   * the middle, so the ramp starts a little further from the point it will hold:
   * measured at **12.6 design units** against 12.2 before. That is a second
   * stated cost of a second ruling, and it is charged against the same budget —
   * spread over the ramp's twenty ticks it is **0.6 units a tick**, well under a
   * pixel on the phone this was reported from, where **the fault it replaced was
   * 49** in movement the author could see.
   */
  const REPORTED = 49;
  it.each(SWINGS.slice(0, 2))(
    'arrives at the lock without moving, in %s',
    (_n, grabAt, letGoAt) => {
      const { views } = fly(grabAt, letGoAt);
      let ramp = 0;
      let travelled = 0;
      for (let i = 1; i < views.length; i++) {
        const lock = views[i - 1]!.camera.lock;
        if (lock <= 0 || lock >= 1) continue;
        ramp += 1;
        travelled += Math.abs(views[i]!.camera.y - views[i - 1]!.camera.y);
      }
      expect(ramp).toBeGreaterThan(10);
      expect(travelled).toBeLessThan(REPORTED / 3);
      // And the thing that was actually reported was movement, not distance: no
      // single tick of the ramp may be visible.
      expect(travelled / ramp).toBeLessThan(1);
    },
  );

  /**
   * A release must not lurch. The lock is carried *out* at the same rate it came
   * in, over the body it was held on rather than over the craft — dropping the
   * anchor at the release would snap the view by a whole orbit radius, on the one
   * tick the swing is paid for.
   */
  /**
   * **The release lets go of the view on the same tick it lets go of the body.**
   *
   * *"The slight delay is making it seem jagged and jumpy. Let's remove any
   * camera/speed delay there"* (author, 2026-08-29). What was there was the lock's
   * displacement decaying at 5% a tick after a release — measured over the
   * recorded dispatches, **41 ticks at p50 and up to 104** before it was shed,
   * during which the view walked 356 design units away from a craft that was
   * accelerating in the other direction.
   *
   * It is asserted as a shape rather than as a rate, so there is no number left to
   * tune it back up with: with no body held there is no displacement at all.
   */
  it.each(SWINGS)('carries no hold once the body is gone, through %s', (_name, grabAt, letGoAt) => {
    const { views, held } = fly(grabAt, letGoAt);
    let after = 0;
    for (let i = 0; i < views.length; i++) {
      if (held[i]) continue;
      expect(views[i]!.camera.offset).toBe(0);
      expect(views[i]!.camera.lock).toBe(0);
      after++;
    }
    expect(after).toBeGreaterThan(60);
  });

  it.each(SWINGS)('never jumps, through %s', (_name, grabAt, letGoAt) => {
    const { views } = fly(grabAt, letGoAt);
    const craftSteps: number[] = [];
    for (let i = 1; i < views.length; i++) {
      craftSteps.push(Math.abs(views[i]!.craft.y - views[i - 1]!.craft.y));
    }

    // The camera is a **filter** on the craft and may exceed it only by what the
    // follow ease can spend in one tick, which is `FOLLOW_RATE / 60` of whatever
    // it is chasing. The release used to have its own budget on top of this — a
    // decaying hold that took up to 104 ticks to shed — and dropping it is what
    // makes this the only budget there is: the view now lets go of the orbit on
    // the same tick the craft does, and the deadzone absorbs the change.
    const budget = (MEDIAN_RADIUS + FLOOR_GAP) * 2 * (FOLLOW_RATE / 60);
    expect(Math.max(...steps(views))).toBeLessThan(Math.max(...craftSteps) + budget);
  });

  /**
   * Spec [00 · §7](../../docs/spec/00-tokens.md)'s thumb line, which is the
   * budget the deadzone and the follow lag are spending between them. Measured
   * over real swings rather than argued from the constants, because the two
   * offsets add and a third — the lock decaying after a release — adds to them.
   */
  it.each(SWINGS)('keeps the craft above the thumb line, through %s', (_name, grabAt, letGoAt) => {
    const { views } = fly(grabAt, letGoAt);
    const lowest = Math.max(...views.map(onScreen));
    expect(lowest - DESIGN_HEIGHT / 2).toBeLessThan(THUMB_BUDGET);
  });
});

describe('presentation state as a recurrence', () => {
  /**
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
   * first rule. A frame is a pure function of `(recipe, tick)`: replay the
   * recipe, replay the presentation beside it, and tick n is tick n.
   */
  it('reproduces itself from the same recipe', () => {
    const a = fly(20, 300);
    const b = fly(20, 300);
    expect(b.views).toEqual(a.views);
  });

  it('is a pure function of its two arguments', () => {
    const sim = world();
    let view = createPresentation(sim);
    for (let i = 0; i < 90; i++) {
      stepSim(sim, PRESS);
      view = derive(view, sim);
    }
    expect(derive(view, sim)).toEqual(derive(view, sim));
  });

  /**
   * Its third rule, and the honest replacement for *"no memory"*: memory that
   * cannot be shed turns one bad tick into a permanently wrong picture. Two
   * cameras started far apart, fed the same simulation, must agree again.
   */
  it('sheds a disagreement rather than carrying it forever', () => {
    const sim = world();
    const straight = createPresentation(sim);
    const displaced: PresentationState = {
      ...straight,
      camera: { ...straight.camera, y: straight.camera.y + 4000, offset: 900 },
    };

    let a = straight;
    let b = displaced;
    for (let i = 0; i < 240; i++) {
      stepSim(sim, LET_GO);
      a = derive(a, sim);
      b = derive(b, sim);
    }
    expect(Math.abs(b.camera.y - a.camera.y)).toBeLessThan(1);
    expect(b.camera.lock).toBe(a.camera.lock);
  });

  /**
   * Its second rule. A run opens placed rather than eased into place, so it never
   * begins by gliding in from wherever the last one ended — which is what a
   * reset would otherwise look like, and the prototype records exactly that.
   */
  it('opens placed, not easing', () => {
    const sim = world();
    const opened = createPresentation(sim);
    expect(opened.camera.y).toBe(sim.craft.y);
    expect(opened.camera.lock).toBe(0);
    expect(opened.camera.offset).toBe(0);
  });
});

/**
 * The look-ahead, carried from the prototype's horizontal one onto the axis this
 * game actually climbs (ADR-0013).
 *
 * Asked for by the author on 2026-08-30: *"follow the ship a bit more
 * preemptively when it's traveling upwards... when I go fast I often feel like
 * the camera isn't showing me far enough ahead to make a safe capture."*
 */
describe('the look-ahead', () => {
  const settle = (sim: SimState): PresentationState => {
    let view = createPresentation(sim);
    for (let i = 0; i < 4000; i++) view = derive(view, sim);
    return view;
  };

  it('puts the view ahead of a climbing craft, and behind a falling one', () => {
    const up = world();
    up.craft.vy = -LOOK_REF_SPEED;
    const down = world();
    down.craft.vy = LOOK_REF_SPEED;
    // Same craft position, opposite headings: the view sits on opposite sides.
    down.craft.y = up.craft.y;
    expect(settle(up).camera.y).toBeLessThan(up.craft.y);
    expect(settle(down).camera.y).toBeGreaterThan(down.craft.y);
  });

  it('reaches its full extent at the reference speed and no further', () => {
    const fast = world();
    fast.craft.vy = -LOOK_REF_SPEED;
    const faster = world();
    faster.craft.vy = -LOOK_REF_SPEED * 4;
    faster.craft.y = fast.craft.y;
    expect(settle(faster).camera.y).toBeCloseTo(settle(fast).camera.y, 6);
    // And the extent is the prototype's own reach, less the parked region the
    // view comes to rest at the edge of.
    expect(fast.craft.y - settle(fast).camera.y).toBeCloseTo(LOOK_AHEAD - DEADZONE * PARKED, 0);
  });

  /**
   * **The prototype's hard-learned gate.** After the freeze the craft rides a
   * phase clock and its velocity reverses every half orbit — *"anything steering
   * off it swings the view"* — so velocity stops meaning heading and the lead
   * goes off. It stays on through the **dive**, where suppressing it *"put a
   * 110px lurch"* into the prototype's own.
   */
  it('is off once the dive has frozen, and on through the dive', () => {
    // Fly to a frozen tick where the craft is actually going somewhere
    // vertically, then derive that one tick twice: once as the simulation has
    // it, and once with the freeze taken away. Nothing else differs — the lock
    // is still 0 this early — so any difference is the gate.
    const sim = world();
    let tick = 0;
    for (; tick < 420; tick++) {
      stepSim(sim, tick >= 30 ? PRESS : LET_GO);
      // Enough vertical speed that the lead would clear the deadzone if it ran —
      // otherwise the band absorbs it and the test proves nothing either way.
      if (sim.orbit !== null && Math.abs(sim.craft.vy) > LOOK_REF_SPEED) break;
    }
    expect(sim.orbit).not.toBeNull();
    expect(lockOf(sim)).toBe(0);

    const before = createPresentation(sim);
    const frozen = derive(before, sim);
    const diving = derive(before, { ...sim, orbit: null });
    // Frozen, the view does not move at all: the craft is inside the band and
    // nothing is steering off its phase clock. Diving, the lead carries it out.
    expect(frozen.camera.y).toBe(before.camera.y);
    expect(Math.abs(diving.camera.y - before.camera.y)).toBeGreaterThan(1);
  });

  /** The craft may never be pushed below the thumb line by any of this. */
  it('never spends more than the thumb budget', () => {
    for (const [grab, go] of [
      [30, 120],
      [30, 260],
      [60, 400],
    ] as const) {
      for (const view of fly(grab, go).views)
        expect(view.craft.y - view.camera.y).toBeLessThan(THUMB_BUDGET);
    }
  });
});
