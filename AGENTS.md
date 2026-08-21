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
session's outcome. A value that only defines _when_ something is judged, never
what it costs, is a constant next to its code, not a weight.

Measure a session by `score.best`, not `score.score`. The score is the current
_life's_ and a death zeroes it, so at the last tick of a recording it is usually
zero — which will make any weight you are testing look dead.

**Thresholds are measured, never chosen.** Every praise threshold in
`src/score/praise.ts` and `reckless.ts` is a percentile of real play, replayed out
of `diagnostics/`. Round numbers get this wrong in both directions: gated at a
plausible 0.90 the boost-peak word fires zero times in 112 releases, and the kink
line at 15 degrees praised 42% of captures. Re-measure under the CURRENT config —
recordings predate whatever was tuned last, and a threshold calibrated on a stale
feel is worse than an unmeasured one, because it looks defensible.

**A capture is two scoring events.** A `grab` is judged on how the ship arrived
and pays when the dive swings through periapsis; a `link` is judged on how it left
and pays at the release. Neither carries the other's qualities. The grab does not
pay at the press, and must not be "simplified" to: beside a planet you are already
close to the surface, so every tap would be a tight grab and tapping in place
would be a points faucet.

**Colour means how good, the word means what.** Colour is the rarity ladder in
`src/render/accolade.ts` and encodes nothing else; the category is carried by the
word, and every word names its own axis. Do not re-add a category colour or a
label naming the axis — both were tried, and a vocabulary that needs a caption is
a vocabulary that has not been chosen carefully enough. `src/render/accolade.ts`
is the only place a colour is picked, so the score band and the popups cannot
drift apart.

## Reading a diagnostics report

This is the main debugging loop, and the easiest thing in the repo to misread.

1. **Check fidelity before believing anything.** `node tools/replay.ts <file>`
   grades itself. Past the first differing checkpoint the replay is a different
   run and nothing it says about that stretch is evidence. The tool names the last
   bit-exact tick; everything before it IS the session that was played.
2. **A diverged replay is almost never non-determinism.** The simulation is
   deterministic and the suite proves it. What differs is the ENGINE: note 16
   replaced `Math.hypot` and left `sin`, `cos` and `atan2`, which the phase clock
   calls every tick of a settle. A capture amplifies the difference and a respawn
   wipes it, so a long unbroken chain of captures forks while a crash-heavy
   session four times its length replays perfectly.
3. **The recorded checkpoints are phone truth even when the replay is not.** They
   carry real positions, velocities and fuel every 60 ticks, and the world is pure
   arithmetic off a fixed seed — so a body's coordinates are identical however far
   the replay drifted. A grab can be reconstructed from the checkpoint before it
   plus straight-line drift. Do that rather than giving up on the report.
4. **Check `loadedAt` against when the thing being reported on shipped.**
   `simVersion` and `config` describe the simulation and say nothing about the
   build around it, so a session played on a stale bundle is otherwise
   indistinguishable from one played on the current one.

The header separates three ways a config can differ from the current defaults,
because only one of them is a reason to distrust the report: keys in `KNOBS` are a
deliberate experiment and print as `tuned`, `worldSeed` is a different world and
prints as `field`, and everything else is build skew — which is the only case that
raises "THIS REPORT CAME FROM A DIFFERENT BUILD". Keep that split when adding a
key that a player can change at runtime, or the banner goes back to crying wolf on
ordinary play and then blaming the knob for a divergence it did not cause.

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
  governs. Check that before concluding a knob is dead — and note that checking
  thoroughly is not the same as checking the right mechanism. `fuelRegen` was
  pinned as dead on the strength of several scenarios, all of which exercised the
  grab gate (`fuel <= 0.5`) when the live one was the flyby brake (`fuel > 0`).
- When a documented defect is fixed, the assertion that pinned it should fail
  loudly and specifically. That is the point of pinning it. Update the pin to
  assert the new truth rather than deleting it.

## Working with the author

Batch the simple changes for review together; take the tricky ones one at a time.
Analysis alone is not the deliverable — when a problem is identified, implement
the fix alongside the recommendation unless asked otherwise.

**Diagnose and confirm before building anything that is a design decision.** A
bug with one right answer: fix it. A question about what the game should reward,
how it should feel, or what the player should see: measure it, show the numbers,
and get the call. Two features in one session were built and then rebuilt because
that step was skipped.

## Git

Work happens on `main`. The `prototype` branch is gone: the port is finished and
proved, and what is being built now is the game.

**A push to `main` publishes.** `.github/workflows/deploy.yml` builds and deploys
to GitHub Pages on every push, so pushing is shipping. Commit freely; push
deliberately, and only when asked.

CI runs `pnpm check:ci` — `pnpm check` minus `golden:check`. That is deliberate,
not a gap: the golden baseline holds numbers captured on the author's arm64
machine, and V8 approximates `Math.sin`/`cos`/`atan2` differently on x64, so it
fails on a runner by ~1 ulp for reasons that have nothing to do with the change.
Run the full `pnpm check` locally, where the golden means something. The real
fidelity proof is `port-equality`, which runs the prototype and the port in one
process and is inside `pnpm test`.

Splitting a session's work into themed commits usually means parking files that
belong to a later commit. **Copy them somewhere outside the repo first.** A
`git checkout --` over a file list destroys uncommitted work with no reflog and no
recovery; it cost a full rebuild of one feature in the session this was written.

Commit messages explain why, not what — the diff already says what.
