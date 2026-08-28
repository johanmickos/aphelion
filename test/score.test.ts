/**
 * The score's guarantees.
 *
 * Two of them are structural and matter more than any weight:
 *
 *   - a score is a pure function of (config, seed, inputLog), or a diagnostics
 *     replay cannot reproduce what a phone session showed;
 *   - the scorer cannot touch the simulation, or the equality gate would be
 *     scoring's problem too.
 *
 * The third is the scoring twin of `test/tune.test.ts`: a weight that cannot
 * change any score is not a weight, it is decoration.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { createBodies, fieldBounds, sheltered, runInBand } from '../src/sim/world.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { grabTarget } from '../src/sim/capture.ts';
import { hypot } from '../src/sim/orbit.ts';
import { fingerprint } from '../src/sim/serialize.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import {
  AIM,
  BONKS,
  BONK_SPEED,
  RECKLESS_DEG,
  RECKLESS_HARD_DEG,
  RECKLESS_STREAK,
  SHOUTS,
  bonkWord,
  shoutWord,
  CLOSE_PX,
  BURN_MIN_HEAT,
  DEFAULT_SCORE_CONFIG,
  FLYBY_TURN_MIN,
  edgeHeat,
  previewBurn,
  reentryHeat,
  PEAK,
  WORDS,
  createScoreState,
  isNerveGrab,
  praiseFor,
  readAim,
  scoreTick,
} from '../src/score/index.ts';
import type { ScoreAward, ScoreConfig, ScoreState, Shout } from '../src/score/index.ts';

// --------------------------------------------------------------------- driving

type Edges = Array<[number, 0 | 1]>;

interface Session {
  score: ScoreState;
  awards: ScoreAward[];
  shouts: Shout[];
  state: SimState;
  fingerprints: number[];
}

interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Drive a recorded input log and score it. */
function play(
  edges: Edges,
  ticks: number,
  cfg: SimConfig = DEFAULT_CONFIG,
  scfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
  score = true,
  ship?: Ship,
): Session {
  const state = createInitialState(cfg);
  if (ship) Object.assign(state.ship, ship);
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  const shouts: Shout[] = [];
  const fingerprints: number[] = [];
  const map = new Map(edges);
  let held = false;

  for (let t = 0; t < ticks; t++) {
    const e = map.get(t);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
    if (score) {
      const out = scoreTick(sc, state, cfg, FIXED_DT, scfg);
      awards.push(...out.awards);
      shouts.push(...out.shouts);
    }
    fingerprints.push(fingerprint(state));
  }
  return { score: sc, awards, shouts, state, fingerprints };
}

/**
 * A greedy pilot, played rather than recorded: grab whatever is on offer and let
 * go as the combined boost-and-aim quality turns over.
 *
 * It exists because the interesting properties — streaks and multipliers — only
 * appear across a chain of captures, and hand-written press/release ticks that
 * chain reliably are brittle to any retune. This one finds its own way.
 */
function pilot(ticks: number, cfg: SimConfig = DEFAULT_CONFIG, scfg = DEFAULT_SCORE_CONFIG) {
  const state = createInitialState(cfg);
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  const shouts: Shout[] = [];
  let held = false;
  let bestQ = 0;
  let holdT = 0;
  let taken = new Set<number>();
  /** What each life was worth at the instant it was zeroed. */
  const lives: number[] = [];
  let prevScore = 0;
  /** The carry is watched here because nothing spends it yet — see F04 stage (a). */
  let carryPeak = 0;
  let carryCashed = 0;
  let prevCarry = 0;

  for (let t = 0; t < ticks; t++) {
    let pressed = false;
    let released = false;

    if (!held && !state.capture && !state.ending.active) {
      const offer = grabTarget(state, cfg);
      if (offer.index >= 0 && !taken.has(offer.index)) {
        const b = state.bodies[offer.index]!;
        if (hypot(state.ship.x - b.x, state.ship.y - b.y) < 300) {
          taken.add(offer.index);
          pressed = true;
          held = true;
          bestQ = 0;
          holdT = 0;
        }
      }
    } else if (held) {
      holdT++;
      const cap = state.capture;
      if (!cap) held = false;
      else if (cap.orbit && (cap.phase === 'settle' || cap.phase === 'orbit')) {
        const aim = readAim(
          cap.orbit,
          cap.rPeri,
          cfg.tightenFrac * cap.settleProgress,
          state.bodies,
          cap.planet,
          Math.atan2(cap.ry, cap.rx),
        ).best;
        const timing = cap.boostFull > 0 ? cap.boost / cap.boostFull : 0;
        const q = timing * timing * aim * aim * aim;
        if (q > bestQ) bestQ = q;
        if ((bestQ > 0.005 && q < bestQ * 0.9) || holdT > 400) {
          released = true;
          held = false;
        }
      } else if (holdT > 400) {
        released = true;
        held = false;
      }
    }

    stepSim(state, cfg, { held: held || pressed, pressed, released }, FIXED_DT);
    const out = scoreTick(sc, state, cfg, FIXED_DT, scfg);
    awards.push(...out.awards);
    shouts.push(...out.shouts);
    if (sc.bank === 0 && prevScore > 0) lives.push(prevScore);
    prevScore = sc.bank;
    if (sc.carry < prevCarry) carryCashed += prevCarry;
    if (sc.carry > carryPeak) carryPeak = sc.carry;
    prevCarry = sc.carry;
    if (state.ending.active) taken = new Set();
  }
  return { score: sc, awards, shouts, state, lives, carryPeak, carryCashed };
}

/**
 * The right-hand anomaly of the default field, read from the generator.
 *
 * `ANOMALY_PRESS` is the tick the ship above arrives within pressing range: it
 * starts 520px out at 320px/s, so ~98 ticks covers 520px and the press lands
 * with the anomaly close enough to convert rather than sail past.
 */
const ANOMALY = createBodies(DEFAULT_CONFIG).find((b) => b.kind === 'anomaly' && b.x > 195)!;
const ANOMALY_PRESS = 88;

/**
 * The body the flyby session below sails past, and the line it sails past it on.
 *
 * Found by name rather than by index so a layout change moves the fixture with
 * the field instead of silently pointing it at whatever body inherited the slot.
 * 500px/s straight up the field from 800px out, offset 160px to the side: fast
 * enough that the grab is unbound and therefore a flyby, offset enough that
 * gravity bends it past rather than into the surface. It bottoms out 49px above
 * the minimum orbit, which is mid-range for a real one — measured over 167
 * recorded passages the median is 60px — so the pass exercises `flybyCloseBonus`
 * somewhere other than at its ends.
 *
 * Robust to the release tick: 120 through 320 all produce the same single award,
 * because the award is OWED at the closest approach and only paid at the release.
 */
const FLYBY_BODY = createBodies(DEFAULT_CONFIG).find((b) => b.name === 'P14')!;
const FLYBY_SHIP = { x: FLYBY_BODY.x - 160, y: FLYBY_BODY.y + 800, vx: 0, vy: -500 };

/**
 * A small body used for the one pass in the suite that bottoms out SLOWLY.
 *
 * Escape speed falls off with distance, so 400px to the side of a 35px-radius
 * planet is the corner of the world where an unbound grab can still be moving at
 * 140px/s — everywhere else a flyby that slow is bound, and a bound inbound flyby
 * converts into a capture instead. It is the only way to put `FLYBY_SPEED_MIN`
 * under test with the speed as the only variable.
 */
const FAR_BODY = createBodies(DEFAULT_CONFIG).find((b) => b.name === 'P18')!;

/**
 * A ship entering the run-in carpet, centred and climbing at an ordinary crossing
 * speed.
 *
 * `runInBand` rather than arithmetic on the crest, because that helper is the one
 * definition of where the carpet is and a second copy here would be free to drift
 * from it — which is the bug its own header is about.
 */
const CARPET_SHIP: Ship = (() => {
  const cfg = DEFAULT_CONFIG;
  const fb = fieldBounds(cfg, createBodies(cfg));
  const band = runInBand(cfg, fb)!;
  return { x: (fb.left + fb.right) / 2, y: band.bottom - 4, vx: 0, vy: -320 };
})();

/**
 * The presses that carve that crossing: 8 ticks down, 12 up, from tick 16.
 *
 * THE PHASE IS PART OF THE FIXTURE, not just the cadence, because the carve
 * alternates on every press — the same 8/12 rhythm started at tick 0 collects one
 * dot and started at 16 collects five. A fixture at one dot is one retune from
 * zero, and a battery session that collects none makes `moteBonus` measure as dead
 * when it is merely unreached. `the carpet session actually reaches its dots`
 * below is the guard that says which of the two happened.
 */
const CARPET_EDGES: Edges = (() => {
  const out: Edges = [];
  for (let t = 16; t < 200; t += 20) out.push([t, 1], [t + 8, 0]);
  return out;
})();

/**
 * The sessions every weight is measured against.
 *
 * One is not enough, for the same reason `test/tune.test.ts` needs several: a
 * session that never chains cannot show a multiplier, and one that never reaches
 * periapsis cannot show anything the grab is paid for.
 */
