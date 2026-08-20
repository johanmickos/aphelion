# Aphelion

_A zen game about swinging a spaceship through gravity._

A ship drifts upward through a vertical field of planets. You do exactly one
thing: **press and hold** to let a planet's gravity capture you into orbit, then
**release** to fling out along the tangent toward the next planet. Chaining those
slingshots is how you climb.

TypeScript, Canvas2D, **zero runtime dependencies** — the game is also the engine.

---

## Quick start

```bash
pnpm install
pnpm dev:lan          # dev server + a QR code to open it on your phone
```

`pnpm dev:lan` prints a scannable QR for this machine's LAN address, so you can
point a phone camera at the terminal and start playing. Both devices need to be
on the same network. Plain `pnpm dev` starts the server without the QR.

```bash
pnpm check            # typecheck · lint · format · portability · golden · tests
pnpm test             # tests only
pnpm build            # production bundle into dist/
```

---

## Where things are

```
index.html            The prototype. IMMUTABLE reference material — never edit it.
app/                  The playable shell (Vite root).
src/sim/              The simulation. No DOM, no dependencies, no bundler syntax.
src/render/           Camera, letterboxing. Everything that knows about pixels.
src/app/              The fixed-timestep loop.
tools/                Headless harness, golden capture, QR, dev script.
test/                 The equality gate, invariants, scenario matrix.
golden/               Recorded reference trajectories.
docs/                 DESIGN.md (current), PORT_NOTES.md (the port record).
```

**`index.html` is the reference implementation and must not be modified.** It is
the 1254-line single-file prototype in which the capture mechanic was found, after
16+ failed attempts. Everything in `src/sim/` is verified against it.

---

## How correctness is maintained

The simulation is a **verbatim port** of the prototype, and a test proves it:

```
pnpm test → port equality vs index.html: 10 scenarios, divergence exactly 0
            (position · velocity · fuel · phase)
```

`tools/prototype-harness.ts` loads `index.html` into a `node:vm` context behind a
minimal DOM stub with an injected clock, and drives it at a fixed timestep. The
port must reproduce it **exactly** — not within a tolerance. That is what protects
a game feel that took 16 attempts to find.

Consequences worth knowing before you change anything:

- **The prototype's bugs were reproduced, not fixed.** Each is logged in
  [`docs/PORT_NOTES.md`](docs/PORT_NOTES.md) and marked at its site in the code.
  Fixing one is a deliberate act that will fail the gate loudly and specifically —
  which is the point.
- **The simulation is deterministic.** A run is fully described by
  `(config, seed, inputLog)`, so any session can be replayed exactly. Config is
  frozen for the duration of a run.
- **No wall-clock time in the simulation.** Everything is addressed by integer
  tick; a display time is derived as `tick × dt`. An earlier attempt at this
  project stored rounded times instead and produced six divergences that "read
  convincingly like a physics bug."
- **`src/sim/` imports nothing outside itself.** `pnpm portable` enforces it —
  banning package imports, DOM globals, `performance.now`, `Math.random` and
  bundler-specific syntax — then runs the sim under plain `node` to prove it.

### The timestep

The simulation advances only in fixed `1/60` steps, six substeps each. Rendering
runs at display rate and interpolates, so a 60Hz simulation still presents
smoothly on a 120Hz screen. `dt` is a parameter rather than a global, so it can be
changed later by recapturing goldens.

Measured: 60Hz and 120Hz diverge by 0.1–3.5px over 1.2s of whip, which is a
fraction of the ship sprite. The choice was made on battery and on the tuning the
feel was built at, not on accuracy.

### One frame-denominated constant

`clearEaseFrames` is counted in **frames**, not seconds, so its real duration
depends on `dt`. It is inherited from the prototype and quarantined deliberately.
**Do not add others** — each one silently re-tunes itself if the timestep changes,
which is the only thing that makes the timestep hard to revisit.

---

## Design notes

- [`docs/DESIGN.md`](docs/DESIGN.md) — the current design and the phase-clock
  capture architecture. Note that it documents a `whip` phase the code does not
  have; see PORT_NOTES 4. Treat the code as authoritative.
- [`docs/PORT_NOTES.md`](docs/PORT_NOTES.md) — every bug reproduced, every change
  made deliberately, and why.
- `docs/VISION.md` — an earlier, broader design. Kept locally for reference and
  deliberately untracked; it describes a different game from the one being built.

---

## Status

Stage 0 is complete: the simulation is ported and the equality gate is green.
The app shell is deliberately primitive — bodies and ship as bare primitives, no
HUD, compass, crash cone or trail. **The renderer is Stage 1.**

| Stage | Scope                                                                              |
| ----- | ---------------------------------------------------------------------------------- |
| 0 ✅  | Headless harness, verbatim port, equality gate green                               |
| 1     | Renderer, run lifecycle (armed → running → ended), tune panel, diagnostics capture |
| 2     | Fix the PORT-NOTEs one at a time, re-blessing each with a reasoned diff            |
| 3     | Pickups, effects, new celestial bodies                                             |
