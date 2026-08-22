/**
 * What a grab BECOMES when the ship is already flying away from the body.
 *
 * Reported as "here my last capture attempt spent no fuel. Why is that?" — and it
 * had not. The grab took, entered `clear`, and `clear` is the free phase: only
 * the settle and the flyby brake ever spend. A capture converts at periapsis, and
 * at 94% of escape speed on the way out, periapsis was ten seconds and half a
 * field away. The run coasted silently into the wall with the button held down.
 *
 * `outboundFlybyFrac` is the line. Above it an outbound grab is a flyby, so
 * holding brakes it round — which is the manoeuvre the player was trying to
 * perform, and the one that spends the fuel they expected to spend.
 */
import { describe, expect, it } from 'vitest';
import type { SimConfig } from '../src/sim/config.ts';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { escapeSpeed, hypot } from '../src/sim/orbit.ts';
import { beginCapture } from '../src/sim/capture.ts';
import type { SimState } from '../src/sim/types.ts';

/**
 * The last grab of diagnostics report 2026-08-22T19-19-12, seeded from its
 * tick-780 checkpoint — phone truth, even though that session's replay diverged
 * long before it (AGENTS, "reading a diagnostics report", rule 3).
 *
 * Grabbed the planet it had just released from, at r=100 with 311px/s against an
 * escape speed of 331: bound, and leaving at 223px/s radially.
 */
function reportedGrab(cfg: SimConfig): SimState {
  const state = createInitialState(cfg);
  state.ship.x = 128.32;
  state.ship.y = -1231.01;
  state.ship.vx = -64.48;
  state.ship.vy = -304.05;
  state.fuel = 77.2;
  // Well above the ship, so the backtrack floor cannot be what ends this.
  state.highWaterY = -1600;
  return state;
}

interface Flight {
  phases: string[];
  fuelSpent: number;
  endedAs: string | null;
  settledAt: number | null;
  ticks: number;
}

/** Hold the button and report what happened. */
function hold(cfg: SimConfig, state: SimState, maxTicks = 60 * 20): Flight {
  const phases: string[] = [];
  const fuel0 = state.fuel;
  let settledAt: number | null = null;
  let i = 0;
  for (; i < maxTicks; i++) {
    stepSim(state, cfg, { held: true, pressed: i === 0, released: false }, FIXED_DT);
    const cap = state.capture;
    const phase = cap ? cap.phase : state.ending.active ? state.ending.reason : 'drift';
    if (phases[phases.length - 1] !== phase) phases.push(phase);
    if (cap?.phase === 'orbit' && settledAt === null) settledAt = i;
    if (state.ending.active) break;
    if (settledAt !== null) break;
  }
  return {
    phases,
    fuelSpent: fuel0 - state.fuel,
    endedAs: state.ending.active ? state.ending.reason : null,
    settledAt,
    ticks: i,
  };
}

const OLD_RULE: SimConfig = { ...DEFAULT_CONFIG, outboundFlybyFrac: 1 };

describe('a grab that is already flying away from the planet', () => {
  it('is the case the report caught: no fuel, no periapsis, into the wall', () => {
    // The pin for the defect itself. If this ever stops reproducing under the old
    // rule, the defect is gone for some other reason and this file should say so.
    const f = hold(OLD_RULE, reportedGrab(OLD_RULE));
    expect(f.phases).toEqual(['clear', 'out-of-bounds']);
    expect(f.fuelSpent).toBe(0);
    expect(f.endedAs).toBe('out-of-bounds');
    expect(f.ticks / 60).toBeLessThan(3);
  });

  it('is braked round instead, and settles, under the current rule', () => {
    const cfg = DEFAULT_CONFIG;
    const f = hold(cfg, reportedGrab(cfg));
    // flyby (braking) -> clear (the dive it earned) -> settle -> orbit
    expect(f.phases[0]).toBe('flyby');
    expect(f.phases).toContain('settle');
    expect(f.endedAs).toBe(null);
    expect(f.settledAt).not.toBe(null);
    // and it costs something, which is the whole of what the player expected
    expect(f.fuelSpent).toBeGreaterThan(10);
  });

  it('reaches the brake only above the line, not merely by pointing outward', () => {
    // Same geometry, slowed until it sits below `outboundFlybyFrac`. A bound ship
    // ambling outward still gets its free capture; the carve-out is about the
    // ones that cannot come back in time, not about the direction.
    const cfg = DEFAULT_CONFIG;
    const slow = reportedGrab(cfg);
    const b = slow.bodies[5]!;
    const rx = slow.ship.x - b.x;
    const ry = slow.ship.y - b.y;
    const r = hypot(rx, ry);
    const spd = hypot(slow.ship.vx, slow.ship.vy);
    const want = 0.5 * escapeSpeed(cfg, r);
    slow.ship.vx *= want / spd;
    slow.ship.vy *= want / spd;
    // still outbound, just slower
    expect((slow.ship.vx * rx + slow.ship.vy * ry) / r).toBeGreaterThan(0);

    expect(beginCapture(slow, cfg)).toBe('captured');
    expect(slow.capture?.phase).toBe('clear');
  });

  it('classifies the reported grab as a flyby and the same grab reversed as a dive', () => {
    const cfg = DEFAULT_CONFIG;
    const out = reportedGrab(cfg);
    expect(beginCapture(out, cfg)).toBe('captured');
    expect(out.capture?.phase).toBe('flyby');

    // The identical speed, aimed the other way, is an ordinary fast dive and must
    // stay one — inbound grabs at 0.90+ of escape converted 96% of the time.
    const inb = reportedGrab(cfg);
    inb.ship.vx = -inb.ship.vx;
    inb.ship.vy = -inb.ship.vy;
    expect(beginCapture(inb, cfg)).toBe('captured');
    expect(inb.capture?.phase).toBe('clear');
  });

  it('leaves the prototype alone, whatever the fraction says', () => {
    // `boundGrabsCapture` is false there, so the rule this modifies does not
    // exist. Both extremes must agree, or the equality gate is being decided by a
    // key the prototype never had.
    const phaseAt = (frac: number): string | undefined => {
      const cfg: SimConfig = { ...PROTOTYPE_CONFIG, outboundFlybyFrac: frac };
      const state = createInitialState(cfg);
      state.ship.x = 128.32;
      state.ship.y = -1231.01;
      state.ship.vx = -64.48;
      state.ship.vy = -304.05;
      expect(beginCapture(state, cfg)).toBe('captured');
      return state.capture?.phase;
    };
    expect(phaseAt(0)).toBe(phaseAt(1));
    expect(phaseAt(0.65)).toBe(phaseAt(1));
  });

  it('is inert at 1 — the value an older report replays under', () => {
    // `configFromReport` fills a missing key from PROTOTYPE_CONFIG, so this IS
    // what a session recorded before the key existed did. See note 21.
    expect(PROTOTYPE_CONFIG.outboundFlybyFrac).toBe(1);
    const cfg: SimConfig = { ...DEFAULT_CONFIG, outboundFlybyFrac: 1 };
    const state = reportedGrab(cfg);
    expect(beginCapture(state, cfg)).toBe('captured');
    expect(state.capture?.phase).toBe('clear');
  });
});
