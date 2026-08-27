# The simulation owns its transcendentals

Spec [01 · §12a](../spec/01-swing.md) closed one half of this and left the other open. `Math.hypot`
is **not** required to be correctly rounded, engines disagree about it, and the prototype was bitten
badly enough that `pnpm portable` bans it outright in `src/sim/` and `src/state/`. The written-out
`sqrt(x*x + y*y)` is identical everywhere, because IEEE-754 fixes `*`, `+` and `sqrt`.

`sin`, `cos` and `atan2` are the same class of hazard and were left as *"an open engineering problem
for M1.2"*, with three options named: own the implementation, compose rotations rather than
re-evaluate at an accumulated angle, or accept single-engine determinism and say so in the recipe.

**The simulation owns the implementation.** `src/sim/trig.ts` computes `sin`, `cos` and `angleOf`
using only `+`, `-`, `*`, `/` and `Math.sqrt` — every one of which IEEE-754 requires to be correctly
rounded — plus `Math.round` and `Math.abs`, which ECMA-262 specifies exactly. There is no latitude
left for an engine to take.

## The measurement

Two engines were available on the machine this was decided on: **V8** under node 26, and
**JavaScriptCore** through `osascript -l JavaScript`. JavaScriptCore matters more than a third-party
engine would: it is what Safari on the author's phone runs, and ADR-0004 makes the phone the place
the feel gate happens, so a recipe recorded there is replayed here.

Both engines evaluated the same 20 000 pseudo-random arguments per function — angles over
0 – 200 rad, the range an orbit clock's accumulated phase actually reaches, and coordinate pairs
over ±10 000, the size of the field. Results compared as raw float64 bits.

| Function | Arguments where the two engines return different bits |
|---|---|
| `Math.sin` | **4.3%** |
| `Math.cos` | **4.6%** |
| `Math.atan2` | **17.9%** |
| `Math.hypot` | **36.4%** |
| `sqrt(x*x + y*y)` | **0%** |

The `hypot` row reproduces spec 01 §12a's independently-measured 36% almost exactly, which is the
evidence that the method is sound before it is pointed at the unknown rows.

Every disagreement is about one unit in the last place. That is why this is invisible until it is
fatal: an orbit clock calls these every tick, the difference compounds, and spec 01 §12a records
what that costs — a full session diverging 5.63 units on `hypot` alone, and past roughly ten seconds
whole decisions flipping, a grab becoming a fly-past.

**Then the same probe was pointed at `src/sim/trig.ts`.** 80 000 values across `sin`, `cos`,
`angleOf` and the written-out magnitude, on both engines: **identical, to the bit, everywhere.**

## What it costs, and what it does not

**Accuracy: nothing.** Measured against a 256-bit fixed-point reference over 50 000 arguments each,
worst-case error is **0.73 ulp** for `sin`, **0.72 ulp** for `cos` and **1.27 ulp** for `angleOf`.
The same reference scores V8's own `Math.sin` at 0.81 ulp, `Math.cos` at 0.81 and `Math.atan2` at
1.27. The owned implementation is not a compromise on accuracy; it is level with the engine's, and
marginally better on `sin`.

**Speed: real but far below anything that matters.** `sin` runs at 42M calls/s against `Math.sin`'s
120M — **2.8× slower**; `cos` is 1.2× and `angleOf` 1.1×. The orbit clock is a handful of calls per
tick, so a 90-second run costs on the order of ten thousand calls, well under a millisecond in
total. ADR-0011 measured the frame budget at p99 3ms of 8ms with the whole renderer running; this
does not appear in it.

**Two `Math` functions are now banned in `src/sim/` and `src/state/` alongside `Math.hypot`**:
every implementation-approximated one (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`,
`log`, `log2`, `log10`, `pow`, `cbrt`, `expm1`, `log1p`, and the hyperbolics), **and the `**`
operator**, which ECMA-262 gives exactly the same latitude as `Math.pow` and which is easy to reach
for without noticing. `pnpm portable` enforces both, and points at this file.

## Why not the other two options

**Composing rotations does not remove the dependency, it relocates it.** Advancing an orbit by
multiplying in a fixed rotor per tick still needs a `sin` and a `cos` to build the rotor, and spec
[01 · §6](../spec/01-swing.md) has the angular rate *changing every tick* through the 1.2s settle —
so the rotor is rebuilt constantly rather than once. It also drifts in magnitude and needs
renormalising, and it does nothing at all for `atan2`, which the compass (M2) reads every frame. It
is a smaller version of the problem with extra machinery around it.

**Accepting single-engine determinism was the option to beat and it loses on one sentence.** It
would mean a recipe carries the engine it was flown on and only replays there, which breaks the
phone-to-laptop path the feel gate runs on, and makes cross-engine verification — the thing ADR-0003
cuts the seam for — impossible rather than merely unbuilt. The cost of not accepting it turned out
to be 2.8× on one function nobody calls often.

## Consequence

**`Math.sqrt` is load-bearing and is therefore checked rather than assumed.** ECMA-262's text calls
it implementation-approximated; IEEE-754 requires it to be correctly rounded and every engine uses
the hardware instruction. The 0% row above is that assumption measured rather than trusted, and it
is the foundation the rest of this file stands on.

**The probe is not repeatable from the repo** — it was scratch by construction and is deleted with
this decision landing, which is [ADR-0001](./0001-separate-repository-from-the-prototype.md)'s
lesson applied to our own work. What survives is this file and
`test/sim/trig.test.ts`, which holds the accuracy and the identities on every run. Re-running the
cross-engine half needs two engines and is a manual measurement, described here well enough to
rebuild: same arguments, both engines, compare the bits.

**Spec 01 §12a's second half is now closed**, and the spec README's open question with it.
