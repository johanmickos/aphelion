/**
 * Where wall-clock time stops and ticks begin.
 *
 * ADR-0006 gives the simulation the only clock in the game and makes its unit
 * the tick. Something still has to decide how many ticks a frame is worth, and
 * that decision needs a duration measured outside — which is the one fact about
 * the outside world the simulation is allowed to hear.
 *
 * It hears it as an argument. Nothing in this file reads a clock: `pnpm
 * portable` bans `Date`, `performance` and every timer in this layer, so the
 * caller measures and hands the number in. That keeps this function pure, which
 * is what lets a replay drive it with a fabricated duration and get the same
 * ticks the phone got.
 *
 * ## The caller hands in its error bar as well as its measurement
 *
 * A measurement without one was the whole of a bug. **WebKit clamps every clock
 * to a whole millisecond**, so the phone cannot say 16.667ms — it says 16 or 17,
 * and the leftover accumulates until it crosses a threshold and a frame runs two
 * ticks. Measured over three phone runs: **34 frames in 1 811 ran two ticks and
 * 37 ran none**, arriving in bursts (variance ÷ mean of 8, where scatter would
 * give 1) because a random walk near a boundary lingers there. A frame that runs
 * two ticks moves the world 33ms while showing one picture, and the author
 * reported it as *"visual stuttering"* while orbiting.
 *
 * So the duration arrives with the **grain** of the clock that measured it, and
 * a reading within one grain of a whole number of ticks is read as that whole
 * number — because it is, and the difference was the instrument rather than the
 * world. The default is zero, which means *exact*, and a caller that says
 * nothing gets the arithmetic this file always had.
 *
 * **What stops that inventing time is a bound rather than a promise.** Rounding
 * every frame up would let a display that genuinely runs at 63Hz drag the
 * simulation along with it — measured, 2.2 seconds of drift per minute of play.
 * So the clock remembers what the rounding has borrowed, and stops rounding
 * while that exceeds a single tick. On a display at any of the rates a 60Hz
 * phone actually reports, the borrowing oscillates around nothing and the bound
 * is never reached; on a display where rounding would be a lie, it engages
 * within a second and the drift stays under 7ms a minute. The guard is invisible
 * exactly where the reading is honest.
 *
 * Nothing here changes what a **recipe** does. [`replayRun`](./replay.ts) never
 * calls this function — it steps the simulation directly, one tick at a time —
 * so a run replays identically and `SIM_VERSION` does not move.
 */
import { MAX_CATCH_UP_TICKS, SECONDS_PER_TICK } from './units.ts';

/** Time observed but not yet spent on a tick. */
export interface Clock {
  unspentSeconds: number;
  /**
   * Time the rounding has added or taken away, and never more than one tick of
   * it — the bound that keeps reading a grainy clock from becoming a lie about
   * how fast the world runs. See the header.
   */
  borrowedSeconds: number;
}

export function createClock(): Clock {
  return { unspentSeconds: 0, borrowedSeconds: 0 };
}

/**
 * The reading, taken at face value, or the whole number of ticks it is really a
 * measurement of.
 *
 * Two things have to hold before a reading is rounded, and the second is what
 * makes this safe on hardware nobody here has: the difference has to be small
 * enough to be the instrument rather than the world, **and** the running total
 * of what rounding has borrowed has to stay inside a single tick. A display the
 * rounding would misrepresent trips the second condition within a second and is
 * read literally from then on.
 */
function roundedToWholeTicks(clock: Clock, elapsedSeconds: number, grainSeconds: number): number {
  if (grainSeconds <= 0) return elapsedSeconds;
  const whole = Math.round(elapsedSeconds / SECONDS_PER_TICK) * SECONDS_PER_TICK;
  if (Math.abs(elapsedSeconds - whole) > grainSeconds) return elapsedSeconds;
  const borrowed = clock.borrowedSeconds + (whole - elapsedSeconds);
  if (Math.abs(borrowed) > SECONDS_PER_TICK) return elapsedSeconds;
  clock.borrowedSeconds = borrowed;
  return whole;
}

/**
 * How many ticks `elapsedSeconds` of observed time buys, consuming them.
 *
 * **Capped at three.** A tab left in the background, a phone that slept, a
 * breakpoint — any of them hand back a duration worth thousands of ticks, and
 * running them would fast-forward the run through whatever the player was in the
 * middle of. Spec [01 · §12](../../docs/spec/01-swing.md) measures the ceiling
 * at 3. The excess is discarded rather than banked, deliberately: banking it
 * only defers the fast-forward.
 *
 * Time that does not add up to a whole tick is kept, so a 59.94 Hz display and a
 * 60 Hz simulation do not drift apart a fraction at a time.
 *
 * `grainSeconds` is the **finest interval the caller's clock can report**, and
 * it defaults to zero, meaning exact. See the header for what it is for and for
 * what stops it inventing time.
 */
export function ticksDue(clock: Clock, elapsedSeconds: number, grainSeconds = 0): number {
  clock.unspentSeconds += roundedToWholeTicks(clock, elapsedSeconds, grainSeconds);
  let ticks = 0;
  while (clock.unspentSeconds >= SECONDS_PER_TICK && ticks < MAX_CATCH_UP_TICKS) {
    clock.unspentSeconds -= SECONDS_PER_TICK;
    ticks += 1;
  }
  if (ticks === MAX_CATCH_UP_TICKS) clock.unspentSeconds = 0;
  return ticks;
}
