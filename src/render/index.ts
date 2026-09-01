/**
 * The renderer: pixels, and the interpolation between ticks. Nothing else
 * (ADR-0006).
 *
 * This is the one layer permitted to touch the browser, which is why `pnpm
 * portable` scans `src/sim/`, `src/state/` and `src/input/` and deliberately
 * does not scan here. The boundary that matters in this direction is the other
 * one, and no import scan will catch it: **the renderer draws presentation state
 * and asks the simulation nothing.** Anything it needs to know that it cannot
 * read off a [`PresentationState`](../state/types.ts) is a field that belongs in
 * that file, derived in [`derive.ts`](../state/derive.ts), and assertable
 * without a canvas — a renderer that reached into `SimState` for the held body
 * or the orbit's phase would have broken ADR-0006's promise with nothing
 * failing. `test/render/boundary.test.ts` is what fails instead.
 *
 * ## What it draws, and what it deliberately does not
 *
 * Circles and lines: the sky, a disc and a rim for every body, a ring at the
 * floor of the one being held, and a dart for the craft. **No compass and no
 * HUD** — [M1.6](../../docs/plan/m1-the-swing.md) exists to make the swing
 * flyable so the author can judge whether it feels right, and every instrument
 * drawn before that judgement is an instrument built on an untested premise. The
 * compass is [M2.3](../../docs/plan/m2-the-instrument.md)'s; the tide, the
 * strata and the identity hues are M2.2's.
 *
 * What M2.1 added is the one thing that could not wait for them: **the ordinal
 * channel**. Every energy in spec [00 · §3](../../docs/spec/00-tokens.md) is a
 * bloom radius on presentation state now, so this file paints a glow it is told
 * the size of rather than deciding one — and the author can see a radius move on
 * the bench, which is the only way a radius ever gets ruled.
 *
 * The colours are the palette's even though the shapes are crude, because spec
 * [00](../../docs/spec/00-tokens.md)'s acceptance is a lint and a lint does not
 * care how early it is: VOID for the sky, CORE for the craft, DUSK for
 * structure. Where this file needs to say *more* — a held body against a body at
 * rest — it says it in brightness, which §3 makes the only ordinal channel in
 * the game.
 */
