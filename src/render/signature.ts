/**
 * The carpet signature: the line the player drew through the run-in, shown once
 * the field is cleared.
 *
 * WHAT IT IS. `stepSim` records the ship's path while it is inside the run-in
 * band — see `Signature` in `src/sim/types.ts` — and this draws it, anchored to
 * the frozen ship, once the ceremony is up. The path is a pure function of
 * `(config, seed, inputLog)` like everything else the simulation produces, so two
 * players who fly the same line get the same picture and a replay reproduces the
 * one that was shown. That is what makes it a signature rather than a decoration:
 * it is evidence.
 *
 * WHY IT HANGS BELOW THE SHIP AND NOT IN A PANEL. `docs/IDEAS.md` raised it as
 * something for the results sheet and then noted the problem: the sheet is five
 * rows, a headline and a subtitle in the top fifth of the screen, and there is no
 * room. But the sheet was never the right place anyway. The ceremony freezes the
 * ship low — `ceremonyShipPos` puts it at 0.72 of the height precisely so the
 * numbers can have the top — which leaves the bottom quarter of the screen empty
 * and directly underneath the thing the line was drawn by. Hung there, with its
 * newest end touching the hull, it needs no caption at all: it is visibly the
 * wake of the ship it is attached to, at a scale where the whole of it fits.
 *
 * WHY IT IS NOT DRAWN IN WORLD SPACE. The obvious implementation is to leave the
 * path where it happened and let the camera show it. It does not work: the world
 * RECEDES during the ceremony — the whole point of the warp is that the field
 * falls away — so the signature would slide off the bottom of the screen within a
 * second of being finished, and it would be drawn at whatever size the corridor
 * happens to be, which is far wider than the shape inside it. This is a portrait
 * of the path, fitted to the space, not a view of where it was.
 *
 * IT IS DRAWN AS THE WAKE, NOT BESIDE IT. The first version was a stroked pearl
 * polyline, and on a phone that put TWO wakes on the ceremony at two different
 * scales: the live `Trail` streaking at full world size around the frozen ship,
 * and a thin line at a fifteenth of that underneath it. Reported as exactly that.
 *
 * The fix is not to hide one of them, it is to notice they are the same object.
 * The signature IS the ship's wake — the whole of it rather than the last sixteen
 * points — so it takes the wake's own vocabulary: `trailColor` mapping speed to
 * hue, radius and brightness climbing toward the head, and a pulse travelling down
 * it. `SignaturePoint.speed` exists for this. The live trail then cross-fades out
 * as this comes in, so there is exactly one wake on screen at every moment and it
 * grows from the last half second into the entire run-in.
 *
 * WHICH IS ALSO WHY THERE IS NO COLOUR OF ITS OWN ANY MORE. A pearl white was
 * chosen when this was a separate object that needed to mean "unique artifact";
 * as the wake it inherits a ramp that already means something — how fast you were
 * going — and inventing a second meaning on top of that would be the thing
 * `accolade.ts` spends its header warning about.
 */
import type { Mote, Signature, SignaturePoint } from '../sim/types.ts';
import type { Camera } from './camera.ts';
import type { Ceremony } from './ceremony.ts';
import type { RenderConfig } from './config.ts';
import { trailColor } from './ship.ts';
import { FINISH, withAlpha } from './palette.ts';

/**
 * Fewest points worth drawing.
 *
 * Two is a straight line and says nothing; four is the shortest thing that can
 * have a bend in it. Below that the ship crossed the carpet without ever turning,
 * and drawing a vertical stroke under it would claim a signature where there was
 * none.
 */
const MIN_POINTS = 4;

/** Design units below the hull the newest end of the line is pinned to. */
const HANG = 12;

/**
 * Design units of the window's bottom the drawing stays out of.
 *
 * A CLEARANCE, NOT A FRACTION OF THE HEIGHT, because what it is clearing is a fixed
 * thing: the DOM control row — TUNE, RESET, DEBUG, the flag — which sits 12px off
 * the bottom and stands about 33 tall in CSS pixels regardless of the viewport. A
 * fraction gets that right on one device and wrong on the next, and it was wrong on
 * the phone this was first looked at: the design window is 844 tall but `viewH` on
 * a 393x651 handset works out at 646, so a budget measured in fractions ran the
 * signature straight through the buttons.
 */
const BOTTOM_CLEARANCE = 52;

/** Design units of clearance the drawing keeps from each side of the window. */
const INSET = 20;

