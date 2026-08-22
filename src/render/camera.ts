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
}

export function createCamera(cfg: RenderConfig): Camera {
  return {
    scale: 1,
    offsetX: 0,
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
  /**
   * What the view should sit on instead of the ship, while a capture holds one.
   *
   * See `anchorTarget` below for why a capture gets its own subject at all.
   */
  anchor: { x: number; y: number } | null = null,
  /** Ship velocity, for the look-ahead. Zero disables it. */
  shipVX = 0,
): { left: number; centerY: number } {
  const W = cam.designW;
  const margin = W * cfg.cameraMarginFrac;

  // A capture is watched, not flown through: the anchor is still, the ship goes
  // round it, and the compass — the thing actually being read — is drawn centred
  // on the anchor. Following the ship instead put a 129px vertical oscillation
  // through a 0.33s lag, which is over half its own 0.6s period: too slow to
  // track and with no deadzone to ignore it, so all it could do was smear.
  const subjX = anchor ? anchor.x : shipX;
  const subjY = anchor ? anchor.y : shipY;

  // Look where you are going, not where you have been. Only while drifting: a
  // captured ship's velocity swings right round every orbit, and biasing on it
  // would reintroduce exactly the wobble the anchor is here to remove.
  const look = anchor
    ? 0
    : W *
      cfg.cameraLookAhead *
      Math.max(-1, Math.min(1, shipVX / Math.max(1, cfg.cameraLookRefSpeed)));
  const want = subjX + look;

  let left = cam.left;
  if (want - left > W - margin) left = want - (W - margin);
  else if (want - left < margin) left = want - margin;
  left = Math.max(field.left, Math.min(field.right - W, left));
  if (field.width <= W) left = field.left;
  // The clamp exists to avoid spending screen on dead space outside the field.
  // A ship out at an anomaly is legitimately outside it, so that reason lapses —
  // and honouring the clamp there would hold the view at the barrier while the
  // ship flew off it, which is the one thing a camera must never do.
  //
  // GATED on the ship actually being outside, and that gate is load-bearing.
  // Unconditional, it also fired in ordinary play whenever the ship came within
  // a margin of a wall, panning the view up to 80px past the barrier to show dead
  // space — which is precisely what the clamp exists to prevent. Measured on the
  // SHIP and never on the anchor: it is the ship that must not leave the screen.
  if (shipX < field.left || shipX > field.right) {
    left = Math.min(left, shipX - margin);
    left = Math.max(left, shipX - (W - margin));
  }

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
  anchor: { x: number; y: number } | null = null,
  shipVX = 0,
): void {
  const t = cameraTarget(cam, cfg, shipX, shipY, field, floorY, anchor, shipVX);
  const k = Math.min(1, dt * cfg.cameraFollow);
  cam.left += (t.left - cam.left) * k;
  cam.centerY += (t.centerY - cam.centerY) * k;
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
