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
import type { Mote, Signature } from '../sim/types.ts';
import type { Camera } from './camera.ts';
import type { Ceremony } from './ceremony.ts';
import type { RenderConfig } from './config.ts';
import { drawWakePoint } from './ship.ts';
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
 * Design units of drawn path between one point of the ribbon and the next.
 *
 * The curve itself, at the density that makes it a line rather than beads. Walked
 * by DRAWN distance rather than by index, because the fit is anisotropic — equal
 * steps along the recorded path bunch up wherever the ship was climbing straight.
 */
const RIBBON_GAP = 2;

/**
 * How big a ribbon point is, against what `drawWakePoint` would draw at full size.
 *
 * A DENSITY COMPENSATION, and it is the honest use of that parameter: `scale` is
 * "how big is a point here", and a ribbon laid five times denser than a wake wants
 * points five times smaller or it stops being a line and becomes a row of beads.
 * At full size it drew exactly that — reported as the signature not looking like
 * the trail at all, because at warp the trail draws NO dots and this was mostly
 * dots.
 */
const RIBBON_SCALE = 0.45;

/**
 * Design units between the SPARKS — the long streaks, drawn over the ribbon.
 *
 * TWO PASSES THROUGH ONE RENDERER, AND THE REASON IS DENSITY, NOT STYLE. The
 * question is how many streaks land in a BUNDLE, which is what the curtain is made
 * of: `drawWakePoint`'s wave cycles three and a half times over a wake, so the
 * sparks come in clusters separated by stretches where the length falls to nothing.
 * `Trail` puts about four streaks in each of those clusters.
 *
 * Both failures were failures of that count. Streaking every one of the signature's
 * 380 points put eighty in a cluster and they merged into a solid vertical blob
 * with no shape left in it. At 26 units there were eight streaks in the WHOLE
 * signature — under one per cluster — which is a few stray whiskers rather than a
 * curtain, and was reported as exactly that: "there look to be SOME starlight
 * streaks, but it's not really the same curtain effect."
 *
 * 10 puts roughly five in a cluster, which is the trail's own figure. Measured by
 * rendering the alternatives side by side, which is the only way to measure this.
 */
const SPARK_GAP = 10;

/**
 * Where the signature's own `f` starts, instead of 0.
 *
 * `f` is the trail's position-in-wake, and everything hangs off it: size,
 * brightness, and how long a spark is. At 0 the tail is 8% alpha and throws no
 * streak at all, which is right for a wake half a second long — the fade means
 * "this is a moment old". Across a whole run-in it fades out the early carving,
 * which is the part that was hardest to fly and the most individual thing in the
 * picture.
 *
 * Remapping the range is how that is fixed WITHOUT forking the renderer: the whole
 * signature is treated as the newer two thirds of a wake, so it keeps the trail's
 * exact curve and simply never reaches the invisible end of it.
 */
const F_FLOOR = 0.34;

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
  // The clearance plus the streak the TAIL throws, which hangs below the lowest
  // point of the path itself: `drawWakePoint` streaks downward and the tail sits at
  // `F_FLOOR`, so it reaches `31 * F_FLOOR` design units past where the fit ends.
  // Left out, the sparks are what land on the buttons instead of the line.
  const floor = cam.offsetY + (cam.viewH - BOTTOM_CLEARANCE - 31 * F_FLOOR) * s;
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

  // ---- the wake, through the trail's own renderer
  //
  // `drawWakePoint` is the trail's per-point drawing, extracted rather than copied:
  // same speed ramp, same pulse, same sparks at warp. What differs is only what a
  // point is and where it lands — see `SPARK_GAP` for the density and `F_FLOOR` for
  // the one remap.
  //
  // Walked by DRAWN distance rather than by index, so the spacing is even on the
  // picture instead of on the path: the fit is anisotropic and compresses the
  // vertical far harder than the horizontal, so equal steps along the recorded line
  // would bunch the sparks up wherever the ship was climbing straight.
  // ---- the wake, through the trail's own renderer, twice
  //
  // `drawWakePoint` is the trail's per-point drawing, extracted rather than copied:
  // same speed ramp, same pulse, same sparks at warp. Called once densely and small
  // with the warp OFF, which draws the curve, and once sparsely and full-size with
  // it ON, which hangs the curtain over it. See `SPARK_GAP` for why that is two
  // passes and not one, and `RIBBON_SCALE` for why the first is small.
  const wake = (gapUnits: number, warp: number, sizeMul: number): void => {
    const gap = gapUnits * s;
    const n = sig.pts.length;
    let last: { x: number; y: number } | null = null;
    for (let i = 0; i < n; i++) {
      const p = sig.pts[i]!;
      const at = place(fit, p.x, p.y);
      const head = i === n - 1;
      if (!head && last) {
        const dx = at.x - last.x;
        const dy = at.y - last.y;
        if (dx * dx + dy * dy < gap * gap) continue;
      }
      last = at;
      drawWakePoint(ctx, rcfg, at.x, at.y, {
        f: F_FLOOR + (1 - F_FLOOR) * (i / (n - 1 || 1)),
        speed: p.speed,
        scale: s * sizeMul,
        warp,
        // The ceremony's own clock, so the pulse running down the signature is in
        // step with the one running down the live trail while they cross-fade.
        warpT: cer.t,
      });
    }
  };
  wake(RIBBON_GAP, 0, RIBBON_SCALE);
  // The ceremony's own warp, so the signature streaks for exactly as long as the
  // sky does. It arrives after the warp is full, so in practice this is 1.
  wake(SPARK_GAP, cer.warp, 1);

  ctx.restore();
}
