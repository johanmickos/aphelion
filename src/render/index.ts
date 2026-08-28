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
 * ## What M1.6 draws, and what it deliberately does not
 *
 * Circles and lines: the sky, a disc and a rim for every body, a ring at the
 * floor of the one being held, and a dart for the craft. **No glow, no compass,
 * no HUD** — [M1.6](../../docs/plan/m1-the-swing.md) exists to make the swing
 * flyable so the author can judge whether it feels right, and every instrument
 * drawn before that judgement is an instrument built on an untested premise. The
 * bloom chain is M3's, the compass is [M2](../../docs/plan/m2-the-instrument.md)'s.
 *
 * The colours are the palette's even though the shapes are crude, because spec
 * [00](../../docs/spec/00-tokens.md)'s acceptance is a lint and a lint does not
 * care how early it is: VOID for the sky, CORE for the craft, DUSK for
 * structure. Where this file needs to say *more* — a held body against a body at
 * rest — it says it in brightness, which §3 makes the only ordinal channel in
 * the game.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import type { BodyView, PresentationState } from '../state/types.ts';
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
    if (distance <= half + body.radius + FLOOR_GAP) drawBody(context, body);
  }

  context.translate(view.craft.x, view.craft.y);
  context.rotate(view.craft.heading);
  craftPath(context);
  context.fillStyle = CORE;
  context.fill();

  context.restore();
}
