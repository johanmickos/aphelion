/**
 * `pnpm budget` — what a frame of a recorded run costs, as p99 and max, with no
 * browser anywhere.
 *
 *   pnpm budget                      the recipe this repo ships
 *   pnpm budget diagnostics/….json   a dispatch, with its own phone timing beside it
 *   pnpm budget --corpus             pool every timed dispatch and settle what a tick costs
 *   pnpm budget … --hz 120           at a different display rate
 *
 * This is [M3.6](../docs/plan/m3-the-field.md)'s acceptance and `VISION.md`'s
 * standing gap: *"the correctness gate says nothing about time, and a
 * rendering-induced slowdown reached a phone with nothing in the repo able to
 * catch it. The units that matter are **p99 and max, not mean** — that class of
 * bug hides behind an average of calls that mostly return early."* Nothing here
 * averages anything into a verdict.
 *
 * ## The three instruments this joins, and it invents no fourth
 *
 * [`meter.ts`](./meter.ts) counts frames **on the device** and rides in the
 * dispatch; [`trail.ts`](./trail.ts) reads that block; the bench's HUD shows it
 * live. This is the fourth reader of the same block and writes nothing to the
 * wire — a second timing format would be a second thing to teach `trail.ts`. The
 * one piece of arithmetic that has to agree across all four, the line through the
 * tick groups, is [`fitGroups`](./trail.ts) and is called rather than copied.
 *
 * ## What a laptop is allowed to say, and what it is not
 *
 * The same division `pnpm profile` is written under, because it is the honest
 * one:
 *
 *   - **The tick is measurable here.** `pnpm portable` proves `src/sim/` and
 *     `src/state/` reach no clock and no DOM, so the whole of `stepSim` and
 *     `derive` runs in node at nanosecond resolution over a recipe somebody
 *     actually flew.
 *   - **The draw is not, and is deliberately absent.** A Canvas2D millisecond off
 *     this laptop says nothing about a thermally throttled phone. `pnpm profile`'s
 *     **census** counts what the renderer asks for instead, *"because a count
 *     travels to a phone and a millisecond does not."* What is timed here is the
 *     tick and the interpolation, and the phone's own dispatch supplies the rest
 *     of a frame.
 *   - **So the laptop measures the shape and the phone measures the scale.** That
 *     is the whole conversion, and it is re-derived on every run rather than
 *     copied out of a note, because a number measured under tuning that has since
 *     moved is worse than an unmeasured one (`VISION.md`'s seventh pillar).
 *
 * ## Why the frames are built rather than assumed
 *
 * A frame is not a tick. [`ticksDue`](../src/sim/clock.ts) hands a frame 0, 1, 2
 * or 3 ticks depending on how the display's rate and the tick rate land, and a
 * frame that catches three up is the case a budget is decided by. So the loop
 * below is `app/main.ts`'s own loop with the drawing taken out: the real clock,
 * the real rounding, and the real cap.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClock, ticksDue } from '../src/sim/clock.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { parseRecipe, pressAt } from '../src/sim/recipe.ts';
import { openRun } from '../src/sim/replay.ts';
import { stepSim } from '../src/sim/step.ts';
import type { SimState, Tick } from '../src/sim/types.ts';
import { MAX_CATCH_UP_TICKS, SECONDS_PER_TICK } from '../src/sim/units.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import type { PresentationState } from '../src/state/types.ts';
import { interpolate } from '../src/render/interpolate.ts';
import { parseDeviceOnly, parseDispatch, parseGradeOnly, parseTimingOnly } from './dispatch.ts';
import type { Dispatch, DispatchDevice, DispatchTiming } from './dispatch.ts';
import { bucketAt } from './meter.ts';
import { fitAcross, fitGroups, leverageOf, walkRun } from './trail.ts';
import type { TickGroup } from './meter.ts';

/** The recipe this reaches for when it is given nothing — `pnpm replay`'s own. */
const SHIPPED = fileURLToPath(new URL('../test/recipes/pilot-60s.json', import.meta.url));

/** Where the author's dispatches land, for `--corpus`. */
const DIAGNOSTICS = fileURLToPath(new URL('../diagnostics/', import.meta.url));

/**
 * **The recorded phone baseline**, and it is a dispatch rather than a file of
 * numbers.
 *
 * M3.6 owes *"a recorded baseline on the author's phone"*, and the cheapest
 * honest way to owe it is to name one of the runs the author actually sent: the
 * evidence is already in `diagnostics/`, it carries its own provenance — device,
 * date, note, and the input log that produced it — and it cannot go stale in the
 * way a transcribed number can, because the numbers are re-derived from it here.
 *
 * **This one**, of the seventy-one timed dispatches, because it is the run the
 * plan's own cost note is written about (1 040 ticks, out of bounds, the deadline
 * up on 19.9% of its ticks) and because **388 of its 1 412 frames ran a number of
 * ticks other than one** — 27.5%, the most of any recent run, which is what lets
 * it say anything at all about what a tick costs as against what a frame costs.
 * See [`leverageOf`](./trail.ts).
 */
