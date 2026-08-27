# 17 · The daily field

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md).

**The premise**: `VISION.md` records that generation is currently **statistically stationary** —
the first body and the sixtieth are identical draws, with constant spacing and evenly-spread
anomalies — so past roughly the first 25 seconds nothing gets harder, and *"difficulty is not yet
something the game has at all."* Every ambition in `VISION.md`'s "What the field should become"
assumes this is solved first.

**Depends on**: [04 · Bodies](./04-bodies.md), [05 · Field](./05-field.md),
[07 · Boundary](./07-boundary.md), [12 · Finish](./12-finish.md), [16 · Powerups](./16-powerups.md).

---

## 1 · A day

| Property | Value |
|---|---|
| Bodies | **40**, addresses 1 – 40, assigned **bottom to top** |
| Name | One word or phrase from a curated list — `THE LONG CLIMB`, `THIN AIR`, `THE NARROWS` |
| Shape | A vertical corridor with a top |
| Body types | **STANDARD only** in v1 (ADR-0005; plan/README: difficulty comes from geometry first, so that when types arrive there is something to measure them against) |
| Anomalies | Exactly **one** per day |
| Top | The carpet, then the checkered line (spec [12](./12-finish.md)) |

Every player flying today's field flies **the same field**: same bodies, same addresses, same
hues, same anomaly, same cells. That is what makes "died at 23" a thing two players can say to each
other.

## 2 · The seed

| Property | Rule |
|---|---|
| Source | Derived from the **date**, and from nothing else (ADR-0003) |
| Date basis | **UTC.** A daily field shared by every player needs one global date. The reseed countdown counts to the next UTC midnight |
| Determinism | The same date produces the same field on every device, forever. The generator is pure and versioned |
| DRIFT | The same generator, seeded randomly instead of from the date (ADR-0007) |
| The seam | The seed is a boundary with a local implementation behind it, so a service can supply it later without touching gameplay (ADR-0003) |

**Versioning**: the generator carries a version number, and it is part of the day's identity. A
change to the generator changes every past day, which would invalidate every stored run — so the
version is recorded with each run and old runs replay against the generator version they were flown
on.

## 3 · The day description

The day is **generated once, as data**, and gameplay reads only the data. Nothing in the game
generates geometry at play time.

> **A note on the word.** [M0.1](../plan/m0-foundations.md) says to *"express the day as a recipe"*.
> CONTEXT.md reserves **Recipe** for the description of a *run* — its seed and its input log. To
> keep one word for one concept, this spec calls the generated field data the **day description**.
> The intent M0.1 names is unchanged: it is data, so adding a body type later is a data change.

```
DayDescription {
  generatorVersion : int
  day              : int           // days since the epoch date
  name             : string        // from the curated list
  bodies           : Body[40]
  anomaly          : { fromAddress, toAddress }
  cells            : Cell[]        // spec 16
  corridor         : CorridorSample[]   // half-width as a function of altitude
  carpetEdge       : metres
  finishLine       : metres
}

Body {
  address   : 1..40
  altitude  : metres              // bottom to top, strictly increasing with address
  lateral   : metres              // signed offset from the corridor centreline
  radius    : metres
  mass      : derived from radius (spec 01)
  hue       : oklch H             // spec 00 §2
  type      : STANDARD            // the extension point
}
```

**`type` exists from the first commit and is always `STANDARD` in v1.** Adding BINARY, PULSAR,
RINGED or BLACK HOLE is a change to the generator's table and to spec [04](./04-bodies.md) §4 —
never a change to the field's structure, the compass, or the economy.

## 4 · The difficulty curve

Difficulty is **authored as a geometry curve over altitude**. Three geometric quantities move
together, monotonically, from address 1 to address 40.

Let `u = (address − 1) / 39` and

```
t = u ^ 1.3
```

The exponent makes the first quarter of the field nearly flat — `t(0.25) ≈ 0.16` — because
`VISION.md` records that the opening ~25 seconds already work, and then bites through the upper
half.

| Quantity | At address 1 | At address 40 | Interpolation | Why it is harder |
|---|---|---|---|---|
| **Gap** — altitude from one body to the next | 110 m | 190 m | `lerp(110, 190, t)` | Longer coasts. The chain breaks past one rung of coasting (25 m), so wider gaps make engagement a choice rather than a default, and the craft arrives faster and further off line |
| **Corridor half-width** — centreline to the boundary line | 480 m | 300 m | `lerp(480, 300, t)` | Less room to be wrong. The boundary bands are fixed at 220 m and 90 m from the line (spec [07](./07-boundary.md)), so the ×1 core narrows from 520 m to 160 m and the fire band moves toward the racing line |
| **Body radius** | 55 m | 32 m | `lerp(55, 32, t)` | A smaller target, a weaker pull, a shorter tide, and a tighter orbit |

