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

### The flythrough, 2026-08-30 — three asks and what each turned into

The author flew the field and sent three things. Two were pictures and one was physics.

**The planets read as beehives.** *"I want to remove the innermost circle within each planet."* Spec
04 §1's inner **stratum** at 0.39r is what went, not the core: the core is a filled dot rather than a
ring, so it is not part of the concentric pattern, and it is §4's **type slot** — the one element
that makes a later body type a data change. Taking it would have cost the extension point and left
the beehive. What survives is §1's *structure without texture*: a rim, one stratum, a core.

**Tap fly-bys were being rewarded with speed.** *"Can we tweak the payback boost/speed to not
encourage straight fly-throughs like this so much?"* Measured first, and **the boost was not the
culprit** — it pays 0 – 14 design units/s on the swings in question. The culprit is the **dive**:
gravity accelerates a falling craft and stops acting at the release (spec 01 §2), so the way in was
free and the way out was never charged. Over the author's 129 swings a release taken in the dive
handed the craft **+548** at the median and gained **81%** of the time, against +71 for a swing held
past the settle — **7.7×**, and the best-paid move in the game. Spec 01 §7's *"a reflexive
tap-through earns almost nothing"* and `release.ts`'s *"a release during the dive changes nothing
about the craft"* were both false, and §5a's flat speed-by-altitude had already bent under it
(213 → 356 across eight bands, against a stated 260 – 300 ceiling).

`DIVE_PAYBACK` returns an unfinished swing toward the speed the press found it at, keeping the
heading. **It shipped at 1 and was refused within the hour** — *"it feels too slow and anemic right
now"* — so it sits at **½**, where the median dive release is +155 against +110 for a flown swing:
level rather than 7.7×. It is on the bench, and 0 is the behaviour it replaced.

**And the refusal is its own finding.** With the tap closed, `PERMANENT_SHARE × PEAK_BOOST` is about
**40** design units/s against approach speeds near 1 000, so *nothing else in the game is an engine*.
Half is a holding position, not an answer.

**What it cost.** `SIM_VERSION` is **7**, so every recipe recorded before it is refused — the price
of any physics change, and this is the first bump since the author's own flown fixtures arrived. The
pilot recipe was re-flown and its seed chosen on **coverage** rather than length: of six thousand
searched, five still give the goldens all four release tiers, a knock, a tight arrival and a swing
held past its own settle in one flight. `arrival-flown.json` and `knock-flown.json` are **retired** —
they existed because the pilot could not produce an arrival, and it now can, which is itself a
consequence of the change. The author's dispatches remain in `diagnostics/` as input logs.

**⚠ And one invariant broke, and it is the author's to close.** `knock.ts` states that a knock and an
arrival *"must never contradict each other"*, with `KNOCK_BAND` set above the hardest knock any tight
arrival takes. Under SIM_VERSION 7 one capture in the pilot run earns both — frozen on 1896, knocked
on 1893, lit together for 45 ticks. Both thresholds were ruled by the author on measured play, so
retuning them is theirs. `test/state/goldens.test.ts` pins the breach exactly — one capture, 45 ticks
— so it fails if a second starts doing it and fails again when it is fixed.

**Not addressed in this pass**, and named so it is not mistaken for done:

- **The rungs still travel by too quickly.** *"I still don't love the effect."* Not changed, and
  there is a reason to wait: the crossing rate **is** the speed. At the escalated 1 400 – 1 700
  design units/s the flythrough reached, a rung crosses every 88 – 107ms; at §5a's intended flat
  780 – 900 it is 167 – 192ms, near half. The payback is aimed at exactly that escalation, so the
  next flight is the measurement. If it still reads wrong with the speed in band, the levers are the
  spacing (bench) and the alpha, and the sky is already carrying speed in parallel.
- **The double oval, reported again** — *"on the last orbit I see one clear oval, and once I start
  circularizing it jumps to show a different one."* This is **not** the grab-time case fixed on
  2026-08-30 (`goldens.test.ts` still holds that one): it is a second transition, dive → settle,
  where the predicted path hands over to the frozen one.

### Two more from the same sitting, 2026-08-30

