/**
 * The bodies the picture cannot show, marked on its edge.
 *
 * Spec [03 · §6](../../docs/spec/03-hud.md), and `CONTEXT.md`'s **sighting**: a
 * mark at the edge of the picture in the body's own hue, saying which body, which
 * way, and how far.
 *
 * **It is how the game pays for a fixed width** (author, 2026-08-28). Spec
 * [00 · §7](../../docs/spec/00-tokens.md) fixes the design width and lets the
 * height flex, which buys a full-size picture and costs field of view: measured
 * over 877 releases that reached another body, the body the craft next grabs is
 * off the picture **12%** of the time as the space is fitted today and **32%**
 * under §7's ruled fit. This is what that 32% reads instead.
 *
 * ## It points now, and that is a ruling that was reversed
 *
 * On 2026-08-28 the author ruled that **a sighting does not point** — Direction
 * 03's edge dot, position as direction, no vector — and `CONTEXT.md` listed
 * *arrow* and *pointer* under `_Avoid_`. Flown, on 2026-08-29, they reversed it:
 * *"the coloured dots — personally I hate them. Let's instead re-design them to
 * be arrows with distance markers, like in the original prototype"*, and on the
 * no-instruction maxim that forbade it: *"this is another instance of an original
 * rule being too strict."*
 *
 * So a sighting carries a **bearing** and a **distance**. Two things about that
 * are worth having written down rather than inferred:
 *
 * - **The distance is a number and not a name.** The author called the labels
 *   *"a different class"* from the retired `P11` chips, and that retirement is
 *   explicitly about naming — *"a body is named by hue in the run and address in
 *   the retelling."* Identity stays hue-only; what the label says is how far.
 * - **What the unit means is still open.** Spec [05 · §3](../../docs/spec/05-field.md)
 *   has the same question about rung labels — metres, or an address — and it is
 *   the author's. This says design units until that is ruled, and follows it when
 *   it is.
 *
 * ## Reach, which the spec left open and the prototype had measured
 *
 * §6 records *"reach is not yet a number"* and defers it to spec
 * [17](../../docs/spec/17-daily-field.md). The prototype carries one —
 * `edgeMarkerRange`, 1 300 of its units — and the behaviour it buys is what
 * ADR-0013 says to carry: past it there is nothing to read and a mark is clutter.
 * It is [`SIGHTING_RANGE`](#) here, converted, and spec 17 still replaces it.
 */
import type { Body } from '../sim/body.ts';
import type { Craft } from '../sim/craft.ts';
import { distance } from '../sim/math.ts';
import { angleOf } from '../sim/trig.ts';
import { SCALE } from '../sim/units.ts';
import { bloomOf } from './energy.ts';
import { hueOf } from './identity.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './design.ts';
import type { BodyState, CameraView, SightingView } from './types.ts';

/**
 * How big the mark is, in design units.
 *
 * **An opening position**, and the only constraint that is not taste is spec
 * 00 §7's: nothing the player reads may be drawn outside the design space, so
 * the mark is inset by its own size and never straddles the edge.
 */
export const SIGHTING_RADIUS = 12;

/**
 * How far a body may be and still be marked — the prototype's 1 300, converted.
 *
 * Spec 03 §6 leaves this open and spec 17 closes it. What is carried meanwhile is
 * the behaviour rather than the number's authority: past this the coast is long
 * and featureless, and marking it *"invites the player to aim past the
 * interesting part of the field"* — the prototype's own words about the same
 * bound one instrument over.
 */
export const SIGHTING_RANGE = 1300 * SCALE;

/** Where the fade begins and ends — the prototype's 200 and 1 600, converted. */
const FADE_FROM = 200 * SCALE;
const FADE_TO = 1600 * SCALE;

/**
 * How faint the furthest mark may get.
 *
 * Not zero: a mark that fades to nothing is a body that vanishes rather than one
 * that is far away, and the range above is what says *nothing to read here*.
 */
