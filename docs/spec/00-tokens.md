# 00 · Tokens and the compass

**Board**: [Direction 01 — Tokens + Compass](../design/Aphelion%2001%20-%20Tokens%20%2B%20Compass.dc.html).
The board is canonical for appearance; this file is canonical for the numbers (ADR-0002).

**Rulings applied**: award vocabulary is TRUE / SHARP / PERFECT plus an unnamed make — the
board's DEADEYE / SHAVED / CLEAN is retired (Direction 06 rev 2); the display face is **Anton**,
not the board's Unbounded; the `P11`-style chips on the board are retired — a body is named by
hue in the run and by address in the retelling; a **held** body is E2 and alive, and goes DUSK
only after release (Direction 04 corrects this board explicitly); the board's "NEXT, IN ORDER"
footer uses obsolete numbering and is void.

---

## 1 · Palette — eight names, eight meanings

Every colour in the game is one of these eight. Nothing is mixed, tinted or invented at
draw time except through the alpha and bloom rules below.

| Token | Hex | Meaning | May appear on |
|---|---|---|---|
| VOID | `#0A0814` | The sky | The sky, and nothing else |
| DUSK | `#6C64A6` | Structure, unlit | Rungs, rings at rest, spent bodies, secondary data |
| AURORA | `#9D6BFF` | Strange | Anomaly sky, black holes, farewell rings |
| ION | `#FF5FA2` | Risk | Boundary gradient and line, boundary motes, deadline track, fuel halo when low, burn trail |
| CORE | `#FFF4E0` | The player | Craft, trail, hand, TRUE callout type |
| LUMEN | `#7FE0A8` | Quality (mid) and sanctuary | SHARP callout type; the finish system (carpet, chevrons, checkered line, carpet dots) |
| SOLAR | `#FFC94A` | Quality (top) | PERFECT callout type and its `×N`; results-sheet headline |
| INK | `#EDEAF7` | Utility text at full strength | Data, labels, chips. Never blooms |

Derived surfaces, not palette entries:

- **Body fill** `#100C20`. Every body's disc. Never brighter than the craft.
- **True black** `#000000`. Permitted in exactly two places: the gaps between anomaly clouds,
  and the disc of a black hole. Nowhere else, so the anomaly reads deeper than ordinary space.

Two monopolies, both absolute:

- **ION in the world** is risk only — the boundary, the deadline track, low fuel, the burn
  trail. Nothing else in the world glows pink, so peripheral vision alone distinguishes
  "near bodies" from "near the end of the world".
- **LUMEN in the world** is the finish system only. Nothing else in the world is green.

Quality colours (LUMEN, SOLAR) live **only in type**. No body, ring, gauge, mote or terrain
feature ever wears them, except the finish system's LUMEN monopoly. Geometry and typography
never share the colour channel.

## 2 · Identity hues

A body's hue is its identity, is assigned once, and never changes for any reason.

Generated at `oklch(0.72 0.13 H)` — fixed lightness and chroma, so every identity is equally
loud. Neighbouring bodies (adjacent addresses) differ by **H ≥ 50°**.

Reserved hue windows, excluded from generation (oklch H of the reserved token, ±20°):

| Reserved | oklch H | Excluded window |
|---|---|---|
| SOLAR | 85.0 | 65.0 – 105.0 |
| LUMEN | 157.1 | 137.1 – 177.1 |
| AURORA | 295.5 | 275.5 – 315.5 |
| ION | 357.7 | 337.7 – 17.7 |

Additional hard stop: generated blues stop at **H = 265°**, short of AURORA.

Exemplar slots printed on the board: ember 55° · teal 170° · azure 215° · blue 265°.

One exception, by decree: **black holes wear AURORA**, because violet means the rules are
different here.

> **Open — the teal slot.** The board states both "greens sit at teal, ≥20° clear of LUMEN"
> and "teal 170°". LUMEN sits at oklch H 157.1, so the printed teal slot is 12.9° clear, not
> 20°. One of the two numbers is wrong and the board does not say which. Until it is ruled:
> generate from the ±20° windows above and treat the printed exemplars as illustration.
>
> **Flagged for the colour-vision sweep** (§2a), which will move these numbers anyway.

