/**
 * Presentation state's vocabulary.
 *
 * Derived from the simulation, per tick, and as pure as the simulation is
 * (ADR-0006). Everything the design puts between the physics and the pixels
 * lives here — energies, bloom radii, deformation, camera offset, live awards,
 * boundary heat — precisely so that a frame can be asserted without a canvas.
 */
import type { Tick } from '../sim/types.ts';
import type { Tier } from '../sim/tier.ts';
import type { Decay } from './decay.ts';

/**
 * The grade of a release, re-exported because it is part of what the renderer
 * is **told**.
 *
 * `test/render/boundary.test.ts` forbids `src/render/` from importing
 * `src/sim/` at all, type-only included, and it is right to: a renderer that
 * can name a simulation module is one import away from asking it a question.
 * The tier is a fact the picture is handed, so it arrives through this file
 * like every other one.
 */
export type { Tier };

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
  /**
   * How much of the full stretch this release earned, from
   * [`PUNCH_FLOOR`](./punch.ts) to 1 — the **punch** (`CONTEXT.md`), which lives
   * here since the camera's share of it was flown and refused (2026-08-29).
   *
   * Beside the two scales rather than inside them, for the reason the pair above
   * is here: a test that says *this release was worth a third of a punch* is
   * saying it about this number, and inferring it back out of a scale that is
   * also mid-rebound is arithmetic nobody should have to do.
   */
  readonly amount: number;
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
   * Whether a press **right now** would take this body — the fifth distinction,
   * and a tighter one than IN_REACH.
   *
   * Spec [03 · §6](../../docs/spec/03-hud.md) records *"the body a press would
   * take"* as the prototype's cue, unbuilt, and worth revisiting *"once the
   * compass exists, because the compass is about to be built over the same
   * question."* It exists, so this is that moment. It is
   * [`bodyOnOffer`](../sim/grab.ts)'s own answer rather than a second opinion
   * about it, so the picture and the press cannot disagree.
   */
  readonly offered: boolean;
  /**
   * How hard this body has hold of the craft right now, from 0 to 1
   * (`CONTEXT.md`: **grip**).
   *
   * A different fact from mass: mass is how strong the body is and never
   * changes, grip is how much of that the craft is feeling. It is what decides
   * whether a body glows at all, and what the wide faint halo is drawn at — so a
   * field of distant bodies is a constellation of rims rather than sixty haloes.
   */
  readonly grip: number;
  /**
   * How far the craft has closed into this body's reach, from 0 to 1
   * (`CONTEXT.md`: **closing**).
   *
   * Beside `grip` rather than instead of it, and the pair is the point: grip is
   * what the distance buys and this is the distance. Grip falls as 1/r² and is
   * the right thing to gate a glow on; it is the wrong thing to *draw a closing
   * approach with*, because it is 0.009 over most of the span. This is linear
   * across exactly the reach the body has, so it is what the tide swells on.
   */
  readonly closing: number;
  /**
   * How far through going out a body that has been let go is, or `null` when it
   * is not going out — never held, or already out.
   *
   * Beside `state` rather than inside it. `SPENT` is the **record** — spec 04 §3
   * makes a field of spent bodies the run's scoreboard, and it never comes
   * back — and this is only how far through going out the picture is. The two
   * answer different questions and end at different times: a body is spent
   * forever, and it is *going out* for 210ms.
   */
  readonly spending: Decay | null;
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
  /**
   * How hard it bows the rungs, as a multiple of the median body's
   * (`CONTEXT.md`: **bow**).
   *
   * Spec [05 · §3](../../docs/spec/05-field.md) says only that the bow's `G`
   * *"scales with the body's mass"*, and mass is the one property of a body the
   * renderer is not told: spec 04 §1 rules **mass is size**, so it is a function
   * of `radius` and of [`MASS_EXPONENT`](../sim/units.ts), which the M1 gate
   * still owns. Deriving it here rather than letting the renderer square a
   * radius is what keeps that exponent in one place — and what lets
   * `test/state/rungs.test.ts` sweep mass and assert spec 05's *"increases peak
   * bow monotonically and never exceeds"* its clamp without a canvas — the sweep
   * that found the clamp itself breaking that sentence at 30px.
   */
  readonly bow: number;
}

