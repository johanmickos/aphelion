/**
 * The rungs, painted — sampling and pixels, and nothing about their shape.
 *
 * Where a rung hangs, how far it bows and how far the wake has parted it are all
 * [`rung.ts`](../state/rung.ts)'s, and its header argues why. What is here is the
 * one decision that genuinely belongs to a renderer: **how many points a curve is
 * drawn with**, and where the ink goes.
 *
 * ## The layer it sits in
 *
 * Spec [05 · §2](../../docs/spec/05-field.md)'s stack runs SKY, DUST, STRATA,
 * BODIES, PLAYER, and the rungs are STRATA — so they are drawn after the sky and
 * under everything else, **inside the world transform**, at world speed. That is
 * the difference between them and the [starfield](./starfield.ts) in one line:
 * the sky is drawn in screen space precisely because it does not move at world
 * speed, and this does.
 *
 * ## What it costs, and where the cost was taken out
 *
 * This is the first thing in the game that draws hundreds of curved paths a
 * frame, and spec 05's acceptance includes *"the frame budget still holds with
 * rungs on."* Three things keep it bounded and each is measured in
 * `docs/plan/m3-the-field.md`:
 *
 * - **A rung asks nothing of a body outside its reach.** `falloff` ends at three
 *   lengths, so the work per rung grows with the bodies *near* it and not with
 *   the size of the field — which is exactly what `pnpm profile`'s field-size
 *   sweep exists to check.
 * - **A rung with nothing acting on it is two points.** Between bodies and away
 *   from the craft a rung is a straight line, and the field is mostly between
 *   bodies. It is also the whole field while the bow and the wake are switched
 *   off (2026-08-30), which is why that switch costs a frame nothing rather than
 *   paying for a curve it then draws flat.
 * - **The points are reused.** One mutable pair is written into per sample rather
 *   than a fresh object per point, because at this rate the prototype's own
 *   record is that per-frame allocation is paid for later, all at once.
 */