import { BOARD_PIXEL, DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import type {
  ArrivalView,
  BodyState,
  BodyView,
  CalloutView,
  CompassView,
  Energy,
  FlashView,
  KnockView,
  PresentationState,
  RingView,
  SightingView,
  TideView,
  Tier,
} from '../state/types.ts';
import { fade } from '../state/decay.ts';
import { SPEAKS } from '../state/callout.ts';
import { letterbox, visible } from './letterbox.ts';
import { drawStarfield, starfield } from './starfield.ts';
import { drawDust, dust } from './dust.ts';
import { drawAnomaly } from './anomaly.ts';
import { drawRungs } from './rungs.ts';
import { boundaryMotes, drawBoundary } from './boundary.ts';
import { drawDeadline, drawSos } from './deadline.ts';
import {
  BODY_FILL,
  CORE,
  dim,
  DUSK,
  identity,
  identityRising,
  ION,
  LUMEN,
  SOLAR,
  VOID,
} from './palette.ts';

/**
 * The sky, laid out once for the life of the module.
 *
 * **A constant seed**, so every player and every replay of a run sees the same
 * sky. It could as easily be a per-session number and is not, for the same reason
 * `pnpm replay` exists: a screenshot of a bug should be reproducible from the
 * recipe alone, and a sky that differed between two runs of the same recipe would
 * be one more thing to rule out. It is a **render** seed and touches nothing the
 * simulation can see.
 */
const SKY = starfield(0x5eed);

/**
 * And the **dust** in front of it, from the same render seed and for the same
 * reason ([`dust.ts`](./dust.ts)): nothing about a mote is derived from the
 * simulation, nothing about it decays, and the field is fixed at construction.
 *
 * A *different* seed from the sky's, so that the two layers cannot correlate — one
 * generator run twice from one seed would put a mote wherever the 321st star was.
 */
const DUST = dust(0xd057);

/**
 * And the **boundary's** motes, from a third render seed for the third time the
 * same argument applies ([`boundary.ts`](./boundary.ts)).
 *
 * Distinct from the dust's, so the edge's motes and the field's cannot line up:
 * one generator run twice from one seed would put a boundary mote at the same
 * altitude as every dust mote, and the two layers are supposed to read as two
 * things.
 */
const BOUNDARY = boundaryMotes(0xed6e);

/**
 * How far above a body's surface its floor sits, in design units.
 *
 * The renderer's own copy of a number the simulation also holds, and it is drawn
 * rather than derived because it is drawn *crudely*: this ring exists so the
 * author can see the one guarantee a grab makes being kept (`CONTEXT.md`:
 * floor). If the floor becomes something the player is meant to read — spec
 * [04](../../docs/spec/04-bodies.md)'s tide is drawn against it — it stops being
 * a constant here and becomes a field on [`BodyView`](../state/types.ts), for
 * the reason the header gives.
 */
const FLOOR_GAP = 36;

/**
 * How a body is painted in each of its four states — spec
 * [04 · §3](../../docs/spec/04-bodies.md)'s table, transcribed.
 *
 * `rim` is in **board pixels** because §1's scale rule is written in them and is
 * the point: *"rim 2.5px and tide 4px are constant in design px regardless of
 * body radius"*, so small bodies read as bright rings and giants as thin
 * luminous horizons. Everything else here is an alpha.
 *
 * AHEAD's rim width is §1's base, because §3 gives a width for the other three
 * and not for it.
 *
 * ## The rim strengths are the author's, 2026-08-30, and they moved
 *
 * *"Make the planet ring colour a bit less bright when it's not grabbed, and then
 * toggle it to the current colour when I do grab. That'll help visually identify
 * the grabbed planet."*
 *
 * **The fault was IN_REACH and not HELD.** Spec 04 §3 puts a body in reach at
 * **85%** and a held one at **100%** — fifteen points apart, on rims 2.25px and
 * 2.5px wide. In a field where several bodies are in reach at once, that is not a
 * distinction the eye can make at a glance while flying, and the one thing the
 * compass draws itself around was the hardest thing on screen to pick out. So
 * HELD does not move at all: what changed is the gap under it, from 1.18× to
 * **1.82×**.
 *
 * `RIM_AT_REST` is trimmed with it — the author asked for *"not grabbed"* rather
 * than for one state — but only a little, and deliberately: it is the number they
 * themselves asked to be able to move and set at 40%, and spec 04 §3 guards it
 * with *"the field ahead must read as a constellation of dim coloured rings,
 * never a row of grey balls."* 34% keeps AHEAD → IN_REACH a clear step (1.6×)
 * while taking a little of the glare out of a crowded field.
 */
const RIM_AT_REST = 0.34;

/**
 * A body in reach, and the whole point of the number is the distance **below**
 * HELD rather than its own value. See `RIM_AT_REST` above.
 */
const RIM_IN_REACH = 0.55;

interface Look {
  /** Rim stroke width, in board pixels (§1's scale rule). */
  readonly rim: number;
  readonly rimStrength: number;
  /** The outer stratum's alpha; the inner takes §1's ratio of it. */
  readonly strata: number;
  readonly core: number;
  /**
   * How much of the body's own identity is washed over its disc, 0 to 1 — and
   * **zero for every state but HELD**, which is the author's ruling of
   * 2026-09-01. See [`HELD_FILL`](#held_fill).
   */
  readonly fill: number;
}

/**
 * How much of its own identity a **held** body's disc is washed with — **0.30,
 * and it is derived against the anomaly rather than chosen.**
 *
 * ## ⚠ Spec 04 §1 fixes the disc at `#100C20` for every state, and the author
 * overruled it, 2026-09-01
 *
 * > *"I think grabbed planets should have their color fill their bodies a bit,
 * > rather than the nearly pure black. Especially when I go through the anomaly
 * > field the contrast is really odd: the planet is active and glowing, but its
 * > body is nearly black, while the anomaly lies behind it. It makes the planet
 * > feel like a hole going to something below/deeper than the anomaly, which
 * > messes with the depth perception."*
 *
 * **The hole is literal, and it is arithmetic.** Spec 04 §1's disc is
 * `#100C20` = (16, 12, 32). The anomaly's cloud bed stacks four puffs at
 * [`CLOUD_ALPHA`](./anomaly.ts) to about 0.40, which over the true-black gaps is
 * **(102, 38, 65)** in ION and **(63, 43, 102)** in AURORA. So the thing drawn
 * *behind* the body is between two and six times brighter than the body in every
 * channel, and a darker shape over a lighter ground reads as a hole through it.
 * Nothing about that is a taste; the depth cue is inverted.
 *
 * **0.30 is where it stops being one.** Washed at that alpha the disc lands
 * between (11, 64, 85) and (74, 48, 83) across the hues this field places —
 * summed brightness 160 to 205 against the cloud bed's 205. Level with the bed,
 * so the body sits *on* the weather instead of behind it, and no further: the
 * disc is still far darker than its own rim, so §1's structure survives.
 *
 * **Spec 04 §1's other rule is untouched, by construction.** *"Never brighter
 * than the craft"*: identity's lightness is fixed at `oklch(0.72 …)` (spec 00 §2)
 * and the craft's CORE is (255, 244, 224), summed 723 — so a disc washed at *any*
 * alpha up to 1 stays below it, and this one is under a third of it.
 *
 * **HELD only, which is what was asked.** The same argument would extend to
 * `IN_REACH` — it is lit too — and that is one number in the table below rather
 * than a change of shape. It is left at zero until the author says.
 */
export const HELD_FILL = 0.3;

const LOOK: Readonly<Record<BodyState, Look>> = {
  AHEAD: { rim: 2.5, rimStrength: RIM_AT_REST, strata: 0.1, core: 0.3, fill: 0 },
  IN_REACH: { rim: 2.25, rimStrength: RIM_IN_REACH, strata: 0.18, core: 0.5, fill: 0 },
  HELD: { rim: 2.5, rimStrength: 1, strata: 0.3, core: 0.8, fill: HELD_FILL },
  SPENT: { rim: 1.5, rimStrength: 0.5, strata: 0.14, core: 0.5, fill: 0 },
};

/**
 * Where the strata sit, as fractions of the radius, and how much of the state's
 * alpha each takes — spec 04 §1's 0.68r and 0.39r at α 0.22 and 0.14.
 *
 * §1 gives the pair absolute alphas and §3 gives the state one; the state's is
 * what varies, so it is taken as the outer ring's and the inner keeps §1's ratio
 * to it. That way the two rings stay a pair through all four states.
 *
 * ## The inner one is gone, 2026-08-30 — *"they're starting to look like beehives"*
 *
 * The author, flying the field with the rungs in: *"I want to remove the
 * innermost circle within each planet because they're starting to look like
 * beehives."*
 *
 * **The 0.39r stratum is what goes, and not the core.** A body draws four
 * concentric things — the rim, these two, and the core — and *beehive* is what
 * three nested rings read as. The core is a **filled dot at 0.08r**, not a ring,
 * so it does not join that pattern; it is also spec
 * [04 · §4](../../docs/spec/04-bodies.md)'s **type slot**, the one element that
 * makes a later body type a data change rather than a redesign (BINARY has twin
 * cores, a BLACK HOLE has none). Taking it would have cost the extension point
 * and left the beehive.
 *
 * What survives is §1's *structure without texture*: a rim, one stratum, and a
 * core. The pair is still written as a pair — the inner entry is commented out
 * rather than deleted, and §1's α ratio with it — so putting it back is one line.
 */
const STRATA: ReadonlyArray<readonly [at: number, share: number]> = [
  [0.68, 1],
  // [0.39, 0.14 / 0.22] — spec 04 §1's inner stratum, withdrawn above.
];

/** Spec 04 §1's core: a filled dot at 0.08 × the body's radius. The type slot. */
const CORE_SHARE = 0.08;

/**
 * Spec 04 §1's tide: 4 board pixels, constant whatever the body's radius.
 *
 * **§1's rule is about the body's size and this is about the craft's distance**,
 * so [`TIDE_SWELL`](#) below does not break it: a small body and a giant one show
 * the same tide at the same approach, which is what *"constant in design px
 * regardless of body radius"* is protecting. Four is what it is at the **edge of
 * the body's reach**, where the tide is only just there.
 */
const TIDE_WIDTH = 4 * BOARD_PIXEL;

/**
 * How wide the tide grows, as a multiple of spec §1's figure, at the surface.
 *
 * *"I'd love for the tide window to grow in thickness as I approach, too"*
 * (author, 2026-08-29). It already grows in **length** along the limb and in
 * **brightness**; this is the third reading of the same closing distance, and the
 * one that makes the band read as reaching rather than as merely brightening.
 *
 * **One, because that is the grammar the compass window already has** — its arc
 * runs `WINDOW_WIDTH * (1 + aim)` and doubles at full, carried from the
 * prototype's own pair. An arc in this game that heats also thickens, by the same
 * amount, and inventing a second number for the tide would be inventing a second
 * grammar.
 *
 * **It swells on [`closing`](../state/body.ts) rather than on `strength`**, and
 * that is measured rather than preferred: over a real run, across an approach to
 * the body a press would take, `closing` runs **0.31 → 0.88** while `strength`
 * runs 0.42 – 0.63 over the same frames. Strength mixes the body's mass into the
 * reading, so a heavy body would arrive already thick and barely move; the
 * distance is the thing that is actually changing while the player closes.
 *
 * **And it grows out of the rim rather than arriving with a width of its own.**
 * *"Let's have it start at the same thickness as the planet surface ring, so
 * that when I first approach I see it as a light spot on the surface. When I
 * approach it grows and 'pulls' towards me"* (author, 2026-08-29). So the far end
 * of the ramp is the body's own edge — at the reach's edge there is no *band* at
 * all, only a brightening of the limb — and §1's 4px is no longer a constant the
 * tide has: it is a width it passes through on the way from the rim to twice that.
 *
 * **The ramp is squared, and that is the second correction.** Run straight, the
 * band was already **1.8× the rim** the moment a body came on offer: *"the tide's
 * thickness is a bit too much at the start. I want it to really grow closer than
 * this, right now it's a bit too aggressively bold at a distance"* (author,
 * 2026-08-29). Against the approach as it is actually flown — `closing` at
 * **0.31** when a body first comes on offer, **0.62** at the median, **0.93** at
 * the tightest orbit — the two curves are:
 *
 * | closing | | straight | squared |
 * |---|---|---|---|
 * | 0.31 | first sight | 1.8× the rim | **1.2×** |
 * | 0.62 | median approach | 2.6× | **2.0×** |
 * | 0.93 | tightest orbit | 3.4× | **3.2×** |
 *
 * Squaring costs almost nothing at the near end — where the player is looking at
 * it — and takes the far end back to something barely thicker than the edge it
 * sits on, which is the *light spot* that was asked for. Cubing was measured too
 * and overshoots the other way: it holds at 1.6× through the **middle** of the
 * approach, so the growing happens too late to be the thing the eye follows in.
 */
const TIDE_SWELL = 1;

/**
 * How many strokes the tide is drawn in, so that it can **taper**.
 *
 * *"Now there's big contrast between the planet's edge ring and the tide, and I
 * want the tide to seem like it's roundly growing out of the planet's surface
 * towards us"* (author, 2026-08-29). Drawn as one arc it is a band of constant
 * width with two cut ends, and the cut is what makes the contrast: a 24-unit
 * band stops dead against a 7-unit rim.
 *
 * Canvas2D cannot vary a stroke's width along a path, so the arc is walked in
 * segments and each takes its own width and alpha from where it sits. Eleven is
 * odd on purpose — one segment lands on the bearing, so the peak is the peak
 * rather than the gap between two — and at this scale each is shorter than it is
 * wide, so they overlap into one shape rather than reading as beads.
 */
const TIDE_SEGMENTS = 11;

/**
 * How faint the lightest tide in the field may be.
 *
 * **An opening position.** Spec 04 §2 rules that a heavier body's tide is
 * *brighter* and states no number for either end, so what is fixed here is only
 * the floor; the rest of the range is the body's own mass, read straight off
 * [`TideView.strength`](../state/types.ts).
 */
const TIDE_FLOOR = 0.4;

/** Strata and the spent core are hairlines: one board pixel. */
const STRATUM_WIDTH = BOARD_PIXEL;

/** The floor ring, which is developer scaffolding rather than composition. */
const FLOOR_WIDTH = 1.5;

/**
 * How strongly each energy step is painted — spec
 * [00 · §3](../../docs/spec/00-tokens.md)'s *"6px @ 35%"*, *"18px @ 60%"* and
 * the E3's additive flash.
 *
 * The radii live in [`energy.ts`](../state/energy.ts) and these do not, and the
 * seam is ADR-0006's: a radius is a length in design units that a test asserts
 * without a canvas, and an alpha is paint. Spec 00 §1 makes the alpha rule
 * explicitly this layer's — *"the only way this renderer is allowed to make one
 * colour out of another"* — so it is spent here, through `dim`, and never by
 * reaching for a second token.
 *
 * E3 is 1 because it is drawn additively: what falls over its 400ms is the
 * radius, because brightness in this game **is** radius (§3), and an alpha
 * fading in parallel would be a second ordinal channel saying the same thing.
 *
 * **E1 and E2 came down from the board's 35% and 60%** (author, 2026-08-29):
 * *"all glow is too much. I want it fainter and more impactful. It looks childish
 * and tacky right now."* The radii are untouched, so spec 00 §3's acceptance —
 * bloom radius is a pure function of the energy step and the chain — is exactly
 * as it was; what moved is the alpha, which spec 00 §1 makes this layer's own.
 * They are opening positions and they are on the bench.
 */
export const E1_STRENGTH = 0.18;
export const E2_STRENGTH = 0.3;
const STRENGTH: Readonly<Record<Energy, number>> = { 0: 0, 1: E1_STRENGTH, 2: E2_STRENGTH, 3: 1 };

/**
 * A glow of `radius` design units around a point, in one palette token.
 *
 * `from` is where it starts — zero for the craft, a body's own surface for a
 * body — so a bloom is always the light *leaving* a thing rather than a disc
 * drawn over it. Spec 00 §1 permits exactly this: the token is unchanged and
 * only its strength moves, so the frame still resolves to eight names and
 * greyscale still ranks it.
 */
function bloom(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  from: number,
  radius: number,
  paint: (strength: number) => string,
  strength: number,
): void {
  if (radius <= 0 || strength <= 0) return;
  const gradient = context.createRadialGradient(x, y, from, x, y, from + radius);
  gradient.addColorStop(0, paint(strength));
  gradient.addColorStop(1, paint(0));
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, from + radius, 0, Math.PI * 2);
  context.fill();
}