/**
 * One ring of the compass, and the window on it (`CONTEXT.md`: **window**).
 *
 * Every angle here is an absolute position angle about the held body, which is
 * the one coordinate the whole instrument shares: the hand is an angle, the dot
 * is an angle, and the gap between them is the grade.
 */
export interface RingView {
  /** Which body it belongs to — its **address**, and therefore its hue. */
  readonly body: number;
  /** That body's own hue. A window and its target never need a legend. */
  readonly hue: number;
  /**
   * How far out this ring sits from the held body's centre, in design units.
   *
   * **The gap says how far the body is.** Rings are not equidistant: each clears
   * the orbit by a fixed amount and then steps out in proportion to its body's
   * own distance, so the innermost is the next hop and reading the stack is
   * reading the field.
   */
  readonly radius: number;
  /** How far that body is from the one being held, in design units. */
  readonly away: number;
  /** The perfect release (`CONTEXT.md`: **dot**), at the window's centre. */
  readonly dot: number;
  /** Half the window's width. Spec 06's zones are fractions of the whole. */
  readonly halfWidth: number;
  /**
   * How far the hand is from the dot, signed and folded the short way round.
   *
   * Signed because the compass **draws** which side the aim is on, and spec
   * [06 · §2](../../docs/spec/06-awards.md)'s grade does not use the sign — two
   * readings of one geometry, neither derived from the other.
   */
  readonly offset: number;
  /**
   * How lined up the hand is, from 1 at the dot to 0 a quarter turn off.
   *
   * **Not measured against the window**, deliberately: a window that only lights
   * once the hand is inside it lights too late to aim with, which is what flying
   * it found. This is the ramp everything on the instrument heats and thickens
   * on, and it starts long before the arc.
   */
  readonly aim: number;
  /** What a release now would score here, or `null` for a miss. */
  readonly tier: Tier | null;
  /**
   * Whether the straight run from the dot hits another body first.
   *
   * The window is still drawn, dimmed: one that vanished would be the blinking
   * this instrument was rebuilt to stop, and *"a marker that points at a planet
   * you cannot actually reach is worse than no marker"*.
   */
  readonly blocked: boolean;
  /** E1 at rest, E2 under live aim — heating **in place**, never changing hue. */
  readonly energy: Energy;
  /** Whether the hand and the dot have merged: spec 00 §6's MATCHED. */
  readonly matched: boolean;
}

/**
 * One stretch of the **flown arc** (`CONTEXT.md`) — the orbit already ridden
 * since the freeze, and what the boost was worth along it.
 *
 * **The clock the release has no other way to see.** Spec
 * [01 · §7](../../docs/spec/01-swing.md)'s boost envelope runs from the freeze —
 * nothing for 0.45s, everything until 1.2s, gone by 2.6s — and it is the half of
 * spec 01 §11's tension that had no element drawing it. Flown, 34% of releases
 * landed before it had armed and one hold ran 303 ticks against an envelope that
 * ended at 156, reported as *"I felt that I slowed down a LOT"* (author,
 * 2026-08-29). Ruled the same day: it is said **on the orbit path**, by lighting
 * the arc the craft has already flown with what a release there would have been
 * worth.
 *
 * The arc is a strip chart the orbit was already drawing: time runs along it from
 * the freeze to the craft's own nose, so the brightest part is where the boost
 * paid and the bright end is where the eye already is.
 */
export interface FlownView {
  /** Where this stretch starts, as an absolute angle about the held body. */
  readonly from: number;
  /** How far it runs, in radians, signed the way the craft goes. */
  readonly span: number;
  /** What the boost was worth at its start, from 0 to 1. */
  readonly at: number;
  /** And at its end. The renderer spends the pair as light. */
  readonly to: number;
}

/**
 * The compass (`CONTEXT.md`), or `null` when no body is held.
 *
 * It exists from the **press** rather than from the freeze, because spec
 * [00 · §6](../../docs/spec/00-tokens.md)'s first state is the grab filament and
 * its second is the orbit. Through the dive there is no hand and there are no
 * rings, which is what makes the freeze something the player sees rather than
 * infers.
 */
