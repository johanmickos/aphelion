/**
 * Physics invariants — properties that must hold regardless of equality.
 *
 * These outlive the equality gate: when Stage 2 deliberately changes behaviour,
 * these are what still hold the physics honest.
 */
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { circSpeed } from '../src/sim/orbit.ts';
import { KINK_THRESHOLD_DEG } from '../src/sim/trace.ts';
import type { Input, SimState } from '../src/sim/types.ts';

interface Observed {
  maxDefl: number;
  kinkPhases: string[];
  minRadiusRatio: number;
  minFuel: number;
  maxFuel: number;
  settledSpeedError: number | null;
}

function observe(scName: string): Observed {
  const sc = SCENARIOS.find((s) => s.name === scName)!;
  const cfg = DEFAULT_CONFIG;
  const state: SimState = createInitialState(cfg);
  if (sc.ship) Object.assign(state.ship, sc.ship);

  const o: Observed = {
    maxDefl: 0,
    kinkPhases: [],
    minRadiusRatio: Infinity,
    minFuel: Infinity,
    maxFuel: -Infinity,
    settledSpeedError: null,
  };
  let held = false;

  for (let i = 0; i < sc.ticks; i++) {
    const pressed = i === sc.pressTick;
    const released = i === sc.releaseTick;
    if (pressed) held = true;
    if (released) held = false;
    const input: Input = { held: held || pressed, pressed, released };
    stepSim(state, cfg, input, FIXED_DT);

    o.minFuel = Math.min(o.minFuel, state.fuel);
    o.maxFuel = Math.max(o.maxFuel, state.fuel);

    const cap = state.capture;
    if (!cap) continue;
    if (cap.defl > o.maxDefl) o.maxDefl = cap.defl;
    if (cap.defl > KINK_THRESHOLD_DEG && !o.kinkPhases.includes(cap.phase))
      o.kinkPhases.push(cap.phase);

    const r = Math.hypot(cap.rx, cap.ry);
    o.minRadiusRatio = Math.min(o.minRadiusRatio, r / cap.minR);

    // A fully tightened orbit must run at the true circular speed for its radius.
    if (cap.phase === 'orbit' && cap.settleProgress >= 1) {
      const speed = Math.hypot(cap.vx, cap.vy);
      o.settledSpeedError = Math.abs(speed - circSpeed(cfg, r)) / circSpeed(cfg, r);
    }
  }
  return o;
}

const ALL = SCENARIOS.map((s) => s.name);

describe('invariants', () => {
  it.each(ALL)('%s: the ship never goes inside the minimum orbit radius', (name) => {
    const o = observe(name);
    if (o.minRadiusRatio === Infinity) return; // never captured
    expect(o.minRadiusRatio).toBeGreaterThanOrEqual(1 - 1e-12);
  });

  it.each(ALL)('%s: fuel stays within [0, fuelMax]', (name) => {
    const o = observe(name);
    expect(o.minFuel).toBeGreaterThanOrEqual(0);
    expect(o.maxFuel).toBeLessThanOrEqual(DEFAULT_CONFIG.fuelMax);
  });

  it('a fully settled orbit runs at the true circular speed', () => {
    const o = observe('long hold (circularizes fully into orbit)');
    expect(o.settledSpeedError).not.toBeNull();
    expect(o.settledSpeedError!).toBeLessThan(0.05);
  });

  describe('smoothness (max deflection per sample)', () => {
    /**
     * Every scenario is smooth. This block used to carve out one exception and
     * pin its 46-degree kink, so that fixing the periapsis floor bounce would
     * fail here loudly and specifically. It did exactly that — see PORT_NOTES 18,
     * where the floor turned out to be a symptom of captures never receiving
     * their clearance impulse. The exception is gone because the cause is.
     */
    /**
     * The one scenario that is not smooth, and why it is allowed to be.
     *
     * `flybyBrake` went 320 -> 600 to make a too-fast grab recoverable. The brake
     * turns the heading in proportion to its strength, so the cost is a visible
     * kink while it is biting. Swept over the braked-flyby scenario:
     *
     *     brake  320  400  450  500  550  600  700
     *     defl   2.9  6.9 10.0 12.2 14.4 16.4 19.2   degrees
     *
     * 15 is the visible-kink line, so it crosses between 550 and 600. The fuel
     * rate has no bearing on it — 40 and 54 both give 16.4.
     *
     * This is a deliberate trade, not a defect: the kink lasts a few ticks during
     * a save that previously just failed. It is pinned rather than excused, so
     * dropping the brake back below ~550, or ramping the brake in so it stops
     * snapping the heading, fails here and asks for this block to go.
     */
    const KINKY = 'fast unbound grab -> flyby, braked';

    it.each(ALL.filter((n) => n !== KINKY))('%s: no kinks', (name) => {
      const o = observe(name);
      expect(o.kinkPhases, `kinks appeared in ${o.kinkPhases.join(',')}`).toEqual([]);
      expect(o.maxDefl).toBeLessThan(KINK_THRESHOLD_DEG);
    });

    it(`${KINKY}: kinks only while the brake is biting`, () => {
      const o = observe(KINKY);
      // Nowhere but the flyby: a kink in the settle or the dive would be a
      // different bug wearing this exception as cover.
      expect([...new Set(o.kinkPhases)]).toEqual(['flyby']);
      expect(o.maxDefl).toBeGreaterThan(KINK_THRESHOLD_DEG);
      expect(o.maxDefl, 'the brake kink got worse — see the sweep above').toBeLessThan(18);
    });

    it('no scenario reaches the minimum-orbit floor any more', () => {
      for (const name of ALL) {
        const o = observe(name);
        if (o.minRadiusRatio === Infinity) continue;
        expect(o.minRadiusRatio, `${name} bottomed out on the floor`).toBeGreaterThan(1.001);
      }
    });
  });
});
