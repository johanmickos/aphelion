/**
 * The charged window: what leaving an anomaly buys you.
 *
 * See `SimConfig.chargedSecs` and `ScoreConfig.hopBonus`. The window replaced two
 * things that asked nothing of the player once earned — a single untimed `zip`
 * charge, and a ten-second x2 scoring window — so most of what is worth pinning
 * here is that the reward now has to be SPENT, and that spending it cannot be
 * degenerate.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { createBodies } from '../src/sim/world.ts';
import type { ScoreAward, ScoreState } from '../src/score/index.ts';
import { DEFAULT_SCORE_CONFIG, createScoreState, scoreTick } from '../src/score/index.ts';

const ANOMALY = createBodies(DEFAULT_CONFIG).find((b) => b.kind === 'anomaly' && b.x > 195)!;

/**
 * Out to the right-hand anomaly, then a second press inside the window it opens.
 *
 * The same line `test/score.test.ts` flies for its anomaly session. Press 88
 * captures the anomaly, release 186 opens the window, press 296 lands inside it
 * and is therefore a zip.
 */
const EDGES = new Map<number, 0 | 1>([
  [88, 1],
  [186, 0],
  [296, 1],
  [406, 0],
]);

interface Flight {
  score: ScoreState;
  awards: ScoreAward[];
  /** Was the capture opened by the second press a zip? */
  secondZipped: boolean;
  /** Seconds on the window the tick after the anomaly release. */
  openedWith: number;
  closedAtTick: number;
}

function fly(
  cfg: SimConfig = DEFAULT_CONFIG,
  ticks = 520,
  hook?: (t: number, state: ReturnType<typeof createInitialState>, sc: ScoreState) => void,
): Flight {
  const state = createInitialState(cfg);
  Object.assign(state.ship, { x: ANOMALY.x - 520, y: ANOMALY.y - 70, vx: 320, vy: 0 });
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  let held = false;
  let secondZipped = false;
  let openedWith = 0;
  let closedAtTick = -1;
  let wasCharged = false;

  for (let t = 0; t < ticks; t++) {
    const e = EDGES.get(t);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, cfg, { held: held || pressed, pressed, released }, FIXED_DT);
    if (t === 186) openedWith = state.chargedT;
    if (t === 296 && state.capture) secondZipped = state.capture.zipped;
    const charged = state.chargedT > 0;
    if (!charged && wasCharged) closedAtTick = t;
    wasCharged = charged;
    hook?.(t, state, sc);
    awards.push(...scoreTick(sc, state, cfg).awards);
  }
  return { score: sc, awards, secondZipped, openedWith, closedAtTick };
}

const hops = (f: Flight) => f.awards.filter((a) => a.kind === 'hop');

describe('the window itself', () => {
  it('opens at the release from an anomaly, at its full configured length', () => {
    // Full length, not one tick short. The drain runs at the TOP of `stepSim`,
    // before the input edges that open the window, so a window never loses a
    // slice of itself to the tick it was born in.
    expect(fly().openedWith).toBeCloseTo(DEFAULT_CONFIG.chargedSecs, 6);
  });

  it('runs for exactly `chargedSecs` and then stops', () => {
    const f = fly();
    expect(f.closedAtTick).toBe(186 + Math.round(DEFAULT_CONFIG.chargedSecs / FIXED_DT) + 1);
  });

  it('is what makes a grab zip — nothing else does', () => {
    const f = fly();
    // The first press is at an anomaly with no window running, and dives.
    expect(f.awards.find((a) => a.kind === 'grab')).toBeDefined();
    // The second is inside the window, and glides.
    expect(f.secondZipped).toBe(true);
  });

  it('cannot be opened at all when the key is 0', () => {
    // The config split: `chargedSecs` is 0 in PROTOTYPE_CONFIG, which is what
    // keeps the equality gate at zero. With it off there is no window and, since
    // the window is now the only gate, no zip anywhere in the game.
    const f = fly({ ...DEFAULT_CONFIG, chargedSecs: 0 });
    expect(f.openedWith).toBe(0);
    expect(f.secondZipped).toBe(false);
    expect(hops(f)).toHaveLength(0);
  });

  it('dies with the ship', () => {
    // Earned by flying; carrying it across a death would pay the next life for
    // the last one's work.
    const state = createInitialState(DEFAULT_CONFIG);
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    // Straight down past the trailing floor ends the run.
    Object.assign(state.ship, { x: 190, y: 4000, vx: 0, vy: 600 });
    state.highWaterY = -4000;
    for (let t = 0; t < 120; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
    }
    expect(state.chargedT).toBe(0);
  });
});