export interface CompassView {
  /** The held body's centre, in world units — everything here is drawn about it. */
  readonly x: number;
  readonly y: number;
  /**
   * The held body's drawn radius, so the hand can start at its **surface**.
   *
   * *"I want this line to end at the planet surface, not extend from the center
   * of the planet"* (author, 2026-08-29). The hand is a radius of the orbit and
   * the part of it inside the body was never carrying anything — it drew a line
   * through the thing it was measuring from.
   */
  readonly rim: number;
  /** The held body's hue, which the filament wears. */
  readonly hue: number;
  /** Where the craft is, so the filament has two ends without a second lookup. */
  readonly craftX: number;
  readonly craftY: number;
  /** Which way round the craft goes: +1 counter-clockwise, −1 clockwise. */
  readonly direction: number;
  /**
   * How brightly the grab filament burns, from 0 to 1 — **0 when there is no
   * filament**, which is every state after the freeze.
   *
   * It used to be a `boolean` naming the state, and nothing read it: the
   * renderer tells the dive from the instrument by whether there is a hand. Now
   * it carries the strength instead, which is the thing the renderer could not
   * work out for itself — see [`FILAMENT_FLOOR`](./compass.ts).
   */
  readonly filament: number;
  /**
   * Whether the path is the orbit the craft is **currently on** rather than one
   * a freeze has fixed.
   *
   * True through the dive, once gravity has bound the craft at all. It is coarser
   * than the frozen orbit will be and converges on it, which is what
   * [`presence`](#) is for.
   */
  readonly predicted: boolean;
  /**
   * How faded in the path is, from 0 to 1.
   *
   * The oval arrives *"as soon as an oval orbit is possible"* and does not snap
   * into view (author, 2026-08-29). What this fades is a **prediction firming
   * up** rather than an element entering, which is why it does not contradict
   * spec [00 · §5](../../docs/spec/00-tokens.md)'s *"things arrive; they do not
   * fade in"*.
   */
  readonly presence: number;
  /**
   * How big the instrument is drawn, as a fraction — spec
   * [00 · §5](../../docs/spec/00-tokens.md)'s **ENTER**, from 92% with one
   * overshoot when the rings arrive at the freeze.
   *
   * It scales the rings, their windows and the hand's reach, and **not the
   * path**: the path is the world's orbit and the craft is on it. A HUD coming
   * online over a world that stays put is the thing this is for.
   */
  readonly scale: number;
  /** The entrance in progress, or `null` once it has settled. */
  readonly entrance: Decay | null;
  /**
   * How much of the instrument is drawn at all, from 1 to 0.
   *
   * One while a body is held, and falling through the **exit**: the compass
   * clicks out at a release rather than vanishing, swelling slightly and then
   * collapsing inward as it fades. See [`EXIT_TICKS`](./compass.ts).
   */
  readonly alpha: number;
  /** The departure in progress. Present only after a release, and briefly. */
  readonly exit: Decay | null;
  /** Where a release would land right now (`CONTEXT.md`: **hand**), or `null` while diving. */
  readonly hand: number | null;
  /**
   * What the rings are stacked outward from, in design units — the periapsis.
   *
   * Fixed from the freeze, so the stack does not breathe with the oval. It is
   * deliberately **not** the path: the rings clear the line the craft is flying
   * rather than sitting on it.
   */
  readonly anchor: number;
  /**
   * The orbit path itself, as radii at `i / length` of a turn from angle zero.
   *
   * **An ellipse, and a changing one.** Through the settle the orbit rounds from
   * the oval the freeze handed out toward a circle, and this is that shape at the
   * shape it has *this tick* — so the drawn path and the flown path are one
   * curve. Sampled rather than parameterised because the renderer draws answers:
   * handing it a periapsis, an eccentricity and an argument would be handing it a
   * formula to get wrong.
   */
  readonly path: readonly number[];
  /** How far out the hand is drawn — past the outermost ring, as §6 asks. */
  readonly reach: number;
  /** One per reachable body, innermost nearest. */
  readonly rings: readonly RingView[];
  /** How much of the orbit has been flown since the freeze, capped at one turn. */
  readonly swept: number;
  /**
   * What a release **right now** would be worth, from 0 to 1 — spec
   * [01 · §7](../../docs/spec/01-swing.md)'s envelope, at this tick.
   *
   * It is [`qualityOf`](../sim/quality.ts)'s own answer rather than a second
   * reading of it, so the number the picture draws and the number the punch is
   * scaled by cannot come apart. Through the dive, where there is no envelope,
   * it is the bend the body is putting on the heading — ADR-0012's *"the same
   * skill wearing different clothes"*.
   */
  readonly envelope: number;
  /**
   * The flown arc, lit by what the boost was worth along it — innermost stretch
   * first, ending at the craft.
   *
   * Empty through the dive, because the envelope's clock starts at the freeze and
   * an arc drawn before then would be saying something about a boost that does
   * not exist yet.
   */
  readonly flown: readonly FlownView[];
  /**
   * How far round the craft was at each tick of the boost's arming ramp, in
   * radians swept from the freeze — one entry per tick, latched as it passes.
   *
   * **The memory, beside the answer it produced**, exactly as
   * [`DeformationView`](#deformationview) carries its clock beside its shape. The
   * envelope's other two corners are closed-form past the settle and need no
   * remembering; the ramp falls **inside** it, where the phase is accumulated at
   * substep resolution and has no inverse.
   *
   * **It is a tick at a time and not two corners, and that is measured.** Cutting
   * the ramp at its ends alone and shading between them along the arc is wrong by
   * up to **0.19** of the envelope's range — measured over 55 swings — and wrong
   * in the direction that matters: the craft leaves periapsis at its fastest, so
   * a light spread evenly along the arc says the boost armed **sooner** than it
   * did, which is the exact error the element exists to remove.
   *
   * It is a record and not an eased value, so ADR-0015's third rule does not
   * reach it for the reason [`derive.ts`](./derive.ts)'s header gives about
   * SPENT: no entry is ever an input to its own next value, so there is no path
   * by which it drifts. It is bounded by the ramp — twenty-eight numbers at most,
   * and a new grab starts a new one.
   */
  readonly arming: readonly number[];
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
  /**
   * Which way the body lies, in radians — the arrow points along it.
   *
   * A sighting **pointed** from 2026-08-29 (author), reversing the ruling of the
   * day before that it must not. Its position on the edge still carries the same
   * fact; the arrow is what was asked for on top of it. See
   * [`sighting.ts`](./sighting.ts).
   */
  readonly bearing: number;
  /** The body's own hue. A sighting is that body's light, seen further away. */
  readonly hue: number;
  /**
   * How far the craft is from it, in design units — the label's number.
   *
   * **A distance and not a name.** The retirement of the `P11` chips is about
   * naming, and identity stays hue-only; what this says is how far.
   */
  readonly away: number;
  /** Whether a press right now would take this body. */
  readonly offered: boolean;
  /** How brightly it is drawn: it fades with distance, and is full when offered. */
  readonly strength: number;
  /** E1 — spec [03 · §6](../../docs/spec/03-hud.md). The fade is an alpha, not a step. */
  readonly energy: Energy;
  readonly bloom: number;
  readonly radius: number;
}

