/**
 * The dust: sparse motes hanging in the field, and the layer that says **world
 * speed** in a currency nothing else uses.
 *
 * Spec [05 · §2](../../docs/spec/05-field.md)'s stack puts DUST between the SKY
 * and the STRATA at α **0.1 – 0.3**, E0, *"world speed, strictly parallel fall"*,
 * with two sentences under the table: *"dust streak length grows with speed and
 * its α falls as it stretches, so a fast field streaks and a slow one stipples"*,
 * and *"density rises gently with chain level — a hot run flies through a
 * livelier field."*
 *
 * ## It cannot have a speed of its own, and that is structural
 *
 * The [starfield](./starfield.ts) is the one thing in this game that does not
 * move at world speed, and it manages that by being drawn in **screen** space
 * with the camera applied at a fraction. This is drawn in **world** space, like
 * the [rungs](./rungs.ts), and a mote's position is a pure function of the seed:
 * no camera term appears in it anywhere. So *"every dust mote's velocity equals
 * every other dust mote's velocity"* is not a number that has to be checked, it
 * is a thing the arithmetic cannot express a violation of — the motes do not
 * move at all, and what moves is the picture.
 *
 * The exemption spec 05 §2 was given on 2026-08-30 covers the **sky and only the
 * sky**, which is that file's own header and the plan's: *"everything in the list
 * above is unaffected and still moves at world speed."* `test/render/dust.test.ts`
 * is `test/render/starfield.test.ts` with its first assertion turned back the
 * right way up.
 *
 * ## Where it ranks, and the rank was decided before the alpha
 *
 * **Three systems now say *speed* and they say it in three different
 * currencies**, which is what makes a third one safe to add. The rungs say it as
 * a **rate** — one crossing every 254 ms at the author's median world speed, 121
 * at their p05, and *"the rungs still travel by too quickly"* is a complaint
 * about exactly that rate (`docs/plan/m3-the-field.md`, parked). The sky says it
 * as a **ratio**, the same motion at a fifth and a twenty-fifth. This says it as
 * a **length**: a mote is one frame's motion blur, so how far it smears *is* how
 * fast the world is going, read off one frame without waiting for a second.
 *
 * **And the length is bounded by the rungs, which is the one place the two
 * layers are coupled.** A perpendicular mark spanning the gap between two
 * parallel lines is masonry, and the author flew exactly that on the first
 * build — *"with the rungs they look like bricks."* See
 * [`DUST_EXPOSURE`](#dust_exposure).
 *
 * So the answer to *does dust make the crossing-rate complaint worse* is **no,
 * and it may help**, and the reason is arithmetic rather than hope. At 21 motes a
 * screen a mote crosses the top edge every 383 ms at the author's median world
 * speed against the rungs' 254 — half again as slow, scattered across the width
 * instead of arriving as one line, and three design units wide against a rung's
 * full 1 170. A second thing ticking at the rate that was complained about would
 * have been the wrong thing to build; a thing that answers the same question
 * without ticking is the reason the spec put it in the stack.
 *
 * **Rank: behind the rungs, in front of the sky**, which is spec 05 §2's own
 * order. It is spent in **ink** rather than in alpha, because ink is what the eye
 * ranks: over a screen the rungs lay down about 45 000 design units² at α 0.16
 * and 0.28, this lays down about 1 300 at α 0.1 – 0.3, and the sky about 2 400 at
 * α 0.12 – 0.32. The alphas overlap and the loudness does not, which is why the
 * spec could state a dust range that straddles the rungs' two values without
 * contradicting its own stack.
 *
 * ## What is carried from Direction 05's live component, and what is not
 *
 * The board is the only place in the project dust has ever been drawn, and every
 * number below is its own, converted (ADR-0013). Two things are deliberately not
 * carried:
 *
 * **Its colour.** The board draws motes at `rgba(169,163,201,…)` — DUSK lifted
 * about half way to INK — where it draws its rungs at DUSK exactly, so it
 * separates the two layers by lightness. This separates them by ink and by shape
 * instead, and takes **DUSK**: spec 05 §2 puts dust at E0, and E0 · STRUCTURE is
 * DUSK in [`energy.ts`](../state/energy.ts)'s own table, which names dust in that
 * row. Spec [00 · §1](../../docs/spec/00-tokens.md) allows a renderer no colour
 * of its own, and a ninth grey would need an argument this does not have — the
 * sky's ramp has one (a *depth* cue needs a ramp) and a flat layer does not. At
 * α 0.3 DUSK over VOID is 39/36/64 against a plain rung's 26/23/43, so the
 * brightest mote still reads in front of the field it falls through.
 *
 * **Its butt line cap**, which makes the board's dust vanish as the climb slows.
 * Spec 05 §2 asks for the opposite — *"a slow one **stipples**"* — so the caps
 * are round and a stationary field is a field of dots.
 */
