/**
 * The knock — the word a hard landing on the **floor** earns, said where it hit.
 *
 * `CONTEXT.md`: **knock**. Asked for by the author on 2026-08-30, after flying a
 * capture that read as a crash: *"I caught a planet at the very last second,
 * abruptly changing angle/course to circularize. For moments like these, with
 * strong kinks in the capture/arrival path, I'd like to pop up thematic pink text
 * saying things like 'Bonk!' 'Oof!' etc. to indicate a big collision."*
 *
 * ## It is not a new event, it is an old one finally named
 *
 * There was no need to invent anything to detect. Spec
 * [01 · §10](../../docs/spec/01-swing.md)'s floor has caught the craft since M1,
 * keeping the tangential half of the velocity and removing the radial half, and
 * that removal **is** the kink the author saw. Measured on the run they flagged,
 * the tick before that freeze turns the craft **45.7°** and takes **290** of its
 * speed — three times sharper than anything else in the run, and plainly a
 * collision. All this file does is say so.
 *
 * ## It is the arrival's opposite end, and that is what fixes its threshold
 *
 * The floor takes the radial half of the velocity, so how much it takes is a
 * reading of **aim** — a craft that came in sideways loses almost nothing, one
 * pointed at the body loses nearly everything. Measured over 77 real captures the
 * two run together at **r = −0.44**. So the same geometry that earns an
 * [`arrival`](./arrival.ts) earns silence here, and the plunges that used to
 * steal the arrival's word before it was graded on aim are exactly the ones that
 * get this one.
 *
 * That symmetry is load-bearing rather than decorative. **The two words must
 * never contradict each other**, and since 2026-09-01 that is a property of
 * [`struckHard`](../sim/tier.ts) rather than of a threshold: it asks for an aim
 * *below* the line the arrival asks it to be at or above, so the predicate
 * granting one word denies the other. The correlation above is only −0.44, and a
 * threshold resting on it turned out to rest on nothing — the hardest floor
 * landing in the author's corpus is a capture at aim 0.994.
 *
 * ## Pink, and pink is already spoken for
 *
 * Spec [00 · §1](../../docs/spec/00-tokens.md) gives **ION** a monopoly — *"risk,
 * and nothing else in the world glows pink"* — and a collision is risk arriving.
 * So the author's *"thematic pink"* needs no new token and takes none: this is
 * the one word in the game that is not drawn in the body's own hue, because it is
 * not about the body. It is about what the floor had to do.
 */
import { SCALE } from '../sim/units.ts';
import { advance, fade, place, progress, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import type { KnockView } from './types.ts';

/**
 * What a hard landing says.
 *
 * **BONK** and **OOF** are the author's own, quoted above. **THUD** is the third,
 * chosen to match rather than to add: all three are the noise, none is a comment
 * on the player.
 *
 * They are a deliberate break from spec [06 · §8](../../docs/spec/06-awards.md)'s
 * register — *"state what happened, name the place, one true number, never scold,
 * never joke at the player"* — and the break is the author's, asked for by name.
 * §8's rule is there so the game never gets clever at the player's expense, and
 * onomatopoeia does not: it is the sound the world made, not a remark about the
 * pilot. `OOF` is the closest to the line and stays because the author wrote it.
 *
 * **Chosen by the tick it happened on**, not by the body. The arrival is a
 * property of the body — a body says the same thing every time it is arrived at
 * well, which reads as character. A knock is a property of the *moment*, and two
 * knocks on the same body should not be the same noise. It is still a pure
 * function of the run, so a replay says the same words (ADR-0004), and it reaches
 * no clock and no RNG (ADR-0014).
 */
export const KNOCK_WORDS = ['BONK', 'OOF', 'THUD'] as const;

/**
 * How tall it is set, in design units — **larger than either graded word**.
 *
 * The release ladder and the arrival are set at 18; this is 22. They are earned
 * and this is not: it is the world telling the player what just happened to them,
 * and it is not competing for the same attention because it is never lit at the
 * same time as an arrival (see [`KNOCK_BAND`](../sim/tier.ts)).
 */
export const KNOCK_SIZE = 22 * SCALE;

/** How far it climbs over its life — the callout's own rise, shared. */
export const KNOCK_RISE = 50 * SCALE;

/**
 * How long it holds before fading, in ticks.
 *
 * **Shorter than the arrival's 600ms**, which is itself shorter than a release's
 * 1.2s. The ladder is deliberate: a release word is the payday and is meant to be
 * read, an arrival is a remark in passing, and a knock is an interjection. It is
 * also said at the bottom of a dive, one tick before the craft starts an orbit
 * the player needs to be reading — so it gets out of the way.
 */
export const KNOCK_LINGER_TICKS = ticksIn(400);

/** And its decay to nothing — spec 06 §4's 400ms, so every word in the game leaves alike. */
export const KNOCK_DECAY_TICKS = ticksIn(400);

/** The whole life of one knock. */
export function knockTicks(): number {
  return KNOCK_LINGER_TICKS + KNOCK_DECAY_TICKS;
}

/**
 * The word a hard landing earned, placed where the craft hit.
 *
 * Not `struck`, which [`callout.ts`](./callout.ts) already owns for the release's
 * word — one verb, one meaning, and two of them would read as the same event.
 */
export function knocked(tick: number, x: number, y: number): KnockView {
  return shapeOf(tick, x, y, place(knockTicks()));
}

/** The same word one tick on, or `null` once it is gone. */
export function fadeKnock(previous: KnockView | null): KnockView | null {
  if (previous === null) return null;
  const life = advance(previous.life);
  if (life === null) return null;
  return { ...previous, life, y: previous.bornY - KNOCK_RISE * risen(life), strength: lit(life) };
}

function shapeOf(tick: number, x: number, y: number, life: Decay): KnockView {
  return {
    word: KNOCK_WORDS[tick % KNOCK_WORDS.length]!,
    x,
    y: y - KNOCK_RISE * risen(life),
    bornX: x,
    bornY: y,
    size: KNOCK_SIZE,
    life,
    strength: lit(life),
  };
}

/** The callout's own throw: fastest at birth, slowest at the end, monotone. */
function risen(life: Decay): number {
  const left = 1 - progress(life);
  return 1 - left * left;
}

/** Full through the linger, then out over 400ms — again the callout's own. */
function lit(life: Decay): number {
  const left = life.span - life.age;
  if (left > KNOCK_DECAY_TICKS) return 1;
  return fade({ age: KNOCK_DECAY_TICKS - left, span: KNOCK_DECAY_TICKS });
}