**The double oval, and the path was not the culprit.** *"At the last orbit I saw one oval when
initially capturing, and then my orbit line jumped over to a different one. Any orbit rings we should
show be smooth."* Measured on that exact run under the build it was flown on: the drawn path moves at
most **0.10 of a body radius** on the freeze tick and under 0.15 on every other tick of the run —
`predictOrbit`'s eccentricity cap already made that handover clean earlier the same day.

What arrives on the freeze tick is the **rings**, on top of it. On the flagged capture the outermost
landed at **648 against an oval reaching 647** — the same line to within a unit — and the settle then
rounded the oval inward to 397 and left the ring behind. On a capture that freezes at the
eccentricity cap, which is the p50, the oval starts *outside* the whole stack and sweeps through all
three.

**They cannot be separated**, and the measurement is what says so: placing the rings clear of the
freeze **apoapsis** rather than the periapsis — which is what `RING_INNER`'s own note claims to do —
puts the outermost beyond half the design width on **93% of 91 freezes** against 30% today, at a p50
of 1 069 design units. The instrument would be off screen on almost every capture.

So the fix is **rank**, and the rank was inverted: rings are structure at E1 (0.18) and the path was
drawn at **0.16** — the line the craft is actually flying, fainter than the scale marks over it. Spec
00 §3 makes brightness the only ordinal channel; it was saying the wrong order. `PATH_STRENGTH` is
0.24, between the rings' E1 and the flown arc's E2, and `test/render/hand.test.ts` pins the
**ordering** rather than the values so it cannot invert again.

**The punch got deeper.** *"Not really changing the overall trajectory/velocity, but making it feel
more rewarding."* That constraint picks the channel on its own: ADR-0012 spends the punch on the
craft's stretch and on spec 01 §8's transient, and the transient is velocity — and lives in the
simulation, so moving it costs a `SIM_VERSION` bump and every recipe with it. The stretch is a scale
on the silhouette and costs nothing. It goes to **1.75 / 0.55**, which is the board's own 5 : 3 ratio
half again as deep; the attack was never the problem, since the recovery curve already sheds 41% of
the displacement in the first tenth of its span.

**The transient is the other half of that lever and is not taken.** It sits at `TRANSIENT_SHARE` 0.45
against the prototype's measured 0.8, and a front-loaded decay — the same integral at a higher peak,
so the same displacement with a harder hit — would be punchier without changing where the craft ends
up. It is a physics change and therefore the author's, with the corpus cost stated.

### What the payback did, measured on the author's own play

The first clean sim-7 session (`2026-08-31T20-32-07`, 17 swings) says the behaviour moved the way it
was aimed to. Median hold went from **37 ticks to 59**, and the boost is being *earned* — it pays up
to **39.5** design units/s on these swings against **≤ 14.6** on the flythrough that prompted the
change. Speed oscillates between 635 and 1 217 across the run rather than climbing monotonically, and
seven of seventeen swings hand back speed rather than adding it. The tap is no longer the engine, and
holding is.

### The arrival learns to read speed, 2026-08-31

*"I felt like my capture of the planet towards the end should've received a verbal accolade like
'Tight!'. Maybe we can incorporate the velocity into the evaluation logic, since coming in fast makes
it harder to capture the lowest approach?"*

**The idea is theirs and the measurement backs it.** Spec 01 §5a says the opposite in its own words —
*"the dive normalises speed"*, periapsis pinned within 5% of the floor across a four-fold range of
approach speed — but that sweep ran over 60 – 260 prototype units and the game is now flown at two to
four times it. Over the 105 captures in the author's dispatches:

| | Slower half | Faster half |
|---|---|---|
| Entry speed, p50 | 646 | 1 029 |
| Room above the floor, p50 | **1.3** | **25.0** |
| Earned the word | 19% | 8% |

Ranked, room against entry speed is **rho 0.31**; against aim the same speed is rho −0.07, so it is a
third axis and not a second reading of the first. Pearson misses it entirely at 0.07 — room runs p05
0, p50 3, p95 543, and a handful of fly-pasts swamp the mean — which is why it is measured on ranks.

**Built so that nothing can lose the word.** `ARRIVAL_SIDEWAYS` stays exactly where the author put it
when they refused a looser gate; what is added is relief above the median approach speed. A raised
base would have held the count perfectly still by taking the word off a slow capture, and it is not
taken: at 0.70 the gate would sit 0.008 under the author's own benchmark tight capture, against the
0.1 of margin `test/sim/tier.test.ts` holds it to. The price is **two captures in 105**, 13% → 15%,
both fast and both within three units of the floor — one of them the capture that prompted the note,
at entry 1 367, room 2.9, aim 0.57.

