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
import { grabTarget } from '../src/sim/capture.ts';
import { hypot } from '../src/sim/orbit.ts';
import { fingerprint } from '../src/sim/serialize.ts';
import type { Input, SimState } from '../src/sim/types.ts';
import { DEFAULT_SCORE_CONFIG, createScoreState, readAim, scoreTick } from '../src/score/index.ts';
import type { ScoreAward, ScoreConfig, ScoreState } from '../src/score/index.ts';

// --------------------------------------------------------------------- driving

type Edges = Array<[number, 0 | 1]>;

interface Session {
  score: ScoreState;
  awards: ScoreAward[];
  state: SimState;
  fingerprints: number[];
}

/** Drive a recorded input log and score it. */
function play(
  edges: Edges,
  ticks: number,
  cfg: SimConfig = DEFAULT_CONFIG,
  scfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
  score = true,
): Session {
  const state = createInitialState(cfg);
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
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
    if (score) awards.push(...scoreTick(sc, state, cfg, scfg));
    fingerprints.push(fingerprint(state));
  }
  return { score: sc, awards, state, fingerprints };
}

/**
 * A greedy pilot, played rather than recorded: grab whatever is on offer and let
 * go as the combined boost-and-aim quality turns over.
 *
 * It exists because the interesting properties — streaks, multipliers, misses —
 * only appear across a chain of captures, and hand-written press/release ticks
 * that chain reliably are brittle to any retune. This one finds its own way.
 */
function pilot(ticks: number, cfg: SimConfig = DEFAULT_CONFIG, scfg = DEFAULT_SCORE_CONFIG) {
  const state = createInitialState(cfg);
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  let held = false;
  let bestQ = 0;
  let holdT = 0;
  let taken = new Set<number>();

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
    awards.push(...scoreTick(sc, state, cfg, scfg));
    if (state.ending.active) taken = new Set();
  }
  return { score: sc, awards, state };
}

/**
 * The sessions every weight is measured against.
 *
 * One is not enough, for the same reason `test/tune.test.ts` needs four: a
 * session that never coasts past anything cannot show a miss weight doing
 * something, and one that never chains cannot show a multiplier.
 */
const SESSIONS: ReadonlyArray<{ name: string; edges: Edges; ticks: number }> = [
  // holds through the settle and releases mid-decay
  {
    name: 'held long, released in the decay',
    edges: [
      [240, 1],
      [450, 0],
    ],
    ticks: 900,
  },
  // grabs once, then sails past everything above it
  {
    name: 'one grab then coasting',
    edges: [
      [240, 1],
      [340, 0],
    ],
    ticks: 3000,
  },
  // never presses at all: pure coasting, all penalty
  { name: 'never engages', edges: [], ticks: 3000 },
];

/**
 * What a session came to, as two numbers rather than one.
 *
 * `score` alone will not do — it is the current life's, and every session here
 * ends after at least one death, so it is almost always zero at the final tick.
 * `best` alone will not do either: it is a PEAK, so a deduction can only move it
 * when a link follows the deduction inside the same life. In these sessions the
 * coasting all happens after the last capture, which would leave `missPenalty`
 * measuring as inert when it plainly is not — the author's own recorded sessions
 * interleave six deductions with twenty-nine links.
 *
 * The pair is the honest signature: the best life, and everything the session was
 * ever paid, deductions included.
 */
function outcomeOf(scfg: ScoreConfig): number[] {
  const out: number[] = [];
  const add = (r: { score: ScoreState; awards: ScoreAward[] }): void => {
    out.push(
      r.score.best,
      r.awards.reduce((n, a) => n + a.points, 0),
    );
  };
  add(pilot(4000, DEFAULT_CONFIG, scfg));
  for (const s of SESSIONS) add(play(s.edges, s.ticks, DEFAULT_CONFIG, scfg));
  return out;
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
    expect(awards.filter((a) => a.kind === 'miss')).toHaveLength(score.misses);
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
    const base = outcomeOf(DEFAULT_SCORE_CONFIG);
    for (const key of Object.keys(DEFAULT_SCORE_CONFIG) as Array<keyof ScoreConfig>) {
      const v = DEFAULT_SCORE_CONFIG[key];
      let moved = false;
      for (const alt of [0, v * 0.5, v * 2]) {
        if (alt === v) continue;
        const outcome = outcomeOf({ ...DEFAULT_SCORE_CONFIG, [key]: alt });
        if (outcome.some((s, i) => s !== base[i])) moved = true;
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
      expect(a.depth).toBeGreaterThanOrEqual(0);
      expect(a.depth).toBeLessThanOrEqual(1);
      expect(a.timing).toBeLessThanOrEqual(1);
      expect(a.aim).toBeLessThanOrEqual(1);
      expect(a.points).toBeGreaterThan(0);
    }

    // Same session, weights zeroed one at a time: each component is really paid.
    const full = pilot(4000).score.best;
    for (const key of ['depthBonus', 'timingBonus', 'aimBonus', 'climbPerPx'] as const) {
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
    const { score } = pilot(4000);
    expect(score.best).toBeGreaterThan(0);
    expect(score.best).toBeGreaterThan(score.score);
  });

  it('starts the next life clean rather than judging it on the last one', () => {
    // After a respawn the field is re-flown from the bottom. Without clearing the
    // per-body flags, every planet would already be marked judged or grabbed and
    // the second pass would score nothing at all.
    const { awards } = pilot(4000);
    const links = awards.filter((a) => a.kind === 'link');
    const firstOfLife = links.map((a) => a.multiplier).lastIndexOf(1);
    expect(firstOfLife).toBeGreaterThan(0);
    expect(links[firstOfLife]!.climb, 'a life after a death banked no climb').toBeGreaterThan(0);
  });
});

describe('coasting past a planet', () => {
  it('deducts, and breaks the streak', () => {
    const { score, awards } = play(
      [
        [240, 1],
        [340, 0],
      ],
      3000,
    );
    const misses = awards.filter((a) => a.kind === 'miss');
    expect(misses.length).toBeGreaterThan(0);
    expect(score.misses).toBe(misses.length);
    expect(score.streak).toBe(0);
  });

  it('never charges for a body the game would have refused to let you grab', () => {
    // Nothing is ever on offer with an empty tank, so nothing can be missed.
    const dry: SimConfig = { ...DEFAULT_CONFIG, fuelMax: 0.5, fuelRegen: 0 };
    const { awards } = play([], 3000, dry);
    expect(awards.filter((a) => a.kind === 'miss')).toHaveLength(0);
  });

  it('never charges for a body that was never within reach', () => {
    const far: SimConfig = { ...DEFAULT_CONFIG, grabRange: 1 };
    const { awards } = play([], 3000, far);
    expect(awards.filter((a) => a.kind === 'miss')).toHaveLength(0);
  });

  it('charges for each body at most once', () => {
    const { awards } = play([], 3000);
    const names = awards.filter((a) => a.kind === 'miss').map((a) => a.body);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never drives the score below zero', () => {
    const { score, awards } = play([], 3000);
    expect(awards.filter((a) => a.kind === 'miss').length).toBeGreaterThan(0);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.best).toBeGreaterThanOrEqual(0);
  });
});

/**
 * PORT_NOTES 17 pinned "grab quality influences nothing": `aim` was computed on
 * every grab, read by nobody, and removed. The note closed by saying the mechanic
 * the prototype's design document described was still not implemented and that it
 * was a live design question.
 *
 * It has been answered — but NOT by making aim move the ship, which is what that
 * document proposed and what would have broken the equality gate. Aim is paid in
 * points instead. Both halves are pinned here, because half of it is still true.
 */
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
