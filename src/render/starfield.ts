/**
 * The starfield — a parallax sky, and the one depth cue this world has.
 *
 * ## It is a ruling against the specs, and the author made it knowingly
 *
 * Spec [05 · §2](../../docs/spec/05-field.md) says *"depth cues are banned in all
 * five layers: no parallax, no scale drift, no blur-by-distance, no vanishing
 * point"*, and its header restates it: *"parallax star layers are refused
 * entirely."* That is Direction 05's ruling and it is repeated in four other
 * places in this repository. It is **overturned by the author on 2026-08-30**,
 * who asked for it having read it: *"I know we have a rule about this, but I
 * really think the depth/parallax helps convey speed."*
 *
 * The ruling it replaces is not silly and is worth stating so it can be argued
 * with later. Spec 05 §1's idea is that *"the player climbs through a medium, not
 * past a backdrop"* — the **rungs** were to carry speed, gravity and the craft's
 * own passage in one system, and a second system saying *speed* in a different
 * visual language would be two answers to one question.
 *
 * What changed is that the medium is **not built**. Spec 05's five layers are
 * M3's; today SKY is empty VOID, there is no DUST and there are no rungs, so
 * nothing in the field expresses speed at all. The author has flown that on a
 * phone across many sittings and reports the absence. The specs' ruling is
 * therefore recorded as overturned rather than quietly ignored, and the author's
 * own expectation is that the two will coexist — *"it'll look even better once we
 * install the line markers/rungs with gravity bubbly effects."*
 *
 * ## The rungs landed, the question was asked, and the sky keeps its place
 *
 * This file said *"when the rungs land, whether this still earns its place is a
 * question to ask again"*, and spec 05 §2's notice added that it is the author's
 * to answer. They landed on 2026-08-30 and the answer is **yes, quieter** —
 * neither the deletion the original ruling would have implied nor the status quo:
 *
 * > *"The background starfield now needs to be much less noticeable. I still want
 * > it there, but only as background noise."*
 *
 * So the objection spec 05 §2 raised — two systems saying *speed* in two visual
 * languages — is settled by **rank** rather than by removing one of them. The
 * rungs are the field's own statement of speed and the sky is behind it, which is
 * what a background is. What came down is [`STAR_STRENGTH`](#star_strength), an
 * alpha, and nothing else: the sizes and the per-star parallax are the depth the
 * author asked for in the first place and are untouched.
 *
 * ## What is carried from the prototype, and what is not
 *
 * ADR-0013: behaviour, not mechanism. What is carried is the **look** — a
 * continuous spread of depth, near stars brighter, larger and faster, over a
 * colour ramp quantised to three shades for batching.
 *
 * Three things are deliberately not carried:
 *
 * **The horizontal parallax is gone**, and this is the clearest case of the ADR
 * doing its job. The prototype pans its camera sideways and its sky had to answer
 * that — *"a rigid sky would contradict the motion."* This camera **never moves
 * sideways** ([`camera.ts`](../state/camera.ts) is emphatic: the corridor's
 * centreline, always), so the whole horizontal term would be multiplied by a
 * constant zero. Carrying it would have carried dead arithmetic and a config knob
 * nobody could ever turn.
 *
 * **The warp streaks are gone.** They belong to the prototype's field-cleared
 * ceremony, which does not exist here.
 *
 * **The colours are re-derived rather than copied.** The prototype ramps its own
 * `mix(DUSK, INK, …)`; this asks [`palette.ts`](./palette.ts) for the same two
 * tokens and mixes them here, so that a change to either token moves the sky with
 * everything else.
 *
 * ## Why it lives entirely in the renderer
 *
 * A star is not presentation state. Nothing about it is derived from the
 * simulation, nothing decays, and nothing has to agree between two ticks
 * (ADR-0015) — the field is fixed at construction and only the **camera** moves
 * it. Putting several hundred points through `derive` once per tick would be
 * paying ADR-0015's price for something that does not change.
 *
 * That makes the seed a *render* seed, exactly as the prototype's own report
 * calls it: *"does not affect the simulation; reproduces the starfield."* A run's
 * determinism is untouched, because the sky is not in the run. It moved out to
 * [`seed.ts`](./seed.ts) in M3.3, when the **dust** turned out to want the same
 * thing and for the same reason.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import type { CameraView } from '../state/types.ts';
import { DUSK, INK, mix } from './palette.ts';
import { rng } from './seed.ts';

/**
 * How many stars there are.
 *
 * **160 per screen, which is the prototype's density and not its count.** The
 * prototype scatters 160 over exactly one view height; this field is two design
 * heights tall, so matching what the eye sees means twice the number. The first
 * build copied the 160 across and drew a sky **half as dense as the one it was
 * carried from** — reported by the author as *"tiny specks of white with little
 * to no variation, so it doesn't look very deep or immersive."*
 *
 * Density is the one property of a starfield that cannot be reasoned about from
 * first principles, so it is taken from the thing the author looked at for
 * months rather than chosen here.
 */
