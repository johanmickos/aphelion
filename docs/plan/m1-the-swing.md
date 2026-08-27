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

**Do this before writing any physics.** Produce [`docs/spec/01-swing.md`](../spec/01-swing.md):
a list of the characteristics the swing must have, each one paired with the prototype's
observed behaviour. (Earlier drafts of this step called the file `01-the-swing.md`. That was
drift, not a second file.)

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

**Done.** The tension is measured in [spec 01 · §11](../spec/01-swing.md): at peak boost the
craft can reach only **43%** of the circle of release headings, and never more than 49% at any
sampled geometry — so §11's first criterion, *the peak arc covers strictly less than a full
revolution*, is M1.3's acceptance gate. Three rulings are the author's and are listed in
[spec 01 · §13](../spec/01-swing.md) and the [spec README](../spec/README.md)'s open questions.

---

## M1.2 · The simulation core

Fixed timestep with substeps. **Ticks are the only clock in the game** (ADR-0006) — nothing
measures itself in seconds, because the simulation may scale time and wall-clock time would then
diverge from it permanently. (Earlier drafts of this paragraph cited the hitstop as the thing that
scales it. The hitstop is withdrawn — [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
— and nothing applies a time scale today. The clock is unaffected: it was never the freeze that
made ticks the unit.)

Bodies, gravity, the craft, integration. Pure, headless, no DOM, no `Math.random` — seeded
RNG only. A run is fully described by `(config, seed, input log)` and by nothing else.

**Acceptance**: the simulation runs under plain `node`; identical inputs produce identical
state; `pnpm portable` passes. **Verify**: `pnpm portable`, plus a determinism test that runs
the same recipe twice and compares final state exactly.

**Done.** The core is `src/sim/`: a tick of 1/60s integrated in six substeps by semi-implicit
Euler, a fixed-timestep clock with the catch-up bounded at three ticks, bodies whose mass is
derived from their radius, gravity that acts **only while a body is held and only from that
body**, coasting that is force-free, a seeded stream, and a byte-level snapshot of the whole
state. There is no grab, no freeze, no settle and no release — those are M1.3, and the dive is
set up in tests by a fixture rather than by a mechanism.

Three things worth carrying forward:

- **Six substeps is proved on this integrator, not inherited.** Against a 96-substep reference
  over six dives spanning the measured periapsis band, six agrees to **0.37 design units** of
  closest approach and **1.8 units/s** — a factor of four inside spec 01 §12's tolerances — while
  one substep misses both. The worst integrated step is **3.43 design units**, or 1.14 in the
  units the prototype measured 1.45 in.
- **[Spec 01 · §12a](../spec/01-swing.md) is closed.** The simulation owns `sin`, `cos` and
  `atan2` ([ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md)), because V8 and
  JavaScriptCore — the engine the author's phone runs — disagree on them for 4.3%, 4.6% and 17.9%
  of arguments, and a recipe recorded on the phone is replayed on a laptop.
- **[Spec 01 · §13.3](../spec/01-swing.md) is closed by the author**: the ×3 / ×27 conversion is
  confirmed, and carried as one named constant with every length derived from it.

---

## M1.3 · Grab, orbit, release

The one verb: press to be caught, hold to swing, release to leave along the tangent. There is
**no hitstop** at either end — it was rejected after being flown
([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)), and what
replaces it is a kick on every release scaled by the quality of the swing, read from spec 01 §7's
envelope. Time-scaling remains the simulation's to apply and is applied by nothing.

The simulation core is [M1.2](#m12--the-simulation-core) and is done: bodies, gravity, the craft
and the integrator exist, `heldBody` exists as state with no transition into it, and spec 01 §4's
clearance impulse is the first thing this step needs — without it a dive at a realistic aim
strikes the body.

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