import { BOARD_PIXEL, DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from '../state/design.ts';
import {
  ADDRESSED_EVERY,
  BOW_FALLOFF,
  altitudeOf,
  hasRungs,
  reachOf,
  rungAbove,
  rungBelow,
  rungPointAt,
  rungReads,
} from '../state/rung.ts';
import type { BodyView, CameraView, CorridorView, WakeView } from '../state/types.ts';
import type { Seen } from './letterbox.ts';
import { DUSK } from './palette.ts';

/**
 * How faint a plain rung is, and an addressed one — spec 05 §2 and §3, stated
 * identically in both.
 *
 * The only two numbers in this file the design fixes outright, and they are a
 * fixed token at a fixed alpha rather than anything tinted per body, so the gamut
 * warning that moved spec 04's tide does not reach them: DUSK is inside sRGB by
 * construction and an alpha cannot take it out.
 */
const RUNG_AT_REST = 0.16;
const RUNG_ADDRESSED = 0.28;

/** Spec 05 §3's **1px**, in the units every other board pixel in this repo is carried in. */
const RUNG_WIDTH = 1 * BOARD_PIXEL;

/**
 * How far apart the points a rung is drawn from are, in design units.
 *
 * **The board's own resolution relative to a body, rather than its own step.**
 * Direction 05 walks its rungs in 10-pixel steps across a planet of radius 58, so
 * it spends about 11.6 points on a body's width; this field's median body is 44
 * board pixels across the same axis, so the same picture wants a step of 8 rather
 * than 10. Carrying the 10 unchanged would have drawn the bow with half the
 * points the board draws it with and faceted the one curve in the game whose
 * whole job is to look continuous.
 *
 * It is the number to move first if the frame budget ever fails, and it is on the
 * bench for that reason as much as for how it looks.
 */
const RUNG_STEP = 8 * BOARD_PIXEL;

/** Spec 00 §4's utility face, at Direction 05's own 9px. */
const LABEL_FACE = "'Archivo', system-ui, sans-serif";
const LABEL_SIZE = 9 * BOARD_PIXEL;
const LABEL_STRENGTH = 0.75;

/**
 * Where an addressed rung's number sits, in design units from the left of the
 * **design space** and above its own line — the board's `fillText(…, 8, y - 5)`.
 *
 * From the design space and not from the corridor, and that is spec
 * [00 · §7](../../docs/spec/00-tokens.md) rather than a preference: the corridor
 * is 1.9× the design width, so a label pinned to the world's own left edge would
 * spend most of a run in the bleed, which is *"world seen further, never part of
 * the composition"* and where nothing the player has to read may live.
 */
const LABEL_INSET = 8 * BOARD_PIXEL;
const LABEL_LIFT = 5 * BOARD_PIXEL;

/**
 * How far above the thumb line a label starts going out.
 *
 * Spec 00 §7: *"the thumb line sits at 2/3 of the screen height. Nothing readable
 * may live below it, ever."* A rung's number is readable and a rung's number
 * scrolls, so it is the first thing in the game that would have to cross that
 * line — and switching it off at the line would be a pop-out in the middle of the
 * picture. It fades across this instead.
 *
 * **This is a reading of the rule, not a ruling.** The rule was written about
 * composition, and everything else that goes below the line — the craft, the
 * compass, a callout at the dot — is world-attached and exempt in practice. A
 * label is the awkward case: attached to the world in `y` and to the composition
 * in `x`. Honouring the rule literally is the conservative answer and it costs
 * four lines; if the author rules that a world-attached label is exempt, this is
 * the constant that goes to zero.
 */
const LABEL_FADE = DESIGN_HEIGHT / 6;

/** One reused pair, written into per sample point — see the header. */
const point = { x: 0, y: 0 };

/**
 * Draw the rungs, in **world space**, between the sky and the bodies.
 *
 * The caller is expected to have translated into the world already — the same
 * state [`draw`](./index.ts) is in when it draws a body — and `seen` is what this
 * device can show, in design coordinates, which is what bounds both loops below.
 */
export function drawRungs(
  context: CanvasRenderingContext2D,
  camera: CameraView,
  corridor: CorridorView,
  bodies: readonly BodyView[],
  wake: readonly WakeView[],
  seen: Seen,
): void {
  // `seen` is in design coordinates and this is drawing in world ones. The design
  // space is centred on the camera, so the two differ by exactly that offset.
  const left = seen.left + camera.x - DESIGN_WIDTH / 2;
  const right = seen.right + camera.x - DESIGN_WIDTH / 2;
  const top = seen.top + camera.y - DESIGN_HEIGHT / 2;
  const bottom = seen.bottom + camera.y - DESIGN_HEIGHT / 2;

  const foot = corridor.foot;
  // A field with no foot has no altitude datum and therefore no ladder — see
  // [`hasRungs`](../state/rung.ts), which exists because one such field is built
  // on purpose. The `last < first` half is the ordinary case of a window that
  // spans no whole rung.
  if (!hasRungs(foot)) return;
  const first = rungAbove(foot, bottom);
  const last = rungBelow(foot, top);
  if (last < first) return;

  const bowReach = reachOf(BOW_FALLOFF);

  context.save();
  context.lineWidth = RUNG_WIDTH;
  context.strokeStyle = DUSK;
  for (let rung = first; rung <= last; rung++) {
    const y = altitudeOf(foot, rung);
    const addressed = rung % ADDRESSED_EVERY === 0;
    context.globalAlpha = addressed ? RUNG_ADDRESSED : RUNG_AT_REST;
    strokeRung(context, y, left, right, near(bodies, y, bowReach), pressing(wake, rung));
    if (addressed) label(context, rung, y, bodies, corridor, camera);
  }
  context.restore();
}

/**
 * One rung, from one edge of what can be seen to the other.
 *
 * Straight when nothing is acting on it, which is most of the field and most of
 * the saving: two points and a stroke rather than a hundred.
 */
function strokeRung(
  context: CanvasRenderingContext2D,
  y: number,
  left: number,
  right: number,
  bodies: readonly BodyView[],
  wake: WakeView | undefined,
): void {
  context.beginPath();
  if (bodies.length === 0 && wake === undefined) {
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    return;
  }
  // The last point is the right edge exactly rather than wherever the step
  // happens to land, so a rung always reaches the side of the picture — a
  // shortfall of up to one step would read as the field ending.
  for (let x = left; x < right + RUNG_STEP; x += RUNG_STEP) {
    const at = Math.min(x, right);
    rungPointAt(at, y, bodies, wake, point);
    if (at === left) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
}

/**
 * The bodies close enough to bend this rung at all — **and strong enough to.**
 *
 * Gathered once per rung rather than tested per sample point: the test is a
 * vertical distance and a rung has one, so asking it a hundred times an inch
 * would be asking the same question a hundred times. It is only the vertical half
 * of the reach, which admits a few bodies the horizontal half would rule out —
 * `rungPointAt` costs them one `falloff` each and they contribute nothing.
 *
 * The strength test is the same one, one property along. A body whose
 * [`bow`](../state/types.ts) is zero bends nothing, so it is not near in any sense
 * this loop cares about — and while the bow is switched off
 * ([`BOW_GAIN`](../state/rung.ts)) that is every body in the field, which is what
 * hands the straight-line path below the whole frame. **The cost of the feature
 * goes with the feature**, rather than the field paying ninety-three samples a
 * rung to arrive back at a horizontal line.
 */
function near(bodies: readonly BodyView[], y: number, reach: number): readonly BodyView[] {
  const found: BodyView[] = [];
  for (const body of bodies) if (body.bow > 0 && Math.abs(body.y - y) < reach) found.push(body);
  return found;
}

/**
 * The wake on this rung, if there is one.
 *
 * A plain lookup, and the list it searches is short by construction —
 * [`wakeOf`](../state/rung.ts) holds only the rungs within the wake's reach of
 * the craft plus those still relaxing, measured at **at most 17** over the
 * shipped run. Presentation state drops an entry the tick its decay ends, so an
 * absent entry here is a rung with nothing to say and the straight-line case
 * above takes it.
 */
function pressing(wake: readonly WakeView[], rung: number): WakeView | undefined {
  // A wake of no amplitude parts nothing, and says so on itself — the same shape
  // as a body whose `bow` is zero, one line up. Presentation state goes on
  // deriving it while it is switched off, so ADR-0015's recurrence stays
  // exercised and tested and turning it back on is one slider with the state
  // already warm.
  const found = wake.find((entry) => entry.rung === rung);
  return found !== undefined && found.amplitude > 0 ? found : undefined;
}

/**
 * What an addressed rung says, drawn at the left of the **design space**.
 *
 * Its `x` is composition and its `y` is world, which is the one hybrid in the
 * picture and is what a ruler is: the number belongs to the rung and has to stay
 * where it can be read. See [`LABEL_INSET`](#label_inset) and
 * [`LABEL_FADE`](#label_fade).
 *
 * **What it says is spec 05's open question** and
 * [`rungReads`](../state/rung.ts) is where that is recorded, not decided.
 */
function label(
  context: CanvasRenderingContext2D,
  rung: number,
  y: number,
  bodies: readonly BodyView[],
  corridor: CorridorView,
  camera: CameraView,
): void {
  const onScreen = y - camera.y + DESIGN_HEIGHT / 2;
  const lit = Math.max(0, Math.min(1, (THUMB_LINE - onScreen) / LABEL_FADE));
  if (lit <= 0) return;
  context.save();
  context.globalAlpha = LABEL_STRENGTH * lit;
  context.fillStyle = DUSK;
  context.font = `600 ${LABEL_SIZE}px ${LABEL_FACE}`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(
    rungReads(rung, bodies, corridor.foot),
    camera.x - DESIGN_WIDTH / 2 + LABEL_INSET,
    y - LABEL_LIFT,
  );
  context.restore();
}