**It cost no recipes.** The orbit carries the entry speed across the freeze the way it already
carries aim, and nothing in `src/sim/` steers on it — so this is `version.test.ts`'s *picture, not
flight* case for the third time, checked the way that file prescribes: the field went on `Orbit` with
the snapshot untouched and the fingerprint did not move. `SNAPSHOT_VERSION` is 8, `SIM_VERSION` stays
7, and every recipe goes on replaying.

### The kick, in two passes, 2026-08-31

**The first pass was the wrong half.** *"More punchy at the start… not really changing the overall
trajectory/velocity"* was answered on the **stretch** — 1.5 / 0.7 to 1.75 / 0.55 — because that is
the channel with no trajectory in it. Flown: *"I felt the kick upon release still isn't noticeable
enough."* The stretch is what a release **looks** like, and what was missing was what it **feels**
like.

**The second pass is the transient, and the same message named all three of its terms.** *"When I
release well I feel like the kick lasts too long, so I go REALLY fast. Let's scale that part back
just a hair. More generally, though, I'd like for there to be more of an initial kick to the boost,
that then fades away into the current feel."* Harder, shorter, less of it — and no straight line can
do all three, because raising a line's start raises everything under it. So `burstOf` spends the
transient on the **square** of what is left of its span, which is `decay.ts`'s own grammar and the
one place in the release it had not reached.

| Quality | Peak, was → is | Span, was → is | Distance, was → is |
|---|---|---|---|
| 0.25 | 0.225 → **0.400** | 1.63s → 1.46s | +6.7% |
| 0.50 | 0.318 → **0.566** | 1.76s → 1.53s | +3.1% |
| **1.00** | 0.450 → **0.800** | 1.95s → **1.63s** | **−1.2%** |

The bottom row is the release the complaint was about and it is the row that comes down; the curves
cross at 0.65s, above the old line for two thirds of a second and below it after. **0.8 is spec 01
§8's own measured share**, filed as a candidate for exactly this on 2026-08-30 — not a new number,
and not the 2026-08-29 ruling reversed, because the amount of speed handed out is lower than at 0.45.

**It cost the corpus again.** `SIM_VERSION` 8, so the three dispatches sent today are refused as
replays. The pilot fixture is re-flown at seed **3394** — of six thousand searched, four still carry
all four tiers, a knock, a tight arrival and a swing held past its settle — and `replay.test.ts`'s
three seeds moved with it, since two of the old three now end under the thousand ticks its guard asks
for. That guard is fixed; the seeds are not, and the file now says so.

**One thing healed on its own.** The knock-beside-arrival breach opened under `SIM_VERSION` 7 is
gone: no tick in the new run lights both. Neither threshold was touched, so what closed it was the
approach geometry moving again — which is a reason to **re-measure `KNOCK_BAND`** rather than to
relax about it, and the golden is back to asserting the invariant outright.

### Scaled back once more, and a cost worth naming

*"The release speed boost effect is a bit too fast right now. Can we scale it back a bit more?"* —
the third message about this curve in a day, and the second asking for less of it while the peak
stays where the first put it. So the peak holds at 0.800 and `TRANSIENT_STRETCH` goes to **0**: the
span at full quality is 1.63s → **1.30s** and the distance falls **20%**.

The number that explains the complaint is not the peak. Measured on the run they sent, the burst was
running on **85% of ticks** — a span of 98 ticks against release gaps of 57 – 143, so consecutive
releases overlapped and the craft was almost never *between* kicks. At 78 ticks it runs on 69%.

**The goldens are becoming the expensive part of a tuning session, and that is now measurable.** The
pilot fixture is chosen on coverage — all four release tiers, a knock, a tight arrival and a swing
held past its own settle, in one flight — and of six thousand seeds searched, the number that still
carry all of it has gone **five → four → one** across three physics tunings in two days. Each tuning
also costs a full re-pin of every named tick in `goldens.test.ts` and `presentation.test.ts`, and it
moved `replay.test.ts`'s three seeds as well.

