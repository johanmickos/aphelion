# Refactor plans

Work orders for the structural refactor toward the `design/` directions. One file
per finding, numbered as the 2026-08-27 structural review numbered them.

## These are disposable, and that is the point

`AGENTS.md` says: **do not create a new standing design document.** `DESIGN.md`
and `FEEL.md` were both deleted for drifting away from the code they claimed to
describe.

These files dodge that rule only by expiring. Each one is a **work order**, not a
description of how the game behaves:

- **Delete the plan when its refactor lands.** Not "mark it done" — delete it.
- **What survives goes somewhere that cannot go stale.** A measurement or a
  rejected approach goes into `docs/PORT_NOTES.md`, which is history. A rule that
  will tempt someone to break it goes into a comment at the site that tempts them,
  or into `AGENTS.md` if it spans sessions.
- **Nothing here is authority.** If a plan and the code disagree, the code is
  right and the plan is stale. Re-read before starting one.

When `plans/` is empty, the refactor is finished and the directory goes too.

## Status

| #   | Plan                                                | Severity | Blocks                  | State                                        |
| --- | --------------------------------------------------- | -------- | ----------------------- | -------------------------------------------- |
| F01 | Body traits                                         | BLOCKS   | Dir 04 body types       | **done** — PORT_NOTES 65                     |
| F02 | Body type table                                     | BLOCKS   | Dir 04, VISION field    | **done** — PORT_NOTES 66                     |
| F03 | [Theme as a value](F03-theme-value.md)              | BLOCKS   | Dir 01, regions         | **a+b** done — PORT_NOTES 69; **c** deferred |
| F04 | [Scoring constitution](F04-scoring-constitution.md) | BLOCKS   | Dir 06, Dir 08          | needs a call                                 |
| F05 | [Mode economy](F05-mode-economy.md)                 | BLOCKS   | Dir 08 matrix           | needs F04                                    |
| F06 | [Effects stack](F06-effects-stack.md)               | COSTS    | powerups                | deferred                                     |
| F07 | Draw layer list                                     | COSTS    | Dir 02, 05              | **done** — PORT_NOTES 67                     |
| F08 | [Course segments](F08-course-segments.md)           | COSTS    | VISION difficulty curve | ready                                        |
| F09 | [Award vocabulary](F09-award-vocabulary.md)         | COSTS    | Dir 06                  | needs a call                                 |
| F10 | [HUD grid](F10-hud-grid.md)                         | COSTS    | Dir 03                  | ready                                        |
| F11 | [Screen machine](F11-screen-machine.md)             | COSTS    | Dir 09, 10, 11          | deferred                                     |
| F12 | [Audio observer](F12-audio-observer.md)             | COSTS    | VISION sound            | deferred                                     |
| F13 | Design-width duplication                            | —        | —                       | **done** 2026-08-27                          |

F13 was fixed in the review session: `DEFAULT_RENDER_CONFIG.designW` now reads
`DESIGN_W` from `src/sim/world.ts` instead of repeating the literal `390`. No plan
file; the note lives at the field it explains.

## Order

Dependencies, not severity. Steps 1 and 2 are independent and can run together.

1. ~~**F01**~~ → ~~**F02**~~ — both landed 2026-08-27, gate held throughout. What is
   left of F02 is shipping the first NEW body type, which is content rather than
   refactor and wants the author's call: what a ringed body does, how many a field
   holds, and where.
2. ~~**F03a**~~ — the eight tokens landed 2026-08-27; the game is repainted.
3. ~~**F07**~~ → ~~**F03b**~~ → **F10**. The layer list and the repaint both landed
   2026-08-27. 95 colour literals are down to 25, and the 15 in `world.ts` are all
   inside `drawPlanet`/`drawAnomaly`, which **Direction 04 rebuilds** rather than
   recolours — do those with the planet language, not before.

   **F03c is what is left and is deferred**: `palette.ts` still resolves from
   `DEFAULT_THEME` at module load, so there is one palette and it is not yet
   swappable. Threading `Frame.theme` into the draw functions is the remaining
   pass, and it buys nothing until there is a second region to put in it.

   Direction 02's hitstop is **rejected** — flown, even 30ms reads as jarring. The
   punch is bought with speed instead: `SimConfig.releaseKick`, entirely transient
   so it can be large without touching the economy. PORT_NOTES 68, and the ruling
   is at `Frame.paused` where someone would otherwise reach for the freeze.

4. **F04** + **F05** — together; splitting the score without the pricing gives two
   numbers that mean the same thing.
5. **F08** — unblocked; the type table landed.
6. **F06**, **F11**, **F12** — when there is a first powerup, a second screen, and
   a first sound respectively. Cheap once, expensive repeatedly, and not urgent
   while the count is one.

## The gates, every time

`pnpm check` before every commit. Beyond that, each plan states which of these it
is allowed to move:

- **Equality gate** — `node tools/diff-report.ts` reads `0.000e+0` across all ten
  scenarios. Never moves. A change that moves it is wrong or belongs behind a flag
  that is `false` in `PROTOTYPE_CONFIG`.
- **Golden** — `pnpm golden:check`. Moves only when a `SimConfig` key is added.
  Local only; CI runs `check:ci`, which excludes it.
- **Fingerprint** — `fingerprint()` in `src/sim/serialize.ts`. Adding a field
  invalidates the checkpoints in every existing `diagnostics/` report. Bank that
  cost once, not per feature.
- **`SIM_VERSION`** — bump when behaviour under `src/sim/` changes. A change to a
  value outside `fingerprint()` does not need one; check before bumping.
