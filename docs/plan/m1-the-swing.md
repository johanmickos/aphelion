# M1 · The swing

The only milestone whose success cannot be verified by a machine. It ends with the author
flying the build.

`VISION.md` calls the capture feel the most expensive thing in the project, and the
prototype protected it with a frozen configuration and a ten-scenario equality gate held at
exactly zero divergence. This rewrite discards that protection deliberately (ADR-0004), so
this milestone rebuilds it in a different shape: characteristics named up front, determinism
enforced by machine, and the author as the judge of feel.

## The order, which is not the numbering

The numbers below are identifiers rather than a sequence, and two steps have moved. Read them
in this order:

**M1.1 → M1.2 → M1.3 → M1.6 → M1.4 → M1.5 → gate.**

**M1.6 came early** because the milestone ends in the author flying the build and the first
playable moment was three steps away; everything built on top of an unjudged swing is built on
an untested premise.

**M1.5 now comes before the gate** (author, 2026-08-27). It was always described here as *the
instrument the physics gate uses*, and it was still scheduled after the gate that uses it. The
author's judgement of feel is the scarcest thing in this project, and a session flown without a
recorder produces one sentence and no evidence: *"the grab feels late"* with nothing behind it
costs a whole cycle to reproduce, and may not be reproducible at all. With a recipe under it,
the same sentence is a tick number, and a disagreement about the swing becomes a disagreement
about a specific dive that both sides can replay.

**M1.4 moved back in front of the gate** (author, 2026-08-27, after flying M1.6). It was
briefly scheduled after it, on the argument that none of spec 01's characteristics are about
dying. Flying the build answered that: *"planets are obstacles — I should crash and die."* A
field you can pass straight through is not the field spec 01 was measured in, and a swing with
nothing to lose is not the swing being judged.

---

## M1.1 · The characteristics document

**Do this before writing any physics.** Produce [`docs/spec/01-swing.md`](../spec/01-swing.md):
a list of the characteristics the swing must have, each one paired with the prototype's
observed behaviour. (Earlier drafts of this step called the file `01-the-swing.md`. That was
drift, not a second file.)

The prototype at `~/git/aphelion` is a running program. Play it, instrument it, read
`src/sim/capture.ts` and the rationale above `DEFAULT_CONFIG`, and use its replay tooling.
Characteristics worth naming, at minimum: how speed at periapsis relates to approach speed
and impact parameter; how long capture-to-boost-peak takes and how it varies; how exit angle
follows hold duration; the shape of the boost envelope; what a grab does to a trajectory
that was going to miss; and the two things `VISION.md` says fight each other — the boost
envelope peaking a fixed interval after the orbit freezes, while the release marker sits at
a fixed angle, so hitting both means shaping the dive so they arrive together. **That tension
is the game.** If the rewrite loses it, the rewrite has failed regardless of how it feels in
isolation.

Each characteristic gets a number or a curve from the prototype and a tolerance. This is the
only artifact that carries the old feel across a repo boundary the project has chosen to
keep closed, and the prototype is a wasting asset (ADR-0001).

**Acceptance**: every characteristic has a measurement, a source, and a tolerance.
**Verify**: read it.

**Done.** The tension is measured in [spec 01 · §11](../spec/01-swing.md): at peak boost the
craft can reach only **43%** of the circle of release headings, and never more than 49% at any
sampled geometry — so §11's first criterion, *the peak arc covers strictly less than a full
revolution*, is M1.3's acceptance gate. Three rulings are the author's and are listed in
[spec 01 · §13](../spec/01-swing.md) and the [spec README](../spec/README.md)'s open questions.

---

## M1.2 · The simulation core

