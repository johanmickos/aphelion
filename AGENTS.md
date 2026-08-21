# Working in this repo

Orientation lives in `README.md`; the record of what changed and why lives in
`docs/PORT_NOTES.md`. This file is rules only — the things that are true across
sessions and that a fresh agent would otherwise break.

## Non-negotiable

1. **`index.html` is immutable.** It is the 1254-line prototype the TypeScript
   port is proved against, not a build artifact and not legacy code. Never edit,
   format, or lint it. It is in `.prettierignore` for this reason.
2. **The equality gate stays at exactly zero.** `node tools/diff-report.ts` must
   read `0.000e+0` across all ten scenarios. A change that moves it off zero is
   either wrong or belongs behind a config flag (see below). Zero is not a target
   that is approached; it either holds or the port has stopped being a port.
3. **`pnpm check` before every commit.** Typecheck, lint, format, portability,
   scenario bounds, golden, and the full test suite.
4. **No runtime dependencies.** `dependencies` is empty and stays empty. Vite,
   Vitest, ESLint, Prettier and TypeScript are build-time only.

## The config split

`PROTOTYPE_CONFIG` is frozen: it is what keeps the fidelity proof alive.
`DEFAULT_CONFIG` is the game and tunes freely. New behaviour that diverges from
the prototype goes behind a flag that is `false` in the prototype config and
`true` in the default one — that is how the clearance fix (note 18) shipped while
the gate stayed at zero.

Adding a key means adding it to both objects and re-running `pnpm golden:capture`.

## Scoring is not `SimConfig`

`src/score/` is an observer: it runs after `stepSim`, reads `SimState`, and the
simulation never learns it exists. Keep it that way — that is what makes a score
a pure function of `(config, seed, inputLog)` and lets a replay recompute the
score a phone session showed. `pnpm portable` checks `src/score/` too: it may
import from `src/sim/` and nothing else.

Score weights live in `src/score/config.ts`, never in `SimConfig`. Putting one in
`SimConfig` drags it into the equality gate's config compare, forces a golden
recapture, and — if it also reaches the tune panel — fails `test/tune.test.ts`,
which measures a knob by how far it moves the ship. `test/score.test.ts` keeps the
equivalent promise for score weights: every key in `ScoreConfig` must change some
session's score. A value that only defines _when_ something is judged, never what
it costs, is a constant next to its code, not a weight.

## Simulation rules

- Fixed timestep. `dt` is a parameter, never a global, and nothing under
  `src/sim/` reads a wall clock. All timing derives from `state.tick`.
- `clearEaseFrames` is the **only** legal frame-denominated constant. Do not add
  a second; each one silently re-tunes itself if the timestep changes.
- **Never `Math.hypot`.** Use `hypot()` from `src/sim/orbit.ts`, which is
  `sqrt(x*x + y*y)`. `Math.hypot`, `atan2`, `sin` and `cos` are
  implementation-approximated and disagree across JS engines; only `Math.sqrt` is
  correctly rounded. See note 16.
- A run is `(config, seed, inputLog)`. Anything that makes the simulation depend
  on something else breaks diagnostics replay, which is the only tool for
  debugging what the author actually felt on a phone.
- Bump `SIM_VERSION` when behaviour under `src/sim/` changes. It is what lets a
  replay tell "you were running older code" apart from "the simulation is
  non-deterministic". A change to a value outside `fingerprint()` in
  `src/sim/serialize.ts` does not need a bump — check before bumping reflexively.

## Where rationale goes

**Next to the code it explains.** `DESIGN.md` and `FEEL.md` both existed and were
both deleted, because a separate document describing how the code should behave
drifts away from the code — `DESIGN.md` ended up listing thirteen config keys that
no longer existed and two mechanics that were never implemented.

`docs/` therefore holds `PORT_NOTES.md`, which is history and cannot go stale, and
`IDEAS.md`, which belongs to the author. Do not create a new standing design
document. If something needs explaining, explain it at the site that would tempt
someone to change it.

## `docs/` is author-owned

Prettier ignores everything under `docs/` except `PORT_NOTES.md`. Do not reformat
the author's files, and do not commit their in-progress edits alongside your own.

## Tests

- A knob that does nothing is worse than no knob: `test/tune.test.ts` asserts
  every tune-panel slider moves the simulation. Its scenarios have blind spots —
  a knob can measure as inert because no scenario reaches the part of the run it
  governs. Check that before concluding a knob is dead.
- When a documented defect is fixed, the assertion that pinned it should fail
  loudly and specifically. That is the point of pinning it. Update the pin to
  assert the new truth rather than deleting it.

## Working with the author

Batch the simple changes for review together; take the tricky ones one at a time.
Analysis alone is not the deliverable — when a problem is identified, implement
the fix alongside the recommendation unless asked otherwise.

## Git

Work happens on `prototype`; `main` is the default branch. Commit messages explain
why, not what — the diff already says what.