/**
 * How much wider than tall the drawing is scaled, relative to the real path.
 *
 * A GAIN, NOT A FIT, and the difference is the whole reason this is honest. The
 * carpet is 560px deep and a hard carve moves the ship maybe 200 across it, so a
 * true-to-scale portrait is a 3-to-1 sliver in which an idle crossing and a flown
 * one look nearly the same — the axis carrying all the information is the one with
 * almost no room. Every instrument that draws a trace against a fixed sweep has
 * the same problem and the same answer: a seismograph and an ECG both amplify the
 * signal axis and leave the sweep alone.
 *
 * A FIXED number rather than one fitted to the width available, which was the
 * first version and is the version that lies. Stretching each signature to fill
 * the space makes every one of them equally wide, so a straight line drawn by a
 * player who never pressed comes out looking like a carve. At a constant gain the
 * picture is a uniform scale of the real path in both axes, so two runs are still
 * comparable and a bigger swing is still a bigger picture.
 *
 * When the width constraint does bite — a line that hit both bumpers — BOTH axes
 * shrink together rather than the gain being reduced, for the same reason.
 *
 * 2 -> 3 once the height was measured on a real handset rather than assumed. The
 * design window is 844 tall but `viewH` on a 393x651 phone works out at 646, and
 * the strip left between the hull and the control row is about 125 design px
 * against a carpet 840 deep — so the vertical is compressed nearly sevenfold while
 * the horizontal was using barely a third of the width it had. The gain is what
 * spends that width, and it is the axis the player controls.
 */
const X_GAIN = 3;

/**
 * The pulse that travels down the wake, in the trail's own terms.
 *
 * `Trail.draw` runs `0.5 + 0.5*sin((warpT*9 - f*7)*PI)` during the ceremony, which
 * sends a crest away from the ship because `f` is 1 at the head. The same numbers
 * are used here so the two read as one object while they are cross-fading, rather
 * than as a slow thing dissolving into a fast one.
 */
const PULSE_RATE = 9;

const PULSE_WAVES = 7;

/**
 * How long the streak each point throws is, at the crest of the pulse.
 *
 * ALONG THE CURVE, WHERE THE TRAIL'S GO STRAIGHT DOWN, and the difference is
 * argued rather than accidental. `Trail.draw` streaks its sparks down the screen
 * because they belong to the motion of the streaming field — its own comment says
 * so. Nothing streams here: this is a portrait of a path, held still, and a
 * downward smear across it would bury the one thing it exists to show. Tangent to
 * the line is where a streak on a still picture of a line belongs.
 */
const STREAK = 9;

/** Where a world point lands on screen, under the fit computed below. */
interface Fit {
  /** Vertical scale: screen px per world px. */
  k: number;
  /** Horizontal scale — `k * X_GAIN`, unless the width forced both down. */
  kx: number;
  ax: number;
  ay: number;
}

function place(fit: Fit, x: number, y: number): { x: number; y: number } {
  return { x: fit.ax + x * fit.kx, y: fit.ay + y * fit.k };
}

/**
 * Fit the path — and the dots it was flown among — into the space under the ship.
 *
 * ANCHORED AT THE NEWEST POINT, NOT CENTRED. The last thing recorded is the
 * crossing, which is where the ship now is, so pinning that end to the hull is
 * what makes the drawing read as attached rather than as a diagram placed nearby.
 * Everything else falls where the scale puts it.
 *
 * The scale is then whatever keeps the whole picture on screen: the height left
 * between the hull and the control row, and the room on each side of the anchor.
 * Solving for the room on EACH SIDE separately is what lets the anchor stay exact —
 * a symmetric width budget would have to give the anchor up the moment a line
 * finished off-centre, which is the common case, since where you cross is where
 * you crossed.
 *
 * Returns null when there is nothing to fit.
 */
function fitTo(
  cam: Camera,
  pts: readonly { x: number; y: number }[],
  motes: readonly Mote[],
  shipX: number,
  shipY: number,
): Fit | null {
  const last = pts[pts.length - 1];
  if (!last) return null;

  let minX = last.x;
  let maxX = last.x;
  let maxY = last.y;
  const eat = (p: { x: number; y: number }): void => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const p of pts) eat(p);
  // The dots are part of the picture — a taken one is a mark ON the line and a
  // missed one is a gap beside it — so a dot outside the path's own extent still
  // has to fit, or the drawing would report a clean sweep by cropping the misses.
  for (const m of motes) eat(m);

  const s = cam.scale;
  const depth = maxY - last.y;
  if (depth <= 1) return null;

  const anchorY = shipY + HANG * s;
  const floor = cam.offsetY + (cam.viewH - BOTTOM_CLEARANCE) * s;
  const roomH = floor - anchorY;
  const roomL = shipX - (cam.offsetX + INSET * s);
  const roomR = cam.offsetX + (cam.designW - INSET) * s - shipX;
  if (roomH <= 0) return null;

  let k = roomH / depth;
  let kx = k * X_GAIN;
  const spanL = last.x - minX;
  const spanR = maxX - last.x;
  let squeeze = 1;
  if (spanL > 1) squeeze = Math.min(squeeze, Math.max(0, roomL) / (spanL * kx));
  if (spanR > 1) squeeze = Math.min(squeeze, Math.max(0, roomR) / (spanR * kx));
  if (squeeze < 1) {
    // Both axes, so the gain is a constant of the drawing and two signatures stay
    // comparable. See `X_GAIN`.
    k *= squeeze;
    kx *= squeeze;
  }
  if (!(k > 0)) return null;

  return { k, kx, ax: shipX - last.x * kx, ay: anchorY - last.y * k };
}

