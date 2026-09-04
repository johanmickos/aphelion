# M4 · The economy

Spec `08-economy`, which is not a re-skin of anything. The prototype paid a grab at periapsis
and a link at release; the constitution pays **metres climbed while engaged**, priced at
release. Five axioms govern every number: progress is the only base currency; skill only
multiplies; coasting is unpaid and never punished; points exist as carried or banked; and
**every multiplier has a pixel** — if a scoring rule cannot point at the thing that announced
it, the rule is wrong.

---

## M4.1 · Carry, cash, bank

Metres accrue during a swing as **carry**, at stake, visible as the brightness of the trail, so
the player can always see what death would cost without reading a number. Release **cashes** it
at the graded price into the **bank**, dim and safe. Coasting accrues nothing and loses nothing.

**A release outside the window does not cash at all** (ADR-0008). The carry is neither paid nor
destroyed: it rides into the next swing. Pricing a miss at ×0 would destroy metres already
climbed, which is confiscation, and both the fifth pillar and the third axiom forbid it. Carry
is therefore not bounded by one swing and the display must stay legible at values a single swing
could never produce.

**Acceptance**: no path exists in which banked or carried points decrease except death.
**Verify**: a property test over many random recipes asserting monotonicity outside death.

### ⚠ Built, 2026-09-04 — the accrual is **net**, and the corpus says so twice

