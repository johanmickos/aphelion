/**
 * A run written down: its seed, what the button did, and the field it was flown
 * in.
 *
 * `CONTEXT.md` calls this a **recipe** — *"the complete description of a run,
 * from which the run can be replayed and its score independently recomputed"* —
 * and ADR-0004 makes it the contract: a run is fully described by its
 * configuration, its seed and its input log, so a claimed score is a fact rather
 * than an assertion and a bug report is a thing that can be re-flown.
 *
 * **It is a recipe and not a recording, and the difference is the whole point.**
 * A log of positions says where the craft went; this says what the player did,
 * which is the only form that can be re-flown under a changed constant. The
 * author will change one at the M1 gate.
 *
 * ## What the log is
 *
 * The ticks the press changed on, in order, alternating from a button that
 * starts up: the first entry is a press going down, the second is it coming up,
 * and so on. Three properties follow from that shape and each of them is load
 * bearing.
 *
 * - **Ticks, never milliseconds.** [`clock.ts`](./clock.ts) turns observed time
 *   into ticks with the catch-up capped, so the same session on a stuttering
 *   phone and a smooth one produces the same *ticks* and different
 *   *milliseconds*. A log stamped in milliseconds is a log that does not replay.
 * - **Edges, because the press is one.** [`stepSim`](./step.ts) attempts a grab
 *   only on the way down and a refused press stays refused; the button coming up
 *   always lets go. What has to survive the round trip is the identical boolean
 *   *sequence*, which is what [`pressAt`](#pressAt) reconstructs.
 * - **Any array this file accepts is replayable.** Strictly increasing integers
 *   inside the run's own length is the whole validity rule, so there is no such
 *   thing as a log that parses and then means something impossible. That matters
 *   because a recipe arrives over the LAN from a phone (`tools/vite-plugin-diag.ts`)
 *   and is therefore attacker-shaped data: lengths, indices and a seed.
 *
 * ## Why the field is named rather than carried
 *
 * Spec [17 · §2](../../docs/spec/17-daily-field.md) versions the day generator
 * so that *"old runs replay against the generator version they were flown on"*,
 * and the fixture borrows that mechanism now rather than having it retrofitted
 * when M3's generator arrives. A recipe that did not name its field would replay
 * against whatever [`fixture-field.ts`](./fixture-field.ts) says this week —
 * and since M1.4 the field carries a **corridor** too, so "the field this was
 * flown in" is more than a list of bodies.
 *
 * The version has to move whenever the field's data does, and remembering to
 * move it is not a mechanism. `test/sim/fixture-field.test.ts` holds the version
 * against a fingerprint of the field it builds, so editing the table — or moving
 * `MASS_EXPONENT`, which is what sets every body's mass — fails there until the
 * version is bumped.
 *
 * **What that does not cover is recorded rather than papered over.** A constant
 * that shapes the *swing* rather than the field — the eccentricity cap, the
 * settle's length, the boost envelope — moves the run a recipe replays to
 * without moving the field's identity, and nothing here will say so. The
 * prototype paid for that lesson and answers it with a simulation behaviour
 * version beside the seed; this repo will need one, and the place it goes is
 * beside `field` below. It is not built now because the gate is about to close
 * the one parameter that is open (spec 01 §13.2), and a version whose first act
 * is to be bumped teaches nobody anything.
 */
import type { Craft } from './craft.ts';
import { FIXTURE_FIELD_VERSION, fixtureCraft, fixtureField } from './fixture-field.ts';
import type { Field, Tick } from './types.ts';

/**
 * Bumped whenever the shape below changes.
 *
 * A recipe outlives the session that produced it — that is what it is for — so
 * one written by a different game has to be able to say so rather than replay
 * to a plausible-looking wrong answer.
 */
export const RECIPE_VERSION = 1;

/**
 * The longest run a recipe may claim, in ticks: **one hour of play**.
 *
 * A bound rather than a preference. The replay loop below runs `ticks` steps and
 * a verification runs four times that, so an unvalidated tick count is a way to
 * make a dev server work forever from the LAN. One hour is seven times spec
 * [01](../../docs/spec/01-swing.md)'s entire measured cohort of 474 seconds, and
 * a DAILY run is a couple of minutes (ADR-0007: one run, no retry).
 */
export const MAX_RECIPE_TICKS = 60 * 60 * 60;

/**
 * Which field a run was flown in — what made it, and which version of that.
 *
 * Spec [17 · §2](../../docs/spec/17-daily-field.md)'s mechanism exactly: the
 * generator's version is part of the field's identity, because a change to the
 * generator changes every past field and would invalidate every stored run.
 * `generator` is a string rather than a union so that a recipe naming a field
 * this build has never heard of is a *refusal at the boundary* with the name in
 * the message, rather than a type error nobody sees at runtime.
 */
export interface FieldIdentity {
  readonly generator: string;
  readonly version: number;
}

/** The hand-authored field the M1 gate is flown in. */
export const FIXTURE_FIELD: FieldIdentity = {
  generator: 'fixture',
  version: FIXTURE_FIELD_VERSION,
};

/**
 * The complete description of a run.
 *
 * Four things, and there is deliberately nothing here about what *happened* —
 * no positions, no score, no ending. All of those are consequences, and a
 * recipe that carried them would have two answers to the same question the first
 * time the simulation changed.
 */
export interface Recipe {
  readonly version: number;
  /** The field it was flown in — named, not carried. See the header. */
  readonly field: FieldIdentity;
  /** The seed every draw in the run comes from (ADR-0004). */
  readonly seed: number;
  /** How long the run was, in ticks. Not derivable from the log. */
  readonly ticks: Tick;
  /** The ticks the press changed on, alternating from a button that starts up. */
  readonly log: readonly Tick[];
}

