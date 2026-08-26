/**
 * The run-in carpet as a play zone: the carve, the lift, the dots, the signature.
 *
 * The stretch between the last planet and the finish line used to be a corridor
 * the funnel carried you down. It is now the one place in the game where the
 * button does something other than reach for a planet, and these pin the four
 * facts that makes true — each of which was, at some point during the build,
 * false in a way that looked fine.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, respawn, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { SIGNATURE_MAX, SIGNATURE_SPACING } from '../src/sim/step.ts';
import { createMotes, fieldBounds, runInBand } from '../src/sim/world.ts';
import { grabTarget } from '../src/sim/capture.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import { createScoreState, scoreTick } from '../src/score/index.ts';
import type { ScoreAward } from '../src/score/index.ts';

const PRESS: Input = { held: true, pressed: true, released: false };
const HOLD: Input = { held: true, pressed: false, released: false };
const RELEASE: Input = { held: false, pressed: false, released: true };

const cfg = DEFAULT_CONFIG;

function bandOf(c: SimConfig, state: SimState) {
  return runInBand(c, fieldBounds(c, state.bodies))!;
}

/** A ship dropped into the carpet at `above` px above its bottom edge. */
function inCarpet(c: SimConfig, above: number, vy = -320, dx = 0): SimState {
  const state = createInitialState(c);
  const fb = fieldBounds(c, state.bodies);
  const band = runInBand(c, fb)!;
  state.ship.x = (fb.left + fb.right) / 2 + dx;
  state.ship.y = band.bottom - above;
  state.ship.vx = 0;
  state.ship.vy = vy;
  state.highWaterY = state.ship.y;
  // The spawn leaves this set so a button still down cannot grab on the first
  // tick back; a fixture that skips the spawn has to clear it or every hold below
  // is silently swallowed.
  state.holdConsumed = false;
  return state;
}

/**
 * A periodic press rhythm: `on` ticks down, `off` ticks up, from `start`.
 *
 * Built rather than written out, because the carve alternates on every press — so
 * a hand-written list is a phase as much as a cadence, and a retune of either the
 * carve or the carpet's depth silently turns it into a different manoeuvre.
 */
function rhythm(on: number, off: number, start: number, ticks = 200): Array<[number, 0 | 1]> {
  const out: Array<[number, 0 | 1]> = [];
  for (let t = start; t < ticks; t += on + off) {
    out.push([t, 1], [t + on, 0]);
  }
  return out;
}

/**
 * A pilot that steers for the dots, flown rather than recorded.
 *
 * The alternative is a fixed rhythm, and a fixed rhythm is a PHASE: `on 8 / off
 * 12` collects 1 dot from one starting tick and 5 from another, so a fixture
 * written that way measures how lucky it was rather than whether steering works.
 * This one asks the only question the test wants answered — does moving toward the
 * dots collect more of them than not moving at all.
 *
 * Deliberately not a good pilot. It reacts to the nearest dot still ahead with no
 * anticipation, which is why it collects 4 of 7 at an ordinary crossing and merely
 * ties a drift at a fast one; a well-phased rhythm reaches 5 at both. The headroom
 * between the two is the skill the carpet is asking for.
 */
function steerForDots(state: SimState, c: SimConfig, ticks: number): void {
  const fb = fieldBounds(c, state.bodies);
  const cx = (fb.left + fb.right) / 2;
  let held = false;
  for (let t = 0; t < ticks && !state.ending.active; t++) {
    let pressed = false;
    let released = false;
    let target: { x: number; y: number } | null = null;
    for (const m of state.motes) {
      if (!m.taken && m.y < state.ship.y && (!target || m.y > target.y)) target = m;
    }
    const want = target ? Math.sign(target.x - state.ship.x) : 0;
    if (held) {
      if (state.carveDir !== want || want === 0) {
        released = true;
        held = false;
      }
    } else {
      // A press FLIPS the carve, so the pilot can only ask for the direction the
      // next press would actually give it. See `SimState.carveDir`.
      const next = state.carveDir === 0 ? (state.ship.x > cx ? -1 : 1) : -state.carveDir;
      if (want !== 0 && next === want) {
        pressed = true;
        held = true;
      }
    }
    stepSim(state, c, { held: held || pressed, pressed, released }, FIXED_DT);
  }
}

