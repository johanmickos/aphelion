/**
 * How a golden addresses a tick.
 *
 * ## Two things were wearing one hat
 *
 * A tick number in a golden is one of two things, and until now they were not
 * told apart. *"The release at 286"* is a **coordinate** — a place to look, and
 * nothing about 286 is a claim; the claim is what the picture does at a swing
 * let go at full boost. *"Twenty-nine grabs and twenty-eight releases, on these
 * ticks"* is a **claim about the run**, and its whole job is to fail loudly when
 * the simulation moves underneath the picture.
 *
 * They cost different things. A claim is supposed to move, is one list, and is
 * regenerated in one step. A coordinate moves for exactly the same reason and is
 * not supposed to mean anything at all — and re-pinning thirty of them by hand
 * was costing a day of the author's tuning. `SIM_VERSION` 7, 8 and 9 landed
 * across 2026-08-30 and 08-31 and cost **169, 89 and 72** changed lines between
 * the goldens, the presentation tests and the fixture, almost every one of them
 * a coordinate.
 *
 * So coordinates are **found** here, and claims stay written out in
 * [`the shape of the run`](./state/goldens.test.ts).
 *
 * ## A finder that always finds something cannot fail
 *
 * That is the trap, and it is the reason this file is not three lines. A
 * `firstReleaseAtFullBoost(run)` that hands back whichever release happens to
 * have an envelope of 1 turns every red test green for free: the run stops
 * containing the moment a golden is written about and nothing says so, or a
 * different swing quietly becomes the subject and the golden's other sentences
 * are now about something else. Either way the promise the goldens exist for —
 * *a deliberate change requires editing the sentence that describes it* — is
 * gone, and thirty edits a tuning have been traded for a test that stopped
 * noticing.
 *
 * Three rules keep a found moment falsifiable.
 *
 * **1 · A moment says how often it happens.** [`once`](#once) refuses a run that
 * does not hold exactly one, and [`each`](#each) refuses a run that holds none.
 * A fixture that has stopped carrying a moment fails *at the finder*, naming the
 * moment that went missing — rather than downstream, in an assertion that has
 * quietly become about a different swing.
 *
 * **2 · A moment that happens more than once is asserted over every one of
 * them.** This is the rule that does the real work, and it is *stronger* than
 * what it replaces rather than weaker: there is no selection left to go wrong.
 * The golden for a swing let go at the top of its envelope now runs against all
 * three of them in this fixture where naming tick 286 ran it against one.
 *
 * And a claim that was only ever true of the swing somebody happened to pick
 * fails the moment it is asked of the whole class, which is not a hypothetical —
 * it caught three. *"Says SHARP"* is a fact about that swing's **aim** and was
 * sitting under a moment defined by its **boost**, which spec 01 §11 is
 * explicitly about the independence of; the third full-boost release in this run
 * earns no word at all. *"The ramp shrinks by a factor of 3.1"* is one swing's
 * number and the seven ramps here run **2.0 to 3.8**. *"The compass leaves
 * inside 100ms"* is untrue of a release the craft re-grabs from before the exit
 * has finished, which happens twice here. Tick-addressing hid all three.
 *
 * **3 · The tick is reported and never asserted.** [`heading`](#heading) puts it
 * in the `describe` block's own name, so a failure reads *"a swing let go at
 * full boost · ticks 286, 1431, 1774 > stretches the craft the whole way"* and a
 * human knows where to point `pnpm replay`. Nothing needs editing when it moves,
 * because nothing wrote it down.
 *
 * ## What this does not do
 *
 * It does not make the fixture free. The run still has to *contain* every moment
 * the goldens are written about, and `tools/fixture.ts` is the search that finds
 * one that does — the criteria as code rather than as prose in a JSON note.
 */
import { readFileSync } from 'node:fs';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import type { PresentationState } from '../src/state/types.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { SETTLE_TICKS } from '../src/sim/units.ts';
import { calloutTicks } from '../src/state/callout.ts';
import { parseDispatch } from '../tools/dispatch.ts';

/** The recipe this repo ships and `pnpm replay` flies with no argument. */
export function shippedRecipe(): Recipe {
  const text = readFileSync(new URL('./recipes/pilot-60s.json', import.meta.url), 'utf8');
  return parseDispatch(JSON.parse(text)).recipe;
}

/**
 * Every tick of a run, as the picture.
 *
 * Derived beside the simulation from tick zero, once per tick, because
 * [ADR-0015](../docs/adr/0015-presentation-state-carries-what-decays.md) makes
 * presentation state a recurrence and it cannot be asked for out of the blue.
 */
export function presentRun(recipe: Recipe): PresentationState[] {
  let view = createPresentation(openRun(recipe));
  const views = [view];
  replayRun(recipe, {
    onTick: (state) => {
      view = derive(view, state);
      views.push(view);
    },
  });
  return views;
}

