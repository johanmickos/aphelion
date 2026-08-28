/**
 * Devices in, one boolean out.
 *
 * The game has **one verb** (`CONTEXT.md`: press) and
 * [`stepSim`](../sim/step.ts) reads it as a single field on a single object.
 * Touch, mouse and keyboard all mean that and mean nothing else — a second input
 * is a repeal rather than a feature (`VISION.md`, pillar 1) — so what a device
 * layer has to decide is not *what* an event means but *how several of them
 * combine*, and that is the whole of this file.
 *
 * **The button is down while anything is holding it.** A second finger, a mouse
 * held while a key is held, a finger that arrives after another: none of them
 * mean anything on their own, and none of them let go on their own either. That
 * is the forgiving rule and it is the right one — the alternative, where the
 * first device owns the press, releases a swing because a player shifted their
 * grip, and a release is the one moment in this game that must never be an
 * accident.
 *
 * **A device that stops answering has let go.** A window losing focus, a tab
 * going to the background, a touch cancelled by the system: each of them ends
 * with a button that is down and no event coming to lift it, which would hold a
 * grab open forever. [`app/input.ts`](../../app/input.ts) is where those are
 * heard; the rule they land on is [`clearPress`](#).
 *
 * This file is pure and has no idea what a pointer is, which is why the rules
 * above are testable under plain node. `pnpm portable` holds it to that.
 */

/**
 * Which devices are currently holding the button down.
 *
 * A set rather than a count, because the events are not guaranteed to pair up:
 * a `pointercancel` and a `pointerup` can both arrive for one touch, and a
 * counter would go negative and stick.
 */
export interface Press {
  readonly holding: Set<string>;
}

export function createPress(): Press {
  return { holding: new Set() };
}

/**
 * A device has taken the button down.
 *
 * `device` identifies the thing holding it, not the event: every keyboard press
 * shares one identity, so a second key held at the same time is not a second
 * hold and cannot lift the first one's press when it comes up.
 */
export function pressDown(press: Press, device: string): void {
  press.holding.add(device);
}

/** A device has let the button up. */
export function pressUp(press: Press, device: string): void {
  press.holding.delete(device);
}

/** Every device has let go, whether it said so or not. */
export function clearPress(press: Press): void {
  press.holding.clear();
}

/** Whether the one verb is being pressed right now. */
export function isPressed(press: Press): boolean {
  return press.holding.size > 0;
}