Total field height is therefore ≈ **6 000 m** — 240 rungs at the 25 m spacing of spec
[05](./05-field.md).

**Lateral placement** is seeded, with two constraints: consecutive bodies alternate side of the
centreline, and `|lateral| ≤ corridorHalfWidth(altitude) − radius − 60 m`, so no body is ever
inside a boundary band.

**The player's own speed is the fourth escalation and it is not authored.** It compounds with all
three above, which is why the curve is eased rather than linear. If the top of the field proves
unflyable when the swing exists (M1), the exponent is the knob, not the endpoints.

> **Measure before tightening.** `VISION.md`'s open call on corridor width warns that in the
> prototype both course lengths flew the same corridor width, and two of three recorded lives on
> the short course ended at a side boundary inside 20 seconds — *"Measure before assuming it is a skill
> issue."* The endpoints above are an opening position, and the first thing M3 does with them is
> measure where runs actually end.

## 5 · Generator invariants

The generator produces a day only if all of these hold. A day that fails any of them is rejected
and regenerated from the next value of the seed stream.

1. **Addresses are strictly increasing in altitude**, bottom to top.
2. **No body intersects the boundary bands**: `|lateral| + radius ≤ corridorHalfWidth − 90 m`.
3. **No two bodies overlap**, and no two are within 40 m of each other's rims.
4. **Adjacent hues differ by ≥ 50° oklch H**, and no hue falls in a reserved window (spec
   [00](./00-tokens.md) §2). A day therefore produces **zero** in-run address chips (spec
   [04](./04-bodies.md) §5).
5. **Reachability**: every consecutive pair is reachable — a release from body `n` at the speeds
   that body's orbit affords must be able to enter grab range of body `n+1` without leaving the
   corridor. The reachability model is spec [01](./01-swing.md)'s and does not exist yet; until it
   does, the generator runs the check as a stub that always passes and **logs** every pair it
   cannot yet evaluate.
6. **No cell is placed in the carpet, inside a body, or in a boundary band** (spec
   [16](./16-powerups.md)).

## 6 · The anomaly

| Property | Value |
|---|---|
| Count | Exactly **one** per day |
| Extent | A contiguous stretch of **5 – 8 addresses** |
| Placement | Its lower edge falls in addresses **9 – 28**, so it never contains address 1 or address 40 |
| Effect | The sky (spec [05](./05-field.md) §5) and a fuel trickle while orbiting (spec [13](./13-fuel.md)) |
| Geometry | **None.** The anomaly changes no spacing, no radius, no corridor width. It is a stretch of field where the sky changes, not a stretch where the shape does |

One per day, in the middle, is deliberate: `VISION.md` records that the aurora is finished-product
quality and sustains for about 25 of an 85-second run, and that the answer is *"not by extending the
aurora — its rarity is what makes it land."*

The anomaly is the working instance of the **one new property per region** pattern, and it is the
shape every later region copies.

## 7 · The name

| Property | Rule |
|---|---|
| Source | A curated list, indexed by seed |
| Stability | The same date always yields the same name |
| Register | Terrain, not branding — `THE LONG CLIMB`, `THIN AIR`, `THE NARROWS` |
| Where it appears | The front door, the debrief header, the results sheet's glass (specs [09](./09-debrief.md), [10](./10-results.md), [11](./11-front-door.md)) |

A name is one more thing two players can say to each other about the same day.

## 8 · What is deliberately not here

- **No body types beyond STANDARD.** Difficulty comes from geometry first, so that when types
  arrive there is something to measure them against.
- **No regions.** v1 has one palette, one sky, one bed.
- **No challenge stretches, no authored segments, no gates.** All of them are `VISION.md`
  ambitions that wait on this curve existing and being measured.
- **No second course length.** The short course is apparatus, not design, and it belongs to
  whoever needs to watch the ending twenty times; it is not part of the daily field.

## Acceptance

- Generating the same date twice, on two machines, yields byte-identical day descriptions.
- Generating all dates in a year yields zero days that fail any invariant in §5.
- Across the 40 bodies of any generated day, gap and corridor half-width and radius are each
  monotone in address.
- No generated day contains a hue inside a reserved window, and no generated day produces an
  in-run address chip.
- Adding a second entry to the body-type table changes the generator's output and **no other file**
  in `src/sim/`.
- The field is exactly 40 bodies and has exactly one anomaly, on every date tested.
- The day description is produced once, before the first tick, and no geometry is generated during
  play.

## Open

- Every number in §4 is an opening position, not a measurement. `VISION.md`'s seventh pillar rules
  that a threshold is *"a percentile of real play"* rather than a plausible round number, and these
  are plausible round numbers. They are marked as such deliberately: the curve must exist before it
  can be measured, and it must be re-measured under the build that ships (M3).
