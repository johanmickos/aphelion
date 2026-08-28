/**
 * The simulation's vocabulary.
 *
 * Nothing here may name a pixel, a second, or a browser. The simulation is pure
 * and headless and owns the only clock in the game — ticks (ADR-0006).
 *
 * The words are `CONTEXT.md`'s and the rule is one concept, one word, everywhere
 * ([AGENTS.md](../../AGENTS.md) §2). Where the prototype had a quantity this
 * simulation also needs, it is named what this project's glossary would name it
 * rather than what it was called next door.
 */
import type { Body } from './body.ts';
import type { Craft } from './craft.ts';
import type { Dive } from './dive.ts';
import type { Orbit } from './orbit.ts';
import type { RngState } from './rng.ts';

/**
 * The game's unit of time. Not a millisecond and never convertible to one:
 * ADR-0006 gives the simulation the only clock, and `CONTEXT.md` fixes its unit.
 * The bridge from observed time to ticks is [`clock.ts`](./clock.ts), and it is
 * the only one.
 */
export type Tick = number;

/**
 * What the player can do. One verb — press — because the game is one decision
 * held and let go of (`CONTEXT.md`: grab, release).
 *
 * Press means *be caught by that body* on the way in and *let go* on the way
 * out, and there is no third thing it can mean. `CONTEXT.md` puts the whole game
 * behind it: *"the craft has timing and shape and never a throttle."*
 */
export interface Input {
  readonly pressed: boolean;
}

export const NO_INPUT: Input = { pressed: false };

/**
 * The whole world of a single run — `CONTEXT.md`'s **field**.
 *
 * Bodies only, today. Spec [17](../../docs/spec/17-daily-field.md) describes
 * what lands here: a corridor that narrows with altitude, an anomaly, powerup
 * cells, a carpet and a finish line, all generated once as data before the first
 * tick. This is the shape they arrive in, and the reason the type exists now
 * rather than when it is full.
 */
export interface Field {
  readonly bodies: readonly Body[];
}

/**
 * The whole of the simulated world at one instant.
 *
 * Everything that can change is here and nothing else is, which is what makes
 * [`snapshot.ts`](./snapshot.ts) able to say whether two runs agree.
 */
export interface SimState {
  tick: Tick;
  readonly field: Field;
  /** Mutated in place by the integrator; the reference does not change. */
  readonly craft: Craft;
  /**
   * Which body has the craft, as an index into `field.bodies`, or `null` while
   * coasting.
   *
   * This is what decides whether gravity acts at all: spec
   * [01 · §2](../../docs/spec/01-swing.md) measures that gravity acts **only
   * while a body is held, and only from the held body**, and a coasting craft
   * feels nothing from anything at any distance.
   *
   * It is moved by exactly two things: [`grab.ts`](./grab.ts) puts a body in it
   * and [`release.ts`](./release.ts) takes it out again.
   */
  heldBody: number | null;
  /**
   * The part of the swing before the freeze, while it is running.
   *
   * Present exactly while a body is held and the craft has not yet reached its
   * closest approach. `CONTEXT.md`'s **dive**: real gravity and nothing else.
   */
  dive: Dive | null;
  /**
   * The fixed orbit the swing froze onto, once it has.
   *
   * Present exactly while a body is held and the dive has ended. The two are
   * never both present and never both absent while held — the freeze is the
   * instant one becomes the other.
   */
  orbit: Orbit | null;
  /**
   * Whether the button was down at the end of the previous tick.
   *
   * A grab is attempted on the **press**, not on every tick the button is held
   * down. Spec [01 · §3](../../docs/spec/01-swing.md) counts 278 presses against
   * 270 grabs and 8 refusals, which is only a meaningful count if a refused
   * press stays refused: a button that kept retrying would make the grab a sweep
   * rather than a decision, and would turn the too-late refusal into a delay.
   */
  pressed: boolean;
  /** The seeded stream every draw in the run comes from (ADR-0004). */
  readonly rng: RngState;
}
