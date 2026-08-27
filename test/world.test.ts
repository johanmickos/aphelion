/**
 * The field must be reconstructible from the recipe, and the generated part must
 * continue the authored pattern rather than diverge from it.
 *
 * Every playability property here is asserted across a SWEEP of seeds, not on
 * the one the game ships with. NEW MAP makes the seed a player choice, so a
 * layout that only works at `0x5eed1e55` is a layout that works by luck — and the
 * single-seed versions of these assertions could not tell the difference.
 */
import { describe, expect, it } from 'vitest';
import { createBodies, fieldBounds, sheltered, DESIGN_W } from '../src/sim/world.ts';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { BODY_TYPES } from '../src/sim/bodies.ts';
import type { SimConfig } from '../src/sim/config.ts';
import type { Body } from '../src/sim/types.ts';
import { mulberry32 } from '../src/sim/rng.ts';
import { hypot } from '../src/sim/orbit.ts';
import type { Anomaly } from '../src/sim/types.ts';

/**
 * The seeds every geometric property is checked against.
 *
 * Drawn from a fixed generator rather than `Math.random`, so a failure names a
 * seed that can be reproduced by hand. The shipped field is first, so the game's
 * own climb is always among the cases and a regression there is not diluted by
 * 63 others.
 *
 * 64 is a runtime choice, not a confidence one: the bounds asserted below were
 * measured over 20,000 seeds and the margins are wide, so this sweep is here to
 * catch a generator that has *changed*, not to explore the tails.
 */
const SEEDS: readonly number[] = (() => {
  const rnd = mulberry32(0xa9f1_e044);
  const out = [DEFAULT_CONFIG.worldSeed];
  while (out.length < 64) out.push((rnd() * 2 ** 32) >>> 0);
  return out;
})();

/**
 * Every swept field, as `[label, config, corridor]`.
 *
 * **Planets only.** Every property below is a statement about the CORRIDOR — how
 * it weaves, how it forks, how far apart its rows sit, that it stays inside the
 * playfield. An anomaly is deliberately none of those things: it sits outside the
 * barrier, off the weave, at no row. Left in the list it reads as a malformed row
 * and fails six of these for being exactly what it is meant to be. Anomalies get
 * their own assertions further down, about the things that ARE true of them.
 */
const FIELDS: ReadonlyArray<[string, SimConfig, ReturnType<typeof createBodies>]> = SEEDS.map(
  (seed) => {
    const cfg: SimConfig = { ...DEFAULT_CONFIG, worldSeed: seed };
    return [`seed ${seed.toString(16)}`, cfg, createBodies(cfg).filter((b) => b.kind === 'planet')];
  },
);

/** Every swept field's anomalies, as `[label, config, anomalies]`. */
const ANOMALY_FIELDS: ReadonlyArray<[string, SimConfig, Anomaly[]]> = SEEDS.map((seed) => {
  const cfg: SimConfig = { ...DEFAULT_CONFIG, worldSeed: seed };
  return [
    `seed ${seed.toString(16)}`,
    cfg,
    createBodies(cfg).filter((b): b is Anomaly => b.kind === 'anomaly'),
  ];
});

/**
 * The field grouped into rows. A forked row holds two bodies at nearly the same
 * height, so almost every property worth asserting is about rows rather than
 * about consecutive entries in the array.
 */
function rows(cfg: SimConfig, bodies = createBodies(cfg)) {
  const out: Array<ReturnType<typeof createBodies>> = [];
  for (const b of [...bodies].sort((a, c) => c.y - a.y)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0]!.y - b.y) < cfg.bodySpacing * 0.5) last.push(b);
    else out.push([b]);
  }
  return out;
}

/**
 * A row's height: the mean of its bodies.
 *
 * A fork leans its two lanes equally and oppositely off the row, so the mean is
 * the row's own height exactly, and row-to-row spacing can be asserted without
 * the lean smearing it.
 */
