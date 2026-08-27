# Specs

Per [ADR-0002](../adr/0002-specs-are-canonical-for-behaviour.md), these files are canonical for
**behaviour and numbers**; the design boards in `../design/` stay canonical for **appearance**.
Every spec cites its board, or states that it has none.

Where two boards disagree, the spec records the ruling and names the board that lost, rather than
leaving the reader to apply the design index's "higher-numbered revision wins" convention.

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
| [02 · The release](./02-release.md) | Direction 02 | The 400ms: hitstop, impulse, deformation, camera kick, farewell ring |
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
| [01 · The swing](./01-swing.md) §13.1 | **The hitstop.** ADR-0006 and spec 02 require a 70ms world freeze at grab and release. The prototype built it, flew it, and the author **ruled it rejected on 2026-08-27** — even 30ms reads as jarring — shipping a graded, entirely transient release kick instead. That ruling was made next door and carrying it here is a decision, not a transcription. Keep the hitstop, adopt the ruling and amend ADR-0006 and spec 02, or keep both — and whichever, spec 02 and spec 01 must end up agreeing |
| [01 · The swing](./01-swing.md) §13.2 | Whether a body's radius affects anything but its orbit floor and its surface. The prototype gives every body the same mass regardless of size, so there is no relation to carry |
| [01 · The swing](./01-swing.md) §13.3 | Confirmation that the rewrite should feel the same in the hand, which is what the ×3 / ×27 conversion from the prototype's units assumes. Declining it changes every absolute figure in that spec at once |

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
