/**
 * Clearing the field: the one ending that is not a failure.
 *
 * The 2026-08-23 capture flew all sixty bodies and was then killed by the 800px
 * of empty space above the last one, scored `LOST — OFF COURSE`, and respawned in
 * under a second. These pin the three things that has to stop being true: the
 * clear fires, it fires at the crest rather than at the ceiling, and it does not
 * quietly respawn the way every other ending does.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import type { SimState } from '../src/sim/types.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import type { Input } from '../src/sim/types.ts';

const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };
// A real letting-go. `NO_INPUT` is not one: release fires on the `released` EDGE,
// so merely stopping holding leaves the ship attached and orbiting.
const RELEASE: Input = { held: false, pressed: false, released: true };
import { fieldBounds } from '../src/sim/world.ts';
import { createScoreState, scoreTick } from '../src/score/score.ts';
import type { ScoreAward } from '../src/score/types.ts';

/** A ship placed just under the crest, climbing hard enough to cross it. */
function aboutToClear(cfg: SimConfig, below = 200): SimState {
  const state = createInitialState(cfg);
  const fb = fieldBounds(cfg, state.bodies);
  // Off to one side of the topmost body, so the climb passes it rather than
  // flying into it — an impact would end the run before the crest is reached.
  state.ship.x = fb.left + fb.width * 0.5 + 300;
  state.ship.y = fb.crest + below;
  state.ship.vx = 0;
  state.ship.vy = -400;
  state.ship.burstX = 0;
  state.ship.burstY = 0;
  state.highWaterY = state.ship.y;
  return state;
}

/** The finish line in this state's field. */
function finishOf(state: SimState): number {
  return fieldBounds(DEFAULT_CONFIG, state.bodies).crest - DEFAULT_CONFIG.grabRange;
}

/**
 * Fly the flight that carries past the line while still attached, scoring it.
 *
 * The fixture is searched rather than guessed: these are the parameters that
 * genuinely reach ~800px above the last body's centre while captured, against a
 * line 560px above it. `hold` decides what the player does on each captured tick.
 *
 * Returns the ending and the awards that landed on the tick the hold ended —
 * which is the whole question these ask, since `scoreTick` pays a release on
 * exactly that tick and pays nothing at all once the ending is up.
 */
function flyTheLastBody(
  cfg: SimConfig,
  hold: (state: SimState) => Input,
): { reason: SimState['ending']['reason']; atLetGo: ScoreAward[] } {
  const state = createInitialState(cfg);
  let top = state.bodies[0]!;
  for (const b of state.bodies) if (b.y < top.y) top = b;
  state.ship.x = top.x + 140;
  state.ship.y = top.y + 480;
  state.ship.vx = -39.2;
  state.ship.vy = -700;
  state.ship.burstX = 0;
  state.ship.burstY = 0;
  state.highWaterY = state.ship.y;

  const score = createScoreState();
  let grabbed = false;
  let atLetGo: ScoreAward[] = [];
  for (let i = 0; i < 400; i++) {
    const input = state.capture ? hold(state) : grabbed ? NO_INPUT : PRESS;
    const wasCaptured = state.capture !== null;
    stepSim(state, cfg, input, FIXED_DT);
    if (state.capture) grabbed = true;
    const scored = scoreTick(score, state, cfg, FIXED_DT);
    if (wasCaptured && !state.capture) atLetGo = scored.awards;
    if (state.ending.active) break;
  }
  expect(grabbed, 'the fixture is meant to capture the last body').toBe(true);
  return { reason: state.ending.reason, atLetGo };
}

/** Step until the run ends, or `limit` ticks pass. */
function runOut(state: SimState, cfg: SimConfig, limit = 600): SimState {
  for (let i = 0; i < limit && !state.ending.active; i++) {
    stepSim(state, cfg, NO_INPUT, FIXED_DT);
  }
  return state;
}

