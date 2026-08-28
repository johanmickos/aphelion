/**
 * The shape of a run: when it is over, and which of the four things happened.
 *
 * Spec [01 · §10](../../docs/spec/01-swing.md) names four endings — three deaths
 * and a win — and this file is the three that are about *where the craft is*.
 * The fourth, impact, is [`contact.ts`](./contact.ts)'s, because it is a
 * consequence of touching something rather than of being somewhere.
 *
 * **DAILY's rule applies and there is nothing here that softens it** (ADR-0007):
 * one run, no retry, no lives. A run that has ended stays ended, and
 * [`step.ts`](./step.ts) stops advancing it.
 *
 * ## The order the endings are asked in, which is the prototype's
 *
 * Fell behind, then cleared, then out of bounds. It is only ever visible on a
 * tick that satisfies two of them at once, and then it decides which story the
 * player is told about what they just did — the prototype's own reason for
 * putting the win before the sides: a run that crosses the top wide of the line
 * is a run that beat the field, and asking the sides first would have scored it
 * as lost off the edge of a field it had just finished.
 *
 * ## A run that ends holding stays holding
 *
 * Nothing here lets go for the player. The prototype does — it releases the
 * craft as it crosses its finish line, having measured *"three seconds of a
 * finished run still being flown"* — and that is not carried, because the
 * geometry makes it unreachable: `clearedAbove` sits a whole grab range above
 * the last body and an orbit reaches at most four floors from its centre, which
 * is a quarter of that. If a field ever puts the two within reach of each other,
 * this is the paragraph that says the prototype already has the answer.
 *
 * ## The mark is held during a grab, and that is measured
 *
 * An orbit is a round trip. The height gained going round its near side is not
 * ground kept, and counting it puts the fell-behind line at the orbit's apex —
 * which the far side of the same orbit then flies straight into, killing a craft
 * that has not lost a unit of altitude. `CONTEXT.md` keeps the two words apart
 * for the same reason: **Floor** is the orbit's, twelve units above a body's
 * surface, and the line that trails the climb is the **fell-behind line**. They
 * are 700 units and a whole run apart.
 */
import { grabRange } from './grab.ts';
import type { Ending, Field, SimState } from './types.ts';
import { CORRIDOR_GRACE, FELL_BEHIND_GAP } from './units.ts';

/**
 * Where the fell-behind line is, given a high-water mark.
 *
 * Design `y`, which increases downward, so the line sits *below* the mark at a
 * larger `y`. One definition, because a line the run is ended at and a line the
 * field will draw in M3 that disagreed would kill a player at a place they were
 * not shown.
 */
export function fellBehindLine(highWater: number): number {
  return highWater + FELL_BEHIND_GAP;
}

/**
 * The altitude above which the run is **cleared** — spec 01 §10's *"above the
 * point where the last body has gone out of grab range."*
 *
 * Grab range is the basis rather than a chosen margin, and the prototype paid to
 * learn why: ending the run at the topmost body's centre made the final body
 * unplayable — you reached for it and got a results screen. Above this line
 * [`bodyOnOffer`](./grab.ts) has provably nothing left to offer, which is the
 * real meaning of *"no more field"*.
 *
 * **The last body out of range is not always the highest one.** Spec
 * [01 · §13.2](../../docs/spec/01-swing.md) rules that grab range scales with
 * mass, so a large body below the crest can still be on offer above a small body
 * at it. The minimum over the whole field is the point where the last of them
 * lets go, whichever it turns out to be.
 */
export function clearedAbove(field: Field): number {
  // A field with nothing in it has no top rather than an immediate one: there is
  // no run to clear, and returning the empty minimum would end it on tick zero.
  let line = -Infinity;
  for (const body of field.bodies) {
    const edge = body.y - grabRange(body);
    if (line === -Infinity || edge < line) line = edge;
  }
  return line;
}

/**
 * Raise the high-water mark, unless a body is held.
 *
 * Called once per tick, before the endings are asked, so that a tick which
 * climbs and then falls behind is judged against the height it actually kept.
 */
export function markHighWater(state: SimState): void {
  if (state.heldBody !== null) return;
  if (state.craft.y < state.highWater) state.highWater = state.craft.y;
}

/**
 * Whether the craft has left the corridor — sideways past its line, or out of
 * its foot.
 *
 * The sideways test carries spec 01 §10's four units of grace, which is slack on
 * the predicate rather than a second line: the corridor's line is where the
 * corridor stops, and this is how far past it the run survives.
 */
function outOfBounds(state: SimState): boolean {
  const { centreline, halfWidth, foot } = state.field.corridor;
  const across = state.craft.x - centreline;
  return Math.abs(across) > halfWidth + CORRIDOR_GRACE || state.craft.y > foot;
}

/**
 * Which ending this tick reached, or `null` if the run is still being flown.
 *
 * Everything read here is a position, which is what makes each ending a fact
 * visible from outside the simulation ([AGENTS.md](../../AGENTS.md) §4): the run
 * stopped, and it says why.
 */
export function endingFor(state: SimState): Ending | null {
  if (state.craft.y > fellBehindLine(state.highWater)) return 'FELL_BEHIND';
  if (state.craft.y < clearedAbove(state.field)) return 'CLEARED';
  if (outOfBounds(state)) return 'OUT_OF_BOUNDS';
  return null;
}
