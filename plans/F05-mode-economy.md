# F05 · Mode economy

**Severity** BLOCKS · **Blocks** Direction 08's mode matrix · **Depends on** F04

## Why

A search across `src/` and `app/` finds no concept of a mode anywhere.
`ScoreState` holds `score` and `best`; `endLife` zeroes the first. That **is** the
Daily economy, written as an invariant rather than chosen as one.

Direction 08 needs five, and is precise about what varies and what must not:

| Mode      | Currency                 | Death takes                      | Streaks & chain           |
| --------- | ------------------------ | -------------------------------- | ------------------------- |
| Daily     | points                   | carry **and** bank               | all live                  |
| Infinite  | points, field escalates  | carry only                       | all live                  |
| Corridors | time (tiers pay seconds) | the attempt                      | streaks live, chain idles |
| Adventure | points per region        | carry; checkpoints hold the bank | all live                  |
| Zen       | none                     | nothing                          | words and ×N only         |

And the rule that holds it together: _"modes may change what the currency is and
what death takes — they may never change how a swing is graded. TRUE/SHARP/
PERFECT, the zones, the bands, the streak rules: identical everywhere, so skill
transfers across every mode and the compass never has to be relearned."_

## The shape

```ts
// src/score/economy.ts — new file

/**
 * What a mode is allowed to change.
 *
 * Deliberately small, and deliberately NOT a place to put grading. Direction
 * 08's closing rule is that a swing is graded identically in every mode; the
 * only way to guarantee that is for the grade to be computed somewhere this
 * descriptor cannot reach. `priceSwing` reads the grade; `Economy` decides what
 * the priced result is denominated in and what a death does to it.
 */
export interface Economy {
  id: ModeId;
  /** What a priced swing is denominated in. */
  currency: 'points' | 'seconds' | 'none';
  /** What a death removes. */
  forfeits: 'carry' | 'carry-and-bank' | 'attempt' | 'nothing';
  /** Whether the chain accrual is live, or idles at 1. */
  chain: boolean;
  /** Whether streak multipliers price the swing, or only name it. */
  streaks: 'price' | 'name';
}
```

Passed to `scoreTick` beside `ScoreConfig`, which already has exactly this shape
of parameter (`scfg: ScoreConfig = DEFAULT_SCORE_CONFIG`).

## Steps

### 1. Land F04's carry/bank split first

Without it there is one number and `forfeits` has nothing to distinguish.

### 2. Add `Economy`, with `DAILY` as the only instance

`DAILY` must reproduce current behaviour exactly: `forfeits: 'carry-and-bank'`,
chain and streaks live. `endLife` reads `economy.forfeits` instead of zeroing
unconditionally.

**Verify** `pnpm test` — every existing test is a Daily test, so all of them must
stay green with no changes.

### 3. Add `ZEN` as the proof

Deliberately second, because Direction 08 nominates it as the proof of the
system: _"The subtraction proves the system: remove points and the tiers still
speak — the dot still flashes, the word still pops. Grading survives; pricing
doesn't."_

If Zen requires a branch anywhere in the grading path, the split is in the wrong
place. That is the acceptance test for this whole plan, and it is worth building
Zen before Infinite for exactly that reason.

### 4. Record the mode in the report

`tools/replay-core.ts` classifies config differences five ways, and `AGENTS.md`
warns: **"Any key a player can change at runtime must join one of the first
four"**, or the banner goes back to crying wolf. This has already happened twice
— `DEV_KEYS` and `COURSE_KEYS` were both added after the fact.

A mode is player-selectable, so it needs its own category the day it becomes
selectable. Add `MODE_KEYS` at the same time as the picker, not after.

## Gates

| Gate            | Expected                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Equality gate   | Untouched. The economy is a scoring concept; `src/sim/` must not learn it exists, and `pnpm portable` enforces that. |
| Golden          | Unchanged unless the mode reaches `SimConfig` — it should not.                                                       |
| `pnpm portable` | Must stay green. `src/score/` may import from `src/sim/` and nothing else.                                           |

## Traps

- **Infinite's field escalation is F08, not this.** "Field escalates, no top" is a
  course-generation property. Keep the economy descriptor about the ledger.
- **Corridors changes what a tier pays, not how it is graded.** PERFECT −2.0s,
  SHARP −1.0s, TRUE −0.5s. That is `currency: 'seconds'` plus a per-tier table —
  it must not become a second grading function.
- **`sessionMax` and `best` are session-scoped, not run-scoped.** Daily is "one
  run, one bank" and has no session to speak of; Infinite's bank survives death.
  Decide which of the two `foldSessionMax` describes before adding Infinite, or
  the results sheet will report a session number in a mode that has no sessions.
- **Zen has "no death, only drifting back."** That is a _simulation_ behaviour —
  the ending reasons live in `EndingReason` — so Zen is the one mode that cannot
  be purely an economy. Scope that carefully when it comes; the economy handles
  what a death costs, not whether one happens.

## Done when

`ZEN` runs the full grading path with `currency: 'none'` and no branch anywhere in
`aim.ts`, `praise.ts` or the tier function mentions a mode.
