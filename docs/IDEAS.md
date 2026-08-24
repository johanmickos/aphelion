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

## Easter Eggs
- Award for most orbits around single planet (award: 10 or more)
- Award for bumping into planet (i.e. bumpy orbits due to coming straight on)
