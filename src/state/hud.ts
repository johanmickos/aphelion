/**
 * The HUD's facts — **one layout, five pressures**, and only the pressure moves.
 *
 * Spec [03 · §3](../../docs/spec/03-hud.md): *"one layout, five states. Nothing
 * moves between states; only energy and content change."* So there is no
 * geometry in this file at all: what is here is the two or three things the top
 * band **says**, and where they are said is the renderer's fixed layout
 * ([`hud.ts`](../render/hud.ts)).
 *
 * ## Why the readouts are facts and not readings of the economy
 *
 * The velocity is *"the headline number and worth zero points"* (spec 08 §6) and
 * the BANK chip is the ledger's. Both are in the top band and only one of them
 * knows the economy exists — which is why the chip is drawn from the
 * [`Economy`](./economy.ts) the renderer is handed and everything in this file is
 * derived from the simulation. ZEN keeps the masthead and loses the chip.
 */
import { speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import { advance, place, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import type { PresentationState } from './types.ts';

/**
 * How long the velocity's pop lasts — spec 03 §2's *"digits pop to 120% on a
 * release and settle in 180ms."*
 *
 * The same 180ms the release kick and the craft's own stretch are given (spec
 * 02 §4, §5), because it is the same instant said three ways.
 */
export const POP_TICKS = ticksIn(180);

/** And how far they pop: spec 03 §2's **120%**. */
export const POP_SCALE = 1.2;

/**
 * How long `RISING` stays up after the last tick that raised the speed — spec
 * 00 §5's **DECAY**, 420ms.
 *
 * ## It is a latch, and the alternative was measured to flicker
 *
 * *"States the current fact"* is spec 03 §2's whole instruction, and the fact is
 * *the craft is being accelerated*. Read tick by tick that is true and unusable:
 * a coasting craft feels no gravity at all (spec 01 §2), so its speed is
 * constant or falling and the word is simply off — but a craft riding an
 * eccentric frozen orbit speeds up on the way down and slows on the way out, so
 * an unlatched reading blinks on and off twice a swing. A latch turns *"the
 * speed went up on that tick"* into *"the craft has been gaining speed
 * recently"*, which is the sentence the board is showing at its PEAK state.
 *
 * ⚠ **The rule is derived rather than ruled.** Spec 03 §2 names the three
 * sublines and does not say when each is said; this is one reading, recorded so
 * the author can overrule it cheaply.
 */
export const RISING_TICKS = ticksIn(420);

/**
 * The least a tick may add to the craft's speed to count as rising, in design
 * units per second.
 *
 * A floor rather than a comparison against zero: floating point makes a
 * constant-speed orbit rise and fall by fractions of a unit, and a readout that
 * answered to those would be reporting arithmetic. One design unit a second is
 * a thousandth of the speed the author flies at.
 */
export const RISING_FLOOR = 1;

/** What the line under the velocity says — spec 03 §2's three. */
export type Subline = 'PLAIN' | 'RISING' | 'TOWARD_EDGE';

/** The top band's facts. */
export interface HudView {
  /** The velocity's pop, or `null`. */
  readonly pop: Decay | null;
  /** The latch behind [`RISING`](#rising_ticks), or `null`. */
  readonly rising: Decay | null;
  readonly subline: Subline;
  /**
   * Whether a body is held.
   *
   * Spec 03's acceptance: *"the BANK chip's opacity is a pure function of
   * engagement; toggling coasting toggles it and nothing else."* This is that
   * function's whole input, on the state rather than worked out in the renderer,
   * so the criterion is assertable without a canvas.
   */
  readonly engaged: boolean;
}

/** A run opens with a plain subline, nothing popping and nothing held. */
export const NO_HUD: HudView = { pop: null, rising: null, subline: 'PLAIN', engaged: false };

/**
 * The top band one tick on.
 *
 * `released` is the same event `derive.ts` reads off the previous picture, so
 * nothing is recorded in the simulation for the HUD's benefit.
 *
 * **`TOWARD EDGE` wins**, because it is the only one of the three that is about
 * risk — spec 03 §2 puts it in ION and spec 03 §4 makes the boundary a severity
 * state. It is gated on the boundary being **drawn**, not merely on the craft
 * closing: the author's ruling of 2026-09-01 is that the edge is off screen for
 * most of play and *"I don't want to signal danger during normal gameplay"*, and
 * a subline that said it while nothing was on screen would be exactly that.
 */
export function hudOf(
  previous: HudView,
  view: Omit<PresentationState, 'hud'>,
  sim: SimState,
  released: boolean,
  before: number,
): HudView {
  const speed = speedOf(sim.craft);
  const rising = speed - before >= RISING_FLOOR ? place(RISING_TICKS) : advance(previous.rising);
  const toward = view.boundary.some((side) => side.presence > 0 && side.closing > 0);
  return {
    pop: released ? place(POP_TICKS) : advance(previous.pop),
    rising,
    subline: toward ? 'TOWARD_EDGE' : rising === null ? 'PLAIN' : 'RISING',
    engaged: sim.heldBody !== null,
  };
}