/**
 * The callout (`CONTEXT.md`) — the word a release earned, born at the dot that
 * earned it, and the window it was taken on.
 *
 * Spec [06 · §4](../../docs/spec/06-awards.md): *"the word, its points and its
 * colour arrive as one unit at the release point... the pop buys the glance;
 * leaving it behind sells the speed. Score meets attention where attention
 * already is — no band at the top of the screen."*
 *
 * The window travels with it rather than staying on a compass that has already
 * gone, because spec [02 · §6](../../docs/spec/02-release.md) asks for exactly
 * that pair — *"unused rings die instantly; the taken window stays lit and
 * decays behind the craft"* — and they are one fact: the arc is where the word
 * was earned, and the dot at its centre is where the word is standing.
 */
export interface CalloutView {
  /**
   * What it graded. `MAKE` is carried and **not spoken**: spec 06 §2 gives the
   * baseline tier points alone, *"because a word for 'merely made it' devalues
   * every word above it"*. Carrying it anyway is what lets a test assert that a
   * make produced no word rather than that nothing happened.
   */
  readonly tier: Tier;
  /** Which body's window was taken — its address, and therefore its hue. */
  readonly body: number;
  /** That body's hue, so the arc still knows whose it is once the compass is gone. */
  readonly hue: number;
  /**
   * Where the word is **drawn**, in world units: the dot, plus the pop, held
   * inside the design space.
   *
   * Spec [00 · §7](../../docs/spec/00-tokens.md) is absolute — *"nothing the
   * player reads is drawn outside it, ever"* — and *"the compass, the masthead
   * and every award live above"* the thumb line. A word born at a dot near the
   * edge of the picture was being cut in half (author, 2026-08-29), so this is
   * the birth position slid back inside the readable band. It stays
   * world-anchored: what moves it is the camera, and the clamp only bites while
   * the word would otherwise be off the page.
   */
  readonly x: number;
  readonly y: number;
  /** The dot itself, which does not move — where the word was born. */
  readonly bornX: number;
  readonly bornY: number;
  /** The held body's centre, which the taken window is an arc about. */
  readonly aboutX: number;
  readonly aboutY: number;
  /** How far out that arc sits, in design units. */
  readonly radius: number;
  /** Where its centre points, and how far it reaches either side. */
  readonly dot: number;
  readonly halfWidth: number;
  /** Its bloom radius, in design units — spec 06 §4's per-tier glow. */
  readonly bloom: number;
  /** How tall the word is set, in design units. */
  readonly size: number;
  /** The pop, then the linger, then the decay: one clock, three stretches. */
  readonly life: Decay;
  /** How lit the **word** is now, from 1 through the linger to 0. */
  readonly strength: number;
  /**
   * And how lit the **taken window** is — a different clock, spec
   * [02 · §6](../../docs/spec/02-release.md)'s 420ms against the word's 1 720ms.
   *
   * They arrive as one unit and leave on their own schedules: the word is the
   * verdict, meant to be read and left behind, and the arc is the last of the
   * instrument and goes when the instrument does. Built on one clock, the arc hung
   * on screen four times longer than spec 02 §6 allows.
   */
  readonly windowStrength: number;
}