const SESSIONS: ReadonlyArray<{ name: string; edges: Edges; ticks: number; ship?: Ship }> = [
  /**
   * A nerve grab: bearing straight down on P1 and pressing late.
   *
   * None of the sessions below can produce one, and the default spawn cannot
   * either — its line misses P1 by 26px of clearance, so the ship is never
   * actually headed inside the minimum orbit. Without this scenario `nerveBonus`
   * measures as inert, which is a blind spot in the fixture rather than a dead
   * weight. P1 is at (189, 0) with R=46, so minR is 58 and a line through its
   * centre skims at -58. Pressing at tick 179 is 110px out — 52px of clearance,
   * inside the late threshold, and still clear of the crash cone at 96px.
   */
  {
    name: 'head-on, pressed late',
    ship: { x: 189, y: 400, vx: 0, vy: -97 },
    edges: [
      [179, 1],
      [260, 0],
    ],
    ticks: 420,
  },
  /**
   * Dragged along the dead zone while hanging off a planet.
   *
   * Here for the same reason as the nerve grab above: without it `burnEdgeSpan`
   * measures as inert, because none of the other sessions ever takes the ship
   * into the red band while captured — a blind spot in the fixture, not a dead
   * weight. Real play does it 2.5 times a session; this battery did it never.
   *
   * Starts 20px inside the right wall (which is at x=565.5) falling at 120px/s,
   * and grabs once the swing has begun. Worth 152 ticks inside the band.
   *
   * IT HAS TO LET GO, and that is F04's addition rather than tidiness. The burn
   * used to pay when the fire went out, so a session that never released still
   * banked one; the fire now selects the band the RELEASE cashes in, so a drag
   * that is never let go of scores nothing at all and every `burn*` key measures
   * as dead. Exactly the blind spot `fuelRegen` fell into twice, arriving from a
   * new direction: the fixture stopped reaching the mechanism because the
   * mechanism moved.
   */
  {
    name: 'dragged along the dead zone',
    ship: { x: 545.5, y: 200, vx: 0, vy: -120 },
    edges: [
      [90, 1],
      [500, 0],
    ],
    ticks: 900,
  },
  /**
   * A release good enough to earn the bottom rung and no better.
   *
   * Here for the reason the nerve grab, the anomaly, the flyby and the carpet are:
   * without it `tierTrue` measures as inert, and that would be a hole in the
   * fixture rather than a dead weight. The tier is a LADDER, so a battery that
   * only ever lands on one rung cannot see the others — and the rest of it lands
   * on two: the pilot releases at the turnover of its own quality every time, at
   * SHARP or at nothing, and the flyby fixture sweeps past the top of the ladder
   * and lands PERFECT.
   *
   * Tick 330 rather than a round number, and found by walking the release: this
   * capture's quality passes through aim 0.35 / peak 0.78 at that moment, which is
   * `q` 0.026 — above the TRUE line at 0.0102 and well below SHARP at 0.168. Twenty
   * ticks later it is 0.72 and PERFECT, which is how narrow the window is and why
   * the fixture is written down rather than reasoned.
   */
  {
    name: 'released on the bottom rung',
    edges: [
      [240, 1],
      [330, 0],
    ],
    ticks: 900,
  },
  /**
   * The same capture, released on the TOP rung.
   *
   * Here for the reason the bottom-rung session above is, arriving from the other
   * end of the ladder. The battery used to reach PERFECT through the flyby
   * fixture, whose pass swept past `flybyTurnSpan` and topped out — and when the
   * span was re-measured off recorded passes and moved 60 -> 81, that stopped
   * being true and `tierPerfect` measured as dead. A blind spot in the fixture,
   * not a dead weight, and the third time this exact shape has bitten: the
   * fixture stopped reaching the mechanism because the mechanism moved.
   *
   * Tick 345 rather than a round number, and found by walking the release the way
   * 330 was. The capture passes through aim 0.942 / peak 1.000 there, which is
   * `q` 0.836 against the PERFECT line at 0.659. Fifteen ticks earlier it is
   * 0.155 and TRUE, and twenty-five later it is 0.085 and TRUE again — the whole
   * PERFECT window is about 20 ticks wide on this dive.
   *
   * IT ALSO PINS THE TIMING PLATEAU, which is worth having written down where it
   * can be seen: `timing` is exactly 1.000 at releases 340 through 380 on this
   * capture, so across that 0.67s only `aim` moves the grade. `boostArmTime` 0.45
   * and `settleDur` 1.2 with `boostHoldsThroughSettle` on is what makes the flat
   * top, and it is why the tier's timing axis discriminates over less of the
   * envelope than it looks like it should.
   */
  {
    name: 'released on the top rung',
    edges: [
      [240, 1],
      [345, 0],
    ],
    ticks: 900,
  },
  /**
   * Drifting at the right wall, pressed while the cross is still ahead.
   *
   * Here for the same reason as the two above: without it `rescueBonus` and
   * `rescueSpan` measure as inert, because no other session in the battery ever
   * presses while committed to a side boundary — a blind spot in the fixture, not
   * a dead weight. Real play does it on 37% of presses.
   *
   * The right wall is at x=565.5. Starting 400px short of it at 150px/s across
   * gives a 1.7s window at the spawn, and pressing at tick 60 spends 0.71 of it —
   * neither 0 nor 1, so both weights move the payout.
   */
  {
    name: 'rescued off the right wall',
    ship: { x: 165.5, y: 150, vx: 150, vy: -60 },
    edges: [[60, 1]],
    ticks: 600,
  },
  // holds through the settle and releases mid-decay
  {
    name: 'held long, released in the decay',
    edges: [
      [240, 1],
      [450, 0],
    ],
    ticks: 900,
  },
  // grabs once, then coasts the rest of the way
  {
    name: 'one grab then coasting',
    edges: [
      [240, 1],
      [340, 0],
    ],
    ticks: 3000,
  },
  // never presses at all
  { name: 'never engages', edges: [], ticks: 3000 },
  /**
   * Out through the barrier to an anomaly, captured, then released.
   *
   * Here for the same reason the nerve grab above is: no other session can reach
   * one, and without it all three `anomaly*` weights measure as inert — a blind
   * spot in the fixture, not a dead weight. That failure mode has now bitten
   * `fuelRegen` twice on the tune-panel twin of this test, so it is worth naming.
   *
   * The ship's line is derived from the field rather than written down, because a
   * hardcoded position would silently stop reaching the anomaly the first time
   * anything about placement moved, and the test would go quietly green while
   * covering nothing. Aimed slightly off-centre so it captures rather than
   * flying into the surface.
   *
   * It must also GET HOME and grab again, or `anomalyBonusMult` measures inert:
   * a bonus that expires with nothing scored under it changes no outcome. The
   * second press takes a corridor planet 1.8s after the release, inside the
   * window, so the multiplier addition is actually paid on something.
   *
   * The release tick is chosen from the parked orbit's PHASE, not from the clock:
   * the ship goes round the anomaly once every authored `orbitPeriod`, so which way
   * it is thrown depends entirely on when it is let go, and only part of that
   * circle is aimed back at the corridor. Letting go at the wrong point sends it
   * out through the far side of the bubble, where the barrier resumes and the run
   * ends — which is what happened to the previous numbers when the anomaly
   * approach stopped taking two seconds and every tick after the press moved.
   */
  /**
   * Past a planet too fast to be caught by it, then let go.
   *
   * Here for the same reason the nerve grab and the anomaly are: nothing else in
   * the battery produces one, and without it both `flyby*` weights measure as
   * inert — a blind spot in the fixture rather than a dead weight. The pilot
   * cannot supply it either; it only presses inside 300px and at drift speed,
   * which is a capture every time.
   */
  {
    name: 'straight past, too fast to hold',
    ship: FLYBY_SHIP,
    edges: [
      [1, 1],
      [200, 0],
    ],
    ticks: 400,
  },
  /**
   * Carving up the run-in carpet, taking dots on the way.
   *
   * Here for the same reason the nerve grab, the anomaly and the flyby are:
   * nothing else in the battery gets anywhere near the crest — the pilot flies
   * 4000 ticks and the field is sixty bodies deep — so without it `moteBonus`
   * measures as inert, which is a blind spot in the fixture rather than a dead
   * weight.
   *
   * Staged rather than flown, and cheaply: the ship is dropped in at the bottom of
   * the band already climbing, which is the state a real run arrives in. The
   * presses alternate the carve, so the line weaves across the chain of dots
   * instead of riding the funnel straight up the middle — the run collects two
   * dots doing nothing at all and more than twice that when it is flown.
   *
   * The band is derived from the field rather than written down, for the reason
   * the anomaly session gives: a hardcoded height would silently stop reaching the
   * carpet the first time anything about the field moved, and the test would go
   * quietly green while covering nothing.
   */
  {
    name: 'carving the run-in carpet',
    ship: CARPET_SHIP,
    edges: CARPET_EDGES,
    ticks: 200,
  },
  {
    name: 'out to an anomaly and back',
    ship: { x: ANOMALY.x - 520, y: ANOMALY.y - 70, vx: 320, vy: 0 },
    edges: [
      [ANOMALY_PRESS, 1],
      [186, 0],
      [296, 1],
      [406, 0],
    ],
    ticks: 900,
  },
];

/**
 * What a session came to, as two numbers rather than one.
 *
 * `score` alone will not do — it is the current life's, and every session here
 * ends after at least one death, so it is almost always zero at the final tick.
 * `best` alone will not do either: it is a PEAK, and a weight that only moves a
 * late link cannot move it. The pair is the honest signature: the best life, and
 * everything the session was ever paid.
 */
function outcomeOf(r: { score: ScoreState; awards: ScoreAward[] }): number[] {
  return [r.score.best, r.awards.reduce((n, a) => n + a.points, 0)];
}

/**
 * The battery a weight is measured against, one thunk per session, unrun.
 *
 * Lazy because this is by an order of magnitude the most expensive thing in the
 * file: one full pass is ~12k scored ticks and the sweep below wants dozens of
 * them. Eager, it timed out on CI, where a shared runner is ~3x slower per core
 * than the machine this is usually written on.
 *
 * The pilot goes first because it is the most discriminating — a long
 * multi-life chain touches every weight — so a difference is usually found
 * before a single hand-written session has been replayed. Do not reorder the
 * rest: the comparison is positional.
 */
function battery(scfg: ScoreConfig): Array<() => number[]> {
  return [
    () => outcomeOf(pilot(4000, DEFAULT_CONFIG, scfg)),
    ...SESSIONS.map(
      (s) => () => outcomeOf(play(s.edges, s.ticks, DEFAULT_CONFIG, scfg, true, s.ship)),
    ),
  ];
}

/**
 * Did any session in the battery come out differently under `scfg`?
 *
 * Stops at the first one that did. That is exactly the question the sweep asks
 * — does this weight change SOME outcome — so short-circuiting proves what the
 * full walk proved. Only the failing case, a weight that changes nothing, still
 * pays for the whole battery, which is the one case worth paying for.
 */
function differs(base: number[][], scfg: ScoreConfig): boolean {
  const parts = battery(scfg);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]!().some((n, j) => n !== base[i]![j])) return true;
  }
  return false;
}

// ------------------------------------------------------------------ structure

describe('a score is a pure function of (config, seed, inputLog)', () => {
  it('scores the same input log identically every time', () => {
    const edges: Edges = [
      [240, 1],
      [318, 0],
      [520, 1],
      [600, 0],
    ];
    const a = play(edges, 1600);
    const b = play(edges, 1600);
    expect(b.score).toEqual(a.score);
    expect(b.awards).toEqual(a.awards);
  });

  it('reaches the same score whether or not the awards were consumed as they fell', () => {
    // A replay reads the awards; the game reads the running total. Inside one
    // life they must agree, or `tools/replay.ts` would report a different game.
    // 340 ticks is one link and no death — past that the score resets and the
    // running total is deliberately no longer the sum of everything paid.
    const { score, awards } = play(
      [
        [240, 1],
        [318, 0],
      ],
      340,
    );
    expect(awards.length).toBeGreaterThan(0);
    expect(awards.reduce((n, a) => n + a.points, 0)).toBe(score.bank);
    expect(awards.filter((a) => a.kind === 'link')).toHaveLength(score.links);
  });

  it('cannot influence the simulation, at any tick', () => {
    // The whole reason scoring is an observer. If this ever fails, the equality
    // gate is next.
    const edges: Edges = [
      [240, 1],
      [318, 0],
      [520, 1],
      [600, 0],
    ];
    const scored = play(edges, 1600, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true);
    const bare = play(edges, 1600, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, false);
    expect(scored.fingerprints).toEqual(bare.fingerprints);
  });
});

describe('scoring weights', () => {
  it('the carpet session actually reaches its dots', () => {
    // A FIXTURE GUARD, and it earns its place: `moteBonus` can only move an
    // outcome if some session collects a dot, so a battery that stopped reaching
    // them would report the weight as dead. AGENTS.md names that failure mode —
    // `fuelRegen` was pinned as inert twice on scenarios that never reached the
    // mechanism — and this is the assertion that tells the two apart.
    const s = SESSIONS.find((x) => x.name === 'carving the run-in carpet')!;
    const r = play(s.edges, s.ticks, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true, s.ship);
    expect(r.state.motes.filter((m) => m.taken).length).toBeGreaterThanOrEqual(3);
    expect(r.awards.filter((a) => a.kind === 'mote').length).toBeGreaterThanOrEqual(3);
  });

  it('exposes no weight that leaves every score unchanged', () => {
    // The twin of the tune-panel guarantee. These cannot go in the tune panel —
    // `test/tune.test.ts` measures a knob by how far it moves the ship, and a
    // score weight moves no pixel — so the same promise is kept here instead.
    const base = battery(DEFAULT_SCORE_CONFIG).map((f) => f());
    // Collected rather than asserted key by key. A dead key is nearly always a
    // FIXTURE hole — `fuelRegen` was pinned as inert twice on scenarios that never
    // reached the mechanism — so the useful failure message is the whole list, not
    // whichever key the loop happened to reach first.
    const dead: string[] = [];
    for (const key of Object.keys(DEFAULT_SCORE_CONFIG) as Array<keyof ScoreConfig>) {
      const v = DEFAULT_SCORE_CONFIG[key];
      let moved = false;
      for (const alt of [0, v * 0.5, v * 2]) {
        if (alt === v) continue;
        if (differs(base, { ...DEFAULT_SCORE_CONFIG, [key]: alt })) {
          moved = true;
          break;
        }
      }
      if (!moved) dead.push(key);
    }
    expect(dead, "these weights cannot change any session's outcome").toEqual([]);
  });
});

// ------------------------------------------------------------------ behaviour