/** Every tick of the shipped run, as the picture. */
export function shippedRun(): PresentationState[] {
  return presentRun(shippedRecipe());
}

/** Whether the craft has hold of anything on this tick. */
export function held(view: PresentationState): boolean {
  return view.bodies.some((body) => body.held);
}

/**
 * A moment: the sentence that describes it, and every tick of the run it
 * happens on.
 *
 * The sentence is not decoration. It is what a failure is reported in, and it is
 * the thing a deliberate change has to be argued against — so it says what makes
 * the moment *this* moment, in the terms the golden under it is about.
 */
export interface Moment {
  readonly what: string;
  readonly ticks: readonly number[];
}

/**
 * The ticks of `run` where something is true of the picture.
 *
 * `holds` is handed the tick's own view and the one before it, because most of
 * what names a moment is a **transition** — a body held that was not, an
 * envelope that was at its top on the tick a swing ended.
 */
export function ticksWhere(
  run: readonly PresentationState[],
  what: string,
  holds: (view: PresentationState, before: PresentationState, tick: number) => boolean,
): Moment {
  const ticks: number[] = [];
  for (let tick = 1; tick < run.length; tick++) {
    if (holds(run[tick]!, run[tick - 1]!, tick)) ticks.push(tick);
  }
  return { what, ticks };
}

/** The ticks a swing began on, and the ticks one ended on. */
export function grabTicks(run: readonly PresentationState[]): readonly number[] {
  return ticksWhere(run, 'a grab', (view, before) => !held(before) && held(view)).ticks;
}

export function releaseTicks(run: readonly PresentationState[]): readonly number[] {
  return ticksWhere(run, 'a release', (view, before) => held(before) && !held(view)).ticks;
}

/**
 * The ticks a dive froze on — the tick the closest approach becomes a fact, read
 * as *the compass has a hand and had none*, which is the same reading
 * [`arrival.ts`](../src/state/arrival.ts) is placed on.
 */
export function freezeTicks(run: readonly PresentationState[]): readonly number[] {
  return ticksWhere(
    run,
    'a freeze',
    (view, before) => view.compass?.hand != null && before.compass?.hand == null,
  ).ticks;
}

/** A moment narrowed to the ticks a swing ended on. */
export function releasesWhere(
  run: readonly PresentationState[],
  what: string,
  holds: (view: PresentationState, before: PresentationState, tick: number) => boolean,
): Moment {
  return ticksWhere(
    run,
    what,
    (view, before, tick) => held(before) && !held(view) && holds(view, before, tick),
  );
}

/**
 * The one tick a moment happens on, for a description that picks out a single
 * swing. Anything a run may hold more than one of is [`each`](#each).
 *
 * It refuses a run holding two as loudly as one holding none, and that is the
 * point rather than pedantry: a second instance means the sentence no longer
 * describes one thing, and a golden that quietly took the first of them would be
 * asserting about a swing nobody chose.
 */
export function once(moment: Moment): number {
  if (moment.ticks.length !== 1) throw missing(moment, 'exactly one');
  return moment.ticks[0]!;
}

/**
 * Every tick a moment happens on, and never none of them.
 *
 * `atLeast` is a floor with a reason attached at the call site: a claim about a
 * *class* of moment wants more than one instance before it means much, and a
 * count of graded windows or of adjacent rings is only worth asserting over a
 * sample big enough to have been able to disagree.
 */
export function each(moment: Moment, atLeast = 1): readonly number[] {
  if (moment.ticks.length < atLeast) throw missing(moment, `at least ${atLeast}`);
  return moment.ticks;
}

/**
 * The `describe` block's name: what the moment is, and where in this run it
 * turned out to be.
 *
 * The ticks are here and nowhere else — printed on the way past so a red test
 * can be flown, never compared against anything. Capped, because a moment that
 * happens sixteen times does not need sixteen numbers in a test name to be
 * findable.
 */
export function heading(moment: Moment): string {
  const { ticks } = moment;
  if (ticks.length === 1) return `${moment.what} · tick ${ticks[0]}`;
  const shown = ticks.slice(0, 5).join(', ');
  const rest = ticks.length > 5 ? ` and ${ticks.length - 5} more` : '';
  return `${moment.what} · ticks ${shown}${rest}`;
}

/**
 * What a fixture that has stopped carrying a moment says on its way out.
 *
 * It is written to be read by whoever ran a physics change and did not expect
 * this, so it says which moment went, what was found instead, and what to do —
 * the goldens are pinned to a *run*, and a run the physics regenerates can stop
 * containing the thing a sentence is about.
 */
