# Performance — where the time goes

**The report, 2026-08-29 (author):** *"I've noticed some lag during some swings, and I want to
nip this in the bud before we add too much more."* Intermittent, during play, on a phone.

This file is what came back. It is written for a session that has not read the one that produced
it, and it is deliberately as careful about the answer **no** as it would be about a fix.

---

> **Answered by the phone, 2026-08-29.** §8, §9 and §10 are three runs off the author's own phone — the one where
> the lag was actually felt. Everything before §8 is the laptop work that predicted them, kept as
> written so the predictions can be checked against the results rather than quietly edited to match.

## The result, in one paragraph

**Nothing in this build's per-tick or per-frame work varies enough to produce an intermittent
hitch, and both are far under budget.** A tick costs a p99 of **0.040ms** on a laptop and does not
grow over a run. A frame asks the canvas for **1.53 screens of paint**, and — this is the load
bearing measurement — that number's whole range across 2 775 frames is **1.867 to 1.902**, a
spread of **2%**. A workload with 2% variance is not the source of an occasional 40ms frame. So
either the variance is not ours, or *"lag"* is naming something that is not slowness. **Both
possibilities are now measurable on the device, and the instrument that measures them is built
and tested.** What this file cannot do is fly the phone; that is the author's, and §7 says exactly
what a single run will settle.

Every number below was measured on **darwin / node 26.7.0**, over the shipped pilot recipe
(`test/recipes/pilot-60s.json`, fixture field v1, 24 bodies, 2 775 ticks / 46.3s, ending
`FELL_BEHIND`), best of three flights per tick, with `pnpm profile`. **It is a laptop.** Ratios
and slopes travel between machines; milliseconds do not, and no line here pretends otherwise.

---

## 1 · The discipline, and one place it bit

Nothing was optimised. Nothing was *found* to optimise, which is a result and not an excuse — and
the way to tell the two apart is that every lead the session opened with is closed below with a
number rather than with a paragraph.

The discipline bit once, in the instrument itself. The draw census first reported means: 4.3
gradients a frame, 1.53 screens of overdraw. Those means are the least interesting statistic in a
session about an intermittent hitch, and reporting them was the exact mistake this repo's culture
exists to prevent. The census reports a distribution now, and **the distribution is what carries
the finding** — the mean says the frame is cheap, the p50-to-max spread says it is *uniform*, and
only the second one answers the question that was asked.

---

## 2 · What was built

### `tools/meter.ts` — frame timing on the device

The dispatch carried the seed, the input log and the author's note, and not one number about time.
It carries timing now, optionally: the four dispatches already in `diagnostics/` were flown before
there was anything to count with, and a reader that demanded timing would refuse the evidence this
project already has.

Three decisions in it are worth knowing before changing it.

**It is handed the clock; it never reads one.** The same rule `ticksDue` is written under, and the
only reason its arithmetic can be tested at all: `test/meter.test.ts` fabricates a phone, down to
its clamp, and checks what the meter *should* say as arithmetic rather than against whatever the
machine running the test happened to do.

**It sends a histogram, not four percentiles.** *The phone's clock is 1ms.* Every number in the six
timing reports already in `diagnostics/` is a whole millisecond — WebKit on iOS clamps
`performance.now()` for privacy. So a sample **is** an integer, a 1ms bucket loses nothing that was
ever there, and 65 counters carry the entire distribution in about the space four percentiles would
take. Three things follow: the terminal computes the percentiles, which is
`vite-plugin-diag.ts`'s own rule that *the report carries samples, not conclusions*; the **shape**
survives, and a run at a steady 16ms with eleven frames at 33ms is bimodal in a way percentiles
cannot show; and a mean is still exact, because the untruncated sum rides along beside the counts.

**Frames are grouped by how many ticks each ran, and that is what makes a 1ms clock usable.**
`ticksDue` hands a frame 0, 1, 2 or 3 ticks depending on how the display's rate and the tick rate
land, so a normal run fills at least two groups by itself. The mean cost across the groups is a
straight line whose **slope is what one tick costs on that phone** and whose **intercept is what
everything else in a frame costs** — the draw, the interpolation, the browser. Fitted in
`frameCost` on the reading side.

That last one is not a trick, and its limit is written down. It works by **dither**: a clamped
clock reports `⌊start+cost⌋ − ⌊start⌋`, which is the floor or the ceiling of the cost depending on
where inside its millisecond the frame began, so over thousands of frames the proportion that round
up *is* the fraction. Precision comes from the **noise**, not from the arithmetic. A display
ticking at exactly 1000/60 ms with exactly constant work would put every start on one of three
phases and the estimate comes back **13% low** — measured, in a test that fabricates that phone
deliberately so the failure has a name. Real hardware is not that still. Against a realistically
jittered one, a **0.6ms** tick and a **1.4ms** frame come back from a whole-millisecond clock
inside a tenth of a millisecond each.

The block is **1.2 KB on a real run and 2.0 KB at its arithmetic widest**, both measured, and it is
the same size however long the run was — which is the whole reason the distribution is bucketed
rather than sent as samples. `MAX_DISPATCH_BYTES` does not move.

The validator was **extended, never loosened**, which is `vite-plugin-diag.ts`'s standing rule for
an endpoint bound to every interface on the LAN. Two of the new checks are invariants rather than
range tests — every distribution in a block must count the same frames, and the tick groups must add
up to that same number. A meter cannot produce a block that fails either, so a block that does was
not produced by a meter. Nine tests in `test/dispatch.test.ts`.

