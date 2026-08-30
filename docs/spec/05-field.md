# 05 · The field

**Board**: [Direction 05 — Living Field](../design/Aphelion%2005%20-%20Living%20Field.dc.html).

**Rulings applied**: **parallax star layers are refused entirely** — ⚠ *overturned by the author
on 2026-08-30; see the notice in §2.* Dust varies in brightness, never in velocity, no matter what
`VISION.md`'s prose suggests. The board's "NEXT, IN ORDER"
footer uses obsolete numbering and is void.

**Depends on**: [00 · Tokens](./00-tokens.md), [04 · Bodies](./04-bodies.md),
[17 · Daily field](./17-daily-field.md) for what is placed in it.

---

## 1 · The idea

The player climbs through a medium, not past a backdrop. The field is made of **rungs**:
strata hung across the world perpendicular to intended travel, marking one unit of altitude.
They bow toward every mass, part around the craft, and sweep past as the craft climbs — so
speed, gravity and the craft's own passage are all visible in one system.

A rung is not a grid line and not a floor. **Rungs are level sets of progress, perpendicular to
intended travel** — horizontal in a vertical field, radial ticks on a ring course. Authored
corridors of any shape inherit the whole field grammar unchanged.

> ## ⚠ Overturned by the author, 2026-08-30 — the sky has parallax
>
> **The refusal below is no longer in force.** The author asked for a parallax starfield having
> read the ruling: *"I know we have a rule about this, but I really think the depth/parallax helps
> convey speed."* It is built in `src/render/starfield.ts` — three tiers at 0.045, 0.12 and 0.195 of
> the camera's motion, one colour at three brightnesses, DUSK to INK and never CORE.
>
> **What the ruling was protecting is worth keeping in view.** §1's idea is that *"the player climbs
> through a medium, not past a backdrop"*, and the **rungs** were to carry speed, gravity and the
> craft's own passage in one system. A second system saying *speed* in a different visual language
> is two answers to one question, and that objection still stands.
>
> **What changed is that the medium is not built.** Every layer in §2's stack is M3's: today SKY is
> empty VOID, there is no DUST and there are no rungs, so nothing in the field expresses speed at
> all. The author has flown that across many sittings on a phone and reports the absence.
>
> The author expects the two to coexist — *"it'll look even better once we install the line
> markers/rungs with gravity bubbly effects"* — so this is not a placeholder to be deleted when M3
> lands. **When the rungs are in, whether the sky still earns its place is a question to ask again**,
> and it is the author's to answer.
>
> The rest of §2 is untouched: DUST, STRATA, BODIES and PLAYER all still move at world speed, and
> scale drift, blur-by-distance and vanishing points are all still refused. What was overturned is
> the star layer and nothing else.

## 2 · The stack — five layers, all at world speed

| Layer | Content | Energy | Motion |
|---|---|---|---|
| **SKY** | VOID, with a slow altitude ramp | — | static; tint ≤ **6%** outside an anomaly |
| **DUST** | Sparse motes, α **0.1 – 0.3** | E0 | world speed, **strictly parallel fall** |
| **STRATA** | The rungs, DUSK α **0.16**; addressed rungs α **0.28** | E0 | world speed; bow ≤ **30px** |
| **BODIES** | Rims, tides, strata, glyph cores (spec [04](./04-bodies.md)) | E0–E2 | world speed |
| **PLAYER** | Craft, trail, compass, deadline track | E2–E3 | world speed |

**Depth cues are banned in all five layers**: no parallax, no scale drift, no blur-by-distance,
no vanishing point. Everything moves at world speed. Dust varies in brightness only.

Dust **density** rises gently with chain level — a hot run flies through a livelier field. Dust
**velocity** never varies.

Dust streak length grows with speed and its α falls as it stretches, so a fast field streaks and
a slow one stipples. Streaks fall strictly parallel to velocity; nothing radiates.

## 3 · Rungs

| Property | Value |
|---|---|
| Spacing | **25 m** of altitude |
| Colour | DUSK |
| α, plain | 0.16 |
| α, addressed | 0.28 |
| Stroke | 1px |
| Addressed cadence | every 5th rung |

### Gravity bow

Every body bows the rungs toward itself. Displacement at a point on a rung is along the bearing
to the body, with magnitude falling off with distance and clamped:

```
bow(d) = min(30, (G * 90) / (d + 26)) * exp(-d / 150)
```

