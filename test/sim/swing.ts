/**
 * The headless sweep harness: fly a swing, and report only what can be seen
 * from outside it.
 *
 * Spec [01](../../docs/spec/01-swing.md) states every characteristic of the
 * swing as an observable — a position, a speed, a time, an angle, a ratio — and
 * [ADR-0013](../../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)
 * rules that one which can only be checked by reaching inside is specified
 * wrong. So the only thing read from the simulation beyond the craft's position
 * and velocity is **whether the swing has frozen yet** — a question about which
 * phase the swing is in, which the renderer will have to ask too, and not a
 * number from inside either record. Everything else, the freeze's own clock
 * included, is counted here.
 *
 * The boost is the sharpest case and sets the pattern. Spec 01 §7 fixes the
 * whole envelope as **exit speeds and nothing else**: *"release the same swing
 * at successive ticks and measure how much faster each release leaves than the
 * orbital speed at its own release radius."* [`fly`](#fly) does exactly that —
 * at every tick it forks the world, lets go in the fork, and records how much
 * faster the fork left than the craft that held on. **If a test here reads a
 * boost variable it is written wrong.**
 *
 * Geometry is stated in **prototype units**, because that is what every figure
 * in spec 01 is stated in and a harness that silently rescaled its own inputs
 * would make each tolerance a conversion away from the sentence it came from.
 * The conversion happens once, on the way in.
 */
import { createBody, floorRadius } from '../../src/sim/body.ts';
import { needsClearance } from '../../src/sim/clearance.ts';
import { createCraft, speedOf } from '../../src/sim/craft.ts';
import { distance } from '../../src/sim/math.ts';
import { release } from '../../src/sim/release.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import { angleOf } from '../../src/sim/trig.ts';
import type { SimState } from '../../src/sim/types.ts';
import { MEDIAN_RADIUS, SCALE, SECONDS_PER_TICK } from '../../src/sim/units.ts';
import { openField } from './fixtures.ts';

/** The field's median body, at the origin, so a radius reads as a distance. */
export const BODY = createBody(0, 0, MEDIAN_RADIUS);
export const FLOOR = floorRadius(BODY);

export const PRESS = { pressed: true };
export const LET_GO = { pressed: false };

/** Prototype units in, design units out — spec 01 §0's single conversion. */
export function scaled(prototypeUnits: number): number {
  return prototypeUnits * SCALE;
}

/** An approach, in the three quantities spec 01 §5a states the envelope in. */
export interface Geometry {
  /** How far from the body's centre the press happens. */
  readonly grabDistance: number;
  /** How fast the craft is going when it presses. */
  readonly approachSpeed: number;
  /** How far the undisturbed line would pass from the body's centre. */
  readonly aim: number;
}

export function geometry(grabDistance: number, approachSpeed: number, aim: number): Geometry {
  return { grabDistance, approachSpeed, aim };
}

/** What one release, taken at this tick, would have been worth. */
export interface Taken {
  /** Ticks since the freeze — the clock spec 01 §7's envelope is dated from. */
  readonly since: number;
  /** How far out the craft was. */
  readonly radius: number;
  /** How fast it was going on the orbit, having held on. */
  readonly onOrbit: number;
  /** How fast it left, having let go. */
  readonly exit: number;
  /**
   * How much faster it left than the orbit it left from — **the boost, as spec
   * 01 §7 defines it**, and the only form any tolerance on the envelope is
   * written in.
   */
  readonly excess: number;
  /** Which way it left, in radians. */
  readonly heading: number;
  /** Where on the orbit it was, as an angle from the body. */
  readonly orbitAngle: number;
  /** How far round the craft has swept since the freeze, unwrapped. */
  readonly swept: number;
}