/** Fly `edges` from `state` until the run ends or `ticks` pass. */
function fly(
  state: SimState,
  c: SimConfig,
  edges: Array<[number, 0 | 1]>,
  ticks: number,
): { awards: ScoreAward[]; ticks: number } {
  const map = new Map(edges);
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  let held = false;
  let t = 0;
  for (; t < ticks && !state.ending.active; t++) {
    const e = map.get(t);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, c, { held: held || pressed, pressed, released }, FIXED_DT);
    awards.push(...scoreTick(sc, state, c, FIXED_DT).awards);
  }
  return { awards, ticks: t };
}

describe('a press in the carpet carves instead of grabbing', () => {
  it('takes no body anywhere in the band, however near the last planet is', () => {
    // THE MEASUREMENT THAT MADE THIS A RULE. `grabRange` and `finishFunnelDepth`
    // are both 560, so the topmost planet is within reach from every point of the
    // carpet — which meant that before this rule the carve could not fire once in
    // ordinary play. Every press in the run-in took the planet behind it.
    for (const above of [0, 120, 280, 420, 555]) {
      const state = inCarpet(cfg, above);
      const got = grabTarget(state, cfg);
      expect(got.result, `${above}px above the crest`).toBe('carved');
      expect(got.index).toBe(-1);
    }
  });

  it('leaves the approach to the last planet alone, which happens below the crest', () => {
    // The carpet begins AT the crest, so everything about reaching the last body
    // happens outside it. This is the half of the last planet's playability the
    // carve must not touch — the other half is `test/cleared.test.ts`, which pins
    // that the clear does not fire on the approach either.
    const state = inCarpet(cfg, -200);
    expect(grabTarget(state, cfg).result).toBe('captured');
  });

  it('is off in the prototype, where a press in that band still grabs', () => {
    expect(PROTOTYPE_CONFIG.carpetCarve).toBe(0);
    const carpetless: SimConfig = { ...cfg, carpetCarve: 0 };
    expect(grabTarget(inCarpet(carpetless, 200), carpetless).result).toBe('captured');
  });

  it('bends the line, and the other way on the next press', () => {
    const right = inCarpet(cfg, 40, -320, -60); // left of centre: opens rightward
    fly(right, cfg, [[0, 1]], 30);
    expect(right.carveDir).toBe(1);
    expect(right.ship.vx).toBeGreaterThan(100);

    const left = inCarpet(cfg, 40, -320, 60); // right of centre: opens leftward
    fly(left, cfg, [[0, 1]], 30);
    expect(left.carveDir).toBe(-1);
    expect(left.ship.vx).toBeLessThan(-100);
  });

  it('alternates on every press, so two taps make an S rather than an arc', () => {
    const state = inCarpet(cfg, 40);
    fly(state, cfg, [[0, 1]], 20);
    const first = state.carveDir;
    fly(state, cfg, [[0, 0]], 1);
    fly(state, cfg, [[0, 1]], 20);
    expect(state.carveDir).toBe(-first);
  });

  it('hands the wheel back when the press ends', () => {
    // The centring spring is off while the button is down and on when it is not:
    // that exchange is what makes a carve close on itself instead of running away.
    // Measured as the sign of the lateral acceleration, which is the only place
    // the two rules differ.
    // A SHORT press, because a long one at `carpetCarve` 2200 reaches a side wall
    // inside two thirds of a second and comes back off the bumper — which is a
    // legitimate thing to do and tells you nothing about the spring.
    const state = inCarpet(cfg, 400);
    fly(state, cfg, [[0, 1]], 14);
    const out = state.ship.vx;
    expect(out).toBeGreaterThan(0);
    // Let go: the funnel takes over and pulls the ship back toward the middle.
    stepSim(state, cfg, RELEASE, FIXED_DT);
    for (let i = 0; i < 30; i++) stepSim(state, cfg, NO_INPUT, FIXED_DT);
    expect(state.ship.vx).toBeLessThan(out);
  });

  it('does not reach a captured ship, which is the funnel’s own rule', () => {
    // `driftAccel` is called from `stepDrift` only, so an orbit at the last planet
    // feels neither the funnel nor the carve. A capture staged below the crest and
    // carried up into the band must be untouched by a hold.
    const state = inCarpet(cfg, -240);
    stepSim(state, cfg, PRESS, FIXED_DT);
    expect(state.capture).not.toBeNull();
    const before = state.carveDir;
    for (let i = 0; i < 40 && state.capture; i++) stepSim(state, cfg, HOLD, FIXED_DT);
    expect(state.carveDir).toBe(before);
  });
});

