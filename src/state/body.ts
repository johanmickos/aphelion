/**
 * What a body is telling the player, and how loudly.
 *
 * Spec [04](../../docs/spec/04-bodies.md): *"a body is a lamp, not a rock"*, and
 * it is *"always telling the player its relationship to them"* in four states.
 * This file derives that relationship and the one moving part of it — the
 * **tide**, which is `CONTEXT.md`'s bright limb segment that always faces the
 * craft, and which spec 04 §2 calls *"the gravity vector drawn on the thing that
 * owns it."*
 *
 * ## The tide's three numbers are one number
 *
 * Spec 04 §2 is emphatic that a heavier body reaches with a **longer, brighter,
 * tighter-tracking** tide and that *"the three must move together and
 * monotonically with mass."* Written as three formulas that happen to agree,
 * that is a promise a later edit breaks silently. Written as three readings of
 * one quantity — [`pullOf`](#) — it is true by construction, and the test that
 * holds it is a test of arithmetic rather than of coincidence.
 *
 * The quantity saturates rather than scaling straight, and that is not a
 * flourish: an arc lives on a circle, and a law with no ceiling eventually draws
 * a body whose tide is a ring. `m / (m + median)` is the simplest strictly
 * monotone map onto `(0, 1)` that puts the median body at exactly a half, which
 * is what lets spec 04's stated *reference mass* values be read off it directly.
 * **The law is an opening position**: §2 states the reference values and the
 * direction, and does not state the curve.
 */
