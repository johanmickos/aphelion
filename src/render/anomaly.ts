/**
 * The anomaly, painted: a black bed, a field of cloud, and curtains hung across
 * the world.
 *
 * Spec [05 · §5](../../docs/spec/05-field.md)'s table in five rows — *"purple
 * aurora: wavy curtains hung across the field, sweeping down past the craft as it
 * climbs"*; *"overlapping cloud, some leaning ION-pink, some deep AURORA
 * violet"*; *"the gaps between clouds stay **true black** — one of only two
 * places true black is permitted"*; *"bodies read **through** the tint"*; and a
 * HUD that does not change.
 *
 * `VISION.md` calls the prototype's version of this *"finished-product
 * quality"*, and M3.3's acceptance is that it *"reads as the reference
 * standard"* — so this is the one place in the repository where the prototype is
 * consulted about a look rather than about a number, and ADR-0013 is worked
 * hard. What follows is what crossed and what did not.
 *
 * ## The three things that had to cross, because the behaviour cannot be stated
 * without them
 *
 * **It is anchored in the world, not on the craft.** The prototype tried both and
 * wrote the finding down: *"a screen-space wash is a filter laid over the picture
 * and reads as the game changing its mind about the palette; a single gradient
 * centred on the ship is dead, the same smooth blob at every moment with no
 * structure to move past."* So the clouds sit on a world grid and the curtains
 * hang at world altitudes: the craft is always inside the storm, and *which part*
 * of it changes as it flies. This is also the only arrangement under which spec
 * 05 §5's *"sweeping down past the craft as it climbs"* is true at all.
 *
 * **The whole storm is drawn small and scaled up, and that is the blur.** A
 * curtain drawn as a stack of strokes of decreasing width cannot have a soft
 * edge however many passes it uses — every stroke is solid with a hard boundary,
 * so N passes draw N terraces, and the prototype reports eight passes still
 * reading as contour lines on a phone. Drawing at 1/`DOWNSCALE` and compositing
 * back with image smoothing on gets the blur from the bilinear filter for free.
 * `ctx.filter = 'blur()'` is the direct alternative and is declined for the
 * prototype's reason: its cost scales with the blurred area rather than with the
 * geometry, and it would have to run once per curtain rather than once per frame.
 *
 * **And the same buffer is what makes the clouds affordable at all**, which is a
 * measurement rather than a preference. A cloud is a soft blob about a screen
 * wide, four or five are in front of the picture at once and they overlap: the
 * prototype measured **5× the window's own area in alpha-blended pixels per
 * frame**, and at this design space's 1170 × 2532 that is 15 megapixels a frame,
 * 0.9 Gpx/s at 60Hz. It reported that as *"the whole game lagging the moment the
 * storm came up."* Through the buffer it is 1/64th of that. `pnpm profile`'s
 * census walks the **unbuffered** path, because a node process has no document —
 * so the number it prints is the ceiling and the phone pays a sixty-fourth of it.
 *
 * ## What did not cross
 *
 * **The wall clock.** The prototype drifts its curtains on `Date.now`, which is
 * legal in its renderer and would not be legal here: ADR-0006's promise is that a
 * frame is a pure function of `(recipe, tick)`, and a sky that drifted on wall
 * time would make a replay show weather the run never had. The drift is on
 * [`PresentationState.tick`](../state/types.ts), which is the only clock in the
 * game and is exactly as smooth at 60Hz.
 *
 * **The charged window.** In the prototype an anomaly is a *body* outside the
 * corridor and the storm runs for a fixed number of seconds after releasing from
 * it — which is where its *"roughly 25 seconds of an 85-second run"* comes from.
 * Spec 05 §5 has already replaced that mechanism with a contiguous stretch of
 * field, so what is here is a **place** and not a timer: it has edges, and you can
 * see them.
 *
 * **The outro.** A bloom-and-collapse belongs to a window closing. A stretch of
 * field ends by being climbed out of, and the bed's own edges do that
 * geometrically.
 *
 * **The lightning.** It was tried in the prototype and cut — *"forked bolts over
 * a moving starfield read as tacky decoration rather than as weather, and they
 * competed with the ship's own arcs, which are the cue that actually means
 * something."* The craft's own light is the cue here too.
 *
 * ## What it draws over, and what draws over it
 *
 * Between the sky's tint and the **starfield**, which is the prototype's own
 * order — its storm is drawn before the stars, so the stars sit over the
 * curtains. That is what keeps the anomaly a *sky* rather than a scrim: something
 * with the field's own points of light still in front of it.
 *
 * And everything in the world is drawn over all of it, which is spec 05 §5's
 * *"bodies read through the tint, their identity hue is not repainted"* with no
 * mechanism at all: the anomaly is behind them, so nothing can repaint a hue that
 * is drawn later.
 */