describe('the fire a cross is offering', () => {
  const cfg = DEFAULT_CONFIG;
  const state = createInitialState(cfg);
  const field = fieldBounds(cfg, state.bodies);
  const bodies = state.bodies;
  const DT = FIXED_DT;

  /** A straight run of ticks at a fixed distance inside the right wall. */
  const hold = (inset: number, ticks: number) =>
    Array.from({ length: ticks }, () => ({ x: field.right - inset, y: 0 }));

  it('is zero for a flight that never enters the band', () => {
    expect(previewBurn(hold(400, 200), field, bodies, DEFAULT_SCORE_CONFIG, DT)).toBe(0);
  });

  it('pays more for deeper and for longer, on the same curve the burn uses', () => {
    const shallow = previewBurn(hold(50, 60), field, bodies, DEFAULT_SCORE_CONFIG, DT);
    const deep = previewBurn(hold(10, 60), field, bodies, DEFAULT_SCORE_CONFIG, DT);
    const longer = previewBurn(hold(10, 120), field, bodies, DEFAULT_SCORE_CONFIG, DT);
    expect(deep).toBeGreaterThan(shallow);
    expect(longer).toBeGreaterThan(deep);
    // Twice the ticks at a constant depth is exactly twice the bank: it is an
    // integral, not a peak reading.
    expect(longer / deep).toBeCloseTo(2, 6);
  });

  it('is the same integral the burn is paid on, weight for weight', () => {
    // The promise that matters: if these two ever stop agreeing, the mark is
    // sizing itself off a fire the scorer would not pay for. Doubling the rate
    // doubles the preview, and the span it is compared against is in these units.
    const flight = hold(20, 90);
    const base = previewBurn(flight, field, bodies, DEFAULT_SCORE_CONFIG, DT);
    const twice = previewBurn(
      flight,
      field,
      bodies,
      { ...DEFAULT_SCORE_CONFIG, burnRate: DEFAULT_SCORE_CONFIG.burnRate * 2 },
      DT,
    );
    expect(twice / base).toBeCloseTo(2, 6);

    // And it obeys the same ignition floor, so a flight that never enters the
    // band does not promise a fire. THE FLOOR IS NOW 0 and this pin moved with it:
    // `burnMinHeat` was 0.01 only because a zero weight reads as a dead one to the
    // sweep above, and F04 made it a constant — so the band's outer edge is the
    // floor exactly, and a graze 0.2px inside it lights the faintest possible fire
    // rather than none. That is the reported brief: "the second they enter the
    // dangerous red zone". See `BURN_MIN_HEAT`.
    const outside = hold(DEFAULT_SCORE_CONFIG.burnEdgeSpan + 0.2, 90);
    expect(previewBurn(outside, field, bodies, DEFAULT_SCORE_CONFIG, DT)).toBe(0);
    const graze = hold(DEFAULT_SCORE_CONFIG.burnEdgeSpan - 0.2, 90);
    expect(previewBurn(graze, field, bodies, DEFAULT_SCORE_CONFIG, DT)).toBeGreaterThan(0);
  });

  it('promises nothing inside an anomaly bubble, where there is no wall', () => {
    const anomaly = bodies.find((b) => b.kind === 'anomaly');
    expect(anomaly, 'the default field has anomalies').toBeTruthy();
    const inside = Array.from({ length: 90 }, () => ({ x: anomaly!.x, y: anomaly!.y }));
    expect(previewBurn(inside, field, bodies, DEFAULT_SCORE_CONFIG, DT)).toBe(0);
  });
});

describe('what a rescue is worth', () => {
  /** A drift at the right wall, pressed `at` ticks in. */
  const WALL_DRIFT = { x: 165.5, y: 150, vx: 150, vy: -60 };
  const rescueRun = (at: number, scfg: ScoreConfig = DEFAULT_SCORE_CONFIG) =>
    play(
      [
        [at, 1],
        [at + 200, 0],
      ],
      600,
      DEFAULT_CONFIG,
      scfg,
      true,
      WALL_DRIFT,
    );

  /**
   * THIS BLOCK USED TO PIN `rescueBonus`, AND THE PIN FAILING IS THE POINT.
   *
   * F04 deleted the award. The prediction, written down before it was measured,
   * was that a rescue would be structurally unpayable under a climb-only
   * currency: a rescue is a lateral save, the constitution pays only for climb,
   * so carry is about zero and `0 x band = 0`.
   *
   * The corpus reversed it. The link after a rescue banks a median carry of
   * 1352px against 554px for an ordinary one — 2.44x, because a rescue means the
   * ship drifted a long way and saved it — and the swing cashes in the fire band
   * it was flying through. So the axis survives at about 7x an ordinary swing
   * with no weight, no exception, and nothing anywhere naming it a rescue.
   *
   * What these assert is that property, which is the thing that would break
   * silently: nothing pays a rescue, and a rescue is still worth flying for.
   */
  it('is not an award any more, and nothing on screen calls it one', () => {
    const r = rescueRun(60);
    expect(
      r.awards.every((a) => a.kind === 'link' || a.kind === 'flyby' || a.kind === 'mote'),
    ).toBe(true);
  });

  it('cashes the fire it was flying through, which is half of where the multiple comes from', () => {
    // The band is the half of the ~7x a fixture can show. A drag along the wall is
    // by construction inside the red, so the swing it ends on cashes above the
    // first band — and it is the only session in the suite that does.
    //
    // The other half is the CARRY, and it is a corpus measurement rather than
    // something a synthetic drift reproduces: over the reports that replay
    // faithfully, the link after a rescue banks a median 1352px against 554px for
    // an ordinary one. The fixtures here drift 400px sideways in a straight line;
    // a real rescue is a long loose flight that saved itself. PORT_NOTES 73.
    const dragged = play(
      [
        [90, 1],
        [500, 0],
      ],
      900,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      { x: 545.5, y: 200, vx: 0, vy: -120 },
    );
    const swing = dragged.awards.find((a) => a.kind === 'link');
    expect(swing, 'the drag never reached a release').toBeDefined();
    expect(swing!.band, 'the drag cashed in the cold band').toBeGreaterThan(1);
    expect(swing!.heat, 'the swing reports the fire it flew through').toBeGreaterThan(0);
  });

  it('cannot be farmed, because a tap in place has climbed nothing to cash', () => {
    // The reported shape: "I can tap a bunch to extend my burn through the red
    // zone". It used to need a once-per-body rule, because every one of those taps
    // does turn the ship away and the tightest rescue was therefore the most
    // repeatable one. The rule is gone and the faucet is closed structurally: a
    // press in place cashes whatever ground has been covered since the last one,
    // and pressing again immediately has covered none.
    const tapped = play(
      [
        [60, 1],
        [130, 0],
        [136, 1],
        [190, 0],
      ],
      600,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      WALL_DRIFT,
    );
    expect(tapped.score.bank, 'tapping at the wall minted points').toBe(
      tapped.awards.reduce((n, a) => n + a.points, 0),
    );
    for (const a of tapped.awards) expect(a.carry).toBeLessThanOrEqual(a.climb + 1e-6);
  });

  it('still arms the skull, which is all the scorer keeps of the prediction', () => {
    // `armDoom` runs the same forward simulation the award used to be read from,
    // and nothing pays or withholds a point on the answer. See `ScoreState.doomed`.
    const late = play([[150, 1]], 400, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true, WALL_DRIFT);
    expect(late.score.doomed === null || late.score.doomed.wall === 'right').toBe(true);
  });
});

describe('the skull: a press made past the last chance', () => {
  const WALL_DRIFT = { x: 165.5, y: 150, vx: 150, vy: -60 };

  /** Press `at` ticks in and report what the scorer knew, tick by tick. */
  const run = (at: number, ticks = 400) => {
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, WALL_DRIFT);
    const sc = createScoreState();
    const seen: Array<{ tick: number; doomed: boolean }> = [];
    let held = false;
    for (let t = 0; t < ticks; t++) {
      const pressed = t === at;
      if (pressed) held = true;
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: held || pressed, pressed, released: false } as Input,
        FIXED_DT,
      );
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      seen.push({ tick: t, doomed: sc.doomed !== null });
      if (state.ending.active) break;
    }
    return { sc, seen, state };
  };

  it('lights on a press past the cross, and not on one before it', () => {
    // Tick 100 spends 99% of the window on this fixture; tick 120 is past it.
    const inTime = run(100);
    expect(
      inTime.seen.some((s) => s.doomed),
      'a press in time owes no skull',
    ).toBe(false);

    const late = run(120);
    expect(
      late.seen.some((s) => s.doomed),
      'a press past the cross owes one',
    ).toBe(true);
    expect(late.state.ending.reason, 'and the run really does end at the wall').toBe(
      'out-of-bounds',
    );
  });

  it('stays lit from the press until the wall', () => {
    const late = run(120);
    const first = late.seen.findIndex((s) => s.doomed);
    expect(first, 'it lights on the press itself').toBe(120);
    // Every tick from there to the end, with no flicker: it is a countdown, not
    // a status that can be re-evaluated.
    //
    // Except the ending tick itself, where `endLife` clears it — the life is over
    // and the LOST notice is the explanation from there. `drawDoom` refuses to
    // draw during the ending hold for the same reason, so the two agree.
    const after = late.seen.slice(first);
    expect(after.slice(0, -1).every((s) => s.doomed)).toBe(true);
    expect(after[after.length - 1]!.doomed, 'and it hands over at the death').toBe(false);
    // And it is short. Measured over the corpus, a median 0.85s.
    expect(after.length * FIXED_DT).toBeLessThan(3);
  });

  it('is withdrawn if the ship turns away regardless', () => {
    // The prediction is conservative and 6% of these live. When one does, the
    // omen is wrong and is taken back on the same event that pays the rescue.
    const state = createInitialState(DEFAULT_CONFIG);
    Object.assign(state.ship, WALL_DRIFT);
    const sc = createScoreState();
    // Arm it by hand at a wall, then hand the scorer a capture that turns away.
    sc.doomed = { wall: 'right', tick: 0 };
    let held = false;
    for (let t = 0; t < 200; t++) {
      const pressed = t === 20;
      if (pressed) held = true;
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: held || pressed, pressed, released: false } as Input,
        FIXED_DT,
      );
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      if (sc.doomed === null && t > 20) break;
    }
    expect(sc.doomed, 'a ship that turned away owes no skull').toBeNull();
  });

  it('clears with the life, so a fresh ship is never born under it', () => {
    const late = run(120, 600);
    // The run above ended at the wall; drive on through the hold and respawn.
    const state = late.state;
    const sc = late.sc;
    for (let t = 0; t < 200; t++) {
      stepSim(
        state,
        DEFAULT_CONFIG,
        { held: false, pressed: false, released: false } as Input,
        FIXED_DT,
      );
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    }
    expect(sc.doomed).toBeNull();
  });
});

describe('what the ship says about a rescue', () => {
  const WALL_DRIFT = { x: 165.5, y: 150, vx: 150, vy: -60 };
  const run = (at: number) =>
    play(
      [
        [at, 1],
        [at + 200, 0],
      ],
      600,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      WALL_DRIFT,
    );

  it('says nothing in words, and now says nothing in numbers either', () => {
    // A rescue had a praise axis (DOUSED, CLEARED), then a badge for the recovery
    // (SAFE), then a badge for the press that dared it (Nice!). All three were cut
    // on sight: "we already have the point reward from going through flames",
    // "it's too crowded and the anticipation is fun", "the 'nice!' is a bit
    // cluttered". F04 took the fourth and last thing it said — the award — so what
    // confirms a rescue is the cross brightening as the ship closes on it, the
    // fire it is flying through, and the swing that follows being worth about 7x.
    const r = run(60);
    expect(r.awards.some((a) => a.kind === 'link')).toBe(true);
    for (const a of r.awards) expect(praiseFor(a)?.category).not.toBe('burn');
  });

  it('still marks a press that was already too late', () => {
    // The one thing nothing else can say: there is no award for being doomed.
    //
    // Watched tick by tick rather than read off the end, because a run that ends
    // at the wall clears it — `endLife` does, and `drawVerdict` refuses to draw
    // during the ending hold for the same reason. The flag exists between the
    // press and the death, which is the whole of its life.
    const everDoomed = (at: number): boolean => {
      const state = createInitialState(DEFAULT_CONFIG);
      Object.assign(state.ship, WALL_DRIFT);
      const sc = createScoreState();
      let held = false;
      for (let t = 0; t < 400; t++) {
        const pressed = t === at;
        if (pressed) held = true;
        stepSim(
          state,
          DEFAULT_CONFIG,
          { held: held || pressed, pressed, released: false } as Input,
          FIXED_DT,
        );
        scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
        if (sc.doomed) return true;
        if (state.ending.active) break;
      }
      return false;
    };
    expect(everDoomed(120), 'a press past the cross').toBe(true);
    expect(everDoomed(100), 'one that still works').toBe(false);
  });
});

