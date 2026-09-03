/**
 * The retro grade: spec [14 · §2](../../docs/spec/14-retro-grade.md)'s
 * full-screen pass, and **the one place its knobs live** (§4).
 *
 * It is a coat. Spec 14 §1 is explicit that the retro register is earned
 * structurally — the cuts, the counting scoreboard, the one rectangle in a game
 * of arcs — and that *"if the grade is carrying the register, the register is not
 * there."* So this may be dialled to nothing and the game must be exactly as
 * legible, which is what [`test/render/grade.test.ts`](../../test/render/grade.test.ts)
 * asserts by asking the canvas what it was told rather than by looking.
 *
 * ## There is no shader, and that decides the whole shape of this file
 *
 * [ADR-0011](../../docs/adr/0011-canvas2d-carries-the-design.md) puts the game on
 * Canvas2D and [AGENTS.md](../../AGENTS.md) §6 rules no runtime dependencies, so
 * every stage below is built out of a composite operation, a pattern and a second
 * canvas. **One mechanism was refused before it was tried**: `getImageData` and
 * `putImageData` on the frame itself. At the design size that is a per-pixel
 * main-thread walk of 1170 × 2532, and ADR-0011 already measured what moving that
 * many bytes through the main thread costs on the author's own phone — the
 * rejected WebGL candidate's `texSubImage2D` upload is the same ~11.8 MB of
 * synchronous traffic and it cost **17 – 18 ms against 3**. A read-back is that
 * measurement with a copy back added. Nothing here reads a pixel.
 *
 * What is left is **fill rate**, which is what `pnpm profile`'s census counts: a
 * full-screen stage is one screen of `blended`, every frame, per composite. So
 * the question this file answers is *how few composites can carry five stages*,
 * and the answer is **two** — one that adds light and one that takes it away,
 * which is the only axis a composite has.
 *
 * | # | Stage | Where it is |
 * |---|---|---|
 * | 1 | Bloom | **Not here.** It is the energy channel, built in M2.1 — a radius on presentation state, painted per lamp in [`index.ts`](./index.ts). Spec 14 §2 lists it *"only because it shares the pass"* |
 * | 2 | Grade — lift | The additive pass, as a flat floor of VOID |
 * | 3 | Dither | The additive pass, as a 4×4 Bayer offset in the tile |
 * | 4 | Grain | The additive pass, as noise in the tile, resampled per tick |
 * | 5 | Scanlines | The subtractive pass, as a comb of VOID across the picture |
 *
 * **Gamma and per-channel gain are not built**, and that is ADR-0011's recorded
 * cost rather than an omission here: `multiply` cannot scale a channel above 1
 * and Canvas2D has no expression for a per-channel curve at all. ADR-0011's own
 * open note names the likely answer — the curve applied to the nine authored
 * colours at authoring time — and it needs the author.
 *
 * ## The three additive stages share one composite, and still switch off alone
 *
 * Lift, dither and grain are all *additions* to every pixel, and a sum of
 * additions is one addition. So they are baked into one tile and composited once
 * with `lighter`; setting any of them to zero removes its term from the tile, and
 * setting all three to zero skips the composite entirely — **nothing asked of the
 * canvas, not a fill at alpha zero**, which is the rule `test/census.test.ts`
 * already holds the boundary to.
 *
 * The grain therefore has no negative half, and that is a reading rather than a
 * limitation worked around: **an additive grain is a signed grain about its own
 * mean, and its mean is a lift.** A ±1.5% grain is a +1.5% lift with a ±1.5%
 * grain on it, and the second reading is the one a single `lighter` pass can
 * express. Spec 14 §2's *"≤ 3% luminance"* is read as the peak, which is what
 * bounds the visible excursion either way.
 *
 * ## And the tiles are cut in device pixels, on purpose
 *
 * Everything else in this game is drawn in design units (ADR-0010) and this is
 * the one thing that must not be. Dither exists to fight **8-bit quantisation**,
 * which happens in the frame buffer; a Bayer cell resampled by a non-integer
 * scale is no longer an ordered pattern. And spec 14 §2's 2-design-px scanline
 * pitch lands on 2.02 device px on the author's own phone — a comb at a
 * fractional pitch is a moiré, which is spec 14 §3.1's *"dithers into a grey
 * suggestion"* one layer up. So the pitch is snapped to whole device pixels and
 * the tiles are laid down under the identity transform.
 */