import type { Body } from '../sim/body.ts';
import { floorRadius } from '../sim/body.ts';
import { grabRange } from '../sim/grab.ts';
import { gravityAt } from '../sim/gravity.ts';
import { distance } from '../sim/math.ts';
import { angleOf } from '../sim/trig.ts';
import type { Craft } from '../sim/craft.ts';
import { MEDIAN_MASS } from '../sim/units.ts';
import { easeStep } from './decay.ts';
import { advance, place, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import type { BodyState, BodyView, Energy, TideView } from './types.ts';

/**
 * How hard this body has hold of the craft **right now**, from 0 to 1
 * (`CONTEXT.md`: **grip**).
 *
 * The live pull, normalised against the hardest this body could ever pull —
 * which is the pull at its own floor, the closest the craft may come. So it is a
 * ratio and it means the same thing on every body: **1 is as gripped as this one
 * can make you**, whatever its mass.
 *
 * It is a different fact from [`pullOf`](#), and keeping the two apart is the
 * point. Mass says *how strong this body is* and never changes; grip says *how
 * much of that you are feeling*, and is the whole of why the field ahead is
 * quiet. Carried from the prototype, whose own comment is the reason it exists:
 * the halo is *"faded by pull, so a field of distant bodies is not sixty
 * haloes."*
 */
export function gripOf(body: Body, craft: Craft): number {
  const r = distance(craft.x, craft.y, body.x, body.y);
  const most = gravityAt(body.mass, floorRadius(body));
  return most <= 0 ? 0 : Math.min(1, gravityAt(body.mass, r) / most);
}

/**
 * How far the craft has closed into this body's reach, from 0 to 1
 * (`CONTEXT.md`: **closing**).
 *
 * **Nought at the edge of what this body can hold, one against its surface, and
 * linear in between.** It is the distance reading, and [`gripOf`](#) is what that
 * distance buys — the glossary keeps the two apart deliberately, and the reason
 * is that they are wanted for different jobs.
 *
 * **Grip is the physical truth and the wrong curve to paint with.** It falls as
 * 1/r², and a body's reach is 10.5× its own floor, so grip at the edge of a hold
 * is `0.009`: anything drawn with it is invisible over most of the span it is
 * supposed to describe. That was measured once already, for the grab filament
 * ([`FILAMENT_FLOOR`](./compass.ts)), and the ruling there was to paint with the
 * distance instead. This is that ruling, named and shared, rather than the same
 * three lines written twice.
 *
 * Measured over a real run: across an approach to the body a press would take it
 * runs **0.31 → 0.88** (p10 – p90, 0.45 – 0.80), against `strength`'s 0.42 – 0.63
 * over the same frames. It is the reading that actually moves while the craft
 * closes, which is what makes it the one to draw an approach with.
 */
export function closingOf(body: Body, craft: Craft): number {
  const reach = grabRange(body);
  if (reach <= 0) return 0;
  return 1 - Math.min(1, distance(craft.x, craft.y, body.x, body.y) / reach);
}

/**
 * How much grip it takes before a body lights up at all.
 *
 * **The bloom is not always on, and spec 04 §3 says so**: its energy column
 * reads *"E0–E1"* for a body AHEAD, not E1. M2.2 read that as E1 and lit
 * twenty-four bodies at once; flown, the author's first note was that all of it
 * was too much (2026-08-29). The prototype gates it on exactly this and carries
 * the same reading of the same board row.
 *
 * What survives at E0 is the **rim**, in the body's own hue, which is §3's other
 * sentence: *"the field ahead must read as a constellation of dim coloured
 * rings, never a row of grey balls."* Rings — not blooms.
 *
 * Three tenths, the prototype's own value. On this field it lights a body from
 * about 320 design units, against a grab range of 1 680 — so a body being *on
 * offer* and a body *glowing* are deliberately different distances.
 */
export const EMIT_AT = 0.3;

/**
 * How hard a body pulls, from 0 toward 1, with the median body at a half.
 *
 * Mass is size (spec 04 §1) and this is the only place the picture reads it.
 * Everything the tide does is a reading of this one number, so the three
 * behaviours spec 04 §2 requires to move together cannot come apart.
 */
export function pullOf(body: Body): number {
  return body.mass / (body.mass + MEDIAN_MASS);
}

/**
 * The tide's angular half-width at the **median** body — spec 04 §2's ±0.3 rad.
 *
 * The constant below is twice that, because [`pullOf`](#) puts the median at a
 * half: it is the width a body of unbounded mass would approach and never reach,
 * which is the ceiling that stops the arc becoming a ring.
 */
export const TIDE_HALF_WIDTH_MAX = 0.6;

/**
 * How fast the tide follows the craft's bearing, in 1/seconds, at the median
 * body.
 *
 * The lag is the behaviour, not a defect in the tracking: spec 04's acceptance
 * asks that a craft orbiting at a constant rate leaves the tide *"lagging by a
 * bounded, non-zero angle"*, so a tide that kept up exactly would be a tide that
 * had stopped saying anything about how heavy the body is.
 *
 * **But it was lagging so far that it had stopped facing the craft at all**,
 * which `CONTEXT.md` says is the one thing a tide does. That was already an open
 * question against spec [04 · §2](../../docs/spec/04-bodies.md) — measured on a
 * settled orbit, the standing lag ran wider than the arc's own half-width, so the
 * tide's near edge never reached the bearing it is supposed to face. Flown,
 * *"let's have the tide lag a bit less, i.e. follow the ship more closely"*
 * (author, 2026-08-29), which is that question answered.
 *
 * **Five times the stated rate, and the reason it is that much is the taper.**
 * The arc no longer burns evenly across its width: it peaks on the bearing and
 * fades to nothing at both ends, so what the eye actually reads as *the tide* is
 * the **bright middle half** rather than the whole span. Halving the lag against
 * the full arc was not enough — *"it seems like we moved the wrong way. I want
 * the tide to be more directly under the ship"* (author, 2026-08-29) — because
 * the measurement that matters is the one against the bright core.
 *
 * Over a real 1 809-tick run, both readings side by side:
 *
 * | `k` at the median | lag p50 | p90 | max | inside the bright core |
 * |---|---|---|---|---|
 * | 6 (spec 04 §2 as written) | 20.3° | 43.8° | 61.6° | — |
 * | 12 | 9.0° | 21.9° | 35.1° | **11%** |
 * | 20 | 4.6° | 11.6° | 20.3° | 71% |
 * | **30** | **2.1°** | **6.0°** | **11.6°** | **91%** |
 * | 45 | 0.5° | 2.3° | 5.4° | 100% |
 *
 * Thirty is the last row where the lag is still **there**. At 45 it is half a
 * degree — the acceptance's *non-zero* survives as arithmetic and not as
 * anything anyone could see, and spec 04 §2's *"a heavier body tracks tighter"*
 * stops being readable off the picture with it. At 30 the spot sits under the
 * craft nine times out of ten and a light body still visibly drags: the effective
 * rate is this times [`pullOf`](#), so a light body tracks at 18/s against a
 * heavy one's 42.
 */
export const TIDE_LAG_RATE_MAX = 60;

/**
 * How much of the tide's width is spent on **proximity** rather than on mass.
 *
 * *"Right now the tide markers flash in at some default width. I'd love if they
 * grew into their width based on my distance. I'm picturing a waterdrop effect
 * when it first bubbles in, and then growing in width as I approach. Can we A/B
 * test this?"* (author, 2026-08-29)
 *
 * **This is the A/B, and it is a dial rather than a switch.** At **0** the width
 * is mass alone, which is spec [04 · §2](../../docs/spec/04-bodies.md) exactly as
 * written and what shipped yesterday. At **1** it is mass × [`gripOf`](#), which
 * is the prototype's own reading — it lerps the span by live pull, not by mass.
 * In between, the two are mixed. Nothing is deleted at either end, so the
 * comparison is one slider on the bench and the run does not restart.
 *
 * The droplet falls out rather than being drawn: an arc a few degrees wide with a
 * round cap **is** a bead, so a body just coming into reach bubbles in and then
 * stretches along the limb as the craft closes.
 *
 * Two thirds is where it starts, so mass still sets the ceiling — §2's *"a
 * heavier body reaches with a longer tide"* survives — and proximity decides how
 * much of that ceiling is showing.
 */
export const TIDE_GROWTH = 0.67;

/**
 * How far **proximity** lifts the tide's brightness toward full.
 *
 * The width grows into itself as the craft closes ([`TIDE_GROWTH`](#)) and the
 * brightness did not: it read `pull` alone, so a tide was exactly as bright the
 * moment it bubbled in as it was at the floor. *"I also want the tide window to
 * grow in brightness as I get near. So we can tweak each final tide color to be
 * a touch brighter than right now"* (author, 2026-08-29).
 *
 * It **lifts** rather than scales, which is the whole difference: `pull +
 * (1 - pull) * LIFT * grip` leaves the far end exactly where the author already
 * tuned it — nothing gets dimmer — and spends the lift on the part of the range
 * mass left unused. So the near end arrives brighter, which is the ask, and a
 * light body borrows more of the lift than a heavy one because it has more room
 * to borrow.
 *
 * **Mass still orders them.** The derivative in `pull` is `1 - LIFT * grip`,
 * positive everywhere below 1, so at any fixed distance the heavier body is
 * still the brighter one — spec [04 · §2](../../docs/spec/04-bodies.md)'s
 * *"reaches with a longer and brighter tide"* survives being made to depend on
 * distance as well.
 *
 * **An opening position**, and a knob on the bench beside the width's.
 */
export const TIDE_LIFT = 0.55;

/**
 * Which of spec 04 §3's four states a body is in.
 *
 * **SPENT is a fact and not a distance**: a body that has been held and let go
 * is finished for the run, wherever the craft goes next, and the field of them
 * behind the craft is the run's scoreboard drawn in the world. It is the one
 * thing here the current tick cannot answer on its own — see
 * [`derive.ts`](./derive.ts) for where that memory lives and why it is safe.
 */
export function stateOf(body: Body, craft: Craft, held: boolean, spent: boolean): BodyState {
  if (held) return 'HELD';
  if (spent) return 'SPENT';
  return distance(craft.x, craft.y, body.x, body.y) <= grabRange(body) ? 'IN_REACH' : 'AHEAD';
}

/**
 * How brightly each state burns — spec 04 §3's energy column, read with its
 * range rather than at the top of it.
 *
 * **A body glows when it is gripping you, not when it is reachable.** §3 gives a
 * body AHEAD *"E0–E1"*, and [`EMIT_AT`](#) is where in that range it sits; a
 * body in reach but far off is still only a rim. SPENT is E0 and DUSK: *"the
 * lamp goes out at release, not at grab."*
 */
export function energyOf(state: BodyState, grip: number): Energy {
  if (state === 'HELD') return 2;
  if (state === 'SPENT') return 0;
  return grip > EMIT_AT ? 1 : 0;
}

/**
 * How long a body takes to go out after the craft lets go of it.
 *
 * *"The planet deactivation after release... can we at least have it quickly
 * fade out instead of just toggle 'off'?"* (author, 2026-08-29). Spec
 * [04 · §3](../../docs/spec/04-bodies.md) rules that *"the lamp goes out at
 * release, not at grab"* and says nothing about how long that takes, so it was
 * built as an instant — one tick lit, the next spent, in a game whose every other
 * transition is a curve.
 *
 * **Half of spec [00 · §5](../../docs/spec/00-tokens.md)'s DECAY.** The token's
 * own 420ms was the first answer — it is what things in this game leave on, and
 * it is a grammar rather than a taste. Flown, it is not what *quickly* meant:
 * *"that's good, but let's make it about twice as fast to fade"* (author,
 * 2026-08-29). At 210ms it is thirteen ticks, which is long enough to be a
 * curve and short enough that the body is out before the eye has followed the
 * craft away from it — which is the thing a release is competing with.
 */
export const SPEND_TICKS = ticksIn(210);

/**
 * How far through going out a body that has been let go is, or `null` if it is
 * not going out — because it never was held, or because it is already out.
 *
 * **A counter and not a value**, which is [`decay.ts`](./decay.ts)'s whole
 * argument and was worth re-learning the hard way: written first as a fraction
 * stepped down by `1 / SPEND_TICKS` a tick, it landed on **2.8e-16** instead of
 * zero, because a thirteenth is not a number a float can hold. So the lamp never
 * quite went out, and *"something has to decide when it is close enough"* — the
 * exact failure that file's header describes. [`advance`](./decay.ts) ends.
 *
 * **It is not a second opinion about `SPENT`.** The state is the record and never
 * comes back; this is only how far through going out the *picture* is, and it
 * runs once. A body that is spent and finished carries `null`, which is what
 * every body that was never held carries.
 */
export function spendingOf(previous: BodyView | undefined, state: BodyState): Decay | null {
  if (state !== 'SPENT') return null;
  // The tick it is let go of: it was held a moment ago and is spent now.
  if (previous?.state === 'HELD') return place(SPEND_TICKS);
  return advance(previous?.spending ?? null);
}

/**
 * The tide one tick on, or `null` where spec 04 §2 says there is none.
 *
 * **On the body a press would take, or the one that already has the craft, and
 * nowhere else.** Spec 04 §2 says *"present on every body within grab range"*,
 * which on this field is most of them at once — flown, that is noise rather than
 * gravity (author, 2026-08-29). The prototype narrows it to the same two and
 * says why: the tide is the body **reaching for you**, and the body reaching for
 * you is the one a press would answer. It is absent on a spent body, whose lamp
 * is out.
 *
 * **Its width grows with proximity**, so it bubbles in as a bead and stretches
 * along the limb as the craft closes — see [`TIDE_GROWTH`](#), which is the A/B
 * and has the old behaviour at zero.
 *
 * A tide that has just appeared is **placed** on the true bearing rather than
 * eased onto it from wherever it was last time the body was in reach
 * ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
 * second rule). A tide easing in from a stale angle would sweep the limb round
 * the body at the exact moment the player is deciding whether to press.
 */
export function tideOf(
  previous: TideView | null,
  body: Body,
  craft: Craft,
  state: BodyState,
  offered: boolean,
): TideView | null {
  if (state === 'SPENT') return null;
  if (state !== 'HELD' && !offered) return null;

  const pull = pullOf(body);
  const grip = gripOf(body, craft);
  // Mass sets the ceiling and proximity decides how much of it is showing.
  const open = 1 - TIDE_GROWTH * (1 - grip);
  const halfWidth = TIDE_HALF_WIDTH_MAX * pull * open;
  // Mass sets the brightness and proximity lifts it toward full — see
  // [`TIDE_LIFT`](#). Both readings of the same closing distance.
  const strength = pull + (1 - pull) * TIDE_LIFT * grip;
  const bearing = angleOf(craft.x - body.x, craft.y - body.y);
  if (previous === null) {
    return { bearing, halfWidth, strength };
  }

  return {
    bearing: towards(previous.bearing, bearing, easeStep(TIDE_LAG_RATE_MAX * pull)),
    halfWidth,
    strength,
  };
}

const TWO_PI = Math.PI * 2;

/**
 * An angle eased toward another, the short way round.
 *
 * The wrap matters here more than anywhere else in the game: the tide goes right
 * round the rim once per orbit, so a bearing crossing π would otherwise unwind
 * the whole way back through zero — once a revolution, on every swing.
 */
function towards(from: number, to: number, step: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * step;
}
