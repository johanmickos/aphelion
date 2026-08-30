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
import { advance, fade, place, progress, ticksIn } from './decay.ts';
import type { Decay } from './decay.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH, THUMB_LINE } from './design.ts';
import { hueOf } from './identity.ts';
import type { CalloutView, CameraView, RingView } from './types.ts';

/** How tall each tier's word is set — spec 06 §4's 15 / 18 / 21px, converted. */
const SIZE: Readonly<Record<Tier, number>> = {
  MAKE: 13 * SCALE,
  TRUE: 15 * SCALE,
  SHARP: 18 * SCALE,
  PERFECT: 21 * SCALE,
};

/**
 * How far the word is kept clear of anything it is drawn over.
 *
 * **Spec 06 §4's per-tier bloom is withdrawn** (author, 2026-08-29): *"the blur
 * circle behind the popup text isn't doing us any favours, it's blurring the
 * legibility. We should remove it."* A glow behind type competes with the type.
 *
 * What replaces it is what the prototype uses for the same job and calls by its
 * own name — a **rim**: a thin dark stroke around the letters, *"the dark rim
 * that keeps text legible over planets and stars"*, drawn in VOID rather than
 * black because *"a heavy black outline under pale text reads as a sticker."*
 * That is the renderer's, being paint. What is here is the space it needs, so
 * that spec 00 §7's *"nothing the player reads is drawn outside"* is still
 * assertable without a canvas.
 */
const MARGIN = 2 * SCALE;

/**
 * Which tiers say a word at all — spec 06 §2's *"points only"* for a make.
 *
 * It is here rather than only in the renderer because it decides whether the
 * word is **held inside the picture**: a make draws no type, so there is nothing
 * to keep on the page and nothing to slide.
 */
export const SPEAKS: Readonly<Record<Tier, boolean>> = {
  MAKE: false,
  TRUE: true,
  SHARP: true,
  PERFECT: true,
};

/**
 * How far the word climbs over its whole life, in design units.
 *
 * **Spec 06 §4's *"120ms upward, ~30px, one overshoot"* is superseded**, on the
 * author's own instruction to go and look: *"I think the popups should pop
 * upwards a bit more, mimicking the physics feeling that we have in the original
 * prototype"* (2026-08-29). What the prototype does is not a pop — it is a
 * **rise across the whole life**, decelerating, and its own comment says why:
 * *"most of the travel happens early, so the popup leaves the ship promptly and
 * then hangs where it can be read."*
 *
 * So the word is thrown rather than popped: it climbs fastest at the instant it
 * is born, slows all the way, and never comes back down. That is the physics
 * feeling — an overshoot is a spring, and this is a throw.
 *
 * Thirty-four prototype units, converted at three design units to one
 * (ADR-0010), against the ~30 board px spec 06 §4 asked for. Carried as a
 * **behaviour** and not as a mechanism (ADR-0013): what crosses is *how far it
 * gets and on what curve*, both of which a test can see.
 */
export const POP_RISE = 34 * SCALE;

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
 * How long the **window** that was taken stays lit — spec
 * [02 · §6](../../docs/spec/02-release.md)'s *"the taken window stays lit and
 * decays behind the craft over 420ms."*
 *
 * **A different clock from the word's, and that was a bug for a day.** They
 * arrive together and spec 06 §4 composes them as one unit, so the window was
 * built on the word's own `strength` — which is flat through a 1.2s linger. The
 * arc therefore hung on the screen for **1 720ms against a spec'd 420**, four
 * times over, long after the rest of the instrument had gone. Reported as
 * *"an interesting behavior where the planet's compass window stays after the
 * rest of the compass disappears"* (author, 2026-08-29).
 *
 * The two are one unit in **where** they are and not in **how long** they last:
 * the word is the verdict and is meant to be read and left behind, and the arc
 * is the last of the instrument and goes with the instrument.
 */
export const TAKEN_WINDOW_TICKS = ticksIn(420);

/**
 * The whole life of one word: it lingers, then it decays, and it is climbing
 * throughout.
 *
 * **A function and not a constant**, because two of the three terms are on the
 * bench: a derived `const` is evaluated once at module load, so a slider that
 * moved the linger would move the linger and not the life, and the word would
 * start decaying before or after it was due. That is exactly the *"a bench that
 * lies is worse than no bench"* failure `test/bench.test.ts` exists to catch, and
 * it is cheaper to make the derivation live than to remember the rule.
 */
export function calloutTicks(): number {
  return LINGER_TICKS + CALLOUT_DECAY_TICKS;
}

/**
 * How wide one character of the word is, as a fraction of its own size.
 *
 * **A bound and not a measurement**, and it is deliberately generous. The word is
 * set in Archivo 800 caps tracked 0.1em (spec 06 §4), whose advances run about
 * 0.68 of the size, and the tracking adds a tenth — so 0.8 is above every
 * character the vocabulary uses. It is here rather than in the renderer because
 * spec [00 · §7](../../docs/spec/00-tokens.md)'s rule is about **where a readable
 * thing is**, which is geometry and has to be assertable without a canvas; a
 * measured advance would be paint, and would make the rule a thing only a browser
 * could check.
 *
 * Being an over-estimate is the safe direction: the word sits a little further in
 * than it strictly needs to, and never a pixel further out.
 */
const CHARACTER_WIDTH = 0.8;