**The ledger is `src/state/ledger.ts` and it is composed beside the picture rather than inside
it.** `derive.ts` does not import it and nothing `derive.ts` imports does either, so deleting the
economy leaves grading, the callouts, the streak, the chain and every timing compiling and
unchanged. That is spec 08's own acceptance held as a fact about the import graph rather than as a
habit, and `test/state/seam.test.ts` walks it. It is also what makes ZEN a `null` instead of a
branch — see [M4.7](#m47--zen).

**The acceptance passes as a property over 120 runs of random pressing**, and it is stated on the
integers the player is shown: the bank never falls, and neither does `bank + round(carry)`. Carry
alone falls at every cash, because the points move. A build that priced a miss at ×0 passes every
other test in this milestone and fails this one on its first miss.

#### `carry += 1 × (1 + 0.10 × chainLinks)` has two readings and §6 settles it

Read **per tick** — every upward tick pays — a craft that simply holds an orbit is paid for the
near side of every lap. §6 says the opposite in as many words: *"orbiting: no points per lap.
**Altitude gained while orbiting is ≈ 0**, so the formula already says so; no special rule is
needed."* That sentence is only true of a **net** reading, so net is what the spec states.

So a swing carries a high-water mark of its own, set at the grab, and only ground above it pays.
The simulation makes the same distinction one layer down and paid to learn it —
[`markHighWater`](../../src/sim/run.ts) does not advance while a body is held, *"because an orbit
is a round trip, and the height gained going round its near side is not ground kept."* This is that
fact priced instead of judged.

**And the board's own worked example lands on the corpus median.** Direction 08's example is *142 m
climbed engaged*; measured over the 26 dispatches this build replays, the carry at a cash runs p25
170, **p50 224**, p75 376, p95 695, max 1 225. The example is a typical swing, which is what a
worked example should be.

#### ⚠ Where the mark resets is derived, not ruled

It resets **at each grab**, so a craft that falls back and re-climbs the same ground is paid for it
again. The alternative — one mark for the whole run — is the stricter reading of *"progress"*, and
it would pay a recovery nothing, which sits badly beside axiom 3's *"coasting is never punished"*.
§3 writes the accrual under *"while **engaged**"*, so per-engagement is what the sentence says.
**Recorded rather than decided**, exactly as §3's band aggregation is: it is one line in
[`climbOf`](../../src/state/ledger.ts) to change.

#### The trail is built, because without it the carry has no pixel

Spec [02 · §6](../spec/02-release.md) has specified it since M1 — *"a solid luminous line. Its
brightness is the carry. There are no sampled breadcrumbs"* — and nothing drew one, so axiom 5
failed for the carry outright.

What crosses from the prototype is **behaviour** (ADR-0013): sampled on the simulation tick and
never in the draw (its own recorded defect — *"on a 120Hz display it collected twice as many points
over the same world distance and the trail was half as long"*), a minimum world spacing so a craft
hanging at an apex keeps a wake with a length, and a bounded count so it is a wake and not a route.
What does not cross is the mechanism: it draws a row of round dots coloured by **speed**, and this
draws one stroke coloured by **carry**. Both halves of that are rulings — spec 02 §6 refuses
breadcrumbs, and spec 00 §3 makes brightness the game's one ordinal channel, so a trail that
brightened with speed would be a second meaning in the channel the carry is spending.

Measured on the shipped run: the wake holds 15.9 samples at the mean and spans **p50 244 design
units, p95 382, max 513** — a tenth of the picture's height at the median.

**The brightness is `carry / (carry + 214)`**, where 214 is the measured median of live carry, and
the curve is a requirement rather than a taste. ADR-0008 makes the carry unbounded by one swing and
**36.8% of cashes in the corpus carry more than one swing**, up to ten — so a curve that saturated
would show a fifth swing's debt as no brighter than a first swing's wage. This one is half way up
at the median, 0.77 at p95 and 0.85 at the largest carry in the corpus, still climbing above it. It
is the `m / (m + median)` the **tide** already reads three of its numbers from, so the game has one
shape for *more, and never all the way* rather than two.

---

## M4.2 · Tiers, streaks, chain

Tier multipliers: make ×1, TRUE ×1.25, SHARP ×1.5, PERFECT ×2. **Streak** is accuracy — per-word,
broken only downward, no timer, appearing at the second occurrence, +10% per step, capped at five
steps. A PERFECT does not break a SHARP streak; it upgrades it. **Chain** is engagement — consecutive
engaged swings, broken by coasting past one rung, adding a flat +10% per link inside the carry
accrual and gating the craft's bloom at +4px per link.

Two systems, two pixels, no overlap. **Chain is uncapped in v1**: Direction 06 carries a note about
a pinned ceiling and proposes bank sparks for over-ceiling links, but that solves a problem the
constitution deleted. Re-measure before capping — `VISION.md`'s standing warning is that a threshold
measured under tuning that has since moved is worse than an unmeasured one.

**Acceptance**: every rule above is a test; multipliers multiply and never add.
**Verify**: `pnpm test`.

### ⚠ Built, 2026-09-04 — and **one rung breaks nine links in ten**

The streak and the chain are both **presentation state** and neither is the ledger's. Spec 08 §7
keeps them alive in ZEN — *"words and `×N` remain: they are feedback, not price"* — so a ledger
that owned either counter would take the light away with the points. The ledger reads them and
never writes them.

Both are struck by the **callout** rather than beside it: a fresh word is a graded release, so the
streak, the chain's own link, the cash and the fuel all turn on one reading of one pixel
([`struckNow`](../../src/state/callout.ts)). That is axiom 5 made structural — the rule cannot
disagree with the thing that announced it, because it is the same thing.

#### The chain's break is spec 08 §4's, and the measurement says the rule is unreachable

§4 breaks the chain *"on coasting past one full rung — 25 m of altitude"*. The parenthetical is
stale: the author flew 25 m rungs on 2026-08-30 and refused them (*"too close together, it feels
chaotic at speed"*), so [`RUNG_SPACING`](../../src/state/rung.ts) is 50 m. The **subject** of the
sentence and `CONTEXT.md`'s binding entry both say *one rung*, so that is what ships, and spec 08's
acceptance moves with it: **49 m of coasting preserves the chain and 51 m breaks it**, where the
spec's own line says 24 and 26.

**Then it was measured, and one rung is not survivable in this field.** Over the 222
release-to-grab transitions in the replayable corpus the coast runs p25 86 m, **p50 128**, p75 169,
p95 268 — two and a half rungs at the median, because that is how far apart this field puts its
bodies.

| break at | links that survive it |
|---|---|
| 25 m — §4's own gloss | **4.5%** |
| **50 m — one rung, what ships** | **10.8%** |
| 100 m | 33.8% |
| 200 m | 89.2% |
| 400 m | 98.2% |

So the chain reaches **4 at most across the whole corpus**. §4's milestones at ×5, ×10 and ×15 are
unreachable, its *"uncapped in v1"* prices nothing, spec 05 §2's dust never thickens, and the
accrual's multiplier is ×1.0 or ×1.1 and nothing else.

**The prototype has no distance term at all.** Its equivalent counter is *"consecutive scoring
passages — earned links and paid flybys — unbroken by a putter-out or a death"*, and its own note
measures a chained life running at **×5 – ×7** where a fast one sat at ×2. Broken by **failure**,
never by distance. That is the behaviour ADR-0013 would carry, and it is not what §4 says.

**The number is not moved here** ([AGENTS.md](../../AGENTS.md) §5). What is added is a slider:
[`CHAIN_BREAK_RUNGS`](../../src/state/chain.ts), a **count of rungs** so that moving it composes
with the rung spacing instead of quietly disagreeing with it. It cost the bench a control and the
retro grade's slider paid — ruled on a dated flight with a measurement behind it, which is the
bench's own first reason for taking a knob away, and the surface that still asks its question is
the tuning panel on the game page.

**This is the milestone's first question for the author**, and it is a question about §4 rather
than about a number.

---

## M4.3 · The band

The boundary's ×2 and ×3 become the band multiplier on the cash step, making the score-chase
spatial: the optimal run lives in the fire band, the safe run in the field.

**Acceptance**: band is determined by where the orbit sat, and the motes that announced it were
on screen. **Verify**: `pnpm test`.

### ⚠ Built, 2026-09-04 — and the second half of that acceptance is **false, by two rulings**

The first half is built as §3 derives it: **deepest band reached between grab and release**, opened
at the grab, read off the boundary the picture drew rather than recomputed from the corridor. The
`away` that prices a swing is the same `away` the motes are laid out along, which is the strongest
form of axiom 5 available.

The second half cannot hold on this build, and neither of the two reasons is a defect:

- Spec 08's axiom 5 gives the band two pixels — *"the motes, **and the band's own `×N` label in the
  world**"* — and the author withdrew the label on 2026-09-01: *"I don't want the 2x 3x text in the
  hot zone. Let the user discover that themselves."* So the motes are the whole of it.
- The motes are gated on [`presenceOf`](../../src/state/boundary.ts), which is the author's ruling
  of the same day: *"the boundary **SHOULD** be off screen for majority of play... I don't want to
  signal danger during normal gameplay."*

Those two put the price and the pixel in different places, and the gap is **geometry rather than
tuning**. The corridor is 2 223 wide, so the ×2 band starts at 451.5 design units from the
centreline and the boundary starts coming up at 585 — **133.5 design units of the outer band are
priced with nothing on screen to announce them**, and it is only fully lit at 855, which is already
inside the fire band.

**Measured over the corpus: 27 of the 60 outer-band cashes — 45% — were priced by a boundary that
was never drawn during the swing.** The fire band's five were all announced.

`test/state/band.test.ts` asserts the gap so it cannot move quietly. **This is the milestone's
second question for the author**, and the three answers are visible: price only what was announced,
draw the boundary from where it starts paying, or accept that the ×2 band is a thing the player
learns rather than reads.

---

## M4.4 · Fuel

Spec `13-fuel` and ADR-0009. Fuel is what a save costs, and it is returned **in proportion to
release tier, never to points cashed** — points scale with metres, so paying per point would
refuel longest on the longest orbits, rewarding exactly the slow play the economy leaves unpaid.
An anomaly orbit trickles it. A survived burn refunds part of what it cost, so a well-flown dive
is nearly free and a panicked one is expensive.

Fuel lives on the craft as a halo arc that doubles as a light source — the cause and the gauge
finally sharing a pixel. It turns ION only when it can cost the run. Warnings are one hue at three
energies: E1 pulse at 0.8Hz, E2 strobe at 2Hz, E3 strobe with a word. **No yellow ladder and no
skull** — severity is ordinal so it rides the energy channel, and a skull judges where SOS states
a fact.

**Acceptance**: fuel never rises except by the stated returns; the deadline window's lit fraction
equals the affordable fraction. **Verify**: `pnpm test`.

### ⚠ Built, 2026-09-04 — the law is built and **nothing spends it**

Spec 13's whole system lands: a tank at 1.0 with no passive drain, returns in proportion to
**tier alone**, spec 13 §2's cost curve, the affordable fraction, the halo on the craft and its
three warning energies. ADR-0009's law is asserted as the property the spec asks for — sweep carry,
band, streak, chain and velocity and find **one value per tier** — and the strongest form of it is
that none of those five is in `refuelled`'s signature at all.

`affordable` came off `DeadlineView` and the **closing speed** took its place. The lit fraction is
the tank's answer and the tank is the economy's, which is composed beside the picture rather than
inside it, so the two meet in the renderer. That is what spec 03 §5's *"by luminance, never
geometry"* turns out to mean about layers, and the geometry is now provably independent of the
number.

**And then: nothing spends it.** A **save** is *"a press inside the deadline window"* and on this
build a save is an ordinary **grab**, because spec 03 §5's notice re-based the cue off spec
[07 · §5](../spec/07-boundary.md)'s burn on the author's own instruction — *"a grab needs no fuel,
so the instrument comes forward, and what M4.4 adds is the luminance and nothing else."* So `f` is
**1.0 on every tick of every run**, and three things are built and unreachable in play:

- the **LOW** and **EMPTY** warnings, which need `f ≤ 0.25` and `f = 0`;
- the luminance coupling. `REFERENCE_CLOSING` is measured — over the **2 137 ticks the deadline is
  up** in the corpus the craft closes on the wall it is leaving through at p05 230, **p50 543**, p95
  934, max 1 031 — and at a full tank the fraction only falls below 1 above **1 450** units a
  second, which the corpus never reaches;
- spec 13 §1's *"`f = 0` removes the ability to save"*, which is the only part of the system that is
  **not** built at all: refusing a press is a change to the simulation, and M4 may not move
  `SIM_VERSION`.

All three land with the burn. What is built is the law, so that when the burn arrives it charges
rather than invents.

⚠ **Spec 13 §5's *"the percentage number is the label"* is also not built.** It is a *readable*
element riding the craft, spec 00 §7 forbids anything readable below the thumb line, and the camera
holds the craft above it by measurement rather than by construction — 182 design units below centre
against a 422 budget, over one run. Where it goes wants an author who can see fuel move.

---

## M4.5 · Awards, callouts, HUD

Specs `06-awards` and `03-hud`. The word, its points and its colour arrive as one unit **at the
release point** — the exact dot the player has been staring at all orbit — pop upward over 120ms
with one overshoot, then anchor to the world and fall behind at world speed, lingering ~1.2s.
Repeats merge in place. Moving text is Archivo bold and tracked; Anton stays on the masthead.

The HUD is one layout that never changes between states; only the pressure does. Velocity is the
headline in display type, top-left. Bank is a utility chip, top-right, dimming while coasting —
a fact, not a scold. Chain rides beside velocity and on the craft's bloom. Fuel is on the craft.
Awards are in the world. **The bottom third belongs to the thumb and never holds anything
readable.**

A miss gets silence: no word, no points, no sting.

**Acceptance**: the layout is identical across all five pressure states; nothing readable enters
the thumb zone; only one E3 is ever alive. **Verify**: `pnpm test` plus screenshots of the five
states.

### ⚠ Built, 2026-09-04 — the make speaks, and the band was composed where a phone cannot see it

**Spec 06's own notice has recorded the gap since 2026-08-29**: *"a make is specified to speak, in
numbers. It is silent today because the economy is spec 08's and arrives in M4, so there is no
number to show yet"*, and *"until M4, the most common successful release in the game says
nothing."* It says a number now — the word, its `×N` and its points as one unit at the dot, the
word in the tier's colour and the number under it at one size for every tier, because the word is
the grade and the number is the wage.

The streak rides **on the callout** rather than being read live off the picture, because the word is
left behind and drifts for 1.6s: what it says is what was true when it was struck.

The HUD is Direction 03's layout at **its own artboard's scale**. That board is 330 × 715 and draws
the whole phone — its thumb line sits at `y = 477`, two thirds of 715, which lands within 0.2% of
`THUMB_LINE` once converted — so the factor is `1170 / 330` and **not** `BOARD_PIXEL`, which turns a
css pixel on the phone into a design unit and is 3. Two conversions of two different things, both
exact, stated once in `src/render/hud.ts` rather than rediscovered.

#### ⚠ The band was hung from the design space's top edge, and a phone crops that

**Found by looking at it, which is worth recording as the reason.** Spec 00 §7 fixes the width and
lets the height flex, so [`letterbox`](../../src/render/letterbox.ts) scales from the width and any
viewport shorter than the design space crops it equally at both ends — **291 design units** on the
author's own phone. Hung from zero, the velocity landed at design `y` 184 and the BANK chip at 170:
neither was on screen at all, and `CHAIN ×N` at 326 was the only line of the masthead that survived
the crop.

§7's own first guardrail is the fix and it is the sentence the rule was already written in: *"a
guaranteed band... **everything the player reads is composed inside it**."* So `GUARANTEED_BAND`
moved from `letterbox.ts` to [`design.ts`](../../src/state/design.ts) — as a bound on the *scale* it
is the renderer's, and as the rectangle a *composition* has to fit inside it is a fact about the
design space — and the band hangs from `BAND_TOP` with the board's own offsets kept exactly.

**The callout's clamp had the same bug and it was older.** It slid a word born near the top of the
picture to the design space's edge, which is inside the crop — the defect the clamp exists to
prevent, one rectangle out. Both are now asserted, in `test/render/hud.test.ts` and
`test/state/release.test.ts`.

**And the dev chrome was standing on the velocity.** Dev-only, and still the author's first
impression of the band, so the shell measures where the band lands in css and pushes the controls
below it.

#### ⚠ Spec 06 §3's *"a repeat merges in place"* is not built

§3 says a repeat arriving inside the previous word's linger *"merges in place: the counter ticks and
re-pops smaller"*; §4's Collision row says *"a new callout snaps the previous one to its decay
tail"*, and the author's ruling of 2026-08-29 is that the word is *"a marker left behind at the
point of scoring"*. Merging would tick a counter at the **previous** dot about a release that
happened somewhere else, which is the opposite of that ruling.

Measured: **32.5%** of graded releases land inside the previous word's linger and only **3.5%** are
the same tier — so the row is about 4 transitions in 114. What ships is §4's Collision row, which is
what the single callout slot already is. **Recorded rather than ruled.**

---

## M4.6 · Score from a recipe

A score must be a pure function of `(config, seed, input log)`. Rebuild the scenario suite idea:
a set of named recipes with expected outcomes, run on every commit.

**Acceptance**: replaying a recipe recomputes its exact score. **Verify**: `pnpm scenarios`.

### ⚠ Built, 2026-09-04

`pnpm scenarios` flies **seven named runs** and compares each to a recorded outcome — the ending,
the ticks, the bank, the peak, the carry, the cashes, the misses, the deferred cashes, the longest
chain and streak, the tiers, the bands and the tank. It joins `pnpm check`, and
`test/scenarios.test.ts` asserts the same claim inside the suite: the pair is exactly what `pnpm
portable` and `test/portability.test.ts` already are.

**Six of the seven are runs the author actually flew**, chosen for the sentence each demonstrates
rather than authored to demonstrate it: a hand-written log that produced a deferred carry would be a
log about this file's idea of the game, and a dispatch that produced one is evidence. The seventh is
the recipe `pnpm replay` ships, flown twice — once in DAILY and once in ZEN.

**And the half that rots is guarded too.** A set of pinned numbers passes for the wrong reason the
day a run stops demonstrating the rule it was chosen for, so twelve sentences about the constitution
are named in `COVERS` and a suite that stops showing one fails naming it. That is
[`test/moments.ts`](../../test/moments.ts)'s idea one level up, and it is what stops this becoming a
regression test over whatever the corpus happened to contain.

The list is **fixed** rather than *every dispatch on disk*, for `tools/fixture.ts`'s own reason: a
dispatch arriving from the phone must not fail the build it arrived on.

---

## M4.7 · ZEN

The subtraction proof. Delete the ledger — no points, no multipliers, no bank, no death, only
drifting back — and the tiers must still speak: the dot still flashes, the word still pops.

This is an **architectural test wearing a mode's clothes**. If ZEN requires touching the grading
code, the seam between grading a swing and pricing a swing was never real (ADR-0005).

**Acceptance**: ZEN is a configuration, not a code path through the grader. **Verify**: `pnpm test`,
plus a reviewer confirming the grader has no mode-specific branch.

### ⚠ Built, 2026-09-04 — and it needed almost nothing, which is the result

ZEN is `{ name, currency: null, deathTakesBank, fuel: false }`. A run with no currency opens no
ledger and no tank, so there is nothing to branch on and nothing to stub. The picture it produces is
**identical to DAILY's, tick for tick** — asserted over a whole flown run — and the scenario suite
flies the same recipe both ways.

The reviewer the acceptance asks for is a parser. `test/state/seam.test.ts` walks the import graph
and finds that neither `src/sim/step.ts`, nor the grader `src/sim/tier.ts`, nor `src/state/derive.ts`
can reach the ledger, the tank or the composition that opens them — and that the **only two files in
`src/` that can even name a `Mode`** are the ledger and that composition. The picture reachable from
`derive.ts` is most of the game, so *"the economy is not in it"* is a claim about most of the game.

#### ⚠ What ZEN does not have

Spec 08 §7 gives ZEN *"nothing. There is no death, only drifting back."* That is a change to the
**simulation** — the same recipe would fly a different run — so it is behind the `SIM_VERSION` wall
this milestone may not touch, and *"drifting back"* has no specified behaviour to build. ZEN dies
today exactly as DAILY does and loses nothing, because it has nothing to lose.

The subtraction M4.7 is *about* is complete: delete the ledger and the tiers still speak.

---

## Gate

**The author flies it.** The question is whether the wage feels like it matches the swing. Next:
[M5](./m5-audio.md).

### ⚠ What the gate is being handed, 2026-09-04

**Built and flyable**: the ledger, the trail, the streak, the chain, the band, the tank and its
halo, the top band, the word with its `×N` and its points, `pnpm scenarios`, and ZEN behind
`?mode=zen` on the dev server. **1 129 tests, 77 files.** The bench folds the economy, so what it
draws is the game.

**What it cost to draw**, measured on the same run before and after: arcs 34.654 → 35.654, strokes
46.819 → 48.819, path points 180.781 → 199.297, and **overdraw 1.182 → 1.183 screens** — a stroke
and an arc paint no area, which is the argument the deadline's own note already makes. `pnpm budget`
does not move: a tick is 0.0215 → 0.0214 ms and the laptop-to-phone factor is ×5.5 either way.

#### Four questions, in the order they are likely to matter

1. **The chain's break** ([M4.2](#m42--tiers-streaks-chain)). One rung is what §4 says and it breaks
   nine links in ten, so the whole chain ladder is dead in the hand. On the bench, in rungs. This is
   the one that changes how the wage *feels* over a run.
2. **The band's pixel** ([M4.3](#m43--the-band)). 45% of ×2 cashes are priced by a boundary the
   player never saw. Three answers, none of them invented here.
3. **Where the carry's mark resets** ([M4.1](#m41--carry-cash-bank)). Per engagement, which is what
   *"while engaged"* says; the alternative pays a recovery nothing.
4. **The band aggregation itself** — spec 08 §3 derives *deepest-reached* and says it is derived.
   Built as derived, unchanged.

#### And three things this milestone deliberately did not build

- **Fuel is not spent by anything** ([M4.4](#m44--fuel)), because a save is a grab and a grab is
  free. It lands with spec [07 · §5](../spec/07-boundary.md)'s burn, and one part of it — *"`f = 0`
  removes the ability to save"* — is a simulation change and therefore behind the `SIM_VERSION` wall.
- **ZEN has no *"no death, only drifting back"*** ([M4.7](#m47--zen)), for the same wall and because
  the phrase has no specified behaviour.
- **Spec 06 §3's merge-in-place** ([M4.5](#m45--awards-callouts-hud)), which contradicts the author's
  own ruling about where a word lives and would apply to 4 transitions in 114.

#### One thing that is not M4's and is worth the author's eye anyway

The masthead now sits at the top of the **guaranteed band**, which is 291 design units below the top
of the design space on the author's phone. That is spec 00 §7's rule applied — but it is the first
element in the game composed against the band rather than against the design space, and how much
room it leaves above itself is a taste question a flight can answer in a second.