/** The two ways a thing in this game is coloured: a palette token, or a body's own hue. */
const inToken =
  (token: string) =>
  (strength: number): string =>
    dim(token, strength);
const inHue =
  (hue: number) =>
  (strength: number): string =>
    identity(hue, strength);

/**
 * The one E3 — spec 00 §3's *"48px, additive, 400ms decay"*.
 *
 * Additive is the whole of what separates it from every other bloom in the game:
 * an E3 over a body reads as light rather than as paint, and `lighter` is
 * Canvas2D's word for it. It is drawn under the craft so that the craft stays
 * the brightest object on screen, which Direction 01 rules it always is.
 */
function drawFlash(context: CanvasRenderingContext2D, flash: FlashView): void {
  context.save();
  context.globalCompositeOperation = 'lighter';
  bloom(context, flash.x, flash.y, 0, flash.radius, inToken(CORE), STRENGTH[3]);
  context.restore();
}

/**
 * The craft's silhouette: a dart, nose along +x, in design units.
 *
 * The prototype's outline at this repo's scale, and it is **a stand-in** — spec
 * [02 · §4](../../docs/spec/02-release.md) rules that a signature craft shape is
 * its own exploration and that *"nothing in the game may depend on the current
 * outline."* What it has to do today is say which way the nose points, because
 * the nose is where a release will go.
 */
function craftPath(context: CanvasRenderingContext2D): void {
  context.beginPath();
  context.moveTo(27, 0);
  context.lineTo(-18, 15);
  context.lineTo(-9, 0);
  context.lineTo(-18, -15);
  context.closePath();
}

/**
 * How wide the grip halo reaches past a body's floor, in design units.
 *
 * *"The planets should have a fainter, much wider glow that grows with
 * proximity"* (author, 2026-08-29). The prototype's `closeSpan`, converted, and
 * it is a wide soft field rather than a rim light: three times the E2 bloom, at a
 * fraction of its strength.
 *
 * **It will come to mean something.** In the prototype this span is the band an
 * arrival's tightness is graded over, and its comment is emphatic that drawing it
 * is required rather than decorative — *"a multiplier the player did not see
 * drawn BEFORE it scored is invisible math."* Ours is spec 01's **depth**, and
 * M4 is where the two meet; until then the span is an opening position.
 */
const GRIP_SPAN = 200 * BOARD_PIXEL;

/** How strong that halo is at the floor, where the grip is total. */
const GRIP_STRENGTH = 0.16;

/**
 * How much of the energy table's strength a **body's** bloom takes.
 *
 * *"I don't want that glow effect on the planet ring when I grab it. Maybe just
 * lessen it a lot?"* (author, 2026-08-29). A held body jumps to E2 — three times
 * the radius and nearly twice the alpha of E1, in its own hue, hugging the rim —
 * and on top of the grip halo, which is at its strongest at exactly that moment,
 * the rim read as lit rather than as a rim.
 *
 * **A body and not the craft**, which is the whole reason it is a separate
 * number: Direction 01 rules *"the craft is the brightest object on screen,
 * always"*, and dimming the shared table would have dimmed the craft with it.
 * The ordering across the four steps is untouched — E2 is still brighter than E1
 * — and the craft keeps its own.
 */
const BODY_BLOOM = 0.35;

/**
 * A body — spec [04 · §1](../../docs/spec/04-bodies.md)'s anatomy, in the order
 * it is lit.
 *
 * *"A body is a lamp, not a rock: flat vector anatomy that emits its own
 * identity. No gradients, no terminator, no implied depth."* The disc is the one
 * surface that is not the identity hue, and it is `BODY_FILL` because §1 rules
 * it *"never brighter than the craft"*.
 *
 * The rim and the tide are **constant in design units regardless of radius**
 * (§1's scale rule), so a small body reads as a bright ring and a giant as a
 * thin luminous horizon. Everything else in here is a fraction of the radius.
 */