describe('what a link is worth', () => {
  it('pays more for a deeper, better-timed, better-aimed release', () => {
    const links = pilot(4000).awards.filter((a) => a.kind === 'link');
    expect(links.length).toBeGreaterThan(1);
    for (const a of links) {
      expect(a.close).toBeGreaterThanOrEqual(0);
      expect(a.close).toBeLessThanOrEqual(1);
      expect(a.timing).toBeLessThanOrEqual(1);
      expect(a.aim).toBeLessThanOrEqual(1);
      expect(a.points).toBeGreaterThan(0);
    }

    // Same session, one term at a time. THIS USED TO ZERO FOUR WEIGHTS —
    // `closeBonus`, `timingBonus`, `aimBonus`, `climbPerPx` — and three of them
    // no longer exist: a swing is `carry x tier x band x streak`, so there is one
    // SOURCE and everything else is a factor on it. Zeroing a factor is the wrong
    // instrument for a multiplier (a tier of 0 pays nothing at all), so each is
    // flattened to 1 instead, which is the multiplicative version of the same
    // question: does the term change what the session was worth?
    const full = pilot(4000).score.best;
    const without = (over: Partial<ScoreConfig>): number =>
      pilot(4000, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, ...over }).score.best;
    expect(without({ climbPerPx: 0 }), 'the carry is the only source').toBe(0);
    expect(
      without({ tierTrue: 1, tierSharp: 1, tierPerfect: 1 }),
      'the tier prices nothing',
    ).toBeLessThan(full);
    expect(without({ tightMax: 1 }), 'tightness prices nothing').toBeLessThan(full);
    expect(without({ chainStep: 0 }), 'the chain prices nothing').toBeLessThan(full);
    expect(without({ streakStep: 0 }), 'the streak prices nothing').toBeLessThan(full);
  });

  it('pays nothing for a release that never reached a frozen orbit', () => {
    // Pressed and let go 4 ticks later: a dive abandoned before periapsis. It is
    // not a failure, so it costs nothing either — the streak is untouched.
    const { score, awards } = play(
      [
        [240, 1],
        [244, 0],
      ],
      400,
    );
    expect(awards.filter((a) => a.kind === 'link')).toHaveLength(0);
    expect(score.links).toBe(0);
  });

  it('banks the climb between links rather than paying for altitude continuously', () => {
    const links = pilot(4000).awards.filter((a) => a.kind === 'link');
    expect(links[0]!.climb).toBeGreaterThan(0);
    // and nothing is ever banked twice: consecutive links inside one life bank
    // strictly the ground covered since the previous one
    for (const a of links) expect(a.climb).toBeGreaterThanOrEqual(0);
  });
});

describe('the streak multiplier', () => {
  /**
   * The streak's own contribution to a swing, backed out of the product.
   *
   * `ScoreAward.multiplier` is `tier x band x streak` since F04 — the whole
   * receipt, because a popup printing one third of its own arithmetic cannot be
   * checked against anything. So a test about the LADDER has to divide the other
   * two back out, and doing it here once is what stops each assertion below
   * quietly measuring a tier instead.
   */
  const streakOf = (a: ScoreAward): number => a.multiplier / (a.tier * a.band);

  it('rises with consecutive links', () => {
    const links = pilot(4000).awards.filter((a) => a.kind === 'link');
    const first = links[0]!;
    expect(streakOf(first)).toBeCloseTo(1, 6);
    const second = links.find((a) => a.tick > first.tick && streakOf(a) > 1);
    expect(second, 'a second link in the same life never raised the multiplier').toBeDefined();
    expect(streakOf(second!)).toBeCloseTo(1 + DEFAULT_SCORE_CONFIG.streakStep, 6);
  });

  it('never exceeds its ceiling', () => {
    const gen = { ...DEFAULT_SCORE_CONFIG, streakStep: 2 };
    for (const a of pilot(4000, DEFAULT_CONFIG, gen).awards) {
      expect(streakOf(a)).toBeLessThanOrEqual(gen.streakMax + 1e-9);
    }
  });

  it('is lost when a life ends, along with the points', () => {
    const { score, awards } = pilot(4000);
    // the pilot dies at least once over this many ticks
    expect(score.links).toBeGreaterThan(2);

    // A multiplier that came back down to 1 after having been above it is the
    // signature of a life ending.
    const seq = awards
      .filter((a) => a.kind === 'link')
      .map((a) => Math.round(streakOf(a) * 1e6) / 1e6);
    expect(Math.max(...seq)).toBeGreaterThan(1);
    expect(seq.lastIndexOf(1)).toBeGreaterThan(seq.indexOf(1));

    // The score is the current life's, so a session that died has banked strictly
    // less than the sum of everything it was ever paid.
    const paid = awards.reduce((n, a) => n + a.points, 0);
    expect(score.bank).toBeLessThan(paid);
  });

  it('keeps a best, so a death has something to show for what it took', () => {
    const { score, lives } = pilot(4000);
    expect(lives.length, 'the pilot never lost a life with points on the board').toBeGreaterThan(0);
    expect(score.best).toBeGreaterThan(0);
    // The high-water mark across every life that ended and the one still being
    // flown. Asserting `best > score` instead would only hold while the pilot
    // happens not to finish on its best life, which is a fact about the flight
    // path and not about the score.
    expect(score.best).toBe(Math.max(...lives, score.bank));
  });

  it('starts the next life clean rather than judging it on the last one', () => {
    // After a respawn the field is re-flown from the bottom. Without clearing the
    // climb baseline, the next link would bank from a high-water mark the ship is
    // now far below.
    const { awards } = pilot(4000);
    const links = awards.filter((a) => a.kind === 'link');
    const firstOfLife = links.map((a) => Math.round(streakOf(a) * 1e6) / 1e6).lastIndexOf(1);
    expect(firstOfLife).toBeGreaterThan(0);
    expect(links[firstOfLife]!.climb, 'a life after a death banked no climb').toBeGreaterThan(0);
  });
});

describe('grab quality (PORT_NOTES 17)', () => {
  it('now has a consumer: the score reads the release alignment', () => {
    const links = pilot(4000).awards.filter((a) => a.kind === 'link');
    expect(
      links.some((a) => a.aim > 0.5),
      'no release was ever scored as aimed',
    ).toBe(true);
    // Aim is half the tier's conjunction now rather than a bonus of its own, so
    // the way to prove the score reads it is to make the ladder blind to it: at a
    // sharpness of 0 every release scores `aim^0 = 1` on that axis and the tier
    // stops being able to tell a lined-up release from a wild one.
    const blind = pilot(4000, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, aimSharpness: 0 });
    expect(blind.score.best).not.toBe(pilot(4000).score.best);
  });

  it('still does not move the ship — the aim mechanic was never implemented', () => {
    // If this ever fails, someone made aim physical. That is a deliberate act
    // that fails the equality gate, and it should fail here first, by name.
    const edges: Edges = [
      [240, 1],
      [318, 0],
    ];
    const a = play(edges, 900, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG);
    const b = play(edges, 900, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, tierPerfect: 9999 });
    expect(b.fingerprints).toEqual(a.fingerprints);
  });
});

// ---------------------------------------------------------------------- praise
//
// A capture is two scoring events. A GRAB is judged on how the ship arrived —
// settled the instant the button goes down, paid when the dive swings through
// periapsis. A LINK is judged on how it left. Each names itself from its own
// qualities, and neither may speak for the other.

/**
 * The measured distribution the thresholds were cut from: 112 scored releases
 * replayed out of `diagnostics/`. Kept here as a fixture because it is the only
 * record of WHY the numbers are the numbers, and because the synthetic pilot
 * cannot stand in for it — the pilot grabs close and aims well every single time,
 * so it earns a word on every capture and would happily agree with thresholds
 * that praised everything.
 *
 * `timing` was re-measured for `boostHoldsThroughSettle` (PORT_NOTES 27), which
 * moved the envelope under the same player behaviour and lifted the median from
 * 0.21 to 0.71. Its row comes from the 52 links in the three sessions carrying
 * award records rather than from replays, because an award is recorded on the
 * phone and survives a divergence. See the header of `src/score/praise.ts`.
 */
const REAL = {
  clearance: { p10: 48, p25: 59, med: 83, p75: 123 },
  timing: { med: 0.71, p75: 0.85, p90: 0.94 },
  aim: { med: 0.85, p75: 0.94, p90: 0.98 },
} as const;

const link = (over: Partial<ScoreAward> = {}): ScoreAward => ({
  tick: 500,
  kind: 'link',
  points: 240,
  multiplier: 1,
  tier: 1,
  band: 1,
  carry: 240,
  body: 'P3→P4',
  close: 0,
  clearance: Infinity,
  skim: Infinity,
  defl: 3,
  timing: REAL.timing.med,
  aim: REAL.aim.med,
  climb: 400,
  heat: 0,
  turn: 0,
  boostT: 0,
  arrival: 0,
  ...over,
});

