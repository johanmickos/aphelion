/**
 * What a frame cost, kept on the phone, in a shape that survives the phone's
 * clock.
 *
 * The report this session exists to answer is *"some lag during some swings"* —
 * intermittent, during play, on a device. A mean cannot see that: it is the one
 * statistic an occasional 40ms frame disappears into. So nothing here averages
 * anything. It keeps the **whole distribution**, as a histogram, and the
 * **worst frames by name**, each stamped with the tick it happened on so a
 * hitch can be replayed against what the run was doing at the time.
 *
 * ## It is handed the time; it never reads a clock
 *
 * The same rule [`ticksDue`](../src/sim/clock.ts) is written under, for the same
 * reason: a module that reads a clock can only be tested by a machine that has
 * one, and a distribution assembled from fabricated timestamps is the only kind
 * whose arithmetic can be *checked*. `app/main.ts` measures, because it is the
 * shell and the shell owns the clock (ADR-0006). This counts.
 *
 * It also means the ban that `pnpm portable` enforces over `src/sim/`,
 * `src/state/` and `src/input/` is not something this file had to route around.
 * It lives in `tools/` beside [`dispatch.ts`](./dispatch.ts) because both its
 * ends are dev-only and the shape it produces crosses the wire.
 *
 * ## Why a histogram rather than four percentiles
 *
 * **The phone's clock is 1ms.** Every number in the six timing reports already
 * in `diagnostics/` is a whole millisecond — Firefox on iOS clamps
 * `performance.now()` for privacy, and that clamp is the ceiling on what any
 * single frame's cost can be known to. So a sample *is* an integer, a 1ms
 * bucket loses nothing that was ever there, and sixty-five counters carry the
 * entire distribution in about the space four percentiles would take.
 *
 * Three things follow, and each is worth having:
 *
 *   - **The terminal computes the percentiles.** `vite-plugin-diag.ts` already
 *     states the principle — *"the report carries samples, not conclusions"* —
 *     and a p99 the phone worked out is a conclusion nobody can re-derive.
 *   - **Shape is visible.** A run at a steady 16ms with eleven frames at 33ms is
 *     bimodal, and that is the signature of a *dropped frame* rather than of
 *     slow code. Percentiles hide it; a histogram cannot.
 *   - **A mean is still exact**, because the untruncated sum rides along beside
 *     the counts. A mean is the wrong tool for finding a hitch and the right one
 *     for measuring a baseline, and the baseline is what a budget is made of.
 *
 * ## The one number that makes a laptop's measurements usable
 *
 * Frames are grouped by **how many simulation ticks each ran**, with a count and
 * a summed cost per group. `ticksDue` hands a frame 0, 1, 2 or 3 ticks depending
 * on how the display's rate and the tick rate happen to land, so a normal run
 * produces thousands of frames in at least two of those groups by itself.
 *
 * The mean cost across the groups is a straight line whose **slope is what one
 * tick costs on this phone** and whose **intercept is what everything else in a
 * frame costs** — the draw, the interpolation, the browser. That is the budget
 * the performance session is asked for, measured on the device rather than
 * scaled from a laptop by a factor nobody can defend. The line is fitted in
 * [`frameCost`](./trail.ts), on the reading side, for the same reason the
 * percentiles are.
 *
 * **What makes it work is dither, and that is worth knowing before trusting
 * it.** A clamped clock reports `⌊start + cost⌋ − ⌊start⌋`, which is either the
 * floor or the ceiling of the cost depending on where inside its millisecond the
 * frame began. Over thousands of frames beginning all over that millisecond, the
 * proportion that round up *is* the fraction, and the mean recovers what no
 * single sample carries — 0.6ms out of a clock that can only say 0 or 1.
 *
 * So the precision comes from the **noise**, not from the arithmetic. A display
 * that ticked at exactly 1000/60 ms with exactly the same work every frame would
 * put every start on one of three phases and the estimate would come back
 * low — measured at 13% low, in `test/meter.test.ts`, which fabricates that
 * phone deliberately so the failure has a name. No real device is that still: a
 * vsync is approximate, a callback is not entered at the vsync, and no two
 * frames of this game draw the same number of bodies.
 */