### `pnpm profile` — the tick side, headlessly

The tick side of this game is **pure**, which is not a convenience here but the reason the
measurement is possible at all: `pnpm portable` proves `src/sim/` and `src/state/` reach no clock
and no DOM, so the whole of `stepSim` and `derive` runs in Node at nanosecond resolution over a run
somebody actually flew. Every per-tick lead lives there.

It answers two questions with two different experiments, and the second one is the one worth
copying:

- **Attribution** times each tick's `stepSim` and `derive`, then re-times `compassOf` and
  `sightingsOf` on the inputs the real call had. Those re-timings are warm, so they under-report;
  the residual line says how much of `derive` they failed to explain, which is the honest way to
  carry a measurement with a known bias.
- **Scaling** holds the run *completely still* and grows the field underneath it. The extra bodies
  are parked far above the flown path, outside every reach and every aim range, and the run's
  digest — craft position, velocity and held body, every tick — is **asserted identical** at every
  field size rather than assumed. Anything that moves is per-body cost and nothing else.

The digest deliberately leaves the field's membership out. `snapshot` is the right fingerprint
everywhere else and the wrong one here: it encodes every body, on purpose, because two runs flown
in different fields are two different runs (ADR-0004) — so it would report a change on every padded
row and prove nothing about the only thing being asked.

### The draw census — the renderer, without a device

There is no canvas in Node, so the renderer is **counted rather than timed**, against the recording
context `test/render/bodies.test.ts` already established. A count is the renderer measurement that
travels: milliseconds off a laptop say nothing about a thermally throttled phone, but *"this frame
issues five radial gradients and paints 1.9 screens"* is a fact about the frame, true wherever it is
drawn. A phone's Canvas2D is fill-rate bound long before it is call bound, so the number that
predicts trouble is **overdraw**, and that is arithmetic on the radii the renderer asks for.

### And one fix, which was cheap and was going to be needed anyway

`app/main.ts` had no `visibilitychange` handler. A phone that slept, a tab switched away from and a
screen locked all leave `observed` at the moment the page stopped being drawn, so the first frame
back hands `ticksDue` a duration worth minutes. The clamp bounds what that buys at three ticks
rather than thousands, which is what stops a death spiral — but three ticks is still a visible jump,
in a game whose whole input is a moment, landing the instant the player looks back at it. The gap
is now not measured at all: the clock restarts from the moment the page becomes visible. The
prototype has the same handler and reached it the same way.

**This was watched happening.** Driving the game in a laptop browser whose tab kept dropping to the
background, the tick counter advanced by **exactly 3** per wake, over and over — `MAX_CATCH_UP_TICKS`
in the wild. Worth knowing that the handler does not cover every path to it: a browser that
throttles `requestAnimationFrame` to 1Hz rather than stopping it fires no visibility change and
still buys 3 ticks a frame. That is bounded and left alone, because changing it is a ruling about
how the game behaves and not a performance fix.

---

## 3 · The leads, closed

Each of these was written down before the session started, none was confirmed, and none survives.

| Lead | What it costs | Verdict |
|---|---|---|
| `bodiesOf` maps the **whole field** three times per tick | inside the 19% of `derive` the two re-timings do not explain | Real, and irrelevant at this size. It is the term that grows — see §5. |
| The renderer culls offscreen bodies and `derive` does not | `derive` walks **24**, the renderer draws **3.8** | Real, and **the asymmetry is on the cheap side.** See below. |
| `sightingsOf` walks all bodies again | **6%** of `derive`, p99 0.001ms | Closed. |
| `compassOf` → `windowsOn`, the root search | **75%** of `derive`, and `derive` is 95% of a tick | The hot spot, and it is 0.037ms. |
| `sample(orbit)` allocates 64 points per tick | inside the same 19% residual | Not visible above it. |
| `createRadialGradient` per visible body per frame | **4.3 gradients a frame, mean; 5 at the max** | Not 24. The cull is why. |
| `interpolate` allocates a `PresentationState` per frame | stated in the brief as already ruled out | Confirmed by the census: no per-body allocation. |
| `MAX_CATCH_UP_TICKS` = 3 makes a hitch a **jump** | — | **Still open, and it is the live hypothesis.** §7. |
| No `visibilitychange` handler | — | Fixed. §2. |

### The asymmetry is on the cheap side, and here is the number

`derive` walks every body in the field; the renderer draws only what is inside the camera's band.
Flown, that is **24 walked and 3.8 drawn**. The same run in a field of **1 536** draws the
*identical* frame — every added body is outside the band — while the tick's cost grows 4.3×.

So the two layers scale on different quantities, and this is worth carrying into M3:

- **The renderer's cost follows how densely bodies are packed along the climb**, at
  **0.40 screens of paint per visible body**.
- **`derive`'s cost follows how many bodies exist at all**, at **0.086 µs per body per tick**
  (p99 slope, this laptop).

Whether the asymmetry is *correct* is the design question the brief raised, and the measurement
argues for leaving it exactly as it is. Culling presentation state by the camera would make it
depend on the view, and ADR-0006's promise — a frame is a pure function of `(recipe, tick)` — is
worth more than 0.086 µs a body. **The uncull is on the side that is 67× under budget.** If that
ever stops being true, the fix is a cheaper `bodiesOf`, not a camera in `derive.ts`.

---

## 4 · What a tick costs