describe('what an arrival is worth', () => {
  /**
   * THIS BLOCK USED TO PIN THE GRAB'S WORD AND THE GRAB'S POINTS, AND BOTH ARE
   * GONE. F04 folded `closeBonus`, `nerveBonus` and `flybyCloseBonus` into one
   * multiplier on the carry — they were three flat sums paid at three moments for
   * one quantity, clearance above the minimum orbit — and an award that mints
   * nothing is not an award, so the popup and its vocabulary went with it.
   *
   * The axis did not go. What is pinned here is what replaced it, measured the
   * only way a multiplier inside the carry can be: run the same session with
   * tightness switched off and see what the arrival was worth.
   */
  const carried = (
    edges: Edges,
    ticks: number,
    ship: Ship | undefined,
    scfg: ScoreConfig,
  ): number =>
    play(edges, ticks, DEFAULT_CONFIG, scfg, true, ship)
      .awards.filter((a) => a.kind === 'link' || a.kind === 'flyby')
      .reduce((n, a) => n + a.carry, 0);

  /** How much of a session's carry came from how tightly it arrived. */
  const tightGain = (edges: Edges, ticks: number, ship?: Ship): number => {
    const off = carried(edges, ticks, ship, { ...DEFAULT_SCORE_CONFIG, tightMax: 1 });
    return off === 0 ? 1 : carried(edges, ticks, ship, DEFAULT_SCORE_CONFIG) / off;
  };

  /** The nerve session: bearing straight down on P1 and pressing late. */
  const NERVE = SESSIONS.find((x) => x.name === 'head-on, pressed late')!;
  /** An ordinary grab from the spawn. */
  const ORDINARY: { edges: Edges; ticks: number } = {
    edges: [
      [240, 1],
      [318, 0],
    ],
    ticks: 900,
  };

  it('is never a penalty, however wide the arrival', () => {
    // VISION pillar 5: nothing is taken away, rewards are withheld. The ramp
    // bottoms out at 1 rather than going below it, so a loose grab is paid the
    // plain rate and never less.
    for (const sn of SESSIONS) {
      expect(tightGain(sn.edges, sn.ticks, sn.ship), sn.name).toBeGreaterThanOrEqual(1);
    }
  });

  it('is graded over `closeSpan`, so the same arrival is worth more on a wider one', () => {
    // The span is the axis's only calibration, and the one number the ring's
    // gradient is drawn from. Two fixed arrivals, three spans: the wider the band
    // the tightness is measured over, the more of it the same clearance keeps.
    const at = (span: number): number =>
      carried(ORDINARY.edges, ORDINARY.ticks, undefined, {
        ...DEFAULT_SCORE_CONFIG,
        closeSpan: span,
      });
    expect(at(400)).toBeGreaterThan(at(200));
    expect(at(200)).toBeGreaterThan(at(50));
  });

  it('prices a pass on the same span it prices a grab on', () => {
    // "grabs AND passes alike" — one term, two ways of arriving. Without it the
    // flyby's closeness would have no home at all, which is where
    // `flybyCloseBonus` went.
    //
    // Pressed at 60 rather than at 1, unlike the flyby fixture in `SESSIONS`: the
    // multiplier prices what was carried INTO the arrival, so a pass begun on the
    // first tick has nothing for it to be a multiplier of. That is not a
    // shortcoming of the fixture, it is the rule — see the arrival block below.
    expect(
      tightGain(
        [
          [60, 1],
          [260, 0],
        ],
        500,
        FLYBY_SHIP,
      ),
    ).toBeGreaterThan(1);
  });

  it('multiplies what was carried in, so an arrival on the first tick is worth nothing', () => {
    // The corollary, and it is the property that makes this a multiplier rather
    // than a bonus: a beautiful arrival made before the ship has covered any
    // ground prices zero ground. `0 x anything = 0` is the same arithmetic that
    // closed the tap faucet.
    const fb = SESSIONS.find((x) => x.name === 'straight past, too fast to hold')!;
    expect(tightGain(fb.edges, fb.ticks, fb.ship)).toBe(1);
  });

  it('says no word, because there is no award left to carry one', () => {
    const r = play(
      NERVE.edges,
      NERVE.ticks,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      NERVE.ship,
    );
    for (const a of r.awards) {
      expect(['close', 'nerve', 'burn']).not.toContain(praiseFor(a)?.category);
    }
  });

  describe('the nerve pair, which outlived the award that paid it', () => {
    // Already boring in, and you waited. Both halves are required, and that is
    // the whole point: neither one alone is the move. Nothing pays for it any
    // more — a line headed inside the minimum orbit has no clearance left, so it
    // lands at the top of the tightness ramp by construction — but this is still
    // the only definition of the pair, and the bounds are still measured.
    it('names a late press on a line already headed inside the minimum orbit', () => {
      expect(isNerveGrab(-27, 57)).toBe(true);
    });

    it('is not earned by a late press on a line that was going to miss', () => {
      // 50px off a planet on the way past is the same PLACE as 50px off and
      // boring in, and only the second is nerve.
      expect(isNerveGrab(26, 57)).toBe(false);
    });

    it('is not earned by an early press on a collision line', () => {
      expect(isNerveGrab(-27, CLOSE_PX.tier1 + 1)).toBe(false);
    });

    it('ignores a body that was already behind the ship', () => {
      expect(isNerveGrab(Infinity, 57)).toBe(false);
    });

    it('fires at the threshold and not a hair beyond it', () => {
      expect(isNerveGrab(0, CLOSE_PX.tier1)).toBe(true);
      expect(isNerveGrab(0, CLOSE_PX.tier1 + 1)).toBe(false);
    });
  });
});

describe('the word a release earns', () => {
  it('says nothing about the release the player usually makes', () => {
    expect(praiseFor(link())).toBeNull();
  });

  it('speaks up for a release in the top quarter of either quality', () => {
    expect(praiseFor(link({ timing: REAL.timing.p75 }))?.category).toBe('peak');
    expect(praiseFor(link({ aim: REAL.aim.p75 }))?.category).toBe('aim');
  });

  it('reserves the higher rung for the top tenth', () => {
    expect(praiseFor(link({ timing: REAL.timing.p90 }))?.level).toBe('great');
    expect(praiseFor(link({ aim: REAL.aim.p90 }))?.level).toBe('great');
  });

  it('fires at each threshold and not a hair below', () => {
    expect(praiseFor(link({ aim: AIM.tier1 }))?.category).toBe('aim');
    expect(praiseFor(link({ aim: AIM.tier1 - 0.001 }))).toBeNull();
    expect(praiseFor(link({ timing: PEAK.tier1 }))?.category).toBe('peak');
    expect(praiseFor(link({ timing: PEAK.tier1 - 0.001 }))).toBeNull();
  });

  it('keeps every tier 2 strictly harder than its tier 1', () => {
    expect(AIM.tier2).toBeGreaterThan(AIM.tier1);
    expect(PEAK.tier2).toBeGreaterThan(PEAK.tier1);
    // inverted: fewer pixels of clearance is the harder arrival
    expect(CLOSE_PX.tier2).toBeLessThan(CLOSE_PX.tier1);
  });

  it('names the rarer quality when both fire', () => {
    const both = link({ aim: AIM.tier1, timing: PEAK.tier1 });
    expect(praiseFor(both)?.category).toBe('peak');
  });

  it('saves the superlative for the pair that fights, both at their top tier', () => {
    expect(praiseFor(link({ aim: AIM.tier2, timing: PEAK.tier2 }))?.category).toBe('super');
    expect(praiseFor(link({ aim: AIM.tier1, timing: PEAK.tier1 }))?.category).not.toBe('super');
  });

  it('never names an arrival quality — that event has already been paid', () => {
    expect(praiseFor(link({ clearance: 10, skim: -50 }))).toBeNull();
  });

  it('picks the same word every time, so a replay shows what the player saw', () => {
    const a = link({ aim: AIM.tier2 });
    expect(praiseFor(a)?.word).toBe(praiseFor(a)?.word);
    const words = new Set<string>();
    for (let t = 0; t < 200; t++) words.add(praiseFor(link({ tick: t, aim: AIM.tier2 }))!.word);
    expect(words.size, 'the word never varies').toBeGreaterThan(1);
  });

  it('draws on every word in a list rather than favouring one', () => {
    // A clumping picker is the failure this guards: seeded straight off the tick,
    // one word took 14 of 19 slots across the recorded sessions.
    for (const [category, make] of [
      ['aim', (t: number) => link({ tick: t, aim: AIM.tier2 })],
      ['peak', (t: number) => link({ tick: t, timing: PEAK.tier2 })],
    ] as const) {
      const seen = new Set<string>();
      for (let t = 0; t < 400; t++) {
        const p = praiseFor(make(t));
        if (p?.category === category) seen.add(p.word);
      }
      expect(seen.size, `${category} tier 2 never used its whole list`).toBe(
        WORDS[category][1]!.length,
      );
    }
  });

  it('never uses one word for two different qualities', () => {
    /**
     * This is what lets the word stand alone.
     *
     * There used to be a dim `CLOSE ·` / `BOOST ·` prefix naming the axis. It was
     * dropped because a vocabulary that needs a caption has not been chosen
     * carefully enough — which only holds while each word belongs to exactly one
     * family. A word appearing in two makes it ambiguous again, silently, with
     * nothing left to disambiguate it.
     */
    const owner = new Map<string, string>();
    for (const [category, tiers] of Object.entries(WORDS)) {
      for (const w of new Set(tiers.flat())) {
        const held = owner.get(w);
        expect(held, `"${w}" is used by both ${held} and ${category}`).toBeUndefined();
        owner.set(w, category);
      }
    }
  });

  it('gives the two qualities that can fire together the most distant vocabularies', () => {
    // `aim` and `peak` are the pair that can land on the same release, so they
    // are the two that must never blur. Marksmanship against launch.
    const aim = new Set(WORDS.aim.flat());
    const peak = new Set(WORDS.peak.flat());
    for (const w of aim) expect(peak.has(w), `"${w}" is in both`).toBe(false);
    expect(aim.size).toBeGreaterThan(3);
    expect(peak.size).toBeGreaterThan(3);
  });

  it('keeps every word a single word', () => {
    // They are read in peripheral vision beside a moving ship. Two words is a
    // sentence, and a sentence is something you stop to read. The reckless SHOUT
    // is the deliberate exception and lives in its own module.
    for (const [category, tiers] of Object.entries(WORDS)) {
      for (const list of tiers) {
        expect(list.length, `${category} has an empty list`).toBeGreaterThan(0);
        for (const w of list) {
          expect(w, `"${w}" is not one word`).not.toContain(' ');
          expect(w).toBe(w.toUpperCase());
        }
      }
    }
  });
});

// --------------------------------------------------------------------- shouts

/**
 * The reckless shout is driven straight through `scoreTick` with hand-set capture
 * values rather than through a flown scenario.
 *
 * Three consecutive captures rough enough to qualify is roughly a one-in-a-hundred
 * accident — that rarity is the feature — so scripting one out of the simulation
 * would mean tuning a fixture until it produced the answer. Everything under test
 * here is the scorer's own bookkeeping, and this drives exactly that.
 */
