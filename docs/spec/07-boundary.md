# 07 · The boundary

**Board**: [Direction 07 — Boundary](../design/Aphelion%2007%20-%20Boundary.dc.html).

**Rulings applied**: **ION is monopolised in the world, not on the craft.** Fuel, the deadline
track and the save trail all wear pink legitimately; nothing else in the world does. This board
also overrules [Direction 03](./03-hud.md)'s in-world `×3` band label — **there are no multiplier
labels in the world**.

**Depends on**: [00 · Tokens](./00-tokens.md), [13 · Fuel](./13-fuel.md),
[08 · Economy](./08-economy.md), [09 · Debrief](./09-debrief.md).

---

## 1 · The three laws of the boundary

1. **Intensity = closing speed, not proximity.** Coast along the outer band and the boundary glows
   softly — the player can live there. Dive at it and it flares. A barrier reacts to where you are;
   a risk reacts to what you are doing.
2. **Reward is shown, never spoken.** Boundary motes drift in the outer bands, denser and
   brighter deeper in. No multiplier labels, no arrows, no "RISK ZONE" text anywhere in the world.
   The glimmer is the signpost.
3. **The line is the only absolute.** Bands are negotiable; the line is not. Past it, physics
   stops negotiating too. That stake is the game's one deliberate cruelty.

## 2 · The bands

Measured inward from **the line**, in world metres. Positions are drawn in world space; the
gradient never sits on the screen edges, so it reads as geography rather than as a vignette.

| Band | Extent | Band multiplier | Motes |
|---|---|---|---|
| **THE FIELD** | deeper than 220 m from the line | **×1** | none |
| **OUTER BAND** | line − 220 m … line − 90 m | **×2** | sparse, α ≈ 0.25–0.55, r ≈ 1.6–2.4px, no bloom |
| **FIRE BAND** | line − 90 m … the line | **×3** | dense and bright, α ≈ 0.55–0.85, r ≈ 2.4–3.0px, 5px bloom |
| **GONE** | past the line | — | **absent — even the reward stops promising** |

Motes drift at world speed, strictly parallel, like dust.

The band multiplier prices a swing's cash (spec [08](./08-economy.md)). It is never printed.

## 3 · The gradient

The ION gradient fills from the outer band's inner edge to the line. Its intensity is:

```
heat = min(0.85, (0.10 + closing / K) * (1 + 60 / d))
```

where `closing` is the component of the craft's velocity toward the line (clamped at ≥ 0), `d` is
the distance to the line in world metres (floored at a small epsilon), and `K` is the closing-speed
constant, tuned on the phone.

The dominant term is **closing**; the proximity term only sharpens it near the line. Skimming the
fire band parallel to the line gives near-zero closing speed, so the boundary idles at a low ION glow:
**high reward, held nerve, quiet screen.** The game respects the racing line instead of screaming
at it.

The line itself is a 2.5px ION stroke whose α and bloom also rise with `heat`.

## 4 · The convergence

On a committed dive, three systems converge on the same ~2 seconds. That convergence *is* the
boundary experience.

1. Closing speed multiplies the gradient's bloom.
2. The **deadline track** appears on the craft's own projected line, with its window and its dot
   (spec [03](./03-hud.md) §5).
3. **Fuel prices the save** by lit fraction of that window (spec [13](./13-fuel.md)).

Nothing on screen says "turn". Everything true is on screen.

## 5 · The save — the burn

A press inside the deadline window is a **save**, and it buys a **burn**: a flaming carve back
into the field.

| Property | Value |
|---|---|
| Path | A carve back into the field, curvature set by the craft's speed and the depth of the press inside the window |
| Trail | **ION-tinged** — the one time the player's white light wears pink, because the boundary is writing on them |
| Fuel | Drains from the halo visibly and in real time during the carve (spec [13](./13-fuel.md)) |
| Re-entry | A 150ms expanding CORE ring at the point the craft turns back into the field |
| Award | **None.** No word for surviving. The clip is the reward, and the debrief logs the skim |
| Debrief line | `SKIMMED THE RIGHT WALL · FUEL −38%` — assembled per spec [06](./06-awards.md) §8 |

**78% of burns end in a death** in the recorded prototype corpus, and that is the correct shape:
the drama is free and only the save is paid.

## 6 · The loss — crossing the line

Death is the anti-release, and it borrows the release's grammar exactly (spec [02](./02-release.md)).

| Time | What happens |
|---|---|
| before | `SOS` strobes in ION at the craft at 2Hz, from the moment the last press is missed. It is a signal, not a scream |
| T0 (the line) | **70ms hitstop** — the same as a release |
| T+70ms … T+970ms | The craft **unravels along its velocity** over ~900ms: stretch to 1.8 / 0.6, core alpha to zero, embers streaming strictly parallel behind. `SOS` stops at the line; the silence after the last strobe is the loudest frame in the sequence |
| T+70ms | BANK snaps to DUSK. **BANK never counts down.** A draining counter is mockery; a stated fact is an epitaph |
| ~T+1370ms | World dims behind the debrief card |
| ~T+1970ms | The debrief card snaps in (spec [09](./09-debrief.md)) |

**No explosion. No slow-mo. No shake.** The streak rule holds even in death: nothing radiates.
This is the only death animation in the game.

The release condenses the player's light into a word; the loss disperses it into the field.
Mirrored grammar makes death feel like the game's own physics rather than a punishment layer.

## 7 · Why this stays an instrument

The boundary never issues a command. It states four facts and lets the player price the trade:

- where the bands are — gradient in world space;
- what they pay — mote density;
- how fast the craft is closing — bloom;
- when saving stops being possible — the deadline dot.

The bands also make the score-chase **spatial**: the optimal run lives in the fire band, the safe
run in the field, and the standings show which players lived where.

## Acceptance

- Flying parallel to the line inside the fire band produces `heat ≤ 0.25` sustained; turning to
  dive at the same distance raises it above 0.6 within 500ms. Distance did not change.
- Mote density is a pure function of band; no mote exists past the line.
- No text, label, arrow or numeral is drawn in the world anywhere in the boundary system.
- The death sequence contains no velocity vector that is not parallel to the craft's velocity at
  the line.
- A run that crosses the line and a run that releases perfectly both begin with an identical
  70ms hitstop.
- BANK's displayed value is unchanged from the frame before death to the frame after; only its
  colour changes.
- Fuel at zero produces a fully-DUSK deadline window and no possible save; fuel at 100% lights
  the whole window. The window's drawn geometry is identical in both cases.
