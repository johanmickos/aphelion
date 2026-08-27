# F08 · Course segments

**Severity** COSTS · **Blocks** VISION's difficulty curve, regions, challenge stretches · **Depends on** F02

## Why

`createBodies` is a single `while` loop with constant `bodySpacing`, constant
`bodyWeave`, and a constant `rowPairChance`. Radii come from a literal
`34 + rnd() * 22`, written twice.

VISION names the consequence precisely: _"Body generation is statistically
stationary — the first planet and the sixtieth are identical draws… so past
roughly the first 25 seconds nothing gets harder."_ And then: _"Every ambition
below assumes this is solved first."_

`COURSES` is the whole of the field's structure today — two rows of two numbers —
and its own header is honest that the short course is "apparatus, not design."

Three of VISION's four field ambitions are the same mechanism:

- **a difficulty curve** — a segment list whose numbers move up the field
- **regions with an identity** — a segment plus a theme and a signature hazard
- **challenge stretches** — an authored segment spliced between generated ones

The fourth, "more bodies, each a new verb," is F02.

## The shape

```ts
/**
 * A stretch of field with its own character.
 *
 * The unit is a SEGMENT and not a body, because every ambition VISION names for
 * the field is a statement about a stretch: difficulty is spacing that tightens
 * over one, a region is a palette and a hazard that belong to one, a challenge
 * stretch is one that was authored instead of generated.
 *
 * The anomaly is the working instance of the discipline this enforces — "one new
 * property per region, introduced calmly and then remixed" — and it is the shape
 * to copy.
 */
export interface Segment {
  /** How many bodies this stretch contributes. */
  bodies: number;
  /** Which types may appear, and in what proportion. */
  composition: ReadonlyArray<[BodyTypeId, weight: number]>;
  spacing: number;
  weave: number;
  spread: number;
  forkChance: number;
}

export interface CourseSpec {
  id: CourseId;
  label: string;
  segments: readonly Segment[];
}
```

`COURSES` becomes a `Record<CourseId, CourseSpec>`; `full` and `short` become
one-segment specs holding today's numbers, which is a pure restatement.

## Steps

### 1. Land F02 first

`composition` names body types, so the type table has to exist.

### 2. Restate the current courses as one-segment specs

`full` = one segment of 60 bodies at `bodySpacing: 280`, `bodyWeave: 72`,
`bodySpread: 160`, `rowPairChance: 0.4`. `short` = the same at 12.

**Verify** the generated field is byte-identical. The cheapest check is a
fingerprint of `createBodies(DEFAULT_CONFIG)` before and after — write it as a
throwaway script, not a test.

### 3. Make the generator walk segments

The `while (placed.length < cfg.bodyCount)` loop becomes a loop over segments,
each with its own body budget. **This is the dangerous step** — see the traps.

### 4. Move the four generation keys out of `SimConfig`

`bodySpacing`, `bodyWeave`, `bodySpread`, `rowPairChance` become segment fields.
`bodyCount` stays, or becomes derived from the segment budgets — decide which, but
note `tools/replay-core.ts` knows `bodyCount` by name as a `COURSE_KEY` and the
classification has to keep working.

**Verify** `pnpm golden:capture`, then `pnpm check`.

### 5. A second segment, as the proof

One course with two segments whose spacing differs. If a body lands anywhere
different from where a one-segment field of the same length would put it _except_
where the spacing says so, the walker is wrong.

## Gates

| Gate          | Expected                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Equality gate | `0.000e+0`. `PROTOTYPE_CONFIG` has `proceduralLayout: false` and returns the eight authored `DEFS` — the segment walker never runs for it. |
| Golden        | **Recapture at step 4.**                                                                                                                   |
| `SIM_VERSION` | **Bump at step 3** — the field a seed produces is behaviour under `src/sim/`.                                                              |

## Traps

This is the plan with the most ways to be silently wrong.

- **Draw order is part of the field, and it is stated as a rule.**
  `createBodies`' header: "DRAW ORDER IS PART OF THE FIELD. The single-body path
  draws x, then the vertical gap, then the radius, exactly as it did before rows
  existed, and the fork decision above it short-circuits before its draw when
  `rowPairChance` is 0." Every one of those clauses is load-bearing for
  reconstructing an old report's field.
- **Give each segment its own derived stream.** `createMotes` already establishes
  the pattern and says why: "a seed's CORRIDOR must be the same corridor whether
  there are ten dots in the carpet or none." It also records the reason the seed
  is _offset_ rather than reused — with the same seed the first draw of each
  stream is the same number, so the dots would lean the way the first row does on
  every world. Derive per segment as `seed ^ constant ^ segmentIndex`, and check
  the streams do not run in step.
- **Segment boundaries must not compound a drift.** The existing loop already
  carries `rowY` separately from the height a body is emitted at, precisely
  because folding a fork's lean back into the running height "would make the NEXT
  row's gap the configured one plus a lean — a drift that compounds all the way up
  the field." A segment boundary is the same hazard one level up.
- **The opening body is authored and stays authored.** `DEFS[0]` is the first
  planet and the spawn sits 84px to its left, tuned. Segment one starts _after_
  it.
- **Anomalies are placed after the corridor, from the shared stream**, so that a
  seed's corridor is unchanged whether `anomalyCount` is 0 or 3. If anomalies
  become a per-segment composition entry instead, that property has to be
  deliberately re-established or abandoned — and abandoning it means no two
  recorded sessions are comparable again.
- **`fieldBounds` takes the crest from the topmost body.** A segment that places a
  body higher than expected moves the finish line. That is correct behaviour, but
  it means a segment change is also a change to where the run ends.

## Open question

VISION's Infinite mode wants a field that "escalates, no top." That is a segment
_generator_ rather than a segment list — an infinite sequence rather than an
array. Decide whether `CourseSpec.segments` is `readonly Segment[]` or
`(i: number) => Segment` before step 2; converting later means touching the walker
again.

## Done when

A two-segment course generates a field whose second half is measurably tighter
than its first, and `SimConfig` holds no body-layout key except `bodyCount` and
`worldSeed`.
