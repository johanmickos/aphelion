# Specs

Per [ADR-0002](../adr/0002-specs-are-canonical-for-behaviour.md), these files are canonical for
**behaviour and numbers**; the design boards in `../design/` stay canonical for **appearance**.
Every spec cites its board, or states that it has none.

Where two boards disagree, the spec records the ruling and names the board that lost, rather than
leaving the reader to apply the design index's "higher-numbered revision wins" convention.

## The files

| Spec | Board | Covers |
|---|---|---|
| [00 · Tokens and the compass](./00-tokens.md) | Direction 01 | Palette, identity hues, energy steps, type, motion, the compass, layout |
| [01 · The swing](./01-swing.md) | none | **Placeholder.** The swing's characteristics are named in [M1](../plan/m1-the-swing.md), by the author (ADR-0004) |
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

## Open questions

Each of these is a hole a spec left deliberately rather than an invented ruling. They are the
author's to close.

| Where | Question |
|---|---|
| [05 · The field](./05-field.md) §3 | What an addressed rung's label says — metres, or the address of the nearest body. The board's prose and its own live component disagree |
| [08 · The economy](./08-economy.md) §3 | How a swing that crosses boundary bands is priced. Derived here as deepest-band-reached; not ruled |
| [08 · The economy](./08-economy.md) §4 | Whether the chain has a ceiling, and the bank-spark behaviour if it does. `VISION.md` says measure first |
| [08 · The economy](./08-economy.md) §7 | What death takes in DRIFT. Blocks [09 · The debrief](./09-debrief.md) §5 |
| [00 · Tokens](./00-tokens.md) §2 | The teal identity slot: the board's "≥20° clear of LUMEN" and its "teal 170°" cannot both hold |
| [17 · The daily field](./17-daily-field.md) | Every number in the difficulty curve is an opening position, not a measurement |

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

One further ruling was applied by the design index's own convention rather than by M0.1, and is
recorded where it bites: Direction 03 draws a `×3` band label in the world; Direction 07 forbids
in-world multiplier labels outright. **Direction 03 lost** ([03 · The HUD](./03-hud.md),
[07 · The boundary](./07-boundary.md)).
