/**
 * The run sheet: what the run just did, over whatever is playing behind it.
 *
 * TWO SHEETS, ONE LAYOUT. A cleared field and a worthy death want different
 * headlines and different colours, and nothing else about them differs — so this
 * is one drawing that takes a `SheetStyle`, rather than two that will drift.
 * Which one is shown, and whether a death has earned one at all, is decided by
 * the caller.
 *
 * CANVAS AND NOT DOM, which is the rule the rest of the game already follows:
 * DOM is developer chrome here — TUNE, DEBUG, RESET — and everything the PLAYER
 * reads is drawn in design-window coordinates so the composition is identical on
 * every device and nothing can land on a letterbox bar. A results panel is the
 * most player-facing thing in the game.
 *
 * EVERY ROW CARRIES ITS SESSION BEST. That is the whole reason `sessionMax`
 * exists: a number on its own says nothing — 812 px/s is meaningless until it
 * sits beside the 940 you managed earlier. It is also what makes the sheet worth
 * reading on the tenth run of a session rather than only the first.
 *
 * THE HEADLINE IS NOT THE SCORE. The score was on screen for the whole run; a
 * sheet that leads with it tells you nothing you did not just watch. A death
 * leads with how far up the course it got, because that is the thing to beat next
 * attempt; a clear leads with the clock, because once the course is beaten the
 * only axis left is speed.
 */
import type { Body } from '../sim/types.ts';
import type { RunStats } from '../score/types.ts';
import type { Camera } from './camera.ts';
import { FINISH, SUMMIT, SUMMIT_RGB, withAlpha } from './palette.ts';

export interface SheetStyle {
  /** Accent for the headline and the rules. */
  accent: string;
  accentRGB: readonly [number, number, number];
  /** Word above the headline figure. */
  kicker: string;
}

export const CLEARED_SHEET: SheetStyle = {
  accent: SUMMIT,
  accentRGB: SUMMIT_RGB,
  kicker: 'FIELD CLEARED',
};

export const DEATH_SHEET: SheetStyle = {
  // The finish green, not the hazard red. A worthy death is being commended for
  // how far it got, and painting that in the colour of the wall it hit would be
  // the sheet arguing with its own reason for existing.
  accent: `rgb(${FINISH[0]},${FINISH[1]},${FINISH[2]})`,
  accentRGB: FINISH,
  kicker: 'RUN ENDED',
};

/**
 * Field fraction a life must reach before its death earns a sheet.
 *
 * A CONSTANT, NOT A WEIGHT. It decides WHEN a run is reported on, never what
 * anything costs — the rule in AGENTS.md that keeps it out of `ScoreConfig`, out
 * of the equality gate's config compare, and out of the golden.
 *
 * MEASURED, AND THE MEASUREMENT IS THE POINT. The brief was "for runs that end in
 * just a few seconds we may not need one, but if I put in the effort only to die
 * at 80%, I want to know". That is a statement about two populations, so it was
 * tested against both: 109 lives recovered from the 63 reports in `diagnostics/`,
 * split by how long they lasted.
 *
 *   bar    sub-5s lives firing    lives of 15s+ firing
 *   0.24        1 of 21  (5%)          64%
 *   0.26        1 of 21  (5%)          51%
 *   0.28        0 of 21  (0%)          44%
 *   0.40        0 of 21  (0%)          14%
 *
 * 0.28 is the LOWEST bar at which no trivial life qualifies — the deepest one of
 * those reached 0.265 of the field — while still reporting on a bit under half of
 * the substantial ones. Lower and a three-second flub gets a results screen;
 * much higher and the report becomes too rare to be the feedback it is for.
 *
 * THE CORPUS IS STALE AND THAT MATTERS. Every one of those recordings predates
 * the funnel, the clear, and the current tuning, and AGENTS.md is explicit that a
 * threshold calibrated on a stale feel is worse than an unmeasured one because it
 * looks defensible. What survives staleness is the SHAPE — that sub-5s lives top
 * out around a quarter of the field, and that the two populations separate near
 * there. Re-measure the exact value against sessions played on the current build
 * before treating it as settled.
 */
export const SHEET_FIELD_FRACTION = 0.28;

/**
 * Did this life get far enough up the course to be worth reporting on?
 *
 * A clear never asks: beating the field is worthy by construction. This is only
 * the question a DEATH has to answer.
 */
export function earnsSheet(run: RunStats, bodies: readonly Body[]): boolean {
  const { done, total } = planetsCleared(run, bodies);
  return total > 0 && done / total >= SHEET_FIELD_FRACTION;
}

/** One line of the body: what it is, this run's value, and the session's best. */
interface Row {
  label: string;
  value: string;
  best: string;
}

function secs(ticks: number, dt: number): string {
  return `${(ticks * dt).toFixed(1)}s`;
}