function drawBody(context: CanvasRenderingContext2D, body: BodyView): void {
  const look = LOOK[body.state];
  const spent = body.state === 'SPENT';
  const paint = (strength: number): string =>
    spent ? dim(DUSK, strength) : identity(body.hue, strength);

  // The grip: a wide, faint field that grows as the body takes hold. Faded by
  // the grip itself, so a field of distant bodies is a constellation of rims
  // rather than sixty haloes.
  if (!spent) {
    bloom(
      context,
      body.x,
      body.y,
      body.radius,
      GRIP_SPAN,
      inHue(body.hue),
      GRIP_STRENGTH * body.grip,
    );
  }

  // And the bloom, which is the energy step and is off entirely below it.
  bloom(
    context,
    body.x,
    body.y,
    body.radius,
    body.bloom,
    spent ? inToken(DUSK) : inHue(body.hue),
    STRENGTH[body.energy] * BODY_BLOOM,
  );

  context.beginPath();
  context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  context.fillStyle = BODY_FILL;
  context.fill();

  // **A held body's disc carries a little of its own light** — the author's
  // ruling of 2026-09-01, and [`HELD_FILL`](#held_fill) carries the arithmetic.
  // Washed over the disc rather than mixed into it because `identity` is an
  // oklch colour and `BODY_FILL` a hex one, and because this is spec 00 §1's own
  // alpha rule: the colour is unchanged and only its strength moves, so the
  // frame still resolves to eight names and hue still means only identity.
  //
  // Skipped entirely at zero, which is every state but HELD and therefore almost
  // every body in the picture — one extra fill on the one body being flown, not
  // on the field.
  if (look.fill > 0) {
    context.fillStyle = paint(look.fill);
    context.fill();
  }

  // Strata — concentric internal rings, "structure without texture" (§1). The
  // outer takes the state's own alpha and the inner is the ratio §1 states
  // between the two, so the pair stays a pair however the state moves.
  for (const [at, share] of STRATA) {
    context.beginPath();
    context.arc(body.x, body.y, body.radius * at, 0, Math.PI * 2);
    context.lineWidth = STRATUM_WIDTH;
    context.strokeStyle = paint(look.strata * share);
    context.stroke();
  }

  context.beginPath();
  context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  context.lineWidth = look.rim * BOARD_PIXEL;
  context.strokeStyle = paint(look.rimStrength);
  context.stroke();

  if (body.tide !== null) drawTide(context, body, body.tide);

  // The core is the type slot (§4). Only STANDARD ships, so it is a filled dot —
  // except on a spent body, where §3 hollows it out and the lamp is out.
  context.beginPath();
  context.arc(body.x, body.y, body.radius * CORE_SHARE, 0, Math.PI * 2);
  if (spent) {
    context.lineWidth = STRATUM_WIDTH;
    context.strokeStyle = dim(DUSK, look.core);
    context.stroke();
  } else {
    context.fillStyle = paint(look.core);
    context.fill();
  }

  if (!body.held) return;
  context.beginPath();
  context.arc(body.x, body.y, body.radius + FLOOR_GAP, 0, Math.PI * 2);
  context.lineWidth = FLOOR_WIDTH;
  context.strokeStyle = dim(DUSK, 0.28);
  context.stroke();
}

/**
 * The tide — spec [04 · §2](../../docs/spec/04-bodies.md), *"the gravity vector
 * drawn on the thing that owns it."*
 *
 * An arc on the rim centred on the bearing presentation state carries, which is
 * already behind the craft: the lag is derived once per tick and this only
 * paints it. Its width and its strength are the same body's mass read twice, so
 * a heavier body reaches with a longer and brighter tide without this file
 * knowing what mass is.
 *
 * Spec 04 §2's **inner ripple** — a stratum tracking the same bearing more slowly
 * still — is deliberately absent. It is a Direction 04 board line the prototype
 * never implemented, and flown it was the first thing the author asked about:
 * *"what's the purpose of the innermost ring within a planet, that also has a
 * tide tracking my orbiting ship? It doesn't look great and I don't know why it's
 * there"* (2026-08-29). The **strata** stay — the prototype has those, and §1
 * calls them structure without texture — and the thing that tracked is gone.
 */
function drawTide(context: CanvasRenderingContext2D, body: BodyView, tide: TideView): void {
  // **It thins to the rim it grows out of, rather than to nothing.** At the ends
  // of the arc the tide is exactly as wide as the body's own edge, so there is no
  // width to step across — it becomes the rim, and the rim carries on round. That
  // is what turns a band with two cut ends into something emerging from the limb.
  const look = LOOK[body.state];
  const rim = look.rim * BOARD_PIXEL;
  // From the rim's own width at the edge of the reach to `1 + TIDE_SWELL` times
  // §1's figure at the surface. Far off there is no band, only a lit spot on the
  // limb; the band is what closing buys — and it buys it late, see above.
  const swell = body.closing * body.closing;
  const peak = rim + (TIDE_WIDTH * (1 + TIDE_SWELL) - rim) * swell;
  // **It starts as the rim and rises out of it.** *"Let's make the initial colour
  // more similar to the planet ring. I want it to be just barely noticeable, and
  // then it'll grow in brightness"* (author, 2026-08-29). The distance between a
  // rim and a tide is almost entirely **lightness** — 0.72 against 0.92, at
  // alphas within a few hundredths of each other — so both ends are carried on
  // the same ramp the width uses, and at the edge of a reach the two are the same
  // colour. A body far off shows its own edge, a little brighter on one side, and
  // nothing that reads as a second element.
  const full = TIDE_FLOOR + (1 - TIDE_FLOOR) * tide.strength;
  const lit = look.rimStrength + (full - look.rimStrength) * swell;
  const step = (tide.halfWidth * 2) / TIDE_SEGMENTS;

  context.save();
  // Round, so consecutive segments blend instead of showing their joins.
  context.lineCap = 'round';
  for (let i = 0; i < TIDE_SEGMENTS; i++) {
    // Where this segment's middle sits across the arc, from −1 to 1.
    const across = ((i + 0.5) / TIDE_SEGMENTS) * 2 - 1;
    // A parabola: full in the middle, nothing at the ends, and no corner at the
    // top — which is the *roundly* in what was asked for.
    const taper = 1 - across * across;
    const from = tide.bearing - tide.halfWidth + i * step;
    context.beginPath();
    context.arc(body.x, body.y, body.radius, from, from + step);
    context.lineWidth = rim + (peak - rim) * taper;
    // The light goes all the way out, so the ends dissolve rather than stopping
    // at a width the eye can still find.
    context.strokeStyle = identityRising(body.hue, swell, lit * taper);
    context.stroke();
  }
  context.restore();
}

/** Spec 00 §6's compass, in board pixels — one grammar of weights for the lot. */
const RING_WIDTH = 1 * BOARD_PIXEL;
const WINDOW_WIDTH = 3 * BOARD_PIXEL;
const HAND_WIDTH = 1.5 * BOARD_PIXEL;
const DOT_RADIUS = 3 * BOARD_PIXEL;

/**
 * How wide the crossing dot is. Spec 00 §6 calls it a *ghost*; `CONTEXT.md`
 * spends that word on a replay flown beside a live run, so this milestone's own
 * brief calls it **the crossing dot** and so does everything here.
 *
 * *"Let's make the white dots on my ship's arm that goes through the compass a
 * bit larger. Just a hair. At this size moving that fast they're hard to see"*
 * (author, 2026-08-29). Two board pixels to **two and a half**, which is a
 * quarter wider and a little over half again in area — a hair, and the reason it
 * needs one is **speed** rather than size: the crossing sweeps the ring at
 * orbital rate, and a mark small enough to read while still is not the same mark
 * while moving. It stops short of [`DOT_RADIUS`](#)'s three, because the window's
 * own dot is the target and the crossing is the pointer; a pointer that outgrew
 * what it points at would invert the instrument.
 */
const CROSSING_RADIUS = 2.5 * BOARD_PIXEL;

/**
 * How bright a crossing dot is before any aim has closed.
 *
 * The window's own grammar, applied to the mark on the hand: at rest it is the
 * E2 it used to jump to, and it ramps to full CORE under perfect aim rather than
 * stepping. Brighter at rest than a window ([`WINDOW_AT_REST`](#)) because it is
 * a two-pixel dot against a three-pixel arc, and the same alpha does not carry
 * the same distance.
 */
const CROSSING_AT_REST = 0.3;

/**
 * How bright a window is before any aim has closed.
 *
 * The compass heats **in place** from here to full as the hand comes in (spec
 * 00 §6), and it thickens on the same ramp — the prototype's own pair, whose arc
 * runs `0.15 + 0.5 × align` in alpha and `2 + 2 × align` in weight. It is the one
 * surface in the game that does not take the energy table's alpha, because it is
 * the instrument rather than the world.
 *
 * **It is low because the ramp now has a quarter turn to run over**: the window
 * starts lifting while the hand is far away, so where it starts matters more than
 * it did when it only lit inside its own arc.
 */
const WINDOW_AT_REST = 0.22;

/** How much of itself a window keeps when the run to its body is blocked. */
const BLOCKED = 0.3;

/**
 * The compass — spec [00 · §6](../../docs/spec/00-tokens.md), and the thing
 * `VISION.md` calls the best piece of UI in the game.
 *
 * Everything is drawn **on the orbit**, about the body, because that is what
 * makes it diegetic rather than a gauge: the windows are arcs of the path the
 * craft is on, and the hand is the radius it is standing on. Nothing here is an
 * instruction — *"the gap between ghost and dot is the grade, drawn on the
 * geometry. It is a fact, never a command."*
 */
