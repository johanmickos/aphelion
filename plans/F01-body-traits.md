# F01 · Body traits

**Severity** BLOCKS · **Blocks** Direction 04 (five body types) · **Depends on** nothing

## Why

`src/sim/types.ts` opens by promising the union is deliberate: "adding a `kind`
makes the compiler enumerate every site that must handle it." It does — and it
enumerates **fourteen sites across nine files**. Only one of them,
`contactPolicy`, is written as a table. The other thirteen are inline
`kind === 'anomaly'` tests.

Those thirteen are not thirteen copies of one idea. They are **six distinct
capabilities** an anomaly happens to hold at once. Direction 04 adds binary,
pulsar, ringed and black hole, each holding a _different_ subset — so written as
more name tests, every one of those thirteen sites grows a five-way switch, in
files that must not know about each other. `src/score/aim.ts` would end up
holding an opinion about how a pulsar draws, because the exclusion list is where
the knowledge lives.

The fix is already argued for in the codebase. `Anomaly` holds `bubble`,
`orbitR`, `orbitPeriod`, `refuel` and `settleDur` **on the body**, and the
comment says why: "so that anomalies of different kinds can differ without any of
this moving." That reasoning was never carried to the other capabilities.

## The map — every site, and the trait it wants

| Site                         | What it tests                               | Trait                   |
| ---------------------------- | ------------------------------------------- | ----------------------- |
| `sim/capture.ts:369`         | anomaly authors its own arrival             | `authored`              |
| `sim/capture.ts:372`         | `zipped = kind !== 'anomaly'`               | `authored`              |
| `sim/step.ts:721`            | `freezeOrbit` gets the anchor if it authors | `authored`              |
| `app/main.ts:592`            | `orbitLock(..., isAnomaly)` — tighter lock  | `authored`              |
| `sim/world.ts:383`           | `inAnomalyField` — the boundary exemption   | `shelter`               |
| `render/camera.ts:600`       | `anomalyFocus` — lead toward the bubble     | `shelter`               |
| `render/camera.ts:633`       | `barrierRelax` — camera relaxes inside it   | `shelter`               |
| `sim/capture.ts:625`         | release opens the charged window            | `charges`               |
| `score/score.ts:834`         | pays `anomalyBonus`, once per life          | `bounty`                |
| `score/score.ts:815`         | an anomaly is never a hop                   | `bounty`                |
| `score/aim.ts:230`           | excluded from the compass reading           | `routable`              |
| `score/aim.ts:319`           | an anomaly is never an aim _anchor_         | `routable`              |
| `score/aim.ts:324`           | found on the anomaly channel specifically   | `landmark`              |
| `render/edge-markers.ts:101` | shown even when behind, down the climb      | `landmark`              |
| `render/sheet.ts:183`        | counted as anomalies, for `2 / 3`           | `landmark`              |
| `render/sheet.ts:173`        | counted as course progress                  | `counted`               |
| `render/world.ts:448`        | which draw function                         | _stays a `kind` switch_ |
| `render/edge-markers.ts:79`  | marker hue                                  | _goes to F03_           |
| `render/edge-markers.ts:131` | arrow hue                                   | _goes to F03_           |

### Three traits that hold the same value today

`routable`, `landmark` and `counted` are exact complements across the two kinds
that exist, and it is tempting to collapse them into one. **Do not.** They come
apart on the very next body type: a pulsar is routable, counted and not a
landmark; a black hole is plausibly a landmark _and_ routable. Collapsing them
now means discovering that as a bug in three files later.

This is the same argument `FieldBounds` already makes for `crest` versus `top`:
"Named rather than left implicit because two different lines hang off it and they
mean opposite things."

### Two that stay where they are

`render/world.ts:448` is a `switch (b.kind)` picking a draw function, and that is
what a discriminated union is _for_ — the compiler checking that every kind draws.
Leave it. The two `edge-markers.ts` colour tests are colour, so they belong to
F03; leave them until then rather than inventing a `markerHue` trait that F03 will
delete.

## The shape

```ts
// src/sim/types.ts

/**
 * What a body DOES, as opposed to what it is called.
 *
 * Every field here replaced an inline `kind === 'anomaly'` test in a file that
 * had no business knowing about anomalies. A subsystem asks for the capability
 * it needs; it never asks for the name of a type.
 */
export interface BodyTraits {
  /** The orbit a capture here settles into, or null to inherit one from the dive. */
  authored: AuthoredOrbit | null;
  /** Radius within which the side boundary is suspended. 0: none. */
  shelter: number;
  /** Seconds of charged window a release from here opens. 0: none. */
  charges: number;
  /** Flat award for arriving, paid once per life. 0: none. */
  bounty: number;
  /** Offered to aim, the compass and hop scoring as an ordinary target. */
  routable: boolean;
  /** Signposted on its own channel, and worth pointing back down the climb at. */
  landmark: boolean;
  /** Counts toward "planets cleared" on the results sheet. */
  counted: boolean;
}
```

