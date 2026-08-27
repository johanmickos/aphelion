# M0 · Foundations, specs, and the renderer verdict

No gameplay in this milestone. It produces the documents every later step reads, the repo
those steps commit into, and the one architectural answer nobody can guess: whether
Canvas2D can carry this design.

---

## M0.1 · Write the specs

The twelve design boards are argued essays with live components. Implementers need the
numbers. Transcribe each into `docs/spec/`, per ADR-0002: the board stays canonical for
appearance, the spec becomes canonical for behaviour and numbers, and each spec links its
board.

Write these from the boards: `00-tokens`, `02-release`, `03-hud`, `04-bodies`, `05-field`,
`06-awards`, `07-boundary`, `08-economy`, `09-debrief`, `10-results`, `11-front-door`,
`12-finish`. Write these from scratch, since no board covers them: `13-fuel`,
`14-retro-grade`, `15-audio`, `16-powerups`, `17-daily-field`.

**The rulings are already made.** Apply them; do not re-litigate them:

- Award vocabulary is **TRUE / SHARP / PERFECT** plus an unnamed **make**. Direction 06
  rev 2 retired DEADEYE / SHAVED / CLEAN; Directions 01 and 02 still show them.
- Direction 08 owns the **arithmetic** (carry × tier × band × streak); Direction 06 owns
  the **presentation** (word over points, born at the dot). Every absolute point value
  printed on boards 02, 03 and 06 — `+445`, `+556`, `+668`, `+890` — is a stale
  illustration from a superseded model. Carry none of them into a spec.
- Display face is **Anton**; everything that moves or reports is **Archivo**. Direction 03
  contested it, Direction 06 settled it.
- A **held** body is E2 and alive. It goes DUSK only after release (Direction 04 corrects
  Direction 01 explicitly).
- Bodies are named by **hue in the run and address in the retelling**. The `P11` chips on
  boards 01–03 are retired.
- The **"NEXT, IN ORDER" footers on boards 02 and 05 use obsolete numbering.** The design
  index is authoritative. Direction 13 is referenced by three boards and does not exist.
- **Parallax star layers are refused** (Direction 05). Dust varies in brightness, never in
  velocity, no matter what `VISION.md`'s prose suggests.
- **Carpet dots pay flat and unmultiplied.** This violates the constitution's axioms and is
  a deliberate, argued exception (Direction 12). Record it as an exception so nobody later
  "fixes" it.
- **ION is monopolised in the world, not on the craft.** Fuel, the deadline track and the
  save trail all wear pink legitimately; nothing else in the world does.

Four specs have no board and their content was decided directly:

- `13-fuel`: fuel is what a save costs. The deadline window is drawn at true size and lit
  only to the fraction the tank affords. Fuel returns in proportion to **release tier**,
  never to points cashed; an anomaly orbit trickles it; a survived burn refunds part of
  what it cost (ADR-0009).
- `14-retro-grade`: weighted to post-processing, plus a handful of authoring rules the other
  specs inherit — a minimum stroke weight, dither in preference to smooth gradients, display
  type only from the arcade face. Keep it short; it is a knob to tune on a phone, not a
  workstream.
- `15-audio`: audio is a mechanic, not a coat of paint. The load-bearing idea from
  `VISION.md` is a pitch ramp through the boost arc peaking at the release window, which
  would teach the timing better than the compass does. Hitstop is a cut, not a fade.
- `16-powerups`: powerups pay **fuel and time, never points and never multipliers**
  (ADR-0009). Spawn rule, lifetime, pickup, HUD presence, duration.
- `17-daily-field`: a day is a named field of 40 bodies. Difficulty is authored as a
  **geometry curve over altitude** — spacing, corridor width, body radius — because
  `VISION.md` establishes that generation is currently stationary and nothing gets harder
  past ~25 seconds. Standard bodies only in v1. Express the day as a *recipe* so that
  adding body types later is a data change.

**Acceptance**: seventeen specs exist; each cites its board or states that it has none;
no spec contains a number contradicted by a higher-numbered board; every term used appears
in `CONTEXT.md`. **Verify**: read them.

---

## M0.2 · Repo scaffold

TypeScript, Vite, Vitest, ESLint, Prettier, pnpm, Node 26. `app/` is the Vite root, `src/`
is the game. Relative base path (`base: './'`) because GitHub Pages serves from a subpath.
A CI workflow running the full check on push, and a Pages deploy from `main`.

**Acceptance**: `pnpm check` runs typecheck, lint, format check and tests, and is green on
an empty project. A pushed commit deploys. **Verify**: `pnpm check`, and a live URL.

---

## M0.3 · The three-layer skeleton and the boundary that enforces it

Per ADR-0006: `src/sim/` (pure, headless, owns ticks), `src/state/` (presentation state
derived per tick, also pure), `src/render/` (pixels and interpolation only).

Rebuild the prototype's portability idea — do not copy the file. A checker that statically
bans package imports, DOM globals, `performance.now`, `Math.random` and bundler-specific
syntax inside `src/sim/` and `src/state/`, forbids `src/state/` importing `src/render/`,
and then executes the simulation under plain `node` to prove it. Wire it into `pnpm check`.

**Acceptance**: the checker fails loudly when a DOM global is added to `src/sim/`, and when
`src/state/` imports the renderer. **Verify**: `pnpm portable`, plus a deliberate violation
that must fail.

---

## M0.4 · The QR dev server

Rebuild the prototype's approach: hook Vite's `printUrls` so the QR lands after Vite's own
banner rather than before it (Vite clears the terminal on startup and would wipe it), read
the *resolved* network URL so it survives port changes, bind all interfaces, and offer a
keypress to reprint after HMR output scrolls it away.

**Acceptance**: `pnpm dev` prints a scannable code that opens the game on a phone on the
same network. **Verify**: scan it.

---

## M0.5 · The renderer spike

The design makes glow a first-class channel — four energy tiers, on the craft, the trail,
every compass window, every body rim and tide, the boundary bands, the dust — over a
full-screen lattice of rungs that deform toward every mass and part around the craft every
frame, under a retro grade. `VISION.md` records that a rendering-induced slowdown already
reached a phone once with nothing in the repo able to catch it.

Build a throwaway scene: ~120 rungs deforming toward 3 bodies, 40 glowing elements at
mixed energies, a full-screen grade. Measure **p99 and max frame time on the author's
phone**, never mean — that class of bug hides behind an average of calls that mostly
return early.

Ladder, in order, stopping at the first that holds: **(a)** Canvas2D with bloom hand-rolled
as an offscreen half-resolution blur composited with `lighter`; **(b)** Canvas2D scene
uploaded as a texture to a single WebGL post pass doing bloom, grade, grain and scanlines
together; **(c)** a hand-rolled WebGL2 renderer; **(d)** PixiJS.

The zero-dependency rule is a **principle for `src/sim/` and `src/state/`** and pragmatic
for the renderer — so (d) is genuinely on the table, but only if (b) and (c) fail.

**Acceptance**: a measured verdict at p99 ≤ 8ms on the author's phone, and an ADR recording
which option won and what the numbers were. **Verify**: the harness output.

---

## Exit

Seventeen specs, a deploying repo, an enforced three-layer boundary, a phone you can reach,
and a renderer decision backed by numbers. Next: [M1](./m1-the-swing.md).
