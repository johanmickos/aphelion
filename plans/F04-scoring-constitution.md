# F04 · Scoring constitution

**Severity** BLOCKS · **Blocks** Direction 06, Direction 08 · **Depends on** an author decision

> **BLOCKING CALL.** Does Direction 08 supersede the current economy wholesale?
> Ten `ScoreConfig` keys are **deleted, not moved**. Get the call before step 2.
>
> **Two of this box's own claims did not survive the corpus** — see "What the
> corpus says" below. `anomalyBonus` and `hopBonus` are the two largest NUMBERS in
> `ScoreConfig` and the two smallest contributors in play; and the plan deletes the
> grab award's entire quality channel without saying so.

## What the corpus says

Measured 2026-08-27 by replaying the 28 diagnostics reports that replay faithfully
through today's scorer, one sim replay feeding one scorer per zeroed weight —
`scratch/f04-census.ts`. 27 sessions with a non-zero `best`, 193 links, 193 grabs,
73 rescues, 63 flybys, 32 burns. Drop is in corpus total `best`, which is the
metric `AGENTS.md` names because a death zeroes the live score.

| weight            | drop  | sessions changed | fate in Dir 08 |
| ----------------- | ----- | ---------------- | -------------- |
| `streakStep`      | 54.6% | 24/27            | kept           |
| `climbPerPx`      | 19.1% | 25/27            | kept           |
| `aimBonus`        | 16.2% | 25/27            | deleted        |
| `linkBase`        | 13.0% | 25/27            | deleted        |
| `closeBonus`      | 12.8% | 24/27            | deleted        |
| `rescueBonus`     | 11.5% | 18/27            | deleted        |
| `timingBonus`     | 8.0%  | 24/27            | deleted        |
| `flybyCloseBonus` | 6.3%  | 19/27            | deleted        |
| `nerveBonus`      | 4.5%  | 14/27            | deleted        |
| `flybyBase`       | 3.1%  | 19/27            | deleted        |
| `anomalyBonus`    | 2.4%  | **1/27**         | deleted        |
| `hopBonus`        | 0.0%  | **0/27**         | deleted        |
| `moteBonus`       | 0.0%  | **0/27**         | kept           |

**The axiom is already half-true.** `streakStep` is the single largest lever in the
economy at 54.6%: the multiplier does more than every minting key put together
already. What Direction 08 changes is not "add multipliers" — it is that the carry
becomes the ONLY thing that mints, and the carry is currently 19.1%.

**The urgency in the box above is a config reading, not a play reading.**
`anomalyBonus` (800) and `hopBonus` (500) are the two largest numbers in
`ScoreConfig`, which is where "the two largest awards in the game" comes from. In
play they are the two smallest: one anomaly capture across 28 sessions, and zero
hops. Deleting them costs 2.4% and 0.0% of the corpus.

**And those zeros are blind spots, not verdicts** — `scratch/f04-verify.ts`, the
same discipline `fuelRegen` needed. The corpus contains **0 charged-window ticks**
and **0 zipped captures**, so no session could pay a hop; **25 of 28 reports have
no clearable field at all** and none reaches `runInBand`, so none could pay a mote.
The corpus cannot price the anomaly economy or the carpet. It says only that
whatever those keys are worth, nobody has collected it yet — which is an argument
about how rarely the anomaly is reached, and belongs to the field, not the scorer.

**The plan deletes the grab award entirely, and does not say so.** `awardGrab` is
`close * closeBonus + nerveBonus + anomaly` — three keys, all on the delete list,
17.3% of corpus best between them and 17.7% of all points paid. `priceSwing(carry,
tier, band, streak)` has no term for how the ship ARRIVED. That contradicts this
plan's own trap: "a capture is two scoring events… do not let that collapse the
two." Either the grab keeps a quality channel Direction 08 does not name, or the
call is knowingly to delete it.

**The cleanest substitution is the tier.** `timingBonus` + `aimBonus` = 24.2%, and
Direction 06 replaces exactly those two with one position-in-window tier at
×1.25/×1.5/×2.0. That is the one step whose sizing the corpus supports.

**Caveat on freshness.** All 67 recordings are 20–25 August and 20 of the 28
faithful ones are 20–21 August, so the flying predates the flyby rework, the burn,
the rescue retune and the release kick. The WEIGHTS are current — a replay is
scored by today's rules, which is the point — but the trajectories are not.

## Why

Direction 08's second axiom: _"Skill only multiplies. Accuracy, risk, consistency,
engagement — none of them mint points; they price the metres."_ The current scorer
mints points from nearly everything.

`ScoreConfig`, 22 keys, by what they do:

| What                 | Keys                                                                                                                                | Count |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Mint flat points** | `linkBase` `closeBonus` `timingBonus` `aimBonus` `nerveBonus` `flybyBase` `flybyCloseBonus` `rescueBonus` `anomalyBonus` `hopBonus` | 10    |
| **Progress**         | `climbPerPx`                                                                                                                        | 1     |
| **Multiply**         | `streakStep` `streakMax`                                                                                                            | 2     |
| **Shape a curve**    | `closeSpan` `flybyTurnSpan` `aimSharpness` `timingSharpness` `burnEdgeSpan` `rescueSpan` `burnRate` `burnMinHeat`                   | 8     |
| **Survives as-is**   | `moteBonus` — Direction 12 prices motes as flat "found money", explicitly outside the wager                                         | 1     |

## The good news

Structurally this is smaller than it looks, and that is a credit to the existing
design. `ScoreState` already carries `climbFromY` — the accrual anchor — and
`PendingLink`, which holds a swing's qualities until the release cashes them.
**The carry / cash / bank loop is already the shape of the code.**

`awardLink` today:

