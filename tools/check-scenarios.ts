/**
 * Guards the scenario matrix's one precondition: no scenario may leave the
 * playfield, because out-of-bounds behaviour is deliberately outside the gate.
 *
 * A scenario that crosses still *passes* the gate for as long as both sides
 * happen to agree, so this cannot be left to the equality test to notice.
 */
import { SCENARIOS } from '../test/scenarios.ts';
import { PROTOTYPE_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { fieldBounds } from '../src/sim/world.ts';
import type { Input } from '../src/sim/types.ts';

let failures = 0;
for (const sc of SCENARIOS) {
  const cfg = PROTOTYPE_CONFIG;
  const state = createInitialState(cfg);
  if (sc.ship) Object.assign(state.ship, sc.ship);
  const fb = fieldBounds(cfg, state.bodies);
  let held = false;
  let closest = Infinity;

  for (let i = 0; i < sc.ticks; i++) {
    const pressed = i === sc.pressTick;
    const released = i === sc.releaseTick;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, cfg, { held: held || pressed, pressed, released } as Input, FIXED_DT);
    const p = shipWorldPos(state);
    closest = Math.min(closest, p.x - fb.left, fb.right - p.x, fb.bottom - p.y, p.y - fb.top);
    if (state.ending.active && state.ending.reason === 'out-of-bounds') {
      console.error(`"${sc.name}" leaves the field at tick ${i + 1} — shorten it`);
      failures++;
      break;
    }
  }
  if (!failures) {
    console.log(
      `  ok  ${sc.name.padEnd(46)} closest approach to a boundary: ${closest.toFixed(0)}px`,
    );
  }
}
if (failures) {
  console.error(`\n${failures} scenario(s) cross the playfield boundary.`);
  process.exit(1);
}
console.log('\nall scenarios stay inside the playfield');
