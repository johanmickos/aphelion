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
 * Stop the browser doing something else with a tap.
 *
 * The whole input is pressing and holding on a surface that is not text, and
 * every mobile browser ships gestures that read that as an attempt to read
 * something. Reported from the phone: **a double tap raises Firefox for iOS's
 * *Search with Firefox / Find in Page* callout and the selection loupe**, over a
 * game whose entire verb is tapping.
 *
 * `index.html` already sets `user-select: none`, `-webkit-touch-callout: none`
 * and `touch-action: none`, which is what the prototype relies on, and it is not
 * enough here: those stop a *drag* from selecting and stop the gestures, and
 * iOS's double-tap-to-select-a-word runs ahead of all of them. What actually
 * refuses it is refusing the selection itself, which is why `selectstart` is the
 * first line below rather than more CSS.
 *
 * `touchstart` is deliberately **not** cancelled. It would be the heaviest
 * hammer available and it is the one that can take the press with it — the
 * pointer events the game is bound to are synthesised from touches, and a
 * cancelled touch sequence is a way to lose the button rather than the menu.
 * `touch-action: none` already refuses the gestures that hammer was for.
 */
export function suppressBrowserGestures(surface: HTMLElement): void {
  const refuse = (event: Event): void => event.preventDefault();

  // The callout and the loupe are the *selection's* UI. No selection, neither.
  document.addEventListener('selectstart', refuse);
  // A long press, which on a game that holds its button is every press.
  document.addEventListener('contextmenu', refuse);
  // Pinch zoom. iOS has ignored `user-scalable=no` since iOS 10, so the meta tag
  // in `index.html` is a statement of intent and this is the enforcement.
  document.addEventListener('gesturestart', refuse);
  // Double-tap. `touch-action: none` covers the zoom; this covers the engines
  // that hang word selection off the second tap instead.
  surface.addEventListener('dblclick', refuse);
}

/**
 * The one key bound, and every keyboard press shares one identity in
 * [`Press`](../src/input/press.ts) — so a second key held at the same time
 * cannot lift the first one's press when it comes up.
 */
const KEY = 'Space';

/**
 * Whether a key event belongs to something the author is typing in.
 *
 * The developer chrome has a text field in it — the note a **dispatch** carries
 * — and the game's one verb is the space bar. Without this, typing a note both
 * swallows the spaces and flies the craft, which is a bad way to lose the run
 * you were trying to describe. Exported so the same guard covers the shell's own
 * shortcuts, which are keys too.
 */
export function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

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
    if (event.code !== KEY || typing(event.target)) return;
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
