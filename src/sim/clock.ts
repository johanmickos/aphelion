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
 */
import { MAX_CATCH_UP_TICKS, SECONDS_PER_TICK } from './units.ts';

/** Time observed but not yet spent on a tick. */
export interface Clock {
  unspentSeconds: number;
}

export function createClock(): Clock {
  return { unspentSeconds: 0 };
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
 */
export function ticksDue(clock: Clock, elapsedSeconds: number): number {
  clock.unspentSeconds += elapsedSeconds;
  let ticks = 0;
  while (clock.unspentSeconds >= SECONDS_PER_TICK && ticks < MAX_CATCH_UP_TICKS) {
    clock.unspentSeconds -= SECONDS_PER_TICK;
    ticks += 1;
  }
  if (ticks === MAX_CATCH_UP_TICKS) clock.unspentSeconds = 0;
  return ticks;
}