function px(v: number): string {
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/**
 * Planets cleared, as a fraction of the field.
 *
 * Derived here rather than counted per tick, because it already IS a fact about
 * `highWaterY` and the bodies — see `RunStats.highWaterY`. Counting it during the
 * run would be a second definition of a number the world can always answer.
 */
export function planetsCleared(
  run: RunStats,
  bodies: readonly Body[],
): { done: number; total: number } {
  let total = 0;
  let done = 0;
  for (const b of bodies) {
    if (b.kind !== 'planet') continue;
    total++;
    if (b.y >= run.highWaterY) done++;
  }
  return { done, total };
}

/** Anomalies in the field, so `2 / 3` has a denominator. */
function anomalyCount(bodies: readonly Body[]): number {
  let n = 0;
  for (const b of bodies) if (b.kind === 'anomaly') n++;
  return n;
}

export function sheetRows(run: RunStats, max: RunStats): Row[] {
  return [
    { label: 'TOP SPEED', value: px(run.topSpeed), best: px(max.topSpeed) },
    { label: 'LONGEST CHAIN', value: `${run.peakChain}`, best: `${max.peakChain}` },
    {
      label: 'SECONDS ON FIRE',
      value: `${run.fireSecs.toFixed(1)}s`,
      best: `${max.fireSecs.toFixed(1)}s`,
    },
    { label: 'DISTANCE', value: px(run.distance), best: px(max.distance) },
    // Kinks and impacts as one idea: how badly it was flown. The title above is
    // what interprets it; the number on its own is not a verdict.
    {
      label: 'ROUGHNESS',
      value: `${run.roughPasses + run.impacts}`,
      best: `${max.roughPasses + max.impacts}`,
    },
  ];
}

/**
 * Draw the sheet.
 *
 * `alpha` fades the whole thing in over the ceremony rather than cutting to it,
 * which is why the warp keeps running underneath: the panel arrives on top of a
 * sky that is still moving.
 */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  style: SheetStyle,
  run: RunStats,
  max: RunStats,
  bodies: readonly Body[],
  dt: number,
  alpha: number,
  cleared: boolean,
): void {
  if (alpha <= 0.005) return;
  const s = cam.scale;
  const cx = cam.offsetX + cam.designW * 0.5 * s;
  const top = cam.offsetY + cam.viewH * 0.46 * s;
  const w = cam.designW * 0.78 * s;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // A scrim, so the rows stay readable over a moving sky. Dark rather than
  // tinted: the accent is doing the colour work and a second hue here would put
  // the sheet in competition with the ceremony behind it.
  const pad = 18 * s;
  const height = (172 + sheetRows(run, max).length * 22) * s;
  ctx.fillStyle = 'rgba(4,6,12,0.72)';
  ctx.fillRect(cx - w / 2 - pad, top - 34 * s, w + pad * 2, height);
  ctx.strokeStyle = withAlpha(style.accentRGB, 0.45);
  ctx.lineWidth = Math.max(1, 1.2 * s);
  ctx.strokeRect(cx - w / 2 - pad, top - 34 * s, w + pad * 2, height);

  ctx.fillStyle = withAlpha(style.accentRGB, 0.85);
  ctx.font = `600 ${10 * s}px ui-monospace, monospace`;
  ctx.fillText(style.kicker, cx, top - 12 * s);

  // ---- the headline
  const cleared_ = planetsCleared(run, bodies);
  ctx.fillStyle = style.accent;
  ctx.font = `700 ${34 * s}px ui-monospace, monospace`;
  const headline = cleared ? secs(run.ticks, dt) : `${cleared_.done} / ${cleared_.total}`;
  ctx.fillText(headline, cx, top + 22 * s);

  ctx.fillStyle = 'rgba(150,170,205,.8)';
  ctx.font = `${9 * s}px ui-monospace, monospace`;
  const anomalies = anomalyCount(bodies);
  const sub = cleared
    ? `${cleared_.total} PLANETS · ${run.anomalies} / ${anomalies} ANOMALIES`
    : `PLANETS · ${run.anomalies} / ${anomalies} ANOMALIES`;
  ctx.fillText(sub, cx, top + 38 * s);

  // ---- the body
  let y = top + 66 * s;
  ctx.font = `${10 * s}px ui-monospace, monospace`;
  for (const row of sheetRows(run, max)) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,170,205,.75)';
    ctx.fillText(row.label, cx - w / 2, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(214,228,250,.92)';
    ctx.fillText(row.value, cx + w / 2 - 46 * s, y);
    // The session's best, quiet and to the right. Quiet because it is context
    // rather than news — but present, because a number with nothing to measure it
    // against is not information.
    ctx.fillStyle = 'rgba(120,140,175,.7)';
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.fillText(row.best, cx + w / 2, y);
    ctx.font = `${10 * s}px ui-monospace, monospace`;
    y += 22 * s;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(120,140,175,.6)';
  ctx.font = `${8 * s}px ui-monospace, monospace`;
  ctx.fillText('TAP TO CONTINUE', cx, y + 14 * s);
  ctx.restore();
}