/** One point of the wake, in the treatment `Trail.draw` gives its own. */
function drawPoint(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  cam: Camera,
  rcfg: RenderConfig,
  pts: readonly SignaturePoint[],
  i: number,
  t: number,
): void {
  const p = pts[i]!;
  const n = pts.length;
  const s = cam.scale;
  const f = i / (n - 1 || 1); // 0 at the tail, 1 at the head
  const { trailSpeedCalm: calm, trailSpeedHot: hot } = rcfg;
  const heat = Math.max(0, Math.min(1, (p.speed - calm) / Math.max(1, hot - calm)));
  const base = trailColor(heat);
  const at = place(fit, p.x, p.y);

  // The crest travels away from the ship, because `f` is 1 at the head — the same
  // sign and the same rate `Trail.draw` uses, so the two agree while they are
  // cross-fading rather than reading as a slow thing dissolving into a fast one.
  const wave = 0.5 + 0.5 * Math.sin((t * PULSE_RATE - f * PULSE_WAVES) * Math.PI);
  const peak = trailColor(1);
  const cr = Math.round(base[0] + (peak[0] - base[0]) * wave * 0.6);
  const cg = Math.round(base[1] + (peak[1] - base[1]) * wave * 0.6);
  const cb = Math.round(base[2] + (peak[2] - base[2]) * wave * 0.6);

  // THE TAPER IS GENTLER THAN THE TRAIL'S, and it has to be. `Trail.draw` runs its
  // alpha from 0.08 to 0.58 across a wake half a second long, where the fade means
  // "this is a moment old". Across a whole run-in that same curve puts the first
  // two thirds of the signature under a fifth of full — fading out precisely the
  // early carving, which is the part that was hardest to fly.
  const alpha = (0.3 + 0.35 * f) * (0.75 + 0.35 * heat) * (0.55 + 0.45 * wave);
  const rad = (0.9 + (1.6 + 1.2 * heat) * f) * s;
  const paint = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;

  // A streak at the crest of the pulse, a dot everywhere else. The direction comes
  // from the NEIGHBOURING POINT rather than from the ship's velocity: the drawing
  // is scaled anisotropically, so the heading the ship actually flew is not the
  // direction this picture runs in. See `STREAK` for why it follows the curve at
  // all where the trail's go straight down.
  const streak = STREAK * wave * f * s;
  if (streak > 1) {
    const nb = pts[i + 1] ?? pts[i - 1] ?? p;
    const to = place(fit, nb.x, nb.y);
    const dx = to.x - at.x;
    const dy = to.y - at.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      ctx.strokeStyle = paint;
      ctx.lineWidth = Math.max(0.8, rad * 1.6);
      ctx.beginPath();
      ctx.moveTo(at.x - (dx / len) * streak * 0.5, at.y - (dy / len) * streak * 0.5);
      ctx.lineTo(at.x + (dx / len) * streak * 0.5, at.y + (dy / len) * streak * 0.5);
      ctx.stroke();
      return;
    }
  }
  ctx.fillStyle = paint;
  ctx.beginPath();
  ctx.arc(at.x, at.y, rad, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw the signature, or nothing when there is none to draw.
 *
 * `alpha` rides the sheet's fade rather than the warp's, so the line and the
 * numbers arrive together — they are two halves of one report, and staggering them
 * would make the second one read as an afterthought. `Scene` fades the LIVE trail
 * out on the same number, which is what keeps it to one wake.
 */
export function drawSignature(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rcfg: RenderConfig,
  cer: Ceremony,
  sig: Signature,
  motes: readonly Mote[],
  shipX: number,
  shipY: number,
  alpha: number,
): void {
  if (alpha <= 0.005 || sig.pts.length < MIN_POINTS) return;
  const fit = fitTo(cam, sig.pts, motes, shipX, shipY);
  if (!fit) return;

  const s = cam.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';

  // ---- the dots, under the wake
  //
  // Taken ones filled, missed ones hollow — the same two states the carpet itself
  // draws, so the picture reads the same way it did while it was being flown.
  // Under the wake because a taken dot should look threaded onto it.
  for (const m of motes) {
    const p = place(fit, m.x, m.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (m.taken ? 2.6 : 2) * s, 0, Math.PI * 2);
    if (m.taken) {
      ctx.fillStyle = withAlpha(FINISH, 0.95);
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(FINISH, 0.3);
      ctx.lineWidth = Math.max(0.8, 1 * s);
      ctx.stroke();
    }
  }

  for (let i = 0; i < sig.pts.length; i++) {
    drawPoint(ctx, fit, cam, rcfg, sig.pts, i, cer.t);
  }

  ctx.restore();
}