export interface Swung extends Geometry {
  /** Whether the press was answered at all. */
  readonly grabbed: boolean;
  /** Whether the path needed lifting clear of the floor — spec 01 §4's 54%. */
  readonly lifted: boolean;
  /** Ticks from the press to the freeze, or `null` if the swing never froze. */
  readonly diveTicks: number | null;
  /** The closest the craft came to the body's centre. */
  readonly closest: number;
  /** How fast it was going at the freeze. */
  readonly speedAtFreeze: number;
  /** Spec 01 §7's depth, from the two radii a test can measure. */
  readonly depth: number;
  /** One entry per tick spent on the frozen orbit. */
  readonly taken: readonly Taken[];
}

/** A world that can be flown on without disturbing the one it was copied from. */
function copy(state: SimState): SimState {
  return {
    ...state,
    craft: { ...state.craft },
    dive: state.dive ? { ...state.dive } : null,
    orbit: state.orbit ? { ...state.orbit } : null,
    rng: [...state.rng] as SimState['rng'],
  };
}

/** A craft placed to arrive at `BODY` from the left with the given geometry. */
export function placed(g: Geometry): SimState {
  const out = scaled(g.grabDistance);
  const across = scaled(g.aim);
  const along = -Math.sqrt(Math.max(0, out * out - across * across));
  return createInitialState(
    openField([BODY]),
    createCraft(along, across, scaled(g.approachSpeed), 0),
    1,
  );
}

/**
 * Press, hold for `ticks`, and record what every release along the way would
 * have been worth.
 *
 * The press is a real press through the one verb, not a body pushed into the
 * craft's hands: the grab's own refusals, the clearance and the freeze are all
 * part of what is being measured.
 */
export function fly(g: Geometry, ticks = 300): Swung {
  const state = placed(g);
  const lifted = needsClearance(state.craft, BODY);
  const grabRadius = distance(0, 0, state.craft.x, state.craft.y);

  stepSim(state, PRESS);
  const grabbed = state.heldBody !== null;

  let closest = Infinity;
  let diveTicks: number | null = null;
  let frozenAt = 0;
  let speedAtFreeze = 0;
  let swept = 0;
  let lastAngle = 0;
  const taken: Taken[] = [];

  for (let tick = 2; tick <= ticks; tick++) {
    const radius = distance(0, 0, state.craft.x, state.craft.y);
    if (radius < closest) closest = radius;

    if (state.orbit) {
      const orbitAngle = angleOf(state.craft.x, state.craft.y);
      if (diveTicks === null) {
        diveTicks = tick - 1;
        frozenAt = tick;
        speedAtFreeze = speedOf(state.craft);
        lastAngle = orbitAngle;
      }
      // Unwrapped, so a swing that goes round more than once keeps counting.
      let step = orbitAngle - lastAngle;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      swept += step;
      lastAngle = orbitAngle;

      const onOrbit = speedOf(state.craft);
      const forked = copy(state);
      release(forked);
      stepSim(forked, LET_GO);
      taken.push({
        // Counted here rather than read out of the orbit: the clock spec 01 §7
        // dates the envelope from is a tick count, and a test that took the
        // simulation's word for it could not catch the simulation losing count.
        since: tick - frozenAt,
        radius,
        onOrbit,
        exit: speedOf(forked.craft),
        excess: speedOf(forked.craft) - onOrbit,
        heading: angleOf(forked.craft.vx, forked.craft.vy),
        orbitAngle,
        swept,
      });
    }

    stepSim(state, PRESS);
  }

  const reach = grabRadius - FLOOR;
  return {
    ...g,
    grabbed,
    lifted,
    diveTicks,
    closest,
    speedAtFreeze,
    depth: reach > 0 ? (grabRadius - closest) / reach : 1,
    taken,
  };
}

/** Seconds from the press to the freeze, or `null` if it never froze. */
export function diveSeconds(s: Swung): number | null {
  return s.diveTicks === null ? null : s.diveTicks * SECONDS_PER_TICK;
}

/**
 * The arc of release headings reachable while a release is worth at least
 * `fraction` of the most this swing ever pays — spec 01 §11, in degrees.
 *
 * Read entirely from the exit-speed curve, so it measures the window the game
 * actually opens rather than a clock the simulation happens to keep. A swing
 * that pays nothing at all has no fraction of a peak and returns `null`.
 */
