/**
 * The deadline's promise, pinned by construction.
 *
 * `rescueDeadline` says: press and hold at the cross and the ship turns away from
 * the wall before it crosses; press later and it does not. That is a claim about
 * the simulation, so it is checked by running the simulation — the same one the
 * player flies — rather than by asserting a remembered coordinate. It cannot rot
 * as the physics is tuned, because it re-derives the answer every time.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import { DEFAULT_DEADLINE_OPTIONS, advanceDeadline, rescueDeadline } from '../src/sim/rescue.ts';
import type { DeadlineWall } from '../src/sim/rescue.ts';
import { fieldBounds } from '../src/sim/world.ts';

const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };
const NONE: Input = { held: false, pressed: false, released: false };

/**
 * A ship drifting at the right wall, fast enough that the deadline is real.
 *
 * Placed beside the opening body so a grab is genuinely on offer for a while,
 * and aimed across the corridor rather than straight out, so the path has some
 * length to draw a deadline along.
 */
function driftingAtTheWall(cfg: SimConfig): SimState {
  const state = createInitialState(cfg);
  const fb = fieldBounds(cfg, state.bodies);
  state.ship.x = fb.right - 300;
  state.ship.y = 120;
  state.ship.vx = 210;
  state.ship.vy = -70;
  state.ship.burstX = 0;
  state.ship.burstY = 0;
  return state;
}

/** Advance a copy `ticks` ticks with no input, and return it. */
function driftFor(state: SimState, cfg: SimConfig, ticks: number): SimState {
  const s = structuredClone(state) as SimState;
  for (let i = 0; i < ticks; i++) stepSim(s, cfg, NONE, FIXED_DT);
  return s;
}

/**
 * Press and hold from here. Returns whether the ship turned away from `wall`
 * before the run ended — the definition `rescueDeadline` is claiming.
 *
 * The axis and sign are spelled out here rather than imported from `rescue.ts`,
 * so this stays a second opinion. A test that borrowed the production table would
 * agree with it by construction, including about the ceiling.
 */
function holdAndSee(state: SimState, cfg: SimConfig, wall: DeadlineWall): boolean {
  const s = structuredClone(state) as SimState;
  stepSim(s, cfg, PRESS, FIXED_DT);
  for (let i = 0; i < DEFAULT_DEADLINE_OPTIONS.captureBudget; i++) {
    if (s.ending.active) return false;
    const v =
      wall === 'top'
        ? s.capture
          ? s.capture.vy
          : s.ship.vy
        : s.capture
          ? s.capture.vx
          : s.ship.vx;
    const sign = wall === 'right' ? 1 : -1;
    if (v * sign <= 0) return true;
    stepSim(s, cfg, HOLD, FIXED_DT);
  }
  return false;
}