### 2a · Colour vision — a sweep, not yet a rule

**Flagged, 2026-08-27, for a dedicated pass.** Hue is this game's identity channel, and hue is the
one channel colour-vision deficiency compresses. The palette and the ≥50° separation rule above
were chosen for *distinguishability by a trichromat*, and have not been checked against anything
else.

What the sweep must check, when it runs:

| Surface | The risk |
|---|---|
| Identity hues | 40 hues at ≥50° oklch separation collapse toward two axes under deuteranopia and protanopia. The effective separation under simulation is what matters, not the nominal 50° |
| The callout ladder | CORE white → LUMEN green → SOLAR gold. Green-against-gold is the classic red-green confusion, and these are the words that say how well you flew |
| ION against identity | ION at oklch H 357.7 against the ember end of the identity band, in the fire band, where being wrong is expensive |
| LUMEN against identity | The finish system against jade and teal identities, at the moment the run is won |
| The reserved-window widths | ±20° may not be enough separation once simulated |

What already mitigates it, and must be preserved whatever the sweep concludes:

- **Brightness is the only ordinal channel** (§3). Quality never depends on hue alone — the tiers
  differ in type scale and bloom as well as colour, and every "better" in the game is *brighter*.
- **ION and LUMEN hold world monopolies** (§1), so risk and sanctuary are identifiable by
  *position and behaviour* — the boundary is at the boundary, the carpet is at the top — before
  colour is consulted.
- **The band multiplier is now labelled in the world** (spec [07](./07-boundary.md) §2), so the
  most expensive colour judgement in the game has a text fallback.
- **Body type is a glyph** (§6), not a hue, so the extension path is already non-chromatic.

The sweep may change palette values, the separation rule and the reserved windows. It may not
change the grammar: hue stays identity, brightness stays quality.

## 3 · Energy — the ordinal channel

Brightness is the only ordinal channel in the game. Nothing ever changes hue to mean "better".

| Step | Name | Bloom | Used by |
|---|---|---|---|
| E0 | STRUCTURE | none | Rungs, rings at rest, dust, spent bodies |
| E1 | LIT | 6px @ 35% | Active compass windows, body rims, labels |
| E2 | HOT | 18px @ 60% + white core | Craft baseline, a window under live aim, the dot when matched, a held body |
| E3 | FLASH | 48px, additive, 400ms decay | Release, grab, award, the checkered line at the crossing |

**Only one E3 may be alive at a time.** A new E3 replaces the old one; it does not stack.

**Chain adds bloom.** Each chain link adds **+4px** to the craft's E2 bloom radius. A hot run is
visibly hotter, in radius, never in hue.

## 4 · Type

| Role | Face | Weight | Notes |
|---|---|---|---|
| Display — velocity, mode titles, headline numbers | **Anton** | 400 | Tracked 0.03em. Masthead and cards only |
| Utility — data, labels, telemetry, chips | Archivo | 400–800 | Tracked caps do the instrument work |
| Callouts — TRUE / SHARP / PERFECT and their points | Archivo | 800 | Tracked 0.1em caps. Moving text needs open counters, so the display face is banned here (Direction 06) |

Nothing in the game is set in a monospace face.

## 5 · Motion

| Token | Value |
|---|---|
| ENTER | 120ms, `cubic-bezier(.2, 1.6, .3, 1)`, from 92% scale |
| DECAY | 420ms exponential |
| HITSTOP | 70ms world freeze, at grab and at release |
| KICK | Camera 6px along the exit tangent at release, home in 180ms with one overshoot; 3px reversed (into the orbit) at grab |
| Persistence | Nothing persists past 600ms except the trail |

Two rules govern everything that moves:

1. **Attack ≤ 2 frames; decay ≥ 10 × attack.** Things arrive; they do not fade in.
2. **All streaks are parallel to velocity.** Nothing radiates from a point, ever. The game is
   side-on and implies no depth.

