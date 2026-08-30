# 04 · Bodies

**Board**: [Direction 04 — Planet Language](../design/Aphelion%2004%20-%20Planet%20Language.dc.html).

**Rulings applied**: a **held** body is E2 and alive; it goes DUSK only after release — this
board corrects [Direction 01](../design/Aphelion%2001%20-%20Tokens%20%2B%20Compass.dc.html)
explicitly, and Direction 01 lost. Bodies are named by **hue in the run and address in the
retelling**; the `P11`-style chips on boards 01–03 are retired. The board's "NEXT, IN ORDER"
footer uses obsolete numbering and is void.

**Depends on**: [00 · Tokens](./00-tokens.md) for the identity-hue rule and the energy steps.

---

> ## ⚠ Flown, 2026-08-29 — the tide narrowed, and one line of §2 is unbuilt
>
> **M2.2 built this file and the author flew it.** What moved:
>
> **§2 · The tide is on the body a press would take, or the one already held.** This section says
> *"present on every body within grab range; absent beyond it"*, which on a real field is most of
> them at once — flown, that reads as noise rather than as gravity. Narrowed to the same two the
> prototype narrows it to, with its reason: the tide is the body **reaching for you**, and the
> body reaching for you is the one a press would answer. §3's *"IN REACH: tide present"* is read
> against that.
>
> **§2 · The inner ripple is not built.** *"One stratum ring tracks the tide at 0.6 × k, at α
> 0.3"* is the one sentence in this file the prototype never implemented, and flown it was the
> first thing the author asked about: *"what's the purpose of the innermost ring within a planet,
> that also has a tide tracking my orbiting ship? It doesn't look great and I don't know why it's
> there."* The **strata** stay — §1's structure without texture, which the prototype has — and the
> thing that tracked is gone.
>
> **§2 · Both the tide's width and its brightness now depend on how near the craft is.** This
> section derives each from mass alone. Flown, that made a tide arrive at its full size and its
> full brightness the instant it appeared, whatever the distance. Two notes moved it: *"I'd love
> if they grew into their width based on my distance — a waterdrop effect when it first bubbles
> in"* and *"I also want the tide window to grow in brightness as I get near"* (author,
> 2026-08-29). Width is `TIDE_HALF_WIDTH_MAX · pull · (1 − GROWTH · (1 − grip))` and brightness is
> `pull + (1 − pull) · LIFT · grip`, both on the bench. **Mass still orders both** — at any fixed
> distance the heavier body has the longer and brighter tide, which is what this section is
> actually about; distance decides how much of that reach is showing.
>
> **§2 · The tracking is `k ≈ 30 /s`, and *"always faces the craft"* is now true enough to be
> worth saying.** This was open for two days: `CONTEXT.md` says the tide always faces the craft,
> §2 said `k ≈ 6 /s`, and the acceptance below asks that lag be *"bounded and non-zero"* — and
> built exactly as written the standing lag ran **wider than the arc's own half-width**, so the
> near edge never reached the bearing it is supposed to face. Flown, *"let's have the tide lag a
> bit less, i.e. follow the ship more closely"* (author, 2026-08-29), which settles it.
>
>
> **Five times the stated rate, and the taper is why it is that much.** The arc no longer burns
> evenly: it peaks on the bearing and fades to nothing at both ends, so what the eye reads as *the
> tide* is its **bright middle half** and not the whole span. Measured against the full arc,
> halving the lag looked sufficient and was not — *"it seems like we moved the wrong way, I want
> the tide to be more directly under the ship"* (author, 2026-08-29). Over a real 1 809-tick run:
>
> | `k` at the median | lag p50 | p90 | max | inside the bright core |
> |---|---|---|---|---|
> | 6 (as written) | 20.3° | 43.8° | 61.6° | — |
> | 12 | 9.0° | 21.9° | 35.1° | **11%** |
> | 20 | 4.6° | 11.6° | 20.3° | 71% |
> | **30** | **2.1°** | **6.0°** | **11.6°** | **91%** |
> | 45 | 0.5° | 2.3° | 5.4° | 100% |
>
> Thirty is the last row where the lag is still **there**. At 45 it is half a degree: the
> acceptance's *non-zero* survives as arithmetic and not as anything anyone can see, and §2's *"a
> heavier body tracks tighter"* stops being readable off the picture with it. At 30 the spot sits
> under the craft nine times in ten and a light body still visibly drags — the rate is scaled by
> the body's own pull, so a light one tracks at 18/s against a heavy one's 42. The table below
> still says 6; this notice is what is true.
>
> **§1's 4px is no longer a width the tide has.** *"Let's have it start at the same thickness as
> the planet surface ring, so that when I first approach I see it as a light spot on the surface.
> When I approach it grows and 'pulls' towards me"* (author, 2026-08-29). So the band grows out of
> the body's own edge: at the edge of a reach it **is** the rim, and at the surface it is twice
> §1's figure. It also tapers **along** its arc, from the peak on the bearing back to the rim's
> width at both ends, which is what removes the step the author was seeing where a constant-width
> band stopped dead against a much thinner edge. §1's scale rule is untouched and was the thing
> checked: at equal approach a body of 20 and one of 120 draw the identical band.
>
> **The ramp is squared, which is the second correction to the same note.** Run straight it was
> already **1.8× the rim** the moment a body came on offer — *"a bit too aggressively bold at a
> distance"* (author, 2026-08-29). Against the approach as it is actually flown, `closing` **0.31**
> at first sight, **0.62** at the median and **0.93** at the tightest orbit, the two curves give
> 1.8× / 2.6× / 3.4× straight against **1.2× / 2.0× / 3.2×** squared. Squaring costs almost nothing
> where the player is looking at it and takes the far end back to something barely thicker than the
> edge it sits on. Cubing was measured and overshoots the other way — it holds at 1.6× through the
> *middle* of the approach, so the growing happens too late to be what the eye follows in.
>
> **§3 · The lamp goes out over 210ms, not on a tick.** *"The planet deactivation after release
> — can we at least have it quickly fade out instead of just toggle 'off'?"* (author, 2026-08-29).
> §3's *"the lamp goes out at release, not at grab"* was built as an instant: one tick at E2 and
> the next at E0, in a game whose every other transition is a curve. **The load-bearing half is
> untouched** — nothing happens at the grab — and what moved is only that the release now *starts*
> the going-out rather than completing it. A body keeps its energy and its hue while it fades, and
> both looks are drawn at once through it, because the crossing is identity hue to DUSK and a
> canvas cannot mix two colours in one stroke. Half of §5's DECAY, and the halving is the author's:
> the token's own 420ms was the first answer and *"let's make it about twice as fast"* was the
> second.
>
> **§3 · A body glows when it is *gripping*, not when it is reachable.** This table's *"E0–E1"*
> for AHEAD is read at **E0** until the body is actually pulling — see spec
> [00 · §3](./00-tokens.md)'s notice, and `CONTEXT.md`'s new **grip**. A body in reach but far off
> is a rim and nothing else, which is this section's own *"constellation of dim coloured rings."*
>
> **§3 · And there is a surface this file does not have**: a wide faint halo from the floor
> outward in the body's hue, at an alpha that grows with grip. *"The planets should have a
> fainter, much wider glow that grows with proximity."*
>
> **§2 · The tide's width grows with proximity, and it is an A/B.** §2 scales the arc with
> **mass**, which is what shipped; flown, *"the tide markers flash in at some default width. I'd
> love if they grew into their width based on my distance"* (author, 2026-08-29). `TIDE_GROWTH`
> mixes the two — 0 is §2 exactly as written, 1 is the prototype's reading, which lerps the span
> by live pull. Mass still sets the ceiling and proximity decides how much of it is showing.
>
> **§1, §4 and §5 stand as written.** The rim and tide widths are constant in design px whatever
> the radius, the strata sit at 0.68r and 0.39r, the core is the type slot at 0.08r, and a body is
> named by hue in the run — which is the ruling that keeps a **sighting**'s new label a distance
> and not a name (spec [03 · §6](./03-hud.md)).

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
| Tracking | Follows the craft's bearing with a first-order lag, coefficient **k ≈ 6 /s** — ⚠ **ruled to 30** on 2026-08-29, see the notice above |
| Inner ripple | One stratum ring tracks the tide at **0.6 × k**, at α 0.3 |
| Range | Present on every body within grab range; absent beyond it |