function missing(moment: Moment, wanted: string): Error {
  const found =
    moment.ticks.length === 0 ? 'never happens' : `happens on ${moment.ticks.join(', ')}`;
  return new Error(
    `The shipped run no longer carries a moment the goldens are written about.\n` +
      `  wanted: ${wanted} tick where "${moment.what}"\n` +
      `  found:  it ${found} (${moment.ticks.length} of them)\n` +
      `\n` +
      `This is not a re-pin. A golden is a sentence about a kind of moment, and this\n` +
      `run has stopped containing that kind — so either the physics changed what the\n` +
      `game does, which is the sentence's problem, or the fixture needs re-recording,\n` +
      `which is \`node tools/fixture.ts\`. \`pnpm replay\` flies the run as it stands.`,
  );
}

/**
 * What a fixture has to **contain** for the goldens to have anything to find.
 *
 * ## Why this list exists at all
 *
 * Finding a moment removes the cost of a physics change and does not remove the
 * *fixture*: a golden is a sentence about a kind of moment, and a run that no
 * longer holds that kind fails at the finder. So a re-record still has to land
 * on a run carrying every one of these, and until 2026-08-31 that search was a
 * hand-run seed hunt whose criteria lived in a sentence in the recipe's JSON
 * note. This is that sentence as code, and [`tools/fixture.ts`](../tools/fixture.ts)
 * is what spends it.
 *
 * ## It is a search heuristic and the goldens are the gate
 *
 * Stated plainly because the alternative is to overclaim: a seed this list
 * accepts is a seed *worth trying*, not a seed proven to pass. The proof is
 * `pnpm check`, where a moment nobody thought to put here fails at its own
 * finder and names itself. What this buys is that the search stops being
 * somebody's memory of what the goldens need.
 *
 * The counts are floors and the reason for each is at its own line. Where a
 * golden asserts an exact number — the arrival's *two words in twenty-seven
 * captures* — that is a **claim** and lives in the golden, not here: this list
 * says what a fixture must be able to demonstrate, never what the answer is.
 */
export interface Coverage {
  readonly what: string;
  readonly atLeast: number;
  readonly count: (run: readonly PresentationState[]) => number;
}

const spoke = (view: PresentationState): boolean => view.callout?.life.age === 0;

const tally = (
  run: readonly PresentationState[],
  holds: (view: PresentationState, before: PresentationState, tick: number) => boolean,
): number => ticksWhere(run, '', holds).ticks.length;

const releaseTally = (
  run: readonly PresentationState[],
  holds: (view: PresentationState, before: PresentationState, tick: number) => boolean,
): number => releasesWhere(run, '', holds).ticks.length;

