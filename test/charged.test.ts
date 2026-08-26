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
import { grabTarget } from '../src/sim/capture.ts';
import { createBodies } from '../src/sim/world.ts';
import type { ScoreAward, ScoreState, Tally } from '../src/score/index.ts';
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
  tallies: Tally[];
  /** Was the capture opened by the second press a zip? */
  secondZipped: boolean;
  /** Seconds on the window the tick after the anomaly release. */
  openedWith: number;
  closedAtTick: number;
}

function fly(
  cfg: SimConfig = DEFAULT_CONFIG,
  ticks = 650,
  hook?: (t: number, state: ReturnType<typeof createInitialState>, sc: ScoreState) => void,
): Flight {
  const state = createInitialState(cfg);
  Object.assign(state.ship, { x: ANOMALY.x - 520, y: ANOMALY.y - 70, vx: 320, vy: 0 });
  const sc = createScoreState();
  const awards: ScoreAward[] = [];
  const tallies: Tally[] = [];
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
    const out = scoreTick(sc, state, cfg, FIXED_DT);
    awards.push(...out.awards);
    if (out.tally) tallies.push(out.tally);
  }
  return { score: sc, awards, tallies, secondZipped, openedWith, closedAtTick };
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
    // Measured on a ship drifting in open space rather than on the flight above.
    // A window can also end by dying, and pinning the expiry against a flight
    // means the assertion silently starts measuring the crash instead the first
    // time a tuning change moves where that flight ends up.
    const state = createInitialState(DEFAULT_CONFIG);
    state.ship.vx = 0;
    state.ship.vy = -DEFAULT_CONFIG.cruise;
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    let ticks = 0;
    while (state.chargedT > 0 && ticks < 10_000) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      ticks++;
    }
    expect(state.ending.active, 'the ship died before the window expired').toBe(false);
    // Within a tick of the ideal, not exactly it: `dt` is 1/60, which has no exact
    // binary representation, so 420 subtractions leave a residue too small to see
    // and too real to subtract away. One tick in 420 is 0.24% of the window, and
    // draining in seconds is what keeps the duration honest if the timestep ever
    // moves — which matters more than the last 17ms.
    const ideal = Math.round(DEFAULT_CONFIG.chargedSecs / FIXED_DT);
    expect(Math.abs(ticks - ideal)).toBeLessThanOrEqual(1);
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
      fly(DEFAULT_CONFIG, 650, (t, _s, sc) => {
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

    const f = fly(DEFAULT_CONFIG, 650, (t, _state, sc) => {
      // Already hopped to it this window.
      if (t === 300 && !sc.hopped.includes(body)) sc.hopped.push(body);
    });
    expect(hops(f)).toHaveLength(0);
    // Still a capture, and still scored as an ordinary arrival.
    expect(f.secondZipped).toBe(true);
    expect(f.awards.some((a) => a.kind === 'grab' && a.body === body)).toBe(true);
  });

  it('records what has been hopped while the window is still running', () => {
    // Sampled DURING the window, not at the end of the flight: `endLife` clears
    // the log, and a flight long enough to outlast a seven-second window is long
    // enough to end in a death.
    let during: string[] = [];
    const f = fly(DEFAULT_CONFIG, 650, (t, _state, sc) => {
      if (t === 400) during = [...sc.hopped];
    });
    expect(during).toContain(hops(f)[0]!.body);
  });
});

