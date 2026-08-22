/**
 * Camera: world units -> screen pixels, with letterboxing.
 *
 * The simulation is viewport-blind (src/sim/world.ts). Everything about pixels
 * lives here.
 *
 * The design window is 390x844 — the prototype's framing, and the resolution the
 * feel was tuned at. The playfield is wider (468), so the camera pans
 * horizontally to keep the ship on screen, exactly as the prototype did. Sizing
 * the window to the full field instead would cost ~70px of dead letterbox on
 * every phone; panning costs nothing.
 *
 * The window is scaled to fit and centred, with bars filling any excess, so every
 * device sees exactly the same slice of world. Portrait-only by design.
 */
import type { Body } from '../sim/types.ts';
import type { RenderConfig } from './config.ts';

/**
 * The visible world height is allowed to float between these, so the window can
 * fill the screen width on any portrait phone without bars.
 *
 * A vertical climb cares about horizontal framing — field width, planet spacing,
 * where the boundaries sit — far more than about how far ahead you can see. So
 * width is fixed and height flexes. The bounds stop a tablet or a landscape
 * screen from zooming in so far that you fly blind.
 */
export const MIN_VIEW_H = 620;
export const MAX_VIEW_H = 1000;

export interface Viewport {
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
}

export interface Camera {
  /** Uniform world->screen scale. */
  scale: number;
  /** Screen-space offset of the design window's top-left (the letterbox bars). */
  offsetX: number;
  offsetY: number;
  /** World x mapped to the design window's left edge. */
  left: number;
  /** World y mapped to the design window's vertical centre. */
  centerY: number;
  /** Fixed world width of the window. Never varies — framing depends on it. */
  designW: number;
  /** Visible world height. Flexes with the viewport's aspect ratio. */
  viewH: number;

  /**
   * How much the view is currently locked to the body being orbited, 0..1.
   *
   * Eased rather than switched, and that is the whole design. Snapping the
   * subject from the ship to the anchor at the grab lurched the view across up to
   * `grabRange` — the anchor is furthest away exactly when the capture begins.
   * The weight instead rises with how settled the orbit is, so it only reaches
   * full once the ship is a settled radius from the anchor and the two are nearly
   * the same point. What was a jump becomes nothing to see.
   */
  anchorW: number;
  /**
   * The last body orbited, held after the capture ends so `anchorW` has something
   * to decay away from rather than snapping the subject back to the ship.
   */
  anchorX: number;
  anchorY: number;
}

export function createCamera(cfg: RenderConfig): Camera {
  return {
    scale: 1,
    offsetX: 0,
    anchorW: 0,
    anchorX: 0,
    anchorY: 0,
    offsetY: 0,
    left: 0,
    centerY: 0,
    designW: cfg.designW,
    viewH: MIN_VIEW_H,
  };
}

/**
 * Fit the window to a viewport.
 *
 * Fills the width exactly, so a portrait phone gets no bars at all — previously
 * a 393x651 viewport was pillarboxed by ~46px a side, because a fixed 390x844
 * window is a taller aspect than a browser with visible chrome.
 *
 * The visible world height then follows from the aspect ratio, clamped so an
 * unusual screen cannot zoom in until nothing is visible ahead. Only when the
 * clamp engages do bars appear.
 */
export function fitCamera(cam: Camera, vp: Viewport): void {
  let scale = vp.w / cam.designW;
  let viewH = vp.h / scale;
  if (viewH < MIN_VIEW_H) {
    viewH = MIN_VIEW_H;
    scale = vp.h / viewH;
  } else if (viewH > MAX_VIEW_H) {
    viewH = MAX_VIEW_H;
    scale = vp.h / viewH;
  }
  cam.scale = scale;
  cam.viewH = viewH;
  cam.offsetX = (vp.w - cam.designW * scale) / 2;
  cam.offsetY = (vp.h - viewH * scale) / 2;
}

/**
 * Where the camera would like to sit, given the ship. Pure.
 *
 * A true deadzone: the camera stays exactly where it is unless the ship leaves
 * the margins, and then moves only enough to bring it back to one.
 *
 * The obvious alternative — default the target to "centred" — oscillates. Pan to
 * bring the ship inside the margin, and the ship is now inside, so the target
 * snaps back to centre, so the camera pans the other way until the ship leaves
 * the margin again. That limit cycle reads as the view wobbling left and right
 * while flying straight, and it gets worse the wider the field is.
 */