import { MAX_CATCH_UP_TICKS } from '../src/sim/units.ts';
import type { Tick } from '../src/sim/types.ts';

/**
 * How many 1ms buckets a histogram carries, the last one being everything at or
 * above it.
 *
 * Sixty-five reaches 64ms, which is four frames at 60Hz — past any hitch worth
 * distinguishing from any other, and short of a backgrounded tab, which belongs
 * in the overflow rather than in a bucket of its own.
 */
export const TIMING_BUCKETS = 65;

/** How many of the worst frames are named. Enough to see a pattern in. */
export const MAX_WORST_FRAMES = 12;

/**
 * How many segments the run is cut into for the timeline.
 *
 * **A distribution has no *when* in it**, and that is what this is for. The
 * first report the meter answered came back as *"towards the end … I definitely
 * felt some lag"* — a claim about a stretch of a run — and the histogram, which
 * is the whole run at once, could not speak to it. Answering it meant replaying
 * the recipe beside the dispatch, which works and is not the point: the evidence
 * should carry its own answer.
 *
 * Sixteen is enough to locate a stretch in a run of any length and small enough
 * that the block stays a fixed size. The segments **grow rather than
 * multiply** — see [`fold`](#) — so an hour and a minute cost the same bytes.
 */
export const TIMELINE_SEGMENTS = 16;

/** One measured quantity's whole distribution, in 1ms buckets. */
export interface Bucketed {
  /** `buckets[i]` is how many samples fell in [i, i+1) ms; the last is the overflow. */
  readonly buckets: readonly number[];
  /** The samples' sum, untruncated, so a mean survives the bucketing. */
  readonly total: number;
  /** The largest single sample, kept exactly — the bucket only says which one it was in. */
  readonly max: number;
}

/**
 * One frame worth naming, and the tick it happened on.
 *
 * `cpu` is the work this game did on the main thread; `interval` is how long the
 * frame actually took. **The difference is the part that was not us** — a
 * compositor, a collection, a thermal stall — and the two side by side are what
 * separate a slow renderer from a busy phone. `ticks` is how many simulation
 * ticks the frame ran, because a frame that caught three up is expensive for a
 * reason that is not a bug.
 */
export interface WorstFrame {
  readonly tick: Tick;
  readonly cpu: number;
  readonly interval: number;
  readonly ticks: number;
}

/** Frames that ran the same number of ticks: how many, and what they cost in total. */
export interface TickGroup {
  readonly frames: number;
  readonly cpu: number;
}

/**
 * One stretch of the run, so *when* is a question the dispatch can answer.
 *
 * `jumps` is the field this exists for, and it carries no threshold: a frame
 * that ran **two or more ticks** advanced the simulation further than it
 * displayed, which is `ticksDue` catching up after something delayed the frame
 * before it. That is a *jump* rather than a slowdown, and the two are different
 * bugs with different fixes — so it is counted directly rather than inferred
 * from a millisecond cutoff nobody can defend across display rates.
 */
export interface Segment {
  /** The tick the run had reached when this segment closed. */
  readonly tick: Tick;
  readonly frames: number;
  /** Summed, not averaged — the reader divides, and can also add two segments up. */
  readonly cpu: number;
  readonly interval: number;
  /** Frames that ran two or more ticks. */
  readonly jumps: number;
  /** The longest single interval in the segment. */
  readonly worst: number;
}

export interface DispatchTiming {
  /** Frames measured. The last frame of a run is never finished, so it is not one. */
  readonly frames: number;
  readonly cpu: Bucketed;
  readonly interval: Bucketed;
  /** Indexed by ticks run, `0` to `MAX_CATCH_UP_TICKS` — see the header. */
  readonly byTicks: readonly TickGroup[];
  /** The worst frames by `interval`, worst first. */
  readonly worst: readonly WorstFrame[];
  /** The run in order, oldest first — at most `TIMELINE_SEGMENTS` of them. */
  readonly timeline: readonly Segment[];
}

interface Histogram {
  buckets: number[];
  total: number;
  max: number;
}

