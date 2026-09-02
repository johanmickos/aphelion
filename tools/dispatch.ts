/**
 * A recipe with what the author saw beside it — `CONTEXT.md`'s **dispatch**, and
 * the shape of what crosses the wire from the phone to the machine that keeps
 * it.
 *
 * The author's judgement is the scarcest input this project has and it is made
 * on a phone (ADR-0004, ADR-0010). A session flown without a recorder produces
 * one sentence and no evidence — *"the grab feels late"* — which costs a whole
 * cycle to reproduce and may not be reproducible at all. With a recipe under it
 * the same sentence is a tick number, an agent can re-fly that exact dive under
 * a changed constant, and a disagreement about the swing stops being a
 * disagreement about two memories of it.
 *
 * **It is not a second name for a recipe.** A recipe is the run; a dispatch is
 * the run plus the testimony, and the testimony is the half a machine cannot
 * produce.
 *
 * ## Why it lives in `tools/` and not in `src/`
 *
 * Both of its ends are dev-only: `app/main.ts` builds one behind
 * `import.meta.env.DEV`, and `vite-plugin-diag.ts` — which is `apply: 'serve'`
 * and never exists in a production build — receives it. `src/` is the game, and
 * the three layers there are a wall worth keeping meaningful (ADR-0006); a
 * module that is neither simulation, presentation state nor renderer would be
 * the first thing in it that has no layer. What it must not become is two
 * shapes, one on each side of the wire, so it is one file that both ends import.
 *
 * ## What is validated, and why it is validated here
 *
 * The endpoint writes files on a server bound to every interface on the LAN, so
 * everything below arrives as attacker-shaped data. The recipe is the sharp
 * part — lengths, indices and a seed — and [`parseRecipe`](../src/sim/recipe.ts)
 * is the one door it comes in through, whether it arrives from a phone, from a
 * file or from the CLI. What this file adds is the envelope around it: bounded
 * strings, a bounded count of flagged ticks, and every one of those ticks inside
 * the run it claims to be about.
 */
import type { Recipe } from '../src/sim/recipe.ts';
import { parseRecipe } from '../src/sim/recipe.ts';
import type { Tick } from '../src/sim/types.ts';
import { MAX_CATCH_UP_TICKS } from '../src/sim/units.ts';
import { MAX_WORST_FRAMES, TIMELINE_SEGMENTS, TIMING_BUCKETS } from './meter.ts';
import type { Bucketed, DispatchTiming, Segment, TickGroup, WorstFrame } from './meter.ts';

export type { Bucketed, DispatchTiming, Segment, TickGroup, WorstFrame };

/**
 * Where the phone posts, and it is one path.
 *
 * It lives beside the shape rather than inside the plugin because the shell
 * needs it too, and the shell cannot import the plugin: that file reaches
 * `node:fs`, and a browser bundle has no business resolving it even in a branch
 * that is dropped.
 */
export const DIAG_ENDPOINT = '/__diag';

export const DISPATCH_KIND = 'run-dispatch';

/**
 * The most a dispatch may weigh, and it is a **measurement rather than an
 * assumption**.
 *
 * Measured on this build: an 85-second run at spec
 * [01 · §3](../docs/spec/01-swing.md)'s recorded press rate — 278 presses in 474
 * seconds — is 50 presses, **100 edges and 564 bytes**; the whole of that
 * 474-second cohort as a single recipe is **3.2 KB**; an unbroken hour of play at
 * the same rate is **27 KB**. The timing reports already in `diagnostics/` are
 * 1.7 – 1.9 KB. So this is about twice the largest legitimate thing anyone can
 * produce, and eight times narrower than the 512 KB this endpoint used to accept.
 *
 * It is the first line of defence and not the last: the input log's length is
 * bounded only by the run's own length, so a pathological log inside a legal
 * tick count would be megabytes, and the byte cap is what refuses it before
 * `parseRecipe` ever sees it.
 *
 * **The timing block does not move it**, and that is a property of the shape
 * rather than luck: two fixed-length histograms, four tick groups and at most
 * [`MAX_WORST_FRAMES`](./meter.ts) named frames is **1.2 KB on a real run and
 * 2.0 KB at its arithmetic widest** — every bucket occupied by a six-figure
 * count — measured both ways, and it is the *same* size however long the run
 * was. An hour of play carries the timing bytes a minute of it does, which is
 * the whole reason the distribution is bucketed rather than sent as samples.
 */
export const MAX_DISPATCH_BYTES = 64 * 1024;

/** How much the author may write. Longer than any note anyone has ever left. */
export const MAX_NOTE_LENGTH = 2000;