describe('the point of no return', () => {
  const cfg = DEFAULT_CONFIG;

  it('finds a wall the drift is committed to', () => {
    const deadline = rescueDeadline(driftingAtTheWall(cfg), cfg, FIXED_DT);
    expect(deadline, 'a ship flying at the right wall has a deadline').not.toBeNull();
    expect(deadline!.wall).toBe('right');
    expect(deadline!.cross, 'and a press that still saves it').not.toBeNull();
  });

  it('a press AT the cross turns away; one a few ticks later does not', () => {
    const state = driftingAtTheWall(cfg);
    const deadline = rescueDeadline(state, cfg, FIXED_DT)!;
    const crossTick = Math.round(deadline.cross!.t / FIXED_DT);

    expect(
      holdAndSee(driftFor(state, cfg, crossTick), cfg, deadline.wall),
      'holding at the cross rescues the ship',
    ).toBe(true);

    // The search resolves to the tick, so the very next one is the first that
    // must fail. A wider margin here would let the cross drift late without the
    // test noticing, which is the direction that gets a player killed.
    expect(
      holdAndSee(driftFor(state, cfg, crossTick + 1), cfg, deadline.wall),
      'holding one tick later does not',
    ).toBe(false);
  });

  it('every sample it marks live really is live', () => {
    const state = driftingAtTheWall(cfg);
    const deadline = rescueDeadline(state, cfg, FIXED_DT)!;
    for (const s of deadline.path) {
      const at = driftFor(state, cfg, Math.round(s.t / FIXED_DT));
      expect(
        holdAndSee(at, cfg, deadline.wall),
        `sample at t=${s.t.toFixed(2)} claims live=${s.live}`,
      ).toBe(s.live);
    }
  });

  it('carries forward to the same answer a fresh call would give', () => {
    // The whole reason a projection can be reused: a drift takes no input, so
    // every sample is a world point with a fixed verdict and the cross is a place
    // rather than a countdown. If this is wrong the deadline lies while the ship
    // coasts, which is exactly when it is being read.
    const state = driftingAtTheWall(cfg);
    const base = rescueDeadline(state, cfg, FIXED_DT)!;
    expect(base.cross).not.toBeNull();

    const CARRY = 20;
    const carried = advanceDeadline(base, CARRY * FIXED_DT)!;
    const fresh = rescueDeadline(driftFor(state, cfg, CARRY), cfg, FIXED_DT)!;

    expect(carried, 'the projection is still alive after the carry').not.toBeNull();
    expect(carried.wall).toBe(fresh.wall);
    expect(carried.cross, 'and still has a cross').not.toBeNull();
    // The same WORLD POINT, which is the claim. The time left shrinks by exactly
    // the time that passed; the place does not move.
    expect(carried.cross!.x).toBeCloseTo(fresh.cross!.x, 6);
    expect(carried.cross!.y).toBeCloseTo(fresh.cross!.y, 6);
    expect(carried.cross!.t).toBeCloseTo(base.cross!.t - CARRY * FIXED_DT, 9);
    expect(carried.tEnd).toBeCloseTo(base.tEnd - CARRY * FIXED_DT, 9);

    // Samples the ship has already flown past are dropped rather than left with
    // negative times, so the arm starts at the ship and not behind it.
    expect(carried.path.every((p) => p.t >= 0)).toBe(true);
    expect(carried.path.length).toBeLessThan(base.path.length);
  });

  it('expires rather than describing an ending that has already happened', () => {
    const state = driftingAtTheWall(cfg);
    const base = rescueDeadline(state, cfg, FIXED_DT)!;
    expect(advanceDeadline(base, base.tEnd + 0.001), 'past its own ending').toBeNull();
    // And a cross the ship has reached reads as passed, which is the same thing
    // `rescueDeadline` reports by returning none.
    const past = advanceDeadline(base, base.cross!.t + 0.001)!;
    expect(past).not.toBeNull();
    expect(past.cross, 'the last press that could work is behind us now').toBeNull();
  });

  it('says nothing while captured, or once the run has ended', () => {
    const state = driftingAtTheWall(cfg);
    stepSim(state, cfg, PRESS, FIXED_DT);
    expect(state.capture, 'the fixture is meant to be able to grab').not.toBeNull();
    expect(rescueDeadline(state, cfg, FIXED_DT)).toBeNull();

    const dead = driftingAtTheWall(cfg);
    dead.ending.active = true;
    expect(rescueDeadline(dead, cfg, FIXED_DT)).toBeNull();
  });

  // Was 'says nothing about a ship that is not headed at a wall', with this exact
  // fixture. Climbing straight up from the bottom of the field IS headed at a wall
  // now — the ceiling — so the old name asserted something that had stopped being
  // true even though the expectation had not. What still holds, and is what the
  // case was really covering, is the horizon: 200px/s for 6s is 1200px, and the
  // ceiling is the length of the whole field away.
  it('says nothing about a wall further off than the horizon', () => {
    const state = driftingAtTheWall(cfg);
    state.ship.vx = 0;
    state.ship.vy = -200;
    expect(rescueDeadline(state, cfg, FIXED_DT)).toBeNull();
  });

  it('says nothing about a ship headed at no boundary at all', () => {
    const state = driftingAtTheWall(cfg);
    state.ship.vx = 0;
    state.ship.vy = 0;
    expect(rescueDeadline(state, cfg, FIXED_DT)).toBeNull();
  });
});

/**
 * The ceiling, which had no cue of any kind until the 2026-08-23 playtest flew
 * off the top of the field.
 *
 * These are the side-wall cases re-asked at the boundary that used to refuse
 * them: `rescueDeadline` returned null for a top exit by construction, first at the
 * cheap refusal — which only measured horizontal reach — and then explicitly,
 * because the wall was a sign on the x axis and a top ending had no sign to give.
 */
/**
 * The ceiling, which had no cue of any kind until the 2026-08-23 playtest flew
 * off the top of the field.
 *
 * RUN AGAINST `clearAtTop: false`, AND THAT IS THE POINT OF THE SUITE BELOW IT.
 * Under the default config the ceiling is no longer reachable: rising past the
 * crest ends the run as `cleared` 800px earlier, so there is no `out-of-bounds`
 * ending up there for a deadline to find. These cases therefore pin the MECHANISM —
 * that `DeadlineWall` handles a boundary on the y axis at all — against a config that
 * can still reach it, and `no ceiling deadline once a clear ends the run first` pins
 * the interaction that makes it unreachable in the game. Deleting either would
 * lose half the truth.
 */
