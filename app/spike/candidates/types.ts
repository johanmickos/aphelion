/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * What a rung of M0.5's ladder has to provide. Each candidate owns its own
 * canvas because a canvas can only ever have one kind of context, and hands back
 * a `frame` that does all of that candidate's per-frame work between the two
 * `performance.now()` calls that time it — no setup, no allocation, nothing
 * amortised out of the measurement.
 */
import type { Scene } from '../scene.ts';

export interface Backing {
  readonly w: number;
  readonly h: number;
  /** Design px → backing px. Uniform: the fit rect preserves the design aspect. */
  readonly scale: number;
}

export interface Renderer {
  /** Draws one frame. `t` is seconds since the run began. */
  frame(t: number): void;
  dispose(): void;
  /** What this candidate cannot do faithfully. Travels with the number. */
  readonly note: string;
}

export interface Candidate {
  readonly id: string;
  readonly label: string;
  /** Throws if this candidate cannot run here. The harness records it as unavailable. */
  create(host: HTMLElement, scene: Scene, backing: Backing): Renderer;
}