/**
 * How many ticks the author may flag in one run.
 *
 * A flag is a tap, and a run is a couple of minutes; five hundred of them is
 * more than a thumb can produce and small enough to read.
 */
export const MAX_FLAGGED_TICKS = 500;

/** What the run was flown on. Absent when it was not flown on anything — see below. */
export interface DispatchDevice {
  readonly ua: string;
  readonly dpr: number;
  readonly css: { readonly w: number; readonly h: number };
}

/**
 * What the author observed, which is the half of a dispatch that is not
 * mechanical.
 *
 * Two shapes, because a phone can only produce one of them mid-flight. `ticks`
 * are flagged with a tap while the run is being flown, which costs no attention
 * and lands exactly where the feeling did; `note` is typed afterwards, when
 * there is a keyboard and a hand free. The prototype learned the same split and
 * calls its half *"the player flagging a moment that felt wrong"*.
 */
export interface Observed {
  readonly ticks: readonly Tick[];
  readonly note: string;
}

export interface Dispatch {
  readonly kind: typeof DISPATCH_KIND;
  /**
   * When it was flown, ISO, from the phone's own clock.
   *
   * Evidence about the *session* and never about the *run*: nothing inside a
   * recipe is measured in wall-clock time, because the same session on a
   * stuttering phone and a smooth one produces the same ticks and different
   * milliseconds. This is here to answer "which build was that" and nothing else.
   */
  readonly at: string;
  readonly recipe: Recipe;
  readonly observed: Observed;
  /**
   * Optional, and its absence is meaningful: a dispatch with no device was not
   * flown by a person. The headless pilot in `test/sim/run.ts` produces recipes
   * too, and the one `pnpm replay` ships with is one of them.
   */
  readonly device?: DispatchDevice;
  /**
   * What the frames cost, if anything was counting — [`meter.ts`](./meter.ts).
   *
   * **Optional for the same reason `device` is**, and its absence says the same
   * kind of thing: a dispatch the headless pilot produced was not drawn, and the
   * four already in `diagnostics/` were flown before there was anything to count
   * with. A reader that demanded it would refuse the evidence this project
   * already has.
   */
  readonly timing?: DispatchTiming;
}

/** Stamp a dispatch, trimming what the author wrote to what may be sent. */
export function buildDispatch(args: {
  at: string;
  recipe: Recipe;
  observed: Observed;
  device?: DispatchDevice;
  timing?: DispatchTiming | null;
}): Dispatch {
  return {
    kind: DISPATCH_KIND,
    at: args.at,
    recipe: args.recipe,
    observed: {
      ticks: args.observed.ticks.slice(0, MAX_FLAGGED_TICKS),
      note: args.observed.note.slice(0, MAX_NOTE_LENGTH),
    },
    ...(args.device ? { device: args.device } : {}),
    ...(args.timing ? { timing: args.timing } : {}),
  };
}

function boundedString(value: unknown, what: string, most: number): string {
  if (typeof value !== 'string') throw new Error(`${what} is not a string`);
  if (value.length > most) throw new Error(`${what} is longer than ${most} characters`);
  return value;
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${what} is not a number`);
  }
  return value;
}

function parseDevice(raw: unknown): DispatchDevice {
  if (typeof raw !== 'object' || raw === null) throw new Error('device is not an object');
  const d = raw as Record<string, unknown>;
  const css = d.css;
  if (typeof css !== 'object' || css === null) throw new Error('device has no css size');
  const size = css as Record<string, unknown>;
  return {
    ua: boundedString(d.ua, 'user agent', 400),
    dpr: finite(d.dpr, 'device pixel ratio'),
    css: { w: finite(size.w, 'css width'), h: finite(size.h, 'css height') },
  };
}

function counting(value: unknown, what: string): number {
  const n = finite(value, what);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${what} is not a count`);
  return n;
}

function lasting(value: unknown, what: string): number {
  const n = finite(value, what);
  if (n < 0) throw new Error(`${what} is negative`);
  return n;
}

/**
 * One histogram, rebuilt from what survived.
 *
 * The bucket array's **length is fixed and checked**, which is what keeps the
 * byte cap a property of the shape: a caller cannot make this block large. The
 * count it carries is returned so the caller can hold the whole block to one
 * invariant — every distribution in a timing block describes the same frames,
 * so they must all count the same number of them, and a block that disagrees
 * with itself was not produced by a meter.
 */