describe('the point of no return, at the ceiling', () => {
  const cfg: SimConfig = { ...DEFAULT_CONFIG, clearAtTop: false };

  /**
   * A ship climbing at the ceiling, `above` px past the topmost body.
   *
   * Derived from that body rather than written as a coordinate, so it survives
   * any change to `bodyCount` or `bodySpacing`, and offset 90px across so the
   * drift passes the planet instead of hitting it — a crash is an `impact`, which
   * this cue correctly has no opinion about, and a fixture that produced one
   * would be testing the refusal rather than the ceiling.
   *
   * `highWaterY` moves up with the ship so the trailing floor is not the nearer
   * ending; without it the run is a `fell-behind` and the deadline again says nothing.
   */
  function climbingAtTheCeiling(c: SimConfig, above: number): SimState {
    const state = createInitialState(c);
    let hiY = 0;
    let hiX = 0;
    for (const b of state.bodies)
      if (b.y < hiY) {
        hiY = b.y;
        hiX = b.x;
      }
    state.ship.x = hiX + 90;
    state.ship.y = hiY - above;
    state.ship.vx = 20;
    state.ship.vy = -260;
    state.ship.burstX = 0;
    state.ship.burstY = 0;
    state.highWaterY = state.ship.y;
    return state;
  }

  /** Still beside the last planet: a grab is on offer, so a rescue exists. */
  const beside = () => climbingAtTheCeiling(cfg, -150);

  it('finds the ceiling a climb is committed to', () => {
    const deadline = rescueDeadline(beside(), cfg, FIXED_DT);
    expect(deadline, 'a ship flying off the top of the field has a deadline').not.toBeNull();
    expect(deadline!.wall).toBe('top');
    expect(deadline!.cross, 'and a press that still saves it').not.toBeNull();
  });

  it('every sample it marks live really is live', () => {
    const state = beside();
    const deadline = rescueDeadline(state, cfg, FIXED_DT)!;
    expect(
      deadline.path.some((p) => p.live),
      'the fixture must offer some rescue',
    ).toBe(true);
    for (const s of deadline.path) {
      const at = driftFor(state, cfg, Math.round(s.t / FIXED_DT));
      expect(
        holdAndSee(at, cfg, deadline.wall),
        `sample at t=${s.t.toFixed(2)} claims live=${s.live}`,
      ).toBe(s.live);
    }
  });

  it('a press AT the cross turns away; one a few ticks later does not', () => {
    // The side walls' promise on the other axis, and the reason `rescues` tests
    // velocity rather than a settled orbit: a braked flyby that arcs back down is
    // a rescue here exactly as it is sideways. Asserting a settle would call the
    // same manoeuvre a death purely because it happened vertically.
    const state = beside();
    const deadline = rescueDeadline(state, cfg, FIXED_DT)!;
    const crossTick = Math.round(deadline.cross!.t / FIXED_DT);
    expect(
      holdAndSee(driftFor(state, cfg, crossTick), cfg, 'top'),
      'holding at the cross rescues the ship',
    ).toBe(true);
    expect(
      holdAndSee(driftFor(state, cfg, crossTick + 1), cfg, 'top'),
      'holding one tick later does not',
    ).toBe(false);
  });

  it('marks the climb past the last planet as unsaveable, rather than lying', () => {
    // The ceiling's own shape, and the thing that makes it different from a side
    // wall: a ship 350px above the topmost body has left every gravity source
    // behind, so no press can turn it around and every sample is honestly dead.
    // The deadline still exists — the player is told the deadline is real and already
    // missed, which is the truth. If a cross ever appears here, something is
    // promising a rescue that does not exist.
    const deadline = rescueDeadline(climbingAtTheCeiling(cfg, 350), cfg, FIXED_DT);
    expect(deadline, 'the ending is still found and still named').not.toBeNull();
    expect(deadline!.wall).toBe('top');
    expect(deadline!.path.every((p) => !p.live)).toBe(true);
    expect(deadline!.cross).toBeNull();
    expect(deadline!.flight).toEqual([]);
  });

  it('leaves the world it was asked about untouched', () => {
    const state = beside();
    const before = JSON.stringify(state);
    rescueDeadline(state, cfg, FIXED_DT);
    expect(JSON.stringify(state), 'the prediction must not disturb the run').toBe(before);
  });

  it('offers no ceiling deadline once a clear ends the run first', () => {
    // The new truth, pinned where the old one used to be. Same fixture, same
    // climb, default config: the projection now reaches `cleared` rather than
    // `out-of-bounds`, and a cue whose entire subject is "this will kill you" has
    // nothing to say about finishing the course. If this ever returns a deadline, the
    // game is drawing a death warning over its own victory.
    const deadline = rescueDeadline(
      climbingAtTheCeiling(DEFAULT_CONFIG, -150),
      DEFAULT_CONFIG,
      FIXED_DT,
    );
    expect(deadline).toBeNull();
  });

  it('leaves the world it was asked about untouched', () => {
    const state = driftingAtTheWall(cfg);
    const before = JSON.stringify(state);
    rescueDeadline(state, cfg, FIXED_DT);
    expect(JSON.stringify(state), 'the prediction must not disturb the run').toBe(before);
  });
});
