# F11 · Screen machine

**Severity** COSTS · **Blocks** Directions 09, 10, 11 · **DEFERRED**

> Deferred until a second screen exists. Nothing in `src/` depends on
> `app/main.ts`'s shape, so this can wait — but it must not wait _past_ that,
> because the second screen is where the globals start being read from two places.

## Why

`app/main.ts` is 982 lines of module-scope mutable state: the canvas, both
contexts, the sim config, the state, the score, the recorder, three input edge
flags, a pause flag, two snapshots, five deadline-cache variables, a sheet record,
and a DOM debug panel.

The run lifecycle is two phases, `armed` and `running`. The sheet is a nullable
object with an ad-hoc clock and its own dismissal rules.

Directions 09–11 add: a front door that is the bottom of the live field, a debrief
card over the crash site, a results sheet composed to a 4:5 safe frame, a
standings board drawn as the field itself, and ghost replay. Each is a screen with
its own input grammar — and Direction 09 insists all of them keep the single-verb
scheme (_"tap anywhere = primary verb, hold = secondary. No buttons."_), which is
a **constraint on a state machine**, not a rendering detail.

## The shape

An explicit screen machine holding what each screen needs, with input dispatched
by screen rather than by three module-scope edge flags.

The recipe line (Direction 10) should land at the same time, because it is already
free: a run is `(config, seed, inputLog)` and `RunRecorder` already produces
exactly that. `APH-214-KX7Q` is a serialisation of something the codebase has had
since the port — plus a checksum and a base32 alphabet.

## Notes for when it starts

- **`sheetReadable()` / `dismissSheet()` already encode a real rule** — the sheet
  goes as soon as it is readable and one tap takes it away, so "the cost of a bad
  run is a beat rather than a wait." Preserve that, and note it is why the
  worthiness gate was removed.
- **Input is dropped, not eaten, during the ending hold**, and it is _recorded_ as
  dropped — "the log has to be what the simulation was fed or a replay stops
  reproducing the run." Any dispatcher must keep that property.
- **`app/main.ts` is inside `tsconfig.json`'s `include`** and is typechecked. It
  is not, however, covered by `pnpm portable` — and it uses `Math.hypot` at
  `main.ts:518` for teleport detection. That is legal there (it feeds no
  trajectory) but it is exactly the line someone will copy into `src/sim/`. Worth
  a comment saying so.
- **The attract loop already renders a screen that is not the game** —
  `src/render/attract.ts` — and its header argues at length for authored rather
  than simulated presentation. It is the precedent for the front door.
