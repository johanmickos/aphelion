/**
 * Clearance: the turn a grab applies to a path that was going to strike the
 * body — `CONTEXT.md`'s *"what makes the grab a rescue as well as a hook."*
 *
 * Spec [01 · §4](../../docs/spec/01-swing.md) calls this *"the single most
 * load-bearing behaviour in the swing and the easiest to get wrong"*, and names
 * the wrong way explicitly, because it is the way a physics intuition reaches
 * for first.
 *
 * **Turning comes before pushing, and that was learned expensively.** Adding
 * tangential speed is the textbook way to raise a periapsis and it is also a
 * free energy injection: the prototype measured it handing a craft at half its
 * escape speed up to 277 units/s and putting it *above* escape, so the grab
 * never reached its own closest approach, coasted, and left the field — reported
 * by its author as *"I kind of shot off the planet at super speed"*. **Rotating
 * the velocity toward tangential at constant speed raises angular momentum, and
 * therefore periapsis, for nothing, and cannot unbind the craft by
 * construction.** Only where turning alone falls short is speed bought, and then
 * never past 0.98 of local escape.
 *
 * **And it eases, never snapping.** *"A single-tick application is a failure
 * however correct the endpoint"* — what the player should feel is a grab
 * gathering the craft up, and a snap reads as the world moving rather than as the
 * craft turning. It arrives over **five ticks at least and ten at most**, taking
 * as long as its own turn needs at a bounded rate; see
 * [`clearanceTicksFor`](#clearanceTicksFor) for why the rate is the
 * characteristic and the duration is the consequence.
 *
 * ## Two things that were got wrong first, and are worth stating
 *
 * **The prediction is made in the softened law the dive actually obeys**
 * ([`gravity.ts`](./gravity.ts)), not in the Kepler relations the frozen orbit is
 * authored in. The two differ by 9.4% at the floor, and aiming with the wrong one
 * left the clearance a tenth of the floor gap high — measured, a periapsis of
 * 61.9 against a floor of 56, outside spec 01 §5a's 8%.
 *
 * **Each tick asks again rather than paying out a plan.** A grab that decided its
 * whole impulse at the press and applied a fifth of it five times lands wide,
 * because the craft falls a long way in 83ms and a fixed rotation is worth a
 * different amount of angular momentum at every radius it is applied at —
 * measured, 13% above the floor on a close fast approach. Asking each tick and
 * paying a fifth, a quarter, a third, a half, the rest is the *same* even ease
 * whenever nothing disturbs it, because gravity is central and therefore changes
 * neither the momentum the craft has nor the momentum the floor asks for. What
 * it also does is land on the floor when something has.
 *
 * Even so, this is a *trigger* and not an outcome: where the turn it can afford
 * falls short the **floor itself is the promise**, held in
 * [`dive.ts`](./dive.ts) where the craft can be seen actually reaching it. That
 * division is spec 01 §4's own: *"where turning alone still falls short, the
 * floor in §5 catches the remainder."*
 */
import type { Body } from './body.ts';
import { floorRadius } from './body.ts';
import type { Craft } from './craft.ts';
import { energyAt, escapeSpeedAt, momentumToReach } from './gravity.ts';
import { angularMomentum } from './kepler.ts';
import { magnitude } from './math.ts';
import { angleOf, cos, sin } from './trig.ts';
import {
  CLEARANCE_ESCAPE_FRACTION,
  CLEARANCE_TICKS_MAX,
  CLEARANCE_TICKS_MIN,
  CLEARANCE_TURN_PER_TICK,
} from './units.ts';

/** How far the velocity has to turn, and how much speed it has to gain. */
interface Lift {
  readonly turn: number;
  readonly gain: number;
}

/**
 * What the path the craft is on still owes the floor, in full, from right here.
 *
 * Stated as angular momentum rather than as a radius: at a fixed energy the
 * closest approach rises monotonically with angular momentum, so *"the periapsis
 * is inside the floor"* and *"there is less momentum here than the floor needs"*
 * are the same sentence, and the second one inverts in closed form.
 *
 * `null` when nothing is owed, which is the 46% of grabs whose path was always
 * going to clear.
 */
