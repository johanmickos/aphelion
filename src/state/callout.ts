/**
 * The callout — the word a release earned, born at the dot that earned it.
 *
 * Spec [06 · §4](../../docs/spec/06-awards.md): *"the word, its points and its
 * colour arrive as one unit at the release point... the pop buys the glance;
 * leaving it behind sells the speed. Score meets attention where attention
 * already is — no band at the top of the screen."*
 *
 * ## Points for the make, words for the mastery
 *
 * Spec 06 §1's law, and the reason the vocabulary is exactly three: *"a word
 * that never repeats never becomes a signal, and a word for 'merely made it'
 * devalues every word above it."* So a **make** is carried here and speaks
 * nothing — the tier is on the view so a test can assert what was earned, and
 * the renderer draws no word for it. Its points are spec
 * [08](../../docs/spec/08-economy.md)'s and arrive with the economy in M4.
 *
 * ## Where the clock starts, after ADR-0012
 *
 * Spec 02's table dated the word from `T+90ms` — 20ms after a hitstop that no
 * longer exists — and its own notice rebases that to **`T+20ms`**, one tick
 * after the release. The word is deliberately *not* simultaneous with the
 * release: the release is the craft leaving and the word is the verdict on it,
 * and a verdict that arrives on the same frame as the act reads as part of the
 * act.
 *
 * ## The one place spec 02 and spec 06 could not both be right
 *
 * Spec 02 §2 ends the word at **T+510ms** and spec 06 §4 gives it a 120ms pop, a
 * *"~1.2s"* linger and a 400ms decay, which is **1 720ms** — and then cites spec
 * 02 for the 510. They were never consistent. The rebase notice rules which way
 * it resolves: *"every duration measured from the start of its own element is
 * untouched"*, and pop, linger and decay are exactly that, so **spec 06 §4's
 * durations stand and spec 02's end column moves to what they sum to.** The
 * reading that makes spec 00 §5's *"nothing persists past 600ms"* survive it is
 * spec 06 §4's own next line: the word is **world-anchored** after its pop, so
 * what happens to it after 600ms is that the world carries it away, and the
 * 600ms rule is about motion. The linger is on the bench, because that reading is
 * the author's to confirm.
 */
import { SCALE } from '../sim/units.ts';
import type { Tier } from '../sim/tier.ts';
import { cos, sin } from '../sim/trig.ts';
import { advance, fade, home, place, progress, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import { hueOf } from './identity.ts';
import type { CalloutView, RingView } from './types.ts';

/** How tall each tier's word is set — spec 06 §4's 15 / 18 / 21px, converted. */
const SIZE: Readonly<Record<Tier, number>> = {
  MAKE: 13 * SCALE,
  TRUE: 15 * SCALE,
  SHARP: 18 * SCALE,
  PERFECT: 21 * SCALE,
};

/** And how far each blooms — spec 06 §4's 5 / 8 / 12px, in the tier's own colour. */
const BLOOM: Readonly<Record<Tier, number>> = {
  MAKE: 0,
  TRUE: 5 * SCALE,
  SHARP: 8 * SCALE,
  PERFECT: 12 * SCALE,
};

/** Spec 06 §4's pop: **120ms** upward, one overshoot. */
export const POP_TICKS = ticksIn(120);

/** How far up it pops, in design units — spec 06 §4's ~30px, converted. */
export const POP_RISE = 30 * SCALE;

/**
 * How far off the dot it is born, in design units — spec 06 §4's 8–30px.
 *
 * The low end of the band, because the dot is the thing it is about: a word that
 * starts clear of its own mark has already stopped saying *this one*. The pop
 * takes it the rest of the way.
 */
export const BIRTH_OFFSET = 8 * SCALE;

/** Spec 06 §4's linger: **~1.2s** at full. */
export const LINGER_TICKS = ticksIn(1200);

/** And its decay: **400ms** to zero. */
export const CALLOUT_DECAY_TICKS = ticksIn(400);

/**
 * The whole life of one word, pop and linger and decay.
 *
 * **A function and not a constant**, because two of the three terms are on the
 * bench: a derived `const` is evaluated once at module load, so a slider that
 * moved the linger would move the linger and not the life, and the word would
 * start decaying before or after it was due. That is exactly the *"a bench that
 * lies is worse than no bench"* failure `test/bench.test.ts` exists to catch, and
 * it is cheaper to make the derivation live than to remember the rule.
 */
export function calloutTicks(): number {
  return POP_TICKS + LINGER_TICKS + CALLOUT_DECAY_TICKS;
}

/**
 * The word a release on this ring earned, placed at its dot.
 *
 * `null` for a miss, which spec 06 §5 gives **silence**: *"no word, no sting, no
 * confiscation. The grab that was not made is the feedback."*
 */
export function struck(ring: RingView | null, aboutX: number, aboutY: number): CalloutView | null {
  if (ring === null || ring.tier === null) return null;
  const life = place(calloutTicks());
  // The dot, on its own ring, about the body that was held — the same three
  // numbers the compass draws it from, so the word cannot land beside the mark
  // it is about.
  const bornX = aboutX + cos(ring.dot) * (ring.radius + BIRTH_OFFSET);
  const bornY = aboutY + sin(ring.dot) * (ring.radius + BIRTH_OFFSET);
  return shapeOf(ring, ring.tier, aboutX, aboutY, bornX, bornY, life);
}

/** The same word one tick on, or `null` once it is gone. */
export function linger(previous: CalloutView | null): CalloutView | null {
  if (previous === null) return null;
  const life = advance(previous.life);
  if (life === null) return null;
  return {
    ...previous,
    life,
    y: previous.bornY - POP_RISE * risen(life),
    strength: lit(life),
  };
}

function shapeOf(
  ring: RingView,
  tier: Tier,
  aboutX: number,
  aboutY: number,
  bornX: number,
  bornY: number,
  life: Decay,
): CalloutView {
  return {
    tier,
    body: ring.body,
    hue: hueOf(ring.body),
    x: bornX,
    y: bornY - POP_RISE * risen(life),
    bornX,
    bornY,
    aboutX,
    aboutY,
    radius: ring.radius,
    dot: ring.dot,
    halfWidth: ring.halfWidth,
    bloom: BLOOM[tier],
    size: SIZE[tier],
    life,
    strength: lit(life),
  };
}

/**
 * How far up the pop has carried it, from 0 to 1 — **passing rest once**.
 *
 * [`home`](./decay.ts) run the other way round: it is the same rebound every
 * other displacement in this game uses, and spec 06 §4 asks the pop for *"one
 * overshoot"* in the same words spec 02 §5 asks the punch for one. Screen `y`
 * grows downward, so the caller subtracts.
 */
function risen(life: Decay): number {
  if (life.age >= POP_TICKS) return 1;
  return 1 - home({ age: life.age, span: POP_TICKS });
}

/**
 * How lit it is: **full through the pop and the linger, then out over 400ms.**
 *
 * Spec 06 §4 gives three stretches and only the last one is a fade, which is spec
 * 00 §5's motion law on a longer clock — things arrive, and they leave slowly.
 */
function lit(life: Decay): number {
  const left = life.span - life.age;
  if (left > CALLOUT_DECAY_TICKS) return 1;
  return fade({ age: CALLOUT_DECAY_TICKS - left, span: CALLOUT_DECAY_TICKS });
}

/** How far through its whole life it is — the number a test says *at tick n* with. */
export function through(callout: CalloutView): number {
  return progress(callout.life);
}
