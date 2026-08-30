# M3 · The field

`VISION.md`'s honest assessment: the game already knows what it wants to look like and looks
like it about a quarter of the time. The anomaly is finished-product quality and sustains for
roughly 25 seconds of an 85-second run. The other 60 seconds are this milestone — not by
extending the anomaly, whose rarity is what makes it land, but by holding the rest of the
field to the same standard.

---

## M3.1 · Camera and design space

Everything the player reads is drawn in world space in the 1170×2532 design space, so the
composition is identical on every device, and nothing the player reads is drawn outside it. What
is outside it is **bleed** — world rather than black, bounded by the corridor's line, built in
[M1.4](./m1-the-swing.md). DOM is developer chrome only. A desktop window bleeds wider than a
phone, and that is accepted rather than hidden (ADR-0010).

**And this step owes the camera a sideways axis.** M1.4 gave the field a corridor 1.9× the design
width, which retired `camera.ts`'s *"it does not pan sideways"* — measured, the craft can be
**538 design units outside the picture and still alive**, and 359 of those survive the bleed. The
numbers and what they were measured over are under
[M1.4 · The camera decision has expired](./m1-the-swing.md#m14--death-and-the-shape-of-a-run);
they are not restated here, because two copies of a measurement are two copies that drift.

**And the fit itself changed under it** (author, 2026-08-28, closing spec
[00 · §7](../spec/00-tokens.md)). The design space is no longer fitted *whole*: **the width is the
contract** — 1170 design units across, always — and the visible height follows from the device's own
shape. This step owes the two guardrails that make that safe, and both are numbers rather than
opinions:

- **The guaranteed band**: a height, taken from the shortest viewport the game supports, that every
  device shows in full and inside which everything readable is composed. Spec 00 §7's rule is
  unchanged in force; the rectangle it names becomes this band.
- **The cap**: how much extra a taller device may see, so that what a player can see is bounded
  above as well as below.

**And the view this costs is bought back with sightings**, which is [M2.2](./m2-the-instrument.md)'s
and lands before this step — a body the picture cannot show, marked on the edge of it in its own
hue. It is the other half of the ruling rather than a separate feature, and the ordering matters:
narrowing the view before there is anything to replace it with is a step that only takes.

The evidence they are sized against is [M1.5's](./m1-the-swing.md), measured over 877 releases:
unguarded, devices see **496 – 846** prototype units of height, and the body a craft next grabs is
on screen at the moment of release **45 – 89%** of the time. Fitting whole gives a flat 88% and a
77%-sized picture; the ruled fit gives a full-sized picture and 68% on a phone in a browser. The
band and the cap are what stop the second number being the device's to decide.

**Acceptance**: identical composition across aspect ratios *within the guaranteed band*, and the
band is shown whole on every supported viewport; nothing readable in the bottom third, ever; the
extra a tall device sees is capped. **Verify**: `pnpm test` on the projection, plus screenshots at
three aspects.

---

## M3.2 · Rungs

Spec `05-field`. The Geometry Wars tribute, earned: the loved quality is a continuous medium
that bends around mass and reacts to the player, and the shape — a floor plane — cannot come
with us. So: horizontal strata every 25m, perpendicular to travel, a ladder rather than a
floor. They bow toward every mass with radius scaled by its pull, part around the craft and
relax behind it in ~400ms, and every fifth carries its address.

Rungs are **level sets of progress**, perpendicular to intended travel. Written that way, a
ring course inherits the whole grammar unchanged later.

**Acceptance**: bow ≤ 30px ⚠ **45px, and both displacements switched off — see below**, wake relaxes
in ~400ms, addresses on every fifth rung, and the frame budget still holds with rungs on.
**Verify**: `pnpm test` plus the M3.6 harness.

### Built, 2026-08-30 — and flown twice in the same sitting

**The layer question, answered from the ADRs rather than assumed.** The starfield is renderer-only
because a star is fixed at construction and only the camera moves it. A rung is not like that, and
its three parts answer differently. The **wake** is presentation state, and
[ADR-0015](../adr/0015-presentation-state-carries-what-decays.md) names it by name in its opening
paragraph — a rung the craft has passed is still displaced and is on its way back, which is a
function of this tick *and what was already on screen*. The **geometry** is pure and lives beside it
in `src/state/rung.ts`, so *"the bow at this point is 23 design units"* is a sentence a test makes
without a canvas ([AGENTS.md](../../AGENTS.md) §4), and because the wake's own seeding needs the same
falloff the drawing does — `src/render/` may import `src/state/` and never the reverse. The
**sampling and the paint** are the renderer's, because how many points a curve is drawn from is a
resolution decision. **Nothing is simulation**: `SIM_VERSION` does not move and
`test/state/rungs.test.ts` proves it by stepping two runs side by side rather than by reading a
fingerprint — `test/sim/version.test.ts`'s own *picture, not flight* case.

**Two questions the spec left open had to be settled first.**

- **What a metre is.** Ruled — a prototype unit, so `SCALE` design units — with the arithmetic in
  `src/sim/units.ts` and the summary in the spec README. The check that decided it is spec 07 §2's
  bands: at the only competing reading the outer band is deeper than this field's whole corridor.
- **What an addressed rung says.** **Not settled, deliberately.** Spec 05 §3 records two readings and
  declines to rule; both are built and the bench toggles them, with metres the default because that
  is where the spec says the evidence leans. A default is not a ruling.

**The author flew it the same day and moved three numbers.**

| | Flown as | Now | Why |
|---|---|---|---|
| Rung spacing | 25 m | **50 m** | *"too close together, it feels chaotic at speed."* At 50 the phone shows 12.9 rungs; Direction 05's own frame draws 13.5 |
| Sky | α ×1 | **α ×0.4** | *"much less noticeable. I still want it there, but only as background noise"* |
| Ship's wake | 16 / 34 board px | **40 / 85** | *"the ship's wake… needs to be a bit larger."* Doubling the spacing halved the wake relative to the field, so 32/68 only restores what they saw; the ×1.25 is the *"a bit"* |
| Bow clamp | 30px | **45px** | Half of *"maybe all gravity wakes"*, and a defect — see below |

**The 30px clamp was breaking spec 05's own acceptance.** A rung point inside a body is hidden
behind the disc, so the visible peak is at the **rim** — and at 30 the clamp bites there for any
body above radius 44. Measured at radii 34 / 44 / 56 the rim bow ran 18.0 → **23.8** → 22.3: the
biggest body in the field bent *less* field than the median one, which is the opposite of §6's
*"the field states which bodies pull hardest."* So the clamp and *"increases peak bow
monotonically"* could not both hold, and the acceptance was two criteria contradicting each other
inside the field's own mass range. 45 is the smallest value that clears it.

**The frame budget, measured rather than asserted.** `pnpm profile` on the author's own fast run
(the 07:34 dispatch, 944 ticks, peak 1 716 units/s):

| Per frame | Before | After |
|---|---|---|
| Path points | 61.8 mean, 153 max | **895.3 mean, 1 003 max** |
| Strokes | 29.4 mean, 45 max | **46.3 mean, 62 max** |
| Gradients, arcs, overdraw | 4.4 / 38.3 / 1.51 screens | **unchanged** |

A **path-point tally was added to the census** to get that first row: a stroke count says a rung was
drawn and cannot tell one drawn from a hundred points from one drawn from two, which is the whole of
what `RUNG_STEP` decides. Overdraw does not move, because a 1px stroke paints no area — so the
expensive thing the census watches is untouched and what grew is command volume. Headless, the rung
geometry costs **0.13 ms a frame** (laptop, ~1 550 points, the full corridor width); in Chrome the
rung pass records in **0.28 ms** against 0.37 – 0.41 for the whole frame. Canvas2D rasterises
off-thread, so those are lower bounds and **the number that decides it is the phone's** — M3.6's,
and the meter already rides in the dispatch.

The cost is bounded by construction rather than by the field's size: `falloff` **ends** at three
lengths instead of tapering forever, so a rung asks nothing of a body outside its reach, and a rung
with nothing acting on it is drawn from two points. The field-size sweep confirms it — the frame is
identical in a field of 1 536.

**`exp` had to be written first.** ADR-0014 bans it and both of spec 05 §3's formulas are
exponential falloffs; the ADR now carries the measurement, and the domain guard it asked for caught
an unbounded rung index on the very first run of `pnpm portable`.

### Switched off the same day, and kept whole

The author flew the finished thing and parked half of it: *"let's remove the gravity wake effect for
now, for both planet and ship, but leave the underlying code so we can reactivate it later."*

**What ships** is strata every 50 m, DUSK at α 0.16 and 0.28, every fifth addressed and carrying a
number, sweeping past at world speed. Of spec 05 §6's three jobs, **speed felt** and **altitude
addressed** are intact and **gravity drawn** is parked — so the **tide** goes back to being the only
thing in the game that says gravity, at the rim rather than at a distance. That is the cost and it is
worth restating when this is reopened.

**How it is off matters as much as that it is off.** It is two constants — `BOW_GAIN` 0 → **24**,
`WAKE_AMPLITUDE` 0 → **40** with `WAKE_FALLOFF` at 85 — and both are on the bench, so reactivating is
a slider rather than a build. The gain was moved *into* `bowOf` so that zero reaches the picture
through **presentation state**: a body that bends nothing says so on itself, the renderer culls it
exactly as it culls one too far away, and a rung is drawn from two points instead of ninety-three.
Measured on the same dispatch, **path points fall from 895 to 96 per frame** — the pre-rung baseline
of 62 plus the straight lines themselves. A switch that only stopped the ink would have gone on
paying for a curve it then drew flat.

The wake's own recurrence keeps running while it is not drawn, so ADR-0015's machinery stays
exercised and turning it back on needs no warm-up. `WakeView` gained an `amplitude` for this, which
is the same fact for the craft that `BodyView.bow` is for a body — and it is where a wake that
answered to speed or to the quality of a swing would land.

**The law stays tested, which is the difference between *"reactivate later"* and *"debug later"*.**
`test/state/rungs.test.ts` exercises the bow and the wake at the strengths a restore would put back,
and asserts *separately* that the shipped field draws flat over a whole run — so the ruling and the
mechanism can each move without the other rotting, and the restore does not have to be re-derived
from a flight.

### Still the author's, and asked rather than assumed

1. **What an addressed rung says** — spec 05's own open question, now flyable both ways on the bench.
2. **Where altitude is zero.** Rungs count from the field's **foot**, which is spec 17 §3's datum,
   but the fixture's foot is a backstop *"rather than a line anyone meets"* — so a run opens reading
   1 250 rather than near zero. An artefact of a hand-made field; spec 17's generator places its own.
3. **Whether a rung label may cross the thumb line.** Built as the conservative reading of spec 00
   §7 — it fades out as it crosses. `LABEL_FADE` goes to zero if a world-attached label is exempt.
4. **What brings the bow back, and in what form.** It was asked whether it should be *"reserved for
   special tricks"* and then switched off entirely, both on 2026-08-30. The assessment against that
   first question stands and is the argument for restoring it as it is: it is the half of the system
   that makes the field a medium rather than a ruler, it is §6's second job, and a bow that came and
   went would make the field lie about where the mass is. What the same flight showed is a real
   defect underneath both notes: **near a held body the craft's wake and that body's bow fight in the
   same place and the body wins**, so the craft's own passage is least visible exactly where the
   player is looking. If a *trick* reading is still wanted, the place for it is the **wake**
   answering to something — speed, or the quality of a swing — which `WakeView.amplitude` is now
   shaped for. That is a new mechanism and the author's to rule.

---

## M3.3 · Sky, dust, anomaly

VOID that warms almost imperceptibly toward AURORA as an anomaly approaches — weather on the
horizon, never spent early, tint ≤6% outside the anomaly. Sparse dust motes falling in strict
parallel at world speed, brightness varied α .1–.3, density rising gently with chain. ⚠ **No
parallax layers** — layers at different speeds are implied depth, and this world has none.
*Overturned by the author on 2026-08-30 for the **sky** only: it has three tiers of parallax and
is built ([05 · §2](../spec/05-field.md)'s notice). Everything in the list above is unaffected and
still moves at world speed. **The rungs landed on 2026-08-30 and the author reopened it as promised:
the sky keeps its place and comes down to meet them** — α ×0.4, *"I still want it there, but only as
background noise"* — so two systems saying* speed *are settled by rank rather than by deleting one.*

The anomaly is the only event permitted to repaint the sky: purple curtains over true black
cloud gaps, planets reading through the tint. The baseline's restraint is what keeps it rare.

**Acceptance**: the anomaly reads as the reference standard; nothing outside it repaints the
sky; dust velocity is uniform. **Verify**: eyes, plus a test that no layer has its own speed.

---

## M3.4 · The boundary

Spec `07-boundary`. Three laws: **intensity is closing speed, not proximity** — coast along
the outer band and the edge glows softly, dive at it and it flares; **reward is shown, never
spoken** — scoring motes are the only signage, sparse in the outer band, dense in the fire
band, absent past the line; **the line is the only absolute.**

Bands are drawn in world space, never on screen edges, so the edge reads as geography rather
than as a vignette. Outer band ×2 from edge−220m, fire band ×3 from edge−90m.

The deadline track is the compass inverted: green windows on orbits say *release here*; the
ION window on the craft's own projected line says *a press here still saves you*, its dot the
last possible moment, the line dashed past it. Fuel couples to it **by luminance, never
geometry** — the window is drawn at its true physical size and only the portion the tank can
afford stays lit. A moment exists, and you cannot buy it.

Death: 70ms hitstop at the line, then the craft unravels along its velocity over ~900ms —
stretch, core thinning, embers streaming strictly parallel. No explosion, no slow-mo, no
shake. The release condenses the player's light into a word; the loss disperses it into the
field.

**Acceptance**: skimming parallel keeps the edge calm; a dive flares it; the deadline dot is
the last tick a save is possible. **Verify**: `pnpm test` plus eyes.

---

## M3.5 · The retro grade

Spec `14-retro-grade`. Weighted to post-processing — scanlines, grain, bloom, slight chromatic
aberration — over the pass the energy channel already needs. Plus the authoring rules the other
specs inherit: a minimum stroke weight, dither in preference to smooth gradients, display type
only from the arcade face.

Build it as a **knob**, not a look. The author tunes it on a phone; "a touch more retro" is a
judgement made against the running game, not decided in advance.

**Acceptance**: the grade can be dialled from off to heavy at runtime, and the game is legible
at both ends. **Verify**: fly it with the knob.

---

## M3.6 · The frame-budget harness

`VISION.md` names this as a standing gap: the correctness gate says nothing about time, and a
rendering-induced slowdown reached a phone with nothing in the repo able to catch it. **The
units that matter are p99 and max, not mean** — that class of bug hides behind an average of
calls that mostly return early.

**Acceptance**: a command that reports p99 and max frame time for a replayed recipe, and a
recorded baseline on the author's phone. **Verify**: run it on the phone.

---

## Exit

The field looks like Aphelion for the whole run rather than a quarter of it. Next:
[M4](./m4-the-economy.md).