export function cameraTarget(
  cam: Camera,
  cfg: RenderConfig,
  shipX: number,
  shipY: number,
  field: { left: number; right: number; width: number },
  floorY: number | null,
  /** Ship velocity, for the look-ahead. Zero disables it. */
  shipVX = 0,
  /**
   * How far past a barrier the view may reach, in px — see `barrierRelax`.
   *
   * Zero everywhere the barrier is real. Inside an anomaly's bubble it opens over
   * the 150px BEFORE the wall, which is what lets the camera be already moving
   * when the ship crosses instead of pinned against a line it is about to pass.
   * Without it the view held still, then had to match the ship's speed in one
   * tick: measured at 1137px/s of camera jerk, reported as a jagged crossing.
   */
  relax = 0,
  /**
   * The orbit is frozen — `settle` or `orbit` — so `shipVX` is the phase clock's
   * circular velocity and NOT a heading.
   *
   * Separate from the lock weight, and the separation is the whole point. The
   * weight says what to look AT, and is deliberately zero through the settle so
   * the oval keeps its bounce. This says whether velocity MEANS anything. Once an
   * orbit is frozen it does not: vx reverses every half orbit, measured at
   * +397 -> -285 -> +137 -> -207 across one settle. Anything steering off it
   * swings the view left and right in time with the orbit — reported exactly that
   * way, and caused by gating the look-ahead on the lock weight instead, which
   * unhooked it the moment the settle stopped being locked.
   *
   * NOT the whole capture. Through `clear` and `flyby` the ship is on real
   * physics with a real heading, and suppressing the lead there put a 110px lurch
   * into the dive.
   */
  frozen = false,
): { left: number; centerY: number } {
  const W = cam.designW;
  const margin = W * cfg.cameraMarginFrac;

  // Blend between the ship and the body it is orbiting, by `cam.anchorW`.
  //
  // A SETTLED orbit is the only thing this is for. There the ship goes round a
  // still point and following it put a 129px vertical oscillation through a 0.33s
  // lag — over half its own 0.6s period, too slow to track and with no vertical
  // deadzone to ignore it, so all it could do was smear. Everywhere else the
  // ship-following camera is the good one: the dive is the exciting part and it
  // should be flown, not watched.
  //
  // Because the ship orbits at radius r, the subject's residual wobble is
  // r * (1 - anchorW) — full at 0, gone at 1, and continuous in between. There is
  // no mode to switch and therefore no moment at which anything can jump.
  const w = cam.anchorW;
  const subjX = shipX + (cam.anchorX - shipX) * w;
  const subjY = shipY + (cam.anchorY - shipY) * w;

  // Look where you are going, not where you have been. Off entirely while
  // captured — see `captured` above; there is no "going" to look toward when the
  // heading comes back round every orbit.
  const lead = frozen ? 0 : velocityLead(cfg, shipVX);
  const look = W * cfg.cameraLookAhead * lead;
  const want = subjX + look;

  let left = cam.left;
  if (want - left > W - margin) left = want - (W - margin);
  else if (want - left < margin) left = want - margin;

  // Centre a locked subject, by the same weight. The deadzone exists because
  // defaulting to centred oscillates — pan the ship inside the margin and the
  // target snaps back to centre, which pans the other way — but that argument is
  // about a subject that MOVES. A locked anchor does not, so centring on it
  // converges instead of cycling, and the deadzone's own reason to exist lapses.
  //
  // Without this an orbited body sat at the margin rather than in the middle of
  // the window, which is not what "the view is locked to it" should look like.
  if (w > 0) left += (subjX - W / 2 - left) * w;

  // Two rules, and which one yields is the whole of it.
  //
  //   the field   the view may not show dead space beyond a barrier
  //   framing     the ship may not leave the window
  //
  // Inside the corridor they agree and the field rule binds, exactly as before.
  // Out at an anomaly they cannot both hold — the ship is legitimately past the
  // barrier — and framing wins, because a view with the ship missing is worse
  // than a view with some black in it.
  //
  // Written as an intersection rather than an `if (outside)`, because the switch
  // was measured at 1137px/s of camera jerk crossing the boundary: the field rule
  // let go all at once and the target moved 86px in a tick. Here the binding bound
  // is `shipX - edge`, which slides with the ship, so the handover is continuous
  // and there is nothing to cross.
  //
  // Framing is expressed on the WINDOW, not the deadzone's margins. Using margins
  // made this fight the orbit lock: `shipX - margin` orbits with the ship, so it
  // dragged a stationary camera 83px back and forth around an anomaly.
  // The framing bound's edge RAMPS with how far outside the ship actually is,
  // rather than switching on at the boundary. At zero it degenerates to "the ship
  // must be on screen at all", which the field rule already satisfies everywhere
  // inside the corridor — so inside, the field rule simply wins and no dead space
  // is ever shown. Outside, the edge opens to its full value over the first few
  // pixels and framing takes over smoothly. Without the ramp, framing outranked
  // the field for a ship merely NEAR a wall and panned 12px into the void.
  const outside = Math.max(0, field.left - shipX, shipX - field.right);
  const edge = Math.min(cfg.cameraBackstopEdge, outside);

  // The field rule may not prevent framing the thing being framed.
  //
  // An anomaly sits `anomalyOffset` beyond the barrier, so centring it puts the
  // view a further half-window out — about 445px past the field edge, well past
  // anything `relax` opens. Without this the bound yanked the view back toward the
  // corridor every time the orbit swung that way and let it settle again on the
  // far side: reported as the camera panning to a split view of anomaly and field
  // and back. Measured at 55px of pan on a 120px orbit and 174px on a 180px one.
  //
  // Conditioned on the SUBJECT being outside, not the ship. Inside the corridor
  // the subject is the ship, `subjX - W / 2` would allow half a window of dead
  // space at all times, and the field rule would stop meaning anything.
  // Ramped by HOW FAR outside the subject is, not switched on whether it is.
  // As a boolean this let go in a single tick on the way back into the corridor
  // and threw the camera 158px — 9496px/s, reported as a jagged jump returning to
  // the field. The outbound crossing was smooth only because `relax` happened to
  // cover it; the return had nothing.
  const subjOut = Math.max(0, field.left - subjX, subjX - field.right);
  const t = Math.min(1, subjOut / Math.max(1, W / 2));
  const base = field.left - relax;
  const baseHi = field.right - W + relax;
  const fieldLo = base + (Math.min(base, subjX - W / 2) - base) * t;
  const fieldHi = baseHi + (Math.max(baseHi, subjX - W / 2) - baseHi) * t;
  let lo = Math.max(fieldLo, shipX - W + edge);
  let hi = Math.min(fieldHi, shipX - edge);
  if (field.width <= W) {
    lo = field.left;
    hi = field.left;
  }
  if (lo > hi) {
    lo = shipX - W + edge;
    hi = shipX - edge;
  }
  left = Math.max(lo, Math.min(hi, left));
  return { left, centerY: clampToFloor(cam, subjY, floorY) };
}

