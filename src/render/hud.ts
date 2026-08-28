/**
 * The HUD: fuel, and the readout that says what the ship is doing.
 *
 * Laid out in design-window coordinates and scaled with everything else, so the
 * composition is identical on every device and nothing can land on a letterbox
 * bar. The prototype positioned these in raw screen pixels — `gy = H - gh - 72`
 * literally meant "clear the DOM button row" — which does not survive a scaled,
 * letterboxed window.
 */
import type { SimConfig } from '../sim/config.ts';
import type { GrabResult } from '../sim/types.ts';
import type { ScoreAward, ScoreState } from '../score/types.ts';
import type { Praise } from '../score/index.ts';
import { praiseFor } from '../score/index.ts';
import type { AccoladeStyle } from './accolade.ts';
import { DOT, LEVEL, ROUTINE } from './accolade.ts';
import type { Camera } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';
import {
  AURORA,
  CORE,
  DUSK,
  FINISH,
  HAZARD,
  HAZARD_FUEL,
  HAZARD_WARN,
  IMPACT,
  INK,
  VOID,
  solid,
  withAlpha,
} from './palette.ts';
import { mix } from './theme.ts';

export interface ReadoutLine {
  text: string;
  color: string;
  /** 0..1, for pulsing the urgent ones. */
  pulse?: number;
}

/**
 * Design-space geometry, in the 390x844 window.
 *
 * The bar is narrower than the 'FUEL' caption under it on purpose: the caption
 * and the number set the column's width, and the bar only has to be wide enough
 * for its pills to read as a scale.
 *
 * Ten pills, because ten is what the graduations they replace already marked —
 * the gaps between pills ARE those graduations now, which is why the old
 * two-pass tick drawing is gone. At h 78 with 2-unit gaps a pill is exactly 6
 * units tall.
 */
export const GAUGE = { x: 16, w: 15, h: 78, bottomGap: 44, pills: 10, gap: 2, radius: 2 } as const;

/**
 * The fuel ramp: seven steps, red at an empty tank through amber to green.
 *
 * A LIST, not a lerp. Ten pills sampling a continuous ramp gave ten colours a
 * few units apart, which is a gradient wearing pills — the eye reads it as one
 * smooth wash and the banding does no work. Seven named steps read as a ladder,
 * and a ladder is countable: "two from the bottom" is a thing you can see
 * without comparing anything to anything.
 *
 * The values are the old lerp sampled at seven even points, endpoints included,
 * so not one hue moved — only the number of them did. They are written out
 * rather than computed because a palette you can read is a palette you can edit,
 * which is the same reason `LEVEL` in `accolade.ts` is a table.
 *
 * Ordered empty-first, so the index climbs with the tank.
 */
export const FUEL_RAMP: readonly string[] = Object.freeze(
  // ION AT THE BOTTOM, DUSK AT THE TOP, and the rainbow is gone.
  //
  // It ran red through amber to green, which spent three hues on one fact.
  // Direction 03 rules on exactly this: "Yellow would add a fourth meaning to hue;
  // severity is ordinal, so it rides the energy channel like everything else. If
  // it's pink, it can cost you the bank — one rule, no exceptions."
  //
  // So an empty tank is ION, because that is the only thing that can end the run,
  // and a full one is DUSK, because fuel you are not short of is not information —
  // DUSK is "the unlit state of everything". The seven steps stay: they were
  // chosen so the bar reads as a countable ladder rather than a smooth wash, and
  // that reasoning is about the number of steps, not about their hues.
  //
  // The whole gauge moves onto the craft as a halo arc under Direction 03. This is
  // the colour law arriving first; the geometry follows with the HUD grid.
  [1, 0.82, 0.64, 0.46, 0.3, 0.15, 0].map((t) => solid(mix(DUSK, HAZARD, t))),
);

