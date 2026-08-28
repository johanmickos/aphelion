/**
 * The surface: one canvas, sized to the device, and nothing about the game.
 *
 * Canvas2D is settled ([ADR-0011](../../docs/adr/0011-canvas2d-carries-the-design.md)):
 * it was measured on the author's phone at the full design size against the
 * scene spec [05](../../docs/spec/05-field.md) asks for, and it held on the
 * first rung with five of the eight-millisecond budget unspent. The bloom chain
 * that decision also settles is [M3](../../docs/plan/m3-the-field.md)'s; there
 * is no glow in M1.6 and this file has no offscreen buffers yet.
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