import { channels, dim, VOID } from './palette.ts';
import { offscreen } from './canvas.ts';
import { rng } from './seed.ts';

/**
 * **The master, and the only knob this puts on the bench** — 0 is off, 1 is every
 * stage at the ceiling spec 14 §2 states for it.
 *
 * ## ⚠ 0.45, ruled by the author on the bench, 2026-09-02
 *
 * > *"It looks real nice. In the bench I'm running it at 0.45 which seems like a
 * > nice balance."*
 *
 * It shipped at **0** for one day, which was M3.5's own instruction — *"build it
 * as a **knob**, not a look; 'a touch more retro' is a judgement made against the
 * running game, not decided in advance"* — and the judgement has now been made
 * against the running game, which is the only way this number was ever going to
 * arrive.
 *
 * **What 0.45 is**, since every stage is a fraction of it:
 *
 * | | at 0.45 | the ceiling spec 14 §2 states |
 * |---|---|---|
 * | lift | `rgb(4.5, 3.6, 9)`, so the sky reads `rgb(16, 14, 31)` | VOID added once |
 * | dither | 0.45 of a code value | ~1/255 |
 * | grain | **1.35%** peak | ≤ 3% |
 * | scanlines | **none** — 0.45 is below [`SCANLINE_FROM`](#scanline_from) | ≤ 6% |
 *
 * Two things follow that are worth having in one place. It costs **one**
 * full-screen composite rather than two, because the comb is absent. And spec 14
 * §2 stage 5's *"off by default until the phone says otherwise"* is satisfied
 * **literally** at the shipped value: the phone has now said, and it said no.
 *
 * ⚠ **What it does not settle is the true-black conflict** — see [`LIFT`](#lift).
 * At 0.45 the anomaly's gaps sample to `rgb(6, 6, 11)` rather than to `#000000`,
 * so spec 14's own acceptance criterion is failed by a **shipped** value now
 * rather than by a hypothetical one. The author ruled the look; the spec conflict
 * is still open.
 *
 * The travel is 0 → 1 rather than 0 → *heavy* past it, because those numbers are
 * ceilings — *"≤ 3%"*, *"≤ 6%"*, *"~1/255"* — and a slider that ran beyond them
 * would be a slider whose top end the spec forbids.
 *
 * It stays on the bench, and it is now also on the **game page** behind a dev-only
 * panel ([`app/main.ts`](../../app/main.ts)), because a coat is judged over a
 * playthrough and the bench is not one.
 */
export const GRADE = 0.45;