const BASELINE = fileURLToPath(
  new URL('../diagnostics/2026-09-02T06-02-56-828Z-run-dispatch.json', import.meta.url),
);

/** The display rate the frames are built at, unless `--hz` says otherwise. */
const DISPLAY_HZ = 60;

/**
 * The finest interval the phone's clock will admit to, in seconds.
 *
 * WebKit clamps `performance.now()` to a whole millisecond, `app/main.ts` measures
 * that clamp at startup and hands it to `ticksDue`, and the rounding it enables is
 * the difference between a run that stutters and one that does not
 * (`src/sim/clock.ts`). Building frames without it would build a different game's
 * frames.
 */
const CLOCK_GRAIN_SECONDS = 0.001;

/** Ticks flown and thrown away before anything is timed, so the JIT has warmed. */
const WARMUP_TICKS = 600;

/**
 * How many whole flights to take, keeping the cheapest cost at each frame.
 *
 * `pnpm profile`'s own number and its own argument: a laptop is a noisy machine
 * and every one of its noises is **additive**, so the minimum across repeats is
 * the estimator with the least contamination. Taking it per frame rather than per
 * flight keeps a distribution rather than reducing one.
 */
const REPEATS = 3;

/** How many of the worst frames to name. Enough to see a pattern in. */
const WORST = 8;

/** A frame at 60Hz, in milliseconds — what everything below is measured against. */
const FRAME_MS = 1000 / 60;

const now = (): number => Number(process.hrtime.bigint()) / 1e6;

/** One built frame: what it cost here, and what the run was doing. */
interface Frame {
  /** The tick the run had reached when the frame finished. */
  readonly tick: Tick;
  readonly ticks: number;
  cpu: number;
  /** The interpolation alone, so the tick's share of a frame is separable. */
  between: number;
}

/**
 * Fly the recipe as frames, timing each one.
 *
 * `app/main.ts`'s loop, minus the canvas and the readout. The presses come from
 * the recipe rather than from a device, which is the only difference that matters
 * — and it is the same substitution `pnpm replay` makes.
 */
function flyFrames(recipe: Recipe, hz: number, timed: boolean): Frame[] {
  const sim: SimState = openRun(recipe);
  const clock = createClock();
  let previous: PresentationState = createPresentation(sim);
  let current = previous;
  let observedMs = 0;
  const frames: Frame[] = [];
  for (let f = 1; sim.tick < recipe.ticks && sim.ending === null; f++) {
    // The display's own timestamp, clamped the way the phone's is — which is what
    // produces the frames that run two ticks and the frames that run none.
    const presentedAt = Math.floor((f * 1000) / hz);
    const elapsedSeconds = (presentedAt - observedMs) / 1000;
    observedMs = presentedAt;
    const ticks = ticksDue(clock, elapsedSeconds, CLOCK_GRAIN_SECONDS);
    const started = timed ? now() : 0;
    let ran = 0;
    for (let i = 0; i < ticks; i++) {
      // The recipe's own length is the end of the evidence: a frame that would
      // catch up past it would be flying presses nobody made.
      if (sim.tick >= recipe.ticks) break;
      previous = current;
      // A run that has ended is not advanced, and those ticks are not counted —
      // the same rule `app/main.ts` writes the meter under, for the same reason:
      // counting them would tell the reader a tick is cheaper than it is.
      if (sim.ending === null) ran += 1;
      stepSim(sim, { pressed: pressAt(recipe.log, sim.tick) });
      current = derive(previous, sim);
    }
    const stepped = timed ? now() : 0;
    interpolate(previous, current, clock.unspentSeconds / SECONDS_PER_TICK);
    const ended = timed ? now() : 0;
    frames.push({ tick: sim.tick, ticks: ran, cpu: ended - started, between: ended - stepped });
  }
  return frames;
}

/** The cheapest each frame came out at, over `REPEATS` flights after a warm one. */
function measure(recipe: Recipe, hz: number): Frame[] {
  flyFrames({ ...recipe, ticks: Math.min(recipe.ticks, WARMUP_TICKS) }, hz, false);
  const best = flyFrames(recipe, hz, true);
  for (let repeat = 1; repeat < REPEATS; repeat++) {
    const again = flyFrames(recipe, hz, true);
    for (let at = 0; at < best.length && at < again.length; at++) {
      const one = best[at]!;
      const other = again[at]!;
      if (other.cpu < one.cpu) one.cpu = other.cpu;
      if (other.between < one.between) one.between = other.between;
    }
  }
  return best;
}