describe('the carve has a terminal speed', () => {
  /** Peak lateral speed and wall contacts over a whole crossing. */
  function fly1(c: SimConfig, holdTicks: number): { vpk: number; walls: number } {
    const state = inCarpet(c, 4);
    const fb = fieldBounds(c, state.bodies);
    let held = false;
    let vpk = 0;
    let walls = 0;
    let wasOut = false;
    for (let t = 0; t < 400 && !state.ending.active; t++) {
      const pressed = t === 0;
      const released = t === holdTicks;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(state, c, { held: held || pressed, pressed, released }, FIXED_DT);
      vpk = Math.max(vpk, Math.abs(state.ship.vx));
      const out = state.ship.x <= fb.left + 1 || state.ship.x >= fb.right - 1;
      if (out && !wasOut) walls++;
      wasOut = out;
    }
    return { vpk, walls };
  }

  it('bounds a long hold, which an acceleration alone cannot', () => {
    // THE DEFECT THIS PINS, reported off the deployed build as "way too strong"
    // and measured on its trace: `vx` peaked at 1360px/s and the ship reached a
    // wall three times in 2.3 seconds, each bumper handing back 750px/s for the
    // next carve to build on.
    //
    // The cause is that a constant push is unbounded in TIME. The strength had
    // been sized against a 0.33s press and the session held for 0.5-0.58s, and
    // distance under a constant acceleration goes as the square of the hold. So
    // this is a test about hold LENGTH, not about the strength — which is why the
    // fix was a second key rather than a smaller first one.
    const uncapped: SimConfig = { ...cfg, carpetCarveMax: 0 };
    expect(fly1(uncapped, 34).vpk).toBeGreaterThan(1000);
    expect(fly1(cfg, 34).vpk).toBeLessThan(cfg.carpetCarveMax * 1.15);
    // Held for the whole crossing it still cannot run away.
    expect(fly1(cfg, 999).vpk).toBeLessThan(cfg.carpetCarveMax * 1.15);
  });

  it('leaves the response to a press untouched, which is the half that was felt', () => {
    // `carpetCarve` 1100 was reported as NOT noticeable, and its excursions were
    // never small — a 0.33s tap peaked 212px off centre. What it lacked was rate.
    // So the cap must not eat the first moments of a press: at the instant the
    // button goes down the ship is not moving sideways, so the taper is inert and
    // the acceleration is the full configured one.
    const state = inCarpet(cfg, 200);
    const before = state.ship.vx;
    stepSim(state, cfg, PRESS, FIXED_DT);
    const gained = Math.abs(state.ship.vx - before);
    expect(gained).toBeGreaterThan(cfg.carpetCarve * FIXED_DT * 0.9);
  });

  it('still lets a sustained hold reach a wall, because that is a choice', () => {
    // The bumpers exist and bouncing off one is a thing to do on purpose. What the
    // cap removes is arriving at a wall as the incidental result of an ordinary
    // press.
    expect(fly1(cfg, 999).walls).toBeGreaterThan(0);
    expect(fly1(cfg, 20).walls).toBe(0);
  });

  it('is off in the prototype, with the rest of the carpet', () => {
    expect(PROTOTYPE_CONFIG.carpetCarveMax).toBe(0);
  });
});

