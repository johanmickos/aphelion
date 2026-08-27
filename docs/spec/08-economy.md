# 08 · The economy

**Board**: [Direction 08 — Scoring Constitution](../design/Aphelion%2008%20-%20Scoring%20Constitution.dc.html).

**Rulings applied**: **Direction 08 owns the arithmetic**; [Direction 06](./06-awards.md) owns the
presentation. Every absolute point value printed on boards 02, 03 and 06 (`+445`, `+556`, `+668`,
`+890`) comes from a scoring model this board replaced and is carried nowhere — the multipliers
travel, the totals do not. A missed release **defers** the carry rather than destroying it
(ADR-0008). **Carpet dots pay flat and unmultiplied** — a deliberate, argued exception to the
axioms below (spec [12](./12-finish.md)). **Powerups may pay fuel and time, never points and
never multipliers** (ADR-0009, spec [16](./16-powerups.md)).

**Depends on**: [06 · Awards](./06-awards.md) for tier and streak, [07 · Boundary](./07-boundary.md)
for band.

---

## 1 · The five axioms

1. **Progress is the only base currency.** Metres climbed while engaged. Not time, not kills, not
   combos of combos.
2. **Skill only multiplies.** Accuracy, risk, consistency, engagement — none of them mint points;
   they price the metres.
3. **Coasting is unpaid, never punished.** Disengaged metres earn ×0. No decay, no drain.
4. **Points exist in two states.** Carried (at stake, glowing) or banked (safe, dim). What death
   takes is a property of the mode.
5. **Every multiplier has a pixel.** Tier = the dot. Band = the motes. Streak = the `×N`. Chain =
   the craft's bloom. No invisible math.

> If a scoring rule cannot point at the pixel that announced it, the rule is wrong.

## 2 · The loop

```
GRAB ──── carry accrues ────► RELEASE ──── cash ────► BANK
                                 │
                              (miss)
                                 │
                                 └──► carry rides into the next swing (ADR-0008)
```

- **Carry** — points accrued during a swing and still at stake. Visible as the **brightness of the
  trail**. The player can always see what death would cost, without reading a number.
- **Cash** — the conversion of carry into bank at release, priced by the grade of the swing.
- **Bank** — points that are safe. The dim BANK chip.
- **Coast** — unpaid metres, BANK dimmed to 55%, nothing lost.

**The unit of scoring is the swing, because the unit of play is the swing.** A release is not a
bonus moment; it is payday, and the compass spent the whole orbit setting the wage.

## 3 · The arithmetic

### Accrual

While **engaged** (grabbed, from grab until release), for each metre of altitude gained:

```
carry += 1 × (1 + 0.10 × chainLinks)
```

Base rate is **1 point per metre climbed**. Descending metres accrue nothing; carry never
decreases. Disengaged metres accrue nothing (axiom 3).

### Cash

At a **graded** release (make or better):

```
cash = round( round(carry) × tier × band × streak )
bank += cash
carry = 0
```

Carry is held as an exact real in the simulation and rounded to an integer **once, at cash time**,
before the multipliers are applied. Rounding is half-up.

### The multipliers

| Multiplier | Source | Values | Its pixel |
|---|---|---|---|
| **tier** | spec [06](./06-awards.md) | make ×1.0 · TRUE ×1.25 · SHARP ×1.5 · PERFECT ×2.0 | the dot |
| **band** | spec [07](./07-boundary.md) | field ×1 · outer ×2 · fire ×3 | the motes |
| **streak** | spec [06](./06-awards.md) | 1 + 0.10 × min(N−1, 5) → ×1.0 … ×1.5 | the `×N` |
| **chain** | this spec, §4 | folded into accrual, +10% per link | the craft's bloom |

**Multipliers multiply; they never add to each other.** The theoretical maximum over base for one
swing is therefore legible: `2.0 × 3.0 × 1.5 = ×9`.

**The grade prices the whole carry, not just the moment.** A PERFECT does not award a flat bonus —
it doubles everything carried through that orbit. High carries into hard windows are the game's
core bet, and the compass arc width is the posted odds.

