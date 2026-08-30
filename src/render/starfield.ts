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
 * install the line markers/rungs with gravity bubbly effects."* When the rungs
 * land, whether this still earns its place is a question to ask again.
 *
 * ## What is carried from the prototype, and what is not
 *
 * ADR-0013: behaviour, not mechanism. What is carried is the **look** — three
 * depth tiers, one colour at three brightnesses, near ones brighter and larger,
 * all of them sliding against the camera at speeds that differ by tier.
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
 * determinism is untouched, because the sky is not in the run.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import type { CameraView } from '../state/types.ts';
import { DUSK, INK, mix } from './palette.ts';

/**
 * How many stars there are.
 *
 * The prototype's own 160, kept because it is a **measured** number in the sense
 * that matters — it is what the author looked at for months — and because
 * density is the one property of a starfield that cannot be reasoned about from
 * first principles. It is spread over a field one design space wide and two
 * tall, so the count per screen is a little under half of it.
 */
export const STAR_COUNT = 160;

/**
 * How tall the field is before it repeats, in design units.
 *
 * Two screens, so the wrap is never visible: the slowest tier moves at 0.045 of
 * the camera, so it would take more than forty screens of climb to bring the
 * same star back — and the fastest, at 0.195, still needs ten.
 */
export const FIELD_HEIGHT = DESIGN_HEIGHT * 2;

/**
 * How much of the camera's motion each tier answers, from the far tier to the
 * near one.
 *
 * The prototype's `starParallaxMin: 0.045` and `starParallaxMax: 0.195`, which
 * are the whole effect: **nothing here moves at world speed.** That is precisely
 * what spec 05 §2 refuses, and it is what the author asked for. The near tier
 * moves at about a fifth of the world and the far one at a twenty-fifth, so the
 * sky reads as very distant — the ratio between them, a little over four, is what
 * the eye actually reads as depth.
 */
const PARALLAX = [0.045, 0.12, 0.195] as const;

/**
 * The three tiers: colour, size and how many of the stars land in each.
 *
 * **One colour at three brightnesses**, which is the prototype's own correction
 * to itself — it used three separate blue-greys picked by eye, and Direction 05's
 * *"varies in brightness, never in velocity"* is honoured in the half of it that
 * survives here. The ramp runs DUSK (structure, at the back) to INK (utility
 * white, at the front) and **never reaches CORE**, which spec 00 §1 gives to the
 * craft alone: the player must always be the brightest thing on screen.
 *
 * More stars far away than near, which is what a real depth distribution does and
 * what stops the near tier from reading as a swarm.
 */
const TIERS = [
  { share: 0.5, colour: mix(DUSK, INK, 0.15), size: 1, alpha: 0.3 },
  { share: 0.35, colour: mix(DUSK, INK, 0.5), size: 1, alpha: 0.55 },
  { share: 0.15, colour: mix(DUSK, INK, 0.9), size: 1.8, alpha: 0.8 },
] as const;

interface Star {
  readonly x: number;
  readonly y: number;
}

/** One tier's worth of sky: its stars, and everything needed to draw them at once. */
interface Tier {
  readonly stars: readonly Star[];
  readonly colour: string;
  readonly size: number;
  readonly alpha: number;
  readonly parallax: number;
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
  return TIERS.map((tier, at) => {
    const stars: Star[] = [];
    for (let i = 0; i < Math.round(STAR_COUNT * tier.share); i++)
      stars.push({ x: next() * DESIGN_WIDTH, y: next() * FIELD_HEIGHT });
    return { ...tier, stars, parallax: PARALLAX[at]! };
  });
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
    context.globalAlpha = tier.alpha;
    // The sky falls as the craft climbs, so a *smaller* camera y — higher up the
    // world — pushes the stars down. The fraction is what makes it a sky rather
    // than a wall.
    const slid = -camera.y * tier.parallax;
    for (const star of tier.stars) {
      const y = wrap(star.y + slid - top, FIELD_HEIGHT) + top;
      if (y > bottom) continue;
      context.fillRect(star.x, y, tier.size, tier.size);
    }
  }
  context.restore();
}

/** Positive remainder, so a sky that has slid a long way still wraps forwards. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

/**
 * A small seeded generator, and it is **deliberately not the simulation's**.
 *
 * `test/render/boundary.test.ts` proves the renderer imports nothing from
 * `src/sim/`, which is ADR-0006's wall and worth more than the nine lines this
 * saves. The sky must never be able to draw from the run's own stream — that
 * would make a decoration capable of changing the game — and a generator it
 * cannot reach is the strongest possible statement of that.
 *
 * Mulberry32, the same algorithm the prototype seeds its own sky with.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