describe('the carpet pushes up, so there is no going backwards', () => {
  /** Total descent over a whole crossing, and the worst single tick. */
  function descent(c: SimConfig, vy: number): { total: number; tick: number } {
    const state = inCarpet(c, 320, vy);
    const y0 = state.ship.y;
    let lowest = y0;
    let worst = 0;
    for (let i = 0; i < 400 && !state.ending.active; i++) {
      const prev = shipWorldPos(state).y;
      stepSim(state, c, NO_INPUT, FIXED_DT);
      const now = shipWorldPos(state).y;
      if (now > lowest) lowest = now;
      if (now - prev > worst) worst = now - prev;
    }
    return { total: lowest - y0, tick: worst };
  }

  it('turns a ship that arrives falling, inside a few pixels', () => {
    // The lift is a one-sided spring rather than a clamp on `vy`, so this is a
    // measurement rather than a tautology: it says the spring is stiff enough that
    // "no going backwards" is true to the eye. Dropped in at 600px/s — faster than
    // any real arrival, which is climbing — the ship gives up 40px and turns.
    expect(descent(cfg, 600).total).toBeLessThan(60);
    expect(descent(cfg, 300).total).toBeLessThan(25);
    expect(descent(cfg, 0).total).toBe(0);
  });

  it('does it smoothly, with no tick that reads as a stop', () => {
    // A hard clamp arrests a 600px/s fall in ONE tick, which is a 10px jump in the
    // picture at the exact moment the player is watching hardest. Under a spring
    // the worst tick is a fraction of that and the rest is a curve.
    expect(descent(cfg, 600).tick).toBeLessThan(9);
  });

  it('is what stops the last planet catching a ship that fell back into the band', () => {
    // The contrast that shows the lift is load-bearing rather than decorative: with
    // it off, the same arrival falls 280px and flies into the body it had just
    // cleared. Nothing is meant to be able to die in here.
    const noLift: SimConfig = { ...cfg, carpetLift: 0 };
    expect(descent(noLift, 300).total).toBeGreaterThan(200);
  });

  it('is silent on a climb, which is every ordinary crossing', () => {
    // The spring's whole point is that it is one-sided. A ship already rising past
    // `carpetRise` must cross exactly as it did before any of this existed.
    const lifted = inCarpet(cfg, 400, -420);
    const plain = inCarpet({ ...cfg, carpetLift: 0 }, 400, -420);
    for (let i = 0; i < 60; i++) {
      stepSim(lifted, cfg, NO_INPUT, FIXED_DT);
      stepSim(plain, { ...cfg, carpetLift: 0 }, NO_INPUT, FIXED_DT);
    }
    expect(lifted.ship.y).toBe(plain.ship.y);
  });
});

describe('the dots', () => {
  it('sit inside the band, off the centre line, and only where there is a carpet', () => {
    const state = createInitialState(cfg);
    const band = bandOf(cfg, state);
    expect(state.motes).toHaveLength(cfg.carpetMoteCount);
    for (const m of state.motes) {
      expect(m.y).toBeGreaterThan(band.top);
      expect(m.y).toBeLessThan(band.bottom);
      expect(m.taken).toBe(false);
    }
    expect(createInitialState(PROTOTYPE_CONFIG).motes).toHaveLength(0);
  });

  it('leaves the corridor alone, so a seed is the same field with or without them', () => {
    // The dots draw from their own `rnd` stream. Sharing the field's would make a
    // change to `carpetMoteCount` silently relayout every planet, and the two
    // configurations would never be comparable again — the same guarantee
    // `placeAnomalies` keeps.
    const none: SimConfig = { ...cfg, carpetMoteCount: 0 };
    const withDots = createInitialState(cfg).bodies;
    const without = createInitialState(none).bodies;
    expect(withDots).toEqual(without);
  });

  it('reward flying the carpet rather than riding it', () => {
    // The funnel delivers a ship that does nothing to the middle of the field, and
    // the chain of dots is a curve away from the middle — so a run that is STEERED
    // collects more than one that is merely survived. Flown by a pilot rather than
    // by a recorded rhythm, for the reason `steerForDots` gives at length: a
    // rhythm is a phase, and the same cadence collects 1 or 5 depending on which
    // tick it starts.
    const idle = inCarpet(cfg, 4);
    fly(idle, cfg, [], 300);
    const flown = inCarpet(cfg, 4);
    steerForDots(flown, cfg, 300);
    const taken = (s: SimState) => s.motes.filter((m) => m.taken).length;
    expect(taken(idle)).toBeLessThanOrEqual(2);
    expect(taken(flown)).toBeGreaterThan(taken(idle));
  });

  it('pay a flat award with no multiplier and no streak', () => {
    const state = inCarpet(cfg, 4);
    const { awards } = fly(state, cfg, rhythm(8, 12, 16), 300);
    const dots = awards.filter((a) => a.kind === 'mote');
    expect(dots.length).toBe(state.motes.filter((m) => m.taken).length);
    expect(dots.length).toBeGreaterThan(0);
    for (const d of dots) {
      expect(d.points).toBe(150);
      expect(d.multiplier).toBe(1);
    }
  });

  it('come back with the ship, and so does the tally that pays for them', () => {
    // A respawn re-flies the field from the bottom, so the carpet has to be the
    // same puzzle again. The scorer's own count resets with it — left behind, the
    // next life's first dot would look like one already collected and pay nothing.
    const state = inCarpet(cfg, 4);
    fly(state, cfg, [], 300);
    expect(state.motes.some((m) => m.taken)).toBe(true);
    respawn(state, cfg);
    expect(state.motes.every((m) => !m.taken)).toBe(true);
  });
});

