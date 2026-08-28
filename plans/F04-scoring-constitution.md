# F04 · Scoring constitution

**Severity** BLOCKS · **Blocks** Direction 06, Direction 08, F05 · **State** stages
(a) and (b) LANDED 2026-08-27 — PORT_NOTES 73, 74. **Only (c) is left, and it is
blocked on flying.** F05 is unblocked: it wanted the formula to exist, not to be
calibrated.

> **DO NOT RE-DERIVE ANY OF THIS.** The formula, the deletions and the two pixels
> are in the code with their reasoning at each site. What is below is kept only
> until (c) lands: read it for what is still OPEN, and read the code for what is
> true.

> **THE CALL IS MADE.** Direction 08 supersedes the current economy, on this
> ruling: **the axioms rule and the numbers get measured.** The five axioms are
> design intent and no measurement can refute a values statement; every magnitude
> in the board — tier ratios, band ratios, points per metre, the streak cap — is a
> threshold, and `AGENTS.md` says thresholds are measured, never chosen.
>
> Everything below the ruling was decided against the corpus. Where the board made
> a **factual claim about the build**, the corpus overruled it — the same standing
> Direction 04's claims got in PORT_NOTES 70, and for the same reason.

## The formula

```
carry  =  Σ climb while engaged
            gap-gated: accrual stops after `cfg.grabRange` of climb without
            engaging, and resumes at the next grab
          × chain      +10% per link
          × tightness  clearance over `closeSpan` — grabs AND passes alike

cash (at the release)  =  carry × tier × band × streak
          tier    the conjunction of release marker and boost-envelope peak
          band    selected by `burnBank`'s integral
          streak  unchanged
```

## What the corpus said, and what it changed

Measured 2026-08-27 over the 28 diagnostics reports that replay faithfully, one
sim replay feeding one scorer per zeroed weight. Harnesses are in `scratch/`
(`f04-census.ts`, `f04-verify.ts`, `f04-engaged.ts`, `f04-gaps.ts`,
`f04-rescue.ts`, `f04-gate-rescue.ts`) — **re-run them rather than trusting this
table**, and note that all 67 recordings are 20–25 August, so the trajectories
predate the release kick, the flyby retune and the ending.

| weight            | drop in corpus `best` | sessions changed |
| ----------------- | --------------------- | ---------------- |
| `streakStep`      | 54.6%                 | 24/27            |
| `climbPerPx`      | 19.1%                 | 25/27            |
| `aimBonus`        | 16.2%                 | 25/27            |
| `linkBase`        | 13.0%                 | 25/27            |
| `closeBonus`      | 12.8%                 | 24/27            |
| `rescueBonus`     | 11.5%                 | 18/27            |
| `timingBonus`     | 8.0%                  | 24/27            |
| `flybyCloseBonus` | 6.3%                  | 19/27            |
| `nerveBonus`      | 4.5%                  | 14/27            |
| `flybyBase`       | 3.1%                  | 19/27            |
| `anomalyBonus`    | 2.4%                  | **1/27**         |
| `hopBonus`        | 0.0%                  | **0/27**         |

**The axiom is already half true.** `streakStep` is the single largest lever in the
economy — the multiplier already does more than every minting key put together.
What Direction 08 actually changes is that the carry becomes the ONLY source, and
the carry is 19.1% today.

**"The two largest awards in the game" was a config reading.** `anomalyBonus` (800)
and `hopBonus` (500) are the two largest NUMBERS and the two smallest contributors.
The earlier version of this box called deleting them "not recoverable by a retune";
it costs 2.4% and 0.0%.

**Those zeros are blind spots, not verdicts** — the `fuelRegen` discipline. The
corpus holds **0 charged-window ticks** and **0 zipped captures**, so no session
could pay a hop; **25 of 28 reports have no clearable field at all** and none
reaches `runInBand`, so none could pay a mote. One anomaly capture in 28 sessions
prices the anomaly's REACHABILITY, which is an F08 course finding and not a scoring
one. **Log it there.**