Fixed timestep with substeps. **Ticks are the only clock in the game** (ADR-0006) — nothing
measures itself in seconds, because the simulation may scale time and wall-clock time would then
diverge from it permanently. (Earlier drafts of this paragraph cited the hitstop as the thing that
scales it. The hitstop is withdrawn — [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
— and nothing applies a time scale today. The clock is unaffected: it was never the freeze that
made ticks the unit.)

Bodies, gravity, the craft, integration. Pure, headless, no DOM, no `Math.random` — seeded
RNG only. A run is fully described by `(config, seed, input log)` and by nothing else.

**Acceptance**: the simulation runs under plain `node`; identical inputs produce identical
state; `pnpm portable` passes. **Verify**: `pnpm portable`, plus a determinism test that runs
the same recipe twice and compares final state exactly.

**Done.** The core is `src/sim/`: a tick of 1/60s integrated in six substeps by semi-implicit
Euler, a fixed-timestep clock with the catch-up bounded at three ticks, bodies whose mass is
derived from their radius, gravity that acts **only while a body is held and only from that
body**, coasting that is force-free, a seeded stream, and a byte-level snapshot of the whole
state. There is no grab, no freeze, no settle and no release — those are M1.3, and the dive is
set up in tests by a fixture rather than by a mechanism.

Three things worth carrying forward:

- **Six substeps is proved on this integrator, not inherited.** Against a 96-substep reference
  over six dives spanning the measured periapsis band, six agrees to **0.37 design units** of
  closest approach and **1.8 units/s** — a factor of four inside spec 01 §12's tolerances — while
  one substep misses both. The worst integrated step is **3.43 design units**, or 1.14 in the
  units the prototype measured 1.45 in.
- **[Spec 01 · §12a](../spec/01-swing.md) is closed.** The simulation owns `sin`, `cos` and
  `atan2` ([ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md)), because V8 and
  JavaScriptCore — the engine the author's phone runs — disagree on them for 4.3%, 4.6% and 17.9%
  of arguments, and a recipe recorded on the phone is replayed on a laptop.
- **[Spec 01 · §13.3](../spec/01-swing.md) is closed by the author**: the ×3 / ×27 conversion is
  confirmed, and carried as one named constant with every length derived from it.

---

## M1.3 · Grab, orbit, release

The one verb: press to be caught, hold to swing, release to leave along the tangent. There is
**no hitstop** at either end — it was rejected after being flown
([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)), and what
replaces it is a kick on every release scaled by the quality of the swing, read from spec 01 §7's
envelope. Time-scaling remains the simulation's to apply and is applied by nothing.

The simulation core is [M1.2](#m12--the-simulation-core) and is done: bodies, gravity, the craft
and the integrator exist, `heldBody` exists as state with no transition into it, and spec 01 §4's
clearance impulse is the first thing this step needs — without it a dive at a realistic aim
strikes the body.

**Acceptance**: every characteristic from M1.1 is inside its tolerance, as an automated test.
**Verify**: `pnpm test`.

**Done.** The one verb works end to end: press to be caught, hold to dive and freeze and
settle, let go along the tangent, coast in a straight line. `src/sim/` gained
`grab.ts`, `clearance.ts`, `dive.ts`, `orbit.ts`, `boost.ts`, `release.ts`, `quality.ts` and
`kepler.ts`; `stepSim` reads one button and nothing else. `pnpm check` is green at **183
tests**, and the headless sweep harness [spec 01 · §11](../spec/01-swing.md) asks for is
`test/sim/swing.ts` — it flies a geometry through the real verb and reports only what can be
seen from outside, which is what every assertion in the suite is written on.

### The gate holds

**[Spec 01 · §11](../spec/01-swing.md)'s first criterion passes.** Over 88 geometries spanning
its stated envelope, the arc of release headings reachable at peak boost is **at worst 61% of a
revolution**, and it stays under a full revolution across a much wider net of 362 geometries
too. It cannot reach one by construction either: the plateau is 0.75s, no dive can freeze inside
the floor, and the fastest circle the floor allows takes 1.12s to go round. **Criterion 2** lands
at **p50 46.5%** against the band of 35 – 55% (the prototype measured 43%).

### What the swing measures, against what spec 01 measured

| Characteristic | Spec 01 | Here |
|---|---|---|
| §3 · grab range, median body | 560 ±10% | 560 |
| §4 · clearance fires | 50 – 60% of real grabs | 57% of the stand-in corpus |
| §5a · frozen radius ÷ floor, p50 | pinned at the floor | 1.000 |
| §5a · `v_peri / v_escape(r_peri)` | 0.72 – 1.00 | 0.737 – 0.980 |
| §5b · dive seconds, p50 / p95 | 0.30 – 0.55 / < 2.6 | 0.47 / 1.08 |
| §6 · settled revolution, median body | 1.12s | 1.12s |
| §6a · four dives, one ellipse | same axis, same `e`, ridden at 400/415/435 | same floor to 0.5%, ridden at 397/410/427/433 |
| §6a · speed at the end of the settle | circular, within 1% | exact, every geometry |
| §6a-3 · `v_freeze / v_circ` | 1.24 – 1.40 | 1.04 – 1.39 |
| §7 · envelope, from exit speeds alone | 0 → 0.45s → 1.2s → 2.6s | exact at all four |
| §7 · paying threshold | `(grab + floor)/2` ±3% | 0.6% |
| §7 · median full boost ÷ largest | ≥ 0.90 | 0.99 |
| §8 · exit direction | within 1° of the tangent | 3 × 10⁻¹⁴ ° |
| §8 · exit speed, corpus p50 | 280 – 350 | 293 |
| §9 · coasting after a release | constant to 1 part in 10⁹ | bit-identical |
| §11-1 · peak arc, worst | **strictly under a revolution** | **61%** |
| §11-2 · peak arc, p50 | 35 – 55% | 46.5% |

### Five things worth carrying forward

- **The clearance predicts in the softened law and the freeze authors in Kepler**, and getting
  that backwards is a real failure with a measured size. Aiming the clearance with the
  unsoftened relations left the periapsis at 61.9 against a floor of 56 — the 9.4% departure
  spec 01 §2 measures, arriving as a 10% miss. `kepler.ts` and `gravity.ts` split along exactly
  that line and each says so.
- **The clearance asks again every tick rather than paying out a plan.** Deciding the whole
  impulse at the press and applying a fifth of it five times lands 13% wide on a close fast
  approach, because the craft falls a long way in 83ms and a fixed rotation is worth a different
  amount of angular momentum at every radius. Paying a fifth, a quarter, a third, a half, the
  rest is the *same* even ease whenever nothing disturbs it — gravity is central, so it changes
  neither the momentum the craft has nor the momentum the floor asks for — and it lands on the
  floor when something has.
- **The freeze holds the craft below escape speed at its own periapsis, and this was inferred
  rather than read.** Spec 01 §6a's table shows approaches of 200 and 260 freezing at *the same*
  435 units/s, which two different dives only do if something clamped them; §5a's measured
  `v_peri / v_escape` never exceeds 0.99; and `0.98 × √2` is **1.386**, which is §6a's measured
  ceiling of 1.40 to three figures. Three observations, one mechanism. It is **not** the
  eccentricity cap and does not do its job — §6a's *"the dive sets the speed, and the cap does
  not apply to it"* is about the shape clamp leaking into the rate, which it still must not.
- **The eccentricity cap binds because most grabs are unbound.** A craft arriving with more
  than escape energy has no ellipse to be handed; the freeze captures it and clamps a path that
  was open. That is why spec 01 §6 measures the cap binding at p25 0.58, p50 0.60, p75 0.60.
- **Quality is one function.** `quality.ts` is the whole of ADR-0012's definition — the envelope
  for a swing that froze, the bend for one that did not — so there is nowhere a second could be
  added without deleting a test. A tap pays nothing because a straight line at a body has no
  angular momentum, and the numerator is zero; nothing checks anything.

### Where the line was drawn

- **The floor is M1.3's; the deaths are M1.4's.** Spec 01 §10's *"contact while a body is held
  never kills — it bounces off the held body at the floor with zero restitution"* lives in
  `dive.ts`, because it is the promise the press made and §4 leans on it (*"the floor catches the
  remainder"*). Contact with a body the craft is **not** holding is M1.4's: it is one predicate
  with two outcomes and the other outcome is a death.
- **Quality is M1.3's; the punch is M2's.** ADR-0012 splits it exactly there. What the punch
  does with quality — its size, its decay, the ×1.5 at full quality — is spec 02's timeline and
  is rebased in M2.4.
- **A release during the dive changes nothing about the craft.** It has no frozen orbit to be
  paid on, and turning it onto a tangent would hand the player a way to steer, which
  `VISION.md`'s first pillar calls a repeal rather than a feature. Spec 01 §8's *"exactly along
  the tangent on 100% of releases"* is held for releases from the orbit, where it is exact by
  construction.
- **A grab is answered on the press, not on every tick the button is held.** Spec 01 §3 counts
  278 presses against 270 grabs and 8 refusals, which is only a meaningful count if a refused
  press stays refused. The release is the other way round — a level, not an edge — so the button
  coming up always lets go.

### Three things for the author, with evidence

1. **[Spec 01 · §11](../spec/01-swing.md)'s third criterion does not hold everywhere, and cannot.**
   *"The 0.50-of-peak arc exceeds 360° at every sampled geometry."* It holds at **every one of the
   78 geometries that froze on the floor** (worst 394°) and fails at the 11 that froze well
   outside it (worst 236°). The reason is arithmetic rather than a choice: the half-quality
   stretch is a fixed 1.675s, an orbit's period grows as the periapsis to the power of one and a
   half, and a swing frozen a third above the floor barely gets round once. §13.2 already records
   the same mechanism running the peak arc from 56% to 35% purely because a bigger body's floor
   is further out. **Either the criterion wants "every swing that reached the floor", or the
   shallow swings want something else.** The test asserts what holds and names what does not.
2. **The stand-in corpus is not a corpus of real play, and one number shows it.** `corpus()` in
   `test/sim/swing.ts` draws grab distances and approach speeds from the two distributions spec
   01 measured, and aims uniformly because spec 01 measures no aim distribution. It reproduces
   the clearance rate (57% against 54%), the boost shape (0.99 against ≥0.90) and the exit speed
   (293 against 314) — but **72% of its presses are unbound flybys against §13.2's measured
   52%**, because it draws distance and speed independently and a real player's are correlated.
   The visible cost is §5a's speed-normalisation ratio, p50 **1.27** here against a measured
   1.51: a gain of 4.18 needs an approach around 100 units/s, and the corpus's speeds come from
   §8's *exit* distribution whose p05 is 195, so it contains none. What the mechanism itself does
   with a seven-fold spread of approaches is asserted in `freeze.test.ts`, where it depends on no
   distribution at all. **Spec 01 §13.7's instruction applies: replace these with percentiles of
   this game's own play as soon as there is some.** M1.6 made the play; M1.5 makes it
   countable, and this is a second reason it now comes before the gate.
3. **Grab range scaling with mass is ruled; its shape is not, and the shape here is a
   derivation.** §13.2 rules that *"grab range scales with mass ... it is what keeps a small body
   grabbable at a distance where the grab is still a bound grab rather than a braked one."*
   `grab.ts` makes it **linear in mass**, because a grab is bound when `v²/2 < μ/r`, so the
   distance inside which a given approach speed is still bound is itself linear in μ — and
   scaling the reach the same way makes *the fraction of a body's range within which a grab is
   bound* identical for every body in the field, which is exactly what the ruling asks the
   scaling to pay for. At `MASS_EXPONENT = 0` it is flat 560 for every body, the prototype
   exactly. If the gate wants a different law, it is one line.

`CONTEXT.md` gained **lead**, **orbit**, **boost** and **quality** — four words the code needed
type and function names for. §6a's first test is restated: it words the claim as *"semi-major
axis and eccentricity within 1%"*, and neither is observable from outside because the settle
begins deforming the shape in the same tick the freeze hands it out. What is asserted instead is
§6a's own prose — *"the same orbit, flown faster"* — as two craft tracing the same path on
different clocks (ADR-0013).

---

## M1.4 · Death, and the shape of a run

The boundary line as an absolute (bands come in M3), death, and the run lifecycle — start,
alive, ended, and why it ended. DAILY's rule applies: one run, no retry, death takes carry
and bank (ADR-0007). No lives.

**Acceptance**: a run ends for each distinct reason and reports which. **Verify**: `pnpm test`.

**Before the gate, and the demo is why.** M1.6 flown reported *"planets are obstacles! I should
crash and die, and the game ends, if I hit one before rescuing myself into an orbit."* That is
spec [01 · §10](../spec/01-swing.md) exactly, already written and not yet built, and the
argument for it is stronger than a missing feature: **83% of real endings are out of bounds**,
and every number in spec 01 came from sessions flown under that pressure. A field you can pass
straight through is not that field.

**Done.** `pnpm check` is green at **280 tests**, 30 files, up from 255. Four endings, one
contact rule, and a run that knows whether it is over:

- **[`contact.ts`](../../src/sim/contact.ts)** — spec 01 §10's three contacts as *one*
  operation at three sets of constants: put the craft on the surface, reflect whatever part of
  its velocity pointed into it. The held body's floor at `R + 12` and zero restitution is the
  same call, so [`dive.ts`](../../src/sim/dive.ts)'s floor is no longer a second copy of it —
  the prototype resolved contacts in three hand-written places and recorded that they drifted.
- **[`run.ts`](../../src/sim/run.ts)** — the three endings that are about *where the craft is*,
  and the high-water mark. Impact is contact's, because it is a consequence of touching
  something rather than of being somewhere.
- **`Field` gained a corridor**; `SimState` gained an **ending** and a **high-water mark**. Both
  are in the snapshot, which is now version 3, so a run that ends is a run a recipe reproduces
  — including *how* it ended.
- **[`test/sim/run.ts`](../../test/sim/run.ts)** — the headless pilot, the other scale from
  `swing.ts`: a craft let loose in the real field until something stops it, which is the only
  scale spec 01 §10's statistical tolerance can be read at.

`CONTEXT.md` gained six words the code needed names for: **run**, **ending**, **contact**,
**corridor**, **line** and **fell-behind line** — the last because spec 01 §10 and the glossary
both already insist it is not the floor, and it now has a function named after it.

### The one decision: where the corridor's line went

**It is the prototype's own, at 1.9 × the design width** — half-width 370.5 prototype units,
1111.5 in design units, centred on the same centreline the fixture field is built around. It is
carried rather than chosen, and it **expires with M3's corridor** (spec [17 · §4](../spec/17-daily-field.md)
narrows the half-width with altitude, in metres this repo has not reconciled with design units,
and M3 re-measures the curve).

Three things decided it, and the first is the one that ruled out the obvious candidate.

**1 · The design space's own edges are too narrow for this field, and it is not close.** A
settled swing is a circle at the body's floor, so the furthest sideways a *legitimate* orbit
ever reaches is a body's offset plus its floor. Measured over the fixture field:

| | Furthest from the centreline | Against a half-width of |
|---|---|---|
| Widest body's own edge | 190 prototype units | — |
| **Widest settled circle at a floor** | **202** | the design space's 195 — **outside** |
| Widest oval at the eccentricity cap | 400 | the prototype's 370.5 |

Three of the twenty-four bodies cannot be orbited at all inside a corridor at the design
space's edges. That is not a hard boundary; it is a craft killed on the far side of a swing
around a body the field itself placed — **exactly the defect spec 01 §10 records the
fell-behind line having had**, *"killing a craft that had not lost a unit of altitude"*.
`test/sim/fixture-field.test.ts` holds the corridor to it.

**2 · 1.9 is a tuned number with a recorded reason, not an incidental one.** The prototype's
own tuning log moves it from 1.2: *"the corridor felt constrictive, and a wider field gives more
room to find a planet to curve away from before reaching a boundary"*, and then 1.90 specifically
so a run does not open on the boundary's own gradient. **Every one of spec 01 §10's 24 recorded
endings was flown at this width**, including the 83% that were out of bounds, and its tolerance
that out-of-bounds stays the plurality is written on that number.

**3 · The fixture field's bodies are the prototype's own placement bounds**, so the same
corridor is the right corridor for it. The prototype places single rows within ±72 of the
centreline and forks within ±96 – 160; ours are within ±70 and ±96 – 150. That is not a
coincidence — M1.6 read the field out of the prototype — but it had not been checked against the
corridor before, and it is what makes the carried width fit rather than merely available.

**And the foot.** One design-space height plus 400 below the spawn, which is the prototype's
own margin. **It cannot be reached**: the fell-behind line trails the mark by 700 and the mark
opens at the spawn, so at 1054 it is always above the foot at 1598 and always fires first. That
is true of the prototype at this tuning too, which is why its note calls the foot a death *"in
every config"* rather than a death anyone sees — it is there for the configs with no trailing
line at all. It is built because spec 01 §10 names it, and it is tested on a field of its own.

### The camera decision has expired, and here is the number under it

[`camera.ts`](../../src/state/camera.ts) does not pan sideways and says in its own header that
the decision *"expires when the field outgrows the design space, which is M1.4's boundary and
M3's corridor"*. **It has, and this step is not the one that fixes it.**

| | |
|---|---|
| Corridor line, from the centreline | **1123.5** design units (half-width plus the four units of grace) |
| Edge of the picture, from the centreline | **585** |
| So a craft may be alive, and may die, this far outside the frame | **538.5** — nearly half a screen |

Measured over 400 pilot runs through the fixture field: **85.5%** of runs leave the picture
sideways at some point, **87%** of out-of-bounds endings happen with a body still held, and they
land a median of **541** design units past the frame's edge. The shape of it is the surprise and
it is worth stating plainly: **you are not usually flying out of the corridor, you are being
swung out of it** — on the wide part of an oval, which every one of the twenty-four bodies can
produce, because an oval at the eccentricity cap reaches four floors from its centre and the
picture is only 585 wide.

**Leaving the picture is not new** — the fixture field has been able to do it since M1.6, and
the author flew it twice without raising it. What M1.4 adds is that the craft can now *end the
run* out there, with nothing on screen to say why.

It is **not fixed here** deliberately. The horizontal camera is four mechanisms the prototype
needs and this repo has none of — a deadzone, a look-ahead, a clamp to the field and a backstop
— [M3.1](./m3-the-field.md) is where the camera and the design space are built properly, and
spec [07](../spec/07-boundary.md)'s line and bands are M3's too, so the thing that would make a
wall visible arrives in the same step as the camera that would frame it. Building a sideways
follow here would also change what the gate is judging about a camera the author has just signed
off two corrections to. **The measurement is the handover**, and it is the first thing M3.1 owes.

### Four things worth carrying forward

- **Spec 01 §10 is silent on what a graze does, and something has to happen.** It says a
  near-parallel contact is not lethal and stops there. A craft left inside the disc travels the
  chord and comes out of the far side — and the fraction of speed pointed at a body only ever
  *falls* as a straight line goes deeper, so a graze can never become lethal on the way through.
  The prototype bounces it at the same `R + 5`, at restitution 0.8, and that is what is carried
  (ADR-0013). Recorded here rather than papered over: it is a hole in the spec, not a ruling.
- **Contacts are not resolved on a frozen orbit**, and the prototype draws the same line in the
  same place. After the freeze the craft's position is authored by the phase clock, so a bounce
  would be rewritten on the next tick; the prototype resolves these contacts only in its
  integrated phases. So the `R + 6` bounce is the dive's, and a settled orbit whose oval reaches
  a neighbour passes through it. Nothing in the fixture field does this today.
- **The held mark protects a case this field cannot produce.** An orbit has to be taller than
  the 700 the line trails by before holding the mark saves anything, and a settled circle is
  twice the floor — so with radii of 34 – 56 the tallest orbit in the game is about 400 units.
  The rule is carried because spec 01 §10 measured it, not because the fixture needs it, and
  `run.test.ts` exercises it at the size it starts to bite at. It will bite the moment a body
  gets large, which spec 17's black holes and pulsars will do.
- **A run that ends stays exactly as it ended.** `stepSim` returns immediately, so the tick
  number, the craft and the held body are all still there to be read — which is what spec
  [09](../spec/09-debrief.md)'s debrief card needs, and what a recipe reproduces. Nothing lets
  go for the player: the prototype does, at its finish line, and that is not carried because
  `clearedAbove` sits a whole grab range above the last body while an orbit reaches a quarter of
  that. [`run.ts`](../../src/sim/run.ts) records where the answer is if a field ever closes the
  gap.

### Where the endings land, and what the corpus is worth

`test/sim/run.ts` is a **pilot, not a player**, and it says so in as much detail as it deserves.
It drives the one verb from the two distributions spec 01 actually measured — §3's grab
distances over 270 real grabs, and §11's 53 / 12 / 36 split of where a release falls on the boost
envelope — and it aims, because §11's own explanation of that split is that *"the aim arrived
first and they took it"*, and a pilot that ignored aim died on its first release.

Over 400 runs, against spec 01 §10's 24 recorded endings:

| Ending | The pilot | Measured, real play |
|---|---|---|
| **Out of bounds** | **71.8%** | 83% |
| Fell behind | 24.3% | 8% |
| Impact | 3.8% | 8% |
| Cleared | 0.3% | 0% (no session in the cohort reached the top) |

Spec 01 §10's tolerance is that out-of-bounds stays **the plurality at 60% or more**, and it
does. Where the pilot differs is where it is weakest and the difference says so: it falls behind
three times as often as a player because it has no judgement about *which* release keeps a
climb, which is the one thing spec 01 measures no distribution for. It has two invented numbers
— an aim tolerance and how often an approach is flown past — and both are named in the file.
**Spec 01 §13.7's instruction applies here as it does to `swing.ts`'s corpus: replace it with
percentiles of this game's own play as soon as [M1.5](#m15--recipes-replay-and-the-trail-a-session-leaves)
can record some.**

### What was deliberately not built

- **The death sequence.** Spec [07 · §6](../spec/07-boundary.md) describes an unravelling craft,
  an `SOS` strobe, a BANK that snaps to DUSK and a debrief card. Those are M3's and M6's, and
  M1.4 builds the predicate, the ending and the reason — nothing that is drawn. Presentation
  state is therefore untouched, and `run.test.ts`'s layer criterion is exactly that: derive from
  an ended run and an alive one and get the same picture. When death does reach the picture the
  fix is a field on `PresentationState`, deliberately, and that test is where it becomes visible.
- **The bands.** Spec 07's outer band and fire band, their motes, their labels and the closing-
  speed gradient are M3's. Spec 01 §10 says it: *"M1 needs the line only."*
- **A tidy-up of spec 07.** Its §6 still specifies a **70ms hitstop** at the line, which
  [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) withdrew;
  spec 02 carries the notice and spec 07 does not. It is not implemented and it is not edited
  here — `docs/` is the author's, and rebasing a board spec is M3's work rather than a passing
  correction.

### What the RESET control means now

It stays, and it stays obviously chrome. **It is a restart and never a retry**: ADR-0007 rules
DAILY as one run with no retry and no lives, and now that a run can end, the distinction is real
rather than academic. What the button does is throw the run away and open a new one from tick
zero, which is what an author or an agent needs in order to fly the same field again — and it is
a DOM button outside the design space precisely so that it never reads as part of the game. The
readout beside it now says which ending the run reached, read off the simulation rather than off
presentation state, and that line goes away when the debrief card arrives.

---

## M1.5 · Recipes, replay, and the trail a session leaves

**Next, and it is what the gate is flown with.**

Define the recipe — seed plus input log — and a CLI that takes one and produces a final
state. This is the instrument the physics gate uses, the thing that makes a bug report a
recipe rather than a recording, and the seam a service would later verify runs through
(ADR-0003). Assume the shareable code is long: a twelve-character code cannot contain a
compressed input log, so Direction 10's `APH-214-KX7Q` can only ever be a server handle.

**Acceptance**: a recorded run replays to a bit-identical final state, four times its own
length. **Verify**: `pnpm replay`.

### What the gate needs on top of the recipe

A recipe replays a run. What the author needs is a session on a phone turning into something
two people can point at, which is three more things and no more:

1. **A recorder in the shell.** `app/main.ts` reads the press and steps; nothing writes it
   down. The log is what the button did and when, and nothing else — a log of positions would
   be a recording, and a recording cannot be re-flown under a changed constant, which is the
   whole reason to prefer the recipe.
2. **The phone-to-laptop seam, which already exists and is the wrong shape.**
   `tools/vite-plugin-diag.ts` is the dev-only endpoint the phone posts to and it validates one
   schema — M0.5's timing report. Its header says to read it before extending it, because it
   writes files on a server bound to every interface on the LAN, and every narrowing in it is
   load-bearing. **Extending its validator is the change; loosening it is not.** Its 512KB body
   cap wants a measurement rather than an assumption: a press log is small, and *how* small
   over an 85-second run is a number this step should record.
3. **A reader.** The point of the trail is that an agent can walk it — which tick a grab
   happened on, what the geometry was, where on the envelope a release fell — and compare it
   against what the author says happened. `test/sim/swing.ts` already flies a geometry and
   reports only what can be seen from outside; the same discipline applies here, and
   [ADR-0013](../adr/0013-carry-the-behaviour-re-derive-the-mechanism.md) still rules that a
   reading which requires reaching inside the simulation is the wrong reading.

**A recipe must name the field it was flown in.** Today the field is a hand-authored fixture in
code ([`fixture-field.ts`](../../src/sim/fixture-field.ts)) and a recipe that did not name it
would replay against whatever the file says this week. Spec [17 · §2](../spec/17-daily-field.md)
already versions the day generator for exactly this reason and rules that *"old runs replay
against the generator version they were flown on"*; the fixture borrows that mechanism now
rather than having it retrofitted when M3's generator arrives.

**One word is missing and lands with this step.** `CONTEXT.md` has **recipe** — a run's seed and
its input log — and has no word for the envelope that carries one *plus* what the author
observed. The prototype called those diagnostics reports. Whatever it is called, it goes in the
glossary in the same change ([AGENTS.md](../../AGENTS.md) §2), and it is not a second name for a
recipe.

**Not in this step**: no upload to anywhere but the dev server (ADR-0003 — there is no backend,
and this endpoint is not one), no ghosts (that is a recipe played back alongside a live run, and
it needs M2), and no scoring in the trail, because there is no economy until M4.

---

## M1.6 · Input and a crude renderer

Touch, mouse and keyboard, all bound to the same single verb. Circles and lines, no glow, no
compass, no HUD — enough to fly. World coordinates in the 1170×2532 design space, letterboxed
on desktop (ADR-0010).

**Acceptance**: it is flyable on a phone and on a desktop browser. **Verify**: fly it.

**Pulled ahead of M1.4 and M1.5 deliberately.** M1 ends in a gate that is the author flying
the build (ADR-0004), the swing is proved correct headlessly and cannot be proved to feel
right by anything but a phone, and every step built on top of it before that judgement is a
step built on an untested premise. So: make it flyable, then stop.

**Done.** `src/input/press.ts` combines devices into the one boolean and `app/input.ts` binds
them; `src/render/` is a Canvas2D renderer of circles and lines; `src/sim/fixture-field.ts` is
a field to fly in; presentation state gained a **camera**. `pnpm check` is green at **240
tests**, up from 183.

### Where the lines were drawn

Three things the specs do not answer, decided here rather than invented in passing:

1. **The camera** ([`src/state/derive.ts`](../../src/state/derive.ts)). Spec 05 says nothing
   about scrolling; spec 00 §5 rules only that it is never rotated, shaken or randomised;
   spec 02's kick and spec 12's held finish are later milestones'. It is **centred on the
   craft, fixed sideways, and does not lag**, and it lives in presentation state so that spec
   02 §5 can assert its offset in M2 — *a camera that lives in the renderer is a camera no
   test can see*.

   *Fixed sideways* is the load-bearing half. The prototype pans horizontally and needs four
   mechanisms to do it safely — a deadzone, a velocity look-ahead, a clamp to the field and a
   backstop for the frames the ease has not caught — and every one of them answers a question
   that only exists because its playfield is wider than its window. Ours is not: the fixture
   field's bodies fit inside the design space, which `test/sim/fixture-field.test.ts` holds
   them to. **The decision expires when the field outgrows the design space**, which is
   M1.4's boundary and M3's corridor.

   *No lag* is a refusal rather than an omission. An eased camera has to remember where it
   was, and presentation state deliberately has none — deriving the same simulation twice
   must give the same answer, which is what makes a frame a pure function of `(recipe, tick)`.
   The prototype's evidence says the lag is also what costs: following a craft round a
   *settled* orbit through a 0.33s ease put a vertical oscillation over half the orbit's own
   period into the view, *"too slow to track ... all it could do was smear"*, and the fix it
   needed was a second mechanism easing the camera's subject onto the body. Rigid, none of
   that arises. What is left is **the world sliding with the orbit, and that is a thing to
   watch for at the gate** — if it reads badly, the prototype's anchor is the recorded answer
   and it belongs in M2 beside the release kick, which needs a decaying transient anyway.

2. **The field** ([`src/sim/fixture-field.ts`](../../src/sim/fixture-field.ts)). Spec 17 §3
   rules that a day is generated once as data before the first tick and the generator is
   M3's, so this is a hand-authored table that satisfies the same contract and says it is a
   fixture. Its geometry is the prototype's own field at the tuning spec 01 measured — bodies
   inside the design width, gaps of 280 units jittered, radii 34 – 56, a fork at about two
   altitudes in five, and the prototype's tuned opening kept exactly. **Nothing here rules on
   spec 17 §4's curve**, whose metres this repo has not reconciled with its design units.

3. **The input rule** ([`src/input/press.ts`](../../src/input/press.ts)). The button is down
   while any device is holding it, so a second finger is not a second press and lifting one
   does not let go — a release is the one moment in this game that must never be an accident.
   Every keyboard press shares one identity, so a second key means nothing. Focus loss lets go
   of everything, because a button whose up event is never coming would hold a grab open for
   the rest of the run. The rule is pure and `pnpm portable` now scans `src/input/` too; the
   listeners live in `app/`, beside the wall clock, for the reason `clock.ts` is pure and
   `performance.now()` is not.

### What is tested without a canvas

M1.6's acceptance is *"fly it"*, which is not an excuse for an untested step. The camera is
asserted over a whole flown swing — centred every tick, never below spec 00 §7's thumb line,
never moving sideways however far the craft does, and identical however the simulation
arrived. The projection M3.1 will want *"identical composition across aspect ratios"* of is
pure arithmetic and is checked at four aspects. The interpolation between ticks is checked at
both ends of the gap and across the heading wrap that happens once a revolution on every
orbit in the game. Spec 00 §1's acceptance — *"a lint over the render layer finds no other
literal"* — is `test/render/palette.test.ts`, written now while the renderer draws three
colours, because a palette is a thing a codebase either has from the first colour or spends a
milestone recovering.

And **the layer criterion is written in the direction `pnpm portable` cannot look**
(AGENTS.md §6). The checker skips `src/render/` because the renderer is the one layer allowed
a browser; what it therefore cannot catch is a renderer reaching into `SimState` for the held
body or the orbit's phase, which would draw a correct-looking frame while ADR-0006's promise
quietly stopped being true. `test/render/boundary.test.ts` fails instead, and the fix when it
does is never to relax it: what the renderer needs is a field on `PresentationState`.

### For the author, at the gate

Four things, none of them decided here.

- **The mass-to-radius exponent** (spec 01 §13.2, `MASS_EXPONENT`, an opening position at 2)
  is now flyable: the field's radii run 34 – 56, so at `n = 0` every body pulls and reaches
  alike — the prototype exactly — and at `n = 2` the largest body reaches **2.7× as far** as
  the smallest. A field of identically-sized bodies would have made the question unaskable,
  which is why the fixture spreads them.
- **The eccentricity cap at 0.6** (spec 01 §13.5), which binds on all but the slowest dives
  and is doing more work than a safety limit should.
- **Spec 01 §11's third criterion** — half-quality available at every heading — holds for
  every swing that froze on the floor and cannot hold for shallow ones, because the
  half-quality stretch is a fixed 1.675s against a period that grows as the periapsis to the
  power of one and a half. M1.3 recorded it; reading it in the hand is worth more than
  re-deriving it.
- **The camera's rigid vertical follow**, above.

> **And one measurement the gate should have before it starts.** ADR-0010 makes the design
> space the whole of a phone screen, and a browser does not give a page the whole of a phone
> screen. On the 393 × 651 CSS viewport ADR-0011 measured on, the design space fits **bound by
> height**: the game occupies **301 of 393 points of width, with a 46-point bar down each
> side**, and everything is drawn at **77%** of the size the prototype draws it at on the same
> phone — 0.77 CSS points per world unit against 1.01 — so the player sees 844 world units of
> height where the prototype shows 646.
>
> This is spec [00 · §7](../spec/00-tokens.md) and ADR-0010 applied exactly as written, and it
> is not a bug. But the M1 gate is *this build against the prototype, back to back, in the same
> hand*, and a swing drawn at three quarters of the size against a third more visible world is
> not the same thing in the hand even when it is the same thing in the numbers. Two readings
> survive and this step does not choose between them: **(a)** the design space is 1170 × 2532
> and letterboxes wherever it must, which is what is built, and the size difference is
> something the gate should knowingly discount; or **(b)** the design *width* is the contract
> and the visible height flexes with the viewport, which is what the prototype does and which
> spec 00 §7's own wording — *"the thumb line sits at 2/3 of the screen height"* — leaves room
> for. It needs the author.

### What was deliberately not built

No compass, no trail, no glow, no HUD, no boundary and no death — M2's, M3's and M1.4's. The
one thing here that is not the game is a **RESET** control, DOM developer chrome and marked as
such: a fixture field with no boundary and no death in it has nowhere to come back from, and
the gate is flying it repeatedly.

---

## Flown, 2026-08-27 — what the demo said

M1.6 was put in the author's hand before the gate proper. Five things came back. Two are
routed and one is fixed; two need a ruling and are stated rather than answered.

**1 · The camera bounces through an orbit, and is generally too sensitive vertically.**
**Fixed**, and the fix cost an ADR — see *What the camera does now*, below. M1.6 predicted this
in the same words and said what the recorded answer was. Two halves, and they wanted different
fixes:

- *Through a settled orbit*, the craft goes round a still point and a camera holding it pinned
  slides the world instead. The prototype's answer is to ease the camera's **subject** from the
  craft onto the body it is orbiting. **It must not do that during the settle**, and this is the
  one place the prototype's own measurement is emphatic: riding settle progress flattened the
  oval's 59 → 107 → 59px swing to under 2px, *"of 83px of total swing only 41 survived"*, and
  the oval is exactly what item 5 below says feels great. Lock the **orbit**; fly the dive and
  the settle.
- *Generally*, doing a 180 twice in a row bounces the view. That is not the same fault and the
  prototype does not have a fix for it to carry — it eased the camera and had **no vertical
  deadzone**, and recorded that as the reason it *"could only smear"*. A deadzone is new work,
  not carried behaviour, and wants a number measured against real play rather than chosen.

**Both needed the same thing, and it is bigger than the camera.** An eased camera has to
remember where it was, and a lock that survives a release has to remember something about the
orbit after it is let go — and `derive` deliberately had no memory between ticks, which was
`test/state/derive.test.ts`'s boundary criterion. That criterion was written for M1.2 and it is
stricter than ADR-0006 requires: the promise is that a frame is a pure function of
`(recipe, tick)`, and a per-tick recurrence replayed from tick zero satisfies it exactly. It
was always going to have to give: spec [02 · §5](../spec/02-release.md)'s kick homes over 180ms
with one overshoot, spec [00 · §3](../spec/00-tokens.md)'s E3 decays over 400ms, and spec
[05 · §3](../spec/05-field.md)'s wake relaxes over ~400ms. So
[ADR-0015](../adr/0015-presentation-state-carries-what-decays.md): **presentation state carries
what decays**, `derive(previous, sim)` is a recurrence evaluated once per tick, and the camera
is simply where that bit first.

**2 · A double tap raises Firefox for iOS's callout menu and the selection loupe.** Fixed in
`app/input.ts`: the callout and the loupe are the *selection's* UI, and `user-select: none`
only stops selection by drag — refusing `selectstart` is what refuses the menu. `contextmenu`
and `gesturestart` go with it. `touchstart` is deliberately left alone: cancelling it is the
one hammer that can take the press with it, since the pointer events the game is bound to are
synthesised from touches. **Not reproduced here** — there is no Firefox for iOS on this
machine — so it wants a second look on the phone.

**3 · Planets should be obstacles.** Already specified, not yet built: it is spec 01 §10, and
[M1.4](#m14--death-and-the-shape-of-a-run) is now back in front of the gate because of it.

**4 · See 1.**

**5 · The craft should look like it is drifting through the oval.** *"When coming at a planet
fast, the capture has a nice slingshotty oval to it before we settle into an orbit. This feels
great, but the ship continues to point along the curve's tangent. I'd like to have the tail whip
out during the oval — and really, any time there's a strain on the ship's velocity or trajectory,
like when drifting through the fiery edge."*

The quantity underneath is one thing and it wants a name — **strain**, how hard the path is
being bent right now — and it is deliberately **not** quality. [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
rules there is only one definition of quality and this must not become a second one wearing
different clothes: quality on a frozen orbit is a *position on the envelope*, which is a clock,
while the oval's strain is a bend, and through the settle those two say different things about
the same instant. One reading, one meaning, two quantities.

**And it runs into a rule that is load-bearing.** `CONTEXT.md` fixes that the craft's *"nose
points along the exit tangent for the whole of an orbit"*, and spec 00 §6 says why in five
words: **"the nose says where; the hand says when."** The nose is the release-direction readout
the whole compass grammar is built on. So:

> **Open — how far the drift is allowed to go.** **(a)** *Deformation only*: the silhouette's
> axis stays on the tangent and the tail stretches and bends laterally with strain. The nose
> invariant is untouched, the machinery is the one spec 02 already uses to deform the craft
> 1.5 / 0.7 at release, and the drift reads as a smear rather than as a yaw. **(b)** *A bounded
> yaw*: the craft rotates off the tangent with strain, like a car with its tail out, and
> something else has to take over saying where the exit goes — which changes spec 00 §6's
> grammar and lands on M2's instrument rather than on the craft. (b) is what "drifting" actually
> looks like; (a) is what does not cost the compass. **Deferred by the author, 2026-08-27** —
> raised, not urgent, and nothing before M2 depends on the answer. The reason it is written down
> in this much detail is that the constraint is the part that gets forgotten: whoever builds it
> will meet the nose invariant as a surprise otherwise.

Either way it is [M2](./m2-the-instrument.md) — craft deformation is already in its
presentation-state list — with the boundary half of *"any time there's a strain"* following in
M3, off the same number.

## Flown again, 2026-08-28 — two more, both measured

Neither needed the diagnostic trail; both are visible headlessly.

### The opening grab swerves away from the first body

*"For the very first planet, no matter when I press, my ship seems to go outwards first to reach
its orbit ... I don't think I've seen this with other planets."*

**It never moves outward in radius** — measured, the radius falls monotonically from the press.
What it does is swerve **laterally away from the body**, and that is the clearance doing exactly
what spec [01 · §4](../spec/01-swing.md) asks: to orbit rather than strike, the craft has to go
*around*, and from a near-radial approach the only way to buy that angular momentum at constant
speed is to turn sideways. The turn is the minimum that lifts the periapsis to the floor and the
radial component stays inward throughout, so nothing here is over-turning.

**Why only the first body: it is the only near-radial approach in the run.** The craft spawns
with `vx = 0`, **13° off the line to the first body**, and every later grab arrives carrying
cross velocity from the release before it. And it is worse the later you press, which is why *no
matter when* is the right description — the momentum the floor asks for barely changes as the
craft closes, while the momentum a turn can buy is `r × speed`, so the turn needed grows as the
range falls.

The opening's lateral offset is the whole story, and it is a **fixture** number rather than a
physics one:

| Craft spawns this far left of the body | Off radial | Turn at the press, at three ranges |
|---|---|---|
| **84** (the prototype's, and what is built) | 13° | **29°** · 42° · 59° |
| 130 | 20° | 21° · 28° · 48° |
| 180 | 27° | 12° · 15° · 27° |
| 230 | 33° | 3° · 3° · 2° |

> **Open — where the run should open.** 84 units is the prototype's own spawn, converted, and
> was carried on the grounds that the first approach is tuned. What the sweep says is that it is
> also the **worst clearance geometry in the run**, and it is the first thing anyone flies. 180
> puts the opening turn at 12 – 27°, inside the field's own p50 of 31° and well inside spec 01
> §4's measured 3.6 – 62°; 230 removes the clearance from the opening altogether, which is
> unrepresentative in the other direction, since clearance fires on about half of real grabs.
> Moving it is a departure from the prototype's opening and therefore the author's.

### The nose keeps turning for a frame or two after a release

*"My release vector feels natural and expected, but the ship's nose continues pointing around the
circle for a frame or two."*

**The simulation is exact here**: measured across a release, the heading changes by `0.00°` on
every tick from the release onward — a release scales speed and never touches direction, so the
nose is nailed from the instant the button is read. What the eye is catching is entirely in
front of that instant.

A tick of settled orbit turns the nose **5.26°**. The button is read at a tick boundary (up to
one tick), and the picture is drawn by interpolating between the last two ticks (exactly one
more), so **up to ~11° of nose rotation can pass between the player letting go and the picture
showing it.** That is the standard cost of a fixed timestep with render interpolation, and the
prototype's loop is the same shape — an accumulator, a catch-up cap and `render(acc / dt)`.

> **Open — how much latency the release may spend.** Two levers, and neither is free.
> **(a)** Drop the render interpolation and draw the newest tick: the lag falls from exactly one
> tick to an average of half of one, at the cost of judder wherever the display is not running at
> the simulation's rate — which is the thing interpolation was added for, on a 120Hz phone.
> **(b)** Accept it. What is *not* available is the prototype's other trick — releasing
> synchronously inside the pointer event — because a release that happens between ticks is a
> release a recipe cannot reproduce, and [ADR-0004](../adr/0004-determinism-is-the-contract-the-author-is-the-feel-gate.md)
> makes determinism the contract.

## What the camera does now

Built after the demo, as a correction to M1.6 rather than as a new step, on
[ADR-0015](../adr/0015-presentation-state-carries-what-decays.md). Three mechanisms, and each
answers a different sentence:

| | What it answers | How |
|---|---|---|
| **The lock** | *"The camera bounces up and down when I orbit a planet"* | Through a **settled** orbit the view's subject is the body, not the craft |
| **The deadzone** | *"A bit less sensitive to my ship's up-and-down"* | The view holds still until the craft leaves a band of **168** design units either side |
| **The follow** | Neither — it rounds the deadzone's edges | An exponential ease at **8** per second |

**The lock is a pure function of the swing's own clock**, which is worth stating because it is
the one place this departs from the prototype's shape and it buys something. Zero until the
settle is over, then a smootherstep over **20 ticks** — a third of a second, which is the
prototype's own rate and its own reason: *"slow enough to read as the view settling with the
orbit and fast enough not to trail it."* Because it is pure, the only thing the camera has to
remember is **the displacement it is currently applying**, and one remembered number is a
smaller promise than two.

**The lock is exactly zero through the dive and the settle**, asserted as `toBe(0)` rather than
as a tolerance. This is the prototype's most expensive camera lesson and the demo corroborated
it from the other side: easing the lock in on the settle's progress flattened the oval's swing
to under 2px — *"of 83px of total swing only 41 survived"* — and the demo's own next sentence
was that the oval is the part that feels great. The dive and the oval are flown; only the round
orbit at the end of them is watched.

**What decays after a release is the displacement, not the weight**, and that *is* a departure.
Decaying the weight means recomputing `body − craft` every tick against a body the craft is now
flying away from — a shrinking fraction of a growing distance — and it was measured here making
the view move **1.25× faster than the craft it was following**. Decaying the displacement itself
bounds the whole effect by the orbit's own radius.

### Measured, over four swings through the fixture field's opening

| | Result |
|---|---|
| Orbit swing reaching the view, once locked | **0.1%** (it was 100%: the view *was* the swing) |
| Camera movement across the lock's ramp | **0** (it was 49) |
| Largest camera step against the craft's own | **never larger**, against a jump of a whole orbit radius with no decay |
| Craft's lowest point below centre | **182** design units, against a thumb-line budget of 422 |

**The ramp took a second pass.** Flown, the first version still moved *"slightly, right at the
moment the ship seems to settle into orbit"* — 49 design units over the ramp, against zero
movement in the twenty ticks before it, so the deadzone had already brought the view to a stop
and the lock was starting it up again. Two faults, one on top of the other:

- **The anchor had somewhere to go.** Locking onto the *body* moves the view by however far the
  two happen to be apart. What the lock is for is holding the view **still**, and the nearest
  still point is the one it is already standing on — so that is what it holds, clamped to within
  a deadzone of the body, because a shallow dive settles into a circle far above the floor and an
  unclamped anchor would let the craft swing below the thumb line.
- **The blend pulled from both ends.** With the target mixed toward the subject by the lock while
  the subject was itself mixed by the lock, both ends of the ramp were right and the middle
  pulled `(craft − camera) × lock × (1 − lock)` — a quarter of a deadzone at half lock,
  oscillating with the orbit underneath it. The prototype centres a locked subject deliberately,
  and it can: its anchor is the body, so it has somewhere to go. Ours does not.

The deadzone's 168 is **derived rather than chosen** — it is the floor radius of the field's
median body, so a craft going round a typical body at its floor moves the view not at all, and
that holds before the lock arrives and for flybys that never freeze. The follow rate's 8 is
bounded from below by the thumb line: an ease lags a moving craft by `v × (1 − k) / k`, and the
lag plus the deadzone has to leave the craft above two thirds of the screen at spec 01 §8's p95
exit speed. The prototype can afford 3 because its view is a third the height of this one.

**Both numbers are opening positions and the gate may move them.** The derivations say what
magnitude they should be; only a phone can say whether they read right.

## Gate

**The author flies this build and the prototype back to back and says yes or no.** Nothing
in M2 starts before that. If the answer is no, the loop is M1.1's characteristics — find the
one that is wrong, not the tuning value that is closest to hand.

**It is flown after M1.5, with a recorder running** (author, 2026-08-27). The gate was
originally last in the milestone and the instrument it uses was scheduled after it, which is
the wrong way round: ADR-0004 makes the author's judgement of feel the scarcest input this
project has, and a session flown without a recorder spends it on a sentence nobody can
reproduce. Flown with one, *"the grab feels late"* arrives with a recipe and a tick number
under it, the same dive can be re-flown by an agent under a changed constant, and a
disagreement about the swing stops being a disagreement about two memories of it.

The build is M1.6's — `pnpm dev` prints a QR for the LAN address, and the phone is where the
judgement is made (ADR-0010). What the gate is asked to decide is listed under
[M1.6](#m16--input-and-a-crude-renderer), and there are four things.

**What the gate is still not asked.** The punch is spec [02](../spec/02-release.md)'s and is not
in the build, so a release pays its lasting 22% and none of its kick; there is no compass, so aim
has no instrument; and there is no audio. Each changes how a swing *reads* without changing what
it *is*, and the gate is about the second. A verdict that turns on one of them is a verdict about
a missing step rather than about the physics, and the loop for it is that step and not spec 01.
Stakes were on this list until the demo took them off it — see M1.4.

Next: [M2](./m2-the-instrument.md).
