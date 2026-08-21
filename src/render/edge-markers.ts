/**
 * Arrows at the screen edge pointing to bodies that are off-screen.
 *
 * The compass needs an orbit, so it only exists during a capture. These are
 * always on, which is what gives you any spatial sense at all during a long
 * drift or a fast flyby — the moments when you most need to know where anything
 * is and the compass cannot help.
 */
import type { Body } from '../sim/types.ts';
import { hypot } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';

export function drawEdgeMarkers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  bodies: readonly Body[],
): void {
  const s = cam.scale;
  const winL = cam.offsetX;
  const winT = cam.offsetY;
  const winW = cam.designW * s;
  const winH = cam.viewH * s;
  const inset = 24 * s;
  const cx = winL + winW / 2;
  const cy = winT + winH / 2;

  ctx.save();
  for (const b of bodies) {
    const bx = toScreenX(cam, b.x);
    const by = toScreenY(cam, b.y);
    const r = b.R * s;
    const onScreen = bx > winL - r && bx < winL + winW + r && by > winT - r && by < winT + winH + r;
    if (onScreen) continue;

    const dist = hypot(b.x - snap.x, b.y - snap.y);
    if (dist > rcfg.edgeMarkerRange) continue;

    let dx = bx - cx;
    let dy = by - cy;
    const len = hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // where the ray from the centre meets the inset window rectangle
    const halfW = winW / 2 - inset;
    const halfH = winH / 2 - inset;
    const tx = dx !== 0 ? halfW / Math.abs(dx) : 1e9;
    const ty = dy !== 0 ? halfH / Math.abs(dy) : 1e9;
    const t = Math.min(tx, ty);
    const ex = cx + dx * t;
    const ey = cy + dy * t;

    const near = Math.max(0.35, Math.min(1, 1 - (dist - 200) / 1400));
    const ang = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = `rgba(150,200,255,${0.5 * near + 0.2})`;
    ctx.beginPath();
    ctx.moveTo(7 * s, 0);
    ctx.lineTo(-4 * s, 4.5 * s);
    ctx.lineTo(-4 * s, -4.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const label = dist >= 1000 ? `${(dist / 1000).toFixed(1)}k` : String(Math.round(dist));
    ctx.fillStyle = `rgba(190,215,245,${0.55 * near + 0.25})`;
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${b.name} ${label}`, ex - dx * 20 * s, ey - dy * 20 * s);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