/**
 * Stop the view descending past the trailing floor.
 *
 * Everything below that line is dead space — a ship there has already lost the
 * run — so panning down to show it spends screen on nothing and, worse, lets the
 * line drift up the frame while the ship stays centred, which reads as the floor
 * rising rather than as the ship falling. Held at the bottom edge, the line stays
 * put and the ship visibly falls toward it, which is what is actually happening.
 *
 * The vertical axis had no clamp at all before this; `centerY` was the ship's y.
 */
function clampToFloor(cam: Camera, shipY: number, floorY: number | null): number {
  if (floorY === null) return shipY;
  return Math.min(shipY, floorY - cam.viewH / 2);
}

/**
 * Put the ship in the middle of the window immediately. Used at start and after a
 * respawn, where easing from wherever the camera happened to be would read as a
 * lurch rather than a fresh start.
 */
export function centerCamera(
  cam: Camera,
  shipX: number,
  shipY: number,
  field: { left: number; right: number; width: number },
  floorY: number | null,
): void {
  const wanted = shipX - cam.designW / 2;
  cam.left =
    field.width <= cam.designW
      ? field.left
      : Math.max(field.left, Math.min(field.right - cam.designW, wanted));
  cam.centerY = clampToFloor(cam, shipY, floorY);
  // A fresh start is never mid-orbit, and carrying a lock across a respawn would
  // hold the new ship's view on the body the old one died at.
  cam.anchorW = 0;
  cam.anchorX = shipX;
  cam.anchorY = shipY;
}