/** The percentile of a sorted series, at its own resolution rather than a bucket's. */
function at(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank]!;
}

const dim = (text: string): string => `\x1b[2m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;
const red = (text: string): string => `\x1b[31m${text}\x1b[0m`;
const green = (text: string): string => `\x1b[32m${text}\x1b[0m`;

function row(label: string, series: readonly number[], places = 3): string {
  const sorted = [...series].sort((a, b) => a - b);
  const cells = [0.5, 0.95, 0.99].map((f) => at(sorted, f).toFixed(places).padStart(8)).join('');
  return `  ${label.padEnd(22)}${cells}${at(sorted, 1).toFixed(places).padStart(8)}`;
}

/** The tick groups a run's frames fell into, in `meter.ts`'s own shape. */
function groupsOf(frames: readonly Frame[]): TickGroup[] {
  const groups: TickGroup[] = Array.from({ length: MAX_CATCH_UP_TICKS + 1 }, () => ({
    frames: 0,
    cpu: 0,
  }));
  for (const frame of frames) {
    const group = groups[Math.min(frame.ticks, MAX_CATCH_UP_TICKS)]!;
    groups[Math.min(frame.ticks, MAX_CATCH_UP_TICKS)] = {
      frames: group.frames + 1,
      cpu: group.cpu + frame.cpu,
    };
  }
  return groups;
}

/** Everything the phone baseline says, as lines. */
/**
 * What the baseline block needs to know about the run it came from — and it is
 * deliberately **not** a `Dispatch`.
 *
 * ## ⚠ The baseline outlived its own recipe, 2026-09-03
 *
 * `2026-09-02T06-02-56` was flown in the **scatter** field, and that field's
 * version moved when the author ruled its forks closer to the prototype's. Read
 * through `parseDispatch` the baseline then vanished entirely and this command
 * lost the phone half of every number it reports — from a change to where the
 * planets are, which a frame timing knows nothing about.
 *
 * That is the same argument `--corpus` was already built on: *the meter did not
 * change when the swing did*, so `parseTimingOnly` is a door with the identical
 * validator on it and no recipe behind it. **The baseline is evidence about a
 * phone**, and it stays evidence after the field it happened to be flown in has
 * been redrawn.
 */
interface BaselineHead {
  readonly at: string;
  readonly device: DispatchDevice | null;
  readonly ticks: number;
  readonly build: string | undefined;
}

function baselineLines(dispatch: BaselineHead, timing: DispatchTiming): string[] {
  const device = dispatch.device;
  const fit = fitGroups(timing.byTicks);
  const lever = leverageOf(timing);
  const out = [
    '',
    bold('  ▼ the phone baseline'),
    dim(
      `  ${dispatch.at} · ${device ? `${device.css.w}×${device.css.h} css · dpr ${device.dpr}` : 'no device'}` +
        ` · ${timing.frames} frames over ${dispatch.ticks} ticks` +
        // Which build this measurement is about, which `at` cannot say — see
        // `Dispatch.build`. Every dispatch before 2026-09-02 has none.
        (dispatch.build === undefined ? dim(' · build unrecorded') : ` · build ${dispatch.build}`),
    ),
    '',
    '  ms                        p50     p95     p99     max',
    `  ${'frame cpu'.padEnd(22)}${[0.5, 0.95, 0.99]
      .map((f) => `${bucketAt(timing.cpu, f)}ms`.padStart(8))
      .join('')}${`${timing.cpu.max.toFixed(0)}ms`.padStart(8)}`,
    `  ${'frame interval'.padEnd(22)}${[0.5, 0.95, 0.99]
      .map((f) => `${bucketAt(timing.interval, f)}ms`.padStart(8))
      .join('')}${`${timing.interval.max.toFixed(0)}ms`.padStart(8)}`,
    dim('  whole milliseconds, because the phone’s clock is — the terminal takes the percentiles'),
  ];
  if (fit !== null) {
    out.push('');
    out.push(
      `  a frame with one tick in it costs ${bold(`${(fit.perFrame + fit.perTick).toFixed(2)}ms`)}` +
        `, split ${fit.perTick.toFixed(2)} a tick and ${fit.perFrame.toFixed(2)} the rest`,
    );
    out.push(
      dim(
        `  ${lever.off} of ${timing.frames} frames (${(lever.share * 100).toFixed(1)}%) ran a different ` +
          'number of ticks, and only those can speak to the split',
      ),
    );
  }
  return out;
}

/** The build stamp a dispatch carries, or `undefined` where it predates them. */
function buildOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const build = (raw as Record<string, unknown>).build;
  return typeof build === 'string' ? build : undefined;
}

/** One dispatch's timing block, and enough of its envelope to place it. */
interface Timed {
  readonly file: string;
  readonly timing: DispatchTiming;
  readonly device: DispatchDevice | null;
  /** Whether this build would still replay the run underneath it. */
  readonly replays: boolean;
  /**
   * The **retro grade** it was flown under, or `null` where it did not say.
   *
   * It is read for the same reason the build stamp is: a frame's cost belongs to
   * a cohort. The grade is a full-screen composite or two on top of the scene
   * (spec 14 §2), so it lands in the *rest of a frame* term this file fits — and
   * unlike every other thing that moves that term, it is a **session setting**
   * rather than a build, so two runs from the identical build can differ in it.
   * Pooling across coats without saying so is exactly the mismatch M3.6 exists to
   * have caught.
   */
  readonly grade: number | null;
}

/**
 * Every dispatch on disk that carries a timing block, **whether or not its recipe
 * still replays**.
 *
 * A refused recipe is the corpus rule working — 26 replay at `SIM_VERSION` 9 and
 * 56 do not — but the meter has not changed and a frame timing is evidence about
 * the *phone*, not about the swing. Throwing the other 56 away would have thrown
 * away three quarters of everything the project knows about what a tick costs on
 * a device. See [`parseTimingOnly`](./dispatch.ts).
 */
function timedDispatches(): Timed[] {
  const out: Timed[] = [];
  for (const file of readdirSync(DIAGNOSTICS).sort()) {
    if (!file.endsWith('.json')) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(DIAGNOSTICS + file, 'utf8'));
    } catch {
      continue;
    }
    let carried: { at: string; timing: DispatchTiming } | null;
    try {
      carried = parseTimingOnly(raw);
    } catch {
      continue;
    }
    if (carried === null) continue;
    let replays: boolean;
    try {
      parseDispatch(raw);
      replays = true;
    } catch {
      replays = false;
    }
    out.push({
      file,
      timing: carried.timing,
      device: parseDeviceOnly(raw),
      replays,
      grade: parseGradeOnly(raw),
    });
  }
  return out;
}

/**
 * **The one number that turns a laptop measurement into a phone one**, measured
 * on both machines over the same runs.
 *
 * ## ⚠ It replaces a factor that compared two different runs
 *
 * `docs/plan/m3-the-field.md` records **10.8×** — the phone's 0.14 ms tick on
 * `2026-09-02T06-02-56` against *"this laptop's 0.013 ms mean"*, which is a
 * different run in a different field. AGENTS.md §3 asks every measurement to state
 * its cohort for exactly this reason: the same laptop fits **0.018 ms** on the
 * 06-02-56 run itself, so a third of that factor was the two runs not being the
 * same run.
 *
 * So this pools **both halves over the dispatches that can be flown on both
 * machines** — the 26 that still replay at this `SIM_VERSION`. The phone side is
 * the fixed-effects fit over their timing blocks; the laptop side is those same
 * recipes flown here and their tick work divided by their ticks. Neither side is
 * a number anybody typed.
 *
 * ⚠ **One asymmetry is left and is worth knowing**: the phone side is what those
 * runs cost on the build they were flown under, and the laptop side is what they
 * cost on today's. That is unavoidable — there is no way to re-run a phone — and
 * it is small here because the flyable cohort is two days old. It is the reason
 * the factor is re-derived on every invocation rather than written down.
 *
 * ## ⚠ It is an average over a tick's work, and it does not apply to every part
 *
 * Measured 2026-09-02, and it is the strongest caveat on this whole command. The
 * deadline scan's worst tick costs ~1.1 ms here, which at this factor would be
 * ~8 ms there — and on two separate runs that carried exactly such a tick
 * (`05-42-27` and `17-23-27`) **no frame on the phone exceeded 3 ms at all**. So
 * the scan's own factor is nearer ×2 than ×8. The likely reason is that it is
 * `stepSim` in a tight loop, the most JIT-friendly code in the game, where an
 * average tick is `derive` and allocates.
 *
 * The factor is therefore honest about a tick's *mean* and must not be spent on a
 * single tick whose work is unusual — which is the one thing the budget lines
 * below are tempted to do, and they say so.
 */
function conversion(
  pool: readonly Timed[],
  hz: number,
): { factor: number; low: number; high: number; runs: number; here: number; there: number } | null {
  const flyable: Timed[] = [];
  let cpu = 0;
  let ticks = 0;
  for (const one of pool) {
    if (!one.replays) continue;
    let recipe: Recipe;
    try {
      recipe = parseDispatch(JSON.parse(readFileSync(DIAGNOSTICS + one.file, 'utf8'))).recipe;
    } catch {
      continue;
    }
    const frames = measure(recipe, hz);
    for (const frame of frames) {
      if (frame.ticks === 0) continue;
      cpu += frame.cpu - frame.between;
      ticks += frame.ticks;
    }
    flyable.push(one);
  }
  const there = fitAcross(flyable.map((one) => one.timing));
  if (there === null || ticks === 0) return null;
  const here = cpu / ticks;
  return {
    factor: there.perTick / here,
    // The laptop side is known far better than the phone side, so the interval is
    // the phone's own carried through — which is the honest way round to say it.
    low: (there.perTick - 1.96 * there.error) / here,
    high: (there.perTick + 1.96 * there.error) / here,
    runs: flyable.length,
    here,
    there: there.perTick,
  };
}

/**
 * `--corpus`: what a tick costs on the phone, pooled, and whether the two fits on
 * record actually disagree.
 */
function corpus(): void {
  const all = timedDispatches();
  const phone = all.filter((one) => /iPhone/.test(one.device?.ua ?? ''));
  const lines: string[] = [
    '',
    bold(
      `  ▼ the corpus · ${all.length} dispatches carry a timing block, ${phone.length} from the phone`,
    ),
    dim(
      '  Every fit below is the same least squares over the same block. The scatter is the point.',
    ),
    '',
    '     dispatch              frames   off-diagonal    a 1-tick frame     a tick     the rest',
  ];
  const fits: number[] = [];
  for (const one of phone) {
    const fit = fitGroups(one.timing.byTicks);
    if (fit === null) continue;
    fits.push(fit.perTick);
    const lever = leverageOf(one.timing);
    lines.push(
      `  ${one.file.slice(0, 19).padEnd(21)}${String(one.timing.frames).padStart(7)}` +
        `${`${lever.off} (${(lever.share * 100).toFixed(1)}%)`.padStart(15)}` +
        `${`${(fit.perFrame + fit.perTick).toFixed(2)}ms`.padStart(18)}` +
        `${`${fit.perTick.toFixed(3)}`.padStart(11)}${`${fit.perFrame.toFixed(3)}`.padStart(13)}`,
    );
  }
  const sums = phone
    .map((one) => fitGroups(one.timing.byTicks))
    .filter((fit): fit is { perFrame: number; perTick: number } => fit !== null)
    .map((fit) => fit.perFrame + fit.perTick)
    .sort((a, b) => a - b);
  const splits = [...fits].sort((a, b) => a - b);
  const negative = fits.filter((tick) => tick < 0).length;
  const spread = (series: readonly number[]): string =>
    `${at(series, 0.05).toFixed(2)} – ${at(series, 0.95).toFixed(2)}`;
  lines.push('');
  lines.push(bold('  What the corpus says about its own estimator'));
  lines.push(
    `    the **sum** — a frame with one tick in it — ${spread(sums)}ms across ${sums.length} runs`,
  );
  lines.push(
    `    the **split** — what of that is the tick — ${spread(splits)}ms, and ` +
      bold(`${negative} of ${fits.length} runs fit a NEGATIVE tick`) +
      ', which is not a thing a tick can do',
  );
  lines.push(
    dim(
      '    So one run pins the sum and barely constrains the split. That is not a flaw in any run —\n' +
        '    it is what a fit through frames that nearly all ran exactly one tick can be asked for.',
    ),
  );

  // Pooled, and then pooled **per day**, because the thing that would make two
  // honest fits genuinely disagree is the build moving underneath them — which is
  // the staleness hazard `VISION.md`'s seventh pillar names. The corpus's mean
  // frame cpu climbs across these days; whether the *tick* does is a question the
  // pool can be asked rather than assumed.
  const pooled = fitAcross(phone.map((one) => one.timing));
  const days = [...new Set(phone.map((one) => one.file.slice(0, 10)))].sort();
  lines.push('');
  lines.push(bold('  Pooled, each run keeping its own frame cost, clustered by run'));
  lines.push('    cohort         runs   frames        a tick        95%');
  const pool = (label: string, of: readonly Timed[]): void => {
    const fit = fitAcross(of.map((one) => one.timing));
    if (fit === null) return;
    lines.push(
      `    ${label.padEnd(13)}${String(fit.runs).padStart(5)}${String(fit.frames).padStart(9)}` +
        `${`${fit.perTick.toFixed(3)} ± ${fit.error.toFixed(3)}`.padStart(16)}` +
        `${`${(fit.perTick - 1.96 * fit.error).toFixed(2)} – ${(fit.perTick + 1.96 * fit.error).toFixed(2)}`.padStart(15)}`,
    );
  };
  pool('all', phone);
  for (const day of days)
    pool(
      day,
      phone.filter((one) => one.file.startsWith(day)),
    );

  // **What coats are in the pool**, because from 2026-09-02 they are not all the
  // same one. The grade is one or two full-screen composites and it lands in the
  // *rest of a frame* term above, so a pool that mixes them is a pool whose
  // frame cost is an average over pictures. It is stated rather than corrected:
  // there are too few graded runs to fit a coat term, and inventing one would be
  // worse than naming the hazard.
  const coats = new Map<string, number>();
  for (const one of phone) coats.set(one.grade === null ? 'unstated' : one.grade.toFixed(2), 0);
  for (const one of phone) {
    const key = one.grade === null ? 'unstated' : one.grade.toFixed(2);
    coats.set(key, (coats.get(key) ?? 0) + 1);
  }
  if (coats.size > 1) {
    const said = [...coats].map(([at, runs]) => `${runs} at ${at}`).join(', ');
    lines.push('');
    lines.push(
      dim(
        `    ⚠ The pool mixes retro grades — ${said}. The pass is a full-screen composite and lands
` +
          `    in the rest-of-a-frame term above, so this cohort is an average over pictures as well as
` +
          `    over runs. "unstated" is a run flown before the pass existed, which is a grade of 0.`,
      ),
    );
  }

  if (pooled !== null) {
    lines.push('');
    lines.push(bold('  The two fits the plan could not reconcile'));
    for (const stamp of ['2026-09-01T06-00-36', '2026-09-02T06-02-56']) {
      const one = phone.find((each) => each.file.startsWith(stamp));
      const fit = one ? fitGroups(one.timing.byTicks) : null;
      if (!one || fit === null) continue;
      const lever = leverageOf(one.timing);
      lines.push(
        `    ${stamp}  a tick ${fit.perTick.toFixed(3)}, the rest ${fit.perFrame.toFixed(3)}, ` +
          `their sum ${bold(`${(fit.perFrame + fit.perTick).toFixed(2)}ms`)}, ` +
          `on ${lever.off} off-diagonal frames`,
      );
    }
    lines.push('');
    lines.push(
      '    They agree on everything either run can see. The sums are 6% apart; the splits differ by two,',
    );
    lines.push(
      `    and the whole corpus's splits differ by ${(at(splits, 1) - splits[0]!).toFixed(2)}ms with ${negative} of them impossible.`,
    );
    lines.push(
      `    ${bold('So: not a contradiction.')} Prefer the 09-02 fit of the two — 388 frames against 54 —`,
    );
    lines.push(
      `    and prefer the pooled ${pooled.perTick.toFixed(3)} ± ${pooled.error.toFixed(3)} to either, stating its cohort.`,
    );
  }

  const both = conversion(phone, DISPLAY_HZ);
  if (both !== null) {
    lines.push('');
    lines.push(bold('  The conversion, measured on both machines over the same runs'));
    lines.push(
      `    ${both.runs} dispatches replay at this SIM_VERSION and were flown here: a tick costs ` +
        `${both.here.toFixed(4)}ms on this laptop and ${both.there.toFixed(3)}ms on the phone over the same runs`,
    );
    lines.push(
      `    ${bold(`→ ×${both.factor.toFixed(1)}`)}, and 95% of ×${both.low.toFixed(1)} to ×${both.high.toFixed(1)}`,
    );
    lines.push(
      dim(
        "    ⚠ The plan's recorded 10.8× divided the phone's fit for one run by the laptop's mean on a\n" +
          '    different one. A third of it was the mismatch. This is the like-for-like number.',
      ),
    );
  }
  for (const line of lines) console.log(line);
  console.log('');
}

function usage(): never {
  console.error('usage: pnpm budget [<recipe or dispatch>.json | -] [--hz <rate>] [--corpus]');
  process.exit(2);
}

const args = process.argv.slice(2);
let source: string | null = null;
let hz = DISPLAY_HZ;
let wantsCorpus = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--corpus') {
    wantsCorpus = true;
  } else if (arg === '--hz') {
    hz = Number(args[++i]);
    if (!Number.isFinite(hz) || hz <= 0) usage();
  } else if (arg.startsWith('-') && arg !== '-') {
    usage();
  } else if (source === null) {
    source = arg;
  } else {
    usage();
  }
}

