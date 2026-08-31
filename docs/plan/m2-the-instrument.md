# M2 · The instrument

The compass is the signature element — the thing a screenshot is recognised by — and
`VISION.md` calls its ancestor the best piece of UI in the game: diegetic, positioned exactly
where the eye already is, teaching the timing window without a word of text. It is the bar
everything else is measured against.

This milestone comes before the field, which means spending it flying a beautiful compass
over an ugly world. That is the right order: the gate is feel, and the compass is where the
feel is read.

---

## Flown, 2026-08-30 · the camera looks ahead, and the sky was four times too small

Three notes from one sitting, all measured against the author's own dispatches.

**The camera was showing where the craft had been.** *"When I go fast I often feel like the camera
isn't showing me far enough ahead to make a safe capture."* Measured over 6 267 ticks of climbing,
the craft sat **337 design units above centre at p50 and 497 at p95** — the deadzone and the ease
lag between them — so a third of the view was spent on the past. The prototype's own diagnosis
names the mechanism: *"a deadzone that has no idea which way you are going."*

Its fix is a **velocity look-ahead**, and it is horizontal, because its playfield is wider than its
window. This field is a vertical corridor, so the behaviour crosses axes and the code does not
(ADR-0013). `LOOK_AHEAD` 0.18 of the design space at `LOOK_REF_SPEED`, gated off once the dive has
frozen — the prototype's hard-learned rule, since after the freeze velocity stops meaning heading
and *"anything steering off it swings the view."* Headroom lost at p50: **337 → 56**.

**It took two corrections, both flown.**

*First*, removing the deadzone while coasting — which the prototype does, having none on this axis —
took the craft to dead centre and read as *"WAY too fixed on the ship... the camera needs to be MUCH
smoother."* **The band is the float**, and it went back.

*Second*, the lead itself was **more than twice the prototype's**, and the reason is worth keeping:
its `0.18` is a fraction of the design window's **width**, because its playfield is wider than its
window. Applied to this repo's `DESIGN_HEIGHT` the same fraction gives **456** design units where
the prototype reaches **210** (`0.18 × 390 × SCALE`). A fraction does not survive being moved
between axes of different lengths; the **distance** is what was carried from. Flown at 456 it read as
*"the camera is really aggressively locked on the ship"* — a lead that large turns every change in
vertical speed into a large movement of the target, so the view is always chasing.

Measured on the run the author flagged, as camera travel over craft travel where 1.0 is glued:

| lead | lockedness | headroom lost, p50 |
|---|---|---|
| none (before this work) | 0.553 | 337 |
| **210 — the prototype's** | **0.568** | **198** |
| 456 — the mis-carried fraction | 0.618 | 56 |

So the prototype's own extent costs 3% of lockedness over having no lead at all, against 12% for the
fraction, and still returns 40% of the lost view. The camera is perfectly still on **37%** of ticks
against 41% with no lead; its worst single-tick movement is **26.4** against 25.3 before, where the
mis-carry reached 35.4; and the ticks moving further than the old maximum fall from 0.5% to
**0.03%**.

**Then the band itself was the problem, twice over.** *"It still feels really mechanical between
jumps. If I hop to a planet, orbit, hop to another, the camera moves, freezes, and moves. Can it be
a bit more elastic?"* A deadzone that absorbs everything up to its width and nothing past it is
continuous in position but its **slope steps from 0 to 1** at the edge, so every crossing is a start
or a stop with nothing between. It now has a **rounded edge**: parked through its inner 70%, then
easing out on `1 − (1−A)² / ((e−A) + (1−A))`, which meets the parked region in both value and slope
and still saturates at the full band far out. Two pieces rather than one smooth curve, because a
band that merely *slows* near the middle has no equilibrium except the craft itself and would creep
onto it — the earlier complaint arriving slowly instead of at once. Exactly still on 30% of ticks
against 37%, lockedness unmoved at 0.57, and the tick-to-tick change lower at p95.

**And the oval was being absorbed by it.** *"In the original prototype the camera follows the ship a
bit during the eccentric oval phase of circularization."* This file already agreed — *"the dive and
the settle are flown; only the round orbit at the end of them is watched"*, which is why `lockOf` is
zero for the whole settle — but the deadzone knew nothing about that. Measured over **69 settles**,
the craft swings **436 design units at p50** through the oval and the view was flying **70%** of it.
`OVAL_BAND` is 0 for the settle's duration and it flies **99%**. Removing the band here is safe
where removing it everywhere was not: a coast is a straight line, so a view pinned to it is a still
picture of a moving world, while an oval swings and returns — bounded, and the most dramatic thing
in a capture.

Stated cost: the lock's arrival ramp travels **12.6** design units where it travelled 12.2, because
the view now ends the settle wherever the craft took it. Spread over the ramp that is 0.6 units a
tick, against the **49** of visible movement the ramp was built to remove.

### ⚠ The fifth correction, 2026-08-31: that stated cost was the next complaint

*"When I capture a planet and circularize, the camera eventually settles downwards a little bit. Can
we instead just have the camera more smoothly lock into place on the planet?"* — flagged at tick 931
of the run sent that evening, the only dispatch that still replays at `SIM_VERSION` 9.

The cost recorded above was measured as a **distance** and the fault is a **velocity**. `OVAL_BAND`
at zero leaves the view glued to the craft for the whole settle; on the tick the settle ended the
band went from nothing to a whole `DEADZONE`, which absorbs any excursion under 168 units outright.
So a view travelling several units a tick stopped **on one tick**. Traced on the flagged capture, it
ran `… 1.4, 0.7, −0.1, −0.9, −1.7, −2.5, 0.0` — swinging one way through the oval, back the other,
and then a corner. That is the same discontinuity `PARKED` was introduced to remove from the band's
own edge, reappearing at the boundary nobody was watching.

**Two halves, and neither works alone** — which is the measurement worth keeping:

| | jerk across the handover, p50 / worst | ramp travel, the two flown swings | oval swing flown, p50 |
|---|---|---|---|
| before | 3.12 / 7.48 | 12.6 / 15.0 | 0.80 |
| the band closes early, alone | 0.65 / 0.88 | **19.7 / 25.0** — worse | 0.73 |
| the lock completes its own move, alone | 1.19 / 4.03 | 0.0 / 0.0 | 0.80 |
| **both** | **0.65 / 0.88** | **0.0 / 0.0** | 0.73 |

`bandOf` shuts the band over the settle's last `LOCK_TICKS` so the view decelerates out of following
rather than being stopped; `closing` then takes it to its anchor on the lock's own smootherstep,
because the lock named a third of a second and handed the actual movement to a 5%-a-tick ease that
approaches without arriving. Closing the band alone spends the same distance faster and made the
ramp worse; completing the move alone still starts from a moving view. The pair is the correction.

Measured over the author's dispatches **re-flown at `SIM_VERSION` 9 — a different run, and it is
said plainly**, since everything before 9 refuses to replay: 11 captures held on one unbroken orbit,
jerk p50 3.12 → 0.65 and worst 7.48 → 0.88, view travel after the settle ends p50 0.71 → 0.15. On
the flagged capture itself the view reaches rest seven ticks *before* the lock and holds it exactly.

**Stated cost, in the same currency as the last one.** The oval's swing the view flies falls from
0.80 to **0.73** on a path-length reading — the author's own ruling, given a little back in the last
third of a second of a settle, where the orbit is nearly round and the swing is smallest. And the
corner is **smaller rather than gone**: the band shuts before the settle ends, the craft keeps going
round, and the view drifts back out of the band and follows it at a unit or two a tick before the
lock stops it. A shorter window leaves less room to drift and measures worse on both counts, so the
window is `LOCK_TICKS` rather than a number fitted to the two swings the tests fly. `LOCK_TICKS` is
already on the bench, and at 0 it restores the old snap.

**The starfield was carried in the wrong unit.** *"Tiny specks of white with little to no
variation, so it doesn't look very deep or immersive."* The prototype sizes stars in **device
pixels after its own scale** — `max(1, tier.size * cam.scale)`, so 3 to 5.4 on the phone it was
tuned on — and this draws in **design units**, which the letterbox puts one-to-one on that same
phone. The numbers came across; the scale did not. A sub-pixel rectangle is not a small star, it is
an antialiased smear of the background, which is why the brightness ramp stopped reading as depth
too. Sizes now span 2.4 – 6.4, and the count doubled to 320, because the prototype's 160 is a
density **per screen** and this field is two screens tall.

**And a held body was the hardest thing on screen to find.** Spec 04 §3 put IN REACH at 85% against
HELD's 100%. HELD did not move; the gap under it went from 1.18× to **1.82×**.


## Queued · the arrival's word becomes a number

Ruled by the author on 2026-08-30, on the same day the word was built and flown:

> *"I think that once we have the points system in place we'll remove the word for a good arrival
> and just use +N points popup."*

So `TIGHT · NERVE · BRAZEN` are **provisional by the author's own intent**, and what is permanent is
the grading under them — [`arrivedTight`](../../src/sim/tier.ts)'s two halves, the closeness band
and the aim angle, which is where all the measurement went. When spec
[08](../spec/08-economy.md)'s economy lands, `src/state/arrival.ts` keeps its life, its throw, its
slot and its placement, and what changes is only what the mark says.

**Two things should survive that swap and are worth naming now.** The arrival's slot is separate
from the release's, so a `+N` here would not fight a `+N` there. And the **knock** stays a word —
it is not an award, it is the world telling the player what just happened, and there is no number
to put in its place.


## M2.1 · The presentation-state layer

Build the middle layer of ADR-0006 for real: a pure function from simulation state to
everything the renderer needs and the simulation does not own — energies, bloom radii,
craft deformation, camera offset, live awards, decay timers.

The four emission tiers are the ordinal channel for the whole game: E0 structure with no
bloom, E1 lit, E2 hot with a white core, E3 flash, additive, decaying, **one alive at a
time**. Nothing ever changes hue to mean better.

**Acceptance**: presentation state is derived per tick, is pure, passes the portability
check, and a frame is a function of `(recipe, tick)`. **Verify**: `pnpm portable`, plus a
test asserting derived values at named ticks with no canvas involved.

### Done, 2026-08-28

**What this step actually is, is the decay machinery.** The list above reads as six unrelated
things and it is not: the camera kick homes over 180ms with one overshoot, the craft's stretch
recovers over 180ms with one overshoot, an E3 decays over 400ms, the rungs' wake relaxes over
~400ms, a callout pops and lingers and decays.
[ADR-0015](../adr/0015-presentation-state-carries-what-decays.md) exists because those are one
idea in five costumes, and [`decay.ts`](../../src/state/decay.ts) is that idea written once —
which is why M2.2 through M2.5 each cost a line rather than a mechanism.

A decay **ends rather than becoming small**, and that is the whole reason it is a counter and
not a multiplied float. Spec 00 §5's *"nothing persists past 600ms except the trail"* is a
sentence a `null` can satisfy; a value shrinking by a factor each tick never reaches zero, so
something has to decide what counts as gone, and the threshold that decides it is a number
nobody can point at.

**Two curves, and both had to be argued rather than picked.**

| | Shape | Where it came from |
|---|---|---|
| The fall to nothing | the square of what is left | Spec 00 §5 says *"420ms exponential"* and spec 00 §3 *"400ms decay"*, and the two cannot both be literal — an exponential never reaches zero. What is kept is the behaviour (fastest at the start, slowing to nothing) and the shape that does it while ending. **An opening position**, and on the bench |
| The return home | `(1 − x)²(1 − x / 0.37)` | **Read backwards from spec 02 §4.** The one overshoot the design puts a number on is the craft's stretch returning through 1.0 to **0.95** against a 1.5 displacement — a tenth. The rebound of this curve is `4(1 − c)³ / 27c` in closed form, and a tenth falls at `c = 0.37` to three figures |

**The energy radii are a reading, and it is stated because the alternative is not close.** Spec
00 §3's *6px / 18px / 48px* are the board's, and Direction 01's artboard frames the game at
430 × 760 — phone size. The design space is a phone at three device pixels to the point
(ADR-0010), so they are **18 / 54 / 144 design units**, which is the same ×3 the author
confirmed for spec 01's lengths on 2026-08-27 arriving from the other direction. Taken as raw
design units instead, E2's 18 would be a glow narrower than the 45-unit craft it is the halo
of.

**One E3 alive at a time is a shape, not a check.** It is a single nullable field on the whole
presentation, so a second one has nowhere to be and the rule cannot be forgotten by the step
that adds the fourth thing wanting to flash. The release, the grab, the award and the checkered
line are built in four different milestones; a per-thing energy would have let the last of them
stack on the first with nothing failing.