function drawCompass(context: CanvasRenderingContext2D, compass: CompassView): void {
  if (compass.alpha <= 0) return;
  // State 1 · PRESS. *"The grab filament: a line from the craft to the body
  // pulling hardest, in that body's identity hue."* There is no instrument yet,
  // which is what makes the compass arriving *be* the freeze, seen.
  if (compass.hand === null) {
    drawPath(context, compass);
    // From the body's **surface** to the craft, the same as the hand one state
    // later: *"the tether/grab line when not orbiting should also stop at the
    // planet surface, not go all the way to the center"* (author, 2026-08-29).
    // Guarded, because a line to a craft nearer than the rim would run backwards
    // out of the far side of the body.
    const reach = Math.hypot(compass.craftX - compass.x, compass.craftY - compass.y);
    if (reach <= compass.rim) return;
    context.beginPath();
    context.moveTo(
      compass.x + ((compass.craftX - compass.x) / reach) * compass.rim,
      compass.y + ((compass.craftY - compass.y) / reach) * compass.rim,
    );
    context.lineTo(compass.craftX, compass.craftY);
    context.lineWidth = HAND_WIDTH;
    // **It fades with distance**, which is the difference between a line that
    // says *you have hold of this* and one that says *you had hold of this*. The
    // strength is the state's — see
    // [`FILAMENT_FLOOR`](../state/compass.ts) — and STRENGTH[2] stays its
    // ceiling, so a filament at the freeze looks the way it always did.
    context.strokeStyle = identity(compass.hue, STRENGTH[2] * compass.filament * compass.alpha);
    context.stroke();
    return;
  }

  // **The orbit path, which is an oval and rounds out as the settle spends it.**
  // Drawn as a thin light line the whole way round, and then the part already
  // flown over the top of it in the craft's own light. Both walk the same sampled
  // curve, so the trail cannot come away from the path it is a piece of.
  drawPath(context, compass);
  drawFlown(context, compass);

  // The hand: the radius through the craft, from the body's **surface** out past
  // the outermost ring. *"I want this line to end at the planet surface, not
  // extend from the center of the planet"* (author, 2026-08-29) — the part inside
  // the body was drawing a line through the thing it measures from. The inner end
  // is the body's and does not take the instrument's `scale`: the rings pop in at
  // the freeze and the planet does not.
  const cos = Math.cos(compass.hand);
  const sin = Math.sin(compass.hand);
  context.beginPath();
  context.moveTo(compass.x + cos * compass.rim, compass.y + sin * compass.rim);
  context.lineTo(
    compass.x + cos * compass.reach * compass.scale,
    compass.y + sin * compass.reach * compass.scale,
  );
  context.lineWidth = HAND_WIDTH;
  context.strokeStyle = dim(
    CORE,
    (HAND_AT_REST + (HAND_AT_AIM - HAND_AT_REST) * closest(compass)) * compass.alpha,
  );
  context.stroke();

  for (const ring of compass.rings) drawRing(context, compass, ring);
}

/**
 * The flown arc — the orbit already ridden, lit by what the boost was worth
 * along it (`CONTEXT.md`: **flown arc**).
 *
 * **The boost envelope's clock, and the only thing that draws it.** Spec
 * [01 · §11](../../docs/spec/01-swing.md)'s tension is an aim that wants one
 * moment and a boost that wants another, and until this the aim half was drawn in
 * detail and the timing half was invisible — flown, 34% of releases landed before
 * the boost had armed at all. Ruled 2026-08-29: it is said here, on the path.
 *
 * Time runs along the arc from the freeze to the craft's own nose, so the
 * brightest stretch is where the boost paid and the bright end is under the
 * thing the eye is already on. What each stretch is worth is presentation
 * state's ([`compass.ts`](../state/compass.ts)); this stroke it.
 *
 * One stroke per stretch, because a canvas cannot put a gradient along an arc.
 * Each is drawn at its own midpoint, which is why the stretches are cut fine
 * enough that the step between two of them is under a fifth of the range.
 */
function drawFlown(context: CanvasRenderingContext2D, compass: CompassView): void {
  if (compass.path.length === 0) return;
  context.lineWidth = HAND_WIDTH;
  for (const run of compass.flown) {
    traceArc(context, compass, run.from, run.span);
    const worth = (run.at + run.to) / 2;
    // **The floor is not zero**, and that is what keeps it a clock rather than a
    // disappearance: the arc is still the orbit the craft has ridden whatever it
    // is now worth, and what the light says on top of that is what a release
    // there would have paid.
    context.strokeStyle = dim(
      CORE,
      STRENGTH[2] * (FLOWN_FLOOR + (1 - FLOWN_FLOOR) * worth) * compass.alpha,
    );
    context.stroke();
  }
}

/**
 * How faint the flown arc goes where the boost is worth nothing.
 *
 * **Not zero, and that is the difference between a clock and a disappearance.**
 * The arc is still the orbit the craft has ridden, which is a fact worth keeping
 * whatever it is now worth; what the light says on top of that is what a release
 * there would have paid. An arc that went out would take the trail with it.
 *
 * It is an **alpha** and therefore lives here rather than in presentation state,
 * which is spec [00 · §1](../../docs/spec/00-tokens.md)'s own line and
 * [`energy.ts`](../state/energy.ts)'s: a radius is a length and is asserted
 * without a canvas, and an alpha is paint.
 */
const FLOWN_FLOOR = 0.22;

/**
 * How faint the whole orbit path is drawn, against the arc already flown.
 *
 * ## It was fainter than the rings, and that is what read as two ovals
 *
 * The author, 2026-08-30: *"At the last orbit I saw one oval when initially
 * capturing, and then my orbit line jumped over to a different one. Any orbit
 * rings we should show be smooth. Either we remove the first one, or we blend
 * them."*
 *
 * **The path does not jump.** Measured on that exact run, the drawn line moves at
 * most **0.10 of a body radius** on the freeze tick and less than 0.15 on every
 * other tick of the run — the prediction converges on the frozen orbit and hands
 * over cleanly, which is what `predictOrbit`'s eccentricity cap already fixed on
 * the same day.
 *
 * What arrives on that tick is the **rings**, and they arrive on top of it. On the
 * flagged capture the outermost ring landed at 648 against an oval reaching 647 —
 * the same line to within one unit — and then the settle rounded the oval inward
 * to 397 and left the ring behind. On a capture that freezes at the eccentricity
 * cap, which is the p50, the oval starts *outside* the whole stack and sweeps
 * through all three of them.
 *
 * **They cannot be moved apart.** Placing the rings clear of the freeze apoapsis
 * instead of the periapsis is the obvious fix and the measurement refuses it: over
 * 91 freezes it puts the outermost ring beyond half the design width on **93%** of
 * them against 30% today, at a p50 of 1 069 design units — the instrument off
 * screen on almost every capture.
 *
 * So what is left is **rank**, and the rank was inverted. The rings are structure
 * at E1 (0.18) and this was **0.16** — the line the craft is actually flying drawn
 * fainter than the scale marks around it, so when the two separate the eye keeps
 * the brighter one and reads the real orbit as a new arrival. Spec
 * [00 · §3](../../docs/spec/00-tokens.md) makes brightness the only ordinal
 * channel; this is it saying the wrong order.
 *
 * **0.24 sits between the rings' E1 and the flown arc's E2**, so the path now
 * outranks the instrument drawn on it and is still outranked by the stretch of it
 * already ridden — which is the hierarchy `FLOWN_FLOOR` above exists to state.
 * `test/render/hand.test.ts` pins the ordering so it cannot invert again.
 *
 * The value is an opening position and it is on the bench; the **ordering** is not.
 */
export const PATH_STRENGTH = 0.24;
const PATH_WIDTH = 1 * BOARD_PIXEL;

