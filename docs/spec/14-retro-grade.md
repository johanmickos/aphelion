# 14 · The retro grade

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md).

**Scope**: deliberately short. Most of it is a post-processing pass with a handful of knobs to tune
on a phone, plus a small number of **authoring rules the other specs inherit**. It is not a
workstream.

**Depends on**: [00 · Tokens](./00-tokens.md). Constrained by [M0.5](../plan/m0-foundations.md), the
renderer spike — the grade is a full-screen pass and is part of what that spike measures.

> ## ⚠ Built and ruled, 2026-09-02 — the pass is two composites and it ships at **0.45**
>
> [M3.5](../plan/m3-the-field.md). `src/render/grade.ts` is §4's *"one place"*, and what reached
> the bench is **one master** with the stages ganged behind it: 0 is off and 1 is every stage at
> the ceiling §2 states for it. It shipped at 0 for a day — M3.5's instruction is *"build it as a
> **knob**, not a look"* — and the author then flew it: *"it looks real nice. In the bench I'm
> running it at 0.45 which seems like a nice balance."*
>
> **0.45 is below the scanline threshold**, so two things about §2 follow from the ruled value: the
> pass costs **one** full-screen composite rather than two, and stage 5's *"off by default until
> the phone says otherwise"* is now literally satisfied — the phone has said, and it said no. The
> same knob is on the game page behind a dev-only panel, because a coat is judged over a
> playthrough and the bench is not one, and **a dispatch now carries the coat it was flown under**.
>
> ⚠ **Measured on the phone at grade 1** — `diagnostics/2026-09-03T02-35-03-175Z`, 1 882 frames,
> the top of the travel with the comb on — a frame with one tick costs **1.18 ms** against the
> pre-grade baseline's **1.15 ms** on the same device, and the worst frame is **7 ms against 10**.
> The pass at its ceiling does not show above the difference between two runs. That is ADR-0011's
> *"the post-processing is free"* reproduced on the shipped renderer.
>
> **The five stages cost two full-screen fills, not five.** Lift, dither and grain are all
> *additions* to every pixel and a sum of additions is one addition, so they share one `lighter`
> composite; the scanlines take light away and cannot share it. Measured on `pnpm profile`'s
> census over the run the author cleared, `blended` goes **3.621 → 4.621 → 5.621** screens at the
> mean for grade 0 → 0.5 → 1, exactly +1 and +2 everywhere in the distribution, and **overdraw
> does not move at all** — a full-screen fill paints no arcs.
>
> **A read-back was refused before it was tried, on a measurement.** `getImageData` /
> `putImageData` on the frame is the one mechanism on the Canvas2D list that could cost the whole
> frame. A per-pixel walk of 1170 × 2532 costs **4.09 ms on the laptop** before either copy — a
> quarter of a frame, on the machine `pnpm budget` calls the fast one, against a whole tick's p99
> of 0.11 ms there — and [ADR-0011](../adr/0011-canvas2d-carries-the-design.md) already measured
> the same ~11.8 MB of synchronous main-thread traffic on the author's own phone at **17 – 18 ms
> against 3**. The grade's own per-pixel work is cutting sixteen 64-pixel tiles at **0.089 ms**,
> **46× cheaper** and done when a knob moves rather than per frame. Nothing in the pass reads a
> pixel.
>
> ### ⚠ §2 stage 2 and §3.5 cannot both hold in Canvas2D, and the ruling is the author's
>
> §3.5 reserves true black and says *"the grade's black lift must not raise them"*; the
> acceptance says those gaps *"sample to `#000000` after the grade."* **The anomaly's bed is drawn
> in `TRUE_BLACK` today** (`src/render/anomaly.ts`), so this is live rather than hypothetical —
> and a full-screen composite has no way to exclude a colour. Every additive stage hits it, not
> only the lift: at grade 1 the gaps sample to **`rgb(14, 12, 24)`**, which is the lift (10, 8, 20)
> plus the grain's mean (3.83) and the dither's (0.47) — 9.4% of full scale in its loudest
> channel — and at the **shipped 0.45** they sample to `rgb(6, 6, 11)`. Only at grade 0 do they
> sample to `#000000`.
>
> ⚠ **So this criterion is now failed by a shipped value rather than by a hypothetical one**
> (2026-09-02). The author ruled the *look*; the conflict is untouched by that ruling and is still
> the one thing in this spec that cannot be satisfied as written.
>
> **But what is lost is the absolute floor and not the contrast**, and the first version of this
> notice did not say so. The lift is **additive**, so it preserves differences exactly:
>
> | | the sky | a cloud gap | the gap between them |
> |---|---|---|---|
> | grade 0 | `10, 8, 20` | `0, 0, 0` | **`10, 8, 20`** |
> | grade 0.45 | `16, 14, 31` | `6, 6, 11` | **`10, 8, 20`** |
>
> The gaps are still exactly as much darker than the sky as they ever were — the difference *is*
> VOID, before and after. What §3.5 buys that this loses is **absolute** black, and on the OLED
> phone the gate happens on that is a physical difference rather than a colorimetric one: at
> `#000000` the pixel is off and the gap reads as a hole in the screen, and at `rgb(6, 6, 11)` it
> is faintly lit. Whether that reads as a loss in a dark room is a judgement nobody has made, and
> it is cheaper to make than any of the four candidates above: fly the anomaly at grade 0 and at
> 0.45 and look.
>
> Four candidates, none of them picked:
>
> | | what it costs | what it keeps |
> |---|---|---|
> | **a** · the grade is applied to the nine authored colours at **authoring time**, not at draw time — ADR-0011's own open note | nothing per frame; cannot express dither, grain or scanlines, which are spatial; and the tokens must become derived rather than `const`, which is what makes it dialable | §3.5 exactly, and gamma and per-channel gain as well, which the pass cannot do at all |
> | **b** · mask the pass off the bed with a second buffer | a second buffer and a second composite over the layer that is already the most expensive in the game | §3.5 exactly, and the pass |
> | **c** · overrule §3.5 — the gaps lift with everything else | nothing | the pass, and the reading that a coat coats everything |
> | **d** · leave the master low enough that it does not read | nothing | both, by not testing either |
>
> **(a) is what ADR-0011 predicted and it answers more than this** — it is the only one that gets
> gamma and per-channel gain, which §2 stage 2 asks for and Canvas2D cannot express. It is
> recorded there as needing the author and it still does.
>
> ### ⚠ The plan says *slight chromatic aberration* and §2 forbids it — the spec wins
>
> `docs/plan/m3-the-field.md`'s M3.5 summary lists *"scanlines, grain, bloom, slight chromatic
> aberration"*. §2's last paragraph forbids it by name, along with the vignette, barrel distortion
> and CRT curvature. **The spec is canonical for behaviour** ([ADR-0002](../adr/0002-specs-are-canonical-for-behaviour.md)),
> so none of the four is built and the plan's line is marked superseded in place rather than
> quietly followed. The vignette's reason is the load-bearing one and it is worth restating: the
> boundary is a place in world space, and a screen-edge darkening would read as a boundary that is
> not there.
>
> ### ⚠ §3.4 forbids texture and §2 stage 5 requires a pattern — the reading taken
>
> *"No texture except the checker"* (§3.4) and *"scanlines … at a 2-design-px pitch"* (§2 stage 5)
> cannot both be read literally: there is no way to draw a comb across a phone-sized frame in
> Canvas2D except as a pattern fill, and one `fillRect` per row is 1 266 calls a frame. **§3.4 is
> read as binding the world** — it sits under *"authoring rules the other specs inherit"* and its
> examples are fills that give a shape a material — and the pass as being what §2 says it is.
> Recorded rather than assumed; if the author reads §3.4 as binding the pass too, the scanline
> stage comes out and the master loses its top two fifths.
>
> ### ⚠ §3.1's two floors, and the one stroke that falls between them
>
> The acceptance's lint exists now — `test/render/strokes.test.ts`, which enumerates every place
> the render layer sets a width by parsing and then observes what each one actually asked the
> canvas for, over a real run. **Nothing in the game is below the 1 px structure floor.** Exactly
> one stroke sits between that and §3.1's 1.5 px readable floor, and §3.1 does not say which of
> the two a **track** is:
>
> | | design px | |
> |---|---|---|
> | the deadline's hairline, `TRACK_WIDTH × HAIR` | **1.32** | the far end of the track, thinned *"so the track never vanishes"* |
> | its lead-in and dot | 6.3 | what the player is actually deciding against |
> | every other stroke in the game | 3 – 18 | above both floors |
>
> **Read as a line**, 1.5 binds and `HAIR` goes 0.55 → 0.63, widening the far end by 14%. **Read
> as structure**, 1 binds and nothing moves. The test asserts the list rather than picking, so the
> day it is ruled the number moves on purpose — and a *new* stroke arriving in that band fails and
> gets the same question asked of it.

