/**
 * Walking a run: which tick a grab happened on, what the geometry was, and
 * where on the envelope a release fell.
 *
 * A recipe replays a run; this is what makes the replay something two people can
 * point at. The author says *"the grab feels late off the second body"* and this
 * says that the second body was grabbed on tick 812 at 412 units out, froze 21
 * ticks later and was let go of 55 ticks after that, on the plateau — so the
 * sentence and the run can be compared instead of remembered.
 *
 * **Everything here is read from outside the simulation.** `test/sim/swing.ts`
 * and `test/sim/run.ts` hold the same line and for the same reason
 * ([ADR-0013](../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)):
 * a reading that requires reaching inside is the wrong reading, and a reader
 * welded to a field name forbids the refactor it should have survived. So the
 * geometry is measured from positions this file kept, the freeze's own clock is
 * counted here rather than read off the orbit, and the only questions asked of
 * the simulation are the two `swing.ts` and `run.ts` already allow themselves —
 * *is a body held* and *has the swing frozen* — which are questions about which
 * phase the swing is in rather than numbers out of a record.
 *
 * **The picture is walked beside the run**, which is the other half of the point.
 * ADR-0006 promises that a frame is a pure function of `(recipe, tick)`, and
 * since [ADR-0015](../docs/adr/0015-presentation-state-carries-what-decays.md)
 * presentation state is a recurrence — `derive(previous, sim)`, seeded by
 * `createPresentation` and evaluated exactly once per tick. So it is derived
 * here in the replay's own loop, from tick zero, and never on demand: arriving
 * at tick 412 is not the same as asking about it. That is what lets a trail say
 * where the camera was without a canvas ever having existed.
 */
import { createHash } from 'node:crypto';
import type { Dispatch, DispatchTiming } from './dispatch.ts';
import { bucketAt, bucketCount } from './meter.ts';
import type { Bucketed } from './meter.ts';
import { floorRadius } from '../src/sim/body.ts';
import { speedOf } from '../src/sim/craft.ts';
import { distance, magnitude } from '../src/sim/math.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { pressAt } from '../src/sim/recipe.ts';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import type { Ending, SimState, Tick } from '../src/sim/types.ts';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  SECONDS_PER_TICK,
} from '../src/sim/units.ts';
import { createPresentation, derive } from '../src/state/derive.ts';

/**
 * Where on the boost envelope a release fell — spec
 * [01 · §7](../docs/spec/01-swing.md)'s shape in words.
 *
 * Named rather than left as a tick count because the tick count means nothing
 * without the three thresholds beside it, and the whole reason to read a trail
 * is to compare it against a sentence somebody said out loud.
 */
export type EnvelopeBand = 'unarmed' | 'plateau' | 'decaying' | 'expired';

export function envelopeBand(sinceFreeze: number): EnvelopeBand {
  if (sinceFreeze < BOOST_ARM_TICKS) return 'unarmed';
  if (sinceFreeze <= BOOST_PLATEAU_TICKS) return 'plateau';
  if (sinceFreeze <= BOOST_ZERO_TICKS) return 'decaying';
  return 'expired';
}

/** One press and what came of it. */
export interface Swing {
  /** The tick the button went down. */
  readonly pressedAt: Tick;
  /**
   * The body it took, by `CONTEXT.md`'s **address** — its altitude number,
   * bottom to top — or `null` for a press nothing answered.
   */
  readonly address: number | null;
  /** How far from the body's centre the press happened. */
  readonly grabRadius: number;
  /** How fast the craft was going at it. */
  readonly approachSpeed: number;
  /** The tick the swing froze onto an orbit, or `null` if it never did. */
  readonly frozenAt: Tick | null;
  /** The closest the craft came to the body's centre. */
  readonly periapsis: number;
  /** That body's floor — the closest it was ever allowed to come. */
  readonly floor: number;
  /** How far the dive committed, from the grab toward the floor. */
  readonly depth: number;
  /** The tick the button came up, or `null` if the run ended still holding. */
  readonly releasedAt: Tick | null;
  /** Ticks between the freeze and the release — the envelope's own clock. */
  readonly sinceFreeze: number | null;
  readonly envelope: EnvelopeBand | null;
  /** How fast it left. */
  readonly exitSpeed: number | null;
}