/**
 * How far the blacks come up, as a multiple of VOID, at [`GRADE`](#grade) 1.
 *
 * Spec 14 §2 stage 2: *"Lift the blacks toward VOID's violet rather than to
 * neutral grey; leave CORE at 1.0 so the craft stays the brightest value."* An
 * **additive** lift is what keeps the second half of that. `source-over` would
 * pull CORE down toward the lift colour by the same fraction it raises the
 * blacks, and CORE would stop being the brightest value in the frame; `lighter`
 * raises the floor and leaves the ceiling where it was.
 *
 * At 1 the sky's own token is added to itself: `#0A0814` becomes `#141028`, and
 * with the grain and the dither on it the sky reads `rgb(24, 20, 44)`.
 *
 * ## ⚠ This is the stage spec 14 contradicts itself about, and it is not ruled here
 *
 * §3.5 reserves true black for anomaly cloud gaps and black-hole discs and says
 * *"the grade's black lift must not raise them"*; the acceptance says they
 * *"sample to `#000000` after the grade."* **The anomaly's bed is drawn in
 * `TRUE_BLACK` today** ([`anomaly.ts`](./anomaly.ts)), so this is live rather than
 * hypothetical — and a full-screen composite has no way to exclude a colour.
 * Masking it needs a second buffer and a second composite over the layer that is
 * already the most expensive in the game.
 *
 * At `GRADE` 1 those gaps sample to `rgb(14, 12, 24)` — the lift, plus the grain's
 * mean and the dither's, 9.4% of full scale in its loudest channel — and at the
 * shipped **0.45** they sample to `rgb(6, 6, 11)`. Only at 0 do they sample to
 * `#000000`, and 0 is no longer where this ships: as of 2026-09-02 the criterion
 * is failed by a value the author **flew** rather than by a hypothetical one.
 *
 * **What is lost is the absolute floor and not the contrast.** The lift is
 * additive, so it preserves differences exactly: the sky goes `10, 8, 20` →
 * `16, 14, 31` and a gap goes `0, 0, 0` → `6, 6, 11`, and the difference is
 * `10, 8, 20` — which is VOID — at both settings. A gap is still precisely as
 * much darker than the sky as it was. What §3.5 buys that this does not is
 * **absolute** black, and on an OLED phone that is physical rather than
 * colorimetric: at `#000000` the pixel is off. Whether that reads as a loss is a
 * judgement nobody has made. The candidates are in spec 14's own ⚠ notice and
 * none of them is picked here.
 */
const LIFT = 1;

/**
 * The ordered dither's amplitude in **code values** — spec 14 §2 stage 3's
 * *"~1/255 amplitude"*, which is one.
 *
 * Ordered 4×4 Bayer over the whole frame. Its job is the one §3.2 gives the
 * dithered ramps in the world: a smooth 8-bit ramp over a large area bands, and a
 * contour is a *step* in an already-quantised buffer. A one-code ordered offset
 * does not remove the step; it makes its edge ragged on a four-pixel lattice,
 * which is what turns a visible contour into texture.
 */
const DITHER = 1;

/** Bayer, 4×4, the standard matrix — 0 – 15 across a cell, scaled to the amplitude. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER_SIDE = 4;

/**
 * The grain's peak as a fraction of full luminance — spec 14 §2 stage 4's
 * *"≤ 3%"*.
 *
 * *"Resampled per frame. It must not read as noise on a still"* is what makes
 * this a stage rather than a texture, and it is honoured **per tick** rather than
 * per frame: the renderer is handed a tick and never a clock, and a grain seeded
 * from a wall clock would make a screenshot of a bug unreproducible from the
 * recipe — which is the whole of why the sky and the dust are seeded the way they
 * are ([`seed.ts`](./seed.ts)). At 60 Hz a tick is a frame; at 120 Hz it is every
 * second frame, which is still resampling and still not a still.
 */
const GRAIN = 0.03;

/**
 * How many grain fields are cut, and cycled through by tick.
 *
 * Cutting one costs a pass over a tile's texels, so cutting one **per frame**
 * would be the per-pixel main-thread work this file exists to avoid — four orders
 * of magnitude smaller than a read-back, and the wrong direction anyway. Sixteen
 * at 60 Hz is a 3.75 Hz loop, long enough that the eye reads noise rather than a
 * repeating flicker.
 */
const GRAIN_PHASES = 16;

/** A tile's side in device pixels. A multiple of `BAYER_SIDE`, so the dither tiles true. */
const TILE = 64;

/**
 * The render seed the grain is cut from — a **fourth**, distinct from the sky's,
 * the dust's and the boundary's, for the reason [`index.ts`](./index.ts) gives
 * three times over: one generator run twice from one seed would put a grain peak
 * wherever a star is.
 */
const GRAIN_SEED = 0x9e15;

