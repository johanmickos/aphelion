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
import { DEADZONE, RELEASE_RATE, THUMB_BUDGET } from '../../src/state/camera.ts';
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
  for (let tick = 0; tick < ticks; tick++) {
    stepSim(sim, tick >= grabAt && tick < letGoAt ? PRESS : LET_GO);
    views.push(derive(views[views.length - 1]!, sim));
    held.push(sim.heldBody !== null);
    settled.push(sim.orbit !== null && sim.orbit.ticksSinceFreeze >= SETTLE_TICKS);
  }
  return { views, held, settled };
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
    // of the settle: the dive and the oval are flown rather than watched, and
    // the view is on the craft for all of it.
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
   * *"A bit less sensitive to my ship's up-and-down."* A craft that has not left
   * the band does not move the view at all — and the band is derived rather than
   * chosen, so a craft circling a typical body at its floor is inside it.
   */
  it('ignores movement smaller than the deadzone', () => {
    const sim = world();
    let view = createPresentation(sim);
    const settledAt = view.camera.y;
    sim.craft.y = settledAt + DEADZONE * 0.9;
    view = derive(view, sim);
    expect(view.camera.y).toBe(settledAt);
  });

  /**
   * It converges on the band's *edge*, never on its centre — the limit cycle
   * `targetY` exists to avoid. Long enough for the ease to arrive: at
   * `FOLLOW_RATE` 3 the time constant is a third of a second, so this is about
   * two seconds of settling rather than the one it took at 8.
   */
  it('follows once the craft leaves the band', () => {
    const sim = world();
    let view = createPresentation(sim);
    sim.craft.y = view.camera.y + DEADZONE * 4;
    for (let i = 0; i < 400; i++) view = derive(view, sim);
    expect(view.camera.y).toBeCloseTo(sim.craft.y - DEADZONE, 3);
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
   * the ramp travels **about two design units** instead of none. Two units on a
   * 2 532-tall design space is half a pixel on the phone this was reported from,
   * and the fault it replaced was 49.
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
      expect(travelled).toBeLessThan(REPORTED / 10);
    },
  );

  /**
   * A release must not lurch. The lock is carried *out* at the same rate it came
   * in, over the body it was held on rather than over the craft — dropping the
   * anchor at the release would snap the view by a whole orbit radius, on the one
   * tick the swing is paid for.
   */
  it.each(SWINGS)('never jumps, through %s', (_name, grabAt, letGoAt) => {
    const { views } = fly(grabAt, letGoAt);
    const craftSteps: number[] = [];
    for (let i = 1; i < views.length; i++) {
      craftSteps.push(Math.abs(views[i]!.craft.y - views[i - 1]!.craft.y));
    }

    // The camera is a filter on the craft and may exceed it only by what the
    // release decay is spending, which is bounded by the orbit's own radius
    // times the decay rate — about 10 design units a tick at the largest body in
    // the field. Without the decay this tick is a jump of a whole orbit radius,
    // at the exact moment the swing is paid for.
    const budget = (MEDIAN_RADIUS + FLOOR_GAP) * 2 * (RELEASE_RATE / 60);
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
