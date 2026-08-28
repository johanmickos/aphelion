# 03 · The HUD — one layout, five pressures

**Board**: [Direction 03 — HUD Five Pressures](../design/Aphelion%2003%20-%20HUD%20Five%20Pressures.dc.html).

**Rulings applied**: the display face is **Anton** — this board contested it and Direction 06
settled it, so the board's Unbounded/Space Grotesk comparison is decided, not open. The board's
`P11` / `P12` / `P15` chips are retired; a body is named by hue in the run and address in the
retelling (Direction 04). The board's `+445 ON RELEASE` is a stale absolute from a superseded
scoring model — the behaviour survives, the number does not.

**Board that lost**: this board draws a `×3` multiplier label in the world next to the boundary
motes; [Direction 07](../design/Aphelion%2007%20-%20Boundary.dc.html) forbids it outright —
*"No multiplier labels in the world, no arrows, no 'RISK ZONE' text. The glimmer is the
signpost."*

**Author ruling, 2026-08-27 — Direction 07 lost.** In-world multipliers and boost labels are **in**:
*"I want to keep it arcade-like and obvious what rewards you."* The later board does not win this
one. The band carries its multiplier as a label in the world (spec [07](./07-boundary.md) §2), and
anything the field pays says what it pays, where it is.

**Depends on**: [00 · Tokens](./00-tokens.md), [13 · Fuel](./13-fuel.md), [07 · Boundary](./07-boundary.md).

---

## 1 · The frame

Design space **1170 × 2532** (ADR-0010). Everything is drawn in world space in design
coordinates. The layout never changes between states; only the pressure does.

**The bottom third belongs to the thumb.** Nothing readable lives below y = 1688 (2/3 of 2532),
in any state, ever.

The top band holds **exactly two readables**: the velocity masthead and the BANK chip.

## 2 · The five readouts

| Readout | Position | Face | Behaviour |
|---|---|---|---|
| **Velocity** | Top-left, masthead | Anton, largest type in the game | The headline. Governs every grab, release and boundary call. Earns zero points (spec [08](./08-economy.md)). Digits pop to 120% on a release and settle in 180ms; the value never lies |
| **Velocity subline** | Under velocity | Archivo, tracked caps | States the current fact: `M/S`, `M/S · RISING`, `M/S · TOWARD EDGE`. ION when the subline is about the boundary |
| **Chain** | Under the subline | Archivo 600, tracked | `CHAIN ×N`. Also physically visible as the craft's bloom radius (+4px per link) |
| **BANK** | Top-right chip | Archivo 600, tracked | Dims to **55%** while coasting — earning nothing, losing nothing, a fact not a scold. While a graded release is armed it states the armed cash value on a second line |
| **Fuel** | On the craft | — | A halo arc around the craft that doubles as a light source. Not a corner gauge. See [13 · Fuel](./13-fuel.md) |

Awards are **not** in the HUD. They are drawn in world space at the compass dot that earned them
(spec [06](./06-awards.md)).

## 3 · The five pressures

One layout, five states. Nothing moves between states; only energy and content change.

| State | What changes |
|---|---|
| **1 · FREE FLIGHT** (coasting) | BANK at 55%. Bodies in range show a lit rim and a tide facing the craft. Off-screen bodies are screen-edge dots in identity hue — no labels, no collision handling. Fuel halo present |
| **2 · HELD** (the board calls this state CAPTURED) | The compass at rest: windows E1, hand thin, crossing dots quiet. The whole instrument sits above the thumb line. During a hold the thumb covers only trail the craft has already left. BANK at full |
| **3 · PEAK** (near release) | Hand closes on the dot; window E2; hand thick; ghost bright. Velocity heats to CORE. BANK states the armed value — a fact, not an instruction to release |
| **4 · BOUNDARY** | The ION gradient scales with **closing speed**, not proximity. Boundary motes glimmer in the outer bands, one per band **captioned with its multiplier** (spec [07](./07-boundary.md) §2). This board is where that label is drawn, and it is canonical for it. Fuel halo has gone ION. Velocity subline reads `M/S · TOWARD EDGE` in ION |
| **5 · ANOMALY** | **Nothing about the HUD changes.** The world changed, not the instruments. Chip backgrounds go true black so labels hold against the curtains |

## 4 · Severity states

One hue, three energies. The prototype's yellow-low / red-empty / red-skull ladder is retired:
yellow would add a fourth meaning to hue, and severity is ordinal, so it rides the energy channel
like everything else.

| Severity | Trigger | Presentation |
|---|---|---|
| LOW | Fuel ≤ 25% | Fuel halo is ION and breathes at **0.8Hz** with a soft outer ring. The percentage number is the label — no icon, no banner |
| EMPTY | Fuel = 0 | The halo hollows to DUSK structure — spent, like a taken body — while an ION ring strobes at **2Hz**. The craft itself never dims: the player stays the brightest thing alive |
| CRITICAL | On an out-of-field trajectory | The deadline track (§5), plus `SOS` in ION strobing at the craft at **2Hz** once the last press is missed, until the burn-up |

There is no skull. A skull judges; `SOS` states a fact.

## 5 · The deadline track

**The deadline is the compass inverted.** Green windows on orbits say *release here*; the ION
window on the craft's own projected line says *a press here still saves you*, and its dot is the
last press that can. Same window-and-dot grammar the player already reads — which also teaches
that the press is steering, before the first orbit ever forms.

