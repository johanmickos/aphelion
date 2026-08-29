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
import { letterbox, visible } from './letterbox.ts';
import { BODY_FILL, CORE, dim, DUSK, identity, identityLit, VOID } from './palette.ts';

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

/** Spec 04 §1's tide: 4 board pixels, constant whatever the body's radius. */
const TIDE_WIDTH = 4 * BOARD_PIXEL;

/**
 * How faint the lightest tide in the field may be.
 *
 * **An opening position.** Spec 04 §2 rules that a heavier body's tide is
 * *brighter* and states no number for either end, so what is fixed here is only
 * the floor; the rest of the range is the body's own mass, read straight off
 * [`TideView.strength`](../state/types.ts).
 */
const TIDE_FLOOR = 0.4;

/** Spec 04 §2's inner ripple, at α 0.3. */
const RIPPLE_STRENGTH = 0.3;

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
 */
const STRENGTH: Readonly<Record<Energy, number>> = { 0: 0, 1: 0.35, 2: 0.6, 3: 1 };

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

  bloom(
    context,
    body.x,
    body.y,
    body.radius,
    body.bloom,
    spent ? inToken(DUSK) : inHue(body.hue),
    STRENGTH[body.energy],
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
 * The **ripple** is §2's second sentence — one stratum tracking the same bearing
 * more slowly still, so the body's inside is visibly behind its own limb.
 */
function drawTide(context: CanvasRenderingContext2D, body: BodyView, tide: TideView): void {
  context.beginPath();
  context.arc(
    body.x,
    body.y,
    body.radius,
    tide.bearing - tide.halfWidth,
    tide.bearing + tide.halfWidth,
  );
  context.lineWidth = TIDE_WIDTH;
  context.strokeStyle = identityLit(body.hue, TIDE_FLOOR + (1 - TIDE_FLOOR) * tide.strength);
  context.stroke();

  const [inner] = STRATA[1]!;
  context.beginPath();
  context.arc(
    body.x,
    body.y,
    body.radius * inner,
    tide.ripple - tide.halfWidth,
    tide.ripple + tide.halfWidth,
  );
  context.lineWidth = STRATUM_WIDTH;
  context.strokeStyle = identityLit(body.hue, RIPPLE_STRENGTH);
  context.stroke();
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
 */
const CROSSING_RADIUS = 2 * BOARD_PIXEL;

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
  // State 1 · PRESS. *"The grab filament: a line from the craft to the body
  // pulling hardest, in that body's identity hue."* There is no instrument yet,
  // which is what makes the compass arriving *be* the freeze, seen.
  if (compass.hand === null) {
    context.beginPath();
    context.moveTo(compass.x, compass.y);
    context.lineTo(compass.craftX, compass.craftY);
    context.lineWidth = HAND_WIDTH;
    context.strokeStyle = identity(compass.hue, STRENGTH[2]);
    context.stroke();
    return;
  }

  // The trail: the arc of orbit already flown, on the orbit path itself, which
  // is the innermost ring's radius. E2 — it is the craft's own light, left behind.
  if (compass.swept > 0 && compass.rings.length > 0) {
    const path = compass.rings[0]!.radius;
    const from = compass.hand - compass.swept * compass.direction;
    context.beginPath();
    context.arc(compass.x, compass.y, path, from, compass.hand, compass.direction < 0);
    context.lineWidth = HAND_WIDTH;
    context.strokeStyle = dim(CORE, STRENGTH[2]);
    context.stroke();
  }

  // The hand: the radius through the craft, out past the outermost ring.
  context.beginPath();
  context.moveTo(compass.x, compass.y);
  context.lineTo(
    compass.x + Math.cos(compass.hand) * compass.reach,
    compass.y + Math.sin(compass.hand) * compass.reach,
  );
  context.lineWidth = HAND_WIDTH;
  context.strokeStyle = dim(CORE, HAND_AT_REST + (1 - HAND_AT_REST) * closest(compass));
  context.stroke();

  for (const ring of compass.rings) drawRing(context, compass, ring);
}

/**
 * One ring, its window, its dot and its crossing.
 *
 * The ring is DUSK at E0 — *"rings at rest"* — and everything on it belonging to
 * a body is that body's own hue, so target and window never need a legend.
 */
function drawRing(context: CanvasRenderingContext2D, compass: CompassView, ring: RingView): void {
  context.beginPath();
  context.arc(compass.x, compass.y, ring.radius, 0, Math.PI * 2);
  context.lineWidth = RING_WIDTH;
  context.strokeStyle = dim(DUSK, STRENGTH[1]);
  context.stroke();

  // The window heats **in place**: E1 at rest, E2 under live aim, and the hue
  // never moves (spec 00 §6).
  context.beginPath();
  context.arc(
    compass.x,
    compass.y,
    ring.radius,
    ring.dot - ring.halfWidth,
    ring.dot + ring.halfWidth,
  );
  context.lineWidth = WINDOW_WIDTH;
  context.strokeStyle = identity(ring.hue, STRENGTH[ring.energy]);
  context.stroke();

  // The dot at the window's centre — a perfect release — CORE white when matched.
  const dotX = compass.x + Math.cos(ring.dot) * ring.radius;
  const dotY = compass.y + Math.sin(ring.dot) * ring.radius;
  context.beginPath();
  context.arc(dotX, dotY, DOT_RADIUS, 0, Math.PI * 2);
  context.fillStyle = ring.matched ? dim(CORE, 1) : identity(ring.hue, STRENGTH[1]);
  context.fill();

  // The crossing: where the hand cuts this ring. The gap between it and the dot
  // is the grade, and it is drawn rather than said.
  const hand = compass.hand!;
  context.beginPath();
  context.arc(
    compass.x + Math.cos(hand) * ring.radius,
    compass.y + Math.sin(hand) * ring.radius,
    CROSSING_RADIUS,
    0,
    Math.PI * 2,
  );
  context.fillStyle = dim(CORE, STRENGTH[ring.energy]);
  context.fill();
}

/** How close the best-aimed window is, from 0 to 1 — what the hand brightens on. */
function closest(compass: CompassView): number {
  let best = 0;
  for (const ring of compass.rings) best = Math.max(best, ring.aim);
  return best;
}

/**
 * How bright the hand is before any aim has closed.
 *
 * **An opening position.** Spec 00 §6 has the hand *"thickening and brightening
 * as aim closes"* and states neither end; this is the floor, and the rest of the
 * range is the aim itself.
 */
const HAND_AT_REST = 0.35;

/**
 * A sighting — spec [03 · §6](../../docs/spec/03-hud.md), a dot on the edge of
 * the picture in the body's own hue.
 *
 * Drawn in **design-space** coordinates rather than world ones, which is why it
 * happens outside the camera's translate: the mark belongs to the composition,
 * and spec [00 · §7](../../docs/spec/00-tokens.md) rules that nothing the player
 * reads is drawn outside the design space, ever.
 *
 * **No vector is drawn**, and that is the acceptance criterion rather than a
 * style: the mark's position on the edge is the direction, and an arrow would be
 * the instruction spec 03 refuses.
 */
function drawSighting(context: CanvasRenderingContext2D, mark: SightingView): void {
  bloom(context, mark.x, mark.y, mark.radius, mark.bloom, inHue(mark.hue), STRENGTH[mark.energy]);
  context.beginPath();
  context.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
  context.fillStyle = identity(mark.hue, 1);
  context.fill();
}

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
    if (distance <= half + reach) drawBody(context, body);
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