/**
 * The step a given height of the bar sits on.
 *
 * Sampled by HEIGHT rather than by level, so each pill keeps one solid colour for
 * the whole run and the red at the bottom of the stack is visible long before the
 * ship gets there. The topmost lit pill still shows the level's own colour, which
 * is what the ramp meant when the whole bar was one lerp of it — nothing is lost,
 * and the scale is now permanently on screen instead of being inferred from a
 * colour that has nothing beside it to be judged against.
 *
 * `floor` rather than `round`: across ten pills it lands the seven steps in a
 * 1-2-1-2-1-2-1 pattern, which is symmetric. Rounding gives 1-1-2-2-1-2-1, which
 * is the same seven colours arranged so that they look like a mistake.
 */
export function fuelColor(at: number): string {
  const i = Math.floor(at * FUEL_RAMP.length);
  return FUEL_RAMP[Math.max(0, Math.min(FUEL_RAMP.length - 1, i))]!;
}

/**
 * Where the tank counts as low, as a fraction of `fuelMax`.
 *
 * One number, two consumers: the gauge's flashing LOW state and the badge that
 * flashes beside the ship (`src/render/fuel-warning.ts`). Two cues for the same
 * fact that disagreed about when the fact was true would be worse than either
 * alone — the same reason `accolade.ts` is one table.
 */
export const FUEL_LOW_FRAC = 0.25;

/** Alpha of a pill the tank has not reached, and of one it has. */
const PILL_DIM = 0.14;
const PILL_LIT = 1;

/**
 * The score band, top-centre.
 *
 * It is the only permanently visible number besides fuel, so it gets the middle
 * of the header and the readout was moved below it. A transient message yields to
 * a standing one, not the other way around.
 */
const SCORE = { bestY: 15, y: 34, multY: 49, awardY: 65, detailY: 77 } as const;

/**
 * How far down the score band reaches, in design units.
 *
 * Exported because nothing outside this file could previously know it, and the
 * consequence was the playtest of 2026-08-22's loudest finding: planet labels
 * drawn straight through the score, producing `P21 84P20 57 51` across the
 * multiplier. `drawEdgeMarkers` was already trying to avoid the header — it takes
 * a `headerBottom` — but that value is measured from a DOM element, and the score
 * is drawn on the canvas, so the one thing the arrows most needed to clear was
 * invisible to the calculation.
 *
 * It is `detailY` plus the descender room under it, not a guessed constant, so it
 * follows the band if the layout above moves.
 */
export const SCORE_BAND_BOTTOM = SCORE.detailY + 6;

/** Ticks an award stays on screen. 1.6s at 60Hz. */
const AWARD_TICKS = 96;

interface BandLine {
  style: AccoladeStyle;
  detail: string;
  mult: string;
}

/**
 * How each kind of award reads in the band.
 *
 * Colour comes from `accolade.ts`, the same table the floating popups use, so the
 * two can never disagree again — the band used to colour by EVENT and the popup
 * by CATEGORY, which put the same link on screen as green in one place and violet
 * in the other.
 *
 * A record rather than a ternary on `kind === 'link'`, for the reason
 * `PRESS_LINE` below is one: this WAS a two-way boolean, and when a third kind
 * arrived it fell through to the else branch and announced every grab in the
 * deduction colour, captioned as a penalty — the player told off for the capture
 * they had just made. Adding a kind now fails to compile until it has an entry.
 */
