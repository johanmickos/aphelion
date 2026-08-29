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
  BodyState,
  BodyView,
  CompassView,
  Energy,
  FlashView,
  PresentationState,
  RingView,
  SightingView,
  TideView,
} from '../state/types.ts';
import { fade } from '../state/decay.ts';
import { letterbox, visible } from './letterbox.ts';
import { BODY_FILL, CORE, dim, DUSK, identity, identityRising, VOID } from './palette.ts';

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
 * and not for it. `RIM_AT_REST` is that state's strength and is the number the
 * author asked to be able to move — *"how legible a body at rest is"* — which
 * §3 now answers at 40%.
 */
const RIM_AT_REST = 0.4;

interface Look {
  /** Rim stroke width, in board pixels (§1's scale rule). */
  readonly rim: number;
  readonly rimStrength: number;
  /** The outer stratum's alpha; the inner takes §1's ratio of it. */
  readonly strata: number;
  readonly core: number;
}

const LOOK: Readonly<Record<BodyState, Look>> = {
  AHEAD: { rim: 2.5, rimStrength: RIM_AT_REST, strata: 0.1, core: 0.3 },
  IN_REACH: { rim: 2.25, rimStrength: 0.85, strata: 0.18, core: 0.5 },
  HELD: { rim: 2.5, rimStrength: 1, strata: 0.3, core: 0.8 },
  SPENT: { rim: 1.5, rimStrength: 0.5, strata: 0.14, core: 0.5 },
};

/**
 * Where the strata sit, as fractions of the radius, and how much of the state's
 * alpha each takes — spec 04 §1's 0.68r and 0.39r at α 0.22 and 0.14.
 *
 * §1 gives the pair absolute alphas and §3 gives the state one; the state's is
 * what varies, so it is taken as the outer ring's and the inner keeps §1's ratio
 * to it. That way the two rings stay a pair through all four states.
 */
const STRATA: ReadonlyArray<readonly [at: number, share: number]> = [
  [0.68, 1],
  [0.39, 0.14 / 0.22],
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
const E1_STRENGTH = 0.18;
const E2_STRENGTH = 0.3;
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
  if (compass.path.length > 0) {
    if (compass.swept > 0) {
      const from = compass.hand - compass.swept * compass.direction;
      const span = Math.min(compass.swept, Math.PI * 2);
      traceArc(context, compass, from, span * compass.direction);
      context.lineWidth = HAND_WIDTH;
      context.strokeStyle = dim(CORE, STRENGTH[2] * compass.alpha);
      context.stroke();
    }
  }

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

/** How faint the whole orbit path is drawn, against the trail already flown. */
const PATH_STRENGTH = 0.16;
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

  context.save();
  context.translate(DESIGN_WIDTH / 2 - view.camera.x, DESIGN_HEIGHT / 2 - view.camera.y);

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

  if (view.compass !== null) drawCompass(context, view.compass);

  if (view.flash !== null) drawFlash(context, view.flash);

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