| per tick, ms | mean | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| `stepSim` | 0.000 | 0.000 | 0.001 | 0.001 | 0.005 |
| `derive` | 0.007 | 0.003 | 0.038 | 0.040 | 0.049 |
| · `compassOf` | 0.005 | 0.002 | 0.037 | 0.037 | 0.047 |
| · `sightingsOf` | 0.000 | 0.000 | 0.001 | 0.001 | 0.001 |
| **tick total** | **0.007** | **0.004** | **0.039** | **0.040** | **0.049** |

**The simulation is free.** `stepSim` is a p99 of one microsecond; the substepped integrator, the
gravity, the grab test and the orbit are collectively not measurable beside the picture derived
from them. Every remaining sentence about the tick is a sentence about `derive`.

**A tick's cost is bimodal, and the two modes are *holding* and *not holding*.** p50 is 0.004ms and
p95 is 0.039 — a ten-fold step, and it is not noise: the eight worst ticks in the run are **all**
ticks where a body is held, and seven of the eight are within nine ticks of a freeze. That is
`windowsOn` starting to run its root search — 4 rings × (24 coarse samples + up to 14 bisections)
— the moment an orbit exists to search on.

**It is the right shape and the wrong size.** A 10× swing tied to the phase of a swing is exactly
the structure that would explain *"lag during some swings"* if the numbers were three orders of
magnitude larger. They are not. The expensive mode is 0.04ms.

**And it does not drift.** p99 over the first third of the run against the last third: **0.041 →
0.040 ms**. Nothing gets heavier over 46 seconds — not the spent bodies accumulating behind the
craft, not the recorder, not the recurrence.

---

## 5 · What a frame asks for

| per frame | mean | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| bodies drawn | 3.8 | 4 | 5 | 5 | 5 |
| radial gradients | 4.3 | 5 | 5 | 5 | 5 |
| arcs | 27.3 | 27 | 43 | 48 | 48 |
| strokes | 17.4 | 17 | 26 | 30 | 31 |
| **overdraw, screens** | **1.53** | **1.867** | **1.878** | **1.886** | **1.902** |
| · of it through a gradient | 1.46 | 1.783 | 1.783 | 1.785 | 1.797 |

**This is the most important row in the file**, and it is the overdraw one. Across 2 775 frames of
a real run — grabs, freezes, releases, coasting, a death — the paint a frame asks for never leaves
the band **1.867 – 1.902 screens**. Under 2% between the median and the single worst frame.

There is no frame in this run that is expensive. There is no hitch *shaped* like this renderer.

**95% of that paint is gradient**, which is the one thing here that deserves watching: radial
gradients have no fast path on a mobile Canvas2D and cost per pixel filled. But 1.9 screens is a
small number to be spending it on, and M0.5 measured this phone at **p99 3–4ms** for a scene with
40 glows, 140 dust motes and 120 rungs — far heavier than anything this game draws today — against
an 8ms budget it ruled ([ADR-0011](../adr/0011-canvas2d-carries-the-design.md)).

**No drift here either**: overdraw p99, first third against last, **1.878 → 1.887 screens**.

---

## 6 · The budget

This is the number *"before we add too much more"* was asking for, and **M3 inherits it.**

### Per tick — 2.8ms, and it is arithmetic on one measured term

A frame at 60Hz is 16.67ms. M0.5 **measured** the renderer at 8ms p99 on the author's own phone and
ruled it. `ticksDue` will hand one frame up to `MAX_CATCH_UP_TICKS` ticks, and a frame that catches
up still has to draw — so the binding case is three ticks and one draw inside one frame:

> **(16.67 − 8) ÷ 3 = 2.89 → a budget of 2.8ms per tick.**

The 8ms is measured; the arithmetic is ruled; **the resulting 2.8ms is an opening position until the
phone's own meter confirms it**, and confirming it is one line of the next dispatch.

### Where the field stops fitting

The same run, the extra bodies parked out of every reach, the flight asserted unchanged:

| bodies | tick mean | tick p50 | tick p99 | × the 24-body mean |
|---|---|---|---|---|
| 24 | 0.007 | 0.004 | 0.041 | 0.99× |
| 48 | 0.009 | 0.005 | 0.043 | 1.21× |
| 96 | 0.012 | 0.009 | 0.046 | 1.70× |
| 192 | 0.019 | 0.016 | 0.054 | 2.63× |
| 384 | 0.034 | 0.030 | 0.070 | 4.63× |
| 768 | 0.064 | 0.059 | 0.103 | 8.76× |
| 1 536 | 0.126 | 0.122 | 0.170 | **17.20×** |

**Read the mean, not the p99, and this file got that wrong once.** A tick is bimodal — a held tick
runs the root search and a coasting one does not — and the two ends scale differently. `windowsOn`
is fixed at 4 rings however large the field grows, so it dominates p99 at 24 bodies and stops
dominating by 1 536: **p99 grows 4.1× across the sweep while the mean grows 17.2×.** An earlier
draft of this section extrapolated the p99 slope and concluded the field could reach *"roughly
32 000 bodies"*. That was the wrong statistic to extrapolate on, and it is also the wrong one to
convert with — [`frameCost`](../../tools/trail.ts) recovers a **mean** from the phone, so the mean
is the only figure the two machines have in common.

Converting properly: the phone's measured **0.17ms** a tick (§8) against the **2.8ms** budget is
16.5× of headroom, and the sweep reaches 17.2× just past 1 536 bodies.

> **The per-tick work stops fitting at roughly 1 500 bodies.** That is the number M3 inherits.