That is not an argument against tuning; it is an argument that the goldens are pinned to the wrong
thing. They name ticks of a recipe the physics regenerates, when what they are really asserting is
*the picture at the first full-boost release*, *at the one perfect release with no envelope*, *at a
swing held past its settle*. **Finding those moments rather than naming them** would make a physics
tune cost one re-record instead of thirty edits, and would stop the fixture search from being the
thing that constrains the tuning. It is worth doing before the next one.

### Done, 2026-08-31 — and the cost is now six lines

[`test/moments.ts`](../../test/moments.ts) carries the vocabulary and the argument, and both
`goldens.test.ts` and `presentation.test.ts` address their subjects by sentence. The distinction
that made it work is that a tick was two things at once: *"the release at 286"* is a **coordinate**
and *"twenty-nine grabs on these ticks"* is a **claim**, and only the second was ever worth writing
down. `the shape of the run` keeps its wall of numbers, which is what it is for.

**The trap is that a finder which always finds something cannot fail**, and three rules answer it.
A moment says how often it happens — `once` refuses a run holding two as loudly as one holding
none. A moment happening more than once is **asserted over every one of them**, so there is no
selection left to go wrong. And the tick goes in the `describe` block's name, reported and never
compared, so a red test still says where to point `pnpm replay`.

**Asking a claim of the class rather than of one swing restated four of them**, and this is the
part that was not a mechanical edit:

| The old sentence | Why it was false of the run |
|---|---|
| *the full-boost release says SHARP* | a fact about **aim**, under a moment defined by **boost** — spec 01 §11 is about their independence, and the third full-boost release earns no word at all |
| *the ramp shrinks by a factor of 3.1* | one swing's number; the seven ramps in this run run **2.0 – 3.8** |
| *a grab finds the craft at rest* | **eight of twenty-nine** land while the last punch is still coming home. What a grab must not do is *strike* one |
| *a spent body is E0* | the lamp goes out over 210ms, so for thirteen ticks it is still burning at the E2 it was held at |

**Nineteen mutations, before and after: fourteen red both times, five green both times.** The
refactor takes nothing away. Four of the five standing gaps are now closed — the arrival, the knock
and the spend were each watched out to `arrivalTicks()`, `knockTicks()` and `SPEND_TICKS`, which is
a golden indexing by the constant under test and is the exact fault M2.5's own block was written to
close, left open on three elements; and no tier **zone boundary** was asserted at all, so widening
SHARP from 0.15 to 0.28 of a window passed.

**The fifth cannot be closed on this fixture and now says so in place.** Measured over its own
dives, the share the floor takes is **0.1548** once and then falls straight to **0.0008** — so no
`KNOCK_BAND` anywhere between 0.001 and 0.155 changes what this run says, and dropping it to 0.04
passes. That is a property of the pilot's captures being bimodal where real play's are a tail, and
it is a second reason the re-measurement below has to run on the author's dispatches.

**The acceptance test was flown rather than claimed.** `SETTLE_RETURN` 0.3 → 0.34, `SIM_VERSION`
10, re-recorded with the new tool: **six lines** needed editing by hand, against 169, 89 and 72 for
the three tunings before it. Three were `the shape of the run` and three were the arrival's and
knock's counts, which are claims with arguments attached. Two of the eight failures were not
re-pins at all — a spec tolerance in `shape.test.ts` that the constant genuinely broke, and **the
knock-beside-arrival collision reopening**, which is the goldens catching the regression they exist
for. It also caught a tolerance of *this* change's own, set at 2.0 to fit one fixture where the
same ramps run 1.30 – 2.59 under the trial physics; it is 1.15 now.

### The seed sweep, which nobody had taken

[`tools/fixture.ts`](../../tools/fixture.ts) is the search as a committed command, on `COVERAGE` in
`test/moments.ts` rather than on a sentence in the recipe's JSON note. Over **thirty thousand**
pilot seeds at `SIM_VERSION` 9:

| Wanted | Seeds carrying it | First found at |
|---|---|---|
| **all of it, in one flight** | **9** in 30 000 (0.03%) | seed **3 197** |
| the release group — four tiers, both envelope extremes, a word left alone, both sides of the dot | 225 (0.75%) | seed **70** |
| the arc group — three rings, the gap sample, the predicted path, a swing held past its settle | 166 (0.55%) | seed **13** |
| the capture group — a knock, two tight arrivals, an arrival beside a word | 275 (0.92%) | seed **70** |