/** Ease the camera toward its target. Render-only; never observed by the sim. */
export function followCamera(
  cam: Camera,
  cfg: RenderConfig,
  shipX: number,
  shipY: number,
  field: { left: number; right: number; width: number },
  floorY: number | null,
  dt: number,
  /**
   * The body being orbited and how settled that orbit is, or null when drifting.
   *
   * `lock` is 0 through the dive and 1 in a true orbit — see `orbitLock`.
   */
  anchor: { x: number; y: number; lock: number } | null = null,
  shipVX = 0,
  /** The orbit is frozen — see `cameraTarget`'s parameter of the same name. */
  frozen = false,
  /** Barrier allowance — see `cameraTarget`'s parameter of the same name. */
  relax = 0,
): void {
  // Track the anchor's position while there is one, and KEEP it after the
  // capture ends so the weight has something to decay away from. Dropping the
  // position with the capture would snap the subject back to the ship by a whole
  // orbit radius on the release tick, which is the jump this exists to avoid.
  if (anchor) {
    cam.anchorX = anchor.x;
    cam.anchorY = anchor.y;
  }
  const wantW = anchor ? Math.max(0, Math.min(1, anchor.lock)) * cfg.cameraOrbitLock : 0;
  cam.anchorW += (wantW - cam.anchorW) * Math.min(1, dt * cfg.cameraOrbitEase);

  const t = cameraTarget(cam, cfg, shipX, shipY, field, floorY, shipVX, relax, frozen);
  const k = Math.min(1, dt * cfg.cameraFollow);
  cam.left += (t.left - cam.left) * k;
  cam.centerY += (t.centerY - cam.centerY) * k;

  // BACKSTOP: the ship may not leave the window, whatever the easing is doing.
  //
  // `cameraTarget` already refuses to aim anywhere the ship would be off screen,
  // but that is a constraint on the TARGET and `cam.left` only eases toward it.
  // At `cameraFollow` 3 the camera trails by roughly v/3 — 117px at the 352px/s a
  // release out to an anomaly reaches — so the ship overtook a perfectly correct
  // target and left the frame. Reported as "my ship flew faster than the camera".
  //
  // Applied AFTER the ease and to the camera itself, so it is invisible at
  // ordinary speeds and absolute at high ones. The field clamp still outranks it
  // for a ship inside the corridor: the alternative is panning past a wall to show
  // dead space, and a ship pinned to the edge there is about to die anyway.
  const W = cam.designW;
  // The WINDOW, not the deadzone's margins, and the distinction is the whole
  // point of this being a backstop. A margin is a soft framing preference and
  // belongs to the deadzone; this is a hard guarantee and must not express an
  // opinion about framing on top of it.
  //
  // With the margins it fought the orbit lock and won. Locked to an anchor the
  // ship is SUPPOSED to move around the frame, but `shipX - margin` orbits with
  // the ship, so the bound kept catching a camera whose target never moved:
  // measured on a real anomaly orbit, 83px of left-right swing at a lock weight
  // of exactly 1. Reported as the anomaly not staying centred, which it was not.
  const edge = cfg.cameraBackstopEdge;
  const lo = shipX - (W - edge);
  const hi = shipX - edge;
  // NO field rule here, deliberately. `cameraTarget` already refuses to aim past
  // a barrier, and the ease only moves toward that target, so the camera cannot
  // wander out on its own. Repeating the rule here made two clamps fight: the
  // backstop's field bound switched on the tick the ship re-entered the corridor
  // and yanked the view 107px — 6406px/s, the jagged jump on returning to the
  // field. This has one job, which is that the ship stays in the window.
  // Clamp to the NEAREST bound: the smallest correction that puts the ship back
  // on screen, and nothing more. An earlier version repositioned to a preferred
  // side instead, reasoning that a lagging camera should show what is ahead —
  // which turned a sub-pixel boundary violation into a 109px jump, because the
  // condition is marginal exactly when the ship is grazing the edge. A backstop
  // must be invisible until it is needed and minimal when it is. Where the ship
  // sits inside the window is the deadzone's and the look-ahead's business.
  cam.left = Math.max(lo, Math.min(hi, cam.left));
}