describe('a hop', () => {
  it('pays at the end of the glide, not at the press', () => {
    const f = fly();
    const hop = hops(f)[0];
    expect(hop, 'the second press never became a hop').toBeDefined();
    // `zipDur` after the press, give or take the tick the arrival is detected on.
    const expected = 296 + Math.round(DEFAULT_CONFIG.zipDur / FIXED_DT);
    expect(hop!.tick).toBeGreaterThan(296);
    expect(Math.abs(hop!.tick - expected)).toBeLessThanOrEqual(4);
  });

  it('pays flat, ignoring the multiplier every other award takes', () => {
    const f = fly();
    const hop = hops(f)[0]!;
    expect(hop.points).toBe(DEFAULT_SCORE_CONFIG.hopBonus);
    expect(hop.multiplier).toBe(1);
  });

  it('pays the same on a hot streak as on a cold one', () => {
    // The whole point of it being flat: reaching an anomaly is hard and usually
    // costs the streak on the way out, so a reward that shrank exactly when it was
    // hardest to earn would be the wrong shape.
    const cold = hops(fly())[0]!;
    const hot = hops(
      fly(DEFAULT_CONFIG, 520, (t, _s, sc) => {
        if (t === 300) sc.streak = 999;
      }),
    )[0]!;
    expect(hot.points).toBe(cold.points);
    expect(hot.points).toBe(DEFAULT_SCORE_CONFIG.hopBonus);
  });

  it('replaces the grab award rather than stacking on it', () => {
    // One clean number at the busiest moment in the game. Nothing about flying
    // well is lost — see the link assertion below.
    const f = fly();
    const hop = hops(f)[0]!;
    const sameTick = f.awards.filter((a) => a.tick === hop.tick);
    expect(sameTick).toHaveLength(1);
  });

  it('leaves the link untouched, so flying well is still paid', () => {
    // The objection to a flat hop is that it stops rewarding skill. It does not:
    // the release half of the capture still scores aim, timing and climb, with the
    // full multiplier.
    const f = fly();
    const hop = hops(f)[0]!;
    const link = f.awards.find((a) => a.kind === 'link' && a.tick > hop.tick);
    expect(link, 'the hopped capture was never released').toBeDefined();
    expect(link!.multiplier).toBeGreaterThan(1);
    expect(link!.points).toBeGreaterThan(0);
  });
});

describe('what a hop refuses to pay for', () => {
  it('pays a body once per window, however many times it is hopped to', () => {
    // Without this the optimal line inside a window is to bounce on one planet: a
    // press-glide-release cycle is about 1.2s, so the same body would pay three
    // times without the ship going anywhere — in a game whose whole subject is
    // climbing. The zip is never refused; it just stops minting.
    const plain = fly();
    const body = hops(plain)[0]!.body;

    const f = fly(DEFAULT_CONFIG, 520, (t, _state, sc) => {
      // Already hopped to it this window.
      if (t === 300 && !sc.hopped.includes(body)) sc.hopped.push(body);
    });
    expect(hops(f)).toHaveLength(0);
    // Still a capture, and still scored as an ordinary arrival.
    expect(f.secondZipped).toBe(true);
    expect(f.awards.some((a) => a.kind === 'grab' && a.body === body)).toBe(true);
  });

  it('forgets the log when a new window opens', () => {
    // Cleared on the rising edge rather than on the close, so the log always
    // describes the window in progress.
    const f = fly();
    expect(f.score.hopped).toContain(hops(f)[0]!.body);
  });
});

describe('the commitment rule', () => {
  it('pays a glide begun inside the window even if it lands after it closes', () => {
    // Read off `cap.zipped`, never off the live window. A zip is committed at the
    // press and the glide it buys can outlast the countdown; re-checking at the
    // arrival would punish the player for the one thing the window asks of them,
    // which is to hurry.
    const f = fly(DEFAULT_CONFIG, 520, (t, state) => {
      // Slam the window shut mid-glide, after the press has already committed.
      if (t === 300) state.chargedT = 0;
    });
    expect(f.secondZipped).toBe(true);
    expect(hops(f)).toHaveLength(1);
    expect(hops(f)[0]!.points).toBe(DEFAULT_SCORE_CONFIG.hopBonus);
  });
});
