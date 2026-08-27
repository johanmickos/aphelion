# F06 · Effects stack

**Severity** COSTS · **Blocks** powerups · **Depends on** F01 (bank the fingerprint churn together) · **DEFERRED**

> Deferred until there is a first powerup to build. Cheap once, expensive
> repeatedly — but only worth paying when the count leaves zero.

## Why

`src/sim/contact.ts` is the best-shaped file in the simulation. It collapsed three
copies of one operation into a policy table and wrote down the payoff: _"A shield
is therefore a policy flip, not a feature: it clears `lethal` on the drift row,
which lands the ship on the bounce branch that already exists."_ It declares
`interface Effects { shield?: boolean }` to make that true.

**No caller passes it.** Both call sites — `step.ts:606` and `step.ts:955` — take
the default `{}`, and `Effects` appears nowhere else in `src/`. The seam is cut
and not connected, so the shield is still a feature: something has to _own_ the
effects, and nothing does.

## What the eight ideas in `IDEAS.md` need

- **A holder.** `SimState` has no field for active effects, and effects are
  stateful — "infinite fuel for 5s" is a countdown.
- **A fingerprint decision.** `chargedT` and `carveDir` are both deliberately
  excluded from `fingerprint()`, and both comments give the same reason: they
  change the trajectory the moment they act, and the position and velocity already
  hashed catch that. **A shield does not follow that rule.** It changes what a
  contact does without moving anything first, so it must be hashed — and that
  invalidates the checkpoints in every existing `diagnostics/` report.
- **A source.** Pickups are entities in the world. `Mote` is the precedent, and
  its header explains at length why it is _not_ a `Body.kind`: a body has mass and
  a surface, and each of those facts is load-bearing somewhere — `fieldBounds`
  takes the crest from the topmost body, so a pickup above the last planet **would
  move the finish line**.

## The shape

A timed modifier stack on `SimState`. The economy of mechanism matters here:
`chargedT` is _already_ a timed modifier that changes what a press does. The
second one should generalise that, not invent a parallel system.

```ts
/** Active effects, each with seconds remaining. Drained by dt in stepSim. */
export interface Modifiers {
  shield: number; // seconds of one free lethal contact
  freeFuel: number; // seconds of no burn
  reach: number; // seconds of extended grabRange
}
```

Threaded to the two `contactPolicy` calls that already accept it, and read by
`burn()` in `fuel.ts` and by `grabTarget`'s range test.

`chargedT` should fold into it once the shape is proven — but not in the first
commit, because it is load-bearing and well-documented where it is.

## Steps

1. Add `Modifiers` to `SimState`, all zeros, drained in `stepSim` alongside
   `chargedT`. Nothing reads it.
2. Thread it to both `contactPolicy` calls as the existing `Effects` parameter.
3. Add the fingerprint fields **once**, together with any other state F01/F02
   need. Bump `SIM_VERSION`. Note in `PORT_NOTES.md` that reports before this
   point diverge at their first checkpoint.
4. First pickup: reuse the `Mote` pattern — its own list on `SimState`, collected
   by proximity, reset on respawn. Not a `Body.kind`.

## Gates

| Gate          | Expected                                                |
| ------------- | ------------------------------------------------------- |
| Equality gate | `0.000e+0` — every modifier is 0 in `PROTOTYPE_CONFIG`. |
| Fingerprint   | **Changes at step 3.** Bank it once.                    |
| `SIM_VERSION` | **Bump at step 3.**                                     |

## Traps

- **Do not make pickups a `Body.kind`.** `Mote`'s header lists the four subsystems
  that would each need a `kind !== 'pickup'` guard, and the finish-line move is
  the one that is silently catastrophic.
- **`IDEAS.md` proposes some effects that are not modifiers.** "Rewind" and "undo
  action" rewind _state_, which is a different mechanism entirely and would need
  ring-buffered snapshots. Do not let them into this plan.
- **Autopilot would be a second verb.** VISION's first pillar: _"A second verb is
  not a feature, it is a repeal."_ Flag it rather than building it.
