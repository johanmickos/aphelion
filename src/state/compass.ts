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
import { pathRadiusAt, predictOrbit, sweptSince } from '../sim/orbit.ts';
import type { Orbit } from '../sim/orbit.ts';
import { advance, easeStep, fade, home, place, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import { SCALE } from '../sim/units.ts';
import { alignmentOf, tierFor } from '../sim/tier.ts';
import { envelopeAt } from '../sim/boost.ts';
import { qualityOf } from '../sim/quality.ts';
import { BOOST_ARM_TICKS, BOOST_PLATEAU_TICKS, BOOST_ZERO_TICKS } from '../sim/units.ts';
import type { Tier } from '../sim/tier.ts';
import type { SimState } from '../sim/types.ts';
import { closingOf } from './body.ts';
import { BOARD_PIXEL } from './design.ts';
import { hueOf } from './identity.ts';
import type { CompassView, Energy, FlownView, RingView } from './types.ts';

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

/**
 * How far apart two rings are held **whatever** their windows are doing.
 *
 * [`STACK_GAP`](#) above only fires when two arcs land on top of each other, and
 * that turns out to be the rarer half of the problem. The radii are proportional
 * to distance — `away / AIM_RANGE × RING_SPREAD` — which spreads **186 design
 * units over an aim range of 2 400**, so a ring moves outward by one design unit
 * for every **12.9** units its body is further away. Two bodies a body's width
 * apart therefore draw two rings that are not.
 *
 * Measured over **12 280 adjacent ring pairs** in the recorded dispatches:
 * **half of them sit under 5 design units apart on screen**, against a ring
 * stroke of 3 — and their bodies are a median of **32** design units apart in the
 * world, so they are genuinely at different distances and the instrument is
 * failing to say so. *"Two orbitals are sharing the same height on my compass.
 * Were the planets really the same distance away? It's OK if they were, but if
 * not, we should have some orbital separation"* (author, 2026-08-29). They were
 * not.
 *
 * **What is given up is stated rather than hidden**, and it is the same trade
 * `STACK_GAP` already makes: below this distance the gap stops being
 * proportional, so a pair this close says *these two are near each other* rather
 * than *these two are 32 units apart*. What survives is the **order** — which
 * ring is the nearer hop — and that is the reading spec 00 §6 asks the stack for.
 * Two rings the eye can separate beat one pair it cannot.
 *
 * **Sixteen board pixels, and it is derived rather than chosen** — *"the minimum
 * distance between compass orbit rings should be slightly larger, they're a bit
 * crowded"* (author, 2026-08-29), against an eight that was a guess. What has to
 * fit between two rings is the widest either is ever drawn: a window is
 * `WINDOW_WIDTH × (1 + aim)`, so **18 design units** at full aim, and a crossing
 * dot is **15** across. Sixteen board pixels is 48 units — a window's full width
 * clear of a window, or two dots and a half — so two neighbouring rings never
 * touch even when both are lit and both are being aimed at, which is exactly the
 * moment they are hardest to tell apart.
 *
 * **It costs the stack very little**, and that is measured: a three-ring stack is
 * now at least 96 design units tall before distance says anything, against an
 * outermost ring that sits at p50 **384** and never past **940**, in a picture
 * with 1 266 units above the craft. The room was there.
 */
export const RING_MIN_GAP = 16 * BOARD_PIXEL;

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
 * How much of the body's reach the filament spends its whole fade across.
 *
 * **The fade was calibrated over a distance the game never travels.** Built
 * against the full reach, and flown: *"I felt that the tether line to the planet
 * when moving away at the end should've gotten more faint as I pulled away"*
 * (author, 2026-08-29). It **was** fading — measured on that run, 0.89 down to
 * 0.52 over a 265-tick drift — and the reason that reads as *not fading* is
 * arithmetic rather than taste.
 *
 * Measured over **40 tethered drifts** of thirty ticks or more in the recorded
 * dispatches, a craft that grabs and floats away gets to **p50 0.36** of the
 * body's reach, p90 **0.61**, and never past **0.71**. It cannot get further,
 * because the thing it is drifting away from is still pulling it back. So a fade
 * spanning the whole reach spends **a quarter of its range** on the entire
 * gesture and holds the rest for a distance no craft reaches.
 *
 * And the drift is asymptotic, which makes it worse than the ratio suggests:
 * **37% of each drift's ticks are spent past 80% of its own final distance**, so
 * more than a third of the time the player is watching, the input to the fade is
 * barely moving at all.
 *
 * Six tenths is the p90: a long drift now arrives at the floor rather than
 * three-quarters of the way to it, and a median one spends two thirds of the
 * range instead of a quarter. It costs a little at the near end — the filament
 * burns at 0.88 of full at the freeze against 0.93 before — and that end was
 * already tuned, so the cost is stated rather than hidden. On the bench.
 */
export const FILAMENT_SPAN = 0.6;

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

/**
 * How many stretches each graded run of the flown arc is drawn in.
 *
 * The arc's light is the envelope's own value and the envelope ramps, so a run
 * that ramps has to be drawn in pieces — a canvas cannot put a gradient along an
 * arc. Six is where banding stops being visible at this radius: the envelope
 * moves at most 0.17 across one piece, against a light that runs from the
 * renderer's own `FLOWN_FLOOR` to full.
 *
 * It is a count of strokes and therefore a cost. Measured on the author's phone,
 * a whole frame costs **0.59ms of 16.67ms** and the renderer already asks for 27
 * strokes ([performance](../../docs/plan/performance.md) §10), so fourteen more
 * is inside the noise — and `pnpm profile` prints the census either way.
 */
export const FLOWN_STEPS = 6;

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
    const closing = closingOf(body, sim.craft, FILAMENT_SPAN);
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
      // Through the dive there is no envelope — but there is
      // [`qualityOf`](../sim/quality.ts)'s other half, the bend the body is
      // putting on the heading, which is what the punch is scaled by for a
      // release that never froze (ADR-0012). One field, both clothes.
      envelope: qualityOf(sim),
      flown: [],
      arming: [],
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

  const swept = sweptSince(sim.orbit, body.mass, sim.orbit.ticksSinceFreeze);
  // One entry per tick of the ramp, written on the tick it happens and never
  // again: the phase inside the settle is accumulated at substep resolution and
  // cannot be run backwards, so the only honest way to know where the craft was
  // is to have been there. `live` is what scopes it to this swing — a new grab
  // starts a new clock, so it starts a new latch.
  const arming = armingOf(live ? previous.arming : [], sim.orbit.ticksSinceFreeze, swept);

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
    // How much of the orbit has been flown. **Asked rather than read**: after the
    // settle `orbit.phase` is the datum the closed form is measured from and
    // stops advancing, so reading it froze the arc at 1.2s and let the craft fly
    // away from the end of its own trail. The cap it used to carry never fired,
    // because the value it capped never got there.
    swept,
    envelope: qualityOf(sim),
    flown: flownArc(arming, sim.orbit, body.mass, hand, swept),
    arming,
  };
}

