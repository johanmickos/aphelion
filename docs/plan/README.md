# The plan

Aphelion is being rebuilt from two sources: `docs/VISION.md`, which says what the game is
for, and `docs/design/`, twelve design directions that say what it looks like when it is.
A working prototype exists at `~/git/aphelion` and is consulted, never copied (ADR-0001).

This directory is the implementation plan. It is written for sessions that have not read
the conversation that produced it.

## Before you touch anything

Read, in this order: `CONTEXT.md` (the glossary — the words in it are the words to use),
`docs/adr/` (fourteen decisions, all of them still binding), the spec for the step you are
doing, and the design board that spec cites.

## How a step works

Every step names its **spec**, its **acceptance criteria**, its **verification command**,
and whether it ends in an **author gate**.

- One branch per step, one PR into `main`, squash-merged. A step is sized to one session.
- A step is done when `pnpm check` is green, its acceptance criteria are demonstrably met,
  and its status is updated in the table below.
- **A gated step stops.** Do not start the next step, do not "get a head start", do not
  decide the gate is a formality. The author flies the build and says yes. Gates exist
  because determinism can prove the game is correct and cannot prove it feels good
  (ADR-0004).
- If a spec is wrong, silent or contradicts another spec, **stop and say so**. Do not
  invent the ruling. Every contradiction anyone found while writing this plan was resolved
  by the author and recorded; a new one deserves the same.

## The milestones

Each ends in something that runs on a phone. That is deliberate: the author's gate is
playing it, so a plan whose first playable moment is late is a plan that cannot be gated.

| # | Milestone | Ends with | Gate | Status |
|---|-----------|-----------|------|--------|
| [M0](./m0-foundations.md) | Foundations, specs, renderer verdict | Specs written, a field you can pan, a renderer ADR | — | **M0.1–M0.4 done** ([specs](../spec/), scaffold, the three layers and `pnpm portable`, the QR dev server — scanned, and the phone shows the tick counter); CI and the Pages deploy are written but have never run, since the repo has no remote yet and pushing it is deferred; **M0.5 done** — measured on the author's phone at the design size, Canvas2D holds at p99 3ms against an 8ms budget ([ADR-0011](../adr/0011-canvas2d-carries-the-design.md), reports in `diagnostics/`); the spike is deleted as planned |
| [M1](./m1-the-swing.md) | The swing | Crude shapes, real gravity, a flyable swing | **author** | **M1.1 done** — [spec 01](../spec/01-swing.md) is written, from 474s of recorded phone play under the prototype's current physics tuning plus headless sweeps of its own simulation. Every characteristic has a number, a source and a tolerance; pillar 2's tension is now a measurement (**43%** of release headings are reachable at peak boost, never above 49% at any sampled geometry) and §11's first criterion is M1.3's acceptance gate. The **hitstop is rejected** and the punch is bought with speed instead ([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)); spec 02 carries a notice and M2.4 rebases its timeline. **M1.2 done** — the simulation core: fixed timestep with a bounded catch-up, bodies with mass derived from radius, gravity that acts **only from a held body**, a substepped integrator, a seeded stream and a byte-level snapshot. A recipe replayed twice is byte-identical at every one of 3600 ticks. **Six substeps is proved rather than inherited**: measured against a 96-substep reference on this integrator, six lands a factor of four inside spec 01 §12's tolerances and one substep does not. **Spec 01 §12a is closed** — the simulation owns `sin`, `cos` and `atan2`, because V8 and JavaScriptCore disagree on them for 4.3%, 4.6% and 17.9% of arguments and a recipe has to cross that pair ([ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md)). **§13.3 is closed too**: the author confirmed the ×3 / ×27 conversion, carried as one named constant. **One ruling still open** in the spec README: the mass-to-radius exponent, deferred to the M1 gate and carried as a parameter with `n = 0` reproducing the prototype exactly. **M1.3 done** — the one verb, end to end: a press takes the body it is arriving at, a clearance turns a striking path onto the floor over five ticks without ever adding enough speed to eject the craft, the dive is simulated to its closest approach, the freeze hands it to a closed-form phase clock, the settle spends the speed it earned over 1.2s, and a release leaves exactly along the tangent. **The acceptance gate passes**: at peak boost the craft reaches at worst **61% of a revolution** of release headings and never a full one, over 88 geometries and again over a wider net of 362; §11's second criterion lands at **p50 46.5%** against a band of 35 – 55%. Every tolerance in spec 01 §2 – §12 is an automated test read from outside the simulation — 183 tests, and the headless sweep harness §11 asked for is `test/sim/swing.ts`. Three things are recorded for the author rather than decided: **§11's third criterion holds for every swing that froze on the floor and cannot hold for shallow ones** (a fixed 1.675s stretch against a period that grows as r^1.5); the stand-in corpus **over-represents flybys 72% against a measured 52%** and its percentiles say so; and **grab range scaling with mass is ruled but its shape is a derivation**. `CONTEXT.md` gained **lead**, **orbit**, **boost** and **quality**. M1.4 next |
| [M2](./m2-the-instrument.md) | The instrument | The compass, the release, the 400ms | **author** | not started |
| [M3](./m3-the-field.md) | The field | Rungs, sky, anomaly, boundary, retro grade | — | not started |
| [M4](./m4-the-economy.md) | The economy | Carry/cash/bank, tiers, fuel, HUD, ZEN | **author** | not started |
| [M5](./m5-audio.md) | Audio | The swing has a voice | **author** | not started |
| [M6](./m6-the-run.md) | The run | Front door, finish, debrief, results, DRIFT | **author** | not started |
| [M7](./m7-powerups.md) | Powerups | The field's generosity | — | not started |

## What is deliberately not here

- **No backend.** Offline v1, with the seams cut for a service later (ADR-0003).
- **No CORRIDORS, no ADVENTURE.** Both need authored content pipelines nobody has designed
  (ADR-0005).
- **No lives inside DAILY.** Unlimited play lives in DRIFT (ADR-0007).
- **No new body types in v1.** Difficulty comes from geometry first, so that when types
  arrive there is something to measure them against.
