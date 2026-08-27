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
 * One tick's worth of everything the renderer is allowed to know.
 *
 * M0.3 carries only the tick it was derived from. The rest arrives with the
 * things it describes.
 */
export interface PresentationState {
  readonly tick: Tick;
}
