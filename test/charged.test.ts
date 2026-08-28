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
import { BODY_TYPES } from '../src/sim/bodies.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { grabTarget } from '../src/sim/capture.ts';
import { createBodies } from '../src/sim/world.ts';
import type { ScoreAward, ScoreState, Tally } from '../src/score/index.ts';
import { createScoreState, scoreTick } from '../src/score/index.ts';

const ANOMALY = createBodies(DEFAULT_CONFIG).find((b) => b.kind === 'anomaly' && b.x > 195)!;

/** The anomaly's authored orbit, which used to be four `SimConfig` keys. */
const REST_STOP = BODY_TYPES.anomaly.traits.authored!;

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
  /**
   * Every body hopped to and every anomaly claimed during the flight, in order.
   *
   * Accumulated as it happens rather than read off the scorer at the end, because
   * both logs are cleared — `hopped` on the next window opening, `claimed` by
   * `endLife` — and these flights outlive both. The award list used to serve this
   * purpose; F04 deleted the hop and grab awards, so the observable moved into
   * state and the harness has to follow it.
   */
  hopped: string[];
  claimed: string[];
  /** The chain at its highest, which is what a hop actually steps. */
  peakChain: number;
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
  const hopped: string[] = [];
  const claimed: string[] = [];
  let peakChain = 0;

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
    for (const n of sc.hopped) if (!hopped.includes(n)) hopped.push(n);
    for (const n of sc.claimed) if (!claimed.includes(n)) claimed.push(n);
    if (sc.chain > peakChain) peakChain = sc.chain;
  }
  return {
    score: sc,
    awards,
    tallies,
    secondZipped,
    openedWith,
    closedAtTick,
    hopped,
    claimed,
    peakChain,
  };
}

/**
 * The bodies this flight hopped to, in order.
 *
 * It used to be `awards.filter(kind === 'hop')`, and F04 deleted that award: a
 * hop paid a flat 500 and minting is what the constitution bans. What a zip does
 * now is step the CHAIN — "a zip is an engagement, so hops drive it" — so the
 * observable moved from the award list to `ScoreState.hopped`, which is the log
 * the ship's arcs and the closing tally have always read.
 */
const hops = (f: Flight) => f.hopped;

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
    expect(f.claimed.length, 'the first press never took the anomaly').toBeGreaterThan(0);
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
  it('is logged when the glide lands, not when the button goes down', () => {
    const f = fly();
    expect(hops(f)[0], 'the second press never became a hop').toBeDefined();
  });

  it('pays nothing, and steps the chain instead', () => {
    // `hopBonus` was 500 — the second largest number in `ScoreConfig` — and it
    // moved corpus `best` by 0.0% across 27 sessions, because the corpus holds
    // zero zipped captures. That zero is a BLIND SPOT and not a verdict, which is
    // exactly why the axis was re-homed rather than judged: a hop is an
    // engagement, and engagements are what the chain counts.
    const f = fly();
    expect(hops(f).length).toBeGreaterThan(0);
    expect(f.awards.some((a) => a.tick === f.closedAtTick)).toBe(false);
    expect(f.peakChain, 'the hop did not step the chain').toBeGreaterThan(1);
  });

  it('is worth the same on a hot streak as on a cold one', () => {
    // The property the old flat award existed to give, kept for free: reaching an
    // anomaly is hard and usually costs the streak on the way out, so a reward
    // that shrank exactly when it was hardest to earn would be the wrong shape.
    // A chain step is the same step whatever the streak is doing.
    const cold = fly();
    const hot = fly(DEFAULT_CONFIG, 650, (t, _s, sc) => {
      if (t === 300) sc.streak = 999;
    });
    expect(hot.peakChain).toBe(cold.peakChain);
  });

  it('never replaces a release, so flying well is still what pays', () => {
    // The old flat hop REPLACED the grab award for the capture it landed on, and
    // the objection was that it stopped rewarding skill; the answer then was that
    // the release still scored. Nothing replaces anything now — a zip is an
    // engagement like any other, so the capture it opens is released and graded
    // exactly as a flown one is.
    //
    // Its points are zero, and that is the constitution rather than a bug: this
    // fixture flies SIDEWAYS to reach the anomaly (`vy` is 0 at the spawn), so it
    // covers no ground, and progress is the only base currency.
    const f = fly();
    const link = f.awards.find((a) => a.kind === 'link');
    expect(link, 'the hopped capture was never released').toBeDefined();
    expect(link!.tier).toBeGreaterThanOrEqual(1);
    expect(link!.band).toBeGreaterThanOrEqual(1);
  });
});

