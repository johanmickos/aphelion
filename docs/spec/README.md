# Specs

Per [ADR-0002](../adr/0002-specs-are-canonical-for-behaviour.md), these files are canonical for
**behaviour and numbers**; the design boards in `../design/` stay canonical for **appearance**.
Every spec cites its board, or states that it has none.

Where two boards disagree, the spec records the ruling and names the board that lost, rather than
leaving the reader to apply the design index's "higher-numbered revision wins" convention.

**Where a spec has been flown and moved, it opens with a ⚠ notice saying what moved and what
still stands** — and the prose below the notice is left as it was, deliberately. Specs
[00](./00-tokens.md), [02](./02-release.md), [03](./03-hud.md), [04](./04-bodies.md) and
[06](./06-awards.md) carry one. A notice is not a rewrite: it is the record of a decision made
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
| [05 · The field](./05-field.md) §3 | What an addressed rung's label says — metres, or the address of the nearest body. The rung approach and the gravity bend are **confirmed**; spacing and label numbers are deliberately deferred |
| [08 · The economy](./08-economy.md) §3 | How a swing that crosses boundary bands is priced. Derived here as deepest-band-reached; not ruled |
| [08 · The economy](./08-economy.md) §4 | Whether the chain has a ceiling, and the bank-spark behaviour if it does. `VISION.md` says measure first |
| [08 · The economy](./08-economy.md) §7 | What death takes in DRIFT. Blocks [09 · The debrief](./09-debrief.md) §5 |
| [00 · Tokens](./00-tokens.md) §2 | The teal identity slot: the board's "≥20° clear of LUMEN" and its "teal 170°" cannot both hold |
| [00 · Tokens](./00-tokens.md) §2a | **The colour-vision sweep** — flagged, not scheduled. It has authority over every hue value and separation number, and none over the grammar |
| [10 · The results sheet](./10-results.md) §5 | The recipe line's length — 12 today, revisited when the codec and store exist |
| [17 · The daily field](./17-daily-field.md) | Every number in the difficulty curve is an opening position, not a measurement |
| [17 · The daily field](./17-daily-field.md) §4 | Its difficulty curve is written in **prototype magnitudes wearing design-space labels** — radii 55 → 32 against spec 01's measured 34.3 – 55.5, in a space three times as wide. Every number in it is an opening position and M3 re-measures them, so this is a note rather than a contradiction: apply the ×3 once, when they are measured |
| [00 · Tokens](./00-tokens.md) §6 vs [04 · §5](./04-bodies.md) | **The compass's per-ring label.** §6 puts *"a chip at its window's tip"* on every ring; §5 rules that in a run an address chip appears in exactly one case, and the `P11` chips are retired — so a label that is not an address has nothing to say. One of the two is stale and neither says which. Unbuilt, with §6's 12° collision rule |
| [08 · The economy](./08-economy.md) §3 | **Pricing distance.** Window width falls with distance, and spec 00 §6 makes a narrow window *"automatically a better-paid one"* — so the furthest body is always the best-paid release on the instrument, which pulls play away from the near ones the author wants it guided toward (2026-08-29). Grading imports nothing from the economy by spec 06's own acceptance, so this is arithmetic and M4's |
| [01 · The swing](./01-swing.md) §13.2 | **The mass-to-radius exponent `n`**, deferred to the M1 gate by the author rather than chosen against the prototype's field. Spec [04 · §1](./04-bodies.md) already rules *mass is size*; what is open is only how steeply. Carried as a parameter with `n = 2` an opening position, and `n = 0` reproducing the prototype exactly. Two consequences are already ruled: grab range scales with mass, and braked small bodies are accepted as texture |

## Rulings applied

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
| 2026-08-27 | **The hitstop is rejected; the punch is bought with speed instead.** Flown in the prototype, even a 30ms stop read as the game buffering. A **kick on every release, scaled by the quality of the swing** replaces it — transient, so it can be large without touching the economy, and read from a number the simulation already produces. ADR-0006's layering stands; only its hitstop example is withdrawn ([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)) | [02](./02-release.md) — **needs rebasing in M2**, [01 · §7 and §13.1](./01-swing.md) |