/** A frame that has begun and not yet been finished by the next one starting. */
interface Open {
  presentedAt: number;
  startedAt: number;
  cpu: number;
  tick: Tick;
  ticks: number;
}

export interface Meter {
  frames: number;
  cpu: Histogram;
  interval: Histogram;
  byTicks: TickGroup[];
  /** Kept sorted, worst first, and never longer than `MAX_WORST_FRAMES`. */
  worst: WorstFrame[];
  /** Oldest first. The last one is still filling. */
  timeline: Segment[];
  /** How many frames each closed segment holds — doubles when the run outgrows it. */
  span: number;
  open: Open | null;
}

function histogram(): Histogram {
  return { buckets: new Array<number>(TIMING_BUCKETS).fill(0), total: 0, max: 0 };
}

/** How many frames a timeline segment holds before the run outgrows the scale. */
const FIRST_SPAN = 32;

export function createMeter(): Meter {
  return {
    frames: 0,
    cpu: histogram(),
    interval: histogram(),
    byTicks: Array.from({ length: MAX_CATCH_UP_TICKS + 1 }, () => ({ frames: 0, cpu: 0 })),
    worst: [],
    timeline: [{ tick: 0, frames: 0, cpu: 0, interval: 0, jumps: 0, worst: 0 }],
    span: FIRST_SPAN,
    open: null,
  };
}

/**
 * Halve the timeline by adding neighbours together, and double the span.
 *
 * The reason the timeline costs the same bytes for an hour as for a minute: when
 * the run outgrows the scale it is on, the scale coarsens rather than the array
 * growing. Every segment stays a true sum of the frames inside it, so a
 * timeline that has folded four times is the same measurement at lower
 * resolution — never a sample of one, and never an average of averages.
 */
function fold(meter: Meter): void {
  const folded: Segment[] = [];
  for (let i = 0; i + 1 < meter.timeline.length; i += 2) {
    const a = meter.timeline[i]!;
    const b = meter.timeline[i + 1]!;
    folded.push({
      tick: b.tick,
      frames: a.frames + b.frames,
      cpu: a.cpu + b.cpu,
      interval: a.interval + b.interval,
      jumps: a.jumps + b.jumps,
      worst: Math.max(a.worst, b.worst),
    });
  }
  // An odd tail is the segment still filling; it keeps its own identity rather
  // than being folded into a neighbour it does not belong with.
  if (meter.timeline.length % 2 === 1) folded.push(meter.timeline[meter.timeline.length - 1]!);
  meter.timeline = folded;
  meter.span *= 2;
}

/** Put a closed frame into the timeline, coarsening the scale if the run outgrew it. */
function place(meter: Meter, frame: WorstFrame): void {
  let last = meter.timeline[meter.timeline.length - 1]!;
  if (last.frames >= meter.span) {
    if (meter.timeline.length >= TIMELINE_SEGMENTS) fold(meter);
    last = { tick: frame.tick, frames: 0, cpu: 0, interval: 0, jumps: 0, worst: 0 };
    meter.timeline.push(last);
  }
  meter.timeline[meter.timeline.length - 1] = {
    tick: frame.tick,
    frames: last.frames + 1,
    cpu: last.cpu + frame.cpu,
    interval: last.interval + frame.interval,
    jumps: last.jumps + (frame.ticks >= 2 ? 1 : 0),
    worst: Math.max(last.worst, frame.interval),
  };
}

/**
 * A sample lands in the bucket its whole millisecond names, and past the end it
 * lands in the last one.
 *
 * A negative sample is impossible from a monotonic clock and is folded into the
 * first bucket rather than refused: the meter's job is to keep evidence, and a
 * clock that went backwards is evidence about the phone.
 */
function record(into: Histogram, ms: number): void {
  const at = Math.min(TIMING_BUCKETS - 1, Math.max(0, Math.floor(ms)));
  into.buckets[at]! += 1;
  into.total += ms;
  if (ms > into.max) into.max = ms;
}

