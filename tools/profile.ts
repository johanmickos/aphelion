/**
 * `pnpm profile` — where a tick's time actually goes, and how much field it
 * takes before it stops fitting.
 *
 *   pnpm profile                     the recipe this repo ships
 *   pnpm profile diagnostics/….json  a dispatch that arrived from the phone
 *   pnpm profile … --repeats 5       fly it this many times and keep the best
 *
 * ## Why this can exist at all, and why it is not the phone
 *
 * The tick side of this game is **pure**: `pnpm portable` proves that
 * `src/sim/` and `src/state/` reach no clock, no DOM and no engine-approximated
 * transcendental, and [ADR-0006](../docs/adr/0006-three-layers-sim-presentation-renderer.md)
 * makes the tick the only clock there is. So the whole of `stepSim` and
 * `derive` runs in Node, at nanosecond timer resolution, over a recipe somebody
 * actually flew — and every lead the performance session opened with lives
 * there. That is the half of the question a laptop can answer honestly.
 *
 * **It is not a verdict about the phone and must never be read as one.** What a
 * laptop measures is a *ratio* — which of two things in the same process costs
 * more, and how a cost grows with the size of the field — and ratios travel
 * across machines in a way absolute milliseconds do not. The absolute numbers
 * come from the phone, through the meter in [`meter.ts`](./meter.ts) and the
 * dispatch it rides in. Every line this prints says which machine it is from.
 *
 * ## The two questions, and they need different experiments
 *
 * **Attribution** flies one recipe and times each tick's `stepSim` and `derive`
 * separately, then re-times the two pieces of `derive` that walk the field —
 * `compassOf` and `sightingsOf` — on the same inputs the real call had. Those
 * re-timings are **warm**, so they under-report slightly; the residual line
 * below them says how much of `derive` they failed to explain, which is the
 * honest way to carry a measurement whose method has a known bias.
 *
 * **Scaling** holds the run *completely still* and grows the field underneath
 * it. Extra bodies are placed far above the flown path — outside every reach,
 * every aim range and every corridor — so `stepSim` takes the identical
 * decisions and the run's fingerprint is unchanged, which is asserted rather
 * than assumed. Anything that moves is therefore per-body cost and nothing
 * else. That is the number M3 needs: `derive` is `O(bodies)` three times over
 * and the fixture field is 24 bodies, so *"the field"* wants to know the slope
 * before it picks a size.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBody } from '../src/sim/body.ts';
import type { Body } from '../src/sim/body.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { parseRecipe, pressAt } from '../src/sim/recipe.ts';
import { openRun } from '../src/sim/replay.ts';
import { stepSim } from '../src/sim/step.ts';
import type { Field, SimState, Tick } from '../src/sim/types.ts';
import { MAX_CATCH_UP_TICKS, SCALE, SECONDS_PER_TICK } from '../src/sim/units.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/state/design.ts';
import { compassOf } from '../src/state/compass.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import { sightingsOf } from '../src/state/sighting.ts';
import type { PresentationState } from '../src/state/types.ts';
import { draw } from '../src/render/index.ts';
import { interpolate } from '../src/render/interpolate.ts';
import { parseDispatch } from './dispatch.ts';
import { walkRun } from './trail.ts';

/** The recipe this reaches for when it is given nothing — `pnpm replay`'s own. */
const SHIPPED = fileURLToPath(new URL('../test/recipes/pilot-60s.json', import.meta.url));

/**
 * How many whole flights to take, keeping the cheapest tick at each index.
 *
 * A laptop is a noisy machine — another process, a scheduler decision, a
 * garbage collection — and every one of those noises is *additive*. So the
 * minimum across repeats is the estimator with the least contamination, and it
 * is the one used for the per-tick series. The distribution over a single
 * flight is reported beside it, because the minimum of a distribution is not a
 * distribution and the spread is half of what a performance session is looking
 * for.
 */
const REPEATS = 3;

/** Ticks flown and thrown away before anything is timed, so the JIT has warmed. */
const WARMUP_TICKS = 600;

/** How many of the worst ticks to name. Enough to see a pattern, few enough to read. */
const WORST = 8;

/** The field sizes the scaling sweep visits. The fixture field is the first. */
const FIELD_SIZES = [24, 48, 96, 192, 384, 768, 1536] as const;

