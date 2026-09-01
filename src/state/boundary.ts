/**
 * The boundary — the edge as a **price** rather than as a wall.
 *
 * `CONTEXT.md`: the **boundary** is *"the graded region at the edge of the
 * field. A place with bands of increasing heat and reward, not a line —
 * intensity tracks how fast the craft is closing on it, not how near it is."*
 * The **line** is the edge of the corridor itself and the only absolute in it.
 *
 * Spec [07 · §1](../../docs/spec/07-boundary.md)'s first law is the whole
 * design: *"a barrier reacts to where you are; a risk reacts to what you are
 * doing."* Everything in this file exists to make that literally true — the heat
 * is a function of **closing speed** first and of distance only as a sharpener,
 * so skimming the fire band parallel is quiet and diving at the same distance
 * flares.
 *
 * ## Which layer this is
 *
 * The same split [`rung.ts`](./rung.ts) argues for, one layer along, and for the
 * same two reasons. **The geometry and the law are pure and live here**:
 * *"the heat at this closing speed and this distance is 0.71"* is a sentence a
 * test should be able to make without a canvas, and `test/state/boundary.test.ts`
 * makes the whole of spec 07's acceptance that way. **What the renderer keeps is
 * sampling and paint** — where the motes are laid out, how many stops a gradient
 * gets, what a label is set in ([`boundary.ts`](../render/boundary.ts)).
 *
 * **Nothing here is simulation.** No tick moves, `SIM_VERSION` does not move and
 * `FIXTURE_FIELD_VERSION` does not move — which is deliberate and load-bearing
 * rather than incidental. The parked camera session's only evidence is the
 * dispatch corpus (`docs/plan/m2-the-instrument.md`), and either bump deletes it.
 * The line already kills: [`run.ts`](../sim/run.ts)'s `outOfBounds` has been the
 * ending since M1.4. What this adds is the picture of it.
 */
import { METRE } from '../sim/units.ts';
import type { Craft } from '../sim/craft.ts';
import type { Field } from '../sim/types.ts';
import type { BoundarySideView } from './types.ts';

/**
 * How deep the outer band reaches, in design units — spec 07 §2's **220 m**, at
 * the metre [`units.ts`](../sim/units.ts) rules.
 *
 * **The metre is not negotiable here and this is the argument that settled it.**
 * `units.ts`'s own derivation names spec 07's bands as *"the check that decides
 * it"*: at a metre of `SCALE` the corridor is 370.5 m of half-width and the ×1
 * core is 150.5 m deep, and at the only competing reading the outer band alone
 * would be deeper than the whole corridor, so a run would open inside the
 * boundary. One reading produces a game and the other does not.
 */
export const OUTER_BAND = 220 * METRE;

/** How deep the fire band reaches — spec 07 §2's **90 m**, at the same metre. */
export const FIRE_BAND = 90 * METRE;

/**
 * What a swing flown in each band pays, as a multiplier on its cash — spec 07
 * §2's ×1, ×2 and ×3, and `CONTEXT.md`'s **band**.
 *
 * Printed by the renderer as the label spec 07 §2 puts on a mote, and spent by
 * nothing: the cash it multiplies is spec [08](../../docs/spec/08-economy.md)'s
 * and arrives with the economy in M4. It is named now for the same reason
 * [`bloomOf`](./energy.ts)'s chain argument is — **the term is built and only
 * its consumer is missing** — and because the label has to print *something*,
 * and a renderer inventing the number would be the picture and the economy
 * disagreeing about what the edge pays.
 */
export function bandAt(away: number): 1 | 2 | 3 {
  if (away <= FIRE_BAND) return 3;
  if (away <= OUTER_BAND) return 2;
  return 1;
}

/**
 * The floor the heat idles at, far from the line and closing on nothing — spec
 * 07 §3's **0.10**, and Direction 07's live component's own.
 *
 * It is what makes the edge visible at all when nothing is happening, which is
 * the difference between a boundary that is *somewhere* and one that only exists
 * when it is about to kill you.
 */
