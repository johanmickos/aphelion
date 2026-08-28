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

### Done, 2026-08-28

**What this step actually is, is the decay machinery.** The list above reads as six unrelated
things and it is not: the camera kick homes over 180ms with one overshoot, the craft's stretch
recovers over 180ms with one overshoot, an E3 decays over 400ms, the rungs' wake relaxes over
~400ms, a callout pops and lingers and decays.
[ADR-0015](../adr/0015-presentation-state-carries-what-decays.md) exists because those are one
idea in five costumes, and [`decay.ts`](../../src/state/decay.ts) is that idea written once —
which is why M2.2 through M2.5 each cost a line rather than a mechanism.

A decay **ends rather than becoming small**, and that is the whole reason it is a counter and
not a multiplied float. Spec 00 §5's *"nothing persists past 600ms except the trail"* is a
sentence a `null` can satisfy; a value shrinking by a factor each tick never reaches zero, so
something has to decide what counts as gone, and the threshold that decides it is a number
nobody can point at.

**Two curves, and both had to be argued rather than picked.**

| | Shape | Where it came from |
|---|---|---|
| The fall to nothing | the square of what is left | Spec 00 §5 says *"420ms exponential"* and spec 00 §3 *"400ms decay"*, and the two cannot both be literal — an exponential never reaches zero. What is kept is the behaviour (fastest at the start, slowing to nothing) and the shape that does it while ending. **An opening position**, and on the bench |
| The return home | `(1 − x)²(1 − x / 0.37)` | **Read backwards from spec 02 §4.** The one overshoot the design puts a number on is the craft's stretch returning through 1.0 to **0.95** against a 1.5 displacement — a tenth. The rebound of this curve is `4(1 − c)³ / 27c` in closed form, and a tenth falls at `c = 0.37` to three figures |

**The energy radii are a reading, and it is stated because the alternative is not close.** Spec
00 §3's *6px / 18px / 48px* are the board's, and Direction 01's artboard frames the game at
430 × 760 — phone size. The design space is a phone at three device pixels to the point
(ADR-0010), so they are **18 / 54 / 144 design units**, which is the same ×3 the author
confirmed for spec 01's lengths on 2026-08-27 arriving from the other direction. Taken as raw
design units instead, E2's 18 would be a glow narrower than the 45-unit craft it is the halo
of.

**One E3 alive at a time is a shape, not a check.** It is a single nullable field on the whole
presentation, so a second one has nowhere to be and the rule cannot be forgotten by the step
that adds the fourth thing wanting to flash. The release, the grab, the award and the checkered
line are built in four different milestones; a per-thing energy would have let the last of them
stack on the first with nothing failing.

**`SIM_VERSION` did not move, and the way it did not move is the point.** A grab is *a body
being held that was not*, read off the previous **picture** rather than off a flag the
simulation raises. Nothing was added to `src/sim/` for the picture's benefit, which is the
failure mode the whole layer exists to avoid.

**Three things in this step's own list were deliberately not built**, each with a home:

- **The camera kick** (spec 02 §5) travels *along the exit tangent*, so it has a horizontal
  component — and [`camera.ts`](../../src/state/camera.ts) does not move sideways until
  [M3.1](./m3-the-field.md), with `test/state/camera.test.ts` asserting `camera.x` never
  moves whatever the craft does. It belongs in **M2.4**, where spec 02 is rewritten, rather
  than half-built here and rebased there.
- **Live awards** need a window to be graded inside. **M2.3**.
- **The chain** needs rungs to be broken by (spec 05, M3) and an economy to spend it (spec 08,
  M4). The term it multiplies is built and only its value is missing, so it is a named zero
  rather than an absence.

**The craft's stretch is dated from `T0`**, and that is not a decision this step made: spec
02's own ADR-0012 notice already says *"every `T+70ms` in §2 and §3 becomes `T0`"* and *"every
duration measured from the start of its own element is untouched"*. Two costs, both stated:
the across axis rebounds to **1.03** where the board draws 1.06, and the rebound is deepest at
**58%** of the return where the board puts it at 83%. Four hand-set keyframes are not a curve;
the depth is the half worth matching, and both are knobs.

**The bench grew a third card.** Physics restarts the run, the picture and **light** land live
— which is ADR-0006's layer boundary as something the author can feel with a mouse. Eight
knobs: the three bloom radii, the E3's length, the stretch, the squash, the recovery and the
overshoot.

**431 tests, 39 files.** The acceptance is asserted at named ticks of the run `pnpm replay`
ships, in a file that imports nothing from `src/render/`: the grab lands on **74** and the
release on **258**, the E3 is at full radius on the tick it is struck and gone on **282**, and
the stretch is home on **269**. `CONTEXT.md` gained **bloom**, **flash**, **decay** and
**deformation** — the third with an explicit line saying it is never the **settle**, which the
glossary already listed *decay* as a word to avoid for.

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

**And the fifth state is off the picture entirely: the sighting.** Spec
[03 · §6](../spec/03-hud.md) — a body the picture cannot show, marked on the edge of it in that
body's own hue, ahead of the climb only, never for a body already on screen. It belongs here rather
than with the compass because it is the same hue machinery answering the same question one state
further out, and because it is **always on**: the compass needs an orbit, and a sighting is the
whole of what a coasting craft has to read. Direction 03's dot in identity hue is the whole of what
is built; the prototype's distance labels and its ring on the offered body are recorded in §6 with
their evidence and are not.

**It is the other half of spec [00 · §7](../spec/00-tokens.md)'s ruling and not a decoration on
it** — *"markers to objects off-screen is the way we deal with the information loss of fixing the
width"* (author, 2026-08-28). With the width fixed and the height flexing, the body a craft next
grabs is off the picture at the moment of release **32%** of the time on a phone in a browser,
against 12% today, and a sighting is what that 32% reads instead. **So this lands before
[M3.1](./m3-the-field.md) changes the fit**, which the milestone order already gives — it is
written down because an ordering nobody wrote down is an ordering that gets swapped.

**Acceptance**: the four states are visually distinct and assertable in presentation state;
the tide tracks with lag; hue generation obeys the exclusion rule; a body on screen has no sighting
and one behind the climb has none. **Verify**: `pnpm test` plus eyes.

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

**The kick is this step's rather than M2.1's, and there is a reason to know before starting
it.** It travels along the exit tangent, so it has a **horizontal** component — and
[`camera.ts`](../../src/state/camera.ts) does not move sideways at all until
[M3.1](./m3-the-field.md), on a decision M1.6 made and M1.4 confirmed, with
`test/state/camera.test.ts` asserting `camera.x` is the centreline on every tick of every
swing it flies. That test is right and the kick is right; what has to happen is that the kick
is a *displacement from* the camera's own position rather than a second opinion about where
the camera is, and the assertion becomes one about the camera's subject. M2.1 built the
machinery it needs — a displacement that homes past rest once — and stopped there rather than
half-landing it. **This is where the two meet.**

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
