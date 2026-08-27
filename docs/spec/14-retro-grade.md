# 14 · The retro grade

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md).

**Scope**: deliberately short. Most of it is a post-processing pass with a handful of knobs to tune
on a phone, plus a small number of **authoring rules the other specs inherit**. It is not a
workstream.

**Depends on**: [00 · Tokens](./00-tokens.md). Constrained by [M0.5](../plan/m0-foundations.md), the
renderer spike — the grade is a full-screen pass and is part of what that spike measures.

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