export const HEAT_FLOOR = 0.1;

/**
 * The most the heat may reach — spec 07 §3's **0.85**, and the board's.
 *
 * A ceiling rather than a maximum anything reaches by design: the proximity term
 * diverges at the line, so without this the last few metres would be an
 * arbitrarily bright wash. Capping at 0.85 also leaves the craft the brightest
 * thing on screen, which Direction 01 rules it always is.
 */
export const HEAT_CAP = 0.85;

/**
 * How near the line the proximity term starts to bite, in design units — spec 07
 * §3's **60**, read as metres.
 *
 * The spec writes the term as `1 + 60 / d` with `d` *"in world metres"*, so the
 * 60 is metres too or the expression is not dimensionless. At this metre the
 * factor is 1.27 at the outer band's edge, 1.67 at the fire band's, and 2.33
 * half way through the fire band — so proximity roughly **doubles** the heat
 * across the whole boundary and never more than triples it above the epsilon.
 * *"The dominant term is closing; the proximity term only sharpens it near the
 * line"* (§3), as arithmetic.
 */
export const HEAT_NEAR = 60 * METRE;

/**
 * How near the line the proximity term stops sharpening, in design units — the
 * board's own **8**, and spec 07 §3's *"floored at a small epsilon"*.
 *
 * `1 + 60 / d` diverges at the line, and a craft does reach `d = 0` — that is
 * what dying is. The board floors the same division at 8 of its pixels and this
 * is that number, which happens to be readable two ways that agree: 8 board
 * pixels and 8 metres are the same length here, because `BOARD_PIXEL`, `METRE`
 * and `SCALE` are all 3 ([`design.ts`](./design.ts), [`units.ts`](../sim/units.ts)).
 *
 * At the floor the proximity factor is 8.5, so anything at all closing is
 * already at [`HEAT_CAP`](#heat_cap) — which is correct, because a craft 8 m
 * from the line is 8 m from the end of the run.
 */
export const HEAT_EPSILON = 8 * METRE;

/**
 * The closing-speed constant, in design units per second — **640 m/s, ruled
 * here, and the board's own number could not cross.**
 *
 * Spec 07 §3 states the law and says only that `K` is *"tuned on the phone"*. It
 * is the number that decides whether the first law is true in the hand, so it is
 * the one constant in this file that had to be derived rather than converted.
 *
 * ## The board states 120, and carrying it would have made the edge a switch
 *
 * Direction 07's live component is the only place in the project the boundary
 * has ever been drawn, and it runs this exact formula at `closing / 120`, with
 * `closing` in **board pixels per second**. Board pixels are metres here, so the
 * naive carry is 120 m/s — and at 120 the closing term alone reaches 1.75 at the
 * median dive this game actually flies, which is past the cap before proximity
 * is applied at all. **Every dive would be identical and maximal**, and the edge
 * would answer *"are you closing at all"* rather than *"how fast".* That is
 * exactly [`DUST_EXPOSURE`](../render/dust.ts)'s recorded failure — a number
 * carried without the regime it was measured in — and it is caught the same way,
 * by measuring the regime.
 *
 * ## What crosses is the board's **ratio**, which is dimensionless
 *
 * Re-run headlessly at its authored default (`aggression` 1, its own slider's
 * default of a 0.3 – 2 range), the board's demo craft dives at up to **83 board
 * pixels per second** against a `K` of 120. So the board's design intent is that
 * **the fastest dive lands at 0.69 K** — hard enough to saturate the edge, and
 * only just. That ratio is the behaviour; 120 is the mechanism (ADR-0013).
 *
 * The fastest closing speed ever flown at this boundary is **442 m/s**, measured
 * over the 18 dispatches in `diagnostics/` that replay at `SIM_VERSION` 9 (50
 * refuse, which is what the refusal is for) — 21 012 ticks, of which 1 935 are
 * inside the bands. Carrying the ratio: `442 × 120 / 83 = 639`.
 *
 * ## And spec 07's own acceptance caps it independently at 807
 *
 * *"Turning to dive at the same distance raises it above 0.6 within 500ms"* has
 * to hold in its weakest case, which is the fire band's **shallowest** point
 * (`d` = 90 m, where proximity is only 1.67) at the **median** dive the corpus
 * actually flies into the fire band (210 m/s). That is `K ≤ 807`. So a ceiling
 * argued from the spec and a value derived from the board agree to within 21%,
 * from opposite directions and with nothing in common, and 640 sits inside it
 * with margin rather than on its edge.
 *
 * ## What it does, over the corpus
 *
 * | | heat p50 | heat p95 | ≥ 0.6 | at the cap |
 * |---|---|---|---|---|
 * | Holding a body, inside the bands (n = 1 464) | 0.16 | 0.70 | 8.7% | 1.5% |
 * | Coasting, inside the bands (n = 471) | 0.51 | 0.85 | 28.5% | 11.9% |
 * | Inside the fire band (n = 81) | 0.85 | — | 98.8% | 58.0% |
 *
 * The band the player *lives* in idles at 0.16 and the fire band flares, which
 * is the first law as a table. And the whole outer band at rest runs 0.127 to
 * 0.167 — visible, and nowhere near a flare.
 *
 * **It is on the bench**, because *"tuned on the phone"* is the spec's own
 * instruction and this is the largest thing on this layer that a flight can
 * still move.
 */