/**
 * The ramp's latch, one tick longer — or unchanged once the ramp is over.
 *
 * It appends rather than rebuilding, so an entry is written once and read
 * thereafter. The guard against a gap is not defensive tidiness: a tick that
 * arrived out of order would leave a hole the arc would draw straight through,
 * and the array's own length is what says how far the ramp has got.
 */
function armingOf(previous: readonly number[], ticks: number, swept: number): readonly number[] {
  if (ticks > BOOST_ARM_TICKS || previous.length !== ticks) return previous;
  return [...previous, swept];
}

/**
 * The flown arc: the orbit already ridden, cut at the envelope's own corners and
 * lit by what a release along it would have been worth.
 *
 * **Ruled 2026-08-29**, on the measurement that 34% of the author's releases
 * landed before the boost had armed and one hold ran 303 ticks against an
 * envelope that ended at 156: the envelope's clock is said *on the orbit path*.
 * Nothing is invented here — spec [01 · §7](../../docs/spec/01-swing.md) fixes
 * the shape and [`envelopeAt`](../sim/boost.ts) is the same function the
 * simulation pays on, so the picture and the payout cannot come apart.
 *
 * ## Every corner is exact, and none of them is guessed
 *
 * The arc runs from the freeze to the craft, so time runs along it and the three
 * stretches of the envelope are three stretches of arc. Past the settle the phase
 * is closed-form, so **the plateau's end and the point the envelope reaches
 * zero** both come straight out of [`sweptSince`](../sim/orbit.ts) — and the
 * plateau ends exactly where the settle does, which spec 01 §7 says is *"not a
 * coincidence"*. The **ramp** falls inside the settle and is therefore latched a
 * tick at a time, so each of its stretches is bounded by a real angle paired with
 * the envelope's own value at that tick. There is no interpolation of the clock
 * anywhere: what varies inside a stretch is only how the light is spread across
 * it, and a stretch is at most a sixth of a ramp wide.
 */
