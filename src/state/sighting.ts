/**
 * The bodies the picture cannot show, marked on its edge.
 *
 * Spec [03 · §6](../../docs/spec/03-hud.md), and `CONTEXT.md`'s **sighting**: a
 * dot on the edge of the picture in the body's own hue, saying *which body* and
 * *which way* and nothing else. **It does not point.** The mark's position on
 * the edge is the direction, which is the whole reason the form survives spec
 * 03's own acceptance — *"no instruction text is drawn anywhere in the world"*,
 * and an arrow is an instruction.
 *
 * **It is how the game pays for a fixed width** (author, 2026-08-28). Spec
 * [00 · §7](../../docs/spec/00-tokens.md) fixes the design width and lets the
 * height flex, which buys a full-size picture and costs field of view: measured
 * over 877 releases that reached another body, the body the craft next grabs is
 * off the picture **12%** of the time as the space is fitted today and **32%**
 * under §7's ruled fit. This is what that 32% reads instead.
 *
 * ## The picture is the design space, and that is a decision
 *
 * A device shows the design space *plus* whatever the fit left over — the
 * **bleed** — and how much of it depends on the device. Presentation state
 * cannot know that and must not: ADR-0006's promise is that a frame is a pure
 * function of `(recipe, tick)`, which stops being true the moment the count of
 * marks depends on a viewport. So *"off the picture"* means **outside the design
 * space**, the rectangle spec 00 §7 makes the contract, and the mark sits on
 * that rectangle's own edge rather than on the buffer's.
 *
 * The cost is stated: a wide desktop window can show a body in the bleed *and* a
 * mark for it just inside the design space. That is the same trade the bleed
 * already makes everywhere else — the composition is identical on every device,
 * and what differs is only how much world is visible beside it.
 *
 * ## What is not built, and it is recorded rather than forgotten
 *
 * **Distance.** The prototype fades a marker with range and prints the number.
 * Direction 03 refuses the label and §6 records that the fade has no replacement
 * here, because brightness is the only ordinal channel and hue is already spent
 * on identity — so a sighting is flat **E1** and says nothing about how far.
 * **The ring on the body a press would take** is §6's other recorded absence,
 * and it is worth revisiting only after the compass exists, because the compass
 * is built over the same question.
 */
import type { Body } from '../sim/body.ts';
import type { Craft } from '../sim/craft.ts';
import { bloomOf } from './energy.ts';
import { hueOf } from './identity.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './design.ts';
import type { BodyState, CameraView, SightingView } from './types.ts';

/**
 * How big the mark itself is, in design units.
 *
 * **An opening position.** Direction 03 draws a dot and states no size, and the
 * only constraint that is not taste is spec 00 §7's: nothing the player reads
 * may be drawn outside the design space, so the dot is inset by its own radius
 * and never straddles the edge. It is on the bench.
 */
export const SIGHTING_RADIUS = 12;

/**
 * The energy a sighting burns at — **E1, flat**.
 *
 * Spec 03 §6 is explicit that this is where the distance information went: *"if
 * a sighting ever needs to say how far, stepping its energy is the one answer
 * that needs no label and breaks no rule. It says nothing about distance today,
 * at a flat E1."* So the step is a constant here on purpose, and the day it
 * stops being one is the day distance is ruled.
 */
const SIGHTING_ENERGY = 1;

/**
 * Every body the picture cannot show, in address order.
 *
 * Three rules, and each is a line in spec 03 §6's table. A body **already on
 * screen** has none — *"a mark pointing at a thing the player can see is clutter
 * over the exact thing it was pointing at."* A body **behind the climb** has
 * none — *"a mark below the craft points at somewhere it has already been, which
 * is clutter and a suggestion to turn around."* And a **spent** body has none,
 * which §6 does not say and spec [04 · §3](../../docs/spec/04-bodies.md) does:
 * its lamp is out, and a sighting is that lamp seen from further away. There is
 * no fourth rule, because *"reach is not yet a number"* — §6 defers it to spec
 * 17 and draws every body ahead until then.
 */
export function sightingsOf(
  bodies: readonly Body[],
  states: readonly BodyState[],
  craft: Craft,
  camera: CameraView,
): SightingView[] {
  const found: SightingView[] = [];
  for (let address = 0; address < bodies.length; address++) {
    const body = bodies[address]!;
    if (states[address] === 'SPENT') continue;
    if (body.y >= craft.y) continue;
    if (onScreen(body, camera)) continue;
    found.push(markFor(body, address, camera));
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
 * Every other position in this layer is a world position and this deliberately
 * is not: the mark belongs to the composition, not to the world, and spec 00 §7
 * rules that the composition is identical on every device. A world position
 * would also shimmer, because the renderer interpolates the camera between ticks
 * and the mark would slide against the edge it is supposed to be pinned to.
 *
 * The point is where the ray from the middle of the picture to the body leaves
 * the rectangle, inset by the mark's own radius so it never straddles the edge.
 */
function markFor(body: Body, address: number, camera: CameraView): SightingView {
  const dx = body.x - camera.x;
  const dy = body.y - camera.y;
  const halfWidth = DESIGN_WIDTH / 2 - SIGHTING_RADIUS;
  const halfHeight = DESIGN_HEIGHT / 2 - SIGHTING_RADIUS;

  // The ray always leaves through one of the two axes, and the nearer crossing
  // is the one on the rectangle. `dy` is never zero for a body ahead of the
  // craft, so the vertical crossing is always available.
  const reach = Math.min(dx === 0 ? Infinity : halfWidth / Math.abs(dx), halfHeight / Math.abs(dy));

  return {
    x: DESIGN_WIDTH / 2 + dx * reach,
    y: DESIGN_HEIGHT / 2 + dy * reach,
    hue: hueOf(address),
    energy: SIGHTING_ENERGY,
    bloom: bloomOf(SIGHTING_ENERGY),
    radius: SIGHTING_RADIUS,
  };
}