/**
 * The scanlines' strength and pitch — spec 14 §2 stage 5's *"≤ 6% at a
 * 2-design-px pitch"*.
 *
 * They darken toward **VOID** rather than toward black, which is spec 00 §1's
 * rule doing the work: the only colours this game has are its eight tokens at a
 * strength, and a scanline is the sky showing between the rows. Toward black it
 * would be a ninth colour, and the one §3.5 reserves.
 */
export const SCANLINE = 0.06;

/**
 * How far apart the rows are, in design px.
 *
 * ## ⚠ Spec 14 §2 stage 5 says **2** and 2 is not resolvable, 2026-09-03
 *
 * > *"I think the scanline effect is too weak right now."* — author, having flown
 * > a run at the top of the master's travel where the comb is at §2's full 6%
 *
 * **The strength was not the problem and raising it would not have fixed it.** A
 * 2-design-px pitch is 2 device px on the author's phone (dpr 3, 393 css) and
 * therefore 0.67 CSS px — a dark row 0.33 CSS px wide. At that phone's pixel
 * pitch the comb subtends **1.39 arcminutes at 30 cm**, against a resolution
 * limit of about one. So it is not a comb at all: the eye integrates it and what
 * lands is a **flat 3% dimming of the whole picture**, which is precisely the
 * *"too weak"* being reported. More ink at that pitch buys a darker picture and
 * still no scanlines.
 *
 * **And the number the register is imitating is five times larger.** A 240p
 * arcade CRT drew 240 visible lines down the screen; §2's 2 px draws **1 266**
 * over the design height. 240 lines wants a pitch of **10.6**, and this is that
 * number rounded — it lands at 253 lines over the design space, 3.33 CSS px on
 * the author's phone, and **7 arcminutes**, which is structure the eye resolves
 * rather than texture it averages.
 *
 * This overrules the spec's stated 2 and the notice in spec 14 says so. What is
 * *not* overruled is the 6%: see [`SCANLINE_DUTY`](#scanline_duty) — the ink is
 * unchanged and only its spatial frequency moved, so this is the same amount of
 * darkening, spread into bands that can be seen.
 */
export const SCANLINE_PITCH = 10;

/**
 * How much of a pitch the dark band takes — **half**, and it is what keeps the
 * ink constant while the pitch moves.
 *
 * The comb used to be one **device** row dark per pitch, whatever the pitch was.
 * At a pitch of 2 that is a 50% duty and it is where the *"≤ 6%"* mean dimming
 * comes from; at a pitch of 10 it would have been 10%, which is a thin scratch
 * every ten pixels rather than a scanline. So the band is a fraction of the pitch
 * and not a fixed width, and at 0.5 the frame receives exactly the ink it
 * received before this changed — `SCANLINE / 2` averaged over the pitch.
 *
 * **That is the whole of the fix**: not more darkening, the same darkening at a
 * spatial frequency the eye can resolve.
 */
const SCANLINE_DUTY = 0.5;

/** Nothing is drawn below this: a fill this faint is a screen of paint for no picture. */
const FLOOR = 0.004;

/**
 * What a caller may override, and it is **dev-only in practice**.
 *
 * Everything here defaults to the value the game ships, so a caller that passes
 * nothing — which is what a production build does — gets exactly `main`'s coat
 * and cannot get anything else by accident. What it is *for* is the tuning panel
 * on the game page ([`app/main.ts`](../../app/main.ts)), because spec 14 §4 puts
 * the judgement on the phone and a coat is judged over a playthrough.
 *
 * **The scanlines are here separately from the master on purpose.** They were
 * ganged behind it until 2026-09-03 and the author's report is what took them
 * off: at the shipped 0.45 a ganged comb would sit at 45% of a strength they had
 * already called too weak at 100%. Spec 14 §2's *"every stage is switchable to
 * zero independently"* is better served by two knobs than by one with a threshold
 * in it, and the threshold was the only number in this file nobody had ruled.
 */
