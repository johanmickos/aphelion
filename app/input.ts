/**
 * The devices, and the events that mean the one verb.
 *
 * The rule for combining them is [`src/input/press.ts`](../src/input/press.ts)
 * and is pure; this file is only the wiring, and it lives in the shell for the
 * same reason [`clock.ts`](../src/sim/clock.ts) is pure and `performance.now()`
 * is not — a decision belongs somewhere it can be tested, and a listener belongs
 * where the browser is.
 *
 * **Touch, mouse and keyboard, all bound to the same boolean.** Pointer events
 * cover the first two, which is most of why they are used: one code path for a
 * finger and a mouse means there is no second behaviour to get wrong. Multi-touch,
 * gestures and a second key are deliberately not heard — spec
 * [01](../docs/spec/01-swing.md) and `VISION.md`'s first pillar put the whole
 * game behind one button, and anything else this file taught the game would be a
 * repeal rather than a feature.
 *
 * Three defences, each of which is a way for a button to go down and never come
 * up — which would hold a grab open for the rest of the run:
 *
 * - **`pointerup` and `pointercancel` are heard on the window, not the canvas.**
 *   A pointer that leaves the canvas before lifting reports nowhere else.
 * - **Losing focus lets go of everything.** A tab switch, an incoming call, the
 *   iOS app switcher: none of them send a matching up event.
 * - **Only the primary button presses.** A right-click reports `pointerdown` too,
 *   and it is not a press.
 */
import type { Press } from '../src/input/press.ts';
import { clearPress, pressDown, pressUp } from '../src/input/press.ts';

/**
 * The one key bound, and every keyboard press shares one identity in
 * [`Press`](../src/input/press.ts) — so a second key held at the same time
 * cannot lift the first one's press when it comes up.
 */
const KEY = 'Space';

export function bindPress(press: Press, surface: HTMLElement): void {
  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // The page must not scroll, select or raise a callout under a thumb whose
    // whole job is to hold still.
    event.preventDefault();
    pressDown(press, `pointer:${event.pointerId}`);
  });

  const lift = (event: PointerEvent): void => pressUp(press, `pointer:${event.pointerId}`);
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);

  window.addEventListener('keydown', (event) => {
    if (event.code !== KEY) return;
    // Space scrolls the page, and a game that scrolls out from under itself on
    // its own verb is not playable.
    event.preventDefault();
    pressDown(press, 'key');
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === KEY) pressUp(press, 'key');
  });

  window.addEventListener('blur', () => clearPress(press));
  window.addEventListener('pagehide', () => clearPress(press));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPress(press);
  });
}