Individually the moments are common — the rarest, *a swing held well past its own settle*, is 1.1%,
and most run 5 – 66%. **It is the conjunction that is expensive**, and it is not length in
disguise: of the 117 seeds flying past 2 500 ticks, seven carry everything. A longer run does not
help, because the pilot lets go as soon as the aim arrives and a swing held for twice its settle
stays rare however long it flies.

**And the cliff is real rather than theoretical.** The trial tuning above found **zero** in six
thousand and needed thirty thousand to find four.

### One fixture or several — the author's, with the numbers under it

**Recommendation: keep one fixture.** The expensive half of this problem was the thirty hand edits
and that half is gone; what is left is a 23-second sweep nobody has to watch. `pnpm replay` with no
argument keeping one meaning is worth real money to someone flying on a phone, five other test
files read the same recipe and pin nothing, and *"a number here and a number in that terminal
output are the same number"* survives for `the shape of the run`, which is the only wall of numbers
left. Splitting would buy compute and cost the one thing the fixture is *for*.

**The trigger for splitting is now measurable, and the tool prints it**: a sweep of thirty thousand
that finds none. At that point the moments have outgrown one flight, and the three groups above are
the natural cut — each about **forty times** easier to find than the conjunction, first hit at seed
70 rather than 3 197. What it would cost is stated so it is not discovered later: three recipes to
re-record, each group's sample-size floors re-derived against a shorter run, and a decision about
which of the three `pnpm replay` flies bare.

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

### ⚠ The predicted oval, 2026-08-31 — three builds, and the first two were both wrong

**Superseded twice in one evening; this section is the record of all three because the two failures
are the useful part.**

The author, three times: *"I saw another initial grab oval at the last blue planet, and once I
started circularizing it swapped to a different one"*, then *"I don't see this issue with the
original prototype"*, then *"I grab the second, blue planet and see a LARGE oval stretching
downwards, which then is replaced by a much tighter orbital oval."*

| what was drawn | the far end slides across a dive | and snaps at the freeze |
|---|---|---|
| capped shape, re-sized through the craft (2026-08-30) | 12% / 38% / 75% | 1% / 22% / 148% |
| the true conic, uncapped (the first attempt tonight) | 16% / 61% / 79% | 17% / 87% / 148% |
| **the orbit `freeze` will hand out** | **0% / 0% / 1%** | **0% / 1% / 1%** |

**The first build made the periapsis depend on the craft's own radius.** Capping the eccentricity at
`ECCENTRICITY_CAP` and then re-sizing the ellipse to pass through the craft — so the compass is
drawn *on* the path being flown — means the drawn periapsis is a function of `r`. The true
eccentricity is a constant of the motion (measured: **0.726**, held from grab to freeze), so as one
dive fell from 878 to 314 design units the oval slid **244 → 182** and on to the floor.

**The second build drew the true conic and was measured on the wrong end of it.** Uncapping made the
periapsis invariant — and the *periapsis* was what the first measurement looked at, so it read as
fixed. What the player sees as large or tight is the **far end**, and at e 0.726 against the freeze's
0.6 that is 1052 against 668. The snap got four times worse and the author flew it within the hour.

**The third is a prediction rather than a clamp.** [`freeze`](../../src/sim/orbit.ts) does not cap
the conic the craft is on: it re-derives an orbit from the dive's **peak energy** at the periapsis
the craft reaches, with the speed capped at `FREEZE_ESCAPE_FRACTION` of escape at the floor and the
shape at `ECCENTRICITY_CAP`. `predictOrbit` now asks those same three questions of the periapsis the
craft is *going* to reach — the true conic's own, floored, which gravity conserves. Both the slide
and the snap go to nothing.

**Stated cost, because it reverses a rule this file argued for.** The oval no longer passes through
the craft during a dive: it is the orbit you are falling *into*, so the craft is above it — on the
line for **65%** of drawn ticks and beyond its far end by 16% at p50 where it is not. The
alternative was an oval that is always under the craft and never the same shape twice, which is what
was flown and refused three times.

**And the lesson worth more than the fix**: two of the three builds were measured, green, and wrong,
because the measurement was of the periapsis while the complaint was about the far end. *Measure the
thing the sentence is about.*

#### The second build's own note, kept for the record — its conclusion was wrong

