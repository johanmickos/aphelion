/**
 * The headless pilot: fly a whole run, and report only how it ended.
 *
 * [`swing.ts`](./swing.ts) flies one geometry at one body and is the instrument
 * spec 01 §2 – §12 are measured with. This is the other scale: a craft let loose
 * in a real field until something stops it, which is the only scale spec
 * [01 · §10](../../docs/spec/01-swing.md)'s tolerance can be read at — *"over a
 * comparable corpus of real play, out-of-bounds is the plurality ending, at 60%
 * or more."*
 *
 * **Nothing here reaches into the simulation for a verdict.** The ending is read
 * off `SimState.ending`, which is the whole of what spec 01 §10's acceptance
 * asks the simulation to say out loud — *a run ends for each distinct reason and
 * reports which* — and the only other thing read is whether the swing has frozen
 * yet, which is the same question `swing.ts` allows itself and for the same
 * reason ([AGENTS.md](../../AGENTS.md) §4).
 *
 * ## The pilot is a stand-in, and it says so
 *
 * It is not a player and it is not a recording of one. What it is, is the two
 * distributions spec 01 actually measured, driven through the one verb:
 *
 * - **When it presses** — at a grab distance drawn from §3's 270 real grabs:
 *   p05 92, p25 120, p50 150, p75 222, p95 351 (prototype units). It presses at
 *   the first tick the nearest body ahead is inside the distance it drew, which
 *   is a rule written on positions alone and owes [`grab.ts`](../../src/sim/grab.ts)
 *   nothing.
 * - **When it lets go** — at a moment after the freeze drawn from §11's 95
 *   converted swings: **53%** before the boost has armed, **12%** inside the
 *   plateau, **36%** after it has begun decaying. That is the measured shape of
 *   where real releases fall, and it is the half of a run's behaviour that most
 *   changes where the craft ends up.
 *
 * What it cannot reproduce is *aim*, which spec 01 measures nowhere and which
 * `swing.ts` already records as the one input in its corpus that is not
 * evidence. So this is a stand-in for real play in exactly the sense spec 01
 * §13.7 means, and it is to be replaced by percentiles of this game's own runs
 * as soon as [M1.5](../../docs/plan/m1-the-swing.md) can record them.
 */
import type { Body } from '../../src/sim/body.ts';
import { distance, magnitude } from '../../src/sim/math.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { Craft } from '../../src/sim/craft.ts';
import { angleOf } from '../../src/sim/trig.ts';
import type { Ending, Field, SimState } from '../../src/sim/types.ts';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  SCALE,
} from '../../src/sim/units.ts';

/** How one run turned out. */
export interface Flown {
  /** Which of the four things happened, or `null` if it was still flying. */
  readonly ending: Ending | null;
  /** The tick it happened on. */
  readonly tick: number;
  /** How many presses were answered along the way. */
  readonly grabs: number;
  /** The furthest it ever got from the corridor's centreline, in design units. */
  readonly widest: number;
  /** Whether a body was being held when the run ended. */
  readonly endedHolding: boolean;
  /**
   * How far outside the corridor's centreline the craft was when the run ended.
   *
   * Only meaningful for an out-of-bounds ending, and it is here because it is the
   * number that says how much of a death happened off the side of the picture.
   */
  readonly endedAcross: number;
}

/** A repeatable stream, so a corpus is the same corpus on every run. */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Draw from a distribution given as percentiles, straight between them. */
function fromPercentiles(u: number, points: readonly (readonly [number, number])[]): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, v0] = points[i]!;
    const [p1, v1] = points[i + 1]!;
    if (u * 100 <= p1 || i === points.length - 2) {
      const f = Math.max(0, Math.min(1, (u * 100 - p0) / (p1 - p0)));
      return v0 + f * (v1 - v0);
    }
  }
  return points[0]![1];
}

/** Spec 01 §3's grab distances, over 270 real grabs, in prototype units. */
const GRAB_DISTANCES = [
  [5, 92],
  [25, 120],
  [50, 150],
  [75, 222],
  [95, 351],
] as const;

/**
 * How long after the freeze this swing will be let go of, in ticks — spec 01
 * §11's measured 53 / 12 / 36 split across the boost envelope.
 */
function holdFor(u: number): number {
  if (u < 0.53) return u * (1 / 0.53) * BOOST_ARM_TICKS;
  if (u < 0.65) {
    return BOOST_ARM_TICKS + ((u - 0.53) / 0.12) * (BOOST_PLATEAU_TICKS - BOOST_ARM_TICKS);
  }
  return BOOST_PLATEAU_TICKS + ((u - 0.65) / 0.35) * (BOOST_ZERO_TICKS - BOOST_PLATEAU_TICKS);
}

