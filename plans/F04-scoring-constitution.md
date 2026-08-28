# F04 · Scoring constitution

**Severity** BLOCKS · **Blocks** Direction 06, Direction 08, F05 · **State** (a) and
(b) LANDED 2026-08-27 — PORT_NOTES 73, 74. **(c) is part done and the rest is
blocked on flying** — PORT_NOTES 76. F05 is unblocked: it wanted the formula to
exist, not to be calibrated.

> **PORT_NOTES 76 CORRECTS THREE READINGS THIS FILE USED TO CARRY**, all of them
> artefacts of the instrument rather than of the game. Read it before trusting a
> number here.

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

#### What stage (c) has done, 2026-08-28

**Read PORT_NOTES 76 first.** Three of the readings this section used to carry
were artefacts of how they were measured, and the corrections are there with the
method. The short version: PERFECT fires 27% of swings rather than never, the fire
band is not held back by its reset rule, and the sharpness keys cannot tighten the
tier ladder at all.

Landed:

- **`bandStep` 1 -> 2**, so the band is x1 / x3 / x5. The author's call is that
  the fire stays a rare jackpot and is priced so that skimming the wall is a
  lucrative strategy; 2 is where the bet turns over against the measured survival
  of a drag. Reasoning and both caveats at the declaration.
- **`flybyTurnSpan` 60 -> 81**, re-measured off the 42 passes recorded under the
  award rather than the 249 reconstructed before it. 60 had ended up below the
  median real pass, so half of every pass in the game took the top rung
  automatically.
- **`SimConfig.boostPeakAt` 0.75**, narrowing the boost envelope's flat top from
  the left so the tier's timing axis grades over it. `SIM_VERSION` 30, golden
  recaptured, gate unmoved.
- **`ScoreAward.boostT` recorded**, because the plateau's width was a threshold
  with no measurement available: `timing` saturates across the flat top, so 118
  of 652 recorded links cannot be placed inside it.
- **`climbPerPx` stays 0.25.** The author's call is that the best single life
  stays the score, and at 0.25 a good session's displayed best is 77k against a
  stated 100k ceiling.

#### What stage (c) still wants, and it is a phone

**Everything below needs a session flown on the current build**, and the two
values landed this session are the reason it is worth flying rather than reasoning
about:

- **`boostPeakAt` is a fit, not a percentile**, and `boostT` now makes the real
  measurement available. This is the one to do first: it is the only threshold in
  the game that was calibrated by extrapolating a density.
- **Whether the jackpot is lucrative enough.** The survival rates behind
  `bandStep` are from drags that were ACCIDENTS, so they are floors. A session
  flown going FOR the top rung is what prices it.
- **`flybyTurnSpan` on more than 42 passes**, whose error surface is flat from 81
  to 91.
- **`tightMax` and `chainStep`.** 2 and 0.1, both legible rather than measured.
  The pair currently multiplies the carry by a median 2.7x over `climbPerPx`.
- **Whether a rescue at ~7x is too generous**, which needs a rescue flown under
  the new economy — neither session so far had one.
- **The tier's zone fractions.** Direction 06's 0.40 / 0.70 / 0.92 are design
  intent and a measurement cannot refute them; where they LAND is still 84 / 60 /
  27% of swings against an intent of 60 / 30 / +-8%. Fixing the two saturating
  inputs was the agreed first move and it is done; whether anything is left to fix
  is the next session's question, not this one's.

#### The reading from the first session, corrected

One session, 128s, 63 swings, stated with its sample size because the interesting
end of every distribution here is rare by construction. The tier row is recomputed
from the recorded `aim` / `timing` / `turn` rather than factorised out of the
multiplier; the band row is read off recorded `heat`, which pins it exactly.

```
tier   x1 10 · TRUE 14 · SHARP 22 · PERFECT 17
band   x1 62 · x2 1                (62 swings recorded zero heat)
carry  p10 52 · p50 187 · p90 481 · max 1462
lives  3,981 · 18,573 · 77,491     total 100,045, best life 77,491
```

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
