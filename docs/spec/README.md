# Specs

Per [ADR-0002](../adr/0002-specs-are-canonical-for-behaviour.md), these files are canonical for
**behaviour and numbers**; the design boards in `../design/` stay canonical for **appearance**.
Every spec cites its board, or states that it has none.

Where two boards disagree, the spec records the ruling and names the board that lost, rather than
leaving the reader to apply the design index's "higher-numbered revision wins" convention.

**Where a spec has been flown and moved, it opens with a ⚠ notice saying what moved and what
still stands** — and the prose below the notice is left as it was, deliberately. Specs
[00](./00-tokens.md), [02](./02-release.md), [03](./03-hud.md), [04](./04-bodies.md),
[05](./05-field.md) and [06](./06-awards.md) carry one. A notice is not a rewrite: it is the record of a decision made
with the build in the author's hands, and the rebase it implies is its own careful edit.

## How these specs treat numbers

`VISION.md`'s seventh pillar rules that a threshold is **a percentile of real play**, never a
plausible round number, and that the standing hazard is **staleness, not error** — a threshold
measured under tuning that has since moved is worse than an unmeasured one, because it looks
defensible.

So every number in these files is one of three kinds, and says which it is:

- **Measured** — taken from recorded sessions of the real game. Cited with what was measured.
- **Ruled** — an author decision, dated, with the board or ADR it settles.
- **An opening position** — a plausible round number, marked as such, existing only so there is
  something to measure. Spec [17](./17-daily-field.md)'s whole difficulty curve is this kind, and
  says so.

And per [ADR-0013](../adr/0013-carry-the-behaviour-re-derive-the-mechanism.md), every number is a
number about **behaviour a test can observe from outside** — a position, a speed, a time, an angle,
a ratio. A characteristic that can only be checked by reaching inside the simulation is specified
wrong, and gets rewritten rather than tested as it stands.

An opening position that is still an opening position after the thing it describes has been flown
is a bug in the process, not a property of the spec.

## What these specs are for

The deliverable of this rewrite is **a technical architecture that is easy to maintain and
extend** (author, 2026-08-27). Every spec is written to serve that: extension points are named
before they are needed (`type` on a body, the powerup `kind`, the mode boundary's two variables,
the seed and standings seams), and each spec's acceptance criteria include at least one that fails
if a layer boundary is crossed.

## The files

| Spec | Board | Covers |
|---|---|---|
| [00 · Tokens and the compass](./00-tokens.md) | Direction 01 | Palette, identity hues, energy steps, type, motion, the compass, layout |
| [01 · The swing](./01-swing.md) | none | Gravity, grab, clearance, the dive, the orbit, the boost envelope, release, coasting, death, the tick — and the measurement of pillar 2's tension. Written in [M1.1](../plan/m1-the-swing.md) |
| [02 · The release](./02-release.md) | Direction 02 | The 400ms: impulse, deformation, camera kick, farewell ring. **The hitstop is withdrawn (ADR-0012) and the timeline is rebased in M2** |
| [03 · The HUD](./03-hud.md) | Direction 03 | One layout, five pressures; the readouts; the deadline track |
| [04 · Bodies](./04-bodies.md) | Direction 04 | Anatomy, the tide, four states, types, naming |
| [05 · The field](./05-field.md) | Direction 05 | Rungs, gravity bow, wake, the stack, the sky, the anomaly |
| [06 · Awards and callouts](./06-awards.md) | Direction 06 rev 2 | Tier zones, streaks, the callout, the debrief voice |
| [07 · The boundary](./07-boundary.md) | Direction 07 | Bands, the gradient, the burn, death |
| [08 · The economy](./08-economy.md) | Direction 08 | The axioms, the arithmetic, chain, the deferred carry, the modes |
| [09 · The debrief](./09-debrief.md) | Direction 09 rev 2 | The card over the crash site |
| [10 · The results sheet](./10-results.md) | Direction 10 | The route, the tally, the recipe line |
| [11 · The front door](./11-front-door.md) | Direction 11 | The door, the standings, ghosts, the offline seam |
| [12 · The finish line](./12-finish.md) | Direction 12 | The carpet, the lift, the crossing, carpet dots |
| [13 · Fuel](./13-fuel.md) | none | What a save costs, and how fuel returns (ADR-0009) |
| [14 · The retro grade](./14-retro-grade.md) | none | The post-process, and the authoring rules the other specs inherit |
| [15 · Audio](./15-audio.md) | none | The pitch ramp, the voices, the bed |
| [16 · Powerups](./16-powerups.md) | none | Fuel and time, never points (ADR-0009) |
| [17 · The daily field](./17-daily-field.md) | none | 40 bodies, the seed, the difficulty curve over altitude |

Specs 00 and 02–12 are transcribed from the twelve design boards. Specs 01 and 13–17 have no board
and are authored: the swing's characteristics, fuel, the retro grade, audio, powerups, and the
daily field's difficulty curve.

> **A note on the count.** [M0.1](../plan/m0-foundations.md) asks for "seventeen specs" and then
> lists twelve board specs and five authored ones — but the authored list has six entries once
> `01-swing` is counted, which the earlier draft of this README already required. Eighteen files
> exist. The lists agree; only the cardinal number was stale.

## The visual pass

The boards were opened and driven in a browser on **2026-08-27**, not only read as source. Two
things that changed as a result, both of which the HTML had misled a source-only reading about:

