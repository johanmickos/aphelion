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
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { createBodies } from '../src/sim/world.ts';
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
  DEFAULT_SCORE_CONFIG,
  PEAK,
  WORDS,
  createScoreState,
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
      const out = scoreTick(sc, state, cfg, scfg);
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
    const out = scoreTick(sc, state, cfg, scfg);
    awards.push(...out.awards);
    shouts.push(...out.shouts);
    if (sc.score === 0 && prevScore > 0) lives.push(prevScore);
    prevScore = sc.score;
    if (state.ending.active) taken = new Set();
  }
  return { score: sc, awards, shouts, state, lives };
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
   * the ship goes round the anomaly once every `anomalyOrbitPeriod`, so which way
   * it is thrown depends entirely on when it is let go, and only part of that
   * circle is aimed back at the corridor. Letting go at the wrong point sends it
   * out through the far side of the bubble, where the barrier resumes and the run
   * ends — which is what happened to the previous numbers when the anomaly
   * approach stopped taking two seconds and every tick after the press moved.
   */
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
    expect(awards.reduce((n, a) => n + a.points, 0)).toBe(score.score);
    expect(awards.filter((a) => a.kind === 'link')).toHaveLength(score.links);
    expect(awards.filter((a) => a.kind === 'grab')).toHaveLength(score.grabs);
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
  it('exposes no weight that leaves every score unchanged', () => {
    // The twin of the tune-panel guarantee. These cannot go in the tune panel —
    // `test/tune.test.ts` measures a knob by how far it moves the ship, and a
    // score weight moves no pixel — so the same promise is kept here instead.
    const base = battery(DEFAULT_SCORE_CONFIG).map((f) => f());
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
      expect(moved, `${key} cannot change any session's outcome`).toBe(true);
    }
  });
});

