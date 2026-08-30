/**
 * The rungs — the field as a medium rather than a backdrop.
 *
 * `CONTEXT.md`: a **rung** is a stratum hung across the world perpendicular to
 * intended travel, marking one unit of altitude. Spec
 * [05 · §1](../../docs/spec/05-field.md): *"the player climbs through a medium,
 * not past a backdrop"* — a ladder, not a floor. They **bow** toward every mass
 * and part around the craft in a **wake** that relaxes behind it, so speed,
 * gravity and the craft's own passage are all read off one system.
 *
 * ## Which layer this is, and the ADRs that answer it
 *
 * [The starfield](../render/starfield.ts) is renderer-only and its header says
 * why: a star is fixed at construction and only the camera moves it, so putting
 * several hundred points through `derive` once a tick would pay
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)'s
 * price for something that does not change. **A rung is not like that**, and the
 * three parts of it answer differently.
 *
 * **The wake is presentation state, and ADR-0015 names it by name.** Its opening
 * paragraph lists *"spec 05 §3 parts the rungs around the craft and relaxes them
 * over ~400ms"* among the things that made the layer a recurrence. A rung the
 * craft has passed is still displaced and is on its way back, which is a function
 * of this tick **and what was already on screen** — the definition of a decay.
 * Nothing else in this file remembers anything.
 *
 * **The geometry is pure, and it lives here rather than in the renderer for two
 * reasons.** [AGENTS.md](../../AGENTS.md) §4 asks for observables rather than
 * internals, and *"the bow at this point is 23 design units"* is a sentence a
 * test should be able to make without a canvas — `test/state/rungs.test.ts` makes
 * spec 05's whole acceptance that way. And the wake's seeding below needs the
 * same falloff the drawing does, so one of the two layers was going to import it;
 * `src/render/` may import `src/state/` and never the reverse, so it lives on
 * this side and the renderer is handed it.
 *
 * **Nothing here is simulation.** No rung changes a tick, `SIM_VERSION` does not
 * move, and `test/sim/version.test.ts` is untouched — which is that file's own
 * *picture, not flight* case. What the simulation gained is
 * [`METRE`](../sim/units.ts), a unit, used by nothing that runs.
 *
 * **What the renderer keeps is sampling and paint.** How many points a rung is
 * drawn with is a resolution decision and belongs with the pixels; presentation
 * state would be inventing a drawing at a fixed density and handing it over.
 *
 * ## The numbers are the board's, carried at `BOARD_PIXEL`
 *
 * Direction 05's live component is the only place in the project where a rung is
 * drawn, and both formulas below are its own, converted the way every other board
 * number in this repo is (`design.ts`). The conversion is not a multiplication by
 * three throughout, and that is the trap [`starfield.ts`](../render/starfield.ts)
 * fell into: `bow`'s numerator is divided by a length to produce a length, so it
 * is an **area** and scales by `BOARD_PIXEL²`. Each constant below says which it
 * is.
 */
import { exp, magnitude } from '../sim/math.ts';
import { MEDIAN_MASS, METRE } from '../sim/units.ts';
import type { Body } from '../sim/body.ts';
import type { SimState } from '../sim/types.ts';
import { advance, fade, place, ticksIn } from './decay.ts';
import { BOARD_PIXEL } from './design.ts';
import type { BodyView, WakeView } from './types.ts';

/**
 * How far apart the rungs hang, in design units — spec 05 §3's spacing, at the
 * metre [`units.ts`](../sim/units.ts) rules.
 *
 * ## Fifty metres, and the author flew the twenty-five
 *
 * Spec 05 §3 says **25 m** and the author's own confirmation of 2026-08-27
 * deferred it in the same breath: *"the rung approach and the gravity bend hold.
 * Spacing and the label numbers are deferred to when there is a swing to measure
 * them against."* There is a swing now, so 25 m was the first value this had ever
 * had — built, handed to the author, and refused on the first flight:
 *
 * > *"The rungs are too close together, it feels chaotic at speed"* (2026-08-30).
 *
 * **The metre did not move and must not.** What a metre is is settled by spec
 * 07's boundary bands against this corridor (`units.ts`), and moving it to widen
 * the rungs would have put a run's opening tick inside the fire band. What moved
 * is the **number of metres**, which is the number spec 05 itself deferred.
 *
 * ## Fifty is where Direction 05's own picture already was
 *
 * The doubling is not a guess at *"a bit wider"*. Direction 05's live component —
 * the only place in the project a rung is drawn at a size — spaces its rungs 46
 * board pixels apart in a 620-pixel frame, so it draws **13.5 rungs at once**. At
 * 25 m this showed the author **26** on their phone, and at 50 m it shows
 * **12.9**. The complaint and the board turn out to be the same correction, which
 * is the strongest evidence a taste ruling ever gets, and it retires the
 * disagreement `units.ts` recorded between the board's density and this one.
 *
 * It is on the bench, because *"chaotic at speed"* is a judgement about a moving
 * picture and the next one may be too.
 */
