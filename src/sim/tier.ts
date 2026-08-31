/**
 * How good a release was — `CONTEXT.md`'s **tier**, and spec
 * [06 · §2](../../docs/spec/06-awards.md)'s four zones.
 *
 * **Points for the make. Words for the mastery.** The baseline tier speaks in
 * points alone, because *"a word for 'merely made it' devalues every word above
 * it"*, and the vocabulary above it is exactly three.
 *
 * ## It is a pure function of two numbers, and that is the acceptance
 *
 * `d` is how far the release fell from the **dot** and `W` is the **window**'s
 * width, both in radians and both facts about the geometry
 * ([`compass.ts`](./compass.ts)). Spec 06's acceptance asks that grading *"is a
 * pure function of `(d, W)` and imports nothing from the economy"* — so this
 * file has no multiplier in it. Spec 06 §2 lists them, spec
 * [08](../../docs/spec/08-economy.md) owns the arithmetic, and M4 spends them;
 * deleting the economy (ZEN) has to leave the tier, the word and the colour
 * exactly as they are.
 *
 * ## The zones scale with the window, and the floor is why
 *
 * A PERFECT on a needle-thin arc is a different feat than on a barn door, and
 * *"the arc's width already said so"* — so every zone is a fraction of `W` and
 * difficulty prices its own words with nothing to look up. The one absolute is
 * the **1.5° floor** under PERFECT, which stops the top word becoming unhittable
 * on the narrowest windows: at `W = 15°` it binds and the zone is 1.5°; at
 * `W = 40°` it does not and the zone is 3.2°. Both are spec 06's own worked
 * examples and both are tests.
 */

/**
 * The grade of one release. `null` is a **miss** and is deliberately not a tier:
 * spec 06 §5 gives it silence, and spec 06 §3 rules that it changes no streak,
 * because it was never a graded release at all.
 */
export type Tier = 'MAKE' | 'TRUE' | 'SHARP' | 'PERFECT';

/** Spec 06 §2's zones, as fractions of the window's full width `W`. */
export const TRUE_ZONE = 0.3;
export const SHARP_ZONE = 0.15;
export const PERFECT_ZONE = 0.08;

/**
 * The floor under the PERFECT zone — spec 06 §2's 1.5°, in radians.
 *
 * The only number in this file that is not a ratio, and the only one that has to
 * be: a fraction of a narrow enough window is a target smaller than one tick of
 * angular travel, and a word nobody can earn is a word that stops meaning
 * anything.
 */
export const PERFECT_FLOOR = (1.5 * Math.PI) / 180;

/**
 * How close a dive's closest approach has to come to the body's **floor** to be
 * graded, in design units (`CONTEXT.md`: **arrival**).
 *
 * **A distance and not a ratio, and that is measured rather than preferred.**
 * The obvious candidate was **depth**, which already exists and is what the boost
 * is paid on — and it cannot grade an arrival, because it **saturates**: over 493
 * captures its p50 is exactly **1.00**, so more than half of all captures would
 * earn the top word. Spec [06 · §1](../../docs/spec/06-awards.md)'s whole law is
 * that *"a word that never repeats never becomes a signal"*, and a word half of
 * everything earns is not one.
 *
 * **On its own this distance saturates too**, which is why it is only half the
 * test — see [`arrivedTight`](#arrivedtight). 25 is the author's own *"some short
 * distance"*, ruled 2026-08-30, and it is the half that asks *did you get there*.
 */
export const ARRIVAL_BAND = 25;