describe('clearing the field', () => {
  const cfg = DEFAULT_CONFIG;

  it('ends the run as cleared when the ship rises past the crest', () => {
    const state = runOut(aboutToClear(cfg), cfg);
    expect(state.ending.active).toBe(true);
    expect(state.ending.reason).toBe('cleared');
  });

  it('fires where the last body goes out of reach, not at its centre', () => {
    // Between the crest and the ceiling, and at neither. Ending at `top` would
    // congratulate the player for crossing a line drawn in hazard red all run;
    // ending at `crest` — which is what this did first — ends the run on the
    // APPROACH to the last planet, before it can be grabbed.
    const state = runOut(aboutToClear(cfg), cfg);
    const fb = fieldBounds(cfg, state.bodies);
    expect(state.ending.y).toBeLessThanOrEqual(fb.crest - cfg.grabRange);
    expect(state.ending.y, 'and nowhere near the ceiling').toBeGreaterThan(fb.top);
  });

  it('leaves the last planet playable — the approach does not end the run', () => {
    // THE BUG THIS EXISTS FOR, reported from the seat: "the instinct is to
    // capture it but the player sees the end-of-course popup". `crest` is the
    // topmost body's CENTRE, so a line there fires while the ship is still diving
    // toward the planet it wants. The final body was unreachable by construction.
    const state = createInitialState(cfg);
    const fb = fieldBounds(cfg, state.bodies);
    let top = state.bodies[0]!;
    for (const b of state.bodies) if (b.y < top.y) top = b;

    // Sit exactly where a player lining up the last grab would be: past its
    // centre, still well inside grab range of it.
    state.ship.x = top.x + 120;
    state.ship.y = top.y - 60;
    state.ship.vx = 0;
    state.ship.vy = -120;
    state.ship.burstX = 0;
    state.ship.burstY = 0;
    state.highWaterY = state.ship.y;

    stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ending.active, 'above the crest is not yet the end of anything').toBe(false);
    expect(state.ship.y, 'and still inside grab range of the last body').toBeGreaterThan(
      fb.crest - cfg.grabRange,
    );
  });

  it('lets go for you rather than waiting out a hold past the line', () => {
    // THE BUG THIS NOW EXISTS FOR, reported from the seat: "I was drifting into
    // the finish by holding on to a planet through the finish line, which
    // extended everything until after I released". Measured on that session — a
    // hold that crossed at tick 1425 and let go at 1603 — the wait was three
    // seconds of a run that was already over, before the ceremony had even begun.
    //
    // This was pinned the other way round and deliberately so: cutting a
    // manoeuvre off was held to be the same defect as cutting off the approach.
    // Above the line it is not, because there is provably nothing left to grab
    // there, so the manoeuvre cannot lead anywhere new. The fixture is the same
    // flight — the one that genuinely carries ~800px above the last body while
    // still attached, against a line at 560.
    const state = createInitialState(cfg);
    const fb = fieldBounds(cfg, state.bodies);
    let top = state.bodies[0]!;
    for (const b of state.bodies) if (b.y < top.y) top = b;
    state.ship.x = top.x + 140;
    state.ship.y = top.y + 480;
    state.ship.vx = -39.2;
    state.ship.vy = -700;
    state.ship.burstX = 0;
    state.ship.burstY = 0;
    state.highWaterY = state.ship.y;

    const clearY = fb.crest - cfg.grabRange;
    let grabbed = false;
    // The tick the ship first stood past the line, the tick the hold ended, and
    // whether it was still attached going into that tick. The gaps between them
    // are the whole fix.
    let crossedAt = -1;
    let letGoAt = -1;
    let attachedAcross = false;
    for (let i = 0; i < 400; i++) {
      // Held throughout once the grab lands: this is the flight nobody lets go
      // of, which is exactly the one that used to fly on past a finished run.
      const input = !grabbed && !state.capture ? PRESS : HOLD;
      const wasCaptured = state.capture !== null;
      stepSim(state, cfg, input, FIXED_DT);
      if (state.capture) grabbed = true;
      if (crossedAt < 0 && shipWorldPos(state).y < clearY) {
        crossedAt = state.tick;
        attachedAcross = wasCaptured;
      }
      if (wasCaptured && !state.capture && letGoAt < 0) letGoAt = state.tick;
      if (state.ending.active) break;
    }
    expect(grabbed, 'the fixture is meant to capture the last body').toBe(true);
    expect(crossedAt, 'and to reach the line').toBeGreaterThan(0);
    expect(attachedAcross, 'and to be carried across it still attached').toBe(true);
    expect(state.ending.reason, 'crossing ends it, holding or not').toBe('cleared');
    // Let go on the crossing tick, ended on the next one. The deferral is
    // deliberate — see the clear test in `stepSim`: `scoreTick` stops scoring
    // once the ending is up, so a run that ended on the same tick as its release
    // forfeited the last manoeuvre it was flown with.
    expect(letGoAt, 'the sim lets go rather than waiting for the player').toBe(crossedAt);
    expect(state.tick, 'and ends one tick later, not sooner').toBe(crossedAt + 1);
  });

  it('pays the last manoeuvre instead of eating it on the ending tick', () => {
    // `scoreTick` returns without scoring anything once `ending.active` is set,
    // and it recognises a release as "a capture was here last tick and is gone
    // now" — so ending on the release tick threw the release away. In the
    // reported session the final flyby ran 363 ticks and paid nothing at all.
    // This is why the clear is deferred by a tick rather than fired the instant
    // the sim lets go.
    const { reason, atLetGo } = flyTheLastBody(cfg, () => HOLD);
    expect(reason).toBe('cleared');
    expect(atLetGo, 'the release that finished the run was scored').not.toHaveLength(0);
  });

  it('and pays it when the player lets go on the very tick they cross', () => {
    // The other way a capture can end above the line, and the one that was
    // already silently unpaid before the sim ever let go for anyone: the release
    // edge lands at the top of the tick and the drift carries the ship over the
    // line before the tick is out. `wasCaptured` is what holds the ending back
    // for it. Verified against the previous build, where this same flight ended
    // on the release tick and paid nothing.
    const { reason, atLetGo } = flyTheLastBody(cfg, (state) => {
      const cap = state.capture!;
      // One tick of lookahead: let go exactly when the next step would cross.
      const p = shipWorldPos(state);
      return p.y + cap.vy * FIXED_DT < finishOf(state) ? RELEASE : HOLD;
    });
    expect(reason).toBe('cleared');
    expect(atLetGo, 'a chosen release at the line is scored too').not.toHaveLength(0);
  });

  it('holds instead of respawning, because what comes next is not the sim’s call', () => {
    const state = runOut(aboutToClear(cfg), cfg);
    expect(state.ending.reason).toBe('cleared');
    // Every other ending lets go after `crashPause`. Step well past it.
    const held = Math.ceil((cfg.crashPause / FIXED_DT) * 3);
    for (let i = 0; i < held; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ending.active, 'a cleared field waits for the caller').toBe(true);
    expect(state.ending.t, 'while the clock still runs, so the moment can age').toBeGreaterThan(
      cfg.crashPause,
    );
  });

  it('still respawns on the endings that ARE failures', () => {
    // The guard against the hold leaking onto every death and making failure
    // expensive — the thing `lifecycle.ts` argues hardest against.
    const state = createInitialState(cfg);
    runOut(state, cfg, 5000);
    expect(state.ending.active).toBe(true);
    expect(state.ending.reason).not.toBe('cleared');
    const held = Math.ceil((cfg.crashPause / FIXED_DT) * 3);
    for (let i = 0; i < held; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ending.active, 'a failure lets go on its own').toBe(false);
  });
});

