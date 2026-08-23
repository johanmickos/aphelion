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
import { BURN_WORD, LEVEL, ROUTINE } from './accolade.ts';
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
export const FUEL_RAMP: readonly string[] = Object.freeze([
  '#FF465A', // empty
  '#FF7550',
  '#FFA346',
  '#FFD23C', // half
  '#C6DD5B',
  '#8DE87B',
  '#54F39A', // full
]);

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
  burn: (a) => ({
    // Always the default grey, word or not — the same rule the popup follows. A
    // burn's colour lives entirely in its word; the number is deliberately quiet.
    style: ROUTINE,
    // The peak, which is what the word was chosen on — reporting the integral
    // here would caption a word the number does not explain.
    detail: `${a.body}  BURN · HEAT ${pct(a.heat)}`,
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

  const low = frac <= FUEL_LOW_FRAC;
  const flash = low ? 0.55 + 0.45 * Math.sin(timeMs / 110) : 1;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.55)';
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
    //
    // Purple while an anomaly bonus is running, because `heat` SATURATES at the
    // streak ceiling: the bonus adds on top of that cap, so without this the one
    // gauge that shows the multiplier would show a boosted x7 and an unboosted x5
    // in exactly the same colour. The colour is a state — bonus live — not a
    // rarity, so it stays out of the accolade ladder.
    const heat = Math.min(1, (score.multiplier - 1) / 4);
    const col = score.bonusActive
      ? [206, 150, 255]
      : lerpColor([120, 210, 255], [255, 170, 60], heat);
    // Bigger while boosted, not only recoloured. Reported as "the bonus and
    // multiplier weren't very obvious": a 12px readout that changes hue is easy
    // to miss on a phone in the middle of flying, and the boost is the largest
    // thing that has ever happened to this number.
    const size = score.bonusActive ? 17 : 12;
    ctx.font = `600 ${size * s}px ui-monospace, monospace`;
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    const multY = cam.offsetY + SCORE.multY * s;
    ctx.fillText(`x${score.multiplier.toFixed(2)}`, cx, multY);

    if (score.bonusActive) {
      // A draining bar, because the window is the part of the reward the player
      // has to ACT on and a colour cannot say how long is left. Ten seconds is
      // long enough that "is it still running?" is a real question mid-flight.
      const w = 64 * s;
      const h = 3 * s;
      const y = multY + 5 * s;
      ctx.fillStyle = 'rgba(206,150,255,.22)';
      ctx.fillRect(cx - w / 2, y, w, h);
      ctx.fillStyle = 'rgba(214,164,255,.9)';
      ctx.fillRect(cx - w / 2, y, w * score.bonusFrac, h);
    }
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
  if (praise?.category === 'burn') {
    // Two runs, because a burn's word is ember and its number is not — and the
    // popup does exactly the same split. One centred string in one colour would
    // put the band and the popup on different rules again, which is the drift
    // `accolade.ts` exists to prevent.
    //
    // Laid out from the left edge of the whole line so the pair stays centred as
    // a unit; centring each run separately would slide them apart.
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    const x0 = cx - ctx.measureText(head + named).width / 2;
    ctx.fillStyle = band.style.color;
    ctx.fillText(head, x0, awardY);
    ctx.fillStyle = BURN_WORD.color;
    ctx.fillText(named, x0 + ctx.measureText(head).width, awardY);
    ctx.textAlign = prevAlign;
  } else {
    ctx.fillStyle = band.style.color;
    ctx.fillText(head + named, cx, awardY);
  }

  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.fillStyle = band.style.labelColor;
  ctx.fillText(band.detail, cx, cam.offsetY + SCORE.detailY * s);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function pct(v: number): string {
  return String(Math.round(v * 100)).padStart(2, ' ');
}
