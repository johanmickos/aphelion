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
 * ## ⚠ The first build drew it at one weight all the way, and that was refused
 *
 * > *"It's really long, impacting my normal playing field... it should only
 * > appear, and NOT MOVE, along my trajectory and closer to the boundary. Within
 * > the main playfield I almost always have an opportunity to save myself, so the
 * > bright red line is not helpful."* — author, 2026-09-01
 *
 * The prototype's own track *does* reach the craft, and it records why it stopped
 * clamping the length instead: *"the cross first appears a median 375px away and
 * 772px at p75, so a 150px clamp drew a segment sitting a quarter of a screen
 * ahead of the ship, touching nothing."* What it does instead is **put the weight
 * where the decision is** — a hairline for most of its length, thickening into the
 * track inside [`ARM`](#arm) of the cross and into a lead-in inside
 * [`LEAD_LENGTH`](#lead_length). *"The far end carries the connection and nothing
 * else; the weight is all in the stretch with a decision in it."*
 *
 * The other half of the answer is not here at all: **the whole cue is ramped on
 * the lead** rather than on whether a wall is findable, so in the middle of the
 * field there is nothing to see. That is `deadline.ts`'s `FADE_IN_SECONDS`.
 */

/**
 * How far from the cross the track stops being a hairline, in design units — the
 * prototype's **150** of its own, converted.
 */
const ARM = 150 * BOARD_PIXEL;

/** And where it swells into the lead-in — the prototype's **46**. */
const LEAD_LENGTH = 46 * BOARD_PIXEL;

/**
 * The three weights and the three alphas, all the prototype's own.
 *
 * `HAIR` is what is left of a width at the far end, so the track never vanishes —
 * it is a connection to the craft rather than a floating segment. `DEAD` is what a
 * stretch that does **not** save is drawn at: present, because the gaps are part
 * of the shape, and faint, because they are not the offer.
 */
const HAIR = 0.55;
const DEAD = 0.18;
const TRACK_WIDTH = 0.8 * BOARD_PIXEL;
const LEAD_WIDTH = 1.3 * BOARD_PIXEL;
const TRACK_ALPHA = 0.45;
const LEAD_ALPHA = 1;

/**
 * How loud the whole cue is — the prototype's `deadlineAlpha`, and it is one
 * number on purpose.
 *
 * Everything above is a fraction of it, *"so the cue has ONE overall"*. Turning
 * the deadline down is one edit rather than six.
 */
const OVERALL = 0.5;

/**
 * How dim the part of the track the tank cannot afford is drawn.
 *
 * Spec 03 §5's fuel coupling is *"by luminance, never geometry"* — the geometry is
 * the same either way and only the ink moves. Nothing takes this path today.
 */
const UNAFFORDABLE = 0.22;

/** The dot — the prototype's marker radius and ring, converted. */
const DOT_RADIUS = 5 * BOARD_PIXEL;
const DOT_RING = 1.6 * BOARD_PIXEL;

/** Spec 07 §6's `SOS`, in Direction 03's utility face. */
const SOS_FACE = "'Archivo', system-ui, sans-serif";
const SOS_SIZE = 11 * BOARD_PIXEL;
const SOS_TRACKING = 0.12;

/**
 * The plate the word sits on, and how dark it is.
 *
 * ## ⚠ A rim was not enough against the boundary's own ground
 *
 * > *"Sometimes the SOS gets blended with the ion background."* — author,
 * > 2026-09-02
 *
 * It was ION text over a VOID rim, which is the callout's treatment and is right
 * *there* — a word over the field. The SOS is not over the field: it fires **at
 * the wall**, where the gradient is at its hottest, and that ground is
 * [`ION`](./palette.ts) too. At full heat the wash reaches α 0.51, which over VOID
 * is (135, 52, 92) against the word's own (255, 95, 162) — the **same hue**, so
 * the only thing separating them is lightness, and a rim two pixels wide is not
 * enough of it.
 *
 * **The design already answers this and the answer is a plate.** Spec
 * [00 · §6](../../docs/spec/00-tokens.md)'s label row is *"INK on VOID at 88%"*,
 * and spec [05 · §5](../../docs/spec/05-field.md) meets the same problem inside an
 * anomaly — *"only the chip backgrounds go true black, so labels hold against the
 * curtains."* Darken the ground; do not change the text. So the word stays ION,
 * which is what spec 07 §6 asks for.
 *
 * **VOID rather than true black**, which spec 00 §1 permits in exactly two places
 * and this is not one of them — and `CONTEXT.md` carries the reason from the
 * callout's own rim: *"a heavy black outline under pale text reads as a sticker."*
 */
const PLATE_STRENGTH = 0.82;
const PLATE_PAD_X = 7 * BOARD_PIXEL;
const PLATE_PAD_Y = 5 * BOARD_PIXEL;
const PLATE_RADIUS = 3 * BOARD_PIXEL;

/**
 * How far from the craft the `SOS` sits, in design units, on the **inside** — the
 * opposite side from the wall it is about.
 *
 * Spec 07 §6 puts it *"at the craft"* and says no more.
 *
 * ## ⚠ It was on the other side, and the author flew it into the clip
 *
 * The first build offset it **toward** the wall, to avoid the prototype's own
 * recorded defect: it put its mark on the away-from-the-boundary axis and found
 * *"that is the same direction as the wake for every wall — so it was drawn over
 * the ship's trail every single time."*
 *
 * That reasoning had a hole in it that the author found on the first flight —
 * *"can we render the SOS signal on the inside of the ship, opposite side from the
 * wall? I noticed it gets clipped"* — and it is obvious once said: **the SOS fires
 * at the wall**, so an offset toward the wall pushes it past the line, where
 * [`visible`](./letterbox.ts) clips the drawing. Measured over the 346 SOS ticks
 * in the corpus, against the author's own phone geometry: **clipped on 30% of
 * them toward the wall, and on 0% away from it.**
 *
 * ⚠ **And the collision it was avoiding is not live.** The prototype's was with
 * its ship's trail; this game has no craft trail built (`CONTEXT.md`'s **carry**
 * is spec 08's and M4's) and the rungs' wake is switched off
 * ([`WAKE_AMPLITUDE`](../state/rung.ts)). When the trail lands, this is the
 * constant that has to be looked at again — and the prototype's own answer was to
 * stop drawing it at the craft at all and make it a row in a warnings panel, which
 * is M4.5's HUD.
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

  // Only as far as the cross. The projection runs on to the wall, and the stretch
  // past the last press that can save is not a decision anyone can make.
  const upto = track.path.slice(0, lastSaving(track) + 1);
  if (upto.length < 2) return;

  // Distance to the cross **per sample**, so the profile is a property of the
  // shape rather than of how fast the craft happens to be going.
  const toCross: number[] = new Array<number>(upto.length);
  toCross[upto.length - 1] = Math.hypot(
    track.cross.x - upto[upto.length - 1]!.x,
    track.cross.y - upto[upto.length - 1]!.y,
  );
  for (let at = upto.length - 2; at >= 0; at--) {
    const one = upto[at]!;
    const two = upto[at + 1]!;
    toCross[at] = toCross[at + 1]! + Math.hypot(two.x - one.x, two.y - one.y);
  }

  context.save();
  context.lineCap = 'round';
  // One stroke per segment, because every segment has its own weight and its own
  // alpha — which is the whole point of the profile.
  for (let at = 0; at + 1 < upto.length; at++) {
    const one = upto[at]!;
    const two = upto[at + 1]!;
    const away = (toCross[at]! + toCross[at + 1]!) / 2;
    // Hairline to track over the stretch between the two lengths, then track to
    // lead-in over the final one.
    const swell = smoothstep((ARM - away) / (ARM - LEAD_LENGTH));
    const body = HAIR + (1 - HAIR) * swell;
    const nose = away < LEAD_LENGTH ? 1 - away / LEAD_LENGTH : 0;
    const lit = one.saves && two.saves ? 1 : DEAD;
    // **Fuel, by luminance and never geometry** (spec 03 §5): the part of the
    // track the tank can afford stays lit and the rest goes faint, measured from
    // the craft — *"half a tank lights the early half."* Nothing takes this path
    // today; it is here so M4.4 changes a number rather than this file.
    const along = 1 - away / Math.max(1e-6, toCross[0]!);
    const afford = along <= track.affordable ? 1 : UNAFFORDABLE;
    context.lineWidth = (TRACK_WIDTH + LEAD_WIDTH * nose) * body;
    context.strokeStyle = dim(
      ION,
      OVERALL *
        track.presence *
        (TRACK_ALPHA + (LEAD_ALPHA - TRACK_ALPHA) * nose) *
        body *
        lit *
        afford,
    );
    context.beginPath();
    context.moveTo(one.x, one.y);
    context.lineTo(two.x, two.y);
    context.stroke();
  }

  // The dot: a filled core inside a ring, so it reads as a place rather than a
  // blob — and it lands **on** the end of the track.
  const at = track.cross;
  context.globalAlpha = track.presence * OVERALL * LEAD_ALPHA;
  context.fillStyle = ION;
  context.beginPath();
  context.arc(at.x, at.y, DOT_RADIUS - DOT_RING, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = DOT_RING;
  context.strokeStyle = ION;
  context.beginPath();
  context.arc(at.x, at.y, DOT_RADIUS, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

/** The last sample that saves — where the track stops. */
function lastSaving(track: DeadlineView): number {
  for (let at = track.path.length - 1; at >= 0; at--) if (track.path[at]!.saves) return at;
  return -1;
}

/** The prototype's own easing between two ends, and the one `decay.ts` uses. */
function smoothstep(at: number): number {
  const x = Math.max(0, Math.min(1, at));
  return x * x * (3 - 2 * x);
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
  // `toward` names where the **wall** is — a fact about the world, and presentation
  // state's to state. Which side of the craft the word goes is the picture's
  // decision, and it is the far side. See [`SOS_OFFSET`](#sos_offset).
  const x = craft.x - SOS_OFFSET * sos.toward;

  // The plate first, so the word is read off it rather than off the boundary.
  const wide = context.measureText('SOS').width || SOS_SIZE * 2.4;
  const half = wide / 2 + PLATE_PAD_X;
  const tall = SOS_SIZE / 2 + PLATE_PAD_Y;
  context.fillStyle = dim(VOID, PLATE_STRENGTH);
  plate(context, x - half, craft.y - tall, half * 2, tall * 2, PLATE_RADIUS);
  context.fill();

  context.fillStyle = ION;
  context.fillText('SOS', x, craft.y);
  context.restore();
}

/**
 * A rounded rectangle, traced by hand.
 *
 * `roundRect` would do it in one call and is not used: it is the one Canvas2D
 * path method the census's stand-in would have to grow for, and
 * `test/census.test.ts` exists because a stand-in that lacks a call the renderer
 * makes throws where nothing is watching. Four arcs and four lines are things this
 * layer already draws everywhere.
 */
function plate(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  wide: number,
  tall: number,
  radius: number,
): void {
  const r = Math.min(radius, wide / 2, tall / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + wide - r, y);
  context.arc(x + wide - r, y + r, r, -Math.PI / 2, 0);
  context.lineTo(x + wide, y + tall - r);
  context.arc(x + wide - r, y + tall - r, r, 0, Math.PI / 2);
  context.lineTo(x + r, y + tall);
  context.arc(x + r, y + tall - r, r, Math.PI / 2, Math.PI);
  context.lineTo(x, y + r);
  context.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2);
  context.closePath();
}