/** What one particular tick was doing — the answer to "what happened at 1420?" */
export interface Moment {
  readonly tick: Tick;
  readonly phase: 'coasting' | 'diving' | 'orbiting';
  /** The address of the body held, or `null` while coasting. */
  readonly address: number | null;
  readonly sinceGrab: number | null;
  readonly sinceFreeze: number | null;
  readonly envelope: EnvelopeBand | null;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  /** Where the picture was looking, derived beside the run from tick zero. */
  readonly camera: { readonly x: number; readonly y: number };
}

export interface Trail {
  readonly recipe: Recipe;
  /** Ticks actually flown, which is fewer than the recipe's if the run ended. */
  readonly ticks: Tick;
  readonly ending: Ending | null;
  readonly swings: readonly Swing[];
  /** Presses nothing answered — spec 01 §3 counts 8 of them in 278. */
  readonly refused: number;
  /** How much altitude the run kept, in design units. */
  readonly climbed: number;
  /** The moments asked about, in the order they were asked for. */
  readonly moments: readonly Moment[];
  readonly craft: { readonly x: number; readonly y: number; readonly speed: number };
  readonly camera: { readonly x: number; readonly y: number };
  /** The final state's bytes, digested — what two replays are compared on. */
  readonly fingerprint: string;
}

/** The whole simulation state as one short string, for saying whether two agree. */
export function fingerprint(state: SimState): string {
  return createHash('sha256').update(snapshot(state)).digest('hex').slice(0, 16);
}

interface OpenSwing {
  pressedAt: Tick;
  address: number;
  grabRadius: number;
  approachSpeed: number;
  frozenAt: Tick | null;
  periapsis: number;
  floor: number;
}

/**
 * Fly the recipe and report what could be seen from outside it.
 *
 * `describe` names ticks worth a sentence of their own — the ones the author
 * flagged while flying, or one an agent is asking about.
 */
