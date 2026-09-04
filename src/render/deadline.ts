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
 * The projected line and the window on it — **spec 03 §5's own grammar, and the
 * compass's**, in the compass's own two weights.
 *
 * ## ⚠ Rebuilt as a window, 2026-09-03
 *
 * > *"I want the deadline to look like the compass windows, because that's a
 * > familiar pattern. Take a look at the original prototype."* — author
 *
 * **The spec asked for this and what was built was a taper.** §5's first sentence
 * is *"the deadline is the compass inverted… same window-and-dot grammar the
 * player already reads"*, and its table has a **window** row and a **dot** row.
 * What M3.4 built instead was one continuous stroke swelling from a hairline at
 * the far end to a lead-in at the cross — a shape with no window in it, so the
 * one thing the player was meant to recognise was the one thing missing.
 *
 * So there are two marks now and they are [`drawRing`](./index.ts)'s two:
 *
 * | the compass | the deadline |
 * |---|---|
 * | the ring — the whole orbit, thin and even | the line — the whole projected path |
 * | the window — where a release arrives well | the window — where a press still saves |
 * | the dot — the best release | the dot — the last press that can |
 *
 * The widths are the compass's, so the resemblance is literal rather than
 * approximate: `RING_WIDTH` is 1 board pixel and `WINDOW_WIDTH` 3, and these are
 * those. **The prototype draws its own the same way** — a variable-width ribbon
 * in its hazard colour with the width carrying the meaning, and no casing under
 * it at all.
 */
const LINE_WIDTH = 1 * BOARD_PIXEL;
const WINDOW_WIDTH = 3 * BOARD_PIXEL;

/**
 * How loud the line is against the window — the compass's own ratio.
 *
 * `drawRing` puts its ring at E1 and its window at `WINDOW_AT_REST` rising to 1,
 * which is roughly a third against most of the way up. These are that, and the
 * line stays visible where no window is drawn so the path is never a broken
 * thing with gaps of nothing between its pieces.
 */
const LINE_ALPHA = 0.35;
const WINDOW_ALPHA = 1;

/**
 * How far back from the cross the window keeps its full weight, in design units
 * — **the prototype's 150 of its own, and the answer to a complaint that came
 * back.**
 *
 * ## ⚠ The window is long because saving is easy, 2026-09-03
 *
 * > *"Now the deadline is too long and crosses into the normal playfield. I feel
 * > like we should cap it to only appear when closer to the edge."* — author
 *
 * This is the same complaint as 2026-09-01 — *"it's really long, impacting my
 * normal playing field… within the main playfield I almost always have an
 * opportunity to save myself, so the bright red line is not helpful"* — and that
 * sentence turns out to be the measurement. Over the corpus the **window itself**
 * runs **p50 838 and p95 2 623** design units and reaches **p50 2 492** back from
 * the cross, against a picture 1 170 wide. The saveable stretch is long because
 * a press nearly anywhere on it still works, so the far end of it is a band
 * saying a thing that is almost always true.
 *
 * **Three levers were measured and two are wrong.** Tightening the lead ramp
 * ([`FADE_IN_SECONDS`](../state/deadline.ts)) from 2.63 s to 1 s shortens the
 * drawn track by 15% and costs **36% of the presses the author actually makes** —
 * the length is `distance / speed` and the lead is not, so gating on lead does
 * not bound length. Clamping the drawn length outright is what the prototype
 * already refused: *"a 150px clamp drew a segment sitting a quarter of a screen
 * ahead of the ship, touching nothing."*
 *
 * **What is left is weight, which is what 2026-09-01 ruled and M3.5 removed by
 * accident.** The window keeps its full width and strength over this distance
 * back from the cross and eases to the line's own weight beyond it — so the
 * decision is a compass window, and the stretch that merely says *"still
 * saveable"* is a thread. The connection to the craft survives, which is the
 * thing the clamp broke.
 */
const ARM = 150 * BOARD_PIXEL;

const OVERALL = 0.5;

