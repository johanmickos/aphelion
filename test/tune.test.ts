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
      // A real played sequence, lifted from a diagnostics report: P1 to P2 to P3.
      //
      // This is what actually covers `bodySpacing`, and it is here because the
      // scenario above it that claims to ("long enough to travel between bodies")
      // has never done so — measured at 0.0px across the knob's whole range on
      // this config AND on the one before it. Spacing was riding entirely on the
      // braked-flyby scenario, where the old brake let the grab sail past P1 and
      // coast into a second body. `flybyBrake` 320 -> 600 converts that grab
      // instead, so it never leaves P1 and the coverage vanished with it.
      //
      // A sequence a person actually played is the durable fixture here: it
      // chains captures the way the game is played, rather than depending on a
      // failure mode that tuning can remove.
      {
        edges: [
          [119, 1],
          [266, 0],
          [312, 1],
          [430, 0],
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
      if (k.key === INERT_KNOB) continue; // see the test below
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

  it('never lets the simulation write back to the config it was handed', () => {
    /**
     * What makes a tuned setting stick.
     *
     * The app holds one config object for the whole page session: the sliders
     * write to it, and `life.phase` has no path back to `armed`, so it is read
     * by every tick of every life until the page is reloaded. Nothing resets it
     * on death — a respawn happens INSIDE the run. The only way that could stop
     * being true is the simulation quietly mutating the object it was given, so
     * that is what this pins.
     */
    const tuned: SimConfig = {
      ...DEFAULT_CONFIG,
      flybyBrake: 600,
      fuelRegen: 30,
      bodySpacing: 500,
    };
    const before = JSON.stringify(tuned);
    const st = createInitialState(tuned);

    // Long enough to cross a death and a respawn, which is the moment a config
    // would plausibly get clobbered back to defaults.
    const edges = new Map<number, 0 | 1>([
      [240, 1],
      [318, 0],
      [900, 1],
      [1000, 0],
    ]);
    let held = false;
    let deaths = 0;
    let wasEnding = false;
    for (let t = 0; t < 2500; t++) {
      const e = edges.get(t);
      const pressed = e === 1;
      const released = e === 0;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(st, tuned, { held: held || pressed, pressed, released } as Input, FIXED_DT);
      if (st.ending.active && !wasEnding) deaths++;
      wasEnding = st.ending.active;
    }

    expect(deaths, 'the run never died, so this proves less than it should').toBeGreaterThan(0);
    expect(JSON.stringify(tuned)).toBe(before);
  });

  /**
   * `fuelRegen` currently cannot move the ship, and that is a finding, not a
   * blind spot in the fixtures above.
   *
   * Fuel only ever reaches a trajectory through three gates: a grab refused at
   * `fuel <= 0.5`, the flyby brake needing `fuel > 0`, and a circularisation
   * puttering out at zero. `flybyBrake` 320 -> 600 with `flybyFuelPerSec` 54 -> 40
   * made a save 2.5x cheaper per unit of speed shed, and conversions fast enough
   * that the tank stops emptying — a greedy pilot over 16 captures never went
   * below 76 of 100. What little drain remains is wiped by `respawn`, which
   * refills the tank on every death.
   *
   * Checked before concluding it, as the rule in AGENTS.md requires: brake-drain
   * scenarios from 330 to 540 px/s, settle-drain over four to seven long
   * captures, and the chaining pilot at three hold lengths. Every one moved the
   * ship exactly 0.0px across the knob's whole range.
   *
   * Pinned as inert rather than quietly skipped, so that bringing the brake back
   * down — or making fuel bind some other way — fails HERE and says to put the
   * knob back in the loop above.
   */
  const INERT_KNOB = 'fuelRegen';

  it('pins fuelRegen as currently unable to move the ship', () => {
    const knob = KNOBS.find((k) => k.key === INERT_KNOB)!;
    const base = createInitialState(DEFAULT_CONFIG);
    void base;

    const run = (regen: number) => {
      const cfg: SimConfig = { ...DEFAULT_CONFIG, fuelRegen: regen };
      const st = createInitialState(cfg);
      const edges = new Map<number, 0 | 1>([
        [20, 1],
        [200, 0],
        [320, 1],
        [470, 0],
      ]);
      Object.assign(st.ship, { x: 105, y: 354, vx: 0, vy: -450 });
      let held = false;
      let minFuel = cfg.fuelMax;
      const path: Array<{ x: number; y: number }> = [];
      for (let t = 0; t < 800; t++) {
        const e = edges.get(t);
        const pressed = e === 1;
        const released = e === 0;
        if (pressed) held = true;
        if (released) held = false;
        stepSim(st, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
        minFuel = Math.min(minFuel, st.fuel);
        path.push(shipWorldPos(st));
      }
      return { path, minFuel };
    };

    const lo = run(knob.min);
    const hi = run(knob.max);
    // The tank really does empty here — this is not a scenario that fails to
    // reach the mechanism, it is the mechanism failing to reach the trajectory.
    expect(lo.minFuel).toBe(0);

    let moved = 0;
    for (let i = 0; i < lo.path.length; i++) {
      moved = Math.max(
        moved,
        Math.hypot(hi.path[i]!.x - lo.path[i]!.x, hi.path[i]!.y - lo.path[i]!.y),
      );
    }
    expect(
      moved,
      'fuelRegen moves the ship again — put it back in the liveness loop above',
    ).toBeLessThanOrEqual(0.5);
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
