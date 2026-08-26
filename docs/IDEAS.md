# Ideas

## Gameplay
- Death trails: like in Super Meat Boy, show all ship lines/attemps overlaid
- If doing realy well (high speed, multiple fly-bys, etc.), let user enter lightspeed where they now get placed in the middle of the screen and the "press+hold" input is now for magenticially pulling coins/points towards them. A reward and breathing room.
- "No fuel" warning -- flash a brief icon next to ship when runnign out of fuel or tapping w/ no fuel
    - Yeah let's have an empty fuel gauge flash next to the ship 3x
- Sharing and replay: imagine a user does a really cool sequence, capturing multiple planets and bouses. They might want to share the ~5s around the moment maybe as a shareable GIF or as a full replay.
- Rewind: it's easy to mess up and rash, or spend all fuel. I think a rewind mechanism would be useful, where the user could have a separate rewind budget/gauge to go back with if they mess up timing. There might be a point deduction as well.
- Ship profiles: let the user unlock different ship profiles with different speeds, shields, autopilot, etc.
- Music as a mechanic
- Regions of the "corridor" can pair a distinct soundtrack/palette/hazard set with signatuer properties (black hole, nebula)
- Challenge stretches: bite-sized authored segments spliced into the corridor to present constraints and challenges (reach the next gate in 1 grab)
- Puzzle mode
- Speed challenges
- Trick shots
- **The carpet as a play zone, and the fingerprint it leaves.** Raised 2026-08-25.
  Make the run-in a drift/play space rather than only a corridor: green dots
  scattered through it that can be CAPTURED like planets but are harmless to touch
  and fly through. Then show the ship's path through that zone on the ceremony
  sheet as a "fingerprint" — a signature unique to how the player flew it, drawn
  white/blue and flashing platinum now and then, like mother of pearl.

  Four things worth knowing before starting, because each one has a seam that
  already exists or a rule that will bite:

  - **The dots are a third `Body.kind`.** `contactPolicy` already switches on
    kind, so "capturable but harmless" is a case there rather than a new code
    path — the same way an anomaly is already a body that behaves differently on
    contact. Do not special-case them in `stepSim`.
  - **The zone is already non-lethal at the sides.** `finishBumper` made the walls
    bounce inside `runInBand`, so a play space is what the region physically is
    now; this idea is mostly asking the *content* to catch up with that.
  - **The fingerprint cannot come from `Trail`.** It is capped at `trailMax` (16
    points) and clears on respawn — it is a wake, not a record. The signature
    wants its own buffer that opens when the ship enters the band. Good news: the
    path is a pure function of `(config, seed, inputLog)` like everything else, so
    a replay reproduces the same fingerprint, which makes it shareable and
    verifiable rather than decorative.
  - **The iridescence sits OFF the rarity ladder**, with the finish green and the
    burn word. Colour means rank in `accolade.ts`; a signature is a unique artifact
    rather than a graded one, and there is no "how good was that" for platinum to
    encode. Green for the dots is a deliberate reuse — they belong to the finish —
    not a clash.

  Also note the sheet is already dense: five rows, a headline and a subtitle in the
  top fifth of the screen. A fingerprint needs real estate that does not exist yet.
- Early off-course warning: fire the boxed `⚠ LOST — OFF COURSE` treatment (with its leader line) as a *warning* seconds before the wall, not as the obituary. Playtest 2026-08-22 rec #4. Considered alongside the point-of-no-return scar and deliberately left out of it: the scar is a diegetic instrument, this is a screen-level alarm, and they should be judged separately.

## Entities
- Pause planets: sometimes things get crazy. The procedural generation should include "breather" moments when things get chaotic, so that the player can enter a calmer orbit. Maybe these are service stations that refuel, repair, and feed? The user can just press and hold to keep the safe orbit, and then when ready decide to continue. This is useful for times when the user's going too fast to capture/circularize.
- Storms/nebulae that slow us down and/or eat fuel
- Boost fields ?? that make us go faster
- Wormholes: teleport entrace/exit for "wow" moments (both for user transporting AND for delivering surprising entities to the player)
- Binary planets: tricky to move through
- Rings/asteroid belts: gzaer bait and soft obstacles.

## Point Deductions
Sometimes the user gets lazy and may need to be punished. If they coast past planets without engaging, they should be penalized. Maybe even more so for missing multiple in a row. We want to encourage point streaks, which is generally driven by planetary captures. If the user is just coasting, we should deduct points and maybe even send an adversary their way (like a tiny planet directly along their trajectory).