// ------------------------------------------------------------------ behaviour

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

    // Same session, weights zeroed one at a time: each component is really paid.
    const full = pilot(4000).score.best;
    for (const key of ['closeBonus', 'timingBonus', 'aimBonus', 'climbPerPx'] as const) {
      const without = pilot(4000, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, [key]: 0 }).score.best;
      expect(without, `${key} pays nothing`).toBeLessThan(full);
    }
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
  it('rises with consecutive links', () => {
    const links = pilot(4000).awards.filter((a) => a.kind === 'link');
    const first = links[0]!;
    expect(first.multiplier).toBe(1);
    const second = links.find((a) => a.tick > first.tick && a.multiplier > 1);
    expect(second, 'a second link in the same life never raised the multiplier').toBeDefined();
    expect(second!.multiplier).toBeCloseTo(1 + DEFAULT_SCORE_CONFIG.streakStep, 6);
  });

  it('never exceeds its ceiling', () => {
    const gen = { ...DEFAULT_SCORE_CONFIG, streakStep: 2 };
    for (const a of pilot(4000, DEFAULT_CONFIG, gen).awards) {
      expect(a.multiplier).toBeLessThanOrEqual(gen.streakMax);
    }
  });

  it('is lost when a life ends, along with the points', () => {
    const { score, awards } = pilot(4000);
    // the pilot dies at least once over this many ticks
    expect(score.links).toBeGreaterThan(2);

    // A multiplier that came back down to 1 after having been above it is the
    // signature of a life ending.
    const seq = awards.filter((a) => a.kind === 'link').map((a) => a.multiplier);
    expect(Math.max(...seq)).toBeGreaterThan(1);
    expect(seq.lastIndexOf(1)).toBeGreaterThan(seq.indexOf(1));

    // The score is the current life's, so a session that died has banked strictly
    // less than the sum of everything it was ever paid.
    const paid = awards.reduce((n, a) => n + a.points, 0);
    expect(score.score).toBeLessThan(paid);
  });

  it('keeps a best, so a death has something to show for what it took', () => {
    const { score, lives } = pilot(4000);
    expect(lives.length, 'the pilot never lost a life with points on the board').toBeGreaterThan(0);
    expect(score.best).toBeGreaterThan(0);
    // The high-water mark across every life that ended and the one still being
    // flown. Asserting `best > score` instead would only hold while the pilot
    // happens not to finish on its best life, which is a fact about the flight
    // path and not about the score.
    expect(score.best).toBe(Math.max(...lives, score.score));
  });

  it('starts the next life clean rather than judging it on the last one', () => {
    // After a respawn the field is re-flown from the bottom. Without clearing the
    // climb baseline, the next link would bank from a high-water mark the ship is
    // now far below.
    const { awards } = pilot(4000);
    const links = awards.filter((a) => a.kind === 'link');
    const firstOfLife = links.map((a) => a.multiplier).lastIndexOf(1);
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
    const blind = pilot(4000, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, aimBonus: 0 });
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
    const b = play(edges, 900, DEFAULT_CONFIG, { ...DEFAULT_SCORE_CONFIG, aimBonus: 9999 });
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

const grab = (over: Partial<ScoreAward> = {}): ScoreAward => ({
  tick: 500,
  kind: 'grab',
  points: 180,
  multiplier: 1,
  body: 'P3',
  close: 0.4,
  clearance: REAL.clearance.med,
  skim: 40,
  defl: 3,
  timing: 0,
  aim: 0,
  climb: 0,
  ...over,
});

const link = (over: Partial<ScoreAward> = {}): ScoreAward => ({
  tick: 500,
  kind: 'link',
  points: 240,
  multiplier: 1,
  body: 'P3→P4',
  close: 0,
  clearance: Infinity,
  skim: Infinity,
  defl: 3,
  timing: REAL.timing.med,
  aim: REAL.aim.med,
  climb: 400,
  ...over,
});

describe('the word a grab earns', () => {
  it('says nothing about the arrival the player usually makes', () => {
    expect(praiseFor(grab())).toBeNull();
  });

  it('speaks up for an arrival in the tightest quarter', () => {
    expect(praiseFor(grab({ clearance: REAL.clearance.p25 }))?.category).toBe('close');
    expect(praiseFor(grab({ clearance: REAL.clearance.p25 }))?.level).toBe('good');
  });

  it('reserves the higher rung for the tightest tenth', () => {
    expect(praiseFor(grab({ clearance: REAL.clearance.p10 }))?.level).toBe('great');
  });

  it('stays quiet on an arrival wider than usual', () => {
    expect(praiseFor(grab({ clearance: REAL.clearance.p75 }))).toBeNull();
  });

  it('fires at the threshold and not a hair beyond it', () => {
    expect(praiseFor(grab({ clearance: CLOSE_PX.tier1 }))?.category).toBe('close');
    expect(praiseFor(grab({ clearance: CLOSE_PX.tier1 + 1 }))).toBeNull();
  });

  it('never names a release quality, however good it looks', () => {
    // Aim and peak belong to the other event. A grab that carried them would be
    // paying for the same thing twice.
    expect(praiseFor(grab({ aim: 1, timing: 1 }))).toBeNull();
  });

  describe('the nerve grab', () => {
    // Already boring in, and you waited. Both halves are required, and that is
    // the whole point: neither one alone is the move.
    const nerve = (over: Partial<ScoreAward> = {}) => grab({ skim: -27, clearance: 57, ...over });

    it('names a late press on a line already headed inside the minimum orbit', () => {
      const p = praiseFor(nerve());
      expect(p?.category).toBe('nerve');
      expect(WORDS.nerve[0]).toContain(p!.word);
    });

    it('is not earned by a late press on a line that was going to miss', () => {
      // 50px off a planet on the way past is the same PLACE as 50px off and
      // boring in, and only the second is nerve.
      expect(praiseFor(nerve({ skim: 26 }))?.category).not.toBe('nerve');
    });

    it('is not earned by an early press on a collision line', () => {
      expect(praiseFor(nerve({ clearance: CLOSE_PX.tier1 + 1 }))).toBeNull();
    });

    it('ignores a body that was already behind the ship', () => {
      expect(praiseFor(nerve({ skim: Infinity }))?.category).not.toBe('nerve');
    });

    it('yields to the superlative when it was also in the tightest tenth', () => {
      expect(praiseFor(nerve({ clearance: CLOSE_PX.tier2 }))?.category).toBe('super');
    });

    it('outranks a plain tight arrival', () => {
      expect(praiseFor(nerve())?.category).toBe('nerve');
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
      ['close', (t: number) => grab({ tick: t, clearance: CLOSE_PX.tier2, skim: 99 })],
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
        shouts.push(...scoreTick(sc, state, cfg).shouts);
      }
      state.capture = null;
      state.tick = tick++;
      shouts.push(...scoreTick(sc, state, cfg).shouts);
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
      scoreTick(sc, state, cfg); // a drift tick, so `lastDrift` carries the speed
      state.ending.active = true;
      state.ending.reason = reason;
      state.tick = tick++;
      shouts.push(...scoreTick(sc, state, cfg).shouts);
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
    const before = h.sc.score;
    for (let i = 0; i < RECKLESS_STREAK + 1; i++) h.capture(ROUGH);
    expect(h.shouts.length).toBeGreaterThan(0);
    // the captures themselves earn links; what must not move is the shout's own
    // contribution, so compare against the same run with no shouts at all
    const quiet = harness();
    for (let i = 0; i < RECKLESS_STREAK + 1; i++) quiet.capture(SMOOTH);
    expect(quiet.shouts).toHaveLength(0);
    expect(h.sc.score - before).toBe(quiet.sc.score - before);
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

// ---------------------------------------------------------- when a grab is paid

describe('the grab award lands at periapsis, not at the press', () => {
  /** Ticks from the press to the grab award, or -1 if none was ever paid. */
  function payDelay(pressAt: number, releaseAt: number, ticks: number): number {
    const { awards } = play(
      [
        [pressAt, 1],
        [releaseAt, 0],
      ],
      ticks,
    );
    const g = awards.find((a) => a.kind === 'grab');
    return g ? g.tick - pressAt : -1;
  }

  it('pays nothing for a tap that never reaches the bottom', () => {
    // The whole reason the award is not at the press: next to a planet you are
    // already close to the surface, so every tap would be a tight grab and
    // tap-tap-tap would be a points faucet.
    expect(payDelay(240, 244, 400)).toBe(-1);
    expect(payDelay(240, 248, 400)).toBe(-1);
  });

  it('pays a couple of ticks after periapsis, not at the press', () => {
    // Measured from PERIAPSIS, not from the press: how long the dive itself takes
    // is a property of the approach, and on a long shallow one it is 70+ ticks.
    // What this pins is that the award rides the bottom of the dive.
    const cfg = DEFAULT_CONFIG;
    const st = createInitialState(cfg);
    const sc = createScoreState();
    const edges = new Map<number, 0 | 1>([
      [240, 1],
      [400, 0],
    ]);
    let held = false;
    let freeze = -1;
    let paid = -1;
    for (let t = 0; t < 700; t++) {
      const e = edges.get(t);
      const pressed = e === 1;
      const released = e === 0;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(st, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
      if (freeze < 0 && st.capture?.passedPeri) freeze = t;
      for (const a of scoreTick(sc, st, cfg).awards)
        if (a.kind === 'grab' && paid < 0) paid = a.tick;
    }
    expect(freeze, 'the capture never reached periapsis').toBeGreaterThan(240);
    expect(paid, 'no grab award was paid').toBeGreaterThan(0);
    expect(paid - freeze).toBeGreaterThan(0);
    expect(paid - freeze).toBeLessThanOrEqual(4);
  });

  it('still pays when the hold continues into a full orbit', () => {
    // Periapsis is behind you by then, so holding on must not forfeit it.
    const { awards } = play(
      [
        [240, 1],
        [600, 0],
      ],
      900,
    );
    expect(awards.filter((a) => a.kind === 'grab')).toHaveLength(1);
  });

  it('pays exactly once however long the capture runs', () => {
    const { awards } = play(
      [
        [240, 1],
        [700, 0],
      ],
      1000,
    );
    expect(awards.filter((a) => a.kind === 'grab')).toHaveLength(1);
  });

  it('cannot be farmed by tapping in place', () => {
    // Eight quick taps beside a planet. Each one starts a capture and abandons it
    // long before the bottom.
    const edges: Edges = [];
    for (let i = 0; i < 8; i++) edges.push([240 + i * 12, 1], [244 + i * 12, 0]);
    const { awards, score } = play(edges, 600);
    expect(awards.filter((a) => a.kind === 'grab')).toHaveLength(0);
    expect(score.score).toBe(0);
  });

  it('is a separate award from the release, with its own points and word', () => {
    const { awards } = play(
      [
        [240, 1],
        [400, 0],
      ],
      700,
    );
    const g = awards.find((a) => a.kind === 'grab')!;
    const l = awards.find((a) => a.kind === 'link')!;
    expect(g.tick).toBeLessThan(l.tick);
    expect(g.points).toBeGreaterThan(0);
    expect(l.points).toBeGreaterThan(0);
    // neither event carries the other's qualities
    expect(g.aim).toBe(0);
    expect(g.timing).toBe(0);
    expect(l.close).toBe(0);
    expect(l.clearance).toBe(Infinity);
  });
});
