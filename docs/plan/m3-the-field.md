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

### ⚠ The sideways axis is built, 2026-09-01 — and it is not the parked camera session

This step has owed the axis since M1.4 retired `camera.ts`'s *"it does not pan sideways"*. The
author called it due once the boundary landed:

> *"I think we need to add the sideways camera movements at this point to properly test the
> off-screen boundaries."*

**It is the same two mechanisms on a second axis**, which is what `camera.ts`'s own note predicted —
*"in a field that panned, the same blend would carry `x` too."* The deadzone, its rounded edge, the
follow ease and the lock are all shared, and **there is no sideways constant**: a deadzone that is a
body's floor radius has no axis, and a follow rate is a rate. The clamp and the backstop the
prototype needed are not built either, because [`visible`](../../src/render/letterbox.ts) already
bounds the drawn world by the corridor and was written against `camera.x` for this day.

**What it is worth.** M1.4 measured that the craft can be **538 design units outside the picture and
still alive**. Over the 18 dispatches that replay at `SIM_VERSION` 9, the craft is outside the
picture on **3.4% of ticks** without this and on **0.00%** with it. The M1.4 defect, closed — and the
line lands on screen on 0.78% of ticks, which is *"only when the ship is along the edge."*

**And it is calmer than the axis already flown**, measured the way the parked session says *abrupt*
has to be measured:

| jerk, design units | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|
| sideways | 0.01 | 0.44 | 0.55 | 0.77 | 12.35 |
| vertical | 0.11 | 0.62 | 0.73 | 2.38 | 20.66 |

Lower at every percentile. `test/state/camera.test.ts` holds that as a standing comparison rather
than as a recorded number, so the sideways axis can never become the jerkier of the two. It is
exactly still on **49%** of ticks against the vertical's 31% — the craft weaves rather than climbing
sideways, so the stillness is the run's rather than the mechanism's.

#### What it does not reopen

The camera was parked on 2026-08-31 after eight corrections in one evening
([M2](./m2-the-instrument.md)). **Every one of them was about the vertical axis** — the lock
arriving, `OVAL_BAND`, the settle's descent, the framing clamp — and **not one line of the `y`
computation is touched here**, so that evidence and those complaints are exactly where they were.

**The look-ahead is deliberately not carried to `x`**, and that is the parked session's own first
measurement doing its job: `LOOK_AHEAD` is where the largest single-tick change in the view was found
(10.2 design units at a freeze against 3.1 at a release) and three corrections were made to the lock
before anyone looked at it. Adding a second one on an axis the author has not yet flown would be the
same mistake with the order reversed. It is the obvious next lever if the view feels late going out
to a wall, and it is the prototype's own axis for it.

#### Four assertions were proxies, and they have been re-aimed rather than deleted

Each was asserting something real *through* `camera.x === centreline`, which stopped being available:

- **`test/state/release.test.ts`** carried ADR-0012's refused punch — *"6px along the exit
  tangent"*. A kick is an **impulse**, so it now asserts the release tick puts no **step** in the
  view, measured as jerk against the largest jerk elsewhere in the same swing. That is the claim; the
  old one was a proxy that a panning camera happened to make unavailable.
- **`test/state/goldens.test.ts`** now asserts **the craft is on screen on every tick of the run** —
  the property the pan was built for, over a run that goes to a wall and dies there.
- **`test/state/camera.test.ts`** asserts the axis itself: it follows, it holds still inside the
  band, it opens on the craft, and it is no jerkier than the vertical.
- **`test/sim/fixture-field.test.ts`** was asserting a property of the **field** — that its bodies
  fit inside the design space — through the camera. It says that against the centreline now.

#### The opening frame moved, and it had to

`openCamera` places rather than eases, *"because a run that opened by gliding from wherever the last
one ended would begin with a lurch."* That rule had only one axis to be true of before. The fixture
spawns the craft **270 design units left of the centreline**, so opening at the centreline would put
the craft outside the deadzone on tick zero and start every run with the view already sliding. It
opens on the craft.

#### The dust had a seam in it, and the pan would have shown it

`dust.ts` laid its tile out across `DESIGN_WIDTH` and hung it on the centreline, on its own recorded
reasoning: *"the two are the same place today — the camera never pans sideways."* Inside a corridor
**1.9 pictures** wide that tile has an edge, and at the wall the player would have watched the dust
stop 315 design units before the line. It is laid out across the **corridor** now, in normalised `x`,
with the count scaled by the corridor's own width so `DUST_PER_SCREEN` keeps meaning *motes in a
picture* — and culled sideways, which a tile one picture wide never needed. Two things fell out of
that worth naming: the array is sized for the **widest** corridor spec 17 §4 describes and the
**ceiling** is scaled to the actual one, because letting the array length do the capping is what
`DUST_CEILING`'s own note warns against.

[`anomaly.ts`](../../src/render/anomaly.ts) needed nothing: it already walked its columns in world
coordinates and left `acrossX` written as a conversion *"so that only one of the two stays right if
that ever changes."* It did.

#### ⚠ Flown and corrected the same day — the drawing was invented and should not have been

The author flew the first build and sent three:

> *"The warning line seems to draw, disappear, and draw again as I'm traveling. It's also really long,
> impacting my normal playing field. I feel like it should only appear, and NOT MOVE, along my
> trajectory and closer to the boundary. Within the main playfield I almost always have an
> opportunity to save myself, so the bright red line is not helpful. This is again something the
> original prototype gets right."*

**The cause of all three is one mistake**: the prototype's `src/sim/rescue.ts` was carried and its
`src/render/deadline.ts` — 437 lines of exactly this problem — was never opened. The prediction was
right and the drawing was invented.

**1 · The flicker was a bug of mine.** The scan is re-run every `RESTATE_TICKS` for ADR-0015's
convergence, and the first build reset the mark's fade on *every* re-run — so the cue faded out and
back in twice a second whether or not anything had changed. A re-scan that finds the same mark is not
a new mark. Measured over the shipped run after: **4 episodes, 8 on/off transitions**, where before
an episode of 78 ticks flickered through two or three of its own.

**2 · The length is answered by weight, not by a shorter line.** The prototype's track also reaches
the craft, and it records why it stopped clamping instead: *"the cross first appears a median 375px
away and 772px at p75, so a 150px clamp drew a segment sitting a quarter of a screen ahead of the
ship, touching nothing."* What it does is put the weight where the decision is — a **hairline** until
`ARM` (150 of its units) from the cross, swelling to the track and then to a lead-in over the last
46. *"The far end carries the connection and nothing else; the weight is all in the stretch with a
decision in it."* Measured, a track here runs **p50 732 and up to 2 277 design units** against a
1 170-wide picture, and all but the last 450 of it is now 1.3 units wide at α 0.12.

**3 · And the cue is ramped on the *lead*** — invisible past 2.63 s, full inside 1.35 s — so it is a
property of how close the decision is rather than of whether a wall is findable at all. ⚠ With a 6 s
horizon that ramp **rarely binds**, because the cross is the *last* saving point and so sits near the
wall: measured, the lead reaches only **2.03 s at most** over the shipped run. It is built because it
is the rule, and it is the thing that would bind if the horizon were raised.

Also carried: the **birth gate** (`MIN_LEAD_SECONDS` 0.25 — *"a cross that appears with less lead than
a person can react in… would be a red blink and nothing else"*, and a birth gate rather than a live
one, because re-testing it *"would blink it out at the moment the player is closest to it"*), and
`DEAD` 0.18 for the stretches that do not save — present, because the gaps are part of the shape, and
faint, because they are not the offer.

The whole cue is behind one `OVERALL` alpha, which is the prototype's own arrangement: *"all three are
fractions of `deadlineAlpha`, so the cue has ONE overall."* Turning the deadline down is one edit.

**Measured after**: the deadline is drawn on **3.1% of ticks** of the shipped run, which matches the
prototype's own finding that the cue is short-lived *"because it works, not because it flickers"* —
74% of its episodes end because the player pressed.

#### ⚠ The deadline and the SOS are built, 2026-09-01 — scoped in a grilling session