function rowY(r: ReturnType<typeof createBodies>): number {
  return r.reduce((n, b) => n + b.y, 0) / r.length;
}

describe('world generation', () => {
  it('is deterministic — the same config always builds the same field', () => {
    expect(createBodies(DEFAULT_CONFIG)).toEqual(createBodies(DEFAULT_CONFIG));
  });

  it('is a function of the seed — a different seed is a different field', () => {
    // What NEW MAP relies on, and what a replay relies on in the other
    // direction: the seed is the whole difference between two fields, so a
    // report that carries it carries the world.
    const a = createBodies({ ...DEFAULT_CONFIG, worldSeed: 1 });
    const b = createBodies({ ...DEFAULT_CONFIG, worldSeed: 2 });
    expect(a).not.toEqual(b);
    expect(createBodies({ ...DEFAULT_CONFIG, worldSeed: 1 })).toEqual(a);
    // The opener is authored, so it is the one body the seed must NOT move.
    expect(a[0]).toEqual(b[0]);
  });

  it('leaves the prototype config with exactly the authored eight', () => {
    const proto = createBodies(PROTOTYPE_CONFIG);
    expect(proto).toHaveLength(8);
    // The authored layout is the prototype's world and the equality gate compares
    // against it, so retuning the game's field must not touch it.
    expect(proto[0]).toEqual({
      kind: 'planet',
      x: 189,
      y: 0,
      R: 46,
      name: 'P1',
      traits: BODY_TYPES.planet.traits,
    });
    expect(Math.min(...proto.map((b) => b.y))).toBeCloseTo(-5.98 * 844, 6);
  });

  it('ignores the seed entirely when the layout is authored', () => {
    // `worldSeed` is unread under PROTOTYPE_CONFIG, which is what keeps it out of
    // the equality gate's way: the prototype's eight are placed by hand.
    expect(createBodies({ ...PROTOTYPE_CONFIG, worldSeed: 999 })).toEqual(
      createBodies(PROTOTYPE_CONFIG),
    );
  });

  it('opens on the authored first body, whose approach is tuned', () => {
    // The spawn sits 84px to its left; generating this one would put a random
    // radius and offset in front of every run's first grab.
    for (const [label, , bodies] of FIELDS) {
      expect(bodies[0], label).toEqual(createBodies(PROTOTYPE_CONFIG)[0]);
    }
  });

  it('keeps alternating sides through the single rows', () => {
    // A forked row covers both sides at once, so it is the SINGLE rows that have
    // to keep weaving — a run of them on one side would walk the climb into a
    // wall while every individual gap still looked reasonable.
    const cx = DESIGN_W * 0.5;
    for (const [label, cfg, bodies] of FIELDS) {
      const singles = rows(cfg, bodies).filter((r) => r.length === 1);
      for (let i = 1; i < singles.length; i++) {
        const a = Math.sign(singles[i - 1]![0]!.x - cx);
        const b = Math.sign(singles[i]![0]!.x - cx);
        expect(
          b,
          `${label}: ${singles[i]![0]!.name} is on the same side as ${singles[i - 1]![0]!.name}`,
        ).toBe(-a);
      }
    }
  });

  it('offers two routes on some rows and one on most, at every seed', () => {
    // The reason rows exist. All singles is the old field, which reads as a line
    // to be followed; all forks would be a corridor with no rhythm to it.
    //
    // The band is per-seed and deliberately wide. How many rows fork is a
    // binomial draw at `rowPairChance` over ~43 rows, so its spread is a property
    // of the generator being random rather than a defect: measured over 20,000
    // seeds the fraction runs 0.132 to 0.714, and 0.76% of seeds fall outside the
    // 0.2-0.6 this test asserted when it only ever ran one field. Those seeds are
    // legitimate climbs, not broken ones. The mean is checked separately below,
    // which is where a real change to the fork rate would show up.
    for (const [label, cfg, bodies] of FIELDS) {
      const rs = rows(cfg, bodies);
      const forks = rs.filter((r) => r.length === 2).length;
      expect(forks / rs.length, `${label}: no row offers a choice`).toBeGreaterThan(0.05);
      expect(forks / rs.length, `${label}: nearly every row offers a choice`).toBeLessThan(0.8);
      expect(Math.max(...rs.map((r) => r.length)), `${label}: a row with three bodies`).toBe(2);
    }
  });

  it('forks about as often as rowPairChance says, averaged over seeds', () => {
    // The distribution assertion the per-seed band above cannot make. Measured
    // mean over 20,000 seeds is 0.387 against a `rowPairChance` of 0.4 — slightly
    // under, because a fork consumes two of a fixed body count and so ends the
    // field in fewer rows. A change to the fork rate moves this; an unlucky seed
    // does not.
    const fracs = FIELDS.map(([, cfg, bodies]) => {
      const rs = rows(cfg, bodies);
      return rs.filter((r) => r.length === 2).length / rs.length;
    });
    const mean = fracs.reduce((a, b) => a + b, 0) / fracs.length;
    expect(mean).toBeGreaterThan(DEFAULT_CONFIG.rowPairChance - 0.08);
    expect(mean).toBeLessThan(DEFAULT_CONFIG.rowPairChance + 0.08);
  });

  it('separates the two lanes of a fork enough to be a choice', () => {
    const cx = DESIGN_W * 0.5;
    for (const [label, cfg, bodies] of FIELDS) {
      for (const r of rows(cfg, bodies).filter((x) => x.length === 2)) {
        const [a, b] = [r[0]!, r[1]!];
        expect(Math.sign(a.x - cx), `${label}: ${a.name} and ${b.name} are on the same side`).toBe(
          -Math.sign(b.x - cx),
        );
        // Far enough apart that the lookahead a press uses has an unambiguous
        // answer, rather than the two lanes reading as one wide obstacle.
        expect(
          Math.abs(a.x - b.x),
          `${label}: ${a.name} and ${b.name} are one obstacle`,
        ).toBeGreaterThan(cfg.bodySpread);
      }
    }
  });

  it('spaces rows at the configured distance, within jitter', () => {
    for (const [label, cfg, bodies] of FIELDS) {
      const rs = rows(cfg, bodies);
      const spacing = cfg.bodySpacing;
      for (let i = 1; i < rs.length; i++) {
        const dy = Math.abs(rowY(rs[i]!) - rowY(rs[i - 1]!));
        expect(dy, label).toBeGreaterThan(spacing * 0.85);
        expect(dy, label).toBeLessThan(spacing * 1.15);
      }
    }
  });

  it('puts the next row inside the visible window, so a release can be aimed at it', () => {
    // The point of the spacing: at 280 with a ~323 visible half-height and radii
    // around 44, the next body is on screen while still in orbit around this one.
    // Measured to the NEAREST body of the next row, because that is the one the
    // release is actually aimed at when the row forks.
    //
    // This is the tightest of the swept properties — the worst seed of 20,000
    // reaches 370 against the 380 asserted here — so it is also the one most
    // worth sweeping. Widening `bodySpacing`, `bodyWeave` or `bodySpread` will
    // break this at some seed before it breaks at the shipped one.
    for (const [label, cfg, bodies] of FIELDS) {
      const rs = rows(cfg, bodies);
      for (let i = 1; i < rs.length; i++) {
        for (const from of rs[i - 1]!) {
          const reach = Math.min(...rs[i]!.map((to) => hypot(from.x - to.x, from.y - to.y) - to.R));
          expect(reach, `${label}: nothing is in view from ${from.name}`).toBeLessThan(380);
        }
      }
    }
  });

  it('never overlaps two bodies', () => {
    for (const [label, cfg, bodies] of FIELDS) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]!;
          const b = bodies[j]!;
          const gap = hypot(a.x - b.x, a.y - b.y) - a.R - b.R;
          expect(gap, `${label}: ${a.name} overlaps ${b.name}`).toBeGreaterThan(
            cfg.minOrbitGap * 2,
          );
        }
      }
    }
  });

  it('keeps every body inside the playfield', () => {
    for (const [label, cfg, bodies] of FIELDS) {
      const fb = fieldBounds(cfg, bodies);
      for (const b of bodies) {
        expect(b.x - b.R, `${label}: ${b.name} crosses the left boundary`).toBeGreaterThan(fb.left);
        expect(b.x + b.R, `${label}: ${b.name} crosses the right boundary`).toBeLessThan(fb.right);
      }
    }
  });

  it('extends the climb rather than just adding bodies', () => {
    // How tall the field ends up is seed-dependent, because a fork spends two of
    // the fixed `bodyCount` on a single row: measured over 20,000 seeds the climb
    // runs 1.88x to 2.91x the prototype's height, median 2.35x. So the bound is
    // 1.7x rather than the 2x that held when there was only one field to check —
    // the point of the assertion is that bodies are buying HEIGHT rather than
    // being packed into the same stretch, and every seed clears that by a margin.
    const short = createBodies(PROTOTYPE_CONFIG);
    const top = (bs: ReturnType<typeof createBodies>) => Math.min(...bs.map((b) => b.y));
    for (const [label, , bodies] of FIELDS) {
      expect(top(bodies), label).toBeLessThan(top(short) * 1.7);
    }
  });
});