describe('nothing dies at a wall in the run-in', () => {
  const cfg = DEFAULT_CONFIG;

  /** Fly into the run-in from `dx` off centre, drifting sideways at `vx`. */
  function enter(dx: number, vx: number, vy: number): SimState {
    const state = createInitialState(cfg);
    const fb = fieldBounds(cfg, state.bodies);
    const cx = (fb.left + fb.right) / 2;
    state.ship.x = cx + dx;
    state.ship.y = fb.crest - cfg.grabRange + cfg.finishFunnelDepth - 2;
    state.ship.vx = vx;
    state.ship.vy = vy;
    state.ship.burstX = 0;
    state.ship.burstY = 0;
    state.highWaterY = state.ship.y;
    for (let i = 0; i < 1200 && !state.ending.active; i++) {
      stepSim(state, cfg, NO_INPUT, FIXED_DT);
    }
    return state;
  }

  it('bounces instead of ending, however hard it is thrown at a wall', () => {
    // The chevrons say "you are nearly there" and the funnel is carrying the
    // ship, so a run ending against a side wall here is the game taking something
    // away at the moment it promised to hand it over.
    //
    // Swept rather than sampled: 399 entries across the whole width at every
    // sideways speed up to 520px/s produced no wall death at all, and 298 of them
    // bounced at least once. This is the corner of that sweep.
    for (const dx of [-360, -200, 0, 200, 360]) {
      for (const vx of [-520, -300, 300, 520]) {
        const end = enter(dx, vx, -420);
        expect(end.ending.reason, `dx=${dx} vx=${vx}`).not.toBe('out-of-bounds');
      }
    }
  });

  it('takes speed out of the bounce, so it settles instead of rattling', () => {
    // A perfect bumper sends a ship across the corridor at the speed it arrived
    // with, and it crosses the line still ricocheting. Some loss per hit is what
    // makes a wild entry resolve into a finish rather than a pinball table.
    expect(cfg.finishBumper).toBeGreaterThan(0);
    expect(cfg.finishBumper).toBeLessThan(1);
  });

  it('leaves the last planet solid, which is a different question', () => {
    // "No wall deaths" is not "no deaths". The bumpers make the SIDES safe; the
    // planet is a thing you can see and steer around, and an intangible one at
    // the end of the course would be a stranger game than a lethal one.
    const state = createInitialState(cfg);
    let top = state.bodies[0]!;
    for (const b of state.bodies) if (b.y < top.y) top = b;
    // Below the crest, so the planet is genuinely ahead. Starting AT the band's
    // bottom edge puts the ship level with the last body and it simply sails past
    // — which is how this first "passed" while proving nothing.
    state.ship.x = top.x;
    state.ship.y = top.y + 260;
    state.ship.vx = 0;
    state.ship.vy = -420;
    state.highWaterY = state.ship.y;
    for (let i = 0; i < 1200 && !state.ending.active; i++) {
      stepSim(state, cfg, NO_INPUT, FIXED_DT);
    }
    expect(state.ending.reason).toBe('impact');
  });

  it('is off in the prototype, where the walls stay lethal everywhere', () => {
    expect(PROTOTYPE_CONFIG.finishBumper).toBe(0);
  });
});