/** Travel direction as -1..1, the ramp the look-ahead leans on. */
function velocityLead(cfg: RenderConfig, shipVX: number): number {
  return Math.max(-1, Math.min(1, shipVX / Math.max(1, cfg.cameraLookRefSpeed)));
}

/**
 * How locked the view should be, for a capture in this phase.
 *
 * The whole rule, in one place because the camera and anything that wants to
 * explain it must agree. A TRUE orbit — round, settled, the ship going round a
 * still point — is the only case that wants a locked view. Everything before it,
 * the dive and the oval, is the exciting part and stays flown.
 *
 * **The settle is deliberately NOT ramped**, and this is the second correction to
 * this function. Riding `settleProgress` looked like the smooth choice and was
 * measured to eat half the oval: the ship swings 59 -> 107 -> 59px across a
 * settle, and because `settleProgress` is smootherstep'd it already reads 0.47 at
 * the apoapsis and 0.83-0.94 through the 12-14px return swing — flattening the
 * most dramatic part of a capture to under 2px. Of 83px of total swing only 41
 * survived. Reported as missing the bounce during the oval, and the numbers
 * agreed.
 *
 * So the lock waits for the thing it is named after. `cameraOrbitEase` turns the
 * phase change into a glide, and the glide is bounded by the settled orbit radius
 * — about 59px, against the 560px of `grabRange` that the first version of this
 * could lurch across. That bound is why a step is affordable here and was not
 * there.
 */
export function orbitLock(phase: string, _settleProgress: number): number {
  return phase === 'orbit' ? 1 : 0;
}

export function toScreenX(cam: Camera, wx: number): number {
  return cam.offsetX + (wx - cam.left) * cam.scale;
}

export function toScreenY(cam: Camera, wy: number): number {
  return cam.offsetY + (wy - cam.centerY) * cam.scale + (cam.viewH * cam.scale) / 2;
}

/** World y at the top and bottom edges of the design window — for culling. */
export function visibleWorldY(cam: Camera): { top: number; bottom: number } {
  const half = cam.viewH / 2;
  return { top: cam.centerY - half, bottom: cam.centerY + half };
}

/** Clip to the design window, so nothing can spill onto the letterbox bars. */
export function clipToWindow(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.beginPath();
  ctx.rect(cam.offsetX, cam.offsetY, cam.designW * cam.scale, cam.viewH * cam.scale);
  ctx.clip();
}

/**
 * Is this capture phase one where the ship's velocity is the phase clock's rather
 * than a heading?
 *
 * `clear` and `flyby` run on real physics — `stepPhysical` — so velocity there
 * points where the ship is going. From the periapsis freeze onward it is authored
 * circular motion and points wherever the ship happens to be in its orbit.
 */
export function frozenOrbit(phase: string | null | undefined): boolean {
  return phase === 'settle' || phase === 'orbit';
}

/**
 * How far past a barrier the view may reach, given where the ship is.
 *
 * Zero unless the ship is inside an anomaly's bubble, where the barrier is not a
 * barrier: it ramps with how far INTO the bubble the ship has travelled, so by
 * the time it reaches the wall the camera has had the whole 150px of bubble that
 * sits inside the corridor to get moving. That is the difference between a view
 * that is already tracking and one pinned to a line it is about to cross.
 *
 * Render-only, and deliberately shaped like the bubble rather than like a
 * distance to the wall — the allowance exists because of the anomaly, so it
 * should appear and vanish with the anomaly and not with the geometry of the
 * corridor.
 */
export function barrierRelax(
  bodies: readonly Body[],
  x: number,
  y: number,
  cfg: RenderConfig,
): number {
  let best = 0;
  for (const b of bodies) {
    if (b.kind !== 'anomaly') continue;
    const d = Math.hypot(x - b.x, y - b.y);
    if (d > b.bubble) continue;
    best = Math.max(best, Math.min(cfg.cameraBarrierRelax, b.bubble - d));
  }
  return best;
}
