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
import { grabRange } from '../sim/grab.ts';
import { distance } from '../sim/math.ts';
import { angleOf } from '../sim/trig.ts';
import type { Craft } from '../sim/craft.ts';
import { MEDIAN_MASS } from '../sim/units.ts';
import { easeStep } from './decay.ts';
import type { BodyState, Energy, TideView } from './types.ts';

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
 * How much slower the inner ripple tracks than the tide — spec 04 §2's 0.6 × k.
 *
 * One stratum ring follows the same bearing at a fraction of the rate, so the
 * body's inside is visibly behind its own limb. It is a second remembered angle
 * and nothing else.
 */
export const RIPPLE_SHARE = 0.6;

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
 * How brightly each state burns — spec 04 §3's energy column.
 *
 * **AHEAD and IN REACH share a step, and the difference between them is the
 * tide.** §3 reads *"E0–E1"* against *"E1 + tide"*, so what changes at the
 * grab-range boundary is that the body starts reaching for the craft; the rim
 * going from 40% to 85% is the renderer's half of the same sentence. SPENT is
 * E0 and DUSK: *"the lamp goes out at release, not at grab."*
 */
export function energyOf(state: BodyState): Energy {
  if (state === 'HELD') return 2;
  return state === 'SPENT' ? 0 : 1;
}

/**
 * The tide one tick on, or `null` where spec 04 §2 says there is none.
 *
 * *"Present on every body within grab range; absent beyond it"* — and absent on
 * a spent body, whose lamp is out.
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
): TideView | null {
  if (state === 'AHEAD' || state === 'SPENT') return null;

  const pull = pullOf(body);
  const bearing = angleOf(craft.x - body.x, craft.y - body.y);
  if (previous === null) {
    return { bearing, ripple: bearing, halfWidth: TIDE_HALF_WIDTH_MAX * pull, strength: pull };
  }

  const rate = TIDE_LAG_RATE_MAX * pull;
  return {
    bearing: towards(previous.bearing, bearing, easeStep(rate)),
    ripple: towards(previous.ripple, bearing, easeStep(rate * RIPPLE_SHARE)),
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