import { BOARD_PIXEL, DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import { ticksIn } from '../state/decay.ts';
import { SKY_TINT } from '../state/anomaly.ts';
import type { AnomalyView, CameraView } from '../state/types.ts';
import { offscreen } from './canvas.ts';
import type { Seen } from './letterbox.ts';
import { AURORA, ION, TRUE_BLACK, dim } from './palette.ts';

/**
 * How much smaller the storm's buffer is than the picture.
 *
 * **The blur radius in disguise**: the composite interpolates across this many
 * design units, so a larger number is both softer and cheaper. The prototype's
 * eight, with its own reason for stopping there — *"where the softness stops
 * improving and the ribbon starts losing its shape"* — and at this design space's
 * size a curtain's core pass is still 23 buffer pixels wide, which is what that
 * finding was measured at.
 */
const DOWNSCALE = 8;

/**
 * How far apart the cloud grid's cells are, in design units — the prototype's
 * 300 of its own units, and a metre is one of those.
 *
 * Smaller means more, tighter puffs. It is a **length** and carries the
 * conversion once; the radii below are fractions of it and carry none.
 */
const CELL = 300 * BOARD_PIXEL;

/** How much of the grid holds a cloud at all — the prototype's 0.82. */
const CLOUD_DENSITY = 0.82;

/**
 * How fast a cloud breathes, in radians per **tick** — the prototype's
 * `sin(t * π * 0.5)` at its own beat of 1.1, on the game's own clock.
 *
 * Four seconds a cycle, and each cloud takes its phase from its own hash so the
 * bed churns rather than pulsing in unison. It is slow on purpose: a sky that
 * beats at a rate the eye can count is a sky with a heartbeat, and this one is
 * weather.
 */
const BREATH = (Math.PI * 0.55) / ticksIn(1000);

/**
 * How big a cloud is, as a fraction of a cell.
 *
 * The prototype's `0.62 + u * 0.75`, which against its 300-unit cell gives radii
 * of 186 – 411 of its units against a 390-wide window. The same fractions here
 * give 558 – 1 233 design units against a 1 170-wide picture, so a cloud is about
 * a screen across and four or five of them cover it. That overlap is the *bed*:
 * one blob is a blob and five are weather.
 */
const CLOUD_MIN = 0.62;
const CLOUD_SPREAD = 0.75;

/**
 * The strongest a single cloud draws, and how it falls off toward the edge of
 * the reach — the prototype's 0.24 and its `near²`.
 *
 * They stack, which is the point: four at this alpha come to about 0.4 together,
 * and 0.4 of AURORA over true black is where the densest part of the field lands.
 */
const CLOUD_ALPHA = 0.24;

/**
 * How far apart the curtains hang, in design units — the prototype's 480 of its
 * own units.
 *
 * Against an 800 m anomaly ([`ANOMALY_SPAN`](../state/anomaly.ts)) that is
 * **1.7 curtains** in the whole stretch, and with the gaps below about one. A
 * curtain is a thing you fly past once, which is what stops a set piece reading
 * as wallpaper.
 */
const BAND = 480 * BOARD_PIXEL;

/** How much of the grid hangs a curtain at all — the prototype's 0.85. */
const CURTAIN_DENSITY = 0.85;

/**
 * A curtain's wave, in design units: how far it swings and how long a swing is.
 *
 * The prototype's `130 + u * 110` against `200 + u * 160`, and its own note on
 * the ratio is the reason both are carried rather than either: *"amplitude
 * against wavelength is what decides whether a curtain reads as a ribbon or as a
 * snake — below about 0.5 it lies along the screen instead of climbing and diving
 * across it."*
 */
const WAVE_MIN = 130 * BOARD_PIXEL;
const WAVE_SPREAD = 110 * BOARD_PIXEL;
const LENGTH_MIN = 200 * BOARD_PIXEL;
const LENGTH_SPREAD = 160 * BOARD_PIXEL;

/**
 * How fast a curtain drifts along its own length, in design units per tick.
 *
 * The prototype's 14 – 36 of its units per **second**, converted to this space
 * and to the only clock this game has. A curtain drifts either way, chosen from
 * its own hash, so the field does not slide as one sheet.
 */
const DRIFT_MIN = (14 * BOARD_PIXEL) / ticksIn(1000);
const DRIFT_SPREAD = (22 * BOARD_PIXEL) / ticksIn(1000);

/**
 * The passes a curtain is stroked with: width in design units, and alpha.
 *
 * **Three, with no Gaussian weighting, because the composite does the
 * smoothing.** The prototype's 184 / 112 / 48 at 0.16 / 0.14 / 0.16, converted —
 * at `DOWNSCALE` these are 69, 42 and 18 buffer pixels wide and the bilinear
 * filter spreads each edge over eight design units on the way back. The stack
 * survives only to give the ribbon a brighter core than its skirt.
 */
const PASSES: ReadonlyArray<readonly [width: number, alpha: number]> = [
  [184 * BOARD_PIXEL, 0.16],
  [112 * BOARD_PIXEL, 0.14],
  [48 * BOARD_PIXEL, 0.16],
];

/** How far apart the points a curtain is drawn from are — the prototype's 26. */
const CURTAIN_STEP = 26 * BOARD_PIXEL;

/**
 * How far past the edge of the picture a curtain is drawn, in design units.
 *
 * The prototype's ±900 of its own units about the ship. Here it is one widest
 * stroke, measured from the **picture** — because the picture is what has to be
 * filled and its width is a contract (spec 00 §7) where the craft's position is
 * not. One stroke width is what it takes to put a round cap's own end outside the
 * frame, which is the only thing the overhang is for.
 */
const CURTAIN_OVERHANG = PASSES[0]![0];

/**
 * How far the anomaly's own edges are softened over, in design units.
 *
 * **A quarter of a picture**, so neither edge is ever a line across the screen.
 * It is the only number in this file that is not the prototype's, and it has no
 * counterpart there: the prototype's anomaly is a bubble around a body and has no
 * altitude edges to soften. Spec 05 §5 asks for a *contiguous altitude stretch*
 * and says nothing about how it starts, and a hard boundary would read as a wall
 * — which is the one thing the corridor's own **line** is reserved for.
 *
 * An **opening position**, with two things measured under it. It leaves the 800 m
 * stretch a **378 m core** at full strength, which is 47% of it — so the anomaly
 * has a middle and is not all edge. And at the author's own world speeds the
 * arrival takes **1.5 s** at the median and **0.5 s** at p95, which is a front
 * moving over you rather than a switch. The author's eyes are the gate on whether
 * it should be slower.
 */
const EDGE_FADE = DESIGN_HEIGHT / 4;

/**
 * How pink a cloud or a curtain leans, between AURORA and ION.
 *
 * Spec 05 §5: *"some leaning ION-pink, some deep AURORA violet."* Two palette
 * tokens rather than the prototype's own channel arithmetic, which ramps
 * `rgb(96,28,168)` to `rgb(214,62,230)` by eye — those are close to these two and
 * are not them, and spec [00 · §1](../../docs/spec/00-tokens.md) allows the
 * renderer no colour of its own.
 *
 * **Two tokens and nothing between them**, where the prototype ramps
 * continuously. Nothing is lost: the clouds overlap by construction, so a pink
 * puff over a violet one composites to the intermediate the ramp would have
 * mixed — the blend happens on the canvas, where spec 00 §1 allows it, instead of
 * in a colour this file invented.
 *
 * **This is the one place ION is worn by something that is not risk**, and it is
 * spec 05 §5 that spends it rather than this file: `CONTEXT.md` reserves pink for
 * risk *in the world*, and the anomaly's sky is not in the world — it is behind
 * all of it, at a tenth of an alpha, and nothing in it can be flown into.
 */
function leaning(pink: number): string {
  return pink < 0.5 ? AURORA : ION;
}

/** Cheap integer hash of a cell coordinate. Stable, so a cloud stays put. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 2654435761) + Math.imul(b, 40503)) >>> 0;
  h ^= h >>> 13;
  return Math.imul(h, 1274126177) >>> 0;
}

/** 0 to 1 from a hash, taking bits well above the low ones. */
function unit(h: number, shift: number): number {
  return ((h >>> shift) & 0xffff) / 0x10000;
}

/**
 * How much of the anomaly has reached this altitude, 0 to 1 — the bed's own
 * shape, and what every cloud and curtain is scaled by.
 *
 * One function so the three layers cannot disagree about where the weather is.
 */
function presenceAt(y: number, anomaly: AnomalyView): number {
  const inside = Math.min(anomaly.bottom - y, y - anomaly.top);
  if (inside <= 0) return 0;
  return Math.min(1, inside / EDGE_FADE);
}

/** The buffer, held here because the module that needs it decides when it resizes. */
let buffer: HTMLCanvasElement | null = null;
let bufferContext: CanvasRenderingContext2D | null = null;
let bufferAsked = false;

/**
 * The storm's buffer at this size, or `null` if there is none to be had.
 *
 * Asked for **once**: a factory that cannot produce a canvas will not start
 * producing one, and asking every frame would be a `document` lookup per frame
 * for the life of a process that has already answered.
 */
function target(width: number, height: number): CanvasRenderingContext2D | null {
  if (width <= 0 || height <= 0) return null;
  if (!bufferAsked) {
    bufferAsked = true;
    buffer = offscreen();
    bufferContext = buffer?.getContext('2d') ?? null;
    if (bufferContext === null) buffer = null;
  }
  if (buffer === null || bufferContext === null) return null;
  // Assigning a size clears the canvas, so it is only touched when it moved.
  if (buffer.width !== width || buffer.height !== height) {
    buffer.width = width;
    buffer.height = height;
  }
  return bufferContext;
}

/**
 * Paint the sky: spec 05 §4's altitude ramp, and then the anomaly itself if any
 * of it is in front of the picture.
 *
 * In **screen space**, before the starfield and before the world transform, with
 * the caller holding the letterbox transform and the clip to `seen`. Altitudes
 * are converted here rather than by a transform because only `y` is a world
 * coordinate: a curtain spans the picture whatever the corridor is doing, and the
 * camera does not pan.
 */
export function drawAnomaly(
  context: CanvasRenderingContext2D,
  anomaly: AnomalyView | null,
  camera: CameraView,
  tick: number,
  seen: Seen,
): void {
  if (anomaly === null) return;

  const width = seen.right - seen.left;
  const height = seen.bottom - seen.top;
  if (width <= 0 || height <= 0) return;

  // **The ramp, and it is the whole of what the sky does outside an anomaly.**
  // Spec 05 §2's ≤ 6% is the ceiling and `warmth` is how much of it is spent;
  // `dim` is spec 00 §1's one permitted operation, so the sky is VOID plus a
  // fraction of AURORA and resolves to two palette names at every altitude.
  if (anomaly.warmth > 0) {
    context.save();
    context.fillStyle = dim(AURORA, SKY_TINT * anomaly.warmth);
    context.fillRect(seen.left, seen.top, width, height);
    context.restore();
  }

  // World `y` at the top and bottom of what can be seen. The design space is
  // centred on the camera, so the two differ by exactly that offset.
  const top = seen.top + camera.y - DESIGN_HEIGHT / 2;
  const bottom = seen.bottom + camera.y - DESIGN_HEIGHT / 2;
  if (anomaly.bottom <= top || anomaly.top >= bottom) return;

  const toScreen = (world: number): number => world - camera.y + DESIGN_HEIGHT / 2;
  // And the same for `x`, which is a constant today and is written as a
  // conversion anyway: the camera does not pan (measured over the 12 973 ticks of
  // the author's dispatches), so a grid on the picture and a grid on the world are
  // the same grid — but only one of the two stays right if that ever changes.
  const acrossX = camera.x - DESIGN_WIDTH / 2;

  drawBed(context, anomaly, toScreen, seen);

  const buffered = target(Math.ceil(width / DOWNSCALE), Math.ceil(height / DOWNSCALE));
  const into = buffered ?? context;
  if (buffered) {
    buffered.setTransform(1, 0, 0, 1, 0, 0);
    buffered.clearRect(0, 0, Math.ceil(width / DOWNSCALE), Math.ceil(height / DOWNSCALE));
    // The buffer is the picture at 1/DOWNSCALE, so everything below is authored
    // in design units either way and this is the only line that knows.
    buffered.setTransform(
      1 / DOWNSCALE,
      0,
      0,
      1 / DOWNSCALE,
      -seen.left / DOWNSCALE,
      -seen.top / DOWNSCALE,
    );
  }

  drawClouds(into, anomaly, toScreen, acrossX, top, bottom, seen, tick);
  drawCurtains(into, anomaly, toScreen, acrossX, top, bottom, seen, tick);

  if (buffered && buffer !== null) {
    // Back up to full size, smoothed. This is where the blur happens.
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      buffer,
      seen.left,
      seen.top,
      Math.ceil(width / DOWNSCALE) * DOWNSCALE,
      Math.ceil(height / DOWNSCALE) * DOWNSCALE,
    );
    context.restore();
  }
}