/**
 * The arrival (`CONTEXT.md`) — the word a tight capture earns, said at the point
 * of closest approach.
 *
 * Ruled by the author, 2026-08-30. Graded on **how close the dive came to the
 * body's floor** in design units and not on **depth**, because depth saturates:
 * over 493 captures its p50 is exactly 1.00, so more than half of everything
 * would earn the top word. One rung and three words rather than a ladder, so a
 * second event does not double how often the release's three are heard.
 *
 * It has **no instrument**, deliberately — there is no window to aim a dive at
 * and no dot. The cue is the body's own light: spec
 * [00 · §3](../../docs/spec/00-tokens.md)'s halo grows with grip and spec
 * [04 · §2](../../docs/spec/04-bodies.md)'s tide swells with closing, so a craft
 * on the way in is already being told how close it is by the thing it is
 * approaching.
 */
export interface ArrivalView {
  /** What it says — one of [`ARRIVAL_WORDS`](./arrival.ts), chosen by address. */
  readonly word: string;
  /** Which body was arrived at, and therefore which hue and which word. */
  readonly body: number;
  readonly hue: number;
  /** Where it is drawn, in world units: the closest approach, plus the climb. */
  readonly x: number;
  readonly y: number;
  /** The closest approach itself, which does not move — where it was born. */
  readonly bornX: number;
  readonly bornY: number;
  /** How tall it is set, in design units. */
  readonly size: number;
  /** Linger then decay: one clock, two stretches, climbing throughout. */
  readonly life: Decay;
  /** How lit it is now, from 1 through the linger to 0. */
  readonly strength: number;
}

/**
 * The word a hard landing on the floor earned — `CONTEXT.md`'s **knock**.
 *
 * It carries no `body` and no `hue`, and both absences are the design. A knock is
 * not about the body it happened at, it is about what the **floor** had to do, so
 * it is drawn in spec 00 §1's **ION** — the world's reserved pink for risk — and
 * it is the one word in the game that does not wear an identity.
 */
