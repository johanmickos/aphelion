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
> **Asked and answered, 2026-08-30.** The rungs landed and the sky keeps its place, quieter:
> *"the background starfield now needs to be much less noticeable. I still want it there, but only
> as background noise."* So the objection above is settled by **rank** rather than by removing one
> of the two — the rungs are the field's own statement of speed and the sky is behind it, which is
> what a background is. What came down is an alpha (`STAR_STRENGTH`, 0.4): the star sizes and the
> per-star parallax are the depth that was asked for in the first place and are untouched. At 0.4
> the nearest tier draws at 0.32 and the furthest at 0.12, so the sky is now fainter than the
> **dust** in front of it is specified to be (α 0.1 – 0.3).
>
> The rest of §2 is untouched: DUST, STRATA, BODIES and PLAYER all still move at world speed, and
> scale drift, blur-by-distance and vanishing points are all still refused. What was overturned is
> the star layer and nothing else.

## 2 · The stack — five layers, all at world speed

| Layer | Content | Energy | Motion |
|---|---|---|---|
| **SKY** | VOID, with a slow altitude ramp | — | static; tint ≤ **6%** outside an anomaly |
| **DUST** | Sparse motes, α **0.1 – 0.3** | E0 | world speed, **strictly parallel fall** |
| **STRATA** | The rungs, DUSK α **0.16**; addressed rungs α **0.28** | E0 | world speed; bow ≤ **30px** ⚠ **45px, and switched off — see §3** |
| **BODIES** | Rims, tides, strata, glyph cores (spec [04](./04-bodies.md)) | E0–E2 | world speed |
| **PLAYER** | Craft, trail, compass, deadline track | E2–E3 | world speed |

**Depth cues are banned in all five layers**: no parallax, no scale drift, no blur-by-distance,
no vanishing point. Everything moves at world speed. Dust varies in brightness only.

Dust **density** rises gently with chain level — a hot run flies through a livelier field. Dust
**velocity** never varies.

Dust streak length grows with speed and its α falls as it stretches, so a fast field streaks and
a slow one stipples. Streaks fall strictly parallel to velocity; nothing radiates.

## 3 · Rungs

> ## ⚠ Built and flown, 2026-08-30 — three of these numbers moved
>
> M3.2 built the rungs and the author flew them the same day. **The prose below is
> as written**; what is true now is here.
>
> **A metre is a number at last.** Nothing in the project had ever said what one
> is, and *"every 25 m"* is unbuildable until something does. Ruled in
> `src/sim/units.ts`, with the arithmetic: **a metre is a prototype unit, so it is
> `SCALE` = 3 design units.** Spec 17 §4's radii (55 → 32 m) are spec 01 §13.2's
> *measured* 34.3 – 55.5 — which `docs/spec/README.md` already recorded as
> *"prototype magnitudes wearing design-space labels"* — and spec
> [07 · §2](./07-boundary.md)'s bands settle it: at any larger metre the outer
> band (220 m) is deeper than this field's whole corridor and a run opens inside
> the boundary.
>
> **Spacing is 50 m, not 25.** The 2026-08-27 confirmation below deferred the
> spacing *"to when there is a swing to measure it against"*; there is one now, 25
> was the first value it ever had, and it was refused on the first flight:
> *"the rungs are too close together, it feels chaotic at speed."* At 50 the
> author's phone shows **12.9 rungs**, which is where this board's own live
> component already was — it draws 13.5 in its frame. The metre did not move and
> must not; the number of metres did.
>
> **The bow clamps at 45px, not 30**, and this one is a measurement before it is a
> taste. A rung point inside a body is hidden behind the body's disc, so the
> largest bow anyone sees is the one at the **rim** — and at 30px the per-body
> clamp bites there for any body above radius 44, so the visible peak *falls*
> above it. Measured across the radii this field places, the rim bow ran
> 18.0 → **23.8** → 22.3 at radii 34, 44 and 56: **the biggest body in the field
> bent less field than the median one**, which is the exact opposite of §6's
> *"the field states which bodies pull hardest."* So the 30px clamp and the
> *"increases peak bow monotonically"* two paragraphs below could not both hold. 45
> is the smallest value that clears it — the turnover moves to radius 60, above
> the 56 this field places and above spec 17 §4's largest of 55 — and it is also
> half of what the author asked for the same day: *"the ship's wake, and maybe all
> gravity wakes, need to be a bit larger."*
>
> **The wake is 40px deep and 85px wide**, against the board's 16 and 34. Two and a
> half times is not a taste: what the author flew was the board's numbers against
> rungs 25 board pixels apart, and doubling the spacing halves the wake relative to
> the field it displaces, so 32/68 merely restores the picture they were describing
> and the *"a bit larger"* is the ×1.25 on top.
>
> **What the old numbers were protecting** is that the field must not shout. The
> 30px clamp is the reason a rung reads as a stratum rather than a wave, and it is
> still a clamp — nothing is uncapped, and the acceptance below still holds with
> the number changed. Every one of these four is on the bench, so reopening any of
> them costs a slider rather than a build.
>
> **When to reopen**: when spec 17's generator replaces the fixture field, because
> three of the four are measured against *this* field's radii and corridor.

