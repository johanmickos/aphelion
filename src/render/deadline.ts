/**
 * The deadline and the SOS, painted.
 *
 * Where a press still saves and where it stops are
 * [`rescue.ts`](../sim/rescue.ts)'s and [`deadline.ts`](../state/deadline.ts)'s —
 * a scan on a clone of the simulation, and the memory that stops it being re-run
 * every tick. What is here is ink.
 *
 * ## The compass inverted, and that is the whole grammar
 *
 * `CONTEXT.md`: *"the ION window drawn on the craft's own projected line when it
 * is leaving the field. Its dot is the last press that can still save the run —
 * the compass inverted, saying **press here** rather than **release here**."* So
 * it borrows the compass's own shapes and nothing else: a window is a thickened
 * stretch of a line, and a dot is a filled circle at the end of one.
 *
 * ## ⚠ Two of spec 03 §5's rows are not built as written
 *
 * - **Its dashed line past the dot** is refused (author, 2026-09-01), together
 *   with the dashes that were on the bands. Once no press remains, the track goes
 *   out and the SOS takes over — one predicate, two presentations. The spent part
 *   of the line is history, and spec 05 §6 rules that *"there are no sampled
 *   breadcrumbs anywhere in the game."*
 * - **Its window is plural.** The saveable stretch has gaps in it — measured, 8%
 *   of doomed drifts hold more than one window as a second body comes into range —
 *   and the author ruled that every one is drawn rather than only the last.
 *
 * And what is **not** drawn is the escape itself. The prototype draws the rescue
 * swing its mark is offering; the author refused the same shape one instrument
 * along on the same day — *"we should not show the oval orbit like this when it's
 * not the true ship trajectory. It is confusing."* A rescue path is a predicted
 * orbit for a press nobody has made yet.
 */
import { BOARD_PIXEL } from '../state/design.ts';
import type { CraftView, DeadlineView, SosView } from '../state/types.ts';
import { ION, VOID, dim } from './palette.ts';

/**
 * How thick the window is drawn, in design units — spec
 * [00 · §6](../../docs/spec/00-tokens.md)'s window weight, which the compass's
 * own rings already wear.
 *
 * The same width as a compass window on purpose: the two are one grammar, and a
 * player who has learned *the thick bit is where the press goes* should not have
 * to learn it twice.
 */
const WINDOW_WIDTH = 4.5 * BOARD_PIXEL;

/** How faint the projected line is between the windows — it is a path, not a promise. */
const LINE_WIDTH = 1.25 * BOARD_PIXEL;
const LINE_STRENGTH = 0.3;

/** The dot at the far end of the last window — spec 03 §5's *"the last press that can save"*. */
const DOT_RADIUS = 4 * BOARD_PIXEL;

/**
 * How dim the unaffordable part of a window is drawn.
 *
 * Spec 03 §5 couples fuel to the deadline **by luminance, never geometry**:
 * *"only the fraction of the window the tank can afford stays lit... an empty
 * tank shows the whole window in DUSK."* Today
 * [`affordable`](../state/types.ts) is 1 and nothing takes this path — it is
 * built so that M4.4 changes a number rather than this file.
 */
const UNAFFORDABLE = 0.22;

/** Spec 07 §6's `SOS`, in Direction 03's utility face. */
const SOS_FACE = "'Archivo', system-ui, sans-serif";
const SOS_SIZE = 11 * BOARD_PIXEL;
const SOS_TRACKING = 0.12;
const SOS_RIM = 2 * BOARD_PIXEL;
const SOS_RIM_STRENGTH = 0.38;

/**
 * How far from the craft the `SOS` sits, in design units, **toward the wall it is
 * about**.
 *
 * Spec 07 §6 puts it *"at the craft"* and says no more. Toward rather than away,
 * and that is the prototype's own recorded defect avoided by construction: it put
 * its mark on the away-from-the-boundary axis and found *"that is the same
 * direction as the wake for every wall — so it was drawn over the ship's trail
 * every single time."* The trail is behind; the wall is ahead. It also points at
 * the thing it is about, which is what every other cue in this game does.
 */
