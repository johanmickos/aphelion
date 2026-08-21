/**
 * The field must be the same for every player and every replay, and the
 * generated part must continue the authored pattern rather than diverge from it.
 */
import { describe, expect, it } from 'vitest';
import { createBodies, fieldBounds, DESIGN_W } from '../src/sim/world.ts';
import { DEFAULT_CONFIG, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { hypot } from '../src/sim/orbit.ts';

/**
 * The field grouped into rows. A forked row holds two bodies at nearly the same
 * height, so almost every property worth asserting is about rows rather than
 * about consecutive entries in the array.
 */
function rows(cfg: SimConfig) {
  const out: Array<ReturnType<typeof createBodies>> = [];
  for (const b of [...createBodies(cfg)].sort((a, c) => c.y - a.y)) {
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

  it('leaves the prototype config with exactly the authored eight', () => {
    const proto = createBodies(PROTOTYPE_CONFIG);
    expect(proto).toHaveLength(8);
    // The authored layout is the prototype's world and the equality gate compares
    // against it, so retuning the game's field must not touch it.
    expect(proto[0]).toEqual({ kind: 'planet', x: 189, y: 0, R: 46, name: 'P1' });
    expect(Math.min(...proto.map((b) => b.y))).toBeCloseTo(-5.98 * 844, 6);
  });

  it('opens on the authored first body, whose approach is tuned', () => {
    // The spawn sits 84px to its left; generating this one would put a random
    // radius and offset in front of every run's first grab.
    const game = createBodies(DEFAULT_CONFIG);
    expect(game[0]).toEqual(createBodies(PROTOTYPE_CONFIG)[0]);
  });

  it('keeps alternating sides through the single rows', () => {
    // A forked row covers both sides at once, so it is the SINGLE rows that have
    // to keep weaving — a run of them on one side would walk the climb into a
    // wall while every individual gap still looked reasonable.
    const cx = DESIGN_W * 0.5;
    const singles = rows(DEFAULT_CONFIG).filter((r) => r.length === 1);
    for (let i = 1; i < singles.length; i++) {
      const a = Math.sign(singles[i - 1]![0]!.x - cx);
      const b = Math.sign(singles[i]![0]!.x - cx);
      expect(b, `${singles[i]![0]!.name} is on the same side as ${singles[i - 1]![0]!.name}`).toBe(
        -a,
      );
    }
  });

  it('offers two routes on some rows and one on most', () => {
    // The reason rows exist. All singles is the old field, which reads as a line
    // to be followed; all forks would be a corridor with no rhythm to it.
    const rs = rows(DEFAULT_CONFIG);
    const forks = rs.filter((r) => r.length === 2).length;
    expect(forks, 'no row offers a choice').toBeGreaterThan(rs.length * 0.2);
    expect(forks, 'every row offers a choice').toBeLessThan(rs.length * 0.6);
    expect(Math.max(...rs.map((r) => r.length)), 'a row with three bodies').toBe(2);
  });

  it('separates the two lanes of a fork enough to be a choice', () => {
    const cx = DESIGN_W * 0.5;
    for (const r of rows(DEFAULT_CONFIG).filter((x) => x.length === 2)) {
      const [a, b] = [r[0]!, r[1]!];
      expect(Math.sign(a.x - cx), `${a.name} and ${b.name} are on the same side`).toBe(
        -Math.sign(b.x - cx),
      );
      // Far enough apart that the lookahead a press uses has an unambiguous
      // answer, rather than the two lanes reading as one wide obstacle.
      expect(Math.abs(a.x - b.x), `${a.name} and ${b.name} are one obstacle`).toBeGreaterThan(
        DEFAULT_CONFIG.bodySpread,
      );
    }
  });

  it('spaces rows at the configured distance, within jitter', () => {
    const rs = rows(DEFAULT_CONFIG);
    const spacing = DEFAULT_CONFIG.bodySpacing;
    for (let i = 1; i < rs.length; i++) {
      const dy = Math.abs(rowY(rs[i]!) - rowY(rs[i - 1]!));
      expect(dy).toBeGreaterThan(spacing * 0.85);
      expect(dy).toBeLessThan(spacing * 1.15);
    }
  });

  it('puts the next row inside the visible window, so a release can be aimed at it', () => {
    // The point of the spacing: at 280 with a ~323 visible half-height and radii
    // around 44, the next body is on screen while still in orbit around this one.
    // Measured to the NEAREST body of the next row, because that is the one the
    // release is actually aimed at when the row forks.
    const rs = rows(DEFAULT_CONFIG);
    for (let i = 1; i < rs.length; i++) {
      for (const from of rs[i - 1]!) {
        const reach = Math.min(...rs[i]!.map((to) => hypot(from.x - to.x, from.y - to.y) - to.R));
        expect(reach, `nothing is in view from ${from.name}`).toBeLessThan(380);
      }
    }
  });

  it('never overlaps two bodies', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const gap = hypot(a.x - b.x, a.y - b.y) - a.R - b.R;
        expect(gap, `${a.name} overlaps ${b.name}`).toBeGreaterThan(DEFAULT_CONFIG.minOrbitGap * 2);
      }
    }
  });

  it('keeps every body inside the playfield', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const fb = fieldBounds(DEFAULT_CONFIG, bodies);
    for (const b of bodies) {
      expect(b.x - b.R, `${b.name} crosses the left boundary`).toBeGreaterThan(fb.left);
      expect(b.x + b.R, `${b.name} crosses the right boundary`).toBeLessThan(fb.right);
    }
  });

  it('extends the climb rather than just adding bodies', () => {
    const short = createBodies(PROTOTYPE_CONFIG);
    const long = createBodies(DEFAULT_CONFIG);
    const top = (bs: typeof long) => Math.min(...bs.map((b) => b.y));
    expect(top(long)).toBeLessThan(top(short) * 2);
  });
});