export const RUNG_SPACING = 50 * METRE;

/**
 * Every 5th rung is **addressed** — spec 05 §3, and the board's own `k % 5`.
 *
 * What an addressed rung *says* is spec 05's one open question and it is **not
 * settled here**. See [`RUNG_LABEL`](#rung_label).
 */
export const ADDRESSED_EVERY = 5;

/**
 * How far a rung is displaced at all, from a falloff length: the board's
 * `exp(-d / L)`, cut off and renormalised so that it **ends**.
 *
 * `CONTEXT.md`'s **decay** rules that *"a decay ends rather than becoming very
 * small, so a thing that is over is absent"*, and spec 05's acceptance depends on
 * it being literally true: *"a frame rendered with the craft removed and a frame
 * rendered with it present differ only within ~3 × 34px of the craft's
 * position."* A bare exponential never reaches zero, so that criterion could only
 * ever be approximately checked, and every rung in the field would carry a
 * fraction of every body in it.
 *
 * So it is cut at **three falloff lengths**, where the bare curve is already at
 * 0.0498, and the tail is subtracted and the rest renormalised — which keeps both
 * ends of the board's own formula exactly (1 at the source, 0 at the cutoff) and
 * moves the middle by at most 5%, under one board pixel of bow at the rim of the
 * heaviest body in the field.
 *
 * It is also what makes the field's cost bounded: a rung asks nothing of a body
 * three falloff lengths away, so the sweep in `pnpm profile` grows with the
 * bodies **near** a rung rather than with the size of the field.
 */
export function falloff(distance: number, length: number): number {
  if (distance >= length * FALLOFF_REACH) return 0;
  return (exp(-distance / length) - FALLOFF_TAIL) / (1 - FALLOFF_TAIL);
}

/** Falloff lengths to the cutoff, and what the bare curve is worth there. */
const FALLOFF_REACH = 3;
const FALLOFF_TAIL = 0.049787068367863944;

/** How far from a source anything it displaces can be, given its falloff length. */
export function reachOf(length: number): number {
  return length * FALLOFF_REACH;
}

/**
 * How far the bow can reach, and how fast it dies with distance — the board's
 * `150` at ×1.33, a **length**.
 *
 * ## This is the half of *"a bit larger"* that was free
 *
 * The author, 2026-08-30: *"the ship's wake, and maybe all gravity wakes, need to
 * be a bit larger."* A bow can be made larger two ways and this is the **reach**;
 * the depth is [`BOW_CAP`](#bow_cap), which moved for a reason of its own.
 *
 * The reach is also the half the rungs' own spacing took away. The board's 150
 * sits against rungs 46 apart, so its bow reaches 9.8 rungs; at 200 against rungs
 * 50 apart it reaches 12, which is a heavier body bending a visibly wider patch
 * of field without one point of it moving further than the clamp allows.
 *
 * It is on the bench, with `BOW_GAIN` beside it, because *"a bit"* is a judgement
 * about a moving picture.
 */
export const BOW_FALLOFF = 200 * BOARD_PIXEL;

/**
 * The bow's numerator — the board's `90`, and an **area**.
 *
 * It is divided by a distance to produce a displacement, so it carries
 * `BOARD_PIXEL` **twice**. Carrying it once would have given a field that bows a
 * third as far as the board's at the same distance, which is the same shape of
 * error the starfield made with its star sizes and is invisible in the numbers.
 */
const BOW_NUMERATOR = 90 * BOARD_PIXEL * BOARD_PIXEL;

/** The board's `26`, which stops the bow diverging at a body's centre — a **length**. */
const BOW_SOFTENING = 26 * BOARD_PIXEL;

