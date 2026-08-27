# M2 · The instrument

The compass is the signature element — the thing a screenshot is recognised by — and
`VISION.md` calls its ancestor the best piece of UI in the game: diegetic, positioned exactly
where the eye already is, teaching the timing window without a word of text. It is the bar
everything else is measured against.

This milestone comes before the field, which means spending it flying a beautiful compass
over an ugly world. That is the right order: the gate is feel, and the compass is where the
feel is read.

---

## M2.1 · The presentation-state layer

Build the middle layer of ADR-0006 for real: a pure function from simulation state to
everything the renderer needs and the simulation does not own — energies, bloom radii,
craft deformation, camera offset, live awards, decay timers.

The four emission tiers are the ordinal channel for the whole game: E0 structure with no
bloom, E1 lit, E2 hot with a white core, E3 flash, additive, decaying, **one alive at a
time**. Nothing ever changes hue to mean better.

**Acceptance**: presentation state is derived per tick, is pure, passes the portability
check, and a frame is a function of `(recipe, tick)`. **Verify**: `pnpm portable`, plus a
test asserting derived values at named ticks with no canvas involved.

---

## M2.2 · Body language

Spec `04-bodies`. Flat vector anatomy that emits: rim in the identity hue, concentric strata,
a core that is the type slot, a body fill that is never brighter than the craft. No gradients,
no terminator — the world is side-on and implies no depth.

The **tide** does most of the work: a brighter limb segment that faces the craft at all times,
scaling with mass, racing around the rim under the craft during an orbit. Gravity drawn on the
thing that owns it. Four states: ahead, in reach, held, spent.

Identity hues are generated, not listed: `oklch(0.72 0.13 H)`, H stepped ≥50° between
neighbours, excluding the violet–pink band and the quality bands.

**Acceptance**: the four states are visually distinct and assertable in presentation state;
the tide tracks with lag; hue generation obeys the exclusion rule. **Verify**: `pnpm test`
plus eyes.

---

## M2.3 · The compass

Spec `00-tokens` and `06-awards`. Coloured windows on the orbit path, in the body's own hue
so target and window never need a legend. The hand, the dot, the crossing dots. Windows heat
in place as aim closes.

The grading zones live here: the make, then TRUE at the inner 60%, SHARP at the inner 30%,
PERFECT within ±8% of centre and never under 1.5°. **Zones scale with the window**, so a
PERFECT on a needle-thin arc is a different feat than on a barn door and the arc's width
already said so.

**Acceptance**: grading is computed in the simulation, is deterministic, and a recipe replays
to identical tiers. **Verify**: `pnpm test`.

---

## M2.4 · The release — 400ms

Spec `02-release`. The most choreographed moment in the game, and the numbers are pinned:
E3 flash at the release point; the craft leaving along its nose, stretched 1.5/0.7 along the
velocity vector, recovering in 180ms with one overshoot; the orbit detaching as the farewell
ring in AURORA; a camera kick of 6px along the exit tangent, home in 180ms.

**Rebase spec 02 first, and it is a real edit rather than a find-and-replace.**
[ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) withdrew the
70ms hitstop the file's whole timeline was dated from — flown, it read as buffering rather
than as punch. Spec 02 carries a notice saying exactly which lines move; this step is where
they move. What arrives in its place is **the release kick**, scaled by the quality of the
swing, which spec [01 · §7](../spec/01-swing.md) already defines for a swing that reached a
frozen orbit and [ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md)
defines for one that did not. It is a **simulation** output, so this step presents it rather
than inventing it — and it can be presented loudly, because it carries none of itself into
permanent velocity and so cannot move what a run is worth.

**Never a shake.** A shake says damage; a directional kick says departure, and this game has
no damage — only commitment. The same kick at 3px marks the grab, reversed into the orbit,
so even the camera distinguishes catching from letting go.

Motion law, applied everywhere from here on: attack ≤ 2 frames, decay ≥ 10× attack, enter at
120ms with overshoot from 92% scale, decay 420ms exponential, nothing persists past 600ms
except the trail. All streaks parallel to velocity — **nothing ever radiates from a point.**

**Acceptance**: every timing above is assertable at a named tick. **Verify**: `pnpm test`
plus the author's eyes.

---

## M2.5 · Presentation goldens

Assert derived presentation values at named ticks across a recorded recipe — the camera offset
at the tick after release, the craft's bloom radius at chain 7, which award is alive when. No
canvas, no PNG diffing.

**Acceptance**: a regression in any choreography above fails a test. **Verify**: `pnpm test`.

---

## Gate

**The author flies it. The question is whether the release lands.** Next:
[M3](./m3-the-field.md).
