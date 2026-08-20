/**
 * Public surface of the simulation.
 *
 * This module and everything under it import nothing outside `src/sim/`, use no
 * bundler-specific syntax, and touch no DOM. That is what keeps the physics
 * runnable headlessly and portable across toolchains.
 */
export * from './config.ts';
export * from './types.ts';
export * from './world.ts';
export * from './orbit.ts';
export * from './contact.ts';
export * from './capture.ts';
export * from './boost.ts';
export * from './fuel.ts';
export * from './step.ts';
export * from './serialize.ts';
export * from './trace.ts';