function remember(meter: Meter, frame: WorstFrame): void {
  const worst = meter.worst;
  if (worst.length === MAX_WORST_FRAMES && frame.interval <= worst[worst.length - 1]!.interval) {
    return;
  }
  let at = worst.length;
  while (at > 0 && worst[at - 1]!.interval < frame.interval) at -= 1;
  worst.splice(at, 0, frame);
  if (worst.length > MAX_WORST_FRAMES) worst.length = MAX_WORST_FRAMES;
}

/**
 * A frame has begun, which is also what finishes the one before it.
 *
 * A frame's **interval** is only knowable once the next one starts, so this is
 * where the previous frame is closed and counted. `presentedAt` is the
 * display's own timestamp for the frame — the one `requestAnimationFrame` hands
 * over, which is a vsync rather than a moment in this function, and so is the
 * honest thing to measure a frame *period* between. `startedAt` is the clock
 * now, and it is what the frame's own cost is measured from, so the gap between
 * the two — the browser deciding to call us — stays in the interval where it
 * belongs and out of the cost, which is ours.
 */
export function frameBegan(meter: Meter, presentedAt: number, startedAt: number): void {
  const previous = meter.open;
  if (previous !== null) {
    const interval = presentedAt - previous.presentedAt;
    meter.frames += 1;
    record(meter.cpu, previous.cpu);
    record(meter.interval, interval);
    const group = meter.byTicks[Math.min(previous.ticks, MAX_CATCH_UP_TICKS)]!;
    meter.byTicks[Math.min(previous.ticks, MAX_CATCH_UP_TICKS)] = {
      frames: group.frames + 1,
      cpu: group.cpu + previous.cpu,
    };
    const closed: WorstFrame = {
      tick: previous.tick,
      cpu: previous.cpu,
      interval,
      ticks: previous.ticks,
    };
    remember(meter, closed);
    place(meter, closed);
  }
  meter.open = { presentedAt, startedAt, cpu: 0, tick: 0, ticks: 0 };
}

/**
 * The frame's work is done: what it cost, which tick the run reached, and how
 * many ticks it ran to get there.
 *
 * Nothing is counted here. The frame is not finished until the next one begins,
 * because until then its interval does not exist yet.
 */
export function frameEnded(meter: Meter, endedAt: number, tick: Tick, ticks: number): void {
  const open = meter.open;
  if (open === null) return;
  open.cpu = endedAt - open.startedAt;
  open.tick = tick;
  open.ticks = ticks;
}

/** What the meter has, or `null` if no frame has been finished yet. */
export function timingOf(meter: Meter): DispatchTiming | null {
  if (meter.frames === 0) return null;
  return {
    frames: meter.frames,
    cpu: { buckets: [...meter.cpu.buckets], total: meter.cpu.total, max: meter.cpu.max },
    interval: {
      buckets: [...meter.interval.buckets],
      total: meter.interval.total,
      max: meter.interval.max,
    },
    byTicks: meter.byTicks.map((group) => ({ ...group })),
    worst: meter.worst.map((frame) => ({ ...frame })),
    timeline: meter.timeline.filter((s) => s.frames > 0).map((s) => ({ ...s })),
  };
}

/**
 * The percentile a bucketed distribution can support, in whole milliseconds.
 *
 * It answers *"the p99 frame was in the 33ms bucket"* and never *"the p99 frame
 * was 33.4ms"*, which is the truth about a measurement whose samples were
 * whole milliseconds to begin with. The bucket's **lower** edge is returned, so
 * every number this produces is one the run really did at least reach.
 */
export function bucketAt(bucketed: Bucketed, fraction: number): number {
  const count = bucketed.buckets.reduce((sum, n) => sum + n, 0);
  if (count === 0) return 0;
  const rank = Math.min(count, Math.max(1, Math.ceil(fraction * count)));
  let seen = 0;
  for (let i = 0; i < bucketed.buckets.length; i++) {
    seen += bucketed.buckets[i]!;
    if (seen >= rank) return i;
  }
  return bucketed.buckets.length - 1;
}

/** How many samples a distribution holds. */
export function bucketCount(bucketed: Bucketed): number {
  return bucketed.buckets.reduce((sum, n) => sum + n, 0);
}