## Powerups
- Infinite fuel for 5s
- Fuel boost (nitrous on top of fuel stack?)
- Points boost (plain, stacking rings to fly through)
- Magnet/attraction to auto-pull powerups
- Shield (lets you bounce 1x off edge/planet)
- Autopilot (no need to control anymore, it flies itself)
- Undo action (once picked up, highlight a button or similar that can bring the user back to a stable drift before orbits)


## Points and Bonuses
- Replenish fuel on good captures/releases
- Points for all captures
- Extra points for tight releases (close to optimal for next planet, according to gauge)
- Extra points for tight captures (low peripsis)
- Extra points for skimming the edge (getting close for a longer time and then surviving)
- Extra points for blowing by a planet extremely close without capturing
- Accolades for patterns collected ACROSS a run, not just single events. "FROGGER"
  for leapfrogging several planets in a row is the shape: the thing being noticed
  spans many captures, so no single award can see it. They would pop up as normal
  awards when the pattern completes. Worth knowing before building: every existing
  word in `praise.ts` names an axis of ONE passage (aim, peak, close), and the
  rarity ladder colours it by how good that passage was — a run-spanning accolade
  has no single passage to grade, so it needs a decision about where it sits on
  that ladder, or whether it sits off it the way `HOP` and the burn word do.
  Raised 2026-08-24 alongside the run sheet, which counts several such patterns
  (`peakChain`, `roughPasses`, `anomalies`) already and could feed them.

### Performance testing and regressions (parked 2026-08-23)

Asked for after a session showed "slowdown due to rendering, slowing my ship and
the animations down at times". The specific cause that time was the scar's
prediction and is fixed (PORT_NOTES 57), but nothing in the repo would have caught
it — the gate proves correctness and says nothing about time.

What a harness would need to be worth having:

- **Per-tick and per-frame budgets, measured on the corpus.** The units that
  matter are p99 and max, not mean: note 57 exists because a mean over calls that
  mostly return early hid a 46ms outlier. One slow tick drops a frame; a good
  average does not save it.
- **A regression gate that can run in CI.** Wall-clock thresholds are machine
  dependent, so the honest version counts WORK — simulated ticks, substeps, state
  clones — which is deterministic and comparable across machines. Time can then be
  a local-only check, the way `golden:check` already is.
- **The renderer too.** The report above blamed rendering and was right that the
  frame was late, wrong about which half. A harness that only measures the
  simulation would have agreed with the wrong half.

Remaining known cost: one full `rescueScar` lands inside a single tick, roughly
once every seventeen seconds of edge play. The structural fix is to spread the
press evaluations across ticks — sound for the same reason `advanceScar` is sound
— and it should be built behind the harness rather than in front of it.

### Making an award readable (parked 2026-08-23)

The rescue award (PORT_NOTES 53) pays correctly and is close to invisible. Three
separate problems, all of which outlive it:

- **A popup with no word is anonymous.** `praiseFor` returns null for a rescue, so
  it draws as a plain grey `+420` — identical to a grab or a flyby. The word is
  the channel that says *what*, and every threshold in `praise.ts` is a measured
  percentile of real play. Only a handful of sessions have ever been flown with
  the cross visible, so the word is waiting on a sample, not on a decision.
- **The band holds one award for 1.6s and the next one overwrites it.** Measured
  on 2026-08-23T20-37: rescue at tick 340, burn at 376, flyby at 398 — three
  awards inside one second, so the rescue line was readable for 0.6s. A queue, a
  stacked band, or awards that know how to merge would all fix it; which one is a
  design call, and it wants deciding for all award kinds at once rather than for
  the newest one.
- **The score band is in the worst place to read it.** Playtest 2026-08-22 §1 and
  §8 already say this. Anything done to the band above should probably wait for,
  or come with, moving it.

Related and separate: `previewBurn` deliberately under-reports by a measured 2.2x
(PORT_NOTES 54). It is fine for sizing the scar and must not be shown as a number
or paid, so any feature that wants to *display* the fire on offer has to extend
the flight past the turn-away first.

### Standing playtest findings, not yet acted on (parked 2026-08-25)

Raised by `docs/PLAYTEST-2026-08-22.md` and `PLAYTEST-2026-08-23.md`, still true
on the current build, and separate from the ones already written up above. Each
carries the measurement it was found by, because re-finding it is most of the work.

- **The chain says nothing for most of a run.** `streakMax` 5 at `streakStep` 0.4
  binds on the 11th scoring event — about 22 seconds in — and then the most
  prominent progression number on screen does not move again. Measured on the
  2026-08-23 capture: x5.00 from 22s to 85s, 74% of the session. The 08-22 capture
  showed the same defect at 27 seconds, and the fix applied afterwards
  (`streakStep` 0.25 -> 0.4) made it strictly WORSE by reaching the cap sooner.
  The measurement to run before touching it: rescore `diagnostics/` and report what
  fraction of the seconds INSIDE each life sit at the ceiling. If a good run spends
  most of its life pinned, the ceiling is the wrong shape and raising it is not the
  answer — the question is whether the top of the ladder should stop being a number
  that stops moving. `RunStats.peakChain` now records what the HUD could not show,
  so the data exists.