/**
 * The bed: **true black**, faded in at the anomaly's own edges.
 *
 * Spec 05 §5 gives true black to the gaps between the clouds, and this is what
 * makes a gap: the anomaly's floor is not VOID at all, it is the one place in the
 * world besides a black hole's disc where the palette permits nothing
 * ([`palette.ts`](./palette.ts)). What the eye reads is the field's own violet
 * being *taken away* at the moment the curtains arrive, which is most of why an
 * anomaly reads as somewhere else rather than as a colour wash.
 *
 * Drawn at full resolution and off the buffer: it is one gradient fill, so it
 * costs the same either way, and a flat area is the one thing an upscale can get
 * wrong — the filter samples past the buffer's edge and leaves a seam.
 */
function drawBed(
  context: CanvasRenderingContext2D,
  anomaly: AnomalyView,
  toScreen: (world: number) => number,
  seen: Seen,
): void {
  const bottom = toScreen(anomaly.bottom);
  const top = toScreen(anomaly.top);
  const from = Math.max(seen.top, top);
  const to = Math.min(seen.bottom, bottom);
  if (to <= from) return;

  context.save();
  const bed = context.createLinearGradient(0, bottom, 0, top);
  const fade = Math.min(0.5, EDGE_FADE / Math.max(1, bottom - top));
  bed.addColorStop(0, dim(TRUE_BLACK, 0));
  bed.addColorStop(fade, TRUE_BLACK);
  bed.addColorStop(1 - fade, TRUE_BLACK);
  bed.addColorStop(1, dim(TRUE_BLACK, 0));
  context.fillStyle = bed;
  context.fillRect(seen.left, from, seen.right - seen.left, to - from);
  context.restore();
}

