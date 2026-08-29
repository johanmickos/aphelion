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
 * ## The stack does not breathe, and that was a bug the prototype had already fixed
 *
 * M2.3 anchored the rings to the craft's **live** radius, on the argument that a
 * stack swinging with the oval reads as an instrument drawn on the thing it
 * describes. Flown, it reads as bouncing (author, 2026-08-29) — and the
 * prototype's own compass carries the same finding, measured: *"frozen, it made
 * the ring pump out and back as the ship swept periapsis to apoapsis and home
 * again — measured on a real capture, 85 out to 97 and back over about a second,
 * on top of a curve the player is trying to read."* Its fix is the one taken
 * here: anchor to the **periapsis**, which is fixed from the freeze onward, so
 * there is one number and nothing to follow.
 *
 * ## The gaps say how far, and that is the ring's whole job
 *
 * *"I don't want the orbits to be equidistant; instead I want the distances
 * between the compass orbits to be indicative of how far away the planet is"*
 * (author, 2026-08-29) — which is the prototype's formula exactly: a fixed inner
 * clearance from the orbit, then an offset proportional to the body's distance,
 * clamped at [`AIM_RANGE`](../sim/compass.ts). So the innermost ring is the next
 * hop and the outer ones are further up the climb, and reading the stack is
 * reading the field.
 */
import { AIM_RANGE, handOf, windowsOn } from '../sim/compass.ts';
import { pathRadiusAt } from '../sim/orbit.ts';
import { SCALE } from '../sim/units.ts';
import { aimFor, tierFor } from '../sim/tier.ts';
import type { Tier } from '../sim/tier.ts';
import type { SimState } from '../sim/types.ts';
import { BOARD_PIXEL } from './design.ts';
import { hueOf } from './identity.ts';
import type { CompassView, Energy, RingView } from './types.ts';

/**
 * How far outside the orbit the innermost ring sits, in design units.
 *
 * *"The compass rings should start farther out"* (author, 2026-08-29). The
 * prototype's `compassRingInner`, converted: the instrument clears the path the
 * craft is actually on, so the two are never read as the same line.
 */
export const RING_INNER = 26 * SCALE;

/**
 * How much further out the ring for the furthest body sits, in design units.
 *
 * The prototype's `compassRingSpread`, converted. A body at
 * [`AIM_RANGE`](../sim/compass.ts) gets the whole of it and a body on top of you
 * gets none, so the gap between two rings **is** the gap between two bodies.
 */
export const RING_SPREAD = 62 * SCALE;

/** How far past the outermost ring the hand is drawn — spec 00 §6's *"extended outward"*. */
export const HAND_OVERSHOOT = 12 * BOARD_PIXEL;

/**
 * How many points the orbit path is drawn through.
 *
 * The path is an **ellipse**, and through the settle it is a dramatic one — so it
 * is sampled and handed over as a shape rather than as three numbers the renderer
 * would have to know the formula for. Sixty-four is smooth at this scale and is
 * one number per point.
 */
export const PATH_POINTS = 64;

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
      anchor: 0,
      path: [],
      reach: 0,
      rings: [],
      swept: 0,
    };
  }

  // Anchored to the periapsis, which the freeze fixes and nothing afterwards
  // moves. The craft's own radius swings with the oval and the stack swung with
  // it; see the header.
  const anchor = sim.orbit.periapsis;

  // **The path is the oval, and it rounds out as the settle spends it.** The
  // trail used to be an arc of a circle at this anchor, which is not the line the
  // craft flies: *"on an eccentric oval initial orbit we see the oval with a thin
  // light line, and this oval then changes shape over the course of the
  // trajectory to round out into the true orbit"* (author, 2026-08-29). Sampled
  // from [`pathRadiusAt`](../sim/orbit.ts) — the simulation's own ellipse, at the
  // shape it has this tick — so the drawn path and the flown path cannot be two
  // different curves.
  const path: number[] = [];
  for (let i = 0; i < PATH_POINTS; i++) {
    path.push(pathRadiusAt(sim.orbit, (i / PATH_POINTS) * TWO_PI));
  }
  const rings: RingView[] = windowsOn(sim).map((arc) => {
    const offset = shortWay(hand - arc.dot);
    const width = arc.halfWidth * 2;
    const tier = tierFor(offset, width);
    const aim = aimFor(offset, width);
    return {
      body: arc.body,
      hue: hueOf(arc.body),
      radius: anchor + RING_INNER + Math.min(1, arc.away / AIM_RANGE) * RING_SPREAD,
      away: arc.away,
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
    anchor,
    path,
    reach: rings.reduce((most, ring) => Math.max(most, ring.radius), anchor) + HAND_OVERSHOOT,
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
