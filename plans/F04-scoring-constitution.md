# F04 · Scoring constitution

**Severity** BLOCKS · **Blocks** Direction 06, Direction 08, F05 · **State** decided
2026-08-27, stage (a) in progress

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

### (a) Split the live score into `carry` and `bank` — IN PROGRESS

Behaviour-preserving. `ScoreState.score` becomes `bank`: points cashed in the
current life, which is exactly what `score` meant. `carry` is added alongside as
the accrued, gap-gated, **not yet spent** climb, so the risky accrual is built and
pinned in a stage where it cannot change a number.

**Verify** every existing pin holds, and `best` / `sessionMax` are untouched.

### (b) Swap the formula

Eleven keys deleted, tightness and chain into the carry, tier and band into the
cash step, the ring gradient added, popups for grab/rescue/burn removed.

`test/score.test.ts` asserts every `ScoreConfig` key changes some session's
outcome, so it **fails loudly here — which is the point.** `AGENTS.md`: update the
pin to assert the new truth rather than deleting it. The new truth is that every
_multiplier_ changes an outcome.

### (c) Calibrate

**Only after fresh recordings from the current build.** Every magnitude is a
threshold under the ruling, and the existing corpus predates the release kick, the
flyby retune and the ending — VISION's standing hazard is staleness, not error:
"a threshold measured under tuning that has since moved is worse than an unmeasured
one, because it looks defensible."

Open at (c): points per metre (the board's worked example is 1 pt/m against
`climbPerPx` 0.25); the tier and band ratios; whether a rescue at ~7× is too
generous.

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

`awardLink` is one `priceSwing` call, `ScoreConfig` holds no key that mints, both
required pixels are drawn, and `test/score.test.ts` pins the multiplicative truth
rather than the additive one.
