# 01 · The swing — characteristics

**Board**: none. This spec is authored, and it is deliberately **unfinished**.

ADR-0004 rules that the physics is rewritten, that determinism is the contract, and that the
author is the gate on feel. It also rules how the swing gets specified: *"the physics workstream
opens by naming the characteristics of the swing and mapping them onto the prototype's
behaviour, and no implementation of it is accepted until the author has flown both builds and
signed off."*

That naming is the first task of [M1](../plan/m1-the-swing.md), not of M0.1. Writing numbers here
now would be inventing the one thing the project is most afraid of losing. This file exists so
that every other spec has something to cite, and so that M1 has a place to write into.

---

## What is already fixed, and binding on M1

These come from CONTEXT.md, the ADRs and the boards, and are not open:

1. **One verb.** Press, hold, release. The button means "be caught by that body" on the way in
   and "let go" on the way out. A second input is a repeal, not a feature (VISION, pillar 1).
2. **The swing is the unit.** One grab, one orbit, one release. It is the unit of play and
   therefore the unit of scoring (spec [08](./08-economy.md)).
3. **The craft has timing and shape, never throttle.** No acceleration input exists.
4. **Release is along the exit tangent.** The nose points along it for the whole orbit.
5. **The simulation owns the only clock**, and it counts ticks, not seconds (ADR-0006). Hitstop
   is a time-scale the simulation applies, so wall-clock and simulated time diverge and nothing
   in the game measures itself in seconds.
6. **A run is fully described by its configuration, its seed and its input log** — the recipe.
   The simulation is pure, imports nothing, and runs headless under plain node (ADR-0004,
   ADR-0006).
7. **The two things worth optimising must fight each other.** The boost envelope peaks a fixed
   interval after the orbit freezes, and the release dot sits at a fixed angle, so hitting both
   means shaping the dive so they arrive together (VISION, pillar 2). This tension is not
   authored on top of the physics; it falls out of physics that is already running. M1 must
   preserve it, and must be able to demonstrate it.

## What M1 must write into this file

For each of the following, a name, a number or range, and the measurement from the prototype it
was mapped onto (ADR-0001: state the fact, do not link the line):

- **Gravity model** — force law, mass-to-radius relation, and whether gravity acts outside grab
  range.
- **Grab** — the range predicate, which body wins when several are in range, the transition from
  free flight into orbit, and what is conserved across it.
- **Orbit** — shape, whether the radius is fixed at grab or evolves, and the angular rate as a
  function of speed and radius.
- **The boost envelope** — its shape, its peak, and the fixed interval from orbit freeze to peak
  named in pillar 2.
- **Release** — the exit speed as a function of the orbit state, and the exit direction relative
  to the tangent.
- **Coasting** — drag, if any. (The economy says coasting earns nothing and costs nothing; the
  physics must not quietly contradict that.)
- **Death** — the collision predicate against a body, and the boundary-line predicate
  (spec [07](./07-boundary.md)).
- **Tick rate** and the integrator, with the argument for why it is stable at the speeds
  spec [17](./17-daily-field.md) produces at the top of the field.

## Acceptance (of this file, at the end of M1)

- Every characteristic above has a value and a source.
- The author has flown the build on a phone and signed off (ADR-0004). The sign-off is a
  scheduled human checkpoint, not a formality to be routed around.
- A recipe replayed twice produces byte-identical simulation state at every tick.

## Open

- All of it. Nothing in this file is a number yet, and that is the intended state until M1.