/**
 * ## ⚠ The plate is gone, 2026-09-03 — it was hiding the thing it lit
 *
 * > *"I also don't love our dark background for the deadline, it's even harder to
 * > see what it is."* — author
 *
 * A VOID plate went under the track on 2026-09-02, and the measurement behind it
 * was right: at the line the wash composites to `rgb(157, 60, 105)` and the
 * track's lead-in to `rgb(159, 61, 107)`, the same three numbers, so the cue lost
 * 40% of its contrast exactly where the decision it marks is. The plate restored
 * the lead-in to 2.50:1 and moved nothing in the open field.
 *
 * **It answered the contrast and cost the shape.** A dark edging either side of a
 * 2.4-unit ink is a mark whose *widest* part is the casing, so what the eye finds
 * first is a dark line with something in it — and the complaint it caused is a
 * sharper one than the complaint it fixed: *hard to see* became *hard to see what
 * it is*.
 *
 * **What replaces it is width.** The window above is **9 design units** where the
 * track it replaces was 2.4 — nearly four times the ink, at the compass's own
 * weight. Contrast ratio is a property of two colours and is unchanged by that;
 * legibility is not, and a band four times wider is readable at a ratio a
 * hairline is not. ⚠ **Stated rather than assumed**: nobody has measured the wide
 * band against the wash the way the hairline was measured, and the honest test is
 * a flight along the edge. If it is still lost there, the answer is more likely
 * §5's own *luminance* row than a casing.
 *
 * The **SOS** keeps its plate. It is a word on a busy field and spec 00 §6's
 * ruling is about type; this was that ruling borrowed for a line, and the borrow
 * is what did not hold.
 */

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
export function drawDeadline(
  context: CanvasRenderingContext2D,
  track: DeadlineView,
  affordable = 1,
): void {
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
  // **Two passes, and they are the compass's two.** The line is the ring — the
  // path you are on, thin and even the whole way — and the windows are the
  // windows, fat and bright over the stretches where a press still saves. See
  // [`WINDOW_WIDTH`](#window_width).
  //
  // The line goes down first so a window is drawn *over* its own stretch of it,
  // which is the order `drawRing` uses for exactly the same two marks.
  const alphaAt = (at: number): number => {
    const away = (toCross[at]! + toCross[at + 1]!) / 2;
    // **Fuel, by luminance and never geometry** (spec 03 §5): the part of the
    // track the tank can afford stays lit and the rest goes faint, measured from
    // the craft — *"half a tank lights the early half."*
    //
    // ⚠ The fraction comes from the **tank**, which is the economy's and not the
    // picture's ([`fuel.ts`](../state/fuel.ts)), and it defaults to a whole
    // window so a caller with no economy — ZEN, and every test about the
    // geometry — draws the same shape. Nothing spends the tank on this build, so
    // this is 1 in play; see `fuel.ts`'s header for what it waits on.
    const along = 1 - away / Math.max(1e-6, toCross[0]!);
    return along <= affordable ? 1 : UNAFFORDABLE;
  };
  /**
   * One path per **run** of segments that share a strength, not one per segment.
   *
   * ⚠ **Per-segment strokes bead.** Consecutive segments share a round cap, so
   * every joint composites twice and a 9-unit window at alpha 0.5 reads as a
   * chain of dots rather than a band. The plate's own notice predicted exactly
   * this a day before the ink inherited it — *"if it reads as beading, the fix is
   * one path at a single width rather than one per segment"* — and at the
   * compass's window weight it is unmissable.
   *
   * A run ends where the strength changes, which is at a `saves` boundary or at
   * the fuel threshold, so the two things that vary along the track still do.
   */
  const runs = (want: (at: number) => number): void => {
    let from = 0;
    while (from + 1 < upto.length) {
      const strength = want(from);
      let to = from + 1;
      while (to + 1 < upto.length && want(to) === strength) to++;
      if (strength > 0) {
        context.strokeStyle = dim(ION, strength);
        context.beginPath();
        context.moveTo(upto[from]!.x, upto[from]!.y);
        for (let at = from + 1; at <= to; at++) context.lineTo(upto[at]!.x, upto[at]!.y);
        context.stroke();
      }
      from = to;
    }
  };

  context.lineJoin = 'round';
  context.lineWidth = LINE_WIDTH;
  runs((at) => OVERALL * track.presence * LINE_ALPHA * alphaAt(at));

  // **A window is where a press saves**, and the gaps between them are not drawn
  // at all rather than drawn faint. Spec 03 §5's own notice rules the window
  // **plural** — 8% of doomed drifts hold more than one — so what the gaps have
  // to do is separate two windows, which absence does better than a dimmer copy
  // of the same band.
  //
  // The weight rides [`ARM`](#arm): full at the cross, the line's own beyond it.
  // Width has to be a property of the *run* rather than of each segment, because
  // one `lineWidth` covers a whole path — so a run is cut where the weight has
  // moved by a step the eye could find, and `near` is that step.
  const near = (at: number): number => {
    const away = (toCross[at]! + toCross[at + 1]!) / 2;
    const held = Math.max(0, Math.min(1, 1 - away / ARM));
    // Quantised so a smooth ramp does not become one path per segment, which is
    // what beaded before. Eight steps over the arm is finer than the eye.
    return Math.round(held * 8) / 8;
  };
  for (let step = 0; step <= 8; step++) {
    const at = step / 8;
    context.lineWidth = LINE_WIDTH + (WINDOW_WIDTH - LINE_WIDTH) * at;
    runs((seg) =>
      upto[seg]!.saves && upto[seg + 1]!.saves && near(seg) === at
        ? OVERALL * track.presence * (LINE_ALPHA + (WINDOW_ALPHA - LINE_ALPHA) * at) * alphaAt(seg)
        : 0,
    );
  }

  // The dot: a filled core inside a ring, so it reads as a place rather than a
  // blob — and it lands **on** the end of the track.
  const at = track.cross;
  context.globalAlpha = track.presence * OVERALL;
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