**`SIM_VERSION` did not move, and the way it did not move is the point.** A grab is *a body
being held that was not*, read off the previous **picture** rather than off a flag the
simulation raises. Nothing was added to `src/sim/` for the picture's benefit, which is the
failure mode the whole layer exists to avoid.

**Three things in this step's own list were deliberately not built**, each with a home:

- **The camera kick** (spec 02 §5) travels *along the exit tangent*, so it has a horizontal
  component — and [`camera.ts`](../../src/state/camera.ts) does not move sideways until
  [M3.1](./m3-the-field.md), with `test/state/camera.test.ts` asserting `camera.x` never
  moves whatever the craft does. It belongs in **M2.4**, where spec 02 is rewritten, rather
  than half-built here and rebased there.
- **Live awards** need a window to be graded inside. **M2.3**.
- **The chain** needs rungs to be broken by (spec 05, M3) and an economy to spend it (spec 08,
  M4). The term it multiplies is built and only its value is missing, so it is a named zero
  rather than an absence.

**The craft's stretch is dated from `T0`**, and that is not a decision this step made: spec
02's own ADR-0012 notice already says *"every `T+70ms` in §2 and §3 becomes `T0`"* and *"every
duration measured from the start of its own element is untouched"*. Two costs, both stated:
the across axis rebounds to **1.03** where the board draws 1.06, and the rebound is deepest at
**58%** of the return where the board puts it at 83%. Four hand-set keyframes are not a curve;
the depth is the half worth matching, and both are knobs.

**The bench grew a third card.** Physics restarts the run, the picture and **light** land live
— which is ADR-0006's layer boundary as something the author can feel with a mouse. Eight
knobs: the three bloom radii, the E3's length, the stretch, the squash, the recovery and the
overshoot.

**431 tests, 39 files.** The acceptance is asserted at named ticks of the run `pnpm replay`
ships, in a file that imports nothing from `src/render/`: the grab lands on **74** and the
release on **258**, the E3 is at full radius on the tick it is struck and gone on **282**, and
the stretch is home on **269**. `CONTEXT.md` gained **bloom**, **flash**, **decay** and
**deformation** — the third with an explicit line saying it is never the **settle**, which the
glossary already listed *decay* as a word to avoid for.

---

## M2.2 · Body language

Spec `04-bodies`. Flat vector anatomy that emits: rim in the identity hue, concentric strata,
a core that is the type slot, a body fill that is never brighter than the craft. No gradients,
no terminator — the world is side-on and implies no depth.

The **tide** does most of the work: a brighter limb segment that faces the craft at all times,
scaling with mass, racing around the rim under the craft during an orbit. Gravity drawn on the
thing that owns it. Four states: ahead, in reach, held, spent.

Identity hues are generated, not listed: `oklch(0.72 0.13 H)`, H stepped ≥50° between
neighbours, excluding the violet–pink band and the quality bands.

**And the fifth state is off the picture entirely: the sighting.** Spec
[03 · §6](../spec/03-hud.md) — a body the picture cannot show, marked on the edge of it in that
body's own hue, ahead of the climb only, never for a body already on screen. It belongs here rather
than with the compass because it is the same hue machinery answering the same question one state
further out, and because it is **always on**: the compass needs an orbit, and a sighting is the
whole of what a coasting craft has to read. Direction 03's dot in identity hue is the whole of what
is built; the prototype's distance labels and its ring on the offered body are recorded in §6 with
their evidence and are not.

**It is the other half of spec [00 · §7](../spec/00-tokens.md)'s ruling and not a decoration on
it** — *"markers to objects off-screen is the way we deal with the information loss of fixing the
width"* (author, 2026-08-28). With the width fixed and the height flexing, the body a craft next
grabs is off the picture at the moment of release **32%** of the time on a phone in a browser,
against 12% today, and a sighting is what that 32% reads instead. **So this lands before
[M3.1](./m3-the-field.md) changes the fit**, which the milestone order already gives — it is
written down because an ordering nobody wrote down is an ordering that gets swapped.

**Acceptance**: the four states are visually distinct and assertable in presentation state;
the tide tracks with lag; hue generation obeys the exclusion rule; a body on screen has no sighting
and one behind the climb has none. **Verify**: `pnpm test` plus eyes.

### Done, 2026-08-28

**A hue is a name, so it is generated a layer below the paint.** Spec 00 §2 fixes the lightness
and the chroma *"so that every identity is equally loud"*, which leaves exactly one free
coordinate — and that one is a **number on presentation state**, derived per tick from the
body's address. It has to be: *"two live targets too close in hue to tell apart"* is spec 04
§5's one reason to print an address, and that is a fact about the field that no test could
reach if the hue were chosen inside a `fillStyle`.

**The step is the golden section of what the reserved ranges leave**, and that is the one real
decision in this step. Spec 00 §2 closes four windows and stops generated blues short of
AURORA, leaving three arcs totalling **167.3°** to fit a day's forty bodies into at ≥50°
between neighbours. Measured over 200 addresses the golden step gives **63.9°** between
neighbours, 39.5° two apart, 24.4° three apart, and **40 distinct hues** in a day. A step
*tuned* to this arc beats it on neighbours — 106.9° at a stride of 66.94 — and does it by
sitting a hair off `2/5` of the arc, which collapses to **six** repeating hues the moment the
arc changes length. §2a's colour-vision sweep is flagged to change exactly that length, so the
tuned step is a number that would quietly stop working and the golden one is not.

**One reading is recorded rather than assumed.** Spec 00 §2's four windows, read strictly,
leave **315.5 – 337.7** open: a magenta shoulder on ION's own window, in the one hue the world
reserves for risk. This milestone's own brief describes the rule as excluding *"the violet–pink
band"*, and that is the reading taken — the range is shut in
[`hues.ts`](../../src/state/hues.ts) with the argument beside it. **And flying it found the
other end of the same question**: an identity generated just above 17.7 reads as a soft salmon
at this lightness and chroma, which is close enough to ION that it is worth the sweep's
attention. It is not fixed here, because §2a *"has authority over every hue value and every
separation number in this spec"* and this is one.

**The tide's three numbers are one number.** §2 requires that a heavier body reach with a
longer, brighter, tighter-tracking tide and that *"the three must move together and
monotonically with mass"* — a promise three separate formulas break silently the first time one
is edited. All three are readings of `pullOf`, which is `m / (m + median)`: strictly monotone,
bounded, and exactly a half at the median body, so §2's stated reference values fall out of it
rather than being written twice. **The saturation is not a flourish**: an arc lives on a circle,
and a law with no ceiling eventually draws a body whose tide is a ring. The curve between the
reference point and the ceiling is an **opening position** — §2 states the direction and the
reference and not the law — and it is on the bench.

**SPENT is the first memory in this layer that never converges, and it is named rather than
smuggled.** ADR-0015's third rule is that every carried value eases toward something the
current tick determines; a spent body stays spent for the run, because *"a field of spent
bodies behind the craft is the run's scoreboard, drawn in the world."* The rule does not reach
it, and the reason is the shape of the failure the rule guards against: **an eased value is a
feedback loop** — computed from itself every tick, so a wrong tick feeds the next one — while a
latched event flag is never an input to its own next value and has no path by which it drifts.
It can only be wrong from the start, which is the same exposure the recipe has. It is stored as
the previous tick's `state`, so a body's state lives in exactly one place. **This is worth the
author's eye**, because it is a genuine widening of what ADR-0015 contemplates and the ADR does
not say so yet.

**Sightings are pinned to the design space, and that is a decision.** *"Off the picture"* has to
mean *outside the design space* rather than outside the buffer, because a device shows the
design space plus whatever bleed its shape allows and presentation state must not know that —
ADR-0006's promise stops being true the moment the count of marks depends on a viewport. So the
marks sit on the design space's own edge, in **design-space coordinates**, alone among the
positions in this layer. The cost is stated: a wide desktop window can show a body in the bleed
*and* a mark for it. A world position would also shimmer, because the renderer interpolates the
camera between ticks and the mark would slide against the edge it is pinned to.

Three rules decide which bodies get one. Two are §6's — not on screen, not behind the climb —
and the third is derived rather than invented: **a spent body has none**, because §6 draws the
mark in the body's identity hue and spec 04 §3 says a spent body's lamp is out. There is no
fourth, because *"reach is not yet a number"*: §6 defers it to spec 17 and draws every body
ahead until then. **They never land under the thumb line** and are not clamped to avoid it — a
body ahead of the climb cannot be far enough below the camera to put a mark there, and the test
holds the geometry to it rather than the arithmetic.

**The palette lint got stronger on the way past.** Identity is the one colour in the game that
is *built* rather than named, so it arrives as a template — and the lint only scanned plain
strings, which meant any file in the render layer could have assembled a colour out of
`` `oklch(${…})` `` and passed. It scans template pieces now, and `palette.ts` is still the only
file allowed to write one down.

**476 tests, 43 files.** Spec 04's acceptance is asserted without a canvas — the four-state
journey over the run `pnpm replay` ships, the E2-at-grab and E0-at-release ticks exactly, the
tide's lag bounded and non-zero through a settled orbit — and §1's *"radius 20 and radius 200
produce identical stroke widths"* is asserted against a context that records what it was asked
to draw. The bench grew a fourth card. `CONTEXT.md` gained **strata** and **spent**, **body**
gained its four states, and **tide** gained the sentence that the lag is the point.

---

## M2.3 · The compass

Spec `00-tokens` and `06-awards`. Coloured windows on the orbit path, in the body's own hue
so target and window never need a legend. The hand, the dot, the crossing dots. Windows heat
in place as aim closes.

The grading zones live here: the make, then TRUE at the inner 60%, SHARP at the inner 30%,
PERFECT within ±8% of centre and never under 1.5°. **Zones scale with the window**, so a
PERFECT on a needle-thin arc is a different feat than on a barn door and the arc's width
already said so.

**Acceptance**: grading is computed in the simulation, is deterministic, and a recipe replays
to identical tiers. **Verify**: `pnpm test`.

### Done, 2026-08-28

**The compass is a fact the world can be asked for, and two of this game's own rules are what
make the question answerable.** A **coasting craft feels nothing, from anything, at any
distance** (spec [01 · §2](../spec/01-swing.md)), so a release is not a trajectory to integrate
— it is a straight ray, and where it goes is a line-and-circle problem. And **the nose points
along the exit tangent for the whole orbit**, so the release *angle is the aim*, with nothing
else to steer by. That is why the instrument can be drawn on the orbit path: the path and the
aim are the same coordinate, which is spec [01 · §11](../spec/01-swing.md)'s tension in one
sentence — the **envelope** is a shape in time, the **window** is a shape in angle, and hitting
both means shaping the dive so they arrive together.

So a window is **where you actually end up**: every release angle is answered with one body, the
first whose grab range the ray enters, and a window is the arc of angles answered with the same
one. The windows therefore partition the orbit instead of overlapping it, a body hiding behind a
nearer body gets no window at all, and every arc is a promise the press will keep, because the
range it is measured against is [`grab.ts`](../../src/sim/grab.ts)'s own. **The width is earned
rather than assigned**, which is what makes spec 00 §6's *"the arc's width is the posted odds"*
true instead of asserted.

**Two readings were built and rejected, and both failed loudly enough to be worth recording.**

| Reading | What it drew | Why it is wrong |
|---|---|---|
| The ray passes within grab range, unbounded | **23 rings** | The median body is on offer from 1 680 design units, so a line up a corridor eventually passes near everything in it |
| The first body whose range the ray *enters* | **one 360° window** | A craft on its orbit is routinely already inside a neighbour's range, so that neighbour answered every angle. Asking where the ray gets **nearest** instead makes flying away from a body you are standing beside a release that does not arrive at it — which is what it is |

**How far the ray is traced is not an invented number.** Spec 00 §6 says *"one ring per
**reachable** body"* and does not say what reachable is — the same hole spec
[03 · §6](../spec/03-hud.md) records for sightings and spec [17](../spec/17-daily-field.md)'s to
fill. Rather than pick a distance, the ray is traced **exactly as far as the craft could
survive**: it stops where spec [01 · §10](../spec/01-swing.md)'s own endings stop it — outside
the corridor, past its foot, or below the fell-behind line. A window past that is a promise the
field itself breaks.