**There is an eleventh minting key.** `sc.burnBank += heat * dt * scfg.burnRate` —
`burnRate` mints points per second spent near the wall. The old classification in
this file filed it under "shape a curve". The board bans it by name twice: axiom 1
("metres climbed while engaged. **Not time**") and, under what deliberately earns
nothing, "**survival time — never**… not from a per-second trickle".

## The five things the board got factually wrong

Each is a claim about the build, not a value, so each was checked.

1. **"BAND — the pixel: mote density."** `createMotes` returns empty without a
   `runInBand` and places motes on a sine through the run-in carpet. Motes are a
   finish-line object; the band applies to every swing everywhere. **The band is
   drawn by the hazard gradient instead** — `drawHazardZones` already paints it,
   and `burnEdgeSpan` is already pinned by test to that band's own width, so there
   is one definition and it is already on screen.

2. **The formula prices only the swing, so it silently deletes `awardGrab`.**
   `awardGrab` is `close * closeBonus + nerveBonus + anomaly` — 17.3% of corpus
   best — and `priceSwing(carry, tier, band, streak)` has no term for how the ship
   ARRIVED. **Grab quality prices the carry instead**, which is where the board
   already puts chain: "inside the carry accrual", with its own pixel, explicitly
   separate from the cash step.

3. **The tier is angular only, which drops boost timing from scoring.** VISION
   pillar 2: the boost envelope and the release marker FIGHT, "hitting both means
   shaping the dive so they arrive together… the scoring layer only gives it a
   name". An angle-only tier grades a perfectly-aimed release at a dead envelope as
   PERFECT. **The tier grades the conjunction.** Both pixels exist already — the
   boost halo for the envelope, the compass markers for the angle.