describe('the signature', () => {
  it('records only inside the carpet, and by distance rather than by tick', () => {
    // Down at the spawn, which is the whole field below the carpet: nothing is
    // written however far the ship flies.
    const spawned = createInitialState(cfg);
    for (let i = 0; i < 120; i++) stepSim(spawned, cfg, NO_INPUT, FIXED_DT);
    expect(spawned.signature.pts).toHaveLength(0);

    const state = inCarpet(cfg, 4);
    fly(state, cfg, [], 400);
    expect(state.signature.pts.length).toBeGreaterThan(8);
    const band = bandOf(cfg, state);
    for (const p of state.signature.pts) {
      expect(p.y).toBeGreaterThanOrEqual(band.top - 1);
      expect(p.y).toBeLessThanOrEqual(band.bottom + 1);
    }
    // Consecutive points are a spacing apart, not a tick apart: the density of the
    // line must not depend on how fast the ship was going.
    for (let i = 1; i < state.signature.pts.length; i++) {
      const a = state.signature.pts[i - 1]!;
      const b = state.signature.pts[i]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(SIGNATURE_SPACING);
    }
  });

  it('survives the ending it is drawn for', () => {
    // A cleared run never respawns, which is the only reason the ceremony has a
    // line to show. Pinned because `respawn` clears it and the two facts have to
    // stay on the right sides of each other.
    const state = inCarpet(cfg, 4);
    fly(state, cfg, [], 400);
    expect(state.ending.reason).toBe('cleared');
    expect(state.signature.pts.length).toBeGreaterThan(8);
  });

  it('halves rather than truncating when the buffer fills', () => {
    // Dropping the OLDEST points would amputate the start of the signature — the
    // part nearest the crest, where the carving begins. Thinning keeps the whole
    // shape at half the resolution, and thinning from the NEWEST end keeps the
    // point just written, which is the end anchored to the ship.
    const state = inCarpet(cfg, 4);
    const sig = state.signature;
    const first = { x: 100, y: 0, speed: 300 };
    for (let i = 0; i < SIGNATURE_MAX; i++)
      sig.pts.push(i === 0 ? first : { x: 100 + i, y: 0, speed: 300 });

    // One more sample, written through the real path, tips it over. Teleporting
    // the ship is what guarantees the spacing test passes and a point is actually
    // taken; the band is where it has to be for anything to be written at all.
    const band = bandOf(cfg, state);
    state.ship.y = band.top + 100;
    state.ship.x = 4000;
    stepSim(state, cfg, NO_INPUT, FIXED_DT);

    expect(sig.pts.length).toBeLessThanOrEqual(SIGNATURE_MAX / 2 + 1);
    expect(sig.spacing).toBe(SIGNATURE_SPACING * 2);
    // Both ends survive: the tail is where the ship entered the carpet and the
    // head is what the ceremony pins to the hull.
    expect(sig.pts[0]).toEqual(first);
    expect(sig.pts[sig.pts.length - 1]!.x).toBeGreaterThan(3000);
  });
});

describe('none of it exists in the prototype', () => {
  it('leaves every carpet key at zero, which is what keeps the gate at zero', () => {
    expect(PROTOTYPE_CONFIG.carpetCarve).toBe(0);
    expect(PROTOTYPE_CONFIG.carpetCarveMax).toBe(0);
    expect(PROTOTYPE_CONFIG.carpetLift).toBe(0);
    expect(PROTOTYPE_CONFIG.carpetRise).toBe(0);
    expect(PROTOTYPE_CONFIG.carpetMoteCount).toBe(0);
    expect(PROTOTYPE_CONFIG.carpetMoteRange).toBe(0);
  });

  it('builds no dots and writes no signature, because it has no run-in at all', () => {
    // `runInBand` is null without `clearAtTop`, so the whole feature is unreachable
    // there rather than merely switched off — which is the same thing that makes a
    // report recorded before any of this existed replay unchanged.
    expect(runInBand(PROTOTYPE_CONFIG, fieldBounds(PROTOTYPE_CONFIG, []))).toBeNull();
    expect(createMotes(PROTOTYPE_CONFIG, [])).toHaveLength(0);
  });
});
