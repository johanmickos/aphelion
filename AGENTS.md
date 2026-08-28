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

Measure a session by `score.best`, not `score.bank`. The bank is the current
_life's_ and a death zeroes it, so at the last tick of a recording it is usually
zero — which will make any weight you are testing look dead. `score.carry` is
smaller than either and zeroes at every release: it is what is at stake, not what
has been paid.

**Anything drawn after a run ends must read `score.lastRun`**, the copy sealed on
the ending tick, and never the live fields. `endLife` runs on the FIRST tick of
the ending hold, so by the time a results screen or a HUD readout draws, the run
it is describing has already been reset. This has now caught two things that
looked correct and rendered zeroes: the results sheet, and the score band during
the entire victory ceremony.

**Thresholds are measured, never chosen.** Every praise threshold in
`src/score/praise.ts` and `reckless.ts` is a percentile of real play, replayed out
of `diagnostics/`. Round numbers get this wrong in both directions: gated at a
plausible 0.90 the boost-peak word fires zero times in 112 releases, and the kink
line at 15 degrees praised 42% of captures. Re-measure under the CURRENT config —
recordings predate whatever was tuned last, and a threshold calibrated on a stale
feel is worse than an unmeasured one, because it looks defensible.

## The economy

**One source, four multipliers.** A swing earns
`carry × tier × band × streak`, and the carry is metres climbed while engaged,
priced as they are climbed by the chain and multiplied whole by the tightness of
every arrival. Nothing else in the game mints a point except a carpet dot. That is
Direction 08's constitution, it landed as F04 stage (b), and the reasoning is in
`src/score/config.ts` at each key with the measurements in PORT_NOTES 73-74.

**Never add a key that mints.** Eleven were deleted for it — `linkBase`,
`closeBonus`, `timingBonus`, `aimBonus`, `nerveBonus`, `flybyBase`,
`flybyCloseBonus`, `rescueBonus`, `rescueSpan`, `anomalyBonus`, `hopBonus` — and a
twelfth, `burnRate`, stopped minting per second near the wall and became the scale
that turned edge depth into a band — and then the band itself was deleted, because
a ladder chosen by an integral and applied to a whole swing paid a two-tenths-of-a-
second graze for 813px of climb earned nowhere near the wall. `fireBoost` prices
the metres climbed IN the fire instead. Same axiom, right metres. A new axis is priced as a multiplier on the
carry or it is not priced. Axiom 2: skill only multiplies.

**Every multiplier has a pixel, drawn before it scores.** Tightness is the grip
gradient above a body's minimum-orbit ring; the band is the three steps in the
hazard gradient; the tier is the boost halo and the compass markers; the chain is
the craft's bloom; the streak is the ×N. A praise word after the fact does not
count — it arrives after the score. If a rule cannot point at its pixel, the rule
is wrong.

**The fire prices metres, not swings, and that is a ruling rather than a tuning.**
It was a three-rung band at the cash step and it failed in three directions at
once, all reported from one session: a graze that doubled a whole swing and paid
4.6x the p90; the deepest burn of the same run paying ZERO because that swing
climbed nothing; and a pass visibly inside the red earning nothing because the
integral had not crossed a threshold with no pixel. One decoupling — the payout was
chosen by a threshold and then applied to a carry earned somewhere else — pointing
three ways.

`ScoreConfig.fireBoost` makes it a rate on the accrual, beside the chain, which is
where F04 already put every axis that describes how a swing was FLOWN rather than
how it was released. Do not move it back to the cash step, and do not add a rung:
the continuous hazard gradient is the pixel precisely because depth IS the price,
and a rung would need an edge the geometry cannot honestly draw.

**Mean heat over the stretch, never this tick's.** `holdClimbInCapture` freezes
`highWaterY` for a whole capture, so a swing's metres arrive as ONE LUMP at the
release. Pricing that lump at the release tick's heat prices an entire capture by
its final frame — the first version of `fireBoost` did exactly that and was the
old defect relocated. The integral and its span are both in `ScoreState`, and the
span is the half that is easy to drop.

**The score says how far you got and how well you were flying while you got there,
and a capture is how progress is BOUGHT rather than a thing paid for on its own.**
`holdClimbInCapture` freezes the climb for a whole capture, so orbiting banks
nothing and a close exciting capture that comes back where it started pays almost
nothing. That is axiom 1 working, it has been reported as a defect four times in
different words, and PORT_NOTES 78 has the measurement: arrival tightness is
uncorrelated with what a swing pays (r 0.033), because climb spreads 4.6x across
real swings and tightness spreads 1.32x.

**Do not "fix" it by turning up a quality axis.** Both obvious ones make it worse,
measured: sharpening tightness favours PASSES, whose arrivals run p50 0.81 against
a release's 0.64, and the tier does too — passes reach PERFECT on 35% of swings
against a release's 10%. The three levers that would actually work are in
PORT_NOTES 78 and every one of them is a constitutional change.