/**
 * The per-tick budget, **derived rather than guessed**, and it is an opening
 * position until the phone confirms the two numbers it is built out of.
 *
 * A frame at 60Hz is 16.67ms. M0.5 measured and ruled the renderer at
 * [8ms p99](../docs/adr/0011-canvas2d-carries-the-design.md) on the author's own
 * phone, which is the only measured term here. `ticksDue` will hand a single
 * frame up to [`MAX_CATCH_UP_TICKS`](../src/sim/units.ts) ticks, and a frame
 * that catches up still has to draw — so the binding case is three ticks and one
 * draw inside one frame:
 *
 *     (16.67 − 8) / 3 = 2.89ms per tick
 *
 * Rounded down to 2.8. A tick that costs more than this cannot be caught up
 * three at a time without dropping the frame it is being caught up in, which is
 * exactly the shape of an intermittent hitch.
 */
const TICK_BUDGET_MS = 2.8;

const now = (): number => Number(process.hrtime.bigint()) / 1e6;

/**
 * What one frame asks the canvas for, counted rather than timed.
 *
 * **A count is the renderer measurement that travels.** Milliseconds off this
 * laptop say nothing about a thermally throttled phone, but *"this frame issues
 * eleven radial gradients and paints 2.4 screens' worth of pixels"* is a fact
 * about the frame and is true wherever it is drawn. A phone's Canvas2D is
 * fill-rate bound long before it is call bound, so the number that predicts
 * trouble is **overdraw** — how many times over the design space gets painted —
 * and that is arithmetic on the radii the renderer asks for.
 *
 * The recorder is the one `test/render/bodies.test.ts` already uses, for the
 * reason that file gives: the renderer's contract is what it asks for in design
 * units, and a real canvas would answer a different question with more
 * equipment. This one keeps sizes as well as widths.
 */
interface Census {
  gradients: number;
  arcs: number;
  fills: number;
  strokes: number;
  /** Area filled, in design units², summed over the frame. */
  filled: number;
  /** The part of `filled` painted through a gradient. */
  gradientFilled: number;
}

function census(): Census {
  return { gradients: 0, arcs: 0, fills: 0, strokes: 0, filled: 0, gradientFilled: 0 };
}

/**
 * A context that counts what it is asked for and draws nothing.
 *
 * Areas are accumulated in **design units**, which is what everything after
 * `draw`'s second `setTransform` is expressed in — so the sky's `fillRect`,
 * which happens before it in device pixels, is deliberately not counted as
 * overdraw. It is one screen, every frame, on every machine, and it is not what
 * anybody is looking for.
 */
