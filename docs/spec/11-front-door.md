# 11 · The front door and the standings

**Board**: [Direction 11 — Daily Front + Leaderboard](../design/Aphelion%2011%20-%20Daily%20Front%20%2B%20Leaderboard.dc.html).

**Rulings applied**: **v1 is offline** (ADR-0003). Live standings, the friend band, other players'
ghosts, `3 481 FLYING`, and the pilot-handle registry are **not built**. What is built is the
seam: the same screens, reading a standings source whose v1 implementation is the player's own
local history. The board's "NEXT, IN ORDER" footer references a Direction 13 that does not exist.

**Depends on**: [05 · Field](./05-field.md), [10 · Results](./10-results.md),
[17 · Daily field](./17-daily-field.md).

---

## 1 · The idea

**The front screen is not a menu — it is the bottom of today's field.**

The camera idles below rung zero. Today's first bodies are visible and breathing above. The craft
waits on the pad. **Pressing anywhere begins the run**: the front door and the game share one verb.

Everything else — modes, standings, yesterday — is a **hold** away, on glass cards over this same
living field. The player never leaves the world; they only park cards on it.

**There is no screen in the game that is not the world.**

## 2 · The front door

| Element | Content | Position |
|---|---|---|
| Field | The real bottom of today's field: real first bodies, the real boundary, rung zero addressed | Full bleed, live |
| Title | `APHELION` | Anton 34px, tracked 0.12em, CORE, floating over the sky like a constellation label |
| Day line | `DAY {N} · {FIELD NAME} · 40 BODIES` | Archivo 700, 9.5px, tracked 0.3em, DUSK |
| Craft | On the pad at rung zero, with a short pad line under it | CORE, E2 |
| Verb | `PRESS TO FLY` | Archivo 800, 13px, tracked 0.3em, CORE, blinking at the insert-coin cadence |
| Sub-verb | `HOLD FOR STANDINGS · MODES · YESTERDAY` | Archivo 600, 8.5px, tracked 0.2em, DUSK |
| Social line | The day's stakes, one line | Archivo 600, 9px, DUSK. **Seam** — see §5 |

No logo screen. No menu tree. **Scouting the opening bodies is free and is part of the daily
ritual**, so the first bodies must be the genuine ones the run will meet.

The blink cadence and the tap/hold grammar are spec [09](./09-debrief.md) §7's, unchanged.

## 3 · The standings

**Ranks are altitude.** The board is drawn as the field itself.

| Element | Behaviour |
|---|---|
| Axis | A vertical altitude axis, labelled `0 · 10 · 20 · 30 · 40`, running the height of the card |
| Entries | Names planted at the altitude they reached, scores right-flush at that height |
| Topped-out cluster | A SOLAR rule across the top, `TOPPED OUT · {N}`, with the best score |
| Dead runs | Hollow **DUSK** rings — the spent vocabulary again |
| Your entry | CORE, filled, 800 weight, carrying **percentile before position** |
| The gap | A short **ION** segment drawn between the player's altitude and the next entry above, labelled with its **true size in the game's own units**: `+1 363 · ONE SWING` |
| Verb | `TAP A NAME TO RACE ITS GHOST` |
| Sub-verb | `HOLD TO CLOSE · RESEEDS {H}H {M}M` |

**Percentile leads over position.** `TOP 4%` reads as pride at rank 139 of 3 481; position alone
reads as defeat. Both are shown; percentile is first and larger.

The gap line is the entire retention design: the near-miss is measured in the game's own units,
and the rematch is one tap away.

## 4 · Ghosts

Every entry is a recipe (spec [10](./10-results.md)), so **every name is playable**. Tapping one
offers its ghost: a **CORE-white craft flying that exact line**, with the player's instruments live
against it.

| Property | Value |
|---|---|
| Rendering | CORE white, no identity hue, E1 — dimmer than the player's own craft, which stays the brightest thing on screen |
| Trail | Present, at reduced α; no compass, no callouts, no HUD of its own |
| Physics | **Playback of a recipe, not a simulation of an opponent.** A ghost has no collision, cannot be grabbed, and cannot affect the live run's state in any way |
| Determinism | A ghost is `(recipe, tick)` — the same purity the live run has (ADR-0004, ADR-0006) |

The board stops being a ranking the player reads and becomes a queue of opponents they choose.

**Verification comes free**: a score without a valid recipe cannot exist on the board, because the
board's only entry format is a recipe.

## 5 · The offline seam (ADR-0003)

v1 has no backend. The following are defined as **boundaries with local implementations behind
them**, so a service can be introduced later without touching gameplay:

| Surface | v1 implementation |
|---|---|
| Today's seed | Derived from the date (spec [17](./17-daily-field.md)) |
| Standings source | The player's own run history for this day and previous days |
| The player's entry | Their own run |
| Other entries | Their own past runs on previous days, shown as such |
| Ghosts | The player's own past runs |
| The social line | Their own history: e.g. `YOUR BEST 51 002 · 14 DAYS FLOWN`. Never invented numbers |
| Percentile | Against their own history, labelled so it cannot be mistaken for a global figure |
| Friend band | **Not built.** The row is absent, not empty |
| Pilot handles | **Not built.** v1 shows no other player's name |

Nothing in the game may be designed as though a run were a leg of something longer until the field
itself is worth flying twice (`VISION.md`), and a leaderboard is the strongest possible form of
that assumption. The screens exist; the population does not.

When a service does arrive, pilot handles are **single words, 3–8 characters, tracked caps** —
`VELA`, `KESTREL`, `MARA`. No avatars, no flags, no clan tags. On this board a player is a name at
an altitude, same as a body.

## 6 · The ritual

```
open → the door shows today's opening bodies (scouting is free)
     → PRESS TO FLY
     → one run
     → debrief (spec 09) or results sheet (spec 10)
     → standings with the gap drawn
     → share, or race a ghost
     → the reseed countdown starts the appetite for tomorrow
```

Every step is either the field or one glass card over it.

## 7 · Modes

`HOLD` from the front door opens a card offering **DAILY, DRIFT and ZEN** (ADR-0005, ADR-0007) over
the same living field. DAILY is the default and needs no selection: the front door *is* DAILY's
door.

The card states, for each mode, what its currency is and what death takes — the two things a mode
is allowed to change (spec [08](./08-economy.md) §7).

**DAILY offers no retry, at any point, on any screen.** If today's run is spent, the door says so
and offers DRIFT.

## Acceptance

- The front door renders the same field the run will fly: the first three bodies' addresses, hues,
  radii and positions match the run's exactly.
- Pressing anywhere on the front door starts the run; there is no tappable region that does
  anything else.
- With the standings source empty (a first-ever launch), every screen renders with rows absent, not
  blank, zeroed, or populated with placeholders.
- Nothing in the build issues a network request.
- A ghost playing back alongside a live run changes zero bits of the live run's simulation state; a
  run flown with and without a ghost produces identical final banks.
- The seed for a given date is identical on every device and produces an identical field.
- No screen in the game is drawn over anything but the field.
