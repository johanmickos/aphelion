/**
 * The design space onto pixels: one transform, and the bars either side of it.
 *
 * ADR-0010 rules that *"everything is drawn in world space in design
 * coordinates, identical on every device"*, and spec
 * [00 · §7](../../docs/spec/00-tokens.md) that *"nothing the player reads is
 * drawn outside it, ever"*. Both of those are one decision: the design space is
 * fitted whole, at a uniform scale, and centred. **Not a CSS scale on DOM elements** — the
 * composition has to survive being a picture, not a layout.
 *
 * What is left over is the **bleed**, and it is world rather than black — see
 * [`bleed`](#bleed) below for what that does and does not change. The rule it
 * keeps is the one that matters: nothing the player has to read lives outside
 * the design space, so the composition is identical on every device even where
 * the amount of visible world is not.
 *
 * It is pure arithmetic on purpose. [M3.1](../../docs/plan/m3-the-field.md)'s
 * acceptance is *"identical composition across aspect ratios"*, and a projection
 * that only exists inside a canvas context is one no test can ask that of.
 *
 * A phone letterboxes too, and that is worth knowing before the gate: browser
 * chrome takes a bite out of the viewport's height, so the design space —
 * authored at the size of the whole screen — never quite fits it and the fit is
 * bound by height. What the author sees on the phone is therefore the design
 * space scaled down by whatever fraction the chrome took, with the bars at the
 * sides. It is the same composition; it is not the same size in the hand as a
 * build that sized itself to the viewport instead, and the M1 gate is flying
 * this one against a prototype that does the latter.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH, GUARANTEED_BAND } from '../state/design.ts';
import type { CorridorView } from '../state/types.ts';

export interface Letterbox {
  /** Device pixels per design unit. Uniform: the aspect never changes. */
  readonly scale: number;
  /** Where the design space's top-left corner lands, in device pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * ⚠ **The band moved to [`design.ts`](../state/design.ts) in M4.5**, where the
 * composition can read it.
 *
 * It has two jobs. As a bound on the **scale** — every device shows the band in
 * full, and a viewport too short for it at the width's scale is scaled down until
 * it does — it is this file's, and [`letterbox`](#letterbox) below is still where
 * that happens. As the rectangle *"everything the player reads is composed
 * inside"* (spec 00 §7) it is a fact about the design space, and the two things
 * that most need it — the top band and the callout's clamp — live where the
 * renderer cannot be imported from.
 *
 * Re-exported so nothing that already reads it here has to move.
 */
export { GUARANTEED_BAND };

/**
 * Fit the design space into a buffer of `width` × `height` device pixels.
 *
 * **The scale comes from the width** (spec 00 §7, author 2026-08-28): *"the
 * width is the contract and the height flexes... 1170 design units across,
 * always, and how much height a device shows follows from its own shape."*
 *
 * ## Why this is not the fit that was here before, and what it was costing
 *
 * It fitted the design space **whole**, bound by whichever axis ran out first —
 * and on a phone that is always the height, because browser chrome takes a bite
 * out of the viewport that the design space was authored without. Measured on
 * the author's own device: 393 × 651 css against 1170 × 2532 fits at **0.257**
 * where the width alone gives **0.336**, so everything was drawn at **77%** of
 * the size the prototype draws it at on the same phone. That is spec 00 §7's own
 * number, and this file's header has predicted the consequence since M1.4 — *"it
 * is not the same size in the hand as a build that sized itself to the viewport
 * instead, and the M1 gate is flying this one against a prototype that does the
 * latter."*
 *
 * **The consequence was pace**, and it was the whole of a complaint that read as
 * physics. A settled orbit runs at 940 design units per second; at the old fit
 * that is **242 css px/s** and at this one it is **316**. The prototype,
 * measured live in the browser, draws 390 world units across the full viewport
 * width and puts the same orbit at **315 css px/s**. The two now match to within
 * a third of a percent, and not one number in the simulation moved to do it.
 *
 * ## One of spec 00 §7's two guardrails, and why the other is not here
 *
 * [`GUARANTEED_BAND`](#) is the floor: every device shows the band in full, and
 * a viewport too short for it at the width's scale is scaled down until it does.
 * That one belongs here because it is a statement about the **scale**.
 *
 * The **cap on the extra** — *"a device tall enough to show more than the band
 * does not get unbounded extra field"* — deliberately is not. Implemented as a
 * scale it would zoom **in** on a tall device and crop the width, and the width
 * is the one thing §7 makes absolute: *"1170 design units across, always."* It is
 * a statement about what is **drawn**, which is [`visible`](#visible)'s
 * business, and what to do with the space it would refuse — bleed, or a bar — is
 * a composition question.
 *
 * **It was built there on 2026-09-04, and the answer was a bar.** The cap is
 * zero: sideways, a device is shown the design space and nothing besides. See
 * [`visible`](#visible), which carries the flown fault and the argument for why
 * no other value holds still.
 */