```ts
const climb = sc.climbFromY === null ? 0 : Math.max(0, sc.climbFromY - state.highWaterY);
sc.climbFromY = state.highWaterY;
const raw =
  scfg.linkBase + climb * scfg.climbPerPx + timing * scfg.timingBonus + aim * scfg.aimBonus;
award.points = Math.round(raw * multiplierFor(sc, scfg));
```

`climb * climbPerPx` **is** the carry. What has to go is `linkBase` and the two
additive quality terms, replaced by multipliers.

## The shape

```ts
/**
 * One swing, priced. Direction 08's whole formula.
 *
 * Multipliers MULTIPLY — they never add to each other — so the theoretical
 * maximum per swing is legible: 2.0 x 3.0 x 1.5 = x9 over base. The callout is
 * the receipt and the bank tick is its confirmation.
 *
 * Grading and pricing are separate functions on purpose. Direction 08's closing
 * rule is that modes may change the currency and what death takes, but never how
 * a swing is graded — which is enforceable only if the grade is computed
 * somewhere the economy cannot reach.
 */
function priceSwing(carry: number, tier: Tier, band: Band, streak: number): number;
```

- **carry** — metres climbed while engaged, times the chain accrual (+10%/link)
- **tier** — TRUE ×1.25 / SHARP ×1.5 / PERFECT ×2.0, from window position
- **band** — field ×1 / outer ×2 / fire ×3, from where the orbit sat
- **streak** — +10% per step, capped at 5 steps

## Steps

### 1. Split `score` into `carry` and `bank`

Needed regardless of modes: Direction 08 makes the carry visible on the craft (as
trail brightness) and the bank a chip. Today they are one number and `endLife`
zeroes it — which _is_ the Daily economy, written as an invariant.

Add `carry` and `bank` to `ScoreState`; make `score` a derived getter or drop it
in favour of explicit reads. `endLife` zeroes both, for now, which preserves
current behaviour exactly.

**Verify** `pnpm test`. `best` and `sessionMax` must be unchanged — and
`AGENTS.md` warns that a session is measured by `score.best`, never `score.score`,
because a death zeroes the latter.

### 2. Introduce the tier, off window geometry

The tier replaces `timingBonus` and `aimBonus`. Direction 06 prices it by
**position within the release window** — inner 60% / 30% / ±8% of centre — not by
six independent quality axes. `src/score/aim.ts` already computes the release
angle and error; the tier is a function of that error over the window's half-width.

**See F09** for the vocabulary side of this, and for the measurement question the
zone percentages raise. The tier and the word are the same fact; build them
together or the numbers and the words will disagree.

### 3. Introduce the band

Direction 07 prices the boundary in three bands at edge−220m and edge−90m.
`src/score/burn.ts` already computes `edgeHeat` off distance to the wall and
`SimConfig.escapeBandWidth` already names a band — read the existing definitions
rather than adding a third, per `AGENTS.md`'s one-definition rule.

The band is a property of **where the orbit sat**, not of where the release
happened, so it is a `PendingLink` field accumulated during the capture.

### 4. Delete the ten minting keys

`linkBase`, `closeBonus`, `timingBonus`, `aimBonus`, `nerveBonus`, `flybyBase`,
`flybyCloseBonus`, `rescueBonus`, `anomalyBonus`, `hopBonus`.

`test/score.test.ts` asserts every key in `ScoreConfig` changes some session's
outcome, so it will fail loudly — **which is the point.** `AGENTS.md`: "When a
documented defect is fixed, the assertion that pinned it should fail loudly and
specifically… Update the pin to assert the new truth rather than deleting it."
The new truth is that every _multiplier_ changes an outcome.

### 5. Re-measure the thresholds

`AGENTS.md`: "Thresholds are measured, never chosen." The corpus is in
`diagnostics/`. Direction 06's 60% / 30% / ±8% are round numbers, and the
window-scaling argument may legitimately earn them — but VISION is explicit that
the vocabulary cut is "a re-measurement at coarser granularity, not a re-pick."

## Gates

| Gate          | Expected                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| Equality gate | Untouched — scoring is an observer and `src/sim/` cannot see it.           |
| Golden        | Unchanged — no `SimConfig` key moves. Score weights live in `ScoreConfig`. |
| `SIM_VERSION` | **No bump.** Nothing under `src/sim/` changes.                             |
| `pnpm test`   | `test/score.test.ts` fails at step 4 by design. Update the pins.           |

## Traps

- **Score weights must not migrate into `SimConfig`.** `AGENTS.md` states the
  cost: it drags them into the equality gate's config compare, forces a golden
  recapture, and fails `test/tune.test.ts`, which measures a knob by how far it
  moves the ship.
- **A capture is two scoring events.** The grab is judged on how the ship arrived
  and pays at periapsis; the link is judged on how it left and pays at the
  release. Direction 08 prices _the swing_ — do not let that collapse the two. The
  grab must not be "simplified" to pay at the press: beside a planet you are
  already close to the surface, so every tap would be a tight grab and tapping in
  place would be a points faucet.
- **`hopBonus` is flat and deliberately outside the multiplier** — the comment at
  `score.ts:815` explains that the award carries `multiplier: 1` so the popup
  prints what was actually paid. If hops survive the call in any form, that
  property has to be re-decided, not inherited.
- **Anything drawn after a run ends reads `score.lastRun`**, never the live
  fields. `endLife` runs on the _first_ tick of the ending hold. This has already
  caught two things that looked correct and rendered zeroes.
- **`moteBonus` stays flat.** Direction 12: "Pocket change outside the wager: no
  tiers, no multipliers, no aiming. Found money, not earned money."

## Done when

`awardLink` is one `priceSwing` call, `ScoreConfig` holds no key that mints, and
`test/score.test.ts` pins the multiplicative truth rather than the additive one.
