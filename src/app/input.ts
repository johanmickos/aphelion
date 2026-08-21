/**
 * Whether a key event is gameplay.
 *
 * This lives here rather than inline in `main.ts` because it is the one part of
 * the keyboard path with real decisions in it, and `main.ts` has no test around
 * it — it is a DOM shell that only a browser can run. Kept pure, the rules are
 * checkable in `test/input.test.ts` without a DOM.
 *
 * The simulation consumes edges, not levels, so the keyboard's whole job is to
 * decide when to hand it a press and a release. It produces exactly what the
 * pointer path produces; nothing downstream can tell the two apart, which is
 * what lets a desktop run replay through the same tooling as a phone run.
 */

/** What the page knew when the key was struck. */
export interface KeyContext {
  /** `KeyboardEvent.code` — physical key, so it survives keyboard layouts. */
  code: string;
  /** `KeyboardEvent.repeat`: the key is auto-repeating, not newly struck. */
  repeat: boolean;
  /** Focus is in a text field, so the keystroke is text. */
  typing: boolean;
  /** The tune or diagnostics panel is over the play area. */
  panelOpen: boolean;
  /** The run has not started yet. */
  armed: boolean;
}

/**
 * `start` begins a run, `press` is a grab, `ignore` is not gameplay.
 *
 * `ignore` means the event is also left alone — no `preventDefault` — because
 * every reason to ignore it is a reason someone else wants it.
 */
export type KeyAction = 'ignore' | 'start' | 'press';

/** Space is the grab. Nothing else on the keyboard is bound. */
export const GRAB_KEY = 'Space';

export function keydownAction(k: KeyContext): KeyAction {
  if (k.code !== GRAB_KEY) return 'ignore';
  // A space typed into the diagnostics note is a space. A space on a focused
  // tune slider belongs to the slider. Both panels sit over the play area, so an
  // open panel means no grab even when nothing in it holds focus.
  if (k.typing || k.panelOpen) return 'ignore';
  // Holding a key repeats keydown every few milliseconds. Passing those through
  // would read as a burst of taps rather than one continuous grab.
  if (k.repeat) return 'ignore';
  // The first press starts the run rather than grabbing, matching the pointer:
  // a run never begins with an input the player did not mean as gameplay.
  return k.armed ? 'start' : 'press';
}

/** Release is unconditional: whatever started a hold, space ending is an end. */
export function isGrabKey(code: string): boolean {
  return code === GRAB_KEY;
}