export function letterbox(width: number, height: number): Letterbox {
  const fromWidth = width / DESIGN_WIDTH;
  // **A larger scale shows less height**, so the band is a *ceiling* on the
  // scale rather than a floor — and taking the smaller of the two is what makes
  // both promises at once: the full width, always, and never less than the band.
  const showsTheBand = height / (DESIGN_HEIGHT * GUARANTEED_BAND);
  const scale = Math.min(fromWidth, showsTheBand);
  return {
    scale,
    offsetX: (width - DESIGN_WIDTH * scale) / 2,
    offsetY: (height - DESIGN_HEIGHT * scale) / 2,
  };
}

/**
 * How far outside the design space, in design units, the buffer can still show —
 * **the bleed**.
 *
 * How much more world than the design space the buffer can show, per side, said
 * in design units instead of pixels.
 *
 * **It can be negative, and since the width-fit landed it usually is on one
 * axis.** A positive value is slack — world the device can draw beyond the
 * design space, the *bleed* proper. A negative one is a **crop**: the design
 * space is wider or taller than the buffer at this scale and some of it is off
 * the picture. On the author's phone `x` is slack and `y` is a crop, which is
 * exactly what *"the width is the contract and the height flexes"* means when
 * the height flexes shorter. [`visible`](#visible) reads both the same way — it
 * clips to what is actually on screen — so nothing downstream has to know which
 * sign it got.
 *
 * ## Why the bars stopped being black — and why sideways they are again
 *
 * ⚠ **The horizontal half of this section is history as of 2026-09-04.**
 * [`visible`](#visible) now caps sideways bleed at zero, so the side bars are
 * black once more and this function's `x` is no longer what decides the picture's
 * width — only its `y` still reaches the clip. What follows is why they were
 * filled in the first place, and it is kept because the reasoning still explains
 * the vertical axis and the trade that was re-taken to close it.
 *
 * They were, and it cost visibility for nothing. On the author's phone the fit
 * is bound by height — browser chrome takes a bite out of the viewport — so
 * there is a **46-point bar down each side**, which is **179 design units** of
 * world either side of the design space that the device could draw and was
 * being painted over. [M1.4](../../docs/plan/m1-the-swing.md) made that cost
 * real: the corridor is 1.9× the design width, the camera does not pan, and a
 * craft swung out on the wide part of an oval leaves the picture 538 units
 * before it reaches the line it dies at. Filling the bars recovers a third of
 * that.
 *
 * **The design space is still the whole of the contract.** Nothing composed
 * moves and nothing is resized: the scale, the offsets and therefore every
 * position in spec [00 · §7](../../docs/spec/00-tokens.md)'s composition are the
 * ones above, unchanged. What is in the bleed is world that a device may happen
 * to be able to show, and **nothing the player has to read may live there** —
 * that rule is the reason the design space exists and it is untouched.
 *
 * The cost is that two devices see different amounts of world, and it is
 * accepted rather than hidden: ADR-0010 makes the phone in portrait the target
 * and a desktop window a development surface, and `draw` bounds the bleed by the
 * corridor's own line so that no window, however wide, is shown more world than
 * there is.
 */