### Worked example — the board's, recomputed

| Step | Detail | Value |
|---|---|---|
| CARRY | 142 m climbed engaged, chain ×6 → `142 × 1.6` | 227 |
| TIER | PERFECT | × 2.0 |
| BAND | the swing was flown in the fire band | × 3.0 |
| STREAK | PERFECT ×3 → `1 + 0.10 × 2` | × 1.2 |
| **CASHED** | callout reads `PERFECT ×3` over `+1 634` | **+1 634** |

### Band aggregation — derived, flag for the author

The board says *"the orbit sat in the ×3 band"* and CONTEXT.md says *"the boundary heat a swing
was flown in"*. Neither states how a swing that crosses bands is priced. This spec fixes it as:

> **band = the deepest band the craft occupied at any tick between grab and release.**

Deepest-reached is the only aggregation that makes aiming at the fire band worth doing, which is
the whole design intent of spec [07](./07-boundary.md). The alternative readings — band at
release, or a time-weighted average — are named here so the author can overrule cheaply. **This
is derived, not ruled.**

## 4 · Chain

Chain is **engagement**, not accuracy. Streak is accuracy. Two systems, two pixels, no overlap.

| Rule | Behaviour |
|---|---|
| Counts | Consecutive engaged swings |
| Breaks | On coasting past **one full rung — 25 m of altitude** without being engaged |
| Also breaks | On death |
| Effect on score | Flat **+10% per link**, folded into carry **accrual** (not into the cash step) |
| Effect on light | Gates the craft's bloom: **+4px per link** |
| Effect on the world | Dust density rises gently with chain level (spec [05](./05-field.md)) |
| Milestones | ×5, ×10, ×15 get a masthead pulse and one bloom step. No word (spec [06](./06-awards.md)) |

> **Open — the chain ceiling.** `VISION.md` records that in the prototype the multiplier ceiling
> bound about 22 seconds in and never moved again — pinned for 74% of an 85-second session — and
> raises the open call: *"The question is not what the ceiling should be. It is whether the top of
> the ladder should be a number that stops moving at all. Measure first."* Direction 06's systems
> note recommends that once a ceiling binds, over-ceiling links convert to **visible bank sparks**
> — a mote of light fires from the craft to the BANK chip and the number ticks on arrival.
>
> This spec therefore ships **no ceiling** and no spark behaviour. Both wait on the measurement
> the open call demands, taken under the new build. An implementer must not invent a cap.

## 5 · The deferred carry (ADR-0008)

A release **outside** the window is not graded and **does not cash at all**. The carry is neither
lost nor paid: it rides into the next swing and cashes when a graded release finally earns it.

Consequences an implementer must handle:

- **Carry is not bounded by one swing.** It can accumulate across several missed releases and
  cash enormously on one good one. That is intended.
- **The carry display must stay legible at values a single swing could never reach.** The trail's
  brightness curve must not saturate at ordinary single-swing carries.
- **Death still takes the whole carry**, which is what keeps the deferral a stake rather than a
  free ride.
- A miss does not break the streak and does not break the chain (a missed release is still an
  engaged swing). It breaks neither because neither is about cashing.

## 6 · What deliberately earns nothing

| Thing | Why |
|---|---|
| **Velocity** | The headline number and worth zero points. It is the *cause* of scoring — more speed, more metres per swing, bigger carries — never scored itself. That is what keeps it a fun number instead of a grind meter |
| **Orbiting** | No points per lap. Altitude gained while orbiting is ≈ 0, so the formula already says so; no special rule is needed. Waiting is priced at exactly its altitude value: none |
| **Near-misses, grazes, style** | No invisible judges. If the game cannot point at the instrument that graded it, it does not grade it |
| **Survival time** | Never. Time pressure comes from the field, not from a per-second trickle |
| **Grabs** | Only releases are graded |
| **Surviving a burn** | The clip is the reward (spec [07](./07-boundary.md)) |
| **Powerups** | They pay fuel and time only (ADR-0009, spec [16](./16-powerups.md)) |