---

## 1 · Where the retro register actually comes from

Not from the grade. It is earned **structurally**, before any post-processing runs:

- The world is orbital; the scoreboard is a machine. The one rectangle in a game of circles and
  arcs is the glass card (spec [09](./09-debrief.md)).
- Arcade cabinets **cut**; they do not fade. Attack ≤ 2 frames (spec [00](./00-tokens.md) §5).
- Arcade scoreboards **count**; numbers slam in whole.
- The insert-coin blink at 1Hz on a `steps()` cadence.
- Tracked caps in a grotesk, and one poster face for the shouted facts.

The grade's job is to sit on top of that and cost nothing it does not earn. **If the grade is
carrying the register, the register is not there.**

## 2 · The pass

One full-screen post-process, applied after everything else, in this order:

| # | Stage | Knob | Opening value |
|---|---|---|---|
| 1 | **Bloom** | radius, threshold, intensity | Per the energy steps in spec [00](./00-tokens.md). Bloom is a first-class channel, not a grade effect — it is listed here only because it shares the pass |
| 2 | **Grade** | lift / gamma / gain, per channel | Lift the blacks toward VOID's violet rather than to neutral grey; leave CORE at 1.0 so the craft stays the brightest value |
| 3 | **Dither** | strength | Ordered 4×4 Bayer, ~1/255 amplitude, applied to the whole frame |
| 4 | **Grain** | strength, animated | ≤ 3% luminance, resampled per frame. It must not read as noise on a still |
| 5 | **Scanlines** | strength, pitch | ≤ 6% at a 2-design-px pitch. Off by default until the phone says otherwise |