/**
 * How much of itself a **predicted** path keeps.
 *
 * Drawn through the dive, before any freeze has fixed an orbit, and fainter than
 * a real one because that is what it is — the prototype draws its own prediction
 * at a comparable fade and reports no alignment from it, *"so the ship's release
 * glow still means 'let go now and it counts', which before periapsis it does
 * not."*
 */
const PREDICTED = 0.55;

/**
 * The orbit path: the oval the craft is on, faded in by how sure it is.
 *
 * One function for both the prediction and the frozen orbit, because they are the
 * same line — the prediction converges on the frozen one and the freeze is not a
 * moment the path should jump at.
 */
function drawPath(context: CanvasRenderingContext2D, compass: CompassView): void {
  if (compass.path.length === 0 || compass.presence <= 0) return;
  tracePath(context, compass, 0, compass.path.length);
  context.lineWidth = PATH_WIDTH;
  context.strokeStyle = dim(
    CORE,
    PATH_STRENGTH * compass.presence * compass.alpha * (compass.predicted ? PREDICTED : 1),
  );
  context.stroke();
}

/** Where the sampled path is at one angle, interpolated between its samples. */
function pathAt(compass: CompassView, angle: number): { x: number; y: number } {
  const n = compass.path.length;
  const t = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  const at = t * n;
  const i = Math.floor(at);
  const f = at - i;
  const r = compass.path[i % n]! * (1 - f) + compass.path[(i + 1) % n]! * f;
  return { x: compass.x + Math.cos(angle) * r, y: compass.y + Math.sin(angle) * r };
}

/** The whole closed path, sample by sample. */
function tracePath(
  context: CanvasRenderingContext2D,
  compass: CompassView,
  from: number,
  count: number,
): void {
  const n = compass.path.length;
  context.beginPath();
  for (let k = 0; k <= count; k++) {
    const angle = (((from + k) % n) / n) * Math.PI * 2;
    const p = pathAt(compass, angle);
    if (k === 0) context.moveTo(p.x, p.y);
    else context.lineTo(p.x, p.y);
  }
}

/** An arc of that same path, from an angle across a signed span. */
function traceArc(
  context: CanvasRenderingContext2D,
  compass: CompassView,
  from: number,
  span: number,
): void {
  const steps = Math.max(2, Math.ceil((Math.abs(span) / (Math.PI * 2)) * compass.path.length));
  context.beginPath();
  for (let k = 0; k <= steps; k++) {
    const p = pathAt(compass, from + (span * k) / steps);
    if (k === 0) context.moveTo(p.x, p.y);
    else context.lineTo(p.x, p.y);
  }
}

/**
 * One ring, its window, its dot and its crossing.
 *
 * The ring is DUSK at E0 — *"rings at rest"* — and everything on it belonging to
 * a body is that body's own hue, so target and window never need a legend.
 */
function drawRing(context: CanvasRenderingContext2D, compass: CompassView, ring: RingView): void {
  // The instrument comes online with a pop and the world does not — see
  // [`CompassView.scale`](../state/types.ts).
  const radius = ring.radius * compass.scale;

  context.beginPath();
  context.arc(compass.x, compass.y, radius, 0, Math.PI * 2);
  context.lineWidth = RING_WIDTH;
  context.strokeStyle = dim(DUSK, STRENGTH[1] * compass.alpha);
  context.stroke();

  // The window heats **in place**: E1 at rest, E2 under live aim, and the hue
  // never moves (spec 00 §6).
  // *"I want the compass windows to be a bit more vibrant and have more rounded
  // edges"* (author, 2026-08-29). Vibrant is the one place in this renderer that
  // does **not** take the energy table's alpha: the compass is the instrument, it
  // is drawn on the orbit rather than in the world, and it is the thing the
  // milestone is measured by. Round caps are `lineCap`, and they are why the arc
  // reads as a window rather than as a cut segment.
  // A **blocked** window is dimmed rather than removed: a release that runs into
  // another body is worth saying, and a window that vanished would be the
  // blinking this instrument was rebuilt to stop.
  const clear = (ring.blocked ? BLOCKED : 1) * compass.alpha;

  context.save();
  context.lineCap = 'round';
  context.beginPath();
  context.arc(compass.x, compass.y, radius, ring.dot - ring.halfWidth, ring.dot + ring.halfWidth);
  context.lineWidth = WINDOW_WIDTH * (1 + ring.aim);
  context.strokeStyle = identity(
    ring.hue,
    (WINDOW_AT_REST + (1 - WINDOW_AT_REST) * ring.aim) * clear,
  );
  context.stroke();
  context.restore();

  // The dot at the window's centre — a perfect release — CORE white when matched.
  const dotX = compass.x + Math.cos(ring.dot) * radius;
  const dotY = compass.y + Math.sin(ring.dot) * radius;
  context.beginPath();
  context.arc(dotX, dotY, DOT_RADIUS, 0, Math.PI * 2);
  context.fillStyle = ring.matched
    ? dim(CORE, clear)
    : identity(ring.hue, (WINDOW_AT_REST + (1 - WINDOW_AT_REST) * ring.aim) * clear);
  context.fill();

  // The crossing: where the hand cuts this ring. The gap between it and the dot
  // is the grade, and it is drawn rather than said.
  const hand = compass.hand!;
  context.beginPath();
  context.arc(
    compass.x + Math.cos(hand) * radius,
    compass.y + Math.sin(hand) * radius,
    CROSSING_RADIUS,
    0,
    Math.PI * 2,
  );
  // *"I'd like this arm to have small white-ish dots on the compass orbits for
  // each planet. These dots should also slightly increase in intensity as the
  // player orbits, like the windows"* (author, 2026-08-29). It used to take the
  // energy table, which is a **step** — E1 until the ring is under live aim, then
  // E2 — so the mark that says *the hand is here* changed in one jump and said
  // nothing on the way in. On the window's own ramp it brightens all the way
  // round, which is the thing that lets a player time a release.
  context.fillStyle = dim(CORE, (CROSSING_AT_REST + (1 - CROSSING_AT_REST) * ring.aim) * clear);
  context.fill();
}

/** How close the best-aimed window is, from 0 to 1 — what the hand brightens on. */
function closest(compass: CompassView): number {
  let best = 0;
  for (const ring of compass.rings) best = Math.max(best, ring.aim);
  return best;
}

/**
 * How bright the hand is before any aim has closed, and once it has fully.
 *
 * **Both ends are opening positions.** Spec 00 §6 has the hand *"thickening and
 * brightening as aim closes"* and states neither. It used to run 0.35 → 1.0, and
 * full CORE white made a bright bar across the middle of the instrument: *"I want
 * the brightness of my radial line going to the center of the planet to be a bit
 * less"* (author, 2026-08-29). It now runs 0.18 → 0.55 — about half, at both
 * ends, so the aim still reads as brightening and the line stops competing with
 * the windows it is being aimed at.
 */
const HAND_AT_REST = 0.18;
const HAND_AT_AIM = 0.55;

/**
 * A sighting — spec [03 · §6](../../docs/spec/03-hud.md): an arrow at the edge of
 * the picture in the body's own hue, with how far away it is.
 *
 * Drawn in **design-space** coordinates rather than world ones, which is why it
 * happens outside the camera's translate: the mark belongs to the composition,
 * and spec [00 · §7](../../docs/spec/00-tokens.md) rules that nothing the player
 * reads is drawn outside the design space, ever.
 *
 * **It points, and that reverses a ruling** — see
 * [`sighting.ts`](../state/sighting.ts) for the reversal and its date. What has
 * not changed is that its *position* on the edge still carries the direction; the
 * arrow agrees with it rather than replacing it.
 *
 * The label is a **distance and not a name**: a body is named by hue in the run,
 * which is the ruling that retired the `P11` chips and is untouched. It is set in
 * the utility face — spec [00 · §4](../../docs/spec/00-tokens.md) bans monospace,
 * so the technical look comes from tracked tabular figures rather than from a
 * typewriter.
 */
