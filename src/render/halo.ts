/**
 * The **fuel halo** — spec [13 · §5](../../docs/spec/13-fuel.md)'s gauge, drawn
 * on the craft.
 *
 * Spec [03 · §2](../../docs/spec/03-hud.md): *"a halo arc around the craft that
 * doubles as a light source. Not a corner gauge."* Spec 13 §1: *"the halo arc on
 * the craft. Never a corner gauge."* Both are the same instruction said twice,
 * which is usually a sign somebody expected it to be ignored.
 *
 * ## The light source is the craft's own bloom, and the arc rides on it
 *
 * *"The cause and the gauge finally sharing a pixel"* is what spec 13's §4
 * summary asks for, and the way to get it wrong is to give the halo a glow of its
 * own: spec [00 · §3](../../docs/spec/00-tokens.md) makes **bloom** the game's
 * one ordinal channel, so a second glow around the craft would be a second thing
 * saying *more* about a different quantity. The craft already blooms at E2 and
 * widens with the chain; the arc is drawn inside that light rather than beside
 * it, so what the player sees is one lamp with a level on it.
 *
 * ## Severity rides the energy channel and there is no skull
 *
 * Spec [03 · §4](../../docs/spec/03-hud.md) retires the prototype's yellow-low /
 * red-empty / red-skull ladder: *"yellow would add a fourth meaning to hue, and
 * severity is ordinal, so it rides the energy channel like everything else"*, and
 * *"there is no skull. A skull judges; `SOS` states a fact."* So the three states
 * are one hue at three energies, and the hue is ION — which spec 07's own notice
 * already licenses: *"fuel, the deadline track and the save trail all wear pink
 * legitimately."*
 *
 * ## ⚠ Two of the three states are unreachable in play
 *
 * Nothing spends the tank on this build ([`fuel.ts`](../state/fuel.ts)), so `f`
 * is 1.0 for the whole of every run and only `NORMAL` is ever drawn. The other
 * two are built and tested directly, in the shape this repo already uses for a
 * term whose consumer has not arrived.
 *
 * ⚠ **And spec 13 §5's *"the percentage number is the label"* is not built.** It
 * is a *readable* element attached to the craft, and spec 00 §7 forbids anything
 * readable below the thumb line — the camera holds the craft above it (measured
 * at 182 design units below centre against a 422 budget) but that is a
 * measurement over one run rather than a guarantee, and the placement wants an
 * author who can see it with fuel that actually moves. It lands with the burn.
 */
import { CORE, DUSK, ION, dim } from './palette.ts';
import { BOARD_PIXEL } from '../state/design.ts';
import type { HaloView } from '../state/fuel.ts';

/**
 * How far out the ring sits, in design units — clear of the craft's own
 * silhouette and well inside its bloom.
 *
 * The dart is 27 units from centre to nose and 15 across
 * ([`craftPath`](./index.ts)); at 36 the ring clears the nose by nine and the
 * tail by eighteen, so it reads as a collar rather than as an outline. The
 * craft's E2 bloom is 54, so the whole gauge sits inside the light it is a gauge
 * of.
 *
 * **An opening position** (`docs/spec/README.md`'s third kind): no board draws
 * this and no spec states it.
 */
export const HALO_RADIUS = 12 * BOARD_PIXEL;

/**
 * How thick it is, in design units — read as a **level** rather than as a line.
 *
 * Above both of spec [14 · §3.1](../../docs/spec/14-retro-grade.md)'s floors with
 * margin, because a gauge that dithers is a gauge that lies. An opening position,
 * like the radius.
 */
export const HALO_WIDTH = 2 * BOARD_PIXEL;

/** How lit the ring is at rest — E1's own strength, which is what *lit and not hot* is. */
export const HALO_AT_REST = 0.35;

/** And how lit the empty ring's structure is: DUSK, spent, like a taken body. */
export const HALO_SPENT = 0.3;

/** Where the gauge starts, in radians — the top of the picture, and it never rotates. */
const FROM = -Math.PI / 2;

/**
 * Draw the halo, in world space, around a craft at `(x, y)`.
 *
 * **It does not turn with the craft.** The dart rotates onto its velocity every
 * tick and a gauge that spun with it would have to be read from a moving datum;
 * spec 00 §5's *"the camera is never rotated"* is the same instinct one element
 * along, and the arc is the only thing drawn on the craft that is about a number
 * rather than about a heading.
 */
export function drawHalo(
  context: CanvasRenderingContext2D,
  halo: HaloView,
  x: number,
  y: number,
): void {
  context.save();
  context.lineWidth = HALO_WIDTH;
  context.lineCap = 'butt';

  if (halo.severity === 'EMPTY') {
    // **Hollowed to structure, with the warning over it.** Spec 13 §5: the ring
    // goes DUSK — spent, like a taken body — and an ION ring strobes on top. The
    // structure is the whole circle because an empty gauge still has a shape.
    context.strokeStyle = dim(DUSK, HALO_SPENT);
    context.beginPath();
    context.arc(x, y, HALO_RADIUS, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = dim(ION, halo.beat);
    context.beginPath();
    context.arc(x, y, HALO_RADIUS, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    return;
  }

  if (halo.sweep > 0) {
    // CORE while there is nothing to warn about — the craft's own token, because
    // this is the craft's own light. ION once the tank can cost the run.
    const token = halo.severity === 'LOW' ? ION : CORE;
    const lit = halo.severity === 'LOW' ? halo.beat : HALO_AT_REST;
    context.strokeStyle = dim(token, lit);
    context.beginPath();
    context.arc(x, y, HALO_RADIUS, FROM, FROM + halo.sweep * Math.PI * 2);
    context.stroke();
  }

  context.restore();
}
