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
  LOOK_AHEAD,
  LOOK_REF_SPEED,
  SIDEWAYS_BAND,
  followCamera,
  lockOf,
  openCamera,
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
   * ⚠ **It moves sideways now** (author, 2026-09-01), and this test used to assert
   * the opposite. What replaces it is the behaviour rather than the prohibition:
   * the same deadzone and the same ease, on the second axis.
   *
   * The refusal that assertion was also carrying — ADR-0012's punch, *"6px along
   * the exit tangent"*, refused by the author on 2026-08-29 — has moved to
   * `test/state/release.test.ts`, where it is asserted as what it is: a release
   * puts no **step** in the view. A prohibition on movement could no longer say
   * that, because the view is allowed to move.
   */
  it('follows the craft sideways, through a deadzone', () => {
    const { views } = fly(20, 300);
    const travelled = Math.max(...views.map((v) => Math.abs(v.craft.x - views[0]!.craft.x)));
    expect(travelled).toBeGreaterThan(100);
    // It moved — the old assertion's negation, and it has to be true or the axis
    // is not built.
    const panned = Math.max(...views.map((v) => Math.abs(v.camera.x - views[0]!.camera.x)));
    expect(panned).toBeGreaterThan(0);
    // And it followed rather than being dragged: the view is never further from
    // the craft than the deadzone plus what the ease can lag by.
    for (const view of views) {
      expect(Math.abs(view.craft.x - view.camera.x)).toBeLessThan(DESIGN_WIDTH / 2);
    }
  });

  /**
   * **The deadzone is real on this axis too**: a craft moving less than the band
   * does not move the view at all.
   *
   * Asserted as the thing that would break if `x` were merely eased at the craft
   * — the *"WAY too fixed on the ship"* the author refused on the other axis
   * (2026-08-30), which arrives on a new axis for free if nobody checks.
   */
  it('holds still while the craft moves inside the band', () => {
    const { views } = fly(20, 300);
    let held = 0;
    for (let i = 1; i < views.length; i++) {
      const moved = Math.abs(views[i]!.craft.x - views[i - 1]!.craft.x);
      const panned = Math.abs(views[i]!.camera.x - views[i - 1]!.camera.x);
      if (moved > 0 && panned === 0) held++;
    }
    expect(held).toBeGreaterThan(0);
  });

  /**
   * **Jerk, not distance** — `docs/plan/m2-the-instrument.md`'s own trap, and the
   * measure the parked camera session says *abrupt* actually means.
   *
   * The bar is the axis the author has already flown: the sideways view may not
   * be jerkier than the vertical one over the same swing. Measured over the
   * dispatch corpus when this landed it was lower at every percentile — p95 0.55
   * against 0.73, p99 0.77 against 2.38.
   */
  it('is no jerkier sideways than it already is vertically', () => {
    const { views } = fly(20, 300);
    const jerks = (of: (v: (typeof views)[number]) => number): number[] => {
      const out: number[] = [];
      for (let i = 1; i < views.length - 1; i++) {
        out.push(Math.abs(of(views[i + 1]!) - 2 * of(views[i]!) + of(views[i - 1]!)));
      }
      return out.sort((a, b) => a - b);
    };
    const at = (xs: number[], p: number): number => xs[Math.floor((p / 100) * xs.length)]!;
    const sideways = jerks((v) => v.camera.x);
    const vertical = jerks((v) => v.camera.y);
    for (const p of [50, 90, 95, 99]) {
      expect(at(sideways, p)).toBeLessThanOrEqual(at(vertical, p));
    }
  });

  /**
   * ⚠ **The view stops at the line** (author, 2026-09-01): *"the edge should kind
   * of lock at the screen edge, and not expose stuff 'past' it."*
   *
   * The bound is on the **picture**, not on the craft — spec 00 §7 makes the
   * design space's width a contract, so the same bound holds on every device.
   * Flown out to the wall in the real field, the picture's edge reaches the line
   * and stops.
   */
  it('never lets the picture show past the line', () => {
    const field = fixtureField();
    const craft = fixtureCraft();
    const { centreline, halfWidth } = field.corridor;
    // Out past the line, which is where the run ends — the hardest case for the
    // bound, because framing wants to follow and is not allowed to.
    craft.x = centreline + halfWidth + 10;
    const sim = createInitialState(field, craft, 1);
    let view = openCamera(sim);
    for (let tick = 0; tick < 600; tick++) view = followCamera(view, sim);
    expect(view.x + DESIGN_WIDTH / 2).toBeLessThanOrEqual(centreline + halfWidth + 1e-6);

    craft.x = centreline - halfWidth - 10;
    const other = createInitialState(field, craft, 1);
    let back = openCamera(other);
    for (let tick = 0; tick < 600; tick++) back = followCamera(back, other);
    expect(back.x - DESIGN_WIDTH / 2).toBeGreaterThanOrEqual(centreline - halfWidth - 1e-6);
  });

  /**
   * **And the field beats framing where they disagree**, which is the prototype's
   * ruling and the author's: a craft inside spec 01 §10's four units of grace is
   * about to die there, and *"a rule about what the player may SEE"* wins. So the
   * craft leaves the picture rather than dragging it into the void.
   */
  it('lets the craft leave rather than showing dead space', () => {
    const field = fixtureField();
    const craft = fixtureCraft();
    const { centreline, halfWidth } = field.corridor;
    craft.x = centreline + halfWidth + 10;
    const sim = createInitialState(field, craft, 1);
    let view = openCamera(sim);
    for (let tick = 0; tick < 600; tick++) view = followCamera(view, sim);
    expect(Math.abs(craft.x - view.x)).toBeGreaterThan(DESIGN_WIDTH / 2);
  });

  /**
   * **The backstop**, which is the half of the prototype's `panBounds` that is not
   * about the field: the craft may not leave the picture while the view still has
   * room. It is not belt-and-braces — [`SIDEWAYS_BAND`](../../src/state/camera.ts)
   * is 328 units wide and the ease lags a fast dive by 340 more, so without it a
   * craft crossing the corridor at speed left the frame in open field. Measured
   * on the shipped run before it was added: ten ticks, worst 668 units out.
   */
  it('keeps the craft in the picture while it still has room to', () => {
    const field = fixtureField();
    const craft = fixtureCraft();
    // Starting at the left line and crossing fast, stopping short of the right
    // one — so the field bound never binds and the backstop is the only thing
    // that can keep the craft in frame.
    craft.x = field.corridor.centreline - field.corridor.halfWidth;
    const sim = createInitialState(field, craft, 1);
    let view = openCamera(sim);
    for (let tick = 0; tick < 90; tick++) {
      // Flown by hand rather than by the simulation: what is under test is the
      // camera's answer to a craft moving faster sideways than the ease can
      // follow, and the fixture field's own swings do not reliably produce one.
      sim.craft.x += 1400 / 60;
      view = followCamera(view, sim);
      expect(Math.abs(sim.craft.x - view.x)).toBeLessThanOrEqual(DESIGN_WIDTH / 2 + 1e-6);
    }
  });

  /**
   * ⚠ **The sideways band is the prototype's own, and it is wider than the
   * vertical** (author, 2026-09-01: *"the camera follows the ship laterally a bit
   * too much... more lazy/slow, mimicking the original prototype"*).
   *
   * `cameraMarginFrac` is 0.22 of the window width and keeps the ship between the
   * margins, which is a half-band of `0.28 × W`. Asserted as the relationship
   * rather than the number, because the number is the fraction's consequence.
   */
  it('is lazier sideways than vertically, at the prototype fraction', () => {
    expect(SIDEWAYS_BAND).toBeCloseTo(0.28 * DESIGN_WIDTH, 6);
    expect(SIDEWAYS_BAND).toBeGreaterThan(DEADZONE);
  });

  /**
   * **The view opens on the craft, on both axes** — `openCamera`'s own rule that a
   * run is *"placed, not eased into place"*, which had only one axis to be true of
   * before. The fixture spawns the craft 270 design units left of the centreline,
   * so opening at the centreline instead would start every run with the view
   * already sliding.
   */
  it('opens on the craft rather than easing onto it', () => {
    const { views } = fly(20, 300);
    expect(views[0]!.camera.x).toBe(views[0]!.craft.x);
    expect(views[0]!.camera.y).toBe(views[0]!.craft.y);
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
