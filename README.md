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
pnpm dev               # dev server + a QR code to open it on your phone
```

`pnpm dev` prints a scannable QR for this machine's LAN address, so you can point
a phone camera at the terminal and start playing. Both devices need to be on the
same network.

The QR is printed by a Vite plugin (`tools/vite-plugin-qr.ts`) rather than a
wrapper script, for two reasons: Vite clears the terminal on startup, so anything
printed beforehand is wiped; and the plugin reads the server's _resolved_ network
URL, so the code stays correct even when Vite picks a different port than asked.

Press **`p`** in the terminal to reprint the code after HMR output scrolls it
away, or **`P`** for a larger one if your camera struggles. The generator is
`tools/qr.py` — dependency-free, ISO/IEC 18004, byte mode, EC level M.

The dev server binds all interfaces (`server.host`) so the phone can reach it.

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
src/render/           Camera, scene, HUD, compass. Everything that knows about pixels.
src/app/              The fixed-timestep loop, run lifecycle, tuning, diagnostics.
tools/                Headless harness, golden capture, replay, QR + Vite plugins.
test/                 The equality gate, invariants, scenario matrix, render guards.
golden/               Recorded reference trajectories.
docs/                 FEEL.md (what it should feel like, and what not to retry).
                      PORT_NOTES.md (what the port changed and why).
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

Precisely: the port reproduces the prototype under `PROTOTYPE_CONFIG`, which is
frozen and never edited. The game runs `DEFAULT_CONFIG`, which starts from it and
diverges deliberately — every difference is documented at its declaration in
`src/sim/config.ts`. That split is what lets the game be tuned without ever
weakening the proof.

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

## Reporting a problem you hit while playing

Because the simulation is deterministic, a bug report is a **recipe, not a
recording**: `(config, seed, inputLog)` reproduces a whole session, so a
ten-minute run is under a kilobyte and can be pasted straight into a chat.

While playing:

1. Press **⚑** the moment something feels wrong. It stamps the current tick and
   does not interrupt play, so keep going. (`RESET` will ask before discarding
   flags you have not sent.)
2. Press **DIAG**, describe what happened, then either:
   - **SEND TO DEV SERVER** — the report is posted straight to the running dev
     server, replayed, and the analysis is printed in the laptop terminal
     immediately. No copying, no clipboard permissions. Reports land in
     `diagnostics/` (gitignored).
   - **COPY** — for pasting somewhere else. On a LAN dev server the clipboard API
     is unavailable (http is not a secure context), so the button selects the
     text instead; long-press to copy.

The send endpoint is **dev-only**: the plugin is `apply: 'serve'` and the client
half sits behind `import.meta.env.DEV`, so both the endpoint and the button are
eliminated from a production build — verified by grepping the bundle. It writes
files on a server that is bound to all interfaces, so it is deliberately narrow:
POST only, a hard body cap, must parse as a report of the expected schema, and the
filename is generated server-side so a caller cannot choose a path.

To analyse a report by hand:

```bash
node tools/replay.ts report.json
pbpaste | node tools/replay.ts -
```

The replay **grades its own fidelity** first, and reports it:

| grade      | meaning                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| `exact`    | every checkpoint matches bit for bit (same engine)                                   |
| `close`    | positions agree within 2px — cross-engine float rounding only; detail is trustworthy |
| `drifted`  | same decisions, numbers diverging; phases and events reliable, late positions not    |
| `diverged` | the run genuinely took a different path — or the report is from another build        |

Phone replays are bit-exact in practice. Getting there required replacing
`Math.hypot` with `sqrt(x*x + y*y)`: `hypot` is not correctly rounded and
JavaScriptCore and V8 disagree on 36% of inputs, which compounded through orbital
motion until it flipped whole decisions after ~10 seconds. See PORT_NOTES 15
and 16.
Every report carries state
fingerprints at intervals, and the tool re-runs the session and compares them. If
they all match, the replay _is_ the session you played and anything it reports can
be trusted; if they diverge, the tool says so and names the first bad tick —
because that means something non-deterministic got into the simulation, which is a
more urgent finding than whatever was originally being reported.

It then prints automatic findings (how runs ended, kinks, fuel starvation, floor
contact) and a window around each moment you flagged.

---

## Design notes

- [`docs/FEEL.md`](docs/FEEL.md) — why the capture is built the way it is, the bar
  any tuning change has to clear, and the approaches already tried and rejected.
  Mechanism is documented next to the mechanism, in `src/sim/`.
- [`docs/PORT_NOTES.md`](docs/PORT_NOTES.md) — every bug reproduced, every change
  made deliberately, and why.
- `docs/VISION.md` — an earlier, broader design. Kept locally for reference and
  deliberately untracked; it describes a different game from the one being built.

---

## Status

Stages 0 and 1 are complete: the simulation is ported and provably faithful, and
the game renders, reports, and can be tuned from the device.

| Stage | Scope                                                                   |
| ----- | ----------------------------------------------------------------------- |
| 0 ✅  | Headless harness, verbatim port, equality gate green                    |
| 1 ✅  | Renderer, HUD, compass, run lifecycle, tune panel, diagnostics          |
| 2     | Fix the PORT-NOTEs one at a time, re-blessing each with a reasoned diff |
| 3     | Pickups, effects, new celestial bodies                                  |

### Playing

A session starts **armed**: nothing is moving, `TUNE` is available, and the first
tap starts the run. That is not decoration — a run is `(config, seed, inputLog)`,
so the configuration has to be fixed before the first tick for a replay to
reproduce it. `RESET` returns to armed.

Press and hold near a body to be caught by it; release to fling along the tangent.
The compass rings show where to let go to reach each body further up the climb,
sized by distance. Falling too far below your highest point ends the run.
