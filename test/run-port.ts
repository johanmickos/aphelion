/** Runs a scenario against the ported simulation, producing the same sample shape. */
import type { Scenario } from '../tools/prototype-harness.ts';
import type { TrajectorySample } from '../src/sim/serialize.ts';
import { sampleTrajectory } from '../src/sim/serialize.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import type { Input } from '../src/sim/types.ts';

export function runPort(scenario: Scenario, dt: number): TrajectorySample[] {
  const cfg = PROTOTYPE_CONFIG;
  const state = createInitialState(cfg);
  if (scenario.ship) Object.assign(state.ship, scenario.ship);

  const out: TrajectorySample[] = [];
  let held = false;
  for (let i = 0; i < scenario.ticks; i++) {
    const pressed = i === scenario.pressTick;
    const released = i === scenario.releaseTick;
    if (pressed) held = true;
    if (released) held = false;
    const input: Input = { held: held || pressed, pressed, released };
    stepSim(state, cfg, input, dt);
    out.push(sampleTrajectory(state));
  }
  return out;
}