export interface KnockView {
  /** What it says — one of [`KNOCK_WORDS`](./knock.ts), chosen by the tick. */
  readonly word: string;
  /** Where it is drawn, in world units: the point of contact, plus the climb. */
  readonly x: number;
  readonly y: number;
  /** The contact itself, which does not move — where it was born. */
  readonly bornX: number;
  readonly bornY: number;
  /** How tall it is set, in design units. */
  readonly size: number;
  /** Linger then decay: one clock, two stretches, climbing throughout. */
  readonly life: Decay;
  /** How lit it is now, from 1 through the linger to 0. */
  readonly strength: number;
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
  /**
   * The foot of the field, in design `y` — and the **datum every rung is
   * counted from**.
   *
   * It was already the line a run falls out of the bottom of
   * ([`Corridor`](../sim/types.ts)); what M3.2 added is that it is also where
   * altitude is zero, because spec [17 · §3](../../docs/spec/17-daily-field.md)
   * measures every body in a day *"bottom to top"* from it. A rung's label and a
   * body's address therefore agree about where they are, which is the whole of
   * spec 05 §6's *"the field is a ruler the player climbs"*.
   */
  readonly foot: number;
}

/**
 * One rung's **wake** (`CONTEXT.md`): where the craft pressed on it, and how
 * much of that press is left.
 *
 * There is one of these per rung the craft is near or has recently passed, and
 * none at all for the rest of the field — a rung nobody has touched is straight
 * apart from its bow, and absence is how this layer says so
 * ([`decay.ts`](./decay.ts): *"a thing that is over is absent"*).
 *
 * It carries a **place** rather than an amplitude, and
 * [`rung.ts`](./rung.ts)'s header argues why: what relaxes over spec 05 §3's
 * ~400ms is the rung's memory of where the craft was, not a number attached to
 * the craft. `strength` and `life` are the same fact twice, exactly as
 * [`KnockView`](#knockview) carries them — one is what the picture is drawn at
 * and the other is what a test says *four ticks into its twenty-four* about.
 */
export interface WakeView {
  /** Which rung, counted in rungs above [`CorridorView.foot`](#corridorview). */
  readonly rung: number;
  /** Where the craft was when it pressed hardest on this rung. */
  readonly x: number;
  readonly y: number;
  /**
   * How far that press parts the rung at its source, in design units.
   *
   * The same fact for the craft that [`BodyView.bow`](#bodyview) is for a body,
   * and it is here for the same three reasons: **how hard a thing displaces the
   * field belongs beside the thing**, so the renderer applies a strength rather
   * than holding one; a strength of zero is then a fact presentation state states
   * — which is how the wake is switched off (2026-08-30) without a switch, and
   * what lets the renderer cull it and draw a straight rung; and it is where a
   * wake that answered to speed or to the quality of a swing would land, which is
   * the open extension `docs/plan/m3-the-field.md` records.
   */
  readonly amplitude: number;
  /** What is left of that press, 1 → 0. */
  readonly strength: number;
  readonly life: Decay;
}

/**
 * The **anomaly** (`CONTEXT.md`): the stretch of field where the sky changes,
 * and how much of it has reached the sky yet.
 *
 * `null` in a field that places none, which is a real case rather than a
 * hypothetical — `tools/check-portability.ts` builds a field with no bodies and
 * no foot. Spec [05 · §5](../../docs/spec/05-field.md) allows one contiguous
 * stretch and this carries one; where it comes from, and the fact that today's
 * placement is a stand-in for spec 17's generator, is
 * [`anomaly.ts`](./anomaly.ts)'s header.
 */
