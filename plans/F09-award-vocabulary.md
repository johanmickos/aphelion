# F09 · Award vocabulary

**Severity** COSTS · **Blocks** Direction 06 · **Depends on** an author decision; pairs with F04

> **CALL before step 1.** Direction 06's zones — inner 60%, inner 30%, ±8% of
> centre — are round numbers. VISION is explicit that the cut is _"a
> re-measurement at coarser granularity, not a re-pick"_, and `AGENTS.md` says
> thresholds are measured, never chosen. Does the window-scaling argument earn the
> round numbers, or do they get measured against `diagnostics/` first?

## Why

45 words across 6 categories × 2 tiers, every threshold a percentile of real play,
with pages of measurement explaining why round numbers were rejected. It is some
of the most careful work in the repo, and it is measurably not working: VISION
records that one 85-second session showed 14 distinct words, "almost every one
exactly once. A word that never repeats never becomes a signal, so colour is doing
all the work."

Direction 06 replaces it with three — TRUE white, SHARP green, PERFECT gold —
plus `×N` counters, and reprices them off **window geometry** instead of six
independent quality axes.

## What actually changes, past the word count

|                      | Today                                                                   | Direction 06                                                                  |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Axes                 | six, graded independently (`close` `nerve` `aim` `peak` `burn` `super`) | **one** — position within the release window                                  |
| Calibration          | each axis against its own measured percentile                           | zones at 60% / 30% / ±8% of the window                                        |
| What keeps it honest | percentiles of real play                                                | _"zones scale with the window, so difficulty prices the words automatically"_ |
| Baseline             | `ROUTINE` — points, no word                                             | points only, white at 70%, no word spent                                      |
| Escalation           | a better word                                                           | `PERFECT ×N`, counted                                                         |

The third row is the load-bearing one. **Window scaling is what replaces
percentile calibration** — a PERFECT on a needle-thin arc is a different feat from
one on a barn door, and the arc's width already said so. That argument is why the
new numbers may legitimately be round where the old ones could not be.

## Steps

### 1. Get the call above

### 2. Build the tier alongside F04's pricing

The tier and the word are the same fact. Direction 06 prices TRUE ×1.25, SHARP
×1.5, PERFECT ×2.0 and colours them white / LUMEN / SOLAR. Build them in one
place or the numbers and the words will disagree — which is exactly the defect
`accolade.ts`'s header records, where "the band coloured by EVENT and the popup by
CATEGORY, so the same link was green in one place and violet in the other."

### 3. Collapse `WORDS` and `PraiseCategory`

`praise.ts` keeps its structure — a pure function from an award to a grade — and
changes what it reads. `PraiseCategory` (6 values) and `PraiseLevel` (3 values)
collapse into one `Tier`. `CLOSE_PX`, `AIM`, `PEAK`, `BURN` and `NERVE_SKIM_PX`
go, along with several pages of measurement notes.

**Move the notes to `docs/PORT_NOTES.md` before deleting them.** They record why
round numbers failed in both directions — gated at a plausible 0.90 the boost-peak
word fired zero times in 112 releases; the kink line at 15° praised 42% of
captures — and that is history the next person to pick a threshold needs. It
cannot live in a file that is being deleted.

### 4. Streaks, per Direction 06

Per-word, broken only downward. A PERFECT does not break a SHARP streak, it
upgrades it. No timer — _"coasting between grabs can't expire a streak… Expiry-by-
clock would punish route-reading."_ `ScoreState.streak` today is a single counter
incremented in `awardLink`; it becomes per-tier.

`×N` appears at the second occurrence, and "a repeat within the linger merges in
place (counter ticks, smaller re-pop)". `popups.ts` already has merge behaviour to
build on.

### 5. Retire the event words

Direction 06 deletes anomaly-entry and boundary-graze words outright: _"The aurora
is the callout; a word on a spectacle is a caption on a firework."_ That includes
the burn vocabulary and its colour exception in `accolade.ts` (`BURN_WORD`).

## Gates

| Gate          | Expected                                                 |
| ------------- | -------------------------------------------------------- |
| Equality gate | Untouched.                                               |
| Golden        | Unchanged — no `SimConfig` key involved.                 |
| `pnpm test`   | `test/score.test.ts` and any praise pins fail by design. |

## Traps

- **`RECKLESS_DEG` and the praise thresholds are deliberately outside
  `ScoreConfig`.** The reasoning: "a word costs nothing and pays nothing — it
  names a release, it does not price one," and `test/score.test.ts` requires every
  `ScoreConfig` key to change an outcome. Under Direction 06 the tier **does**
  price the swing, so the zone boundaries now belong in `ScoreConfig` — that is a
  real change of category, not an oversight to preserve.
- **Colour still means how good, the word still means what.** `AGENTS.md` states
  it and Direction 06 keeps it: white → green → gold is the rarity ladder, and
  _"Violet is deliberately absent: it belongs to the anomaly and to black holes."_
  Do not let LUMEN or SOLAR leak onto geometry — Direction 06's law is that
  quality colours live only in type.
- **`nerve` has identical tier-1 and tier-2 word lists.** Whatever replaces it
  should not silently inherit that shape.
- **Awards arriving together are unreadable** — VISION records three inside one
  second leaving one legible for 0.6s. Direction 06 claims the fix is structural:
  "one release, one word, and the E3 rule means two can't fight." Verify that
  claim against a real session before trusting it; the grab award still pays at
  periapsis and the link at the release, so two awards can still be close.

## Done when

`WORDS` holds three entries, `praiseFor` returns a tier rather than a category,
and the deleted measurements are quoted in `PORT_NOTES.md`.
