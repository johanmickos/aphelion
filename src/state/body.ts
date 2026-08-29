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
import type { BodyState, Energy, TideView } from './types.ts';

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
 * body — spec 04 §2's `k ≈ 6 /s`, doubled for the same reason.
 *
 * The lag is the behaviour, not a defect in the tracking: spec 04's acceptance
 * asks that a craft orbiting at a constant rate leaves the tide *"lagging by a
 * bounded, non-zero angle"*, so a tide that kept up exactly would be a tide that
 * had stopped saying anything about how heavy the body is.
 */
export const TIDE_LAG_RATE_MAX = 12;

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
  const bearing = angleOf(craft.x - body.x, craft.y - body.y);
  if (previous === null) {
    return { bearing, halfWidth: TIDE_HALF_WIDTH_MAX * pull, strength: pull };
  }

  return {
    bearing: towards(previous.bearing, bearing, easeStep(TIDE_LAG_RATE_MAX * pull)),
    halfWidth: TIDE_HALF_WIDTH_MAX * pull,
    strength: pull,
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
