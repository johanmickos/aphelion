/**
 * The app shell: the clock that drives the three layers, and nothing else.
 *
 * This file is the one place the layers meet. It steps the simulation, derives
 * presentation state from it, and hands that to the renderer — which is the
 * whole of ADR-0006 expressed in five lines, and the reason it is worth having
 * before there is a game to put through it.
 *
 * There is still no game here. M0.3 is the skeleton and the boundary that keeps
 * it honest; the swing is [M1](../docs/plan/m1-the-swing.md).
 */
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { NO_INPUT } from '../src/sim/types.ts';
import { derive } from '../src/state/derive.ts';
import { draw } from '../src/render/index.ts';

const target = document.getElementById('app');

if (target) {
  const sim = createInitialState();

  // One tick per frame, deliberately naive. The real loop is a fixed timestep
  // with a catch-up bound, because a tick has to mean the same thing on every
  // device for a recipe to replay — but that loop belongs with the physics it
  // exists to protect, and arrives in M1.
  const frame = (): void => {
    stepSim(sim, NO_INPUT);
    draw(derive(sim), target);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