The term that takes it there is `bodiesOf` — three passes over the whole field per tick — which is
why it is the one lead in §3 marked *"real, and irrelevant at this size"* rather than closed. It is
irrelevant at 24 bodies and at 240. It is the constraint at 1 500.

### Per frame — 0.40 screens per visible body

The renderer draws what is in the camera's band. Today that is 3.8 bodies and 1.53 screens. **A
field twice as dense along the climb draws twice as many bodies and paints about twice as much**,
and that is the multiplication M3 should do before it picks a spacing. At the current spacing the
band holds three to four altitudes.

The number to re-measure when it changes is the overdraw p99, and `pnpm profile` prints it.

---

## 7 · What is not answered, and what one phone run settles

**No phone measurement was taken. This step stops at the author's gate** (ADR-0004, AGENTS.md §1.4).
Everything above is a laptop, and a laptop cannot rule on a thermally throttled browser rendering
into 1170 × 2532 at three device pixels to the point. `diagnostics/` gains no file from this
session, deliberately: a fabricated dispatch in the folder that holds evidence would be worse than
an empty folder.

The instrument is on the phone now. Fly a run, tap FLAG when it lags, SEND. The terminal prints the
distribution, the histogram, the tick-group fit and the worst frames with what the run was doing on
each. **The prediction is stated here before the measurement, so it can be wrong:**

| What the dispatch shows | What it means |
|---|---|
| `cpu` narrow, `interval` **bimodal** — a bar at 16ms and a bar at 33ms, worst frames with a small cpu beside a big interval | **Not us.** The phone dropped frames for reasons outside this game: compositor, collection, thermal, Safari. The overdraw measurement predicts this. |
| `cpu` with a **long tail**, worst frames with a big cpu *and* a big interval | We blew a budget. The worst frames' tick numbers name the phase, and `pnpm replay --at <tick>` flies straight to it. |
| `cpu` and `interval` both flat and unremarkable, and it still felt wrong | **"Lag" is naming a jump, not slowness** — which is the live hypothesis and the reason `MAX_CATCH_UP_TICKS` is in the leads table. A frame that runs 3 ticks moves the craft 50ms in one step. The `ticks run` column names those frames directly. |
| The fitted `a tick costs …` line | Confirms or replaces the 2.8ms budget's second term, on the device, from a normal run. |

**One reading is already on the record and should be checked before anything is built.** The
author's word *"laggy"* has been diagnosed once before, on 2026-08-29, and it was not performance:
the compass came back at full size with no bounce during fast grab-release-grab, and *"it feels a
bit laggy when I'm zipping around"* was describing a missing animation
([M2, flown a fourth time](./m2-the-instrument.md)). That was fixed in `The click is 100ms, and half
of "laggy" was a bug`. If the new report is the same word for a third thing, the dispatch will say
so by showing nothing wrong with the frames — and that is a result, not a dead end.

---

## 8 · The phone answered

`diagnostics/2026-08-29T21-15-55-700Z-run-dispatch.json` — iPhone, iOS 18.7, Firefox iOS 154,
393 × 651 css at dpr 3, fixture field v1, seed 1, **3 092 ticks (51.5s), 28 swings, 0 refused**,
still flying at the end. **3 096 frames measured.** Author's report on it: *"no noticeable lag."*

**Nothing was optimised before this run and nothing has been optimised since.** The only two
changes to what the game does at runtime are the `visibilitychange` handler, which fixes a *jump*
on resume and not a speed, and the meter itself, which *adds* two clock reads a frame. A quiet run
is not something this session caused, and reading it as a fix would be the exact mistake §1 is
about.

### What it cost

| ms | p50 | p95 | p99 | max | mean |
|---|---|---|---|---|---|
| `cpu` | 1 | 1 | 2 | 11 | **0.75** |
| `interval` | 17 | 17 | 19 | 28 | 16.64 |

**The budget, measured on the device**, from the tick-group fit over 3 096 frames:

> **A tick costs 0.17 ± 0.05 ms. The rest of a frame costs 0.58 ± 0.05 ms.**

Both intervals are one standard error, computed from the cpu distribution's own spread against the
121 frames that ran anything other than exactly one tick. **That is the weak term in the
measurement and it is the one to strengthen**: 2 975 of 3 096 frames ran exactly one tick, so the
line is pinned by 63 frames at zero ticks and 58 at two. A run flown with the display and the
simulation further out of step would tighten it.

Against 16.67ms, **the whole game is using about 4.5% of a frame.** Against the 2.8ms per-tick
budget of §6, a tick is at **0.17ms — 16× under**, on the phone, with the budget's own second term
now measured rather than derived: M0.5 ruled 8ms for the renderer and today's renderer spends
**0.58** of it.

### The laptop-to-phone factor, which was the missing conversion

Laptop mean tick total 0.007ms; phone 0.17ms. **The phone is roughly 25× this laptop** on the tick
side — call it 17× to 31× on the error bars. §6 extrapolated *"a phone 20× slower still leaves room
for ~1 500 bodies"* before the phone had been measured. At the measured factor the answer is
**about 1 500 bodies**, so the extrapolation holds and `pnpm profile`'s slopes can be trusted to
carry across with that factor written beside them.

### Which prediction came back — and it was the first one

§7 wrote three outcomes down in advance. **The first one is what arrived**, and more sharply than
it was written.

