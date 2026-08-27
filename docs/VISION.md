# Aphelion — Vision

_A game about swinging a spaceship through gravity, where the only thing you do
is decide when to let go._

---

## What this document is

**Intent, not behaviour.** How the game *works* is explained next to the code
that implements it. This file says what the game is for, what governs it, and
what it should become.

It therefore names no config key, no function, and no tuning value. Where a
number appears it is a **measurement** — something observed across recorded
sessions of the real game — because a measurement can only be superseded by a
better one, never quietly contradicted by a rename.

Read it before deciding what to build. Read the code before deciding how.

---

## The fantasy

You move through space by **using gravity rather than fighting it**. A planet
catches you, swings you round, and you fling off along the tangent toward the
next one. Gravity does the pulling; you do the timing.

The reference feeling is **Spider-Man swinging through the city** — rhythm,
commitment, and the specific joy of *letting go at the right moment* — in orbital
motion. Everything else in this document is negotiable. That is not.

---

## The pillars

Seven rules, each with the evidence that it is working.

### 1. One verb

Press, hold, release. That is the whole control scheme, and it is enough: the
button means "be caught by that planet" on the way in and "let go" on the way
out, and the entire skill of the game lives between those two presses.

The capture feel is the most expensive thing in the project — a frozen reference
configuration and a ten-scenario equality gate held at exactly zero divergence
exist for the single purpose of making it impossible to lose that feel by
accident while everything around it is tuned.

> **A second verb is not a feature, it is a repeal.** Any proposal that adds an
> input is proposing to spend the one thing the game is certain about. The bar is
> not "would this be good"; it is "is this better than the button".

### 2. Gravity is the world; the skill is when to let go

The player's craft is timing and shape, never throttle. What makes that a skill
rather than a reflex is that the two things worth optimising **fight each
other**: the boost envelope peaks a fixed interval after the orbit freezes, and
the release marker sits at a fixed angle, so hitting both means shaping the dive
so they arrive together.

> That tension is not authored. It falls out of physics that is already running,
> and the scoring layer only gives it a name. **Look for the mechanic the
> simulation is already performing and has no word for, before adding one it
> isn't.**

### 3. Failure is instant and legible — cheap to retry, never arbitrary

A life is the unit, and a death takes the run's score with it. Only the session
best survives. The walls, the burn and the point-of-no-return are a genuine
high-stakes system, and the stake is what makes the save worth flying for.

What stays cheap is the **retry** and the **explanation** — never the stake. The
failure this pillar exists to prevent is the death that reads as arbitrary from
the player's seat: lost off course, with a full tank and two planets on screen,
and no account of what went wrong.

> Every out-of-bounds death gets a debrief, and it has to: across the recorded
> corpus only 32% of them ever had a rescue cue on screen, so anything speaking
> only to those is answering the minority case.
>
> **The hardest case is still unanswered.** Of 199 out-of-bounds deaths, 95 were
> captured on the final tick and 106 for most of the last half second — and the
> rescue cue is silent while captured. The commonest way to die is the one the
> game says least about. See the open calls.

### 4. Risk is a dial you aim at, not a prompt you obey

The point-of-no-return marker is not a warning. It marks the maximum of the curve
the burn pays out on — the latest legal save is also the longest, hottest and
best-paid one — and the whole point is to be able to **aim at it**.

Instruments state facts and let the player draw the conclusion. Nothing on screen
tells the player what to do, and that is a property of the game rather than a gap
in it.

> It works as a dial: across 640 marker episodes, 74% end because the player
> pressed, with a median 1.77s of lead; 24% because the ship sailed past; 1% in
> death.
>
> And the risk is real — 78% of burns end in one. That is the correct shape,
> because a death drops the whole banked fire: **the drama is free and only the
> save is paid.**

### 5. Nothing is taken away; rewards are withheld