4. **"Disengaged metres earn ×0" collides with VISION pillar 5** ("altitude is
   banked, not paid — it cashes at the next release"). Reconciled by taking the
   board's own engagement definition from its chain rule. But the board's threshold
   does not survive: **63.7% of corpus climb is coasted**, and gap-gating at one
   rung (25m ≈ 25px) leaves **58.6% unpaid** — 93% of the way to the strict
   captured-only reading. **The cut is `cfg.grabRange` (7.3% unpaid)**, which is
   not a new number: it is the existing single definition of how far the game
   considers a body reachable, so the rule states itself — metres stop counting
   once you have climbed out of reach of everything without engaging.

5. **Not the board's error but worth recording**: a rescue was expected to be
   structurally unpayable, since it is a lateral save and the constitution pays
   only for climb. **The opposite is true.** The link after a rescue banks a median
   carry of 1352px against 554px for an ordinary link — **2.44×** — and the 560
   gate costs it _nothing_, because a drift toward a side wall accrues little
   vertical climb per coast. A rescue swing is ~2.4× carry × ×3 fire band ≈ **7×
   an ordinary swing**, with no `rescueBonus` and no exception. VISION pillar 4
   gets stronger. Whether 7× is too generous is a stage (c) question.

## The eleven deletions, and where each axis goes

Nothing measured is lost. Every axis is re-homed.

| deleted           | its axis survives as                            |
| ----------------- | ----------------------------------------------- |
| `linkBase`        | — (a flat mint, nothing to re-home)             |
| `closeBonus`      | the tightness multiplier, over `closeSpan`      |
| `flybyCloseBonus` | the same tightness multiplier — one term, both  |
| `nerveBonus`      | the same: a nerve grab is maximally tight       |
| `timingBonus`     | half of the tier's conjunction                  |
| `aimBonus`        | the other half of it                            |
| `flybyBase`       | — (paid for showing up)                         |
| `rescueBonus`     | carry × band, structurally, at ~7×              |
| `anomalyBonus`    | — (see F08: reachability, not reward)           |
| `hopBonus`        | chain: a zip is an engagement, so hops drive it |
| `burnRate` mints  | `burnRate` becomes the depth→band scale         |

Untouched: `climbPerPx` (the carry's rate), `streakStep`, `streakMax`, `moteBonus`
(Direction 12's found money), and every `*Span` / `*Sharpness` curve key, which now
shape the multipliers they always shaped.

## Two new pixels are REQUIRED, not optional

Axiom 5: "If a scoring rule can't point at the pixel that announced it, the rule is
wrong" — and the pixel must be drawn **before** the score touches it, so a praise
word after the fact does not qualify.

1. **The minimum-orbit ring must draw the `closeSpan` gradient.** It currently
   announces the FLOOR; tightness is graded over the 200px above it and nothing
   draws that. Without this, the carry's tightness multiplier is invisible math.
2. **The band's three steps must be readable off the hazard gradient.** It is drawn
   and continuous today; the steps are not.

Chain already has the craft's bloom, streak the ×N, tier the halo and the markers.

## The receipt: 47% of popups go, as a consequence

PORT_NOTES 59 measured the reported defect — "so many at so many different points
that the user doesn't know what they're being rewarded for" — at 31.7 things a
minute, **74% of awards carrying nothing but a number**, composition link 36% /
grab 32% / rescue 11% / flyby 10% / shouts 7% / burn 4%.

`grab`, `rescue` and `burn` all stop being awards here. That is **47% of every
popup in the game removed structurally**, by the economy rather than by a popup
policy. `link`, `flyby`, `mote` and shouts remain.

**F04 removes the popups it kills. F09 designs what the survivor says** — the tier
vocabulary, how a tier and a streak read together, whether awards merge or queue.
Do not pre-empt it: VISION is explicit that the cut from 45 words is "a
re-measurement at coarser granularity, not a re-pick".

## The three stages

Each holds `pnpm check` on its own.

### (a) Split the live score — LANDED

`score` became `bank`; `carry` accrues gap-gated beside the old economy without
being spent by it. Changed no number. PORT_NOTES 73.

### (b) Swap the formula — LANDED

Eleven keys deleted, a twelfth (`burnMinHeat`) demoted to a constant, tightness
and chain inside the carry, tier and band in the cash step, both required pixels
drawn, four award kinds removed. PORT_NOTES 74 has the four things that had to
change once the formula was real — two counters rather than one, the tier's rung
derivation, why the band's drawn steps are not its thresholds, and the capture's
climb being gated as a coast.

### (c) Calibrate — ALL THAT IS LEFT, AND IT IS UNDER WAY

**Only against recordings from the current build.** Every magnitude is a threshold
under the ruling, and the 67-recording corpus predates the release kick, the flyby
retune and the ending — VISION's standing hazard is staleness, not error: "a
threshold measured under tuning that has since moved is worse than an unmeasured
one, because it looks defensible."

#### The first session flown under it — 2026-08-28, 128s, 67 swings

One session, stated with its sample size because the interesting end of every
distribution here is rare by construction. It predates the recorder carrying
`tier`/`band`/`carry`, so the split is reconstructed: PORT_NOTES 75 has the method
and `scratch/f04c-recover.ts` does it. **Re-measure on the next session, which
carries the fields directly.**

```
tier   x1 10 · TRUE 14 · SHARP 22 · PERFECT 0     (46 of 63 factorise uniquely)
band   x1 45 · x2 1 · x3 0
carry  p10 52 · p50 187 · p90 481 · max 1462
carry per px climbed   p10 0.43 · p50 0.67 · p90 1.18   (climbPerPx is 0.25)
multiplier             p50 x6.25 · p90 x10.00 · max x11.50
```

**The band is very nearly inert, and the cause looks structural rather than a
threshold set too high.** `burnBank` is emptied by every cash, and this session
cashed a swing every 2.03 seconds — 63 of them, 47 links and 16 flybys — so a
threshold denominated in heat-seconds has two seconds to fill rather than a
capture. Lowering `bandTwoAt` is the obvious move
and probably the wrong one: it would pay a graze at the rate of a drag. The
question to answer first is whether the band should survive a cash the way the
chain survives one, and **that is a rule rather than a magnitude**, so it wants
deciding before (c) tunes anything.

It has a reported feel attached: "I find myself being more careful and conservative
with my burns." That is the opposite of what Direction 08 asks the fire band for —
"the fire band gets scarier the richer you are" is a temptation, and VISION pillar
4 says the whole point of the marker is to be able to aim at it. A multiplier that
fires once in 46 swings is not a dial.

**SHARP is the modal rung and PERFECT never fired.** 22 of 46 at SHARP, where the
board's zone says the inner 30% — and a CONJUNCTION of two axes should be rarer
than either zone alone, not commoner. The rungs are too loose. Re-derive rather
than nudge: each threshold is `zone^aimSharpness * zone^timingSharpness`, so they
move with the sharpnesses and all three have to move together.

**The displayed number and the played number are different numbers.** That session
totalled 100,045 across its lives; the game shows the best SINGLE life. The
author's reading of it — "I struggle to reach 100k points, which is a good thing, I
want that to be a tough ceiling" — is calibrated on the total. This is VISION's
standing open call on aggregation arriving with fresh evidence, and it is upstream
of the scale question below: decide what a RUN is worth before tuning what a swing
is worth.

#### The open magnitudes

Every provisional number says so at its declaration in `src/score/config.ts`.

- **Points per metre.** `climbPerPx` is still 0.25 and Direction 08's worked
  example is 1 pt/m. This is the scale of every number the player sees, and it is
  downstream of the aggregation call above.
- **The tier rungs.** The zone FRACTIONS are Direction 06's design intent and a
  measurement cannot refute them; where the resulting thresholds land is the
  question, and the first session says too loose.
- **The band**, once its reset rule is settled. `bandTwoAt` 85 is the median
  surviving drag and `bandThreeAt` 333 is two thirds of the hottest on record,
  both from `burnRate`'s own measurement.
- **`tightMax` and `chainStep`.** 2 and 0.1, both legible rather than measured. The
  pair currently multiplies the carry by a median 2.7x over `climbPerPx`.
- **Whether a rescue at ~7x is too generous**, which needs a rescue flown under the
  new economy — the first session had none.

## Gates

| Gate          | Expected                                                         |
| ------------- | ---------------------------------------------------------------- |
| Equality gate | Untouched — scoring is an observer and `src/sim/` cannot see it. |
| Golden        | Unchanged — no `SimConfig` key moves.                            |
| `SIM_VERSION` | **No bump.** Nothing under `src/sim/` changes.                   |
| `pnpm test`   | Holds at (a). Fails at (b) by design; update the pins.           |

## Traps

- **Score weights must not migrate into `SimConfig`.** It drags them into the
  equality gate's config compare, forces a golden recapture, and fails
  `test/tune.test.ts`, which measures a knob by how far it moves the ship.
- **Per-body reach must MULTIPLY `cfg.grabRange`, never replace it.** The carry's
  coasting cut reads the global, so a body that reaches further must not silently
  change how patient the economy is with drifting. This is the shape
  `traits.charges` and `traits.claimable` already take, and both say why at their
  declaration: the body says what it does, the config says how much.
- **A capture is still two scoring events.** Arrival prices the carry, departure
  sets the tier. `AGENTS.md` forbids collapsing them — and note that its stated
  REASON has expired: "tapping in place would be a points faucet" is an argument
  about an ADDITIVE economy, and under a pure multiplier a tap has climbed zero
  metres, so `0 × anything = 0`. The rule survives; its justification is now the
  receipt timing, not the faucet. **Update the pin rather than obeying a dead
  reason.**
- **Anything drawn after a run ends reads `score.lastRun`**, never the live fields.
  `endLife` runs on the FIRST tick of the ending hold.
- **Measure `best`, never `score`.** A death zeroes the live number and most
  recordings end on one.

## Done when

~~`awardLink` is one `priceSwing` call, `ScoreConfig` holds no key that mints, both
required pixels are drawn, and `test/score.test.ts` pins the multiplicative truth
rather than the additive one.~~ All four hold as of 2026-08-27.

**This file is deleted when (c) lands.** What survives goes where it cannot go
stale: the measurements into PORT_NOTES, the rules someone will be tempted to break
into `AGENTS.md` (they are there — one source and four multipliers, never add a key
that mints, every multiplier has a pixel) and into comments at the sites that tempt
them.