export interface AnomalyView {
  /** Its high-altitude edge in design `y`, so **smaller** than `bottom`. */
  readonly top: number;
  /** Its low-altitude edge, the one a climbing craft meets first. */
  readonly bottom: number;
  /**
   * How far the sky has warmed toward it, 0 to 1 — spec 05 §4's altitude ramp.
   *
   * What the number is *spent on* is the renderer's and is capped at spec 05's
   * ≤ 6% ([`SKY_TINT`](./anomaly.ts)); what is here is how far along the
   * approach the craft is, which is a fact about the world and assertable
   * without a canvas.
   */
  readonly warmth: number;
  /**
   * Whether the craft is inside the stretch.
   *
   * Nothing draws this — the sky's own bed is world-anchored at the edges above,
   * so the picture needs no per-craft predicate. It is here because it is the
   * one row of spec 05 §5's table that will change a run: *"orbiting inside an
   * anomaly trickles fuel"* (spec [13](../../docs/spec/13-fuel.md), ADR-0009),
   * which is M4's. Naming it now is the same move `bloomOf`'s chain argument is
   * — the term is built and only its consumer is missing.
   */
  readonly inside: boolean;
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
  /**
   * How far the world moves across the picture in one tick, in design units,
   * **positive while the craft is climbing** — spec
   * [05 · §2](../../docs/spec/05-field.md)'s *world speed*, as a number.
   *
   * Every layer of the field except the [starfield](../render/starfield.ts)
   * moves at exactly this, so it is what the **dust** streaks along and what the
   * rungs cross at. It is here rather than computed where it is drawn because a
   * frame is one tick and a rate needs two: the renderer has no previous camera
   * and must not keep one (ADR-0006 — a frame is a pure function of
   * `(recipe, tick)`).
   *
   * **It is not the craft's speed**, and the difference is not small. Measured
   * over the 12 973 ticks of the author's replayable dispatches, the two agree
   * at p75 (ratio 0.92) and are **a tenth of each other at p25** — through an
   * orbit the craft is at its fastest while the camera holds nearly still, so
   * dust streaked by the craft's own speed would streak while standing still.
   *
   * Read off the camera rather than the craft for the same reason: what the
   * player sees pass is what the *picture* moved over, and the camera is the
   * picture. `camera.ts` is untouched by this — the subtraction is
   * [`derive.ts`](./derive.ts)'s.
   */
  readonly worldSpeed: number;
  /**
   * How long the chain is — **zero, and it is a named zero rather than an
   * absence**.
   *
   * The exact shape [`bloomOf`](./energy.ts) already uses for the same quantity:
   * the term is built and only its value is missing. `CONTEXT.md` defines the
   * chain as consecutive engaged swings and spec
   * [08](../../docs/spec/08-economy.md) owns it, which is M4's — so nothing can
   * count it yet, and spec 05 §2's *"dust density rises gently with chain level"*
   * needs somewhere to read it from that is not the renderer inventing one.
   *
   * It is on the state rather than passed to `bloomOf`'s caller alone because
   * two things now spend it — the craft's bloom radius and the dust's density —
   * and M4 should wire it in one place rather than two.
   */
  readonly chain: number;
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
  /**
   * The instrument, or `null` while coasting. The compass needs a body; a
   * **sighting** is what a craft without one reads.
   */
  readonly compass: CompassView | null;
  /**
   * The word the last release earned, or `null`.
   *
   * One, and never a queue. Spec 06 §4: *"queueing is structural: one release,
   * one word"* — a new callout replaces the one before it, which is the same
   * shape [`FlashView`](#flashview) uses for the same reason.
   */
  readonly callout: CalloutView | null;
  /**
   * The word the last **capture** earned, or `null`.
   *
   * **Its own slot beside the callout's**, ruled by the author (2026-08-30). The
   * two are at different places — the body you arrived at, versus the dot you
   * left from — so they never collide on screen, and sharing one slot would have
   * let a freeze cut short a release word still lingering from the swing before.
   * Spec 06 §4's *"one release, one word"* is unchanged: it is one word per
   * event, and there are now two kinds of event.
   */
  readonly arrival: ArrivalView | null;
  /**
   * The word the last hard landing on the **floor** earned, or `null`.
   *
   * **A third slot**, following the shape the author already ruled for the
   * second. It is not lit at the same time as an `arrival` — the two grade the
   * same geometry from opposite ends and their thresholds are set so they cannot
   * both fire on one capture — but it is struck a tick *before* the freeze, so
   * sharing that slot would mean a knock and the arrival of the **next** swing
   * fighting over one field for no reason.
   */
  readonly knock: KnockView | null;
  /**
   * Every rung the craft is currently parting, or that is still relaxing behind
   * it, in rung order.
   *
   * **The only part of the field that is presentation state**, and
   * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)
   * names it in its opening paragraph. Where a rung *hangs* and how far it
   * **bows** are pure functions of this tick and are computed where they are
   * drawn; this is the one thing about the field that a tick alone cannot
   * answer. See [`rung.ts`](./rung.ts).
   */
  readonly wake: readonly WakeView[];
  /**
   * The **anomaly** this field places, and how near the craft has come to it —
   * or `null` in a field that places none.
   *
   * The one thing on this state that is a property of the *field* rather than of
   * the tick, which is why it looks out of place beside the decays: the extent
   * does not move and only `warmth` does. It is derived every tick anyway, from
   * the field, because a picture assembled from two sources of truth about where
   * the weather is would eventually have two answers.
   */
  readonly anomaly: AnomalyView | null;
  /**
   * The **boundary**, one entry per side of the corridor — or empty in a field
   * with no line.
   *
   * Beside the anomaly and for the same reason: it is a property of the field
   * and of this tick rather than something that decays, and deriving it here
   * keeps one answer to *where the edge is and how hot it is* rather than two.
   * See [`boundaryOf`](./boundary.ts).
   */
  readonly boundary: readonly BoundarySideView[];
}

