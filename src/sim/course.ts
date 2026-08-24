/**
 * How long the course is.
 *
 * A named pair rather than two loose numbers, because "how much field is there"
 * is one decision and splitting it across `bodyCount` and `anomalyCount` at every
 * call site is how the two drift apart — a short course with the full field's
 * three anomalies would be almost entirely anomaly.
 *
 * WHY IT IS NOT A TUNE KNOB. The panel's sliders are feel: they change how the
 * ship behaves and `test/tune.test.ts` measures each one by how far it moves the
 * ship. Course length moves nothing about the ship at all — it changes what world
 * exists — so a slider for it would be measured by a test that cannot see it, and
 * would sit among knobs answering a different question.
 *
 * WHY IT IS NOT BUILD SKEW EITHER, which is the part that needed care. A
 * diagnostics report classifies a config difference four ways, and only one of
 * them distrusts the report. Left unclassified, every session played on the short
 * course would raise "THIS REPORT CAME FROM A DIFFERENT BUILD" — the crying-wolf
 * failure that split was introduced to end. `tools/replay-core.ts` therefore
 * knows this key by name and prints it as a course choice.
 */
import type { SimConfig } from './config.ts';

export type CourseId = 'full' | 'short';

export interface Course {
  id: CourseId;
  /** Shown on the armed screen. */
  label: string;
  bodyCount: number;
  anomalyCount: number;
}

/**
 * SHORT IS TWELVE BODIES, WHICH IS A TESTING LENGTH AND NOT A DESIGN ONE.
 *
 * The full field is sixty, and the 2026-08-23 capture cleared it in about
 * eighty-five seconds — roughly 0.7 bodies a second. Twelve is therefore ~17
 * seconds to the crest: long enough that a chain has somewhere to climb and the
 * multiplier visibly moves, short enough to watch the ending twenty times in the
 * time one full run takes.
 *
 * One anomaly, not three. `placeAnomalies` spreads them evenly over the rows it
 * was given, so keeping three across twelve bodies would put a set piece every
 * four planets and make the short course a tour of anomalies rather than a short
 * version of the game. One keeps the encounter reachable — which matters, since
 * the summary sheet counts anomalies — without it dominating.
 */
export const COURSES: Readonly<Record<CourseId, Course>> = Object.freeze({
  full: { id: 'full', label: 'FULL', bodyCount: 60, anomalyCount: 3 },
  short: { id: 'short', label: 'SHORT DEMO', bodyCount: 12, anomalyCount: 1 },
});

/** The course a config describes, by matching its counts. */
export function courseOf(cfg: SimConfig): CourseId {
  return cfg.bodyCount === COURSES.short.bodyCount &&
    cfg.anomalyCount === COURSES.short.anomalyCount
    ? 'short'
    : 'full';
}

/** A config flying `id` instead of whatever it was flying. */
export function withCourse<T extends SimConfig>(cfg: T, id: CourseId): T {
  const c = COURSES[id];
  return { ...cfg, bodyCount: c.bodyCount, anomalyCount: c.anomalyCount };
}
