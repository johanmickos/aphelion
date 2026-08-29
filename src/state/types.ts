/**
 * Presentation state's vocabulary.
 *
 * Derived from the simulation, per tick, and as pure as the simulation is
 * (ADR-0006). Everything the design puts between the physics and the pixels
 * lives here — energies, bloom radii, deformation, camera offset, live awards,
 * boundary heat — precisely so that a frame can be asserted without a canvas.
 */
import type { Tick } from '../sim/types.ts';
import type { Decay } from './decay.ts';

/**
 * How committed or imminent something is, in four steps (`CONTEXT.md`: energy).
 * Brightness is the game's only ordinal channel; nothing changes hue to mean
 * "better".
 */
export type Energy = 0 | 1 | 2 | 3;

/**
 * How the craft is stretched, as two scales on its own silhouette
 * (`CONTEXT.md`: deformation).
 *
 * **Along its velocity and across it**, never along a screen axis — spec
 * [02 · §4](../../docs/spec/02-release.md), and spec 00 §5's rule that nothing
 * in this game radiates from a point. Both are 1 at rest.
 *
 * `recovery` is the memory and the other two are the answer. They cannot
 * disagree because [`deformation.ts`](./deformation.ts) computes all three in
 * one place from one clock; carrying the clock as well as the shape is what lets
 * a test say *the craft is four ticks into its recovery* rather than inferring
 * it from a scale factor.
 */
export interface DeformationView {
  /** Scale along the velocity vector. */
  readonly along: number;
  /** Scale across it. */
  readonly across: number;
  /** The return in progress, or `null` when the craft is at rest. */
  readonly recovery: Decay | null;
}

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
  /**
   * **E2, always** — spec [00 · §3](../../docs/spec/00-tokens.md) makes the
   * craft the game's baseline for hot, and Direction 01 the reason: *"the craft
   * is the brightest object on screen, always."*
   */
  readonly energy: Energy;
  /**
   * How wide its bloom is, in design units.
   *
   * A field rather than a lookup because it is the one energy in the game that
   * is not a function of its step alone: spec 00 §3 gives each chain link +4px,
   * so a hot run is visibly hotter. The chain arrives with the economy in M4;
   * until then this is E2's radius exactly.
   */
  readonly bloom: number;
  readonly deformation: DeformationView;
}

/**
 * The one E3 (`CONTEXT.md`: flash).
 *
 * Spec [00 · §3](../../docs/spec/00-tokens.md): *"only one E3 may be alive at a
 * time. A new E3 replaces the old one; it does not stack"* — and spec 00's
 * acceptance, *"at most one E3 is alive on any tick."* It is **one nullable
 * field on the whole presentation** rather than a flag on each thing that can
 * flash, so the rule is not a check that can be forgotten but a shape the layer
 * cannot express a violation of. That matters more than it looks: the release,
 * the grab, the award and the checkered line all want an E3, they are built in
 * four different milestones, and a per-thing energy would have let the fourth
 * one quietly stack on the first.
 *
 * It does not move. Spec 02 puts it *at the release point*, and the craft has
 * already left.
 */
export interface FlashView {
  readonly x: number;
  readonly y: number;
  /** Its bloom radius now, in design units, on its way to nothing. */
  readonly radius: number;
  /** How far through its 400ms it is. */
  readonly decay: Decay;
}

/**
 * Where the world is being watched from — the world point the centre of the
 * design space is looking at, in design units.
 *
 * A position and nothing else. Spec [00 · §5](../../docs/spec/00-tokens.md):
 * *"the camera is never rotated, never shaken and never randomised"*, so there
 * is no angle to carry and no scale — the scale is fixed by the design space
 * (ADR-0010) and belongs to the renderer's letterboxing rather than to the
 * world.
 *
 * It is here, and not in the renderer, for the reason ADR-0006 gives: *"an agent
 * with no canvas can assert that the camera is offset 6px along the tangent at
 * tick 412."* Spec [02 · §5](../../docs/spec/02-release.md) will want exactly
 * that of the release kick in M2, and a camera that lived in the renderer would
 * be a camera no test could see.
 */
export interface CameraView {
  readonly x: number;
  readonly y: number;
  /**
   * How much the view is held on the body being orbited rather than on the
   * craft, from 0 to 1.
   *
   * Vertical only, because the camera does not move sideways
   * ([`camera.ts`](./camera.ts)). It is here rather than hidden inside the
   * derivation because it is the quantity the behaviour is *about*: a test that
   * asserts a settled orbit holds the view still is asserting this, and one that
   * asserts the oval is still flown is asserting that this is zero throughout it.
   */
  readonly lock: number;
  /**
   * How far from the craft the view is currently sitting, in design units.
   *
   * The one thing the camera remembers ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)),
   * and it is the *displacement* rather than the body that produced it — so what
   * decays after a release is bounded by the orbit's own radius rather than by
   * how far the craft has since travelled away from a remembered point.
   */
  readonly offset: number;
}

/**
 * A body as the renderer needs it.
 *
 * `held` is the HELD state of spec [04 · §3](../../docs/spec/04-bodies.md) — E2
 * and alive, the lamp the compass draws itself around. The renderer is told
 * *which state a body is in*, never asked to work it out from the simulation.
 */