describe('what a hop refuses to count', () => {
  it('pays a body once per window, however many times it is hopped to', () => {
    // Without this the optimal line inside a window is to bounce on one planet: a
    // press-glide-release cycle is about 1.2s, so the same body would pay three
    // times without the ship going anywhere — in a game whose whole subject is
    // climbing. The zip is never refused; it just stops minting.
    const plain = fly();
    const body = hops(plain)[0]!;

    const f = fly(DEFAULT_CONFIG, 650, (t, _state, sc) => {
      // Already hopped to it this window.
      if (t === 300 && !sc.hopped.includes(body)) sc.hopped.push(body);
    });
    expect(hops(f)).toEqual([body]);
    // Still a capture, and still an engagement.
    expect(f.secondZipped).toBe(true);
  });

  it('records what has been hopped while the window is still running', () => {
    // Sampled DURING the window, not at the end of the flight: `endLife` clears
    // the log, and a flight long enough to outlast a seven-second window is long
    // enough to end in a death.
    let during: string[] = [];
    const f = fly(DEFAULT_CONFIG, 650, (t, _state, sc) => {
      if (t === 400) during = [...sc.hopped];
    });
    expect(during).toContain(hops(f)[0]!);
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
    expect(DEFAULT_CONFIG.chargedOrbitR).toBeLessThan(REST_STOP.orbitR);
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
  function expire(hopCarry: number, hopped: string[]) {
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.ship.vx = 0;
    state.ship.vy = -DEFAULT_CONFIG.cruise;
    state.chargedT = 0.05;
    sc.wasCharged = true;
    sc.hopCarry = hopCarry;
    sc.hopped.push(...hopped);
    sc.bank = 4242;
    const tallies: Tally[] = [];
    for (let t = 0; t < 30; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      const out = scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      if (out.tally) tallies.push(out.tally);
    }
    expect(state.ending.active, 'the ship died before the window expired').toBe(false);
    return { sc, tallies };
  }

  it('reports what the window carried when the timer runs out', () => {
    const { tallies } = expire(1500, ['P1', 'P2', 'P3']);
    expect(tallies).toHaveLength(1);
    // At least the seeded figure: the ship is still climbing while the last of the
    // window runs out, and those metres belong to the window too.
    expect(tallies[0]!.points).toBeGreaterThanOrEqual(1500);
    expect(tallies[0]!.hops).toBe(3);
  });

  it('restates carry already accrued, and pays nothing itself', () => {
    // Display only, and it always was — but what it restates changed with the
    // economy. It used to sum the flat 500 each hop had been paid; hops pay
    // nothing now, so what a frenzy is worth is the ground it covered at a chain
    // that stepped on every body it touched. Still at stake, still cashed by the
    // next release, still not banked here.
    const { sc, tallies } = expire(1500, ['P1', 'P2', 'P3']);
    expect(tallies).toHaveLength(1);
    expect(sc.bank, 'the tally moved the score').toBe(4242);
  });

  it('fires once, not on every tick after the window', () => {
    const { tallies } = expire(1500, ['P1']);
    expect(tallies).toHaveLength(1);
  });

  it('tracks the carry the window is building', () => {
    // The integration half: the running figure must be the ground covered while
    // the window was open, and it must climb as the ship does.
    //
    // Measured on a ship flying UP rather than on the flight above, which crosses
    // the field sideways to reach its anomaly and therefore covers no ground at
    // all. That is the constitution working — progress is the only base currency —
    // and it makes that flight the wrong instrument for this question.
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.ship.vx = 0;
    state.ship.vy = -DEFAULT_CONFIG.cruise;
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    let early = -1;
    let late = -1;
    for (let t = 0; t < 90; t++) {
      stepSim(state, DEFAULT_CONFIG, { held: false, pressed: false, released: false }, FIXED_DT);
      scoreTick(sc, state, DEFAULT_CONFIG, FIXED_DT);
      if (t === 30) early = sc.hopCarry;
      if (t === 80) late = sc.hopCarry;
    }
    expect(early, 'the window built no carry at all').toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
  });

  it('says nothing when the window ends in a crash', () => {
    // A total for a frenzy that ended in a wall is a consolation prize nobody
    // asked for. `endLife` clears the edge so the falling edge is never seen.
    const state = createInitialState(DEFAULT_CONFIG);
    const sc = createScoreState();
    state.chargedT = DEFAULT_CONFIG.chargedSecs;
    sc.wasCharged = true;
    sc.hopCarry = 1500;
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
    // The ship is still climbing, so the window did accrue carry — the tally is
    // gated on the HOPS as well, because a receipt for the flying that was going
    // to happen anyway is not a receipt for a frenzy.
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
  });
});