**The cpu histogram is narrow.** 1 121 frames at 0ms, 1 942 at 1ms, 27 at 2ms, and a total of six
frames above that in the whole run. **The interval histogram is not**: 29 frames at 25–28ms, and —
the part that settles it — **30 frames at 6–8ms**. A late frame and an early one, in pairs, with
the mean preserved at **60.10 Hz**. That is one *presented frame deferred and paid back on the
next*, which is a compositor decision. It is not slow code, and no amount of making `derive`
cheaper would move it.

**And the third prediction is refuted too.** *Was "lag" naming a jump?* Not in this run: of 3 096
frames, **none ran three ticks** and only 58 ran two. The catch-up clamp never fired once.

### The stutter has an address, and it is the grab

This is the finding worth keeping, and it was not on anybody's list.

**All twelve of the worst frames land on the exact tick of a press. Not near one — on it, a gap of
zero, twelve times out of twelve.** Presses cover 2.7% of the run, so the chance of that at random
is **1.6 × 10⁻¹⁹**. There were 28 swings and 29 long frames.

> **Every grab in the run costs one deferred frame, and our own work on that frame is 0–1ms.**

Which is *"lag during some swings"* in the exact shape the original report described — during a
swing, not all of them, at the moment you commit. Whether ~16ms of deferred present is what the
author felt is the author's to say; it is at the edge of perceptible and this run was reported as
clean.

**Three things are already known about it, and one theory is already dead.**

1. It is **not our main-thread work.** The cpu on those frames is 0–1ms, and our `pointerdown`
   handler adds one entry to a `Set`.
2. It is **the touch beginning, not touch handling in general.** The nearest *release* to any of
   those twelve frames is 11 to 128 ticks away — releases do not stutter at all, or there would be
   28 more long frames and there are 29 in total.
3. **So it is not the non-passive listener**, which was the obvious first suspect.
   [`app/input.ts`](../../app/input.ts) binds `touchstart` *and* `touchend` with
   `{ passive: false }` and calls `preventDefault` in both, for iOS gesture suppression it
   documents at length. If that were the cost, the release would pay it too. It does not.

What is left is something WebKit does only at the *start* of a touch — hit-testing, gesture
recogniser arbitration, the callout and selection machinery. **No change is proposed here**, on
purpose: the next move is a one-line experiment on the phone, not a commit against `input.ts`,
whose current shape is a written ruling with reasons (AGENTS.md §5.3).

### What is still open

**This run does not reproduce the complaint** — the author flew it and reported no lag, and the
numbers agree with them. So it is a *negative* result: it rules three things out and names a
fourth, and it cannot name a cause for a lag that did not happen. What would settle it is a
dispatch flown on a session where the lag **is** felt, with FLAG tapped when it happens. The
flagged ticks and the worst frames would then either coincide — in which case the answer is above —
or they would not, and the run would be carrying something none of this has seen.

---

## 9 · The second run, where the lag was felt

`diagnostics/2026-08-29T21-21-51-614Z-run-dispatch.json` — same phone, six minutes after §8's run.
**482 ticks (8.0s), 510 frames, 4 swings, ended `OUT_OF_BOUNDS`.** The author flagged **tick 462**
and wrote: *"towards the end (last or second to last planet I touched, i think), i definitely felt
some lag when orbiting or so."*

**The instrument found it.** Three of the twelve worst frames are at **456, 461 and 462** — the
flagged tick and the six ticks before it. Two more are at **306 and 309**, and the trail calls both
*orbiting #3, plateau* — **#3 is the second-to-last body touched**, which is where the author said
to look.

### It is not our work, and this run proves it a second way

`cpu` is p50 1ms, p99 2ms, **max 4ms** — quieter than the run that felt fine. And this run supplies
a control the first one could not:

**Ticks 442 to 461 draw the identical frame.** Twenty consecutive ticks, each asking the canvas for
3 gradients, 24 arcs, 15 strokes, 5 pieces of text and **1.208 screens** of paint — the same
numbers, tick after tick, because the craft is coasting and nothing on screen is changing. **Two of
those twenty frames were long. Eighteen were not.** Identical work, different frame times. Nothing
about what the renderer asked for can explain the difference, because there was no difference in
what it asked for.

### And it is not fill rate either, which main-thread timing could not have told us

*"cpu low, interval long"* has a second reading the M0.5 report already warned about: *"main-thread
time does not see the GPU."* A fill-rate-bound frame is cheap on the main thread and still misses
its vsync. So overdraw was checked against the worst frames directly, in both runs:

| | run mean overdraw | at the 12 worst frames |
|---|---|---|
| §8's run, no lag felt | 0.984 | **0.823** |
| this run, lag felt | 0.966 | 1.152 |

In the first run the worst frames paint **less** than the run's average. If the GPU were the binding
constraint that number would sit above the mean, not below it. In this run it is above, but the
eight non-grab frames scatter from the 41st percentile to the 100th, which is not a fill-rate
signature either. **Overdraw does not predict a dropped frame.**

### What does differ between the two runs is the rate

| | frames | frames ≥ 20ms | rate |
|---|---|---|---|
| §8's run, *"no noticeable lag"* | 3 096 | 29 | 0.94% |
| this run, *"definitely felt some lag"* | 510 | 9 | **1.76%** |

**Twice the drop rate, in the run that felt wrong** — and where §8's long frames were *all* grabs
(12 of 12), only 4 of this run's 12 are. There is a second population of dropped frames here that
the quiet run did not have, running at about one every 1.6 seconds, and nothing this game does
distinguishes those frames from their neighbours. Six minutes of continuous play on a phone is the
obvious confound and it is not something the dispatch can see.