/**
 * The bed's own texture: overlapping puffs on a world grid.
 *
 * Jittered off their cell centres so the grid itself is never visible, and not
 * every cell holds one — *"the gaps are what make it look like weather rather
 * than wallpaper"* (the prototype). Each cloud breathes on its own phase, so the
 * field churns instead of throbbing in unison.
 */
function drawClouds(
  context: CanvasRenderingContext2D,
  anomaly: AnomalyView,
  toScreen: (world: number) => number,
  acrossX: number,
  top: number,
  bottom: number,
  seen: Seen,
  tick: number,
): void {
  const firstRow = Math.floor(Math.max(top, anomaly.top) / CELL) - 1;
  const lastRow = Math.floor(Math.min(bottom, anomaly.bottom) / CELL) + 1;
  const firstColumn = Math.floor((seen.left + acrossX) / CELL) - 1;
  const lastColumn = Math.floor((seen.right + acrossX) / CELL) + 1;

  context.save();
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const h = hash(column, row);
      if (unit(h, 24) > CLOUD_DENSITY) continue;

      const worldY = (row + 0.15 + unit(h, 4) * 0.7) * CELL;
      const present = presenceAt(worldY, anomaly);
      if (present <= 0) continue;

      const x = (column + 0.15 + unit(h, 0) * 0.7) * CELL - acrossX;
      const y = toScreen(worldY);
      const radius = CELL * (CLOUD_MIN + unit(h, 16) * CLOUD_SPREAD);
      if (y + radius < seen.top || y - radius > seen.bottom) continue;
      if (x + radius < seen.left || x - radius > seen.right) continue;

      const pink = unit(h, 12);
      // Its own phase, on the game's own clock. `Math.sin` is legal here and
      // nowhere below `src/render/` — ADR-0014's ban is about two engines
      // disagreeing on a *simulation*, and nothing here reaches a tick.
      const own = 0.6 + 0.4 * Math.sin(tick * BREATH + unit(h, 8) * Math.PI * 2);
      const alpha = CLOUD_ALPHA * present * present * own * (0.7 + 0.5 * pink);
      if (alpha < 0.004) continue;

      const puff = context.createRadialGradient(x, y, 0, x, y, radius);
      const token = leaning(pink);
      puff.addColorStop(0, dim(token, alpha));
      puff.addColorStop(0.55, dim(token, alpha * 0.42));
      puff.addColorStop(1, dim(token, 0));
      context.fillStyle = puff;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  context.restore();
}