/**
 * How sideways the approach has to have been, as the sine of its angle — the
 * other half of the test, and the half that makes the word mean something.
 *
 * **0.6 is 37° off head-on**, and it is ruled by an example rather than derived.
 * The derived candidate was **0.7071, exactly 45°** — the angle where a craft is
 * closing on a body as fast sideways as inward, which needs no constant at all
 * and is the honest place to put a line between *falling at it* and *going past
 * it*. It was measured and then rejected, because the author flew a capture they
 * called *"really tight"* and it came in at **0.708**. A threshold the author's
 * own example clears by one part in a thousand is a coin toss, and it would have
 * refused the next one at 44°.
 *
 * So the line moved out to where that capture sits **8° inside it** rather than
 * on it. What it costs is a derivation; what it buys is that the author's
 * labelled example is unambiguously in, which ADR-0004 makes the higher
 * authority — *the author is the feel gate*. The frequency it lands on is the
 * one this word was aimed at from the start: **13%** of the author's own
 * captures, against the release ladder's SHARP at 16% and PERFECT at 6%.
 */
export const ARRIVAL_SIDEWAYS = 0.6;

/**
 * The approach speed the sideways requirement is stated at, in design units per
 * second — **the median of real play**, and it is a measurement rather than a
 * round number.
 *
 * Over the 105 captures in the author's dispatches the entry speed's p50 is 737.
 * A capture arriving at exactly that is asked for [`ARRIVAL_SIDEWAYS`](#) and
 * nothing is forgiven; below it nothing is forgiven either, because a slow
 * approach has all the time in the world to get sideways and being *slower* than
 * typical is not a difficulty.
 */
export const ARRIVAL_REF_SPEED = 737;

/**
 * How much of the sideways requirement a doubled approach speed forgives.
 *
 * At 0.25 a craft arriving at twice [`ARRIVAL_REF_SPEED`](#) is asked for 0.45
 * instead of 0.70. The slope is what holds the rate still while the *set* moves —
 * see [`sidewaysNeeded`](#) for the pair it was chosen with, and note that moving
 * either number alone changes how many words are said and not only which.
 */
export const ARRIVAL_SPEED_RELIEF = 0.25;

/**
 * Whether a dive earned a word — `CONTEXT.md`'s **arrival**.
 *
 * One rung and no ladder, which is the author's ruling and spec 06 §1's law kept
 * rather than bent: a release already spends three words, and a second event
 * spending three more would double how often each is heard.
 *
 * ## It asks two things, and the second one is the whole design
 *
 * `periapsis - floor <= ARRIVAL_BAND` is *"did you get to the surface"*, and it
 * was shipped alone for a day. It does not work, and the reason is worth keeping:
 * **the floor is a guarantee, so a dive aimed at the body reaches it for free.**
 * Measured over 374 captures, 68% land exactly on the floor, and no threshold
 * from 4 to 80 units picks out fewer than two thirds of them. The author flew it
 * and said so — *"some of the captures were too easily giving away the word"* —
 * and the run they flew it on is the proof: of fifteen captures the word went to
 * five whose approach angles were 0.001, 0.04, 0.08, 0.13 and 0.23 of a right
 * angle. Every one of those was pointed at the body. They did not arrive tightly.
 * They fell in, and the floor caught them, which is what the floor is for.
 *
 * `aim >= ARRIVAL_SIDEWAYS` is the other half: *"did the body have to be caught
 * rather than hit"*. **Aim** is the sine of the angle the press was made at
 * ([`dive.ts`](./dive.ts)) — 0 straight at the body, 1 exactly past it — and
 * because a coasting craft feels no gravity it is the true angle of a straight
 * line and not an estimate of one.
 *
 * ## The denominator was got wrong once, and the author found it in one run
 *
 * The first build compared the impact parameter to the floor: *"the line you
 * were on would have missed the surface, and you got to it anyway."* It reads
 * beautifully and it is broken, because **the impact parameter cannot exceed the
 * radius it is measured at.** A press made 16 units above a floor of 159 has a
 * ceiling of 1.10 floors of aim however perfectly it is flown, so the test
 * quietly became unreachable for exactly the presses that deserve it most — the
 * closest and most committed ones. The author flew one, at 16 units of room and
 * dead on the floor, and reported it: *"my last capture felt really tight and
 * should've been awarded a word."*
 *
 * Dividing by the radius as well as the speed fixes it at the root rather than by
 * widening anything: an **angle** is scale-free, so a press made a hair above the
 * surface is graded on the same 0-to-1 as one made half a screen out.
 *
 * ## What it selects
 *
 * **13% of the author's own 71 captures**, against 75% for the closeness alone.
 * The angle does not saturate the way every other candidate did: it runs p05
 * 0.04, p50 0.43, p95 0.98.
 *
 * ⚠ 71 real captures is a thin cohort. **The headless pilot cannot widen it** —
 * `test/sim/run.ts` says in its own prose that aim is the one thing it cannot
 * reproduce, and the numbers agree: over 958 pilot captures the closeness-plus-
 * aim test jumps from 37% to 2% between two neighbouring thresholds, which is a
 * fixture and not a distribution. This wants more of the author's flying.
 *
 * It takes three numbers rather than a body, so it is a pure function exactly as
 * [`tierFor`](#tierfor) is — spec 06's acceptance asks grading to import nothing,
 * and the smallest signature is the strongest form of that.
 */
