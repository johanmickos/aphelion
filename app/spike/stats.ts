/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * Percentiles, and no mean anywhere.
 *
 * `VISION.md`: "The units that matter are p99 and max, not mean — that class of
 * bug hides behind an average of calls that mostly return early." The mean is
 * not computed here rather than computed and ignored, so that nobody can quote
 * it later.
 */

export interface Stats {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Nearest-rank on the sorted samples. At 600 frames, p99 is the 6th worst. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i] ?? 0;
}

export function summarise(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * p99 over the first third of a run against p99 over the last third.
 *
 * A phone that starts fast and ends slow is a phone that is throttling, and a
 * verdict taken from a ten-second run on a cold device is a verdict that does
 * not survive a real session. This is the cheapest way to see it happening.
 */
export function drift(samples: readonly number[]): { early: number; late: number } {
  const third = Math.floor(samples.length / 3);
  if (third < 2) return { early: 0, late: 0 };
  return {
    early: summarise(samples.slice(0, third)).p99,
    late: summarise(samples.slice(-third)).p99,
  };
}

/**
 * Frames the display did not get. Measured against the run's own median
 * interval rather than an assumed 60Hz, because the author's phone may well be
 * a 120Hz one and a hard-coded 16.7ms would call every frame on it a success.
 */
export function dropped(intervals: readonly number[]): number {
  const median = summarise(intervals).p50;
  if (median <= 0) return 0;
  const limit = median * 1.5;
  let n = 0;
  for (const v of intervals) if (v > limit) n++;
  return n;
}
