# 03 · The HUD — one layout, five pressures

**Board**: [Direction 03 — HUD Five Pressures](../design/Aphelion%2003%20-%20HUD%20Five%20Pressures.dc.html).

**Rulings applied**: the display face is **Anton** — this board contested it and Direction 06
settled it, so the board's Unbounded/Space Grotesk comparison is decided, not open. The board's
`P11` / `P12` / `P15` chips are retired; a body is named by hue in the run and address in the
retelling (Direction 04). The board's `+445 ON RELEASE` is a stale absolute from a superseded
scoring model — the behaviour survives, the number does not.

**Board that lost**: this board draws a `×3` multiplier label in the world next to the boundary
motes. [Direction 07](../design/Aphelion%2007%20-%20Boundary.dc.html) forbids it outright —
*"No multiplier labels in the world, no arrows, no 'RISK ZONE' text. The glimmer is the
signpost."* Direction 07 is the later board and it is arguing this exact point. **There is no
band label in the world.**

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
| **4 · BOUNDARY** | The ION gradient scales with **closing speed**, not proximity. Boundary motes glimmer in the outer bands. Fuel halo has gone ION. Velocity subline reads `M/S · TOWARD EDGE` in ION |
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

## 6 · Off-screen bodies

A body outside the viewport that is within the run's reach is drawn as a **dot on the screen
screen edge in its identity hue**, at E1. No label, no arrow, no distance number, and no
collision resolution between them — they may overlap.

## Acceptance

- A screenshot of any of the five states, with the bottom third masked, loses no readable
  element.
- The top band contains exactly two readable elements in every state.
- The BANK chip's opacity is a pure function of engagement; toggling coasting toggles it and
  nothing else.
- No band multiplier, risk label, arrow or instruction text is drawn anywhere in the world.
- The deadline window's drawn length is independent of fuel; only its lit fraction depends on
  fuel. A test at 0%, 50% and 100% fuel finds three identical geometries and three different lit
  fractions.
- Entering an anomaly changes zero HUD properties other than chip background colour.