The camera is never rotated, never shaken and never randomised. A shake would say "damage";
this game has no damage, only commitment.

## 6 · The compass

The compass is the coloured windows drawn on the orbit path around a body: where the craft will
go if it releases now, and how good that aim is before it does.

### Elements

| Element | Geometry | Energy |
|---|---|---|
| Rings at rest | One concentric ring per reachable body, centred on the held body | E0, DUSK |
| Window | An arc on the ring belonging to one reachable body, in that body's identity hue | E1 at rest, heating to E2 under live aim |
| Dot | The point at the centre of a window — a perfect release | E1 at rest, CORE white when matched |
| Hand | The radius through the craft, extended outward past the outermost ring | E1, thickening and brightening as aim closes |
| Ghost | One dot per ring crossed by the hand; the active ring's is the brightest | E1–E2 |
| Trail | The arc of orbit already flown, on the orbit path | E2 |
| Label | A chip at its window's tip, on its own ring | INK on VOID at 88% |

### Behaviour

- **Window width encodes difficulty.** A narrow window is a harder release and, because the
  tier zones scale with the window (spec [06](./06-awards.md)), automatically a better-paid one.
  The arc's width is the posted odds.
- **A window's hue never changes.** It heats in place: E1 → E2 as the hand closes on the dot.
- **The gap between ghost and dot is the grade**, drawn on the geometry. It is a fact, never a
  command.
- **Labels never collide** because no two labels share a ring. If two window tips come within
  **12°**, the outer label slides along its own ring until clear.
- **The nose points along the exit tangent** for the whole orbit. The nose says *where*; the
  hand says *when*.

### The five states of one swing

| State | What is drawn |
|---|---|
| 1 · PRESS | The grab filament: a line from the craft to the body pulling hardest, in that body's identity hue. Its orbit fades in |
| 2 · ORBIT | Windows at E1, hand thin, crossing dots quiet. The instrument is at rest |
| 3 · CLOSING | Ghost approaches the dot; the hand thickens; the window under the hand heats toward E2 |
| 4 · MATCHED | Ghost and dot merge, CORE white. The player knows the tier before letting go |
| 5 · RELEASE | E3 flash, 70ms hitstop, exit streak along the tangent. The taken window stays lit and decays behind; the unused rings die instantly. The compass resolves — it does not vanish |

### Body-type glyphs

Body type is a glyph on the ring and its dot, matching the glyph the body itself wears
(spec [04](./04-bodies.md)). Standard: a plain dot. Binary: twin dots. Pulsar: a dot that beats.
Black hole: a hollow dot with an inner dashed echo. Ringed: a doubled ring line.

Only STANDARD ships in v1 (ADR-0005, plan/README). The glyph slot exists so that a later body
type is a data change, not a redesign of the instrument.

## 7 · Layout

The design space is **1170 × 2532** — a phone held in portrait (ADR-0010). Everything the player
reads is drawn in world space in design coordinates, so the composition is identical on every
device and nothing lands on a letterbox bar. DOM is developer chrome only.

**The thumb line** sits at **2/3 of the screen height**. Nothing readable may live below it,
ever. The compass, the masthead and every award live above it.

## Acceptance

- Every colour drawn by the renderer resolves to one of the eight palette tokens, the body fill,
  or true black; a lint over the render layer finds no other literal.
- Generating 40 identity hues for one day yields no hue inside a reserved window, and no two
  adjacent addresses closer than 50°.
- Every ordinal distinction in the game survives converting the frame to greyscale: tiers, energies,
  bands and chain remain rankable. Identity does not, and is not expected to.
- Bloom radius is a pure function of energy step and chain length; no code path sets bloom from
  a hue.
- Two window tips placed 10° apart produce labels that do not overlap.
- At most one E3 is alive on any tick.

## Open

- The teal identity slot (§2).
- The colour-vision sweep (§2a) — flagged, not scheduled. It has authority over every hue value and
  every separation number in this spec, and none over the grammar.
