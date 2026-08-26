/**
 * The course picker.
 *
 * Two things are worth pinning and they are not the obvious one. That a short
 * course has fewer bodies is trivially true by construction; that it is still a
 * COMPLETE game — reachable ending, at least one anomaly, a field wide enough to
 * weave in — is what makes it a demo rather than a truncation. And that a session
 * played on it does not get called a different build is what keeps every
 * diagnostics report from it readable.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { COURSES, courseOf, withCourse } from '../src/sim/course.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import { fieldBounds, finishLineY } from '../src/sim/world.ts';

describe('the course picker', () => {
  it('round-trips: a config built for a course reports that course', () => {
    for (const id of ['full', 'short'] as const) {
      expect(courseOf(withCourse(DEFAULT_CONFIG, id))).toBe(id);
    }
  });

  it('leaves the default config on the full course', () => {
    expect(courseOf(DEFAULT_CONFIG)).toBe('full');
    expect(DEFAULT_CONFIG.bodyCount).toBe(COURSES.full.bodyCount);
    expect(DEFAULT_CONFIG.anomalyCount).toBe(COURSES.full.anomalyCount);
  });

  it('changes nothing about the ship, only about the world', () => {
    // The reason this is not a tune knob. Every key it touches describes what
    // exists; none describes how flying feels.
    const full = withCourse(DEFAULT_CONFIG, 'full');
    const short = withCourse(DEFAULT_CONFIG, 'short');
    const differing = (Object.keys(full) as Array<keyof typeof full>).filter(
      (k) => full[k] !== short[k],
    );
    expect(differing.sort()).toEqual(['anomalyCount', 'bodyCount']);
  });
});

describe('a short course is a whole game, not a truncated one', () => {
  const short = withCourse(DEFAULT_CONFIG, 'short');

  it('builds every body it asked for', () => {
    const state = createInitialState(short);
    const planets = state.bodies.filter((b) => b.kind === 'planet');
    expect(planets.length).toBe(COURSES.short.bodyCount);
  });

  it('still places an anomaly, so the set piece is reachable', () => {
    // The summary sheet counts anomalies. A course that could never contain one
    // would make that row permanently zero and the stat meaningless on the very
    // course used to test the sheet.
    const state = createInitialState(short);
    expect(state.bodies.filter((b) => b.kind === 'anomaly').length).toBe(
      COURSES.short.anomalyCount,
    );
  });

  it('has a crest that a climb can actually reach', () => {
    const state = createInitialState(short);
    const fb = fieldBounds(short, state.bodies);
    expect(fb.crest).toBeLessThan(state.ship.y);
    // And the ceiling still sits beyond the finish line, so the geometry the clear
    // depends on is the same geometry, just closer. Stated as the relationship
    // rather than as 800: the ceiling moves up with the carpet, and
    // `test/cleared.test.ts` owns why.
    expect(fb.top).toBeLessThan(finishLineY(short, fb)!);
  });

  it('can be cleared, which is the entire point of it existing', () => {
    const state = createInitialState(short);
    const fb = fieldBounds(short, state.bodies);
    state.ship.x = fb.left + fb.width * 0.5 + 300;
    state.ship.y = fb.crest + 200;
    state.ship.vx = 0;
    state.ship.vy = -400;
    state.ship.burstX = 0;
    state.ship.burstY = 0;
    state.highWaterY = state.ship.y;
    for (let i = 0; i < 600 && !state.ending.active; i++) {
      stepSim(state, short, NO_INPUT, FIXED_DT);
    }
    expect(state.ending.reason).toBe('cleared');
  });

  it('is a materially shorter climb than the full one', () => {
    const fullState = createInitialState(DEFAULT_CONFIG);
    const shortState = createInitialState(short);
    const fullClimb = fullState.ship.y - fieldBounds(DEFAULT_CONFIG, fullState.bodies).crest;
    const shortClimb = shortState.ship.y - fieldBounds(short, shortState.bodies).crest;
    expect(shortClimb).toBeLessThan(fullClimb / 3);
  });
});

describe('a short-course session is not mistaken for a different build', () => {
  it('classifies its keys as a course choice rather than skew', async () => {
    // Without this every report from the demo course raises "THIS REPORT CAME
    // FROM A DIFFERENT BUILD" — the crying-wolf failure the three-way split was
    // introduced to end, arriving through a fourth door.
    const { COURSE_KEYS } = await import('../tools/replay-core.ts');
    const full = withCourse(DEFAULT_CONFIG, 'full');
    const short = withCourse(DEFAULT_CONFIG, 'short');
    const differing = (Object.keys(full) as Array<keyof typeof full>).filter(
      (k) => full[k] !== short[k],
    );
    for (const k of differing) {
      expect(COURSE_KEYS.has(k as string), `${String(k)} must be classified`).toBe(true);
    }
  });
});
