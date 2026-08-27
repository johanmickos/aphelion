# 09 · The debrief

**Board**: [Direction 09 — The Debrief, rev 2](../design/Aphelion%2009%20-%20The%20Debrief.dc.html).

**Rulings applied**: the board's INFINITE card describes a mode v1 does not ship (ADR-0005,
ADR-0007) — its layout is inherited by **DRIFT**, its stated economy is not (spec
[08](./08-economy.md) §7 records that as open). `FRIENDS PAST 23` and the standings hold are
**online seams**, not v1 behaviour (ADR-0003). Bodies are named by hue in the run and address in
the retelling.

**Depends on**: [06 · Awards](./06-awards.md) §8 for the voice, [07 · Boundary](./07-boundary.md)
for what precedes it, [08 · Economy](./08-economy.md) for the numbers.

---

## 1 · The idea

**A card over the crash site.** The debrief is a translucent modal parked over the still-living
field: embers settling, the boundary still breathing, the bank ring planted at the death altitude.
Death is a **place**, and the card is parked on it.

The card speaks pure arcade: sharp corners, double rule, dot-leader tallies, a headline number in
display type, and a blinking verb. **It snaps in over two frames. Arcade cabinets cut; they do not
fade.**

## 2 · The sequence

`T0` is the completion of the death animation (spec [07](./07-boundary.md)).

| Time | Event |
|---|---|
| **0.0s** | Burn-up completes. The field stays **fully alive** — no dimming yet. Silence after the last SOS strobe |
| **0.8s** | The card snaps in: **2 frames, no fade, no slide.** The field dims to 65% behind it **only through the card's own translucency** — the world is not dimmed |
| **0.9 – 1.4s** | Tally rows land top to bottom, one per **~120ms**, each with a tick. Numbers slam in whole. Arcade scoreboards count; they do not fade in |
| **1.6s** | The verb begins blinking at **1Hz** and the game is listening |

After the tally lands, **nothing on the card animates except the blink.** The blink owns the
silence.

## 3 · The glass

| Property | Value |
|---|---|
| Fill | VOID at **82%** over the living field |
| Frame | Double rule, **square corners** — the one rectangle in a game of circles and arcs |
| Outer stroke | 2px |
| Inner stroke | 1px, inset 5px, α 0.35 |
| Header bar | 26px tall, the frame colour at α 0.18 |
| Frame colour | DUSK normally; **ION** for the DAILY death — the one debrief that cost something |

The world is orbital; the scoreboard is a machine. That contrast is the retro register, earned
structurally rather than pasted on with scanlines (spec [14](./14-retro-grade.md)).

## 4 · The card, top to bottom

| Row | Content | Type |
|---|---|---|
| Header | Mode context: `DAY 214 · ONE RUN · SPENT` (DAILY) / `FLIGHT LOG · RUN 4021` (DRIFT) | Archivo 700, 9px, tracked 0.3em |
| Headline | **The mode's verdict** — see §5 | **Anton**, 40px |
| Sub-headline | What became of it: `CASHED · KEPT` / `STAYS AT 23 · THE FIELD KEEPS THE WAGER` | Archivo 600, 8.5px, tracked 0.2em |
| Cause line | `FELL INTO THE JADE ONE AT 23` | Archivo 800, 11.5px, INK |
| Pink clause | `· CHAIN ×11 WENT WITH YOU ·` | Archivo 800, 10.5px, **ION** — one dry pink clause, always |
| Tally | **Exactly three rows**, dot leaders, values right-flush | Archivo, 10px label / 800 value |
| Rule | A hairline above the verb | 1px, frame colour |
| Verb | The blinking primary verb | Archivo 800, 12px, tracked 0.3em, CORE |
| Sub-verb | The quiet secondary | Archivo 600, 8.5px, tracked 0.2em, DUSK |

### The headline

The headline number is **the mode's verdict**:

- **SOLAR** for what the player kept.
- **DUSK** for what the field kept — spent, like a taken body.

### The cause line

Assembled by the run itself: **cause + place + one true number** (spec [06](./06-awards.md) §8).
Never scolds, never jokes at the player. The composition is machine-assembled from:

