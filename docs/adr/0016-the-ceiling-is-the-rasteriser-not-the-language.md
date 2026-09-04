# The ceiling is the rasteriser, not the language — the 120 Hz question, answered

[ADR-0011](./0011-canvas2d-carries-the-design.md) closes on an admission: sixty frames a
second was measured, the GPU headroom behind it was not, and *"on a 120 Hz target that
evidence does not transfer, and the question reopens."* It reopened on 2026-09-04, on the
author's desktop — Firefox 154, 2560 × 1297, **117 Hz** — as a report of lag near the last
planet of a capture, and again on grab and release near multiple bodies. This records what
the reopened question measured, and answers the architectural one the author asked next:
whether this is the TS-native approach reaching its limit and wanting a game engine.

**It is not.** The renderer is under pressure and the language is not, and the two are easy
to confuse from inside a dropped frame.

## What the budget is actually spent on

Two dispatches, same machine, same field, seed 1 —
`diagnostics/2026-09-04T16-13-49-001Z` and `…T16-47-40-497Z`.

| | value | share of an 8.47 ms budget |
|---|---|---|
| our JS, per frame (`cpu`) | **0.41 ms** mean, 3 ms max | **~5%** |
| `stepSim` + `derive`, per tick | 0.024 ms mean, 0.317 ms max | <4% |
| everything else in a late frame | the remainder | ~95% |

[`meter.ts`](../../tools/meter.ts) defines the gap between `cpu` and `interval` as *"the part
that was not us — a compositor, a collection, a thermal stall"*. **Every dropped frame in
both runs lives in that gap.** The worst frame of the first run was 25.0 ms and spent 1 ms of
it in our code.

So an engine would replace the 5% and leave the 95% where it is. That is the whole of the
argument, and the rest of this file is the evidence that the 95% is not ours to blame either.

## The phone is not faster; it has twice the budget

Across the ~90 dispatches in `diagnostics/`, **every iOS run is 60.1 Hz and both desktop runs
are 114–117 Hz.** The comparison the author drew — smooth on the iPhone, laggy on the
desktop — is not two speeds of the same thing.

| | desktop 2560×1297 | iPhone 393×651 |
|---|---|---|
| refresh | 117.2 Hz (8.54 ms) | 60.1 Hz (16.64 ms) |
| frames missing ≥1 vsync | 2.40% | 0.63–0.65% |
| worst single frame | 25.0 ms | **26–27 ms** |

The phone's worst frame is *worse in absolute terms*. It reads as smooth because a miss there
is 1.5× a long budget, while a miss on the desktop **doubles** a short one — 8.5 → 17 ms — and
a doubled interval is what an eye calls stutter. Two further asymmetries are worth keeping:
the desktop paints **fewer** pixels than the phone (3.15 Mpx against 7.13, because the
width-fit draws the phone near 1∶1 and shrinks the desktop to 0.665), so paint volume is not
the differentiator; and Firefox on iOS is WebKit rather than Gecko, so these are two
rasterisers and not two sizes of one.

## What the pressure actually is: gradient count

**96% of all filled area in a frame is radial gradient.** Both of the author's reports
reproduce, and they are different mechanisms:

- **"Near multiple bodies."** Painted area tracks bodies in view almost linearly — 1 body
  0.242 screens, 2 → 0.314, 3 → 0.443, **4 → 0.615**.
- **"On grab and release."** This is the *count* of distinct gradients, not the area. Within
  ±8 ticks of a press or release the frame builds **6.88** gradients against **5.73**
  elsewhere, peaking at 15 against a run mean of 6.1; the release at tick 1419, which the
  meter independently named as a dropped frame, built 14. Painted area across those same
  frames is flat and slightly *lower* (0.498 vs 0.506).

[`bloom`](../../src/render/index.ts) builds a fresh `createRadialGradient` per call with the
position baked in, so the count is also an allocation count.

