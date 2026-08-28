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
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import type { BodyView, Energy, FlashView, PresentationState } from '../state/types.ts';
import { letterbox, visible } from './letterbox.ts';
import { BODY_FILL, CORE, dim, DUSK, VOID } from './palette.ts';

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

/** The rim of a body at rest, and the rim of one that has the craft. */
const RIM_AT_REST = 0.35;
const RIM_HELD = 1;

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
  token: string,
  strength: number,
): void {
  if (radius <= 0 || strength <= 0) return;
  const gradient = context.createRadialGradient(x, y, from, x, y, from + radius);
  gradient.addColorStop(0, dim(token, strength));
  gradient.addColorStop(1, dim(token, 0));
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, from + radius, 0, Math.PI * 2);
  context.fill();
}

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
  bloom(context, flash.x, flash.y, 0, flash.radius, CORE, STRENGTH[3]);
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

function drawBody(context: CanvasRenderingContext2D, body: BodyView): void {
  bloom(context, body.x, body.y, body.radius, body.bloom, DUSK, STRENGTH[body.energy]);

  context.beginPath();
  context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  context.fillStyle = BODY_FILL;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = dim(DUSK, body.held ? RIM_HELD : RIM_AT_REST);
  context.stroke();

  if (!body.held) return;
  context.beginPath();
  context.arc(body.x, body.y, body.radius + FLOOR_GAP, 0, Math.PI * 2);
  context.lineWidth = 1.5;
  context.strokeStyle = dim(DUSK, 0.28);
  context.stroke();
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
    CORE,
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
}