export function arcOf(s: Swung, fraction: number): number | null {
  const peak = Math.max(0, ...s.taken.map((t) => t.excess));
  if (peak <= 0) return null;
  const inside = s.taken.filter((t) => t.excess >= peak * fraction - 1e-9);
  if (inside.length < 2) return 0;
  const first = inside[0]!;
  const last = inside[inside.length - 1]!;
  return (Math.abs(last.swept - first.swept) * 180) / Math.PI;
}

/** The `p`th percentile of a set of measurements, by nearest rank. */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.round((p / 100) * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, at))]!;
}

/**
 * The sweep spec 01 §5b's tolerance names: *"grab distance 90 – 350, approach
 * speed 60 – 400, impact parameter 0 – 0.6 of grab distance."*
 */
export const ENVELOPE: readonly Geometry[] = (() => {
  const out: Geometry[] = [];
  for (const d of [90, 130, 180, 240, 300, 350]) {
    for (const v of [60, 100, 150, 200, 260, 330, 400]) {
      for (const f of [0, 0.15, 0.3, 0.45, 0.6]) out.push(geometry(d, v, f * d));
    }
  }
  return out;
})();

/**
 * The sweep spec 01 §11 measured its tension over: *"56 sampled approach
 * geometries spanning grab distances 120 – 350, approach speeds 80 – 260 and
 * impact parameters 0 – 120."* Ninety of them here, against §11's requirement of
 * at least forty.
 */
export const TENSION: readonly Geometry[] = (() => {
  const out: Geometry[] = [];
  for (const d of [120, 160, 200, 250, 300, 350]) {
    for (const v of [80, 130, 180, 220, 260]) {
      for (const b of [0, 60, 120]) out.push(geometry(d, v, b));
    }
  }
  return out;
})();

/** A repeatable stream, so a corpus is the same corpus on every run. */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Draw from a distribution given as percentiles, straight between them. */
function fromPercentiles(u: number, points: readonly (readonly [number, number])[]): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, v0] = points[i]!;
    const [p1, v1] = points[i + 1]!;
    if (u * 100 <= p1 || i === points.length - 2) {
      const f = Math.max(0, Math.min(1, (u * 100 - p0) / (p1 - p0)));
      return v0 + f * (v1 - v0);
    }
  }
  return points[0]![1];
}

/**
 * A stand-in corpus of presses, built from the two distributions spec 01
 * actually measured over real play.
 *
 * **Grab distance** — §3, over 270 real grabs: p05 92, p25 120, p50 150,
 * p75 222, p95 351.
 *
 * **Approach speed** — §8's *exit* speeds: p05 195, p25 274, p50 314, p75 346,
 * p95 411. They are the same distribution, and that is not an assumption:
 * coasting is force-free (§9), so the speed a craft arrives at the next body
 * with is exactly the speed it left the last one with.
 *
 * **Aim** — not measured anywhere in spec 01, and drawn uniform over the
 * approaches a body is reachable from, which is the choice that assumes least.
 * **It is the one input below that is not evidence**, so every percentile this
 * corpus produces is only as good as that choice; where one is asserted, the
 * assertion says so.
 *
 * This is a stand-in and it says so. Spec 01 §13.7 rules that a threshold
 * measured on the prototype should be replaced by a percentile of *this* game's
 * own play the first time there is a corpus of it, which is M1.5's recorded runs
 * and M1.6's flying.
 */
export function corpus(count = 400, seed = 20260827): Geometry[] {
  const distances = [
    [5, 92],
    [25, 120],
    [50, 150],
    [75, 222],
    [95, 351],
  ] as const;
  const speeds = [
    [5, 195],
    [25, 274],
    [50, 314],
    [75, 346],
    [95, 411],
  ] as const;

  const next = stream(seed);
  const out: Geometry[] = [];
  for (let i = 0; i < count; i++) {
    const d = fromPercentiles(next(), distances);
    const v = fromPercentiles(next(), speeds);
    out.push(geometry(d, v, next() * d));
  }
  return out;
}
