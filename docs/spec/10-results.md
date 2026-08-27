# 10 · The results sheet

**Board**: [Direction 10 — Results Sheet](../design/Aphelion%2010%20-%20Results%20Sheet.dc.html).

**Rulings applied**: `RANK 12 OF 3 481 · TOP 1%` is an **online seam**, not v1 behaviour — v1
standings are the player's own history (ADR-0003). The board's INFINITE and CORRIDORS variants
describe modes v1 does not ship (ADR-0005). Bodies are named by address in the retelling.

**Recipe length**: the board's prose says the recipe line "costs fourteen characters"; its own
example `APH-214-KX7Q` is twelve, and **ADR-0003 says twelve**. The ADR binds: **twelve
characters.**

**Depends on**: [08 · Economy](./08-economy.md), [12 · Finish](./12-finish.md),
[17 · Daily field](./17-daily-field.md).

---

## 1 · The idea

**The route is the trophy.** A score is a claim; a route is a proof.

The sheet's hero is the run itself, drawn as a light-line through the whole field — every grab,
every PERFECT, every fire-band dip legible in one glance, unique as a fingerprint. Same glass-card
language as the debrief (spec [09](./09-debrief.md)), composed to be screenshotted.

**Every run ends with this sheet** — field cleared or not. A DAILY that ends in death shows the
debrief (spec [09](./09-debrief.md)); a DAILY that reaches the top shows this, and the top-out
**replaces the debrief entirely**.

## 2 · Composition

| Property | Value |
|---|---|
| Safe frame | Everything inside a **4:5** region. A screenshot crops to exactly the card; nothing above or below it matters |
| Glass | VOID at **85%** over the living field, same double rule and square corners as the debrief |
| Chrome | **None.** No UI furniture inside the safe frame that a crop would have to remove |
| Wordmark | `APHELION` on the glass, Archivo 600, 9px, tracked 0.2em, bottom-left |
| Recipe | Bottom-right, **INK at 800**, 10px, tracked 0.2em — it is a fact, not a link |

## 3 · The card, top to bottom

| Row | Content |
|---|---|
| Header | `DAY {N} · {FIELD NAME} · TOPPED OUT` |
| Headline | **One number**, Anton 44px, SOLAR: the banked score |
| Sub-headline | `BANKED` plus, when a standings source exists, percentile then position |
| Route map | §4 — the hero, ~226 × 360 design units |
| Tally | **Exactly three rows**, dot leaders, right-flush 800 values |
| Rule | Hairline |
| Footer | Wordmark left, recipe right |

**One number rules the card.** Score for DAILY and DRIFT. Everything else is dot-leader small
print.

### The tally

| Row | Value |
|---|---|
| `PERFECT` | count, and best streak — `4 · BEST ×3` — in SOLAR |
| `FIRE BAND` | percentage of the run's engaged metres flown in the fire band |
| `TOP VELOCITY` | peak velocity |

### The day is named on the glass

`DAY 214 · THE LONG CLIMB` — so two screenshots side by side are instantly the same contest, and
tomorrow's is instantly a new one (spec [17](./17-daily-field.md) owns the name list).

## 4 · The route language

The route map is the game's vocabulary at roughly **1:400** scale. No legend, because every mark
keeps its in-game meaning.

| Mark | Meaning | Colour |
|---|---|---|
| The line | The flight, whole field, bottom to top | CORE, 1.75px, α 0.85 |
| Gold dots | PERFECTs, at the exact bodies that earned them | SOLAR, r 2.6 |
| Green ticks | SHARPs | LUMEN, r 2.2 |
| Pink lines | The boundary, both sides | ION, 1px, α 0.35 |
| Pink tint | The fire band, as a filled column | ION at α 0.05 |
| Violet stratum | The anomaly's altitude range, as a filled band | AURORA at α 0.10, labelled `ANOMALY` in 7px |
| DUSK circles | Spent bodies — the run's rosary | body fill, DUSK stroke |
| Chevron | The top-out marker | CORE |
| Axis | `0` at the bottom, `40` at the top | DUSK, 7px |

TRUE releases and makes get **no mark**. The map is a map of mastery, and the vocabulary rule
holds: the baseline tier spends no vocabulary (spec [06](./06-awards.md)).

**A cautious run is a straight pale line up the middle. A great run hugs a boundary and glitters.**
Skill has a silhouette; that is the trophy.

## 5 · The recipe line

```
APH-214-KX7Q
```

| Property | Value |
|---|---|
| Length | **12 characters**, including the two hyphens (ADR-0003). **Revisit at implementation** (author, 2026-08-27) — the length follows from what the codec actually needs to address a run, and that is not known until the store exists |
| Structure | `APH` · day number · payload, checksummed |
| Contains | Enough to identify **one** run — a handle, not the run itself |
| Does not contain | The input log. Twelve characters cannot hold a compressed input log |
| v1 behaviour | Resolves against **local** run storage: the player's own runs replay as ghosts |
| The seam | The codec and the store are defined as a boundary with a local implementation behind it, so a service can be introduced later without touching gameplay (ADR-0003) |

**What the recipe is**, per CONTEXT.md, is the complete description of a run — its seed and its
input log — from which the run can be replayed and its score independently recomputed. The
twelve-character *line* is the handle to one; the recipe itself is the seed plus the log.

Pasting a recipe into the game replays that run as a **CORE-white ghost** over the player's own
attempt (spec [11](./11-front-door.md)). Server-side verification, when there is a server, is
replay plus recompute — which determinism already gives for free (ADR-0003, ADR-0004).

## 6 · Mode variants

| Mode | Headline | Route map |
|---|---|---|
| **DAILY, topped out** | Banked score, SOLAR | The whole field, 0 to 40 |
| **DRIFT** | The bank, SOLAR | Scrolls to show the final 500 m, with an altitude badge |
| **ZEN** | **None at all.** No headline | The route alone, full-bleed. The subtraction mode subtracts from the trophy too |

Designed for, not built: CORRIDORS (headline is time in Anton, route drawn on the course shape).

## 7 · Topped out

The daily field has a top (40 bodies), so finishing is an event.

- The craft exits the field's last rung, the camera lets it go, and the card snaps in **on the
  empty sky it left** (spec [12](./12-finish.md)).
- Header reads `TOPPED OUT`.
- Line one: `CLEARED THE FIELD · {N} PERFECT · NOTHING LEFT TO TAKE`.
- The wager framing pays off here: **victory is the field failing to keep your money.**

In-app, `TAP TO SHARE` blinks below the glass at the insert-coin cadence (spec
[09](./09-debrief.md) §7).

## Acceptance

- The rendered card fits inside a 4:5 frame with no element clipped and no element outside it.
- A screenshot of the card, cropped to the safe frame, contains the day name, the headline, the
  route and the recipe, and no UI chrome.
- The route is reconstructed from the recipe alone; replaying the recipe headless and re-drawing
  the route produces an identical path.
- The recipe line is exactly 12 characters and round-trips: encode → decode → the same run.
- A recipe with a corrupted character fails its checksum and is rejected, rather than replaying a
  different run.
- ZEN's sheet contains no number anywhere.
- With no standings source present, the sub-headline renders with the percentile row absent, not
  blank or zeroed.