The conversation below is closed. What was built is the shape it arrived at, plus the prototype's,
which the author asked for once the options were on the table (*"let's draw a bit of inspiration from
the original prototype here. It does it fairly well"*) — and it did, better than the three options it
replaced.

**One predicate, two presentations.** *Is a rescue still available?* Yes → the windows and the dot.
No → the SOS. That covers both flight states from one rule, which is the prototype's own resolution:
*"one meaning in two states rather than a priority between two opinions."*

**A rescue is having stopped closing on the wall** — press and hold, and the velocity toward that
wall goes non-positive before the run ends. Deliberately not *the swing is safe*: a bar that judged
the swing would refuse to mark a grab that saves a life and then swings wide.

**The marker**, drifting only (`null` while held — the escape from a capture is a release, not a
grab): a closed-form refusal first, one projection of the drift, a scan at **stride 3** with the
stride widening so a scan never exceeds **40 samples**, then the last saving sample refined **to the
tick** so the dot does not hop by a stride as the craft advances into it. **Every** window is drawn,
dot on the far end of the last.

**The SOS**, at the craft and offset **toward** the wall — which avoids the prototype's own recorded
defect by construction (*"that is the same direction as the wake for every wall — so it was drawn
over the ship's trail every single time"*). While held it is armed at the grab, from the deadline the
drift was already carrying: **the press you just made was already too late.** That is cheaper and
more honest than searching release points, and it fixes a defect the prototype names — *"dropping the
captured half would make the skull vanish on the very press that sealed the run, which reads as a
save."*

**What the numbers say, and they are all measured here rather than carried:**

| | |
|---|---|
| doomed drifts holding one window / several / none | 58% / **8%** / 34% |
| a successful rescue turns away in | p50 **37** ticks, p90 63, p99 158, max 349 |
| a coasting heading is unchanged tick to tick | **99.92%** of ticks |
| drift length from the start of a coast | p50 95 ticks, p90 433, max **541** |

The 8% with gaps is why every window is drawn rather than the last. The 349 is why `RESCUE_BUDGET`
stays at the prototype's 360 rather than being cut for speed — at 120 the top 1% of real rescues
would be reclassified as none, moving the dot earlier and strobing at a craft that could still be
saved, which is the direction a distress signal must never be wrong in. The 99.92% is what makes the
scan a property of the **coast** rather than of the frame, and `RESTATE_TICKS` re-runs it every half
second anyway so ADR-0015's convergence rule stays literally true.

**⚠ What it costs, and one decision is not implemented.** The scan's worst tick is about **1 ms**
against `pnpm profile`'s stated 2.8 ms per-tick budget, 8 – 10 times in a 42-second run, and every one
lands on the tick a coast opens — a press-**up** edge, which is the one the phone does *not* already
drop a frame on. Two exact short-circuits are in (a press with nothing in reach, and a press whose
grab is refused) and neither moved it: the cost is genuine work.

**The author chose to spread that across spec 03 §5's own 300 ms fade-in, and it is not spread.** The
scan runs on one tick. It is recorded here rather than quietly skipped: the measurement came in under
the stated budget on a laptop, and the phone is where that has to be settled — `pnpm profile` says on
every line that absolute numbers are the phone's. If it shows, the remedy is the one already ruled,
and `MAX_SAMPLES` is the number it is made of. The horizon is on the bench; `MAX_SAMPLES` deliberately
is not, because nobody can judge a cost knob by eye and the bench is capped at sixty.

**Three spec rows are not built as written**, all recorded in the specs themselves: spec 03 §5's
dashed line past the dot (refused with the band dashes), its singular window (plural now), and the
rescue path the prototype draws — which is a predicted orbit for a press nobody has made, and the
author refused exactly that shape one instrument along on the same day.

#### The deadline, re-based on the **grab** — the conversation that scoped it

The author asked whether it was time to discuss spec 07 §6's `SOS`, and described it as *"flash SOS
next to the ship when it's on an out-of-bounds path while grabbing... there's no turning back
anymore."* Measured, that predicate is wrong three times in four: over 954 held swings in the new
field, **47 leave the corridor and only 12 of those (26%) are unsaveable** — the rest could still be
escaped by releasing. A signal that fires four times as often as it is true teaches people to ignore
it.

Put back to the author, they reframed it, and the reframing is the useful part:

> *"I think the 'coasting past the last save' is the same idea here — I want to have something visual
> **on the field** that tells me **where** I need to save myself by. If I grab after, or just don't
> grab, I'm heading for extinction... the player could release and re-grab if there's another planet
> ahead that will save them. I don't really know how to bake in that fact, though, or whether we need
> to. Maybe a best effort warning is enough?"*

**That is spec [03 · §5](../spec/03-hud.md)'s deadline with its save changed.** §5's dot is *"the last
press that can still save the run"* where the save is spec 07 §5's fuel-priced **burn** — which needs
fuel, which is M4's, which is why the deadline was scoped out of M3.4. **Re-based on the grab it needs
none of that**: the last point on the craft's projected line from which a press still takes a body
whose orbit keeps it inside the corridor is a question about geometry the simulation can already
answer. And it is a mark **in the world**, which is what the author asked for and what a strobe beside
the ship is not.

Measured over 966 synthetic coasting paths that leave the corridor:

| | |
|---|---|
| paths where a grab could have saved it at some point | **639 (66%)** |
| from the last saving grab to the line | p10 217 ms · **p50 333 ms** · p90 717 ms |

**The short window is not the warning, and reading it as one is the trap.** 333 ms is how much *doomed
path* lies past the mark, not how long the player has to react: the mark is drawn on the projected
line ahead of them, so it is visible for as long as they are heading at it. What it says is *this is
where the rescue in front of you stops working*.

**Two findings that shape it:**

- **The other 34% never had a rescue at all**, so there is no mark to draw — and an absent mark
  meaning *you were never savable* is reading safety off an absence, which spec 05 §5 refuses by name
  for the shelter. That is what §6's `SOS` is for: **the mark says where, the strobe says never.** One
  instrument, two states, and it unifies the author's SOS with §6's rather than adding a second.
- **The re-grab tree does not need modelling.** The mark is a fact about the *nearest* rescue, not a
  prophecy about the run — which is the compass's own grammar (*a release here lands in this window*,
  never *and then you will survive*). What is further up the climb is already drawn, by the
  **sightings** and the compass. Best effort is not a compromise here; modelling the whole tree would
  make the mark a verdict, and spec 07 §7 refuses verdicts: *"the boundary never issues a command. It
  states four facts."*

⚠ The 66% and the window are measured over a **synthetic** spread of coasting craft rather than over
real play, and say so. The author's dispatches contain two out-of-bounds deaths, which is not a
cohort.

#### ⚠ The demo flies a **seeded** field now, 2026-09-01 — and the fixture is frozen beside it

> *"Can we change the planet generation in our demo to have a bit more left/right stretch? Not fully
> to the boundary, but I want to have more options for traveling near it."*
>
> *"Can't we switch to a deterministic generator instead, based on some seed? Would that help?"*

**It helps, and the help is in the generator's name rather than in the seed.** A recipe names its
field as a `{ generator, version }` pair and `fieldFor` resolves the generator first. Editing the
fixture's placements bumps `FIXTURE_FIELD_VERSION` and **refuses every recipe flown in it** — the 18
dispatches that still replay, which are the parked camera session's *"evidence and nothing else"* and
what `CLOSING_CONSTANT` was derived from. Behind a **new generator**, `fixture` stays frozen and they
go on resolving. Verified after: **19 dispatches replay, exactly as before.**

`src/sim/scatter-field.ts` is therefore a second generator rather than a second version, and its
ladder is a **copy** of the fixture's altitudes and radii rather than an import — sharing the table
would couple a frozen replay target to a field meant to keep changing, and one edit would delete the
corpus through the back door.

**It is not spec 17's generator.** It takes one rule — §4's *"lateral placement is seeded"*,
alternating sides — and leaves the difficulty curve alone, because the corridor narrowing with
altitude is what spec 07's bands, the camera's pan bound and the rungs are all measured against.

**The spread is 195 prototype units, and the ceiling is measured rather than ruled.** Spec 17 §4
would allow 255 – 277 at this corridor. What binds first is whether a swing out there is *flyable*:
over 800 corpus swings the craft reaches, sideways from the body's centre and **after the freeze**,

| | p50 | p90 | p95 | p99 |
|---|---|---|---|---|
| reach from the body's centre | 88 | 196 | 225 | 298 |
| so a body may sit at | 282 | 175 | 146 | 72 |

against a corridor of 370.5 — so **the fixture's own 150 is almost exactly the p95-safe value**. 195
is the p90 one, chosen by the author from that table. It stops short of spec 17's ceiling because
spec 07 §5's **save** is what makes a boundary excursion recoverable and it is not built.

What it buys and what it costs, measured:

| | fixture | scatter |
|---|---|---|
| mean `|dx|` | 67 | **104** |
| max `|dx|` | 150 | **187** |
| bodies whose centre is inside the outer ×2 band | **0** | **8** of 24 |
| swings that leave the corridor, averaged over its bodies | 1.1% | **3.7%** |
| worst body | 6% | **12%** |

A third of the field now pays ×2 to orbit, which is the *option* the author asked for; the field is
about four times harsher in the one sense that matters, and the save is what is meant to answer that.

**Two things a hand-typed field never needed and a draw does.**

- **Spec 17 §5's invariant 3 caught a real defect on the first seed.** A **fork** is two bodies at one
  altitude, so nothing but their lateral placement holds them apart — and the first draw put the pair
  at 1 100 m **eight units through each other**. A person placing by hand sees that; a draw does not.
- **And how it is fixed changes the picture.** Rejecting the whole field and regenerating is spec 17
  §5's own mechanism, but a fork conflict throws away all twenty-four placements, so the surviving
  seeds are the ones where *everything* landed wide: measured, that pushed the mean `|dx|` from 97 to
  119 and put nine bodies in the outer band instead of six. The bias was an artefact of the mechanism
  rather than anything chosen. Constraining the one draw that is actually constrained — the second
  body of a fork — leaves the other twenty-two uniform. The whole-field rejection stays as a guard.

**⚠ Spec 17 contradicts itself on the clearance, and it is recorded rather than resolved.** §4's
formula clears **60 m** and its prose immediately claims *"no body is ever inside a boundary band"*,
which 60 m cannot deliver against a 220 m outer band; §5's invariant 2 asks for `|lateral| + radius ≤
corridorHalfWidth − 90 m`, a third figure. Nothing here depends on which is right — the measured cap
of 195 is inside both — but whoever builds spec 17 has to choose. **And §5's invariant 1,
*"addresses are strictly increasing in altitude"*, forbids the forks this field is built on**, which
is the same kind of tension one section along.

**What did not move**: the goldens and `pnpm replay` still fly the fixture, deliberately. They are
claims about the **swing**, and pinning them to a field that is meant to keep changing would make
every placement tweak a re-record.

#### ⚠ Flown, 2026-09-01 — three corrections, and the prototype had all three

The author flew the first build of the axis and sent three:

> *"The camera follows the ship laterally a bit too much. I'd like to have it be a bit more
> lazy/slow, again mimicking the original prototype a bit more."*
>
> *"I don't want the 2x 3x text in the hot zone. Let the user discover that themselves."*
>
> *"The boundary of the hot zone should be the end of the camera. I.e. when the player approaches an
> edge, the edge should kind of lock at the screen edge, and not expose stuff 'past' it with the
> exception of anomalies and other safe havens."*

**1 · The band was the vertical's and should never have been.** The first build claimed *"there is no
sideways constant, because there is no sideways question the vertical answers differently."* The
prototype answers it differently and this repo had not looked: `cameraMarginFrac` **0.22** of the
window width, keeping the ship between the margins — a half-band of `0.28 × W`, which is **328
design units** here against the 168 it shipped sharing. Its follow rate is **3**, the one this repo
already uses, so the laziness was never in the rate.

**And the fraction is safe to carry here for the reason `LOOK_AHEAD`'s is not.** That note records a
fraction that broke because the axis changed under it — 0.18 of a *width* applied to a *height*.
This is horizontal to horizontal, so nothing has to be re-derived.

Measured over the 18 replayable dispatches, and it is lazier **and** smoother:

| | camera still | jerk p95 | jerk p99 |
|---|---|---|---|
| shared vertical band (168) | 49% | 0.55 | 0.77 |
| the prototype's band (328) | **69%** | **0.41** | **0.58** |

It deliberately does **not** collapse through the settle the way `OVAL_BAND` does. That ruling's
measurement — *"the craft swings 436 design units at p50 through the oval and the view was flying
only 70% of it"* — is a vertical one, and applying it sideways would glue the view to the craft
during a capture, which is the moment the author called *too much*.

**2 · The `×2` / `×3` labels are gone.** Spec 07's header carries a ruling of 2026-08-27 that put
them *in*, overturning the board's own second law (*"reward is shown, never spoken"*). This
overturns it back, so the board's law stands and the glimmer is the whole signpost.
`test/render/bands.test.ts` now asserts **no text at all**, which is stronger than the criterion it
replaces: §7's *fact, not instruction* line held at zero remove rather than one. `bandAt` stays — it
is the boundary's half of spec 08's multiplier — and is now spent by nothing, like `bloomOf`'s chain.

**3 · The view stops at the line**, which is the prototype's *"the view may not show dead space
beyond a barrier"* and turns out to be two rules rather than one:

- **The field**: the picture's own edge may reach the line and no further. `visible` was not enough —
  it clips the *drawing*, so a camera panned past the line showed bare VOID rather than world.
- **Framing**: the craft may not leave the picture. This is the prototype's *"backstop for the frames
  the ease has not caught up on"*, and it is load-bearing rather than defensive: the band is 328
  units and the ease lags a fast dive by 340 more, so without it a craft crossing the corridor at
  speed left the frame **in open field with no wall anywhere near** — measured on the shipped run at
  ten ticks, worst 668 units out.
- **Where they disagree the field wins**, which is the prototype's ruling (*"a rule about what the
  player may SEE"*) and the author's. They can only disagree with the craft already past the line, so
  what it costs is that a craft dying in spec 01 §10's four units of grace leaves the picture.

Applied **twice** — to the target and again to the eased result — which is the prototype's own
emphatic note: *"the same rule, applied to the place the camera is aiming and then to the place it
actually reached. Writing the backstop its own weaker version is what let ordinary play see past the
dashed line."* Clamping only the target is not enough, because the ease lags it.

Measured after, over the corpus: **the picture shows past a line on 0.00% of ticks**, the craft
leaves it on **0.01%**, and every one of those is a tick where the camera is pinned at the line.

**The author's exception is a named zero.** *"With the exception of anomalies and other safe havens"*
is `SHELTER_RELAX`, which opens the field bound where a **shelter** holds the line suspended — and
only the anomaly projects one, which is M8's. The prototype's is 150 of its units and its mechanism
is recorded rather than built, because its value is in what it cost to go without: *"without it the
view held still, then had to match the ship's speed in one tick: measured at 1137px/s of camera
jerk, reported as a jagged crossing"*, and a boolean handover *"threw the camera 158px."* Ramped, not
switched, at both ends. Building the ramp now would be inventing where M8's shelter goes.

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
- **What an addressed rung says.** Not settled at the time, deliberately: spec 05 §3 recorded two
  readings and declined to rule, both were built, and the bench toggled them with metres the default
  because that is where the evidence leaned. ⚠ **Ruled 2026-09-01 — metres**, after the author flew
  them against each other: *"metres are good for the runs."* The address reading and its toggle are
  now deleted rather than left switched off.

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
- ⚠ **The predicted oval is not the line the craft flies** — reported 2026-09-01, *"the last planet
  I was capturing showed a large oval orbit. My ship was travelling OUTSIDE of that oval, and
  deviating further. I think that we should not show the oval orbit like this when it's not the true
  ship trajectory. It is confusing."*

  **Measured over the 18 replayable dispatches, and it reproduces.** Comparing the craft's own radius
  against the drawn path's radius at the craft's own bearing, over the 3 002 ticks that draw a
  **predicted** path: the craft is **outside its own drawn oval on 78.6% of them**, median 1.11×, p95
  1.48×, worst **402 design units** — a third of the design space's width. The 11 112 ticks that draw
  the **frozen** orbit are exact by construction, so this is entirely the `predictOrbit` case.

  **One correction to the description, and it points at the fix.** The error does not grow: in **0 of
  62 episodes** does it end wider than it started. Every one converges — 1.64 → 1.05, 1.59 → 1.01 —
  because the prediction firms up as the dive proceeds, which is what spec 00 §5's fade is drawn to
  show. What the author is seeing is the **oval shrinking onto the craft** while the craft flies
  outward past it, and relative motion in a picture reads as divergence whichever half is moving.

  **So the worst frame is the first one drawn**, and the existing guard is aimed one step too early:
  `compassOf` suppresses the path only while a clearance is owed (the 2026-08-30 fix for *"a large
  oval… then it switches"*), and the path then switches on at 1.4 – 1.6× and shrinks. The levers are
  to hold the path until the prediction is within a stated tolerance of the craft, or to fade it in on
  that error rather than on a clock. **Both change what the instrument promises, so the ruling is the
  author's**; nothing was changed here, because this is M3.4's step and the compass is not in it.

  ⚠ The dispatch named in the report (`2026-09-01T18-24-19-712Z`) is **timing-only** — 108 ticks, an
  empty input log, no grab in it at all — so it cannot be the run described. The measurement above is
  over the whole corpus instead.

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

### ⚠ Ruled by the author, 2026-09-01: **one fixture**

*"Yes, one. Make it so."* — so the question below is closed and the recommendation under it is now
the position. Nothing in the code changes, because one fixture is what the repo already ships; what
changes is that a future session does not have to re-open this, and `tools/fixture.ts` is the search
that keeps it viable rather than a hand-run hunt.

**The trigger stays measurable and the tool prints it**: a sweep of thirty thousand seeds that finds
none. That is the point at which the moments have outgrown one flight and this ruling would need
revisiting — not before, and not on the strength of a single hard search.

---

**The recommendation this ruling adopted: keep one fixture.** The expensive half of this problem was the thirty hand edits
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

1. ~~**What an addressed rung says**~~ — **ruled 2026-09-01: metres.** *"Metres are good for the
   runs."* Reading (b) and its bench toggle are deleted; spec 05 §3 carries the notice.
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

### Built, 2026-09-01 — three layers, and one of them is a set piece

**The field is weather now.** `src/state/anomaly.ts` places it and reads the sky off it,
`src/render/dust.ts` and `src/render/anomaly.ts` draw the two new layers, and
`src/render/seed.ts` is the render seed the sky had privately and the dust now shares.

**Presentation state gained three fields**, and each is a fact the renderer cannot work out and must
not guess:

| field | what it is | why it is not in the renderer |
|---|---|---|
| `worldSpeed` | how far the world moves across the picture in a tick | a frame is one tick and a rate needs two |
| `chain` | a **named zero** until M4 | two things spend it now — the craft's bloom and the dust's density — and M4 should wire it once |
| `anomaly` | where the weather is, and how far the sky has warmed toward it | a pure function of the field, and the renderer may not see the field |

#### `worldSpeed`, and the measurement that made it necessary

The dust streaks along the motion the player sees, and the obvious source for that is the craft's
own speed. **It is not the same number.** Measured over the 12 973 ticks of the author's replayable
dispatches, world speed against craft speed runs

| p05 | p25 | p50 | p75 | p95 |
|---|---|---|---|---|
| 0.00 | **0.09** | 0.64 | 0.92 | 1.12 |

— through an orbit the craft is at its fastest while the camera holds nearly still, so dust streaked
by the craft's speed would smear while standing still for a quarter of every run. It is read off the
camera's own step in `derive.ts`; **`camera.ts` is untouched**, which the parked camera note asks
for.

It also gives the parked *"the rungs travel by too quickly"* complaint a number at last. Over the
whole cohort a rung crosses every **254 ms at p50** and **121 ms at p05** — the plan's earlier
88 – 107 ms was the escalated tail, not the median.

#### Where the dust ranks, decided before its alpha was

**Three systems now say *speed*, in three different currencies**, and that is what makes a third
safe. The rungs say it as a **rate** (a crossing every 254 ms), the sky as a **ratio** (the same
motion at a fifth and a twenty-fifth), and the dust as a **length** — a mote is a long exposure, so
how far it smears *is* how fast the world is going, read off one frame.

So the answer to *does this make the crossing-rate complaint worse* is **no, and it may help**. At 21
motes a picture a mote crosses the top edge every **383 ms** at the author's median world speed
against the rungs' 254 — half again as slow, scattered across the width instead of arriving as one
line, and three design units wide against a rung's 1 170. A second thing ticking at the rate that was
complained about would have been the wrong build.

**Rank is spent in ink, not in alpha**, because ink is what the eye ranks: over a picture the rungs
lay down about 45 000 design units² at α 0.16 and 0.28, the dust about 1 300 at α 0.1 – 0.3, and the
sky about 2 400 at α 0.12 – 0.32. The alphas overlap and the loudness does not, which is how spec 05
could state a dust range straddling the rungs' two values without contradicting its own stack. A
`DUST_STRENGTH` multiplier ships at 1 — the spec's own alphas, unmodified — and is on the bench,
because the sky needed exactly that knob within a day of landing.

**Two of the board's numbers turned out to be something else once converted.** Its 16 motes sit in a
frame 0.772 the area of this picture, so the density is **21** and not 16 — the same correction
`STAR_COUNT` records making, in the same direction. And its `len = min(64, speed * 0.09)` is an
**exposure**: a number turning a speed into a length is a time, and 90 ms is how long the shutter is
open. Read that way the streak is guaranteed to agree with the motion it is drawn beside instead of
being a second opinion about it.

#### ⚠ And then it vanished at rest — a claim about a canvas that had never been checked

*"Some of the dust disappears when I finally circularize my orbit. This might be due to them being
in the bottom 1/3 of the screen or something else."*

**Not the bottom third**, and the count says so: measured over that run the number of motes drawn
never drops — 33 to 50 every tick, which is only which of them fall in the band. What drops is the
**length**.

A settled orbit is the one place in this game where the world stops. The camera locks on a still
point and `worldSpeed` reads **0.00 at p25 and at p50** of every orbiting tick, so the streak became
`moveTo(x, y); lineTo(x, y)` — a degenerate subpath. The canvas specification says a zero-length
subpath under a round cap paints a circle; browsers in practice skip it, the more so as one subpath
among forty in a single stroked path. **34% of that run's ticks drew every mote as nothing.**

**The comment above it claimed the opposite.** `DUST_WIDTH`'s note said *"a slow one stipples is a
three-unit dot"* — a statement about what a canvas does, written without ever asking one. The test
beside it asserted `from === to` at rest, which is the *intent* faithfully recorded and the *claim*
never checked. That is the shape of the miss worth keeping: a test can pin what the code computes
and still say nothing about what the browser draws from it.

So the shortest a streak may draw is now **a quarter of a mote's width** — unambiguously not zero at
any scale the letterbox produces, and far under the width, so what it draws is a dot. And the
**fade answers to how far the mote travelled** rather than to the length it is drawn at, because a
drawing minimum must not be read as motion; without that split a stationary field is 2% dimmer than
a barely-moving one for a reason about subpaths.

**Nothing fades out, which is more than was asked for.** The report asked for a fade rather than a
pop; spec 05 §2 asks a slow field to *stipple*, so what it does now is stay.

#### ⚠ Ruled on the bench, 2026-09-01 — the sky halves and the dust doubles

Four numbers in one sitting, and they are one decision rather than four:

| | was | ruled |
|---|---|---|
| `DUST_STRENGTH` (multiplies spec 05 §2's α) | 1 | **2** |
| `DUST_PER_SCREEN` | 21 | **40** |
| `DUST_EXPOSURE` | 1 | **1.25** |
| `STAR_STRENGTH` | 0.4 | **0.2** |

**The 2026-08-30 sky ruling was made with nothing in front of it.** *"Only as
background noise"* ranked the sky against the rungs when those were the only two
things saying speed. Dust landed between them, and the author re-ranked all three
at once — the sky halves, the dust doubles, and §2's stack becomes true in **ink**
and not only in draw order: the dust now lays down about **560** design units² a
picture against the sky's **340**, where before it was 125 against 680.

**The α row of §2 is overrun, not reinterpreted** — what is drawn runs 0.2 – 0.6
against a stated 0.1 – 0.3, and spec 05 carries a ⚠ saying so. The number was not
wrong about what it wanted; at this design space's scale it bought a mark of about
one CSS pixel by two, which is not *sparse and quiet*, it is absent.

**And the cheaper lever was not taken.** The measurement pointed at `DUST_WIDTH` —
a number no spec states, where going up from three design units buys presence
without leaving §2's range. The author doubled the alpha instead and the width is
untouched. Recorded because it is the way back under the spec's row if this is
reopened, and because the diagnosis and the fix disagreeing is worth noticing.

**The exposure's quarter matters more than it looks**: at 1.25 the brick cap
**binds** once world speed passes 24 design units a tick — the top 2% of the
author's own ticks — so the guard has stopped being theoretical and is working on
exactly the dives the brickwork was reported on.

**What it costs**, from `pnpm profile`'s census over the shipped run: path points
**137 → 173** a frame, and **strokes unchanged at 46.7**. Nearly twice the motes
for 38 more points and not one more state change, which is what the five-batch
arrangement was for.

#### ⚠ And then it could not be seen at all — *"I don't really notice the dust"* (2026-09-01)

Reported after the exposure was cut, and it is a **size** rather than an alpha. Measured against the
author's own phone geometry — 393 css wide at dpr 3, so one design unit is very nearly one device
pixel:

| | design units | on the phone |
|---|---|---|
| a mote's width | 3 | **1.0 css px** |
| its streak at p50 world speed | 6.9 | 2.3 css px |
| its streak at the fastest tick flown | 28.4 | 9.5 css px |

So a mote is a mark of about **one CSS pixel by two, at α 0.1 – 0.3**. Two comparisons say that is
too small rather than merely small:

- **The starfield was already refused at this size.** Its first build drew stars 0.7 – 2.7 design
  units across and came back as *"tiny specks of white with little to no variation"*; what replaced
  it was 2.4 – 6.4. Three is the bottom of that range.
- **The layer is behind the one it is meant to be in front of.** Counting ink — area × alpha over a
  picture at the median world speed — the rungs lay down about **8 300** design units², the sky
  **680**, and the dust **125**. Spec 05 §2's stack is SKY, DUST, STRATA; at a fifth of the sky's ink
  the middle one is not where the stack says it is.

**The width goes on the bench and the alpha does not**, which is the ordering the sky's own lesson
gives backwards. `STAR_STRENGTH`'s note argues *"it is an alpha and not a size"* because the sky was
too **loud** and shrinking it would have walked back into the specks. A layer that is too **quiet**
is the same argument in reverse — and the alpha here is a number spec 05 §2 states in two places and
the board a third, which makes it the last thing to argue with, not the first.

#### ⚠ The exposure flew as brickwork, the same day

> *"I don't like the star streaks you've added at speed. With the rungs they look like bricks."*
> — author, 2026-09-01

**The reading was right and the value was not**, and it is the same failure the starfield's star
sizes record: a number carried without the regime it was measured in. Direction 05's `climbSpeed`
runs 10 – 140 board pixels a second and sits at **46**; this game's world speed is **138 at p50, 403
at p95 and 568 at the fastest tick anyone has flown**. The game's *median* is the board's slider
maximum and its fast ticks are four times past it, so 90 ms drew a streak three to twelve times
longer than anything Direction 05 has ever shown.

**And the complaint is a geometry, not a taste.** The field is parallel lines every 150 design units,
and a long perpendicular mark spanning the gap between two of them is a mortar joint. At 90 ms the
streak reached **101 units at p95 and 142 at the fastest tick** — two thirds to nearly all of a gap,
drawn square across it.

| | at p50 | at p95 | fastest flown | as a share of a rung gap |
|---|---|---|---|---|
| the board's 90 ms | 35 | 101 | 142 | 23% → **95%** |
| **one tick** | **7** | **20** | **28** | 5% → **19%** |

**One tick is what a shutter open for the whole frame records** — the mote's own displacement between
two ticks, the smallest exposure that is still an exposure and the only one that needs no number at
all. The cap moves with it, and it is now stated **against the rungs** rather than in board pixels:
a fifth of a spacing, because the relationship between the two layers is the thing that matters and
the board's own cap permits 1.4 whole gaps (it never reaches it, because it never climbs this fast).
`test/render/dust.test.ts` holds it at any speed, including ones the game does not yet reach — which
is what the number it replaces did not have.

The exposure is on the bench, from a pure stipple at 0 up past the board's own 90 ms.

#### The anomaly's extent is a stand-in, and says so in three places

Spec 05 §5 places it *"by the day recipe (spec 17)"* and spec 17's generator is after this step, so
`anomaly.ts` carries a hand-made placement standing where a generated one will go — the same status
`fixture-field.ts` has, said the same way. Both of its numbers are the prototype's own **magnitudes**
rather than its mechanism (ADR-0013), because the mechanism is already gone: its anomaly is a body
outside the corridor with a circular `shelter`, and §5 has replaced that with a stretch of field.

- **800 m**, its shelter's diameter. Two readings of this field agree: it holds three bodies and no
  more, and it is just under one picture tall, so a craft inside cannot see both edges at once.
- **0.5625 of the span between the lowest body and the highest**, its own rule for a single anomaly
  — *"evenly over the rows it built, with the bottom eighth skipped."* The behaviour that carries is
  that an anomaly is somewhere you have to **climb to reach**.

Measured, that is **4 140 – 4 940 m**, and over the 13 dispatches replaying at `SIM_VERSION` 9 —
which peak at 1 978 – 7 469 m, median 2 583 — **three reach it and two fly through it.** A fifth to a
quarter of runs, which is the rarity §5's restraint exists to protect, and rare enough to be awkward
at a gate. The prototype hit the same wall and its dev shell drags the first anomaly down to the
opening body *"for testing… without climbing to reach one"*; the bench slider does the same.

**`SIM_VERSION` did not move.** The one row of §5's table that would change a run is *orbiting inside
an anomaly trickles fuel*, and fuel is M4's — so the anomaly is entirely a picture, and
`version.test.ts`'s question (*did a tick move?*) answers no. `AnomalyView.inside` is the predicate
that row will read, named now and spent by nothing.

#### The sky's lead is derived, not ruled

Spec 05 §4 states the ≤ 6% and no distance. `SKY_LEAD` is **one picture, 844 m**, between a floor and
a ceiling that leave one obvious value between them — the derivation is in §4's own notice. Two
things are worth repeating here because they are numbers:

- **6% is quieter than it sounds.** VOID a full 6% toward AURORA is `#130E22`, nine, six and fourteen
  levels above VOID — **dimmer than the faintest star in the sky above it**, which sits fourteen,
  thirteen and nineteen levels up. The ceiling the spec sets is below the quietest thing already
  drawn on it.
- **The ramp is a square, and that is where *never spent early* lives.** A quarter of the way along
  the lead the tint is 0.4%, which moves no 8-bit channel by more than one level out of 255. The
  full 6% is reached at exactly one place, the anomaly's edge.

Over the fixture field the sky is at rest for **64%** of the climb and *perceptibly* at rest for
**74%**.

#### What the storm costs, and the buffer that is also its blur

The prototype's own record is that this effect is where its frame budget died: soft clouds at full
size measured **5× the window's area in alpha-blended pixels per frame**, *"reported as the whole
game lagging the moment the storm came up."* Its fix is to draw the storm at 1/8 into an offscreen
buffer and composite it back — which is also where the softness comes from, because a curtain drawn
as a stack of strokes draws N terraces however many passes it uses. Both crossed, marked as evidence
for the behaviour rather than as an instruction (AGENTS.md §3).

Measured here through `pnpm profile`'s census, over the shipped run — which **does** fly through the
stretch, 5% of its ticks inside one:

| per frame | outside | inside, unbuffered |
|---|---|---|
| rect-blended area, screens | **1.0** | **13.0** |
| gradients | 4.4 | 12.3 |
| strokes | 46.7 | 51.0 |
| path points | 137 | 186 |

The buffer takes the clouds and curtains to a sixty-fourth, so the phone pays about **3.2 screens**:
the VOID clear, the bed, the sky wash and one composite. The census walks the **unbuffered** path,
because a node process has no document — so what it prints is the ceiling, which is the right way
round for an instrument.

**The census could not previously have seen any of this.** `fillRect` was deliberately uncounted, on
the reasoning that the one use of it was a screen a frame — so a layer blending twelve screens would
have reported as four gradients and no paint. `Census.blended` closes that, and `test/census.test.ts`
compares the frames inside the anomaly against the frames outside it over the same run so the hole
cannot re-open.

#### Two things this step did not do

- **The HUD row of §5's table has nothing to bite on.** *Chip backgrounds go true black* is spec 03
  §5's too and the HUD is not built. The one dark ground behind a readable that exists today — the
  callout's rim — is **not** a chip and does not change: it is VOID by an argued ruling, *"a heavy
  black outline under pale text reads as a sticker."*
- **The bow and the wake are still off**, and the dust does not change that argument either way.

### ⚠ Gated 2026-09-01 — the sky passes, and the other half of the anomaly is [M8](./m8-the-anomaly.md)

*"The anomaly effect is good. What's missing is the actual anomaly planet, which is a purple planet
that refuels your ship and gives you a 'grab and boost' effect when you depart it."*

**So M3.3's sky is accepted and the anomaly is not finished.** What this step built is one third of
one of the prototype's three mechanics — the look. The body, its authored orbit, its shelter and the
charge that follows it were scoped in full the same day and are [M8](./m8-the-anomaly.md), which is
deliberately last: it needs M3.4's boundary and M4's fuel, and placing its body would delete the
dispatch corpus the camera's parked session calls *"the evidence and nothing else"*.

**One thing M8 reverses here, and it is worth knowing while reading the rest of this section.** The
curtains, the cloud and the true-black bed will draw only while the craft is **charged** — so the
sky becomes the reward for taking the anomaly rather than a property of the stretch. Everything
measured above about what it costs still holds; what changes is how often it is seen. Spec 05 §4's
≤ 6% ramp is untouched and becomes the whole of what the place says on its own.

**What the gate is for.** The tests can only prove that nothing outside the anomaly repaints the sky
and that the dust cannot have a speed of its own. Whether the anomaly reads as **a place worth
arriving at**, and whether the baseline stays restrained enough to keep it rare, is the author's, and
the anomaly slider is there so it can be reached without a five-minute climb.

### ⚠ Flown 2026-09-01 — the lag was the bench's, and the game page said so

The author reported *"noticeable lag when playing"* on the **bench page** in Firefox on a MacBook,
then flew the **game page** in the same browser and reported it played fine. Both dispatches are in
`diagnostics/`, and the second one is what settled it, because the game page carries the meter and
the bench does not.

**What the meter says about the game page** (`2026-09-01T05-34-49`, a 1 141-tick run that cleared the
field): **a tick costs 0.04ms and the rest of a frame costs 0.28ms.** The worst single frame in the
whole run was **1ms**, and there were no jumps.

**And it locates the anomaly exactly**, which is what a timeline is for. Correlating the meter's
sixteen segments against where the storm was on screen:

| segment | mean cpu | storm on screen | altitude |
|---|---|---|---|
| to 639 | 0.20ms | 0% | 3 200 – 3 724 m |
| **to 767** | **0.84ms** | **88%** | 3 730 – 4 791 m |
| **to 895** | **0.58ms** | **58%** | 4 800 – 5 864 m |
| to 1023 | 0.11ms | 0% | 5 872 – 6 836 m |

So **the anomaly costs about four times a clear frame and is still a tenth of a 120Hz budget.** The
buffer is doing its job. That is the first measurement of this layer on a real browser and it is
recorded here rather than in a comment because it is the baseline M3.6's harness will be compared
against.

#### ⚠ And then the phone, which is the number that counts

`2026-09-01T06-00-36`, **iPhone, Firefox iOS, 393×651 at dpr 3** — the gate device, over a 40-second
run that flew right through the anomaly (754 of 2 422 ticks, with two whole segments at 100%).

| | p50 | p95 | p99 | max |
|---|---|---|---|---|
| cpu | **1ms** | 2ms | 2ms | **3ms** |
| interval | 17ms | 17ms | 19ms | 30ms |

**A tick costs 0.26ms and the rest of a frame costs 0.81ms**, fitted from the frames themselves —
against ADR-0011's 8ms drawn budget, and against M0.5's own measurement that the budget was written
on. And the anomaly, segment by segment:

| segment | mean cpu | storm on screen |
|---|---|---|
| to 1022 | 1.14ms | 0% |
| to 1278 | 1.18ms | 63% |
| **to 1533** | **1.25ms** | **100%** |
| **to 1789** | **1.27ms** | **100%** |
| to 2045 | 1.08ms | 32% |
| to 2300 | 0.93ms | 0% |

**A quarter of a millisecond, which is a quarter of a frame's own cost and a thirtieth of the
budget.** On the laptop the same layer read as *four times* a clear frame; on the phone it is 1.26×,
because the phone's baseline is five times higher and the storm's extra is close to fixed. That is
the whole reason `pnpm profile` prints ratios and says *not a phone* on every line — and it is why
this table is here rather than a laptop's.

> ⚠ **The 1.26× is one run's reading and the pooled one is smaller.** Over all **16 phone traces**
> in `diagnostics/`, segments fully inside an anomaly mean **1.100ms** against **0.914ms** for
> segments with none on screen — **0.186ms, or 20%**. And the honest caveat is that the clear
> segments *alone* span 0.39 – 1.28ms, so **the baseline drifts by more than the storm costs**: where
> you are in the field moves a frame further than the weather does. The conclusion that matters
> survives either reading — it is a fifth of a millisecond against an eight-millisecond budget — but
> the single-run ratio was reading a difference smaller than its own noise, which is the failure this
> plan already has a name for.



### ⚠ The grab drops a frame on the phone, 2026-09-01 — and it is the touch, not the game

Eleven of the twelve worst frames in that run are the tick a dive begins, at a **26ms interval with
1ms of cpu**. Taken across every dispatch that carries timing, the pattern is old, exact and
one-sided:

| | frames | intervals ≥ 25ms | press-downs | worst 12 landing on a press-down |
|---|---|---|---|---|
| **MacBook, Firefox** | 2 546 | **2** | 22 | **0** |
| iPhone, 09-01 06:00 | 2 452 | 24 | 23 | 11 |
| iPhone, 09-01 01:37 | 2 517 | 21 | 24 | 10 |
| iPhone, 09-01 01:25 | 1 912 | 23 | 23 | 12 |
| iPhone, 08-31 22:55 | 1 218 | 6 | 9 | 9 |

**One dropped frame per press, on the phone, and none at all on the laptop with the same twenty-two
grabs.** It predates this milestone — two of those traces are from before the anomaly existed.

**Pooled over all 16 phone traces: 148 frames of 25ms or longer against 142 presses — 1.04 each.**
The trace flown while this was being written reported it of itself, which is what the annotation
below is for: *"22 frames ran 25ms or longer, against 22 presses and 22 releases"*, with eleven of
its twelve worst frames marked `button down`.

**And it is never a release.** Every stall lands on a press-**down** edge; not one lands on a
press-up. That is what takes the game's own drawing out of the suspect list, because a release draws
strictly *more* than a grab does: the callout word arrives with its rim, the compass begins its exit,
the craft takes its punch. If the picture were the cost, letting go would cost more than grabbing.
It costs nothing.

So what is left is the **touch-down path itself** — `app/input.ts` refuses the touch defaults
non-passively, which is what it must do (the *Search with Firefox* callout and the selection loupe
were reported twice from this phone and that refusal is what stops them), and iOS Firefox appears to
spend a frame resolving what the touch means. **That is a localisation and not a diagnosis**, and the
difference matters: the next step is to time our own handlers, not to start deleting
`preventDefault` calls whose reasons are written down and were paid for.

**What is not a guess** is now printed rather than scripted: `pnpm replay` marks every worst frame
that falls on a press edge, and states the stall count against the run's own press and release
counts, so the next dispatch answers this question on sight. Whoever takes it starts with the
correlation instead of looking for one.

**Nobody has reported feeling it**, which is its own datum. It is one frame held half again as long,
at the moment of commitment, and it has been there for every phone session on record.

#### The bench's own defect, which is older than this step

`tools/bench/entry.ts` rebuilds the trail table on **every release, inside the frame callback** —
`if (released) redrawTrail()` — and `redrawTrail` calls `walkRun`, which re-flies the recipe from
tick zero. Measured on the author's own run:

| walkRun over | 200 ticks | 500 | 800 | 1 141 |
|---|---|---|---|---|
| before | 1.27ms | 2.52ms | 6.06ms | **8.96ms** |
| after | 0.23ms | 0.20ms | 0.31ms | **0.37ms** |

**Nine milliseconds on the frame the player just let go on**, growing with the run, twenty-two times
in nineteen seconds — more than a whole frame at 120Hz, landing on the one frame they are watching.
That is the lag, and it has been there since the bench existed; M3.3 only made a slow thing slower by
adding one more field to `derive`.

**The fix is that `walkRun` derives the picture only as far as something asks.** Presentation state
is a recurrence (ADR-0015) so a flagged tick's camera needs the whole run up to it — but past the
last flagged tick it is dead work, and with nothing flagged it is dead for the whole run, which is
the bench's case. `test/trail.test.ts` holds the edge that matters: the guard runs to the **last**
flag and not the first, so a second flag deep in a run still reads the camera the phone drew.

**And the anomaly's placement is memoised.** It is a pure function of the field and the field is one
object for a run, so re-deriving it sixty times a second walked every body in the field to reach an
answer that cannot have moved. A memo rather than a state: nothing about replay or ADR-0015's
convergence touches it.

**What this does not answer** is whether the bench still lags with the stall gone. The bench carries
no meter — it builds a dispatch but not a timing report — so the author's answer to *bench or game
page* is **the game page**, which already reports. Wiring the meter into the bench is worth doing and
is [M3.6](#m36--the-frame-budget-harness)'s, beside the phone baseline it already owes.

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

### ⚠ Built, 2026-09-01 — and it needs the author on one thing

The bands are built: the three laws, the two bands and their dashed edges, the gradient, the motes,
the labels, the line, and the AURORA a shelter paints them in. `src/state/boundary.ts` holds the
geometry and the law and `src/render/boundary.ts` the paint, split the way `rung.ts` and `rungs.ts`
are — so the whole first law is asserted in `test/state/boundary.test.ts` without a canvas, and
everything the canvas is actually asked for is asserted in `test/render/bands.test.ts`.

**Nothing here moved `SIM_VERSION` or `FIXTURE_FIELD_VERSION`.** The line has killed since M1.4;
this is the picture of it.

#### **Ruled, 2026-09-01: the boundary is off screen on purpose, and it stays absent until you go out**

M3.4 measured that a phone shows 35% of the outer band, none of the fire band, and no line, and
raised it as the author's. **The author closed it the other way round** — the geometry is right and
what was wrong was that the boundary drew at all:

> *"I personally think it's a good thing to have the field wider than the viewport. It opens up the
> room for ambiguity and exploration, so if a player is zooming up the right hand side in the hot
> zone (because they're going fast and there are no planets there), they might miss out on powerups
> or anomalies on the other side. **The boundary SHOULD be off screen for majority of play**, and the
> warning ion glow should only activate when they approach and then learn that it's a danger zone. I
> don't want to signal danger during normal gameplay, only when the ship is along the edge (outside
> of the default viewport)."*

So the corridor being wider than the picture is a **feature with a price** — what you give up by
racing one wall is seeing the other — and spec 17's powerups and M8's anomaly are what will make that
price real. The geometry stands exactly as spec 07 states it:

| | design units | metres |
|---|---|---|
| picture edge | **585** | 195 |
| outer band starts (line − 220 m) | 452 | 150 |
| fire band starts (line − 90 m) | 842 | 281 |
| **the line** | **1112** | 370 |

**What was actually signalling was the dashed band edge, not the glow.** At the picture's edge the
gradient is down at **α 0.0095** and invisible; the dash at `line − 220 m` sits 133 design units
inside the picture at **α 0.25**, does not scale with heat by spec 07 §2's own rule, and therefore
drew a pink dashed line down both sides of the screen for the whole of every run. That is why the
gate reaches the whole layer and not the gradient alone.

**The gate is `presenceOf`**, and it is the author's own words as arithmetic: zero while the craft is
inside the default viewport (spec 00 §7's 1170, so 585 from the centreline), ramping up over a fire
band's depth of travel. It is measured from the **centreline and not from the camera**, deliberately
— the author has said *"we'll need the camera shifts soon"*, and a gate written against the camera
would silently change meaning the day it pans. The two sides come up independently, so racing the
right wall lights the right boundary and leaves the left absent.

Measured: the boundary now draws on **3.4% of frames** over the author's own 18 replayable
dispatches, and on 8.8% of the shipped run — which dies out of bounds, so it does go to the wall.
Fully lit lands at 257 design units from the line against the fire band's own 270, so the glow
finishes arriving just as the craft enters the band it is warning about.

**And absent means nothing asked of the canvas**, not a layer at alpha zero — `CONTEXT.md`'s decay
rule, and the difference the phone actually pays. Clear of the anomaly, a frame away from a wall
blends **1.0009 screens**, which is the buffer's own VOID fill and not a unit more; at a wall it is
1.115. `test/census.test.ts` holds both, because a dimmed layer would pass an eye test and cost the
same.

#### `K` is 640 m/s, and the board's own 120 could not cross

Spec 07 §3 says only *"tuned on the phone"*. Direction 07's live component — the only place the
boundary has ever been drawn — runs this exact formula at `closing / 120`, with `closing` in board
pixels per second, and board pixels are metres here. **Carried at face value that makes the edge a
switch**: the closing term alone reaches 1.75 at the median dive this game flies, past the cap before
proximity is applied, so every dive would be identical and maximal. It is exactly `DUST_EXPOSURE`'s
recorded failure — a number carried without the regime it was measured in.

What crosses is the board's **ratio**. Re-run headlessly at its authored default (`aggression` 1, on
a 0.3 – 2 slider) its demo craft dives at up to **83** against a `K` of 120, so its fastest dive
lands at **0.69 K**. The fastest closing ever flown at this boundary is **442 m/s**, over the 18
dispatches that replay at `SIM_VERSION` 9 — 21 012 ticks, 1 935 of them inside the bands. That is
`442 × 120 / 83 = 639`.

**And spec 07's own acceptance caps it independently at 807**, from its weakest case: the median dive
the corpus flies into the fire band (210 m/s) clearing 0.6 at the fire band's shallowest point, where
proximity is only 1.67. A value derived from the board and a ceiling argued from the spec agree from
opposite directions with nothing in common.

What it does, over the corpus:

| | heat p50 | heat p95 | ≥ 0.6 | at the cap |
|---|---|---|---|---|
| Holding a body, inside the bands (n = 1 464) | 0.16 | 0.70 | 8.7% | 1.5% |
| Coasting, inside the bands (n = 471) | 0.51 | 0.85 | 28.5% | 11.9% |
| Inside the fire band (n = 81) | 0.85 | — | 98.8% | 58.0% |

The band the player *lives* in idles at 0.16 and the fire band flares. And the spec's *"within
500 ms"*: over the corpus, **95.8% of rises from ≤ 0.25 to > 0.6 happen inside 500 ms**, at a median
of 67 ms.

#### The acceptance's first criterion is unsatisfiable inside 40 m, and `K` is not why

*"Flying parallel inside the fire band produces `heat ≤ 0.25` sustained."* At zero closing the
formula is `0.10 × (1 + 60/d)`, which passes 0.25 at **d = 40 m** — with no closing at all and
whatever `K` is. The fire band starts at 90 m, so the criterion holds over its outer 56% and is false
over its inner 40 m from the proximity term alone. Asserted where it holds, recorded where it does
not; **the ruling is the author's.**

#### What is not built, and why it is an ordering rather than an omission

- **The save and the burn** (§5). A save is a press that carves the craft back into the field, so it
  changes what a tick does with a press — `SIM_VERSION` moves, and the parked camera session's only
  evidence is the corpus that a bump deletes. Spec 05 §5's ordering already covers it.
- **The deadline track** (§4). Its dot is *"the last press that can still save the run"*, and there
  are no saves to be last among. **But the projection question is settled and free**: a craft leaving
  the field is coasting, a coasting craft feels no gravity at all, so its projected line is a
  **straight ray** — exact, one intersection, no integration. Measured: all 81 fire-band ticks and
  both out-of-bounds deaths in the corpus happened while coasting, and the closest a craft holding a
  body has ever come to the line is **91 m**, outside the fire band entirely. The conic case does not
  arise.
- **Fuel** is M4's, and it is what §4's convergence prices the save by.
- **The debrief card** is M6's.

#### The hitstop is refused, and the refusal now names death

§6 puts a **70ms hitstop** at the line. [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
rejected the hitstop and `CONTEXT.md` scopes that refusal to *"a brief world freeze at grab and
release"*, which does not name death — so it was not covered. It is now, on the ADR's own argument
rather than by extension: the ADR's ruling is *"even a 30ms stop made it feel like the game was
buffering"*, at **every length tried**, and 70 ms is longer than the 30 that was refused. The ADR
also records that stopping the step breaks the fixed timestep. Neither of those reasons is about
*which event* the freeze follows. And it cannot be built here anyway: a time scale is a simulation
change and `SIM_VERSION` may not move. **§6's `70ms hitstop` row is therefore refused**, and the
death sequence's remaining beats are dated from T0.

#### What it cost, through the census

Per frame, over the shipped run, at the design space's own size — which is a phone's share of the
bands:

| | before | after |
|---|---|---|
| gradients | 4.43 | 6.43 |
| arcs | 31.4 | 37.1 |
| strokes | 46.7 | 54.4 |
| path points | 173.0 | 190.7 |
| blended, screens | 1.96 | 2.19 |

**Two costs were found by measuring rather than by looking**, and both are the same mistake: the
motes and the gradient were drawn across the whole band and left to the clip. On the one device where
the band is mostly off screen that is the whole point — the wash alone was **1.13 screens a frame**
against the 0.23 actually visible. Culled sideways, it is 0.23. `test/census.test.ts` holds the
ceiling that fails if the clip is ever dropped.

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

⚠ **The bench has a meter now** (2026-09-01), and it was owed. The author reported lag on the bench,
asked whether to use it or the game page for reports, and then sent a second bench run — which could
not answer the question either, because `tools/bench/entry.ts` built a dispatch with no timing in it
while `app/main.ts` had carried one since the performance session. **The one page with every open
question on a slider was the one page that could not say what a slider costs**, which is the wrong
way round: moving `RUNG_STEP` or the anomaly's span is exactly the kind of decision a frame time
should be attached to.

It is the same meter and the same shape on the wire, so `pnpm replay` reads a bench dispatch exactly
as it reads a phone's — a second timing format would be a second thing to teach `tools/trail.ts`.
And the bench shows **p99, the worst frame and the fitted per-frame cost live in its own HUD**, so a
slider's cost is visible while it is being moved rather than only after a dispatch is copied out.
`VISION.md`'s standing rule holds: p99 and max, never a mean — a rendering-induced hitch is precisely
what an average of frames that mostly return early hides.

**What is still M3.6's**: a *command* that reports p99 and max for a replayed recipe without a
browser, and the recorded phone baseline. What this closes is only that the bench can now be asked.

### ⚠ The bench lost a third of its sliders, 2026-09-01

*"There are a LOT of knobs on the bench page right now. Can you clean it up? Some are stale, and
others are kind of poorly explained."* **74 → 50**, against one rule, which the rung label's own
ruling established the day before: **a knob whose question has been answered comes off the bench.**

What earns a slider is now written at the top of `tools/bench/patches.ts` and is three things —
an open question the spec names, a taste the author is **still moving**, or a switch that turns a
parked feature off. What loses one:

| gone | why |
|---|---|
| `BOUNCE_RESTITUTION`, `RINGS`, `MIN_HALF_WIDTH`, `TIDE_LAG_RATE_MAX`, `STRETCH_ALONG`, `STRETCH_ACROSS`, `PATH_FADE_RATE`, `FILAMENT_SPAN`, `FILAMENT_FLOOR` | ruled by the author on a dated flight, with a measurement behind it |
| `DEADZONE`, `FOLLOW_RATE`, `LOCK_TICKS` | **the camera is parked**, so its numbers are not the bench's to move. The whole card is gone; the lock *switch* stays, because it turns a mechanism off rather than tuning it |
| `E1_BLOOM`, `E2_BLOOM`, `E3_BLOOM`, `E3_TICKS`, `ENTER_TICKS`, `EXIT_TICKS`, `PUNCH_TICKS`, `PUNCH_STRETCH`, `TRANSIENT_SECONDS`, `POP_RISE`, `SIGHTING_RADIUS`, `RING_SPREAD` | the design states the number outright and nobody has ever questioned it. Two of them are sharper than that: **nothing strikes an E3 today**, so its radius and its length were sliders on a thing that never draws |

**A taste that keeps moving is not an answered question**, which is the one place the rule needed a
distinction. `TIDE_HALF_WIDTH_MAX` was ruled *today* and stays, because it has now moved twice in
three days and the next flight may move it again; `RINGS` was ruled once against a measurement over
342 releases and goes. The test is whether moving it can still change a decision.

**And six patches drove nothing at all** — `ARRIVAL_REF_SPEED`, `ARRIVAL_SPEED_RELIEF`,
`PATH_STRENGTH`, `RIM_IN_REACH`, `SPEND_TICKS`, `TIDE_SWELL` were made settable with no slider
anywhere, which `test/bench.test.ts` could not see because it only asked whether the patch's text
still matched. It now asserts the pairing in both directions: every patch has a slider and every
slider has a patch. The other direction was never possible by accident and is the worse failure — a
slider whose constant is still `const` answers a question confidently and wrongly.

**Nothing in the game moved.** A patch is applied at bench-build time only, so removing one leaves
the constant exactly where its ruling left it.

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

### ⚠ Overturned by the author the same day, 2026-09-01: the word was never being said

*"The last capture and orbit in `diagnostics/2026-09-01T02-29-53-120Z-run-dispatch.json` should've
shown the knock effect. Can we tweak it?"*

**The ruling above and this one are not in conflict, and the reason is what the ruling was made
against.** *"It happens rarely"* was said about a band that had been measured, the same day, to fire
**zero** times in the author's whole corpus. A word that is never said is not rare; it is absent —
and the section above says so twice and then rules it good anyway. The dispatch below is what
happens when the author flies expecting it.

**The capture they flagged is the second-hardest floor landing in the corpus and the most head-on
approach in it**: tick 478, aim **0.006**, and the floor takes **5.7%** of its speed. Under 0.15 it
said nothing.

#### What the measurement found, and it is not the threshold

The one capture blocking every lower band — 14.1% of its speed to the floor, earning the arrival —
is at aim **0.994**. As sideways as this game gets. It is a **slow** capture: entry speed 291 against
a corpus median near 700, so a small absolute cut is a large *share* of a small speed. **The floor's
share saturates at low speed**, which is the exact mirror of the failure `ARRIVAL_SPEED_RELIEF`
already corrects on the arrival's side (2026-08-31), and it means the share is not the reading of
**aim** that `knock.ts` and `CONTEXT.md` both say the knock is.

So option 2 above — *re-grade it on something other than the floor's share* — is reopened and taken,
in the one form the earlier attempt did not try. It was tried on the **turn**, which picked out the
same single capture. **Aim itself was never tried**, because the share was believed to be a reading
of it.

`struckHard` now asks for the floor's share **and** an aim strictly below the line `arrivedTight`
asks it to be at or above, at the same speed. The invariant stops being a fact about a corpus and
becomes a property of the predicate: **the test that grants one word denies the other**, so no cohort
can disagree with it. `test/sim/tier.test.ts` asserts it over the whole plane of aim and speed rather
than over an example, and asserts the pair is *exhaustive* as well as exclusive — no aim earns
neither word for being neither.

| over 78 captures in 14 replayable dispatches | before | after |
|---|---|---|
| knocks said in the author's play | **0** | **1** |
| share of captures | 0% | **1.3%** |
| ticks lighting a knock and an arrival together | 0 | **0** |

**It is rarer than the ruling that called it a hidden gem.** The original 0.15 was measured to select
**4%** of captures; this selects 1.3%. What changed is that the 1.3% is a capture the author flew and
expected, rather than a capture nobody has ever produced.

#### Where 0.01 comes from

With the aim gate on, the head-on captures — the only ones now eligible — sort into a tail and
nothing else: **0.0572**, then 0.0024, 0.0010, 0.0009, 0.0009, 0.0009 and down, over 46 of them. The
band sits inside a **24× gap**, four times clear of the next-hardest touch and 5.7 times clear of the
author's own example. That is the margin 0.15 claimed and had lost — re-measured earlier the same day
its own was **0.009**.

**It does not go on the bench**, which is the 2026-09-01 rung-label precedent applied to itself: a
knob invites the answer to be re-litigated, and this number is a gap rather than a taste. If the gap
closes — a physics change that fills it — that is the trigger to look again, and
`test/sim/tier.test.ts` asserts both of its ends so the session that closes it finds out.

#### What it cost, and what it did not

**`SIM_VERSION` does not move.** `struckHard` is read in exactly one place, `derive.ts`, and no tick
reads it — this is `test/sim/version.test.ts`'s own *picture, not flight* case, and the answer to its
question (*did a tick move?*) is no. Every dispatch that replayed still replays.

**The shipped pilot fixture is unchanged**: it says one knock, on tick 386, at every band from 0.15
down to 0.005, and its aim of 0.305 is head-on at its speed. The goldens did not move.

⚠ **And the gap named above the fixture — *nothing in the repo tests that the knock can still be
earned* — was already closed and the note was stale.** It was written before `test/moments.ts`, whose
`each()` throws when a moment it is asked for happened *fewer than once*: `KNOCKS` is found rather
than named, so a dive or clearance change that silenced the word fails the golden by name instead of
passing vacuously. Checked rather than assumed — that is the whole point of finding moments rather
than pinning ticks, and this plan had not caught up with it. **There is nothing to do here.**

**`KNOCK_WORDS` is untouched**, so the determinism note above still stands and extending the list is
still wanted.