describe('the prototype never clears', () => {
  it('is off in PROTOTYPE_CONFIG, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.clearAtTop).toBe(false);
    expect(DEFAULT_CONFIG.clearAtTop).toBe(true);
  });

  it('flies straight through the crest to the ceiling with the flag off', () => {
    // Proves the flag is what decides it, not something incidental about the
    // fixture: same climb, same field, opposite ending.
    const off: SimConfig = { ...DEFAULT_CONFIG, clearAtTop: false };
    const state = runOut(aboutToClear(off), off);
    expect(state.ending.reason).toBe('out-of-bounds');
    const fb = fieldBounds(off, state.bodies);
    expect(state.ending.y).toBeLessThan(fb.top);
  });
});

describe('the crest is named rather than re-derived', () => {
  it('sits exactly at the topmost body', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, state.bodies);
    let highest = 0;
    for (const b of state.bodies) if (b.y < highest) highest = b.y;
    expect(fb.crest).toBe(highest);
  });

  it('keeps the ceiling a fixed margin above it', () => {
    // Before `crest` existed, the clear line had to be recovered by adding 800
    // back onto `top` — the same magic number written in two places, free to
    // disagree. This is the relationship, asserted once.
    const state = createInitialState(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, state.bodies);
    expect(fb.crest - fb.top).toBe(800);
  });
});