**A capture is two scoring events.** The arrival is judged on how the ship arrived
and prices the carry when the dive swings through periapsis; the release is judged
on how it left and cashes at the release. Neither carries the other's qualities.

The arrival does not price at the press, and must not be "simplified" to — but the
reason has changed and the old one is dead. It used to be a faucet argument: beside
a planet you are already close to the surface, so every tap would be a tight grab.
Under a pure multiplier a tap in place has climbed zero metres, so `0 × anything
= 0` and the faucet is structurally impossible. What the rule survives on is the
receipt: two acts, graded at two moments, each with its own pixel.

**There are three award kinds and there used to be seven.** `link`, `flyby` and
`mote`. `grab`, `hop`, `burn` and `rescue` went with F04 — not by a popup policy
but because none of them mints, so none of them is a payment. That removed 47% of
every popup in the game, and each axis still scores as a multiplier announced by a
pixel. Do not re-add one to give an act a receipt: the receipt is the carry moving.

**Colour means how good, the word means what — on an AWARD.** Colour is the
rarity ladder in `src/render/accolade.ts` and encodes nothing else there; the
category is carried by the word, and every word names its own axis. Do not re-add
a category colour or a label naming the axis to an award — both were tried, and a
vocabulary that needs a caption is a vocabulary that has not been chosen carefully
enough.

The rule is about awards, and the boundary matters because other cue systems
DELIBERATELY colour by category and always have: the edge markers are blue for a
planet and purple for an anomaly, the finish is green wherever it appears (arrow,
chequers, notice), a run ending is `DEBRIEF` indigo, and the ceremony is the
ladder's gold. None of those answers "how good was that?", so none of them is on
the ladder. A new colour has to say which system it belongs to.

**`palette.ts` DEFINES a colour; `accolade.ts` PICKS one.** The palette holds the
values so a hue can be retuned in one place; the accolade table still owns the
mapping from rarity to style, which is what stops the score band and the popups
drifting apart. Do not move the mapping into the palette — that was the original
defect, where the band coloured by event and the popup by category.

## The ending

A run can end four ways, and `cleared` is the only one that is not a failure: the
ship rose past the topmost body, so there is no more field to fly. It is an
`EndingReason` like the others because everything downstream already knows how to
stop for one — the scorer seals the run, the recorder closes the log, the renderer
holds the frame.

**Two geometries, each with exactly one definition, both in `src/sim/world.ts`.**

- `finishLineY(cfg, fb)` — where the run ends as `cleared`.
- `runInBand(cfg, fb)` — the stretch the funnel pulls through, the bumpers guard
  and the chevrons are drawn over.

Do not re-derive either. `crest - grabRange` was written by hand in three places
and the band in two, and both sets agreed only because they were the same
expression — which is how a renderer ends up painting a finish line somewhere the
simulation does not end the run. Both bugs were real and both were silent.

Everything else about the ending follows rules already stated elsewhere in this
file: `clearAtTop`, the funnel and the bumpers are `SimConfig` keys that are OFF
in `PROTOTYPE_CONFIG`, so the equality gate stays at zero; the ceremony and the
sheets are `src/render/`, authored rather than simulated, for the reasons
`src/render/attract.ts` gives at length.

**The carpet is a play zone, and the button means something else in it.** Inside
`runInBand` a press does not grab: `grabTarget` returns `carved`, which is a
fourth kind of answer beside `captured` and the refusals. That is a rule and not
an emergence, and the measurement is why — the crest body stays grabbable for
`grabRange` (560) above itself, which is the lower two thirds of an 840-tall band,
so a press over most of the carpet took the planet. Do not "simplify" it back to
carving only when no grab is on offer; that was the first version and it never
fired once, and it would now be worst exactly where the carpet is busiest.

The two numbers were equal once and `finishAboveCrest` is where they stopped
being: `grabRange` is the correctness FLOOR (below it the run ends while the
player is still reaching for the last planet) and `finishFunnelDepth` is the FEEL
setting (how much sky the carpet gets). Read the band from `runInBand`; never
reconstruct it by adding a depth to the finish line.

The carve is a flat LATERAL acceleration, never a turning force. A sideways push
on a ship that is always rising cannot reverse the climb however long it is held,
which is how "no going backwards" is a property of the force rather than a clamp
bolted on after it. `carpetLift` only has to catch a ship that arrived falling,
and it is a one-sided spring rather than a clamp on `vy` for the reason its note
gives.

**The carpet's output is a decision, not a picture.** A drift signature — the
line the ship drew through the run-in, recorded and shown on the ceremony — was
built here and removed. Do not rebuild it without reading PORT_NOTES 63: it was
measured over 96 runs and is ANTI-correlated with playing well, because the
funnel's centring spring cancels each carve, so the busiest input draws the
straightest line and one lazy hold into a bumper draws the biggest shape.