/**
 * The northern lights: wavy ribbons hung across the field at world altitudes.
 *
 * The wave is **two summed sines of different periods**, which is the prototype's
 * and its reason is that *"one reads as a drawn ripple, two look blown."*
 */
function drawCurtains(
  context: CanvasRenderingContext2D,
  anomaly: AnomalyView,
  toScreen: (world: number) => number,
  acrossX: number,
  top: number,
  bottom: number,
  seen: Seen,
  tick: number,
): void {
  const first = Math.floor(Math.max(top, anomaly.top) / BAND) - 1;
  const last = Math.floor(Math.min(bottom, anomaly.bottom) / BAND) + 1;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (let band = first; band <= last; band++) {
    const h = hash(band, 0x51ed);
    // Gaps between curtains, so they arrive rather than parade.
    if (unit(h, 24) > CURTAIN_DENSITY) continue;

    const hangs = (band + 0.2 + unit(h, 0) * 0.6) * BAND;
    const present = presenceAt(hangs, anomaly);
    if (present <= 0) continue;

    const swing = WAVE_MIN + unit(h, 4) * WAVE_SPREAD;
    const length = LENGTH_MIN + unit(h, 8) * LENGTH_SPREAD;
    const drift = tick * (DRIFT_MIN + unit(h, 12) * DRIFT_SPREAD) * (unit(h, 20) < 0.5 ? -1 : 1);
    const token = leaning(unit(h, 16));

    const middle = toScreen(hangs);
    // A curtain reaches its own swing plus half of its widest stroke.
    const reach = swing * 1.35 + CURTAIN_OVERHANG / 2;
    if (middle + reach < seen.top || middle - reach > seen.bottom) continue;

    context.beginPath();
    const from = seen.left - CURTAIN_OVERHANG;
    const to = seen.right + CURTAIN_OVERHANG;
    for (let x = from, started = false; x <= to; x += CURTAIN_STEP, started = true) {
      const along = x + acrossX;
      const y =
        middle +
        Math.sin((along + drift) / length) * swing +
        Math.sin((along - drift * 0.6) / (length * 0.43)) * swing * 0.35;
      if (started) context.lineTo(x, y);
      else context.moveTo(x, y);
    }

    for (const [width, alpha] of PASSES) {
      const lit = alpha * present * present;
      if (lit < 0.004) continue;
      context.strokeStyle = dim(token, lit);
      context.lineWidth = width;
      context.stroke();
    }
  }
  context.restore();
}