The design smell this prevents: engagement rewards that pay players for not playing well.
Aphelion pays for exactly one thing — **skilled forward motion** — priced four ways.

## 7 · The modes

**The rule that holds the matrix together**: modes may change *what the currency is* and *what
death takes*. They may **never** change how a swing is graded. TRUE/SHARP/PERFECT, the zones, the
bands and the streak rules are identical everywhere, so skill transfers and the compass never has
to be relearned.

v1 ships **DAILY, ZEN and DRIFT** (ADR-0005 as amended by ADR-0007).

| Mode | Currency | Death takes | Streaks & chain | The feeling |
|---|---|---|---|---|
| **DAILY** | Full constitution. One run, one bank | **Carry and bank** — the run is the wager | All live. Longest PERFECT streak is a posted stat | High ceremony. Every swing matters because nothing can be re-run until tomorrow |
| **DRIFT** | Full constitution, random seed, unlimited runs, no standings, no submission, its own local best | **See the open call below** | All live | Where the appetite to keep playing goes, so DAILY can stay scarce |
| **ZEN** | **None.** No points, no bank, no multipliers | Nothing. There is no death, only drifting back | Words and `×N` remain — they are feedback, not price | Motion and light. What is left when the ledger is taken away |

**ZEN is the proof, not a feature.** Remove points and the tiers still speak: the dot still
flashes, the word still pops. Grading survives; pricing does not. If ZEN needs one line of code
inside the grading path, the seam between grading a swing and pricing a swing is not real
(ADR-0005).

Designed for, not built (ADR-0005): **INFINITE** (full constitution, escalating field, death takes
carry only), **CORRIDORS** (currency is time; tiers pay seconds), **ADVENTURE** (full constitution
per region plus an authored goal). The mode boundary must accommodate all five — currency, and
what death takes — from the start.

> **Open — what death takes in DRIFT.** ADR-0007 defines DRIFT as *"the same run on a random seed:
> unlimited, no standings, no submission, its own local best"* and does not say what death costs.
> Two readings are live. (a) **Carry and bank**, inheriting DAILY, since "the same run" and only
> the seed and the submission are named as differing. (b) **Carry only**, following the mode matrix
> row for INFINITE, whose stated reason — *"the long game needs a floor or nobody risks the fire
> band at altitude"* — transfers exactly to unlimited play, and which matches ADR-0007's framing of
> DRIFT as where the generosity goes.
>
> **Recommendation: (b), carry only.** It is not ruled, and this spec does not rule it. Anything
> implementing DRIFT's debrief (spec [09](./09-debrief.md)) is blocked on the author's answer.

## 8 · What is displayed

| Quantity | Where | How |
|---|---|---|
| Carry | The trail | Brightness. Never a number |
| Armed cash | BANK chip, second line | While a graded release is armed, the value it would cash |
| Bank | BANK chip | A number, Archivo 600 tracked. Dims to 55% while coasting |
| Chain | Under the velocity subline, and the craft's bloom | `CHAIN ×N` |
| Tier & streak | The callout at the dot | spec [06](./06-awards.md) |
| Band | The motes | spec [07](./07-boundary.md). Never a number |

## Acceptance

- Recomputing the board's worked example from the formula yields exactly **1 634**.
- A run's final bank is recomputable from its recipe alone, headless, under plain node, and
  matches the live run bit for bit (ADR-0004).
- Deleting the economy module leaves grading, callouts, streaks and every timing intact — ZEN
  runs with the ledger module absent, not stubbed.
- Coasting for 24 m then grabbing preserves the chain; coasting for 26 m then grabbing breaks it.
- Three consecutive missed releases followed by one PERFECT cash the whole accumulated carry once,
  at ×2.0 × band × streak, and nothing before.
- Death sets carry to 0 in every mode that has a carry; whether it also clears bank is read from
  one mode-configuration value and from nowhere else.
- No powerup, carpet dot, or anything else can change tier, band, streak or chain.

## Open

- Band aggregation across a swing that crosses bands (§3) — derived here, not ruled.
- The chain ceiling and the bank-spark behaviour (§4).
- What death takes in DRIFT (§7).
