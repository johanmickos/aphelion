/**
 * Overlays drawn above the world: the crash readout, and paused state.
 */
import type { SimConfig } from '../sim/config.ts';
import type { EndingReason } from '../sim/types.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';
import {
  HAZARD_NOTICE,
  HAZARD_NOTICE_BORDER,
  HAZARD_NOTICE_FILL,
  IMPACT_NOTICE_BORDER,
  IMPACT_NOTICE_FILL,
  IMPACT_TEXT,
  FINISH,
  withAlpha,
} from './palette.ts';

/**
 * The run-ended readout: a small industrial box at the point it happened, like
 * the ship's computer reporting. Non-modal and localised, which is why it reads
 * as information rather than punishment.
 *
 * Colour-matched to the cause so the reason is legible before the text is read:
 * yellow for an impact, red for leaving the field — the same red as the boundary
 * gradient that was warning you on the way out — and the finish green for
 * clearing it, the one outcome here that is not a failure.
 *
 * GREEN AND NOT THE LADDER'S GOLD, decided by looking at it. Gold was the first
 * choice and the argument for it was sound in isolation: clearing the field is
 * the best thing a player can do, and gold is the rarity ladder's top rung. What
 * that argument missed is that by the time this box appears the player has been
 * following a green arrow and has just flown through a green chequered line. The
 * notice is the third beat of THAT sentence, not the first beat of a new one.
 * Colour still means rarity on an award; this is not an award, it is the finish
 * telling you that you reached it.
 *
 * The gold one has no ⚠ and does not say what went wrong, because nothing did.
 * It is deliberately the plainest of the four: the ceremony is what celebrates a
 * clear, and a box that shouted would be the second thing shouting.
 */
interface NoticeStyle {
  msg: string;
  fill: string;
  border: string;
  text: string;
}

const NOTICE: Record<EndingReason, NoticeStyle> = {
  impact: {
    msg: '⚠ CRASHED',
    fill: IMPACT_NOTICE_FILL,
    border: IMPACT_NOTICE_BORDER,
    text: IMPACT_TEXT,
  },
  'out-of-bounds': {
    msg: '⚠ LOST — OFF COURSE',
    fill: HAZARD_NOTICE_FILL,
    border: HAZARD_NOTICE_BORDER,
    text: HAZARD_NOTICE,
  },
  cleared: {
    msg: 'FIELD CLEARED',
    fill: withAlpha(FINISH, 0.14),
    border: withAlpha(FINISH, 0.9),
    text: withAlpha(FINISH, 1),
  },
  'fell-behind': {
    msg: '⚠ FELL BEHIND',
    fill: HAZARD_NOTICE_FILL,
    border: HAZARD_NOTICE_BORDER,
    text: HAZARD_NOTICE,
  },
};

export function drawEndingNotice(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  snap: RenderSnapshot,
): void {
  if (!snap.ending.active) return;
  const style = NOTICE[snap.ending.reason];
  const s = cam.scale;
  const csx = toScreenX(cam, snap.ending.x);
  const csy = toScreenY(cam, snap.ending.y);

  ctx.save();
  ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(style.msg).width;
  const padX = 9 * s;
  const bw = tw + padX * 2;
  const bh = 22 * s;

  // Clamped to the design window, never the viewport, so it cannot drift onto a
  // letterbox bar.
  const winL = cam.offsetX;
  const winT = cam.offsetY;
  const winR = cam.offsetX + cam.designW * s;
  const winB = cam.offsetY + cam.viewH * s;
  let bx = csx + 14 * s;
  let by = csy - bh - 14 * s;
  bx = Math.max(winL + 6 * s, Math.min(winR - bw - 6 * s, bx));
  by = Math.max(winT + 6 * s, Math.min(winB - bh - 6 * s, by));

  const p = snap.ending.t / sim.crashPause;
  ctx.globalAlpha = Math.min(1, Math.min(p * 8, (1 - p) * 8 + 0.3));

  ctx.fillStyle = style.fill;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(bx + 0.5 * s, by + 0.5 * s, bw - s, bh - s);

  // corner ticks, for the HUD feel
  const tk = 4 * s;
  ctx.beginPath();
  ctx.moveTo(bx, by + tk);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + tk, by);
  ctx.moveTo(bx + bw - tk, by);
  ctx.lineTo(bx + bw, by);
  ctx.lineTo(bx + bw, by + tk);
  ctx.moveTo(bx, by + bh - tk);
  ctx.lineTo(bx, by + bh);
  ctx.lineTo(bx + tk, by + bh);
  ctx.moveTo(bx + bw - tk, by + bh);
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx + bw, by + bh - tk);
  ctx.stroke();

  ctx.strokeStyle = style.border;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = s;
  ctx.setLineDash([2 * s, 2 * s]);
  ctx.beginPath();
  ctx.moveTo(bx, by + bh);
  ctx.lineTo(csx, csy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = Math.min(1, Math.min(p * 8, (1 - p) * 8 + 0.3));

  ctx.fillStyle = style.text;
  ctx.fillText(style.msg, bx + padX, by + bh / 2 + s);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/** Dim + label, used while paused. Folds into the run-state overlay in Stage 1. */
export function drawPaused(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const s = cam.scale;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(cam.offsetX, cam.offsetY, cam.designW * s, cam.viewH * s);
  ctx.fillStyle = '#b98cff';
  ctx.textAlign = 'center';
  ctx.font = `600 ${22 * s}px ui-monospace, monospace`;
  ctx.fillText(
    '❚❚  PAUSED',
    cam.offsetX + (cam.designW * s) / 2,
    cam.offsetY + (cam.viewH * s) / 2,
  );
  ctx.restore();
}