/**
 * How far a rung may be bowed, in design units.
 *
 * ## Spec 05 says 30px in three places, and 30px broke its own acceptance
 *
 * The spec states the clamp in §2's stack table, in §3's formula and prose, and
 * again as an acceptance criterion — and a second criterion beside it says
 * *"sweeping a body's mass from minimum to maximum increases peak bow
 * monotonically."* Written as a test, the two turn out to contradict each other
 * **inside the field's own mass range**.
 *
 * A rung point inside a body is hidden behind the body's disc, so the largest bow
 * anyone can see is the one at the **rim**. At 30px the per-body clamp starts
 * biting at the rim once a body reaches radius 44, and above that the visible
 * peak *falls* — because a heavier body holds its own rim further out into the
 * falloff while the clamp holds the amplitude flat. Measured across the radii
 * this field places:
 *
 * | Body radius (prototype units) | 34 | 44 | 56 |
 * |---|---|---|---|
 * | Visible bow at the rim, at a 30px clamp | 18.0 | **23.8** | 22.3 |
 * | At 45 | 18.0 | 24.4 | **31.7** |
 *
 * So at 30 the biggest body in the field bends less field than the median one,
 * which is the exact opposite of *"the field states which bodies pull hardest
 * before the player ever presses"* (§6). **45 is the smallest value that clears
 * it**: the turnover moves to radius 60, above the 56 this field places and above
 * spec 17 §4's own largest of 55. Past 45 nothing further changes, because the
 * clamp has stopped binding at the rim at all.
 *
 * ## And it is what the author asked for
 *
 * *"I think the ship's wake, and maybe all gravity wakes, need to be a bit
 * larger"* (2026-08-30). This is the half of that a measurement had already
 * asked for independently, which is the strongest reason to make a change and
 * the reason it is 45 rather than whatever looked bigger.
 *
 * Applied **per body and again to the sum**, which is what the spec says in its
 * two halves: the formula clamps inside the per-body `min`, and the prose adds
 * *"bows from multiple bodies sum, then clamp."* The field forks at two altitudes
 * in five (`fixture-field.ts`), so a rung between a pair of bodies is genuinely
 * pulled twice and the second clamp is not theoretical.
 */
export const BOW_CAP = 45 * BOARD_PIXEL;

/**
 * How hard the median body bows a rung, as the board's `gravityBend`.
 *
 * ## **Zero: the gravity bow is switched off, 2026-08-30**
 *
 * The author, having flown it: *"let's remove the gravity wake effect for now,
 * for both planet and ship, but leave the underlying code so we can reactivate
 * it later."* So the rungs hang straight, and **nothing below this line was
 * deleted** — the law, the clamp, the falloff, the sum-then-clamp and every test
 * that holds them are intact, and the only thing that changed is how much of it
 * is turned on.
 *
 * **The value to put back is 24**, the board's own default (its slider gives
 * 0 – 44), and it is one move of the `Gravity bow · strength` slider on the
 * bench. What it buys at 24 is recorded so the restore does not have to be
 * re-derived: the median body of this field bows a rung at its own rim by **24.4
 * board pixels**, the smallest by 18.0 and the largest by 31.7, under a
 * [`BOW_CAP`](#bow_cap) of 45 and monotone across the whole range a day places.
 *
 * **Zero is a real off and not a small on.** It reaches the picture through
 * [`bowOf`](#bowof), so presentation state says every body bows nothing, and the
 * renderer culls on that and draws two points per rung instead of ninety-three —
 * the cost of the feature goes with the feature. That is why the gain lives here
 * rather than in `rungPointAt`: a switch that only stops the ink still pays for
 * the arithmetic.
 *
 * **When to reopen**: whenever the author wants it back. It is the first thing to
 * try on the bench beside the wake, and `docs/plan/m3-the-field.md` records what
 * the flight that switched it off was reacting to.
 */
export const BOW_GAIN = 0;

/**
 * How hard one body bows the rungs — the whole strength, gain included.
 *
 * **Mass, and mass is size** (spec 04 §1), so this moves with
 * [`MASS_EXPONENT`](../sim/units.ts) and the author's answer to it — at 0 every
 * body in the field bends the rungs alike and at 2 the largest bends them 2.7×
 * as hard as the smallest. Spec 05 §3 asks only that `G` *"scales with the body's
 * mass"*; taking it linearly is the reading that makes the acceptance criterion's
 * *monotonically* mean something rather than being satisfied by any function at
 * all.
 *
 * **[`BOW_GAIN`](#bow_gain) is folded in here rather than applied where the ink
 * is**, and that is what lets the effect be switched off without a switch: at a
 * gain of zero this returns zero, presentation state says the field is flat, and
 * the renderer culls a body that bends nothing the same way it culls one that is
 * too far away. The alternative — multiplying by the gain inside `rungPointAt` —
 * would have gone on paying for ninety-three samples a rung to reach the same
 * straight line.
 *
 * It is normalised to the **median** body so that the gain keeps meaning what the
 * board's own slider means.
 */
