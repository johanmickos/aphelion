# 06 · Awards and callouts

**Board**: [Direction 06 — Awards + Callouts, rev 2](../design/Aphelion%2006%20-%20Awards%20%2B%20Callouts.dc.html).

**Rulings applied**: this board's rev 2 vocabulary is the ruling — **TRUE / SHARP / PERFECT plus
an unnamed make**. `DEADEYE`, `SHAVED` and `CLEAN` (Directions 01 and 02) are retired.
**Direction 06 owns the presentation** — word over points, born at the dot;
[Direction 08](./08-economy.md) owns the arithmetic. Every absolute point value printed on this
board (`+445`, `+556`, `+668`, `+890`) is a stale illustration from a superseded scoring model
and is carried nowhere. Callouts are set in **Archivo 800**, not the display face. A missed
release **defers** the carry rather than destroying it (ADR-0008), which amends this board's
"no word, no points" to "no word, no cash".

**Depends on**: [00 · Tokens](./00-tokens.md), [08 · Economy](./08-economy.md).

---

## 1 · The law

**Points for the make. Words for the mastery.**

A word that never repeats never becomes a signal, and a word for "merely made it" devalues every
word above it. So the baseline tier speaks in points alone, and the vocabulary is exactly three,
on the rarity ladder players already know.

Streaks escalate by **counting**, never by inventing a synonym.

## 2 · The tiers

The grade of a release is a pure function of where inside the window it landed. Let `W` be the
window's angular width and `d` the absolute angular offset of the release from the window's
centre (the dot).

| Tier | Zone | Multiplier | Colour | Energy | Word |
|---|---|---|---|---|---|
| *(miss)* | `d > W/2` | — | — | — | none. See §5 |
| **make** | `d ≤ W/2` | **×1.0** | CORE at 70% | E1 | **none** — points only |
| **TRUE** | `d ≤ 0.30 W` (inner 60%) | **×1.25** | CORE | E1 | `TRUE` |
| **SHARP** | `d ≤ 0.15 W` (inner 30%) | **×1.5** | LUMEN | E2 | `SHARP` |
| **PERFECT** | `d ≤ max(0.08 W, 1.5°)` | **×2.0** | SOLAR | E3 | `PERFECT` |

Zones **scale with the window**, so difficulty prices the words automatically: a PERFECT on a
needle-thin arc is a different feat than on a barn door, and the arc's width already said so. The
`1.5°` floor stops the PERFECT zone becoming unhittable on the narrowest windows.

Tiers differ by **type scale, colour and bloom only**. They never differ by anything else, and
the colour ladder is white → green → gold, the rarity convention players arrive knowing. Violet
is deliberately absent: purple means strange, never good.

**Tiers are identical in every mode.** Modes may change what the currency is and what death takes;
they may never change how a swing is graded (spec [08](./08-economy.md)).

## 3 · Streaks

A streak counts **consecutive releases at the same tier**. It is accuracy. (Chain is engagement
and is a different system, in a different pixel — spec [08](./08-economy.md).)

| Rule | Behaviour |
|---|---|
| Per-word | A separate count per tier. `PERFECT ×N` counts consecutive PERFECTs |
| Broken downward only | Any **lesser** graded result resets the count |
| Upgrades | A PERFECT does not break a SHARP streak — it **upgrades** it, ending the SHARP count and opening `PERFECT ×1` |
| A make | Is a lesser result, and resets any streak above it |
| No timer | Coasting between grabs cannot expire a streak. Only a graded release or death changes it. Expiry-by-clock would punish route-reading |
| A miss | Is not a graded release. It **does not change the streak** (ADR-0008) |
| Death | Ends every streak |
| First display | `×N` appears at the **second** occurrence |
| Merge | A repeat arriving within the previous callout's linger merges in place: the counter ticks and re-pops smaller, rather than spawning a second callout |
| Multiplier | **+10% per step**, where step = `N − 1`, **capped at 5 steps**. So `×1` → ×1.0, `×3` → ×1.2, `×6` and above → ×1.5 |

Longest PERFECT streak is a headline stat on the results sheet (spec [10](./10-results.md)).

## 4 · The callout

The word, its points and its colour arrive as **one unit** at the release point.

| Property | Value |
|---|---|
| Composition | Word over points, centre-aligned, one unit |
| Type | Archivo **800**, caps, tracked **0.1em** |
| Size | TRUE 15px · SHARP 18px · PERFECT 21px (design px). A make shows points only, at 13px |
| Bloom | TRUE 5px · SHARP 8px · PERFECT 12px, in the tier colour |
| Birth | At the compass dot that earned it, offset **8–30px** off the dot |
| Pop | **120ms** upward, ~30px, one overshoot |
| Anchor | Then **world-anchored** — it drifts past at world speed as the craft climbs |
| Linger | ~**1.2s** at full opacity |
| Decay | 400ms to zero. Dead by T+510ms from release (spec [02](./02-release.md)) |
| Collision | A new callout snaps the previous one to its decay tail. Queueing is structural: one release, one word, and the one-E3-at-a-time rule means two can never fight |

The pop buys the glance; leaving it behind sells the speed. Score meets attention where attention
already is — no band at the top of the screen.

## 5 · A miss

A release outside the window gets **silence**: no word, no sting, no confiscation. The grab that
was not made is the feedback.

Per **ADR-0008**, an out-of-window release **does not cash at all**. The carry is neither lost nor
paid — it rides into the next swing and cashes when a graded release finally earns it. A bad
release is a debt, not a loss.

## 6 · Chain milestones

Chain milestones (**×5, ×10, ×15**) get a masthead pulse and one bloom step on the craft. **No
word.** The number is the callout; vocabulary is reserved for releases.

## 7 · What gets no word, ever

Event words are deleted. There is no callout for entering an anomaly, grazing the boundary,
surviving a burn, or reaching a milestone. The aurora is the callout; a word on a spectacle is a
caption on a firework.

## 8 · The debrief voice

Every death line is assembled by the run itself: **cause + place + one true number**, so every
death reads like a black-box recording.

```
LEFT THE FIELD AT THE RIGHT WALL · ON FIRE
RAN DRY AT 23 · THE FIELD KEPT GOING
MISSED THE LAST PRESS BY 0.2s · 1 450 M/S AT THE LINE
FELL INTO THE JADE ONE · CHAIN ×11 WENT WITH YOU
```

Rules of the register: **state what happened, name the place, one true number, never scold, never
joke at the player.** A body is named by its hue ("the jade one"), an altitude by its address.
Composition is spec'd in [09 · Debrief](./09-debrief.md).

## Acceptance

- Grading is a pure function of `(d, W)` and imports nothing from the economy. Deleting the
  economy (ZEN) leaves the tier, the word, the colour and every timing above unchanged.
- The four zone boundaries are exact at `d = W/2`, `0.30W`, `0.15W`, `max(0.08W, 1.5°)`; a test
  that releases at each boundary ± one tick's angular travel lands on the expected side.
- With `W = 15°`, the PERFECT zone is 1.5° (the floor binds). With `W = 40°`, it is 3.2°.
- The sequence SHARP, SHARP, PERFECT, SHARP yields streak states `SHARP ×1`, `SHARP ×2`,
  `PERFECT ×1`, `SHARP ×1`.
- A release outside the window changes no streak counter and cashes nothing.
- Three releases inside 0.4s produce exactly one live callout and no overlapping text.
- No callout ever renders in an identity hue, and no body, ring or gauge ever renders in LUMEN or
  SOLAR.