/**
 * Anomalies: the things that ARE true of a body placed outside the corridor.
 *
 * The corridor sweep above deliberately excludes them, so without this block they
 * would be generated and never checked at all.
 */
describe('anomalies', () => {
  it('places the configured number, on alternating sides', () => {
    for (const [label, cfg, anomalies] of ANOMALY_FIELDS) {
      expect(anomalies, label).toHaveLength(cfg.anomalyCount);
      const cx = DESIGN_W * 0.5;
      for (let i = 1; i < anomalies.length; i++) {
        const prev = Math.sign(anomalies[i - 1]!.x - cx);
        const here = Math.sign(anomalies[i]!.x - cx);
        expect(here, `${label}: ${anomalies[i]!.name} repeats a side`).toBe(-prev);
      }
    }
  });

  it('sits outside the barrier, which is the entire point', () => {
    // Inside the corridor an anomaly is just an oddly-coloured planet and the
    // barrier crossing — the whole feeling — never happens.
    for (const [label, cfg, anomalies] of ANOMALY_FIELDS) {
      const fb = fieldBounds(cfg, createBodies(cfg));
      for (const a of anomalies) {
        const outside = a.x < fb.left || a.x > fb.right;
        expect(outside, `${label}: ${a.name} is inside the corridor`).toBe(true);
      }
    }
  });

  it('projects a bubble that reaches back inside the barrier', () => {
    // The load-bearing relationship between the anomaly type's `shelter` and its
    // `wallOffset` — which is why both live in `BODY_TYPES` rather than being split
    // across a table and a config with nowhere to state the pairing.
    // If the bubble does not overlap the wall, the wall kills the ship before the
    // exemption starts and the mechanic simply does not work. Asserted as a real
    // margin rather than as mere contact, so a ship crosses already protected.
    for (const [label, cfg, anomalies] of ANOMALY_FIELDS) {
      const fb = fieldBounds(cfg, createBodies(cfg));
      for (const a of anomalies) {
        const wall = a.x < 0 ? fb.left : fb.right;
        expect(
          sheltered(wall, a.y, [a]),
          `${label}: ${a.name}'s bubble does not reach its barrier`,
        ).toBe(true);
        const reach = a.traits.shelter - Math.abs(a.x - wall);
        expect(
          reach,
          `${label}: ${a.name} only reaches ${reach.toFixed(0)}px inside`,
        ).toBeGreaterThan(100);
      }
    }
  });

  it('leaves the far side of every bubble reachable and fatal', () => {
    // The soft-lock guard. `driftAccel` is zero, so a ship exempted from a bound
    // with nothing beyond it flies straight forever and only a reset escapes.
    // Every bubble must therefore END, and outside it the boundary must bite.
    for (const [label, cfg, anomalies] of ANOMALY_FIELDS) {
      const all = createBodies(cfg);
      const fb = fieldBounds(cfg, all);
      for (const a of anomalies) {
        const outward = a.x < 0 ? -1 : 1;
        const beyond = a.x + outward * (a.traits.shelter + 1);
        expect(sheltered(beyond, a.y, all), `${label}: ${a.name}'s bubble has no far side`).toBe(
          false,
        );
        const dead = beyond < fb.left - 4 || beyond > fb.right + 4;
        expect(dead, `${label}: past ${a.name}'s bubble is still in bounds`).toBe(true);
      }
    }
  });

  it('never overlaps a planet, or another anomaly', () => {
    for (const [label, , all] of SEEDS.map(
      (seed) =>
        [
          `seed ${seed.toString(16)}`,
          seed,
          createBodies({ ...DEFAULT_CONFIG, worldSeed: seed }),
        ] as const,
    )) {
      const anomalies = all.filter((b) => b.kind === 'anomaly');
      for (const a of anomalies) {
        for (const b of all) {
          if (b === a) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          expect(d, `${label}: ${a.name} overlaps ${b.name}`).toBeGreaterThan(a.R + b.R + 24);
        }
      }
    }
  });

  it('generates the same corridor whether or not anomalies are on', () => {
    // Anomalies are drawn from the shared `rnd` AFTER the corridor, so a seed's
    // corridor must be identical with them off. Without this the two cannot be
    // compared, and turning them off would silently be a different game.
    for (const seed of SEEDS.slice(0, 12)) {
      const on = createBodies({ ...DEFAULT_CONFIG, worldSeed: seed }).filter(
        (b) => b.kind === 'planet',
      );
      const off = createBodies({ ...DEFAULT_CONFIG, worldSeed: seed, anomalyCount: 0 });
      expect(off, `seed ${seed.toString(16)}`).toEqual(on);
    }
  });
});