export function bowOf(body: Body): number {
  return (BOW_GAIN * body.mass) / MEDIAN_MASS;
}

/**
 * How far the craft parts a rung it is standing on, in design units — a
 * **length**.
 *
 * ## **Zero: the craft's wake is switched off, 2026-08-30**
 *
 * The same ruling that switched off the bow — *"for both planet and ship, but
 * leave the underlying code so we can reactivate it later"* — and the same
 * shape: nothing is deleted, [`wakeOf`](#wakeof) still derives the wake every
 * tick, ADR-0015's recurrence is still exercised and still tested, and the
 * renderer declines to draw it. Re-enabling is one slider and needs no state to
 * warm up, because the state was never switched off.
 *
 * **The value to put back is 40 board pixels, with [`WAKE_FALLOFF`](#wake_falloff)
 * at 85**, and the arithmetic behind the pair is worth keeping because it is not
 * obvious. The author flew the board's own 16 / 34 against rungs 25 board pixels
 * apart, so it lifted a rung by 64% of a spacing; doubling the spacing to 50
 * halves that on its own, so **32 / 68 merely restores the picture they were
 * describing** and anything less is a reduction wearing an increase's clothes.
 * The *"a bit larger"* they asked for is the ×1.25 on top. Measured against their
 * own fast run at a coasting tick 555 units clear of every body: at 22 the craft
 * nicks one rung and reads as a kink, at 40 it carries a pocket of field with it
 * across three.
 */
export const WAKE_AMPLITUDE = 0;

/**
 * How fast the parting dies with distance from the craft — a **length**, and the
 * other half of the same correction.
 *
 * The board's 34 against rungs 25 apart reached 4.1 rung spacings. Held constant
 * across the doubling that is 68, and the same ×1.25 makes it 85, so the wake
 * reaches **5.1 rungs** and the parting is a bubble rather than one line bending.
 *
 * The two move together on purpose: the amplitude alone makes a taller spike in
 * the same place, and what the design asks for is the craft displacing a *patch*
 * of an existing structure.
 */
export const WAKE_FALLOFF = 85 * BOARD_PIXEL;

/**
 * How long a parted rung takes to come back — spec 05 §3's **~400ms**.
 *
 * The same 400ms spec 00 §3 gives the E3 and spec 06 §4 gives a callout's fade,
 * because [`decay.ts`](./decay.ts)'s whole argument is that the design has one
 * grammar of decay wearing several costumes.
 */
export const WAKE_TICKS = ticksIn(400);

/**
 * The wake, one tick on: where the craft has pressed on the rungs near it, and
 * how much of each press is left.
 *
 * ## Why this remembers a position rather than an amplitude
 *
 * Spec 05 §3 states the wake as `wake(d) = W · exp(-d / 34)` with `d` the
 * distance to the **craft**, which taken literally has no memory at all: the rung
 * parts and unparts as the craft goes by, and the *"relaxes back over ~400ms"* in
 * the sentence underneath is unexpressed. At the speeds this game reaches the
 * craft crosses a wake's whole reach in a fifth of that, so the relaxation is not
 * a refinement — without it the rung flicks.
 *
 * What relaxes is therefore the **source**: the point the craft pressed from, and
 * how much of that press is left. While the craft is closing on a rung the source
 * follows it and the press is full, so the formula above holds exactly. Once the
 * craft starts receding the source **stays where the craft was at its closest**
 * and only fades, which is the *"part around the craft and relax behind it"* the
 * spec asks for and the *"nothing radiates from the craft"* it forbids in the same
 * breath — what is drawn is an existing structure displaced, and the displacement
 * has a place rather than a centre.
 *
 * The comparison that decides between the two is made **at the rung**, in the one
 * currency both readings are in: what each would displace this rung's nearest
 * point by. The live craft wins while it is arriving and loses once it has left,
 * with no threshold to pick.
 *
 * ## It converges, which is ADR-0015's third rule
 *
 * Every entry is either re-seeded from this tick's craft or one tick further
 * through a [`Decay`](./decay.ts) that ends, so a wake that disagreed with the
 * simulation is gone within [`WAKE_TICKS`](#wake_ticks) whatever it disagreed
 * about. Nothing here can carry an error past 400ms.
 *
 * ## What it costs
 *
 * One entry per rung within the wake's own reach of the craft, plus those still
 * relaxing behind it — bounded by the reach and the decay, and measured at **at
 * most 17** over the shipped run rather than growing with the field.
 */
