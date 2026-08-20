/**
 * Fixed-timestep loop with an accumulator and render interpolation.
 *
 * The simulation only ever advances by exactly `dt`, which is what makes runs
 * reproducible. Rendering runs at display rate and interpolates between the last
 * two simulated ticks, so a 60Hz simulation still presents smoothly on a 120Hz
 * display. The catch-up cap prevents a spiral of death after a stall and mirrors
 * the prototype's `Math.min(0.05, ...)` clamp exactly (3 steps at 1/60).
 */
export interface LoopCallbacks {
  /** Advance the simulation exactly one tick. */
  step(dt: number): void;
  /** Draw. `alpha` is the fraction between the previous tick and the current one. */
  render(alpha: number, frameDt: number): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /**
   * Discard accumulated time and restart the clock. Call when resuming after the
   * page was hidden: the elapsed wall time is real but the player was not there
   * for it, and replaying it as catch-up ticks makes the ship jump.
   */
  resetClock(): void;
}

export function createLoop(dt: number, maxSteps: number, cb: LoopCallbacks): Loop {
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    const frameDt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += frameDt;

    let steps = 0;
    while (acc >= dt && steps < maxSteps) {
      cb.step(dt);
      acc -= dt;
      steps++;
    }
    // Drop any backlog beyond the cap rather than trying to catch up forever.
    if (acc > dt * maxSteps) acc = 0;

    cb.render(acc / dt, frameDt);
    raf = requestAnimationFrame(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    },
    resetClock(): void {
      last = performance.now();
      acc = 0;
    },
  };
}
