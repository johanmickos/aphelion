/**
 * The anomaly: where it is, and how much of it the sky has to say.
 *
 * `CONTEXT.md`: an **anomaly** is a stretch of field where the sky itself
 * changes — *"the only event permitted to repaint the sky."* Spec
 * [05 · §5](../../docs/spec/05-field.md) gives it a table and one line about
 * where it comes from: *"a contiguous altitude stretch, placed by the day recipe
 * (spec 17)."*
 *
 * ## The placement is a stand-in, and this paragraph is the whole of its status
 *
 * **Spec 17's generator does not exist.** It is [M3](../../docs/plan/m3-the-field.md)'s
 * and it is after this step, so what is below is a hand-made placement standing
 * where a generated one will go — exactly as [`fixture-field.ts`](../sim/fixture-field.ts)
 * is a hand-made field standing where a generated one will go, and as
 * `test/sim/run.ts` is a headless pilot standing in for a player. When spec 17
 * lands, **every number in this file above [`SKY_LEAD`](#sky_lead) is deleted**
 * and the extent arrives on the day's data instead; what survives is the sky's
 * reading of it, which is spec 05 §4's and not spec 17's.
 *
 * It is a **pure function of the field**, which is the property that matters
 * more than the numbers: no clock and no random stream
 * ([ADR-0004](../../docs/adr/0004-determinism-is-the-contract-the-author-is-the-feel-gate.md),
 * [ADR-0014](../../docs/adr/0014-the-simulation-owns-its-transcendentals.md)), so
 * two players flying one day meet the same weather at the same rung and a replay
 * shows what was flown.
 *
 * ## And it is presentation state rather than simulation, deliberately
 *
 * Nothing here reaches a tick. Spec 05 §5's own table has one row that would
 * change a run — *"orbiting inside an anomaly trickles fuel"* (spec
 * [13](../../docs/spec/13-fuel.md), ADR-0009) — and **fuel is M4's**, so today
 * the anomaly is entirely a picture and `SIM_VERSION` does not move.
 * `test/sim/version.test.ts`'s header names that case: the question to answer is
 * *did a tick move?*, and no tick moved. When fuel arrives it will want the
 * predicate this file already computes, and *that* is the change that costs a
 * version — not this one.
 */
import type { Field } from '../sim/types.ts';
import { METRE } from '../sim/units.ts';
import { DESIGN_HEIGHT } from './design.ts';
import type { AnomalyView } from './types.ts';

/**
 * How tall an anomaly is, in design units — **800 m, and it is the prototype's
 * own magnitude rather than a shape chosen here**.
 *
 * The prototype has no altitude stretch: its anomaly is a body outside the
 * corridor carrying a circular `shelter` of radius **400** of its units, and
 * spec 05 §5 has already replaced that mechanism with a stretch of field
 * (ADR-0013 — carry the behaviour, re-derive the mechanism). What crosses is the
 * one thing the mechanism cannot change, which is **how much field the anomaly
 * covers**: 800 of the prototype's units across, and a metre is one of those
 * ([`units.ts`](../sim/units.ts)), so 800 m.
 *
 * Two readings of this field agree with it, which is why it is this and not a
 * round number:
 *
 * - **It holds three bodies and no more.** The fixture places them about 270 m
 *   apart in altitude, so 800 m contains three — a rest stop with something in
 *   it, where one body would be a corridor and ten would not be rare.
 * - **It is just under a picture tall** (2 400 design units against the design
 *   space's 2 532), so a craft inside it cannot see both edges at once. That is
 *   the difference between arriving somewhere and looking at something.
 */
export const ANOMALY_SPAN = 800 * METRE;