function liftFor(craft: Craft, body: Body): Lift | null {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const r = magnitude(dx, dy);
  const speed = magnitude(craft.vx, craft.vy);
  if (r === 0 || speed === 0) return null;

  // A craft already moving outward has passed its closest approach; whatever it
  // was going to strike, it has missed. Nothing ahead of it needs lifting.
  if ((dx * craft.vx + dy * craft.vy) / r >= 0) return null;

  const floor = floorRadius(body);
  const energy = energyAt(body.mass, r, speed);
  const needed = momentumToReach(body.mass, energy, floor);
  // Too little energy to reach the floor at all — its closest approach is
  // already outside, so there is nothing to lift.
  if (needed === null) return null;

  const momentum = angularMomentum(dx, dy, craft.vx, craft.vy);
  if (Math.abs(momentum) >= needed) return null;

  // Which way round. The craft keeps the way it is already going; a dive that is
  // exactly head-on has no side of its own and is given one, the same one every
  // time, because determinism has no room for an arbitrary that varies.
  const way = momentum < 0 ? -1 : 1;

  // Turning at constant speed reaches at most `r × speed` of momentum. Where
  // that is short, buy speed — capped at 0.98 of local escape so the grab cannot
  // eject what it caught, and never below what the craft already had, so a
  // clearance is never a brake.
  let after = speed;
  let target = needed;
  if (needed > r * speed) {
    const cap = CLEARANCE_ESCAPE_FRACTION * escapeSpeedAt(body.mass, r);
    after = Math.min(needed / r, Math.max(speed, cap));
    // Faster means a deeper path, so the momentum the floor asks for goes up
    // with the speed that was bought to reach it.
    const raised = momentumToReach(body.mass, energyAt(body.mass, r, after), floor);
    if (raised !== null) target = raised;
  }

  // Then turn for the rest of it, as far as constant speed allows. Where that
  // still falls short the velocity ends up fully tangential and the floor in
  // `dive.ts` catches the remainder.
  const tangential = Math.min(target / r, after) * way;
  const radial = -Math.sqrt(Math.max(0, after * after - tangential * tangential));

  // Recompose in the body's frame: outward, and a quarter turn counter-clockwise
  // of outward.
  const outX = dx / r;
  const outY = dy / r;
  const vx = outX * radial - outY * tangential;
  const vy = outY * radial + outX * tangential;

  return {
    // The signed angle from the velocity the craft has to the one it wants, read
    // in the frame the old velocity defines.
    turn: angleOf(craft.vx * vx + craft.vy * vy, craft.vx * vy - craft.vy * vx),
    gain: after - speed,
  };
}

/** Whether a grab of `body` from here owes the path anything — spec 01 §4's 54%. */
export function needsClearance(craft: Craft, body: Body): boolean {
  return liftFor(craft, body) !== null;
}

/**
 * How long this clearance should take: as long as its turn needs at a bounded
 * rate, and never outside the band.
 *
 * **The duration follows the turn, and it did not use to.** Spec 01 §4 measured
 * the *time* — five ticks, 80 – 90ms — and said nothing about the *rate*, so a
 * turn of 3.6° and a turn of 62° were both paid in 83ms and the rate between
 * them varied seventeenfold. Flown, the tail is what reads wrong: nearly half of
 * all grabs owe a clearance, the median one owes 59.5°, and paying that in five
 * ticks turns the craft at 11.9° a tick — three and a half times the rate of the
 * settled orbit it is being handed to (author, 2026-08-28).
 *
 * So the rate is the characteristic and the duration is the consequence. A small
 * turn still takes [`CLEARANCE_TICKS_MIN`](./units.ts) and nothing about it has
 * moved; a large one takes longer, up to the point where waiting costs more than
 * turning briskly does — see [`CLEARANCE_TICKS_MAX`](./units.ts).
 *
 * Asked once, at the press, rather than each tick: the *share* is re-asked every
 * tick, which is what makes the ease land on the floor rather than near it, but
 * the length of the ease is fixed when it starts so that it eases at all. A
 * duration that was re-derived each tick from a turn the previous tick had
 * already shortened would never finish.
 */
export function clearanceTicksFor(craft: Craft, body: Body): number {
  const lift = liftFor(craft, body);
  if (lift === null) return 0;
  const wanted = Math.ceil(Math.abs(lift.turn) / CLEARANCE_TURN_PER_TICK);
  return Math.min(Math.max(wanted, CLEARANCE_TICKS_MIN), CLEARANCE_TICKS_MAX);
}

/**
 * Pay one tick's share of the lift, with `ticksLeft` ticks left to pay it in.
 *
 * The share is `1 / ticksLeft` of what is *still* owed, so the last tick pays
 * the remainder and the path ends up on the floor rather than near it. Speed is
 * added after the turn, so the turn stays exactly a rotation and cannot smuggle
 * energy in.
 */
export function easeClearance(craft: Craft, body: Body, ticksLeft: number): void {
  if (ticksLeft <= 0) return;
  const lift = liftFor(craft, body);
  if (lift === null) return;

  const turn = lift.turn / ticksLeft;
  const c = cos(turn);
  const s = sin(turn);
  const vx = craft.vx * c - craft.vy * s;
  const vy = craft.vx * s + craft.vy * c;

  const speed = magnitude(vx, vy);
  const scale = speed > 0 ? (speed + lift.gain / ticksLeft) / speed : 1;
  craft.vx = vx * scale;
  craft.vy = vy * scale;
}