if (wantsCorpus) {
  corpus();
  process.exit(0);
}

function read(path: string): { recipe: Recipe; dispatch: Dispatch | null } {
  const text = path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  const raw: unknown = JSON.parse(text);
  const kind =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).kind : undefined;
  if (kind === undefined) return { recipe: parseRecipe(raw), dispatch: null };
  const dispatch = parseDispatch(raw);
  return { recipe: dispatch.recipe, dispatch };
}

let flying: { recipe: Recipe; dispatch: Dispatch | null };
try {
  flying = read(source ?? SHIPPED);
} catch (err) {
  console.error(
    `\n  cannot fly ${source ?? SHIPPED}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
}
const { recipe } = flying;

const frames = measure(recipe, hz);
const cpu = frames.map((frame) => frame.cpu);
const between = frames.map((frame) => frame.between);
const ticks = frames
  .filter((frame) => frame.ticks > 0)
  .map((frame) => (frame.cpu - frame.between) / frame.ticks);
const groups = groupsOf(frames);

console.log('');
console.log(
  bold(
    `  ▼ budget · ${recipe.field.generator} field v${recipe.field.version} · ${recipe.ticks} ticks (${(recipe.ticks * SECONDS_PER_TICK).toFixed(1)}s)` +
      ` · ${frames.length} frames at ${hz}Hz`,
  ),
);
console.log(
  dim(`  ${process.platform} · node ${process.versions.node} · best of ${REPEATS} flights · `) +
    red('not a phone') +
    dim(' — the phone below is where the milliseconds come from'),
);
console.log('');
console.log('  ms                        p50     p95     p99     max');
console.log(bold(row('frame cpu', cpu)));
console.log(dim(row('of it, one tick', ticks)));
console.log(dim(row('of it, interpolate', between)));
console.log('');
console.log(dim('  what a frame ran, and what it cost'));
console.log(dim('    ticks run   frames    mean cpu'));
for (let n = 0; n < groups.length; n++) {
  const group = groups[n]!;
  const each = group.frames === 0 ? '—' : `${(group.cpu / group.frames).toFixed(3)}ms`;
  console.log(
    dim(`    ${String(n).padStart(9)}   ${String(group.frames).padStart(6)}   ${each.padStart(9)}`),
  );
}
const flown = frames.reduce((sum, frame) => sum + frame.ticks, 0);
console.log(
  (flown === recipe.ticks ? dim : red)(
    `  These frames flew ${flown} of the recipe's ${recipe.ticks} ticks` +
      (flown === recipe.ticks ? '.' : ' — they should be the same number.'),
  ),
);
if (groups[0]!.frames === 0 && groups[2]!.frames === 0) {
  // Worth saying, because a reader who knows the phone's own dispatches will
  // notice: 27% of the frames on the reference run ran a number of ticks other
  // than one, and none here do. That is `ticksDue`'s grain rounding working
  // exactly as `src/sim/clock.ts` says it should at a *nominal* rate, and the
  // phone's spread comes from a display that is not nominal. `--hz` is how to see
  // catch-up frames: at 90 a third of them run none.
  console.log(
    dim(
      `  Every frame ran exactly one tick, which is the clock's grain rounding doing its job at a\n` +
        `  nominal ${hz}Hz. Try --hz 90 or --hz 40 to build frames that catch up and frames that do not.`,
    ),
  );
}
console.log(
  dim(
    '  The draw is not in any of this and cannot be: a Canvas2D millisecond off a laptop says nothing\n' +
      "  about a phone's. `pnpm profile`'s census counts it instead, because a count travels and a\n" +
      '  millisecond does not. What is timed here is the tick and the interpolation.',
  ),
);