describe('targeting inside a charged window', () => {
  // Reported as three of five presses in one window zipping straight back onto
  // the planet just left. See `chargedTarget`.
  const field = () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const planets = state.bodies
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.kind === 'planet')
      .sort((p, q) => q.b.y - p.b.y); // bottom of the field first
    return { state, planets };
  };

  /** Park the ship just above `behind`, with `ahead` further up the field. */
  function stage() {
    const { state, planets } = field();
    // Two neighbours far enough up that both sit inside `grabRange` of a point
    // between them.
    const behind = planets[6]!;
    const ahead = planets[7]!;
    expect(ahead.b.y).toBeLessThan(behind.b.y);
    // Just above the lower one, so IT is the nearest body by a wide margin.
    state.ship.x = behind.b.x;
    state.ship.y = behind.b.y - 90;
    state.ship.vx = 0;
    state.ship.vy = 0;
    state.fuel = DEFAULT_CONFIG.fuelMax;
    return { state, behind, ahead };
  }

  it('offers the nearest body when not charged, behind or not', () => {
    // The uncharged path is untouched, which is also what keeps the equality gate
    // at zero: `chargedSecs` is 0 in PROTOTYPE_CONFIG.
    const { state, behind } = stage();
    state.cameFrom = behind.i;
    state.chargedT = 0;
    expect(grabTarget(state, DEFAULT_CONFIG).index).toBe(behind.i);
  });

  it('never offers the body just released from', () => {
    const { state, behind } = stage();
    state.cameFrom = behind.i;
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    expect(grabTarget(state, DEFAULT_CONFIG).index).not.toBe(behind.i);
  });

  it('prefers a body ahead over a nearer one behind', () => {
    // The half that excluding `cameFrom` does not achieve. Without it the ship
    // walks back down the field one neighbour at a time.
    const { state, behind, ahead } = stage();
    state.cameFrom = -1; // nothing excluded: the choice is made on direction alone
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    const got = grabTarget(state, DEFAULT_CONFIG).index;
    expect(got).not.toBe(behind.i);
    expect(state.bodies[got]!.y).toBeLessThan(state.ship.y);
    expect(got).toBe(ahead.i);
  });

  it('falls back rather than refusing when nothing ahead is takeable', () => {
    // A preference, not a gate. `nearestBody` records why a heading cone was
    // refused — a threshold is a cliff — so this one never forbids a press, it
    // only decides which body a press takes when there is a real choice.
    //
    // FLOWN WITH THE CARPET OFF, and the reason is geometric rather than a
    // convenience. "Nothing at all above the ship" can only be staged above the
    // topmost body, and everything from the crest to the finish line IS the run-in
    // carpet, where a press carves instead of grabbing — while everything above
    // the line is by construction further than `grabRange` from any body, so there
    // is nothing to fall back TO. The two rules are independent and this one is
    // still exactly what it always was; the carpet simply owns the only region it
    // could ever have been demonstrated in.
    const carpetless: SimConfig = { ...DEFAULT_CONFIG, carpetCarve: 0 };
    const { state, behind } = stage();
    const top = Math.min(...state.bodies.map((b) => b.y));
    state.ship.y = top - 200;
    state.ship.x = state.bodies.find((b) => b.y === top)!.x;
    state.cameFrom = -1;
    state.chargedT = carpetless.chargedSecs;
    const got = grabTarget(state, carpetless);
    expect(got.index).toBeGreaterThanOrEqual(0);
    expect(got.result).toBe('captured');
    void behind;
  });
});

describe('the orbit a hop lands on', () => {
  /** Zip onto a body from a given approach, and report the settled radius. */
  function zipRadius(cfg: SimConfig, ang: number, dist: number, tang: number): number | null {
    const state = createInitialState(cfg);
    const planets = state.bodies.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'planet');
    const { b } = planets[8]!;
    state.chargedT = cfg.chargedSecs;
    state.cameFrom = -1;
    state.ship.x = b.x + Math.cos(ang) * dist;
    state.ship.y = b.y + Math.sin(ang) * dist;
    const ux = -Math.cos(ang);
    const uy = -Math.sin(ang);
    state.ship.vx = (ux - uy * tang) * 120;
    state.ship.vy = (uy + ux * tang) * 120;
    state.fuel = cfg.fuelMax;
    state.highWaterY = state.ship.y;
    stepSim(state, cfg, { held: true, pressed: true, released: false }, FIXED_DT);
    const cap = state.capture;
    // Whichever body the press took. Which one it is does not matter here — an
    // absolute radius is the same on all of them, which is the claim.
    if (!cap || !cap.zipped) return null;
    // `rPeri` is the circle the settle glides onto — the authored destination.
    return cap.rPeri;
  }

  it('is the same radius however the ship arrived', () => {
    // It used to be the orbit the dive WOULD have reached, which measured across
    // 108,000 approach geometries as a lottery rather than a gradient: 43% pinned
    // at `minR`, the top quartile 3.1x to 8.1x above it. Reported as "I sometimes
    // got high orbits and sometimes low".
    const seen = new Set<number>();
    let zips = 0;
    for (const ang of [0, 1.1, 2.2, 3.3, 4.4, 5.5]) {
      for (const dist of [180, 300, 420]) {
        for (const tang of [0.3, 0.6, 0.9]) {
          const r = zipRadius(DEFAULT_CONFIG, ang, dist, tang);
          if (r !== null) {
            zips++;
            seen.add(Math.round(r * 1000) / 1000);
          }
        }
      }
    }
    expect(seen.size, `radii seen: ${[...seen].join(', ')}`).toBe(1);
    expect(zips, 'no press in this sweep actually zipped').toBeGreaterThan(10);
    expect([...seen][0]).toBeCloseTo(DEFAULT_CONFIG.chargedOrbitR, 6);
  });

  it('is low, but never the minimum', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const minRs = state.bodies
      .filter((b) => b.kind === 'planet')
      .map((b) => b.R + DEFAULT_CONFIG.minOrbitGap);
    // Clear of the tightest orbit in the game on every body...
    expect(DEFAULT_CONFIG.chargedOrbitR).toBeGreaterThan(Math.max(...minRs));
    // ...and still tighter than the anomaly's own rest stop, so a hop is not one.
    expect(DEFAULT_CONFIG.chargedOrbitR).toBeLessThan(DEFAULT_CONFIG.anomalyOrbitR);
  });

  it('never orbits inside a body, however large', () => {
    // The clamp is not decoration: bodies run R 34-56 today, and one big enough
    // would otherwise put this orbit underground.
    const cfg = { ...DEFAULT_CONFIG, chargedOrbitR: 10 };
    const r = zipRadius(cfg, 1.1, 300, 0.6);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(10);
  });
});