/** How far the nearest body's surface is, from wherever the craft is now. */
function nearestSurface(field: Field, craft: Craft): number {
  let nearest = Infinity;
  for (const body of field.bodies) {
    const d = distance(craft.x, craft.y, body.x, body.y) - body.radius;
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * How long a swing that never freezes is held for before the pilot gives up on
 * it — five seconds, which is twice the whole length of the boost envelope.
 *
 * A flyby has no freeze to date a release from, so it needs the other kind of
 * limit. Spec 01 §11 counts 95 converted swings out of 270 grabs, so most presses
 * end this way and how long they are held changes where the craft goes.
 */
const FLYBY_TICKS = 300;

/**
 * How near the bearing to a next body a release has to point to count as aimed,
 * in radians.
 *
 * Spec 01 measures no aim distribution anywhere, so this is the pilot's one
 * invented number and it says so — the same admission `swing.ts`'s corpus makes
 * about drawing aim uniformly. What it is set from is the consequence rather
 * than a guess at the cause: at eight degrees the pilot's releases land where
 * spec 01 §11 measured real ones landing, most of them before the boost has
 * armed because the aim arrived first and they took it.
 */
const AIM_TOLERANCE = (8 * Math.PI) / 180;

/** How far ahead the pilot will aim at a body, in prototype units. */
const AIM_RANGE = 900;

/**
 * How often an approach is flown past rather than pressed at — about one in
 * eight.
 *
 * **Invented, and it is the pilot's second invented number.** Spec 01 counts
 * presses and never counts the bodies a player flew past without reaching for,
 * so there is nothing to draw this from. It exists because a corpus in which
 * every approach is taken contains **no impacts at all**, and a corpus with no
 * impacts in it cannot notice the game losing them.
 */
const SKIP_CHANCE = 0.12;

/**
 * Whether letting go right now would send the craft at a body further up the
 * field.
 *
 * Positions and a velocity, and nothing else: on a frozen orbit the craft's
 * velocity **is** the exit tangent (spec 01 §8), so where a release would go is
 * a thing the outside of the simulation can read. This is the pilot's stand-in
 * for the compass, which is [M2](../../docs/plan/m2-the-instrument.md)'s.
 */
function aimed(state: SimState): boolean {
  const craft = state.craft;
  const speed = magnitude(craft.vx, craft.vy);
  if (speed === 0) return false;
  const heading = angleOf(craft.vx, craft.vy);

  for (let i = 0; i < state.field.bodies.length; i++) {
    if (i === state.heldBody) continue;
    const body = state.field.bodies[i]!;
    // Further up the field, because a run is a climb and a release back down it
    // is a release into the fell-behind line.
    if (body.y >= craft.y) continue;
    const away = distance(craft.x, craft.y, body.x, body.y);
    if (away > AIM_RANGE * SCALE) continue;
    let off = angleOf(body.x - craft.x, body.y - craft.y) - heading;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off < -Math.PI) off += 2 * Math.PI;
    if (Math.abs(off) <= AIM_TOLERANCE) return true;
  }
  return false;
}

/**
 * Fly one run to its ending.
 *
 * `ticks` is a ceiling and not a schedule: a run still flying when it runs out
 * returns a `null` ending, which is itself worth counting — a corpus where most
 * runs time out is a corpus measuring the ceiling rather than the game.
 */
export function flyRun(field: Field, craft: Craft, seed: number, ticks = 20_000): Flown {
  const state: SimState = createInitialState(field, craft, seed);
  const next = stream(seed);
  const { centreline } = field.corridor;

  let reach = fromPercentiles(next(), GRAB_DISTANCES) * SCALE;
  let pressed = false;
  // The trigger arms once the craft is clear of the body it last left, and
  // fires when it arrives at the next one. Without it a release at the floor
  // would re-press on the very next tick, because the body just let go of is by
  // far the nearest thing in the field.
  let armed = false;
  let hold = 0;
  let sinceGrab = 0;
  let sinceFreeze = 0;
  let grabs = 0;
  let left: Body | null = null;
  let widest = 0;

  for (let tick = 0; tick < ticks && state.ending === null; tick++) {
    const holding = state.heldBody !== null;
    if (holding) {
      sinceGrab += 1;
      if (state.orbit !== null) sinceFreeze += 1;
      // **Aim first, then the clock** — which is spec 01 §11's measured shape
      // rather than a preference. Of 95 converted swings, 53% were let go of
      // before the boost had armed at all, *"because the aim arrived first and
      // they took it"*. A pilot that waited for the envelope every time would be
      // flying a game where the two goals do not compete.
      if (state.orbit !== null) {
        pressed = !(aimed(state) || sinceFreeze > hold);
      } else {
        pressed = sinceGrab <= FLYBY_TICKS;
      }
    } else if (pressed) {
      // The button is still down and nothing is held, so the press was refused.
      // It stays spent — spec 01 §3 counts 8 refusals against 278 presses, which
      // is only a meaningful count if a refused press does not keep retrying —
      // so the button comes up and the next approach is a new draw.
      pressed = false;
      reach = fromPercentiles(next(), GRAB_DISTANCES) * SCALE;
    } else {
      // Armed once the craft is clear of **the body it just left**, rather than
      // clear of everything: at the floor the released body is by far the
      // nearest thing in the field, and a rule written on the whole field would
      // never arm at all wherever a drawn reach is longer than the gap between
      // one body and the next.
      if (left === null || distance(state.craft.x, state.craft.y, left.x, left.y) > reach) {
        armed = true;
      }
      pressed = armed && nearestSurface(state.field, state.craft) <= reach;
      if (pressed && next() < SKIP_CHANCE) {
        // An approach let go by. Spec 01 counts presses and never counts the
        // bodies a player flew past without reaching for, so **this number is
        // invented and it is the pilot's second one**. It is here because a
        // corpus in which every approach is taken contains no impacts at all,
        // and a corpus with no impacts in it cannot notice the game losing them.
        pressed = false;
        armed = false;
        reach = fromPercentiles(next(), GRAB_DISTANCES) * SCALE;
      }
      if (pressed) {
        armed = false;
        hold = holdFor(next());
        sinceGrab = 0;
        sinceFreeze = 0;
      }
    }

    const holdingBefore = state.heldBody;
    stepSim(state, { pressed });
    if (state.heldBody !== null && !holding) grabs += 1;
    if (holdingBefore !== null && state.heldBody === null) {
      left = state.field.bodies[holdingBefore]!;
    }

    const across = Math.abs(state.craft.x - centreline);
    if (across > widest) widest = across;
  }

  return {
    ending: state.ending,
    tick: state.tick,
    grabs,
    widest,
    endedHolding: state.heldBody !== null,
    endedAcross: Math.abs(state.craft.x - centreline),
  };
}
