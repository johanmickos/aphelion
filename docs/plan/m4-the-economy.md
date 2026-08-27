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

---

## M4.3 · The band

The boundary's ×2 and ×3 become the band multiplier on the cash step, making the score-chase
spatial: the optimal run lives in the fire band, the safe run in the field.

**Acceptance**: band is determined by where the orbit sat, and the motes that announced it were
on screen. **Verify**: `pnpm test`.

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

---

## M4.6 · Score from a recipe

A score must be a pure function of `(config, seed, input log)`. Rebuild the scenario suite idea:
a set of named recipes with expected outcomes, run on every commit.

**Acceptance**: replaying a recipe recomputes its exact score. **Verify**: `pnpm scenarios`.

---

## M4.7 · ZEN

The subtraction proof. Delete the ledger — no points, no multipliers, no bank, no death, only
drifting back — and the tiers must still speak: the dot still flashes, the word still pops.

This is an **architectural test wearing a mode's clothes**. If ZEN requires touching the grading
code, the seam between grading a swing and pricing a swing was never real (ADR-0005).

**Acceptance**: ZEN is a configuration, not a code path through the grader. **Verify**: `pnpm test`,
plus a reviewer confirming the grader has no mode-specific branch.

---

## Gate

**The author flies it.** The question is whether the wage feels like it matches the swing. Next:
[M5](./m5-audio.md).