export const CLOSING_CONSTANT = 640 * METRE;

/**
 * Spec 07 §3's heat, from a closing speed and a distance to the line.
 *
 * ```
 * heat = min(0.85, (0.10 + closing / K) * (1 + 60 / d))
 * ```
 *
 * `closing` is in design units per second and clamped at ≥ 0 by the caller;
 * `away` is in design units and may be negative, because a craft past the line
 * is a craft whose run is over and the floor below is what keeps the arithmetic
 * finite through it.
 *
 * ## The proximity floor is above the acceptance's own ceiling below 40 m
 *
 * Spec 07's acceptance opens *"flying parallel to the line inside the fire band
 * produces `heat ≤ 0.25` sustained"*, and at zero closing this returns
 * `0.10 × (1 + 60/d)`, which passes 0.25 at **d = 40 m** — inside the fire band,
 * which starts at 90. So the criterion is true over the outer 56% of the fire
 * band and false over its inner 40 m, **from the proximity term alone, with no
 * closing at all and whatever `K` is**. It is a property of the formula the spec
 * states rather than of anything tuned here, so it is recorded rather than
 * papered over, and the test asserts the criterion where the formula can carry
 * it. `docs/plan/m3-the-field.md` carries it for the author.
 */
export function heatOf(closing: number, away: number): number {
  const d = away > HEAT_EPSILON ? away : HEAT_EPSILON;
  return Math.min(HEAT_CAP, (HEAT_FLOOR + closing / CLOSING_CONSTANT) * (1 + HEAT_NEAR / d));
}

/**
 * Whether this field has a line at all.
 *
 * `tools/check-portability.ts` builds a field whose `halfWidth` and `foot` are
 * both `Infinity`, because *"a corridor here would be geometry the proof has to
 * dodge"* — the same field [`hasRungs`](./rung.ts) exists for, and the same
 * failure it was found by. Unguarded, both lines sit at infinity and the
 * renderer is handed a gradient with no finite extent.
 */
export function hasBoundary(halfWidth: number): boolean {
  return Number.isFinite(halfWidth);
}

/**
 * A **shelter** the field projects, inside which the line is suspended.
 *
 * `CONTEXT.md`: *"the region a body projects inside which the **line** is
 * suspended — and only the line."* A circle, which is the only shape any
 * document states for one — spec [05 · §5](../../docs/spec/05-field.md) records
 * the prototype's as *"a circular `shelter` of radius 400 of its units"* — and
 * [M8](../../docs/plan/m8-the-anomaly.md) owns where one goes and may yet give
 * it another.
 */
