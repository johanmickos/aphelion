/**
 * Camera: world units -> screen pixels, with letterboxing.
 *
 * The simulation is viewport-blind (see src/sim/world.ts). Everything about
 * pixels lives here. The design window is the full playfield width by the design
 * height; it is scaled to fit and centred, so every device sees exactly the same
 * slice of world with bars filling any excess. Portrait-only by design.
 */
import { DESIGN_H } from '../sim/world.ts';

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
  /** World coordinate at the vertical centre of the design window. */
  centerY: number;
  designW: number;
  designH: number;
}

export function createCamera(designW: number): Camera {
  return { scale: 1, offsetX: 0, offsetY: 0, centerY: 0, designW, designH: DESIGN_H };
}

/** Recompute the letterbox fit for a viewport. */
export function fitCamera(cam: Camera, vp: Viewport): void {
  cam.scale = Math.min(vp.w / cam.designW, vp.h / cam.designH);
  cam.offsetX = (vp.w - cam.designW * cam.scale) / 2;
  cam.offsetY = (vp.h - cam.designH * cam.scale) / 2;
}

/** Ease the camera toward the ship. Render-only; never observed by the sim. */
export function followCamera(cam: Camera, targetY: number, dt: number): void {
  cam.centerY += (targetY - cam.centerY) * Math.min(1, dt * 3);
}

export function snapCamera(cam: Camera, targetY: number): void {
  cam.centerY = targetY;
}

export function worldToScreenX(cam: Camera, wx: number, fieldLeft: number): number {
  return cam.offsetX + (wx - fieldLeft) * cam.scale;
}

export function worldToScreenY(cam: Camera, wy: number): number {
  return cam.offsetY + (wy - cam.centerY) * cam.scale + (cam.designH * cam.scale) / 2;
}