function counter(into: Census): CanvasRenderingContext2D {
  // One object, handed back by every `createRadialGradient`, so a gradient fill
  // is told from a flat one by identity: the renderer assigns what it was given
  // to `fillStyle`, and nothing else in the file produces this object.
  const gradient = { addColorStop: (): void => {} };
  let radius: number | null = null;
  let fillStyle: unknown = '';
  const context = {
    canvas: { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
    lineWidth: 1,
    strokeStyle: '',
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    transform: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clip: () => {},
    beginPath: () => {
      radius = null;
    },
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    rect: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    arc: (_x: number, _y: number, r: number) => {
      into.arcs += 1;
      radius = r;
    },
    ellipse: (_x: number, _y: number, r: number) => {
      into.arcs += 1;
      radius = r;
    },
    fill: () => {
      into.fills += 1;
      if (radius === null) return;
      const area = Math.PI * radius * radius;
      into.filled += area;
      if (fillStyle === gradient) into.gradientFilled += area;
    },
    stroke: () => {
      into.strokes += 1;
    },
    fillRect: () => {},
    createRadialGradient: () => {
      into.gradients += 1;
      return gradient;
    },
    createLinearGradient: () => {
      into.gradients += 1;
      return gradient;
    },
    measureText: () => ({ width: 0 }),
    fillText: () => {},
    setLineDash: () => {},
  };
  return context as unknown as CanvasRenderingContext2D;
}

/** A sorted copy's percentile, nearest-rank. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank]!;
}

interface Spread {
  readonly n: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

function spread(samples: readonly number[]): Spread {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    n: samples.length,
    mean: samples.length === 0 ? 0 : total / samples.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: percentile(sorted, 1),
  };
}

/** Every tick's cost for one measured quantity, index-aligned with the run. */
interface Series {
  readonly label: string;
  readonly ticks: number[];
}

function keepBest(into: Series, from: readonly number[]): void {
  for (let i = 0; i < from.length; i++) {
    const was = into.ticks[i];
    const is = from[i]!;
    into.ticks[i] = was === undefined || is < was ? is : was;
  }
}

interface Flight {
  readonly step: number[];
  readonly derived: number[];
  readonly compass: number[];
  readonly sightings: number[];
  /** The run, digested — see [`flightPrint`](#). */
  readonly print: string;
  readonly ticks: Tick;
}

/**
 * The run itself, as a digest, with the field's **membership** left out of it.
 *
 * [`snapshot`](../src/sim/snapshot.ts) is the right fingerprint everywhere else
 * and is the wrong one here: it encodes every body, deliberately, because two
 * runs flown in different fields are two different runs (ADR-0004). This
 * experiment adds bodies on purpose, so that fingerprint would report a change
 * on every padded row and prove nothing about the one thing being asked —
 * *did the craft fly the same path?*
 *
 * So what is hashed is the craft and the decisions taken about it, every tick:
 * where it was, how fast, what it was holding, and how the run ended. If a
 * parked body were close enough to be grabbed, to be offered, or to bend the
 * flight, one of those six numbers moves on the tick it happened.
 */
function print(digest: ReturnType<typeof createHash>, state: SimState): void {
  const row = new Float64Array([
    state.tick,
    state.heldBody === null ? -1 : state.heldBody,
    state.craft.x,
    state.craft.y,
    state.craft.vx,
    state.craft.vy,
  ]);
  digest.update(new Uint8Array(row.buffer));
}

/**
 * Fly the recipe once against `field`, timing each tick.
 *
 * `stepSim` and `derive` are the real calls in the real order — this is the
 * loop `app/main.ts` runs, with a timer either side of each half. The two
 * re-timings after them are extra work the game does not do, and they are done
 * *after* the real `derive` so that they never make it look slower than it is.
 */
function fly(recipe: Recipe, field: Field | null): Flight {
  const sim = openRun(recipe);
  const state: SimState = field === null ? sim : { ...sim, field };
  let view: PresentationState = createPresentation(state);

  const step: number[] = [];
  const derived: number[] = [];
  const compass: number[] = [];
  const sightings: number[] = [];
  const digest = createHash('sha256');

  for (let tick = 0; tick < recipe.ticks; tick++) {
    const pressed = pressAt(recipe.log, tick);
    const previous = view;

    const t0 = now();
    stepSim(state, { pressed });
    const t1 = now();
    view = derive(previous, state);
    const t2 = now();

    // Re-timed on the inputs the real call had, and warm — see the header.
    compassOf(previous.compass, state);
    const t3 = now();
    sightingsOf(
      state.field.bodies,
      view.bodies.map((body) => body.state),
      view.bodies.map((body) => body.offered),
      state.craft,
      view.camera,
    );
    const t4 = now();

    step.push(t1 - t0);
    derived.push(t2 - t1);
    compass.push(t3 - t2);
    sightings.push(t4 - t3);
    print(digest, state);
    if (state.ending !== null) break;
  }

  return {
    step,
    derived,
    compass,
    sightings,
    print: `${digest.digest('hex').slice(0, 16)}·${state.ending ?? 'flying'}`,
    ticks: state.tick,
  };
}

/** Fly it `REPEATS` times, keeping the cheapest reading of every tick. */
function best(
  recipe: Recipe,
  field: Field | null,
  flights: number,
): { series: Series[]; one: Flight } {
  const series: Series[] = [
    { label: 'stepSim', ticks: [] },
    { label: 'derive', ticks: [] },
    { label: '  · compassOf', ticks: [] },
    { label: '  · sightingsOf', ticks: [] },
  ];
  let one: Flight | null = null;
  for (let i = 0; i < flights; i++) {
    const flight = fly(recipe, field);
    one ??= flight;
    keepBest(series[0]!, flight.step);
    keepBest(series[1]!, flight.derived);
    keepBest(series[2]!, flight.compass);
    keepBest(series[3]!, flight.sightings);
  }
  return { series, one: one! };
}

/**
 * The fixture field with `count` bodies, the extra ones parked out of the way.
 *
 * *Out of the way* is load-bearing and is the whole reason this measures
 * anything: the padding sits far above the top of the field, well beyond
 * [`AIM_RANGE`](../src/sim/compass.ts) from every body on the flown path and
 * beyond every grab reach, so nothing it does can reach the run. `stepSim` takes
 * the same decisions, the fingerprint is identical, and the only thing that
 * changed is how many bodies the three loops in `derive` have to walk.
 *
 * They are spread over a wide lane rather than stacked, so they do not all land
 * inside one another's aim range either — a clump would answer a different
 * question about `aimTargets` than the field M3 will build.
 */
function paddedField(base: Field, count: number): Field {
  const bodies: Body[] = [...base.bodies];
  // Far above the highest body in the fixture field, which sits at 5230 board
  // units up. A hundred thousand design units is two orders past anything the
  // run reaches, and each row climbs further still.
  const farAbove = -100000;
  for (let i = bodies.length; i < count; i++) {
    const row = Math.floor(i / 4);
    const column = i % 4;
    bodies.push(
      createBody(
        (column * 2000 - 3000) * SCALE,
        farAbove - row * 4000 * SCALE,
        (34 + (i % 23)) * SCALE,
      ),
    );
  }
  return { ...base, bodies };
}

/**
 * The p99 over the first third of a run and over the last third — the M0.5
 * timing report's own word for it, and the same question one milestone on.
 *
 * *"Some lag during some swings"* has a reading this answers directly: work that
 * grows as the run goes on. A field of spent bodies accumulates behind the craft
 * (spec 04 §3), a recorder fills up, and presentation state is a recurrence — so
 * *something getting heavier over 46 seconds* is a hypothesis with a mechanism
 * behind it rather than a worry. If the two numbers are the same, it is refused.
 */
function drift(samples: readonly number[]): { early: number; late: number } {
  const third = Math.floor(samples.length / 3);
  if (third === 0) return { early: 0, late: 0 };
  const at = (part: readonly number[]): number =>
    percentile(
      [...part].sort((a, b) => a - b),
      0.99,
    );
  return { early: at(samples.slice(0, third)), late: at(samples.slice(-third)) };
}

const ms = (value: number, places = 3): string => value.toFixed(places).padStart(8);
const pct = (value: number): string => `${(value * 100).toFixed(0)}%`;

function formatSpread(label: string, s: Spread, width = 16): string {
  return (
    `  ${label.padEnd(width)} ${ms(s.mean)}  ${ms(s.p50)}  ${ms(s.p95)}  ` +
    `${ms(s.p99)}  ${ms(s.max)}`
  );
}

function usage(): never {
  console.error('usage: pnpm profile [<recipe or dispatch>.json | -] [--repeats <n>]');
  process.exit(2);
}

const args = process.argv.slice(2);
let source: string | null = null;
let repeats = REPEATS;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--repeats') {
    repeats = Number(args[++i]);
    if (!Number.isInteger(repeats) || repeats < 1) usage();
  } else if (arg.startsWith('-') && arg !== '-') {
    usage();
  } else if (source === null) {
    source = arg;
  } else {
    usage();
  }
}