Altitude is **banked**, not paid — it cashes at the next release — so coasting
past planets earns nothing until you engage again. The pressure to keep flying is
built entirely out of withholding.

**Withholding a reward and confiscating one are different in the hand**, even
where the arithmetic matches. The one deliberate exception is death, per pillar
3, and it is an exception precisely because the stake is that system's whole
point.

### 6. The game speaks through instruments, not labels

Every good cue is **drawn on the thing it describes**: the release gauge on the
orbit path, the compass rings pointing at the bodies they lead to, the deadline
track lying along the ship's own projected line. The arc gauge is the best piece
of UI in the game — diegetic, positioned exactly where the eye already is, and it
teaches the timing window without a word of text. It is the bar everything else
is measured against.

Where words are unavoidable they follow one grammar: **colour says how good it
was, the word says what it was.** Colour is a rarity ladder every player already
knows. Category belongs to the word, and every word names its own axis — six hues
read in peripheral vision over a moving starfield is past what anyone tells
apart, and "how good was that?" is the question that actually needs a channel.

> **The vocabulary is currently too deep to learn.** 45 words exist; one
> 85-second session showed 14 distinct ones, almost every one exactly once. A
> word that never repeats never becomes a signal, so colour is doing all the
> work. See the open calls.

### 7. The game is measurable, so its design calls are measured

A run is fully described by its configuration, its seed and its input log —
nothing else. That is not an engineering nicety, it is how the other six pillars
are enforced. It makes a bug report a **recipe** rather than a recording, a score
independently recomputable from a replay, and a threshold a **percentile of real
play** rather than a plausible round number.

> Round numbers get thresholds wrong in both directions. Gated at a
> plausible-sounding value, one award fires zero times in 112 recorded releases;
> another, set at the obvious smoothness line, praises 42% of all captures — a
> statistic about the physics wearing the costume of an achievement about the
> pilot.
>
> The standing hazard is **staleness, not error**: a threshold measured under
> tuning that has since moved is worse than an unmeasured one, because it looks
> defensible. Re-measure under the current build.

---

## What a run is

**The run is the unit.** One vertical field with a top. Clear the last planet and
a run-in carries you to a finish line, the sky goes to lightspeed, and a sheet
reports what the run was worth. Every run ends with that sheet — field cleared,
or not.

Reaching the top is the win. Nothing should be designed as though a run were a
leg of something longer until the field itself is worth flying twice.

The second course length is **apparatus, not design** — short enough to watch the
ending twenty times in the time one full run takes. It is not an easy mode, and
difficulty is not yet something the game has at all.

---

## How it should look

**The game already knows what it wants to look like, and it looks like it about a
quarter of the time.** Inside an anomaly the sky becomes a purple aurora: wavy
curtains hung across the field and sweeping down past you as you climb, over a
bed of overlapping cloud, some leaning pink, some deep violet, the gaps between
them staying black. Planets read through the tint. The ship's own glow builds
with each body taken, so a chain that is going well is visibly hotter than one
that is not. That is finished-product quality and it sustains for roughly 25
seconds of an 85-second run.

**The other 60 seconds are the target.** Not by extending the aurora — its rarity
is what makes it land — but by holding the rest of the field to the same
standard: structure anchored in world space that you fly *through* rather than
carry with you, colour that means something, and a sky that is doing as much work
as the foreground.

Two rules the look must keep:

- **Everything the player reads is drawn in the world, in design coordinates**,
  so the composition is identical on every device and nothing lands on a
  letterbox bar. DOM is developer chrome only.
- **The game is side-on and implies no depth.** Streaks fall in parallel, never
  radiating from a vanishing point. A cone would put a horizon in a world that
  has none.

The one place the look is actively failing is the score band, which collides with
the world every frame. See the open calls.

---

## How it should sound

**Silent, and it is the largest single gap in the game.** Not thin — spectral
analysis of full sessions finds no game audio at all. A warp, a finish line and a
slot-machine roll-up all currently happen in silence.