/** The longest word in the vocabulary — spec 06 §2's three, and PERFECT is seven. */
const LONGEST_WORD = 7;

/** And how tall a line of caps is, as a fraction of its size. */
const CAP_HEIGHT = 0.75;

/**
 * The word, slid back inside the design space if it would otherwise be cut.
 *
 * Spec [00 · §7](../../docs/spec/00-tokens.md) is absolute: *"nothing the player
 * reads is drawn outside it, ever"*, and *"the compass, the masthead and every
 * award live above"* the thumb line. Built without this, a word born at a dot
 * near the edge of the picture was cut in half — *"let's make sure any text we
 * render shows fully on the page. Some of the edge award text was getting cut
 * off"* (author, 2026-08-29).
 *
 * **It stays world-anchored**, which is spec 06 §4's own word for it: what moves
 * the word is the camera, and this only bites on the ticks it would otherwise be
 * off the page. A word born in the middle of the picture is never touched by it
 * and drifts past exactly as before.
 */
function insideThePicture(
  x: number,
  y: number,
  size: number,
  bloom: number,
  speaks: boolean,
  camera: CameraView,
): { x: number; y: number } {
  if (!speaks) return { x, y };
  const halfWide = (LONGEST_WORD * CHARACTER_WIDTH * size) / 2 + bloom;
  const halfTall = (CAP_HEIGHT * size) / 2 + bloom;
  const left = camera.x - DESIGN_WIDTH / 2 + halfWide;
  const right = camera.x + DESIGN_WIDTH / 2 - halfWide;
  const top = camera.y - DESIGN_HEIGHT / 2 + halfTall;
  // The thumb line and not the foot of the design space: nothing readable lives
  // below it, ever, and spec 00 §7 names awards among the things that do not.
  const bottom = camera.y - DESIGN_HEIGHT / 2 + THUMB_LINE - halfTall;
  return {
    x: left > right ? camera.x : Math.min(Math.max(x, left), right),
    y: top > bottom ? camera.y : Math.min(Math.max(y, top), bottom),
  };
}

/**
 * The word a release on this ring earned, placed at its dot.
 *
 * `null` for a miss, which spec 06 §5 gives **silence**: *"no word, no sting, no
 * confiscation. The grab that was not made is the feedback."*
 */
export function struck(
  ring: RingView | null,
  aboutX: number,
  aboutY: number,
  camera: CameraView,
): CalloutView | null {
  if (ring === null || ring.tier === null) return null;
  const life = place(calloutTicks());
  // The dot, on its own ring, about the body that was held — the same three
  // numbers the compass draws it from, so the word cannot land beside the mark
  // it is about.
  const bornX = aboutX + cos(ring.dot) * (ring.radius + BIRTH_OFFSET);
  const bornY = aboutY + sin(ring.dot) * (ring.radius + BIRTH_OFFSET);
  return shapeOf(ring, ring.tier, aboutX, aboutY, bornX, bornY, life, camera);
}

/** The same word one tick on, or `null` once it is gone. */
export function linger(previous: CalloutView | null, camera: CameraView): CalloutView | null {
  if (previous === null) return null;
  const life = advance(previous.life);
  if (life === null) return null;
  const held = insideThePicture(
    previous.bornX,
    previous.bornY - POP_RISE * risen(life),
    previous.size,
    previous.bloom,
    SPEAKS[previous.tier],
    camera,
  );
  return {
    ...previous,
    life,
    x: held.x,
    y: held.y,
    strength: lit(life),
    windowStrength: windowLit(life),
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
  camera: CameraView,
): CalloutView {
  const held = insideThePicture(
    bornX,
    bornY - POP_RISE * risen(life),
    SIZE[tier],
    MARGIN,
    SPEAKS[tier],
    camera,
  );
  return {
    tier,
    body: ring.body,
    hue: hueOf(ring.body),
    x: held.x,
    y: held.y,
    bornX,
    bornY,
    aboutX,
    aboutY,
    radius: ring.radius,
    dot: ring.dot,
    halfWidth: ring.halfWidth,
    bloom: MARGIN,
    size: SIZE[tier],
    life,
    strength: lit(life),
    windowStrength: windowLit(life),
  };
}

/**
 * How far up it has climbed, from 0 to 1 — **decelerating, and never coming
 * back**.
 *
 * `1 − (1 − u)²`: fastest at birth, slowest at the end, and monotone the whole
 * way. It is the prototype's own curve for the same element, carried for the
 * behaviour rather than the mechanism — most of the travel happens early, so the
 * word clears the thing it is about while the player is still looking at it, and
 * then hangs where it can be read.
 *
 * **It is not [`home`](./decay.ts)**, and that is the difference the author was
 * describing. `home` passes rest and comes back, which is a spring; this is a
 * throw. Screen `y` grows downward, so the caller subtracts.
 */
function risen(life: Decay): number {
  const left = 1 - progress(life);
  return 1 - left * left;
}

/**
 * How lit the taken **window** is — out over spec 02 §6's 420ms, on its own
 * clock and not on the word's.
 */
function windowLit(life: Decay): number {
  if (life.age >= TAKEN_WINDOW_TICKS) return 0;
  return fade({ age: life.age, span: TAKEN_WINDOW_TICKS });
}

/**
 * How lit the **word** is: **full through the pop and the linger, then out over
 * 400ms.**
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
