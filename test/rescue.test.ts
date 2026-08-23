/**
 * The scar's promise, pinned by construction.
 *
 * `rescueScar` says: press and hold at the cross and the ship turns away from
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
import { DEFAULT_SCAR_OPTIONS, rescueScar } from '../src/sim/rescue.ts';
import { fieldBounds } from '../src/sim/world.ts';

const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };
const NONE: Input = { held: false, pressed: false, released: false };

/**
 * A ship drifting at the right wall, fast enough that the deadline is real.
 *
 * Placed beside the opening body so a grab is genuinely on offer for a while,
 * and aimed across the corridor rather than straight out, so the path has some
 * length to draw a scar along.
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
 * Press and hold from here. Returns whether the ship turned away from `side`
 * before the run ended — the definition `rescueScar` is claiming.
 */
function holdAndSee(state: SimState, cfg: SimConfig, side: number): boolean {
  const s = structuredClone(state) as SimState;
  stepSim(s, cfg, PRESS, FIXED_DT);
  for (let i = 0; i < DEFAULT_SCAR_OPTIONS.captureBudget; i++) {
    if (s.ending.active) return false;
    const vx = s.capture ? s.capture.vx : s.ship.vx;
    if (vx * side <= 0) return true;
    stepSim(s, cfg, HOLD, FIXED_DT);
  }
  return false;
}

describe('the point of no return', () => {
  const cfg = DEFAULT_CONFIG;

  it('finds a wall the drift is committed to', () => {
    const scar = rescueScar(driftingAtTheWall(cfg), cfg, FIXED_DT);
    expect(scar, 'a ship flying at the right wall has a scar').not.toBeNull();
    expect(scar!.side).toBe(1);
    expect(scar!.cross, 'and a press that still saves it').not.toBeNull();
  });

  it('a press AT the cross turns away; one a few ticks later does not', () => {
    const state = driftingAtTheWall(cfg);
    const scar = rescueScar(state, cfg, FIXED_DT)!;
    const crossTick = Math.round(scar.cross!.t / FIXED_DT);

    expect(
      holdAndSee(driftFor(state, cfg, crossTick), cfg, scar.side),
      'holding at the cross rescues the ship',
    ).toBe(true);

    // The search resolves to the tick, so the very next one is the first that
    // must fail. A wider margin here would let the cross drift late without the
    // test noticing, which is the direction that gets a player killed.
    expect(
      holdAndSee(driftFor(state, cfg, crossTick + 1), cfg, scar.side),
      'holding one tick later does not',
    ).toBe(false);
  });

  it('every sample it marks live really is live', () => {
    const state = driftingAtTheWall(cfg);
    const scar = rescueScar(state, cfg, FIXED_DT)!;
    for (const s of scar.path) {
      const at = driftFor(state, cfg, Math.round(s.t / FIXED_DT));
      expect(
        holdAndSee(at, cfg, scar.side),
        `sample at t=${s.t.toFixed(2)} claims live=${s.live}`,
      ).toBe(s.live);
    }
  });

  it('says nothing while captured, or once the run has ended', () => {
    const state = driftingAtTheWall(cfg);
    stepSim(state, cfg, PRESS, FIXED_DT);
    expect(state.capture, 'the fixture is meant to be able to grab').not.toBeNull();
    expect(rescueScar(state, cfg, FIXED_DT)).toBeNull();

    const dead = driftingAtTheWall(cfg);
    dead.ending.active = true;
    expect(rescueScar(dead, cfg, FIXED_DT)).toBeNull();
  });

  it('says nothing about a ship that is not headed at a wall', () => {
    const state = driftingAtTheWall(cfg);
    state.ship.vx = 0;
    state.ship.vy = -200;
    expect(rescueScar(state, cfg, FIXED_DT)).toBeNull();
  });

  it('leaves the world it was asked about untouched', () => {
    const state = driftingAtTheWall(cfg);
    const before = JSON.stringify(state);
    rescueScar(state, cfg, FIXED_DT);
    expect(JSON.stringify(state), 'the prediction must not disturb the run').toBe(before);
  });
});