const FAINTEST = 0.35;

/**
 * The energy a sighting burns at — **E1**.
 *
 * Spec 03 §6 records that this is where distance went: *"brightness is the only
 * ordinal channel and hue is already spent on identity, so if a sighting ever
 * needs to say how far, stepping its energy is the one answer."* It now says so
 * twice — the label, and the fade — and the step stays E1 because the fade is an
 * alpha rather than a step.
 */
const SIGHTING_ENERGY = 1;

/**
 * Every body the picture cannot show, in address order.
 *
 * Four rules. A body **already on screen** has none — *"a mark pointing at a
 * thing the player can see is clutter over the exact thing it was pointing
 * at."* A body **behind the climb** has none — *"a mark below the craft points at
 * somewhere it has already been."* A **spent** body has none, which §6 does not
 * say and spec [04 · §3](../../docs/spec/04-bodies.md) does: its lamp is out, and
 * a sighting is that lamp seen from further away. And a body **past
 * [`SIGHTING_RANGE`](#)** has none.
 */
export function sightingsOf(
  bodies: readonly Body[],
  states: readonly BodyState[],
  offered: readonly boolean[],
  craft: Craft,
  camera: CameraView,
): SightingView[] {
  const found: SightingView[] = [];
  for (let address = 0; address < bodies.length; address++) {
    const body = bodies[address]!;
    if (states[address] === 'SPENT') continue;
    if (body.y >= craft.y) continue;
    if (onScreen(body, camera)) continue;

    // Measured from the **craft**, not from the camera: it is how far the player
    // has to fly, and the camera is only where it is being watched from.
    const away = distance(craft.x, craft.y, body.x, body.y);
    if (away > SIGHTING_RANGE) continue;
    found.push(markFor(body, address, camera, away, offered[address] === true));
  }
  return found;
}

/** Whether any part of a body's disc falls inside the design space. */
function onScreen(body: Body, camera: CameraView): boolean {
  return (
    Math.abs(body.x - camera.x) < DESIGN_WIDTH / 2 + body.radius &&
    Math.abs(body.y - camera.y) < DESIGN_HEIGHT / 2 + body.radius
  );
}

/**
 * Where the mark sits, in **design-space** coordinates rather than world ones.
 *
 * Every other position in this layer is a world position and this deliberately is
 * not: the mark belongs to the composition, not to the world, and spec 00 §7
 * rules the composition identical on every device. A world position would also
 * shimmer, because the renderer interpolates the camera between ticks and the
 * mark would slide against the edge it is pinned to.
 */
function markFor(
  body: Body,
  address: number,
  camera: CameraView,
  away: number,
  offered: boolean,
): SightingView {
  const dx = body.x - camera.x;
  const dy = body.y - camera.y;
  const halfWidth = DESIGN_WIDTH / 2 - SIGHTING_RADIUS;
  const halfHeight = DESIGN_HEIGHT / 2 - SIGHTING_RADIUS;
  const reach = Math.min(dx === 0 ? Infinity : halfWidth / Math.abs(dx), halfHeight / Math.abs(dy));

  return {
    x: DESIGN_WIDTH / 2 + dx * reach,
    y: DESIGN_HEIGHT / 2 + dy * reach,
    // Which way the body actually lies, which the mark now points along. Its
    // position on the edge still carries the same fact; the arrow is what the
    // author asked for on top of it.
    bearing: angleOf(dx, dy),
    hue: hueOf(address),
    away,
    offered,
    // Full strength for the one a press would take, whatever the fade would
    // otherwise say — the difference between *there is a body over there* and
    // *take it now*.
    strength: offered ? 1 : Math.max(FAINTEST, Math.min(1, 1 - (away - FADE_FROM) / FADE_TO)),
    energy: SIGHTING_ENERGY,
    bloom: bloomOf(SIGHTING_ENERGY),
    radius: SIGHTING_RADIUS,
  };
}