| Property | Rule |
|---|---|
| Where | Along the craft's own projected line, in world space |
| When it appears | On a trajectory that leaves the field. It fades in over 300ms |
| The window | Drawn at its **true physical size**, always |
| The dot | At the far end of the window: the last press that can still save the run |
| Past the dot | The projected line goes **dashed** — the future thins out |
| Fuel coupling | **By luminance, never geometry.** Only the fraction of the window the tank can afford stays lit. Half a tank lights the early half; an empty tank shows the whole window in DUSK. A moment exists, and you cannot buy it |

Nothing on the track tells the player what to do. It states four facts and lets the player price
the trade.

## 6 · Sightings — the bodies the picture cannot show

A body outside the picture and within reach is drawn as a **mark on the edge of the picture in
its identity hue** — `CONTEXT.md`'s **sighting**. Direction 03 is canonical for the form and it is
a **dot, not an arrow**: the mark's *position* on the edge is the direction, so nothing has to
point. That is not a stylistic preference — an arrow is the instruction this spec's own acceptance
refuses, and a dot states the same fact without one.

No collision resolution between them; they may overlap.

| Property | Value | Kind |
|---|---|---|
| Form | A dot on the edge of the picture, in the body's **identity hue** | Direction 03 |
| Which bodies | Off the picture, ahead of the climb, and within reach | Direction 03 |
| Direction | The mark's position on the edge, never a drawn vector | Direction 03 |
| Distance | **Not carried.** Direction 03 rules no labels, and nothing replaces them | Direction 03 |
| Behind the climb | **Never drawn.** A mark below the craft points at somewhere it has already been, which is clutter and a suggestion to turn around | Carried |
| Already on screen | **Never drawn.** A mark pointing at a thing the player can see is clutter over the exact thing it was pointing at | Carried |
| When | **Always**, whether or not a body is held | Carried |

**They are how the game pays for a fixed width** (author, 2026-08-28). Spec
[00 · §7](./00-tokens.md) fixes the design *width* and lets the visible height flex, which buys a
full-size picture and costs field of view; sightings are what the lost view is replaced with, so
this section is not a decoration on §7's ruling but the other half of it.

**And they exist for the moments the compass cannot reach.** The compass needs an orbit, so it exists
only inside a swing; a sighting is the whole of what a coasting craft has to go on, and that is
exactly the long drift and the fast flyby — the moments when knowing where anything is matters most
(carried from the prototype, [ADR-0013](../adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)).
The [M1 gate measured the cost of not having them](../plan/m1-the-swing.md): over 877 releases that
reached another body, the body the craft next grabs is **outside the picture 12% of the time** as
the design space is fitted today, and **32%** under §7's ruled fit. A sighting is what that 32% has
to read instead.

**Two things the prototype has and this does not**, recorded with their evidence rather than left
to be re-derived — because the author's ask was *the role* and not the prototype's form: *"I don't
necessarily need the arrows and distances from the original; I was asserting that markers to
objects off-screen is the way we deal with the information loss of fixing the width"*
(2026-08-28). Direction 03's dot in identity hue is a complete answer to that, and it is what is
built.

- **Distance.** The prototype fades a marker with range — full strength at 200 units, a floor at
  1 600 — and prints the number beside it. Direction 03 refuses the label, and the fade has no
  replacement here: **brightness is the game's only ordinal channel** (spec
  [00 · §3](./00-tokens.md)) and hue is already spent on identity, so if a sighting ever needs to
  say how far, stepping its energy is the one answer that needs no label and breaks no rule. It
  says nothing about distance today, at a flat E1.
- **The body a press would take.** The prototype rings that one at full strength and **keeps the
  ring when the body comes into view**, moving it from the edge onto the body — *"the cue must not
  blink out at the moment the thing it points at comes into view, because that is exactly when the
  player is deciding."* Its evidence is a measured session: the craft was inside the grab window
  for **1.03s** and could see the body itself for **0.23s** of that. It is a fact about what the
  button would do rather than an instruction, so nothing refuses it — but the compass is about to
  be built over the same question, and this is worth revisiting once it exists rather than before.

**Reach is not yet a number.** *"Within reach"* is Direction 03's phrase and the prototype carries
an explicit range beyond which nothing is marked. What it should be here is spec
[17](./17-daily-field.md)'s to fix once a day has a length, and until then a sighting is drawn for
every body ahead.

## Acceptance

- A screenshot of any of the five states, with the bottom third masked, loses no readable
  element.
- The top band contains exactly two readable elements in every state.
- The BANK chip's opacity is a pure function of engagement; toggling coasting toggles it and
  nothing else.
- Each boundary band in frame shows exactly one multiplier label, captioning a mote.
- No **instruction** text — arrows, `RISK ZONE`, `TURN` — is drawn anywhere in the world. A label that states what a band pays is a fact; a label that tells the player what to do is not. **A sighting is held to the same line**: its position carries the direction and no vector is drawn, and none is drawn below the craft.
- The deadline window's drawn length is independent of fuel; only its lit fraction depends on
  fuel. A test at 0%, 50% and 100% fuel finds three identical geometries and three different lit
  fractions.
- Entering an anomaly changes zero HUD properties other than chip background colour.
- A body on screen has no sighting, and one behind the climb has none; the count of sightings is a
  pure function of the bodies, the camera and what the picture can show.