`Planet` and `Anomaly` both gain `traits: BodyTraits`. The anomaly's existing
`bubble` / `orbitR` / `orbitPeriod` / `refuel` / `settleDur` fields **move into**
the traits — `shelter` is `bubble` renamed for what it does, and the four orbit
fields are exactly `AuthoredOrbit`, which already exists as an interface and which
`Anomaly` already satisfies structurally.

## Steps

Each step lands green on its own. Commit separately.

### 1. Add `BodyTraits`, populate it, change nothing

Add the interface. Give `createBodies` a `PLANET_TRAITS` frozen constant (all
zeros / `routable: true` / `landmark: false` / `counted: true`) and build the
anomaly's traits from the same config keys `placeAnomalies` reads today. Every
existing `kind === 'anomaly'` test stays exactly where it is.

**Verify** `pnpm check` green, gate `0.000e+0`. Nothing reads the new field yet,
so nothing can have changed.

### 2. Move the four unambiguous traits

In one commit, replace:

- `capture.ts:369` → `const authored = p.traits.authored ?? zipOrbit(state, cfg, cap, p)`
- `capture.ts:372` → `cap.zipped = p.traits.authored === null`
- `step.ts:721` → `freezeOrbit(cap, cfg, anchor?.traits.authored ?? null)`
- `capture.ts:625` → `if (body.traits.charges > 0) state.chargedT = body.traits.charges`
- `world.ts:383` → `if (b.traits.shelter <= 0) continue` and `shelter*shelter`
- `camera.ts:600,633` → same, `b.traits.shelter`
- `main.ts:592` → `orbitLock(cap.phase, cap.settleProgress, body.traits.authored !== null)`

**Verify** gate `0.000e+0`. This is the step the gate exists to prove: it is a
pure substitution and any behaviour change is a mistake.

Note `capture.ts:625` drops the `cfg.chargedSecs > 0` guard, because `charges` is
built from `chargedSecs` and is already 0 in `PROTOTYPE_CONFIG`. Check that in the
constructor, not at the use.

### 3. Move `bounty`

`score.ts:834` becomes `body.traits.bounty > 0 && !sc.claimed.includes(...)`, and
`score.ts:815` becomes `body.traits.bounty === 0` — "arriving here is paid by its
own award, so it is not a hop" is the actual rule, and it reads better as one.

**Verify** `pnpm test`. The gate does not cover `src/score/`; `test/score.test.ts`
and `test/anomaly.test.ts` do.

### 4. Move `routable`, `landmark`, `counted`

Three traits, one commit, with the naming argument above written at the interface.
`aim.ts:230` → `!b.traits.routable`; `aim.ts:319` → `!anchor.traits.routable`;
`aim.ts:324` → `b.traits.landmark`; `edge-markers.ts:101` →
`!b.traits.landmark && b.y >= snap.y`; `sheet.ts:173` → `!b.traits.counted`;
`sheet.ts:183` → `b.traits.landmark`.

**Verify** `pnpm test`, plus `node tools/replay.ts` on a diagnostics file with
anomalies in it — the compass reading feeds the aim score, so a mistake here is
visible as a changed award and not as a changed trajectory.

### 5. Prune the dead comments

Several of the sites carry long comments explaining the anomaly special-case.
Most are still true and should move with the test. `aim.ts:230`'s comment about
re-scaling the aim percentiles is the one that must survive verbatim — it explains
a measurement, not a mechanism.

## Gates

| Gate          | Expected                                               |
| ------------- | ------------------------------------------------------ |
| Equality gate | `0.000e+0` at every step. Steps 1–2 exist to prove it. |
| Golden        | Unchanged — no `SimConfig` key added or removed.       |
| Fingerprint   | Unchanged — traits are per-body, not per-state.        |
| `SIM_VERSION` | **No bump.** Behaviour under `src/sim/` is identical.  |

## Traps

- **`configFromReport` fills missing keys from `PROTOTYPE_CONFIG`.** Traits are
  built from config at world-construction time, so an old report still
  reconstructs its own field — but only if the trait constructor reads the same
  keys in the same way. Do not change what `anomalyBubble` _means_ in this plan.
- **`placeAnomalies` calls `rnd()` in a fixed order** and `anomalyAtSpawn`
  overrides a position rather than branching, deliberately, "so `rnd()` is called
  the same number of times in the same order." Building traits must not add or
  reorder a draw. Build them after the position, from config, not from `rnd()`.
- **`Anomaly` already satisfies `AuthoredOrbit` structurally.** That is why
  `capture.ts:369` can pass `p` directly. Once the fields move into
  `traits.authored`, the structural coincidence goes away and the compiler will
  find every site that relied on it — which is the point, but expect a handful.

## Done when

Zero occurrences of `kind === 'anomaly'` or `kind !== 'anomaly'` outside
`src/sim/types.ts` and `render/world.ts`'s draw switch. Verify with:

```
grep -rn "kind === 'anomaly'\|kind !== 'anomaly'" src/ app/
```

Two hits expected, both in `edge-markers.ts`, both colour, both owned by F03.
