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
 * THE COLOUR IS OFF THE RARITY LADDER. See `PEARL` in `palette.ts`: a signature
 * has no better or worse, only different, so there is nothing for a rank colour to
 * encode. What it gets instead is a treatment nothing else in the game has.
 */
import type { Mote, Signature } from '../sim/types.ts';
import type { Camera } from './camera.ts';
import type { Ceremony } from './ceremony.ts';
import { FINISH, PEARL, PEARL_SHEEN, withAlpha } from './palette.ts';

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
const HANG = 16;

/**
 * The tallest the drawing may be, as a fraction of the view.
 *
 * The ship sits at 0.72 and this reaches to 0.95, which is the whole of what is
 * left below it: the ceremony suppresses the gauge, the readout and the notice, so
 * the bottom of the screen is empty for the first time in the run. Height is the
 * binding constraint on almost every real signature — the carpet is 560px deep and
 * rarely more than 300 wide — so this number is most of how big the drawing is.
 */
const MAX_H_FRAC = 0.23;

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
 */
const X_GAIN = 2;

/**
 * Seconds for the sheen to travel the whole line, and the fraction of the line it
 * covers at any moment.
 *
 * Slow, and short. A fast highlight reads as a loading bar and a long one reads as
 * the line simply being bright; what mother-of-pearl actually does is throw a
 * narrow band of colour that moves when you tilt it, so this is a narrow band that
 * moves. It repeats rather than firing once, because the ceremony holds until the
 * player dismisses it and a one-shot would be missed by anyone still reading the
 * sheet.
 */
const SHEEN_SECS = 2.6;

const SHEEN_SPAN = 0.16;

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
 * The scale is then whatever keeps the whole picture on screen: the height budget,
 * and the room left on each side of the anchor. Solving for the room on EACH SIDE
 * separately is what lets the anchor stay exact — a symmetric width budget would
 * have to give the anchor up the moment a line finished off-centre, which is the
 * common case, since where you cross is where you crossed.
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
  const roomH = cam.viewH * MAX_H_FRAC * s;
  const roomL = shipX - (cam.offsetX + INSET * s);
  const roomR = cam.offsetX + (cam.designW - INSET) * s - shipX;

  let k = roomH / depth;
  let kx = k * X_GAIN;
  // Room on EACH SIDE of the anchor rather than a symmetric width budget: that is
  // what lets the anchor stay exact when a line finishes off-centre, which is the
  // common case, since where you cross is where you crossed.
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

/** The sheen's tint at a given phase, cycling through the three pearl stops. */
function sheenTint(phase: number): string {
  const n = PEARL_SHEEN.length;
  const u = ((phase % 1) + 1) % 1;
  const i = Math.floor(u * n) % n;
  const a = PEARL_SHEEN[i]!;
  const b = PEARL_SHEEN[(i + 1) % n]!;
  const f = u * n - Math.floor(u * n);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(
    a[1] + (b[1] - a[1]) * f,
  )},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

/** Trace the whole path, ready to stroke. */
function tracePath(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  pts: readonly { x: number; y: number }[],
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = place(fit, pts[i]!.x, pts[i]!.y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

/**
 * Draw the signature, or nothing when there is none to draw.
 *
 * `alpha` rides the sheet's fade rather than the warp's, so the line and the
 * numbers arrive together — they are two halves of one report, and staggering them
 * would make the second one read as an afterthought.
 */
export function drawSignature(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
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
  ctx.lineJoin = 'round';

  // ---- the dots, under the line
  //
  // Taken ones filled, missed ones hollow — the same two states the carpet itself
  // draws, so the picture reads the same way it did while it was being flown.
  // Under the line because a taken dot should look threaded onto it.
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

  // ---- the line: a soft body, then a bright core
  //
  // Two strokes rather than a shadow blur. The bloom is what stops a one-pixel
  // line from disappearing over the gold wash behind it, and `shadowBlur` costs a
  // full-canvas filter per frame for a look this gets from a wide translucent
  // stroke under a narrow opaque one.
  tracePath(ctx, fit, sig.pts);
  ctx.strokeStyle = withAlpha(PEARL, 0.16);
  ctx.lineWidth = Math.max(2, 5 * s);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(PEARL, 0.8);
  ctx.lineWidth = Math.max(1, 1.6 * s);
  ctx.stroke();

  // ---- the sheen
  //
  // A short bright window travelling from the oldest end to the newest — the
  // direction the ship flew — clipped out of the same path so it follows every
  // bend exactly. Its tint drifts through the three pearl stops as it goes, which
  // is the whole of the mother-of-pearl idea: the colour depends on where the
  // light is, not on what the line is worth.
  const phase = (cer.t % SHEEN_SECS) / SHEEN_SECS;
  const head = phase * (1 + SHEEN_SPAN);
  const n = sig.pts.length - 1;
  const from = Math.max(0, Math.floor((head - SHEEN_SPAN) * n));
  const to = Math.min(n, Math.ceil(head * n));
  if (to - from >= 1) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const p = place(fit, sig.pts[i]!.x, sig.pts[i]!.y);
      if (i === from) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    // Additive, so the crest reads as light passing over the line rather than as a
    // differently-coloured piece of it.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = sheenTint(phase * 1.7);
    ctx.globalAlpha = alpha * 0.55;
    ctx.lineWidth = Math.max(1.2, 2.4 * s);
    ctx.stroke();
  }

  ctx.restore();
}