### One thing that *is* ours, and it was hiding in plain sight

**The phone's clock is quantised to 1ms, and that quantised number is what paces the simulation.**
`app/main.ts` measures `now - observed` from the `requestAnimationFrame` timestamp, which WebKit
clamps like every other clock, and hands the result to `ticksDue`. So the simulation is never told
16.667ms. It is told **16 or 17**, and the leftover accumulates.

The result, over this run's 484 live frames: **16 frames ran no tick at all and 14 ran two.** They
nearly balance, which is what jitter around a matched rate looks like — but a frame that runs two
ticks advances the world **33ms while displaying one frame**. That is a *jump* rather than a
slowdown, which is precisely the distinction §7 was told to watch for. Both of the two-tick frames
in the worst list are at ticks 306 and 309, orbiting the body the author named, at the plateau,
where the craft is moving fastest.

**This is raised, not fixed.** Any change to it is a ruling about how the game paces itself — it
touches `ticksDue`, ADR-0006's *the tick is the only clock*, and determinism's relationship to wall
time. The evidence is here so the question is worth a decision rather than a patch:

- Is 1.5 to 3 two-tick frames a second, on a matched 60Hz display, an acceptable amount of jump?
- Would smoothing the measured elapsed time before it reaches `ticksDue` — a shell-side change that
  the simulation never sees — remove it without costing anything? The clock stays pure either way.
- Or is the honest answer that a 1ms clock cannot pace a 16.667ms tick, and the tick rate should be
  one the clamp can express exactly?

### Two things about the instrument that this run fixed

**A bug.** After a run ends, `stepSim` does nothing but the frame loop still asked `ticksDue` for
ticks and told the meter it had run them. This run ended at tick 482 and kept drawing: **26 of its
510 frames were post-death frames counted as live ticks**, which diluted the tick-cost fit to
0.05ms and stamped every one of them with the tick the run stopped on. §8's run never ended, so its
0.17ms is unaffected and remains the measurement. The meter is now given the ticks that actually
advanced the run.

**A gap.** The report was about a *stretch* — *"towards the end"* — and a histogram is the whole run
at once. Answering it meant replaying the recipe beside the dispatch, which worked and is not the
point: the evidence should carry its own answer. The block now carries a **timeline**: at most
sixteen segments, each with its frames, its mean cost, its worst gap and its count of **jumps**.
Segments *grow* rather than multiply — when a run outgrows the scale, neighbours are added together
and the span doubles — so an hour and a minute cost the same bytes, and every segment stays a true
sum rather than an average of averages.

### Where this leaves it

**The game is not slow, in either run, by any measurement taken.** What the author felt is real and
is in the data, and it is a **dropped frame** — sometimes at a grab, sometimes not — occasionally
compounded by the clock handing the next frame two ticks. The next dispatch will carry the timeline,
so *"towards the end"* becomes a row rather than an investigation.

---

## 10 · The third run, and the stutter has a mechanism

`diagnostics/2026-08-29T21-44-56-848Z-run-dispatch.json` — **1 809 ticks (30.1s), 1 811 frames, 16
swings**, still flying at the end. The first run flown with the timeline. Author: *"towards the end
when I was orbiting the last planet I thought I noticed some visual stuttering."*

**The timeline answered it in one row.** Swing 16 grabs body #16 at tick 1482 and holds it until
1791 — a 309-tick orbit, five seconds, the longest in the run.

| to tick | frames | mean cpu | mean gap | worst gap | jumps |
|---|---|---|---|---|---|
| … | | | | | |
| 1 534 | 128 | 0.82ms | 16.64ms | 25ms | 0 |
| **1 661** | 128 | 0.84ms | 16.64ms | **18ms** | **7** |
| 1 789 | 128 | 0.79ms | 16.64ms | 18ms | 2 |

**Nine jumps inside that orbit, and not one dropped frame to go with them.** The worst gap in those
two segments is 18ms — barely over the 17ms baseline — while the rest of the run has segments
reaching 26 and 27ms. So this stretch is the cleanest evidence in the file: *the stutter happened
where nothing was slow and nothing was dropped.* The author's word for it changed too, from *lag*
to **visual stuttering**, which is the right word for a jump.

### The mechanism, reproduced

`ticksDue` is pure, so it can be driven with a fabricated clock and no game at all. Feeding it a
60Hz display read through a **1ms clock** — which is what the phone hands it — reproduces the
phone's numbers:

| display | 0-tick frames | 2-tick frames | jumps per 128 frames | variance ÷ mean |
|---|---|---|---|---|
| 60.00 Hz | 341 | 340 | `28 7 31 42 27 0 0 0 0 34 43 43 42 43` | 13.2 |
| **59.94 Hz** | **25** | **26** | `13 0 0 0 0 0 0 8 5 0 0 0 0 0` | 8.1 |
| 60.10 Hz | 23 | 19 | `0 0 0 0 8 0 0 0 0 7 0 0 0 4` | 5.4 |

**The phone measured 37 zero-tick and 34 two-tick frames in 1 811.** The 59.94Hz row is 25 and 26
in 1 792. Same order, same near-equal split — and, the part that matters, **the same burstiness.**
A variance-to-mean ratio of 8 where random scatter would give 1: the jumps arrive in clumps
separated by long quiet stretches, which is exactly what the timeline shows and exactly what
"noticed some stuttering for a moment" describes.