/**
 * One side of the **boundary** (`CONTEXT.md`): where its **line** stands, how
 * fast the craft is closing on it, and how hot that makes it.
 *
 * There is one of these per side of the corridor and there are always two, or
 * none at all in a field with no line — [`boundaryOf`](./boundary.ts) argues why
 * both rather than only the near one, and it is the first law: a craft diving
 * right flares the right line and calms the left in the same frame, and on a
 * phone both are on screen at once.
 *
 * **Everything here is a fact about this tick.** Nothing on this view decays, so
 * the boundary is not presentation state in
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
 * sense at all — it is derived beside the things that are, for the reason
 * [`AnomalyView`](#anomalyview) is: a picture assembled from two sources of truth
 * about where the edge is would eventually have two answers.
 */
export interface BoundarySideView {
  /** Where this side's line stands, in design `x`. */
  readonly line: number;
  /** Which way the field lies from it: `1` for the left line, `-1` for the right. */
  readonly inward: 1 | -1;
  /**
   * How far the craft is from this line, in design units, measured inward.
   *
   * **Negative past it**, which is a reachable state and not a guard: the run
   * ends on the tick `outOfBounds` sees, and spec 01 §10's four units of grace
   * mean the craft is briefly outside the line and still alive.
   */
  readonly away: number;
  /**
   * How fast the craft is closing on this line, in design units per second,
   * clamped at ≥ 0 — spec [07 · §3](../../docs/spec/07-boundary.md).
   *
   * **A third speed, and the other two are already spoken for.**
   * [`worldSpeed`](#presentationstate) is how fast the picture moves and
   * [`CraftView.speed`](#craftview) is how fast the craft moves; this is the
   * component of the craft's velocity toward *this line*. Measured over the
   * corpus the three are nowhere near each other, and confusing them is the
   * failure `worldSpeed`'s own note records.
   */
  readonly closing: number;
  /**
   * Spec 07 §3's **heat**, `HEAT_FLOOR` to `HEAT_CAP`.
   *
   * What the gradient, the line's own stroke and the motes are all drawn at, and
   * the one number the whole of spec 07's first law lives in. It is derived here
   * rather than in the renderer because *"skimming parallel is calm and diving
   * flares"* is a claim a test should be able to make without a canvas
   * ([AGENTS.md](../../AGENTS.md) §4), and `test/state/boundary.test.ts` makes
   * it that way.
   */
  readonly heat: number;
  /**
   * How far up this side's boundary has come, 0 to 1 — **a channel of its own,
   * beside the heat**, and the author's ruling of 2026-09-01.
   *
   * *"The boundary SHOULD be off screen for majority of play, and the warning ion
   * glow should only activate when they approach... I don't want to signal danger
   * during normal gameplay, only when the ship is along the edge (outside of the
   * default viewport)."* So the **heat** says how hard the craft is diving at this
   * line and this says whether the line is part of the conversation at all —
   * absent while the craft flies the field, arriving as it goes out to the wall.
   *
   * **Zero is a real absence**: the renderer draws nothing at all, so the cost of
   * the layer goes with the layer. See [`presenceOf`](./boundary.ts).
   */
  readonly presence: number;
  /**
   * Whether a **shelter** suspends the line here — **false everywhere today.**
   *
   * Spec [05 · §5](../../docs/spec/05-field.md), ruled 2026-09-01: inside one
   * the bands keep their geometry and their closing-speed law and are drawn in
   * **AURORA instead of ION** — *"the edge still says how hard you are diving at
   * it, and says strange where it would say risk."* Only the **anomaly**
   * projects one and the anomaly is M8's, so this is a named zero and
   * [`SHELTERS`](./boundary.ts) is where it stops being one.
   */
  readonly sheltered: boolean;
}