export function bleed(width: number, height: number): { readonly x: number; readonly y: number } {
  const { scale } = letterbox(width, height);
  return {
    x: (width / scale - DESIGN_WIDTH) / 2,
    y: (height / scale - DESIGN_HEIGHT) / 2,
  };
}

/** The rectangle a frame paints into, in design coordinates. */
export interface Seen {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * What this buffer can show, in design coordinates.
 *
 * The design space, **and sideways that is all of it** — plus whatever the fit
 * left over vertically ([`bleed`](./letterbox.ts)), and never more world than
 * there is. A desktop window bound by height has more slack than the corridor is
 * wide, and showing past the line would draw a place a run is already over in.
 *
 * ## Spec 00 §7's second guardrail, built 2026-09-04 — and why the cap is zero
 *
 * §7 named a *"cap on the extra"* and left it unbuilt, correctly refusing to
 * implement it as a **scale** — that would zoom in on a tall device and crop the
 * width, and *"1170 design units across, always"* is the one thing it does not
 * bend. It is *"a statement about what is **drawn**"*, which is this function,
 * and this is where it lands.
 *
 * **The author flew the fault it fixes** (2026-09-04, desktop Firefox at
 * 2560×1297): the rung labels appeared to travel sideways when the ship did. They
 * do not — a label is pinned to design `x` and is still to the pixel. What moved
 * was **the world underneath it**. The window this returned was a constant 2223
 * units wide but slid across the buffer as the camera panned, the unpainted
 * margin swinging from 1339∶287 at one camera extreme to 287∶1339 at the other.
 * A label 25 units from the field's left edge at one end of a pan was 1077 from
 * it at the other, and that read as the label moving.
 *
 * **Zero is not a taste, it is the only value that holds still.** The camera may
 * push the design space flush against a corridor wall, so at that extreme there
 * is no world beyond it to show on that side; any positive cap therefore goes on
 * being clamped by the corridor on one side and not the other, and goes on
 * sliding. The no-slide condition solves to `cap <= 0`.
 *
 * **It costs the phone 3.5 design units and the desktop its periphery.** That is
 * the trade the author took, and it is small on the device that matters because
 * the width-fit already spent the phone's slack on magnification rather than on
 * extra field — the 179 units the bars used to cost were gone before this. The
 * bleed had quietly become a desktop-only artefact, and a composition that is
 * *"identical on every device"* cannot be one the desktop sees sliding.
 *
 * The corridor arrives on presentation state rather than being read from the
 * simulation, which is the boundary this layer keeps: the renderer draws what it
 * is handed and asks nothing (`test/render/boundary.test.ts`). And it is here
 * rather than in `index.ts` for the reason the header gives — a projection that
 * only exists inside a canvas context is one no test can ask anything of.
 */
export function visible(
  width: number,
  height: number,
  corridor: CorridorView,
  cameraX: number,
): Seen {
  const slack = bleed(width, height);
  // The world's own edges, said in the coordinates this clip is applied in: the
  // design space is centred on the camera, so the corridor's line sits wherever
  // the camera happens to be looking. Written against `camera.x` rather than
  // against the centreline so that it survives a camera that pans (M3.1's).
  const toDesign = DESIGN_WIDTH / 2 - cameraX;
  const wall = corridor.halfWidth;
  return {
    // **Sideways bleed is capped at nothing** — see the section above. The
    // corridor's line is still taken, because it is the stronger bound whenever
    // the camera has been pushed right up against a wall and there is genuinely
    // less world than the design space is asking for.
    left: Math.max(0, corridor.centreline - wall + toDesign),
    right: Math.min(DESIGN_WIDTH, corridor.centreline + wall + toDesign),
    top: -slack.y,
    bottom: DESIGN_HEIGHT + slack.y,
  };
}