function flownArc(
  arming: readonly number[],
  orbit: Orbit,
  mass: number,
  hand: number,
  swept: number,
): FlownView[] {
  // Capped at one turn: past a full revolution the arc would be drawing over
  // itself, and the stretch underneath is the one that is still true.
  const oldest = Math.max(0, swept - TWO_PI);
  const peakEnded = sweptSince(orbit, mass, BOOST_PLATEAU_TICKS);
  const zeroAt = sweptSince(orbit, mass, BOOST_ZERO_TICKS);

  const flown: FlownView[] = [];
  const place = (from: number, to: number, at: number, ends: number): void => {
    const start = Math.max(from, oldest);
    const stop = Math.min(to, swept);
    if (stop <= start) return;
    // The shading is cut off the **run**, not off what survives the one-turn
    // clip, so a stretch scrolling off the back of the arc keeps the light it had
    // rather than restretching its own ramp over what is left of it.
    const along = (a: number): number => at + (ends - at) * ((a - from) / (to - from || 1));
    flown.push({
      from: hand - (swept - start) * orbit.direction,
      span: (stop - start) * orbit.direction,
      at: along(start),
      to: along(stop),
    });
  };

  // The ramp, a latch at a time. Every corner is an angle the craft was actually
  // at, paired with what the envelope was actually worth at that tick.
  const armed = arming.length > BOOST_ARM_TICKS ? arming[BOOST_ARM_TICKS]! : swept;
  for (let k = 0; k < FLOWN_STEPS; k++) {
    const a = Math.round((k * BOOST_ARM_TICKS) / FLOWN_STEPS);
    const b = Math.round(((k + 1) * BOOST_ARM_TICKS) / FLOWN_STEPS);
    const from = arming[a];
    if (from === undefined) break;
    const to = arming[b];
    if (to === undefined) {
      // The ramp is still running: the last stretch ends at the craft, at what a
      // release right now is worth.
      place(from, swept, envelopeAt(a), envelopeAt(orbit.ticksSinceFreeze));
      break;
    }
    place(from, to, envelopeAt(a), envelopeAt(b));
  }

  place(armed, peakEnded, 1, 1);
  // The decay is exact along the arc without any latching: past the settle the
  // phase advances at a constant rate, so linear in time **is** linear in angle.
  for (let k = 0; k < FLOWN_STEPS; k++) {
    const from = peakEnded + ((zeroAt - peakEnded) * k) / FLOWN_STEPS;
    const to = peakEnded + ((zeroAt - peakEnded) * (k + 1)) / FLOWN_STEPS;
    place(from, to, 1 - k / FLOWN_STEPS, 1 - (k + 1) / FLOWN_STEPS);
  }
  place(zeroAt, swept, 0, 0);
  return flown;
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
  const ring = takenRing(rings);
  return ring === null ? null : { body: ring.body, tier: ring.tier! };
}

/**
 * The same answer as a whole ring, for the callers that need its geometry.
 *
 * The **callout** is born at the dot that earned it (spec 06 §4) and carries the
 * window it was taken on (spec 02 §6), so it needs the arc and not only the
 * grade — and both readings have to be the same ring or the word lands beside the
 * mark it is about.
 */
export function takenRing(rings: readonly RingView[]): RingView | null {
  let best: RingView | null = null;
  for (const ring of rings) {
    if (ring.tier === null) continue;
    if (best === null || ring.aim > best.aim) best = ring;
  }
  return best;
}

/**
 * Push a ring outward until its window clears every window inside it.
 *
 * Walked nearest-first, so a ring only ever moves out and only ever because of a
 * ring already placed — which keeps the pass single and its result independent of
 * how the list was built. Two windows *"stacked on top because their direction is
 * so similar"* is exactly when their arcs overlap, so overlap is the test rather
 * than a fixed angle.
 *
 * **Two rules, and they answer different complaints.** The overlap rule stops two
 * *arcs* being drawn on top of each other; [`RING_MIN_GAP`](#) stops two *rings*
 * being drawn at the same height whether or not their arcs ever meet. Half of all
 * adjacent pairs need the second one and would never have triggered the first.
 */
function unstack(rings: RingView[]): void {
  for (let i = 1; i < rings.length; i++) {
    const ring = rings[i]!;
    // Never nearer than a hair to the ring immediately inside it, whatever their
    // windows are doing — see [`RING_MIN_GAP`](#), and the 12 280 pairs that
    // measured how often the proportional radii alone are indistinguishable.
    let radius = Math.max(ring.radius, rings[i - 1]!.radius + RING_MIN_GAP);
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
    // **Unused rings die instantly** — spec 02 §6, and *"no fade"*. The one that
    // was taken is not lost with them: it leaves on the **callout**, which
    // outlives the instrument by design, so what goes here is every arc the
    // release did not choose and nothing else.
    rings: [],
    // And the arc stops being a clock the moment there is no envelope to read.
    // It is still drawn, because it is still the orbit that was flown — the
    // renderer floors the light rather than letting the arc go out.
    envelope: 0,
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
