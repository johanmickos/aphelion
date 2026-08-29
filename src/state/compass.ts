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
import { pathRadiusAt, predictOrbit } from '../sim/orbit.ts';
import type { Orbit } from '../sim/orbit.ts';
import { advance, easeStep, fade, home, place, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import { SCALE } from '../sim/units.ts';
import { alignmentOf, tierFor } from '../sim/tier.ts';
import type { Tier } from '../sim/tier.ts';
import type { SimState } from '../sim/types.ts';
import { closingOf } from './body.ts';
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

/**
 * How far apart two rings are pushed when their windows sit on top of each other.
 *
 * *"There should be some minimum distance between compass windows that are
 * essentially stacked on top because their direction is so similar. Right now
 * they're messy, let's add some minimum buffer between them"* (author,
 * 2026-08-29).
 *
 * The distance-proportional radii above are what say *how far*, and two bodies
 * at similar distances in similar directions land two arcs on top of each other.
 * Rather than move an arc — which would put the dot somewhere a release does not
 * go — the **ring** moves, which is the same instinct spec
 * [00 · §6](../../docs/spec/00-tokens.md) already has for labels: *"if two window
 * tips come within 12°, the outer label slides along its own ring until clear."*
 * Here the outer ring slides outward until its window clears the one below.
 *
 * The radius stops being exactly proportional to distance when this bites, and
 * that is the trade: the **order** still says which body is nearer, and two
 * legible arcs beat one unreadable pair.
 */
export const STACK_GAP = 20 * BOARD_PIXEL;

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

/**
 * How fast the orbit path fades in, in 1/seconds.
 *
 * *"As soon as an oval orbit is possible I want it to fade in, not just snap into
 * view"* (author, 2026-08-29). At eight it is most of the way there in a quarter
 * of a second.
 *
 * **This is not spec [00 · §5](../../docs/spec/00-tokens.md)'s rule being
 * broken.** *"Things arrive; they do not fade in"* governs elements *entering* —
 * an award, a flash, a callout — and the fade there is the softness the rule is
 * against. What fades here is a **prediction firming up**: the oval is the orbit
 * the craft is currently on, it is coarse the moment gravity first binds and it
 * converges on the frozen one, and the fade is that confidence made visible. The
 * element does not enter softly; the *answer* does.
 */
export const PATH_FADE_RATE = 8;

/**
 * How faintly the grab filament burns once the craft is outside the body's hold.
 *
 * *"Sometimes I grab too late and float away while tethered, and the dying
 * brightness would be diegetic"* (author, 2026-08-29). The hold ends on a
 * release and on nothing else ([`release.ts`](../sim/release.ts)), so a craft
 * that misses its capture keeps its filament all the way out of the field — and
 * a line at constant brightness is the only thing on screen still insisting the
 * grab is going somewhere.
 *
 * **Measured against the body's reach rather than against its grip.** Grip is the
 * physical truth and is the wrong curve to paint with: it falls as 1/r², and a
 * body's reach is **10.5×** its own floor, so grip at the edge of a hold is
 * `0.009`. A filament painted with it would be invisible at the exact moment the
 * player catches something at range. Distance over reach is linear on screen,
 * runs 1 → 0 across precisely the span the hold covers, and is the same reading
 * the rings already use for *how far* (`away / AIM_RANGE`).
 *
 * **It floors rather than dies.** At the edge of the reach there is nothing left
 * to feel, and past it the number would only go on being nothing — but a
 * filament at zero would take the last evidence that the craft is still attached
 * and still spending a grab. What is left is a thread.
 *
 * The **near** end is untouched: at the freeze the craft is around a tenth of a
 * reach out, so the filament burns at 0.93 of what it always did. That end was
 * already tuned; only the far end is new.
 */
export const FILAMENT_FLOOR = 0.25;

/**
 * How long the instrument takes to come online, and how small it starts.
 *
 * **Spec [00 · §5](../../docs/spec/00-tokens.md)'s ENTER token, applied to the
 * compass**: *"120ms, `cubic-bezier(.2, 1.6, .3, 1)`, from 92% scale"* — a pop
 * that overshoots once and settles, which is what that curve's 1.6 is. It fires
 * when the rings arrive at the **freeze** and nowhere else.
 *
 * *"When I grabbed and captured, the compass would grow/shrink bounce a little...
 * it made the grab and orbit feel dynamic, like my ship's HUD was coming online
 * in orbit. I forget if this was accidental or controlled as a feature"*
 * (author, 2026-08-29). **It was accidental**, and the prototype removed it: its
 * ring radius followed the ship through the whole swing, and frozen that *"made
 * the ring pump out and back as the ship swept periapsis to apoapsis and home
 * again — 85 out to 97 and back over about a second, on top of a curve the player
 * is trying to read."* M2.3 reintroduced it by accident too, and it was reported
 * as bouncing.
 *
 * So what is built is the half that reads as arrival rather than as wobble: **one
 * pop, at the freeze, over 120ms**, and nothing that pumps while the craft
 * sweeps. It scales the **instrument** and not the path — the rings, their
 * windows and the hand's reach — because the path is the world's orbit and the
 * craft is on it. A HUD coming online over a world that stays put is the thing
 * being described.
 */
export const ENTER_TICKS = ticksIn(120);

/** Where that pop starts from — spec 00 §5's 92%. */
export const ENTER_FROM = 0.92;

/**
 * How long the instrument takes to leave, and how far in it draws before it goes.
 *
 * ## It was a click, and the click read as a jump
 *
 * *"Before we added a kind of click or bubble effect to the compass when it
 * disappears. It still reads jumpy, and I think we should try just having it
 * shrink in radius a touch and then fade out"* (author, 2026-08-29). Measured on
 * what it replaced, the complaint has two causes and neither is the idea:
 *
 * **The swell was one frame.** On [`leaving`](./decay.ts) with its clock hurried,
 * the scale ran `1.000 → 1.035 → 1.017 → 0.964 → 0.882 → 0.777` — out on the tick
 * after the release and already back on the next. Sixteen milliseconds out and
 * sixteen back is under the span at which the eye reads a direction, so a swell
 * that size arrives as a **jitter** rather than as a gesture. Spec
 * [00 · §5](../../docs/spec/00-tokens.md)'s *attack ≤ 2 frames* is a rule about
 * things **arriving**, where being over before it is seen is the point; run
 * backwards onto an exit it buys a flinch.
 *
 * **And it never faded out.** The last frame it was drawn on was **78% scale at
 * 31% opacity**, and the next one was nothing — so the shape that was supposed to
 * be leaving was cut off while still a third lit and a fifth of the way collapsed.
 * The acceleration made that worse: the steps ran −1.8%, −5.3%, −8.1%, −10.5%, so
 * it was moving fastest at the instant it disappeared.
 *
 * ## What it does instead
 *
 * An even shrink and the game's own decay. The scale falls in equal steps —
 * nothing accelerates, so there is no instant that reads as a snap — and the
 * light goes on [`fade`](./decay.ts), which is at **3%** on the last frame it is
 * drawn. It does not need to be cut off, because by then there is nothing to cut.
 *
 * **How far in is not a taste.** It shrinks by exactly what
 * [`ENTER_FROM`](#) grew from, so the instrument leaves by the amount it arrived
 * by and the two ends stay one gesture — which is what the reversed curve was
 * reaching for and got wrong by reaching for the *shape* instead of the size. Out
 * to 92% over six ticks is 1.6% a tick, which is a drift rather than a move.
 *
 * **This is where the farewell ring will want a word.** Spec
 * [02 · §6](../../docs/spec/02-release.md) has the orbit detaching from the body
 * and expanding away in AURORA, which is the same instant going the other
 * direction — so the **path** deliberately does not scale with this, only the
 * instrument does, leaving that expansion for [M2.4](../../docs/plan/m2-the-instrument.md)
 * to put on it. A quiet exit is a better floor for it than a click that was
 * already competing with it.
 */
export const EXIT_TICKS = ticksIn(100);

/** How far in it draws before it is gone — the mirror of `ENTER_FROM`, above. */
export const EXIT_BY = 1 - ENTER_FROM;

const TWO_PI = Math.PI * 2;

/**
 * The compass this tick, or `null` when there is no body held.
 *
 * Present through the **dive** as well as the orbit, because spec 00 §6's first
 * state is the press: *"the grab filament — a line from the craft to the body
 * pulling hardest, in that body's identity hue."* There is no hand and there are
 * no rings until the freeze, which is what makes the freeze visible.
 */
export function compassOf(previous: CompassView | null, sim: SimState): CompassView | null {
  const held = sim.heldBody;
  if (held === null) return leave(previous);
  const body = sim.field.bodies[held]!;
  const hue = hueOf(held);

  const hand = handOf(sim);
  if (hand === null || sim.orbit === null) {
    // **The dive, with the oval it is heading for.** There is no instrument yet —
    // no hand, no rings — because a release that never froze earns nothing, and
    // the compass arriving is still the freeze made visible. What there is, once
    // gravity has bound the craft at all, is the path it is currently on: faded
    // in, and firming up as the prediction converges.
    const guess = predictOrbit(sim.craft, body);
    // How much of this body's hold is left — `closing`, floored below so the
    // thread survives a miss. It was written out here once; it is named now,
    // because the tide wanted the same reading and two copies of a formula are
    // one copy too many.
    const closing = closingOf(body, sim.craft);
    return {
      x: body.x,
      y: body.y,
      rim: body.radius,
      hue,
      craftX: sim.craft.x,
      craftY: sim.craft.y,
      direction: guess === null ? 1 : guess.direction,
      filament: FILAMENT_FLOOR + (1 - FILAMENT_FLOOR) * closing,
      predicted: guess !== null,
      hand: null,
      // Nothing to come online yet: the dive has no instrument.
      scale: 1,
      entrance: null,
      alpha: 1,
      exit: null,
      anchor: guess === null ? 0 : guess.periapsis,
      path: guess === null ? [] : sample(guess),
      presence: fadedIn(previous, guess !== null),
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
  const path = sample(sim.orbit);
  const rings: RingView[] = windowsOn(sim).map((arc) => {
    const offset = shortWay(hand - arc.dot);
    const tier = tierFor(offset, arc.halfWidth * 2);
    return {
      body: arc.body,
      hue: hueOf(arc.body),
      radius: anchor + RING_INNER + Math.min(1, arc.away / AIM_RANGE) * RING_SPREAD,
      away: arc.away,
      dot: arc.dot,
      halfWidth: arc.halfWidth,
      offset,
      // The wide ramp, so a window is already brightening while the hand is a
      // quarter turn away — see [`alignmentOf`](../sim/tier.ts).
      aim: alignmentOf(offset),
      tier,
      blocked: arc.blocked,
      // Spec 00 §3 and §6: a window is E1 at rest and heats **in place** to E2
      // under live aim. The hue never moves; only the brightness does.
      energy: (tier === null ? 1 : 2) as Energy,
      matched: tier === 'PERFECT',
    };
  });

  unstack(rings);

  // The instrument arrives with the freeze, so the entrance is placed on the tick
  // the hand first exists and aged from there.
  //
  // **A compass on its way out is not an instrument**, which is why the test is
  // `exit === null` and not just `hand !== null`: [`leave`](#) carries the hand
  // through the exit, so a re-grab inside those few ticks used to advance an
  // entrance that had already finished — `advance(null)` — and the compass came
  // back at full size with no bounce at all. That is precisely the fast
  // grab-release-grab the author was flying: *"it feels a bit laggy when I'm
  // zipping around"* (2026-08-29). Zipping around is when the bounce was missing.
  const live = previous !== null && previous.hand !== null && previous.exit === null;
  const entrance = live ? advance(previous.entrance) : place(ENTER_TICKS);

  return {
    scale: entrance === null ? 1 : 1 + (ENTER_FROM - 1) * home(entrance),
    entrance,
    x: body.x,
    y: body.y,
    rim: body.radius,
    hue,
    craftX: sim.craft.x,
    craftY: sim.craft.y,
    direction: sim.orbit.direction,
    filament: 0,
    predicted: false,
    presence: fadedIn(previous, true),
    alpha: 1,
    exit: null,
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

/**
 * Push a ring outward until its window clears every window inside it.
 *
 * Walked nearest-first, so a ring only ever moves out and only ever because of a
 * ring already placed — which keeps the pass single and its result independent of
 * how the list was built. Two windows *"stacked on top because their direction is
 * so similar"* is exactly when their arcs overlap, so overlap is the test rather
 * than a fixed angle.
 */
function unstack(rings: RingView[]): void {
  for (let i = 1; i < rings.length; i++) {
    const ring = rings[i]!;
    let radius = ring.radius;
    for (let j = 0; j < i; j++) {
      const inner = rings[j]!;
      const apart = Math.abs(shortWay(ring.dot - inner.dot));
      if (apart >= ring.halfWidth + inner.halfWidth) continue;
      radius = Math.max(radius, inner.radius + STACK_GAP);
    }
    rings[i] = { ...ring, radius };
  }
}

/**
 * How far along the frames it is actually drawn for — **0 on the first, 1 on the
 * last**.
 *
 * Not [`progress`](./decay.ts), which is `age / span` and therefore never reaches
 * 1: a decay placed for six ticks is drawn on six of them, ages 0 to 5, and a
 * shrink that is supposed to *land* on a size has to have spent all of itself by
 * the last one. Progress would leave it at 93% where the mirror of the entrance
 * is 92% — small, and the kind of small that makes a test say *about*.
 */
function across(exit: Decay): number {
  return exit.span <= 1 ? 1 : exit.age / (exit.span - 1);
}

/**
 * The instrument on its way out, or `null` once it is gone.
 *
 * Everything is the previous tick's — the body does not move, the rings do not
 * move, and the **hand stays where the release happened**, which is the thing
 * worth still being able to see. What changes is the scale and the light.
 */
function leave(previous: CompassView | null): CompassView | null {
  if (previous === null) return null;
  const exit = previous.exit === null ? place(EXIT_TICKS) : advance(previous.exit);
  if (exit === null) return null;
  return {
    ...previous,
    filament: 0,
    exit,
    entrance: null,
    // Linear, and that is the fix: every acceleration in the curve this replaced
    // was an instant that read as a snap in six ticks.
    scale: 1 - EXIT_BY * across(exit),
    alpha: fade(exit),
  };
}

/** The path as radii at even angles — a shape rather than a formula to get wrong. */
function sample(orbit: Orbit): number[] {
  const path: number[] = [];
  for (let i = 0; i < PATH_POINTS; i++) path.push(pathRadiusAt(orbit, (i / PATH_POINTS) * TWO_PI));
  return path;
}

/**
 * How faded in the path is, from nothing when it first becomes drawable.
 *
 * **Placed at zero and eased toward one** — ADR-0015's second rule and its third
 * at once: a swing never opens with a path already half there, and the value
 * converges on something this tick decides. It survives the freeze without a
 * step, because a predicted path and a frozen one are the same line by then.
 */
function fadedIn(previous: CompassView | null, drawable: boolean): number {
  if (!drawable) return 0;
  const was = previous === null || previous.path.length === 0 ? 0 : previous.presence;
  return was + (1 - was) * easeStep(PATH_FADE_RATE);
}

/** An angle folded onto (−π, π] — the short way round, which is what an aim error is. */
function shortWay(angle: number): number {
  let delta = angle % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return delta;
}