**Scaling with mass**: a heavier body reaches with a **longer, brighter, tighter-tracking** tide
— longer arc, higher α, larger lag coefficient. Gravity strength is read at a glance, with no
gauge. The three must move together and monotonically with mass.

The mapping is written from `GM(R)`, which spec [01 · §13.2](./01-swing.md) carries as a parameter
`GM_ref × (R / R_ref)ⁿ` with `n` deferred to the M1 gate — so **this arc is drawn from the number
the simulation actually uses**, and moving `n` moves the tide with it rather than leaving the
picture describing a gravity the world no longer has. Note that the prototype ran `n = 0`, one mass
for every body, and therefore had nothing for this arc to read: the tide is specified ahead of the
physics it draws, and M1.3 is where the two meet.

On press, the tide flares into the **grab filament** — the line drawn from the craft to the body
(spec [00](./00-tokens.md), compass state 1). While the craft orbits, the tide races around the
rim underneath it.

> ## ⚠ And the tide went a hair whiter at its closest, 2026-08-30
>
> §1 draws the tide *"in identity hue at high lightness"* and states no number. It was
> `oklch(0.92 0.13 H)`; it is now **`oklch(0.94 0.115 H)`** at full lift, on the author's ask.
>
> **Both channels had to move, and that is measured rather than preferred.** Checked against all
> forty identity hues, the old value is **already outside sRGB on 31 of them**, overshooting by up
> to 0.633 — so the browser was already clipping it, and the clipping is what washed the hue out.
> Whiteness bought by raising lightness alone is bought by clipping harder, and clipping moves each
> channel by a different amount, which is the one thing that can actually shift a hue. The new pair
> is whiter *and* better behaved: mean saturation across the forty falls **0.704 → 0.630** while the
> worst overshoot falls **0.633 → 0.601**.
>
> Spec [00 · §2](./00-tokens.md)'s `oklch(0.72 0.13 H)` is untouched — that fixes what an
> **identity** is, so no body is louder than another for being itself, and this is the far end of a
> lift that starts exactly there. A tide that has not lifted is still precisely the rim, which is a
> test.

