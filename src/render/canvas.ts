/**
 * The surface: one canvas, sized to the device, and nothing about the game.
 *
 * Canvas2D is settled ([ADR-0011](../../docs/adr/0011-canvas2d-carries-the-design.md)):
 * it was measured on the author's phone at the full design size against the
 * scene spec [05](../../docs/spec/05-field.md) asks for, and it held on the
 * first rung with five of the eight-millisecond budget unspent.
 *
 * **It hands out offscreen buffers now** — see [`offscreen`](#offscreen). The
 * first arrived with the anomaly in M3.3 and the grade's tiles followed it in
 * M3.5, and they are asked for here rather than in
 * [`anomaly.ts`](./anomaly.ts) or [`grade.ts`](./grade.ts) because this is the
 * file that owns surfaces: a second module reaching for `document.createElement`
 * would be a second place the game's relationship with the DOM is decided.
 *
 * How many exist is each caller's business and deliberately not this file's: the
 * anomaly holds one it resizes to the picture every frame, and the grade holds
 * seventeen 64-pixel tiles it re-cuts only when a knob moves. What they share is
 * the `null` below, which is the contract.
 */

/**
 * The most device pixels per CSS pixel this will ask a browser for.
 *
 * ADR-0011's measurement was taken at 3, which is where the phone the gate
 * happens on sits. Above that the buffer grows quadratically for a difference no
 * eye reports, and the one thing that measurement could not see is GPU headroom.
 */
const MAX_PIXEL_RATIO = 3;

/** A canvas filling its parent, and the context to draw into it with. */
export function attachCanvas(parent: HTMLElement): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  parent.appendChild(canvas);

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas2D is unavailable, and it is what the game is drawn with');
  return context;
}

/**
 * Match the drawing buffer to the space the canvas occupies.
 *
 * Called every frame rather than on a resize event: a rotated phone, a browser
 * that hides its chrome as you scroll and a desktop window being dragged all
 * change this, and two of the three do it without firing anything reliable. It
 * costs a comparison on the frames where nothing moved, and assigning `width`
 * clears the buffer — so it is guarded, not because the arithmetic is expensive
 * but because the clear is.
 */
export function sizeToDisplay(context: CanvasRenderingContext2D): void {
  const canvas = context.canvas;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/**
 * A canvas the renderer can draw into and then draw *from*, or `null` where
 * there is no document to make one.
 *
 * **The `null` is the contract, not a failure mode.** `pnpm profile`'s draw
 * census and `test/census.test.ts` drive the real renderer under plain node with
 * a hand-written stand-in for a canvas, and `tools/check-portability.ts` runs the
 * layers below this one with no DOM at all. A renderer that threw here would make
 * the one instrument that can answer *what did this cost* unable to run, so
 * anything that wants a buffer has to be able to draw without one — see
 * [`anomaly.ts`](./anomaly.ts), whose fallback is the same picture at full
 * resolution and full cost.
 *
 * Asked for by the caller and held by the caller, so this file keeps no state and
 * the module that needs a buffer is the module that decides when to resize it.
 */
export function offscreen(): HTMLCanvasElement | null {
  return typeof document === 'undefined' ? null : document.createElement('canvas');
}