describe('the reckless shout', () => {
  const cfg = DEFAULT_CONFIG;

  function harness() {
    const state = createInitialState(cfg);
    const sc = createScoreState();
    const shouts: Shout[] = [];
    let tick = 0;

    /** One tick of a settled capture, deflected by `defl`. */
    const capAt = (defl: number): NonNullable<SimState['capture']> =>
      ({
        phase: 'orbit',
        planet: 0,
        rx: 80,
        ry: 0,
        vx: 0,
        vy: 200,
        grabR: 120,
        minR: 58,
        prevR: 80,
        prevDR: 0,
        passedPeri: true,
        periR: 80,
        apoR: 120,
        clearFramesLeft: 0,
        clearDvx: 0,
        clearDvy: 0,
        whipE: undefined,
        orbit: { a: 80, e: 0, argp: 0, dir: 1 },
        theta: 0,
        phaseSpeed: 1,
        phaseSpeedReal: 1,
        phaseMul: 1,
        Lfrozen: undefined,
        rPeri: 80,
        settleT: 1.2,
        settleProgress: 1,
        tightness: 1,
        boostFull: 0,
        boost: 0,
        boostT: 0,
        puttered: false,
        lastAngle: 0,
        defl,
      }) as NonNullable<SimState['capture']>;

    /** Fly one capture through `deflections`, a tick each, then release it. */
    const fly = (deflections: readonly number[]): void => {
      for (const d of deflections) {
        state.capture = capAt(d);
        state.tick = tick++;
        shouts.push(...scoreTick(sc, state, cfg, FIXED_DT).shouts);
      }
      state.capture = null;
      state.tick = tick++;
      shouts.push(...scoreTick(sc, state, cfg, FIXED_DT).shouts);
    };

    /**
     * Fly one capture whose worst deflection is `defl`, then release it.
     * `roughTicks` holds it over the line for that many consecutive ticks.
     */
    const capture = (defl: number, roughTicks = 1): void => {
      // the rough passage starts on the second tick and lasts `roughTicks`
      fly([0, 1, 2, 3].map((i) => (i >= 1 && i < 1 + roughTicks ? defl : 0)));
    };

    /** One capture that crosses `first` and then, a few ticks later, `then`. */
    const ramp = (first: number, then: number): void => {
      fly([0, first, first, 0, then, then]);
    };

    /**
     * End the life. `speed` is the drift speed carried into it, which is what a
     * bonk is judged on — the ship's own velocity is zeroed by a fatal contact
     * before the scorer ever sees it.
     */
    const die = (reason: SimState['ending']['reason'] = 'fell-behind', speed = 0): void => {
      state.capture = null;
      state.ship.vx = speed;
      state.ship.vy = 0;
      state.tick = tick++;
      scoreTick(sc, state, cfg, FIXED_DT); // a drift tick, so `lastDrift` carries the speed
      state.ending.active = true;
      state.ending.reason = reason;
      state.tick = tick++;
      shouts.push(...scoreTick(sc, state, cfg, FIXED_DT).shouts);
      state.ending.active = false;
    };

    return { sc, shouts, capture, ramp, die };
  }

  const ROUGH = RECKLESS_DEG + 5;
  const SMOOTH = RECKLESS_DEG - 5;

  it('says nothing until the run is deep enough', () => {
    const h = harness();
    for (let i = 0; i < RECKLESS_STREAK - 1; i++) h.capture(ROUGH);
    expect(h.shouts).toHaveLength(0);
    expect(h.sc.recklessStreak).toBe(RECKLESS_STREAK - 1);

    h.capture(ROUGH);
    expect(h.shouts.length).toBeGreaterThan(0);
    expect(h.shouts[0]!.streak).toBe(RECKLESS_STREAK);
  });

  it('keeps shouting while the run continues', () => {
    const h = harness();
    for (let i = 0; i < RECKLESS_STREAK + 2; i++) h.capture(ROUGH);
    expect(h.shouts.length).toBe(3);
    expect(h.shouts.map((s) => s.streak)).toEqual([3, 4, 5]);
  });

  it('shouts once per rough passage, not once per tick', () => {
    // Held over the line for three consecutive ticks. A per-tick implementation
    // would shout three times here; the rising-edge one shouts once.
    const h = harness();
    for (let i = 0; i < RECKLESS_STREAK; i++) h.capture(ROUGH, 3);
    expect(h.shouts).toHaveLength(1);
  });

  it('is broken by a capture flown cleanly', () => {
    const h = harness();
    for (let i = 0; i < RECKLESS_STREAK - 1; i++) h.capture(ROUGH);
    h.capture(SMOOTH);
    expect(h.sc.recklessStreak).toBe(0);
    h.capture(ROUGH);
    h.capture(ROUGH);
    expect(h.shouts).toHaveLength(0);
  });

  it('is broken by dying', () => {
    const h = harness();
    for (let i = 0; i < RECKLESS_STREAK - 1; i++) h.capture(ROUGH);
    h.die();
    expect(h.sc.recklessStreak).toBe(0);
    h.capture(ROUGH);
    expect(h.shouts).toHaveLength(0);
  });

  it('pays nothing — it is a separate channel from the score', () => {
    const h = harness();
    const before = h.sc.bank;
    for (let i = 0; i < RECKLESS_STREAK + 1; i++) h.capture(ROUGH);
    expect(h.shouts.length).toBeGreaterThan(0);
    // the captures themselves earn links; what must not move is the shout's own
    // contribution, so compare against the same run with no shouts at all
    const quiet = harness();
    for (let i = 0; i < RECKLESS_STREAK + 1; i++) quiet.capture(SMOOTH);
    expect(quiet.shouts).toHaveLength(0);
    expect(h.sc.bank - before).toBe(quiet.sc.bank - before);
  });

  it('picks a word deterministically, so a replay shows what was said', () => {
    expect(shoutWord(1234)).toBe(shoutWord(1234));
    const seen = new Set<string>();
    for (let t = 0; t < 400; t++) seen.add(shoutWord(t));
    expect(seen.size, 'the shout never varies').toBe(SHOUTS.length);
  });

  describe('one violent capture, with no history behind it', () => {
    const HARD = RECKLESS_HARD_DEG + 5;

    it('shouts on its own, without waiting for a streak', () => {
      const h = harness();
      h.capture(HARD);
      expect(h.shouts, 'a capture thrown past the hard line said nothing').toHaveLength(1);
      expect(h.shouts[0]!.kind).toBe('reckless');
      expect(h.shouts[0]!.streak).toBe(1);
    });

    it('is seen even when the capture ramps into it', () => {
      // The rough line is crossed first and the violent one a few ticks later.
      // A single shared edge would see 32 degrees, mark the capture as counted,
      // and never look again — missing the 65 that followed, which is how a
      // capture actually gets thrown around.
      const h = harness();
      h.ramp(ROUGH, HARD);
      expect(h.shouts, 'the violent passage went unremarked').toHaveLength(1);
      expect(h.shouts[0]!.kind).toBe('reckless');
      // one capture, so the streak is 1 — the shout came from the hard line
      expect(h.shouts[0]!.streak).toBe(1);
    });

    it('still only shouts once when both gates open at the same time', () => {
      const h = harness();
      for (let i = 0; i < RECKLESS_STREAK - 1; i++) h.capture(ROUGH);
      h.capture(HARD);
      expect(h.shouts, 'the streak and the hard line each pushed a shout').toHaveLength(1);
    });

    it('leaves a smooth capture alone', () => {
      const h = harness();
      h.capture(RECKLESS_HARD_DEG - 1);
      expect(h.shouts).toHaveLength(0);
    });
  });

  describe('the bonk', () => {
    it('fires when the ship arrives fast', () => {
      const h = harness();
      h.die('impact', BONK_SPEED + 50);
      expect(h.shouts).toHaveLength(1);
      expect(h.shouts[0]!.kind).toBe('bonk');
      expect(BONKS).toContain(h.shouts[0]!.word);
      // it is an impact, not an achievement: no streak rides along with it
      expect(h.shouts[0]!.streak).toBe(0);
    });

    it('says nothing about a slow drift into a surface', () => {
      const h = harness();
      h.die('impact', BONK_SPEED - 50);
      expect(h.shouts).toHaveLength(0);
    });

    it('is about hitting something, not about the run ending', () => {
      // Falling behind and leaving the field end a life just as hard and are not
      // collisions. Nothing was hit, so there is nothing to shout about.
      for (const reason of ['fell-behind', 'out-of-bounds'] as const) {
        const h = harness();
        h.die(reason, BONK_SPEED + 200);
        expect(h.shouts, `${reason} bonked`).toHaveLength(0);
      }
    });

    it('picks its word deterministically too', () => {
      expect(bonkWord(99)).toBe(bonkWord(99));
      const seen = new Set<string>();
      for (let t = 0; t < 400; t++) seen.add(bonkWord(t));
      expect(seen.size).toBe(BONKS.length);
    });
  });
});

// -------------------------------------------------------------- the flyby award

describe('a flyby that stays a flyby', () => {
  /** The fixture pass, released at `releaseAt`. */
  function pass(releaseAt = 200, ticks = 400) {
    return play(
      [
        [1, 1],
        [releaseAt, 0],
      ],
      ticks,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      FLYBY_SHIP,
    );
  }

  it('pays for a pass held through its closest approach', () => {
    const { awards, score } = pass();
    const f = awards.filter((a) => a.kind === 'flyby');
    expect(f, 'the fixture no longer reaches a flyby — see FLYBY_BODY').toHaveLength(1);
    expect(f[0]!.points).toBeGreaterThan(0);
    expect(score.flybys).toBe(1);
    // A pass is not a capture and not a release: neither of the other two events
    // may fire for it, or one press would be paid twice.
    expect(awards.filter((a) => a.kind !== 'flyby')).toHaveLength(0);
  });

  it('is owed at the bottom and paid at the release', () => {
    // The distinguishing property, and the reason it is not simply paid at the
    // closest approach like a grab: see `PendingFlyby`. Moving the release moves
    // the award and changes nothing about what it is worth.
    //
    // THE PIN CHANGED SHAPE AT F04 AND THE PROPERTY DID NOT. It used to assert
    // that the value was identical whatever tick the pass was let go on, because
    // the award was read entirely off the closest approach. Under the
    // constitution a swing cashes the ground it covered, so holding on longer is
    // worth more — that is the economy working, not the award drifting.
    //
    // What still has to be true is that the QUALITIES are settled at the bottom
    // and never re-read: one award, landing at the release, describing the same
    // pass however long it is held.
    let close: number | null = null;
    let last = 0;
    for (const rel of [120, 200, 320]) {
      const f = pass(rel, 600).awards.filter((a) => a.kind === 'flyby');
      expect(f, `released at ${rel}`).toHaveLength(1);
      expect(f[0]!.tick, `released at ${rel}`).toBe(rel + 1);
      close ??= f[0]!.clearance;
      expect(f[0]!.clearance, `released at ${rel}`).toBe(close);
      expect(f[0]!.points, `released at ${rel}`).toBeGreaterThan(last);
      last = f[0]!.points;
    }
  });

  it('steps the streak, so speed can climb the ladder at all', () => {
    // The larger half of what this award does. Before it the ladder counted
    // links, so it could only be climbed by stopping at bodies — and a life
    // covering 3.1x the ground per second was stuck at x2 while a chained one ran
    // at x5-x7.
    const { score } = pass();
    expect(score.streak).toBe(1);
    expect(score.multiplier).toBeCloseTo(1 + DEFAULT_SCORE_CONFIG.streakStep, 6);
  });

  it('pays nothing for a press let go of before the pass got anywhere', () => {
    // The same rule the grab award keeps by paying at periapsis: a tap that never
    // reaches the bottom of anything is worth nothing, or pressing beside a body
    // is a faucet.
    const { awards } = pass(4, 400);
    expect(awards).toHaveLength(0);
  });

  /** The fixture pass, pressed at `start` and let go `len` ticks later. */
  function tap(start: number, len: number) {
    return play(
      [
        [start, 1],
        [start + len, 0],
      ],
      400,
      DEFAULT_CONFIG,
      DEFAULT_SCORE_CONFIG,
      true,
      FLYBY_SHIP,
    );
  }

  it('refuses a tap flicked across the closest approach, however well timed', () => {
    // THE REPORTED EXPLOIT, and the reason `FLYBY_TURN_MIN` exists. The award is
    // owed at the bottom of a pass, so a press that merely brackets that instant
    // used to collect the whole thing — `close` is read off geometry the ship
    // already had, and every unconverted flyby clears `FLYBY_SPEED_MIN` by
    // definition. Flying past at speed and tapping beside each planet paid 1000+
    // a time and, worse, stepped the ladder every time.
    //
    // Swept over every press tick rather than at one chosen instant, because the
    // claim is about the whole family: there is no timing that makes a flick pay.
    for (const len of [4, 8]) {
      for (let start = 1; start < 80; start++) {
        const { awards, score } = tap(start, len);
        expect(
          awards.filter((a) => a.kind === 'flyby'),
          `a ${len}-tick tap pressed at ${start} was paid`,
        ).toHaveLength(0);
        expect(score.streak, `a ${len}-tick tap pressed at ${start} stepped the ladder`).toBe(0);
      }
    }
  });

  it('pays in proportion to how far the pass swung the ship', () => {
    // The half a floor cannot do. What was wrong was not only the flick — it was
    // that a pass which barely bent the ship collected the same award as one
    // flown right around the planet, and then multiplied it by a ladder built out
    // of more of the same.
    //
    // One line past one body, held for longer and longer, so the geometry and the
    // closeness are identical and the swing is the only thing that varies.
    const held = [40, 60, 200].map((len) => {
      const f = tap(1, len).awards.filter((a) => a.kind === 'flyby');
      expect(f, `held ${len} ticks`).toHaveLength(1);
      return f[0]!;
    });
    for (const a of held) expect(a.close).toBeCloseTo(held[0]!.close, 6);

    expect(held[0]!.turn).toBeLessThan(held[1]!.turn);
    expect(held[1]!.turn).toBeLessThan(held[2]!.turn);
    expect(held[0]!.points).toBeLessThan(held[1]!.points);
    expect(held[1]!.points).toBeLessThan(held[2]!.points);

    // THE TURN IS THE PASS'S TIER, which is where `flybyTurnSpan` went. A pass
    // has no frozen orbit, so it has neither a compass marker nor a boost
    // envelope to be graded on; what it has is the one quality that says what the
    // pass DID to the ship. Grading it on the same three rungs a release gets is
    // what keeps one ladder in the game instead of two.
    //
    // THIS PIN USED TO SAY THE LONGEST HOLD TOPS THE LADDER OUT, and it did while
    // `flybyTurnSpan` was 60. It is 81 now, re-measured off the 42 passes a phone
    // actually recorded under the award — 60 had ended up below the median real
    // pass — and this fixture's geometry caps at 68.4 degrees however long the
    // button is held, so it lands on SHARP. That is the assertion's new truth and
    // it is a better one: the pass is still graded, still monotone in the turn,
    // and no longer automatically the best pass in the game for having happened.
    expect(held[2]!.turn).toBeLessThan(DEFAULT_SCORE_CONFIG.flybyTurnSpan);
    expect(held[2]!.tier).toBe(DEFAULT_SCORE_CONFIG.tierSharp);
    // ...and the shortest swings a fraction of it and cannot.
    expect(held[0]!.tier).toBeLessThan(held[2]!.tier);
  });

  it('pays nothing once the pass has puttered out below the floor', () => {
    // `FLYBY_SPEED_MIN` is a floor under a dead tail, not a bar that selects fast
    // passes — every unconverted flyby is fast, so the bar could not select one.
    // What it excludes is the flyby that has stopped going anywhere.
    //
    // The pair below is one line past one body at two speeds, which is the only
    // honest way to test a floor: everything except the speed at the bottom is
    // held constant, so nothing else can be what separated them. Far out past a
    // small body, escape speed is low enough that 140px/s is still unbound — the
    // one corner where a flyby CAN bottom out slowly. It bottoms out at 139 and
    // pays nothing; the same pass at 160px/s bottoms out at 158 and pays.
    //
    // Neither earns any closeness: 400px to the side is far outside `closeSpan`,
    // which is the point — the floor is not a closeness test. So the control's
    // carry is priced by its turn alone. See `FLYBY_TURN_MIN`.
    const paid = (speed: number): ScoreAward[] =>
      play(
        [
          [1, 1],
          // The award is paid at the release, so the pass has to be let go of.
          [400, 0],
        ],
        600,
        DEFAULT_CONFIG,
        DEFAULT_SCORE_CONFIG,
        true,
        {
          x: FAR_BODY.x - 400,
          y: FAR_BODY.y + 540,
          vx: 0,
          vy: -speed,
        },
      ).awards.filter((a) => a.kind === 'flyby');
    expect(paid(140), 'a flyby below the floor was paid').toHaveLength(0);
    const fast = paid(160);
    expect(fast, 'the control pass stopped reaching a flyby — see FAR_BODY').toHaveLength(1);
    const a = fast[0]!;
    expect(a.close, 'the control pass drifted inside closeSpan').toBe(0);
    expect(a.turn).toBeGreaterThan(FLYBY_TURN_MIN);
    expect(a.points).toBe(Math.round(a.carry * a.multiplier));
  });

  it('cashes once when the pass converts, and prices the arrival once', () => {
    // One press, one cash. A flyby can bottom out unbound, arc back on the brake
    // and become a capture, and cashing at the bottom would settle that press
    // twice and step the ladder twice — for an overshoot. Braking eight times as
    // hard makes the fixture convert, and the flyby it was owed is dropped.
    //
    // THE ARRIVAL IS THE OTHER HALF, and F04 added it: both a pass's closest
    // approach and a dive's periapsis multiply the carry, so a press that was
    // both would tighten it twice. They are mutually exclusive by construction —
    // conversion needs bound AND inbound, so it always happens before the radius
    // bottoms out, and the flyby branch never sees that bottom. `grabs` counts
    // arrivals, so counting them is how that argument gets checked rather than
    // asserted.
    const slow = { ...DEFAULT_CONFIG, flybyBrake: DEFAULT_CONFIG.flybyBrake * 8 };
    const { awards, score } = play(
      [
        [1, 1],
        [200, 0],
      ],
      400,
      slow,
      DEFAULT_SCORE_CONFIG,
      true,
      FLYBY_SHIP,
    );
    expect(awards.filter((a) => a.kind === 'flyby')).toHaveLength(0);
    expect(
      awards.filter((a) => a.kind === 'link'),
      'the converted pass never cashed',
    ).toHaveLength(1);
    expect(score.grabs, 'one press priced the arrival twice').toBe(1);
  });
});

