/**
 * The app shell: the clock that drives the three layers, and nothing else.
 *
 * This file is the one place the layers meet. It steps the simulation, derives
 * presentation state from it, and hands that to the renderer — which is the
 * whole of ADR-0006 expressed in a dozen lines, and the reason it is worth
 * having before there is a game to put through it.
 *
 * It is also the only place in the repo that reads a wall clock. The simulation
 * cannot (`pnpm portable`), so the elapsed time is measured here and handed in;
 * [`ticksDue`](../src/sim/clock.ts) decides what it is worth in ticks, capped so
 * a slept phone cannot fast-forward the run it comes back to.
 *
 * There is still no game here: no input, no grab, no orbit. The field below is a
 * fixture, and the swing is [M1.3](../docs/plan/m1-the-swing.md).
 */
import { createClock, ticksDue } from '../src/sim/clock.ts';
import { createBody } from '../src/sim/body.ts';
import { createCraft } from '../src/sim/craft.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import { derive } from '../src/state/derive.ts';
import { draw } from '../src/render/index.ts';

const target = document.getElementById('app');

if (target) {
  const field = { bodies: [createBody(585, 1200, 132)] };
  const sim = createInitialState(field, createCraft(200, 2200, 120, -260), 1);
  const clock = createClock();
  let previous = performance.now();

  const frame = (now: number): void => {
    const elapsedSeconds = (now - previous) / 1000;
    previous = now;
    const ticks = ticksDue(clock, elapsedSeconds);
    for (let i = 0; i < ticks; i++) stepSim(sim, NO_INPUT);
    draw(derive(sim), target);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