**And the ring count is measured.** Left open, the geometry offers ten to sixteen rings at once,
which is not an instrument. Over 120 pilot runs and **342 releases that reached another body**,
the body the craft actually grabs next is among the **four** nearest to the one it just left
**100%** of the time — 99.7% at three, 92.7% at two, 68.1% at one. Four is where the cohort runs
out, and it is close to what Direction 01's board draws. They are ordered **nearest first and
not best-aimed**, because a stack sorted by aim would reshuffle its own radii every tick and the
distance between two bodies never changes. The cohort is the headless pilot's and is a stand-in
until recorded play replaces it (spec [01 · §13.7](../spec/01-swing.md)).

**The rings breathe, and that is the point.** The innermost is the craft's *own* radius, so the
crossing on it is the craft and the trail behind it lies on the path actually flown; through the
settle the whole stack swings with the oval. Spec 00 §6's rings are circles and an orbit
mid-settle is not one, and the craft's radius is the only anchor that keeps the trail and the
innermost ring the same line.

**Two things the specs say that this step could not build, recorded rather than invented.**

- **The label.** Spec 00 §6 puts *"a chip at its window's tip"* on every ring, and spec
  [04 · §5](../spec/04-bodies.md) rules that in a run an address chip appears in **exactly one
  case** — two live targets too close in hue to tell apart. The board's `P11` chips are retired
  and a body is named by hue in the run, so a label that is not an address has nothing left to
  say. **One of the two is stale and the specs do not say which.** Nothing is drawn, and the
  collision rule that goes with it (*"if two window tips come within 12°, the outer label slides
  along its own ring"*) is unbuilt with it.
- **The word `ghost`.** Spec 00 §6 calls the mark where the hand cuts a ring a *ghost*;
  `CONTEXT.md` spends that word on **a recipe played back beside a live run**. One word for two
  things is the fork [AGENTS.md](../../AGENTS.md) §2 exists to stop, and this milestone's own
  brief already writes *"the crossing dots"* — so **crossing** is the word, and the glossary now
  says so on both entries.

**What flying it found, beyond the picture.** Spec [06 · §2](../spec/06-awards.md)'s **1.5°
floor** under the PERFECT zone is absolute while every other zone is a fraction, so the narrower
the window the larger a share of it pays the top word: **42%** at the fixture field's p10 width
of 7.2°, against **16%** at 40°, and *all* of a window under 3°. That is spec 00 §6's own
*"automatically a better-paid one"* as a mechanism rather than a defect, and it is worth seeing
before M4 prices it. Graded against the pilot's own 351 releases the compass calls **77% of them
misses** — which is not a verdict on the pilot but the same finding the M1 gate recorded from the
other side: *"the split inverted because half of the decision is missing"*, and the pilot has no
compass either.

**509 tests, 46 files.** The load-bearing one runs the whole instrument through `stepSim`: hold
until the hand reaches a dot, let go, coast, and assert the craft **arrives within that body's
grab range** — nothing read back from the compass's own arithmetic, because an instrument that
is merely self-consistent would draw a beautiful arc for a body the craft cannot reach and
nothing would fail. Spec 06's four zone boundaries are asserted exactly and from both sides,
with its own worked examples (`W = 15°` → 1.5°, `W = 40°` → 3.2°) written as the spec writes
them. `SIM_VERSION` did not move: the compass is asked *of* a state and never writes to one, and
a test holds it to that. The bench grew a fifth card.

---

## Flown, 2026-08-29 — what six notes moved

The author flew M2.1 – M2.3 and sent six notes. Two of them were the prototype telling this
repo it had already solved the problem and been ignored, and the rest are rulings.

### The prototype had already measured two of these

**The compass bounced because it was anchored to the craft.** M2.3 stacked the rings on the
craft's *live* radius, arguing that a stack swinging with the oval reads as an instrument drawn
on the thing it describes. The prototype's own compass carries the measurement of exactly that:
*"frozen, it made the ring pump out and back as the ship swept periapsis to apoapsis and home
again — measured on a real capture, 85 out to 97 and back over about a second, on top of a curve
the player is trying to read."* Its fix is the one now taken — anchor to the **periapsis**, which
the freeze fixes and nothing afterwards moves.

**Every body glowed because AHEAD was read as E1.** Spec [04 · §3](../spec/04-bodies.md)'s
energy column says *"E0–E1"*, and M2.2 took the top of the range, lighting twenty-four bodies at
once. The prototype gates it on live pull and its comment is unambiguous: *"the bloom is not
always on, and the board says so."* What survives at E0 is the rim, which is §3's other
sentence — *"a constellation of dim coloured rings, never a row of grey balls."* **Rings, not
blooms.**

That gave the layer a quantity it was missing: **grip**, how hard a body has hold of the craft
right now, normalised against the pull at its own floor. It is what gates the bloom and what the
wide faint halo the author asked for is drawn at — *"faded by pull, so a field of distant bodies
is not sixty haloes"* is the prototype's reason and it is the right one.

### The window was measuring the wrong thing

*"Up close, the grab lines are often way too wide, sometimes spanning half a circle."* Measured,
p50 **360°** — and true: the window was the set of releases landing within **grab range**, which
is 1 680 design units against a field spaced nearer 700, so from most of the orbit you genuinely
can reach it. That is a fact and a useless one.

The author's own framing is the fix: *"I don't want to highlight grabbable for most planets, but
instead — if I release here I'll have a good chance of getting a high quality capture."* So the
window is measured against the body's **floor**, which is the one guarantee a grab makes: inside
the arc a release arrives at a *dive*, outside it merely in reach.

| the window is where a release lands within… | p10 | p50 | p90 | max |
|---|---|---|---|---|
| the grab range (what M2.3 built) | 220° | 360° | 360° | 360° |
| the **floor** | 18° | 24° | 40° | 77° |

Three sources agree on that scale: spec [06 · §2](../spec/06-awards.md) works its examples at
**15°** and **40°**, and the prototype draws a fixed **40°** wedge. Flown on the fixture field
the built version lands p50 **18.6°** and never above 20.4°.

**Two bounds came with it, and neither is invented.** `AIM_RANGE` — the prototype's, about two
body-spacings — is what spec 00 §6's *"reachable"* has always been missing, and it bounds the
**partition** rather than only the drawing: bounding only the drawing left bodies far up the
corridor still *winning* release angles nobody would fly to, which squeezed half the drawn arcs
below the minimum. And a **minimum width**, ruled: *"for very distant planets we still need to
show a window... it's more important that the player knows roughly where to aim with little
screen clutter than showing them exactly where they need to release, because it's so randomly
timed anyway."* Fifteen degrees, which is spec 06's own narrow example — and at that width §2's
1.5° PERFECT floor still binds, so the top word does not get easier for being far away.

**The compass grades the width it draws**, because the minimum makes earned and drawn diverge
and the prototype's rule decides it: *"the player must never be scored against something they
cannot see. One sweep produces the rings that get drawn AND the alignment that gets paid, so the
two cannot drift apart."*

### And the rings say how far

*"I don't want the orbits to be equidistant; instead I want the distances between the compass
orbits to be indicative of how far away the planet is."* Which is the prototype's formula
exactly: a fixed clearance from the orbit, then an offset proportional to the body's distance,
clamped at the aim range. So the innermost ring is the next hop, and reading the stack is
reading the field.

### The path is the oval, and it rounds out

*"The trail that shows behind the ship when we orbit isn't always aligned with the orbit taken by
the ship... on an eccentric oval initial orbit we see the oval with a thin light line, and this
oval then changes shape over the course of the trajectory to round out into the true orbit."*

It was an arc of a **circle** at the ring anchor, which is not the line being flown. It is now
the simulation's own ellipse, sampled from [`pathRadiusAt`](../../src/sim/orbit.ts) at the shape
it has *this tick*, handed over as points rather than as three numbers the renderer would have to
know the formula for. Through the settle it is visibly eccentric and by the end of it it is a
circle — which is spec [01 · §6](../spec/01-swing.md)'s settle, drawn for the first time.

### Three things were deleted

- **The E3 at the grab and at the release.** *"Let's let the PLANET speak about our grab, not
  some ambient glowing orbs."* Spec [04 · §3](../spec/04-bodies.md) already had it doing that —
  a held body is E2 and alive, and the compass draws itself around that glow — so the flash was
  a second voice saying the same thing. **The release goes quiet**, accepted: the award word and
  the farewell ring are M2.4's, and the craft's stretch is what marks it meanwhile. The slot and
  its decay stay, for the award and the checkered line.
- **The inner ripple.** *"What's the purpose of the innermost ring within a planet, that also
  has a tide tracking my orbiting ship?"* It is spec 04 §2's one sentence about a stratum
  tracking the tide, and the prototype never implemented it. The **strata** stay; the thing that
  tracked is gone.
- **The tide on every body in reach.** Spec 04 §2 says *"present on every body within grab
  range"*, which on this field is most of them at once. It is on the body a press would take, or
  the one already held — the prototype's `TIDE_ONLY_ON_THE_OFFER`, and its reason: the tide is
  the body **reaching for you**, and that is the one a press would answer.

That last one needed a fact the layer did not have: **which body a press would take**. Spec
[03 · §6](../spec/03-hud.md) records it as worth revisiting *"once the compass exists"*, and it
does, so `BodyView` carries `offered` — [`bodyOnOffer`](../../src/sim/grab.ts)'s own answer, so
the picture and the press cannot disagree.

### Sightings point now, and say how far

The 2026-08-28 ruling that **a sighting does not point** is reversed (author, 2026-08-29): *"the
coloured dots — personally I hate them"*, and on the maxim that forbade the alternative, *"this
is another instance of an original rule being too strict."* They are arrows in the identity hue
with a distance beneath, fading with range, at full strength for the body a press would take.

**The label is a distance and not a name**, which is a reading and is recorded as one: the
author called the labels *"a different class"* from the retired `P11` chips, and that retirement
is explicitly about naming. Identity stays hue-only. The number is set in Archivo with tracked
figures rather than in the prototype's monospace, because spec
[00 · §4](../spec/00-tokens.md) rules that nothing in the game is set in a monospace face —
raised rather than assumed.

`SIGHTING_RANGE` closes the other half of §6's *"reach is not yet a number"*, carried from the
prototype and still spec 17's to replace.

## Flown again, 2026-08-29 — four more, and the compass got simpler

A second dispatch, and four notes about the instrument. Answering them **removed** the whole
partition machinery M2.3 built: the model is now the prototype's, and it is about half the code.

**Windows blinked because the ring set was derived from the geometry.** M2.3 worked out which
body each release angle would *arrive at* and made a window of each run of equal answers — so as
the orbit rounded, the answers shifted and windows appeared and vanished under the player.
*"This is unacceptable. Once they're on the compass they should stay."* The targets are now
chosen from the **field**: bodies above the held one, within `AIM_RANGE`, nearest first. Nothing
in that changes while a body is held, so nothing can blink — over a whole swing the ring set is
one set, asserted. It brings the prototype's **upward-only** rule with it, and its reason:
*"offering the planet you just came from as an equal option invites you to bounce between two
bodies forever, which is a local maximum neither the compass nor the score should signpost."*

**The dot is solved now rather than sampled.** It was the minimum of the miss *within the arc a
body won*, so when the true best release lay where another body won, the dot sat at an edge —
which is what *"I'm not convinced the compass windows are appearing where they should"* was. It
is now the root of the signed heading error: a coarse sweep brackets the crossing and bisection
lands on it, exact to a thousandth of a degree, which is the prototype's method and cheaper than
what it replaced. A test asserts the exit tangent at the dot points at the body to within 0.01
rad.

**And the window around it is hand-wavy on purpose.** *"They don't need
mathematical/physics-based precision... most of the windows should be a bit wider to give me a
better opportunity to score well."* `WINDOW_REACH` is how generous *near* is, in floors: at two,
the widths go **p50 18.6° → 36.6°**, p10 28.4°, max 40.9° — which is Direction 01's own fixed 40°
wedge and spec 06 §2's wider worked example.

**Occlusion stopped deleting windows.** The partition handled a body behind another by giving it
no arc — which is the blinking again. A blocked run is now **reported and dimmed to 30%**, on the
prototype's reason: *"a marker that points at a planet you cannot actually reach is worse than no
marker, and paying points for aiming at one would be worse still."*

**Stacked windows push their rings apart.** *"There should be some minimum distance between
compass windows that are essentially stacked on top because their direction is so similar."* When
two arcs overlap, the outer **ring** slides out until they clear — the ring and not the arc,
because moving an arc would put the dot somewhere a release does not go. It is the instinct spec
00 §6 already has for labels (*"the outer label slides along its own ring until clear"*), applied
one element up. The radius stops being exactly proportional to distance when it bites; the order
still says which body is nearer.

**And the glow arrives before the hand does.** *"When I hold an orbit and spin around, the
compass windows pass too quickly. This is something the original gets right: the windows start
glowing before I touch them, which helps me predict when to click."* The heat was measured
against the window's own width, so a window was dark until the hand was inside it — and measured,
**the hand is inside an arc for 3 to 4 ticks, 50 to 67ms**. It now ramps over a **quarter turn**,
which is the prototype's `alignment` and its own note on why it is one function: *"the compass
brightens on it, the ship's halo fades in on it, and the score pays for it — so it is defined
once."* Measured, a window is lit for **15 ticks, 250ms**, before the dot — nearly four times the
warning, on the same geometry.

**One thing the notes imply and this cannot fix.** *"The far away ones feel really tricky to aim
for and that makes me WANT to aim for them, even though I want to guide players to slingshot to
nearby planets."* Widening helps the aiming and does not touch the pull, because the pull is the
**pay**: spec 00 §6 rules that a narrow window is *"automatically a better-paid one"* and spec 06
§2's zones scale with the width, so the hardest window is worth the most and the far one is
hardest. Guiding play toward near bodies means pricing distance, which is spec
[08](../spec/08-economy.md)'s arithmetic and **M4's**. Recorded here so the step inherits it.

## Flown a third time, 2026-08-29 — four notes, and one of them was not a bug

**The oval fades in from the press.** *"As soon as an oval orbit is possible I want it to fade
in, not just snap into view."* [`predictOrbit`](../../src/sim/orbit.ts) is the osculating ellipse
of the live state — the path the craft is on right now, which through a dive it genuinely is —
and the compass draws it from the moment gravity binds the craft at all, faded in over about a
quarter of a second and dimmer than a frozen one. It converges on the frozen orbit, so the freeze
is not a moment the path jumps at. The prototype found the same hole from the other side: before
periapsis it drew nothing, *"measured on a real session, 2.0 seconds of blank sky from the grab —
the entire dive, which is precisely when a player is deciding where this capture is taking
them."*

Two approximations are stated in the code rather than hidden: it does not model the
**clearance**'s remaining turn, so a dive that owes one is coarser early and sharpens as it goes;
and where the natural periapsis would fall inside the **floor** the ellipse is scaled up to sit
on it, because the floor is the one guarantee a grab makes and an oval diving through a body
would be a prediction of something that cannot happen.

**And the fade is not spec [00 · §5](../spec/00-tokens.md) being broken.** *"Things arrive; they
do not fade in"* governs elements *entering*, and the softness it forbids is exactly the defect.
What fades here is a **prediction firming up** — the answer, not the element.

**The compass shows bodies below again, and the climb moved into the press.** Filtering the
instrument to bodies up the climb was the prototype's rule and it was the wrong half of the idea:
*"show all nearby planets on compass, both ahead and below, but when I'm traveling and grabbing
planets, somehow favor grabbing ahead planets more than lower ones. This helps the game move
upwards, but also lets players catch a breath and go back down a rung for e.g. a powerup."* So the
picture shows everything reachable and **the grab leans upward** — a preference the player can
overrule by flying at something, where a filter is one they can neither see nor argue with.

It had to be smooth. Spec [01 · §3](../spec/01-swing.md) is emphatic that a threshold is *"a
cliff the player falls off as a body drifts across an arbitrary line"*, and a flat penalty on
everything below the craft puts that cliff at the craft's own altitude. `CLIMB_BIAS` weights
**how far** above or below, saturating on `rise / (1 + |rise|)` — the same shape grip and the tide
already use — measured in the body's own grab range, so no new length is invented.

**Swept over 200 pilot runs**, downward grabs fall 15.3% → 13.8% → 12.8% → 9.5% across 0, 0.3,
0.5 and 0.8, with the median climb unmoved and the endings within noise. That is **weak evidence
and says so**: the pilot presses at sampled distances rather than choosing a target, so it mostly
measures the field's geometry. 0.5 is where it starts and the author flying it is what settles it.

**`SIM_VERSION` is 3.** A press can now take a different body from the same log, which is exactly
what that number exists for — every dispatch recorded before now is refused with its version in
the message, and the run `pnpm replay` ships is re-recorded at the new one (2 775 ticks, from
3 598).

**The tide grows into its width, and it is an A/B.** *"Right now the tide markers flash in at some
default width. I'd love if they grew into their width based on my distance... a waterdrop effect
when it first bubbles in. Can we A/B test this?"* `TIDE_GROWTH` is the dial: at **0** the width is
mass alone, which is spec [04 · §2](../spec/04-bodies.md) as written and what shipped yesterday;
at **1** it is mass × grip, which is the prototype's own reading — it lerps the span by live pull,
not by mass. Nothing is deleted at either end, so the comparison is one slider and the run does
not restart. It starts at two thirds, where mass still sets the ceiling and proximity decides how
much of it is showing. Measured, a half-width of **6.3° at grip 0.03 opening to 18°** — and the
droplet falls out rather than being drawn, because a few degrees of round-capped arc *is* a bead.

### The last grab was not a bug, and the instrument it exposes is missing

*"At the last planet grab I felt that I slowed down a LOT in the orbit. Can you triple check the
physics/math here?"*

**The maths is exact.** Over the 302 ticks that swing spent settled, `v / circular = 1.000000` at
every one of them and the radius held at 272.50 — a perfect circular orbit, no drift. The 43% net
loss decomposes into three things, all of them specified:

| | |
|---|---|
| The **freeze clamp** | Arrived at 1 181/s; the freeze hands out an orbit at 0.98 of escape, which is 837. Spec 01 §6a's own mechanism — *"approach speeds of 200 and 260 from the same distance freeze at the same 435"* — and it bites hardest on a fast arrival, which is what makes four dives ride one ellipse |
| The **settle** | 837 → 604 over 72 ticks, to circular speed at the frozen periapsis. §6a: *"the reward for a good dive is a speed advantage with a 1.2-second shelf life"* |
| The **hold** | 373 ticks after the freeze. The boost envelope is gone by **156** |

Across the whole run the pattern is visible and is the system working: a fast entry is clamped
hard and nets a loss, a slow entry is not clamped and nets a gain — swings alternate +109%, −51%,
+16%, −16%. That is spec 01 §5a's bounded escalation, and its evidence is a flat median speed
across altitude bands.

**What is actually missing is a clock.** Spec [01 · §11](../spec/01-swing.md)'s tension is the
**envelope** (a shape in time) against the **window** (a shape in angle), and M2 has now drawn the
window beautifully and drawn *nothing at all* for the envelope. The swing above held 2.4× longer
than the boost lasts and there was no way to know. **The prototype says it in words** —
`BOOST arming…`, `◀ BOOST PEAK — release!`, `BOOST fading` — at the top of the screen.

It is not built here, because it is a new readable element and therefore spec
[03](../spec/03-hud.md)'s and spec [00 · §4](../spec/00-tokens.md)'s: it needs a face, a place
above the thumb line, and a ruling on whether the game says this in words at all. **It is the
first thing M2.4 should be asked about**, and until it exists the gate is judging half of §11's
tension.

### And three from the same sitting

**The sliders were never on the dev server, and that was the honest answer to the wrong
question.** *"Where is the A/B slider? I don't see it on the dev server build."* The bench is a
separate build from a patched copy of `src/` — the constants stay `const` in the game, which is
AGENTS.md §6's whole argument — and it lived as a file on disk while the game lived at a URL. The
build is unchanged; what is new is that [`vite-plugin-bench.ts`](../../tools/vite-plugin-bench.ts)
serves that page at **`/bench`** in dev, so the QR that puts the game on a phone puts the knobs on
the same phone one path along. It refuses rather than serving a stale page: if `src/` has changed
since `pnpm bench` last ran, the sliders would be wired to an older copy of the simulation, which
is the failure `test/bench.test.ts` exists for.

**A planet's bloom takes a third of the energy table's strength.** *"I don't want that glow effect
on the planet ring when I grab it. Maybe just lessen it a lot?"* A held body jumps to E2 — three
times E1's radius, in its own hue, hugging the rim — and lands on top of the grip halo at its
strongest, so the rim read as lit rather than as a rim. `BODY_BLOOM` is a **body's** scale and not
the table's, deliberately: Direction 01 rules *"the craft is the brightest object on screen,
always"*, and dimming the shared number would have dimmed the craft with it. The ordering across
the four steps is untouched.

**The compass comes online with a pop, and the thing being remembered was a bug.** *"When I
grabbed and captured, the compass would grow/shrink bounce a little... it made the grab and orbit
feel dynamic, like my ship's HUD was coming online in orbit. I forget if this was accidental or
controlled as a feature."*

**It was accidental.** The prototype's ring radius followed the ship through the whole swing, and
its own comment records what that cost once frozen: *"it made the ring pump out and back as the
ship swept periapsis to apoapsis and home again — 85 out to 97 and back over about a second, on
top of a curve the player is trying to read."* It removed it. M2.3 reintroduced the same thing by
a different route and the author reported it as bouncing two days ago.

So what is built is the half that reads as *arrival* rather than as wobble, and the design already
had it: spec [00 · §5](../spec/00-tokens.md)'s **ENTER** token — *"120ms,
`cubic-bezier(.2, 1.6, .3, 1)`, from 92% scale"* — fired once when the rings arrive at the freeze.
It uses [`home`](../../src/state/decay.ts), the same overshoot every returning value in this layer
shares, so the 1.6 in that curve is the rebound already argued for. **It scales the instrument and
never the path**: the rings, their windows and the hand's reach pop, and the orbit does not,
because the craft is on the orbit. A HUD coming online over a world that stays put is the thing
being described.

### The windows were moving, and it was three bugs wearing one coat

*"Sometimes the compass windows would move after initializing. This is not acceptable; the planets
don't move. We should only show stable targets. I think this is a bug"* (author, 2026-08-29).

It was three, and only the first looked like one.

**The dot was chosen from two exact answers by floating-point noise.** A **circle** has exactly
one release whose tangent points at a given body — of the two tangent points, the orbit's
direction sends one at the target and the other away. An **ellipse** can have two, and through the
settle every orbit is one. Both are exact, so picking *"the root with the smaller residual"* was
picking on noise: measured on the dispatch, the dot flipped **46.6° in a single tick, twice**,
between roots at 191° and 237°. The tie-break is now the **shortest flight** — of the releases
that reach the body, the one that gets there soonest. Two other candidates were measured and were
equally still, so the choice is on what it means rather than on stability. Two roots are rare:
**7 target-ticks in 3 503**. And the coarse sweep was exonerated — it misses a root **0 times in
3 503**.

**The dot was computed on the orbit the craft was momentarily on.** With the flip fixed the dot
still slid, because the settle rounds the oval underneath it: measured, **p90 36° and up to 56°**
from where a window first appeared. That is a target moving out from under the aim closing on it,
which is the complaint exactly.

So the instrument is now anchored to the orbit the swing is **becoming** — same periapsis, same
north, same way round, and round — which is the anchor the **rings** already used. The whole
instrument sits on one orbit now, and the **path** still draws the one the craft is on, because
that is the line it is flying.

**What that costs is measured and is smaller than it sounds.** A dot fixed on the settled circle
is not exactly the tangent while the orbit is still an oval:

| when | how far the fixed dot's aim misses |
|---|---|
| **unarmed**, the first 27 ticks, where a release is paid nothing | p50 6.6°, max 35° |
| the boost's **plateau**, ticks 27 – 72 | **p50 0.62°**, p90 7.3° |
| **settled**, 72 onward | exactly 0 |

Against a window half-width of 18°. The error is largest where nothing is at stake and gone where
everything is.

**And the third bug went with the second.** The ring radius jumped a whole `STACK_GAP` — 56 design
units in one tick — whenever the sliding dots stopped overlapping and the unstacking let go. Fixed
dots make fixed overlap, so it fixed itself.

Measured over the run this repo ships, every ring's dot, width and radius is now **exactly**
constant for the whole swing — 0.00 at every percentile, not a tolerance — and a test asserts it
as equality over more than a thousand ring-ticks.

### And the instrument clicks out

*"When holding an orbit and release, the compass just disappears. Could we have it pulse out
slightly and then quickly in with a fadeout? So it looks like it clicks out?"* (author,
2026-08-29).