export function arrivedTight(
  periapsis: number,
  floor: number,
  aim: number,
  entrySpeed: number,
): boolean {
  return periapsis - floor <= ARRIVAL_BAND && aim >= sidewaysNeeded(entrySpeed);
}

/**
 * How sideways an approach has to be to count as tight, at the speed it came in
 * at — **the faster it arrived, the less is asked of it.**
 *
 * ## The author's idea, and the measurement agrees with it
 *
 * *"Maybe we can incorporate the velocity into the evaluation logic, since coming
 * in fast makes it harder to capture the lowest approach?"* (author, 2026-08-31,
 * after a capture they felt had earned a word and did not get one).
 *
 * Spec [01 · §5a](../../docs/spec/01-swing.md) appears to say otherwise — *"the
 * dive normalises speed"*, with periapsis pinned within 5% of the floor across a
 * four-fold range of approach speed — but that sweep ran over 60 – 260 prototype
 * units and this game is now flown at two to four times it. Measured over the
 * **105 captures** in the author's own dispatches:
 *
 * | | Slower half | Faster half |
 * |---|---|---|
 * | Entry speed, p50 | 646 | 1 029 |
 * | Room above the floor, p50 | **1.3** | **25.0** |
 * | Earned the word | 19% | 8% |
 *
 * Rank-correlated, room against entry speed: **rho 0.31** — real and positive.
 * Pearson misses it at 0.07 because the distribution is skewed (room runs p05 0,
 * p50 3, p95 543) and a handful of fly-pasts swamp the mean, which is why this is
 * measured on ranks. And against **aim** the same speed is rho −0.07, so it is
 * genuinely a third axis rather than a second reading of the first.
 *
 * ## The ruled threshold is not touched, and the relief only ever adds
 *
 * The author refused a looser gate once already — *"some of the captures were too
 * easily giving away the word"* — and [`ARRIVAL_SIDEWAYS`](#) is where that ruling
 * left it. **It does not move here.** What this adds is relief on top of it, so a
 * capture that would have earned the word still earns it and nothing can lose it.
 *
 * Over the same 105 captures that costs **two**, 14 → 16, 13% → 15%. Both are
 * fast, both are within three units of the floor, and both missed the gate by
 * 0.03 of aim:
 *
 * | Entry speed | Room above the floor | Aim |
 * |---|---|---|
 * | 1 051 | 1.7 | 0.57 |
 * | **1 367** | **2.9** | **0.57** — the capture the author flagged |
 *
 * The median entry speed of a capture that earns the word goes **584 → 635**. A
 * raised base would have held the count exactly still by taking the word off a
 * slow capture, and it is not taken: at 0.70 the gate would sit 0.008 below the
 * author's own benchmark tight capture at aim 0.708, against the 0.1 of margin
 * `test/sim/tier.test.ts` holds it to. Two words in a hundred captures is the
 * cheaper price.
 *
 * ⚠ **105 captures is still a thin cohort**, and it is the same thinness
 * [`ARRIVAL_SIDEWAYS`](#) records: the headless pilot cannot widen it, because aim
 * is the one input it cannot reproduce. Both numbers below are on the bench.
 */
