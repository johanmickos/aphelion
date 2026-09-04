/**
 * The HUD — spec [03](../../docs/spec/03-hud.md)'s **one layout, five
 * pressures**, drawn in design space.
 *
 * > *"The layout never changes between states; only the pressure does. The top
 * > band holds exactly two readables: the velocity masthead and the BANK chip.
 * > The bottom third belongs to the thumb."*
 *
 * Every position below is fixed. Nothing here moves, appears or disappears with
 * a pressure state — what changes is the **content** of one line and the
 * **brightness** of one chip, which is what makes spec 03's first acceptance
 * (*"a screenshot of any of the five states, with the bottom third masked, loses
 * no readable element"*) a property of the composition rather than of a test.
 *
 * ## Where the numbers come from
 *
 * Direction 03's artboard is **330 × 715** and draws the whole phone — its thumb
 * line sits at `y = 477`, which is two thirds of 715 and lands within 0.2% of
 * [`THUMB_LINE`](../state/design.ts) once converted. So every length in this
 * file is the board's own, at [`BOARD`](#board).
 *
 * ⚠ **That factor is not [`BOARD_PIXEL`](../state/design.ts)**, and the
 * difference is worth stating once rather than being rediscovered. `BOARD_PIXEL`
 * turns a **CSS pixel on the phone** into a design unit and is 3 (ADR-0010);
 * this turns **one board's own artboard units** into design units, and Direction
 * 03 happens to be drawn at 330 across rather than at 390. They are two
 * conversions of two different things and both are exact.
 *
 * ## The chip is the only thing here that knows about points
 *
 * The masthead is derived from the simulation and survives with the ledger
 * deleted; the BANK chip is drawn from the [`Economy`](../state/economy.ts) and
 * is simply absent in ZEN. That is spec 08 §7's mode matrix as a pair of `if`s
 * in a renderer rather than as a branch anywhere that matters.
 */
import { CORE, INK, ION, dim } from './palette.ts';
import { DESIGN_WIDTH } from '../state/design.ts';
import { fade, progress } from '../state/decay.ts';
import { POP_SCALE } from '../state/hud.ts';
import type { HudView } from '../state/hud.ts';
import type { ChainView } from '../state/chain.ts';
import type { Ledger } from '../state/ledger.ts';

/** Direction 03's artboard is 330 units across and the design space is 1170. */
const BOARD = DESIGN_WIDTH / 330;

/** Spec 00 §4's display face — *"velocity, mode titles, headline numbers"*, tracked 0.03em. */
const DISPLAY_FACE = "'Anton', 'Archivo', system-ui, sans-serif";

/** And its utility face, which does the instrument work. */
const UTILITY_FACE = "'Archivo', system-ui, sans-serif";

/** The board's own inset, both sides: `x = 20` of 330. */
const MARGIN = 20 * BOARD;

/** The velocity, at the board's `y = 52` and `font-size: 30`. */
const SPEED_BASELINE = 52 * BOARD;
const SPEED_SIZE = 30 * BOARD;

/** Its subline, at `y = 70`, `font-size: 9`, letter-spacing 2. */
const SUBLINE_BASELINE = 70 * BOARD;
const SUBLINE_SIZE = 9 * BOARD;
const SUBLINE_TRACKING = 2 * BOARD;

/** `CHAIN ×N`, at `y = 92`, `font-size: 11`, weight 600, letter-spacing 1. */
const CHAIN_BASELINE = 92 * BOARD;
const CHAIN_SIZE = 11 * BOARD;
const CHAIN_TRACKING = 1 * BOARD;

/** The BANK chip, right-aligned at `x = 310`, `y = 48`, `font-size: 11`, weight 600. */
const BANK_BASELINE = 48 * BOARD;
const BANK_SIZE = 11 * BOARD;
const BANK_TRACKING = 1 * BOARD;

/** And the armed cash on its second line, `y = 66`, `font-size: 10`. */
const ARMED_BASELINE = 66 * BOARD;
const ARMED_SIZE = 10 * BOARD;

/**
 * The lowest baseline the top band uses, in design units.
 *
 * Spec 00 §7: *"nothing readable may live below the thumb line, ever."* This is
 * what a test asserts that rule against without a canvas, and it is derived from
 * the layout rather than written twice.
 */
export const HUD_BOTTOM = Math.max(CHAIN_BASELINE, ARMED_BASELINE);

/** How brightly utility text sits at rest. */
const AT_REST = 0.85;

/** And the quiet line under it — the board's own step down. */
const SUBLINE_AT_REST = 0.5;

/**
 * What the BANK chip is worth while coasting — spec 03 §2's **55%**.
 *
 * *"Earning nothing, losing nothing, a fact not a scold."* It is a share of the
 * chip's own strength rather than an absolute, so the two move together.
 */
