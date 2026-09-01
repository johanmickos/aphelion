# 07 · The boundary

**Board**: [Direction 07 — Boundary](../design/Aphelion%2007%20-%20Boundary.dc.html).

**Rulings applied**: **ION is monopolised in the world, not on the craft.** Fuel, the deadline
track and the save trail all wear pink legitimately; nothing else in the world does.

**Author ruling, 2026-08-27**: this board's second law said *"reward is shown, never spoken"* and
refused [Direction 03](./03-hud.md)'s in-world `×3` band label. **That refusal is overturned.**
In-world multipliers and boost labels are in — the game stays arcade-like, and what rewards the
player is obvious. Direction 03 wins this one against the higher-number convention, by ruling.

**Depends on**: [00 · Tokens](./00-tokens.md), [13 · Fuel](./13-fuel.md),
[08 · Economy](./08-economy.md), [09 · Debrief](./09-debrief.md).

---

> ## ⚠ Built, 2026-09-01 — the bands, and only the bands
>
> **§1, §2, §3 and §7 are built** ([M3.4](../plan/m3-the-field.md)): the three laws, the two bands
> and their dashed edges, the gradient, the motes, the labels, the line, and the AURORA a shelter
> paints them in. `src/state/boundary.ts` holds the geometry and the law and
> `src/render/boundary.ts` the paint, split the way `rung.ts` and `rungs.ts` are.
>
> **§4, §5 and §6 are not, and the reason is an ordering rather than an omission.** The **save** is a
> press that carves the craft back into the field, so it changes what a tick does with a press — it
> moves `SIM_VERSION`, and the parked camera session's only evidence is the dispatch corpus that a
> bump deletes. Spec [05 · §5](./05-field.md) already carries the ordering this obeys: M3.4, M3.5,
> M3.6, the camera, M4's fuel, and then the anomaly in one deliberate bump. The **deadline track**'s
> dot is *"the last press that can still save the run"* and there are no saves to be last among, so
> it waits on the same bump. The **debrief card** is M6's.
>
> **What the projection turns out to be, settled and free.** §4's track is drawn on the craft's own
> projected line, and `predictOrbit` draws a conic for a bound craft. A craft leaving the field is
> **coasting**, and a coasting craft *"feels nothing, from anything, at any distance"*
> (`CONTEXT.md`) — so its projected line is a **straight ray**, exactly, and the track costs one
> intersection with no integration at all. Measured over the 18 replayable dispatches: **all 81
> fire-band ticks and both out-of-bounds deaths happened while coasting**, and the closest a craft
> holding a body has ever come to the line is 91 m — outside the fire band entirely. The conic case
> does not arise.
>
> ### `K` is 640 m/s, and the board's own 120 could not cross
>
> §3 says only *"tuned on the phone"*. Direction 07's live component runs this exact formula at
> `closing / 120` with `closing` in board pixels per second, and board pixels are metres here — but
> carried at face value the closing term reaches 1.75 at the **median dive this game flies**, past
> the cap before proximity applies. Every dive would be identical and maximal. What crosses instead
> is the board's **ratio**: re-run headlessly at its authored default its demo craft dives at up to
> 83 against a `K` of 120, so its fastest dive lands at **0.69 K**. Applied to the fastest closing
> ever flown at this boundary — **442 m/s** — that is 639.
>
> The acceptance below caps it independently at **807**, from its weakest case: a median flown dive
> (210 m/s) clearing 0.6 at the fire band's shallowest point. A value derived from the board and a
> ceiling argued from this spec agree from opposite directions, and 640 sits inside it with margin.
>
> ### ⚠ The first acceptance criterion is unsatisfiable inside 40 m, and `K` is not why
>
> *"Flying parallel to the line inside the fire band produces `heat ≤ 0.25` sustained."* At zero
> closing the formula returns `0.10 × (1 + 60/d)`, which passes 0.25 at **d = 40 m** — with no
> closing speed at all and whatever `K` is. The fire band starts at 90 m, so the criterion holds over
> its outer 56% and is false over its inner 40 m by the proximity term alone. That is a property of
> the formula this section states, not of anything tuned. It is asserted where it can hold and
> recorded where it cannot; **the ruling is the author's.**
>
> ### ⚠ The boundary is **absent** until the craft goes out to the wall (author, 2026-09-01)
>
> *"The boundary SHOULD be off screen for majority of play, and the warning ion glow should only
> activate when they approach and then learn that it's a danger zone. I don't want to signal danger
> during normal gameplay, only when the ship is along the edge (outside of the default viewport)."*
>
> This is a **second channel beside `heat`**, and §3 does not have it: `heat` says how hard the craft
> is diving at a line, and **presence** says whether the line is part of the conversation at all.
> Zero while the craft is inside spec [00 · §7](./00-tokens.md)'s default viewport, ramping up over a
> fire band's depth of travel beyond it, per side. At zero **nothing is drawn** — not a dimmed
> gradient, not a faint dash.
>
> The same ruling closes the *"the boundary is off screen on a phone"* question the other way round:
> the corridor being wider than the picture is deliberate, and *"opens up the room for ambiguity and
> exploration"* — racing one wall costs you sight of the other. §2's geometry is unchanged.
>
> **What was actually signalling was §2's dashed band edge**, not §3's gradient. At the picture's edge
> the gradient is at α 0.0095 and invisible; the dash at `line − 220 m` sits inside the picture at
> α 0.25 and, by §2's own rule, does not scale with heat — so it drew down both sides of the screen
> for the whole of every run. Measured after: the boundary draws on **3.4% of frames** across the
> author's replayable dispatches.

