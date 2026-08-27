/**
 * Presentation state's vocabulary.
 *
 * Derived from the simulation, per tick, and as pure as the simulation is
 * (ADR-0006). Everything the design puts between the physics and the pixels
 * lives here — energies, bloom radii, deformation, camera offset, live awards,
 * boundary heat — precisely so that a frame can be asserted without a canvas.
 */
import type { Tick } from '../sim/types.ts';

/**
 * How committed or imminent something is, in four steps (`CONTEXT.md`: energy).
 * Brightness is the game's only ordinal channel; nothing changes hue to mean
 * "better".
 */
export type Energy = 0 | 1 | 2 | 3;

/**
 * Where the craft is and what it is doing, in design coordinates.
 *
 * `heading` and `speed` are here rather than a velocity, because the renderer
 * draws a nose angle and a bloom, not a vector — and because deriving them once
 * per tick keeps the two-numbers-that-must-agree problem inside the simulation,
 * where velocity is the single source.
 */
export interface CraftView {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly speed: number;
}

/**
 * A body as the renderer needs it.
 *
 * `held` is the HELD state of spec [04 · §3](../../docs/spec/04-bodies.md) — E2
 * and alive, the lamp the compass draws itself around. The renderer is told
 * *which state a body is in*, never asked to work it out from the simulation.
 */
export interface BodyView {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly held: boolean;
}

/**
 * One tick's worth of everything the renderer is allowed to know.
 *
 * M1.2 carries the world's shape and nothing about how it looks. Energies, bloom
 * radii, the compass, the trail and the boundary heat arrive with the things
 * they describe.
 */
export interface PresentationState {
  readonly tick: Tick;
  readonly craft: CraftView;
  readonly bodies: readonly BodyView[];
}
