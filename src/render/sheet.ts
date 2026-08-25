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
import { SLATE, SUMMIT, SUMMIT_RGB, withAlpha } from './palette.ts';

export interface SheetStyle {
  /** Accent for the headline and the rules. */
  accent: string;
  accentRGB: readonly [number, number, number];
  /** Word above the headline figure. */
  kicker: string;
  /**
   * Whether this sheet is reporting a cleared field.
   *
   * ONE FLAG WHERE THERE WERE TWO. `drawSheet` also took a `cleared` boolean, and
   * it and `celebrate` were the same fact under two names — so a caller could
   * hand over a mismatched pair and get a death sheet with a victory marquee, or
   * the reverse. Naming the EVENT rather than the behaviour is what collapses
   * them: the marquee, the bigger word and the missing session column all follow
   * from having cleared the field, and none of them is separately configurable.
   *
   * THE DIFFERENCE BETWEEN THE TWO SHEETS IS NOT MEANT TO BE A HUE. Colour in
   * this codebase is a RANK — the rarity ladder — and gold is already its top
   * rung, so a clear was being drawn in the right colour and simply was not loud
   * enough. Arcades do not celebrate with hue; they celebrate with MOTION, and
   * they always have: the marquee chase, the flashing border, the digits rolling
   * up. So a clear gets a light travelling round its border and a bigger word,
   * and a death gets stillness. One is an event, the other is a report, and that
   * is a difference the eye reads before the words.
   */
  cleared: boolean;
}

export const CLEARED_SHEET: SheetStyle = {
  accent: SUMMIT,
  accentRGB: SUMMIT_RGB,
  kicker: 'FIELD CLEARED',
  cleared: true,
};

