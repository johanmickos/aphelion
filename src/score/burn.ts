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
import { inAnomalyField } from '../sim/world.ts';
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
export function edgeHeat(
  x: number,
  y: number,
  field: FieldBounds,
  bodies: readonly Body[],
  captured: boolean,
  scfg: ScoreConfig,
): number {
  if (!captured) return 0;
  if (inAnomalyField(x, y, bodies)) return 0;
  const dist = Math.min(x - field.left, field.right - x);
  return clamp01(1 - dist / Math.max(1e-6, scfg.burnEdgeSpan));
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