// ------------------------------------------------------ when an arrival scores

describe('the arrival prices the carry at periapsis, not at the press', () => {
  /**
   * Every tick of a session, with the two things this block is about.
   *
   * `grabs` steps on the arrival and nowhere else, so its rising edge IS the
   * moment the multiplier landed — there is no award left to read it off.
   */
  function trace(edges: Edges, ticks: number) {
    const cfg = DEFAULT_CONFIG;
    const st = createInitialState(cfg);
    const sc = createScoreState();
    const map = new Map(edges);
    const arrivals: Array<{ tick: number; before: number; after: number }> = [];
    let held = false;
    let peri = -1;
    let prevGrabs = 0;
    let prevCarry = 0;
    for (let t = 0; t < ticks; t++) {
      const e = map.get(t);
      const pressed = e === 1;
      const released = e === 0;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(st, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
      scoreTick(sc, st, cfg, FIXED_DT);
      if (peri < 0 && st.capture?.passedPeri) peri = t;
      if (sc.grabs > prevGrabs) arrivals.push({ tick: t, before: prevCarry, after: sc.carry });
      prevGrabs = sc.grabs;
      prevCarry = sc.carry;
    }
    return { sc, arrivals, peri };
  }

  it('prices nothing for a tap that never reaches the bottom', () => {
    // The rule that survived its own reason. It used to be justified as a faucet:
    // beside a planet you are already close to the surface, so paying at the press
    // would make every tap a tight grab. Under a pure multiplier a tap in place
    // has climbed zero metres, so `0 x anything = 0` and the faucet is
    // structurally impossible — the rule now stands on the receipt instead, two
    // acts graded at two moments.
    expect(
      trace(
        [
          [240, 1],
          [244, 0],
        ],
        400,
      ).arrivals,
    ).toHaveLength(0);
  });

  it('lands ON periapsis — the moment the swing actually happened', () => {
    // The two-tick delay this used to carry went with the popup it existed for.
    // A multiplier has to land when the act did, or the carry the player is
    // watching moves two ticks after the thing that moved it.
    const r = trace(
      [
        [240, 1],
        [400, 0],
      ],
      700,
    );
    expect(r.peri, 'the capture never reached periapsis').toBeGreaterThan(240);
    expect(r.arrivals, 'no arrival was priced').toHaveLength(1);
    expect(r.arrivals[0]!.tick).toBe(r.peri);
  });

  it('multiplies what was carried into it, rather than adding to it', () => {
    const r = trace(
      [
        [240, 1],
        [400, 0],
      ],
      700,
    );
    const a = r.arrivals[0]!;
    expect(a.before, 'the ship climbed on the way in').toBeGreaterThan(0);
    expect(a.after / a.before, 'the arrival was tight enough to pay').toBeGreaterThan(1);
    expect(a.after / a.before, 'and never more than the ramp allows').toBeLessThanOrEqual(
      DEFAULT_SCORE_CONFIG.tightMax + 1e-9,
    );
  });

  it('still prices when the hold continues into a full orbit', () => {
    // Periapsis is behind you by then, so holding on must not forfeit it.
    expect(
      trace(
        [
          [240, 1],
          [600, 0],
        ],
        900,
      ).arrivals,
    ).toHaveLength(1);
  });

  it('prices exactly once however long the capture runs', () => {
    expect(
      trace(
        [
          [240, 1],
          [700, 0],
        ],
        1000,
      ).arrivals,
    ).toHaveLength(1);
  });

  it('cannot be farmed by tapping in place', () => {
    // Eight quick taps beside a planet. Each one starts a capture and abandons it
    // long before the bottom — and even if one reached it, a tap has climbed
    // nothing, so there is nothing for the multiplier to be a multiplier of.
    const edges: Edges = [];
    for (let i = 0; i < 8; i++) edges.push([240 + i * 12, 1], [244 + i * 12, 0]);
    const { score } = play(edges, 600);
    expect(score.bank).toBe(0);
  });

  it("is the FIRST of the capture's two scoring events, and the release is the second", () => {
    const r = trace(
      [
        [240, 1],
        [400, 0],
      ],
      700,
    );
    const { awards } = play(
      [
        [240, 1],
        [400, 0],
      ],
      700,
    );
    const l = awards.find((a) => a.kind === 'link')!;
    expect(r.arrivals[0]!.tick, 'the arrival priced after the release').toBeLessThan(l.tick);
    // The release carries no arrival quality: it has already been spent pricing
    // the carry this cashes, and reporting it here would let something downstream
    // read it twice.
    expect(l.close).toBe(0);
    expect(l.clearance).toBe(Infinity);
  });
});

// ------------------------------------------------------------------------ burn

/**
 * The burn's guarantees.
 *
 * The mechanic is three conditions at once — inside the red band at the field's
 * edge, captured, and not sheltered by an anomaly bubble — and each is here
 * because dropping it breaks the fantasy in a specific way. Drifting through the
 * band is not "barely hanging on", it is just dying; and inside a bubble the wall
 * is switched off, so there is nothing to hang on against.
 */
describe('what the debrief is told about the ending', () => {
  it('names the wall a run was lost to, and how long it had been adrift', () => {
    // Sealed on the ending tick beside `lastRun`, and for the same reason:
    // `endLife` runs on the FIRST tick of the hold, so anything read afterwards
    // off live state is describing a run that has already been reset.
    // Short enough to still be inside the ending hold: the run is over at tick
    // 35 and a respawn would put `ending.active` back to false, which is the
    // trap `lastEnding` exists to be immune to.
    const s = play([], 60, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true, {
      x: 60,
      y: 300,
      vx: -400,
      vy: 0,
    } as Ship);
    expect(s.state.ending.active, 'the fixture is meant to leave the field').toBe(true);
    expect(s.state.ending.reason).toBe('out-of-bounds');
    expect(s.score.lastEnding, 'the debrief is told something').not.toBeNull();
    expect(s.score.lastEnding!.wall, 'and told which boundary').toBe('left');
    expect(s.score.lastEnding!.driftSecs, 'and how long the drift ran').toBeGreaterThan(0);

    // The drift is counted, not guessed: the ship never captured, so it had been
    // adrift for the whole life.
    expect(s.score.lastEnding!.driftSecs).toBeCloseTo(s.score.lastRun!.ticks * FIXED_DT, 1);
  });

  it('tells the debrief nothing when the ending was not a boundary', () => {
    // An impact and a fall behind the floor each have their own cue. A line about
    // a wall would be answering a question nobody asked — which is why `wallAt`
    // returns null for the floor rather than naming it, and why this reads the
    // ending REASON rather than only the position.
    const hit = play([], 60, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true, {
      x: 195,
      y: 200,
      vx: 0,
      vy: -300,
    } as Ship);
    expect(hit.state.ending.reason, 'the fixture is meant to hit a planet').toBe('impact');
    expect(hit.score.lastEnding, 'an impact is not a wall').toBeNull();

    const fell = play([], 30, DEFAULT_CONFIG, DEFAULT_SCORE_CONFIG, true, {
      x: 195,
      y: 1400,
      vx: 0,
      vy: 400,
    } as Ship);
    expect(fell.state.ending.reason, 'and this one to fall behind the floor').toBe('fell-behind');
    expect(fell.score.lastEnding, 'the floor is not a wall either').toBeNull();
  });
});

describe('the burn', () => {
  const bodies = createBodies(DEFAULT_CONFIG);
  const field = fieldBounds(DEFAULT_CONFIG, bodies);

  /** Read the heat for a ship parked at a world x, captured or not. */
  const heatAt = (x: number, captured: boolean): number =>
    edgeHeat(x, 0, field, bodies, captured, DEFAULT_SCORE_CONFIG);

  it('burns hotter the deeper into the dead zone the ship is', () => {
    const span = DEFAULT_SCORE_CONFIG.burnEdgeSpan;
    expect(heatAt(field.left, true)).toBeCloseTo(1, 5);
    expect(heatAt(field.left + span / 2, true)).toBeCloseTo(0.5, 5);
    expect(heatAt(field.left + span, true)).toBeCloseTo(0, 5);
    // Both walls, not just the one the arithmetic was written against.
    expect(heatAt(field.right, true)).toBeCloseTo(1, 5);
  });

  it('lights the moment the ship crosses into the red band', () => {
    // "From the second they enter the dangerous red zone." At the old threshold of
    // 0.10 the fire kindled 54px out, and 7% of band entries grazed the outer strip
    // and left without ever lighting — the player visibly in the red with nothing
    // happening, which is the whole thing that was being complained about.
    const span = DEFAULT_SCORE_CONFIG.burnEdgeSpan;
    expect(heatAt(field.left + span - 1, true)).toBeGreaterThan(BURN_MIN_HEAT);
    // And nothing at all a pixel outside it.
    expect(heatAt(field.left + span + 1, true)).toBe(0);
  });

  it('does not burn in mid-field, however the ship got there', () => {
    expect(heatAt((field.left + field.right) / 2, true)).toBe(0);
  });

  it('does not burn while drifting, even at the lethal line', () => {
    // 11018 ticks of the corpus are exactly this. A ship drifting through the
    // band is not hanging on to anything — it is about to die, and that is not
    // the thing being dramatised.
    expect(heatAt(field.left, false)).toBe(0);
    expect(heatAt(field.left, true)).toBeGreaterThan(0);
  });

  it('does not burn inside an anomaly bubble, where the wall is switched off', () => {
    // The bubble SUSPENDS the side boundary — that is the entire anomaly
    // mechanic. Burning there would promise a danger the simulation has
    // explicitly turned off.
    const a = bodies.find((b) => b.kind === 'anomaly');
    expect(a, 'the default field should contain an anomaly').toBeDefined();
    const anomaly = a!;
    const wall = anomaly.x < (field.left + field.right) / 2 ? field.left : field.right;
    expect(sheltered(wall, anomaly.y, bodies)).toBe(true);
    expect(edgeHeat(wall, anomaly.y, field, bodies, true, DEFAULT_SCORE_CONFIG)).toBe(0);
  });

  it('banks a band for a drag that is pulled out of, and nothing for one that hits the wall', () => {
    // The shape of the whole mechanic, and F04 sharpened it rather than changing
    // it: the fire is free drama on the way out and a MULTIPLIER only if the ship
    // survives to cash a swing. `endLife` drops the bank, so a death cannot cash
    // — which matters, because 78% of real edge-drags end in one.
    //
    // What changed is that the flare going out no longer settles anything. It
    // used to pay at that moment, which meant a swing that burned early and let
    // go late collected its fire twice over as two separate awards; now the
    // integral survives the fire and is spent once, by the release.
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);

    /** Hold the ship in the band for `ticks`, then either let go or die. */
    const drag = (sc: ScoreState, ticks: number, kill: boolean): number => {
      // Positioned through the capture's body-relative offset, NOT `state.ship`:
      // during a capture the scorer reads `shipWorldPos`, and `state.ship` is
      // stale. Writing the wrong one here silently measured zero heat.
      const anchor = state.bodies[0]!;
      for (let i = 0; i < ticks; i++) {
        state.tick++;
        state.capture = fakeCapture();
        state.capture.rx = f.left + 10 - anchor.x;
        state.capture.ry = -anchor.y;
        scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      }
      const held = sc.burnBank;
      state.tick++;
      if (kill) state.ending.active = true;
      else state.capture = null;
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      return held;
    };

    const survived = createScoreState();
    const held = drag(survived, 30, false);
    expect(held, 'the drag banked no heat at all').toBeGreaterThan(0);
    expect(survived.burnBank, 'letting go must not spend the band — the release does').toBe(held);

    state.ending.active = false;
    state.capture = null;
    const dying = createScoreState();
    expect(drag(dying, 30, true)).toBeGreaterThan(0);
    expect(dying.burnBank, 'a death drops the band it had earned').toBe(0);
  });

  it('selects a deeper band the longer and deeper the drag runs', () => {
    // The band is the integral, not the instant: `bandTwoAt` and `bandThreeAt` are
    // in heat-SECONDS, so a graze that never stays cannot buy what a drag can. It
    // is the reason no fixed x on the hazard gradient can be either threshold —
    // see `drawHazardZones`.
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const anchor = state.bodies[0]!;
    const bandAfter = (ticks: number, inset: number): number => {
      const sc = createScoreState();
      for (let i = 0; i < ticks; i++) {
        state.tick++;
        state.capture = fakeCapture();
        state.capture.rx = f.left + inset - anchor.x;
        state.capture.ry = -anchor.y;
        scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      }
      return sc.band;
    };
    expect(bandAfter(4, 10)).toBe(1);
    expect(bandAfter(200, 10)).toBeGreaterThan(1);
    expect(bandAfter(200, 10), 'a deep drag outruns a shallow one').toBeGreaterThanOrEqual(
      bandAfter(200, 50),
    );
    state.capture = null;
  });

  it('matches the red band the player can actually see', () => {
    // THREE modules, one number, and nothing but a test can hold them together:
    // `src/score/` may not import `src/render/`, and `src/sim/` may import
    // neither. The flame is meant to track the hazard gradient, so a fire peaking
    // somewhere other than where the red does would teach a line that is not the
    // line — and the simulation pays an escape for leaving the same band, so a
    // third value drifting would pay for escaping a fire that started elsewhere.
    expect(DEFAULT_SCORE_CONFIG.burnEdgeSpan).toBe(DEFAULT_RENDER_CONFIG.hazardZoneWidth);
    // The same discipline one span later. `SimConfig.arrivalTightSpan` grades the
    // flyby conversion refund off `grabR - minR`, which is the quantity this file
    // grades as `close` — so two spans would let the fuel call an arrival tight
    // while the score called it loose. The sim owns its own copy because
    // `src/sim/` may not import from `src/score/`; this is what stops it being a
    // second opinion.
    expect(DEFAULT_CONFIG.arrivalTightSpan).toBe(DEFAULT_SCORE_CONFIG.closeSpan);
    expect(DEFAULT_SCORE_CONFIG.burnEdgeSpan).toBe(DEFAULT_CONFIG.escapeBandWidth);
    // The prototype has no burn, but it still has to agree with itself: the band
    // is inert there only because `escapeFling` is 0, not because it is different.
    expect(PROTOTYPE_CONFIG.escapeBandWidth).toBe(DEFAULT_CONFIG.escapeBandWidth);
  });

  it('keeps the reentry model working even though nothing is wired to it', () => {
    // Retained for a future atmosphere effect, and kept exercised so it cannot
    // rot. The property under test is the one that makes it worth having: a
    // parked orbit is slow, so depth alone must not light it.
    //
    // The bound is a closed form, not a sample — sqrt(GM/minR) around the
    // smallest body the generator makes. A recording once suggested 342px/s and
    // the true ceiling is 345.8; a gate set to the sample burns while parked.
    let smallest = Infinity;
    for (let seed = 0; seed < 400; seed++) {
      for (const b of createBodies({ ...DEFAULT_CONFIG, worldSeed: seed })) {
        smallest = Math.min(smallest, b.R);
      }
    }
    const parkedCeiling = Math.sqrt(DEFAULT_CONFIG.GM / (smallest + DEFAULT_CONFIG.minOrbitGap));
    expect(reentryHeat(0, parkedCeiling)).toBe(0);
    // Same place, dive speed: burns. Fast but high: does not. Both terms required.
    expect(reentryHeat(0, 480)).toBeGreaterThan(0);
    expect(reentryHeat(500, 480)).toBe(0);
  });
});