export const STAR_COUNT = 320;

/**
 * How tall the field is before it repeats, in design units.
 *
 * Two screens, so the wrap is never visible: the slowest tier moves at 0.045 of
 * the camera, so it would take more than forty screens of climb to bring the
 * same star back — and the fastest, at 0.195, still needs ten.
 */
export const FIELD_HEIGHT = DESIGN_HEIGHT * 2;

/**
 * How much of the camera's motion the furthest and nearest stars answer.
 *
 * The prototype's `starParallaxMin: 0.045` and `starParallaxMax: 0.195`, and they
 * are the whole effect: **nothing here moves at world speed.** That is precisely
 * what spec 05 §2 refuses, and it is what the author asked for. The nearest star
 * moves at about a fifth of the world and the furthest at a twenty-fifth — the
 * ratio between them, a little over four, is what the eye reads as depth.
 *
 * **Per star and not per tier**, which is the prototype's own arrangement and was
 * simplified away in the first build here. Three parallax rates read as three
 * flat planes sliding over each other; a continuous spread reads as space. The
 * tiers survive only as what they are actually for, which is batching the two
 * things that *are* context state — colour and alpha.
 */
const PARALLAX_MIN = 0.045;
const PARALLAX_MAX = 0.195;

/**
 * How big the furthest and nearest stars are, in design units.
 *
 * ## These were four times too small, and the unit is why
 *
 * The prototype sizes its stars `max(1, tier.size * cam.scale)` — in **device
 * pixels**, after the scale — so on the phone it was tuned on (390 css × 3 dpr,
 * `cam.scale` 3) its stars are **3, 3 and 5.4 device pixels**. This draws in
 * **design units**, and the letterbox puts one design unit on one device pixel on
 * that same phone. Carrying the numbers across without carrying the scale gave a
 * sky of 0.7-to-2.7 pixel stars where the prototype has 3-to-5.4 — and a
 * sub-pixel rectangle is not a small star, it is an antialiased smear of the
 * background, which is why the brightness ramp stopped reading as depth too.
 * ADR-0013 exactly: the behaviour is the apparent size, and the mechanism it is
 * expressed in did not survive the crossing.
 *
 * The range now spans the prototype's and is **wider than it at both ends**,
 * which is the author's own instruction — *"more depth with more varied star
 * sizes"* — and the reason the ramp is squared rather than linear.
 *
 * **Spread on a square rather than a line**, so the near stars pull away from the
 * pack instead of the field ramping evenly. That is the same shape the prototype
 * uses for its warp streaks and its reasoning carries over unchanged: *"the
 * things near you tear past and the things far away barely move — and the eye
 * reads that difference long before it reads any individual"* star.
 */
const SIZE_MIN = 2.4;
const SIZE_GAIN = 4.0;

/**
 * Where the tiers cut the depth, and they are **only** for batching now.
 *
 * The prototype's own bands: 60% of the sky is in the far tier, 25% in the
 * middle, 15% near. More stars far than near is what a real depth distribution
 * does and what stops the near tier reading as a swarm — and because a star's
 * size and speed now come from its own depth rather than from its tier, these
 * numbers no longer decide anything the eye can see except colour.
 */
const TIER_BANDS = [0.6, 0.85, Infinity] as const;

/**
 * The three shades and their alphas.
 *
 * **One colour at three brightnesses**, which is the prototype's own correction
 * to itself — it used three separate blue-greys picked by eye, and Direction 05's
 * *"varies in brightness, never in velocity"* is honoured in the half of it that
 * survives here. The ramp runs DUSK (structure, at the back) to INK (utility
 * white, at the front) and **never reaches CORE**, which spec 00 §1 gives to the
 * craft alone: the player must always be the brightest thing on screen.
 *
 * Brightness stays quantised to three where size and speed are continuous, and
 * that is not an inconsistency — `fillStyle` and `globalAlpha` are context state,
 * so per-star values would cost a state change per star. The eye reads size and
 * motion for depth long before it reads a few percent of alpha.
 */