**Why it bursts.** `clock.unspentSeconds` accumulates `measured − k × 16.667ms`. A 1ms clock can
only ever say 16 or 17, never 16.667, so the leftover random-walks. While it happens to sit near the
two-tick threshold, several consecutive frames cross it; then it wanders off and the run is smooth
again. A random walk near a boundary is bursty by nature, and this one is metering the game's
motion.

**And it is ours.** Not the compositor, not the GPU, not WebKit's touch path — this is the game's
own clock arithmetic meeting a clock that cannot express its tick.

### A fix, tested, and it is five lines

If a measured duration is within the clock's **own resolution** of a whole number of ticks, then it
*is* that whole number and the difference was measurement error rather than time:

```ts
const ticks = Math.round(elapsedSeconds / SECONDS_PER_TICK);
const exact = ticks * SECONDS_PER_TICK;
return Math.abs(elapsedSeconds - exact) <= RESOLUTION ? exact : elapsedSeconds;
```

Driven through the real `ticksDue`:

| display | jumps as-is | jumps snapped | idle frames as-is | snapped |
|---|---|---|---|---|
| 60.00 Hz | 340 | **0** | 341 | **0** |
| 59.94 Hz | 26 | **0** | 25 | **0** |
| 60.10 Hz | 19 | **0** | 23 | **0** |
| 59.80 Hz | 25 | **0** | 20 | **0** |
| 120 Hz | 0 | 0 | 897 | 897 |
| 30 Hz | 1 111 | 1 792 | 0 | 0 |

**Every spurious jump goes, and every real one stays.** With 17 genuinely doubled frames injected
into a 59.94Hz run, the unsnapped clock reports **43** two-tick frames and the snapped one reports
exactly **17** — the real drops, and nothing else. 120Hz is untouched. 30Hz becomes *uniformly* two
ticks a frame, which is what 30Hz should be and is tidier than the 1 111 it does today.

It only bites when a frame period lands within 1ms of a tick multiple, so 90Hz, 144Hz and 50Hz
displays never see it.

### Built, 2026-08-29, on the author's instruction

**Landed as `ticksDue(clock, elapsedSeconds, grainSeconds)`** — the caller now hands in its error
bar as well as its measurement, and `app/main.ts` **probes** the grain rather than declaring it, by
reading `performance.now()` until it changes and keeping the smallest step over five tries. A
machine with a fine clock therefore gets its real jitter respected instead of a phone's fact applied
to it: at a few hundred nanoseconds of grain the rounding never fires and the arithmetic is the one
this game always had.

**The guard is the part that took the measuring**, and the first two designs were wrong:

- *Accumulate absolute elapsed instead of per-frame deltas.* Sound-looking and **useless** — measured
  side by side it gives 518 double-steps against 530 at 60Hz, because both compare a 1ms clock
  against a 16.667ms grid. Discarded on the numbers.
- *Round every reading toward the nearest whole tick.* Takes 60Hz to zero jumps and then quietly
  drags the simulation along with any display near it: **2.2 seconds of drift per minute at 63Hz**,
  1.0 at 61Hz, 4.0 at 24Hz.
- *Round, while the rounding has borrowed less than one tick.* What shipped. Same zero at
  60/60.1/59.94/59.8Hz, and the drift at 61/63/65Hz collapses to **4 – 7ms per minute**. The bound
  never engages where the reading is honest and engages within a second where it is not.

| display | double-steps before | after | drift per minute |
|---|---|---|---|
| 120 Hz | 0 | 0 | 0ms |
| 90 Hz | 0 | 0 | −15ms |
| 65 Hz | 0 | 0 | 6ms |
| 63 Hz | 0 | 0 | 7ms |
| 61 Hz | 76 | **0** | 4ms |
| 60.1 Hz | 70 | **0** | 0ms |
| 60.0 Hz | 958 | **0** | 0ms |
| 59.94 Hz | 82 | **5** | −10ms |
| 30 Hz | 4 084 | 6 000 | 0ms |

Thirty hertz becoming *uniformly* two ticks a frame is the correct reading of a 30Hz display and is
tidier than the mixture it produced before. Seven new cases in `test/sim/clock.test.ts`, including
the bug itself as a test so it cannot come back unnoticed.

**Three things it is careful not to be**, and they were the reasons it waited for a ruling:

- **It changes how the game paces itself**, and pacing is feel — so it was the author's call to
  make and they made it, and it was flown on its own before M2.4 rather than underneath it.
- **Where it lives** settled itself. The grain is a fact about the *measuring device*, so the shell
  finds it out and hands it over — which is the rule `ticksDue` was already written under, extended
  by one argument. The simulation still hears only numbers, and the logic stayed pure and testable.
- **It is not a performance change and must not be filed as one.** Nothing got faster. What went
  away is a visible artefact — the only thing in four runs that was ever ours.

**Determinism is not at risk**, and that is worth stating plainly: `replayRun` never calls
`ticksDue`, so a recipe replays identically either way and `SIM_VERSION` does not move.
`test/sim/clock.test.ts` gained seven cases and lost none.

### And the phone confirmed it

`diagnostics/2026-08-29T22-52-18-693Z-run-dispatch.json` — **1 101 frames**, the first flight with
the grain fix in it. Author: *"the look and feel is mostly right."*

| | frames | ran two ticks | per 128-frame segment |
|---|---|---|---|
| §10's run, before | 1 811 | 34 (1.9%) | `1 1 0 2 0 0 0 9 2 2 1 0 7 2 1` |
| **after** | 1 101 | **11 (1.0%)** | `3 1 2 2 2 0 0 1 0` |

