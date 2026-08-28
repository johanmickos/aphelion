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
| [M1](./m1-the-swing.md) | The swing | Crude shapes, real gravity, a flyable swing | **author** | **M1.1 done** — [spec 01](../spec/01-swing.md) is written, from 474s of recorded phone play under the prototype's current physics tuning plus headless sweeps of its own simulation. Every characteristic has a number, a source and a tolerance; pillar 2's tension is now a measurement (**43%** of release headings are reachable at peak boost, never above 49% at any sampled geometry) and §11's first criterion is M1.3's acceptance gate. The **hitstop is rejected** and the punch is bought with speed instead ([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)); spec 02 carries a notice and M2.4 rebases its timeline. **M1.2 done** — the simulation core: fixed timestep with a bounded catch-up, bodies with mass derived from radius, gravity that acts **only from a held body**, a substepped integrator, a seeded stream and a byte-level snapshot. A recipe replayed twice is byte-identical at every one of 3600 ticks. **Six substeps is proved rather than inherited**: measured against a 96-substep reference on this integrator, six lands a factor of four inside spec 01 §12's tolerances and one substep does not. **Spec 01 §12a is closed** — the simulation owns `sin`, `cos` and `atan2`, because V8 and JavaScriptCore disagree on them for 4.3%, 4.6% and 17.9% of arguments and a recipe has to cross that pair ([ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md)). **§13.3 is closed too**: the author confirmed the ×3 / ×27 conversion, carried as one named constant. **One ruling still open** in the spec README: the mass-to-radius exponent, deferred to the M1 gate and carried as a parameter with `n = 0` reproducing the prototype exactly. **M1.3 done** — the one verb, end to end: a press takes the body it is arriving at, a clearance turns a striking path onto the floor over five ticks without ever adding enough speed to eject the craft, the dive is simulated to its closest approach, the freeze hands it to a closed-form phase clock, the settle spends the speed it earned over 1.2s, and a release leaves exactly along the tangent. **The acceptance gate passes**: at peak boost the craft reaches at worst **61% of a revolution** of release headings and never a full one, over 88 geometries and again over a wider net of 362; §11's second criterion lands at **p50 46.5%** against a band of 35 – 55%. Every tolerance in spec 01 §2 – §12 is an automated test read from outside the simulation — 183 tests, and the headless sweep harness §11 asked for is `test/sim/swing.ts`. Three things are recorded for the author rather than decided: **§11's third criterion holds for every swing that froze on the floor and cannot hold for shallow ones** (a fixed 1.675s stretch against a period that grows as r^1.5); the stand-in corpus **over-represents flybys 72% against a measured 52%** and its percentiles say so; and **grab range scaling with mass is ruled but its shape is a derivation**. `CONTEXT.md` gained **lead**, **orbit**, **boost** and **quality**. **M1.6 done, pulled ahead of M1.4 and M1.5** because the milestone ends in the author flying the build and the first playable moment was three steps away: touch, mouse and keyboard all bound to the one verb, a Canvas2D renderer of circles and lines in the 1170×2532 design space, a hand-authored fixture field carrying the prototype's own geometry, and a **camera** in presentation state. **240 tests.** Three things the specs are silent on were decided rather than invented and are recorded with their expiry dates: the camera is **centred on the craft, fixed sideways and does not lag** — the sideways decision expires when the field outgrows the design space, and the lag is refused because presentation state has no memory and the prototype measured the lag as the thing that costs; the fixture field spreads its radii **34 – 56** so that spec 01 §13.2's exponent is flyable (2.7× reach between the largest body and the smallest at `n = 2`, 1× at `n = 0`); and a press is held while any device holds it. The layer criterion is now written in the direction `pnpm portable` cannot look — **the renderer draws presentation state and asks the simulation nothing** — and spec 00 §1's colour lint exists while the renderer still draws three colours. **One measurement the gate needs before it starts**: the design space is authored at the size of a whole phone screen and a browser gives a page less, so on ADR-0011's measured 393×651 viewport the game draws at **77%** of the size the prototype draws at on the same phone, with a 46-point bar down each side — spec 00 §7 applied exactly as written, and a difference the back-to-back comparison should either discount knowingly or rule away. **The gate has moved** (author, 2026-08-27): it is now flown **after M1.5**, with a recorder running, because M1.5 was always described here as the instrument the gate uses and was still scheduled after the gate that uses it — a session flown without one spends the scarcest input this project has on a sentence nobody can reproduce. The order in M1 is therefore **M1.1 → M1.2 → M1.3 → M1.6 → M1.5 → gate → M1.4**, and M1.5's scope grows to match: the recipe and `pnpm replay`, plus a recorder in the shell, the dev-only phone-to-laptop endpoint extended (**its validator, not its narrowing**), and a reader an agent can walk. **M1.4 is then back in front of the gate** (author, 2026-08-27, after flying M1.6): *"planets are obstacles — I should crash and die."* That is spec 01 §10, already written and not yet built, and 83% of real endings are out of bounds — a field you can pass straight through is not the field spec 01 was measured in. The order is therefore **M1.1 → M1.2 → M1.3 → M1.6 → M1.4 → M1.5 → gate**. The demo also confirmed the camera prediction M1.6 recorded, and both halves of the fix — easing the camera's subject onto the body through a *settled* orbit, and a vertical deadzone — need presentation state to carry memory between ticks, **which is an ADR and is not really about the camera**: spec 02 §5's kick, spec 00 §3's E3 decay and spec 05 §3's wake all decay too. One design question is open and is the author's: **how far a drifting craft may turn off the exit tangent**, given that `CONTEXT.md` and spec 00 §6 fix the nose on it because *"the nose says where; the hand says when"*. All five items are routed under [M1 · Flown](./m1-the-swing.md#flown-2026-08-27--what-the-demo-said). **The camera is now fixed** on [ADR-0015](../adr/0015-presentation-state-carries-what-decays.md) — presentation state carries what decays, and `derive(previous, sim)` is a recurrence evaluated once per tick, which the release kick, the E3 decay and the rungs' wake all needed anyway. Three mechanisms: a lock that makes the *body* the view's subject through a **settled** orbit and is exactly zero through the dive and the oval, a deadzone of **168** design units derived as the median body's floor radius, and an ease at **8**/s bounded from below by the thumb line. Measured over four swings: the orbit swing reaching the view falls from **100% to 0.1%**, the camera never out-runs the craft, and the craft's lowest point is **182** design units below centre against a budget of 422. **253 tests.** **M1.4 is next** |
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