*"I saw another initial grab oval at the last blue planet, and once I started circularizing it
swapped to a different one... I don't see this issue with the original prototype."*

**The eccentricity cap in [`predictOrbit`](../../src/sim/orbit.ts) was added on 2026-08-30 against a
snap and it bought a slide instead.** `freeze` clamps eccentricity at `ECCENTRICITY_CAP`, so the
prediction clamped it too, on the reasoning that a prediction must not draw a shape the freeze will
never hand out — against a measured snap of 84% of a radius on one tick, one capture in thirteen.

What was missed is that **the true eccentricity is a constant of the motion.** Under gravity alone
the conic the craft is on does not change: measured through one dive it held at **0.726** from the
grab to the freeze, and the uncapped periapsis sat at **167 design units for the whole of it**.
Clamping the shape to 0.6 and then re-sizing the ellipse to pass through the craft — which the same
change added, and which is right — makes the drawn periapsis a function of the craft's *current
radius*. So as the dive fell from 878 to 314 the oval slid **244 → 182**, and on to the floor by the
freeze. Every long dive, continuously, where the snap was one capture in thirteen.

The prototype has no such cap and says why its own version is steady: *"recomputed every frame from
the live state, this converges on the real orbit as the dive proceeds."* Its predictor takes the
floor as an argument and clamps the drawn radius to it — which is what this file's floor clamp and
re-size already do, and they are what was actually fixing the snap.

| over the dispatches that replay at `SIM_VERSION` 9 | capped | uncapped |
|---|---|---|
| the oval's slide across a dive, p50 / p95 / worst | 1% / 14% / 15% | **0% / 0% / 1%** |
| its snap on the freeze tick, p50 / p95 / worst | 0% / 1% / 1% | 0% / 1% / 1% |

**The snap it was added against does not happen any more and uncapping does not bring it back** —
three physics tunings have landed since, and the floor clamp and the re-size carry that job. Traced
on the author's own run the oval now holds one size from the moment it appears to the freeze on
every capture but two, where the residual is the floor clamp releasing.

`ECCENTRICITY_CAP` is untouched in [`freeze`](../../src/sim/orbit.ts), where it is a physics ruling
about what orbits the game hands out rather than a statement about what to draw.

### `KNOCK_BAND` re-measured, 2026-09-01 — the word is not being said at all

The plan has asked for this since 2026-08-30 and it was blocked on a cohort: everything recorded
before `SIM_VERSION` 9 refuses to replay, and the thresholds were ruled on 77 real captures under
older physics. Two playthroughs on 2026-09-01 took the replayable corpus to **13 dispatches and 75
captures**, which is the size the original ruling was made on. So it is taken, and the numbers say
something the plan did not expect.

**The floor is barely being touched.** Over the 75 captures the share of speed it takes runs

| p25 | p50 | p75 | p90 | p95 | max |
|---|---|---|---|---|---|
| 0.000 | 0.000 | 0.000 | 0.001 | 0.001 | **0.141** |

— half of all captures touch it at all, and of those almost every one costs a rounding error. There
is no tail any more. When the band was ruled the same reading was *"p25 0.00, p50 0.03, and then
jumps to 0.13 and above for the four hardest… a tail, not a spread"*, and the tail is gone.

**So `KNOCK_BAND` at 0.15 selects nothing.** The knock is never said in the author's play under
`SIM_VERSION` 9. That is invisible to every test in the repo, because a word that is never said
fails nothing — the shipped pilot fixture still produces exactly one knock, at **0.1548**, harder
than anything the author has flown, which is `test/sim/run.ts`'s own admission working as documented:
aim is the input it cannot reproduce, so it plunges straight in more often than a person does.

| band | knocks selected | contradicts an arrival |
|---|---|---|
| 0.15 **today** | **0 (0%)** | 0 |
| 0.12 | 1 (1%) | **1** |
| 0.10 | 1 (1%) | **1** |
| 0.05 | 1 (1%) | **1** |

**And the margin the constant claims is gone.** `tier.ts` says 0.15 *"clears with margin"* the
hardest knock any tight arrival takes, *"which is measured at 12.9%"*. On this cohort that number is
**14.1%** — and it belongs to a capture that earns the arrival word. The margin is **0.009**, not
2.1 points, and every band low enough to fire at all fires on exactly that capture. So the two words
cannot currently be separated by moving this threshold alone: the hardest landing in the corpus is
also a tight arrival.