| Cause | Line stem |
|---|---|
| Crossed the boundary line | `LEFT THE FIELD AT THE {SIDE} WALL · ON FIRE` |
| Missed the last press | `MISSED THE LAST PRESS BY {Δ}s · {V} M/S AT THE LINE` |
| No fuel to afford the save | `RAN DRY AT {ADDRESS} · THE FIELD KEPT GOING` |
| Collided with a body | `FELL INTO THE {HUE} ONE AT {ADDRESS}` |

A body is named by its **hue** (`THE JADE ONE`), an altitude by its **address**.

## 5 · The two cards v1 ships

| | **DAILY death** | **DRIFT death** |
|---|---|---|
| Frame | ION | DUSK |
| Header | `DAY {N} · ONE RUN · SPENT` | `FLIGHT LOG · RUN {N}` |
| Headline | The bank the field kept, in **DUSK** | The bank cashed and kept, in **SOLAR** |
| Sub-headline | `STAYS AT {ADDRESS} · THE FIELD KEEPS THE WAGER` | `CASHED · KEPT` |
| Tally row 1 | `REACHED` … `{ADDRESS} OF 40` | `BEST CHAIN` … `×N` |
| Tally row 2 | `PERFECT STREAK` … `×N` (SOLAR) | `PERFECT STREAK` … `×N` (SOLAR) |
| Tally row 3 | `BEST CHAIN` … `×N` | `TOP VELOCITY` … `{V}` |
| Verb | `TAP TO SHARE THE EPITAPH` | `TAP TO FLY AGAIN` |
| Sub-verb | `FIELD RESEEDS IN {H}H {M}M · HOLD FOR YOUR STANDINGS` | `HOLD TO SHARE` |

**DAILY has no retry**, so the blinking verb is SHARE and the reseed countdown converts grief into
appetite (ADR-0007: the scarcity is the point, and softening it with lives would put resume state,
respawn rules and a re-priced wager inside the one mode that also carries the standings and the
share artifact).

**ZEN has no debrief at all** — there is no death in ZEN, only drifting back.

**Reaching the top has no debrief either.** The top-out replaces it entirely with the results sheet
(spec [10](./10-results.md)).

> **Blocked**: the DRIFT headline and sub-headline assume death takes carry only. If the author
> rules that DRIFT death takes carry **and** bank (spec [08](./08-economy.md) §7), this card takes
> the DAILY treatment — DUSK headline, `THE FIELD KEEPS…` — with the DRIFT verb.

## 6 · What lives behind the glass, not in it

The field behind the card is alive and animate, and it carries information the card does not
repeat:

- **The ember trail** from the death, still settling.
- **The bank ring** planted at the death altitude: a circle carrying the number, drawn **around**
  the modal, not listed inside it. Solid DUSK stroke for a bank that was kept; **hollow, dashed**
  for a bank the field took.
- **The body that killed the player**, right there behind the glass, still in its identity hue.
- **The boundary**, still breathing.

## 7 · Input

**No buttons on the card.** Tap anywhere = the blinking verb; hold = the quiet one under it.
Press, hold, release survives as the entire interface, menus included.

The blink runs at **1Hz on a `steps()` cadence — on 60%, off 40%**: the insert-coin rhythm.

## 8 · The online seam (ADR-0003)

v1 is offline. `FRIENDS PAST 23`, live standings and other players' ghosts are **not built**. What
is built is the seam: the debrief reads its comparison rows from a standings source whose v1
implementation is the player's own local history. `HOLD FOR YOUR STANDINGS` opens spec
[11](./11-front-door.md)'s standings card against that local source.

## Acceptance

- The card's arrival changes zero simulation state; the field behind it continues to tick.
- Measured over the 2 frames of the card's arrival, no property is interpolated.
- The card contains exactly three tally rows in every mode.
- Every debrief line is generated from `(cause, address, one number)` by one function; no line is a
  string literal at a call site.
- The blink is the only animating element after 1.4s.
- A DAILY debrief offers no path that starts another DAILY run today.
- Removing the standings source leaves the card renderable, with its comparison row absent rather
  than blank.
