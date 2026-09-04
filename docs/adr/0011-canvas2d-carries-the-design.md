# Canvas2D carries the design; the WebGL post pass costs five times what it buys

`VISION.md` records a rendering-induced slowdown that reached a phone with nothing in the
repo able to catch it, and the design makes glow a first-class channel — four energy steps
on the craft, the trail, every compass window, every body rim and tide, the boundary bands
and the dust — over a full-screen lattice of rungs that deform toward every mass and part
around the craft every frame, under a retro grade. [M0.5](../plan/m0-foundations.md#m05--the-renderer-spike)
asked whether Canvas2D can carry that, and set a ladder to climb until something held.

**It holds on the first rung.** The renderer is **Canvas2D, with bloom hand-rolled as an
offscreen blur chain composited with `lighter`**. Rungs (c) a hand-rolled WebGL2 renderer
and (d) PixiJS were never built, because the plan says stop at the first rung that holds
and this one does. PixiJS does not become a dependency, and the repo still has none at
runtime.

## What was measured

The scene the plan specifies: ~120 rungs at 85 samples each — **10,200 points per frame**,
every one asking all three bodies and the craft where they are, with nothing culled and
nothing cached between frames — three bodies with rim, tide, strata and core, 40 glowing
elements at 1 × E3, 12 × E2 and 27 × E1, 140 dust motes, a dithered boundary ramp, and the
whole of spec [14](../spec/14-retro-grade.md) §2: bloom, grade, dither, grain and
scanlines. Scanlines are off by default in that spec and were measured **on**, so every
number here is a ceiling rather than a typical frame.

Nothing returned early, deliberately. A real renderer would skip a body too far from a rung
point to bend it, and the bug `VISION.md` remembers is exactly the kind that hides behind an
average of calls that mostly return.

An iPhone on iOS 18.7, 60 Hz, dpr 3, at the full design size of **1170 × 2532** (spec
[00](../spec/00-tokens.md) §7). 600 frames per candidate after 90 discarded for shader
compilation, texture allocation and JIT. Two runs, forward and reversed, so an order effect
would show; it did not, and drift within each run was flat. **p99 and max, never mean** —
no mean was computed anywhere, so none can be quoted. iOS clamps `performance.now()` to
1 ms, so each figure is the floor of its own millisecond.

| Candidate | cpu p99 | cpu max | interval p50 | sustained |
|---|---|---|---|---|
| the scene alone, no post | 3 ms | 4 ms | 17 ms | 60 fps |
| **(a) Canvas2D · hand-rolled bloom** | **3 ms** | **5 ms** | **17 ms** | **60 fps** |
| (b) Canvas2D → one WebGL post pass | 17–18 ms | 18 ms | 22–23 ms | ~44 fps |

The budget was p99 ≤ 8 ms. **(a) uses three of it, and the post-processing is free**: it
costs the same as the bare scene to within the phone's timer resolution.

## Why (b) lost, and what nearly hid it

(b) uploads the finished Canvas2D scene to the GPU as a texture every frame. At the design
size that is ~11.8 MB per frame, and `texSubImage2D` from a canvas is synchronous on the
main thread, so unlike (a)'s blits the cost is fully visible in the timing. It is the whole
difference: same scene, same picture, five times the cost.

Two details are worth keeping, because both nearly produced a wrong reading.

**The first reports were taken on 59.5% of the pixels.** The phone's viewport came back
393 × 651 — browser chrome eating the height — and the harness sized its buffer to the
letterbox fit rather than to the design space. At that size (b) measured 11–12 ms and (a)
measured 3–4 ms. Re-measured at the design size, (b) rose to 17–18 ms and **(a) did not
move**. That is itself a finding: (a) is bound by the CPU-side scene, which is drawn in
design coordinates and does not scale with resolution, while (b) is bound by an upload that
scales with pixel area. (a) therefore has headroom on a denser display that (b) never had.

**A candidate that is uniformly slow drops no frames.** The harness flags dropped frames
against the run's *own* median interval, which catches jitter and is blind to sustained
slowness: (b) reported **zero** dropped frames while running at 22–23 ms per frame. What
caught it was the interval p50 — 17 ms for everything that made 60 fps, 22–23 ms for (b).
Anyone rebuilding this measurement should read the interval median, not the drop count.

## The cost accepted

Canvas2D cannot express the grade that spec [14](../spec/14-retro-grade.md) §2 stage 2 asks
for. `multiply` cannot scale a channel above 1, so per-channel **gain** is applied
normalised — the ratios between channels survive, the overall level does not — and
per-channel **gamma** has no expression at all. Lift is exact. There is also no bright-pass
threshold before the blur, though that costs almost nothing here: the layer being blurred
contains only lamps.

(b) does the grade correctly and in one pass. It was rejected on cost, not on fidelity, and
that trade is deliberate — the grade is a coat, and spec 14 §2 requires the game to be fully
legible with the whole pass off. But it is a gap between a decision and a spec, and it is
recorded rather than papered over.

> **⚠ And a third thing it cannot do, found when the pass was built (M3.5, 2026-09-02).** A
> full-screen composite has **no way to exclude a colour**, and spec 14 §3.5 requires exactly
> that: *"the grade's black lift must not raise"* the anomaly's cloud gaps and the black-hole
> discs. The anomaly's bed is drawn in `TRUE_BLACK` today, so this is live rather than
> hypothetical, and it is not only the lift — every additive stage hits it. Measured, the gaps
> sample to `rgb(14, 12, 24)` at the top of the master's travel and to `#000000` at the bottom,
> which is where the grade ships. (b) has no such problem: a shader can mask.
>
> **This sharpens the open note below rather than adding a second one.** Applying the curve to
> the nine authored colours at authoring time is the only candidate that keeps §3.5 *and* buys
> gamma and per-channel gain, and the cost of the alternative is now a measured number rather
> than a guess. It still needs the author.

> **Open — how gamma reaches the frame.** Not ruled here. The likely answer is that the
> grade's static per-channel curve is applied to the nine colours the game actually draws
> from — the eight palette tokens and the body fill — at authoring time rather than at draw
> time, which is exact everywhere except where bloom has already composited. That would cost
> nothing per frame and would keep spec 00 §1's rule that every colour resolves to a palette
> token. It needs the author, and it is not urgent: it is a knob to tune on a phone
> (spec 14 §4), and the phone now exists.

## Consequence

`src/render/` is a Canvas2D renderer, and the three-layer boundary of
[ADR-0006](./0006-three-layers-sim-presentation-renderer.md) is unchanged by that — the
renderer still owns nothing but pixels and the interpolation between ticks. The bloom chain
and the grade are the shape [M3](../plan/m3-the-field.md) inherits.

**M3.5 built it, and the shape held.** `src/render/grade.ts` is spec 14 §2's five stages in
**two** `fillRect`s — one `lighter` carrying the lift, the dither and the grain, and one
`source-over` carrying the scanlines — because a sum of additions is one addition. A read-back
was refused on this decision's own arithmetic: a per-pixel walk of 1170 × 2532 is the same
~11.8 MB of synchronous main-thread traffic that cost (b) five times what it bought, and it
costs 4.09 ms on the laptop before either copy.

The measurement is not repeatable from the repo: the harness was throwaway by construction
and is deleted along with this decision landing, which is
[ADR-0001](./0001-separate-repository-from-the-prototype.md)'s lesson applied to our own
work — everything worth keeping had to be written down here, because the code that produced
it is going away. What survives is the six reports in `diagnostics/` and the dev-only
endpoint that received them, so the next measurement has a way home without being rebuilt
from nothing.

One thing is measured and one is not. Sixty frames a second is measured, with 5 ms of the
8 ms budget unspent and no dropped frames in either direction. How much GPU headroom sits
behind that is **not** measured: (a)'s blits are issued asynchronously and main-thread
timing cannot see them, and the only evidence they keep up is that a 60 Hz display was
never missed. On a 120 Hz target that evidence does not transfer, and the question reopens.

> **⚠ It reopened on 2026-09-04, and is answered in
> [ADR-0016](./0016-the-ceiling-is-the-rasteriser-not-the-language.md).** A 117 Hz desktop
> holds 118 fps with 1.32% of frames missing a vsync, and our own code spends 0.41 ms of an
> 8.47 ms budget — about 5%. The paragraph above is right that main-thread timing cannot see
> the blits; what it can see is that the misses are not ours, and that the largest recovery
> available came from drawing **less world** rather than from drawing it faster. Nothing in
> this decision is overturned: (b) is still rejected on its upload cost, and ADR-0016 notes
> that a glow drawn *as a shader* never makes that upload, which is a different candidate
> from the one measured here.