**Caching them was measured and rejected.** Over one run: 8 932 calls, **4 035 distinct** —
a 4 035-entry cache for a 54.8% hit rate. Rounding radii to a whole design unit changes the
distinct count not at all, which locates the diversity in the *colour stops*: strength varies
continuously, so a useful hit rate would mean quantising glow strength and banding the glow.
The cheap-looking fix is not a fix, and it is recorded here so it is not proposed again.

## Drawing less beat drawing faster

The largest measured win of the session was not a rendering optimisation. Capping sideways
bleed to zero — spec [00 §7](../spec/00-tokens.md)'s second guardrail, built the same day for
a composition fault — halved the drop rate as a side effect:

| | before the cap | after |
|---|---|---|
| frames missing ≥1 vsync | 80 = 2.40% | 44 = **1.32%** |
| `cpu` per frame | 0.57 ms | **0.41 ms** (−28%) |
| worst gameplay frame | 25.0 ms | 16.7 ms |

The desktop had been drawing a 2 223-unit-wide swath of world to show an 1 170-unit
composition. **There is more left in what is drawn than in what draws it**, and that is the
opposite of the direction an engine argues for.

## Headroom, since "limits" was the question

[`pnpm run profile`](../../tools/profile.ts)'s scaling sweep grows the field under a frozen
run. The fixture field of 24 bodies fits at 0.97× the tick budget; 768 fits at 8.5×; 1536 goes
over. **Roughly 30× headroom in field size** before the tick budget binds at all.

## What an engine would cost

Everything this file measures was only possible because the simulation is pure TypeScript.
`pnpm portable` proves `src/sim`, `src/state` and `src/input` run under plain Node with no
DOM and no bundler; [ADR-0006](./0006-three-layers-sim-presentation-renderer.md) makes the
tick the only clock and a frame a pure function of `(recipe, tick)`;
[ADR-0004](./0004-determinism-is-the-contract-the-author-is-the-feel-gate.md) makes
determinism the contract. A flown run replays **bit-identical at every tick**, which is what
let a laptop take the author's desktop capture, re-derive all 1 575 frames, re-draw each of
them at two different viewport sizes, and count gradients per tick — offline, with no phone
and no canvas.

That capability, 65 test files and 988 tests, port-equality against the prototype, and the
whole dispatch → replay → profile → census loop over a ~100-run corpus are what an engine
would be traded for. It would be trading the part that works for a fix to the part that costs
5%. It would also not fix the 4-second stall these runs contain, which is at ticks 1568–1575 —
the run's ending, serialising its own dispatch on the main thread — and is engine-agnostic.

**If the renderer does eventually need more, the question is a backend and not an
architecture.** A radial glow is a fragment shader; the per-gradient construction cost
measured above does not exist in WebGL. That swap lives behind `draw()`, keeps all three
layers, and is the proportionate move. ADR-0011 rejected WebGL as a *post pass* on a measured
cost — an 11.8 MB synchronous upload per frame — and nothing here disturbs that ruling; a
shader that draws the glow directly never makes the upload.

## Consequence

The three layers stand and `src/render/` stays Canvas2D. The reopened 120 Hz question from
ADR-0011 is answered: at 117 Hz the game holds 118 fps with 1.32% of frames missing a vsync,
our code spends 5% of the budget, and the misses are the rasteriser's.

**Reconsider when, and only when, one of these is true** — they are the tripwires this
decision is worth revisiting on, and none is true today:

- `cpu` approaches the frame budget rather than sitting at ~5% of it.
- The field wants to be ~30× larger than the 24 bodies it is.
- The picture wants many more simultaneously painted objects than the ~5 bodies plus craft
  it draws now.

> **Open — the frame rate is not capped, and probably should be.** 1 771 of 3 342 desktop
> frames advanced zero simulation ticks. They are not duplicates — [`app/main.ts`](../../app/main.ts)
> interpolates between ticks — but they are optional. Capping to 60 fps halves the paint and
> doubles the budget to the phone's own 16.6 ms, at the cost of motion smoothness on a
> high-refresh display. That is a feel question, so it is
> [ADR-0004](./0004-determinism-is-the-contract-the-author-is-the-feel-gate.md)'s gate and not
> a number anyone can rule from a profile. It wants a dev-panel toggle and the author's eye.