const BAND: Record<ScoreAward['kind'], (a: ScoreAward, p: Praise | null) => BandLine> = {
  link: (a, p) => ({
    style: p ? LEVEL[p.level] : ROUTINE,
    // The three multipliers that priced the swing, in the order the constitution
    // applies them, and the carry they were applied TO. A receipt that printed
    // only the total could not be checked against the screen; this one can —
    // every number in it was drawn somewhere before it scored.
    detail: `${a.body}  ${formatScore(a.carry)} x${a.tier.toFixed(2)} · FIRE x${a.band} · PEAK ${pct(a.timing)} · AIM ${pct(a.aim)}`,
    mult: a.multiplier > 1 ? `  x${a.multiplier.toFixed(2)}` : '',
  }),
  // Never carries a praise word, and that is calibration rather than an omission:
  // a fast life makes upward of 38 of these a minute where a chained one makes
  // 2.7, so a word on each would be the loudest thing on screen for the player it
  // is meant to reward. The multiplier climbing IS the feedback.
  flyby: (a) => ({
    style: ROUTINE,
    // TURN is reported in degrees rather than as a percentage of
    // `flybyTurnSpan`, unlike every other quality on this line, and the reason is
    // that it is the one the player can check against the screen: the ship
    // visibly swings that far around the planet. It is also the term that sets
    // the tier here, a pass having neither a compass marker nor a boost envelope.
    detail: `${a.body}  ${formatScore(a.carry)} x${a.tier.toFixed(2)} · FIRE x${a.band} · TURN ${Math.round(a.turn)}°`,
    mult: a.multiplier > 1 ? `  x${a.multiplier.toFixed(2)}` : '',
  }),
  // No word and no multiplier, because a dot has neither: it pays flat and every
  // one is identical. The line says which of them this was, so ten of them read as
  // a count rather than as the same message ten times.
  mote: () => ({
    style: DOT,
    detail: 'CARPET  DOT',
    mult: '',
  }),
};

