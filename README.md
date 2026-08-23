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
docs/                 PORT_NOTES.md — what the port changed, and why.
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

Most phone replays are bit-exact, and getting there required replacing
`Math.hypot` with `sqrt(x*x + y*y)`: `hypot` is not correctly rounded and
JavaScriptCore and V8 disagree on 36% of inputs, which compounded through orbital
motion until it flipped whole decisions after ~10 seconds. See PORT_NOTES 15
and 16.

**`sin`, `cos` and `atan2` were not replaced and are the same class of hazard.**
The phase clock calls them every tick of a settle, so a difference appears there,
each subsequent capture amplifies it, and a respawn wipes it — which means a long
unbroken chain of captures can fork the run while a crash-heavy session of four
times the length replays perfectly. Measured across eleven recorded sessions: one
262-second, 61-grab run stayed within 0.37px, and one 57-second, 19-grab run with
a single death diverged completely from about tick 1900. When that happens the
tool now names the last tick that was still bit-exact, because everything before
it is still the session you played.

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

Design rationale lives next to the code it explains, not in a separate document
that drifts: why the capture is shaped the way it is heads `src/sim/capture.ts`,
the bar any tuning change has to clear sits above `DEFAULT_CONFIG`, and each
rejected approach is recorded at the site that would tempt you to retry it.

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

Scoring landed ahead of Stage 3 on purpose: what scoring rewards determines what a
pickup should do.

### Scoring

`src/score/` scores a session. It is an **observer**: it runs after `stepSim`,
reads `SimState`, and the simulation never learns it exists — so a score stays a
pure function of `(config, seed, inputLog)` and `node tools/replay.ts` recomputes
the exact score a phone session showed. `pnpm portable` enforces the boundary.

A capture is **two scoring events**, settled at different moments and describing
different acts:

- the **grab**, judged on how the ship arrived, paid when the dive swings through
  periapsis — not at the press, so a tap that never reaches the bottom earns
  nothing and tapping beside a planet is not a points faucet;
- the **link**, judged on how it left, paid at the release.

Between them they are paid on:

| event | component | what it measures                                        | where it comes from     |
| ----- | --------- | ------------------------------------------------------- | ----------------------- |
| grab  | close     | how near you let the body get before grabbing           | `cap.grabR - cap.minR`  |
| grab  | nerve     | a late press on a line already headed inside the orbit  | `src/score/praise.ts`   |
| link  | climb     | ground covered since the previous link, banked not paid | `state.highWaterY`      |
| link  | peak      | where in the boost envelope the release landed          | `cap.boost / boostFull` |
| link  | aim       | how close the release was to a compass marker           | `src/score/aim.ts`      |

times a streak multiplier that rises with consecutive links and is lost to a
putter-out or a death.

### The charged window

Releasing from an anomaly's orbit leaves the ship **charged** for
`chargedSecs` — seven seconds during which _every_ grab zips: the press is the
arrival, and a glide carries you onto the destination orbit instead of diving to
it. The ship arcs with the anomaly's own purple for the duration, and a bar drains
under the score.

Each **hop** onto a fresh body pays a flat `hopBonus`. Flat is deliberate and it
is the only award in the game that ignores the multiplier: reaching an anomaly is
hard and usually costs the streak on the way out to it, so a reward that shrank
exactly when it was hardest to earn would be the wrong shape. A hop replaces the
grab award rather than stacking on it — one number at the busiest moment in the
game — and nothing about flying well is lost, because the link at the release is
untouched and still scores aim, timing and climb at full multiplier.

Charged, a press **throws the web forward**: the body you just released from is
never on offer, and a body ahead of you is preferred over a nearer one behind.
That is a preference and not a gate — with nothing takeable ahead the ordinary
nearest body is still offered — so it can never waste a press or let a window
expire on a refusal. Without it, a real session spent three of five presses in one
window zipping straight back onto the planet it had just left.

Every hop lands on the **same orbit** — `chargedOrbitR`, an absolute 90px, so the
height and the lap time are identical on every body. It used to land on the orbit
the dive would have reached, which measured across 108,000 approach geometries as
a lottery rather than a gradient: 43% pinned at the minimum and the top quartile
sat 3–8× above it. A frenzy is a rhythm, and a rhythm needs every beat the same.

While it runs, the sky around the ship becomes a **purple nebula** — a field of
overlapping clouds hashed from a world grid, so they parallax with the starfield
and you fly through structure rather than carrying a lamp. Some lean pink, some
deep violet, and the gaps between them stay black, which is where the light and
dark areas come from. The ship's own glow and arcs build with each body taken, so a chain
that is going well is visibly hotter than one that is not. The storm does **not**
fade out: it holds, agitates through the last fifth, and closes on a
bloom-and-collapse, because an earlier version that dimmed linearly ended the best
moment in the game without a signal.

