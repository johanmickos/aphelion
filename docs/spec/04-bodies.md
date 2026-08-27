# 04 · Bodies

**Board**: [Direction 04 — Planet Language](../design/Aphelion%2004%20-%20Planet%20Language.dc.html).

**Rulings applied**: a **held** body is E2 and alive; it goes DUSK only after release — this
board corrects [Direction 01](../design/Aphelion%2001%20-%20Tokens%20%2B%20Compass.dc.html)
explicitly, and Direction 01 lost. Bodies are named by **hue in the run and address in the
retelling**; the `P11`-style chips on boards 01–03 are retired. The board's "NEXT, IN ORDER"
footer uses obsolete numbering and is void.

**Depends on**: [00 · Tokens](./00-tokens.md) for the identity-hue rule and the energy steps.

---

## 1 · Anatomy

A body is a lamp, not a rock: flat vector anatomy that emits its own identity. No gradients, no
terminator, no implied depth. The world is side-on and has no light source to shade from.

| Part | Geometry | Colour | Notes |
|---|---|---|---|
| Disc | Filled circle, radius = the body's radius | `#100C20` | Never brighter than the craft |
| Rim | Stroke on the disc edge, **2.5px** | Identity hue | Always on. The same hue its compass window wears, so target and window need no legend |
| Tide | Arc on the rim, **4px** | Identity hue at high lightness | The bright limb segment that always faces the craft. See §2 |
| Strata | Concentric internal rings at 0.68r and 0.39r | Identity hue at α 0.22 and 0.14 | Structure without texture |
| Core | Filled dot at centre, r = 0.08 × body radius | Identity hue at α 0.55–0.8 by state | The **type slot** |

**Scale rule**: rim 2.5px and tide 4px are constant in design px **regardless of body radius**.
Small bodies read as bright rings; giants as thin luminous horizons.

**Mass is size; nothing else changes.** Mass is not encoded in hue, brightness, or any glyph.

## 2 · The tide

The tide is the gravity vector drawn on the thing that owns it.

| Property | Value |
|---|---|
| Position | Centred on the bearing from the body to the craft |
| Angular half-width | **±0.3 rad** (≈17°) at reference mass; scales with mass — see below |
| Tracking | Follows the craft's bearing with a first-order lag, coefficient **k ≈ 6 /s** |
| Inner ripple | One stratum ring tracks the tide at **0.6 × k**, at α 0.3 |
| Range | Present on every body within grab range; absent beyond it |

**Scaling with mass**: a heavier body reaches with a **longer, brighter, tighter-tracking** tide
— longer arc, higher α, larger lag coefficient. Gravity strength is read at a glance, with no
gauge. The exact mapping from mass to (arc, α, k) is set in M1 alongside the gravity model
(spec [01](./01-swing.md)); the three must move together and monotonically with mass.

On press, the tide flares into the **grab filament** — the line drawn from the craft to the body
(spec [00](./00-tokens.md), compass state 1). While the craft orbits, the tide races around the
rim underneath it.

## 3 · The four states

A body is always telling the player its relationship to them.

| State | Rim | Tide | Strata | Core | Energy |
|---|---|---|---|---|---|
| **AHEAD** | Identity hue at 40% | absent | α 0.10 | α 0.30 | E0–E1 |
| **IN REACH** | Identity hue at 85%, 2.25px | present | α 0.18 | α 0.50 | E1 + tide |
| **HELD** | Identity hue at 100%, 2.5px | present, racing under the orbit | α 0.30 | α 0.80 | **E2 — alive** |
| **SPENT** | DUSK at 50%, 1.5px | absent | DUSK α 0.14 | hollow, DUSK stroke | DUSK, no bloom |

**HELD is E2 and alive.** The compass draws itself around this glow. The lamp goes out at
**release**, not at grab: rim to DUSK, core hollow, tide gone. Its light did not vanish — it
moved into the chain, and the craft's bloom is 4px wider for it.

A field of spent bodies behind the craft is the run's scoreboard, drawn in the world.

The AHEAD → IN REACH transition is the grab-range predicate from spec [01](./01-swing.md). The
field ahead must read as a constellation of dim coloured rings, never a row of grey balls.

## 4 · Types

One anatomy, one variable each. The core is the type slot, and the compass ring wears the
matching miniature (spec [00](./00-tokens.md) §6), so a body met once is recognisable in the
instrument before it is on screen.

| Type | Variable | v1 |
|---|---|---|
| **STANDARD** | One core | **Ships** |
| BINARY | Twin cores, plus a flat ellipse between them | designed for, not built |
| PULSAR | Core beats; two beam ticks on the vertical axis | designed for, not built |
| RINGED | Flat band across the disc — no tilt, no depth | designed for, not built |
| BLACK HOLE | No core; disc filled true `#000000`; rim and dashed outer echo in **AURORA** | designed for, not built |

**Only STANDARD ships in v1** (ADR-0005, and plan/README: difficulty comes from geometry first,
so that when types arrive there is something to measure them against). The type field exists in
the day recipe (spec [17](./17-daily-field.md)) from the start, so adding a type is a data change.

The black hole is the one exception to the identity-hue band: it wears AURORA, because violet
means *the rules are different here*. It belongs to the anomaly and to the bodies that should not
exist, so the player learns one association.

## 5 · Naming

**Doctrine: in the run, a body's name is its colour; in the retelling, it is its altitude.**

- **Address** is an integer assigned bottom-to-top within a day, so every player's "23" is the
  same body that day (spec [17](./17-daily-field.md)).
- In-run, an address chip is shown in **exactly one case**: two live targets too close in hue to
  tell apart. It is small, utility-face and chip-bound. Nothing ever floats loose near a body.
- Post-run, addresses own the stage: debrief, results, route, standings and shared recipes.
- **Authored names** (`KILN`, `HARROW`) are reserved for adventure regions' signature bodies and
  are not used by the daily field.

`P11`-style telemetry labels are retired everywhere, along with the label-collision behaviour
they caused.

## Acceptance

- Rendering a body at radius 20 and at radius 200 produces identical rim and tide stroke widths
  in design px.
- A body transitions AHEAD → IN REACH → HELD → SPENT and back to nothing, and no transition
  changes its hue.
- On the tick of grab, the body's energy is E2. On the tick of release, and not before, it is
  DUSK.
- With the craft orbiting at constant rate, the tide bearing lags the craft bearing by a bounded,
  non-zero angle.
- An address chip appears in a run only when two bodies in reach are within the hue-tie
  threshold; a day generated per spec [17](./17-daily-field.md) produces zero such chips.
