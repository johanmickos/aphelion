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
import { LEVEL, ROUTINE } from './accolade.ts';
import type { Camera } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';

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
 * for ten graduations to read as a scale.
 */
export const GAUGE = { x: 16, w: 15, h: 78, bottomGap: 44 } as const;

/**
 * The score band, top-centre.
 *
 * It is the only permanently visible number besides fuel, so it gets the middle
 * of the header and the readout was moved below it. A transient message yields to
 * a standing one, not the other way around.
 */
const SCORE = { bestY: 15, y: 34, multY: 49, awardY: 65, detailY: 77 } as const;

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
 * `REFUSAL_LINE` below is one: this WAS a two-way boolean, and when a third kind
 * arrived it fell through to the else branch and announced every grab in the
 * deduction colour, captioned as a penalty — the player told off for the capture
 * they had just made. Adding a kind now fails to compile until it has an entry.
 */
const BAND: Record<ScoreAward['kind'], (a: ScoreAward, p: Praise | null) => BandLine> = {
  grab: (a, p) => ({
    style: p ? LEVEL[p.level] : ROUTINE,
    // Arrival qualities only. The release has not happened yet, and reporting its
    // fields as zeroes would read as a bad release rather than an absent one.
    detail: `${a.body}  GRAB · CLOSE ${pct(a.close)}`,
    mult: a.multiplier > 1 ? `  x${a.multiplier.toFixed(2)}` : '',
  }),
  link: (a, p) => ({
    style: p ? LEVEL[p.level] : ROUTINE,
    detail: `${a.body}  PEAK ${pct(a.timing)} · AIM ${pct(a.aim)}`,
    mult: a.multiplier > 1 ? `  x${a.multiplier.toFixed(2)}` : '',
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

  const col =
    frac > 0.5
      ? lerpColor([84, 243, 154], [255, 210, 60], (1 - frac) / 0.5)
      : lerpColor([255, 210, 60], [255, 70, 90], (0.5 - frac) / 0.5);
  const low = frac <= 0.25;
  const flash = low ? 0.55 + 0.45 * Math.sin(timeMs / 110) : 1;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(gx - 3 * s, gy - 3 * s, gw + 6 * s, gh + 6 * s);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(gx, gy, gw, gh);

  const fillTop = gbot - gh * frac;
  ctx.globalAlpha = flash;
  ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
  ctx.fillRect(gx, fillTop, gw, gh * frac);
  ctx.globalAlpha = 1;

  // Graduations: full-width lines every 10%, drawn over the fill as well as the
  // empty track so the level reads against a scale rather than only as a bar.
  //
  // Two passes with opposite polarity, because a single colour cannot work for
  // both: light marks vanish against a bright fill, dark ones against the dark
  // track. The pass over the fill is deliberately faint — it should suggest the
  // scale continuing, not draw stripes across the colour.
  const drawTicks = (color: string, clipY: number, clipH: number): void => {
    if (clipH <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, clipY, gw, clipH);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      const y = gy + (gh * i) / 10;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + gw, y);
    }
    ctx.stroke();
    ctx.restore();
  };
  drawTicks('rgba(255,255,255,.08)', gy, fillTop - gy);
  drawTicks('rgba(0,0,0,.14)', fillTop, gbot - fillTop);

  ctx.strokeStyle = low ? `rgba(255,70,90,${flash})` : 'rgba(150,170,205,.5)';
  ctx.lineWidth = (low ? 2 : 1) * s;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(190,205,235,.7)';
  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.fillText('FUEL', gx + gw / 2, gy - 7 * s);
  ctx.fillStyle = low ? 'rgb(255,90,110)' : 'rgba(190,205,235,.75)';
  ctx.fillText(String(Math.round(snap.fuel)), gx + gw / 2, gbot + 14 * s);
  if (low) {
    ctx.fillStyle = `rgba(255,70,90,${flash})`;
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
 * Why a grab did nothing. A record rather than a ternary chain, so adding a way
 * to refuse a grab makes the compiler ask for its message instead of quietly
 * falling through to the wrong one.
 */
const REFUSAL_LINE: Record<Exclude<GrabResult, 'captured'>, ReadoutLine> = {
  'refused-crash-cone': { text: '✕ TOO LATE — crash course', color: '#ff5566', pulse: 1 },
  'refused-no-fuel': { text: '✕ TANK EMPTY — cannot grab', color: '#ff5566', pulse: 1 },
  'refused-out-of-range': { text: '✕ TOO FAR — get closer', color: '#8fb8e8' },
  'refused-no-body': { text: '✕ nothing in range', color: '#8595b0' },
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
        out.push({ text: '⚠ OUT OF FUEL — sailing past', color: '#ff5566', pulse: 1 });
      } else if (cap.overEscape > FLYBY_HARD) {
        out.push({ text: `⚡ TOO FAST — ${pct}% over`, color: '#ffb020', pulse: 1 });
        out.push({ text: 'holding costs a lot of fuel', color: '#c8a86a' });
      } else {
        out.push({ text: `BRAKING — ${pct}% over`, color: '#8fb8e8' });
      }
    } else if (!canCircularise) {
      out.push({ text: '⚠ LOW FUEL — will not round out', color: '#ff5566', pulse: 1 });
    }

    if (cap.boostFull > 1) {
      const arming = cap.boostT < sim.boostArmTime;
      const peak = Math.abs(cap.boostT - sim.boostArmTime) < 0.15;
      out.push(
        peak
          ? { text: '◀ BOOST PEAK — release!', color: '#b98cff', pulse: 1 }
          : arming
            ? { text: 'BOOST arming…', color: '#8595b0' }
            : { text: 'BOOST fading', color: '#8595b0' },
      );
    }
  } else {
    if (snap.fuel <= 0.5) {
      out.push({ text: '⚠ NO FUEL — recovering…', color: '#ff5566', pulse: 1 });
    }
    const g = snap.lastGrab;
    if (g && g.result !== 'captured' && snap.tick - g.tick < REFUSAL_TICKS) {
      out.push(REFUSAL_LINE[g.result]);
    }
  }

  if (snap.ending.active) {
    out.push(
      snap.ending.reason === 'impact'
        ? { text: '⚠ CRASHED', color: '#ffcd32' }
        : { text: '⚠ LOST — OFF COURSE', color: '#ff5566' },
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
    ctx.fillStyle = 'rgba(0,0,0,.45)';
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
  if (score.best > score.score) {
    ctx.font = `${9 * s}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(120,140,175,.75)';
    ctx.fillText(`BEST ${formatScore(score.best)}`, cx, cam.offsetY + SCORE.bestY * s);
  }

  ctx.font = `600 ${24 * s}px ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(214,228,250,.92)';
  ctx.fillText(formatScore(score.score), cx, cam.offsetY + SCORE.y * s);

  if (score.multiplier > 1) {
    // Warms toward the ceiling, so a streak reads as heat rather than as a number
    // you have to compare against a maximum you cannot see.
    const heat = Math.min(1, (score.multiplier - 1) / 4);
    const col = lerpColor([120, 210, 255], [255, 170, 60], heat);
    ctx.font = `600 ${12 * s}px ui-monospace, monospace`;
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillText(`x${score.multiplier.toFixed(2)}`, cx, cam.offsetY + SCORE.multY * s);
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
  ctx.fillStyle = band.style.color;
  // The band carries the same word as the popup beside the ship, so the two are
  // answering the same question in the same vocabulary.
  const named = praise ? `  ${praise.word}` : '';
  ctx.fillText(`+${formatScore(a.points)}${band.mult}${named}`, cx, cam.offsetY + SCORE.awardY * s);

  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.fillStyle = band.style.labelColor;
  ctx.fillText(band.detail, cx, cam.offsetY + SCORE.detailY * s);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function pct(v: number): string {
  return String(Math.round(v * 100)).padStart(2, ' ');
}
