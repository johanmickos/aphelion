/**
 * Public surface of the scorer.
 *
 * Imports from `src/sim/` and nothing else — no renderer, no DOM, no wall clock.
 * `pnpm portable` enforces that, which is what keeps a score reproducible from
 * (config, seed, inputLog) alone.
 */
export * from './aim.ts';
export * from './config.ts';
export * from './praise.ts';
export * from './types.ts';
export * from './score.ts';