- **Two different quantities are both rendered `x5.00`, one line apart.** The
  persistent chain and the multiplier an award was PAID at, in the same glyph and
  the same face. Determining which was which required stepping through frames.
  Playtest 2026-08-22 rec #2, listed there as needing no design call.
- **The praise vocabulary is too deep to learn.** 37 words in `praise.ts` plus 8 in
  `reckless.ts`. The 08-23 capture showed 14 distinct words in 85 seconds, almost
  every one exactly once, so no word ever becomes a signal and colour does all the
  work. Cutting to 1-2 per tier is a RE-MEASURE at coarser granularity, not a
  re-pick: the thresholds are percentiles of real play.
- **The game is silent.** `astats` over both captures: no game audio at all. Two
  playtests running have called this the largest gameplay return per hour, and the
  ceremony has made it conspicuous — a warp, a finish line and a slot-machine
  roll-up, in silence. A pitch ramp through the boost arc peaking at the release
  window would teach the core mechanic better than the arc gauge does.
- **The field has no difficulty curve.** `createBodies` is stationary: radius
  `34 + rnd()*22` at every height, constant `bodySpacing` and `bodyWeave`, and the
  anomalies spread evenly. P1 and P59 are statistically identical draws, so after
  the first ~25 seconds nothing gets harder — the only escalation is the player's
  own accumulated speed, which is emergent rather than authored.
- **The short course may be too narrow rather than the player careless.**
  `fieldWidthFrac` is shared between courses, so SHORT flies 12 bodies down the
  same 741px corridor as FULL's 60. Two of the three lives in the 2026-08-25
  captures ended at a side wall inside 20 seconds. Worth measuring before assuming
  it is a skill issue.

### Next steps from the warning-panel session (parked 2026-08-25)

Both were measured during the session that built `src/render/warnings.ts`, and
both were deliberately left rather than forgotten. Each carries the number that
makes it worth doing, because re-finding it is most of the work.

- **Half of all wall deaths get no cue at all, because the ship is CAPTURED.**
  Measured over the corpus: of 199 out-of-bounds deaths, 95 (48%) were captured on
  the very last tick and 106 (53%) captured for most of the final half second.
  `rescueDeadline` returns null while captured — deliberately, since the escape
  from a capture is a release rather than a grab — so neither the deadline track
  nor the SOS light can fire for any of them. The player drags the wall on fire,
  earning points, and the game says nothing until the run ends.

  The missing piece is NOT another deadline search. That one is expensive because
  it evaluates a press at dozens of sampled points; the captured question needs a
  single forward simulation: clone the state, step with HOLD to the horizon, and
  see whether the run ends out of bounds. If it does, the capture is going to kill
  you. Cheap enough to run at the same 10Hz the deadline already runs at, and it
  reuses `cloneState` and the cheap-refusal bound already in `src/sim/rescue.ts`.

  **The design call to make first, because it is not a bug fix.** Such a cue would
  have a VERB — "keep holding and you go out", whose answer is to let go — and the
  deadline was deliberately built with none (it is a risk dial you learn to aim at,
  not a prompt you react to). Adding a cue that tells the player what to do is a
  different kind of thing from everything else on screen, and this repo has
  reversed two features that were decided casually.

- **The third warning light should be a refused grab.** The panel takes one more
  row for almost nothing, and this is the same class of problem the fuel badge was
  invented for: you pressed, nothing happened, and the explanation is 200px away in
  the HUD readout. Measured frequency over 71.8 minutes:

  | refusal              | count | rate     |
  | -------------------- | ----- | -------- |
  | `refused-crash-cone` | 21    | 0.29/min |
  | `refused-out-of-range` | 20  | 0.28/min |
  | `refused-no-fuel`    | 0     | never    |
  | `refused-no-body`    | 0     | never    |

  Worth knowing before building it: only two of the four refusal reasons ever
  actually fire, so this is one light with two words rather than four. The empty
  tank case is already the fuel badge's — `FuelWarning.observe` fires `empty` on
  `refused-no-fuel` — which is why that row reads zero here rather than being
  missing.

  Two other candidates were measured and are weaker: riding the minimum-orbit
  floor (0.21s/min, explains a capture that feels dead) and puttering out
  mid-settle (0.15/min). Both are currently visible only in diagnostics.

## Easter Eggs
- Award for most orbits around single planet (award: 10 or more)
- Award for bumping into planet (i.e. bumpy orbits due to coming straight on)
