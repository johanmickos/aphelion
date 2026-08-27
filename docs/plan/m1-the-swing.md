# M1 · The swing

The only milestone whose success cannot be verified by a machine. It ends with the author
flying the build.

`VISION.md` calls the capture feel the most expensive thing in the project, and the
prototype protected it with a frozen configuration and a ten-scenario equality gate held at
exactly zero divergence. This rewrite discards that protection deliberately (ADR-0004), so
this milestone rebuilds it in a different shape: characteristics named up front, determinism
enforced by machine, and the author as the judge of feel.

---

## M1.1 · The characteristics document

**Do this before writing any physics.** Produce `docs/spec/01-the-swing.md`: a list of the
characteristics the swing must have, each one paired with the prototype's observed
behaviour.

The prototype at `~/git/aphelion` is a running program. Play it, instrument it, read
`src/sim/capture.ts` and the rationale above `DEFAULT_CONFIG`, and use its replay tooling.
Characteristics worth naming, at minimum: how speed at periapsis relates to approach speed
and impact parameter; how long capture-to-boost-peak takes and how it varies; how exit angle
follows hold duration; the shape of the boost envelope; what a grab does to a trajectory
that was going to miss; and the two things `VISION.md` says fight each other — the boost
envelope peaking a fixed interval after the orbit freezes, while the release marker sits at
a fixed angle, so hitting both means shaping the dive so they arrive together. **That tension
is the game.** If the rewrite loses it, the rewrite has failed regardless of how it feels in
isolation.

Each characteristic gets a number or a curve from the prototype and a tolerance. This is the
only artifact that carries the old feel across a repo boundary the project has chosen to
keep closed, and the prototype is a wasting asset (ADR-0001).

**Acceptance**: every characteristic has a measurement, a source, and a tolerance.
**Verify**: read it.

---

## M1.2 · The simulation core

Fixed timestep with substeps. **Ticks are the only clock in the game** (ADR-0006) — nothing
measures itself in seconds, because hitstop is a time-scale the simulation applies and
wall-clock time and simulated time diverge permanently the first time it fires.

Bodies, gravity, the craft, integration. Pure, headless, no DOM, no `Math.random` — seeded
RNG only. A run is fully described by `(config, seed, input log)` and by nothing else.

**Acceptance**: the simulation runs under plain `node`; identical inputs produce identical
state; `pnpm portable` passes. **Verify**: `pnpm portable`, plus a determinism test that runs
the same recipe twice and compares final state exactly.

---

## M1.3 · Grab, orbit, release

The one verb: press to be caught, hold to swing, release to leave along the tangent. Hitstop
fires at both ends as a simulated time-scale, not a rendering pause.

**Acceptance**: every characteristic from M1.1 is inside its tolerance, as an automated test.
**Verify**: `pnpm test`.

---

## M1.4 · Death, and the shape of a run

The boundary line as an absolute (bands come in M3), death, and the run lifecycle — start,
alive, ended, and why it ended. DAILY's rule applies: one run, no retry, death takes carry
and bank (ADR-0007). No lives.

**Acceptance**: a run ends for each distinct reason and reports which. **Verify**: `pnpm test`.

---

## M1.5 · Recipes and headless replay

Define the recipe — seed plus input log — and a CLI that takes one and produces a final
state. This is the instrument the physics gate uses, the thing that makes a bug report a
recipe rather than a recording, and the seam a service would later verify runs through
(ADR-0003). Assume the shareable code is long: a twelve-character code cannot contain a
compressed input log, so Direction 10's `APH-214-KX7Q` can only ever be a server handle.

**Acceptance**: a recorded run replays to a bit-identical final state, four times its own
length. **Verify**: `pnpm replay`.

---

## M1.6 · Input and a crude renderer

Touch, mouse and keyboard, all bound to the same single verb. Circles and lines, no glow, no
compass, no HUD — enough to fly. World coordinates in the 1170×2532 design space, letterboxed
on desktop (ADR-0010).

**Acceptance**: it is flyable on a phone and on a desktop browser. **Verify**: fly it.

---

## Gate

**The author flies this build and the prototype back to back and says yes or no.** Nothing
in M2 starts before that. If the answer is no, the loop is M1.1's characteristics — find the
one that is wrong, not the tuning value that is closest to hand.

Next: [M2](./m2-the-instrument.md).
