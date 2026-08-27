/**
 * The ship's warning panel: a stack of lights below the ship.
 *
 * A CAR DASHBOARD, and the metaphor is load-bearing. Warnings about the ship
 * belong together, in one place, in a shape the player learns once — rather than
 * each cue inventing its own position, its own plate and its own idea of how
 * loud to be. Asked for as "kind of like how a car dashboard has dedicated slots
 * for its warning lights".
 *
 * BELOW THE SHIP, which is the only free direction and was already the fuel
 * badge's. Everything else is spoken for: score popups rise straight up out of
 * the ship, the wake trails directly behind it, and ahead of it are the wall and
 * the deadline's own track. That last one is why the doom skull moved here — it
 * used to sit on the "away from the boundary" axis, which is the SAME direction
 * as the wake for every wall, so it was drawn on the trail every single time
 * rather than occasionally.
 *
 * FIRST-BEST OCCUPANCY, NOT RESERVED SLOTS. A true dashboard reserves a fixed
 * position per light so that position carries identity. Measured, that would buy
 * almost nothing here: over 71.8 minutes of recordings, some light is lit 4.2% of
 * the time and TWO are lit together for 3 seconds — 1.8% of the time anything is
 * lit at all. So the common case gets the good slot: whatever is worst takes the
 * row nearest the ship, and the rare second warning stacks below it. Optimising
 * the 98.2% and merely being correct in the 1.8%.
 *
 * ORDER IS SEVERITY, so the row nearest the ship is always the thing that matters
 * most. Dying outranks running low.
 *
 * ONE ROW SHAPE: a plate, a glyph, and an optional word. It is the fuel badge's
 * shape, generalised — that badge already solved the problem every ship-local cue
 * has, and its own note says why: "a dark plate behind it: this lands over
 * planets and starfield, and a thin outline alone disappears against a lit body."
 * The skull was the one cue that never had one, which is most of why it read as
 * unrecognisable.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderSnapshot } from './snapshot.ts';
import { VOID, solid } from './palette.ts';

/**
 * Which light, in severity order. The array IS the priority: earlier is worse
 * and sits nearer the ship.
 *
 * Exported so a test can assert the order rather than re-declaring it, which is
 * how two lists of the same thing start to disagree.
 */
export const WARNING_ORDER = ['doom', 'fuel'] as const;
export type WarningKind = (typeof WARNING_ORDER)[number];

/**
 * The plate, and the colour a glyph carves its own holes in.
 *
 * OPAQUE, and drawn under the row's `globalAlpha` so it still fades. That is what
 * lets a glyph fill its voids in this exact colour instead of punching them with
 * `destination-out` — which erased the game behind the badge rather than the
 * badge itself, and could not work at all once there was a plate to erase too.
 */
/** The plate a warning light sits on. The sky, opaque. */
const PLATE = solid(VOID);

/** Design units below the ship the panel starts at. The fuel badge's own drop. */
const DROP = 26;

/** Row metrics, in design units. */
const ROW_H = 19;
const ROW_GAP = 5;
const PAD_X = 4;
const PAD_Y = 3;
const LABEL_GAP = 5;
const LABEL_SIZE = 9;

/**
 * One lit warning, as the panel needs it.
 *
 * The panel owns WHERE and HOW BRIGHT; the light owns WHAT. A light that wanted
 * to place itself would be back to every cue inventing its own position, which is
 * the thing this file exists to end.
 */
export interface WarningLight {
  kind: WarningKind;
  /** 0..1. A light at 0 is not drawn and does not take a row. */
  alpha: number;
  color: string;
  /** Shown beside the glyph, or null for a light that speaks for itself. */
  word: string | null;
  /** Glyph width in design units. Height is always `ROW_H`. */
  glyphW: number;
  /**
   * Draw the glyph into the box at `(x, y)`, `w` by `h` SCREEN pixels.
   *
   * `plate` is the colour to carve voids in — see `PLATE`. Taking it as an
   * argument rather than importing it keeps the glyphs honest about the fact that
   * they are drawn on something.
   */
  glyph(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    s: number,
    plate: string,
  ): void;
}

/**
 * Draw the panel.
 *
 * Rows are laid out on the LANDED set, not on a partially faded one: a light
 * whose alpha is mid-fade still occupies its row, so nothing below it slides up
 * as it goes out. The sheet learned the same lesson the hard way — layout must
 * not depend on animation state.
 */
export function drawWarnings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  snap: RenderSnapshot,
  lights: ReadonlyArray<WarningLight>,
): void {
  const lit = WARNING_ORDER.map((k) => lights.find((l) => l.kind === k && l.alpha > 0)).filter(
    (l): l is WarningLight => l !== undefined,
  );
  if (lit.length === 0) return;

  const s = cam.scale;
  const cx = toScreenX(cam, snap.x);
  const top = toScreenY(cam, snap.y + DROP);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  lit.forEach((light, row) => {
    const y = top + row * (ROW_H + ROW_GAP) * s;
    ctx.globalAlpha = light.alpha;
    ctx.font = `600 ${LABEL_SIZE * s}px ui-monospace, monospace`;

    const labelW = light.word ? ctx.measureText(light.word).width : 0;
    const gw = light.glyphW * s;
    const totalW = gw + (light.word ? LABEL_GAP * s + labelW : 0);
    // Centred as a unit, so the row stays under the ship whichever word it is
    // carrying and whether it carries one at all.
    const gx = cx - totalW / 2;
    const gy = y - (ROW_H * s) / 2;

    ctx.fillStyle = PLATE;
    ctx.beginPath();
    ctx.roundRect(
      gx - PAD_X * s,
      gy - PAD_Y * s,
      totalW + PAD_X * 2 * s,
      ROW_H * s + PAD_Y * 2 * s,
      3 * s,
    );
    ctx.fill();

    light.glyph(ctx, gx, gy, gw, ROW_H * s, s, PLATE);

    if (light.word) {
      ctx.fillStyle = light.color;
      ctx.fillText(light.word, gx + gw + LABEL_GAP * s, y);
    }
  });

  ctx.globalAlpha = 1;
  ctx.restore();
}

export const WARNING_PANEL = { DROP, ROW_H, ROW_GAP, PLATE } as const;