export interface GradeLook {
  /** The master — lift, dither and grain. Defaults to [`GRADE`](#grade). */
  readonly strength?: number;
  /** The comb's own strength, 0 – 1. Defaults to [`SCANLINE`](#scanline). */
  readonly scanline?: number;
  /** The comb's pitch in design px. Defaults to [`SCANLINE_PITCH`](#scanline_pitch). */
  readonly pitch?: number;
}

/** What every stage is worth at one master setting. */
export interface Coat {
  /** Added to each channel: the lift, in code values. */
  readonly lift: readonly [number, number, number];
  /** The dither's amplitude and the grain's peak, both in code values. */
  readonly dither: number;
  readonly grain: number;
  /** How much of the picture a scanline row takes away, 0 – 1. */
  readonly scanline: number;
}

/**
 * The ganging, in one function — so that a tuning session is a single file's
 * worth of numbers (spec 14 §4) and the bench needs one slider rather than ten.
 *
 * Exported for [`test/render/grade.test.ts`](../../test/render/grade.test.ts),
 * which holds each stage to its own ceiling, and for the arithmetic in the plan:
 * what a stage **costs** is a census count and what it **is** is this table.
 */
export function coatAt(strength: number, scanline: number = SCANLINE): Coat {
  const at = Math.max(0, Math.min(1, strength));
  const [r, g, b] = channels(VOID);
  return {
    lift: [r * LIFT * at, g * LIFT * at, b * LIFT * at],
    dither: DITHER * at,
    grain: GRAIN * 255 * at,
    scanline: Math.max(0, Math.min(1, scanline)),
  };
}

/** How much light the additive pass adds at all, summed over its three stages. */
function adds(coat: Coat): number {
  return coat.lift[0] + coat.lift[1] + coat.lift[2] + coat.dither + coat.grain;
}

/**
 * The tiles, held here because the module that needs a buffer is the module that
 * decides when it is rebuilt ([`canvas.ts`](./canvas.ts)).
 *
 * A tile depends on the device's pixel ratio, which is not known until the first
 * frame, so these cannot be module constants the way the sky's and the dust's
 * fields are. They are rebuilt when the setting or the pitch moves, and never per
 * frame.
 */
let additive: CanvasPattern[] = [];
let combTile: CanvasPattern | null = null;
/** What the held tiles were cut for, so a frame that changed nothing re-cuts nothing. */
let cutFor = '';

/** A tile-sized canvas to cut into, or `null` where there is no document to make one. */
function tile(width: number, height: number): CanvasRenderingContext2D | null {
  const canvas = offscreen();
  if (canvas === null) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

/**
 * Cut the additive tiles: one per grain phase, each carrying the lift, the dither
 * and that phase's noise.
 *
 * Written as **bytes** rather than as paint because a texel of an ordered dither
 * has a different value from the one beside it and there is no colour string for
 * that. The channels come from the palette ([`channels`](./palette.ts)), so the
 * grade spends a token rather than inventing one.
 *
 * **A canvas each**, because a `CanvasPattern` is specified against a copy of its
 * source taken when it is created and one reused canvas would depend on that
 * being true. Sixteen 64×64 buffers is 64 KB, cut once.
 */
function cutAdditive(coat: Coat): CanvasPattern[] {
  const cut: CanvasPattern[] = [];
  const random = rng(GRAIN_SEED);
  for (let phase = 0; phase < GRAIN_PHASES; phase++) {
    const into = tile(TILE, TILE);
    if (into === null) return [];
    const image = into.createImageData(TILE, TILE);
    const data = image.data;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const cell = BAYER[(y % BAYER_SIDE) * BAYER_SIDE + (x % BAYER_SIDE)]!;
        const ordered = (cell / (BAYER_SIDE * BAYER_SIDE)) * coat.dither;
        const noise = random() * coat.grain;
        const at = (y * TILE + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          data[at + channel] = Math.round(
            Math.max(0, Math.min(255, coat.lift[channel]! + ordered + noise)),
          );
        }
        // Opaque, so `lighter` adds the colour itself: it composites
        // `Cs × As + Cd × Ad`, and a translucent tile would add a fraction of a
        // number that is already the fraction.
        data[at + 3] = 255;
      }
    }
    into.putImageData(image, 0, 0);
    const pattern = into.createPattern(into.canvas, 'repeat');
    if (pattern === null) return [];
    cut.push(pattern);
  }
  return cut;
}