export function walkRun(recipe: Recipe, describe: readonly Tick[] = []): Trail {
  const wanted = new Set(describe);
  const opening = openRun(recipe);
  const bodies = opening.field.bodies;
  const spawn = opening.craft.y;

  let view = createPresentation(opening);
  // The craft as it was at the start of the tick being flown, so the geometry a
  // press is measured at is the geometry the press saw.
  let from = { x: opening.craft.x, y: opening.craft.y, vx: opening.craft.vx, vy: opening.craft.vy };
  let heldBefore: number | null = null;
  let pressedBefore = false;
  let highest = spawn;
  let refused = 0;
  let open: OpenSwing | null = null;
  const swings: Swing[] = [];
  const moments: Moment[] = [];

  const closeSwing = (
    swing: OpenSwing,
    releasedAt: Tick | null,
    exitSpeed: number | null,
  ): void => {
    const reach = swing.grabRadius - swing.floor;
    const sinceFreeze =
      swing.frozenAt === null || releasedAt === null ? null : releasedAt - swing.frozenAt;
    swings.push({
      pressedAt: swing.pressedAt,
      address: swing.address,
      grabRadius: swing.grabRadius,
      approachSpeed: swing.approachSpeed,
      frozenAt: swing.frozenAt,
      periapsis: swing.periapsis,
      floor: swing.floor,
      depth: reach > 0 ? Math.min(Math.max((swing.grabRadius - swing.periapsis) / reach, 0), 1) : 1,
      releasedAt,
      sinceFreeze,
      envelope: sinceFreeze === null ? null : envelopeBand(sinceFreeze),
      exitSpeed,
    });
  };

  const described = new Set<Tick>();
  const momentAt = (tick: Tick, state: SimState): Moment => {
    const held = state.heldBody;
    const sinceFreeze = open !== null && open.frozenAt !== null ? tick - open.frozenAt : null;
    return {
      tick,
      phase: held === null ? 'coasting' : state.orbit !== null ? 'orbiting' : 'diving',
      address: held === null ? null : held + 1,
      sinceGrab: open === null ? null : tick - open.pressedAt,
      sinceFreeze,
      envelope: sinceFreeze === null ? null : envelopeBand(sinceFreeze),
      x: state.craft.x,
      y: state.craft.y,
      speed: speedOf(state.craft),
      camera: { x: view.camera.x, y: view.camera.y },
    };
  };

  // **The last tick anything actually asks the picture about.** Presentation
  // state is a recurrence (ADR-0015), so tick 412's camera can only be had by
  // arriving there from zero — but past the last tick anybody wants, deriving is
  // dead work. With nothing flagged, which is the common case and the bench's,
  // it is dead work for the whole run.
  //
  // It is worth a guard rather than a shrug because of **who calls this in a
  // loop**: `tools/bench/entry.ts` rebuilds the trail on every release, inside
  // the frame callback. Measured over a 1 141-tick run, that is 9.0ms of work
  // on the frame the player just let go on — more than a whole frame at 120Hz,
  // growing with the run, and landing on the one frame they are looking at.
  // Without the derive the same walk is **0.37ms**, and nearly flat in the run's
  // length rather than linear in it.
  const lastDescribed = wanted.size === 0 ? -1 : Math.max(...wanted);

  const final = replayRun(recipe, {
    onTick: (state, tick) => {
      // Once per tick, in the replay's own loop — ADR-0015's first rule, and the
      // reason the camera below is the camera the phone drew.
      if (tick <= lastDescribed) view = derive(view, state);

      const pressed = pressAt(recipe.log, tick);
      if (pressed && !pressedBefore) {
        const took = state.heldBody;
        if (took === null) {
          // A press nothing answered. It stays spent: `stepSim` attempts a grab
          // on the edge only, so a refused press is a decision that missed
          // rather than a button that keeps trying.
          refused += 1;
        } else {
          const body = bodies[took]!;
          open = {
            pressedAt: tick,
            address: took + 1,
            grabRadius: distance(from.x, from.y, body.x, body.y),
            approachSpeed: magnitude(from.vx, from.vy),
            frozenAt: null,
            periapsis: Infinity,
            floor: floorRadius(body),
          };
        }
      }

      if (state.heldBody !== null && open !== null) {
        const body = bodies[state.heldBody]!;
        const radius = distance(state.craft.x, state.craft.y, body.x, body.y);
        if (radius < open.periapsis) open.periapsis = radius;
        if (state.orbit !== null && open.frozenAt === null) open.frozenAt = tick;
      }

      if (heldBefore !== null && state.heldBody === null && open !== null) {
        closeSwing(open, tick, speedOf(state.craft));
        open = null;
      }

      if (state.craft.y < highest) highest = state.craft.y;

      if (wanted.has(tick)) {
        moments.push(momentAt(tick, state));
        described.add(tick);
      }

      pressedBefore = pressed;
      heldBefore = state.heldBody;
      from = { x: state.craft.x, y: state.craft.y, vx: state.craft.vx, vy: state.craft.vy };
    },
  });

  // A run that ended while holding never let go, and the swing it died on is
  // still worth reporting: it is usually the one the author is talking about.
  if (open !== null) closeSwing(open, null, null);

  // **A flag on the death itself lands one tick past the last one flown**, and
  // it is the most natural thing in the world to flag: the loop above describes
  // ticks 0 to `final.tick - 1`, while the FLAG control stamps `sim.tick`, which
  // has already become `final.tick` by the time the run has an ending. So that
  // one is described from the state the run stopped in, rather than dropped for
  // an off-by-one nobody holding a phone could have known about.
  for (const tick of describe) {
    if (!described.has(tick) && tick === final.tick) moments.push(momentAt(tick, final));
  }

  return {
    recipe,
    ticks: final.tick,
    ending: final.ending,
    swings,
    refused,
    climbed: spawn - highest,
    moments,
    craft: { x: final.craft.x, y: final.craft.y, speed: speedOf(final.craft) },
    camera: { x: view.camera.x, y: view.camera.y },
    fingerprint: fingerprint(final),
  };
}

