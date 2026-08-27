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
 * M1.2 does not read it. Press means *be caught by that body* on the way in and
 * *let go* on the way out, and both are M1.3's; what M1.2 owns is the world they
 * act on. The shape is here because a step function that takes no input is a
 * different shape, and the recipe already depends on this one.
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
   * M1.2 never changes it. Being caught by a body and letting go of one are the
   * grab and the release, and both are M1.3's; what is here is the state they
   * move between, so that the world they act on can be built and tested first.
   */
  heldBody: number | null;
  /** The seeded stream every draw in the run comes from (ADR-0004). */
  readonly rng: RngState;
}