**It leaves on the curve it arrives on, reversed.** [`leaving`](../../src/state/decay.ts) is
[`home`](../../src/state/decay.ts) read from the other end, so the swell on the way out is the
same single overshoot ENTER lands on and the instrument's two ends are one shape rather than two
— which is what spec [00 · §5](../spec/00-tokens.md) means by the motion tokens being one grammar.
**And it does not pause first, which took fixing the curve's handedness rather than its size.**
*"It should pause even less and maybe disappear a touch faster"* (author, 2026-08-29). `home`
settles into rest with no remaining speed — a double root at its far end, and exactly what makes an
entrance land softly — so reversed, that double root becomes the **start**, and a motion that
starts with no speed is a pause. Rather than give the exit a second curve, its clock is hurried on
a square root: far along early, ordinary late, so the flat start is spent in a tick and the rest of
the span belongs to the part that is moving. One shape, two handednesses, and `Math.sqrt` is
correctly rounded so ADR-0014 has nothing to say.

Measured: it swells to **1.033 by the second tick**, is back through 1.0 at the fourth, collapses
to **0.74**, and is gone at **nine — 150ms**. The peak sits at a fifth of the span where it used to
sit at two fifths. *(Shortened again to **100ms** on the fourth flight — see below.)*

**One curve had to be added, and the reason is a measurement.** `fade` is the design's decay,
fastest at the start and slowing to nothing, which is right for an E3 that is over the instant it
has happened. Used here it had the compass at 30% opacity by the time it *began* to collapse and
under 13% through the collapse itself — the motion asked for, happening where it could not be
seen. `shut` is the same journey with the curvature the other way round, so the light holds while
the shape talks: the swell now lands at **79 – 87%** and the deepest part of the collapse is still
visible at **17%**.