describe('the dev-server anomaly (anomalyAtSpawn)', () => {
  const off = createBodies(DEFAULT_CONFIG);
  const on = createBodies({ ...DEFAULT_CONFIG, anomalyAtSpawn: true });
  const anomalies = (bs: readonly Body[]) => bs.filter((b) => b.kind === 'anomaly');

  it('is off in the shipped config, and only the dev shell turns it on', () => {
    // `placeAnomalies` skips the bottom eighth of the field on purpose: an anomaly
    // beside the opening bodies asks for the commit before the player has a
    // corridor rhythm to break away from.
    expect(DEFAULT_CONFIG.anomalyAtSpawn).toBe(false);
    expect(PROTOTYPE_CONFIG.anomalyAtSpawn).toBe(false);
  });

  it('brings the first anomaly level with the opening body', () => {
    const opener = off.find((b) => b.name === 'P1')!;
    expect(anomalies(off)[0]!.y).toBeLessThan(opener.y - 1000);
    expect(anomalies(on)[0]!.y).toBeCloseTo(opener.y, 6);
    // Still outside the corridor: it is a dev convenience, not a different body.
    expect(Math.abs(anomalies(on)[0]!.x - opener.x)).toBeGreaterThan(200);
  });

  it('leaves the corridor and the other anomalies exactly where they were', () => {
    // The whole reason the position is overridden inside the loop rather than
    // branched around it: `rnd()` must be called the same number of times in the
    // same order, or the flag silently generates a different field.
    const planets = (bs: readonly Body[]) => bs.filter((b) => b.kind === 'planet');
    expect(planets(on)).toEqual(planets(off));
    expect(anomalies(on).slice(1)).toEqual(anomalies(off).slice(1));
    // And the moved one differs in nothing but its height.
    expect({ ...anomalies(on)[0]!, y: 0 }).toEqual({ ...anomalies(off)[0]!, y: 0 });
  });
});