function lerpColor(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/**
 * Vertical fuel gauge.
 *
 * Fuel is the only resource in the game and it was invisible: a grab refused for
 * an empty tank, or a capture that puttered out mid-circularisation, both looked
 * to the player like the game ignoring them. Green through amber to red, with a
 * flashing LOW state and a burn indicator while actively spending.
 */
export function drawFuelGauge(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  snap: RenderSnapshot,
  timeMs: number,
): void {
  const s = cam.scale;
  const frac = Math.max(0, Math.min(1, snap.fuel / sim.fuelMax));
  const gx = cam.offsetX + GAUGE.x * s;
  const gh = GAUGE.h * s;
  const gw = GAUGE.w * s;
  const gbot = cam.offsetY + (cam.viewH - GAUGE.bottomGap) * s;
  const gy = gbot - gh;

  const low = frac <= FUEL_LOW_FRAC;
  const flash = low ? 0.55 + 0.45 * Math.sin(timeMs / 110) : 1;

  ctx.save();
  ctx.fillStyle = withAlpha(VOID, 0.55);
  ctx.fillRect(gx - 3 * s, gy - 3 * s, gw + 6 * s, gh + 6 * s);

  // The pills. Each one's colour is fixed by where it sits; what the level
  // changes is how brightly it burns.
  //
  // The topmost pill the level lands inside FADES rather than filling part-way.
  // A pill drawn half-height would be a smaller pill, which reads as a different
  // thing rather than as a partial one — and fading keeps the gauge moving
  // continuously as fuel drains and regenerates, which a stack that only ever
  // steps in tenths would not.
  const slot = gh / GAUGE.pills;
  const pillH = slot - GAUGE.gap * s;
  for (let i = 0; i < GAUGE.pills; i++) {
    const lit = Math.max(0, Math.min(1, frac * GAUGE.pills - i));
    const top = gbot - i * slot - pillH;
    // The flash rides on the LIT part only, so a pill can never dim below the
    // unlit floor and the stack keeps its order at every point in the pulse.
    ctx.globalAlpha = PILL_DIM + (PILL_LIT - PILL_DIM) * lit * flash;
    ctx.fillStyle = fuelColor((i + 0.5) / GAUGE.pills);
    ctx.beginPath();
    ctx.roundRect(gx, top, gw, pillH, GAUGE.radius * s);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = low ? withAlpha(HAZARD, flash) : withAlpha(DUSK, 0.55);
  ctx.lineWidth = (low ? 2 : 1) * s;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.textAlign = 'center';
  ctx.fillStyle = withAlpha(INK, 0.7);
  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.fillText('FUEL', gx + gw / 2, gy - 7 * s);
  ctx.fillStyle = low ? solid(HAZARD_FUEL) : withAlpha(INK, 0.75);
  ctx.fillText(String(Math.round(snap.fuel)), gx + gw / 2, gbot + 14 * s);
  if (low) {
    ctx.fillStyle = withAlpha(HAZARD, flash);
    ctx.font = `600 ${8 * s}px ui-monospace, monospace`;
    ctx.fillText('LOW', gx + gw / 2, gbot + 26 * s);
  }

  // burning: spent while braking a flyby, or while circularising
  const cap = snap.capture;
  const burning = snap.held && cap !== null && (cap.phase === 'flyby' || cap.phase === 'settle');
  if (burning) {
    ctx.fillStyle = `rgba(255,210,80,${0.5 + 0.5 * Math.sin(timeMs / 80)})`;
    ctx.font = `${9 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀ burning', gx + gw + 8 * s, gbot - gh * frac);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/**
 * The readout: short lines saying what the ship is doing and what to do about it.
 *
 * Drawn on the canvas in design space rather than in a DOM node, so it scales and
 * letterboxes with everything else. Top-left, because the diagnostics controls
 * sit top-right.
 *
 * Transient messages age by simulation tick, not wall clock — a paused game
 * should not quietly expire the message explaining why it paused.
 */
/** How long a refusal notice stays up, in ticks (1 second at 60Hz). */
const REFUSAL_TICKS = 60;

/**
 * Above this fraction over escape speed, braking a flyby is genuinely expensive
 * and often fails. Below it, holding converts quickly and cheaply.
 *
 * Was 0.28, drawn from a real session where every conversion sat at 0.09-0.22 and
 * every failure at 0.31-0.82. That measurement died with `flybyBrake` 320 -> 600
 * and `flybyFuelPerSec` 54 -> 40, which made a save 2.5x cheaper per unit of
 * speed shed. Re-measured by holding a grab across the band:
 *
 *     over escape   converts in   fuel spent
 *          13%          13t           30
 *          33%          32t           42
 *          50%          41t           48
 *          65%          37t           46
 *          73%          80t           74
 *          80%         111t           95      <- the tank, near enough
 *
 * So the line sits at 0.70 now. Left at 0.28 the readout shouted "TOO FAST" and
 * "holding costs a lot of fuel" at grabs that recover in half a second for 40% of
 * the tank, which is exactly the false alarm the 0.28 measurement existed to stop.
 */
const FLYBY_HARD = 0.7;

/**
 * What a press did, when it did not take a body. A record rather than a ternary
 * chain, so adding a way for a press to do nothing makes the compiler ask for its
 * message instead of quietly falling through to the wrong one.
 *
 * `carved` is the one entry that is not an apology, so it is the one entry without
 * a `✕`. It is the finish green because the carpet is, and it is here at all
 * because the first press a player makes in the run-in is the moment the button
 * changes meaning — the ship swerving says so, and this says why.
 */
const PRESS_LINE: Record<Exclude<GrabResult, 'captured'>, ReadoutLine> = {
  carved: { text: '↯ CARVING THE CARPET', color: solid(FINISH) },
  'refused-crash-cone': { text: '✕ TOO LATE — crash course', color: HAZARD_WARN, pulse: 1 },
  'refused-no-fuel': { text: '✕ TANK EMPTY — cannot grab', color: HAZARD_WARN, pulse: 1 },
  'refused-out-of-range': { text: '✕ TOO FAR — get closer', color: withAlpha(INK, 0.8) },
  'refused-no-body': { text: '✕ nothing in range', color: solid(DUSK) },
};

export function readoutLines(
  sim: SimConfig,
  snap: RenderSnapshot,
  canCircularise: boolean,
): ReadoutLine[] {
  const out: ReadoutLine[] = [];
  const cap = snap.capture;

  if (cap) {
    if (cap.phase === 'flyby') {
      // A flyby is not automatically trouble. Measured over a real session, most
      // convert in under half a second for under 20 of 100 fuel — and those were
      // being shown the same alarm as the ones that burned the whole tank and
      // still sailed past. Conversions ran 1.09-1.22x escape speed, failures
      // 1.31-1.82x, so the readout reports progress and only escalates when the
      // brake genuinely is not winning.
      const pct = Math.max(0, Math.round(cap.overEscape * 100));
      if (snap.fuel <= 0) {
        out.push({ text: '⚠ OUT OF FUEL — sailing past', color: HAZARD_WARN, pulse: 1 });
      } else if (cap.overEscape > FLYBY_HARD) {
        out.push({ text: `⚡ TOO FAST — ${pct}% over`, color: solid(HAZARD), pulse: 1 });
        out.push({ text: 'holding costs a lot of fuel', color: withAlpha(HAZARD, 0.75) });
      } else {
        out.push({ text: `BRAKING — ${pct}% over`, color: withAlpha(INK, 0.8) });
      }
    } else if (!canCircularise) {
      out.push({ text: '⚠ LOW FUEL — will not round out', color: HAZARD_WARN, pulse: 1 });
    }

    if (cap.boostFull > 1) {
      const arming = cap.boostT < sim.boostArmTime;
      const peak = Math.abs(cap.boostT - sim.boostArmTime) < 0.15;
      out.push(
        peak
          ? { text: '◀ BOOST PEAK — release!', color: solid(CORE), pulse: 1 }
          : arming
            ? { text: 'BOOST arming…', color: solid(DUSK) }
            : { text: 'BOOST fading', color: solid(DUSK) },
      );
    }
  } else {
    if (snap.fuel <= 0.5) {
      out.push({ text: '⚠ NO FUEL — recovering…', color: HAZARD_WARN, pulse: 1 });
    }
    const g = snap.lastGrab;
    if (g && g.result !== 'captured' && snap.tick - g.tick < REFUSAL_TICKS) {
      out.push(PRESS_LINE[g.result]);
    }
  }

  if (snap.ending.active) {
    out.push(
      snap.ending.reason === 'impact'
        ? { text: '⚠ CRASHED', color: solid(IMPACT) }
        : { text: '⚠ LOST — OFF COURSE', color: HAZARD_WARN },
    );
  }

  return out;
}

/**
 * Top of the readout stack, below the score band. Design units.
 */
const READOUT_TOP = 92;

export function drawReadout(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  lines: readonly ReadoutLine[],
  timeMs: number,
): void {
  if (lines.length === 0) return;
  const s = cam.scale;
  const x = cam.offsetX + 14 * s;
  let y = cam.offsetY + READOUT_TOP * s;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.font = `${11 * s}px ui-monospace, monospace`;
    ctx.globalAlpha = line.pulse ? 0.65 + 0.35 * Math.sin(timeMs / 130) : 1;
    // a dark backing so the text stays readable over stars and planets
    const w = ctx.measureText(line.text).width;
    ctx.fillStyle = withAlpha(VOID, 0.45);
    ctx.fillRect(x - 5 * s, y - 11 * s, w + 10 * s, 16 * s);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x, y);
    y += 17 * s;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Group digits without `toLocaleString`, whose output depends on the device's
 * locale — a score should read the same on every phone, and a render test should
 * not depend on where it is run.
 */
export function formatScore(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
}

/**
 * The score band: this life's total, the multiplier, and what the last thing you
 * did was worth.
 *
 * The award line is the part that has to earn its place. A number that silently
 * ticks up teaches nothing, so it names the three things a link is scored on —
 * how deep the dive committed, where in the boost window the release landed, and
 * how close it was to a compass marker. That doubles as the tuning readout while
 * the weights are being calibrated by playing, which is what they still need.
 *
 * Ages by simulation tick, not wall clock: a paused game must not quietly expire
 * the award it is showing.
 */
export function drawScore(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  score: ScoreState,
  snap: RenderSnapshot,
): void {
  const s = cam.scale;
  const cx = cam.offsetX + cam.designW * 0.5 * s;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // The score is the current life's. Showing what a death took, as the number to
  // beat, is the whole reason the reset reads as a cost rather than as a bug.
  if (score.best > (snap.ending.active && score.lastRun ? score.lastRun.score : score.bank)) {
    ctx.font = `${9 * s}px ui-monospace, monospace`;
    ctx.fillStyle = withAlpha(DUSK, 0.75);
    ctx.fillText(`BEST ${formatScore(score.best)}`, cx, cam.offsetY + SCORE.bestY * s);
  }

  // THE SEALED SCORE ONCE THE RUN IS OVER, not the live zero. `endLife` clears
  // `score` on the tick a run ends, so through every ending hold — and through
  // the whole victory ceremony, which lasts seconds — the largest number on
  // screen was reading 0. At the exact moment a player has just done the best
  // thing in the game. The same trap `lastRun` was added to close, walked into by
  // the one readout nobody thought to check.
  const shown = snap.ending.active && score.lastRun ? score.lastRun.score : score.bank;
  ctx.font = `600 ${24 * s}px ui-monospace, monospace`;
  ctx.fillStyle = withAlpha(INK, 0.92);
  ctx.fillText(formatScore(shown), cx, cam.offsetY + SCORE.y * s);

  const multY = cam.offsetY + SCORE.multY * s;
  if (score.multiplier > 1) {
    // Warms toward the ceiling, so a streak reads as heat rather than as a number
    // you have to compare against a maximum you cannot see.
    //
    // No longer recoloured for a bonus. The anomaly's window stopped touching the
    // multiplier when it became a charged window, so this number means exactly one
    // thing again: how long your chain of links is.
    const heat = Math.min(1, (score.multiplier - 1) / 4);
    const col = lerpColor([120, 210, 255], [255, 170, 60], heat);
    ctx.font = `600 ${12 * s}px ui-monospace, monospace`;
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillText(`x${score.multiplier.toFixed(2)}`, cx, multY);
  }

  // The charged window: a draining bar, because the window is the part of the
  // reward the player has to ACT on, and no colour can say how long is left.
  //
  // Read from the SNAPSHOT, not from the score. The window belongs to the
  // simulation now — it grants an ability rather than points — so the scorer does
  // not own it and must not be asked about it, or there would be two answers to
  // how much time is left.
  //
  // Drawn whatever the multiplier is doing. It used to be nested inside the
  // `multiplier > 1` branch because it was part of the multiplier's story; a
  // player who reaches an anomaly on a broken streak now still sees their window.
  //
  // Uncaptioned on purpose: the ship is arcing and the popups are this same
  // purple, so a word here would be a fourth cue saying what three already say.
  // See the note on `HOP_TALLY` in `accolade.ts`.
  if (snap.chargedFrac > 0) {
    const w = 64 * s;
    const h = 3 * s;
    const y = multY + 5 * s;
    ctx.fillStyle = withAlpha(AURORA, 0.22);
    ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = withAlpha(AURORA, 0.9);
    ctx.fillRect(cx - w / 2, y, w * snap.chargedFrac, h);
  }

  const a = score.lastAward;
  if (!a) {
    ctx.restore();
    return;
  }
  const age = snap.tick - a.tick;
  if (age < 0 || age > AWARD_TICKS) {
    ctx.restore();
    return;
  }
  // Hold, then fade over the last third.
  const fade = Math.min(1, Math.max(0, (AWARD_TICKS - age) / (AWARD_TICKS / 3)));
  ctx.globalAlpha = fade;

  const praise = praiseFor(a);
  const band = BAND[a.kind](a, praise);

  ctx.font = `600 ${15 * s}px ui-monospace, monospace`;
  // The band carries the same word as the popup beside the ship, so the two are
  // answering the same question in the same vocabulary.
  const named = praise ? `  ${praise.word}` : '';
  const awardY = cam.offsetY + SCORE.awardY * s;
  const head = `+${formatScore(a.points)}${band.mult}`;
  ctx.fillStyle = band.style.color;
  ctx.fillText(head + named, cx, awardY);

  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.fillStyle = band.style.labelColor;
  ctx.fillText(band.detail, cx, cam.offsetY + SCORE.detailY * s);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function pct(v: number): string {
  return String(Math.round(v * 100)).padStart(2, ' ');
}