export interface Shelter {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Every shelter this field projects — **none, and it is a named zero rather than
 * an absence.**
 *
 * Only the **anomaly** projects one (`CONTEXT.md`) and the anomaly is
 * [M8](../../docs/plan/m8-the-anomaly.md)'s, which is deliberately **last**:
 * placing the body bumps `FIXTURE_FIELD_VERSION` and `SIM_VERSION` together, and
 * the parked camera session's only evidence is the dispatch corpus those two
 * would delete. Spec 05 §5 carries the ordering — M3.4, M3.5, M3.6, the camera,
 * M4's fuel, and then the anomaly in one deliberate bump.
 *
 * So the predicate is built, it is false everywhere, and
 * `test/state/boundary.test.ts` proves the **colour follows it** by exercising
 * [`shelters`](#shelters) with one present. That is the same shape
 * [`bloomOf`](./energy.ts)'s chain and [`AnomalyView.inside`](./types.ts) are
 * already in: the term is built and only the value is missing.
 *
 * **It is a capability and not a body type** (spec 05 §5): any body may project
 * one, today exactly none does. The prototype renamed its own predicate away
 * from `inAnomalyField` for precisely this reason.
 */
export const SHELTERS: readonly Shelter[] = [];

/**
 * Whether a shelter suspends the line at this point.
 *
 * Taken at the **craft**, which is how the ruling that created the case is
 * worded — spec 05 §5: *"spec 07's bands keep their geometry and their
 * closing-speed law **inside a shelter** and are drawn in AURORA instead of
 * ION."* Inside one is a fact about where the craft is, so a boolean per side is
 * the whole of it. When M8 places a shelter that a craft can be beside rather
 * than inside, this becomes a stretch of line rather than a flag, and the
 * renderer is the layer that changes.
 */
export function shelters(at: readonly Shelter[], x: number, y: number): boolean {
  for (const shelter of at) {
    const dx = x - shelter.x;
    const dy = y - shelter.y;
    if (dx * dx + dy * dy <= shelter.radius * shelter.radius) return true;
  }
  return false;
}

/**
 * The boundary as the picture needs it: one entry per side, or none in a field
 * with no line.
 *
 * **Both sides, always, and each with its own heat**, which is the first law
 * applied honestly: a craft diving right is closing on the right line and
 * receding from the left, so the right flares and the left calms in the same
 * frame. A single heat shared between them would be a boundary that reacts to
 * where the craft is rather than to what it is doing — the barrier the design
 * refuses — and both lines are on screen at once on a phone, so the difference
 * is visible rather than theoretical.
 */
export function boundaryOf(field: Field, craft: Craft): readonly BoundarySideView[] {
  const { centreline, halfWidth } = field.corridor;
  if (!hasBoundary(halfWidth)) return [];
  return [sideOf(centreline - halfWidth, 1, craft), sideOf(centreline + halfWidth, -1, craft)];
}

/**
 * One side of it.
 *
 * `inward` is which way the field lies from this line, so `away` and `closing`
 * are both written once rather than mirrored: the distance is the craft's
 * displacement from the line measured inward, and the closing speed is the rate
 * that distance is **falling** at, clamped at ≥ 0 by spec 07 §3.
 */
function sideOf(line: number, inward: 1 | -1, craft: Craft): BoundarySideView {
  const away = (craft.x - line) * inward;
  const closing = Math.max(0, -craft.vx * inward);
  return {
    line,
    inward,
    away,
    closing,
    heat: heatOf(closing, away),
    // False everywhere today — see [`SHELTERS`](#shelters). It is read here
    // rather than in the renderer so that the colour is a fact the picture is
    // handed, like every other one (ADR-0006).
    sheltered: shelters(SHELTERS, craft.x, craft.y),
  };
}