Every stage is switchable to zero independently, and the game must be fully legible with the whole
pass off. The grade is a coat; nothing may depend on it to be readable.

> **⚠ Built 2026-09-02, and two rows are not.** Stage 1 is the energy channel and was built in
> M2.1; it is painted per lamp and is not in this pass. Stage 2's **gamma and per-channel gain are
> not built at all** — `multiply` cannot scale a channel above 1 and Canvas2D has no expression
> for a per-channel curve, which is
> [ADR-0011](../adr/0011-canvas2d-carries-the-design.md)'s recorded cost rather than an omission
> here. Its **lift** is exact and is built. Stages 3, 4 and 5 are built as written, with the
> tiles cut in device pixels: a Bayer cell resampled by a non-integer scale is no longer an
> ordered pattern, and 2 design px lands on 2.02 device px on the author's phone, where a comb at
> a fractional pitch is a moiré.

**No chromatic aberration, no vignette, no barrel distortion, no CRT curvature.** A vignette in
particular is forbidden: the boundary is a place in world space, and a screen-edge darkening would
read as a boundary that is not there (spec [07](./07-boundary.md)).

## 3 · Authoring rules the other specs inherit

These are not knobs. They bind every renderer path in the game.

1. **Minimum stroke weight is 1.5 design px** for anything the player is expected to read as a
   line, and **1 px** for structure (rungs, rings at rest). Nothing sub-pixel: at 1170×2532 scaled
   to a real phone, a 0.5px stroke dithers into a grey suggestion and the field stops being a
   ladder.
2. **Dither in preference to smooth gradients.** Any fill that ramps over more than ~100 design px
   is dithered, not interpolated. This covers the boundary gradient, the carpet gradient, the sky's
   altitude ramp and the anomaly's clouds. A smooth 8-bit ramp over a large area bands; a dithered
   one does not, and the dither is the register.
3. **Display type only from the arcade face.** Anton, and only for shouted facts: velocity, mode
   titles, headline numbers on cards. Everything that moves or reports is Archivo (spec
   [00](./00-tokens.md) §4). No third face enters the game.
4. **No texture except the checker.** The checkered line at the finish is the game's only pattern
   fill (spec [12](./12-finish.md)). Everything else is line and glow.
5. **True black is reserved** for anomaly cloud gaps and black-hole discs. The grade's black lift
   must not raise them.

## 4 · Tuning

The grade is judged on the author's phone, reached by the QR dev server
([M0.4](../plan/m0-foundations.md)), and nowhere else. Every knob above is exposed in one place so
that a tuning session is a single file's worth of numbers.

## Acceptance

- Turning the entire post-process off leaves every element in the game legible and every colour
  recognisably its palette token.
- A 600-design-px boundary gradient rendered on the target device shows no visible banding.
- No stroke in any render path is narrower than 1 px in design coordinates; a lint over the render
  layer finds none.
- The grade's cost is measured as part of [M0.5](../plan/m0-foundations.md)'s p99 and max frame
  time, not its mean.
- Anomaly cloud gaps and black-hole discs sample to `#000000` after the grade.
- Exactly two font families are loaded by the build.