/** The field and the craft a recipe's identity resolves to. */
export function fieldFor(identity: FieldIdentity): { field: Field; craft: Craft } {
  if (identity.generator === FIXTURE_FIELD.generator) {
    if (identity.version !== FIXTURE_FIELD.version) {
      throw new Error(
        `recipe was flown in fixture field v${identity.version}, and this build has ` +
          `v${FIXTURE_FIELD.version} — the field has changed underneath it`,
      );
    }
    return { field: fixtureField(), craft: fixtureCraft() };
  }
  throw new Error(`unknown field generator "${identity.generator}"`);
}

/**
 * Whether the button was down at `tick`, from a log walked in any order.
 *
 * The edges alternate, so an odd number of them at or before a tick means the
 * button is down at it. Stateless on purpose: a cursor would make the answer
 * depend on the order the questions were asked, and a replay that reproduced a
 * run only when it was walked forwards would be a replay with a precondition
 * nobody could see.
 */
export function pressAt(log: readonly Tick[], tick: Tick): boolean {
  let low = 0;
  let high = log.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (log[middle]! <= tick) low = middle + 1;
    else high = middle;
  }
  return (low & 1) === 1;
}

/**
 * A recipe being written, one tick at a time.
 *
 * Held open rather than built at the end so that a run which ends unexpectedly —
 * every run — still has one.
 */
export interface Recorder {
  readonly field: FieldIdentity;
  readonly seed: number;
  /** How many ticks have been recorded, and therefore the next one expected. */
  ticks: Tick;
  /** Whether the button was down at the end of the last recorded tick. */
  pressed: boolean;
  readonly log: Tick[];
}

export function createRecorder(field: FieldIdentity, seed: number): Recorder {
  return { field, seed, ticks: 0, pressed: false, log: [] };
}

/**
 * Record the press the run was flown with at `tick`.
 *
 * Called once per tick, with the same boolean handed to [`stepSim`](./step.ts)
 * and before it — so the log is what the button did rather than a reconstruction
 * of it, and the reconstruction is identical by construction. That includes the
 * up-edges nobody made: focus loss lets go of everything
 * ([`press.ts`](../input/press.ts)), and a log written from the boolean records
 * that exactly as it records a lifted thumb.
 *
 * **It throws if it is driven twice for one tick, or skipped for one.** Same
 * sharp edge as `derive`'s once-per-tick rule (ADR-0015) and the same answer:
 * the failure is a log that replays to a different run, which is silent, so the
 * guard is here rather than in a convention.
 */
export function recordPress(recorder: Recorder, tick: Tick, pressed: boolean): void {
  if (tick !== recorder.ticks) {
    throw new Error(`recorder is at tick ${recorder.ticks}, asked to record tick ${tick}`);
  }
  if (pressed !== recorder.pressed) {
    recorder.log.push(tick);
    recorder.pressed = pressed;
  }
  recorder.ticks = tick + 1;
}

/** What has been recorded so far, as a recipe. */
export function recipeOf(recorder: Recorder): Recipe {
  return {
    version: RECIPE_VERSION,
    field: { generator: recorder.field.generator, version: recorder.field.version },
    seed: recorder.seed,
    ticks: recorder.ticks,
    log: [...recorder.log],
  };
}

function integer(value: unknown, what: string, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) {
    throw new Error(`${what} is not a whole number in [${low}, ${high}]`);
  }
  return value;
}

function parseFieldIdentity(raw: unknown): FieldIdentity {
  if (typeof raw !== 'object' || raw === null) throw new Error('recipe names no field');
  const f = raw as Record<string, unknown>;
  if (typeof f.generator !== 'string' || f.generator.length === 0 || f.generator.length > 32) {
    throw new Error('field generator is not a name');
  }
  return { generator: f.generator, version: integer(f.version, 'field version', 0, 0xffff) };
}

function parseLog(raw: unknown, ticks: Tick): Tick[] {
  if (!Array.isArray(raw)) throw new Error('input log is not an array');
  const entries = raw as unknown[];
  if (entries.length > 0 && ticks === 0) throw new Error('input log on a run of no ticks');
  const log: Tick[] = [];
  let previous = -1;
  for (const entry of entries) {
    const tick = integer(entry, 'an entry in the input log', 0, ticks - 1);
    if (tick <= previous) throw new Error(`input log runs backwards at ${tick}`);
    previous = tick;
    log.push(tick);
  }
  return log;
}

/**
 * Validate rather than cast, and build a fresh recipe out of what survived.
 *
 * The one door a recipe comes in through, whether it arrives from a file, from
 * the CLI or from a phone on the LAN — and a file is written on the strength of
 * this returning, so "it arrived as JSON" is not the same as "it is a recipe".
 * Nothing from the caller's object is carried through by reference: what comes
 * back is built here out of values this function has checked, so a field nobody
 * validated cannot ride along inside a recipe that looks validated.
 */
export function parseRecipe(raw: unknown): Recipe {
  if (typeof raw !== 'object' || raw === null) throw new Error('recipe is not an object');
  const r = raw as Record<string, unknown>;
  if (r.version !== RECIPE_VERSION) {
    throw new Error(`recipe version ${String(r.version)}, expected ${RECIPE_VERSION}`);
  }
  const field = parseFieldIdentity(r.field);
  // Resolved rather than merely shaped: a recipe naming a field this build
  // cannot make is refused here, where the message can say which field, and not
  // three layers down inside a replay that has already started.
  fieldFor(field);
  const seed = integer(r.seed, 'seed', 0, 0xffffffff);
  const ticks = integer(r.ticks, 'ticks', 0, MAX_RECIPE_TICKS);
  return { version: RECIPE_VERSION, field, seed, ticks, log: parseLog(r.log, ticks) };
}
