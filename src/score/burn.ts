/**
 * The burn: how hard the ship is being cooked, right now.
 *
 * ONE DEFINITION, TWO CONSUMERS. The scorer integrates it into points and the
 * renderer draws a flame at its intensity. They must agree exactly or the fire
 * and the payout describe different events — the same failure the accolade table
 * was built to end, where the band coloured by one rule and the popup by another.
 *
 * WHAT LIGHTS IT: THE DEAD ZONE, NOT SPEED
 *
 * Three conditions, and the trio is the whole mechanic:
 *
 *   1. the ship is inside the red band at the field's left or right edge
 *   2. it is CAPTURED — hanging off a planet rather than drifting
 *   3. no anomaly bubble is sheltering it
 *
 * The feeling being built is dragging along the wall, barely holding onto a
 * distant planet that is the only thing keeping you out of it. Every clause is
 * one half of that sentence: without (1) there is no wall, and without (2) there
 * is nothing holding you — a ship drifting through the band is not hanging on to
 * anything, it is simply about to die, and 11018 ticks of the diagnostics corpus
 * are exactly that. It should get no fire, and does not.
 *
 * (3) is the one that is not in the brief and belongs anyway. An anomaly's bubble
 * SUSPENDS the side boundary — that is the entire anomaly mechanic — so inside
 * one there is no wall to be saved from. Burning there would promise a danger the
 * simulation has explicitly turned off, and the corpus spends 3106 ticks in that
 * position.
 *
 * HOW OFTEN, AND WHY THAT IS THE POINT
 *
 * Measured over 58 sessions: 147 edge-drags, 2.5 per session, 4.7% of all
 * captured time. Median 0.42s, p90 0.87s, longest 1.45s — four to ten times the
 * length of the reentry flare this replaced, which is what finally makes "the
 * points roll up while the ship is burning" a thing that can literally happen.
 *
 * And 78% of them end in death. That is not a defect: a death drops the whole
 * banked flare (see `endLife`), so the fire is a WARNING on the way out and pays
 * nothing, while the 22% that pull out alive are paid for the save. The drama is
 * free; only the rescue scores.
 */
import type { Body } from '../sim/types.ts';
import type { FieldBounds } from '../sim/world.ts';
import { sheltered } from '../sim/world.ts';
import type { ScoreConfig } from './config.ts';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Heat, 0..1, from how deep into the dead zone a captured ship is.
 *
 * 0 at the inner edge of the red band and 1 at the lethal line, so the flame's
 * intensity tracks the gradient the player can already see. That is deliberate:
 * `burnEdgeSpan` and `RenderConfig.hazardZoneWidth` are the same 60px, and
 * `test/score.test.ts` pins them together — a fire that peaked somewhere other
 * than where the red does would be teaching the wrong line.
 *
 * The span is floored away from zero so a weight swept to 0 — which
 * `test/score.test.ts` does to every key — degrades to "nothing burns" instead of
 * producing a NaN that would propagate silently into the score.
 */
/**
 * Heat below which the ship is not burning: no flame, and nothing accrues.
 *
 * A CONSTANT, AND IT WAS A WEIGHT UNTIL F04 STAGE (b). `ScoreConfig.burnMinHeat`
 * sat at 0.01 and said so at its declaration: "the honest value for that is zero
 * — heat is exactly 0 outside the band or while drifting, so `heat > 0` already
 * brackets a drag perfectly and needs no threshold at all. It is 0.01 rather than
 * 0 for a mechanical reason worth writing down: `test/score.test.ts` proves a
 * weight is live by trying it at 0, half and double, and every one of those is 0
 * when the value is 0."
 *
 * That was a value shaped by its test, which is the thing this repo is otherwise
 * careful not to do — and the reason it was a weight at all has expired. It used
 * to BRACKET the flare, deciding what counted as one drag rather than two and
 * therefore how many burn awards a capture paid. There are no burn awards now:
 * the heat integrates across the whole swing and is spent once, by the release,
 * so nothing is bracketed and the threshold cannot change what a session scores.
 *
 * So it goes where `AGENTS.md` says a value like this belongs — "a value that only
 * defines WHEN something is judged, never what it costs, is a constant next to its
 * code" — and it takes the honest number with it. At the old 0.10 the fire kindled
 * 54px out and 7% of band entries grazed the outer strip and left without ever
 * lighting, which is exactly what "the second they enter the dangerous red zone"
 * was reported against. At 0 there is no strip at all.
 */
export const BURN_MIN_HEAT = 0;

