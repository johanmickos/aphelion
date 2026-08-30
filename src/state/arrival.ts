/**
 * The arrival — the word a tight capture earns, said at the point it was earned.
 *
 * `CONTEXT.md`: **arrival**. Ruled by the author on 2026-08-30: *"I want to add
 * quality keywords for good captures as well. A perfect capture is at the closest
 * approach, within some short distance of the planet surface... These are
 * invisible, which is explicitly OK, because the visual cue is really the ship's
 * proximity to the planet."*
 *
 * ## It is one rung, and that is spec 06 §1 kept rather than bent
 *
 * A release spends three words. A second event spending three more would double
 * how often each is heard, and §1's law is that *"a word that never repeats never
 * becomes a signal."* So an arrival either says something or says nothing:
 * [`arrivedTight`](../sim/tier.ts) is a boolean, and its band is measured to land
 * on **13%** of captures — between the release ladder's PERFECT at 6% and SHARP
 * at 16%.
 *
 * ## There is no instrument for it, deliberately
 *
 * The compass tells a player where a release will go, and there is no equivalent
 * here — no window to aim the dive at, no dot. That is the author's own ruling
 * and the reason is that the cue already exists: **the body's own light**. Spec
 * [00 · §3](../../docs/spec/00-tokens.md)'s wide faint halo grows with grip and
 * spec [04 · §2](../../docs/spec/04-bodies.md)'s tide swells with closing, so a
 * craft on its way in is already being told how close it is by the thing it is
 * approaching. A second reading of that in the instrument would be the *"ambient
 * glowing orbs"* the author took off the release.
 *
 * ## Where it is said, and when
 *
 * At the **freeze**, because that is the tick the closest approach becomes a
 * fact — before it the dive is still falling and after it the craft is on a
 * fixed orbit. And at the craft's own position on that tick, which **is** the
 * closest approach: the place that earned it, exactly as spec
 * [06 · §4](../../docs/spec/06-awards.md) puts a release's word at the dot that
 * earned it.
 *
 * ## Its own slot
 *
 * Ruled by the author (2026-08-30), against the alternative of sharing the
 * release's. The two are at different places — the body you arrived at, versus
 * the dot you left from — so they do not collide on screen, and sharing would
 * have let a freeze cut short a release word that was still lingering from the
 * previous swing. Spec 06 §4's *"one release, one word"* is unchanged: it is one
 * word **per event**, and there are now two kinds of event.
 */
import { SCALE } from '../sim/units.ts';
import { advance, fade, place, progress, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import { hueOf } from './identity.ts';
import type { ArrivalView } from './types.ts';

/**
 * What a tight arrival says, chosen by the body's own address.
 *
 * **Three words for one rung**, on the author's instruction: *"let's generate
 * 2-3 different words for that same rung."* One word said every time is the
 * thing §1 warns about from the other direction — it stops being heard — and
 * three keep it fresh without inventing a ladder nobody asked for.
 *
 * The brief is what they are chosen against: *"picture yourself driving your ship
 * and getting dangerously close, then slamming the brakes to get a perfect
 * slingshot. That's satisfying."* So they are about **nerve** rather than about
 * precision, which is where a first set went wrong — TRUE, SHARP and PERFECT
 * already own precision, and an arrival is not a more accurate release, it is a
 * braver one.
 *
 * **TIGHT** is the author's own. **NERVE** is what it took. **BRAZEN** is the
 * cheek of it. None collides: `CLEAN`, `SHAVED` and `DEADEYE` are retired
 * (spec 06's rulings), and *tightness* is on **depth**'s `_Avoid_` line as a name
 * for that quantity rather than as a word the game may say.
 *
 * **Chosen by address and not at random**, because a run must replay to the same
 * pictures (ADR-0004) and `src/state/` may not reach a clock or an RNG
 * (ADR-0014). The address is the one thing to hand that varies between
 * neighbouring bodies and is stable for any one of them, so a body says the same
 * thing every time it is arrived at well — which reads as the body having a
 * character rather than as the game shuffling.
 */
export const ARRIVAL_WORDS = ['TIGHT', 'NERVE', 'BRAZEN'] as const;

/** How tall the word is set, in design units — spec 06 §4's SHARP size. */
export const ARRIVAL_SIZE = 18 * SCALE;

/** How far it climbs over its life, in design units — the callout's own rise. */
export const ARRIVAL_RISE = 50 * SCALE;

/**
 * How long it lingers at full, in ticks.
 *
 * **Shorter than a release's 1.2s**, and deliberately: a release word is the
 * payday and is meant to be read and left behind, and an arrival is a remark made
 * in passing on the way into an orbit the player is about to spend a second and a
 * half flying. It also keeps the two from stacking up on screen through a fast
 * sequence of swings.
 */
export const ARRIVAL_LINGER_TICKS = ticksIn(600);

/** And its decay to nothing — spec 06 §4's 400ms, shared so the two words leave alike. */
export const ARRIVAL_DECAY_TICKS = ticksIn(400);

/** The whole life of one arrival word. */
export function arrivalTicks(): number {
  return ARRIVAL_LINGER_TICKS + ARRIVAL_DECAY_TICKS;
}

/**
 * The word a tight arrival earned, placed where the craft was when it froze.
 *
 * `null` for an arrival that was not tight enough, which is the silence spec 06
 * §5 gives a miss and for the same reason: the orbit it did get is the feedback.
 */
export function arrived(body: number, x: number, y: number): ArrivalView {
  return shapeOf(body, x, y, place(arrivalTicks()));
}

/** The same word one tick on, or `null` once it is gone. */
export function fadeArrival(previous: ArrivalView | null): ArrivalView | null {
  if (previous === null) return null;
  const life = advance(previous.life);
  if (life === null) return null;
  return { ...previous, life, y: previous.bornY - ARRIVAL_RISE * risen(life), strength: lit(life) };
}

function shapeOf(body: number, x: number, y: number, life: Decay): ArrivalView {
  return {
    word: ARRIVAL_WORDS[body % ARRIVAL_WORDS.length]!,
    body,
    hue: hueOf(body),
    x,
    y: y - ARRIVAL_RISE * risen(life),
    bornX: x,
    bornY: y,
    size: ARRIVAL_SIZE,
    life,
    strength: lit(life),
  };
}

/**
 * How far up it has climbed, from 0 to 1 — the callout's own throw.
 *
 * `1 − (1 − u)²`: fastest at birth, slowest at the end, monotone. One curve for
 * both words, because spec 00 §5's motion tokens are one grammar and a second
 * rise shape would be a second grammar.
 */
function risen(life: Decay): number {
  const left = 1 - progress(life);
  return 1 - left * left;
}

/** Full through the linger, then out over 400ms — again the callout's own. */
function lit(life: Decay): number {
  const left = life.span - life.age;
  if (left > ARRIVAL_DECAY_TICKS) return 1;
  return fade({ age: ARRIVAL_DECAY_TICKS - left, span: ARRIVAL_DECAY_TICKS });
}