Each hop's `+500` pops small — three or four arrive in seven seconds and every one
is the same number, so they are receipts. When the window closes, the total pops
large. That total is a **restatement**, not a payment: the points were banked as
each hop landed, so dying mid-window still keeps every hop you actually made.

A body pays **once per window**. Bouncing on one planet is still legal; it just
stops paying, because a press-glide-release cycle is about 1.2s and otherwise the
best line inside a frenzy would be to stand still. And a hop is judged on
`cap.zipped`, not on the live clock, so a glide begun inside the window still pays
when it lands after it — the press is the commitment.

The window lives in `SimState`, not in the scorer, and it had to: it grants an
ability rather than points, and `src/sim/` may not import `src/score/`. See
PORT_NOTES 49.

**Nothing takes points away.** There was a penalty for rising past a planet you
could have taken, and it was removed for being too punitive. The pressure to keep
engaging is still there and comes from `climb` being banked rather than paid:
altitude only cashes at the next link, so coasting earns nothing until you engage
again. Withholding a reward and confiscating one are different in the hand.

The score is the **current life's**: a death takes the points as well as the
multiplier, and `best` keeps the number you are trying to beat. `RESET` reloads,
so it clears everything.

Peak and aim are the pair worth playing for, because they **fight**: the boost
peaks a fixed 0.45s after the orbit freezes and the marker sits at a fixed angle,
so hitting both means shaping the dive to bring them together. That is entirely
built out of physics that already existed — the score only names it.

`close` is grab clearance and not `cap.tightness`, which reads as the same idea
and is useless as one: measured over 112 real releases it sits at 0.99+ for three
quarters of them, so it paid every capture the same.

An event well above the player's usual standard on one of those qualities also
earns a **word** — `HAIRLINE`, `BULLSEYE`, `SLINGSHOT` — floating up beside the
ship next to the points.

Colour on those words means **how good it was, and nothing else**: grey, blue,
green, gold, the rarity ladder every player already knows. It used to mean _which_
quality, which is six hues read in peripheral vision over a moving starfield —
past what anyone tells apart, and all of it learned before it meant anything,
while "how good was that?" had no channel at all. Which quality it was is carried
by the word instead, and every word names its own axis: proximity for the grab
(`GRAZED`, `WHISKER`), composure for a nerve grab (`BRINK`, `CLUTCH`),
marksmanship for aim (`PINPOINT`, `DEADEYE`), launch for the boost window
(`SLINGSHOT`, `REDLINE`). `src/render/accolade.ts` is the single table the score
band and the popups both read, so the two cannot drift apart. Two qualities at their top tier at once earns a rare superlative
instead.

One word is not a quality but a **conjunction**: a _nerve grab_ (`NERVE`,
`CLUTCH`, `STEEL`) is a late press on a line that was already headed inside the
minimum orbit — you were going to hug the planet whether you grabbed or not, and
you waited. `close` alone cannot see it: a ship 50px off a planet on its way past
is in the same place as one 50px off and boring straight in. Its skim bound is
`0` rather than a percentile, because zero is a real boundary in the simulation —
the radius the floor clamp defends — so it needs no calibration and cannot drift
as the feel changes. It pays a flat `nerveBonus` as well as naming itself.

A **reckless shout** (`RECKLESS!`, `WILD CHILD!`) is a separate channel from all
of that. It fires mid-capture, at the instant the ship gets thrown around, rather
than at a release; it pays nothing; and it only starts once three captures in a
row have been flown roughly enough to qualify. A clean capture or a death ends the
run. The two channels answer different questions — "was that a good release?" and
"are you doing this on purpose?" — so they are kept apart in
`src/score/reckless.ts`.

The thresholds in `src/score/praise.ts` are percentiles of real play
rather than round numbers, because round numbers get this wrong: gated at a
plausible 0.90, the boost-peak word would have fired zero times in those 112
releases. Word choice is seeded from the tick, so a replay shows the words the
player actually saw.

The weights in `src/score/config.ts` are a first cut and want playtesting; every
replay prints the release qualities a session actually achieved — and the word
each one earned — which is the intended way to calibrate them. They are
deliberately **not** in `SimConfig`: see the header of that file for the three
reasons.

### Playing

A session starts **armed**: nothing is moving, `TUNE` is available, and the first
tap starts the run. That is not decoration — a run is `(config, seed, inputLog)`,
so the configuration has to be fixed before the first tick for a replay to
reproduce it. `RESET` returns to armed.

Press and hold near a body to be caught by it; release to fling along the tangent.
The compass rings show where to let go to reach each body further up the climb,
sized by distance. Falling too far below your highest point ends the run.