/** And the comb: one column, one darkened row in every `pitch`. */
function cutComb(coat: Coat, pitch: number): CanvasPattern | null {
  const into = tile(1, pitch);
  if (into === null) return null;
  const [r, g, b] = channels(VOID);
  const image = into.createImageData(1, pitch);
  // At least one row dark and at least one row clear, whatever the pitch and the
  // duty are between them: a comb with no gap is a flat dimming and a comb with
  // no band is nothing at all, and both are states a slider can otherwise reach.
  const dark = Math.max(1, Math.min(pitch - 1, Math.round(pitch * SCANLINE_DUTY)));
  for (let row = 0; row < dark; row++) {
    const at = row * 4;
    image.data[at] = r;
    image.data[at + 1] = g;
    image.data[at + 2] = b;
    image.data[at + 3] = Math.round(coat.scanline * 255);
  }
  into.putImageData(image, 0, 0);
  return into.createPattern(into.canvas, 'repeat');
}

/**
 * Lay the grade over the finished frame.
 *
 * Called last, in **device pixels** under the identity transform, over the whole
 * buffer: the design space is fitted from the width and what is left over is
 * bleed rather than a bar ([`letterbox.ts`](./letterbox.ts)), so every pixel in
 * the buffer is picture and the pass covers all of it.
 *
 * `scale` is the letterbox's, and the only thing it is spent on is snapping the
 * scanline pitch to whole device pixels. `tick` chooses the grain's phase.
 * `strength` defaults to [`GRADE`](#grade) and is read at the call rather than
 * captured, which is what lets the bench's setter reach it.
 */
export function applyGrade(
  context: CanvasRenderingContext2D,
  scale: number,
  tick: number,
  look: GradeLook = {},
): void {
  const { canvas } = context;
  if (canvas.width <= 0 || canvas.height <= 0) return;

  const strength = look.strength ?? GRADE;
  const comb = look.scanline ?? SCANLINE;
  const coat = coatAt(strength, comb);
  const light = adds(coat);
  const dark = coat.scanline;
  if (light < FLOOR && dark < FLOOR) return;

  const pitch = Math.max(2, Math.round((look.pitch ?? SCANLINE_PITCH) * scale));
  const wanted = `${strength}:${comb}:${pitch}`;
  if (wanted !== cutFor) {
    cutFor = wanted;
    additive = light < FLOOR ? [] : cutAdditive(coat);
    combTile = dark < FLOOR ? null : cutComb(coat, pitch);
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);

  if (light >= FLOOR) {
    context.globalCompositeOperation = 'lighter';
    // **The flat stand-in is the pass's price and not its picture.** With no
    // document there is no tile, which is the state `pnpm profile`'s census and
    // `test/census.test.ts` drive the real renderer in — and what those two have
    // to see is that the pass costs one full-screen fill, which it does either
    // way. What is missing is the texture, and texture has no census column.
    context.fillStyle =
      additive.length === 0
        ? dim(VOID, LIFT * Math.max(0, Math.min(1, strength)))
        : additive[tick % additive.length]!;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (dark >= FLOOR) {
    context.globalCompositeOperation = 'source-over';
    // The flat stand-in is the same ink spread over the whole tile — the mean the
    // comb takes away, which is the strength times the duty and is what makes the
    // pitch change cost-neutral rather than a darkening.
    context.fillStyle = combTile === null ? dim(VOID, coat.scanline * SCANLINE_DUTY) : combTile;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.restore();
}