> ## ⚠ Switched off by the author, 2026-08-30 — the rungs hang straight
>
> **The gravity bow and the wake are both off**, later the same day and after the
> numbers above were flown: *"let's remove the gravity wake effect for now, for
> both planet and ship, but leave the underlying code so we can reactivate it
> later."* What ships is the rest of the system — strata every 50 m, DUSK at α
> 0.16 and 0.28, every fifth addressed and carrying a number, sweeping past at
> world speed. §6's first and third jobs, **speed felt** and **altitude
> addressed**, are intact; its second, **gravity drawn**, is the part that is
> parked.
>
> **Nothing is deleted, and that is the instruction.** The law below, the clamp,
> the falloff, the sum-then-clamp, the wake's ~400ms relaxation and its whole
> ADR-0015 recurrence are all built and all still tested — `test/state/rungs.test.ts`
> exercises them at **the strengths a restore would put back** and asserts
> separately that the shipped field draws flat, so the ruling and the mechanism
> can move independently without either rotting. Presentation state goes on
> deriving the wake it is not drawing, so turning it back on needs no warm-up.
>
> **It is two numbers, and both are on the bench.** `BOW_GAIN` 0 → **24** (the
> board's own default) and `WAKE_AMPLITUDE` 0 → **40** board pixels with
> `WAKE_FALLOFF` at 85. Zero is a real off rather than a small on: it reaches the
> picture through presentation state, so the renderer culls a body that bends
> nothing and draws two points per rung instead of ninety-three — measured, path
> points fall from **895 to 96** per frame, which is the pre-rung baseline plus the
> straight lines themselves.
>
> **What the effect was protecting** is §1's whole idea — *"the player climbs
> through a medium, not past a backdrop"* — and §6's second job, that the field
> states which bodies pull hardest **before** the player presses. Straight rungs
> are a ruler rather than a medium, and the **tide** (spec [04](./04-bodies.md))
> is now the only thing saying gravity, at the rim rather than at a distance.
> That is the cost, and it is worth restating when this is reopened.
>
> **When to reopen**: the author's call, and one slider. The flight that switched
> it off, and the one open extension it suggested — a wake that answers to speed
> or to the quality of a swing rather than being always-on — are in
> `docs/plan/m3-the-field.md`.

| Property | Value |
|---|---|
| Spacing | **25 m** of altitude ⚠ **now 50 m** |
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
with the body's mass. Bow never exceeds **30px** ⚠ **45px — see the notice above**. Bows from
multiple bodies sum, then clamp.

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
> **⚠ Ruled 2026-09-01 — an addressed rung prints metres.** *"Metres are good for the runs"*
> (author), after flying both readings against each other on the bench. Reading (b) is **deleted**
> rather than switched off, and so is the toggle: a knob whose question has been answered invites
> the answer to be re-litigated by whoever finds it next. The paragraphs below are the argument that
> was put to them and are kept because the tension in the boards is real and will come back when the
> results sheet is designed.
>
> What is **not** settled by this is where altitude zero sits — the fixture's foot is a backstop
> rather than a line anyone meets, so a run opens reading 1 250 rather than near zero. That is spec
> 17 §3's datum and its generator's business.
>
> **What was open — what an addressed rung says.** The board's prose reads *"every 5th carrying its
> address (the same numbers the planets wear)"* and *"'died at 23' has a place"*, which puts
> body addresses (1–40) on the rungs. The board's own live component, run in a browser, prints
> **metres** — `125`, `250`, `375`, one label every 5th rung at 25 m spacing. At 25 m spacing these
> cannot both be true, and boards 09, 10 and 11 all report altitude on the 0–40 address scale. Two
> readings survived: (a) an addressed rung prints its altitude in metres and the address scale lives
> only on cards; (b) the rung nearest each body is the addressed one and prints that body's
> address.
>
> **The evidence leaned to (a)**, which is what was ruled. The live component is the only place the
> board actually draws a rung label, and it draws metres. Against that, three later boards report
> altitude on the address scale — so the reading that satisfies both is that rungs print metres and
> **the address scale belongs to the cards**, which is now the standing position for spec 10.


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
  `~3 × 34px` of the craft's position. ⚠ Read as **the wake's own sources** rather than the craft's
  current position, which the ~400ms relaxation two paragraphs above forces: a rung the craft has
  left is still displaced, so a difference measured against where the craft is *now* must trail it.
  `test/state/rungs.test.ts` holds both halves of what the criterion protects — every difference
  sits inside the reach of a source, and every source is a place the craft was inside the decay's
  span. Held at the restore strength while the wake is switched off (§3's second notice).
- Sweeping a body's mass from minimum to maximum increases peak bow monotonically and never
  exceeds 30px. ⚠ **Held at the restore strength**, because the bow is switched off (§3's second
  notice) and this would otherwise pass vacuously. **The clamp is 45px** (§3's notice), and *monotonically* is asked over the mass
  range a day actually places — at 30px the two halves of this sentence contradicted each other
  inside that range. `test/state/rungs.test.ts` holds both, and holds the turnover clear of the
  largest body spec 17 §4 authors.
- Every dust mote's velocity equals every other dust mote's velocity, at every tick, at every
  chain level. A test that computes the variance of dust velocity returns zero.
- Doubling chain level increases dust count and changes no dust velocity.
- Entering and leaving an anomaly changes the sky and nothing about any body's hue.
- Rendered at any altitude, the field contains no element whose scale or blur depends on a depth
  coordinate — there is no depth coordinate.

## Open

- The content of an addressed rung's label (§3). **Still open after M3.2, deliberately.** Both
  readings are built and the bench toggles between them (`tools/bench/patches.ts`), with metres the
  default because that is where this spec says the evidence leans — a default is not a ruling. A
  second question rides with it: metres are counted from the field's **foot**, which is spec 17
  §3's own datum, and the fixture's foot is a backstop *"rather than a line anyone meets"*, so a run
  opens reading 1 250 rather than near zero. That is an artefact of a hand-made field; spec 17's
  generator places its own foot.
- **Whether a rung label may cross the thumb line.** Spec [00 · §7](./00-tokens.md) says nothing
  readable may live below it, ever, and a rung's number is the first readable thing in the game
  that *scrolls* — everything else below that line (the craft, the compass, a callout at the dot)
  is world-attached and exempt in practice. Built as the conservative reading: the label fades out
  as it crosses. If a world-attached label is exempt, `LABEL_FADE` goes to zero.