const seconds = (ticks: number): string => `${(ticks * SECONDS_PER_TICK).toFixed(1)}s`;
const num = (value: number, places = 0): string => value.toFixed(places);
const cell = (text: string, width: number): string => text.padStart(width);

/**
 * The trail as a table, in the shape `formatDiagReport` set: aligned, printed to
 * the terminal beside the file, and carrying no conclusion the numbers do not.
 */
export function formatTrail(trail: Trail): string[] {
  const r = trail.recipe;
  const out: string[] = [
    '',
    `  \x1b[1m▼ run · ${r.field.generator} field v${r.field.version} · seed ${r.seed} · ` +
      `${trail.ticks} ticks (${seconds(trail.ticks)})\x1b[0m`,
    `  \x1b[2m${r.log.length} edges · ${trail.swings.length} swings · ${trail.refused} refused · ` +
      `climbed ${num(trail.climbed)} · state ${trail.fingerprint}\x1b[0m`,
    '',
  ];

  if (trail.swings.length) {
    out.push(
      '  swing  press  body     grab  approach    froze  periapsis  depth   let go  since  ' +
        'envelope    exit',
    );
    trail.swings.forEach((swing, index) => {
      const froze = swing.frozenAt === null ? '—' : `+${swing.frozenAt - swing.pressedAt}`;
      out.push(
        `  ${cell(String(index + 1), 5)}  ${cell(String(swing.pressedAt), 5)}  ` +
          `${cell(`#${swing.address}`, 4)}  ${cell(num(swing.grabRadius), 7)}  ` +
          `${cell(num(swing.approachSpeed), 8)}  ${cell(froze, 7)}  ` +
          `${cell(num(swing.periapsis), 9)}  ${cell(num(swing.depth, 2), 5)}  ` +
          `${cell(swing.releasedAt === null ? 'held' : String(swing.releasedAt), 7)}  ` +
          `${cell(swing.sinceFreeze === null ? '—' : `+${swing.sinceFreeze}`, 5)}  ` +
          `${swing.envelope === null ? '—' : swing.envelope}`.padEnd(12) +
          `${cell(swing.exitSpeed === null ? '—' : num(swing.exitSpeed), 4)}`,
      );
    });
    out.push('');
  }

  for (const moment of trail.moments) {
    const where =
      moment.phase === 'coasting'
        ? 'coasting'
        : moment.phase === 'diving'
          ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
          : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
    out.push(
      `  \x1b[1mtick ${moment.tick}\x1b[0m (${seconds(moment.tick)})  ${where}` +
        `  ·  ${num(moment.speed)}/s at ${num(moment.x)}, ${num(moment.y)}` +
        `  ·  camera ${num(moment.camera.x)}, ${num(moment.camera.y)}`,
    );
  }
  if (trail.moments.length) out.push('');

  out.push(
    `  \x1b[1m${trail.ending ?? 'still flying'}\x1b[0m at tick ${trail.ticks}, ` +
      `${num(trail.craft.x)}, ${num(trail.craft.y)}, doing ${num(trail.craft.speed)}/s`,
  );
  out.push(
    '  \x1b[2mLengths and speeds are design units; ticks are the only clock (ADR-0006).\x1b[0m',
  );
  return out;
}

/** How many histogram rows are worth printing before the shape stops being the point. */
const HISTOGRAM_ROWS = 24;