function drawSighting(context: CanvasRenderingContext2D, mark: SightingView): void {
  const paint = (strength: number): string => identity(mark.hue, strength * mark.strength);

  context.save();
  context.translate(mark.x, mark.y);
  context.rotate(mark.bearing);
  context.beginPath();
  context.moveTo(mark.radius, 0);
  context.lineTo(-mark.radius * 0.6, mark.radius * 0.65);
  context.lineTo(-mark.radius * 0.6, -mark.radius * 0.65);
  context.closePath();
  context.fillStyle = paint(1);
  context.fill();
  context.restore();

  // The one a press would take wears a ring, and it keeps it as the body comes
  // into view. Spec 03 §6 records the prototype's reason with its measurement:
  // the craft was inside the grab window for 1.03s and could see the body itself
  // for 0.23 of that.
  if (mark.offered) {
    context.beginPath();
    context.arc(mark.x, mark.y, mark.radius * 1.6, 0, Math.PI * 2);
    context.lineWidth = BOARD_PIXEL;
    context.strokeStyle = paint(0.85);
    context.stroke();
  }

  const away =
    mark.away >= 1000
      ? `${(mark.away / 1000).toFixed(1)}k`
      : String(Math.round(mark.away / 10) * 10);
  context.save();
  context.font = `500 ${LABEL_SIZE}px ${UTILITY_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = paint(0.9);
  context.fillText(
    away,
    mark.x - Math.cos(mark.bearing) * LABEL_OFFSET,
    mark.y - Math.sin(mark.bearing) * LABEL_OFFSET,
  );
  context.restore();
}

/**
 * How each tier's word is painted — spec
 * [06 · §2](../../docs/spec/06-awards.md)'s ladder, white → green → gold.
 *
 * *"The rarity convention players arrive knowing. Violet is deliberately absent:
 * purple means strange, never good."* And spec 00 §1's other half of the same
 * rule: quality colours live **only in type**, so these three tokens appear here
 * and on no geometry in the game.
 */
const TIER_TOKEN: Readonly<Record<Tier, string>> = {
  MAKE: CORE,
  TRUE: CORE,
  SHARP: LUMEN,
  PERFECT: SOLAR,
};

/**
 * The callout: the window that was taken, still lit, and the word standing at its
 * dot.
 *
 * Spec [02 · §6](../../docs/spec/02-release.md) — *"unused rings die instantly;
 * the taken window stays lit and decays behind the craft"* — and spec 06 §4's
 * *"the word, its points and its colour arrive as one unit at the release
 * point."* They are drawn together because they are one fact: the arc is where
 * the word was earned and the dot at its centre is where it is standing.
 *
 * The type is **Archivo 800, tracked caps** and never the display face: spec 00
 * §4 bans Anton here outright, because *"moving text needs open counters"*
 * (Direction 06).
 */
function drawCallout(context: CanvasRenderingContext2D, callout: CalloutView): void {
  const token = TIER_TOKEN[callout.tier];

  // The window it was taken on, in that body's own hue — identity, not grade.
  // It decays where it was rather than following the craft, because what it marks
  // is the arc that paid — and **on its own clock**, spec 02 §6's 420ms, which is
  // a quarter of the word's. The two arrive together and do not leave together.
  if (callout.windowStrength <= 0) return drawMark(context, callout, token);
  context.save();
  context.lineCap = 'round';
  context.beginPath();
  context.arc(
    callout.aboutX,
    callout.aboutY,
    callout.radius,
    callout.dot - callout.halfWidth,
    callout.dot + callout.halfWidth,
  );
  context.lineWidth = WINDOW_WIDTH * 2;
  context.strokeStyle = identity(callout.hue, callout.windowStrength);
  context.stroke();
  context.restore();

  drawMark(context, callout, token);
}

/**
 * What a **make** shows: its taken window, and nothing else.
 *
 * Spec [06 · §1](../../docs/spec/06-awards.md)'s law is *"points for the make,
 * words for the mastery"*, and §2 gives it *"none — points only"*. **The points
 * are spec 08's and arrive in M4**, so until then a make is marked by the one
 * thing it does draw: the window it was taken on, lit in that body's hue and
 * decaying over 420ms with the rest of the instrument.
 *
 * **A dot was tried here and withdrawn the same evening.** *"I released what I
 * thought was within the planet window and I got no text accolade for it"*
 * (author) — measured on that run, four of its seven graded releases were makes,
 * so more than half of what the player got right said nothing. A CORE dot at
 * §2's own 70% was put at the release point to stand in for the missing number,
 * and flown it read as litter: *"there's some small white dot being left behind
 * at times. Can you identify it, and remove it?"* It was white in a world where
 * nothing else is, it was small, and it outlived every other part of the release
 * by more than a second.
 *
 * **The gap it was covering is real and this is not the thing that closes it.**
 * What a make is owed is a number, the number is M4's, and a stand-in that reads
 * as debris is worse than the silence it was filling.
 */
function drawMark(context: CanvasRenderingContext2D, callout: CalloutView, token: string): void {
  if (SPEAKS[callout.tier]) drawWord(context, callout, token);
}

/**
 * The word itself, in the tier's own colour, over a rim that keeps it legible.
 *
 * The type is **Archivo 800, tracked caps** and never the display face: spec 00
 * §4 bans Anton here outright, because *"moving text needs open counters"*
 * (Direction 06).
 */
function drawWord(context: CanvasRenderingContext2D, callout: CalloutView, token: string): void {
  if (callout.strength <= 0) return;

  context.save();
  context.font = `800 ${callout.size}px ${UTILITY_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.letterSpacing = `${callout.size * CALLOUT_TRACKING}px`;

  // **A rim, not a glow.** Spec 06 §4's per-tier bloom was withdrawn — *"the blur
  // circle behind the popup text isn't doing us any favours, it's blurring the
  // legibility"* (author, 2026-08-29) — and what does the job instead is the
  // prototype's own answer to it: a thin dark stroke around the letters, *"the
  // dark rim that keeps text legible over planets and stars."*
  //
  // In **VOID** and not in black, which is that file's own reason and is spec
  // 00 §1's too: true black exists in exactly two places in this game, and a
  // heavy black outline under pale text *"reads as a sticker."*
  context.lineWidth = RIM_WIDTH;
  context.lineJoin = 'round';
  context.strokeStyle = dim(VOID, RIM_STRENGTH * callout.strength);
  context.strokeText(callout.tier, callout.x, callout.y);

  context.fillStyle = dim(token, callout.strength);
  context.fillText(callout.tier, callout.x, callout.y);
  context.restore();
}

/** The rim behind the word: two board pixels of VOID, at a little over a third. */
const RIM_WIDTH = 2 * BOARD_PIXEL;
const RIM_STRENGTH = 0.38;

/** Spec 06 §4's tracking: caps at 0.1em, which is a tenth of the size. */
const CALLOUT_TRACKING = 0.1;

/**
 * The arrival's word, at the point of closest approach.
 *
 * In the **body's own hue** rather than in a tier colour, and that is spec
 * [00 · §1](../../docs/spec/00-tokens.md)'s rule kept rather than an exception to
 * it: *"quality colours live only in type"* is about LUMEN and SOLAR, which mark
 * where a release landed on a ladder. An arrival has no ladder — one rung — so
 * there is no quality to colour, and what is worth saying instead is **which body
 * you did it to**. Identity is hue, and this is the body's light for a moment.
 *
 * Rimmed like the release's word and set in the same face, because they are two
 * of one thing and a second grammar for the second one would be two.
 */
function drawArrival(context: CanvasRenderingContext2D, arrival: ArrivalView): void {
  if (arrival.strength <= 0) return;
  context.save();
  context.font = `800 ${arrival.size}px ${UTILITY_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.letterSpacing = `${arrival.size * CALLOUT_TRACKING}px`;
  context.lineWidth = RIM_WIDTH;
  context.lineJoin = 'round';
  context.strokeStyle = dim(VOID, RIM_STRENGTH * arrival.strength);
  context.strokeText(arrival.word, arrival.x, arrival.y);
  context.fillStyle = identity(arrival.hue, arrival.strength);
  context.fillText(arrival.word, arrival.x, arrival.y);
  context.restore();
}

/**
 * The knock's word, at the point of contact.
 *
 * **In ION, and it is the only word in the game that wears no identity.** Spec
 * [00 · §1](../../docs/spec/00-tokens.md) gives ION a monopoly — *"risk, and
 * nothing else in the world glows pink"* — and the author asked for this one in
 * *"thematic pink"* without knowing the token was already sitting there waiting
 * for it. A collision is risk arriving, so it takes the reserved colour rather
 * than borrowing a body's hue: the arrival says *which body you did it to*, and
 * this says *what the floor had to do*, which is not about the body at all.
 *
 * Rimmed and set in the same face as the other two, because three words drawn
 * three ways would be three grammars.
 */
function drawKnock(context: CanvasRenderingContext2D, knock: KnockView): void {
  if (knock.strength <= 0) return;
  context.save();
  context.font = `800 ${knock.size}px ${UTILITY_FACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.letterSpacing = `${knock.size * CALLOUT_TRACKING}px`;
  context.lineWidth = RIM_WIDTH;
  context.lineJoin = 'round';
  context.strokeStyle = dim(VOID, RIM_STRENGTH * knock.strength);
  context.strokeText(knock.word, knock.x, knock.y);
  context.fillStyle = dim(ION, knock.strength);
  context.fillText(knock.word, knock.x, knock.y);
  context.restore();
}

/** Spec 00 §4's utility face. Never a monospace — the figures do the technical work. */
const UTILITY_FACE = "'Archivo', system-ui, sans-serif";
const LABEL_SIZE = 9 * BOARD_PIXEL;
const LABEL_OFFSET = 22 * BOARD_PIXEL;

/**
 * Draw one frame of a world.
 *
 * The whole buffer is painted VOID first, and then clipped to what this device
 * can actually show — the design space, plus whatever the fit left over, bounded
 * by the corridor's own line ([`visible`](./letterbox.ts)). The composition is
 * the same on every device because the design space's scale and offsets are the
 * same on every device (ADR-0010); what differs is only how much world is
 * visible beside it. Everything after the clip is in design units, and
 * everything after the second translate is in world units — which is what lets
 * every number in this file be one the design set states.
 */
export function draw(view: PresentationState, context: CanvasRenderingContext2D): void {
  const { canvas } = context;
  const fit = letterbox(canvas.width, canvas.height);

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = VOID;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.setTransform(fit.scale, 0, 0, fit.scale, fit.offsetX, fit.offsetY);
  const seen = visible(canvas.width, canvas.height, view.corridor, view.camera.x);
  context.beginPath();
  context.rect(seen.left, seen.top, seen.right - seen.left, seen.bottom - seen.top);
  context.clip();

  // **The sky, first and outside the world transform.** It is drawn here rather
  // than translated with everything else because the whole point of it is that it
  // does *not* move at world speed — see [`starfield.ts`](./starfield.ts), which
  // also carries the author's ruling against spec 05 §2 and why it was made.
  // **The sky's own colour, under the stars.** Spec 05 §4's altitude ramp and, if
  // the craft is in one, the anomaly's black bed and its curtains — the only
  // event permitted to repaint the sky (§5). Before the starfield, which is the
  // prototype's own order: the stars stay in front of the weather, so an anomaly
  // is a sky rather than a sheet hung over one.
  drawAnomaly(context, view.anomaly, view.camera, view.tick, seen);

  drawStarfield(context, SKY, view.camera, seen.top, seen.bottom);

  context.save();
  context.translate(DESIGN_WIDTH / 2 - view.camera.x, DESIGN_HEIGHT / 2 - view.camera.y);

  // **The dust, in front of the sky and behind everything else.** Spec 05 §2's
  // stack is SKY, DUST, STRATA, BODIES, PLAYER. Unlike the sky it is inside this
  // transform, which is the whole of why it moves at world speed: a mote's
  // position has no camera term in it at all.
  drawDust(context, DUST, view.camera, view.corridor, view.worldSpeed, view.chain, seen);

  // **The rungs, under everything else in the world.** Spec 05 §2's stack is SKY,
  // DUST, STRATA, BODIES, PLAYER, and this is STRATA — the medium the rest of the
  // picture is drawn on top of. Unlike the sky above it, it moves at world speed,
  // which is why it is inside this transform and the sky is not.
  drawRungs(context, view.camera, view.corridor, view.bodies, view.wake, seen);

  // **The boundary, over the field and under the bodies** — Direction 07's own
  // order, which lays down rungs and then the edge. It is inside this transform
  // because spec 07 §2 requires it *"in world space, never on the screen
  // edges"*: the edge is geography, and a vignette is what it must not be.
  drawBoundary(context, BOUNDARY, view.boundary, view.camera, seen);

  // A body is drawn if any of it can be seen. There is no horizontal test: the
  // field is no wider than the design space, which is the same fact the camera
  // is built on (`derive.ts`) — the corridor is wider, but nothing is placed out
  // there.
  const half = (seen.bottom - seen.top) / 2;
  for (const body of view.bodies) {
    const distance = Math.abs(body.y - view.camera.y);
    // The reach includes the bloom, because a glow whose source is just off the
    // top of the picture still lights the top of the picture.
    const reach = body.radius + Math.max(FLOOR_GAP, body.bloom);
    if (distance > half + reach) continue;

    // **A body does not go out the instant it is let go of.** Spec 04 §3's
    // *"the lamp goes out at release"* was built as one tick lit and the next
    // spent, in a game whose every other transition is a curve. What is drawn
    // through the going-out is both looks at once: the ash underneath at full,
    // and the body as it still burns fading over it. Two draws for a few ticks
    // on one body, which is what buys a colour crossing a canvas cannot mix —
    // identity hue to DUSK — without either look being invented here.
    if (body.spending === null) {
      drawBody(context, body);
      continue;
    }
    // A spent body has no lamp. That is `energyOf`'s rule and it is restated
    // here for one line, because this pass is the *finished* body and the field
    // presentation state carries is the one still burning.
    drawBody(context, { ...body, energy: 0, bloom: 0 });
    context.save();
    context.globalAlpha = fade(body.spending);
    drawBody(context, { ...body, state: 'HELD' });
    context.restore();
  }

  // **The deadline, with the compass and in the same grammar** — spec 03 §5's
  // *"the compass inverted"*. They are never both drawn: the compass needs a held
  // body and the deadline is null while one is held.
  if (view.deadline !== null) drawDeadline(context, view.deadline);

  if (view.compass !== null) drawCompass(context, view.compass);

  if (view.flash !== null) drawFlash(context, view.flash);

  if (view.callout !== null) drawCallout(context, view.callout);

  if (view.arrival !== null) drawArrival(context, view.arrival);
  // Last, so the one word that means *something just went wrong* is never drawn
  // under another. They cannot both be a capture's, but a knock and the previous
  // swing's release word can overlap.
  if (view.knock !== null) drawKnock(context, view.knock);

  // **The SOS, last of the world layers and over the craft** — spec 07 §6 puts it
  // *"at the craft"*, and a distress call under the thing it is about would be
  // the one cue in the game the player cannot see.
  if (view.sos !== null) drawSos(context, view.sos, view.craft);

  // The craft's own bloom is drawn round, and the dart inside it is what
  // stretches: spec 00 §5 puts every streak parallel to velocity, and a glow
  // pulled along the same axis would be a second streak saying the same thing at
  // a fifth of the contrast.
  bloom(
    context,
    view.craft.x,
    view.craft.y,
    0,
    view.craft.bloom,
    inToken(CORE),
    STRENGTH[view.craft.energy],
  );

  context.translate(view.craft.x, view.craft.y);
  context.rotate(view.craft.heading);
  // Along the velocity vector and across it — spec 02 §4 — which after the
  // rotate above are exactly the two axes of this transform.
  context.scale(view.craft.deformation.along, view.craft.deformation.across);
  craftPath(context);
  context.fillStyle = CORE;
  context.fill();

  context.restore();

  // Back in design-space coordinates, and that is where the sightings belong:
  // they are composition rather than world, so they are pinned to the design
  // space's own edge on every device (spec 00 §7) rather than to a point the
  // camera happens to be looking at.
  for (const mark of view.sightings) drawSighting(context, mark);

  context.restore();
}
