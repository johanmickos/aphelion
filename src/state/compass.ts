/**
 * The signature instrument, as something the renderer can draw and a test can
 * assert — `CONTEXT.md`'s **compass**.
 *
 * The geometry is the simulation's ([`compass.ts`](../sim/compass.ts)) because
 * it is a fact about the world rather than a decoration on it, and
 * [M2.3](../../docs/plan/m2-the-instrument.md)'s acceptance says so: *"grading is
 * computed in the simulation, is deterministic, and a recipe replays to
 * identical tiers."* What is decided here is only what spec
 * [00 · §6](../../docs/spec/00-tokens.md) leaves to the picture — which ring sits
 * at what radius, how far the hand is drawn, and which energy each part burns at.
 *
 * ## Nothing here is a command
 *
 * *"The gap between ghost and dot is the grade, drawn on the geometry. It is a
 * fact, never a command."* So this file carries angles and energies and no
 * advice: there is no field saying *release*, no field saying *which window is
 * best*, and the tier it does carry is what a release **now** would score rather
 * than what one later might. `VISION.md`'s fourth pillar is the reason, and the
 * **sighting** is held to the same line one state further out.
 *
 * ## Why the rings breathe
 *
 * The innermost ring is the craft's **own** radius, so the crossing on it is the
 * craft itself and the trail behind it lies on the path it actually flew. Through
 * the settle that radius swings with the oval, so the whole stack breathes with
 * it — which is the instrument being drawn *on the thing it describes* rather
 * than beside it. Spec 00 §6's rings are concentric circles and an orbit
 * mid-settle is not one; the radius they are anchored to is the craft's, and it
 * is the only anchor that keeps the trail and the innermost ring the same line.
 */
import { handOf, windowsOn } from '../sim/compass.ts';
import { magnitude } from '../sim/math.ts';
import { aimFor, tierFor } from '../sim/tier.ts';
import type { Tier } from '../sim/tier.ts';
import type { SimState } from '../sim/types.ts';
import { BOARD_PIXEL } from './design.ts';
import { hueOf } from './identity.ts';
import type { CompassView, Energy, RingView } from './types.ts';

/**
 * How far apart the rings sit, in design units.
 *
 * **An opening position.** Spec 00 §6 stacks one ring per reachable body and
 * states no spacing; what is not free is that they must be far enough apart for
 * four arcs to be told apart at a glance, and near enough that the outermost is
 * still on the same instrument. Twenty-four board pixels, and it is on the bench.
 */
export const RING_GAP = 24 * BOARD_PIXEL;

/** How far past the outermost ring the hand is drawn — spec 00 §6's *"extended outward"*. */
export const HAND_OVERSHOOT = 12 * BOARD_PIXEL;

const TWO_PI = Math.PI * 2;

/**
 * The compass this tick, or `null` when there is no body held.
 *
 * Present through the **dive** as well as the orbit, because spec 00 §6's first
 * state is the press: *"the grab filament — a line from the craft to the body
 * pulling hardest, in that body's identity hue."* There is no hand and there are
 * no rings until the freeze, which is what makes the freeze visible.
 */
export function compassOf(sim: SimState): CompassView | null {
  const held = sim.heldBody;
  if (held === null) return null;
  const body = sim.field.bodies[held]!;
  const hue = hueOf(held);

  const hand = handOf(sim);
  if (hand === null || sim.orbit === null) {
    return {
      x: body.x,
      y: body.y,
      hue,
      craftX: sim.craft.x,
      craftY: sim.craft.y,
      direction: 1,
      filament: true,
      hand: null,
      reach: 0,
      rings: [],
      swept: 0,
    };
  }

  const radius = magnitude(sim.craft.x - body.x, sim.craft.y - body.y);
  const rings: RingView[] = windowsOn(sim).map((arc, index) => {
    const offset = shortWay(hand - arc.dot);
    const width = arc.halfWidth * 2;
    const tier = tierFor(offset, width);
    const aim = aimFor(offset, width);
    return {
      body: arc.body,
      hue: hueOf(arc.body),
      radius: radius + index * RING_GAP,
      dot: arc.dot,
      halfWidth: arc.halfWidth,
      offset,
      aim,
      tier,
      // Spec 00 §3 and §6: a window is E1 at rest and heats **in place** to E2
      // under live aim. The hue never moves; only the brightness does.
      energy: (tier === null ? 1 : 2) as Energy,
      matched: tier === 'PERFECT',
    };
  });

  return {
    x: body.x,
    y: body.y,
    hue,
    craftX: sim.craft.x,
    craftY: sim.craft.y,
    direction: sim.orbit.direction,
    filament: false,
    hand,
    reach: radius + Math.max(0, rings.length - 1) * RING_GAP + HAND_OVERSHOOT,
    rings,
    // How much of the orbit has been flown, capped at one turn: past a full
    // revolution the trail would be drawing over itself and saying nothing new.
    swept: Math.min(sim.orbit.phase, TWO_PI),
  };
}

/**
 * The tier a release **right now** would score, and on which body — or `null` for
 * a miss.
 *
 * The best of the rings rather than the nearest, because a release lands where
 * it lands: if the hand is inside two windows at once the craft arrives at one of
 * them, and the one it is best aimed at is the one it is aimed at. A miss is not
 * a tier (spec 06 §5) and gets silence rather than a word.
 */
export function takenBy(rings: readonly RingView[]): { body: number; tier: Tier } | null {
  let best: RingView | null = null;
  for (const ring of rings) {
    if (ring.tier === null) continue;
    if (best === null || ring.aim > best.aim) best = ring;
  }
  return best === null ? null : { body: best.body, tier: best.tier! };
}

/** An angle folded onto (−π, π] — the short way round, which is what an aim error is. */
function shortWay(angle: number): number {
  let delta = angle % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return delta;
}
