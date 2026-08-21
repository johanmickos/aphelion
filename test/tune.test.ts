/**
 * The tune panel is only as good as its knob table: a slider that does nothing,
 * or whose range excludes the default, is worse than no slider.
 */
import { describe, expect, it } from 'vitest';
import { KNOBS } from '../src/app/tune.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import type { Input } from '../src/sim/types.ts';

describe('tunable parameters', () => {
  it('every knob names a real config key', () => {
    for (const k of KNOBS) {
      expect(DEFAULT_CONFIG, `${String(k.key)} is not in SimConfig`).toHaveProperty(
        k.key as string,
      );
      expect(typeof DEFAULT_CONFIG[k.key]).toBe('number');
    }
  });

  it('every default sits inside its slider range', () => {
    for (const k of KNOBS) {
      const v = DEFAULT_CONFIG[k.key] as number;
      expect(v, `${String(k.key)} default ${v} is below its minimum`).toBeGreaterThanOrEqual(k.min);
      expect(v, `${String(k.key)} default ${v} is above its maximum`).toBeLessThanOrEqual(k.max);
    }
  });

  it('every slider can actually reach its default', () => {
    // A step that does not divide the span leaves the default unreachable once
    // the slider has been moved away from it.
    for (const k of KNOBS) {
      const v = DEFAULT_CONFIG[k.key] as number;
      const steps = (v - k.min) / k.step;
      expect(
        Math.abs(steps - Math.round(steps)),
        `${String(k.key)} default is off-step`,
      ).toBeLessThan(1e-6);
    }
  });

  it('exposes no knob that leaves the simulation unchanged', () => {
    // The whole point of the sweep that chose these: a slider must do something.
    // It takes more than one scenario to show that — a capture never exercises
    // the flyby brake, and a short run never reaches the second body.
    interface Sc {
      ship?: { x: number; y: number; vx: number; vy: number };
      edges: Array<[number, 0 | 1]>;
      ticks: number;
    }
    const SCENARIOS: Sc[] = [
      // capture, released near the boost peak — a late release banks nothing,
      // and boostMax would measure as inert when it is the reward itself
      {
        edges: [
          [240, 1],
          [318, 0],
        ],
        ticks: 700,
      },
      // a grab too fast to hold, so the brake matters
      {
        ship: { x: 105, y: 354, vx: 0, vy: -430 },
        edges: [
          [20, 1],
          [300, 0],
        ],
        ticks: 400,
      },
      // long enough to travel between bodies, so spacing matters
      {
        edges: [
          [240, 1],
          [318, 0],
          [520, 1],
          [600, 0],
        ],
        ticks: 1600,
      },
      // Held long, then released mid-decay. This covers two blind spots the
      // scenarios above share. They release ~10 ticks into a 72-tick settle,
      // where smootherstep has only reached 0.02, so the knobs shaping the tail
      // of the settle read as inert however far they would move a held orbit;
      // and they release before the boost even arms, so the decay never runs.
      // Releasing at 450 clears the settle and lands inside the decay ramp --
      // hold much longer and every decay value has clamped to zero again.
      {
        edges: [
          [240, 1],
          [450, 0],
        ],
        ticks: 900,
      },
      // Spends the tank, drifts, then grabs again — the only shape that can see
      // fuelRegen at all. The four above each spend fuel at most once, and a
      // circularize costs ~21 of 100, so the tank never comes near the gate that
      // makes refuelling matter and every regen rate measures identically.
      // Here the flyby brake empties it by t135. With no regen the grab at t300
      // is refused for want of fuel and the ship drifts on; with a fast regen it
      // takes hold. That difference is the knob.
      {
        ship: { x: 105, y: 354, vx: 0, vy: -330 },
        edges: [
          [20, 1],
          [150, 0],
          [300, 1],
          [450, 0],
        ],
        ticks: 700,
      },
    ];

    const run = (cfg: SimConfig, sc: Sc) => {
      const st = createInitialState(cfg);
      if (sc.ship) Object.assign(st.ship, sc.ship);
      const edges = new Map(sc.edges);
      let held = false;
      const path: Array<{ x: number; y: number }> = [];
      for (let t = 0; t < sc.ticks; t++) {
        const e = edges.get(t);
        const pressed = e === 1;
        const released = e === 0;
        if (pressed) held = true;
        if (released) held = false;
        stepSim(st, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
        path.push(shipWorldPos(st));
      }
      return path;
    };

    const base = SCENARIOS.map((sc) => run(DEFAULT_CONFIG, sc));

    for (const k of KNOBS) {
      const v = DEFAULT_CONFIG[k.key] as number;
      let moved = 0;
      for (const alt of [k.min, k.max]) {
        if (alt === v) continue;
        const cfg = { ...DEFAULT_CONFIG, [k.key]: alt } as SimConfig;
        SCENARIOS.forEach((sc, i) => {
          const p = run(cfg, sc);
          for (let j = 0; j < base[i]!.length; j++) {
            moved = Math.max(moved, Math.hypot(p[j]!.x - base[i]![j]!.x, p[j]!.y - base[i]![j]!.y));
          }
        });
      }
      expect(moved, `${String(k.key)} does nothing across its whole range`).toBeGreaterThan(0.5);
    }
  });

  it('groups knobs contiguously, so the panel reads as sections', () => {
    const seen = new Set<string>();
    let current = '';
    for (const k of KNOBS) {
      if (k.group !== current) {
        expect(seen.has(k.group), `group ${k.group} appears twice`).toBe(false);
        seen.add(k.group);
        current = k.group;
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('gives every knob a hint that says what it does', () => {
    for (const k of KNOBS) {
      expect(k.hint.length, `${String(k.key)} has no hint`).toBeGreaterThan(20);
      expect(k.label.length).toBeGreaterThan(0);
    }
  });
});