- **The band multiplier captions a mote**, sitting directly above one and travelling with it — it
  is not a banner over the band. In the source the label and the mote are unrelated SVG elements;
  on screen they are obviously one unit. Spec [07 · §2](./07-boundary.md).
- **Direction 05's live component prints rung labels in metres** — `125`, `250`, `375` — which is
  real evidence on the open question below, though not a ruling. Spec [05 · §3](./05-field.md).

Direction 07's own live component draws **dashed band boundary lines**, now spec'd, and confirms it
uses no in-world label of its own — the cross-section's `OUTER BAND ×2` / `FIRE BAND ×3` are
diagram annotations, not world elements.

## Open questions

Each of these is a hole a spec left deliberately rather than an invented ruling. They are the
author's to close.

| Where | Question |
|---|---|
| [05 · The field](./05-field.md) §3 | **Whether a rung label may cross the thumb line.** Spec 00 §7 forbids anything readable below it, ever, and a rung's number is the first readable thing in the game that *scrolls* — everything else down there is world-attached and exempt in practice. Built as the conservative reading (it fades out as it crosses) |
| [08 · The economy](./08-economy.md) §3 | How a swing that crosses boundary bands is priced. Derived here as deepest-band-reached; not ruled |
| [08 · The economy](./08-economy.md) §4 | Whether the chain has a ceiling, and the bank-spark behaviour if it does. `VISION.md` says measure first |
| [08 · The economy](./08-economy.md) §7 | What death takes in DRIFT. Blocks [09 · The debrief](./09-debrief.md) §5 |
| [00 · Tokens](./00-tokens.md) §2 | The teal identity slot: the board's "≥20° clear of LUMEN" and its "teal 170°" cannot both hold |
| [00 · Tokens](./00-tokens.md) §2a | **The colour-vision sweep** — flagged, not scheduled. It has authority over every hue value and separation number, and none over the grammar |
| [10 · The results sheet](./10-results.md) §5 | The recipe line's length — 12 today, revisited when the codec and store exist |
| [17 · The daily field](./17-daily-field.md) | Every number in the difficulty curve is an opening position, not a measurement |
| [05 · The field](./05-field.md) §5 | **Where an anomaly sits and how much field it covers.** §5 says the day recipe places it and spec 17's generator does not exist, so M3.3 built a stand-in from the prototype's own placement rule and its own shelter magnitude — 4 140 – 4 940 m, reached by 3 of the author's 13 replayable runs. Both on the bench; both deleted when the generator lands |
| [05 · The field](./05-field.md) §4 | **How far ahead of an anomaly the sky starts to warm.** §4 states the ≤ 6% and no distance. Derived rather than ruled — one picture, between a floor (the tint must read before the anomaly's foot can appear at the top of the frame) and a ceiling (a sky that is always warming is not warming) |
| [17 · The daily field](./17-daily-field.md) §4 | Its difficulty curve is written in **prototype magnitudes wearing design-space labels** — radii 55 → 32 against spec 01's measured 34.3 – 55.5, in a space three times as wide. Every number in it is an opening position and M3 re-measures them, so this is a note rather than a contradiction: apply the ×3 once, when they are measured. ⚠ **Read the other way round, this note is what a metre *is*** — see the ruling of 2026-08-30 below, which turns the ×3 from a fix into a conversion. What stays open in §4 is its **gap** endpoints, which are narrower than the 275-unit gaps this field is actually built with |
| [17 · The daily field](./17-daily-field.md) §4 and §5 | **§4's opening geometry violates §5's own invariant 3.** At address 1 the curve gives a 110 m gap and a 55 m radius, so two consecutive bodies have **0 m** between their rims where invariant 3 requires 40. Both are opening positions and M3 re-measures them; recorded so that the pair is fixed together rather than one at a time |
| [08 · The economy](./08-economy.md) §3 | **Pricing distance.** Window width falls with distance, and spec 00 §6 makes a narrow window *"automatically a better-paid one"* — so the furthest body is always the best-paid release on the instrument, which pulls play away from the near ones the author wants it guided toward (2026-08-29). Grading imports nothing from the economy by spec 06's own acceptance, so this is arithmetic and M4's |
| [01 · The swing](./01-swing.md) §13.2 | **The mass-to-radius exponent `n`**, deferred to the M1 gate by the author rather than chosen against the prototype's field. Spec [04 · §1](./04-bodies.md) already rules *mass is size*; what is open is only how steeply. Carried as a parameter with `n = 2` an opening position, and `n = 0` reproducing the prototype exactly. Two consequences are already ruled: grab range scales with mass, and braked small bodies are accepted as texture |

### Open, and opened by a change rather than by a spec

- **[04 · Bodies](./04-bodies.md) / [06 · Awards](./06-awards.md): a knock and an arrival could be
  lit together.** `knock.ts` states that the two *"must never contradict each other"* and sets
  `KNOCK_BAND` above the hardest knock any tight arrival takes. That held over the corpus both
  thresholds were ruled on (2026-08-30) and did not hold under `SIM_VERSION` 7: in the shipped pilot
  run one capture — frozen on 1896, knocked on 1893 — earned both and lit them together for 45 ticks.

  ⚠ **Closed by a physics change rather than by a ruling, 2026-08-31.** The breach is gone under
  `SIM_VERSION` 8 and 9 and neither threshold was touched: the release kick becoming a square moved
  approach geometry, and `test/state/goldens.test.ts` asserts the invariant outright again rather
  than pinning a breach. **That it healed by itself is a reason to re-measure `KNOCK_BAND`, not to
  relax about it** — a threshold that has drifted in and out of correctness twice in two days is one
  whose margin nobody currently knows. ⚠ **Closed for good on 2026-09-01**, and by neither of the
  routes below: the two words are now separated by the **aim** predicate rather than by a margin, so
  no cohort can put them back together. See *Rulings applied*.

  The paragraph below is left as it was, and its own conclusion — that the margin was unknown — is
  what turned out to matter. The re-measurement is the author's, it wants real captures,
  and it cannot be taken on the pilot: measured over the shipped run the floor's share is **0.1548
  once and then 0.0008**, so no band anywhere between 0.001 and 0.155 changes what that fixture says.
  Both thresholds remain the author's, ruled on measured play.

## Rulings applied

- **A knock is a hard landing by a craft that was pointed at the body** (author, 2026-09-01), after
  sending a capture that should have said the word and did not: *"the last capture and orbit in
  `diagnostics/2026-09-01T02-29-53-120Z-run-dispatch.json` should've shown the knock effect."*
  `KNOCK_BAND` moves 0.15 → **0.01** and `struckHard` gains the **aim** the floor's share was
  standing in for. It overturns *the knock stays exactly as it is*, ruled hours earlier — and does
  not contradict it, because that ruling's *"it happens rarely"* was said about a band measured the
  same day to fire **zero** times in the author's whole corpus. It now fires on 1 capture in 78,
  which is rarer than the 4% the old band was originally measured to select. The two words are now
  mutually exclusive **by predicate** rather than by a margin that had drifted to 0.009, and
  `SIM_VERSION` does not move: `struckHard` is read only by presentation state. See
  [06 · Awards](./06-awards.md)'s notice and [M3](../plan/m3-the-field.md).

- **An addressed rung prints metres** (author, 2026-09-01), after flying both readings on the bench:
  *"metres are good for the runs."* Reading (b) — the nearest body's address — is deleted from
  `src/state/rung.ts` and its toggle removed from the bench, because a knob whose question has been
  answered invites the answer to be re-opened. The corollary the boards were in tension about is now
  the standing position: **the address scale belongs to the cards**, not to the field.

- **One fixture, not several** (author, 2026-09-01). The goldens ride on the single recipe `pnpm
  replay` flies with no argument, so a number in a golden and a number in that terminal output stay
  the same number. Measured first: over 30 000 pilot seeds, 9 carry every moment the goldens are
  written about and the first is 3 197, where splitting three ways would find one at seed 70, 13 and
  70 — about forty times easier each. The expensive half of a re-record was the thirty hand edits and
  `test/moments.ts` removed those, so what splitting would buy is compute nobody watches. The trigger
  for revisiting is a sweep of thirty thousand that finds none, and `tools/fixture.ts` prints it.

- **An unbound grab draws no predicted path** (author, 2026-09-01). The craft is on a hyperbola
  until the dive closes it, which is **31% of dive ticks** in the author's own play — up to 1.4s of
  no oval at the moment of commitment. The prototype draws both conics and its note argues at length
  that not doing so is *"the wrong conclusion"*; that is refused here. *"We only want to draw orbits
  when they're actually viable. For wide fly-bys, the user is flying a bit more blindly on purpose.
  They're rewarded for quick fly-bys and speed."* Recorded because it is a deliberate divergence from
  the prototype, and `predictOrbit` says so at the `null`.

These were made by the author and recorded in [M0.1](../plan/m0-foundations.md). They are closed.
Do not re-litigate them.

- Award vocabulary is **TRUE / SHARP / PERFECT** plus an unnamed **make**. DEADEYE / SHAVED /
  CLEAN are retired.
- Direction 08 owns the **arithmetic**; Direction 06 owns the **presentation**. Every absolute
  point value printed on boards 02, 03 and 06 — `+445`, `+556`, `+668`, `+890` — is stale and is
  carried nowhere. The multipliers travel; the totals do not.
- Display face is **Anton**; everything that moves or reports is **Archivo**.
- A **held** body is E2 and alive, and goes DUSK only after release.
- Bodies are named by **hue in the run and address in the retelling**. The `P11` chips are retired.
- The **"NEXT, IN ORDER" footers on boards 02 and 05 use obsolete numbering.** The design index is
  authoritative. Direction 13 does not exist.
- **Parallax star layers are refused.** Dust varies in brightness, never in velocity.
  ⚠ **Overturned by the author, 2026-08-30** — the sky has parallax and the rest of the layer
  stack does not; see [05 · §2](./05-field.md)'s notice. **The second half of that sentence is
  built and holds** (M3.3): the dust is drawn in world space, so it cannot have a velocity of its
  own, and `test/render/dust.test.ts` is `test/render/starfield.test.ts` with its first assertion
  turned back the right way up.
- **Carpet dots pay flat and unmultiplied** — a deliberate, argued exception, recorded in
  [12 · The finish line](./12-finish.md) §4 so nobody later "fixes" it.
- **ION is monopolised in the world, not on the craft.** Fuel, the deadline track and the save
  trail wear pink legitimately; nothing else in the world does.

## Rulings made since

| Date | Ruling | Where it bites |
|---|---|---|
| 2026-08-27 | **In-world multipliers and boost labels are in.** Direction 03 draws a `×3` band label in the world and Direction 07 forbids it; **Direction 07 lost**, against the higher-number convention, by author ruling — *"I want to keep it arcade-like and obvious what rewards you."* The label **captions a mote** rather than banner-labelling the band, and a powerup states what it pays before it pays it. What stays refused is **instruction**: no arrows, no `RISK ZONE`, nothing that says *turn*. A price is a fact; a command is not (`VISION.md`, pillar 4) | [03](./03-hud.md), [07 · §2](./07-boundary.md), [08 · axiom 5](./08-economy.md), [16 · §3](./16-powerups.md) |
| 2026-08-27 | **The rung system holds**; its spacing and label numbers are deferred until there is a swing to measure them against | [05 · §3](./05-field.md) |
| 2026-08-27 | **The palette is flagged for a colour-vision sweep**, with authority over hue values and separation numbers and none over the grammar | [00 · §2a](./00-tokens.md) |
| 2026-08-27 | **The recipe line's length is revisited at implementation** | [10 · §5](./10-results.md) |
| 2026-08-27 | **The swing's characteristics are measured and written**, from 474s of recorded phone play under the prototype's current physics tuning plus headless sweeps of its own simulation. The load-bearing one: at peak boost the craft can reach only **43%** of the circle of release headings (never above 49% at any sampled geometry), so the boost and the aim genuinely compete — `VISION.md` pillar 2 as a number a test can hold | [01](./01-swing.md) §11 |
| 2026-08-27 | **The domain language is binding on specs, code and tests, and the prototype's names do not cross.** `CONTEXT.md` gains **dive, floor, clearance, freeze, settle, depth** and **punch** — words spec 01 was using heavily without a glossary entry — and **hitstop** is kept as a refused term so a reader meeting it in an older document knows it was decided against rather than forgotten. Spec 01 was restated in these words ([ADR-0013](../adr/0013-carry-the-behaviour-re-derive-the-mechanism.md), [AGENTS.md](../../AGENTS.md)) | [CONTEXT.md](../../CONTEXT.md), [01](./01-swing.md) |
| 2026-08-27 | **The swing is real physics with three authored transitions in it** — the clearance impulse, the freeze, and the 1.2s settle — and the freeze is **deliberately physically inconsistent**: it clamps the orbit's *shape* at e ≤ 0.6 while carrying the dive's *speed* uncapped. Measured, dives differing only in approach speed produce an **identical ellipse ridden at 400/415/435**, and all of them decay to the same circular speed by the end of the settle. The reward for a good dive is a speed advantage with a **1.2-second shelf life**, and that is what makes letting go a decision | [01 · §5 and §6a](./01-swing.md) |
| 2026-08-27 | **The ×3 / ×27 conversion is confirmed by the author.** The rewrite should feel the same in the hand on the same phone, so lengths, speeds and accelerations scale by 3 from the prototype's 390-wide world into the 1170×2532 design space, and `μ` by 27. Times, angles, ratios and tick counts are unchanged. The simulation carries the factor as **one named constant** and derives every length from it and from the figure spec 01 states, so declining it later is a single number. Spec 01 §13.3 is closed | [01 · §0 and §13.3](./01-swing.md), `src/sim/units.ts` |
| 2026-08-27 | **The simulation owns its transcendentals**, closing spec 01 §12a. V8 and JavaScriptCore — what the author's phone runs — return different bits for `Math.sin` **4.3%** of arguments, `Math.cos` 4.6%, `Math.atan2` **17.9%** and `Math.hypot` **36.4%**, measured over 20 000 each; `sqrt(x*x + y*y)` disagrees 0%. `src/sim/trig.ts` computes its own from correctly-rounded operations only, and the same probe finds the two engines **identical to the bit** across 80 000 values. It costs 0.73 ulp — level with V8's own — and 2.8× on `sin`, which is a handful of calls a tick. Composing rotations was rejected: the rotor still needs `sin` and `cos`, and it does nothing for `atan2`. Every implementation-approximated `Math` function and the `**` operator are now banned in `src/sim/` and `src/state/` ([ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md)) | [01 · §12a](./01-swing.md), `pnpm portable` |
| 2026-08-28 | **The design width is the contract and the visible height flexes**, with two guardrails: a **guaranteed band** of height that every device shows in full and inside which everything readable is composed, and a **cap** on the extra a taller device sees. Fitting the rectangle *whole* drew everything at **77%** of the prototype's size on the same phone, because the design space was authored at the size of a screen a browser never gives a page. The guardrails are what stop the flex making the visible field a property of the hardware — measured, unguarded devices see **496 – 846** prototype units of height and the body a craft next grabs is on screen at release **45 – 89%** of the time. Both numbers, and the fit, are [M3.1](../plan/m3-the-field.md)'s | [00 · §7](./00-tokens.md), [M3.1](../plan/m3-the-field.md) |
| 2026-08-28 | **Off-screen bodies are `CONTEXT.md`'s sightings, and a sighting does not point.** Direction 03's *"edge dots in identity hue"* is canonical and the dot is the reason the form survives this spec's own no-arrows acceptance: the mark's **position** on the edge is the direction, so nothing has to point. Never drawn behind the climb — that is clutter and a suggestion to turn around — and never for a body already on screen. **Always on**, which is the point: the compass needs an orbit and a sighting is what a coasting craft reads. **They are the other half of the §7 ruling above** rather than a separate feature — *"markers to objects off-screen is the way we deal with the information loss of fixing the width"* — so what is built is Direction 03's form and nothing more; the prototype's distance labels and its ring on the offered body are recorded in §6 with their evidence, unbuilt | [03 · §6](./03-hud.md), [CONTEXT.md](../../CONTEXT.md), [M2.2](../plan/m2-the-instrument.md) |
| 2026-08-28 | **The clearance's rate is the characteristic and its duration the consequence.** §4 measured only the time — five frames, 80 – 90ms — against a turn running 3.6° to 62°, so the rate varied seventeenfold and the tail read as a snap: 47% of grabs owe a clearance, the median owes **59.5°**, and five frames pays that at 11.9° a frame against the settled orbit's own p90 of **5.07°**. It now eases at the orbit's rate over **5 – 10 frames**; measured, the p90 biggest single-frame turn falls **12.5° → 6.9°** and no periapsis lands below the floor at any swept duration | [01 · §4](./01-swing.md), `src/sim/clearance.ts` |
| 2026-08-28 | **The bounce off a body you are not holding is 0.2, and was 0.6.** Flown, the prototype's value is a ricochet: 16 flips over 90° in a single frame across 300 runs, up to 165°. Below 0.2 the craft skids instead — 86 frames of unbroken contact at 0 — and endings barely move across the range. The **floor** slides at 0, and a body you are not holding should not push back harder than the one you are | [01 · §10](./01-swing.md), `src/sim/units.ts` |
| 2026-08-28 | **The camera follows at 3**, the prototype's own rate. The thumb-line budget holds; the lock arrives with ~2 design units of movement rather than exactly none, against the 49 that was reported as a defect. **2 is the floor** — below 3, presentation state stops shedding a disagreement within a bounded time ([ADR-0015](../adr/0015-presentation-state-carries-what-decays.md)) | `src/state/camera.ts` |
| 2026-08-29 | **Off-screen bodies point, and say how far** — reversing the ruling of the day before. Flown, the dot alone was rejected: *"the coloured dots — personally I hate them. Let's instead re-design them to be arrows with distance markers"*, and on the maxim that forbade it, *"this is another instance of an original rule being too strict."* A sighting is an **arrow** in the identity hue with a **distance** beneath, fading with range and full strength on the body a press would take. The label is a **distance and not a name** — the `P11` retirement is about naming and identity stays hue-only — and *"reach"* has a number carried from the prototype until spec 17 sets one | [03 · §6](./03-hud.md), [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-29 | **The compass's window is the quality band, not the reachable one, with a floor under it.** Measured as reachability the median window is **360°** — true, and useless, since the median body is on offer from 1 680 design units against a field spaced nearer 700. It is now the arc over which a release arrives within two of the target's floors: *"if I release here I'll have a good chance of getting a high quality capture."* An arc the geometry earns nothing of opens to 15°, because *"for very distant planets we still need to show a window"*, and **the compass grades the width it draws**. Flown, p50 **36.6°** against Direction 01's own 40° wedge. *Reachable* is the prototype's aim range, capped at four rings — measured, the body actually grabbed next is among the four nearest 100% of the time | [00 · §6](./00-tokens.md), [06](./06-awards.md) |
| 2026-08-29 | **The E3 no longer fires at a grab or at a release.** *"Let's let the PLANET speak about our grab, not some ambient glowing orbs."* Spec 04 §3's held body is E2 and alive and the compass draws itself around that glow, so the flash was a second voice on the same beat. The step, its 400ms and the one-alive-at-a-time rule are untouched and belong to the award and the checkered line; the release is quiet until M2.4 | [00 · §3](./00-tokens.md), [02 · §2 and §7](./02-release.md) |
| 2026-08-29 | **A body glows when it is *gripping*, not when it is reachable, and all glow came down.** *"All glow is too much. I want it fainter and more impactful."* Spec 04 §3's *"E0–E1"* for AHEAD is read at **E0** until the body is actually pulling — `CONTEXT.md` gains **grip** — and E1/E2 are drawn at 18% and 30% against §3's 35% and 60%. **The radii are untouched**, so §3's acceptance still holds: bloom radius is a pure function of the step and the chain, and what moved is an alpha, which §1 makes the renderer's. A wide faint halo grows with grip in its place | [00 · §3](./00-tokens.md), [04 · §3](./04-bodies.md) |
| 2026-08-29 | **The tide tracks at `k ≈ 30 /s`, grows out of the rim, and tapers into it.** Two days open: `CONTEXT.md` says the tide always faces the craft, §2 said `k ≈ 6`, and built as written the standing lag ran wider than the arc's own half-width. Settled in two passes, because the first was measured against the wrong thing — the arc now **tapers**, peaking on the bearing and fading to nothing at both ends, so what reads as the tide is its bright middle half. Against the full arc, halving the lag looked enough; against the core the craft was still inside it only **11%** of the time. At 30 the lag is p50 **2.1°** and the core covers the craft **91%**, and it is the last value where the lag is still visible at all — at 45 it is half a degree and §2's *heavier tracks tighter* stops being readable. The band also grows **out of the body's edge**: the rim's own width at the edge of a reach, twice §1's 4px at the surface, so a distant body shows a lit spot on the limb rather than a band that arrives at full size. §1's scale rule was re-checked, not weakened — at equal approach a body of 20 and one of 120 draw the identical band | [04 · §1 and §2](./04-bodies.md), `src/state/body.ts`, `src/render/index.ts` |
| 2026-08-29 | **The clock that paces the tick declares its own grain.** WebKit clamps `performance.now()` to a whole millisecond, so the phone cannot report 16.667ms — it reports 16 or 17, the leftover accumulates, and a frame occasionally runs two ticks, moving the world 33ms while showing one picture. Measured across four phone runs: **34 frames in 1 811 ran two ticks and 37 ran none**, in bursts rather than scattered (variance ÷ mean of **8**), and the author reported it twice — *"some lag when orbiting"*, then *"visual stuttering"* — with the burst in the timeline where they said to look both times. A reading within one grain of a whole number of ticks is now read as that number: every 60Hz-family display goes from 70 – 958 double-steps per 6 000 frames to **zero**, 120Hz and 90Hz are untouched, and a genuinely doubled frame still catches up. What stops it inventing time is a **bound**: the clock stops rounding once that has borrowed a whole tick, which never engages on a real 60Hz display and engages within a second on a 63Hz one. **Not a performance change** — nothing got faster, a visible artefact went away — and `SIM_VERSION` does not move, because `replayRun` never calls `ticksDue` | [01 · §12](./01-swing.md), `src/sim/clock.ts`, [the write-up](../plan/performance.md) §10 |
| 2026-08-29 | **The tide is on the body a press would take, or the one already held** — §2's *"every body within grab range"* is most of the field at once, and flown it reads as noise rather than as gravity. **§2's inner ripple is unbuilt**: it is the one line in that file the prototype never implemented, and it was the first thing the author asked the purpose of | [04 · §2](./04-bodies.md) |
| 2026-08-29 | **A window heats over a quarter turn rather than over itself, and the compass's *ghost* is a `CONTEXT.md` collision.** Measured, the hand is inside an arc for 3 – 4 ticks (50 – 67ms) and a window heated on its own width lights too late to aim with; on the prototype's alignment ramp it is lit **15 ticks, 250ms** before its dot. And *ghost* is the glossary's word for a recipe played back beside a live run, so the mark where the hand cuts a ring is a **crossing** | [00 · §6](./00-tokens.md), [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-29 | **Spec 00 §6's per-ring label is retired; spec 04 §5 wins.** §6 put *"a chip at its window's tip"* on every compass ring and §5 rules an address chip appears in **exactly one case** — two live targets too close in hue to tell apart. One had to be stale and neither said which. Measured over **29 777** pairs of rings drawn together in recorded play, two rings on one compass never come closer than **24.4°** in hue, so the tie §6's label would have resolved does not arise on the instrument. §6's 12° label-collision rule is retired with it and identity in the run stays hue-only | [00 · §6](./00-tokens.md), [04 · §5](./04-bodies.md) |
| 2026-08-29 | **The boost envelope's clock is drawn on the orbit path.** Nothing on screen drew it, which left spec 01 §11's tension half-visible — the compass draws the aim in detail and the timing was invisible. Measured over 83 converted releases, **34% landed before the boost had armed** and one hold ran **303 ticks against an envelope that ends at 156**, reported as *"I felt that I slowed down a LOT."* The physics was clean. Ruled: the arc already flown is lit by what a release along it would have been worth — dim while arming, brightest across the plateau (measured at **0.45 of a revolution**, spec 01 §11's own 43% from the picture's side), dying behind the craft. `CONTEXT.md` gains **flown arc**, because *trail* was already the craft's line through the field | [02 · §6](./02-release.md), [01 · §7 and §11](./01-swing.md), [00 · §6](./00-tokens.md) |
| 2026-08-29 | **Spec 02 is rebased and the hitstop notice is spent.** Rule 1 withdrawn, the timeline dated from `T0`, §5 replaced by **the punch** — 6px along the exit tangent at √quality, half again as long at the top of the envelope, 3px reversed and ungraded at a grab. The conflict M2.1 left is resolved: the punch is a **displacement from** the camera's position, and the centreline assertion is now about the camera's **subject**. One contradiction had to be settled — spec 02 ended the word at T+510ms and spec 06 §4's own pop, linger and decay sum to **1 720ms** — and the notice's own rule settles it: durations measured from the start of their own element are untouched, so spec 06 stands and spec 02's end column moves. The linger is on the bench | [02](./02-release.md), [06 · §4](./06-awards.md), [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) |
| 2026-08-29 | **Three compass rings, not four** (author): *"four is a bit unwieldy and makes it hard to decide where to go next."* The cohort that set the number prices it — over 342 releases that reached another body, the one actually grabbed next was among the **three** nearest 99.7% of the time against four's 100%, so the fourth ring is worth one release in 342 and costs a choice on every orbit. Two is 92.7% and is a different game | [00 · §6](./00-tokens.md), `src/sim/compass.ts` |
| 2026-08-29 | **There is no delay at a release, and the one that existed was the camera's.** *"The slight delay is making it seem jagged and jumpy. Let's remove any camera/speed delay there."* Nothing in the build time-scales; what was there was the camera carrying the orbit's hold and decaying it at 5% a tick — **41 ticks at p50, up to 104**, walking the view **356 design units** away from an accelerating craft. It now lets go on the same tick the craft does, asserted as a shape rather than as a rate. And the felt *"lag or freeze on release"* is the **press**: in the dispatch flown against it, **all eight presses land on one of the twelve worst frames at +0 ticks and no release does**, at a cpu of 0 – 1ms — the browser's touch-begin, six runs running | [02 · §5](./02-release.md), `src/state/camera.ts`, [the write-up](../plan/performance.md) §10 |
| 2026-08-31 | **The transient loses its good-release extension, and `SIM_VERSION` is 9.** *"The release speed boost effect is a bit too fast right now. Can we scale it back a bit more?"* — the third message about this curve in a day and the second asking for less of it with the peak held. `TRANSIENT_STRETCH` goes 0.25 → **0**, so the span at full quality is 1.63s → **1.30s** and the distance it adds falls **20%**, with the peak untouched at 0.800. Measured on the run they sent, the burst runs on **69% of ticks against 85%**: a span of 98 ticks against release gaps of 57 – 143 meant consecutive releases overlapped and the craft was almost never *between* kicks. What it gives up is ADR-0012's *"half again as long at full quality"* — a good release is now paid in amplitude alone, which is the cleaner statement, and the **stretch** keeps the duration reading where length costs no speed | [01 · §8](./01-swing.md), `src/sim/units.ts` |
| 2026-08-31 | **The release kick becomes a square, and `SIM_VERSION` is 8.** *"I felt the kick upon release still isn't noticeable enough. When I release well I feel like the kick lasts too long, so I go REALLY fast… I'd like for there to be more of an initial kick to the boost, that then fades away into the current feel."* Harder, shorter, and less of it on the release they said it about — three things no straight line can do at once, because raising a line's start raises everything under it. `burstOf` now spends the transient on the **square** of what is left of its span, at [01 · §8](./01-swing.md)'s own measured share of **0.8**, with the good-release extension halved to 0.25. At full quality the peak goes **0.450 → 0.800** (+78%), the span **1.95s → 1.63s**, and the distance it adds **0.439 → 0.434** (−1.2%); the two curves cross at 0.65s. A poorer release gains a few percent of distance instead, because its peak rises by the same 78% from a lower start. **Not the 2026-08-29 ruling reversed** — that took the share from 0.8 to 0.45 on *"all of the velocity kicks are a bit too intense"*, and the amount handed out is lower here than at 0.45; what went up is the peak. §8's exit-speed tolerance is untouched, because the transient never enters `vx`/`vy` | [01 · §8](./01-swing.md), `src/sim/craft.ts`, `src/sim/units.ts` |
| 2026-08-31 | **The craft's stretch is half again as deep** — 1.5 / 0.7 becomes **1.75 / 0.55**, the board's own 5 : 3 ratio at a deeper amplitude. The first answer to *"more punchy at the start"*, taken on the channel that costs nothing: a scale on the silhouette, no tick and no trajectory. It was not enough on its own, which is what sent the same request to the transient above | [02 · §4](./02-release.md), `src/state/deformation.ts` |
| 2026-08-31 | **A fast approach is forgiven some of its aim, and the ruled threshold does not move.** *"Maybe we can incorporate the velocity into the evaluation logic, since coming in fast makes it harder to capture the lowest approach?"* (author). Measured over their own **105 captures**: the slower half lands a median **1.3** design units above the floor and the faster half **25.0**, and ranked, room against entry speed is **rho 0.31** — against aim it is rho −0.07, so speed is a third axis rather than a second reading of the first. Pearson misses it at 0.07 because room runs p05 0, p50 3, p95 543 and a few fly-pasts swamp the mean. Spec [01 · §5a](./01-swing.md)'s *"the dive normalises speed"* is not contradicted so much as outrun: its sweep covered 60 – 260 prototype units and this game is now flown at two to four times that. `ARRIVAL_SIDEWAYS` is **untouched** at the value the author set when they refused a looser gate — relief is added on top of it, so nothing can lose the word. It costs **two captures in 105**, 13% → 15%, both fast and both within three units of the floor, one of them the capture that prompted the note. **Picture, not flight**: the orbit carries the entry speed across the freeze and nothing steers on it, so `SNAPSHOT_VERSION` moves to 8 and `SIM_VERSION` stays at 7 — checked the way `test/sim/version.test.ts` prescribes, and every recipe goes on replaying | [06](./06-awards.md), `src/sim/tier.ts`, [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-30 | **A release taken in the dive gives back half of what falling gave it, and `SIM_VERSION` is 7.** *"My tap fly-bys towards the end were being rewarded with new speed despite not interacting much with the planets."* Measured first, and the **boost was not the culprit** — it pays 0 – 14 design units/s on those swings. The dive is: gravity accelerates a falling craft and stops acting at a release ([01 · §2](./01-swing.md)), so the way in was free and the way out was never charged. Over 129 real swings a dive release handed the craft **+548** at the median and gained **81%** of the time, against +71 for a swing held past the settle — **7.7×**, and the best-paid move in the game. Both [01 · §7](./01-swing.md)'s *"a reflexive tap-through earns almost nothing"* and `release.ts`'s *"changes nothing about the craft"* were false, and §5a's flat 260 – 300 speed-by-band had bent to 213 – 356. Shipped at **1** and refused the same hour — *"too slow and anemic"* — so it sits at **½**, which is its own finding: with the tap closed nothing else is an engine, since `PERMANENT_SHARE × PEAK_BOOST` is ~40 against approach speeds near 1 000. **Fuel** is the author's own named answer to what should replace it. §7's envelope tolerance is untouched — it is measured on releases from a frozen orbit and never sees this | [01 · §7](./01-swing.md), `src/sim/units.ts`, `src/sim/release.ts` |
| 2026-08-30 | **A planet loses its inner stratum** — *"I want to remove the innermost circle within each planet because they're starting to look like beehives."* [04 · §1](./04-bodies.md)'s 0.39r ring is what goes, not the core: a core is a filled dot rather than a ring, so it is not part of the concentric pattern, and it is §4's **type slot**, which a later body type is a data change because of. What survives is §1's *structure without texture* — a rim, one stratum, a core | [04 · §1](./04-bodies.md), `src/render/index.ts` |
| 2026-08-30 | **The gravity bow and the craft's wake are switched off, and the mechanism is kept whole.** *"Let's remove the gravity wake effect for now, for both planet and ship, but leave the underlying code so we can reactivate it later."* What ships is the rest of spec 05's system — strata every 50 m, α 0.16 and 0.28, every fifth addressed — so §6's *speed felt* and *altitude addressed* survive and **gravity drawn** is parked; the **tide** is again the only thing saying gravity, at the rim rather than at a distance. It is two constants, both on the bench: `BOW_GAIN` 0 → 24 and `WAKE_AMPLITUDE` 0 → 40 with the falloff at 85. Zero reaches the picture through presentation state rather than through the renderer, so a body that bends nothing is culled and a rung is drawn from two points — measured, path points fall **895 → 96** per frame. `test/state/rungs.test.ts` exercises the law at the strengths a restore would put back and asserts separately that the shipped field draws flat, so the ruling and the mechanism can move without either rotting | [05 · §3](./05-field.md), `src/state/rung.ts`, [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-30 | **A metre is a prototype unit, so it is `SCALE` = 3 design units.** Four specs state the world's geometry in metres — 17 §4's whole difficulty curve, 07 §2's bands, 08's one point per metre, 05 §3's rung spacing — and nothing had ever said what one is; `fixture-field.ts` recorded the gap twice and deferred it twice. Three pieces of arithmetic agree and the third decides: spec 17 §4's radii (55 → 32 m) **are** spec 01 §13.2's measured 34.3 – 55.5, the corridor this field is flown in (370.5) sits inside §4's 480 → 300, and at the only competing reading — the design board's own rung spacing, which would make a metre 5.52 — spec 07 §2's 220 m outer band is **deeper than the whole corridor** and every run opens inside the boundary. It adds no factor: the ×3 was already ruled in 2026-08-27, and this says the specs' metres are the units that conversion applies to | [05 · §3](./05-field.md), [07 · §2](./07-boundary.md), [17 · §4](./17-daily-field.md), `src/sim/units.ts`, [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-30 | **Rungs are 50 m apart, not 25**, closing the spacing half of 2026-08-27's deferral. 25 m was the first value the spacing ever had and it was refused on the first flight: *"the rungs are too close together, it feels chaotic at speed."* At 50 the author's phone shows **12.9 rungs** against Direction 05's own live component drawing 13.5 in its frame — the complaint and the board turn out to be the same correction. The metre did not move and must not; the number of metres did | [05 · §3](./05-field.md), `src/state/rung.ts` |
| 2026-08-30 | **The bow clamps at 45px, and 30px was breaking spec 05's own acceptance.** A rung point inside a body is hidden behind its disc, so the visible peak is at the **rim** — and at 30 the per-body clamp bites there for any body above radius 44, so the peak *falls* above it: measured at radii 34 / 44 / 56 the rim bow ran 18.0 → **23.8** → 22.3, meaning the biggest body in the field bent **less** field than the median one. The clamp and *"increases peak bow monotonically"* could not both hold. 45 is the smallest value that clears the range a day places (turnover moves to radius 60), and it is half of the author's *"maybe all gravity wakes need to be a bit larger"* the same day. The wake moved with it — 40px deep and 85px wide against the board's 16 and 34, which is what restores the picture the author was describing after the spacing doubled, plus a quarter | [05 · §2, §3 and Acceptance](./05-field.md), `src/state/rung.ts` |
| 2026-08-30 | **The sky keeps its place beside the rungs, quieter** — the question `starfield.ts` and 05 §2's notice both said to reopen once the rungs landed. *"The background starfield now needs to be much less noticeable. I still want it there, but only as background noise."* Settled by **rank** rather than by removing one of two systems saying *speed*: an alpha at 0.4, with the star sizes and per-star parallax — the depth that was asked for — untouched. The sky is now fainter than the **dust** in front of it is specified to be | [05 · §2](./05-field.md), `src/render/starfield.ts`, [CONTEXT.md](../../CONTEXT.md) |
| 2026-08-30 | **The simulation owns its exponential**, on the same evidence and for the same reason it owns `sin` and `cos`. ADR-0014 banned `Math.exp` before anything needed it; spec 05 §3 needs it twice — the bow and the wake are both exponential falloffs. Measured over 20 000 arguments per range, V8 and JavaScriptCore return different bits for `Math.exp` **9.5%** of the time over ±300 and **10.0%** over the −3 … 0 the falloffs live in; `src/sim/math.ts`'s own returns **identical bits on both engines across all 40 000**, at 0.914 ulp against V8's 0.808 and a cost of 3.1× | [ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md), `src/sim/math.ts` |
| 2026-08-27 | **The hitstop is rejected; the punch is bought with speed instead.** Flown in the prototype, even a 30ms stop read as the game buffering. A **kick on every release, scaled by the quality of the swing** replaces it — transient, so it can be large without touching the economy, and read from a number the simulation already produces. ADR-0006's layering stands; only its hitstop example is withdrawn ([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)) | [02](./02-release.md) — **needs rebasing in M2**, [01 · §7 and §13.1](./01-swing.md) |
