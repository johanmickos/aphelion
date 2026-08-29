# M2 · The instrument

The compass is the signature element — the thing a screenshot is recognised by — and
`VISION.md` calls its ancestor the best piece of UI in the game: diegetic, positioned exactly
where the eye already is, teaching the timing window without a word of text. It is the bar
everything else is measured against.

This milestone comes before the field, which means spending it flying a beautiful compass
over an ugly world. That is the right order: the gate is feel, and the compass is where the
feel is read.

---

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

### Queued, from the same sitting

**A collision has no voice.** *"I want to show a quirky 'Clang!' or similar when I bounce into
another planet while holding a different one"* (author, 2026-08-29). Recorded here rather than
built: it is a **release-and-impact** moment and belongs with M2.4's vocabulary, next to the award
word — same class of thing (a word that blooms at the point that earned it, spec
[06](../spec/06-awards.md)), opposite register. Two questions come before any pixels: whether the
simulation reports the contact at all today, and whether a bounce costs the run anything, because
a word that appears when nothing happened is a joke told twice.

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

## M2.5 · Presentation goldens

Assert derived presentation values at named ticks across a recorded recipe — the camera offset
at the tick after release, the craft's bloom radius at chain 7, which award is alive when. No
canvas, no PNG diffing.

**Acceptance**: a regression in any choreography above fails a test. **Verify**: `pnpm test`.

---

## Gate

**The author flies it. The question is whether the release lands.** Next:
[M3](./m3-the-field.md).