/**
 * What a body is telling the player — spec [04 · §3](../../docs/spec/04-bodies.md)'s
 * four states.
 *
 * `AHEAD` is out of reach and `IN_REACH` is inside the grab-range predicate of
 * spec [01](../../docs/spec/01-swing.md), so the transition between them is the
 * same fact a press would act on. `SPENT` is a body that has been held and let
 * go: *"the lamp goes out at release, not at grab"*, and a field of them behind
 * the craft is the run's scoreboard drawn in the world.
 */
export type BodyState = 'AHEAD' | 'IN_REACH' | 'HELD' | 'SPENT';

/**
 * The bright limb segment that always faces the craft (`CONTEXT.md`: tide) —
 * *"the gravity vector drawn on the thing that owns it"*
 * (spec [04 · §2](../../docs/spec/04-bodies.md)).
 *
 * All three numbers are readings of the body's mass, and spec 04 §2 requires
 * exactly that: *"a heavier body reaches with a longer, brighter,
 * tighter-tracking tide ... the three must move together and monotonically with
 * mass."* The tracking is not a number here because it is already spent — it is
 * why `bearing` lags, and the lag is the behaviour.
 */
export interface TideView {
  /**
   * Which way it faces, in radians, **behind** the craft's true bearing.
   *
   * The one thing a tide remembers. Spec 04's acceptance asks that a craft
   * orbiting at a constant rate leaves this lagging by a bounded, non-zero
   * angle — so a tide that tracked exactly would have stopped saying how heavy
   * its body is.
   */
  readonly bearing: number;
  /** The inner stratum, following the same bearing more slowly still. */
  readonly ripple: number;
  /** How far the arc reaches either side of its bearing, in radians. */
  readonly halfWidth: number;
  /** How loud it is, from 0 toward 1. The renderer spends this as light. */
  readonly strength: number;
}

export interface BodyView {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly held: boolean;
  /**
   * Which of spec 04 §3's four states it is in.
   *
   * Beside `held` rather than instead of it, and they are not the same fact:
   * `held` is one of the four, and it is the one the compass draws itself
   * around.
   */
  readonly state: BodyState;
  /**
   * Its hue, in oklch degrees — **its name** (`CONTEXT.md`: identity).
   *
   * A number and not a colour, because a colour is paint and this layer holds
   * none: spec [00 · §2](../../docs/spec/00-tokens.md) fixes the lightness and
   * the chroma so that every identity is equally loud, and what is left to
   * carry is the one coordinate that varies. It also makes *"no two adjacent
   * addresses closer than 50°"* a thing a test can ask of presentation state
   * rather than of a canvas.
   */
  readonly hue: number;
  /**
   * How brightly it burns — spec [00 · §3](../../docs/spec/00-tokens.md)'s step,
   * from its state.
   */
  readonly energy: Energy;
  /** Its bloom radius, in design units, measured outward from its surface. */
  readonly bloom: number;
  /** Its tide, or `null` where spec 04 §2 says it has none. */
  readonly tide: TideView | null;
}

/**
 * A body the picture cannot show, marked on its edge (`CONTEXT.md`: sighting).
 *
 * **In design-space coordinates**, alone among the positions in this file, and
 * for the reason [`sighting.ts`](./sighting.ts) gives: the mark belongs to the
 * composition rather than to the world, and spec
 * [00 · §7](../../docs/spec/00-tokens.md) makes the composition identical on
 * every device.
 */
export interface SightingView {
  readonly x: number;
  readonly y: number;
  /** The body's own hue. A sighting is that body's light, seen further away. */
  readonly hue: number;
  /** Flat E1 — spec [03 · §6](../../docs/spec/03-hud.md), where distance went. */
  readonly energy: Energy;
  readonly bloom: number;
  readonly radius: number;
}

/**
 * The sides of the world, as the renderer needs them.
 *
 * It is here for one job today — **the picture never shows more world than there
 * is**. The design space is fitted whole and whatever the buffer has left over
 * is filled with world rather than with black
 * ([`letterbox.ts`](../render/letterbox.ts)), and a wide desktop window has a
 * great deal left over, so something has to say where to stop. The corridor's
 * own line is that something, and it is the honest bound rather than a chosen
 * one: past it a run is already over.
 *
 * It is also what spec [07](../../docs/spec/07-boundary.md) draws in M3 — the
 * line itself, and the bands measured inward from it — which is why this is a
 * field on presentation state and not a number the renderer keeps for itself.
 */
export interface CorridorView {
  readonly centreline: number;
  readonly halfWidth: number;
}

/**
 * One tick's worth of everything the renderer is allowed to know.
 *
 * M1.6 carried the world's shape and where it is being watched from, and nothing
 * about how either looks. M2.1 adds the ordinal channel — every energy, every
 * bloom radius, the craft's stretch and the one E3 — so that the renderer is
 * told how bright a thing is rather than asked to work it out. The compass, the
 * tide, the trail and the boundary heat arrive with the things they describe.
 */
export interface PresentationState {
  readonly tick: Tick;
  readonly camera: CameraView;
  readonly craft: CraftView;
  readonly bodies: readonly BodyView[];
  readonly corridor: CorridorView;
  /**
   * The E3 alive right now, or `null`. **There is one, or there is none** — see
   * [`FlashView`](#flashview).
   */
  readonly flash: FlashView | null;
  /**
   * Every body the picture cannot show, marked on its edge, in address order.
   *
   * *"Always, whether or not a body is held"* (spec 03 §6): the compass needs an
   * orbit and this does not, so it is the whole of what a coasting craft reads.
   */
  readonly sightings: readonly SightingView[];
}