**This is the author's, and it is a choice between three things rather than a number to nudge:**

1. **Leave it.** The knock is reserved for a collision harder than anything the current physics
   produces in their play. It costs a built word that is never heard.
2. **Re-grade it on something other than the floor's share.** The share collapsed because the dive
   changed, not because landings got gentler — `knock.ts` derives the word from *"the radial speed
   the floor removes"*, and three tunings have moved what arrives at the floor. The turn the craft
   makes, which `knock.ts` also measured at the time (**45.7°** on the flagged capture), has not
   been re-read and may have survived where the share did not.
3. **Accept the overlap.** Lower the band and let one capture in seventy-five say both, against
   `knock.ts`'s own rule that the two *"must never contradict each other."*

⚠ **75 captures is a thin cohort and it is one player.** It is the same thinness `ARRIVAL_SIDEWAYS`
records, and it is the cohort the original ruling used — so this is comparable evidence rather than
better evidence.

#### Option 2 is closed: the turn does not separate them either, and the clearance is why

Re-grading the knock on the **turn** rather than the floor's share was the option worth trying, since
`knock.ts` measured 45.7° on the capture that prompted the word and that reading had not been
re-taken. Taken now, over the same 75 captures:

| sharpest single-tick turn in the dive | p50 | p90 | max |
|---|---|---|---|
| all 75 captures | 3.6° | 5.0° | **26.5°** |
| the 9 tight arrivals | 3.8° | — | **26.5°** |
| the other 66 | 3.5° | — | 6.6° |

**All three readings pick out the same one capture.** The floor's share (0.141), the sharpest turn
(26.5°) and the biggest single-tick speed drop (111 design units) are the same event, and it earns
the arrival word. Everything else in the corpus turns at most 6.6° and loses nothing measurable. So
there is no threshold on any of the three that names a collision without also calling a good capture
a crash — **not because the line is in the wrong place, but because there is only one candidate.**

**The clearance is what ate the population**, and it is doing exactly its job:

- **68%** of captures needed a clearance — the dive was aimed *under* the floor and was lifted onto
  it, over 4 ticks at p50.
- **69%** land on the floor within a design unit of it.
- And the floor takes **no speed**: p50 0.000 of it.

`clearance.ts` turns the velocity until it is tangential *before* contact, so by the time the craft
reaches the floor there is no radial component left for the floor to remove — and the radial
component **is** the knock (`knock.ts`: *"the radial speed it removes is the kink"*). The craft
arrives at the floor rather than into it. Two thirds of the dives that would have slammed are lifted
first, by a mechanism built to stop exactly that.

### ⚠ Ruled by the author, 2026-09-01: the knock stays exactly as it is

*"That feature is one of the best hidden gems. We definitely want to keep it. It happens rarely, and
it's really fun to see your 'pilot' comment and complain. If anything we should extend the words to
make it even funnier."*

**So `KNOCK_BAND` is not to be moved and the word is not to be retired.** Rarity is the point, and
the measurements above are recorded as context rather than as a case for changing anything. Two
things follow from them that a future session should know rather than rediscover:

- **Nothing in the repo tests that the knock can still be earned**, and nothing can: the shipped
  pilot fixture produces exactly one, at a share of 0.1548, and no `KNOCK_BAND` between 0.001 and
  0.155 changes what that fixture says. `test/state/goldens.test.ts` says so in place. A change to
  the dive or the clearance can take the word to zero without failing anything.
- **The word has not in fact been heard since `SIM_VERSION` 7.** Over all thirteen dispatches that
  replay, the presentation layer strikes **0** knocks against 9 arrivals. Recorded as a fact about
  the corpus, not as a complaint: the author has ruled the behaviour good and rare, and one in
  seventy-five captures is what the current physics offers.

**Extending `KNOCK_WORDS` is wanted** — *"we should extend the words to make it even funnier"* — and
is a small change with one rule attached: `knock.ts` chooses by `tick % KNOCK_WORDS.length`, so the
list's length is part of the run's determinism and the goldens pin the word a given tick says.

⚠ And the one thing not to do is move `KNOCK_BAND` **down**: every band low enough to fire more often
fires on the single capture in the corpus that earns the *arrival*, which is the contradiction
`knock.ts` exists to prevent.