function sidewaysNeeded(entrySpeed: number): number {
  const over = entrySpeed / ARRIVAL_REF_SPEED - 1;
  return ARRIVAL_SIDEWAYS - ARRIVAL_SPEED_RELIEF * Math.max(0, over);
}

/**
 * The tier of a release that fell `offset` from the dot of a window `width`
 * wide, or `null` if it fell outside it.
 *
 * `offset` is taken as given rather than made absolute here, so that a caller
 * passing a signed angle gets an answer about the wrong thing loudly rather than
 * quietly — the sign of an aim error is a fact the compass draws and the grade
 * does not use.
 */
export function tierFor(offset: number, width: number): Tier | null {
  const d = Math.abs(offset);
  if (width <= 0 || d > width / 2) return null;
  if (d <= Math.max(PERFECT_ZONE * width, PERFECT_FLOOR)) return 'PERFECT';
  if (d <= SHARP_ZONE * width) return 'SHARP';
  if (d <= TRUE_ZONE * width) return 'TRUE';
  return 'MAKE';
}

/**
 * How lined up a release is, from 1 at the dot to 0 at ninety degrees off.
 *
 * Not a tier and not a substitute for one: it is what the compass **heats** on,
 * because spec [00 · §6](../../docs/spec/00-tokens.md) has a window go E1 → E2
 * *"as the hand closes on the dot"* — continuously, while the tier is four steps.
 * Two readings of one geometry, and neither is derived from the other.
 *
 * **It ramps over a quarter turn rather than over the window**, and that is the
 * whole of the difference between an instrument you can read ahead and one you
 * cannot. Measured against the window, a window is dark until the hand is inside
 * it and then it is too late — *"when I hold an orbit and spin around, the
 * compass windows pass too quickly... the original starts glowing before I touch
 * them, which helps me predict when to click"* (author, 2026-08-29). This is the
 * prototype's `alignment`, and its own comment is the reason it is one function:
 * *"the single definition of 'lined up' in the game. The compass brightens on it,
 * the ship's halo fades in on it, and the score pays for it — so it is defined
 * once. Reporting the same quantity two different ways is what made the
 * prototype's glow snap on while its wedge brightened smoothly."*
 */
export function alignmentOf(offset: number): number {
  return Math.max(0, 1 - Math.abs(offset) / (Math.PI / 2));
}

/**
 * How much of its speed the floor has to take before the collision is worth
 * saying out loud — `CONTEXT.md`'s **knock**, as a share.
 *
 * **0.15 is derived from the arrival and not chosen for its own sake.** The two
 * words read the same geometry from opposite ends: a dive that comes in sideways
 * and commits earns [`arrivedTight`](#arrivedtight), and a dive pointed at the
 * body slams into the floor, because the floor keeps the tangential half of the
 * velocity and removes the radial half. Measured over 77 real captures, the
 * share the floor takes runs against the aim at **r = −0.44**.
 *
 * That relationship is what fixes this number. **The two words must never
 * contradict each other** — congratulating a capture and calling it a crash in
 * the same breath is worse than saying nothing — so the line goes above the
 * hardest knock any *tight* arrival takes, which is measured at **12.9%** (the
 * author's own *"really tight"* capture, which loses 13% of its speed to the
 * floor and still earns its word). 0.15 clears that with margin and selects
 * **4% of captures**, all of them plunges: the three that qualify came in at aim
 * 0.02, 0.05 and 0.36.
 *
 * The floor is touched at all on only 14% of captures, and most of those cost
 * nothing — the share is p25 0.00, p50 0.03, and then jumps to 0.13 and above
 * for the four hardest. It is a tail, not a spread, which is what a word about
 * collisions wants.
 */
export const KNOCK_BAND = 0.15;

/**
 * Whether the floor caught the craft hard enough to say so.
 *
 * A pure function of one number, and the same acceptance as everything else in
 * this file: grading imports nothing from the economy.
 */
export function struckHard(knock: number): boolean {
  return knock >= KNOCK_BAND;
}