/**
 * Where the anomaly's middle sits, as a fraction of the span between the lowest
 * body in the field and the highest.
 *
 * **The prototype's own placement rule for a single anomaly**, carried whole:
 * it spreads `n` of them evenly over the rows it built *"with the bottom eighth
 * skipped — an anomaly beside the opening bodies would ask for the commit before
 * the player has a corridor rhythm to break away from"*, which is
 * `0.125 + ((i + 0.5) / n) × 0.875` and, at `n = 1`, is this number. The
 * behaviour it encodes is the part worth keeping: **an anomaly is somewhere you
 * have to climb to reach.**
 *
 * ## What it costs, measured on the author's own play
 *
 * Over the 13 dispatches in `diagnostics/` that replay at `SIM_VERSION` 9 (50
 * refuse, which is what the refusal is for), this puts the anomaly's middle at
 * **4 540 m** and its foot at **4 140 m**. Those runs peak at 1 978 – 7 469 m,
 * median 2 583, so **3 of 13 reach the foot and 2 fly through it** — a fifth to
 * a quarter of runs, which is the rarity spec 05 §5 says the baseline's
 * restraint exists to protect.
 *
 * **That is also rare enough to be awkward at the gate**, and the prototype hit
 * the same wall: its dev shell carries an `anomalyAtSpawn` flag that drags the
 * first one down level with the opening body, *"for testing the charged window
 * without climbing to reach one."* The bench carries the same thing as a slider
 * (`tools/bench/patches.ts`), for the same reason, and it is a knob on an open
 * question rather than a knob on a decision — spec 17 closes it.
 */
export const ANOMALY_AT = 0.5625;

/**
 * How far ahead of an anomaly the sky starts to warm, in design units — **one
 * picture, 2 532 design units, 844 m.**
 *
 * Spec 05 §4: *"the violet-black warms almost imperceptibly toward AURORA as an
 * anomaly approaches — weather on the horizon, never spent early."* That is a
 * distance and the spec states no number, so this is derived, and the derivation
 * is a floor and a ceiling that happen to leave one obvious value between them.
 *
 * ## The floor: the warning has to arrive before the thing it warns about
 *
 * The design space shows **1 266 design units above the craft** (half its
 * height), so the anomaly's own foot appears at the top of the picture when the
 * craft is 422 m below it. A ramp whose *visible* part is shorter than that
 * starts warming after the curtains are already on screen, which is a warning
 * delivered late. Squared (below), this ramp is a level above VOID in every
 * channel for its last **1 494 design units** — 498 m, or **1.18 pictures** — so
 * the tint is perceptible while the anomaly's foot is still 76 m off the top of
 * the frame. *Weather on the horizon*, as literally as the sentence can be read.
 *
 * ## The ceiling: it must not become the baseline
 *
 * The other half of *"never spent early"* is that a sky which is always warming
 * is not warming. The fixture field is **6 828 m** tall foot to top body; a lead
 * of one picture either side of an 800 m anomaly puts the sky off VOID over
 * 2 488 m of that, so it is at rest for **64%** of the field — and *perceptibly*
 * at rest for **74%**, because only the last 498 m of each ramp moves a channel
 * at all.
 *
 * ## And what it is worth in the hand, measured
 *
 * Over the author's 13 replayable dispatches the world passes the picture at a
 * median of **415 design units/s**, p95 **1 210** and a maximum of **1 704**
 * ([`worldSpeed`](./types.ts)). So the visible part of the ramp lasts **3.6 s**
 * at the median climb, **1.24 s** at p95 and **0.88 s** at the fastest tick
 * anyone has flown — a warning at every speed in the corpus rather than a cut at
 * the top of it.
 *
 * It is on the bench, because *"almost imperceptibly"* is a judgement about a
 * moving picture on a phone and not one a table settles.
 */
export const SKY_LEAD = DESIGN_HEIGHT;

/**
 * The most the sky may be tinted outside an anomaly — spec 05 §2's stack table
 * and §4's prose, both of which say **≤ 6%**, and the board says it a third
 * time.
 *
 * It is the one number in this file the design states outright, so it is
 * **ruled** rather than derived, and the acceptance criterion is written on it:
 * *nothing outside an anomaly repaints the sky.* What 6% actually is, measured
 * against the palette: VOID `#0A0814` a full 6% of the way to AURORA `#9D6BFF`
 * is `#131322`, which is **9, 6 and 14 levels** of an 8-bit channel above VOID —
 * dimmer than the faintest star in the sky above it, which sits 14, 13 and 19
 * levels up ([`starfield.ts`](../render/starfield.ts)'s furthest tier at
 * `STAR_STRENGTH`). The ceiling the spec sets is below the quietest thing
 * already drawn on it, which is what *almost imperceptibly* has to mean.
 */
export const SKY_TINT = 0.06;

