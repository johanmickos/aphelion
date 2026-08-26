/**
 * The keyboard path, which `main.ts` cannot test — it is a DOM shell.
 *
 * Every case here is one that was reachable by hand before the rule existed: a
 * space typed into the diagnostics note grabbing the ship, a held key firing a
 * press edge every frame, a space landing on the play area through an open tune
 * panel.
 */
import { describe, expect, it } from 'vitest';
import {
  GRAB_KEY,
  SHEET_SETTLE,
  isGrabKey,
  keydownAction,
  sheetDismissible,
} from '../src/app/input.ts';
import type { KeyContext, SheetContext } from '../src/app/input.ts';

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  code: GRAB_KEY,
  repeat: false,
  typing: false,
  panelOpen: false,
  armed: false,
  ...over,
});

describe('keyboard grab', () => {
  it('treats space as a grab once the run is going', () => {
    expect(keydownAction(ctx())).toBe('press');
  });

  it('starts the run on the first space instead of grabbing', () => {
    // Matching the pointer: a run never opens with an input meant as "begin".
    expect(keydownAction(ctx({ armed: true }))).toBe('start');
  });

  it('binds nothing but space', () => {
    for (const code of ['KeyW', 'Enter', 'ArrowUp', 'Escape', 'KeyA', 'Tab']) {
      expect(keydownAction(ctx({ code })), `${code} should not be gameplay`).toBe('ignore');
    }
  });

  it('leaves typing alone, so the diagnostics note can contain spaces', () => {
    expect(keydownAction(ctx({ typing: true }))).toBe('ignore');
    // Including the very first press, which would otherwise start a run from
    // inside a textarea.
    expect(keydownAction(ctx({ typing: true, armed: true }))).toBe('ignore');
  });

  it('ignores space while a panel covers the play area', () => {
    expect(keydownAction(ctx({ panelOpen: true }))).toBe('ignore');
    expect(keydownAction(ctx({ panelOpen: true, armed: true }))).toBe('ignore');
  });

  it('swallows auto-repeat, so a held key is one grab and not a burst', () => {
    // The simulation consumes edges. A repeat that reached it would read as the
    // player tapping every few milliseconds for the length of the hold.
    expect(keydownAction(ctx({ repeat: true }))).toBe('ignore');
  });

  it('does not let auto-repeat start a run', () => {
    // Holding space through a respawn would otherwise re-arm and re-start in the
    // same breath.
    expect(keydownAction(ctx({ repeat: true, armed: true }))).toBe('ignore');
  });

  it('recognises the release key regardless of why it went down', () => {
    expect(isGrabKey(GRAB_KEY)).toBe(true);
    expect(isGrabKey('KeyW')).toBe(false);
  });
});

/**
 * Taking the results away.
 *
 * The tap that dismisses is the same gesture as the tap that flies, so the rule is
 * about WHEN a tap is allowed to mean dismissal rather than about what it is. Every
 * case here was reachable by hand: the guard existed but was wired to the keyboard
 * only, while the pointer — the input the game is actually played with — dismissed
 * unconditionally.
 */
describe('dismissing the results sheet', () => {
  const s = (over: Partial<SheetContext> = {}): SheetContext => ({
    alpha: 1,
    settled: SHEET_SETTLE,
    ...over,
  });

  it('refuses a tap before the panel has arrived', () => {
    // The reported failure: a tap during the ceremony took the whole thing away,
    // and on a clear that rerolls the seed and rearms, so the run the sheet was
    // reporting on stops existing.
    for (const alpha of [0, 0.2, 0.6, 0.9, 0.99]) {
      expect(sheetDismissible(s({ alpha })), `alpha ${alpha}`).toBe(false);
    }
  });

  it('refuses a tap that lands in the instant it arrives', () => {
    // ARRIVING IS NOT THE SAME AS HAVING BEEN SEEN, and a gate on arrival alone
    // does not fix the report. The ceremony runs about three seconds before the
    // panel lands, which is long enough that an impatient player is already
    // tapping — so the first tap after the fade completes lands within a mash
    // interval of it and the screen is gone in the instant it appeared.
    expect(sheetDismissible(s({ settled: 0 }))).toBe(false);
    expect(sheetDismissible(s({ settled: 0.2 }))).toBe(false);
  });

  it('allows it once the panel has stood there', () => {
    expect(sheetDismissible(s())).toBe(true);
    expect(sheetDismissible(s({ settled: 3 }))).toBe(true);
  });

  it('clears a mash interval and a reaction, which is what fixes the report', () => {
    // Mashing runs about 200ms apart and a deliberate reaction to a new screen is
    // around 250ms. The window has to be longer than both or it is not a guard.
    expect(SHEET_SETTLE).toBeGreaterThan(0.25);
    // And short enough that a player who wants to move on is not made to wait: the
    // cost of being wrong here is half a second against a whole result.
    expect(SHEET_SETTLE).toBeLessThan(1);
  });
});
