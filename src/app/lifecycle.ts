/**
 * The run lifecycle.
 *
 * A run is `(config, seed, inputLog)`, so the config has to be fixed before the
 * first tick or a replay cannot reproduce what was played. That is the whole
 * reason a session starts armed rather than already moving: it gives you
 * somewhere to change the tuning, and it makes each run a controlled experiment
 * — the same inputs against one config, comparable to the next.
 *
 * Deaths inside a run still respawn immediately. Failure staying cheap matters
 * more than making every crash a ceremony, and the config is already fixed by
 * then, so there is nothing to decide.
 */
export type RunPhase = 'armed' | 'running';

export interface Lifecycle {
  phase: RunPhase;
  /** Ticks elapsed in the current run. */
  startedAtTick: number;
}

export function createLifecycle(): Lifecycle {
  return { phase: 'armed', startedAtTick: 0 };
}