export const COASTING = 0.55;

/** Spec 03 §2's three sublines, and the one of them that is about risk. */
const SUBLINE: Readonly<Record<HudView['subline'], string>> = {
  PLAIN: 'M/S',
  RISING: 'M/S · RISING',
  TOWARD_EDGE: 'M/S · TOWARD EDGE',
};

/**
 * A number with its thousands spaced — the board's own `12 450` and `1 634`.
 *
 * A space rather than a comma or a point, because the game is read in one
 * sitting by one person and a separator that means *decimal* somewhere is a
 * separator that will be misread somewhere. Spec 00 §4 bans a monospace face, so
 * the figures are Archivo's tracked ones.
 */
export function spaced(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Draw the top band, in **design space** — the caller is in the same state
 * [`draw`](./index.ts) is in when it draws the sightings.
 *
 * `economy` is `null` in ZEN and the chip goes with it. Nothing else in the band
 * moves when it does, which is the point.
 */
export function drawHud(
  context: CanvasRenderingContext2D,
  hud: HudView,
  chain: ChainView,
  speed: number,
  ledger: Ledger | null,
): void {
  context.save();
  context.textBaseline = 'alphabetic';

  // **The velocity, and it pops rather than lying.** Spec 03 §2: *"digits pop to
  // 120% on a release and settle in 180ms; the value never lies."* What the pop
  // scales is the type, never the number.
  const popped = hud.pop === null ? 1 : 1 + (POP_SCALE - 1) * fade(hud.pop);
  context.textAlign = 'left';
  context.font = `${SPEED_SIZE * popped}px ${DISPLAY_FACE}`;
  context.letterSpacing = `${0.03 * SPEED_SIZE}px`;
  // CORE while it is being cashed and INK the rest of the time — spec 03 §3's
  // PEAK state, *"velocity heats to CORE"*, and the pop is that instant.
  context.fillStyle = hud.pop === null ? dim(INK, AT_REST) : CORE;
  context.fillText(spaced(speed), MARGIN, SPEED_BASELINE);

  context.font = `${SUBLINE_SIZE}px ${UTILITY_FACE}`;
  context.letterSpacing = `${SUBLINE_TRACKING}px`;
  // **ION when the subline is about the boundary** (spec 03 §2), and never
  // otherwise: ION is risk's monopoly (spec 00 §1).
  context.fillStyle = hud.subline === 'TOWARD_EDGE' ? dim(ION, AT_REST) : dim(INK, SUBLINE_AT_REST);
  context.fillText(SUBLINE[hud.subline], MARGIN, SUBLINE_BASELINE);

  // **`CHAIN ×N`, and it is the chain's second pixel** — spec 08 §4 gives the
  // chain the craft's bloom and spec 03 §2 gives it this line, which are the same
  // number said in light and in figures. It is drawn at every length including
  // zero, because the layout never changes between states.
  context.font = `600 ${CHAIN_SIZE}px ${UTILITY_FACE}`;
  context.letterSpacing = `${CHAIN_TRACKING}px`;
  // A milestone pulses the masthead — spec 06 §6's *"a masthead pulse and one
  // bloom step. No word."* The bloom step is the craft's ([`chain.ts`](../state/chain.ts));
  // this is the pulse, and it is brightness rather than a size change because
  // nothing in this band may move.
  const pulse = chain.milestone === null ? 0 : 1 - progress(chain.milestone);
  context.fillStyle = dim(INK, AT_REST + (1 - AT_REST) * pulse);
  context.fillText(`CHAIN ×${chain.links}`, MARGIN, CHAIN_BASELINE);

  if (ledger !== null) {
    // **The BANK chip: a utility chip, top-right, dimming while coasting.** Spec
    // 03 §2, and its opacity is a pure function of engagement and of nothing
    // else — which is spec 03's own acceptance criterion.
    const lit = AT_REST * (hud.engaged ? 1 : COASTING);
    context.textAlign = 'right';
    context.font = `600 ${BANK_SIZE}px ${UTILITY_FACE}`;
    context.letterSpacing = `${BANK_TRACKING}px`;
    context.fillStyle = dim(INK, lit);
    context.fillText(`BANK ${spaced(ledger.bank)}`, DESIGN_WIDTH - MARGIN, BANK_BASELINE);

    // **And the armed cash on a second line, while a graded release is armed.**
    // Spec 08 §8. It is *"a fact, not an instruction to release"* (spec 03 §3),
    // so it states a value and never a verb.
    if (ledger.armed !== null) {
      context.font = `${ARMED_SIZE}px ${UTILITY_FACE}`;
      context.fillStyle = dim(CORE, lit);
      context.fillText(`+${spaced(ledger.armed)}`, DESIGN_WIDTH - MARGIN, ARMED_BASELINE);
    }
  }

  context.restore();
}
