/**
 * THE GATE.
 *
 * Runs every scenario against the immutable prototype and against the port, and
 * requires them to agree exactly. Nothing in Stage 0 may change behaviour, so the
 * tolerance is zero rather than an epsilon — and it currently holds at zero.
 *
 * When a PORT-NOTE fix lands in Stage 2 this test will fail loudly and
 * specifically for that scenario. That is the designed signal: re-read the diff,
 * confirm the change is the intended one, and move the affected scenario onto the
 * golden baseline instead of the live prototype.
 */
import { describe, expect, it } from 'vitest';
import { runPrototype } from '../tools/prototype-harness.ts';
import { runPort } from './run-port.ts';
import { SCENARIOS } from './scenarios.ts';
import { compare } from '../tools/compare.ts';
import { FIXED_DT } from '../src/sim/config.ts';

describe('port equality vs index.html', () => {
  for (const sc of SCENARIOS) {
    it(`reproduces "${sc.name}" exactly`, () => {
      const proto = runPrototype(sc, FIXED_DT);
      const port = runPort(sc, FIXED_DT);

      expect(port).toHaveLength(proto.length);

      const r = compare(proto, port, 0);
      const detail = r.first
        ? ` first divergence at tick ${r.first.tick} in ${r.first.field}: ` +
          `prototype=${String(r.first.proto)} port=${String(r.first.port)}`
        : '';

      expect(r.phaseMismatches, `phase mismatches${detail}`).toBe(0);
      expect(r.maxPositionDelta, `position${detail}`).toBe(0);
      expect(r.maxVelocityDelta, `velocity${detail}`).toBe(0);
      expect(r.maxFuelDelta, `fuel${detail}`).toBe(0);
    });
  }
});

describe('scenario matrix coverage', () => {
  it('exercises every reachable capture phase', () => {
    const seen = new Set<string>();
    for (const sc of SCENARIOS) {
      for (const s of runPort(sc, FIXED_DT)) seen.add(s.phase);
    }
    // `whip` is absent deliberately: the prototype never assigns it. PORT_NOTES 4.
    for (const phase of ['drift', 'clear', 'flyby', 'settle', 'orbit', 'crash']) {
      expect(seen, `phase "${phase}" is never exercised`).toContain(phase);
    }
  });
});