// The worst frames, named, with what the run was doing on them — the same
// question `formatTiming` asks of a phone's twelve worst, asked of this laptop's.
const worst = [...frames].sort((a, b) => b.cpu - a.cpu).slice(0, WORST);
const walked = walkRun(
  recipe,
  worst.map((frame) => frame.tick),
);
const byTick = new Map(walked.moments.map((moment) => [moment.tick, moment]));
console.log('');
console.log(dim('  the worst frames, and what the run was doing on them'));
console.log(dim('       tick       cpu   ticks'));
for (const frame of worst) {
  const moment = byTick.get(frame.tick);
  const where =
    moment === undefined
      ? ''
      : moment.phase === 'coasting'
        ? 'coasting'
        : moment.phase === 'diving'
          ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
          : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze`;
  console.log(
    `  ${String(frame.tick).padStart(9)}  ${frame.cpu.toFixed(3).padStart(8)}ms  ${String(frame.ticks).padStart(5)}  ${where}`,
  );
}

// The baseline: the run's own phone timing when it has one, and the recorded
// baseline otherwise. A dispatch that carries its own is the better evidence,
// because then both halves are about the same flight.
let baseline: { dispatch: BaselineHead; timing: DispatchTiming; own: boolean } | null = null;
const ownTiming = flying.dispatch?.timing;
if (flying.dispatch !== null && flying.dispatch !== undefined && ownTiming !== undefined) {
  const own = flying.dispatch;
  baseline = {
    dispatch: { at: own.at, device: own.device ?? null, ticks: own.recipe.ticks, build: own.build },
    timing: ownTiming,
    own: true,
  };
} else {
  try {
    // **Read for its timing and its envelope, never for its recipe** — see
    // `BaselineHead`. `parseTimingOnly` carries the same validator and does not
    // ask whether this build would still fly the run underneath it.
    const raw: unknown = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const carried = parseTimingOnly(raw);
    const ticks = (((raw as Record<string, unknown>).recipe ?? {}) as Record<string, unknown>)
      .ticks;
    if (carried !== null) {
      baseline = {
        dispatch: {
          at: carried.at,
          device: parseDeviceOnly(raw),
          ticks: typeof ticks === 'number' ? ticks : 0,
          build: buildOf(raw),
        },
        timing: carried.timing,
        own: false,
      };
    }
  } catch {
    baseline = null;
  }
}

if (baseline === null) {
  console.log('');
  console.log(dim('  No phone baseline could be read, so there is nothing to scale this by.'));
} else {
  for (const line of baselineLines(baseline.dispatch, baseline.timing)) console.log(line);
  if (!baseline.own) {
    console.log(
      dim(
        '  ⚠ A different run from the one flown above — the recorded baseline, not this recipe’s own.',
      ),
    );
  }

  const phone = timedDispatches().filter((one) => /iPhone/.test(one.device?.ua ?? ''));
  const pooled = fitAcross(phone.map((one) => one.timing));
  const own = fitGroups(baseline.timing.byTicks);
  const perTick = pooled?.perTick ?? own?.perTick ?? null;
  const perFrame = own?.perFrame ?? null;

  const sortedTicks = [...ticks].sort((a, b) => a - b);
  const hereP99 = at(sortedTicks, 0.99);
  const hereMax = at(sortedTicks, 1);

  console.log('');
  console.log(bold('  ▼ the conversion, and the budget'));
  const both = conversion(phone, hz);
  if (perTick === null || perFrame === null || both === null) {
    console.log(
      dim('  The baseline cannot be split into a tick and a frame, so there is no factor.'),
    );
  } else {
    // **Not this run's own ratio.** The factor is a property of the two machines
    // and is measured over every dispatch that flies on both — see `conversion`.
    // Using this recipe's own laptop mean would put a run's field, its bodies and
    // its share of coasting into a number that is supposed to be about hardware,
    // which is exactly the mistake the 10.8× on record makes.
    const factor = both.factor;
    console.log(
      `  a tick costs ${both.here.toFixed(4)}ms here and ${both.there.toFixed(3)}ms there: ` +
        bold(`×${factor.toFixed(1)}`) +
        dim(
          ` — both halves over the ${both.runs} dispatches that fly on both machines, 95% ×${both.low.toFixed(1)} to ×${both.high.toFixed(1)}`,
        ),
    );
    console.log(
      dim(
        '  ⚠ Both halves are the same quantity — the marginal cost of one more tick inside a frame — ' +
          'measured\n  the same way on the same runs. It is the only comparison of a laptop with a phone this repo ' +
          'makes.',
      ),
    );
    console.log('');
    // **The binding case, and it is not the mean.** `ticksDue` hands one frame up
    // to MAX_CATCH_UP_TICKS, and a frame that catches up still has to draw — so
    // the budget is decided by the worst tick times the cap, plus what the phone
    // says the rest of a frame costs.
    const project = (ms: number): number => ms * factor * MAX_CATCH_UP_TICKS + perFrame;
    for (const [label, here] of [
      ['a p99 tick', hereP99],
      ['the worst tick', hereMax],
    ] as const) {
      const there = project(here);
      const fits = there <= FRAME_MS;
      console.log(
        `  ${label.padEnd(16)} ${here.toFixed(3)}ms here → ${(here * factor).toFixed(2)}ms there;` +
          ` ${MAX_CATCH_UP_TICKS} of them caught up in one frame plus the phone's ${perFrame.toFixed(2)}ms` +
          ` = ${bold(`${there.toFixed(1)}ms`)} of ${FRAME_MS.toFixed(1)} ` +
          (fits ? green('fits') : red('DOES NOT FIT')),
      );
    }
    console.log(
      dim(
        '  The worst line is deliberately pessimistic: three worst ticks have never landed in one frame.\n' +
          '  It is the ceiling a budget is supposed to be argued against, not a prediction.',
      ),
    );
    console.log(
      dim(
        '  ⚠ And the factor is an average over a tick’s work. A worst tick is worst because it is doing\n' +
          '  something unusual, and the unusual thing may not convert at the average rate — measured, the\n' +
          '  deadline scan converts nearer ×2. Read the p99 line; treat the worst line as an upper bound\n' +
          '  on an upper bound.',
      ),
    );
  }
}
console.log('');