describe('the closing tally', () => {
  /**
   * A window about to expire over a ship that will survive it.
   *
   * Constructed rather than flown: the flight above dies before its window runs
   * out, so an expiry cannot be observed on it — and a test that quietly measured
   * the crash instead would pass for the wrong reason.
   */
  function expire(hopTotal: number, hopped: string[]) {
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.ship.vx = 0;
    state.ship.vy = -DEFAULT_CONFIG.cruise;
    state.chargedT = 0.05;
    sc.wasCharged = true;
    sc.hopTotal = hopTotal;
    sc.hopped.push(...hopped);
    sc.score = 4242;
    const tallies: Tally[] = [];
    for (let t = 0; t < 30; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      const out = scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      if (out.tally) tallies.push(out.tally);
    }
    expect(state.ending.active, 'the ship died before the window expired').toBe(false);
    return { sc, tallies };
  }

  it('reports the window total when the timer runs out', () => {
    const { tallies } = expire(1500, ['P1', 'P2', 'P3']);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]!.points).toBe(1500);
    expect(tallies[0]!.hops).toBe(3);
  });

  it('restates points already banked, and pays nothing itself', () => {
    // Display only. Paying here as well would double the window; holding the
    // points back until here would mean dying mid-window cost the player
    // everything they had already earned.
    const { sc, tallies } = expire(1500, ['P1', 'P2', 'P3']);
    expect(tallies).toHaveLength(1);
    expect(sc.score, 'the tally moved the score').toBe(4242);
  });

  it('fires once, not on every tick after the window', () => {
    const { tallies } = expire(1500, ['P1']);
    expect(tallies).toHaveLength(1);
  });

  it('is the sum of the hops actually paid, in a real window', () => {
    // The integration half: whatever the flight manages, the running total must
    // equal what the hop awards came to.
    const f = fly(DEFAULT_CONFIG, 700);
    const paid = hops(f).reduce((n, a) => n + a.points, 0);
    expect(paid).toBeGreaterThan(0);
    // `hopTotal` is cleared by the death that ends this flight, so it is sampled
    // while the window is still running.
    let during = 0;
    fly(DEFAULT_CONFIG, 700, (t, _state, sc) => {
      if (t === 400) during = sc.hopTotal;
    });
    expect(during).toBe(paid);
  });

  it('says nothing when the window ends in a crash', () => {
    // A total for a frenzy that ended in a wall is a consolation prize nobody
    // asked for. `endLife` clears the edge so the falling edge is never seen.
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    sc.wasCharged = true;
    sc.hopTotal = 1500;
    sc.hopped.push('P1', 'P2', 'P3');
    // Straight down past the trailing floor.
    Object.assign(state.ship, { x: 190, y: 4000, vx: 0, vy: 600 });
    state.highWaterY = -4000;
    let tallies = 0;
    for (let t = 0; t < 200; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      if (scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT).tally) tallies++;
    }
    expect(state.chargedT).toBe(0);
    expect(tallies).toBe(0);
  });

  it('says nothing for a window in which nothing was hopped', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.chargedT = 0.05;
    let tallies = 0;
    for (let t = 0; t < 30; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      if (scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT).tally) tallies++;
    }
    expect(state.chargedT).toBe(0);
    expect(tallies).toBe(0);
  });
});

describe('the commitment rule', () => {
  it('pays a glide begun inside the window even if it lands after it closes', () => {
    // Read off `cap.zipped`, never off the live window. A zip is committed at the
    // press and the glide it buys can outlast the countdown; re-checking at the
    // arrival would punish the player for the one thing the window asks of them,
    // which is to hurry.
    const f = fly(DEFAULT_CONFIG, 650, (t, state) => {
      // Slam the window shut mid-glide, after the press has already committed.
      if (t === 300) state.chargedT = 0;
    });
    expect(f.secondZipped).toBe(true);
    expect(hops(f)).toHaveLength(1);
    expect(hops(f)[0]!.points).toBe(DEFAULT_SCORE_CONFIG.hopBonus);
  });
});