import { BOARD_PIXEL, DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import { RUNG_SPACING } from '../state/rung.ts';
import type { CameraView, CorridorView } from '../state/types.ts';
import type { Seen } from './letterbox.ts';
import { DUSK } from './palette.ts';
import { rng } from './seed.ts';

/**
 * How many motes are in a picture — **21, and it is the board's density rather
 * than its count.**
 *
 * Direction 05's live component scatters **16** over a 410 × 620 frame. That
 * frame is 0.772 of the design space's own area once both are put in board
 * pixels (390 × 844), so matching what the eye sees means 16 ÷ 0.772 = 20.7.
 * This is the same correction [`STAR_COUNT`](./starfield.ts) records making the
 * other way round, and the same trap: a count carried across two frames of
 * different sizes is a density silently changed.
 *
 * ## ⚠ 40, ruled on the bench on 2026-09-01
 *
 * **The board's density was the opening position and the author has now measured
 * against the running game instead**, which is the whole point of a bench: 21 is
 * what Direction 05 draws in a still frame, and this field moves. Nearly twice
 * it, flown alongside a doubled alpha and a halved sky in one sitting.
 *
 * The layer's ceiling follows it, because [`DUST_CEILING`](#dust_ceiling) is
 * stated as a multiple of this rather than beside it — so a hot run still tops
 * out at twice the field at rest, and it now takes 40 links of chain to get
 * there rather than 21.
 */
export const DUST_PER_SCREEN = 40;

/**
 * How many pictures tall the field is before it repeats.
 *
 * **Eight, where the sky needs two, and the difference is the whole point of
 * this layer.** The starfield gets away with two because parallax slows it: its
 * fastest tier needs ten screens of climb to bring the same star back. Dust moves
 * at world speed, so a tile is a tile — the pattern returns after exactly its own
 * height of climb. Eight pictures is **6 752 m**, which clears the whole of the
 * fixture field's 6 828 m foot-to-top-body, so a mote a player has seen once does
 * not come back inside a run.
 *
 * It costs `DUST_CEILING × DUST_TILES` objects at construction and nothing per
 * frame: the draw walks only what a picture can hold.
 */
export const DUST_TILES = 8;

/** How tall that tile is, in design units. */
export const DUST_FIELD = DESIGN_HEIGHT * DUST_TILES;

/**
 * The five brightnesses, and they are the board's `0.1 + (i % 5) * 0.05`
 * exactly — which is spec 05 §2's α 0.1 – 0.3 in five equal steps.
 *
 * A mote takes its band from its **index**, as the board's does, so the five are
 * equally populated and stay equally populated as the chain grows the count. It
 * is the one property of the field that is not drawn from the seed, and it is
 * left that way on purpose: brightness is the only thing about dust the spec
 * says varies, so leaving it to chance would be the one place a bad seed could
 * make the layer look wrong.
 */
const DUST_ALPHAS = [0.1, 0.15, 0.2, 0.25, 0.3] as const;

/**
 * How long the shutter is open, in ticks — **one, and the board's own 0.09 was
 * flown and refused.**
 *
 * ## What the board says, and why its number could not cross
 *
 * Direction 05 draws its streaks `len = min(64, speed * 0.09)` with `speed` in
 * pixels per second and `len` in pixels. A number that turns a speed into a
 * length **is a time**, and 0.09 s is an exposure: a streak is how far the mote
 * travelled while the shutter was open. That reading is right and it is what this
 * constant still is. What did not survive is its **value**, because it was
 * authored against a climb this game does not have.
 *
 * The board's own `climbSpeed` runs 10 – 140 board pixels a second and sits at
 * **46** by default. This game's world speed, measured over the author's
 * replayable dispatches, runs **138 at p50, 403 at p95 and 568 at the fastest
 * tick anyone has flown** — so the game's *median* is the board's slider maximum
 * and its fast ticks are four times past it. Carrying 90 ms drew a streak three
 * to twelve times longer than anything Direction 05 has ever shown. It is exactly
 * the failure [`starfield.ts`](./starfield.ts)'s star sizes record: a number
 * carried without the regime it was measured in.
 *
 * ## And what it looked like, flown
 *
 * > *"I don't like the star streaks you've added at speed. With the rungs they
 * > look like bricks."* — author, 2026-09-01
 *
 * **That is a geometry rather than a taste, and it is the rungs that make it.**
 * A long perpendicular mark between two parallel lines is a mortar joint, and the
 * field is parallel lines every [`RUNG_SPACING`](../state/rung.ts) — 150 design
 * units. At 90 ms the streak reached **101 units at p95 and 142 at the fastest
 * tick**: two thirds to nearly all of a gap, drawn square across it. Masonry.
 *
 * ## One tick, which is what a shutter open for the whole frame records
 *
 * The honest end of the same argument. A camera whose shutter is open for the
 * whole of a frame and no longer records exactly the motion of that frame, so the
 * streak becomes the mote's own displacement between two ticks — the smallest
 * exposure that is still an exposure, and the only one that needs no number at
 * all. At the fastest tick anyone has flown it draws **28 design units against a
 * 150-unit gap: 19%**, and at the median **7 units, under 5%.** A tick mark
 * rather than a joint.
 *
 * It is on the bench, at **zero to a stipple and up to the board's own 90 ms**,
 * because where between those two the field should sit is a judgement about a
 * moving picture and the author has now made it once.
 *
 * ## ⚠ 1.25, ruled on the bench on 2026-09-01
 *
 * A quarter more than one frame's motion blur, which is small in itself and
 * moves one thing that matters: **the brick cap now binds.** At 1.25 a streak
 * reaches [`DUST_STREAK_CAP`](#dust_streak_cap) — a fifth of a rung's spacing —
 * once world speed passes 24 design units a tick, which is about the top 2% of
 * the author's own ticks. So the guard has stopped being theoretical and is
 * doing the job it was written for on the fastest dives, where the brickwork was
 * reported in the first place.
 */
export const DUST_EXPOSURE = 1.25;

/**
 * The longest a streak may draw, in design units — **a fifth of a rung's
 * spacing**, and it is the brick rule written down.
 *
 * The board's own cap is 64 of its pixels against rungs 46 apart, so it permits a
 * streak **1.4 times a whole gap** — which it never reaches, because at its
 * default climb it draws 4. This field is faster than the board's slider goes, so
 * the cap has to be the thing the board's slowness was doing for it: a mark
 * across a gap between two parallel lines reads as masonry, and a fifth of a gap
 * is a tick.
 *
 * **It is a guard rather than a shape.** At one tick's exposure the fastest tick
 * in the author's whole corpus draws 28 against this 30, so nothing flown reaches
 * it — what it guards against is a game that gets faster, which is exactly what
 * happened to the number it replaces.
 *
 * It is stated against the rungs and not in board pixels on purpose: the two are
 * the same picture and the relationship between them is the thing that matters.
 * Move `RUNG_SPACING` on the bench and this follows.
 */
const DUST_STREAK_CAP = RUNG_SPACING / 5;

/**
 * How fast a streak dims as it stretches, and how dim it may get — the board's
 * `max(0.45, 1 - len / 90)`, kept as its **ratio to the cap** rather than as its
 * number.
 *
 * The exposure argument again, from the other end: a long exposure spreads the
 * same light over more of the frame, so a mote that smears has to fade. Without
 * it a fast field is a brighter field, which would make dust a second reading of
 * speed **in brightness** — and brightness is spec 00 §3's ordinal channel and is
 * spoken for.
 *
 * The board reaches its floor at 77% of its own cap, and holding that ratio is
 * what keeps the fade meaning the same thing now the cap has moved. Measured
 * against the author's own world speeds it dims the field to 0.84 at the median,
 * **0.52 at p95** and the floor at the fastest tick — a real dimming with speed
 * where the board's own number, against this cap, would have been inert.
 */
const DUST_STREAK_FADE = (DUST_STREAK_CAP * 90) / 64;
const DUST_STREAK_FLOOR = 0.45;

/**
 * How wide a mote is, in design units — the board's 1 px line, at the factor
 * every other board number in this repo is carried at.
 *
 * With a round cap this is also the diameter of a mote at rest, so *"a slow one
 * stipples"* is a three-unit dot — see [`DUST_STILL`](#dust_still), without
 * which it is nothing at all.
 *
 * ## ⚠ It is the suspect, 2026-09-01 — *"I don't really notice the dust"*
 *
 * Measured on the author's own phone geometry (393 css wide at dpr 3, so one
 * design unit is very nearly one device pixel), **three design units is one CSS
 * pixel**, and a mote at the median world speed is a mark about **1 × 2 CSS
 * pixels at α 0.1 – 0.3**.
 *
 * Two comparisons say that is too small rather than merely small:
 *
 * - **The starfield was already refused at this size.** Its first build drew
 *   stars 0.7 – 2.7 design units across and came back as *"tiny specks of white
 *   with little to no variation"*; the fix was 2.4 – 6.4
 *   ([`starfield.ts`](./starfield.ts)). Three sits at the bottom of the range
 *   that replaced it.
 * - **The layer is behind the one it is supposed to be in front of.** Counting
 *   ink — area × alpha over a picture, at the median world speed — the rungs lay
 *   down about 8 300 design units², the sky about 680, and the dust about
 *   **125**. Spec 05 §2's stack puts DUST in *front* of SKY, and at a fifth of
 *   the sky's ink it is not.
 *
 * **The alpha is not the thing to move**, which is why this is on the bench and
 * not a quiet edit: spec 05 §2 states α 0.1 – 0.3 in two places and the board
 * says it a third time, so the number the design fixed is the one number that
 * should be argued with last. A width the design never states is the honest
 * place to look first, and it is [`STAR_STRENGTH`](./starfield.ts)'s own lesson
 * one layer forward — *"it is an alpha and not a size"* was right there because
 * the sky was too **loud**, and the same argument run backwards says a layer
 * that is too quiet wants its size.
 */
export const DUST_WIDTH = 1 * BOARD_PIXEL;

/**
 * The shortest a streak may draw, in design units — **a quarter of a mote's
 * width, and it exists because a canvas will not paint nothing.**
 *
 * ## ⚠ The layer vanished at rest, 2026-09-01, and this file claimed it did not
 *
 * Reported: *"some of the dust disappears when I finally circularize my
 * orbit."* The author guessed at the bottom third of the screen; it is not that
 * — measured over their run, the **count of motes drawn never drops** (33 to 50
 * every tick, which is only which of them are in the band). What drops is the
 * **length**.
 *
 * A settled orbit is the one place in the game where the world stops: the camera
 * locks on a still point and `worldSpeed` goes to **0.00 at p25 and at p50** of
 * every orbiting tick. At zero the streak is `moveTo(x, y); lineTo(x, y)` — a
 * degenerate subpath — and although the canvas specification says a zero-length
 * subpath under a round cap paints a circle, browsers in practice skip it,
 * especially as one subpath among forty in a single stroked path. Over that run
 * **34% of ticks drew every mote as nothing.**
 *
 * [`DUST_WIDTH`](#dust_width)'s own note claimed the opposite — *"a slow one
 * stipples is a three-unit dot"* — and was a claim about what a canvas does that
 * had never been checked on one. `test/render/dust.test.ts` now asserts no drawn
 * segment is ever zero-length, which is the shape of the thing that was missing:
 * a test of the claim rather than of the intent.
 *
 * **A quarter of the width** is the smallest length that is unambiguously not
 * zero at any scale the letterbox produces, and it is far under the width, so
 * what it draws is a capsule three units across and three and three-quarters
 * long. That is a dot. It is not a floor on the *fade* — a mote at rest keeps its
 * full alpha, because spec 05 §2 asks a slow field to stipple rather than to go
 * out.
 */
const DUST_STILL = DUST_WIDTH / 4;

/**
 * The most motes a picture may hold, however long the chain runs — **twice the
 * resting field.**
 *
 * Spec [08 · §4](../../docs/spec/08-economy.md)'s own open question is *whether
 * the chain has a ceiling*, and it is unanswered, so this layer needs one of its
 * own: at one mote a link an uncapped chain eventually stops being **sparse**,
 * which is the first word spec 05 §2 uses about dust. Doubling is where it
 * stops, and the number falls out of the base rather than being chosen beside
 * it: reaching twice the resting field takes as many links as there are motes in
 * a picture, whatever that number has been ruled to.
 *
 * It is also what the layout is sized for: the draw walks a prefix of a field
 * built to this, so the ceiling costs its objects once at construction and
 * nothing per frame.
 */
export const DUST_CEILING = DUST_PER_SCREEN * 2;

/**
 * How many more motes a picture holds per link of **chain** — an **opening
 * position**, and it is one mote.
 *
 * Spec 05 §2 says *"density rises gently with chain level"* and states no number,
 * the board says *"a hot run flies through a livelier field"* and states no
 * number, and there is no chain to measure against ([`chain`](../state/types.ts)
 * is a named zero until M4). So this is a plausible round number existing so
 * there is something to measure, exactly in `docs/spec/README.md`'s third sense,
 * and it says so.
 *
 * One is chosen because it is the smallest change that is a change, and because
 * *gently* is easier to argue for as a count than as a fraction: **one more mote
 * per screen per link** is a sentence a player could in principle verify, where
 * "5% denser" is not. At chain 0 the field is exactly the board's, and at 21 it
 * has doubled and stopped ([`DUST_CEILING`](#dust_ceiling)).
 */
const DUST_PER_CHAIN = 1;

/**
 * How much of that brightness the dust actually gets — **1, which is spec 05
 * §2's α unmodified.**
 *
 * It exists because the sky needed exactly this knob within a day of landing and
 * for exactly this reason. `STAR_STRENGTH` went to 0.4 on the first flight with
 * the rungs in — *"much less noticeable. I still want it there, but only as
 * background noise"* — and dust is a **third** system saying *speed* arriving
 * beside two that have already been ranked against each other once. Where it
 * should sit against the rungs is a judgement about a moving picture on a phone,
 * which is [AGENTS.md](../../AGENTS.md) §6's argument for a bench rather than for
 * a setting.
 *
 * **One multiplier and not five alphas**, which is `STAR_STRENGTH`'s own
 * argument: the five are a ramp, and editing them individually lets the ramp
 * drift while nobody is looking at it.
 *
 * ## ⚠ 2, ruled on the bench on 2026-09-01 — and it overruns the spec's own range
 *
 * It shipped at 1 — spec 05 §2's α 0.1 – 0.3 exactly, because that is a number
 * the design states in two places and the board a third, and the last thing to
 * argue with. The author flew it and doubled it: **the drawn range is now α 0.2 –
 * 0.6.** The spec's row is overrun rather than reinterpreted, which is why it
 * carries a ⚠ in §2 rather than a quiet edit.
 *
 * **What was actually wrong was the presence of the layer, not the opacity of a
 * mote**, and the author reached it by a different lever than the measurement
 * suggested. *"I don't really notice the dust"* — measured, a mote is one CSS
 * pixel by two on their phone, and this file's own argument was that the honest
 * fix is [`DUST_WIDTH`](#dust_width), a number the design never states. The width
 * is untouched at 3 and the alpha doubled instead. **It is still the cheaper
 * lever if this ever needs to come back under the spec's range**, and it is on
 * the bench for that.
 */
export const DUST_STRENGTH = 2;

/**
 * How many pictures wide a corridor the field is laid out to cover — **two**.
 *
 * ## ⚠ The tile used to be one picture wide, and the camera pans now
 *
 * Until 2026-09-01 the field was laid out across `DESIGN_WIDTH` and hung on the
 * corridor's centreline, on the reasoning this file recorded: *"the two are the
 * same place today — the camera never pans sideways."* The camera pans since,
 * and a tile a picture wide inside a corridor **1.9 pictures** wide has an edge
 * in it: at the wall the player would see the dust simply stop, 315 design units
 * before the line.
 *
 * So the field is laid out across the **corridor**, in normalised `x`, and the
 * count scales with the corridor's own width so that
 * [`DUST_PER_SCREEN`](#dust_per_screen) keeps meaning *motes in a picture*
 * rather than becoming motes in a corridor.
 *
 * **Two, because spec [17 · §4](../../docs/spec/17-daily-field.md)'s corridor
 * only narrows.** It runs the half-width 480 → 300 m with altitude, and the one
 * this field is flown in is 370.5 m — 1.9 pictures — so two is above every
 * corridor the design describes. It costs its objects once at construction and
 * nothing per frame; a corridor wider than this would draw a sparser field
 * rather than a broken one.
 */
export const DUST_WIDEST = 2;

/** One mote, in the tile's own coordinates. It has no velocity, by construction. */
export interface Mote {
  /**
   * Across the **corridor**, 0 to 1.
   *
   * A fraction rather than a length because the corridor's width is a property
   * of the field and this field is laid out once, at module load, before any
   * field exists — see [`DUST_WIDEST`](#dust_widest).
   */
  readonly x: number;
  /** Down the tile, 0 to `DUST_FIELD`. */
  readonly y: number;
}

export type Dust = readonly Mote[];

/**
 * A field of dust, laid out from a **render** seed ([`seed.ts`](./seed.ts)) — the
 * same generator the sky uses and deliberately not the simulation's, so a mote
 * costs the run nothing.
 *
 * Laid out in **design units across and design units down**, never in device
 * pixels, which is the prototype's most expensive lesson and the starfield's
 * header carries it: a field placed in viewport units teleports on a resize and
 * changes density with the screen.
 *
 * **In seed order, and the order is load-bearing.** The chain grows the field by
 * drawing a longer prefix of this list, so a mote that was there stays exactly
 * where it was and the new ones are a uniform sample of the rest. The
 * alternative — re-laying the field out at a new count — would teleport every
 * mote in the picture on the tick a swing connected.
 */
export function dust(seed: number): Dust {
  const next = rng(seed);
  const motes: Mote[] = [];
  for (let i = 0; i < DUST_CEILING * DUST_TILES * DUST_WIDEST; i++) {
    motes.push({ x: next(), y: next() * DUST_FIELD });
  }
  return motes;
}

/**
 * How many motes are drawn at this chain level.
 *
 * Bounded by [`DUST_CEILING`](#dust_ceiling) rather than by the length of the
 * array, so the cap is a stated rule about the layer and not an accident of how
 * many motes happened to be laid out.
 */
export function moteCount(dust: Dust, chain: number, across: number): number {
  // **Scaled by how many pictures wide the corridor is**, so the constant keeps
  // meaning *motes in a picture*: a field laid out over 1.9 pictures of width at
  // the same count would be 1.9× sparser than the number says.
  const pictures = across / DESIGN_WIDTH;
  const wanted = (DUST_PER_SCREEN + chain * DUST_PER_CHAIN) * DUST_TILES * pictures;
  // **The ceiling scales with the corridor and the array does not**, and the two
  // must not be confused: the array is laid out for the *widest* corridor
  // ([`DUST_WIDEST`](#dust_widest)) so that a knob has somewhere to go, and the
  // ceiling is a stated rule about *this* field. Leaving the array length to do
  // the capping is what `DUST_CEILING`'s own note warns against — *"the cap is a
  // stated rule about the layer and not an accident of how many motes happened
  // to be laid out"* — and in a corridor narrower than the widest it caps at the
  // wrong number.
  const ceiling = DUST_CEILING * DUST_TILES * pictures;
  return Math.min(dust.length, Math.round(Math.min(wanted, ceiling)));
}

/**
 * Draw the dust, in **world space**, between the sky and the rungs.
 *
 * The caller is expected to have translated into the world already — the same
 * state [`draw`](./index.ts) is in when it draws a rung — and `seen` is what the
 * device can show, in design coordinates.
 *
 * `worldSpeed` is the only thing here that changes between frames, and it is
 * spent on the streak alone: it moves no mote, because a mote does not move.
 */
export function drawDust(
  context: CanvasRenderingContext2D,
  dust: Dust,
  camera: CameraView,
  corridor: CorridorView,
  worldSpeed: number,
  chain: number,
  seen: Seen,
): void {
  // `seen` is in design coordinates and this draws in world ones. The design
  // space is centred on the camera, so the two differ by exactly that offset —
  // the same conversion [`rungs.ts`](./rungs.ts) opens with.
  const top = seen.top + camera.y - DESIGN_HEIGHT / 2;
  const bottom = seen.bottom + camera.y - DESIGN_HEIGHT / 2;

  // The tile hangs on the **corridor** rather than on the camera, which is what
  // keeps a mote's position free of any camera term — and it spans the corridor
  // rather than a picture, which is what the camera panning made necessary
  // ([`DUST_WIDEST`](#dust_widest)).
  //
  // A field with no sides falls back to the design space: `check-portability`
  // builds a corridor of infinite half-width on purpose, and an infinite tile
  // puts every mote at `NaN`. It is the same guard [`hasRungs`](../state/rung.ts)
  // exists for and the same field that found it.
  const across = Number.isFinite(corridor.halfWidth) ? corridor.halfWidth * 2 : DESIGN_WIDTH;
  const from = corridor.centreline - across / 2;

  // **And culled sideways**, which the field being one picture wide used to make
  // unnecessary. It spans the corridor now — 1.9 pictures — so without this a
  // frame pays for nearly twice the motes it can show and the clip throws the
  // rest away. The same conversion as the vertical bounds above: `seen` is in
  // design coordinates and this draws in world ones.
  const left = seen.left + camera.x - DESIGN_WIDTH / 2;
  const right = seen.right + camera.x - DESIGN_WIDTH / 2;

  // A long exposure, and the trail points back the way the world came from: up
  // the picture while the craft climbs, down it while the craft falls.
  const travel = worldSpeed * DUST_EXPOSURE;
  const capped = Math.max(-DUST_STREAK_CAP, Math.min(DUST_STREAK_CAP, travel));
  // Never exactly zero, and never shorter than a dot — see [`DUST_STILL`](#).
  // The sign is the world's while it is moving and arbitrary while it is not,
  // which is the one case where the direction cannot be read off anything.
  const streak = Math.abs(capped) >= DUST_STILL ? capped : capped < 0 ? -DUST_STILL : DUST_STILL;
  // Dimmed by what the mote actually **travelled**, not by the length it is
  // drawn at: the floor below exists so a canvas paints a still mote at all, and
  // a drawing minimum must not be read as motion. Without this a stationary
  // field is 2% dimmer than a barely-moving one, for a reason that is about
  // subpaths rather than about speed.
  const stretched = Math.max(DUST_STREAK_FLOOR, 1 - Math.abs(capped) / DUST_STREAK_FADE);

  const shown = moteCount(dust, chain, across);

  context.save();
  context.lineWidth = DUST_WIDTH;
  // Round, so a field the world has stopped passing stipples rather than
  // disappearing — see [`DUST_WIDTH`](#dust_width).
  context.lineCap = 'round';
  context.strokeStyle = DUSK;
  for (let band = 0; band < DUST_ALPHAS.length; band++) {
    context.globalAlpha = DUST_ALPHAS[band]! * stretched * DUST_STRENGTH;
    context.beginPath();
    // A mote's band is its index modulo five, so one pass per band touches each
    // mote exactly once and the whole layer costs five strokes rather than one
    // per mote. `globalAlpha` and `strokeStyle` are context state; a per-mote
    // alpha would be a state change per mote, which is the same argument the sky
    // makes for quantising its own brightness into three.
    for (let i = band; i < shown; i += DUST_ALPHAS.length) {
      const mote = dust[i]!;
      // The one line in this file that decides the layer's speed, and there is no
      // camera in it: the mote sits at a fixed world position and the wrap only
      // chooses **which** repeat of the tile is the one in front of the picture.
      const y = top + wrap(mote.y - top, DUST_FIELD);
      if (y > bottom) continue;
      const x = from + mote.x * across;
      if (x < left || x > right) continue;
      context.moveTo(x, y - streak);
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

/** Positive remainder, so a field a long way up the world still wraps forwards. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}