export function wakeOf(previous: readonly WakeView[], sim: SimState): WakeView[] {
  const foot = sim.field.corridor.foot;
  if (!hasRungs(foot)) return [];
  const craft = sim.craft;
  const reach = reachOf(WAKE_FALLOFF);
  const nearest = rungAbove(foot, craft.y + reach);
  const furthest = rungBelow(foot, craft.y - reach);

  const next: WakeView[] = [];
  for (const was of previous) {
    // Rungs the craft can still reach are decided below, against the craft: a
    // press that is arriving replaces one that is leaving, and this loop would
    // otherwise carry the leaving one as well.
    if (was.rung >= nearest && was.rung <= furthest) continue;
    const life = advance(was.life);
    if (life !== null) next.push({ ...was, life, strength: fade(life) });
  }

  for (let rung = nearest; rung <= furthest; rung++) {
    const y = altitudeOf(foot, rung);
    const now = falloff(Math.abs(craft.y - y), WAKE_FALLOFF);
    const was = previous.find((entry) => entry.rung === rung);
    const held = was === undefined ? 0 : was.strength * falloff(Math.abs(was.y - y), WAKE_FALLOFF);
    if (was !== undefined && held > now) {
      const life = advance(was.life);
      if (life !== null) next.push({ ...was, life, strength: fade(life) });
      continue;
    }
    if (now <= 0) continue;
    next.push({
      rung,
      x: craft.x,
      y: craft.y,
      amplitude: WAKE_AMPLITUDE,
      strength: 1,
      life: place(WAKE_TICKS),
    });
  }
  // In rung order, so a picture asserted against another picture compares
  // element for element rather than by search.
  return next.sort((a, b) => a.rung - b.rung);
}

/**
 * Whether this field has a ladder in it at all.
 *
 * A rung is counted from the field's **foot**, so a field without one has no
 * altitude datum and therefore no rungs. That is not hypothetical:
 * `tools/check-portability.ts` builds exactly that field — `halfWidth` and `foot`
 * both `Infinity` — because *"a corridor here would be geometry the proof has to
 * dodge."* Unguarded, that walks an unbounded rung index and hands
 * [`exp`](../sim/math.ts) a `NaN`, which is how it was found: the domain check
 * ADR-0014 asked for threw on the first run rather than drawing a field of
 * nothing.
 */
export function hasRungs(foot: number): boolean {
  return Number.isFinite(foot);
}

/** Where a rung sits, in design `y`, counted in rungs above the field's foot. */
export function altitudeOf(foot: number, rung: number): number {
  return foot - rung * RUNG_SPACING;
}

/** The lowest-numbered rung at or above `y` — `y` being design `y`, which falls as the craft climbs. */
export function rungAbove(foot: number, y: number): number {
  return Math.ceil((foot - y) / RUNG_SPACING);
}

/** The highest-numbered rung at or below `y`. */
export function rungBelow(foot: number, y: number): number {
  return Math.floor((foot - y) / RUNG_SPACING);
}

/**
 * Where a point of a rung is actually drawn: bowed toward every mass, then
 * pushed away from the wake's source.
 *
 * **In that order, which is the board's**, and it matters: the wake is measured
 * from the *bowed* point, so a rung already pulled into a body is parted about
 * where it now lies rather than about where it would have been. The craft is
 * usually inside a body's bow when it has one, so the alternative would show the
 * two effects fighting.
 *
 * `into` is written into rather than returned, because this runs on the order of
 * a thousand points a frame and the prototype's own record is that per-frame
 * allocation is what a garbage collector eventually charges for in one long
 * pause.
 */