const SOS_OFFSET = 34 * BOARD_PIXEL;

/**
 * Draw the deadline, in **world space**, on the craft's own projected line.
 *
 * The caller is expected to have translated into the world already — the same
 * state [`draw`](./index.ts) is in when it draws the compass.
 */
export function drawDeadline(context: CanvasRenderingContext2D, track: DeadlineView): void {
  if (track.presence <= 0 || track.path.length < 2) return;

  context.save();
  context.lineCap = 'round';

  // The line first, faint, from the craft to the last thing worth marking. It is
  // the path, and the windows are laid on top of it.
  const last = track.cross ?? track.path[track.path.length - 1]!;
  context.lineWidth = LINE_WIDTH;
  context.strokeStyle = dim(ION, LINE_STRENGTH * track.presence);
  context.beginPath();
  context.moveTo(track.path[0]!.x, track.path[0]!.y);
  context.lineTo(last.x, last.y);
  context.stroke();

  // **Every window**, which is the author's ruling — the saveable stretch has
  // gaps in it and drawing only the last would under-claim, telling a player who
  // *can* save that the chance is still ahead of them.
  context.lineWidth = WINDOW_WIDTH;
  let from: { x: number; y: number } | null = null;
  for (let at = 0; at < track.path.length; at++) {
    const here = track.path[at]!;
    if (here.saves && from === null) from = here;
    if (here.saves && at < track.path.length - 1) continue;
    if (from === null) continue;
    const to = here.saves ? here : track.path[at - 1]!;
    window(context, from, to, track);
    from = null;
  }

  // And the dot: the last press that can still save the run.
  if (track.cross !== null) {
    context.globalAlpha = track.presence;
    context.fillStyle = ION;
    context.beginPath();
    context.arc(track.cross.x, track.cross.y, DOT_RADIUS, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/**
 * One window, lit as far as the tank can afford it.
 *
 * Two strokes rather than a gradient, because what the design asks for is a
 * **fraction** and not a ramp: spec 03 §5's empty tank shows *the whole window*
 * dim, not a window that fades out along its length. Today the split never falls
 * anywhere but the far end — see [`UNAFFORDABLE`](#unaffordable).
 */
function window(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  track: DeadlineView,
): void {
  const at = Math.max(0, Math.min(1, track.affordable));
  const mid = { x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at };
  if (at < 1) {
    context.strokeStyle = dim(ION, UNAFFORDABLE * track.presence);
    context.beginPath();
    context.moveTo(mid.x, mid.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  if (at > 0) {
    context.strokeStyle = dim(ION, track.presence);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(mid.x, mid.y);
    context.stroke();
  }
}

/**
 * The `SOS`, strobing at the craft — spec 07 §6, *"a signal, not a scream."*
 *
 * **Rimmed rather than bloomed**, which is spec 06 §4's ruling applied where it
 * belongs: the author refused a glow behind moving text on 2026-08-29 because it
 * *"isn't doing us any favours, it's blurring the legibility"*, and this is text
 * that has to be read over the boundary's own brightest ground.
 */
export function drawSos(context: CanvasRenderingContext2D, sos: SosView, craft: CraftView): void {
  context.save();
  context.globalAlpha = sos.strength;
  context.font = `800 ${SOS_SIZE}px ${SOS_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.letterSpacing = `${SOS_SIZE * SOS_TRACKING}px`;
  const x = craft.x + SOS_OFFSET * sos.toward;
  context.lineWidth = SOS_RIM;
  context.lineJoin = 'round';
  context.strokeStyle = dim(VOID, SOS_RIM_STRENGTH);
  context.strokeText('SOS', x, craft.y);
  context.fillStyle = ION;
  context.fillText('SOS', x, craft.y);
  context.restore();
}