export const DEATH_SHEET: SheetStyle = {
  accent: `rgb(${SLATE[0]},${SLATE[1]},${SLATE[2]})`,
  accentRGB: SLATE,
  kicker: 'RUN ENDED',
  cleared: false,
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

/**
 * How far a row has rolled, 0..1, given the sheet's age and which row it is.
 *
 * THEY LAND TOGETHER, WHICH IS THE WHOLE EFFECT. A slot machine is not satisfying
 * because the reels spin; it is satisfying because they STOP, one after another,
 * onto a row that is suddenly all there. So every row finishes at the same
 * instant and only its start is staggered — the first row spins longest, the last
 * briefly, and the sheet resolves in one beat rather than trickling.
 *
 * Rolling the wrong way round — equal durations, staggered ends — was the obvious
 * arrangement and gives the opposite feeling: a queue being served.
 *
 * `p` IS THE SHEET'S OWN FADE, 0..1, NOT A CLOCK. It used to be seconds measured
 * from a hardcoded guess at when the panel appears, while the panel's opacity was
 * driven by how far the world had fallen — two pacings for one moment, which drift
 * apart the instant anything about the ceremony's speed changes. They had: the
 * sheet became legible around 0.4s before the clock started, so the score sat
 * visibly at zero while the player read the rest of it.
 *
 * The stagger was also inverted, which made the score — row 0, the number the
 * sheet is about — the LAST thing to start moving. The comment above described
 * the intended behaviour correctly and the arithmetic did the opposite.
 */
function rollOf(p: number, row: number, rows: number): number {
  const LAND = 0.92;
  const LEAD = 0.34;
  const start = (row / Math.max(1, rows - 1)) * LEAD;
  const u = (p - start) / Math.max(0.001, LAND - start);
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  // Fast, then settling: a reel slows into its stop rather than braking at it.
  return 1 - Math.pow(1 - c, 3);
}

/**
 * A number part-way through its roll.
 *
 * Counts UP to the value rather than cycling random digits. Random digits read as
 * a machine searching; counting reads as a total being tallied, which is what the
 * sheet is actually reporting — and it means the digit count settles early
 * instead of jittering, so the column does not shimmy as it lands.
 */
function rolled(v: number, roll: number): number {
  return roll >= 1 ? v : v * roll;
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

export function sheetRows(run: RunStats, max: RunStats, roll = 1): Row[] {
  // Offset by one: the score is row 0 of the same stagger, so the body starts at 1.
  const r = (i: number) => rollOf(roll, i + 1, 6);
  return [
    { label: 'TOP SPEED', value: px(rolled(run.topSpeed, r(0))), best: px(max.topSpeed) },
    {
      label: 'LONGEST CHAIN',
      value: `${Math.round(rolled(run.peakChain, r(1)))}`,
      best: `${max.peakChain}`,
    },
    {
      label: 'SECONDS ON FIRE',
      value: `${rolled(run.fireSecs, r(2)).toFixed(1)}s`,
      best: `${max.fireSecs.toFixed(1)}s`,
    },
    { label: 'DISTANCE', value: px(rolled(run.distance, r(3))), best: px(max.distance) },
    // Kinks and impacts as one idea: how badly it was flown. The title above is
    // what interprets it; the number on its own is not a verdict.
    {
      label: 'ROUGHNESS',
      value: `${Math.round(rolled(run.roughPasses + run.impacts, r(4)))}`,
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
export interface SheetDraw {
  style: SheetStyle;
  /** The run being reported on — `lastRun`, never the live one. */
  run: RunStats;
  /** Element-wise session maximum, for the second column. */
  max: RunStats;
  bodies: readonly Body[];
  dt: number;
  /** Opacity of the whole panel, 0..1. */
  alpha: number;
  /** Seconds since the panel's moment, for the marquee. Ignored when still. */
  t: number;
  /**
   * How far the panel has faded in, 0..1 — the same number that fades it.
   *
   * Drives the roll, so the digits move on the first frame there is anything to
   * read rather than starting on a clock of their own.
   */
  roll: number;
}

/**
 * Draw the sheet.
 *
 * TAKES AN OBJECT BECAUSE IT TOOK ELEVEN POSITIONAL ARGUMENTS, four of them bare
 * numbers and two of them booleans, and the failure mode is not hypothetical: a
 * caller passed the marquee clock where the roll progress belonged and every test
 * went on passing, silently drawing a fully-landed sheet. Positional arguments of
 * the same type are a transposition waiting to happen, and this one had already
 * happened once.
 *
 * `alpha` fades the whole thing in over the ceremony rather than cutting to it,
 * which is why the warp keeps running underneath: the panel arrives on top of a
 * sky that is still moving.
 */
export function drawSheet(ctx: CanvasRenderingContext2D, cam: Camera, d: SheetDraw): void {
  const { style, run, max, bodies, dt, alpha, t, roll } = d;
  if (alpha <= 0.005) return;
  const s = cam.scale;
  const cx = cam.offsetX + cam.designW * 0.5 * s;
  // THE TOP HALF. It sat at 0.46 and read as a panel dropped over the middle of
  // the picture; up here it is a header the ceremony plays underneath. Clear of
  // the score band above (see `SCORE_BAND_BOTTOM`) and of the ship, which the
  // ceremony now settles low for exactly this reason.
  const top = cam.offsetY + cam.viewH * 0.2 * s;
  const w = cam.designW * 0.78 * s;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ---- push the rest of the picture back
  //
  // A vignette rather than a flat dim, so the darkening reads as attention rather
  // than as the brightness being turned down: the corners go furthest, the middle
  // barely moves, and the ceremony carries on visibly underneath. Drawn full-bleed
  // over the viewport, since it is about everything that is NOT the sheet.
  const vw = cam.designW * s;
  const vh = cam.viewH * s;
  const vig = ctx.createRadialGradient(
    cx,
    cam.offsetY + vh * 0.4,
    vh * 0.18,
    cx,
    cam.offsetY + vh * 0.4,
    vh * 0.78,
  );
  vig.addColorStop(0, 'rgba(2,3,8,0)');
  vig.addColorStop(1, 'rgba(2,3,8,0.66)');
  ctx.fillStyle = vig;
  ctx.fillRect(cam.offsetX, cam.offsetY, vw, vh);

  // A scrim, so the rows stay readable over a moving sky. Dark rather than
  // tinted: the accent is doing the colour work and a second hue here would put
  // the sheet in competition with the ceremony behind it.
  const pad = 18 * s;
  const height = (196 + sheetRows(run, max).length * 22) * s;
  ctx.fillStyle = 'rgba(4,6,12,0.72)';
  ctx.fillRect(cx - w / 2 - pad, top - 34 * s, w + pad * 2, height);
  ctx.strokeStyle = withAlpha(style.accentRGB, 0.45);
  ctx.lineWidth = Math.max(1, 1.2 * s);
  const bx = cx - w / 2 - pad;
  const by = top - 34 * s;
  const bw = w + pad * 2;
  ctx.strokeRect(bx, by, bw, height);

  // ---- the marquee
  //
  // A light running round the border, the way an arcade cabinet announces a high
  // score. It is the whole of the celebration difference: both sheets are drawn
  // by this function in a colour that means the same thing it always does, and
  // what separates a win from a post-mortem is that one of them moves.
  if (style.cleared) {
    const per = 2 * (bw + height);
    const head = ((t * per) / 1.6) % per;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 2.4 * s);
    ctx.strokeStyle = withAlpha(style.accentRGB, 0.95);
    // Drawn as a dash pattern offset along the perimeter, so one path stroke
    // carries every segment however many there are.
    ctx.setLineDash([26 * s, per / 4 - 26 * s]);
    ctx.lineDashOffset = -head;
    ctx.strokeRect(bx, by, bw, height);
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.fillStyle = withAlpha(style.accentRGB, 0.9);
  ctx.font = `700 ${(style.cleared ? 14 : 10) * s}px ui-monospace, monospace`;
  ctx.fillText(style.kicker, cx, top - 12 * s);

  // ---- the headline is the SCORE
  //
  // It was the clock, on the reasoning that the score had been on screen all run
  // so leading with it told the player nothing new. That reasoning had a hole in
  // it big enough to walk through: `endLife` zeroes the live score the instant a
  // run ends, so by the time any of this is read the number the player watched
  // all run is GONE, replaced by a 0. Far from being redundant, the sheet is the
  // only place the figure still exists.
  //
  // It is also simply the most important stat, which is the other half of the
  // report — every other row is a way of describing HOW the score happened.
  const planets = planetsCleared(run, bodies);
  const scoreRoll = rollOf(roll, 0, 6);
  ctx.fillStyle = style.accent;
  ctx.font = `700 ${40 * s}px ui-monospace, monospace`;
  ctx.fillText(Math.round(rolled(run.score, scoreRoll)).toLocaleString('en-US'), cx, top + 26 * s);

  // What the score was made of, small: how long it took, and how much of the
  // field it covered. The old headlines, demoted to their real job of qualifying
  // the number above them.
  ctx.fillStyle = 'rgba(150,170,205,.8)';
  ctx.font = `${9 * s}px ui-monospace, monospace`;
  const anomalies = anomalyCount(bodies);
  const progress = style.cleared
    ? `${planets.total} PLANETS`
    : `${planets.done} / ${planets.total} PLANETS`;
  const anom = anomalies > 0 ? ` · ${run.anomalies} / ${anomalies} ANOMALIES` : '';
  ctx.fillText(`${secs(run.ticks, dt)} · ${progress}${anom}`, cx, top + 44 * s);

  // ---- the body
  //
  // A header row, because two numbers side by side with no labels is a puzzle:
  // nothing on the sheet said which was this run and which was the session, and
  // the answer is not guessable from the values.
  //
  // THE SESSION COLUMN BELONGS TO A DEATH SHEET AND NOT TO A CLEAR.
  //
  // It was first shown on both, then suppressed per-row where the two agreed, and
  // both of those were wrong for the same reason: a CLEAR ENDS THE SESSION.
  // Dismissing it returns to armed with a fresh seed and `rearm` resets the
  // score, so the session being compared against is about to stop existing. There
  // is nothing to carry the comparison forward to.
  //
  // The per-row suppression also made the residue actively misleading, which is
  // what surfaced it. Measured on the session that reported it — two deaths at
  // 10.1s and 17.9s, then the clear — the clearing run set the highs for speed,
  // chain and distance, so those rows matched and vanished. What was left was
  // SECONDS ON FIRE and ROUGHNESS: the two axes where an earlier, worse run had
  // scored higher. The column had become a sparse list of the player's worst
  // moments, printed beside their best run.
  //
  // On a death it earns its place: the same field is still there, the session
  // continues, and "your best this session" is the thing the next attempt is
  // aimed at.
  const rows = sheetRows(run, max, roll);
  const anyBest = !style.cleared && rows.some((r) => r.best !== r.value);
  let y = top + 66 * s;
  if (anyBest) {
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(120,140,175,.65)';
    ctx.textAlign = 'right';
    ctx.fillText('RUN', cx + w / 2 - 46 * s, y);
    ctx.fillText('SESSION', cx + w / 2, y);
    ctx.textAlign = 'center';
    y += 18 * s;
  }
  ctx.font = `${10 * s}px ui-monospace, monospace`;
  for (const row of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,170,205,.75)';
    ctx.fillText(row.label, cx - w / 2, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(214,228,250,.92)';
    ctx.fillText(row.value, cx + w / 2 - (anyBest ? 46 * s : 0), y);
    // The session's best, quiet and to the right, and only where it differs.
    // Quiet because it is context rather than news; absent where it would only
    // repeat the number beside it.
    if (anyBest && row.best !== row.value) {
      ctx.fillStyle = 'rgba(120,140,175,.7)';
      ctx.font = `${8 * s}px ui-monospace, monospace`;
      ctx.fillText(row.best, cx + w / 2, y);
      ctx.font = `${10 * s}px ui-monospace, monospace`;
    }
    y += 22 * s;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(120,140,175,.6)';
  ctx.font = `${8 * s}px ui-monospace, monospace`;
  ctx.fillText('TAP TO CONTINUE', cx, y + 14 * s);
  ctx.restore();
}