> ## ⚠ Ruled by the author, 2026-08-30 — the rim strengths below moved
>
> *"Make the planet ring colour a bit less bright when it's not grabbed, and then toggle it to the
> current colour when I do grab. That'll help visually identify the grabbed planet."*
>
> **IN REACH: 85% → 55%. AHEAD: 40% → 34%. HELD is unchanged at 100%**, and that it did not move is
> the point. The table below put a body in reach fifteen points under a held one, on rims 2.25px and
> 2.5px wide — and in a field where several bodies are in reach at once, that is not a distinction
> the eye can make at a glance while flying. The one thing the compass draws itself around was the
> hardest thing on screen to pick out. The gap under HELD goes from **1.18× to 1.82×**.
>
> AHEAD is trimmed only a little, because §3's own guard still binds: *"the field ahead must read as
> a constellation of dim coloured rings, never a row of grey balls."* At 34% the AHEAD → IN REACH
> step is still 1.6×.
>
> Tide, strata, core and every width are untouched.

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
  **Confirmed against spec 00 §6, 2026-08-29** (author): that file's *"a chip at its window's tip"*
  on every compass ring is the stale half and is retired. Measured over 29 777 pairs of rings drawn
  together in recorded play, two rings on one compass never come closer than **24.4°** in hue — so
  this rule's one case does not arise on the instrument, and nothing is drawn there.
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
