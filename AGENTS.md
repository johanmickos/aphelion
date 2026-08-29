# Working in this repo

Orientation is in `README.md`. What the game is for is `docs/VISION.md`; the words it is
said in are `CONTEXT.md`; how it must behave is `docs/spec/`; why things are the way they
are is `docs/adr/`; what to build next is `docs/plan/`.

**This file is rules only** — the things that are true across sessions and that a fresh
agent would otherwise break. Every rule here exists because it was broken once.

---

## 1 · Non-negotiable

1. **`pnpm check` is green before any merge.** Typecheck, lint, format, `pnpm portable`,
   and the full test suite.
2. **No remote, no push, no PR, no `gh`.** Deliberate and deferred. Branch off `main`, and
   when the step is done merge back with `git merge --ff-only` and delete the branch.
   `main` is the only branch.
3. **The prototype at `~/git/aphelion` is never modified.** Not a file, not a format pass,
   not a scratch script inside it. It is read and it is driven. Anything you need to run,
   run from your own scratch directory outside both repos, and delete it when you are done.
4. **A gated step stops.** Do not start the next step, do not get a head start, do not
   decide the gate is a formality. The author flies the build and says yes (ADR-0004).
5. **`docs/` is author-owned** and excluded from lint and format. Write it well by hand.

---

## 2 · The domain language is the architecture

`CONTEXT.md` is the glossary and it is binding on prose, on specs, on type names, on
function names and on tests. One concept, one word, everywhere.

- **If you need a word the glossary does not have, add it to `CONTEXT.md` in the same
  change.** Never coin a term in a spec or in code and leave the glossary behind. A spec
  that uses a word thirty times without an entry has forked the vocabulary, and the second
  reader will invent a synonym for it.
- **Check the `_Avoid_` lines before naming anything.** They are rulings, not preferences.
  A body is _grabbed_, never captured, caught or hooked. A craft _releases_, it does not
  fling, launch or slingshot.
- **Names from the prototype do not cross.** Its identifiers are its own. When this repo
  needs a quantity the prototype also had, give it the name this project's glossary would
  give it, and state what it is rather than what it was called next door.

---

## 3 · Consulting the prototype

ADR-0001 rules that no file is copied. That is the floor, not the whole rule.

- **Carry the behaviour, re-derive the mechanism.** What the prototype has that is worth
  keeping is how it _behaves_, and behaviour is what a test can observe from outside:
  positions, speeds, times, angles, ratios. How it got there is its own business and is
  usually shaped by sixteen abandoned attempts and a config key that outlived its reason.
- **A mechanism crosses only when the behaviour cannot be stated without it**, and then it
  is written down as _evidence for_ the behaviour, plainly marked, never as an instruction.
  Spec [01 · §6a](./docs/spec/01-swing.md) is the worked example: the freeze is
  deliberately physically inconsistent, that inconsistency is load-bearing, and the spec
  therefore says so — and still states the contract as three things a test can measure.
- **State provenance and cohort with every measurement.** Which build, how many samples,
  and what was excluded. `VISION.md`'s seventh pillar rules that the standing hazard is
  staleness: a number measured under tuning that has since moved is worse than an
  unmeasured one, because it looks defensible.

---

## 4 · Specifying behaviour

- **Specify observables, not internals.** If the only way to check a characteristic is to
  reach inside the simulation and read a field, it is specified wrong — rewrite it as
  something measurable at the boundary. A test welded to a variable name is a test that
  forbids the refactor it should have survived.
- **Every number says which of three kinds it is** — measured, ruled, or an opening
  position (`docs/spec/README.md`). An opening position says so in the sentence carrying it.
- **Every characteristic carries a tolerance**, because the tolerance is what becomes a
  test. A tolerance is a band the implementation must land inside, never a value to
  reproduce.

---

## 5 · Before you ask the author

The author's time is the scarce resource, and a question they have already answered is
worse than no question.

1. **Search `docs/spec/` and `docs/adr/` first.** Read the spec README's _Open questions_
   and _Rulings_ tables — the answer is often already there under a different heading. In
   M1.1 the mass-to-radius relation was raised as an open question when
   [spec 04 · §1](./docs/spec/04-bodies.md) had already ruled _"mass is size"_ and named
   spec 01 as the home for the mapping.
2. **Bring evidence, not the bare question.** Measure what each answer would do first. A
   question with a table under it is a decision; one without is homework.
3. **Then genuinely stop.** If a spec is wrong, silent, or contradicts another spec, say so
   and do not invent the ruling. Record what you could not decide and why.

---

## 6 · Keeping the code navigable

The stated deliverable is **a technical architecture that is easy to maintain and extend**
(author, 2026-08-27). That is a constraint on every change, not a phase at the end.