const TIERS = [
  { colour: mix(DUSK, INK, 0.15), alpha: 0.3 },
  { colour: mix(DUSK, INK, 0.5), alpha: 0.55 },
  { colour: mix(DUSK, INK, 0.9), alpha: 0.8 },
] as const;

/**
 * How much of that brightness the sky actually gets — **0.4, flown**.
 *
 * The author, 2026-08-30, with the rungs in for the first time: *"the background
 * starfield now needs to be much less noticeable. I still want it there, but only
 * as background noise."*
 *
 * ## Why it is one multiplier and not three new alphas
 *
 * The three above are a **ramp** — one colour at three brightnesses, and their
 * ratios are the depth. Editing them individually would have let the ramp drift
 * while nobody was looking at it; a single factor takes the sky down and leaves
 * the thing that makes it read as a sky exactly where it was. It is the same
 * shape the rim strengths took when *"all glow is too much"* moved them
 * (`index.ts`).
 *
 * And it is an **alpha and not a size**. The first version of this sky was flown
 * as *"tiny specks of white with little to no variation, so it doesn't look very
 * deep or immersive"*, and the fix was to make the stars bigger. Dimming by
 * shrinking would have walked straight back into that.
 *
 * At 0.4 the nearest tier draws at 0.32 and the furthest at 0.12, which is under
 * spec 05 §2's own floor for **dust** (α 0.1 – 0.3) at the near end — so the sky
 * is now quieter than the layer in front of it is specified to be, which is what
 * *behind* means. It is on the bench.
 */
export const STAR_STRENGTH = 0.4;

interface Star {
  readonly x: number;
  readonly y: number;
  /** How near it is, 0 to 1 — the one property, and both others come from it. */
  readonly z: number;
  /** `PARALLAX_MIN` to `PARALLAX_MAX`, on a line. */
  readonly parallax: number;
  /** `SIZE_MIN` upward, on a square. */
  readonly size: number;
}

/** One tier's worth of sky: its stars, and the two things drawn once for all of them. */
interface Tier {
  readonly stars: readonly Star[];
  readonly colour: string;
  readonly alpha: number;
}

export type Starfield = readonly Tier[];

/**
 * A sky, laid out in **design space** from a seed.
 *
 * Design space rather than device pixels, and that is the prototype's most
 * expensive lesson written down: it placed its stars in raw viewport units from
 * `Math.random()` and never regenerated them, so *"stars teleported on resize and
 * density drifted with screen size"*. Laid out in the design space the letterbox
 * already fits to, a phone and a desktop show the same sky at the same density,
 * and a resize moves nothing.
 */
export function starfield(seed: number): Starfield {
  const next = rng(seed);
  const stars: Star[][] = TIERS.map(() => []);
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = next() * DESIGN_WIDTH;
    const y = next() * FIELD_HEIGHT;
    const z = next();
    stars[TIER_BANDS.findIndex((band) => z < band)]!.push({
      x,
      y,
      z,
      parallax: PARALLAX_MIN + z * (PARALLAX_MAX - PARALLAX_MIN),
      size: SIZE_MIN + z * z * SIZE_GAIN,
    });
  }
  return TIERS.map((tier, at) => ({ ...tier, stars: stars[at]! }));
}

/**
 * Draw the sky, in **screen space**, before anything else.
 *
 * Screen space and not world space, which is the whole trick and the reason this
 * is not simply drawn inside the world transform: a star that moved with the
 * world would be at world speed, and the point of the thing is that it is not.
 * The camera's own `y` is what slides it, at a fraction per tier.
 *
 * The caller is expected to have the letterbox transform set and nothing else —
 * the same state [`draw`](./index.ts) is in before it translates into the world.
 */
export function drawStarfield(
  context: CanvasRenderingContext2D,
  sky: Starfield,
  camera: CameraView,
  top: number,
  bottom: number,
): void {
  context.save();
  for (const tier of sky) {
    context.fillStyle = tier.colour;
    // One alpha for the whole tier rather than one per star: the eye cannot tell
    // the difference, and it collapses a few hundred state changes into three.
    context.globalAlpha = tier.alpha * STAR_STRENGTH;
    for (const star of tier.stars) {
      // The sky falls as the craft climbs, so a *smaller* camera y — higher up
      // the world — pushes the stars down. The fraction is what makes it a sky
      // rather than a wall, and it is the star's own rather than its tier's.
      const y = wrap(star.y - camera.y * star.parallax - top, FIELD_HEIGHT) + top;
      if (y > bottom) continue;
      context.fillRect(star.x, y, star.size, star.size);
    }
  }
  context.restore();
}

/** Positive remainder, so a sky that has slid a long way still wraps forwards. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}