/** A capture the scorer only ever reads for "is one happening". */
function fakeCapture(): NonNullable<SimState['capture']> {
  return {
    phase: 'orbit',
    planet: 0,
    rx: 0,
    ry: 0,
    vx: 0,
    vy: 0,
    grabR: 100,
    minR: 50,
    prevR: 100,
    prevDR: 0,
    passedPeri: true,
    periR: 100,
    apoR: 100,
    clearFramesLeft: 0,
    clearDvx: 0,
    clearDvy: 0,
    whipE: undefined,
    orbit: null,
    theta: 0,
    phaseSpeed: 0,
    phaseSpeedReal: 0,
    phaseMul: 1,
    Lfrozen: undefined,
    rPeri: 100,
    settleT: 1,
    settleProgress: 1,
    tightness: 1,
    boostFull: 0,
    boost: 0,
    boostT: 0,
    settleSweep: 0,
    refuel: 0,
    approachR0: 0,
    approachVR: 0,
    settleDur: 1,
    zipped: false,
    puttered: false,
    fuelSpent: 0,
    fuelBack: 0,
    escapeSide: 0,
    escaped: false,
    brakeSpent: 0,
    lastAngle: 0,
    defl: 0,
  };
}

/**
 * F04 stage (a): the carry exists, accrues, and buys nothing yet.
 *
 * The whole point of a stage that changes no outcome is that the risky half of the
 * economy — the gap gate, which decides most of F04 — can be built and pinned
 * where it cannot break anything. These tests are what makes that true rather than
 * merely intended, and they are the ones stage (b) has to keep passing while it
 * makes the link SPEND what they measure.
 */
describe('the carry, before anything spends it', () => {
  /** Climb without moving the ship: `accrueCarry` reads only `highWaterY`. */
  function climb(px: number, perTick: number, scfg = DEFAULT_SCORE_CONFIG) {
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    // One tick to seed the anchor, accruing nothing — a respawn far below must not
    // register as a mountain of climb.
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT, scfg);
    for (let done = 0; done < px; done += perTick) {
      state.highWaterY -= perTick;
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT, scfg);
    }
    return sc;
  }

  it('stops paying once the ship has climbed out of reach of everything', () => {
    // THE GAP GATE, and the number is cfg.grabRange rather than the board's 25m
    // rung: measured over 401 coasts, gating at a rung leaves 58.6% of all climb
    // unpaid, which is 93% of the way to paying only for captured metres.
    const cap = DEFAULT_CONFIG.grabRange * DEFAULT_SCORE_CONFIG.climbPerPx;
    expect(climb(400, 20).carry).toBeCloseTo(400 * DEFAULT_SCORE_CONFIG.climbPerPx, 6);
    expect(climb(4000, 20).carry, 'a long drift kept earning').toBeCloseTo(cap, 6);
  });

  it('gates on the field-wide reach, not on a body that happens to be near', () => {
    // The rule Q7 settled and `ScoreState.coastClimb` states: if reach becomes a
    // per-body trait it must MULTIPLY this, never replace it. Pinned by reading the
    // global — halve it and the drift is paid half as far.
    const half = { ...DEFAULT_CONFIG, grabRange: DEFAULT_CONFIG.grabRange / 2 };
    const state = createInitialState(half);
    const sc = createScoreState();
    scoreTick(sc, state, half, FIXED_DT);
    for (let i = 0; i < 200; i++) {
      state.highWaterY -= 20;
      scoreTick(sc, state, half, FIXED_DT);
    }
    expect(sc.carry).toBeCloseTo(
      (DEFAULT_CONFIG.grabRange / 2) * DEFAULT_SCORE_CONFIG.climbPerPx,
      6,
    );
  });

  it('an engagement lifts the gate again', () => {
    // Measured over the SESSION rather than over one carry, and that is the only
    // shape that works: `coastClimb` only ratchets down at a capture, so if a grab
    // did not reset it the gate would shut permanently after the first 560px of
    // drift and the whole session could never accrue more than one gate's worth,
    // however many times the carry was cashed in between.
    const cap = DEFAULT_CONFIG.grabRange * DEFAULT_SCORE_CONFIG.climbPerPx;
    const r = pilot(4000);
    expect(r.carryPeak, 'the carry never rose at all').toBeGreaterThan(0);
    const accrued = r.carryCashed + r.score.carry;
    expect(accrued, 'the coast never reset, so the gate shut for good').toBeGreaterThan(cap);
  });

  it('buys nothing: every banked point still came from an award', () => {
    // Stage (a)'s contract. `awardLink` prices its own climb off `climbFromY` and
    // will keep doing so until stage (b), so the carry must be observable and
    // inert. If this fails, stage (a) has become stage (b) by accident.
    const r = pilot(4000);
    expect(
      r.carryCashed,
      'nothing ever cashed, so the pin proves less than it should',
    ).toBeGreaterThan(0);
    const lives = [...r.lives, r.score.bank];
    expect(lives.reduce((n, v) => n + v, 0)).toBe(r.awards.reduce((n, a) => n + a.points, 0));
  });

  it('dies with the life it was at stake in', () => {
    // The one part of Direction 08's death rule that is universal across the mode
    // matrix: the bank is what varies by mode, the carry never survives.
    const r = pilot(4000);
    expect(r.lives.length, 'nothing died, so this proves nothing').toBeGreaterThan(0);
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    state.highWaterY -= 200;
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    expect(sc.carry).toBeGreaterThan(0);
    state.ending.active = true;
    state.ending.reason = 'impact';
    scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
    expect(sc.carry, 'a death left the carry standing').toBe(0);
  });
});
