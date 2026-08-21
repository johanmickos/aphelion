/**
 * The keyboard path, which `main.ts` cannot test — it is a DOM shell.
 *
 * Every case here is one that was reachable by hand before the rule existed: a
 * space typed into the diagnostics note grabbing the ship, a held key firing a
 * press edge every frame, a space landing on the play area through an open tune
 * panel.
 */
import { describe, expect, it } from 'vitest';
import { GRAB_KEY, isGrabKey, keydownAction } from '../src/app/input.ts';
import type { KeyContext } from '../src/app/input.ts';

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