Audio here is a **mechanic, not a coat of paint**, and the specific opportunity
says why: a pitch ramp through the boost arc, peaking at the release window,
would teach the core timing better than the gauge does — and the gauge is the
best thing in the game. The target relationship between play and sound is the one
*Tetris Effect* and *Sayonara Wild Hearts* have: a clean release lands on the
beat, and a chain that is going well layers an instrument in.

This is the highest gameplay return per hour available.

---

## What the field should become

**A difficulty curve.** There isn't one. Body generation is statistically
stationary — the first planet and the sixtieth are identical draws, with constant
spacing and evenly-spread anomalies — so past roughly the first 25 seconds
nothing gets harder. The only escalation is the player's own accumulated speed,
which is emergent rather than authored. Every ambition below assumes this is
solved first.

**More bodies, each a new verb.** Black holes, storms and nebulae, binary
planets, pulsars, rings and belts, wormholes. The discipline that makes this
content rather than decoration: **one new property per region, introduced calmly
and then remixed**, so a region teaches itself with no tutorial. The anomaly is
the working instance of the pattern — a rest stop, a set piece and a scoring
frenzy, out of a single predicate — and it is the shape to copy.

**Regions with an identity.** A palette, a soundtrack and a signature hazard that
belong together, so the field stops being one texture at every altitude.

**Challenge stretches.** Authored, bite-sized segments spliced into the run under
a constraint — reach the next gate in one grab. This is **the same systems with
the opposite feeling**, two modes from one set of mechanics, and it costs no new
simulation.

**Praise that spans a run.** Everything the game can currently notice happens in
one passage. A pattern across many captures has no single passage to grade, so it
needs a ruling on where — or whether — it sits on the rarity ladder. The run sheet
already counts several such patterns and could feed them.

---

## Open calls

Judgements needed before anyone writes code. Each has a measurement waiting for
it.

**The chain stops saying anything for most of a run.** The multiplier ceiling
binds about 22 seconds in, and the most prominent progression number on screen
then never moves again — pinned for 74% of an 85-second session. The question is
not what the ceiling should be. It is **whether the top of the ladder should be a
number that stops moving at all.** Measure first: what fraction of the seconds
inside a good life sit at the ceiling.

**The captured wall death, and whether a cue may have a verb.** The biggest hole
in pillar 3, and a design call rather than a fix. A cue here would have to say
*keep holding and you die* — whose answer is to let go. That is a **prompt**, and
pillar 4 says this game builds dials. The first cue that tells the player what to
do changes what kind of game this is, and that decision should be made
deliberately or not at all.

**Cutting the vocabulary to one or two words a tier.** The obvious move, but it
is a **re-measurement at coarser granularity, not a re-pick** — the thresholds are
percentiles, and choosing favourites by hand puts round numbers back in through
the side door.

**Awards arriving together are unreadable.** Three inside one second, each
overwriting the last, left one of them legible for 0.6s. A queue, a stacked band,
or awards that know how to merge would all work — and it wants deciding **for all
award kinds at once**, not for whichever is newest.

**Where the score lives.** It sits in the worst place to read it, colliding with
world elements every frame; an OCR pass over one session returned 47 clean
readings out of 344. If a program cannot segment it, a glance cannot either.
Anything done about award readability should come with, or wait for, moving the
band.

**Whether the short course is too narrow, or the player careless.** Both course
lengths fly the same corridor width, so the short one packs twelve bodies into
the space sixty use. Two of three recorded lives on it ended at a side wall
inside 20 seconds. Measure before assuming it is a skill issue.

**A performance harness.** The correctness gate says nothing about time, and a
rendering-induced slowdown reached a phone with nothing in the repo able to catch
it. The units that matter are p99 and max, not mean — that class of bug hides
behind an average of calls that mostly return early.

---

## The test

> **If the swing feels good, everything else has somewhere to live.**

It does. Everything above is that sentence, cashed out.