/** The widest a bar gets, in characters. */
const BAR = 44;

/**
 * A histogram as bars, **empty buckets left out**.
 *
 * The millisecond labels are what carry the gaps, so nothing about the shape is
 * lost by not drawing sixty rows of nothing: a jump from `5ms` to `31ms` in the
 * left column says the distribution is bimodal more plainly than twenty-five
 * blank bars do. It is the shape that is being read here, and a screen of empty
 * rows is the thing that hides it.
 */
function histogramRows(bucketed: Bucketed, label: string): string[] {
  const counts = bucketed.buckets;
  const busiest = counts.reduce((most, n) => Math.max(most, n), 0);
  if (busiest === 0) return [];
  const occupied: number[] = [];
  for (let i = 0; i < counts.length; i++) if (counts[i]! > 0) occupied.push(i);
  const rows: string[] = [`  \x1b[2m${label}, per 1ms — empty buckets are not drawn\x1b[0m`];
  for (const i of occupied.slice(0, HISTOGRAM_ROWS)) {
    const n = counts[i]!;
    const width = Math.round((n / busiest) * BAR);
    const edge = i === counts.length - 1 ? `${i}+` : String(i);
    rows.push(
      `  ${edge.padStart(5)}ms │${'█'.repeat(width)}${' '.repeat(BAR - width)}│ ` +
        `${String(n).padStart(6)}`,
    );
  }
  if (occupied.length > HISTOGRAM_ROWS) {
    const rest = occupied.slice(HISTOGRAM_ROWS).reduce((sum, i) => sum + counts[i]!, 0);
    rows.push(
      `  \x1b[2m    … ${rest} more in ${occupied.length - HISTOGRAM_ROWS} further buckets, ` +
        `out to ${occupied[occupied.length - 1]}ms\x1b[0m`,
    );
  }
  return rows;
}

/**
 * What a frame costs and what a tick costs, recovered from the frames
 * themselves.
 *
 * A run produces frames that ran 0, 1, 2 or 3 ticks — `ticksDue` decides, from
 * how the display's rate and the tick rate happen to land — and the mean cost of
 * each group is a point on a straight line. Its **slope is one tick** and its
 * **intercept is everything else a frame does**: the draw, the interpolation,
 * the browser. Least squares over the four groups, weighted by how many frames
 * are in each.
 *
 * **It is what makes a whole-millisecond clock usable.** No single frame's cost
 * is known to better than the 1ms the phone's `performance.now()` is clamped to,
 * but a mean over a thousand of them is known far more precisely than that, and
 * two means are all a line needs. It is also the only way to get the two halves
 * of the budget apart without a profiler on the device.
 *
 * `null` when the run never varied — one group of frames is a point, and a point
 * has no slope.
 */