export function rungPointAt(
  x: number,
  y: number,
  bodies: readonly BodyView[],
  wake: WakeView | undefined,
  into: { x: number; y: number },
): void {
  let dx = 0;
  let dy = 0;
  for (const body of bodies) {
    const toX = body.x - x;
    const toY = body.y - y;
    // A body that bends nothing is skipped before the distance is measured — the
    // whole field is in that state while the bow is switched off
    // ([`BOW_GAIN`](#bow_gain)), and the renderer culls on the same fact one
    // level up so that a flat rung costs two points rather than ninety-three.
    if (body.bow <= 0) continue;
    const away = magnitude(toX, toY);
    const shape = falloff(away, BOW_FALLOFF);
    if (shape <= 0) continue;
    const pull = Math.min(BOW_CAP, (body.bow * BOW_NUMERATOR) / (away + BOW_SOFTENING)) * shape;
    // A rung point exactly on a body's centre has no bearing to it, and the
    // board guards the same division the same way. It is unreachable in play —
    // the craft dies on contact long before — and it is guarded so that a test
    // may place a body anywhere it likes.
    const unit = away === 0 ? 1 : away;
    dx += (toX / unit) * pull;
    dy += (toY / unit) * pull;
  }
  // *"Bows from multiple bodies sum, then clamp"* — spec 05 §3, and the per-body
  // `min` above is the other half of the same sentence.
  const bowed = magnitude(dx, dy);
  if (bowed > BOW_CAP) {
    dx = (dx / bowed) * BOW_CAP;
    dy = (dy / bowed) * BOW_CAP;
  }

  if (wake !== undefined) {
    const fromX = x + dx - wake.x;
    const fromY = y + dy - wake.y;
    const away = magnitude(fromX, fromY);
    const push = wake.amplitude * wake.strength * falloff(away, WAKE_FALLOFF);
    if (push > 0) {
      const unit = away === 0 ? 1 : away;
      dx += (fromX / unit) * push;
      dy += (fromY / unit) * push;
    }
  }

  into.x = x + dx;
  into.y = y + dy;
}

/**
 * What an addressed rung says, and **this is spec 05's one open question**.
 *
 * Spec [05 · §3](../../docs/spec/05-field.md) records two surviving readings and
 * declines to choose: *(a)* an addressed rung prints its altitude in metres and
 * the address scale lives only on cards, or *(b)* the rung nearest each body is
 * the addressed one and prints that body's address. It records that *"the
 * evidence leans to (a)"* — Direction 05's live component is the only place the
 * board actually draws a rung label and it draws metres, `125`, `250`, `375` —
 * against three later boards that report altitude on the 0–40 address scale. **It
 * is still a ruling and this file does not make it.**
 *
 * So the default is the spec's own lean rather than a decision, and the
 * alternative is **on the bench beside it** so the author can fly both and say
 * which. That is the whole of what `pnpm bench` is for.
 *
 * `METRES` prints the rung's own altitude. `ADDRESS` prints the address of the
 * nearest body, which is reading (b) drawn on every addressed rung rather than on
 * a chosen one — the spec's *"the rung nearest each body"* would light one rung in
 * five hundred metres of field and leave the rest unlabelled, and what the author
 * has to judge is the two labels against each other rather than one against
 * nothing.
 */
export const RUNG_LABEL: 'METRES' | 'ADDRESS' = 'METRES';

/**
 * What one addressed rung reads, given the field it hangs in.
 *
 * Under `METRES` it is the rung's altitude above the field's **foot**, which is
 * the datum spec [17 · §3](../../docs/spec/17-daily-field.md)'s day description
 * measures every body from — *"altitude : metres, bottom to top"* — so two players
 * flying one day read the same number off the same rung, which is what §6's *"the
 * field is a ruler the player climbs"* is for.
 *
 * **The fixture's foot is a backstop rather than a line anyone meets**
 * (`fixture-field.ts`: one screen height plus 400 below the spawn), so a run here
 * opens reading 1 250 rather than near zero. That is an artefact of a hand-made
 * field and not of the datum; spec 17's generator places its own foot. It is
 * named here because it is the first thing the author will see and the second
 * thing to ask them about.
 */
export function rungReads(rung: number, bodies: readonly BodyView[], foot: number): string {
  if (RUNG_LABEL === 'METRES') return String(Math.round((rung * RUNG_SPACING) / METRE));
  const y = altitudeOf(foot, rung);
  let nearest = 0;
  let best = Infinity;
  for (let address = 0; address < bodies.length; address++) {
    const gap = Math.abs(bodies[address]!.y - y);
    if (gap < best) {
      best = gap;
      nearest = address;
    }
  }
  // Addresses are 1 – 40 (spec 17 §1) and the field indexes them from zero.
  return String(nearest + 1);
}
