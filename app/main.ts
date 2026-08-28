/**
 * The app shell: the clock that drives the three layers, and nothing else.
 *
 * This file is the one place the layers meet. It steps the simulation, derives
 * presentation state from it, and hands that to the renderer — which is the
 * whole of ADR-0006 expressed in a couple of dozen lines, and the reason it is
 * worth having before there is a game to put through it.
 *
 * It is also the only place in the repo that reads a wall clock. The simulation
 * cannot (`pnpm portable`), so the elapsed time is measured here and handed in;
 * [`ticksDue`](../src/sim/clock.ts) decides what it is worth in ticks, capped so
 * a slept phone cannot fast-forward the run it comes back to. What is left over
 * after that — time observed but not yet worth a tick — is how far between two
 * ticks the frame being drawn falls, and handing it to the renderer is what
 * makes a 120Hz phone show a swing rather than a stutter (ADR-0006).
 *
 * The field is a fixture and says so ([`fixture-field.ts`](../src/sim/fixture-field.ts)):
 * spec [17 · §3](../docs/spec/17-daily-field.md) rules that a day is generated
 * once as data before the first tick, and the generator is M3's.
 */
import { createClock, ticksDue } from '../src/sim/clock.ts';
import { fixtureCraft, fixtureField } from '../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { SECONDS_PER_TICK } from '../src/sim/units.ts';
import { createPress, isPressed } from '../src/input/press.ts';
import { derive } from '../src/state/derive.ts';
import { attachCanvas, sizeToDisplay } from '../src/render/canvas.ts';
import { interpolate } from '../src/render/interpolate.ts';
import { draw } from '../src/render/index.ts';
import { bindPress } from './input.ts';

/** Replaced at build time by Vite's `define`; `dev` when the dev server serves it. */
declare const __BUILD_STAMP__: string;

const target = document.getElementById('app');
const readout = document.getElementById('readout');
const reset = document.getElementById('reset');

if (target) {
  const context = attachCanvas(target);
  const press = createPress();
  bindPress(press, target);

  // The seed is fixed rather than drawn from anything: a run is described by its
  // seed and its input log (ADR-0004), and until M1.5 records one, the seed that
  // is easiest to say out loud is the useful one.
  const start = (): ReturnType<typeof createInitialState> =>
    createInitialState(fixtureField(), fixtureCraft(), 1);

  let sim = start();
  let current = derive(sim);
  let previous = current;
  const clock = createClock();
  let observed = performance.now();

  // Developer chrome, and the only thing in the build that is not the one verb.
  // A run that has flown off the top of a fixture field with no boundary and no
  // death in it — both are M1.4's — has nowhere to come back from, and the gate
  // is flying this repeatedly.
  const restart = (): void => {
    sim = start();
    current = derive(sim);
    previous = current;
  };
  reset?.addEventListener('click', restart);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR') restart();
  });

  const frame = (now: number): void => {
    const elapsedSeconds = (now - observed) / 1000;
    observed = now;

    const ticks = ticksDue(clock, elapsedSeconds);
    for (let i = 0; i < ticks; i++) {
      previous = current;
      stepSim(sim, { pressed: isPressed(press) });
      current = derive(sim);
    }

    sizeToDisplay(context);
    draw(interpolate(previous, current, clock.unspentSeconds / SECONDS_PER_TICK), context);

    if (readout) {
      readout.textContent =
        `APHELION · ${__BUILD_STAMP__} · tick ${current.tick} · ` +
        `${current.craft.speed.toFixed(0)}/s`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
