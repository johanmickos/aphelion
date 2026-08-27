# F02 · Body type table

**Severity** BLOCKS · **Blocks** Direction 04, VISION "more bodies, each a new verb" · **Depends on** F01

## Why

Eight of `SimConfig`'s seventy-eight keys belong to one body type:
`anomalyCount`, `anomalyOffset`, `anomalyBubble`, `anomalyOrbitR`,
`anomalyOrbitPeriod`, `anomalyRefuel`, `anomalySettleDur`, `anomalyAtSpawn`.

Every one is a property of a _body_ living in a config that describes a _run_.
They are read once, by `placeAnomalies`, and stamped onto the object — after
F01, straight into `BodyTraits`.

At that rate, Direction 04's four new types cost roughly **forty more keys**,
taking `SimConfig` from 78 to ~118. And `AGENTS.md` charges a real toll per key:

- a value in `PROTOTYPE_CONFIG` _and_ in `DEFAULT_CONFIG`
- a re-run of `pnpm golden:capture`
- a slot in the equality gate's config compare
- a line in every diagnostics report header, in the classification that decides
  whether the report is trustworthy at all

That toll is correct for a key that tunes the simulation. It should not be
charged for saying how big a pulsar's core is.

## The shape

Body-type parameters are **data, not config**: they do not vary per run, so they
never enter the fingerprint, the config diff, or the golden.

```ts
// src/sim/bodies.ts — new file

/**
 * What each kind of body is, as data.
 *
 * NOT `SimConfig`. A config key is something a run can differ by — it is
 * compared when a replay checks whether it is the same build, and it costs a
 * golden recapture. These do not vary per run: a pulsar is the same pulsar in
 * every field, so it is a table beside the generator, exactly as `KNOBS` is a
 * table beside the tune panel and `LEVEL` is a table beside the accolades.
 *
 * What DOES vary per run is how many of each a field contains and where — and
 * that is `CourseSpec`, which stays in the config. See F08.
 */
export interface BodyType {
  id: BodyTypeId;
  /** Radius range the generator draws from. */
  radius: readonly [min: number, max: number];
  /** Everything the body can DO. See `BodyTraits`. */
  traits: BodyTraits;
  /** Which `Body.kind` the union member is built as. */
  kind: Body['kind'];
}

export const BODY_TYPES: Readonly<Record<BodyTypeId, BodyType>> = Object.freeze({ ... });
```

`anomalyCount` and `bodyCount` stay in `SimConfig` — they are per-run and the
course picker already changes them. The other six anomaly keys move into the
table and out of the config.

## Steps

### 1. Land F01 first

The table's `traits` field is `BodyTraits`. Without it there is nothing to put in
the table but six loose numbers, which is the current problem wearing a new hat.

### 2. Create the table with the current values, still read from config

Build `BODY_TYPES` with `anomaly`'s traits populated from `DEFAULT_CONFIG`'s six
keys, and have `placeAnomalies` read the table instead of the config. Keys still
exist; nothing reads them but the table constructor.

**Verify** gate `0.000e+0`, golden unchanged. `PROTOTYPE_CONFIG` has
`anomalyCount: 0`, so the prototype builds no anomalies at all and cannot notice.

### 3. Delete the six keys

Remove `anomalyOffset`, `anomalyBubble`, `anomalyOrbitR`, `anomalyOrbitPeriod`,
`anomalyRefuel`, `anomalySettleDur` from `SimConfig`, both config objects, and
`tools/replay-core.ts`'s key lists if any are named there.

**This is the step with a real cost.** Removing a key changes the config compare,
so a report recorded before this lands will classify those six as "missing" rather
than "matching". Check `configFromReport` handles absence — it fills missing keys
from `PROTOTYPE_CONFIG`, and these will no longer exist there either.

**Verify** `pnpm golden:capture` then `pnpm check`. The golden holds captured
numbers, and removing keys that never affected the prototype's trajectory should
leave the numbers identical — if it does not, something read one of those keys
outside `placeAnomalies` and needs finding.

### 4. Add one new type as the proof

Not four. **One** — and make it the cheapest: a `ringed` body, which Direction 04
describes as "flat band — no tilt, no depth" and which differs from a planet only
in drawing and (later) a drag band on contact. If adding it touches any file
outside `bodies.ts` and `render/world.ts`, the table is not finished.

`anomalyAtSpawn` stays a config key and stays in `DEV_KEYS` — it is a dev-shell
override of _placement_, not a property of the type.

## Gates

| Gate          | Expected                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| Equality gate | `0.000e+0`. `PROTOTYPE_CONFIG` builds no anomalies.                             |
| Golden        | **Recapture at step 3**, when the six keys are deleted.                         |
| Fingerprint   | Unchanged.                                                                      |
| `SIM_VERSION` | **No bump** for steps 1–3. Bump when step 4 adds a type that a run can contain. |

## Traps

- **Draw order is part of the field.** `createBodies`' header says so explicitly:
  "The single-body path draws x, then the vertical gap, then the radius, exactly
  as it did before rows existed." A table-driven generator must preserve the
  `rnd()` call order _per type_, or every existing seed relays out and no two
  recorded sessions are comparable again. The radius range moving into the table
  is safe only because it is still one `rnd()` in the same position.
- **`34 + rnd() * 22` is written twice** in `createBodies` — the fork path and the
  single path. Both are "the authored range" from `DEFS`. Moving it to the table
  fixes a genuine duplicate; make sure both sites move.
- **`placeAnomalies` draws its radius from the shared stream** (`40 + rnd() * 16`)
  _after_ the corridor is placed, deliberately, so "a seed's corridor is the same
  corridor whether `anomalyCount` is 0 or 3." Keep the anomaly pass after the
  corridor pass and keep its draws in order.
- **Do not fold `bodyCount` into the table.** It is per-run, the course picker
  changes it, and `tools/replay-core.ts` knows it by name as a `COURSE_KEY`.

## Done when

`grep -c '^  anomaly' src/sim/config.ts` returns 2 (`anomalyCount`,
`anomalyAtSpawn`), and adding a body type is a row in `BODY_TYPES` plus a case in
`render/world.ts`'s draw switch.