where `d` is the distance in design px from the rung point to the body centre, and `G` scales
with the body's mass. Bow never exceeds **30px**. Bows from multiple bodies sum, then clamp.

Heavy bodies announce themselves at a distance. The tide (spec [04](./04-bodies.md)) is this same
statement, at the rim.

### The wake

Rungs part around the craft and relax behind it. Displacement is **away** from the craft:

```
wake(d) = W * exp(-d / 34)
```

with `W` the wake amplitude in design px. The parted rung relaxes back over **~400ms**.

Nothing radiates from the craft — the wake is a local displacement of an existing structure, not
an emitted ring.

> **Confirmed, 2026-08-27**: the rung approach and the gravity bend hold. **Spacing and the label
> numbers are deferred** to when there is a swing to measure them against — they are not blocking,
> and the shape of the system is not in question.
>
> **Open — what an addressed rung says.** The board's prose reads *"every 5th carrying its
> address (the same numbers the planets wear)"* and *"'died at 23' has a place"*, which puts
> body addresses (1–40) on the rungs. The board's own live component, run in a browser, prints
> **metres** — `125`, `250`, `375`, one label every 5th rung at 25 m spacing. At 25 m spacing these
> cannot both be true, and boards 09, 10 and 11 all report altitude on the 0–40 address scale. Two
> readings survive: (a) an addressed rung prints its altitude in metres and the address scale lives
> only on cards; (b) the rung nearest each body is the addressed one and prints that body's
> address. This spec fixes the spacing and the alphas and leaves the **label content unresolved**.
> It needs the author.
>
> **The evidence leans to (a).** The live component is the only place the board actually draws a
> rung label, and it draws metres. Against that, three later boards report altitude on the address
> scale. A reading that satisfies both — rungs print metres, the address scale belongs to the cards
> — is available and cheap, but it is still a ruling, and not one this spec makes.

## 4 · The sky

VOID, with a slow altitude ramp: the violet-black warms almost imperceptibly toward AURORA as an
anomaly approaches — weather on the horizon, never spent early. The tint stays **≤ 6%** outside an
anomaly. Outside that ramp the sky changes only by region, and v1 has one region.

## 5 · The anomaly

**The anomaly is the only event permitted to repaint the sky.** The baseline's restraint is what
keeps it rare.

| Property | Value |
|---|---|
| Sky | Purple aurora: wavy curtains hung across the field, sweeping down past the craft as it climbs |
| Bed | Overlapping cloud, some leaning ION-pink, some deep AURORA violet |
| Gaps | The gaps between clouds stay **true black** — one of only two places true black is permitted |
| Bodies | Read **through** the tint; their identity hue is not repainted |
| HUD | Unchanged. Only the chip backgrounds go true black, so labels hold against the curtains |
| Extent | A contiguous altitude stretch, placed by the day recipe (spec [17](./17-daily-field.md)) |
| Fuel | Orbiting inside an anomaly trickles fuel (spec [13](./13-fuel.md), ADR-0009) |

The anomaly is a rest stop, a set piece and a scoring frenzy out of a single predicate. It is the
working instance of the one-new-property-per-region pattern and the shape every later region
copies.

## 6 · What the rungs are for

Three jobs, one system:

1. **Speed, felt.** The trail says where the craft has been; the rungs say how fast the world is
   passing. At high velocity they streak; hanging at an orbit's apex they barely drift. There are
   no sampled breadcrumbs anywhere in the game — motion is read from the world, not from the path.
2. **Gravity, drawn.** The field states which bodies pull hardest before the player ever presses.
3. **Altitude, addressed.** The field is a ruler the player climbs, so banked score has a visible
   geography and the results sheet's route maps straight back onto the world.

## Acceptance

- A frame rendered with the craft removed and a frame rendered with it present differ only within
  `~3 × 34px` of the craft's position.
- Sweeping a body's mass from minimum to maximum increases peak bow monotonically and never
  exceeds 30px.
- Every dust mote's velocity equals every other dust mote's velocity, at every tick, at every
  chain level. A test that computes the variance of dust velocity returns zero.
- Doubling chain level increases dust count and changes no dust velocity.
- Entering and leaving an anomaly changes the sky and nothing about any body's hue.
- Rendered at any altitude, the field contains no element whose scale or blur depends on a depth
  coordinate — there is no depth coordinate.

## Open

- The content of an addressed rung's label (§3).
