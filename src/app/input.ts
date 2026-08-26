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

// ------------------------------------------------------------- the results sheet

/**
 * Seconds the sheet must have been fully on screen before a tap can take it away.
 *
 * A GATE ON HAVING BEEN SEEN, NOT ON HAVING ARRIVED, and the difference is the
 * whole bug. Reported as "I tried clicking after the game and accidentally just
 * closed the final screen" — and on a clear that is expensive: dismissing rerolls
 * the seed and rearms, so the run the sheet was reporting on stops existing.
 *
 * A readable-yet gate alone does not fix it. The ceremony runs about three seconds
 * before the panel lands, which is long enough that an impatient player is already
 * tapping; the first tap after the fade completes then lands within a mash
 * interval of it, and the screen is gone in the same instant it appeared. So the
 * panel has to have been STANDING for long enough to have been looked at.
 *
 * Half a second, chosen against the two intervals it sits between: mashing runs
 * about 200ms apart, and a deliberate reaction to a new screen is around 250ms. It
 * clears both. It can therefore swallow one deliberate tap, which costs half a
 * second; the failure it prevents costs the whole result. The asymmetry is the
 * argument.
 */
export const SHEET_SETTLE = 0.5;

/** What the page knew when the sheet was tapped. */
export interface SheetContext {
  /** How far the panel has faded in, 0..1, from the last frame drawn. */
  alpha: number;
  /** Seconds the panel has been fully faded in. */
  settled: number;
}

/**
 * May this tap put the results away?
 *
 * The tap that dismisses is the same gesture as the tap that flies, and a player
 * whose run just ended is usually mid-press — so the rule has to be that the
 * dismissal is only available once there is something to dismiss AND it has been
 * there a moment.
 *
 * IT LIVES HERE BECAUSE IT WAS WIRED TO ONE PATH AND NOT THE OTHER. The guard
 * existed in `main.ts` and was applied to the keyboard only, while the pointer —
 * the only input the game is actually played with — dismissed unconditionally. A
 * rule written inline in a DOM shell is a rule with no test and two call sites;
 * `keydownAction` is here for the same reason.
 */
export function sheetDismissible(s: SheetContext): boolean {
  return s.alpha >= 0.999 && s.settled >= SHEET_SETTLE;
}