**A cleared run does not respawn.** `stepSim` holds it, deliberately, because what
happens next is the caller's decision. A death does respawn on its own after
`crashPause`, and the app freezes that hold — rather than racing it — while a
results sheet is up. Worthiness, when it existed, could never live in `stepSim`:
it is a question about `ScoreState`, which `src/sim/` must not be able to see.

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
3. **Prefer the RECORDED quantity to the reconstructed one, and check whether the
   recorded one can even answer the question.** This has now cost three findings.
   A replay's award list was quoted for link and flyby counts the recording
   contradicted (note 75); a tier distribution was factorised out of `multiplier`
   when `aim`, `timing` and `turn` were sitting in the tuple, and the factorisation
   silently dropped every PERFECT because `tierPerfect` collides with the x2 band
   (note 76); and a threshold was calibrated on `timing`, which saturates, when
   what it needed was the position `timing` was read at (note 76 again). Before
   reconstructing anything, look at what the tuple already carries — and if the
   tuple cannot answer it, **append a field rather than inferring one**, because
   the inference will look defensible.
4. **The recorded checkpoints are phone truth even when the replay is not.** They
   carry real positions, velocities and fuel every 60 ticks, and the world is pure
   arithmetic off a fixed seed — so a body's coordinates are identical however far
   the replay drifted. A grab can be reconstructed from the checkpoint before it
   plus straight-line drift. Do that rather than giving up on the report.
5. **Check `loadedAt` against when the thing being reported on shipped.**
   `simVersion` and `config` describe the simulation and say nothing about the
   build around it, so a session played on a stale bundle is otherwise
   indistinguishable from one played on the current one.

The header separates **five** ways a config can differ from the current defaults,
because only one of them is a reason to distrust the report:

| category        | what it is                                       | prints as             |
| --------------- | ------------------------------------------------ | --------------------- |
| `TUNED_KEYS`    | keys in `KNOBS`, moved in the tune panel         | `tuned`               |
| `worldSeed`     | a different world, not different code            | `field`               |
| `COURSE_KEYS`   | `bodyCount` / `anomalyCount` — the course picker | `course`              |
| `DEV_KEYS`      | what the dev server always sets                  | `dev`                 |
| everything else | build skew                                       | ⚠ **DIFFERENT BUILD** |

All five live in `tools/replay-core.ts`. **Any `SimConfig` key a player can change
at runtime must join one of the first four**, or the banner goes back to crying
wolf on ordinary play and then blaming the knob for a divergence it did not cause.
That has now happened twice: `DEV_KEYS` and `COURSE_KEYS` were both added after the
fact, and this paragraph said "three" for a while after it had become four.

The tune panel also carries `RENDER_KNOBS`, and those are **not** a sixth category.
They write to `RenderConfig`, which a report does not carry because it is not part
of the run — so there is nothing for the banner to compare and nothing to
categorise. Do not "fix" that by adding a `RENDER_KEYS` set, and do not fix it by
moving a render value into `SimConfig` so the panel can reach it: the panel reaches
it already.

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

## `plans/` expires

`plans/` holds work orders for the refactor toward `design/`, one file per finding
of the 2026-08-27 structural review. It is the exception to the rule above and it
survives only by expiring: **delete a plan when its refactor lands** — not "mark
it done", delete it. What deserves keeping goes where it cannot go stale: a
measurement or a rejected approach into `PORT_NOTES.md`, a rule someone will be
tempted to break into a comment at the site that tempts them, or into this file.

Nothing in `plans/` is authority. Where a plan and the code disagree, the code is
right and the plan is stale — re-read the code before starting one. When `plans/`
is empty, delete the directory.

## `docs/` is author-owned

Prettier ignores everything under `docs/` except `PORT_NOTES.md`. Do not reformat
the author's files, and do not commit their in-progress edits alongside your own.

## Tests

- A knob that does nothing is worse than no knob, and the panel has **two tables
  with two promises**. `KNOBS` names `SimConfig` keys and `test/tune.test.ts`
  asserts each one moves the ship; `RENDER_KNOBS` names `RenderConfig` keys, which
  cannot move the ship at all, so the same file asserts each one changes what gets
  drawn. A new knob belongs on the table whose promise it can keep — the wrong one
  either fails to typecheck or pins a value against a measurement it was never
  going to pass. Both tables have the same blind spot, and it is the same trap —
  a knob measures as inert because no scenario reaches the part of the run it
  governs. Check that before concluding a knob is dead — and note that checking
  thoroughly is not the same as checking the right mechanism. `fuelRegen` was
  pinned as dead on the strength of several scenarios, all of which exercised the
  grab gate (`fuel <= 0.5`) when the live one was the flyby brake (`fuel > 0`).
  The render side's version of that discipline is a **control**: add a real
  `RenderConfig` key the renderer under test cannot read, and check the test fails.
  A whole-picture comparison that always differed would pass every knob given it.
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