const path = source ?? SHIPPED;
let text: string;
try {
  text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
} catch (err) {
  console.error(`\n  cannot read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}

let recipe: Recipe;
try {
  const raw: unknown = JSON.parse(text);
  const kind =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).kind : undefined;
  recipe = kind === undefined ? parseRecipe(raw) : parseDispatch(raw).recipe;
} catch (err) {
  console.error(`\n  not a recipe: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}

// Warm the JIT on the run itself, so the first hundred ticks of the measured
// flight are not the interpreter's opinion of them.
{
  const warm = openRun(recipe);
  let view = createPresentation(warm);
  for (let tick = 0; tick < Math.min(WARMUP_TICKS, recipe.ticks); tick++) {
    const previous = view;
    stepSim(warm, { pressed: pressAt(recipe.log, tick) });
    view = derive(previous, warm);
  }
}

const baseline = openRun(recipe).field;
const { series, one } = best(recipe, null, repeats);
const trail = walkRun(recipe);

console.log('');
console.log(
  `  \x1b[1m▼ profile · ${recipe.field.generator} field v${recipe.field.version} · ` +
    `${baseline.bodies.length} bodies · ${one.ticks} ticks (${(one.ticks * SECONDS_PER_TICK).toFixed(1)}s)\x1b[0m`,
);
console.log(
  `  \x1b[2m${process.platform} · node ${process.versions.node} · best of ${repeats} flights, ` +
    `per tick · \x1b[31mnot a phone\x1b[0m\x1b[2m — ratios travel, milliseconds do not\x1b[0m`,
);
console.log('');
console.log('  per tick, ms         mean       p50       p95       p99       max');
for (const line of series) console.log(formatSpread(line.label, spread(line.ticks)));

const stepTotal = series[0]!.ticks.reduce((sum, value) => sum + value, 0);
const deriveTotal = series[1]!.ticks.reduce((sum, value) => sum + value, 0);
const compassTotal = series[2]!.ticks.reduce((sum, value) => sum + value, 0);
const sightingsTotal = series[3]!.ticks.reduce((sum, value) => sum + value, 0);
const whole = series[0]!.ticks.map((value, i) => value + series[1]!.ticks[i]!);
const wholeSpread = spread(whole);
console.log(formatSpread('\x1b[1mtick total\x1b[0m', wholeSpread, 25));
const tickDrift = drift(whole);
console.log('');
console.log(
  `  \x1b[2mdrift, tick p99 over the first third → the last: ${tickDrift.early.toFixed(3)} → ` +
    `${tickDrift.late.toFixed(3)} ms\x1b[0m`,
);
console.log(
  `  \x1b[2mderive is ${pct(deriveTotal / (stepTotal + deriveTotal))} of a tick. Inside it, ` +
    `compassOf ${pct(compassTotal / deriveTotal)} and sightingsOf ` +
    `${pct(sightingsTotal / deriveTotal)}, leaving ` +
    `${pct(1 - (compassTotal + sightingsTotal) / deriveTotal)} unexplained —\x1b[0m`,
);
console.log(
  '  \x1b[2mwhich is bodiesOf, the camera and the object built round them. The two re-timings ' +
    'are warm, so they under-report.\x1b[0m',
);
console.log('');

// The worst ticks, and what the run was doing on them — the whole reason a tick
// number is carried rather than a millisecond.
const worst = whole
  .map((cost, tick) => ({ cost, tick }))
  .sort((a, b) => b.cost - a.cost)
  .slice(0, WORST);
const moments = walkRun(
  recipe,
  worst.map((w) => w.tick),
);
const byTick = new Map(moments.moments.map((moment) => [moment.tick, moment]));
console.log(`  worst ${WORST} ticks`);
for (const { cost, tick } of worst) {
  const moment = byTick.get(tick);
  const where =
    moment === undefined
      ? ''
      : moment.phase === 'coasting'
        ? 'coasting'
        : moment.phase === 'diving'
          ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
          : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
  console.log(`  ${String(tick).padStart(7)}  ${ms(cost)}  ${where}`);
}
console.log('');

// ── What the renderer asks for ───────────────────────────────────────────────
/**
 * Fly the recipe again and draw every frame into the counter.
 *
 * One frame per tick, interpolated halfway between two ticks, which is what a
 * display running at the tick rate would draw. A phone drawing twice per tick
 * draws twice this, and one dropping frames draws less; either way the *shape*
 * of a frame is what is being counted here and it does not depend on how often
 * the frame happens.
 */
function drawCensus(recipe: Recipe, field: Field | null): Record<string, number[]> {
  const sim = openRun(recipe);
  const state: SimState = field === null ? sim : { ...sim, field };
  let view: PresentationState = createPresentation(state);
  const per: Record<string, number[]> = {
    'bodies drawn': [],
    gradients: [],
    arcs: [],
    strokes: [],
    'overdraw, screens': [],
    '  of it gradient': [],
  };
  for (let tick = 0; tick < recipe.ticks; tick++) {
    const previous = view;
    stepSim(state, { pressed: pressAt(recipe.log, tick) });
    view = derive(previous, state);
    const frame = interpolate(previous, view, 0.5);
    // One frame's worth, counted on its own, because the whole discipline of
    // this session is that a mean hides the frame that hurt.
    const one = census();
    draw(frame, counter(one));
    per['bodies drawn']!.push(drawn(frame));
    per.gradients!.push(one.gradients);
    per.arcs!.push(one.arcs);
    per.strokes!.push(one.strokes);
    per['overdraw, screens']!.push(one.filled / SCREEN);
    per['  of it gradient']!.push(one.gradientFilled / SCREEN);
    if (state.ending !== null) break;
  }
  return per;
}

/**
 * How many bodies that frame's culling let through — the renderer's own test,
 * restated.
 *
 * It is restated rather than exported from `src/render/index.ts` because it is a
 * *measurement of* that rule and not a second copy meant to be kept in step: if
 * the two ever disagree, this file is wrong and the renderer is right. What it
 * is here to answer is one of the leads this session opened with — the renderer
 * culls by camera and `derive` does not, so which side is the cost on.
 */
function drawn(view: PresentationState): number {
  const half = DESIGN_HEIGHT / 2;
  let count = 0;
  for (const body of view.bodies) {
    const reach = body.radius + Math.max(36, body.bloom);
    if (Math.abs(body.y - view.camera.y) <= half + reach) count += 1;
  }
  return count;
}

const SCREEN = DESIGN_WIDTH * DESIGN_HEIGHT;

console.log('  \x1b[1mwhat the renderer asks for, per frame\x1b[0m');
console.log(
  '  \x1b[2mCounted, not timed — a count travels to a phone and a millisecond does not. ' +
    'Overdraw is screens painted.\x1b[0m',
);
console.log('');
console.log('  per frame              mean       p50       p95       p99       max');
const drawnPerFrame = drawCensus(recipe, null);
for (const [label, samples] of Object.entries(drawnPerFrame)) {
  console.log(formatSpread(label, spread(samples), 18));
}

// The renderer culls by camera and `derive` does not, which was one of the leads
// this session opened with. Both halves of the answer are here: the same run in
// a field 64 times the size draws the identical frame, because everything added
// is outside the camera's band — so the renderer's cost follows **how densely
// bodies are packed along the climb**, and `derive`'s follows how many there are
// in total. They are different questions and only one of them is M3's to worry
// about twice.
const wide = drawCensus(recipe, paddedField(baseline, FIELD_SIZES[FIELD_SIZES.length - 1]!));
const flat = Object.keys(drawnPerFrame).every(
  (key) => spread(drawnPerFrame[key]!).mean.toFixed(6) === spread(wide[key]!).mean.toFixed(6),
);
const perBody =
  spread(drawnPerFrame['overdraw, screens']!).mean / spread(drawnPerFrame['bodies drawn']!).mean;
console.log('');
console.log(
  `  \x1b[2mIn a field of ${FIELD_SIZES[FIELD_SIZES.length - 1]} the frame is ` +
    `${flat ? 'identical' : '\x1b[31mNOT identical\x1b[0m\x1b[2m'}: the camera's band is what a ` +
    `frame costs, not the field.\x1b[0m`,
);
console.log(
  `  \x1b[2mSo the figure M3 multiplies is per **visible** body: ` +
    `${perBody.toFixed(2)} screens of paint each.\x1b[0m`,
);
const paintDrift = drift(drawnPerFrame['overdraw, screens']!);
console.log(
  `  \x1b[2mdrift, overdraw p99 over the first third → the last: ` +
    `${paintDrift.early.toFixed(3)} → ${paintDrift.late.toFixed(3)} screens\x1b[0m`,
);
console.log('');

// ── Scaling ──────────────────────────────────────────────────────────────────
console.log('  \x1b[1mthe same run, in a bigger field\x1b[0m');
console.log(
  '  \x1b[2mThe extra bodies are parked out of every reach, so the run is byte-identical ' +
    'and only the walking grows.\x1b[0m',
);
console.log('');
console.log('  bodies    tick p50  tick p99   × 24-body p99   budget');
let firstOver: number | null = null;
for (const size of FIELD_SIZES) {
  const field = size === baseline.bodies.length ? null : paddedField(baseline, size);
  const { series: grown, one: sample } = best(recipe, field, repeats);
  const total = grown[0]!.ticks.map((value, i) => value + grown[1]!.ticks[i]!);
  const s = spread(total);
  const same = sample.print === one.print;
  const share = s.p99 / wholeSpread.p99;
  const over = s.p99 > TICK_BUDGET_MS;
  if (over && firstOver === null) firstOver = size;
  console.log(
    `  ${String(size).padStart(6)}  ${ms(s.p50)}  ${ms(s.p99)}  ${share.toFixed(2).padStart(13)}×   ` +
      `${over ? '\x1b[31mover\x1b[0m' : '\x1b[32mfits\x1b[0m'}` +
      (same ? '' : '  \x1b[31m← the run changed; this row means nothing\x1b[0m'),
  );
}
console.log('');
console.log(
  `  \x1b[2mBudget ${TICK_BUDGET_MS}ms per tick: (16.67ms frame − 8ms drawn, M0.5's measured p99) ` +
    `÷ ${MAX_CATCH_UP_TICKS} catch-up ticks.\x1b[0m`,
);
console.log(
  `  \x1b[2mIt is an opening position on this machine and a real one on the phone, where both ` +
    'terms were measured.\x1b[0m',
);
console.log(
  `  \x1b[2mRun ended ${trail.ending ?? 'still flying'} at tick ${trail.ticks}; ` +
    `state ${trail.fingerprint}.\x1b[0m`,
);
console.log('');