export function frameCost(timing: DispatchTiming): { perFrame: number; perTick: number } | null {
  let n = 0;
  let sumX = 0;
  let sumXX = 0;
  let sumY = 0;
  let sumXY = 0;
  for (let ticks = 0; ticks < timing.byTicks.length; ticks++) {
    const group = timing.byTicks[ticks]!;
    n += group.frames;
    sumX += ticks * group.frames;
    sumXX += ticks * ticks * group.frames;
    sumY += group.cpu;
    sumXY += ticks * group.cpu;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (n === 0 || denominator === 0) return null;
  const perTick = (n * sumXY - sumX * sumY) / denominator;
  return { perFrame: (sumY - perTick * sumX) / n, perTick };
}

/**
 * The timing block: the distribution, the budget it implies, and the worst
 * frames with what the run was doing on them beside each.
 *
 * The percentiles are computed **here** rather than read off the phone, which is
 * the rule `vite-plugin-diag.ts` set for the first kind of report and the reason
 * the meter sends buckets: *the report carries samples, not conclusions.* They
 * are whole milliseconds because the samples were, and saying `11ms` where the
 * evidence supports `11ms` is the difference between a measurement and a
 * decoration.
 */
/**
 * How long a frame has to run before it is worth counting as a stall.
 *
 * **25ms**, which is a dropped frame at 60Hz and not much else: the interval
 * distribution on the author's phone is a spike at 16 – 17ms and then nothing
 * until 25, so the gap in the middle is where the line goes and there is no
 * judgement in it.
 */
const LONG_FRAME_MS = 25;

export function formatTiming(timing: DispatchTiming, recipe: Recipe): string[] {
  const frames = timing.frames;
  const mean = (bucketed: Bucketed): number =>
    bucketCount(bucketed) === 0 ? 0 : bucketed.total / bucketCount(bucketed);
  const row = (label: string, bucketed: Bucketed): string =>
    `  ${label.padEnd(11)}` +
    [0.5, 0.95, 0.99].map((at) => `${String(bucketAt(bucketed, at)).padStart(5)}ms`).join('  ') +
    `  ${bucketed.max.toFixed(0).padStart(5)}ms  ${bucketed.total === 0 ? '—' : mean(bucketed).toFixed(2).padStart(6)}ms`;

  const out: string[] = [
    '',
    `  \x1b[1m▼ frames · ${frames} measured\x1b[0m`,
    '',
    '  ms             p50     p95     p99      max     mean',
    row('cpu', timing.cpu),
    row('interval', timing.interval),
  ];

  const notUs = (timing.interval.total - timing.cpu.total) / Math.max(1, frames);
  out.push(
    `  \x1b[2mnot us${' '.repeat(38)}${notUs.toFixed(2).padStart(6)}ms  ` +
      '(interval − cpu: vsync, compositor, collection, the rest of the phone)\x1b[0m',
  );
  out.push('');
  out.push(...histogramRows(timing.cpu, 'cpu'));
  out.push('');
  out.push(...histogramRows(timing.interval, 'interval'));
  out.push('');

  out.push('  \x1b[2mwhat a frame is made of, from the frames themselves\x1b[0m');
  out.push('    ticks run   frames    mean cpu');
  for (let ticks = 0; ticks < timing.byTicks.length; ticks++) {
    const group = timing.byTicks[ticks]!;
    const each = group.frames === 0 ? '—' : `${(group.cpu / group.frames).toFixed(2)}ms`;
    out.push(
      `    ${String(ticks).padStart(9)}   ${String(group.frames).padStart(6)}   ${each.padStart(9)}`,
    );
  }
  const fit = frameCost(timing);
  out.push(
    fit === null
      ? '    \x1b[2mevery frame ran the same number of ticks, so there is no line to fit\x1b[0m'
      : `    \x1b[1m→ a tick costs ${fit.perTick.toFixed(2)}ms; the rest of a frame costs ` +
          `${fit.perFrame.toFixed(2)}ms\x1b[0m \x1b[2m(least squares, weighted)\x1b[0m`,
  );

  if (timing.timeline.length > 1) {
    // **Where in the run**, which a distribution cannot say and a report about
    // *"towards the end"* needs. `jumps` is the column to read first: a frame
    // that ran two or more ticks moved the simulation further than it showed,
    // which is the shape a hitch takes when the clock catches up rather than
    // when the code is slow.
    const span = timing.timeline.reduce((most, s) => Math.max(most, s.frames), 0);
    out.push('');
    out.push('  \x1b[2mthe run in order — where the frames went, not just how many\x1b[0m');
    out.push('    to tick   frames   mean cpu   mean gap   worst gap   jumps');
    for (const segment of timing.timeline) {
      const bar = Math.round((segment.jumps / Math.max(1, span)) * 20);
      out.push(
        `  ${String(segment.tick).padStart(9)}  ${String(segment.frames).padStart(6)}  ` +
          `${(segment.cpu / segment.frames).toFixed(2).padStart(7)}ms  ` +
          `${(segment.interval / segment.frames).toFixed(2).padStart(7)}ms  ` +
          `${segment.worst.toFixed(0).padStart(8)}ms  ${String(segment.jumps).padStart(5)} ` +
          '\u2588'.repeat(bar),
      );
    }
  }

  if (timing.worst.length) {
    const walked = walkRun(
      recipe,
      timing.worst.map((frame) => frame.tick),
    );
    const byTick = new Map(walked.moments.map((moment) => [moment.tick, moment]));
    out.push('');
    out.push('  \x1b[2mthe worst frames, and what the run was doing on them\x1b[0m');
    out.push('     tick     cpu  interval  ticks');
    // **The press edges the run's own log carries**, so a frame that is bad
    // *because the button moved* says so without anybody writing a script.
    // Measured on 2026-09-01, this is the whole of an old finding: on the phone
    // every press-DOWN costs a frame and no press-UP ever does, which is what
    // takes the game's own drawing out of the suspect list — a release draws
    // strictly more than a grab. See `docs/plan/m3-the-field.md`.
    const pressedDown = new Set(recipe.log.filter((_, edge) => edge % 2 === 0));
    const letGo = new Set(recipe.log.filter((_, edge) => edge % 2 === 1));
    for (const frame of timing.worst) {
      const moment = byTick.get(frame.tick);
      const where =
        moment === undefined
          ? ''
          : moment.phase === 'coasting'
            ? 'coasting'
            : moment.phase === 'diving'
              ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
              : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
      const edge = pressedDown.has(frame.tick)
        ? ' \x1b[33m· button down\x1b[0m'
        : letGo.has(frame.tick)
          ? ' \x1b[33m· button up\x1b[0m'
          : '';
      out.push(
        `  ${String(frame.tick).padStart(7)}  ${frame.cpu.toFixed(0).padStart(4)}ms  ` +
          `${frame.interval.toFixed(0).padStart(6)}ms  ${String(frame.ticks).padStart(5)}  ${where}${edge}`,
      );
    }

    // And the same question of the whole distribution rather than of twelve
    // frames, because twelve is a tail and this is a rate.
    let stalled = 0;
    for (let ms = LONG_FRAME_MS; ms < timing.interval.buckets.length; ms++) {
      stalled += timing.interval.buckets[ms] ?? 0;
    }
    if (stalled > 0) {
      out.push('');
      out.push(
        `  \x1b[2m${stalled} frames ran ${LONG_FRAME_MS}ms or longer, against ` +
          `${pressedDown.size} presses and ${letGo.size} releases.\x1b[0m`,
      );
    }
  }
  return out;
}

/**
 * A dispatch as the terminal should read it: who flew it and what they said,
 * then the run underneath.
 *
 * The provenance goes first because it is what the trail has to be read
 * *against* — a note about a swing that felt late is a claim, and the table
 * below it is the evidence. `describe` adds ticks to the ones the author already
 * flagged, which is how an agent asks about one they were told about.
 */
export function formatDispatch(dispatch: Dispatch, describe: readonly Tick[] = []): string[] {
  const device = dispatch.device;
  const out: string[] = [
    '',
    device
      ? `  \x1b[2mflown ${dispatch.at} · ${device.css.w}×${device.css.h} css · dpr ${device.dpr}\x1b[0m`
      : `  \x1b[2mrecorded ${dispatch.at}, not on a device\x1b[0m`,
  ];
  if (device) out.push(`  \x1b[2m${device.ua}\x1b[0m`);
  if (dispatch.observed.note) out.push(`  \x1b[1m“${dispatch.observed.note}”\x1b[0m`);
  return [
    ...out,
    ...(dispatch.timing ? formatTiming(dispatch.timing, dispatch.recipe) : []),
    ...formatTrail(walkRun(dispatch.recipe, [...dispatch.observed.ticks, ...describe])),
  ];
}