**The path deliberately does not scale with it.** Spec [02 · §6](../spec/02-release.md) has the
orbit detaching from the body and expanding away in AURORA at exactly this instant — the same
moment going the other direction — so only the instrument collapses, and the expansion is left for
[M2.4](#m24--the-release--400ms) to put on the path rather than half-invented here.

The hand stays where the release happened, which is the thing still worth seeing, and the rings do
not move on the way out any more than they did on the way in.

### What this makes false in the specs, and is not edited here

`docs/` is author-owned and these are rebases rather than tidying, so they are listed for
approval rather than written:

| Where | The sentence the build has made false |
|---|---|
| [00 · §3](../spec/00-tokens.md) | E3's *"release, grab"*, and E1/E2's *"@ 35%"* and *"@ 60%"* — the radii are untouched and the alphas are 18% and 30% |
| [00 · §6](../spec/00-tokens.md) | *"window width encodes difficulty"* survives, but the width is now the **quality** band with a floor under it; and *"reachable"* now has a number |
| [02 · §7](../spec/02-release.md) | the grab's *"E3: Yes, at the grab point"* |
| [02 · §2](../spec/02-release.md) | the release's E3 flash row |
| [03 · §6](../spec/03-hud.md) | the whole *"a dot, not an arrow"* table, *"distance: not carried"*, and *"reach is not yet a number"* |
| [03 acceptance](../spec/03-hud.md) | *"a sighting is held to the same line: its position carries the direction and no vector is drawn"* |
| [04 · §2](../spec/04-bodies.md) | *"present on every body within grab range"*, and the inner ripple |
| [04 · §3](../spec/04-bodies.md) | IN REACH's *"E1 + tide"* — a body glows on grip, and the tide is on the offer |
| [00 · §6](../spec/00-tokens.md) | the **ghost** is a **crossing**; and a window heats over a quarter turn rather than over itself |

**548 tests, 46 files.** Every number that moved is on the bench, which is now at `/bench` on the dev server.

---

## Flown a fourth time, 2026-08-29 — the click again, and the brightness the tide was missing

### The click was still lagging, and half of it was a bug

*"Can we speed it up even more? It feels a bit laggy when I'm zipping around."* Two things were
true at once, and only one of them was the number.

**The number.** `EXIT_TICKS` goes 150ms → **100ms**, six ticks: out to 1.035 on the first tick,
back through rest on the third, in to 0.78, gone on the sixth. The hurried clock from the last
pass is what makes six ticks enough to still read as a click rather than as a cut.

**The bug, which is what "laggy" was actually describing.** [`leave`](../../src/state/compass.ts)
carries the hand through the exit, and the entrance was placed on `hand === null`. So a grab
landing inside those few exit ticks took the *other* branch and advanced an entrance that had
finished long ago — `advance(null)` is `null`, which is scale 1. **The compass came back at full
size with no bounce at all**, and only ever when the player was grabbing again quickly: the
HUD-coming-online bounce the author asked for two flights ago was missing from exactly the fast
play it was asked for. The test is now `exit === null`, and a test drives the seam directly —
the fixture field takes 65 ticks to offer a second body, so this branch cannot be reached by
flying it, and a test that cannot fail is worse than no test. It fails without the fix.

### And the tide grows brighter as well as wider

*"I also want the tide window to grow in brightness as I get near. So we can tweak each final tide
color to be a touch brighter than right now."* The width had grown into itself since the third
flight and the brightness had not: `strength` read `pull` alone, so a tide was exactly as bright
the moment it bubbled in as it was at the floor.

`TIDE_LIFT = 0.55` **lifts** rather than scales — `pull + (1 - pull) * LIFT * grip` — and that is
the whole design. The far end lands on `pull` exactly where the author already tuned it, so
nothing in the field gets dimmer, which matters in a game whose first note was *"all glow is too
much"*. The lift is spent on the range mass left unused, so a light body borrows more of it than a
heavy one, and the near end arrives brighter than anything that has shipped:

| body | far | halfway | near | before |
|---|---|---|---|---|
| light (pull 0.25) | 0.55 | 0.67 | **0.80** | 0.55 flat |
| median (0.50) | 0.70 | 0.78 | **0.87** | 0.70 flat |
| heavy (0.85) | 0.91 | 0.94 | **0.96** | 0.91 flat |

**Mass still orders them.** The derivative in `pull` is `1 - LIFT · grip`, positive everywhere
below 1, so at any fixed distance the heavier body is still the brighter one — spec
[04 · §2](../spec/04-bodies.md)'s *"reaches with a longer and brighter tide"* survives being made
to depend on distance as well. It is a knob on the bench beside the width's A/B.

### The tether dies as you float away from it

*"Can we have the capture tether line fade with distance? Sometimes I grab too late and float away
while tethered, and the dying brightness would be diegetic."*

**The hold ends on a release and on nothing else** ([`release.ts`](../../src/sim/release.ts)), so a
grab that never captures keeps its filament all the way out of the field. Measured: a body grabbed
from behind at speed never freezes and the craft drifts to **1.78 × the body's reach** still
tethered — with the line burning at exactly the brightness it had at the moment of the grab. It was
the one element on screen still insisting the grab was going somewhere.

**Measured against the reach, not against the grip**, which is the interesting part. Grip is the
physical truth and is the wrong curve to paint with: it falls as 1/r², and a body's reach is
**10.5 ×** its own floor, so grip at the edge of a hold is `0.009`. A filament painted with grip
would be invisible at the exact moment the player catches something at range — the opposite of the
note. Distance over reach is linear on screen, runs 1 → 0 across precisely the span the hold
covers, and is the same reading the rings already use for *how far*.

**It floors rather than dies.** `FILAMENT_FLOOR = 0.25`: past the reach there is nothing left to
feel, but a filament at zero takes the last evidence that the craft is still attached and still
spending a grab. What is left is a thread. The **near** end is untouched — at the freeze the craft
is a tenth of a reach out, so the filament burns at **0.93** of what it always did, alpha 0.279
against 0.300 flat. Same discipline as the tide's brightness: move the end that is wrong and leave
the end that was already tuned.

| | at the grab | at the freeze | floated away |
|---|---|---|---|
| before | 0.300 | 0.300 | 0.300 |
| now | 0.178 | 0.279 | **0.075** |

`CompassView.filament` **stopped being a boolean to do this**, and it lost nothing: the renderer
tells the dive from the instrument by whether there is a hand, so the flag was write-only. It now
carries the strength, which is the thing the renderer could not work out for itself.

### The hand got quieter, shorter and better marked

Three notes on one screenshot, all about the radial line through the craft.

**Dimmer.** *"I want the brightness of my radial line going to the center of the planet to be a bit
less."* It ran `0.35 → 1.0` and full CORE white made a bright bar across the middle of the
instrument. Now `0.18 → 0.55` — about half at both ends, so the aim still reads as brightening and
the line stops competing with the windows it is being aimed at. Spec 00 §6 states neither end, so
both are opening positions and both are knobs.

**It starts at the body's surface.** *"I want this line to end at the planet surface, not extend
from the center of the planet."* The part of the radius inside the body was drawing a line through
the thing it measures from. `CompassView` carries the held body's `rim` for it, and the inner end
deliberately does **not** take the instrument's `scale`: the rings pop in at the freeze and the
planet does not.

**And the filament starts there as well.** *"The tether/grab line when not orbiting should also
stop at the planet surface, not go all the way to the center."* The same reasoning one state
earlier, and the same `rim`. Guarded rather than assumed: a craft nearer than the rim would send
the line backwards out of the far side of the body, so that case draws nothing.

**The crossings ramp instead of stepping.** *"I'd like this arm to have small white-ish dots on the
compass orbits for each planet. These dots should also slightly increase in intensity as the player
orbits, like the windows."* Those dots already existed — the **crossing**, where the hand cuts each
ring — but they took the energy table, which is a *step*: E1 until the ring is under live aim, then
E2. So the mark that says *the hand is here* changed in one jump and said nothing on the way in.
On the window's own ramp (`CROSSING_AT_REST → full CORE` on `aim`) it brightens all the way round,
which is the thing that lets a player time a release.

### The iOS callout, and the reasoning that was wrong about it

*"We still have the double tap+hold magnifying glass and search/find menu issue on Firefox on my
iOS. I know we had a commit to fix this in the original repo, maybe look there to see what's
missing?"*

**What was missing is the touch defaults themselves.** `app/input.ts` cancelled `selectstart`,
`contextmenu`, `gesturestart` and `dblclick`, and argued in its own doc comment that `touchstart`
was the one hammer that could take the press with it, since the pointer events the game is bound to
are synthesised from touches. The prototype had already settled that in production, and says so
both ways: *"`preventDefault()` on `pointerdown` does not suppress the underlying touch default, so
the gesture has to be cancelled on the touch events themselves"*, and *"these listeners only call
preventDefault — gameplay still runs off pointer events, which are unaffected by cancelling a touch
default."*

It is safe for a reason worth writing down: **`pointerdown` fires before `touchstart`** and
`pointerup` before `touchend`, so the press is already recorded by the time the default is refused.
If anything it is safer than not doing it — a touch default left to run can start a scroll, and a
scroll is what sends `pointercancel` and drops the button.

**The other half of the prototype's fix is the exemption**, and taking the first half without it
would have made the page worse. A dispatch carries a note the author types, and a document-wide
refusal of `selectstart` takes away selecting, correcting and pasting in the one text field the
page has — which the blanket `user-select: none` in `index.html` was already half-doing. The touch
listeners are on the canvas and never see the chrome; `selectstart` and `contextmenu` are on the
document and now ask.

**Not verified on the device.** This is carried behaviour from a build that was flown, not
something reproduced here — Firefox for iOS is the one place it can be confirmed.

### Queued, from the same sitting

**A collision has no voice.** *"I want to show a quirky 'Clang!' or similar when I bounce into
another planet while holding a different one"* (author, 2026-08-29). Recorded here rather than
built: it is a **release-and-impact** moment and belongs with M2.4's vocabulary, next to the award
word — same class of thing (a word that blooms at the point that earned it, spec
[06](../spec/06-awards.md)), opposite register. Two questions come before any pixels: whether the
simulation reports the contact at all today, and whether a bounce costs the run anything, because
a word that appears when nothing happened is a joke told twice.

## Flown a fifth time, 2026-08-29 — the compass stops clicking and starts leaving

*"Before we added a kind of click or bubble effect to the compass when it disappears. It still
reads jumpy, and I think we should try just having it shrink in radius a touch and then fade
out."* Two sittings ago the exit was **built** as a click, on the author's own description of one;
flown twice, it kept reading as a jump. Measured, the idea was fine and the execution had two
faults, both of which are the kind a six-tick animation makes and a long one hides.

**The swell was one frame.** On `leaving` with its clock hurried, the scale ran
`1.000 → 1.035 → 1.017 → 0.964 → 0.882 → 0.777`: out on the tick after the release and already
back on the next. Sixteen milliseconds out and sixteen back is under the span at which the eye
reads a direction, so a swell that size does not arrive as a gesture — it arrives as a flinch.
Spec [00 · §5](../spec/00-tokens.md)'s *attack ≤ 2 frames* is a rule about things **arriving**,
where being over before it is seen is exactly the point; reversed onto an exit, the same number
buys the opposite.

**And it never faded out.** The last frame it was drawn on was **78% scale at 31% opacity** and
the next was nothing — a third-lit instrument cut off a fifth of the way through collapsing. The
acceleration made it worse: the steps ran −1.8%, −5.3%, −8.1%, −10.5%, so it was moving fastest at
the instant it vanished. `shut` existed to keep the light up *while the shape did something
dramatic*; with the drama gone, the reason for the special curve went with it.

**What it does now** is an even shrink and the game's own decay: 1.6% a tick with no acceleration
anywhere, and `fade` taking the light to **3%** on the last frame it is drawn, so there is nothing
left to cut off. `EXIT_BY` is no longer a taste — it is `1 - ENTER_FROM`, so the instrument leaves
by exactly the amount it arrived by and the two ends stay one gesture. That is what the reversed
curve was reaching for and got wrong by mirroring the *shape* instead of the size.

**Three curves were deleted with it** — `hastened`, `leaving` and `shut` in
[`decay.ts`](../../src/state/decay.ts) — because the compass exit was the only caller of any of
them and a curve nobody calls is a curve that rots. `home` stays, because the entrance still pops
on it, and `leaving` is one line to re-derive if M2.4's farewell ring wants a mirror.

**One caveat worth carrying into M2.4.** Part of what read as jumpy may not have been this at all:
the same sitting found that the phone's 1ms clock was handing `ticksDue` bursts of double-steps
([performance](./performance.md) §10), and a six-tick animation losing one tick to a jump loses a
sixth of itself. That is fixed too, and the two fixes have not yet been flown together. If the
exit still reads wrong, it is now a question about **this** curve rather than about two things at
once.

---

### And the tide became a thing that reaches

Four notes from the same sitting, and the last two corrected the first two — which is worth
keeping, because the correction is where the measurement was wrong rather than the taste.

**The crossing dots grew a hair.** *"At this size moving that fast they're hard to see."* Two
board pixels to 2.5. The reason is speed rather than size: the mark sweeps its ring at orbital
rate, and one that reads while still is not the same mark while moving. It stops short of the
window's own dot at three, because the window is the target and the crossing is the pointer.

**The tide swells as the craft closes.** It already grew in length and brightness; thickness is the
third reading of the same distance. The multiplier is the compass window's own — an arc in this
game that heats also thickens, doubling at full — so no new number was invented. What it swells
*on* was measured: over a real run the distance reading runs **0.31 → 0.88** across an approach
while the tide's strength runs 0.42 – 0.63, because strength mixes the body's mass in and a heavy
body would arrive already thick. That reading is now `CONTEXT.md`'s **closing**, kept apart from
**grip** — grip falls as 1/r² and is 0.009 at the edge of a hold, so it is the right thing to gate
a glow on and the wrong thing to draw an approach with. The grab filament had already learned that
and written the formula out inline; there is one function now.

**Then it tapered, and started at the rim.** *"There's big contrast between the planet's edge ring
and the tide, and I want the tide to seem like it's roundly growing out of the planet's surface
towards us."* Drawn as one arc it was a constant-width band with two cut ends, and the cut against
a much thinner rim was the contrast. It is walked in eleven segments now, thinning to **exactly the
rim's own width** at both ends and fading out with them — and it starts there too: *"let's have it
start at the same thickness as the planet surface ring, so that when I first approach I see it as a
light spot on the surface. When I approach it grows and pulls towards me."* So a distant body shows
a lit spot on its limb and the band is what closing buys.

**And the ramp was straight when it should have been squared.** *"The tide's thickness is a bit
too much at the start. I want it to really grow closer than this, right now it's a bit too
aggressively bold at a distance."* Run straight, the band was **1.8× the rim** the moment a body
came on offer. Squared it is **1.2×** there, **2.0×** at the median approach and **3.2×** at the
tightest orbit — almost nothing given up where the player is looking at it, and the far end taken
back to something barely thicker than the edge it sits on. Cubing was measured too and overshoots
the other way: it holds at 1.6× through the *middle* of the approach, so the growing happens too
late to be the thing the eye follows in.

**The tide starts as the rim's own colour.** *"Let's make the initial colour more similar to the
planet ring. I want it to be just barely noticeable, and then it'll grow in brightness."* What a
rim and a tide differ by is almost entirely **lightness** — 0.72 against 0.92, at alphas within a
few hundredths of each other — so both are carried on the same squared ramp the width uses, and at
the edge of a reach the two colours are byte-identical. A body far off shows its own edge, a little
brighter on one side, and nothing that reads as a second element.

**And a body no longer goes out on a tick.** *"The planet deactivation after release — can we at
least have it quickly fade out instead of just toggle 'off'?"* Spec 04 §3's *"the lamp goes out at
release"* was built as an instant, in a game whose every other transition is a curve. It now fades
over **210ms** — half of spec 00 §5's DECAY, and the halving is the author's: the token's own 420ms
was the first answer and *"about twice as fast"* was the second. Both looks are drawn at once
through it, the ash underneath and the burning body over it, because the crossing is identity hue
to DUSK and a canvas cannot mix two colours in one stroke.

**And the counter was worth re-learning.** The going-out was written first as a fraction stepped
down by `1 / SPEND_TICKS` a tick, and it landed on **2.8e-16** instead of zero — a thirteenth is not
a number a float can hold, so the lamp never quite went out and two tests caught it. That is
[`decay.ts`](../../src/state/decay.ts)'s own header, exactly: *"a multiplied value never reaches
zero, so something has to decide when it is close enough… a counter ends."* The file already had
the answer and it is a `Decay` now.

**And the lag was measured against the wrong thing, twice.** The first pass halved it — 20.3° to
9.0° at the median — on the argument that the lag should sit inside the arc's own half-width. Flown:
*"it seems like we moved the wrong way. I want the tide to be more directly under the ship."* The
taper is why. The arc no longer burns evenly, so what the eye reads as the tide is its **bright
middle half**, and against *that* the craft was still inside it only **11%** of the time. At
`k ≈ 30` the lag is p50 2.1° and the core covers the craft **91%** — and thirty is the last value
where the lag exists at all: at 45 it is half a degree, and spec 04 §2's *"a heavier body tracks
tighter"* stops being readable off the picture. **The lesson is the measurement, not the number**:
a statistic taken against a shape the renderer no longer draws will confirm whatever it is asked to.

---

## M2.4 · The release — 400ms

Spec `02-release`. The most choreographed moment in the game, and the numbers are pinned:
E3 flash at the release point; the craft leaving along its nose, stretched 1.5/0.7 along the
velocity vector, recovering in 180ms with one overshoot; the orbit detaching as the farewell
ring in AURORA; a camera kick of 6px along the exit tangent, home in 180ms.

**Rebase spec 02 first, and it is a real edit rather than a find-and-replace.**
[ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) withdrew the
70ms hitstop the file's whole timeline was dated from — flown, it read as buffering rather
than as punch. Spec 02 carries a notice saying exactly which lines move; this step is where
they move. What arrives in its place is **the release kick**, scaled by the quality of the
swing, which spec [01 · §7](../spec/01-swing.md) already defines for a swing that reached a
frozen orbit and [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
defines for one that did not. It is a **simulation** output, so this step presents it rather
than inventing it — and it can be presented loudly, because it carries none of itself into
permanent velocity and so cannot move what a run is worth.

**Never a shake.** A shake says damage; a directional kick says departure, and this game has
no damage — only commitment. The same kick at 3px marks the grab, reversed into the orbit,
so even the camera distinguishes catching from letting go.

**The kick is this step's rather than M2.1's, and there is a reason to know before starting
it.** It travels along the exit tangent, so it has a **horizontal** component — and
[`camera.ts`](../../src/state/camera.ts) does not move sideways at all until
[M3.1](./m3-the-field.md), on a decision M1.6 made and M1.4 confirmed, with
`test/state/camera.test.ts` asserting `camera.x` is the centreline on every tick of every
swing it flies. That test is right and the kick is right; what has to happen is that the kick
is a *displacement from* the camera's own position rather than a second opinion about where
the camera is, and the assertion becomes one about the camera's subject. M2.1 built the
machinery it needs — a displacement that homes past rest once — and stopped there rather than
half-landing it. **This is where the two meet.**

Motion law, applied everywhere from here on: attack ≤ 2 frames, decay ≥ 10× attack, enter at
120ms with overshoot from 92% scale, decay 420ms exponential, nothing persists past 600ms
except the trail. All streaks parallel to velocity — **nothing ever radiates from a point.**

**Acceptance**: every timing above is assertable at a named tick. **Verify**: `pnpm test`
plus the author's eyes.

---

### Done, 2026-08-29

**The step opened with a question rather than with code, and the question was the step.** Spec
[01 · §11](../spec/01-swing.md) says the game *is* the fight between an aim that wants one moment
and a boost that wants another — and the compass drew the aim in exquisite detail while **nothing
on screen drew the boost's clock at all**. So the M2 gate would have judged the aiming half of the
game with the timing half invisible.

The evidence brought to the author, from their own seven replayable dispatches — 83 converted
releases:

| where the release fell | count | share |
|---|---|---|
| before the boost had armed | 28 | **34%** |
| inside the plateau | 28 | 34% |
| while it was decaying | 25 | 30% |
| after it was gone entirely | 2 | 2% |

Hold since the freeze: p10 **5** ticks, p50 **54**, p90 **91**, max **303** — against an envelope
that is zero from 156. The 303 is the swing reported as *"I felt that I slowed down a LOT in the
orbit — can you triple check the physics/math here?"* The physics was clean (`v / circular =
1.000000` at all 302 settled ticks); what happened is 147 ticks of holding against nothing, with
no way to see it. And of the boost their dive had already earned, timing threw away **p50 14%,
p90 85%**.

Four ways of saying it were put up, with what each would cost. **Ruled: on the orbit path**
(author, 2026-08-29) — light the arc already flown with what a release along it would have been
worth. It is the most diegetic of the four, it adds no element, it spends brightness (the game's
only ordinal channel), and it puts both halves of the tension on one circle: measured, **the
plateau covers 0.45 of a revolution** at p50 over the 27 orbits that reached its end, which is spec
01 §11's own 43% arriving from the picture's side.

### The flown arc, and the two things that had to be got right

`CONTEXT.md` gains **flown arc**, because spec 00 §6's *"trail"* and the craft's own line through
the field were one word for two things — the same collision *ghost* had, and AGENTS.md §2 is the
rule that catches it.

**A bug had to go first, and it had been there since M2.3.** `swept` read `orbit.phase`, which
**stops advancing at the end of the settle**: after 1.2s the phase is closed-form and `phaseAt`
computes it forward without writing it back, because that field is the datum the multiplication is
measured from. So the drawn arc froze at 4.76 rad while the craft kept going round it, and the
one-turn cap the field carried could never fire, because the value it capped never got there.
`orbit.ts` now exports `sweptSince` and the compass asks rather than reads.

**And the shading is measured rather than assumed.** Two of the envelope's three corners are free:
the plateau ends exactly where the settle does — spec 01 §7 says that is *"not a coincidence"* —
and everything after it is one multiplication. The ramp falls **inside** the settle, where the
phase is accumulated at substep resolution and has no inverse. Cutting the ramp at its two ends and
shading between them evenly along the arc is wrong by **0.19 of the range**, measured over 55
swings, and wrong in the direction that matters: the craft leaves periapsis at its fastest, so an
even light says *the boost armed sooner than it did* — the exact error the element exists to
remove. Latched a tick at a time instead, the light is within **0.037** of the envelope's own value
at every one of 78 840 sampled points.

### The rebase, which was a real edit

Spec [02](../spec/02-release.md) is rewritten, not find-and-replaced. Rule 1 withdrawn and the
three rules are two; §2's timeline dated from `T0`; §3 reframed; §5 replaced by **the punch**; §7's
grab hitstop gone; the acceptance criterion about hitstop advancing zero world state gone with it.

**One contradiction had to be settled rather than carried.** Spec 02 §2 ended the award word at
`T+510ms` and spec [06 · §4](../spec/06-awards.md) gives it a 120ms pop, a 1.2s linger and a 400ms
decay — **1 720ms** — and then cites spec 02 for the 510. They were never consistent. The rebase
notice's own rule settles it: *"every duration measured from the start of its own element is
untouched"*, so spec 06's durations stand and spec 02's end column moves. What keeps spec 00 §5's
*"nothing persists past 600ms"* true is spec 06 §4's next line — after its pop the word is
**world-anchored**, so what happens to it after 600ms is that the world carries it away. **The
linger is on the bench**, because that reading is the author's to confirm.

### What was built

- **The punch** ([`punch.ts`](../../src/state/punch.ts)) — 6px along the exit tangent at full
  quality, √quality on the size and half again as long at the top of the envelope (ADR-0012's *"as
  size and as duration"*), 3px reversed and ungraded at a grab. **The conflict M2.1 left is
  resolved rather than avoided**: the punch is a displacement *from* the camera's position, and
  `test/state/camera.test.ts`'s centreline assertion is now about the camera's **subject**. It is
  the only thing in the game that ever takes the view off that line.
- **The callout** ([`callout.ts`](../../src/state/callout.ts)) — the word at the dot that earned
  it, carrying the window it was taken on, so *"unused rings die instantly; the taken window stays
  lit"* is one element rather than two. A **make** is carried and speaks nothing.
- **The E3 is spent at last.** It has been empty since the author took the release and the grab
  off it. Spec 06 §2 gives PERFECT — and PERFECT alone — energy E3, so the rarest word in the game
  is the only thing that lights one.
- **The farewell ring** ([`farewell.ts`](../../src/state/farewell.ts)) — the ellipse actually
  ridden, at the shape it had on the tick the craft let go, expanding away in AURORA. **Stroked and
  never filled**, which is the one performance decision in the milestone: a filled expanding ring
  is the only shape here whose area grows as the square of what is being animated, and it was
  named as the thing that could move overdraw off 1.53 screens.

### Two the author called mid-step

**Three rings, not four** — *"four is a bit unwieldy and makes it hard to decide where to go
next."* The cohort that set the number prices it exactly: over 342 releases that reached another
body, the one actually grabbed next was among the three nearest **99.7%** of the time against
four's 100%. The fourth ring is worth one release in 342 and costs a choice on every orbit. Two is
92.7% and would put the body actually taken off the instrument once every fourteen releases.

**The release delay, removed** — *"the slight delay is making it seem jagged and jumpy. Let's
remove any camera/speed delay there."* There is no hitstop in the build and nothing time-scales;
what was there was the camera carrying the orbit's hold after a release and decaying it at 5% a
tick. Measured over the recorded dispatches: **41 ticks at p50 and up to 104** before it was shed,
walking the view **356 design units** away from a craft accelerating in the other direction. The
guard that argued for it — *"dropping it outright would snap the view by an orbit radius"* — was
protecting a number that never reached the picture: what is dropped is the camera's *subject*, and
the deadzone absorbs a whole `DEADZONE` of it before the follow ease spends the rest. It is
asserted as a shape now, so there is no rate left to tune it back up with.

### And the lag on release has an address, and it is the press

`diagnostics/2026-08-29T23-53-31-915Z-run-dispatch.json`, flown against *"I kept feeling some kind
of lag or freeze on release... maybe it's just the planet effect, the pulse?"*

**All eight presses in that run land on one of the twelve worst frames, at +0 ticks. Not one
release does.** 19 – 27ms each, at a cpu of **0 – 1ms**, so nothing in the game is doing the work.
The two release-tagged frames in the list are 69 and 74 ticks after one. It is the browser's
touch-begin, which [the performance write-up](./performance.md) §10 has now recorded **six runs
running**, and it reads as belonging to the release because the next press follows 13 – 35 ticks
later and the release is the moment the eye is waiting on.

**A mechanism for it, which §10 did not have.** [`app/input.ts`](../../app/input.ts) registers
`touchstart` and `touchend` with `passive: false`, because that is the only way to call
`preventDefault` and it is what killed the iOS selection loupe and the *Search with Firefox*
callout the author reported. A non-passive touch listener is precisely what makes WebKit wait for
the handler before compositing. **So the press hitch and the suppressed callout may be the same
decision seen from two sides** — a real trade, and an A/B only the phone can settle. Not chased
here, on §10's own instruction.

### What it cost to draw

`pnpm profile`'s census, measured on the same machine in the same session before and after:

| per frame | before | after |
|---|---|---|
| arcs | 36.98 | 37.02 |
| strokes | 26.90 | 27.53 |
| **overdraw, screens** | **1.574** | **1.574** |

**Six new strokes' worth of flown arc, one farewell ring, one taken window and one word, for +0.6
strokes a frame and no measurable paint at all.** Two reasons: the fourth ring going away gave back
most of what the arc took, and the farewell ring is a stroke. The tick side did not move either —
0.150ms before and 0.147 – 0.150 after at 1 536 bodies.

---

### Flown the same evening, 2026-08-29 — eight notes, and two of them undid the step's own work

The build went to the phone and came back with eight. Two withdrew things M2.4 had just built,
which is the milestone working rather than failing.

**The punch comes off the camera.** *"I still feel a brief pause or shake at release, we don't want
that... we don't really want shake effects or pauses like that, it turns out that really disrupts
the flow."* Spec 02 §5 had argued that a **directional** kick says departure where a shake says
damage, and that spec 00 §5's *"never shaken"* therefore did not reach it. Flown, the distinction
did not survive: moving the whole world moves the whole world, whichever way it goes. It is the
same finding the hitstop got, one element along — and this is the second time in one milestone that
a thing the design reasoned its way into was refused on contact.

**So the punch is spent on the craft's own stretch**, which was already the element about the craft
leaving, already flown and already accepted. Quality decides how much of it a release earns and how
long it takes coming home — ADR-0012's *"as size and as duration"* with the world left alone. The
amplitudes at full quality are spec 02 §4's own, so a good release looks exactly as it did; what
moved is what a poor one does. `camera.ts` is back to a rule with no exception in it, and
`test/state/camera.test.ts` asserts the centreline on every tick of every swing.

**Nothing strikes an E3 any more.** M2.4 spent spec 00 §3's slot on the award — PERFECT alone, at
the dot — and: *"there's a weird white-ish blur circle that appears when I get 'perfect'... I don't
like that white one. The text plus its own blur/glow and pop-up effect should be enough."* All
three of the slot's live users have now been flown and refused in turn. What is left for it is the
checkered line, in M6.

**And then the word's own bloom went too**, which is the note that sent me to the prototype:
*"the blur circle behind the popup text isn't doing us any favours, it's blurring the legibility."*
What replaces it is what that codebase uses for the same job — a **rim**, a thin dark stroke around
the letters, in VOID rather than black because *"a heavy black outline under pale text reads as a
sticker."*

**The pop became a throw**, from the same visit. *"I think the popups should pop upwards a bit
more, mimicking the physics feeling that we have in the original prototype."* What the prototype
does is not a pop: the word **rises across its whole life** on `1 − (1 − u)²`, and its own comment
says why — *"most of the travel happens early, so the popup leaves the ship promptly and then hangs
where it can be read."* Carried as behaviour (ADR-0013): 34 prototype units, 43.75% of the way up
by a quarter of the life, and never coming back down. **An overshoot is a spring and this is a
throw**, which is the same distinction the camera had just lost.

**The word is held inside the picture.** *"Some of the edge award text was getting cut off."* Spec
00 §7 is absolute about it and M2.4 had drawn the word at a world point; it stays world-anchored,
and what is clamped is where it is drawn.

**And the taken window got its own clock back.** *"The planet's compass window stays after the rest
of the compass disappears."* Spec 02 §6 gives it 420ms and spec 06 §4 gives the word 1 600ms; built
as one unit they were built on one clock, so the arc hung on screen four times too long. They
arrive together and leave apart.

### Three more, each of which needed a measurement before it could be answered

**The tether was already fading, and the span was wrong.** *"I felt that the tether line to the
planet when moving away at the end should've gotten more faint as I pulled away. Did we not
implement that earlier?"* It was implemented — measured on that very run it went 0.89 → 0.52 over a
265-tick drift — and the reason that reads as *not fading* is arithmetic. Over **40 tethered
drifts** in the recorded dispatches, a craft that grabs and floats away reaches **p50 0.36** of the
body's reach, p90 0.61, and never past 0.71. It cannot get further: the thing it is drifting from
is still pulling it back. So a fade calibrated across the whole reach spent **a quarter of its
range** on the entire gesture — and the drift is asymptotic on top of that, with **37% of each
drift's ticks spent past 80% of its own final distance**. Recalibrated to six tenths of the reach,
the author's own drift now runs **0.82 → 0.25** and arrives at the floor at 61% of a reach.

**The two rings at the same height were not two bodies at the same distance.** *"Were the planets
really the same distance away? It's OK if they were, but if not, we should have some orbital
separation."* Measured over **12 280 adjacent ring pairs**: **half sat under 5 design units apart on
screen**, against a ring stroke of 3 — and their bodies were a median of **32** design units apart
in the world. The radii are proportional at 186 units of stack over 2 400 of aim range, which is
**one unit of radius per 12.9 units of world**: finer than the line that draws it. A minimum
separation now holds whatever the windows are doing. What is given up is stated — below that
distance the gap stops being proportional — and what survives is the order, which is the reading
spec 00 §6 asks the stack for.

**And one was raised that was already true.** *"I feel like the player should still get award text
if they grab after the planet dot on the compass, but still in the window."* It does: spec 06 §2
grades on the **absolute** offset from the window's centre. Measured over the recorded dispatches,
**40 graded releases fell short of the dot and 50 past it**, and every ungraded one was genuinely
outside its window — the nearest by 12% of a half-width. Nothing to change; a golden now pins it so
it cannot quietly become one-sided.

---

### Queued, 2026-08-30 — the punch wants more punch

*"I also think the 'kick' after release should be punchier, more like the original prototype. I
think that's a future task, so please file that away"* (author).

**Where it stands.** ADR-0012's punch is spent in two places and neither is the camera, which was
flown and refused. The craft's own stretch carries how it looks — spec 02 §4's 1.5/0.7 at full
quality, scaled by `PUNCH_FLOOR` below it — and spec 01 §8's transient carries how it flies, at
`TRANSIENT_SHARE` **0.45** against the prototype's measured **0.8**. The author asked for that
number to come down on 2026-08-29 (*"all of the velocity kicks are a bit too intense"*) and is now
asking for the kick to read harder, which is not a contradiction: what came down was the **speed**,
and what is being asked for is the **hit**.

**So the first thing to try is not the transient.** Three candidates, in the order the evidence
favours them:

1. **The stretch's attack.** It is *placed* at full amplitude on the release tick and eases home
   over 180ms — one tick of attack. The prototype's punch is a **decay from a larger peak** and
   this repo has never flown the amplitude above spec 02 §4's 1.5: `STRETCH_ALONG` is on the bench
   and has not been moved since it was written.
2. **`PUNCH_STRETCH`**, quality's second channel, at 0.5. A punch that carried half again as long
   again would read as weight without adding speed.
3. **`TRANSIENT_SHARE`** back toward the prototype's 0.8, now that the width-fit has changed what
   any given speed reads as on screen — every earlier judgement about it was made at 77% of the
   current scale.

All three are sliders on the bench's release card, so this is a flight rather than a build.

### Queued, with its remaining question now answered

**A "Clang!" when the craft bounces into another body while holding one.** *"I want to show a
quirky 'Clang!' or similar"* (author, 2026-08-29). Both of its questions are now closed and neither
closes against it:

- **Does the simulation report the contact?** Yes — `bounceOffOthers(craft, field, held)` in
  [`contact.ts`](../../src/sim/contact.ts) already resolves it at `R + 6` with 0.2 restitution.
  What it does not do is say so out loud.
- **Does a bounce cost the run anything?** *"A word that fires when nothing happened stops being
  funny the second time."* Measured over the eight replayable dispatches — **12 020 ticks, and
  exactly one bounce**, in one run of eight. That one turned the craft **82°** and took **50% of
  its speed**. So it is rare enough that the word cannot wear out and expensive enough that it is
  never firing on nothing: it is a genuine event with a genuine price, which is the opposite
  register to the award word and the same class of element — a word that blooms at the point that
  earned it.

Not built here. It wants the audio milestone's register or M4's, and it wants the author to hear
the word before it is set in type.

---

## M2.5 · Presentation goldens

Assert derived presentation values at named ticks across a recorded recipe — the camera offset
at the tick after release, the craft's bloom radius at chain 7, which award is alive when. No
canvas, no PNG diffing.

**Acceptance**: a regression in any choreography above fails a test. **Verify**: `pnpm test`.

### Done, 2026-08-29

[`test/state/goldens.test.ts`](../../test/state/goldens.test.ts) — twenty-five assertions across
the recipe `pnpm replay` flies with no argument, so **a number in the test and a number in that
terminal output are the same number** and every tick named is a tick the author can fly.

**Written out rather than snapshotted.** A digest of the whole stream would catch every regression
and explain none of them: it fails as one opaque hash, and the fix for a deliberate change is to
accept the new hash, which is not a review. What is asserted is what the picture *is* — a tier, a
displacement, a span, a count of stretches — so a failure names the element that moved and a
deliberate change requires editing the sentence describing it.

Two of the named ticks are worth more than the rest:

- **258**, the first swing and the best in the run: let go seventy ticks past the freeze, inside
  the plateau, so the envelope is exactly 1 and the punch is at its full 18 design units over 17
  ticks. Every element of the release is asserted against it.
- **310**, which is the whole game in one tick. Frozen on 309 and let go on 310: the aim is
  **PERFECT** and the envelope is **exactly zero**. The best word in the game and not one unit of
  boost to go with it — spec 01 §11's tension is that the two wanted different moments, and this
  is a release that took one and paid the whole price of the other. It strikes the E3 and lands no
  punch at all, which is ADR-0012's *"a tap pays nothing, structurally rather than by a guard"*
  read off a real swing.

### The acceptance was demonstrated rather than claimed, and it found three gaps

Sixteen mutations were applied to the built code, one at a time, and the goldens run against each.
Twelve constants and four behaviours; **all sixteen now fail at least one test.** Three did not at
first, and the first two share one cause worth writing down:

**A golden that indexes by the constant it is testing cannot catch a change to that constant.**
`expect(punch.magnitude).toBeCloseTo(PUNCH_RELEASE)` moves the expectation and the fixture
together and passes for any value; so does `at(RELEASE + POP_TICKS)`. Every tick in the file is now
a literal, and the arithmetic lives once in a block that asserts each constant against the spec
that fixes it. It is the only way that class of gap ever shows up, and it would have shipped
otherwise.

**And a golden written on the most convenient swing can miss the bug it was written for.** The
`swept` fix — the arc that froze at the settle's end — was asserted on the first swing, which
freezes on 188 and is let go on 258, **inside its own 72-tick settle**. Every tick of it grows
either way, so the assertion passed with the fault put back. The swing frozen on **2221** is the
only one in the run held past its settle (81 ticks) and the only place the bug is visible at all.
Reinstating it now fails.

### ⚠ Re-addressed, 2026-08-31: the ticks are found rather than named

Every tick number in this section is now a coordinate the file no longer writes down — **258**,
**310** and **2221** included, and they are 286, 320 and 2127 today. What the goldens assert is
unchanged and the argument above is unchanged; what moved is only *how a moment is addressed*, and
the reasoning is in [`test/moments.ts`](../../test/moments.ts) with its cost measured in
[M3.2's own notes](./m3-the-field.md). Read the two paragraphs above as what they are — the
argument for values written out rather than snapshotted, which still stands and is why a digest was
refused — and not as a promise that any particular tick still exists.

The one thing that section got wrong is worth keeping visible: *"a golden written on the most
convenient swing can miss the bug it was written for"* was the right diagnosis and **naming a
second swing was the wrong cure**, because it fixed one instance of a class. A moment described as
*a swing held well past the end of its own settle* cannot be written on the convenient one, since
the convenient one does not match the sentence.

---

## Gate

**The author flies it. The question is whether the release lands.** Next:
[M3](./m3-the-field.md).

### ⚠ And the sixth, an hour later: the distance, not just the corner

*"I still see the camera settling in lower once the orbit is reached. I think it'd be nicer if the
camera just stayed at the level it was at when I first started circularizing"* — flagged at tick 518
of the run sent at 22:37.

The fifth correction took the **corner** out of the handover and left the **distance** where it was.
`stillPoint` clamps the lock's anchor to within a `DEADZONE` of the body, and on a wide orbit that
clamp *binds*: traced on the flagged capture, the view finished the oval **247** units above the
body against an anchor at 168, so **79 design units** had to be travelled — and all of it was spent
after the orbit had become round. That is the one moment a player has stopped expecting the picture
to move, which is why 79 units there reads worse than 500 units during the dive.

`outOfFrame` spends it over the settle's last `LOCK_TICKS` instead, inside movement that is already
happening, on the smootherstep `lockOf` arrives with. It returns `null` — and changes nothing at all
— on nine of the thirteen captures in the author's dispatches, because the clamp only binds on wide
orbits.

| over 11 captures on one unbroken orbit | before today | after the fifth | **after the sixth** |
|---|---|---|---|
| view travel after the settle ends, p50 / p95 / worst | 0.71 / 15.61 / 19.30 | 0.15 / 30.94 / — | **0.00 / 0.00 / 0.00** |
| ticks until the view is still, p50 / p95 | 1 / 9 | 1 / — | **1 / 1** |
| jerk across the handover, p50 / worst | 3.12 / 7.48 | 0.65 / 0.88 | **0.67 / 2.83** |
| share of the oval's swing the view flies | 0.80 | 0.73 | 0.71 |

On the flagged capture the view now ends the settle at exactly the level it holds for the rest of the
orbit — **−978 and −978** — where it used to end at −1057 and drift down to −978.

**Three things are worth writing down about how this was checked**, because the next agent will want
to know why the test file is thinner than the evidence:

1. **The fixture field cannot reproduce it.** Searched over 51 grab-and-release pairs, no swing puts
   the view more than a `DEADZONE` from the body when its settle ends, so the clamp never binds and
   `test/state/camera.test.ts` passes on both sides of this change. Displacing the camera by hand
   does not help either — at any distance where the lock's clamp binds, the ordinary deadzone is
   already pulling the view back. **The evidence for this correction is the dispatch corpus and
   nothing else**, and the tests say so in place rather than implying coverage they do not have.
2. **Two builds were measured and rejected before this one**, both recorded in the code: easing a
   target that is itself easing lags twice and left 46 of the 79 units to be paid after the orbit was
   round; and completing the trip on a *linear* share crosses at a constant speed that starts and
   stops with a step, at 27 units/tick² of jerk — four times what the fifth correction had removed.
3. **The dispatches were re-flown at `SIM_VERSION` 9 and that is a different run**, said plainly:
   only the two sent this evening replay as recorded.

### ⚠ The seventh, and it supersedes the fifth and the sixth

*"I capture a planet, swing around the top of it to start circularizing, and when the ship travels to
below the planet as part of circularization the camera moves downwards to follow it. I'd rather have
the camera fixed a bit higher up, where it was when I first started circularizing."*

**Both earlier corrections that evening were treating a symptom**, and this is the note that says so
rather than leaving two builds in the history looking like progress. The fifth took the *corner* out
of the handover and the sixth moved the *distance* from after the orbit to during it. Neither asked
why there was a distance, and the answer is one line above them in this same file: `OVAL_BAND` at
zero glues the view to the craft for the whole settle, and **a craft on an orbit goes round.** Over
the top of the body, then under it. A view tracking that vertically must come back down by the
orbit's diameter, every capture — measured over 20 settles in the author's dispatches, **151 design
units at p50 and 343 at worst.** No amount of easing makes a descent stop being a descent.

It also could not have been fixed downstream, which is worth keeping: glued to the craft, the view
*ends* the settle wherever the oval left it, which on a wide orbit is outside what the lock is
allowed to hold — so something has to travel, and the only choice is whether it travels after the
orbit is round (the 21:55 complaint) or during it (the 22:55 one). **`OVAL_BAND` is where the
distance is created, so it is the only place it can be not-created.**

So `OVAL_BAND` goes back to **1** — the 2026-08-30 ruling reversed by the author two days later —
and `settling` forbids the view to descend at all while a dive is settling. The rule is asymmetric
and the field is what justifies it: a run is a **climb**, so following the craft up is the direction
of travel and following it back down is the view undoing progress to chase half an orbit. Spec
00 §7's thumb line is the one thing that can still force a descent, and over the author's dispatches
it fires on p95 **0** design units and worst 43.

| over 20 settles from the author's dispatches | before | after |
|---|---|---|
| the view's descent after its peak, p50 / p95 / worst | 151 / 246 / 343 | **0 / 8 / 20** |
| view travel after the orbit is round, p50 / p95 | 0.71 / 15.61 | **0.00 / 0.00** |
| jerk across the handover, p50 / worst | 3.12 / 7.48 | **0.23 / 4.68** |
| the lock's arrival ramp, the two flown swings | 12.6 / 15.0 | **0.0 / 0.0** |
| share of the craft's swing the view flies | 0.75 | **0.41** |

**The last row is the cost and it is the row `OVAL_BAND` was ruled on**, so it is named rather than
buried: the oval is followed about half as much as it was. On the two swings the tests fly, the
camera used to rise 118 units through a settle and then **fall 207** — further than it had risen —
and now rises 14 and falls none. `OVAL_BAND` is on the bench as of this change, so the two ends of
that trade can be flown against each other rather than argued about.

**What is kept from the two superseded builds** is one line: `closing`, which makes the lock's
arrival complete on the curve `LOCK_TICKS` already named instead of being handed to a 5%-a-tick ease
that approaches without arriving. It takes the arrival ramp's travel to zero and costs nothing. The
band-closing ramp and the in-settle homing are both gone: with the band restored there is no
distance for them to manage.

### ⚠ The eighth, and it is the one that was actually stepping

*"There's definitely some stuttering or robotic camera transitions. I want them to be smooth, not
for the camera to stop and move abruptly."*

**Three corrections to the lock in one evening did not touch the largest discontinuity in the
camera, and it is not in the lock at all.** [`LOOK_AHEAD`](../../src/state/camera.ts) is switched
off at the freeze — for a good reason its own comment gives, since past the freeze the craft's
velocity reverses every half orbit and stops meaning a heading — and it went from its full **210
design units to nothing between two ticks.**

Measured over the author's dispatches, the view's speed changed by **10.2 design units in one tick**
at a freeze, against 3.1 at a release, 0.9 when the orbit goes round and 0.1 at a grab. Traced on
one capture it went from moving 18.3 a tick to 8.1 on the next. It fires on **every capture**, at
the moment the player is watching the thing they just did — and it is identical in the build before
all three of the evening's earlier corrections, which is why none of them stopped the reports.

Faded over `LEAD_OUT_TICKS` (**12**, measured: 2.8 of jerk at six ticks, 0.9 at twelve, 0.9 at
twenty and thirty, so twelve is where the curve flattens) the freeze's jerk falls to **0.9**, and
the worst jerk anywhere in a run falls from 10.2 to 3.1 — which is then the **release**, where spec
02's ruling forbids a delay outright and it stays.

Also in this change, and both from the 23:15 report — *"locked in when I captured, then moved up a
bit and paused, and then back down to where it should be... very mechanical/robotic"*:

- **`framed` consults the clamp every tick** rather than once when the lock arrives. Consulted once,
  it made the framing a thing that *happened*: the view stopped where the settle left it, sat there
  fourteen ticks, then a timer fired and moved it 79 design units in a symmetric twenty-tick curve.
  Every tick, the ordinary ease carries it there along with everything else. The peak speed of that
  after-the-orbit move goes **7.4 → 0.0**.
- **The ratchet becomes a resistance** (`SINK_SHARE`, a tenth). A hard clamp produces exact zeros,
  and a view that is exactly still and then exactly moving is the shape of a machine: it left the
  picture frozen for **47 ticks at p95** before the lock took over. At a tenth of the follow rate the
  view gives way slowly instead of not at all — frozen stretch p95 **12**, descent still p50 2 and
  p95 10 against the 151 and 246 originally complained about.

**What is still unresolved and is the author's**: with `OVAL_BAND` at 1 the view is exactly still on
**48%** of a run's ticks against 11% before the day's changes, because a settled orbit is watched
rather than followed. Most of that is the lock doing its job and is not new — but if *that*
stillness is what reads as stuttering rather than the transitions into it, then the lock itself is
the question, and it is a larger ruling than a constant. `OVAL_BAND` and `SINK_SHARE` are both on
the bench.