> ### ⚠ Two wordings taken a particular way
>
> - §2's label anchor says *"~14 **design** px"* where the row above says the type is *"9px"*. Read
>   literally the offset is 4.7 board pixels — half the height of the type it offsets — so the label
>   would sit on the mote it captions. It is carried at `BOARD_PIXEL` like every other board number.
> - §2's label row says the label *"rises with `heat` exactly as the gradient and the motes do"*, and
>   the gradient rises from **nothing** — so read literally the motes go out whenever the edge is
>   calm, which is the one moment a **price tag** most needs to be readable. Direction 07's own motes
>   do not scale with heat at all. They rise from a floor instead (`MOTE_AT_REST`, an opening
>   position on the bench), which is neither reading and is where the author settles it.
>
> ### ⚠ And §5's debrief line says `SKIMMED THE RIGHT WALL`
>
> `CONTEXT.md` lists **wall** under *_Avoid_* for both **boundary** and **line**. The line is spec
> [06 · §8](./06-awards.md)'s to assemble and M6's to build; it is flagged here so it is decided
> rather than copied.

---

## 1 · The three laws of the boundary

1. **Intensity = closing speed, not proximity.** Coast along the outer band and the boundary glows
   softly — the player can live there. Dive at it and it flares. A barrier reacts to where you are;
   a risk reacts to what you are doing.
2. **Reward is shown *and* named.** Boundary motes drift in the outer bands, denser and brighter
   deeper in, and each band carries its multiplier as a label. The glimmer is the signpost; the
   label is the price. What is still refused is **instruction**: no arrows, no "RISK ZONE", no
   "TURN". A band states what it pays and lets the player price the trade (§7).
3. **The line is the only absolute.** Bands are negotiable; the line is not. Past it, physics
   stops negotiating too. That stake is the game's one deliberate cruelty.

## 2 · The bands

Measured inward from **the line**, in world metres. Positions are drawn in world space; the
gradient never sits on the screen edges, so it reads as geography rather than as a vignette.

| Band | Extent | Band multiplier | Motes | Label |
|---|---|---|---|---|
| **THE FIELD** | deeper than 220 m from the line | **×1** | none | none — ×1 is the default and needs no sign |
| **OUTER BAND** | line − 220 m … line − 90 m | **×2** | sparse, α ≈ 0.25–0.55, r ≈ 1.6–2.4px, no bloom | `×2` |
| **FIRE BAND** | line − 90 m … the line | **×3** | dense and bright, α ≈ 0.55–0.85, r ≈ 2.4–3.0px, 5px bloom | `×3` |
| **GONE** | past the line | — | **absent — even the reward stops promising** | none |

Motes drift at world speed, strictly parallel, like dust.

### The band label

Taken from [Direction 03](../design/Aphelion%2003%20-%20HUD%20Five%20Pressures.dc.html)'s boundary
state, which is where the label was drawn. **The label captions a mote — it does not label the band
as a region.** The mote is the reward; the label says what that reward is worth. That keeps it
inside VISION pillar 6's rule that every good cue is drawn on the thing it describes.

| Property | Value |
|---|---|
| Content | `×2` or `×3`. The multiplier, and nothing else |
| Type | Archivo **700**, 9px, tracked 0.1em |
| Colour | **ION**, at E1 |
| Anchor | **A mote.** The label sits ~14 design px directly above the mote it captions, and travels with it at world speed |
| Which mote | **One label per band in frame**, on the band's topmost mote — the one the craft is climbing toward. When that mote leaves the top of the viewport, the label transfers to the next mote up |
| Behaviour | Rises with `heat` (§3) exactly as the gradient and the motes do — it is part of the band, not an overlay on it |
| Never | Animated on its own, never pulsed, never enlarged to draw attention. It is a price tag, not a prompt |

The band multiplier prices a swing's cash (spec [08](./08-economy.md)), and it is now printed where
it is earned — the label *is* axiom 5's pixel, alongside the mote it sits on.

### Band boundaries

The two band boundaries are drawn in world space as **dashed vertical ION lines**, 1px, dash 4/6:
`line − 220 m` at α 0.25 and `line − 90 m` at α 0.40. They come from Direction 07's own live
component, and they are what makes the bands read as three named regions rather than one smooth
ramp — which the ruling in the header requires. They do not scale with `heat`.

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
- what they pay — mote density, **and the band's own label**;
- how fast the craft is closing — bloom;
- when saving stops being possible — the deadline dot.

Naming the price is still stating a fact. The line the design holds is between a **fact** and an
**instruction**: `×3` is a fact. An arrow, a `RISK ZONE` banner, or anything that says *turn* is an
instruction, and those stay refused (`VISION.md`, pillar 4).

The bands also make the score-chase **spatial**: the optimal run lives in the fire band, the safe
run in the field, and the standings show which players lived where.

## Acceptance

- Flying parallel to the line inside the fire band produces `heat ≤ 0.25` sustained; turning to
  dive at the same distance raises it above 0.6 within 500ms. Distance did not change.
- Mote density is a pure function of band; no mote exists past the line.
- Each band in frame shows exactly one multiplier label, anchored to a mote, legible against the gradient at maximum `heat`. Scrolling the band past the viewport transfers the label rather than duplicating or dropping it.
- The two band boundaries are drawn as dashed lines at the stated distances and do not move with `heat`.
- No arrow, banner or instruction text is drawn in the world anywhere in the boundary system.
- The death sequence contains no velocity vector that is not parallel to the craft's velocity at
  the line.
- A run that crosses the line and a run that releases perfectly both begin with an identical
  70ms hitstop.
- BANK's displayed value is unchanged from the frame before death to the frame after; only its
  colour changes.
- Fuel at zero produces a fully-DUSK deadline window and no possible save; fuel at 100% lights
  the whole window. The window's drawn geometry is identical in both cases.