/**
 * The shape of the ramp, and it is where *"never spent early"* actually lives.
 *
 * A **square**, not a line. The tint is `SKY_TINT × u²` where `u` is how far
 * along the lead the craft has come, so the budget is held back and delivered at
 * the end instead of being spread evenly over 844 m. The difference is not
 * subtle and it is arithmetic rather than taste — what an 8-bit screen can
 * actually show of it:
 *
 * | how far along the lead | tint | levels above VOID (R, G, B) |
 * |---|---|---|
 * | ¼ | 0.4% | 1, 0, 1 |
 * | ½ | 1.5% | 2, 1, 4 |
 * | ¾ | 3.4% | 5, 3, 8 |
 * | at the edge | 6.0% | 9, 6, 14 |
 *
 * So the **first quarter of the ramp cannot be shown at all** — no channel moves
 * by more than one level out of 255 — the first half moves blue by four, and the
 * spec's ≤ 6% is reached at exactly one place, which is the edge of the anomaly.
 * A linear ramp would have spent a quarter of the budget a quarter of the way
 * out, where this spends a sixteenth.
 *
 * A square and not a smoother curve because the shape is the thing being
 * claimed, and a reader should be able to check the table above with a
 * calculator.
 */
function ramp(along: number): number {
  // Written out rather than raised to a power: `**` and `Math.pow` are both
  // banned in this directory (`pnpm portable`, ADR-0014), and a square is the
  // one shape that needs neither.
  return along * along;
}

/**
 * Whether this field has an anomaly in it at all.
 *
 * A field with no bodies has no span to place one along, and one with no finite
 * foot has no altitude at all — `tools/check-portability.ts` builds exactly that
 * field on purpose, which is the same reason [`hasRungs`](./rung.ts) exists and
 * the same failure it was found by.
 */
function placeable(field: Field): boolean {
  return field.bodies.length > 0 && Number.isFinite(field.corridor.foot);
}

/**
 * Where the anomaly hangs, in design `y` — `top` is its high-altitude edge and
 * `bottom` its low one, which is the same sense `Seen` uses and the opposite of
 * altitude.
 *
 * Measured between the lowest and highest body the field places rather than
 * between the corridor's foot and its top, because the corridor has no top
 * (`CONTEXT.md`: *"leaving through the top is the win"*) and the foot is a
 * backstop rather than a line anyone meets. The bodies are where the field
 * actually is.
 */
export function anomalyAt(field: Field): { top: number; bottom: number } | null {
  if (!placeable(field)) return null;
  let lowest = -Infinity;
  let highest = Infinity;
  for (const body of field.bodies) {
    if (body.y > lowest) lowest = body.y;
    if (body.y < highest) highest = body.y;
  }
  const middle = lowest - (lowest - highest) * ANOMALY_AT;
  return { top: middle - ANOMALY_SPAN / 2, bottom: middle + ANOMALY_SPAN / 2 };
}

/**
 * How far the sky has warmed toward the anomaly, 0 to 1.
 *
 * **Symmetric, and that is one sentence rather than two constants**: the sky is
 * off VOID exactly while the anomaly is within a picture of being visible. The
 * craft 498 m below the foot has the foot just off the top of the frame; 498 m
 * above the top edge it has that edge just off the bottom. A front has two
 * edges, and cutting the tint at the moment the craft leaves would be a 6% pop
 * across the whole sky at the one moment the player is looking behind them.
 *
 * Inside, it is 1 — and what the sky actually does inside is not this number's
 * business ([`anomaly.ts`](../render/anomaly.ts) paints the bed, world-anchored,
 * at the stretch's own edges).
 */
function warmthOf(craftY: number, top: number, bottom: number): number {
  const away = craftY > bottom ? craftY - bottom : craftY < top ? top - craftY : 0;
  if (away >= SKY_LEAD) return 0;
  return ramp(1 - away / SKY_LEAD);
}

/** The anomaly as the picture needs it, or `null` in a field that has none. */
export function anomalyOf(field: Field, craftY: number): AnomalyView | null {
  const at = anomalyAt(field);
  if (at === null) return null;
  return {
    top: at.top,
    bottom: at.bottom,
    warmth: warmthOf(craftY, at.top, at.bottom),
    inside: craftY <= at.bottom && craftY >= at.top,
  };
}
