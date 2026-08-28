/**
 * The one verb, arriving from more than one device.
 *
 * `VISION.md`'s first pillar puts the whole game behind one button, so what a
 * device layer can get wrong is not what an event means but what several of them
 * mean together. Each case below is a way a player's hand, or the operating
 * system, produces two events where the game has only one idea.
 */
import { describe, expect, it } from 'vitest';
import { clearPress, createPress, isPressed, pressDown, pressUp } from '../../src/input/press.ts';

describe('a press', () => {
  it('is not pressed before anything touches it', () => {
    expect(isPressed(createPress())).toBe(false);
  });

  it('is one press however many fingers arrive', () => {
    const press = createPress();
    pressDown(press, 'pointer:1');
    pressDown(press, 'pointer:2');
    expect(isPressed(press)).toBe(true);
  });

  /**
   * The case the rule exists for. A player shifting their grip lifts one finger
   * while another is still down, and a release is the one moment in this game
   * that must never be an accident.
   */
  it('stays down while any device is still holding it', () => {
    const press = createPress();
    pressDown(press, 'pointer:1');
    pressDown(press, 'pointer:2');
    pressUp(press, 'pointer:1');
    expect(isPressed(press)).toBe(true);
    pressUp(press, 'pointer:2');
    expect(isPressed(press)).toBe(false);
  });

  /**
   * Every key shares one identity, so a second key is not a second hold. Held
   * the other way round it would be a second input, which
   * [`VISION.md`](../../docs/VISION.md) calls a repeal rather than a feature.
   */
  it('hears a key held twice as one hold', () => {
    const press = createPress();
    pressDown(press, 'key');
    pressDown(press, 'key');
    pressUp(press, 'key');
    expect(isPressed(press)).toBe(false);
  });

  /**
   * A touch can end with both `pointerup` and `pointercancel`. A counter would go
   * negative on the second and stick there, and the button would never come up
   * again.
   */
  it('survives a device letting go twice', () => {
    const press = createPress();
    pressDown(press, 'pointer:1');
    pressUp(press, 'pointer:1');
    pressUp(press, 'pointer:1');
    pressDown(press, 'pointer:1');
    expect(isPressed(press)).toBe(true);
  });

  /**
   * A tab switch, an incoming call, the app switcher: a button that went down and
   * whose up event is never coming would hold a grab open for the rest of the
   * run.
   */
  it('lets go of everything when the window stops answering', () => {
    const press = createPress();
    pressDown(press, 'pointer:1');
    pressDown(press, 'key');
    clearPress(press);
    expect(isPressed(press)).toBe(false);
  });
});