export function edgeHeat(
  x: number,
  y: number,
  field: FieldBounds,
  bodies: readonly Body[],
  captured: boolean,
  scfg: ScoreConfig,
): number {
  if (!captured) return 0;
  if (sheltered(x, y, bodies)) return 0;
  const dist = Math.min(x - field.left, field.right - x);
  return clamp01(1 - dist / Math.max(1e-6, scfg.burnEdgeSpan));
}

/**
 * How much fire the ship would fly INTO, for a rescue that has not happened yet.
 *
 * `rescueDeadline` hands over the flight it simulated for the press at the cross —
 * one world position a tick — and this runs the same integral `scoreTick` runs on
 * the real thing: the same `edgeHeat`, the same `burnRate`, the same ignition
 * floor. One definition, now three consumers, which is the rule the header of
 * this file exists for.
 *
 * IT IS NOT THE PAYOUT, AND MUST NOT BE PRESENTED AS ONE. The flight ends where
 * `rescueDeadline`'s promise ends — at the turn-away — but the fire does not: the ship
 * is still deep in the band at that moment and burns all the way back out through
 * it. Measured over 513 approaches in the corpus, what actually burns is a median
 * 2.21x this number (p10 1.94, p90 3.01), and only 5 of the 513 landed within 25%.
 * So this is the fire on the way IN, and the bias is systematic rather than noisy.
 *
 * That is good enough for the one thing it is used for — sizing the mark in
 * `src/render/deadline.ts`, where what matters is that a bigger fire draws a bigger
 * mark, and where `RenderConfig.deadlinePrizeFull` is calibrated in these same units.
 * It is NOT good enough to show the player a number, or to pay one. Anything that
 * needs the real total has to keep flying past the turn-away until the heat drops
 * below the floor, which is a longer flight than `rescueDeadline` has any reason to
 * simulate for its own purposes.
 *
 * IT LIVES IN `src/score/` AND NOT BESIDE THE PREDICTOR because a point is not a
 * thing the simulation is allowed to know about. `src/sim/` may import nothing
 * outside itself — `pnpm portable` proves it — so the predictor returns a
 * trajectory and pricing it is somebody else's word.
 *
 * Returns the RAW bank, before any multiplier: the multiplier is a property of
 * the streak at the moment of payment, and this is a promise about a press that
 * has not been made.
 *
 * Every sample is captured by construction — the flight begins at a press — so
 * `captured` is true throughout. A flight that never enters the band scores zero,
 * which happens on just 3% of crosses.
 */
export function previewBurn(
  flight: ReadonlyArray<{ x: number; y: number }>,
  field: FieldBounds,
  bodies: readonly Body[],
  scfg: ScoreConfig,
  dt: number,
): number {
  let bank = 0;
  for (const p of flight) {
    const heat = edgeHeat(p.x, p.y, field, bodies, true, scfg);
    if (heat > BURN_MIN_HEAT) bank += heat * dt * scfg.burnRate;
  }
  return bank;
}

/**
 * Reentry heat: low AND fast, the atmospheric-friction model.
 *
 * NOT WIRED TO ANYTHING. Kept at the author's request — "very good effect, like
 * there's an atmosphere, I might want to use this like this in the future" — and
 * kept honest by `test/score.test.ts`, which still exercises the property that
 * makes it worth having, so it cannot quietly rot into something that no longer
 * works.
 *
 * Its constants live here rather than in `ScoreConfig` precisely because it
 * scores nothing today: every key in `ScoreConfig` must change some session's
 * outcome, and an unwired weight cannot.
 *
 * The one thing to preserve if it is ever switched on: the SPEED term is what
 * makes it mean anything. The simulation steers every dive onto `minR`, so 68% of
 * settled orbits sit at exactly zero clearance and depth alone would pay for
 * parking. A parked orbit's speed has a hard ceiling of sqrt(GM/minR) — 345.8px/s
 * under DEFAULT_CONFIG, around the smallest body the generator makes — and
 * `SPEED0` sits above it. Do not lower it to whatever a recording happened to top
 * out at; that number was 342, and a gate there burns while parked.
 */
const REENTRY = Object.freeze({ SPAN: 30, SPEED0: 355, SPEED1: 520 });

export function reentryHeat(clearance: number, speed: number): number {
  const depth = clamp01(1 - clearance / REENTRY.SPAN);
  const fast = clamp01((speed - REENTRY.SPEED0) / (REENTRY.SPEED1 - REENTRY.SPEED0));
  return depth * fast;
}