function parseBucketed(raw: unknown, what: string): { value: Bucketed; count: number } {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${what} is not an object`);
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.buckets)) throw new Error(`${what} has no buckets`);
  const given = b.buckets as unknown[];
  if (given.length !== TIMING_BUCKETS) {
    throw new Error(`${what} has ${given.length} buckets, not ${TIMING_BUCKETS}`);
  }
  const buckets: number[] = [];
  let count = 0;
  for (const entry of given) {
    const n = counting(entry, `${what} bucket`);
    buckets.push(n);
    count += n;
  }
  return {
    value: {
      buckets,
      total: lasting(b.total, `${what} total`),
      max: lasting(b.max, `${what} max`),
    },
    count,
  };
}

/**
 * The timeline, in order and adding up to the frames the block claims.
 *
 * The sum is checked for the same reason the histograms' is: a meter cannot
 * produce a timeline that disagrees with its own frame count, so one that does
 * was not produced by a meter. What is *not* required is that the segments be
 * equal in size — they are not, because the last one is still filling and a
 * folded timeline carries an odd tail.
 */
function parseTimeline(raw: unknown, ticks: Tick, frames: number): Segment[] {
  // **Absent is legal, and it dates the dispatch.** The two runs the author flew
  // on 2026-08-29 carry timing and no timeline, because the timeline is what
  // reading them asked for. Refusing them to enforce a field they could not have
  // had would throw away the evidence that motivated it.
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('timeline is not an array');
  const given = raw as unknown[];
  if (given.length > TIMELINE_SEGMENTS) {
    throw new Error(`more than ${TIMELINE_SEGMENTS} timeline segments`);
  }
  let counted = 0;
  const out = given.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('malformed segment');
    const g = entry as Record<string, unknown>;
    const tick = counting(g.tick, 'segment tick');
    if (tick > ticks) throw new Error(`segment at tick ${tick} is outside a run of ${ticks}`);
    const held = counting(g.frames, 'segment frames');
    const jumps = counting(g.jumps, 'segment jumps');
    if (jumps > held) throw new Error(`a segment of ${held} frames cannot hold ${jumps} jumps`);
    counted += held;
    return {
      tick,
      frames: held,
      cpu: lasting(g.cpu, 'segment cpu'),
      interval: lasting(g.interval, 'segment interval'),
      jumps,
      worst: lasting(g.worst, 'segment worst interval'),
    };
  });
  if (counted !== frames) {
    throw new Error(`the timeline holds ${counted} frames, not ${frames}`);
  }
  return out;
}

function parseWorst(raw: unknown, ticks: Tick): WorstFrame[] {
  if (!Array.isArray(raw)) throw new Error('worst frames are not an array');
  const given = raw as unknown[];
  if (given.length > MAX_WORST_FRAMES) {
    throw new Error(`more than ${MAX_WORST_FRAMES} worst frames`);
  }
  return given.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('malformed worst frame');
    const f = entry as Record<string, unknown>;
    const tick = counting(f.tick, 'worst frame tick');
    // Inside the run it claims to be about — the same test a flagged tick gets,
    // and for the same reason: a hitch on a tick the run never reached is a
    // hitch on nothing, and the reader would go looking for it.
    if (tick > ticks) throw new Error(`worst frame at tick ${tick} is outside a run of ${ticks}`);
    const ran = counting(f.ticks, 'worst frame tick count');
    if (ran > MAX_CATCH_UP_TICKS) {
      throw new Error(`a frame cannot run ${ran} ticks; the clamp is ${MAX_CATCH_UP_TICKS}`);
    }
    return {
      tick,
      cpu: lasting(f.cpu, 'worst frame cpu'),
      interval: lasting(f.interval, 'worst frame interval'),
      ticks: ran,
    };
  });
}

/**
 * The timing block, validated the way everything else here is: rebuilt out of
 * what survived rather than cast.
 *
 * **Two invariants are checked rather than assumed**, and both are cheap:
 * every distribution counts the same frames, and the tick groups add up to that
 * same number. A meter cannot produce a block that fails either, so a block that
 * does is not evidence about a run — and evidence is the only thing this
 * endpoint exists to keep.
 */
/**
 * The timing block of a dispatch whose **recipe** this build refuses.
 *
 * ## ⚠ Why this is a door and not a hole in the wall
 *
 * A recipe recorded under an older `SIM_VERSION` is refused rather than replayed,
 * which is the corpus rule working: 26 dispatches replay at 9 and 56 do not. But
 * the **meter has not changed**, and a run's frame timings are evidence about the
 * *device* rather than about the swing — so a refused recipe leaves a perfectly
 * good measurement of what a phone costs sitting on disk, and `pnpm budget
 * --corpus` needs all 71 of them to say anything about what a tick costs.
 *
 * Nothing is loosened. The timing block goes through the identical validator, and
 * what this skips is the recipe, whose refusal is about a *different* question. It
 * is also read-only and terminal-side: `vite-plugin-diag.ts`, which writes files
 * on a server bound to every interface, still uses `parseDispatch` and nothing
 * else. The tick count the block is checked against is taken from the envelope and
 * validated here rather than trusted.
 *
 * `null` when the dispatch carries no timing at all.
 */
export function parseTimingOnly(raw: unknown): { at: string; timing: DispatchTiming } | null {
  if (typeof raw !== 'object' || raw === null) throw new Error('dispatch is not an object');
  const d = raw as Record<string, unknown>;
  if (d.kind !== DISPATCH_KIND) throw new Error(`not a dispatch: kind ${String(d.kind)}`);
  if (d.timing === undefined) return null;
  const recipe = d.recipe;
  if (typeof recipe !== 'object' || recipe === null) throw new Error('dispatch has no recipe');
  const ticks = counting((recipe as Record<string, unknown>).ticks, 'run length');
  return {
    at: boundedString(d.at, 'timestamp', 40),
    timing: parseTiming(d.timing, ticks),
  };
}

/** What the device that flew it says about itself, or `null` where it said nothing. */
export function parseDeviceOnly(raw: unknown): DispatchDevice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const device = (raw as Record<string, unknown>).device;
  return device === undefined ? null : parseDevice(device);
}

function parseTiming(raw: unknown, ticks: Tick): DispatchTiming {
  if (typeof raw !== 'object' || raw === null) throw new Error('timing is not an object');
  const t = raw as Record<string, unknown>;
  const frames = counting(t.frames, 'frame count');
  const cpu = parseBucketed(t.cpu, 'cpu');
  const interval = parseBucketed(t.interval, 'interval');
  if (cpu.count !== frames || interval.count !== frames) {
    throw new Error(
      `timing counts ${frames} frames but holds ${cpu.count} cpu and ${interval.count} interval`,
    );
  }
  if (!Array.isArray(t.byTicks)) throw new Error('tick groups are not an array');
  const given = t.byTicks as unknown[];
  if (given.length !== MAX_CATCH_UP_TICKS + 1) {
    throw new Error(`${given.length} tick groups, not ${MAX_CATCH_UP_TICKS + 1}`);
  }
  let grouped = 0;
  const byTicks: TickGroup[] = given.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('malformed tick group');
    const g = entry as Record<string, unknown>;
    const count = counting(g.frames, 'tick group frames');
    grouped += count;
    return { frames: count, cpu: lasting(g.cpu, 'tick group cpu') };
  });
  if (grouped !== frames) {
    throw new Error(`tick groups hold ${grouped} frames, not ${frames}`);
  }
  return {
    frames,
    cpu: cpu.value,
    interval: interval.value,
    byTicks,
    worst: parseWorst(t.worst, ticks),
    timeline: parseTimeline(t.timeline, ticks, frames),
  };
}

function parseObserved(raw: unknown, ticks: Tick): Observed {
  if (typeof raw !== 'object' || raw === null) throw new Error('dispatch observed nothing');
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.ticks)) throw new Error('flagged ticks are not an array');
  const flagged = o.ticks as unknown[];
  if (flagged.length > MAX_FLAGGED_TICKS) {
    throw new Error(`more than ${MAX_FLAGGED_TICKS} flagged ticks`);
  }
  const out: Tick[] = [];
  for (const entry of flagged) {
    // Inside the run it claims to be about: a flag at a tick the run never
    // reached is a flag on nothing, and the reader would draw it anyway.
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > ticks) {
      throw new Error(`flagged tick ${String(entry)} is not inside a run of ${ticks} ticks`);
    }
    out.push(entry);
  }
  return { ticks: out, note: boundedString(o.note, 'note', MAX_NOTE_LENGTH) };
}

/**
 * Validate rather than cast, and rebuild the dispatch out of what survived.
 *
 * What comes back shares nothing with what went in, which is what lets the
 * endpoint write *this* to disk rather than the bytes it was handed: a key
 * nobody validated cannot ride along inside an object that looks validated.
 */
export function parseDispatch(raw: unknown): Dispatch {
  if (typeof raw !== 'object' || raw === null) throw new Error('dispatch is not an object');
  const d = raw as Record<string, unknown>;
  if (d.kind !== DISPATCH_KIND) throw new Error(`not a dispatch: kind ${String(d.kind)}`);
  const recipe = parseRecipe(d.recipe);
  return {
    kind: DISPATCH_KIND,
    at: boundedString(d.at, 'timestamp', 40),
    recipe,
    observed: parseObserved(d.observed, recipe.ticks),
    ...(d.device === undefined ? {} : { device: parseDevice(d.device) }),
    ...(d.timing === undefined ? {} : { timing: parseTiming(d.timing, recipe.ticks) }),
  };
}