- **The three layers are a wall** (ADR-0006). Simulation is pure and headless and owns the
  only clock. Presentation state is derived per tick and is equally pure. The renderer owns
  pixels and nothing else. `pnpm portable` proves the first two; it is a floor and not a
  substitute for keeping the boundary meaningful.
- **Each spec's acceptance includes at least one criterion that fails if a layer boundary
  is crossed.** Keep writing them.
- **Prefer a module that hides a decision to one that exposes a setting.** The prototype's
  seventy-eight-key config is the thing this rewrite exists to not become. A new knob wants
  an argument for why the decision cannot be made once, inside.
- **Comments say why.** What the code does is readable; what it is defending against is not.
- **No runtime dependencies.**

---

## 7 · Tooling

- **Node 26. TypeScript is pinned to 6.x on purpose** — the reason is at the top of
  `eslint.config.js`. Read it before touching the pin. Otherwise this project tracks latest.
- **`pnpm portable`** scans `src/sim/`, `src/state/` and `src/input/`: no `Math.random`, `Date.now`,
  `performance`, or DOM globals there, and **no `Math` function ECMA-262 leaves
  implementation-approximated** — `hypot`, `pow`, `sin`, `cos`, `atan2` and the rest — nor the
  `**` operator, which carries the same latitude as `Math.pow`. Two engines return different
  bits for those, a recipe recorded on the phone is replayed on a laptop, and the two failures
  look identical in the numbers (ADR-0014). The simulation writes its own in `src/sim/trig.ts`
  and `src/sim/math.ts`. `enum`, `namespace` and parameter properties are banned across all of
  `src/`. `src/input/` is not a layer — it holds the rule that turns devices into the
  simulation's one boolean, and the listeners feeding it live in `app/`, so the rule can be
  exercised without a browser. `src/render/` is deliberately unscanned: it is the one layer
  allowed a browser, and what constrains it is the other direction — **the renderer draws
  presentation state and asks the simulation nothing**, which is `test/render/boundary.test.ts`.
- **`pnpm dev`** prints a QR for the LAN address; `s` reprints it, `S` prints it larger.
- **`pnpm replay`** takes a recipe or a **dispatch** and flies it, printing the trail — which
  tick a grab happened on, what the geometry was, where on the envelope a release fell. With
  no argument it flies the one this repo ships. It is how a sentence about the feel of a
  swing gets a run underneath it.
- **`pnpm profile`** takes the same recipe or dispatch `pnpm replay` does and says where a
  tick's time goes: `stepSim` against `derive` against the two pieces of `derive` that walk
  the field, as a distribution and never as a mean, with the worst ticks named and lined up
  against what the run was doing. It also runs the field-size sweep — the **same run** in a
  field up to 64× the size, with the extra bodies parked out of every reach so the flight is
  provably unchanged — and a **draw census**, which counts what the renderer asks the canvas
  for rather than timing it, because a count travels to a phone and a millisecond does not.
  **It is a laptop and it says so on every line.** What it produces are ratios and slopes;
  the absolute numbers come from the phone, through the meter below.
- **`tools/meter.ts`** is what counts frames on the device, and it rides in the dispatch. It
  is handed its timestamps rather than reading a clock — the same rule `ticksDue` is written
  under, and the only reason its arithmetic can be tested. The phone's `performance.now()` is
  clamped to a whole millisecond, so it sends a **histogram** and not four percentiles: the
  terminal computes the percentiles, and grouping frames by how many ticks each ran recovers
  what a tick costs and what a frame costs to a tenth of a millisecond out of a clock that
  cannot tell them apart. Read its header before changing what it carries.
- **`pnpm bench`** builds the desktop bench: this game, bundled for the browser, with the open
  questions on sliders — one self-contained page in `bench/`. It runs **the repo's own
  simulation**, which is what makes a verdict reached on it a verdict about the game. The
  constants it makes settable are listed in `tools/bench/patches.ts` and **stay `const` in
  `src/`**: §6 asks a knob for an argument about why the decision cannot be made once inside,
  and _"so it can be flown"_ is an argument for a bench. Move one of those constants and
  `test/bench.test.ts` fails, because a bench whose sliders are wired to nothing answers
  questions confidently and wrongly.
- **A recipe names the field it was flown in, so the field carries a version**
  (`src/sim/fixture-field.ts`, following spec 17 §2). Change anything that field builds —
  a placement, the corridor, the spawn, or `MASS_EXPONENT` — and bump the version with it.
  `test/sim/fixture-field.test.ts` fails until you do, and the cost of not doing it is old
  recipes replaying against a field nobody flew, in numbers that all look reasonable.
- **`tools/vite-plugin-diag.ts`** receives what the author's phone has to say — a timing
  report or a dispatch — and writes it to `diagnostics/`. Read its header before extending
  it: it writes files on a server bound to all interfaces and it is narrow on purpose.
  **Extending its validator is the change; loosening it is not.**