export const COVERAGE: readonly Coverage[] = [
  // The four release tiers, because the ladder is only a ladder if the run can
  // show every rung of it.
  ...(['MAKE', 'TRUE', 'SHARP', 'PERFECT'] as const).map((tier) => ({
    what: `a release graded ${tier}`,
    atLeast: 1,
    count: (run: readonly PresentationState[]) =>
      releaseTally(run, (view) => spoke(view) && view.callout!.tier === tier),
  })),
  {
    // The moment the punch is owed in full — and the quality it is paid with is
    // the envelope on the tick before, so this is where the two layers meet.
    what: 'a swing let go at the very top of its boost envelope',
    atLeast: 1,
    count: (run) => releaseTally(run, (_view, before) => before.compass!.envelope === 1),
  },
  {
    // Spec 01 §11's tension in one tick: the best word, and no boost at all.
    what: 'a release at PERFECT aim with no boost at all',
    atLeast: 1,
    count: (run) =>
      releaseTally(
        run,
        (view, before) =>
          before.compass!.envelope === 0 && spoke(view) && view.callout!.tier === 'PERFECT',
      ),
  },
  {
    // The only place the arc growing past the settle's end is visible at all —
    // and the rarest thing in this list by a distance, because the pilot lets go
    // as soon as the aim arrives. See `goldens.test.ts`, which explains the 36.
    what: 'a swing held well past the end of its own settle',
    atLeast: 1,
    count: (run) => heldPastSettle(run, 36).length,
  },
  {
    // Long enough to draw a whole ramp: six climbing stretches and the plateau.
    what: 'a swing held long enough to draw its whole boost ramp',
    atLeast: 3,
    count: (run) => heldPastFreeze(run, 28).length,
  },
  {
    // A word watched all the way out, with nothing replacing it part way.
    what: 'a word with no other release word born inside its whole life',
    atLeast: 1,
    count: (run) => leftAlone(run).length,
  },
  {
    // And the opposite, which is what makes the one slot a rule rather than an
    // accident of a run whose swings never overlapped.
    what: 'a word struck while an earlier one was still lit',
    atLeast: 1,
    count: (run) =>
      releaseTally(run, (view, _before, tick) => {
        if (!spoke(view)) return false;
        const previous = run[tick - 1]?.callout;
        return previous != null && previous.life.age > 0;
      }),
  },
  {
    // Enough releases with a word to assert the callout's choreography over a
    // class rather than over whichever one came first.
    what: 'a release that earned a word of its own',
    atLeast: 5,
    count: (run) => releaseTally(run, spoke),
  },
  {
    // The instrument's departure needs a release the next grab does not
    // interrupt, and a run of swings a tick apart has none.
    what: 'a release the craft does not immediately grab back from',
    atLeast: 10,
    count: (run) => {
      const grabs = grabTicks(run);
      return releaseTally(
        run,
        (_view, _before, tick) => !grabs.some((grab) => grab > tick && grab <= tick + 6),
      );
    },
  },
  {
    // A body lit and gripping, forty ticks after the press that took it.
    what: 'a grab the craft is still holding forty ticks later',
    atLeast: 5,
    count: (run) =>
      tally(
        run,
        (view, before, tick) => !held(before) && held(view) && held(run[tick + 40] ?? view),
      ),
  },
  {
    // The case that restated *the grab does not stretch the craft*: a grab
    // landing while the previous release's punch is still coming home.
    what: 'a grab that lands while the last punch is still recovering',
    atLeast: 1,
    count: (run) =>
      tally(
        run,
        (view, before) => !held(before) && held(view) && view.craft.deformation.recovery !== null,
      ),
  },
  {
    // The capture words, which the pilot under-produces and cannot be asked for
    // more of — `test/sim/run.ts` says why: aim is what it cannot reproduce.
    what: 'a tight arrival',
    atLeast: 2,
    count: (run) => tally(run, (view) => view.arrival?.life.age === 0),
  },
  {
    what: 'an arrival lit beside a release word',
    atLeast: 1,
    count: (run) => run.filter((view) => view.arrival !== null && view.callout !== null).length,
  },
  {
    what: 'a knock',
    atLeast: 1,
    count: (run) => tally(run, (view) => view.knock?.life.age === 0),
  },
  {
    // Spec 00 §6's cap, which is only asserted as a cap if the run reaches it.
    what: 'three rings drawn at once',
    atLeast: 1,
    count: (run) => run.filter((view) => (view.compass?.rings.length ?? 0) === 3).length,
  },
  {
    // Enough adjacent pairs for the minimum-gap rule to have been able to fail.
    what: 'adjacent ring pairs to measure the gap over',
    atLeast: 500,
    count: (run) =>
      run.reduce((sum, view) => sum + Math.max(0, (view.compass?.rings.length ?? 0) - 1), 0),
  },
  {
    what: 'ticks drawing a predicted orbit path',
    atLeast: 100,
    count: (run) => run.filter((view) => view.compass?.predicted === true).length,
  },
  {
    // Both sides of the dot, because the grading must not quietly become
    // one-sided and a run with only one side cannot notice.
    what: 'graded windows the hand had swept past',
    atLeast: 20,
    count: (run) => gradedSide(run, 1),
  },
  {
    what: 'graded windows the hand was still short of',
    atLeast: 20,
    count: (run) => gradedSide(run, -1),
  },
];

/** What a run is missing, as the sentences naming it — empty if it carries everything. */
export function shortfall(run: readonly PresentationState[]): string[] {
  return COVERAGE.filter((need) => need.count(run) < need.atLeast).map(
    (need) => `${need.what} (needs ${need.atLeast})`,
  );
}

/** The freezes a swing was held at least `ticks` past. */
function heldPastFreeze(run: readonly PresentationState[], ticks: number): number[] {
  const releases = releaseTicks(run);
  return freezeTicks(run).filter(
    (freeze) => (releases.find((t) => t > freeze) ?? run.length) - freeze > ticks,
  );
}

/** The freezes a swing was held `over` ticks past the end of its own settle. */
function heldPastSettle(run: readonly PresentationState[], over: number): number[] {
  return heldPastFreeze(run, SETTLE_TICKS + over);
}

/** The release ticks whose word had its whole life to itself. */
function leftAlone(run: readonly PresentationState[]): readonly number[] {
  const life = calloutTicks();
  return releasesWhere(run, '', (view, _before, tick) => {
    if (!spoke(view)) return false;
    return run.slice(tick + 1, tick + life + 1).findIndex(spoke) === -1 && tick + life < run.length;
  }).ticks;
}

/** Graded windows on one side of the dot, `side` being the sign of the offset. */
function gradedSide(run: readonly PresentationState[], side: number): number {
  let count = 0;
  for (const view of run) {
    for (const ring of view.compass?.rings ?? []) {
      if (ring.tier === null) continue;
      if (side > 0 ? ring.offset > 0 : ring.offset <= 0) count++;
    }
  }
  return count;
}