The rate halved, and — the part that was actually the complaint — **the bursts are gone**. A
maximum of three per segment against clumps of nine and seven, which is the random walk no longer
lingering against a threshold it should never have been near.

**And the eleven that remain are real.** Twelve frames in that run had an interval of 25ms or more;
eleven frames ran two ticks. Those two numbers matching is the guard doing exactly what it was
measured to do — every genuinely dropped frame still gets caught up, and only the invented ones
went away. It is the same result as the fabricated test that reported 17 of 17 real drops, arriving
from the device.

**What did not change is the grab.** Eleven of the twelve worst frames are still `diving at #N, 0
ticks in`, at a cpu of 0 – 1ms — the fifth run in a row to say that the browser's touch-begin costs
one deferred frame per press and that it is not this game's work. It stays open, it stays not ours,
and **M2.4 should not chase it**.

### What the milestone's own drawing cost, since it landed in the same window

M2.3's flown notes added a tapered tide (eleven strokes where there was one) and a body that fades
out instead of switching off. The before and after, in the same units:

| per frame | before | after |
|---|---|---|
| arcs | 27.3 | 37.0 |
| strokes | 17.4 | 26.9 |
| **overdraw, screens** | **1.532** | **1.574** |

Nine more strokes for **2.7% more paint**, because the tide's segments overlap rather than add
area. On the phone the frame term is **0.59ms against 0.58ms**, flat inside its ±0.06 error bar.
The fitted *tick* reads 0.25ms against 0.17ms, which is **not** a result to lean on: only 96 frames
in that run ran anything other than one tick, so the slope carries ±0.061ms and the two overlap.
The headless profiler agrees it is small — a whole tick at 0.008ms against 0.007ms — and either way
it is sixty times under budget.

---

### And a sixth run said the same thing, with the correlation stated

`diagnostics/2026-08-29T23-53-31-915Z-run-dispatch.json` — **697 frames**, flown against *"I kept
feeling some kind of lag or freeze on release... maybe it's just the planet effect, the pulse?"*

**It is the press, and this run says so without interpretation.** All eight presses in the run land
on one of the twelve worst frames, at **+0 ticks**. Not one of the eight releases does; the two
release-tagged frames in that list are 69 and 74 ticks after one. Every press frame costs 19 – 27ms
at a **cpu of 0 – 1ms**, so nothing in the game is doing the work.

It reads as belonging to the release because the next press follows one **13 – 35 ticks** later —
0.2 to 0.6s — and the release is the moment the eye is waiting on. That is worth writing down: the
artefact has been reported three different ways now (*lag when orbiting*, *visual stuttering*, *lag
or freeze on release*) and this is the first time the reported moment and the measured moment are
different events.

**A mechanism, which §10 did not have.** [`app/input.ts`](../../app/input.ts) registers
`touchstart` and `touchend` with **`passive: false`**, because that is the only way to call
`preventDefault` — and it is what killed the iOS selection loupe and the *Search with Firefox /
Find in Page* callout the author reported on 2026-08-29. A non-passive touch listener is precisely
what makes WebKit wait for the handler before it composites. **So the one-frame press hitch and the
suppressed callout may be the same decision seen from two sides.**

That is a hypothesis and not a finding: it cannot be settled from a dispatch, because both terms
are the browser's. What would settle it is an A/B on the phone — passive listeners for one run,
non-passive for the next, counting worst frames at presses and watching for the callout. It stays
**not ours** and it stays open, and it now has something to test rather than only something to
rule out.

### What M2.4's drawing cost

The release's choreography — the flown arc's stretches, the farewell ring, the taken window and the
award word — measured on the same machine in the same session, before and after:

| per frame | before | after |
|---|---|---|
| arcs | 36.98 | 37.02 |
| strokes | 26.90 | 27.53 |
| **overdraw, screens** | **1.574** | **1.574** |

**+0.6 strokes and no measurable paint.** Two reasons, and both were decisions rather than luck:
the compass went from four rings to three in the same step, which gave back most of what the arc
took; and **the farewell ring is stroked rather than filled**, which is the one thing §6 named as
able to move overdraw — an expanding filled ring is the only shape in the milestone whose area
grows as the square of what is being animated.

The tick side did not move either: **0.150ms before and 0.147 – 0.150 after** at 1 536 bodies, on
three runs. The sweep's × column shifts from 19.7 to 21.3 only because the 24-body baseline it
divides by came down with the ring count — which is a reminder that **the ratio is a ratio**, and
§6's *"roughly 1 500 bodies"* should be re-derived from a same-session pair whenever M3 wants it.

---

## 11 · Queued from this session

**Particle effects, as a visual language** (author, 2026-08-29), in the register of
`https://bwilliford.github.io/particleCharts/`. Recorded rather than built, and with one thing
flagged that has to be settled first: spec [00 · §5](../spec/00-tokens.md)'s motion law rules that
**nothing ever radiates from a point** and that all streaks run parallel to velocity. Most particle
work radiates. That is not a refusal — it is the argument the idea has to win, in writing, before
any pixels, and it is the same shape of argument ADR-0012 won against the hitstop. The natural home
is M2.4's vocabulary (the release, the award word, the farewell ring) or M5's, and the natural first
question is whether a *velocity-aligned* particle field says what the boards want without breaking
the law that makes this game's motion read as one thing.
