/**
 * Arrows at the screen edge pointing to bodies that are off-screen, and the ring
 * that says which body a press would actually take.
 *
 * The compass needs an orbit, so it only exists during a capture. These are
 * always on, which is what gives you any spatial sense at all during a long
 * drift or a fast flyby — the moments when you most need to know where anything
 * is and the compass cannot help.
 *
 * Upward only, like the compass. An arrow at the bottom of the screen points back
 * down the climb at somewhere you have already been, which is both clutter and a
 * suggestion to turn around.
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
  /**
   * How far down the header text reaches, in design units — measured by the app
   * rather than assumed here, so this follows the real element through safe-area
   * insets, font changes and label edits instead of being a magic number that
   * quietly stops matching.
   */
  headerBottom = 0,
): void {
  const s = cam.scale;
  const winL = cam.offsetX;
  const winT = cam.offsetY;
  const winW = cam.designW * s;
  const winH = cam.viewH * s;
  const cx = winL + winW / 2;
  const cy = winT + winH / 2;
  // The arrow ring is inset asymmetrically — more at the top, where the readout
  // and stage label sit — so it is a plain rectangle rather than one centred on
  // the ray origin, and needs a proper slab intersection rather than a symmetric
  // half-width shortcut.
  const boxL = winL + rcfg.edgeMarkerInset * s;
  const boxR = winL + winW - rcfg.edgeMarkerInset * s;
  // Every arrow points up the climb, so they all cluster along the top edge —
  // exactly where the readout and the stage label live. Sit them just under it.
  const topInset = Math.max(rcfg.edgeMarkerInset, headerBottom + rcfg.edgeMarkerHeaderGap);
  const boxT = winT + topInset * s;
  const boxB = winT + winH - rcfg.edgeMarkerInset * s;

  ctx.save();
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]!;
    const bx = toScreenX(cam, b.x);
    const by = toScreenY(cam, b.y);
    const r = b.R * s;
    const onScreen = bx > winL - r && bx < winL + winW + r && by > winT - r && by < winT + winH + r;
    if (onScreen) {
      // The cue must not blink out at the moment the thing it points at comes
      // into view — that is exactly when the player is deciding. Same ring, drawn
      // around the body instead of around an arrow to it.
      if (i === snap.grabOffer) {
        ctx.save();
        ctx.strokeStyle = b.kind === 'anomaly' ? 'rgba(214,164,255,.7)' : 'rgba(190,215,245,.6)';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.arc(bx, by, r + 10 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }

    // Upward only, EXCEPT anomalies. The rule exists because an arrow pointing
    // back down the climb is clutter and a suggestion to turn around — but an
    // anomaly is the one thing in the field worth turning toward, it is placed
    // off to the side rather than ahead, and a release aimed at one routinely
    // leaves the ship above it.
    //
    // Reported as "my ship flew faster than the camera and I couldn't see when I
    // was close to the anomaly to capture it". Measured on that run the ship sat
    // 178px above the anomaly at the release, so this filter suppressed the only
    // always-on indicator for the whole approach: no compass either, because that
    // needs a capture, and the anomaly itself was off screen until 0.24s before
    // arrival. There was nothing at all to read.
    if (b.kind !== 'anomaly' && b.y >= snap.y) continue; // behind us, down the climb
    const dist = hypot(b.x - snap.x, b.y - snap.y);
    if (dist > rcfg.edgeMarkerRange) continue;

    let dx = bx - cx;
    let dy = by - cy;
    const len = hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // where the ray from the centre first leaves the inset rectangle
    const tx = dx > 0 ? (boxR - cx) / dx : dx < 0 ? (boxL - cx) / dx : Infinity;
    const ty = dy > 0 ? (boxB - cy) / dy : dy < 0 ? (boxT - cy) / dy : Infinity;
    const t = Math.min(tx, ty);
    if (!Number.isFinite(t) || t <= 0) continue;
    const ex = cx + dx * t;
    const ey = cy + dy * t;

    // Full strength for the one a press would take, whatever the distance fade
    // would otherwise say. That is the difference between "there is an anomaly
    // over there" and "take it now", and it was the missing half of the approach:
    // measured on the session that reported it, the ship was inside the grab
    // window for 1.03s and could see the anomaly itself for 0.23 of that.
    const offered = i === snap.grabOffer;
    const near = offered ? 1 : Math.max(0.35, Math.min(1, 1 - (dist - 200) / 1400));
    const ang = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    const purple = b.kind === 'anomaly';
    ctx.fillStyle = purple
      ? `rgba(206,150,255,${0.6 * near + 0.3})`
      : `rgba(150,200,255,${0.5 * near + 0.2})`;
    ctx.beginPath();
    ctx.moveTo(7 * s, 0);
    ctx.lineTo(-4 * s, 4.5 * s);
    ctx.lineTo(-4 * s, -4.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The ring is the cue, and it rides the arrow rather than the label so it
    // reads at a glance from the same place the eye already is.
    if (offered) {
      ctx.save();
      ctx.strokeStyle = purple ? 'rgba(214,164,255,.85)' : 'rgba(190,215,245,.8)';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.arc(ex, ey, 9 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const label = dist >= 1000 ? `${(dist / 1000).toFixed(1)}k` : String(Math.round(dist));
    ctx.fillStyle = purple
      ? `rgba(214,164,255,${0.6 * near + 0.3})`
      : `rgba(190,215,245,${0.55 * near + 0.25})`;
    ctx.font = `${8 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${b.name} ${label}`, ex - dx * 20 * s, ey - dy * 20 * s);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
